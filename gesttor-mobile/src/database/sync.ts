import { supabase } from '../api/supabase';
import { getUnsyncedRecords, markAsSynced, CollectionRecord } from './db';
import { checkConnectivity } from '../utils/connectivity';

/**
 * Executa a sincronização dos registros pendentes locais para o Supabase
 * @returns Retorna a quantidade de registros sincronizados com sucesso
 */
export async function syncLocalData(): Promise<{ successCount: number; failedCount: number }> {
  // 1. Verificar conexão com a internet
  const isOnline = await checkConnectivity();
  if (!isOnline) {
    console.log('Sync aborted: device is offline.');
    return { successCount: 0, failedCount: 0 };
  }

  // 2. Obter usuário logado
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.log('Sync aborted: no authenticated user found.');
    return { successCount: 0, failedCount: 0 };
  }

  // 3. Buscar coletas pendentes no banco SQLite local
  const unsyncedRecords = await getUnsyncedRecords();
  if (unsyncedRecords.length === 0) {
    console.log('Sync completed: no unsynced records.');
    return { successCount: 0, failedCount: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  console.log(`Starting sync for ${unsyncedRecords.length} records...`);

  // 4. Sincronizar cada registro de forma sequencial para garantir integridade
  for (const record of unsyncedRecords) {
    try {
      // Mapeia os dados móveis para o formato da tabela cattle_scenarios no Supabase
      const { error: insertError } = await supabase
        .from('cattle_scenarios')
        .insert({
          user_id: user.id,
          name: `Coleta: ${record.animal_id}`,
          inputs: {
            animal_id: record.animal_id,
            weight: record.weight,
            vaccination: record.vaccination || '',
            observations: record.observations || '',
          },
          results: {
            device: 'Gesttor Mobile',
            collected_at: record.created_at,
          },
        });

      if (insertError) {
        console.error(`Failed to sync record ID ${record.id}:`, insertError);
        failedCount++;
      } else {
        // Se gravou no Supabase, atualiza o status no SQLite local
        if (record.id) {
          await markAsSynced([record.id]);
          successCount++;
        }
      }
    } catch (err) {
      console.error(`Error in sync loop for record ID ${record.id}:`, err);
      failedCount++;
    }
  }

  console.log(`Sync process finished. Success: ${successCount}, Failed: ${failedCount}`);
  return { successCount, failedCount };
}
