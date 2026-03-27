/**
 * POST /api/transcrever-reuniao
 *
 * Recebe um arquivo de áudio via multipart/form-data (campo: "audio"),
 * envia para a API de transcrição da OpenAI e retorna o texto transcrito.
 *
 * Autenticação: Bearer token obrigatório.
 *
 * Preparado para evolução futura:
 *  - salvar transcrição no banco
 *  - vincular a reunião, projeto, fazenda ou rotina semanal
 *  - gerar resumo, decisões, tarefas e ata automática
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonSuccess, jsonError, setCorsHeaders } from './_lib/apiResponse.js';
import { transcribeAudioWithChunking, validateAudioFile, MAX_UPLOAD_SIZE, TRANSCRIPTION_MODEL } from './_lib/transcription.js';

// Desabilita o body parser padrão do Vercel para receber multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

// multer com armazenamento em memória — sem arquivo temporário em disco
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
});

// Adapter para usar o middleware Express do multer em handlers Vercel
function runMulter(req: VercelRequest, res: VercelResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('audio')(req as any, res as any, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    jsonError(res, 'Método não permitido.', { status: 405 });
    return;
  }

  // Validar autenticação antes de processar o upload
  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autenticado.', { code: 'AUTH_REQUIRED' });
    return;
  }

  // Processar o upload multipart
  try {
    await runMulter(req, res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar upload.';
    jsonError(res, msg, { code: 'VALIDATION', status: 400 });
    return;
  }

  const file = (req as any).file as UploadedFile | undefined;

  if (!file) {
    jsonError(res, 'Arquivo de áudio não enviado. Use o campo "audio".', {
      code: 'VALIDATION',
      status: 400,
    });
    return;
  }

  const validationError = validateAudioFile(file.mimetype, file.size);
  if (validationError) {
    jsonError(res, validationError, { code: 'VALIDATION', status: 400 });
    return;
  }

  try {
    const { texto, chunks } = await transcribeAudioWithChunking(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    jsonSuccess(res, {
      texto,
      modelo: TRANSCRIPTION_MODEL,
      chunks,
      // Campos reservados para evolução futura — deixar null por enquanto:
      reuniao_id: null,   // vincular a uma reunião salva no banco
      resumo: null,       // resumo gerado por LLM
      decisoes: null,     // lista de decisões extraídas
      tarefas: null,      // tarefas com responsável e prazo
      ata: null,          // ata automática formatada
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao transcrever áudio.';
    console.error('[transcrever-reuniao] Erro OpenAI:', msg);
    jsonError(res, `Falha na transcrição: ${msg}`, { status: 500 });
  }
}
