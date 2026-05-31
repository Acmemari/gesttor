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

const globalForDb = globalThis as unknown as {
  _pool?: Pool;
  _db?: ReturnType<typeof drizzle<typeof schema>>;
};

function init(): { pool: Pool; db: ReturnType<typeof drizzle<typeof schema>> } {
  if (globalForDb._pool && globalForDb._db) {
    return { pool: globalForDb._pool, db: globalForDb._db };
  }

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

  const poolInstance = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 8, // Set max connections slightly lower for dev to prevent exhaustion
    connectionTimeoutMillis: 15000, // Increase slightly for Neon cold starts
    idleTimeoutMillis: 15000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  const dbInstance = drizzle(poolInstance, { schema });

  globalForDb._pool = poolInstance;
  globalForDb._db = dbInstance;

  return { pool: poolInstance, db: dbInstance };
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
