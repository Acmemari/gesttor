/**
 * Serviço de reranking com Voyage AI.
 * Reordena chunks retornados pela busca vetorial usando o modelo rerank-2.5.
 * Inclui fallback seguro: se a API falhar, retorna os top-K da busca vetorial.
 */

import { RAG_CONFIG } from './config.js';
import type { RetrievedChunk, RerankedChunk } from './types.js';

const VOYAGE_RERANK_URL = 'https://api.voyageai.com/v1/rerank';

interface VoyageRerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Reordena chunks usando Voyage Reranker.
 * @param query Pergunta original do usuário
 * @param chunks Chunks retornados pela busca vetorial
 * @param topK Quantidade de chunks a retornar após reranking
 * @returns Chunks reordenados com rerankScore
 */
export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  topK: number = RAG_CONFIG.RERANK_TOP_K,
): Promise<RerankedChunk[]> {
  const apiKey = process.env.VOYAGE_API_KEY;

  if (!apiKey) {
    console.warn('[rerank] VOYAGE_API_KEY não configurada — usando fallback vetorial');
    return fallback(chunks, topK);
  }

  if (chunks.length === 0) return [];

  // Se temos menos chunks que topK, não precisa reranquear
  if (chunks.length <= topK) {
    return chunks.map(c => ({ ...c, rerankScore: c.vectorScore }));
  }

  try {
    const response = await fetch(VOYAGE_RERANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: RAG_CONFIG.RERANK_MODEL,
        query,
        documents: chunks.map(c => c.content),
        top_k: topK,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`Voyage Rerank API ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    const results: VoyageRerankResult[] = json.data ?? json.results ?? [];

    if (results.length === 0) {
      console.warn('[rerank] API retornou 0 resultados — usando fallback vetorial');
      return fallback(chunks, topK);
    }

    return results.map(r => ({
      ...chunks[r.index],
      rerankScore: r.relevance_score,
    }));
  } catch (error) {
    console.error('[rerank] Erro na API Voyage Reranker — usando fallback vetorial:', error);
    return fallback(chunks, topK);
  }
}

/** Fallback: retorna os top-K chunks da busca vetorial original. */
function fallback(chunks: RetrievedChunk[], topK: number): RerankedChunk[] {
  return chunks.slice(0, topK).map(c => ({
    ...c,
    rerankScore: c.vectorScore,
  }));
}
