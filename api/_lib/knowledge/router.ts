/**
 * Roteador de coleções RAG.
 * Usa Claude Haiku para classificar a pergunta e retornar o collectionId mais relevante.
 */

import { completeWithFallback } from '../ai/providers/index.js';

export interface CollectionOption {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Classifica a pergunta numa coleção usando Claude Haiku.
 * Retorna o collectionId mais relevante, ou null para busca em todas as coleções.
 *
 * - 0 coleções → null (busca geral)
 * - 1 coleção  → retorna ela diretamente, sem chamar a IA
 * - 2+ coleções → Claude Haiku classifica
 *
 * Em caso de erro no roteamento, retorna null como fallback seguro.
 */
export async function routeToCollection(
  question: string,
  collections: CollectionOption[],
): Promise<string | null> {
  if (collections.length === 0) return null;
  if (collections.length === 1) return collections[0].id;

  const collectionList = collections
    .map(c => `- ID: ${c.id} | Nome: ${c.name}${c.description ? ` | Descrição: ${c.description}` : ''}`)
    .join('\n');

  const userPrompt = `Dada a pergunta abaixo, escolha a coleção mais relevante.
Responda APENAS com o ID da coleção (UUID exato), sem mais nada. Se nenhuma for adequada, responda exatamente: null

Coleções disponíveis:
${collectionList}

Pergunta: "${question}"`;

  try {
    const response = await completeWithFallback({
      preferredProvider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      request: {
        systemPrompt: 'Você é um classificador de perguntas. Responda APENAS com o UUID da coleção ou a palavra null.',
        userPrompt,
        maxTokens: 50,
        temperature: 0,
      },
    });

    const answer = response.content.trim();
    if (answer === 'null') return null;

    // Valida que o ID retornado pertence às coleções disponíveis
    const match = collections.find(c => c.id === answer);
    if (!match) {
      console.warn(`[routeToCollection] ID retornado não encontrado nas coleções: "${answer}"`);
      return null;
    }

    return match.id;
  } catch (err) {
    console.warn('[routeToCollection] Roteamento falhou, usando busca geral:', err);
    return null;
  }
}
