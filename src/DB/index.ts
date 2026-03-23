/**
 * Conexão lazy com o banco PostgreSQL via Drizzle ORM.
 *
 * O pool e a instância do Drizzle são criados apenas na primeira query,
 * evitando erros de hoisting ESM onde o módulo é avaliado antes de
 * dotenv.config() carregar DATABASE_URL.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export * from './schema.js';

let _pool: Pool | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function init(): { pool: Pool; db: ReturnType<typeof drizzle<typeof schema>> } {
  if (_pool && _db) return { pool: _pool, db: _db };

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[DB] DATABASE_URL não está definido. Verifique .env / .env.local');
  }

  // Append or replace sslmode to suppress pg-connection-string SSL warning
  let connStr = connectionString;
  if (connStr.includes('sslmode=require')) {
    connStr = connStr.replace('sslmode=require', 'sslmode=verify-full');
  } else if (!connStr.includes('sslmode=')) {
    connStr += (connStr.includes('?') ? '&' : '?') + 'sslmode=verify-full';
  }

  _pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  _db = drizzle(_pool, { schema });
  return { pool: _pool, db: _db };
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const { db: instance } = init();
    return (instance as Record<string | symbol, unknown>)[prop];
  },
});

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const { pool: instance } = init();
    return (instance as Record<string | symbol, unknown>)[prop];
  },
});
