/**
 * Cliente para Voyage AI Embeddings API.
 * Modelo: voyage-3-large (1024 dimensões) — recomendado pela Anthropic para apps Claude.
 * Docs: https://docs.voyageai.com/reference/embeddings-api
 *
 * IMPORTANTE: use inputType='query' ao embedar perguntas do usuário e
 * inputType='document' (default) ao embedar chunks de documentos na ingestão.
 * O modelo voyage-3-large é treinado com pares (query, document) e produz
 * representações otimizadas diferentes para cada tipo.
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-large';
const BATCH_SIZE = 96; // Limite seguro (API aceita até 128)

export interface EmbedResult {
  embeddings: number[][];
  totalTokens: number;
}

/**
 * Embeda um array de textos em batches.
 * Retorna os embeddings na mesma ordem dos inputs.
 * @param inputType 'document' para ingestão, 'query' para perguntas do usuário
 */
export async function embedTexts(
  texts: string[],
  inputType: 'document' | 'query' = 'document',
): Promise<EmbedResult> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY não configurada');

  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await callVoyageAPI(batch, apiKey, inputType);
    allEmbeddings.push(...result.embeddings);
    totalTokens += result.totalTokens;
  }

  return { embeddings: allEmbeddings, totalTokens };
}

/** Embeda um único texto. */
export async function embedSingle(
  text: string,
  inputType: 'document' | 'query' = 'document',
): Promise<number[]> {
  const result = await embedTexts([text], inputType);
  return result.embeddings[0];
}

/** Embeda um único texto e retorna também o total de tokens usados. */
export async function embedSingleWithUsage(
  text: string,
  inputType: 'document' | 'query' = 'document',
): Promise<{ embedding: number[]; tokens: number }> {
  const result = await embedTexts([text], inputType);
  return { embedding: result.embeddings[0], tokens: result.totalTokens };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const isRetryable =
        err instanceof Error && /429|500|502|503|504/.test(err.message);
      if (!isRetryable || attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError;
}

async function callVoyageAPI(
  inputs: string[],
  apiKey: string,
  inputType: 'document' | 'query' = 'document',
): Promise<EmbedResult> {
  return withRetry(async () => {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: inputs,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown error');
      throw new Error(`Voyage AI erro ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const embeddings = (data.data as Array<{ embedding: number[] }>).map(d => d.embedding);
    const totalTokens = data.usage?.total_tokens ?? 0;

    return { embeddings, totalTokens };
  });
}
