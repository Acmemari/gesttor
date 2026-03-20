/**
 * Health check endpoint for the agents pipeline.
 * GET /api/agents-health
 *
 * Verifies env vars, AI providers, DB tables, and webhook.
 * Does not require authentication.
 *
 * IMPORTANT: This file must NEVER crash. It reads process.env directly
 * (no imports from _lib/) so that missing env vars are reported as
 * failed checks instead of causing FUNCTION_INVOCATION_FAILED.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function trimOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const checks: Record<string, { ok: boolean; message?: string }> = {};
  let overallOk = true;

  try {
    // 1. Database (Neon) env var
    const databaseUrl = trimOrNull(process.env.DATABASE_URL);

    checks.database_url = {
      ok: !!databaseUrl,
      message: databaseUrl ? 'ok' : 'DATABASE_URL is missing',
    };

    if (!checks.database_url.ok) {
      overallOk = false;
    }

    // 2. AI provider keys
    const hasGemini = !!trimOrNull(process.env.GEMINI_API_KEY);
    const hasOpenai = !!trimOrNull(process.env.OPENAI_API_KEY);
    const hasAnthropic = !!trimOrNull(process.env.ANTHROPIC_API_KEY);
    const hasAnyProvider = hasGemini || hasOpenai || hasAnthropic;
    const providerCount = [hasGemini, hasOpenai, hasAnthropic].filter(Boolean).length;

    checks.ai_providers = {
      ok: hasAnyProvider,
      message: hasAnyProvider
        ? `ok (gemini:${hasGemini}, openai:${hasOpenai}, anthropic:${hasAnthropic})`
        : 'No AI provider key configured (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)',
    };
    if (!checks.ai_providers.ok) overallOk = false;

    // 3. Fallback coverage
    if (hasAnyProvider) {
      checks.ai_fallback = {
        ok: providerCount >= 2,
        message:
          providerCount >= 2
            ? `ok (${providerCount} providers available for fallback)`
            : `warn: only 1 provider, no fallback if it fails`,
      };
    }

    // 4. n8n webhook
    const webhookUrl = trimOrNull(process.env.N8N_WEBHOOK_URL) ?? trimOrNull(process.env.WEBHOOK_URL);
    checks.n8n_webhook = {
      ok: !!webhookUrl,
      message: webhookUrl ? 'ok' : 'N8N_WEBHOOK_URL not configured (chat will not work)',
    };

    // 5. DB Connectivity & Tables (via Drizzle)
    if (databaseUrl) {
      try {
        const { db } = await import('../src/DB/index.js');
        const { planLimits } = await import('../src/DB/schema.js');
        
        // Verify connectivity, table existence, AND seed data
        const data = await db.select().from(planLimits).limit(1);
        const hasSeeds = Array.isArray(data) && data.length > 0;

        checks.plan_limits_table = {
          ok: hasSeeds,
          message: hasSeeds
            ? 'ok (Drizzle/Neon, seed data present)'
            : 'WARN: table exists but has no rows — run: npx tsx scripts/seed-ai-tables.ts',
        };
        if (!hasSeeds) overallOk = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        checks.plan_limits_table = { ok: false, message: `DB error: ${msg}` };
        overallOk = false;
      }
    } else {
      checks.plan_limits_table = { ok: false, message: 'Skipped (DATABASE_URL not configured)' };
      overallOk = false;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.unexpected_error = { ok: false, message: msg };
    overallOk = false;
  }

  return res.status(overallOk ? 200 : 503).json({
    status: overallOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
}
