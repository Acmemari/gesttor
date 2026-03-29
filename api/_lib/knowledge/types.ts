/**
 * Tipos do pipeline RAG com reranking.
 */

/** Chunk retornado pela busca vetorial no pgvector. */
export interface RetrievedChunk {
  id: string;
  content: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  vectorScore: number;
  metadata: Record<string, unknown>;
}

/** Chunk após reranking com Voyage — inclui score de relevância do reranker. */
export interface RerankedChunk extends RetrievedChunk {
  rerankScore: number;
}

/** Resultado completo do pipeline de retrieval. */
export interface RetrievalPipelineResult {
  initialCount: number;
  rerankedCount: number;
  finalCount: number;
  chunks: RerankedChunk[];
  context: string;
  timings: {
    vectorMs: number;
    rerankMs: number;
    expansionMs: number;
    totalMs: number;
  };
}
