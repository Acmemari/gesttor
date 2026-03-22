/**
 * Endpoint de diagnóstico TEMPORÁRIO — remover após resolver o bug de produção.
 * GET /api/auth/debug — verifica env vars e conectividade do BD na Vercel.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function debugHandler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const hasBetterAuthSecret = !!process.env.BETTER_AUTH_SECRET;
  const betterAuthUrl = process.env.BETTER_AUTH_URL ?? '(não definido)';
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const nodeEnv = process.env.NODE_ENV ?? '(não definido)';

  let dbStatus = 'não testado';
  try {
    const { db } = await import('../../src/DB/index.js');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`SELECT 1`);
    dbStatus = 'ok — conexão bem-sucedida';
  } catch (err: unknown) {
    dbStatus = `ERRO — ${err instanceof Error ? err.message : String(err)}`;
  }

  res.status(200).json({
    env: {
      BETTER_AUTH_SECRET: hasBetterAuthSecret ? '✅ definido' : '❌ NÃO DEFINIDO',
      BETTER_AUTH_URL: betterAuthUrl,
      DATABASE_URL: hasDatabaseUrl ? '✅ definido' : '❌ NÃO DEFINIDO',
      NODE_ENV: nodeEnv,
    },
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
}
