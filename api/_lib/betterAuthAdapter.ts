/**
 * Adapter de autenticação — substitui jwtAuth.ts.
 *
 * Drop-in replacement: exporta a mesma interface que jwtAuth.ts usava.
 * Todos os 9 endpoints de API que faziam import de jwtAuth.js devem
 * passar a importar deste arquivo (betterAuthAdapter.js).
 *
 * Internamente, usa auth.api.getSession() do Better Auth — chamada
 * in-process (sem HTTP), validando o token opaco contra ba_session no banco.
 */
import type { VercelRequest } from '@vercel/node';
import { auth } from './auth.js';

/**
 * Extrai e valida o Bearer token da requisição via Better Auth.
 * Retorna o userId (= user_profiles.id) ou null se não autenticado.
 */
export async function getAuthUserIdFromRequest(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  try {
    // Chamada in-process — não faz HTTP para evitar chamadas circulares no Vercel
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    const session = await auth.api.getSession({ headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Extrai apenas o Bearer token bruto do header, sem validar.
 * Mantido para compatibilidade com qualquer código que use getBearerToken diretamente.
 */
export function getBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}
