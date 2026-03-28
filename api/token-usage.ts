/**
 * GET /api/token-usage
 *
 * Retorna o consumo de tokens e custo da organização do usuário autenticado
 * no período atual (mês corrente). Usado pelo frontend para exibir a quota.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, and } from 'drizzle-orm';
import { db, userProfiles, organizations, tokenBudgets, planLimits } from '../src/DB/index.js';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonSuccess, jsonError, setCorsHeaders } from './_lib/apiResponse.js';
import type { PlanId } from './_lib/ai/types.js';

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function normalizePlan(plan: string | null | undefined): PlanId {
  if (plan === 'gestor' || plan === 'pro') return plan;
  return 'essencial';
}

interface PlanDefaults {
  tokenLimit: number;
  costLimitUsd: number;
}

function getPlanDefaults(plan: PlanId): PlanDefaults {
  const defaults: Record<PlanId, PlanDefaults> = {
    essencial: { tokenLimit: 500_000,    costLimitUsd: 0.75  },
    gestor:    { tokenLimit: 2_000_000,  costLimitUsd: 3.00  },
    pro:       { tokenLimit: 10_000_000, costLimitUsd: 15.00 },
  };
  return defaults[plan];
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    jsonError(res, 'Método não permitido.', { status: 405 });
    return;
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autenticado.', { code: 'AUTH_REQUIRED' });
    return;
  }

  const [profile] = await db
    .select({
      userPlan: userProfiles.plan,
      orgId:    userProfiles.organizationId,
      orgPlan:  organizations.plan,
    })
    .from(userProfiles)
    .leftJoin(organizations, eq(userProfiles.organizationId, organizations.id))
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile) {
    jsonError(res, 'Perfil não encontrado.', { code: 'AUTH_PROFILE_NOT_FOUND', status: 404 });
    return;
  }

  const orgId  = profile.orgId ?? userId;
  const plan   = normalizePlan(profile.orgPlan ?? profile.userPlan);
  const period = getCurrentPeriod();

  // Buscar orçamento atual (pode não existir se ainda não houve uso)
  const [budget] = await db
    .select({
      tokensUsed:     tokenBudgets.tokensUsed,
      tokensReserved: tokenBudgets.tokensReserved,
      costUsedUsd:    tokenBudgets.costUsedUsd,
    })
    .from(tokenBudgets)
    .where(and(eq(tokenBudgets.orgId, orgId), eq(tokenBudgets.period, period)))
    .limit(1);

  const tokensUsed     = Number(budget?.tokensUsed     ?? 0);
  const tokensReserved = Number(budget?.tokensReserved ?? 0);
  const costUsedUsd    = Number(budget?.costUsedUsd    ?? 0);

  // Buscar limites do plano (fallback para defaults se não cadastrado)
  const [limits] = await db
    .select({
      tokenLimit:   planLimits.monthlyTokenLimit,
      costLimitUsd: planLimits.monthlyCostLimitUsd,
    })
    .from(planLimits)
    .where(eq(planLimits.planId, plan))
    .limit(1);

  const tokenLimit   = Number(limits?.tokenLimit   ?? getPlanDefaults(plan).tokenLimit);
  const costLimitUsd = Number(limits?.costLimitUsd ?? getPlanDefaults(plan).costLimitUsd);

  jsonSuccess(res, {
    period,
    orgId,
    plan,
    tokensUsed,
    tokensReserved,
    costUsedUsd,
    tokenLimit,
    costLimitUsd,
    tokenPct: tokenLimit > 0 ? tokensUsed / tokenLimit   : 0,
    costPct:  costLimitUsd > 0 ? costUsedUsd / costLimitUsd : 0,
  });
}
