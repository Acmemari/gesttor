/**
 * Better Auth client — singleton para o frontend.
 *
 * Usa fetchOptions.onRequest para enviar o Bearer token armazenado em
 * localStorage em todas as requisições ao servidor Better Auth.
 * Usa fetchOptions.onSuccess para capturar e persistir o session token
 * retornado após login/signup.
 *
 * A chave de localStorage escolhida é 'ba_session_token' — compatível
 * com a leitura feita em lib/session.ts.
 */
import { createAuthClient } from 'better-auth/client';

export const BA_TOKEN_KEY = 'ba_session_token';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/api/auth`
    : '/api/auth',

  fetchOptions: {
    onRequest(context) {
      // Enviar Bearer token em todas as requests ao servidor BA
      // context.headers é o objeto Headers da Fetch API (de @better-fetch/fetch)
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem(BA_TOKEN_KEY);
        if (token) {
          context.headers.set('Authorization', `Bearer ${token}`);
        }
      }
    },
    onSuccess(context) {
      // Capturar e armazenar o session token após login/signup
      const data = context.data as { token?: string } | null;
      if (data?.token && typeof window !== 'undefined') {
        localStorage.setItem(BA_TOKEN_KEY, data.token);
      }
    },
    onError(context) {
      // Se o servidor retornar 401, limpar o token local
      if (context.response.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem(BA_TOKEN_KEY);
      }
    },
  },
});
