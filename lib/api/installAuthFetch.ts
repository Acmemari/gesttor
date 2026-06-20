/**
 * Interceptor global de fetch — injeta o header `Authorization: Bearer <token>`
 * (token do Better Auth, guardado em sessionStorage) em TODA requisição
 * same-origin para `/api/*` que ainda não tenha auth.
 *
 * Por quê: o app autentica por Bearer token (sessionStorage), não por cookie de
 * sessão. Vários clients novos do pecuário faziam `fetch(url, { credentials:
 * 'include' })` sem o header `Authorization` → o servidor respondia 401 e nada
 * salvava/carregava. Este interceptor conserta todos de uma vez (e qualquer
 * client futuro) num único ponto.
 *
 * Seguro: idempotente, só toca em `/api/*` da própria origem, nunca sobrescreve
 * um `Authorization` já presente (os clients que usam `getAuthHeaders()` seguem
 * iguais), e nunca quebra o fetch original (try/catch).
 */
import { BA_TOKEN_KEY } from '../auth/betterAuthClient';

let installed = false;

export function installAuthFetch(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const origin = window.location.origin;
      const isApi = !!url && (url.startsWith('/api') || url.startsWith(`${origin}/api`));
      if (isApi) {
        const token = window.sessionStorage.getItem(BA_TOKEN_KEY);
        if (token) {
          // Combina headers do Request (se houver) + do init, sem perder nada.
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          if (init?.headers) {
            new Headers(init.headers as HeadersInit).forEach((v, k) => headers.set(k, v));
          }
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
            init = { ...init, headers };
          }
        }
      }
    } catch {
      /* nunca quebrar o fetch global */
    }
    return origFetch(input as RequestInfo | URL, init);
  };
}
