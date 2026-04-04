/**
 * Proxy TS para o motor de cálculo Python "Evolução do Rebanho".
 *
 * - Autentica via Better Auth (getAuthUserIdFromRequest)
 * - Repassa o body para a função Python (Vercel) ou FastAPI local
 * - Retorna o resultado ao frontend
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';

function getPythonBaseUrl(): string {
  if (process.env.PYTHON_API_URL) return process.env.PYTHON_API_URL;
  // Em produção no Vercel, chamar a função Python via URL do próprio deployment
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/py/herd_evolution`;
  // Dev local — FastAPI na porta 3002
  return 'http://localhost:3002';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { jsonError(res, 'Método não permitido', { status: 405 }); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  try {
    const base = getPythonBaseUrl();
    // Dev local: FastAPI /calculate. Vercel: a URL já aponta para a function.
    const pythonUrl = base.includes('/api/py/') ? base : `${base}/calculate`;

    const pyRes = await fetch(pythonUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(55_000),
    });

    const pyData = await pyRes.json();

    if (!pyRes.ok) {
      jsonError(res, pyData.error || 'Erro no cálculo', { status: pyRes.status });
      return;
    }

    jsonSuccess(res, pyData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    const isTimeout = message.includes('timeout') || message.includes('abort');
    jsonError(res, isTimeout ? 'Tempo limite excedido no cálculo' : message, {
      status: isTimeout ? 504 : 500,
    });
  }
}
