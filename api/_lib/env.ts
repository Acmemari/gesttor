/**
 * Centralized server-side environment configuration.
 *
 * Every API route should read env vars through this module so that:
 *  - validation happens once and errors are surfaced clearly;
 *  - AI provider availability is always known upfront.
 */

import type { AIProviderName } from './ai/types.js';

export interface ServerEnv {
  GEMINI_API_KEY: string | null;
  OPENAI_API_KEY: string | null;
  ANTHROPIC_API_KEY: string | null;
  VOYAGE_API_KEY: string | null;
}

let _cached: ServerEnv | null = null;

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

/**
 * Loads and validates all required server-side environment variables.
 * Results are cached for the lifetime of the process / warm invocation.
 */
export function getServerEnv(): ServerEnv {
  if (_cached) return _cached;

  const gemini = trimOrNull(process.env.GEMINI_API_KEY);
  const openai = trimOrNull(process.env.OPENAI_API_KEY);
  const anthropic = trimOrNull(process.env.ANTHROPIC_API_KEY) ?? trimOrNull(process.env.CLOUD_API_KEY);

  if (!gemini && !openai && !anthropic) {
    console.warn(
      '[ENV] Nenhuma chave de IA configurada (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY). ' +
        'Endpoints de IA retornarão erro.',
    );
  }

  _cached = {
    GEMINI_API_KEY: gemini,
    OPENAI_API_KEY: openai,
    ANTHROPIC_API_KEY: anthropic,
    VOYAGE_API_KEY: trimOrNull(process.env.VOYAGE_API_KEY),
  };

  return _cached;
}

/**
 * Returns the list of AI providers whose API keys are configured.
 */
export function getAvailableProviders(): AIProviderName[] {
  const gemini = trimOrNull(process.env.GEMINI_API_KEY);
  const openai = trimOrNull(process.env.OPENAI_API_KEY);
  const anthropic = trimOrNull(process.env.ANTHROPIC_API_KEY) ?? trimOrNull(process.env.CLOUD_API_KEY);
  const providers: AIProviderName[] = [];
  if (gemini) providers.push('gemini');
  if (openai) providers.push('openai');
  if (anthropic) providers.push('anthropic');
  return providers;
}

/**
 * Returns the API key for a specific provider, or null if not configured.
 */
export function getProviderKey(provider: AIProviderName): string | null {
  switch (provider) {
    case 'gemini':
      return trimOrNull(process.env.GEMINI_API_KEY);
    case 'openai':
      return trimOrNull(process.env.OPENAI_API_KEY);
    case 'anthropic':
      return trimOrNull(process.env.ANTHROPIC_API_KEY) ?? trimOrNull(process.env.CLOUD_API_KEY);
  }
}

/** Reset cache — only for tests. */
export function _resetEnvCache(): void {
  _cached = null;
}
