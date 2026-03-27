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
 * Extrai e valida o token de sessão da requisição via Better Auth.
 * Suporta duas estratégias (em ordem de prioridade):
 *   1. Authorization: Bearer {token}  — clientes que usam localStorage/sessionStorage
 *   2. Cookie: {session_cookie}       — clientes que usam httpOnly cookies (mais seguro)
 *
 * Retorna o userId (= user_profiles.id) ou null se não autenticado.
 */
export async function getAuthUserIdFromRequest(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  const cookieHeader = req.headers.cookie;

  // Precisa de pelo menos um dos dois para tentar validar
  if (!authHeader && !cookieHeader) return null;

  try {
    // Chamada in-process — não faz HTTP para evitar chamadas circulares no Vercel
    const headers = new Headers();

    if (authHeader) {
      const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      const token = value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    if (cookieHeader) {
      const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      headers.set('Cookie', cookie);
    }

    // disableRefresh: true — evita UPDATE em ba_session durante validação interna.
    // Sem isso, se a sessão tem >1 dia e o UPDATE falha (DB transiente, pool esgotado,
    // etc.), o Better Auth lança UNAUTHORIZED que seria capturado aqui como null → 401.
    const session = await auth.api.getSession({ headers, query: { disableRefresh: true } });
    return session?.user?.id ?? null;
  } catch (err) {
    console.error('[betterAuthAdapter] getAuthUserIdFromRequest error:', err instanceof Error ? err.message : String(err));
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
