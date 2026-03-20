/**
 * Pipeline de ingestão de documentos RAG.
 * Etapas: download B2 → extract → chunk → embed → index → publish
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { pool } from '../../../src/DB/index.js';
import { extractText } from './extract.js';
import { chunkText } from './chunk.js';
import { embedTexts } from './embed.js';

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

async function updateJobStep(jobId: string, step: string, extra: Record<string, unknown> = {}) {
  await pool.query(
    `UPDATE knowledge_ingestion_jobs SET step = $1, status = 'running', started_at = COALESCE(started_at, now()) ${
      extra.chunksDone !== undefined ? ', chunks_done = $3' : ''
    } WHERE id = $2`,
    extra.chunksDone !== undefined ? [step, jobId, extra.chunksDone] : [step, jobId],
  );
}

async function failJob(jobId: string, documentId: string, error: string) {
  await pool.query(
    `UPDATE knowledge_ingestion_jobs SET status = 'failed', error_message = $1, completed_at = now() WHERE id = $2`,
    [error, jobId],
  );
  await pool.query(
    `UPDATE knowledge_documents SET status = 'error', error_message = $1, updated_at = now() WHERE id = $2`,
    [error, documentId],
  );
}

export async function runIngestionPipeline(documentId: string): Promise<void> {
  // Buscar documento
  const { rows: docRows } = await pool.query(
    `SELECT id, title, source_type, storage_key FROM knowledge_documents WHERE id = $1`,
    [documentId],
  );
  if (!docRows.length) throw new Error(`Documento ${documentId} não encontrado`);
  const doc = docRows[0];

  // Criar job de ingestão
  const { rows: jobRows } = await pool.query(
    `INSERT INTO knowledge_ingestion_jobs (document_id, status) VALUES ($1, 'running') RETURNING id`,
    [documentId],
  );
  const jobId = jobRows[0].id;

  try {
    // 1. EXTRACT
    await pool.query(`UPDATE knowledge_documents SET status = 'extracting', updated_at = now() WHERE id = $1`, [documentId]);
    await updateJobStep(jobId, 'extract');

    let text: string;
    if (doc.storage_key) {
      const buffer = await downloadFromB2(doc.storage_key);
      text = await extractText(buffer, doc.source_type);
    } else {
      throw new Error('Documento sem storage_key — faça o upload do arquivo primeiro');
    }

    if (!text.trim()) throw new Error('Nenhum texto extraído do documento');

    // 2. CHUNK
    await pool.query(`UPDATE knowledge_documents SET status = 'chunking', updated_at = now() WHERE id = $1`, [documentId]);
    await updateJobStep(jobId, 'chunk');

    const chunks = chunkText(text, { chunkSize: 1000, chunkOverlap: 200 });
    if (!chunks.length) throw new Error('Nenhum chunk gerado');

    await pool.query(`UPDATE knowledge_ingestion_jobs SET chunks_total = $1 WHERE id = $2`, [chunks.length, jobId]);

    // 3. EMBED
    await pool.query(`UPDATE knowledge_documents SET status = 'embedding', updated_at = now() WHERE id = $1`, [documentId]);
    await updateJobStep(jobId, 'embed');

    // Deletar chunks antigos (se estiver reprocessando)
    await pool.query(`DELETE FROM knowledge_chunks WHERE document_id = $1`, [documentId]);

    const BATCH = 48; // chunks por chamada Voyage (conservador)
    let totalEmbTokens = 0;
    let totalDone = 0;

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batchChunks = chunks.slice(i, i + BATCH);
      const texts = batchChunks.map(c => c.content);
      const { embeddings, totalTokens } = await embedTexts(texts);
      totalEmbTokens += totalTokens;

      // Inserir chunks com embeddings
      for (let j = 0; j < batchChunks.length; j++) {
        const c = batchChunks[j];
        const vectorStr = `[${embeddings[j].join(',')}]`;
        await pool.query(
          `INSERT INTO knowledge_chunks (document_id, chunk_index, content, token_count, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5, $6::vector)`,
          [documentId, c.index, c.content, c.tokenCount, JSON.stringify(c.metadata), vectorStr],
        );
      }

      totalDone += batchChunks.length;
      await pool.query(
        `UPDATE knowledge_ingestion_jobs SET chunks_done = $1, embedding_tokens_used = $2 WHERE id = $3`,
        [totalDone, totalEmbTokens, jobId],
      );
    }

    // 4. PUBLISH
    await pool.query(`UPDATE knowledge_documents SET status = 'published', error_message = null, updated_at = now() WHERE id = $1`, [documentId]);
    await pool.query(
      `UPDATE knowledge_ingestion_jobs SET status = 'completed', step = 'done', completed_at = now() WHERE id = $1`,
      [jobId],
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(jobId, documentId, message);
    throw err;
  }
}
