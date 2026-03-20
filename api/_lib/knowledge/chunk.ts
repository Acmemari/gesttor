/**
 * Chunking de texto — RecursiveCharacterTextSplitter (padrão LangChain, em TS puro).
 * Divide o texto recursivamente usando separadores em ordem de preferência.
 */

export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

/** Estimativa simples de tokens: ~4 chars por token (suficiente para fins de custo) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const { chunkSize = 1000, chunkOverlap = 200, metadata = {} } = options;

  const rawChunks = splitRecursive(text.trim(), DEFAULT_SEPARATORS, chunkSize, chunkOverlap);

  return rawChunks
    .map(c => c.trim())
    .filter(c => c.length > 0)
    .map((content, index) => ({
      content,
      index,
      tokenCount: estimateTokens(content),
      metadata,
    }));
}

function splitRecursive(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  if (text.length <= chunkSize) return [text];

  for (const sep of separators) {
    const splits = sep === '' ? text.split('') : text.split(sep);
    if (splits.length <= 1) continue;

    const chunks: string[] = [];
    let current = '';

    for (const part of splits) {
      const candidate = current.length > 0 ? current + sep + part : part;
      if (candidate.length <= chunkSize) {
        current = candidate;
      } else {
        if (current.length > 0) chunks.push(current);
        // Overlap: reutiliza os últimos chunkOverlap chars do chunk anterior
        const overlap = current.slice(-chunkOverlap);
        current = overlap.length > 0 ? overlap + sep + part : part;
        // Se ainda maior que chunkSize, forçar push e resetar
        if (current.length > chunkSize * 2) {
          chunks.push(current.slice(0, chunkSize));
          current = current.slice(chunkSize - chunkOverlap);
        }
      }
    }
    if (current.length > 0) chunks.push(current);
    return chunks.filter(c => c.trim().length > 0);
  }

  // Fallback: divisão dura por tamanho
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
    chunks.push(text.slice(i, i + chunkSize));
    if (i + chunkSize >= text.length) break;
  }
  return chunks;
}
