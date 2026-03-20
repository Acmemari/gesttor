import { User } from '../../types';
import { getAuthHeaders } from '../session';
import { mapUserProfile } from './mapUserProfile';
import { logger } from '../logger';

/**
 * Carrega perfil de usuário do Neon via API (/api/auth).
 * O AuthContext garante que o perfil existe antes de chamar esta função.
 * 
 *
 * @param _userId ID do usuário (ignorado — o userId vem do JWT na API)
 * @param retries Número de tentativas
 * @param delay Delay entre tentativas em ms
 * @returns Perfil do usuário ou null se não encontrado
 */
export const loadUserProfile = async (_userId: string, retries = 3, delay = 500): Promise<User | null> => {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        // Token ainda não disponível — aguarda e tenta novamente
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return null;
      }

      const res = await fetch('/api/auth', { headers });

      if (res.status === 404) {
        // Perfil ainda não existe — tenta novamente
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return null;
      }

      if (!res.ok) {
        logger.warn(`loadUserProfile: API error ${res.status} (attempt ${i + 1}/${retries})`, {
          component: 'loadUserProfile',
        });
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * 2));
          continue;
        }
        return null;
      }

      const json = (await res.json()) as { ok: boolean; data: unknown };
      if (json.ok && json.data) {
        logger.debug('Profile loaded successfully', { component: 'loadUserProfile' });
        return mapUserProfile(json.data);
      }

      return null;
    } catch (err: unknown) {
      logger.error('loadUserProfile error', err instanceof Error ? err : new Error(String(err)), {
        component: 'loadUserProfile',
      });
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  logger.warn(`Failed to load profile after ${retries} attempts`, { component: 'loadUserProfile' });
  return null;
};
