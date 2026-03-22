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

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function catchAllHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // Construir a URL completa para o Better Auth
    const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3333';
    
    // Recuperar o path original passado via query param pelo vercel.json rewrite
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
    
    const url = `${baseURL}${originalPath}`;

    // Converter headers do Vercel para o formato Headers da Fetch API
    const SKIP_HEADERS = new Set(['host', 'transfer-encoding', 'connection']);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined && !SKIP_HEADERS.has(key.toLowerCase())) {
        if (Array.isArray(value)) {
          headers.set(key, value.join(', '));
        } else {
          headers.set(key, value);
        }
      }
    }

    // Ler body raw da requisição
    let rawBody: Buffer | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      rawBody = Buffer.concat(chunks);
    }

    // Criar Request padrão da Fetch API para o Better Auth
    const request = new Request(url, {
      method: req.method ?? 'GET',
      headers,
      body: rawBody && rawBody.length > 0 ? rawBody : undefined,
    });

    // Invocar o handler do Better Auth
    const response = await auth.handler(request);

    // Logging de erro manual
    if (response.status >= 400) {
      const clone = response.clone();
      const errText = await clone.text().catch(() => 'no text');
      console.error(`[catchAll] BA error ${response.status} for ${req.method} ${req.url}:`, errText);
    }

    // Copiar status HTTP
    res.status(response.status);

    // Copiar headers da resposta
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });

    // Copiar body da resposta
    const responseText = await response.text();
    res.end(responseText);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[catchAll] Unhandled error:', message, stack);
    if (!res.headersSent) {
      res.status(500).json({ error: message, stack: process.env.NODE_ENV !== 'production' ? stack : undefined });
    }
  }
}
