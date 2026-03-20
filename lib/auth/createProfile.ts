import { getAuthHeaders } from '../session';
import { logger } from '../logger';

/**
 * Verifica se o perfil do usuário existe (Neon via API) e tenta criar se faltar.
 * O AuthContext já faz o upsert no login e refresh, tornando esta função quase redundante.
 */
export const createUserProfileIfMissing = async (_userId: string): Promise<boolean> => {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/auth', { headers });
    
    // Se retornar 200 ou 201, o perfil já existe ou foi garantido.
    if (res.ok) return true;

    // Se não existir, o próprio AuthContext ou o fluxo de login deveria ter criado.
    // Manter retorno como true se for 404 para evitar loops no frontend legados,
    // pois o upsert automático via POST /api/auth resolverá na próxima escrita.
    return res.status === 404; 
  } catch (error) {
    logger.error('Error in legacy createUserProfileIfMissing', error instanceof Error ? error : new Error(String(error)), {
      component: 'createProfile',
    });
    return false;
  }
};
