/**
 * Configurações centralizadas do pipeline RAG.
 * Ajuste estes valores para tunar recall, precisão e tamanho do contexto.
 */
export const RAG_CONFIG = {
  /** Quantidade de chunks retornados pela busca vetorial inicial (candidatos para o reranker). */
  INITIAL_RETRIEVAL_LIMIT: 30,

  /** Score mínimo de similaridade cosine para a busca vetorial (0-1). Baixo para maximizar recall — o reranker cuida da precisão. */
  MIN_VECTOR_SCORE: 0.45,

  /** Modelo do Voyage Reranker. */
  RERANK_MODEL: 'rerank-2.5' as const,

  /** Quantidade de chunks retornados pelo reranker. */
  RERANK_TOP_K: 5,

  /** Expandir contexto com chunks vizinhos (chunk_index ± 1). */
  EXPAND_NEIGHBORS: true,

  /** Máximo de chunks no contexto final enviado ao LLM. */
  MAX_CONTEXT_CHUNKS: 8,

  /** Máximo de caracteres no contexto final. */
  MAX_CONTEXT_LENGTH: 12000,
} as const;
