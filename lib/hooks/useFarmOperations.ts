import { useCallback } from 'react';
import { Farm } from '../../types';
import { mapFarmsFromDatabase } from '../utils/farmMapper';
import { logger } from '../logger';
import { getAuthHeaders } from '../session';

const log = logger.withContext({ component: 'useFarmOperations' });

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/**
 * Hook customizado para operações com fazendas
 * Centraliza lógica de CRUD e busca de fazendas
 */
export function useFarmOperations() {
  /**
   * Busca fazendas vinculadas a uma organização (anteriormente cliente)
   */
  const getClientFarms = useCallback(async (clientId: string): Promise<Farm[]> => {
    try {
      const res = await apiFetch(`/api/farms?organizationId=${encodeURIComponent(clientId)}`);

      if (!res.ok) {
        log.error('Error loading farms by organizationId', new Error(`HTTP ${res.status}`));
        return [];
      }

      const json = await res.json();
      if (!json.ok) return [];

      const data: Array<Record<string, unknown>> = json.data ?? [];
      return data.length > 0 ? mapFarmsFromDatabase(data) : [];
    } catch (err: unknown) {
      log.error('Exception loading client farms', err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  }, []);

  /**
   * Deleta (soft delete) uma fazenda
   */
  const deleteFarm = useCallback(async (farmId: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/farms?id=${encodeURIComponent(farmId)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        log.error('Error deleting farm', new Error(`HTTP ${res.status}`));
        return false;
      }

      // Limpar localStorage
      const storedFarms = localStorage.getItem('agro-farms');
      if (storedFarms) {
        const allFarms = JSON.parse(storedFarms);
        const updatedFarms = allFarms.filter((f: Farm) => f.id !== farmId);
        localStorage.setItem('agro-farms', JSON.stringify(updatedFarms));
      }

      return true;
    } catch (err: unknown) {
      log.error('Exception deleting farm', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }, []);

  /**
   * Conta fazendas vinculadas a uma organização
   */
  const countClientFarms = useCallback(async (clientId: string): Promise<number> => {
    try {
      const res = await apiFetch(`/api/farms?organizationId=${encodeURIComponent(clientId)}`);

      if (!res.ok) {
        log.error('Error counting farms', new Error(`HTTP ${res.status}`));
        return 0;
      }

      const json = await res.json();
      if (!json.ok) return 0;

      return (json.data ?? []).length;
    } catch (err: unknown) {
      log.error('Exception counting farms', err instanceof Error ? err : new Error(String(err)));
      return 0;
    }
  }, []);

  return {
    getClientFarms,
    deleteFarm,
    countClientFarms,
  };
}
