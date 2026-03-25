/**
 * Better Auth client — singleton para o frontend.
 *
 * Usa fetchOptions.onRequest para enviar o Bearer token armazenado em
 * sessionStorage em todas as requisições ao servidor Better Auth.
 * Usa fetchOptions.onSuccess para capturar e persistir o session token
 * retornado após login/signup.
 *
 * sessionStorage (vs localStorage):
 *  - Escopo por aba: token é apagado ao fechar a aba/navegador
 *  - Não compartilhado entre abas: menor superfície de exposição
 *  - Ainda vulnerável a XSS — mitigação adicional requer httpOnly cookies
 *
 * A chave é 'ba_session_token' — compatível com lib/session.ts.
 */
import { createAuthClient } from 'better-auth/client';

export const BA_TOKEN_KEY = 'ba_session_token';

/** Helper para acessar sessionStorage de forma segura (SSR-safe). */
function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/api/auth`
    : '/api/auth',

  fetchOptions: {
    onRequest(context) {
      // Enviar Bearer token em todas as requests ao servidor BA
      const token = getStorage()?.getItem(BA_TOKEN_KEY);
      if (token) {
        context.headers.set('Authorization', `Bearer ${token}`);
      }
    },
    onSuccess(context) {
      // Capturar e armazenar o session token após login/signup
      const data = context.data as { token?: string } | null;
      if (data?.token) {
        getStorage()?.setItem(BA_TOKEN_KEY, data.token);
      }
    },
    onError(context) {
      // Se o servidor retornar 401, limpar o token local
      if (context.response.status === 401) {
        getStorage()?.removeItem(BA_TOKEN_KEY);
      }
    },
  },
});
