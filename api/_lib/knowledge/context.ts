/**
 * Pipeline de contexto: expansão de vizinhos, deduplicação, ordenação e montagem.
 */

import { pool } from '../../../src/DB/index.js';
import { RAG_CONFIG } from './config.js';
import type { RerankedChunk } from './types.js';

// ─── Expansão de vizinhos ────────────────────────────────────────────────────

/**
 * Expande o contexto buscando chunks vizinhos (chunk_index ± 1) de cada chunk rerankeado.
 * Usa uma única query batch com unnest para eficiência.
 */
export async function expandNeighborChunks(
  chunks: RerankedChunk[],
  collectionId?: string | null,
): Promise<RerankedChunk[]> {
  if (chunks.length === 0) return [];

  // Coletar pares (document_id, chunk_index) dos vizinhos que ainda não temos
  const existingIds = new Set(chunks.map(c => c.id));
  const existingKeys = new Set(chunks.map(c => `${c.documentId}:${c.chunkIndex}`));

  const docIds: string[] = [];
  const indexes: number[] = [];

  for (const chunk of chunks) {
    const prevKey = `${chunk.documentId}:${chunk.chunkIndex - 1}`;
    const nextKey = `${chunk.documentId}:${chunk.chunkIndex + 1}`;

    if (!existingKeys.has(prevKey) && chunk.chunkIndex > 0) {
      docIds.push(chunk.documentId);
      indexes.push(chunk.chunkIndex - 1);
      existingKeys.add(prevKey); // evitar duplicar pedidos
    }
    if (!existingKeys.has(nextKey)) {
      docIds.push(chunk.documentId);
      indexes.push(chunk.chunkIndex + 1);
      existingKeys.add(nextKey);
    }
  }

  if (docIds.length === 0) return chunks;

  try {
    const collectionFilter = collectionId
      ? 'AND kd.collection_id = $3'
      : '';
    const params: unknown[] = collectionId
      ? [docIds, indexes, collectionId]
      : [docIds, indexes];

    const { rows } = await pool.query(
      `
      SELECT
        kc.id,
        kc.document_id,
        kd.title AS document_title,
        kc.content,
        kc.chunk_index,
        kc.metadata
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      JOIN unnest($1::uuid[], $2::int[]) AS pairs(doc_id, idx)
        ON kc.document_id = pairs.doc_id AND kc.chunk_index = pairs.idx
      WHERE kd.status = 'published'
        AND kc.embedding IS NOT NULL
        ${collectionFilter}
      `,
      params,
    );

    const neighbors: RerankedChunk[] = rows
      .filter((r: Record<string, unknown>) => !existingIds.has(r.id as string))
      .map((r: Record<string, unknown>) => ({
        id: r.id as string,
        content: r.content as string,
        documentId: r.document_id as string,
        documentTitle: r.document_title as string,
        chunkIndex: parseInt(String(r.chunk_index ?? '0'), 10),
        vectorScore: 0,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        rerankScore: 0, // vizinhos não foram rerankeados
      }));

    return [...chunks, ...neighbors];
  } catch (error) {
    console.error('[context] Erro ao expandir vizinhos — prosseguindo sem expansão:', error);
    return chunks;
  }
}

// ─── Deduplicação ────────────────────────────────────────────────────────────

/** Remove chunks duplicados por id, mantendo o de maior rerankScore. */
export function dedupeChunks(chunks: RerankedChunk[]): RerankedChunk[] {
  const map = new Map<string, RerankedChunk>();
  for (const chunk of chunks) {
    const existing = map.get(chunk.id);
    if (!existing || chunk.rerankScore > existing.rerankScore) {
      map.set(chunk.id, chunk);
    }
  }
  return Array.from(map.values());
}

// ─── Ordenação ───────────────────────────────────────────────────────────────

/** Ordena chunks para leitura coerente: documentId → chapter → chunkIndex. */
export function sortChunksForContext(chunks: RerankedChunk[]): RerankedChunk[] {
  return [...chunks].sort((a, b) => {
    if (a.documentId !== b.documentId) return a.documentId.localeCompare(b.documentId);

    const chapterA = String(a.metadata?.chapter ?? '');
    const chapterB = String(b.metadata?.chapter ?? '');
    if (chapterA !== chapterB) return chapterA.localeCompare(chapterB);

    return (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0);
  });
}

// ─── Montagem do contexto ────────────────────────────────────────────────────

/**
 * Monta o contexto final formatado para enviar ao LLM.
 * Respeita MAX_CONTEXT_CHUNKS e MAX_CONTEXT_LENGTH.
 */
export function buildContext(chunks: RerankedChunk[]): string {
  const maxChunks = RAG_CONFIG.MAX_CONTEXT_CHUNKS;
  const maxLength = RAG_CONFIG.MAX_CONTEXT_LENGTH;

  const blocks: string[] = [];
  let totalLength = 0;

  for (let i = 0; i < chunks.length && blocks.length < maxChunks; i++) {
    const c = chunks[i];
    const chapter = c.metadata?.chapter ?? 'N/A';
    const page = c.metadata?.page ?? 'N/A';

    const header = `[Trecho ${blocks.length + 1} | Livro: ${c.documentTitle} | Capítulo: ${chapter} | Página: ${page}]`;
    const block = `${header}\n${c.content}`;

    if (totalLength + block.length > maxLength && blocks.length > 0) break;

    blocks.push(block);
    totalLength += block.length;
  }

  return blocks.join('\n\n---\n\n');
}
