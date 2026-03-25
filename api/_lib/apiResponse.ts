/**
 * Padrão único de resposta para rotas API de dados.
 * Frontend pode tratar success/error de forma consistente.
 */
import type { VercelResponse } from '@vercel/node';

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { total?: number; offset?: number; limit?: number; hasMore?: boolean };
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiError(res: ApiResponse<unknown>): res is ApiError {
  return res.ok === false;
}

/**
 * Envia resposta de sucesso JSON.
 */
export function jsonSuccess<T>(res: VercelResponse, data: T, meta?: ApiSuccess<T>['meta']): void {
  res.status(200).json({ ok: true, data, ...(meta && { meta }) } as ApiSuccess<T>);
}

/**
 * Envia resposta de erro JSON.
 * Mapeia códigos comuns para status HTTP.
 */
export function jsonError(
  res: VercelResponse,
  message: string,
  options?: { code?: string; status?: number },
): void {
  const status = options?.status ?? mapErrorCodeToStatus(options?.code);
  res.status(status).json({
    ok: false,
    error: message,
    ...(options?.code && { code: options.code }),
  } as ApiError);
}

function mapErrorCodeToStatus(code?: string): number {
  if (!code) return 500;
  if (code.startsWith('AUTH_')) return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'VALIDATION') return 400;
  return 500;
}

// Origens permitidas para CORS (nunca usar '*' em produção)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3013',
  'http://localhost:3014',
  'http://localhost:3333',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  ...(process.env.VITE_APP_URL ? [process.env.VITE_APP_URL] : []),
  ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
];

/**
 * Define CORS headers para rotas de dados.
 * Usa allowlist de origens — nunca expõe '*'.
 */
export function setCorsHeaders(res: VercelResponse, req?: import('@vercel/node').VercelRequest): void {
  const origin = req?.headers?.origin as string | undefined;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    // Requisição server-to-server sem Origin header — permitir
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Se origin vier mas não estiver na lista, não define o header (bloqueio implícito)

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
