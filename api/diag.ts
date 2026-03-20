/**
 * Diagnostic endpoint to identify which _lib/ import causes FUNCTION_INVOCATION_FAILED.
 * GET /api/diag
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const results: Record<string, string> = {};

  // Test 1: env
  try {
    const { getServerEnv } = await import('./_lib/env.js');
    getServerEnv();
    results.env = 'ok';
  } catch (e) {
    results.env = String((e as Error).message);
  }

  // Test 2: Database (Drizzle/Neon)
  try {
    const { db } = await import('../src/DB/index.js');
    if (!db) throw new Error('DB client not initialized');
    results.database = 'Drizzle/Neon client initialized';
  } catch (e) {
    results.database = String((e as Error).message);
  }

  // Test 3: gemini provider
  try {
    const { GeminiProvider } = await import('./_lib/ai/providers/gemini.js');
    const p = new GeminiProvider();
    results.gemini = p.name + ' ok';
  } catch (e) {
    results.gemini = String((e as Error).message);
  }

  // Test 4: openai provider
  try {
    const { OpenAIProvider } = await import('./_lib/ai/providers/openai.js');
    const p = new OpenAIProvider();
    results.openai = p.name + ' ok';
  } catch (e) {
    results.openai = String((e as Error).message);
  }

  // Test 5: anthropic provider
  try {
    const { AnthropicProvider } = await import('./_lib/ai/providers/anthropic.js');
    const p = new AnthropicProvider();
    results.anthropic = p.name + ' ok';
  } catch (e) {
    results.anthropic = String((e as Error).message);
  }

  // Test 6: providers/index
  try {
    await import('./_lib/ai/providers/index.js');
    results.providersIndex = 'ok';
  } catch (e) {
    results.providersIndex = String((e as Error).message);
  }

  // Test 7: zod
  try {
    const { z } = await import('zod');
    z.string();
    results.zod = 'ok';
  } catch (e) {
    results.zod = String((e as Error).message);
  }

  // Test 8: rate-limit
  try {
    await import('./_lib/ai/rate-limit.js');
    results.rateLimit = 'ok';
  } catch (e) {
    results.rateLimit = String((e as Error).message);
  }

  return res.status(200).json({ ok: true, results });
}
