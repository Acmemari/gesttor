import { db, planLimits, rateLimits } from '../../../src/DB/index.js';
import { eq, and } from 'drizzle-orm';
import type { PlanId } from './types.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
  orgCount?: number;
  userCount?: number;
}

interface PlanLimitRates {
  max_requests_per_minute_org: number;
  max_requests_per_minute_user: number;
}

const WINDOW_MS = 60_000;

function floorToMinute(date = new Date()): Date {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMilliseconds(0);
  return d;
}

function remainingWindowMs(now = Date.now()): number {
  const ms = WINDOW_MS - (now % WINDOW_MS);
  return ms <= 0 ? WINDOW_MS : ms;
}

async function getPlanRates(plan: PlanId): Promise<PlanLimitRates> {
  const [data] = await db
    .select({
      max_requests_per_minute_org: planLimits.maxRequestsPerMinuteOrg,
      max_requests_per_minute_user: planLimits.maxRequestsPerMinuteUser,
    })
    .from(planLimits)
    .where(eq(planLimits.planId, plan))
    .limit(1);

  if (!data) {
    console.warn(`[rate-limit] plan_limits not found for "${plan}", using hardcoded defaults`);
    const defaults: Record<string, PlanLimitRates> = {
      essencial: { max_requests_per_minute_org: 20,  max_requests_per_minute_user: 10  },
      gestor:    { max_requests_per_minute_org: 60,  max_requests_per_minute_user: 30  },
      pro:       { max_requests_per_minute_org: 200, max_requests_per_minute_user: 100 },
    };
    return defaults[plan] ?? defaults['essencial'];
  }

  return {
    max_requests_per_minute_org: Number(data.max_requests_per_minute_org),
    max_requests_per_minute_user: Number(data.max_requests_per_minute_user),
  };
}

async function getCountForKey(key: string, windowStart: Date): Promise<number> {
  const [data] = await db
    .select({
      request_count: rateLimits.requestCount,
    })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
    .limit(1);

  return data?.request_count ?? 0;
}

async function incrementCounter(key: string, windowStart: Date): Promise<number> {
  const current = await getCountForKey(key, windowStart);

  if (current === 0) {
    try {
      await db.insert(rateLimits).values({
        key,
        windowStart,
        requestCount: 1,
      });
      return 1;
    } catch {
      // Conflict race, fallback to update
    }
  }

  const next = current + 1;
  await db
    .update(rateLimits)
    .set({ requestCount: next })
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)));

  return next;
}

export async function checkAndIncrementRateLimit(args: {
  orgId: string;
  userId: string;
  plan: PlanId;
}): Promise<RateLimitCheckResult> {
  const windowStart = floorToMinute();
  const rates = await getPlanRates(args.plan);
  const orgKey = `org:${args.orgId}`;
  const userKey = `user:${args.userId}`;

  const [orgCountBefore, userCountBefore] = await Promise.all([
    getCountForKey(orgKey, windowStart),
    getCountForKey(userKey, windowStart),
  ]);

  if (orgCountBefore >= rates.max_requests_per_minute_org || userCountBefore >= rates.max_requests_per_minute_user) {
    return {
      allowed: false,
      retryAfterMs: remainingWindowMs(),
      orgCount: orgCountBefore,
      userCount: userCountBefore,
    };
  }

  const [orgCount, userCount] = await Promise.all([
    incrementCounter(orgKey, windowStart),
    incrementCounter(userKey, windowStart),
  ]);

  if (orgCount > rates.max_requests_per_minute_org || userCount > rates.max_requests_per_minute_user) {
    return {
      allowed: false,
      retryAfterMs: remainingWindowMs(),
      orgCount,
      userCount,
    };
  }

  return {
    allowed: true,
    orgCount,
    userCount,
  };
}
