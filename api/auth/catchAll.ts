/**
 * Handler catch-all para rotas do Better Auth.
 * Recebe qualquer request em /api/auth/* e delega para auth.handler().
 *
 * Este arquivo é importado tanto pelo Vercel ([...all].ts) quanto pelo
 * servidor de desenvolvimento (server-dev.ts), evitando problemas com
 * nomes de arquivo entre colchetes no Windows.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from '../_lib/auth.js';

import { toNodeHandler } from 'better-auth/node';

// Importante: Desativar bodyParser para não quebrar streams de requisições POST
export const config = {
  api: {
    bodyParser: false,
  },
};

const nodeHandler = toNodeHandler(auth);

export default async function catchAllHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // 1. A Vercel reescreveu a URL via vercel.json, o que muda req.url para /api/auth/catchAll
    // Nossa regra adiciona o caminho original no parâmetro `?path=`. Vamos reconstruir o original.
    let originalPath = req.url ?? '/api/auth';
    if (originalPath.includes('?path=')) {
      try {
        const parsedUrl = new URL(`http://localhost${originalPath}`);
        const pathParam = parsedUrl.searchParams.get('path');
        if (pathParam) {
          originalPath = `/api/auth/${pathParam}`;
        }
      } catch (e) {
        // Ignora erros de parse na URL
      }
    }

    // 2. Modifica o req para o Better Auth enxergar exatamente a rota que ele espera (ex: /api/auth/sign-in/email)
    req.url = originalPath;

    // 3. O toNodeHandler faz TODA a abstração de Converter Request Node -> Fetch -> Request Node
    await nodeHandler(req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[catchAll] Falha não tratada no handler:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: message, fallback: 'Internal catchAll error' });
    }
  }
}
