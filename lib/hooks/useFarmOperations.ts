import { useCallback } from 'react';
import { supabase } from '../supabase';
import { Farm } from '../../types';
import { mapFarmsFromDatabase } from '../utils/farmMapper';
import { logger } from '../logger';

const log = logger.withContext({ component: 'useFarmOperations' });

/**
 * Hook customizado para operações com fazendas
 * Centraliza lógica de CRUD e busca de fazendas
 */
export function useFarmOperations() {
  /**
   * Busca fazendas vinculadas a um cliente específico
   */
  const getClientFarms = useCallback(async (clientId: string): Promise<Farm[]> => {
    try {
      const { data, error } = await supabase
        .from('farms')
        .select('*')
        .eq('client_id', clientId)
        .order('name', { ascending: true });

      if (error) {
        log.error('Error loading farms by client_id', new Error(error.message));
        return [];
      }

      return data ? mapFarmsFromDatabase(data) : [];
    } catch (err: unknown) {
      log.error('Exception loading client farms', err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  }, []);

  /**
   * Deleta uma fazenda e todos os seus vínculos
   */
  const deleteFarm = useCallback(async (farmId: string): Promise<boolean> => {
    try {
      // Deletar vínculos analyst_farms primeiro. client_farms tem FK para farms com CASCADE.
      await supabase.from('analyst_farms').delete().eq('farm_id', farmId);

      // Deletar fazenda (client_farms cascade se configurado; senão, orphan rows não afetam fonte canônica)
      const { error } = await supabase.from('farms').delete().eq('id', farmId);

      if (error) {
        log.error('Error deleting farm', new Error(error.message));
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
   * Conta fazendas vinculadas a um cliente
   */
  const countClientFarms = useCallback(async (clientId: string): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('farms')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId);

      if (error) {
        log.error('Error counting farms', new Error(error.message));
        return 0;
      }

      return count || 0;
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
