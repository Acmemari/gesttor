/**
 * Serviço de transcrição de áudio via OpenAI Whisper.
 *
 * Suporta arquivos grandes via chunking automático com ffmpeg:
 *  - Arquivo ≤ 25 MB → enviado direto para a API
 *  - Arquivo > 25 MB → dividido em segmentos temporais, cada um transcrito
 *    separadamente e os resultados concatenados
 */
import { spawn } from 'child_process';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import OpenAI, { toFile } from 'openai';
import ffmpegBin from 'ffmpeg-static';
import { getProviderKey } from './env.js';

// Formatos aceitos pela API de transcrição da OpenAI
const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
]);

// Limite da API da OpenAI por chunk
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB

// Limite aceito pelo servidor antes de dividir (multer e validação inicial)
export const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200 MB

// Tamanho alvo de cada chunk — margem abaixo do limite da OpenAI
const MAX_CHUNK_BYTES = 23 * 1024 * 1024; // 23 MB

export const TRANSCRIPTION_MODEL = 'whisper-1';

// ─── Validação ────────────────────────────────────────────────────────────────

/**
 * Valida tipo MIME e tamanho do arquivo antes de processar.
 * Retorna mensagem de erro ou null se válido.
 */
export function validateAudioFile(mimetype: string, size: number): string | null {
  if (!ALLOWED_MIME_TYPES.has(mimetype)) {
    return `Formato não suportado: "${mimetype}". Use mp3, m4a, wav ou webm.`;
  }
  if (size > MAX_UPLOAD_SIZE) {
    return `Arquivo muito grande (${(size / 1024 / 1024).toFixed(0)} MB). Limite máximo: ${MAX_UPLOAD_SIZE / 1024 / 1024} MB.`;
  }
  return null;
}

// ─── Helpers ffmpeg ───────────────────────────────────────────────────────────

function runFfmpeg(args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegBin) {
      reject(new Error('ffmpeg-static não encontrado. Reinstale as dependências.'));
      return;
    }
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    // ffmpeg retorna código ≠ 0 para comandos de leitura — capturamos sempre
    proc.on('close', () => resolve({ stderr }));
  });
}

async function getAudioDurationSeconds(filePath: string): Promise<number> {
  // ffmpeg -i <arquivo> imprime metadados no stderr (incluindo Duration)
  // independentemente do código de saída
  const { stderr } = await runFfmpeg(['-i', filePath, '-f', 'null', '-']);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) {
    throw new Error('Não foi possível ler a duração do áudio. Verifique se o arquivo é válido.');
  }
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function splitAudioSegment(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number,
): Promise<void> {
  // -ss antes de -i usa seek rápido do decoder (mais preciso para arquivos grandes)
  await runFfmpeg([
    '-ss', String(startSec),
    '-i', inputPath,
    '-t', String(durationSec),
    '-c', 'copy', // copia bitstream sem re-encodar (mais rápido, sem perda)
    '-y',         // sobrescreve se existir
    outputPath,
  ]);
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/mp4': '.mp4',
    'audio/x-m4a': '.m4a',
    'audio/m4a': '.m4a',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
  };
  return map[mime] ?? '.audio';
}

// ─── Transcrição ──────────────────────────────────────────────────────────────

/**
 * Transcreve um buffer de áudio usando o modelo Whisper da OpenAI.
 * Uso interno — para chamada pública prefira `transcribeAudioWithChunking`.
 */
async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  const apiKey = getProviderKey('openai');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada no servidor.');

  const client = new OpenAI({ apiKey });
  const audioFile = await toFile(buffer, filename, { type: mimetype });

  const transcription = await client.audio.transcriptions.create({
    file: audioFile,
    model: TRANSCRIPTION_MODEL,
    language: 'pt',
    response_format: 'text',
  });

  return typeof transcription === 'string'
    ? transcription.trim()
    : ((transcription as { text?: string }).text ?? '').trim();
}

/**
 * Transcreve um buffer de áudio, dividindo automaticamente em chunks se
 * o arquivo ultrapassar o limite de 25 MB da API da OpenAI.
 *
 * Fluxo para arquivos grandes:
 *  1. Salva em diretório temporário
 *  2. Lê duração total via ffmpeg
 *  3. Divide em N segmentos de duração proporcional
 *  4. Transcreve cada segmento sequencialmente
 *  5. Concatena os resultados
 *  6. Remove todos os arquivos temporários
 *
 * Preparado para evolução futura:
 *  - salvar transcrição no banco (reunioes_transcricoes)
 *  - vincular a reunião, projeto, fazenda ou rotina semanal
 *  - gerar resumo, extrair decisões, tarefas e ata via LLM
 */
export async function transcribeAudioWithChunking(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<{ texto: string; chunks: number }> {
  // Arquivo cabe direto — sem chunking
  if (buffer.length <= MAX_AUDIO_SIZE) {
    const texto = await transcribeAudio(buffer, filename, mimetype);
    return { texto, chunks: 1 };
  }

  const ext = path.extname(filename) || extFromMime(mimetype);
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'transcricao-'));

  try {
    const inputPath = path.join(tempDir, `input${ext}`);
    await fsp.writeFile(inputPath, buffer);

    const totalDuration = await getAudioDurationSeconds(inputPath);
    const chunkCount = Math.ceil(buffer.length / MAX_CHUNK_BYTES);
    const chunkDuration = totalDuration / chunkCount;

    console.log(
      `[transcription] arquivo grande: ${(buffer.length / 1024 / 1024).toFixed(1)} MB, ` +
      `${totalDuration.toFixed(0)}s → ${chunkCount} chunks de ~${chunkDuration.toFixed(0)}s`,
    );

    const parts: string[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const startSec = i * chunkDuration;
      const chunkPath = path.join(tempDir, `chunk_${i}${ext}`);

      await splitAudioSegment(inputPath, chunkPath, startSec, chunkDuration);

      const chunkBuffer = await fsp.readFile(chunkPath);
      const text = await transcribeAudio(chunkBuffer, `chunk_${i}${ext}`, mimetype);
      parts.push(text);

      console.log(`[transcription] chunk ${i + 1}/${chunkCount} transcrito`);
    }

    return { texto: parts.join(' '), chunks: chunkCount };
  } finally {
    // Garante limpeza mesmo em caso de erro
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
