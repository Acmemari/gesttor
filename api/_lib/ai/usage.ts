import { db, planLimits, tokenBudgets, tokenLedger } from '../../../src/DB/index.js';
import { eq, and, sql } from 'drizzle-orm';
import type { PlanId, TokenReservation } from './types.js';

interface PlanLimitsResult {
  monthly_token_limit: number;
  monthly_cost_limit_usd: number;
}

interface TokenBudgetResult {
  id: string;
  tokens_used: number;
  tokens_reserved: number;
  cost_used_usd: number;
}

const reservations = new Map<string, TokenReservation>();

function getCurrentPeriod(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function toUsd(value: number): number {
  return Number(value.toFixed(6));
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const ratesPer1k: Record<string, { input: number; output: number }> = {
    'gemini-2.0-flash': { input: 0.00035, output: 0.00105 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'claude-3-5-haiku-latest': { input: 0.00025, output: 0.00125 },
  };
  const rate = ratesPer1k[model] ?? { input: 0.0005, output: 0.0015 };
  return toUsd((inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output);
}

async function loadPlanLimits(plan: PlanId): Promise<PlanLimitsResult> {
  const [data] = await db
    .select({
      monthly_token_limit: planLimits.monthlyTokenLimit,
      monthly_cost_limit_usd: planLimits.monthlyCostLimitUsd,
    })
    .from(planLimits)
    .where(eq(planLimits.planId, plan))
    .limit(1);

  if (!data) {
    console.warn(`[usage] plan_limits not found for "${plan}", using hardcoded defaults`);
    const defaults: Record<string, PlanLimitsResult> = {
      essencial: { monthly_token_limit: 500_000,    monthly_cost_limit_usd: 0.75  },
      gestor:    { monthly_token_limit: 2_000_000,  monthly_cost_limit_usd: 3.00  },
      pro:       { monthly_token_limit: 10_000_000, monthly_cost_limit_usd: 15.00 },
    };
    return defaults[plan] ?? defaults['essencial'];
  }

  return {
    monthly_token_limit: Number(data.monthly_token_limit),
    monthly_cost_limit_usd: Number(data.monthly_cost_limit_usd),
  };
}

async function getOrCreateBudget(orgId: string, period: string): Promise<TokenBudgetResult> {
  const [existing] = await db
    .select({
      id: tokenBudgets.id,
      tokens_used: tokenBudgets.tokensUsed,
      tokens_reserved: tokenBudgets.tokensReserved,
      cost_used_usd: tokenBudgets.costUsedUsd,
    })
    .from(tokenBudgets)
    .where(and(eq(tokenBudgets.orgId, orgId), eq(tokenBudgets.period, period)))
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      tokens_used: Number(existing.tokens_used),
      tokens_reserved: Number(existing.tokens_reserved),
      cost_used_usd: Number(existing.cost_used_usd),
    };
  }

  const [created] = await db
    .insert(tokenBudgets)
    .values({
      orgId,
      period,
      tokensUsed: '0',
      tokensReserved: '0',
      costUsedUsd: '0',
    })
    .returning({
      id: tokenBudgets.id,
      tokens_used: tokenBudgets.tokensUsed,
      tokens_reserved: tokenBudgets.tokensReserved,
      cost_used_usd: tokenBudgets.costUsedUsd,
    });

  if (!created) {
    throw new Error('Failed to create token budget');
  }

  return {
    id: created.id,
    tokens_used: Number(created.tokens_used),
    tokens_reserved: Number(created.tokens_reserved),
    cost_used_usd: Number(created.cost_used_usd),
  };
}

export async function reserveTokens(args: {
  orgId: string;
  userId: string;
  plan: PlanId;
  estimatedTokens: number;
}): Promise<TokenReservation> {
  const estimatedTokens = Math.max(0, Math.floor(args.estimatedTokens));
  const period = getCurrentPeriod();
  const [planLimitsData, budget] = await Promise.all([loadPlanLimits(args.plan), getOrCreateBudget(args.orgId, period)]);

  const projectedTokens = budget.tokens_used + budget.tokens_reserved + estimatedTokens;
  if (projectedTokens > planLimitsData.monthly_token_limit) {
    throw new Error('TOKEN_BUDGET_EXCEEDED');
  }

  await db
    .update(tokenBudgets)
    .set({
      tokensReserved: String(budget.tokens_reserved + estimatedTokens),
    })
    .where(eq(tokenBudgets.id, budget.id));

  const reservationId = crypto.randomUUID();
  const reservation: TokenReservation = {
    id: reservationId,
    orgId: args.orgId,
    userId: args.userId,
    period,
    reservedTokens: estimatedTokens,
    createdAt: new Date().toISOString(),
  };
  reservations.set(reservationId, reservation);

  await db.insert(tokenLedger).values({
    orgId: args.orgId,
    userId: args.userId,
    action: 'reserve',
    tokens: String(estimatedTokens),
    costUsd: '0',
    metadata: { reservation_id: reservationId, period },
  });

  return reservation;
}

export async function commitUsage(args: {
  reservationId: string;
  actualInputTokens: number;
  actualOutputTokens: number;
  model: string;
  agentRunId?: string;
}): Promise<{ totalTokens: number; costUsd: number }> {
  const reservation = reservations.get(args.reservationId);
  if (!reservation) throw new Error('RESERVATION_NOT_FOUND');

  const inputTokens = Math.max(0, Math.floor(args.actualInputTokens));
  const outputTokens = Math.max(0, Math.floor(args.actualOutputTokens));
  const totalTokens = inputTokens + outputTokens;
  const costUsd = estimateCostUsd(args.model, inputTokens, outputTokens);

  const budget = await getOrCreateBudget(reservation.orgId, reservation.period);
  const nextReserved = Math.max(0, budget.tokens_reserved - reservation.reservedTokens);

  await db
    .update(tokenBudgets)
    .set({
      tokensReserved: String(nextReserved),
      tokensUsed: String(budget.tokens_used + totalTokens),
      costUsedUsd: String(toUsd(Number(budget.cost_used_usd) + costUsd)),
    })
    .where(eq(tokenBudgets.id, budget.id));

  await db.insert(tokenLedger).values({
    orgId: reservation.orgId,
    userId: reservation.userId,
    agentRunId: args.agentRunId ?? null,
    action: 'commit',
    tokens: String(totalTokens),
    costUsd: String(costUsd),
    metadata: {
      reservation_id: args.reservationId,
      model: args.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  });

  reservations.delete(args.reservationId);
  return { totalTokens, costUsd };
}

export async function releaseReservation(reservationId: string): Promise<void> {
  const reservation = reservations.get(reservationId);
  if (!reservation) return;

  const budget = await getOrCreateBudget(reservation.orgId, reservation.period);
  const nextReserved = Math.max(0, budget.tokens_reserved - reservation.reservedTokens);

  await db
    .update(tokenBudgets)
    .set({ tokensReserved: String(nextReserved) })
    .where(eq(tokenBudgets.id, budget.id));

  await db.insert(tokenLedger).values({
    orgId: reservation.orgId,
    userId: reservation.userId,
    action: 'release',
    tokens: String(reservation.reservedTokens),
    costUsd: '0',
    metadata: {
      reservation_id: reservationId,
      period: reservation.period,
    },
  });

  reservations.delete(reservationId);
}

// ~$0.006/min para Whisper, estimativa: 1 MB ≈ 1 min de áudio
export async function trackWhisperCost(args: {
  orgId: string;
  userId: string;
  fileSizeBytes: number;
}): Promise<{ costUsd: number }> {
  const COST_PER_MB = 0.006;
  const costUsd = toUsd((args.fileSizeBytes / (1024 * 1024)) * COST_PER_MB);
  const period = getCurrentPeriod();
  const budget = await getOrCreateBudget(args.orgId, period);

  await db
    .update(tokenBudgets)
    .set({ costUsedUsd: String(toUsd(Number(budget.cost_used_usd) + costUsd)) })
    .where(eq(tokenBudgets.id, budget.id));

  await db.insert(tokenLedger).values({
    orgId: args.orgId,
    userId: args.userId,
    action: 'commit',
    tokens: '0',
    costUsd: String(costUsd),
    metadata: { source: 'whisper', file_size_bytes: args.fileSizeBytes },
  });

  return { costUsd };
}
