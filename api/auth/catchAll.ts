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

export default async function catchAllHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Construir a URL completa para o Better Auth
  const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3333';
  const url = `${baseURL}${req.url ?? '/api/auth'}`;

  // Converter headers do Vercel para o formato Headers da Fetch API
  // Excluir headers que causam conflito ao re-serializar o body (content-length,
  // host, transfer-encoding). O Fetch API recalcula content-length automaticamente.
  const SKIP_HEADERS = new Set(['content-length', 'host', 'transfer-encoding', 'connection']);
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

  // Construir body para métodos com payload
  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && req.body !== null) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }
  }

  // Criar Request padrão da Fetch API para o Better Auth
  const request = new Request(url, {
    method: req.method ?? 'GET',
    headers,
    body,
  });

  // Invocar o handler do Better Auth
  const response = await auth.handler(request);

  if (response.status >= 400) {
    const clone = response.clone();
    const errText = await clone.text();
    console.error(`[catchAll] BA error ${response.status} for ${req.method} ${req.url}:`, errText);
  }

  // Copiar status HTTP
  res.status(response.status);

  // Copiar headers da resposta
  response.headers.forEach((value, key) => {
    // Evitar headers problemáticos que o Vercel gerencia
    if (key.toLowerCase() !== 'transfer-encoding') {
      res.setHeader(key, value);
    }
  });

  // Copiar body da resposta
  const responseText = await response.text();
  res.end(responseText);
}
