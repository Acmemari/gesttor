/**
 * Health check endpoint para verificar se as serverless functions estão funcionando.
 * GET /api/health
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.GEMINI_API_KEY;

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      nodeVersion: process.version,
      geminiKeyExists: !!apiKey,
      geminiKeyLength: apiKey?.length || 0,
      vercel: !!process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV,
    },
  });
}
