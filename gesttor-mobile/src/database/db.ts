import * as SQLite from 'expo-sqlite';

export interface CollectionRecord {
  id?: number;
  animal_id: string;
  weight: number;
  vaccination: string;
  observations: string;
  created_at: string;
  synced: number; // 0 = falso, 1 = verdadeiro
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('gesttor.db');
  }
  return dbInstance;
}

/**
 * Inicializa a tabela local de coletas
 */
export async function initDatabase(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id TEXT NOT NULL,
      weight REAL NOT NULL,
      vaccination TEXT,
      observations TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
  `);
  console.log('Local SQLite Database initialized successfully.');
}

/**
 * Insere um novo registro de coleta (pendente de sincronização)
 */
export async function insertRecord(
  record: Omit<CollectionRecord, 'id' | 'synced'>
): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO collections (animal_id, weight, vaccination, observations, created_at, synced) 
     VALUES (?, ?, ?, ?, ?, 0)`,
    [
      record.animal_id,
      record.weight,
      record.vaccination || '',
      record.observations || '',
      record.created_at,
    ]
  );
}

/**
 * Obtém todos os registros locais ainda não sincronizados
 */
export async function getUnsyncedRecords(): Promise<CollectionRecord[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<CollectionRecord>(
    'SELECT * FROM collections WHERE synced = 0'
  );
  return rows;
}

/**
 * Obtém o histórico completo de coletas locais (sincronizadas ou não)
 */
export async function getAllRecords(): Promise<CollectionRecord[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<CollectionRecord>(
    'SELECT * FROM collections ORDER BY id DESC'
  );
  return rows;
}

/**
 * Marca uma lista de IDs como sincronizados com a nuvem
 */
export async function markAsSynced(ids: number[]): Promise<void> {
  const db = await getDB();
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE collections SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

/**
 * Limpa todos os dados locais (utilizado para reset do app)
 */
export async function clearAllLocalRecords(): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM collections');
}
