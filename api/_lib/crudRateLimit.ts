/**
 * Rate limiter para rotas CRUD (pessoas, fazendas).
 * Usa a tabela rate_limits existente com janela de 1 minuto.
 * Limites fixos: 60 req/min por usuário, 200 req/min por organização.
 */
import { db, rateLimits } from '../../src/DB/index.js';
import { eq, and } from 'drizzle-orm';

const WINDOW_MS = 60_000;
const MAX_PER_USER = 60;
const MAX_PER_ORG = 200;

function floorToMinute(date = new Date()): Date {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMilliseconds(0);
  return d;
}

function remainingWindowMs(): number {
  const ms = WINDOW_MS - (Date.now() % WINDOW_MS);
  return ms <= 0 ? WINDOW_MS : ms;
}

async function getCount(key: string, windowStart: Date): Promise<number> {
  const [row] = await db
    .select({ requestCount: rateLimits.requestCount })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
    .limit(1);
  return row?.requestCount ?? 0;
}

async function increment(key: string, windowStart: Date): Promise<number> {
  const current = await getCount(key, windowStart);
  if (current === 0) {
    try {
      await db.insert(rateLimits).values({ key, windowStart, requestCount: 1 });
      return 1;
    } catch {
      // race condition — fall through to update
    }
  }
  const next = current + 1;
  await db
    .update(rateLimits)
    .set({ requestCount: next, updatedAt: new Date() })
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)));
  return next;
}

export async function checkCrudRateLimit(args: {
  userId: string;
  orgId?: string | null;
}): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const windowStart = floorToMinute();
  const userKey = `crud:user:${args.userId}`;

  const userCount = await getCount(userKey, windowStart);
  if (userCount >= MAX_PER_USER) {
    return { allowed: false, retryAfterMs: remainingWindowMs() };
  }

  if (args.orgId) {
    const orgKey = `crud:org:${args.orgId}`;
    const orgCount = await getCount(orgKey, windowStart);
    if (orgCount >= MAX_PER_ORG) {
      return { allowed: false, retryAfterMs: remainingWindowMs() };
    }
    await Promise.all([
      increment(userKey, windowStart),
      increment(orgKey, windowStart),
    ]);
  } else {
    await increment(userKey, windowStart);
  }

  return { allowed: true };
}
