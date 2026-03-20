/**
 * Cliente para Voyage AI Embeddings API.
 * Modelo: voyage-3-large (1024 dimensões) — recomendado pela Anthropic para apps Claude.
 * Docs: https://docs.voyageai.com/reference/embeddings-api
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
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY não configurada');

  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await callVoyageAPI(batch, apiKey);
    allEmbeddings.push(...result.embeddings);
    totalTokens += result.totalTokens;
  }

  return { embeddings: allEmbeddings, totalTokens };
}

/** Embeda um único texto. */
export async function embedSingle(text: string): Promise<number[]> {
  const result = await embedTexts([text]);
  return result.embeddings[0];
}

/** Embeda um único texto e retorna também o total de tokens usados. */
export async function embedSingleWithUsage(text: string): Promise<{ embedding: number[]; tokens: number }> {
  const result = await embedTexts([text]);
  return { embedding: result.embeddings[0], tokens: result.totalTokens };
}

async function callVoyageAPI(
  inputs: string[],
  apiKey: string,
): Promise<EmbedResult> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: inputs,
      input_type: 'document',
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
}
