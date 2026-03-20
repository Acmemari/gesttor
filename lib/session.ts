/**
 * Helpers de sessão — agora powered by Better Auth.
 * O token de sessão opaco é armazenado em localStorage sob BA_TOKEN_KEY.
 *
 * A interface pública (setToken, clearToken, getAccessToken, getAuthHeaders)
 * permanece idêntica para não quebrar nenhum caller existente.
 */
import { BA_TOKEN_KEY } from './auth/betterAuthClient';

/** Salva o session token no localStorage. */
export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(BA_TOKEN_KEY, token);
  }
}

/** Remove o session token do localStorage. */
export function clearToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(BA_TOKEN_KEY);
  }
}

/** Obtém o session token atual do localStorage. */
export function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return Promise.resolve(localStorage.getItem(BA_TOKEN_KEY));
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
