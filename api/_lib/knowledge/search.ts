/**
 * Busca semântica com pgvector (cosine similarity).
 * Usa SQL raw com o operador <=>(cosine distance) do pgvector.
 */

import { pool } from '../../../src/DB/index.js';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Busca os top-k chunks mais relevantes para um embedding de consulta.
 * Filtra apenas documentos com status 'published'.
 * @param minScore Threshold mínimo de similaridade cosine (0-1). Chunks abaixo são descartados.
 */
export async function semanticSearch(
  queryEmbedding: number[],
  topK = 6,
  minScore = 0.5,
): Promise<SearchResult[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  const { rows } = await pool.query(
    `
    SELECT
      kc.id            AS chunk_id,
      kc.document_id,
      kd.title         AS document_title,
      kc.content,
      kc.metadata,
      1 - (kc.embedding <=> $1::vector) AS score
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kd.status = 'published'
      AND kc.embedding IS NOT NULL
      AND 1 - (kc.embedding <=> $1::vector) >= $3
    ORDER BY kc.embedding <=> $1::vector
    LIMIT $2
    `,
    [vectorStr, topK, minScore],
  );

  return rows.map((r: Record<string, unknown>) => ({
    chunkId: r.chunk_id as string,
    documentId: r.document_id as string,
    documentTitle: r.document_title as string,
    content: r.content as string,
    score: parseFloat(String(r.score)),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}
