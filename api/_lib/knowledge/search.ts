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
  chunkIndex: number;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Busca os top-k chunks mais relevantes para um embedding de consulta.
 * Filtra apenas documentos com status 'published'.
 * @param minScore Threshold mínimo de similaridade cosine (0-1). Chunks abaixo são descartados.
 * @param collectionId Quando informado, restringe a busca a documentos dessa coleção.
 */
export async function semanticSearch(
  queryEmbedding: number[],
  topK = 6,
  minScore = 0.65,
  collectionId?: string | null,
): Promise<SearchResult[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  const collectionFilter = collectionId ? 'AND kd.collection_id = $4' : '';
  const params: unknown[] = collectionId
    ? [vectorStr, topK, minScore, collectionId]
    : [vectorStr, topK, minScore];

  // CTE evita calcular o score duas vezes (WHERE + SELECT)
  const { rows } = await pool.query(
    `
    WITH ranked AS (
      SELECT
        kc.id            AS chunk_id,
        kc.document_id,
        kd.title         AS document_title,
        kc.content,
        kc.chunk_index,
        kc.metadata,
        1 - (kc.embedding <=> $1::vector) AS score
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      WHERE kd.status = 'published'
        AND kc.embedding IS NOT NULL
        ${collectionFilter}
    )
    SELECT * FROM ranked WHERE score >= $3 ORDER BY score DESC LIMIT $2
    `,
    params,
  );

  return rows.map((r: Record<string, unknown>) => ({
    chunkId: r.chunk_id as string,
    documentId: r.document_id as string,
    documentTitle: r.document_title as string,
    content: r.content as string,
    chunkIndex: parseInt(String(r.chunk_index ?? '0'), 10),
    score: parseFloat(String(r.score)),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}
