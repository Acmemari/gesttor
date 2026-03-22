/**
 * Health check endpoint — GET /api/health
 * Verifica env vars críticas e conectividade com o banco em produção.
 * Não conflita com o rewrite /api/auth/* do vercel.json.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.GEMINI_API_KEY;

  let dbStatus = 'não testado';
  try {
    const { db } = await import('../src/DB/index.js');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`SELECT 1`);
    dbStatus = 'ok — conexão bem-sucedida';
  } catch (err: unknown) {
    dbStatus = `ERRO — ${err instanceof Error ? err.message : String(err)}`;
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      nodeVersion: process.version,
      geminiKeyExists: !!apiKey,
      vercel: !!process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? '✅ definido' : '❌ NÃO DEFINIDO',
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? '❌ NÃO DEFINIDO',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ definido' : '❌ NÃO DEFINIDO',
    },
    db: dbStatus,
  });
}
