/**
 * Extrai texto de um documento de transcrição armazenado no B2.
 * Módulo isolado para evitar side-effects no carregamento do módulo principal.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { extractText } from './knowledge/extract.js';
import { getTranscricaoById } from '../../src/DB/repositories/semana-transcricoes.js';

function getB2Client(): S3Client {
  const endpoint = process.env.VITE_B2_ENDPOINT;
  const region = process.env.VITE_B2_REGION;
  const keyId = process.env.VITE_B2_KEY_ID;
  const appKey = process.env.VITE_B2_APP_KEY;
  if (!endpoint || !region || !keyId || !appKey)
    throw new Error('Variáveis B2 não configuradas no servidor');
  return new S3Client({ endpoint, region, credentials: { accessKeyId: keyId, secretAccessKey: appKey }, forcePathStyle: true });
}

async function downloadFromB2(storageKey: string): Promise<Buffer> {
  const bucket = process.env.VITE_B2_BUCKET;
  if (!bucket) throw new Error('VITE_B2_BUCKET não configurado');
  const client = getB2Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: storageKey });
  const response = await client.send(cmd);
  const stream = response.Body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const SUPPORTED_TYPES = ['pdf', 'docx', 'doc', 'txt', 'md', 'rtf', 'odt'];

export async function extractTranscricaoText(id: string): Promise<{ texto: string } | { error: string; status: number }> {
  const row = await getTranscricaoById(id);
  if (!row) return { error: 'Transcrição não encontrada', status: 404 };

  if (row.texto) return { texto: row.texto };

  if (!row.storagePath) return { error: 'Transcrição sem arquivo associado', status: 400 };

  const ext = row.originalName?.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_TYPES.includes(ext)) {
    return { error: `Tipo de arquivo não suportado para extração: .${ext}`, status: 400 };
  }

  const storageKey = `meeting-transcriptions/${row.storagePath}`;
  console.log('[extract-transcricao] downloading:', storageKey);
  const buffer = await downloadFromB2(storageKey);
  const texto = await extractText(buffer, ext === 'doc' ? 'docx' : ext);

  if (!texto || texto.trim().length < 5) {
    return { error: 'Não foi possível extrair texto do documento.', status: 422 };
  }

  return { texto };
}
