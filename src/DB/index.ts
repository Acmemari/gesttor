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

// ── Retry em erros transitórios de rede ───────────────────────────────────────
// A primeira query a frio (cold start de dev ou de uma função serverless) pode
// falhar na resolução de DNS do host do Neon (getaddrinfo ENOTFOUND / EAI_AGAIN)
// ou por reset de conexão. O pg.Pool NÃO faz retry, então essa falha pontual
// retornava 500 "Internal Server Error" na primeira tentativa de login.
// Tentativas seguintes funcionam (DNS já resolvido). Aqui adicionamos retry
// transparente com backoff para essas falhas de infraestrutura.
const TRANSIENT_NET_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
]);

function isTransientNetworkError(err: unknown): boolean {
  let cur: unknown = err;
  // Percorre a cadeia de `cause` (pg/drizzle embrulham o erro original)
  for (let depth = 0; cur && depth < 5; depth++) {
    const code = (cur as { code?: string }).code;
    if (typeof code === 'string' && TRANSIENT_NET_CODES.has(code)) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

const MAX_DB_RETRIES = 3;

/** Envolve pool.query/pool.connect adicionando retry em falhas transitórias de rede. */
function withRetry<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_DB_RETRIES; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        lastErr = err;
        if (!isTransientNetworkError(err) || attempt === MAX_DB_RETRIES) throw err;
        const delayMs = 250 * (attempt + 1); // 250ms, 500ms, 750ms
        console.warn(
          `[DB] Falha transitória de rede (tentativa ${attempt + 1}/${MAX_DB_RETRIES}), repetindo em ${delayMs}ms:`,
          (err as { code?: string }).code ?? err,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  };
}

function installRetry(poolInstance: Pool): void {
  const originalQuery = poolInstance.query.bind(poolInstance);
  const retryingQuery = withRetry(originalQuery as (...args: unknown[]) => Promise<unknown>);

  // pg.Pool.query suporta estilo callback e estilo promise. O drizzle usa o
  // estilo promise (sem callback) — só esse precisa de retry. Se um callback
  // for passado, delega ao método original sem alteração.
  (poolInstance as { query: unknown }).query = function patchedQuery(this: Pool, ...args: unknown[]) {
    const last = args[args.length - 1];
    if (typeof last === 'function') {
      return (originalQuery as (...a: unknown[]) => unknown)(...args);
    }
    return retryingQuery(...args);
  };

  // Transações usam pool.connect() — também sujeito à falha de DNS a frio.
  const originalConnect = poolInstance.connect.bind(poolInstance);
  const retryingConnect = withRetry(originalConnect as (...args: unknown[]) => Promise<unknown>);
  (poolInstance as { connect: unknown }).connect = function patchedConnect(this: Pool, ...args: unknown[]) {
    const last = args[args.length - 1];
    if (typeof last === 'function') {
      return (originalConnect as (...a: unknown[]) => unknown)(...args);
    }
    return retryingConnect(...args);
  };
}

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

  installRetry(poolInstance);

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
