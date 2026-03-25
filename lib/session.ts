/**
 * Helpers de sessão — agora powered by Better Auth.
 * O token de sessão opaco é armazenado em sessionStorage sob BA_TOKEN_KEY.
 *
 * sessionStorage (vs localStorage):
 *  - Escopo por aba: apagado ao fechar aba/navegador
 *  - Menor superfície de exposição a XSS persistente
 *
 * A interface pública (setToken, clearToken, getAccessToken, getAuthHeaders)
 * permanece idêntica para não quebrar nenhum caller existente.
 */
import { BA_TOKEN_KEY } from './auth/betterAuthClient';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

/** Salva o session token no sessionStorage. */
export function setToken(token: string): void {
  getStorage()?.setItem(BA_TOKEN_KEY, token);
}

/** Remove o session token do sessionStorage. */
export function clearToken(): void {
  getStorage()?.removeItem(BA_TOKEN_KEY);
}

/** Obtém o session token atual do sessionStorage. */
export function getAccessToken(): Promise<string | null> {
  return Promise.resolve(getStorage()?.getItem(BA_TOKEN_KEY) ?? null);
}

/** Retorna headers prontos para requisições autenticadas. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * @deprecated Não necessário com Better Auth.
 * Mantido para compatibilidade com código existente.
 */
export function setSessionTokenGetter(_getter: () => Promise<string | null>): void {
  // no-op
}

/**
 * @deprecated O token BA é opaco — não contém claims JWT decodificáveis.
 * Mantido para compatibilidade. Retorna null.
 */
export async function getSessionUserId(): Promise<string | null> {
  return null;
}
