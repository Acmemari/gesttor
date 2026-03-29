import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import type { AIProvider } from './_lib/ai/types.js';
import { eq } from 'drizzle-orm';
import { db, userProfiles, organizations } from '../src/DB/index.js';
import { getAgentManifest } from './_lib/agents/registry.js';
import { runHelloAgent } from './_lib/agents/hello/handler.js';
import { runFeedbackAgent } from './_lib/agents/feedback/handler.js';
import { runDamagesGenAgent } from './_lib/agents/damages-gen/handler.js';
import { runAtaGenAgent } from './_lib/agents/ata-gen/handler.js';
import { runTranscricaoProcAgent } from './_lib/agents/transcricao-proc/handler.js';
import { getProvider } from './_lib/ai/providers/index.js';
import { getFallbackRoutes, routeAgent } from './_lib/ai/router.js';
import { checkAndIncrementRateLimit } from './_lib/ai/rate-limit.js';
import { commitUsage, releaseReservation, reserveTokens, estimateCostUsd } from './_lib/ai/usage.js';
import { logAgentRun } from './_lib/ai/logging.js';
import type { AIProviderName, PlanId } from './_lib/ai/types.js';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';

export const maxDuration = 60; // Allow long-running LLM calls on Vercel

type AgentHandler = (args: { input: unknown; provider: AIProvider; model: string; systemPrompt?: string }) => Promise<{
  data: unknown;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
}>;

const agentHandlers: Record<string, AgentHandler> = {
  hello: args => runHelloAgent({ ...args, input: args.input as Parameters<typeof runHelloAgent>[0]['input'] }),
  feedback: args => runFeedbackAgent({ ...args, input: args.input as Parameters<typeof runFeedbackAgent>[0]['input'] }),
  'damages-gen': args =>
    runDamagesGenAgent({ ...args, input: args.input as Parameters<typeof runDamagesGenAgent>[0]['input'] }),
  'ata-gen': args =>
    runAtaGenAgent({ ...args, input: args.input as Parameters<typeof runAtaGenAgent>[0]['input'] }),
  'transcricao-proc': args =>
    runTranscricaoProcAgent({ ...args, input: args.input as Parameters<typeof runTranscricaoProcAgent>[0]['input'] }),
};

const runRequestSchema = z.object({
  agentId: z.string().min(1),
  version: z.string().optional(),
  input: z.unknown(),
});

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizePlan(plan: string | null | undefined): PlanId {
  if (plan === 'gestor' || plan === 'pro') return plan;
  return 'essencial';
}

type UserContext = {
  userId: string;
  orgId: string;
  plan: PlanId;
  hasOrg: boolean;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function authenticateAndLoadContext(req: VercelRequest): Promise<UserContext> {
  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    throw new Error('AUTH_MISSING_OR_INVALID_TOKEN');
  }

  const [profile] = await db
    .select({
      userPlan: userProfiles.plan,
      orgId:    userProfiles.organizationId,
      orgPlan:  organizations.plan,
      orgAtivo: organizations.ativo,
    })
    .from(userProfiles)
    .leftJoin(organizations, eq(userProfiles.organizationId, organizations.id))
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile) {
    throw new Error('AUTH_PROFILE_NOT_FOUND');
  }

  const resolvedOrgId = profile.orgId ?? userId;
  const hasOrg        = !!profile.orgId && (profile.orgAtivo ?? true);
  const resolvedPlan  = normalizePlan(profile.orgPlan ?? profile.userPlan);

  return {
    userId,
    orgId:  resolvedOrgId,
    plan:   resolvedPlan,
    hasOrg,
  };
}

function mapErrorToStatus(errorCode: string): number {
  if (errorCode.startsWith('AUTH_')) return 401;
  if (errorCode === 'RATE_LIMIT_EXCEEDED') return 429;
  if (errorCode === 'TOKEN_BUDGET_EXCEEDED') return 402;
  if (errorCode.startsWith('INPUT_') || errorCode.startsWith('AGENT_')) return 400;
  if (errorCode.startsWith('FEEDBACK_AGENT_OUTPUT_INVALID')) return 400;
  if (errorCode === 'TIMEOUT' || errorCode.includes('TIMEOUT')) return 504;
  return 500;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });

  const startedAt = Date.now();
  let ctx: UserContext | null = null;
  let reservationId: string | null = null;
  let runMeta: {
    agentId: string;
    agentVersion: string;
    provider: AIProviderName;
    model: string;
  } | null = null;

  try {
    const parsedBody = runRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: parsedBody.error.issues.map(i => i.message).join('; '),
        code: 'INPUT_INVALID_REQUEST',
      });
    }

    ctx = await authenticateAndLoadContext(req);

    const manifest = await getAgentManifest(parsedBody.data.agentId, parsedBody.data.version);
    if (!manifest) {
      return res.status(404).json({
        error: 'Agent manifest not found.',
        code: 'AGENT_NOT_FOUND',
      });
    }

    const inputValidation = manifest.inputSchema.safeParse(parsedBody.data.input);
    if (!inputValidation.success) {
      return res.status(400).json({
        error: inputValidation.error.issues.map(i => i.message).join('; '),
        code: 'INPUT_SCHEMA_INVALID',
      });
    }

    const rateLimitResult = await checkAndIncrementRateLimit({
      orgId: ctx.orgId,
      userId: ctx.userId,
      plan: ctx.plan,
    });

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterMs: rateLimitResult.retryAfterMs ?? 60_000,
      });
    }

    const reservation = await reserveTokens({
      orgId: ctx.orgId,
      userId: ctx.userId,
      plan: ctx.plan,
      estimatedTokens: manifest.estimatedTokensPerCall,
    });
    reservationId = reservation.id;

    const routes = [routeAgent(manifest, ctx.plan), ...getFallbackRoutes(manifest)];
    let lastExecutionError: unknown = null;
    let outputData: unknown = null;
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let providerUsed: AIProviderName = routes[0]?.provider ?? manifest.modelPolicy.provider;
    let modelUsed = routes[0]?.model ?? manifest.modelPolicy.model;
    let latencyMs = 0;

    const handler = agentHandlers[manifest.id];
    if (!handler) {
      throw new Error(`AGENT_NOT_IMPLEMENTED:${manifest.id}`);
    }

    const failedProviders: string[] = [];

    for (const route of routes) {
      try {
        const provider = getProvider(route.provider);
        providerUsed = route.provider;
        modelUsed = route.model;

        const result = await handler({
          input: inputValidation.data,
          provider,
          model: route.model,
          systemPrompt: manifest.systemPrompt,
        });
        outputData = result.data;
        usage = result.usage;
        latencyMs = result.latencyMs;
        break;
      } catch (err) {
        const reason = (err as Error)?.message ?? 'unknown';
        console.error(`[agents-run] Provider ${route.provider}/${route.model} failed:`, reason);
        failedProviders.push(`${route.provider}(${reason.slice(0, 120)})`);
        lastExecutionError = err;
      }
    }

    if (!outputData) {
      const detail =
        failedProviders.length > 0
          ? failedProviders.join(' | ')
          : ((lastExecutionError as Error)?.message ?? 'unknown error');
      console.error('[agents-run] All providers exhausted:', detail);
      throw new Error(`AGENT_EXECUTION_FAILED:${detail}`);
    }

    runMeta = {
      agentId: manifest.id,
      agentVersion: manifest.version,
      provider: providerUsed,
      model: modelUsed,
    };

    let costUsd = 0;
    if (reservationId) {
      try {
        const commit = await commitUsage({
          reservationId,
          actualInputTokens: usage.inputTokens,
          actualOutputTokens: usage.outputTokens,
          model: modelUsed,
        });
        costUsd = commit.costUsd;
      } catch (err) {
        console.error('[agents-run] Failed to commit usage:', err);
      }
      reservationId = null;
    }

    try {
      await logAgentRun({
        org_id: isUuid(ctx.orgId) ? ctx.orgId : null,
        user_id: ctx.userId,
        agent_id: manifest.id,
        agent_version: manifest.version,
        provider: providerUsed,
        model: modelUsed,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        estimated_cost_usd: costUsd,
        latency_ms: latencyMs || Math.max(1, Date.now() - startedAt),
        status: 'success',
        error_code: null,
        metadata: {
          route_candidates: routes.map(r => `${r.provider}:${r.model}`),
        },
      });
    } catch (err) {
      console.error('[agents-run] Failed to log agent run:', err);
    }

    return res.status(200).json({
      success: true,
      data: outputData,
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        estimated_cost_usd: estimateCostUsd(modelUsed, usage.inputTokens, usage.outputTokens),
        latency_ms: latencyMs || Math.max(1, Date.now() - startedAt),
      },
      agent: {
        id: manifest.id,
        version: manifest.version,
        provider: providerUsed,
        model: modelUsed,
      },
    });
  } catch (error) {
    const rawMessage = (error as Error)?.message ?? 'UNKNOWN_ERROR';
    const errorCode = rawMessage.split(':')[0] || 'UNKNOWN_ERROR';
    const status = mapErrorToStatus(errorCode);

    let clientError = rawMessage;
    if (errorCode === 'AGENT_EXECUTION_FAILED') {
      const isConfigError = rawMessage.includes('not configured') || rawMessage.includes('AI_NO_PROVIDERS');
      clientError = isConfigError
        ? 'Serviço de IA não configurado no servidor. Contate o suporte.'
        : 'Problema temporário com o provedor de IA. Tente novamente em instantes.';
      console.error('[agents-run] AGENT_EXECUTION_FAILED:', rawMessage);
    }

    if (reservationId) {
      try {
        await releaseReservation(reservationId);
      } catch (releaseError) {
        console.error('[agents-run] failed to release reservation', {
          reservationId,
          message: (releaseError as Error).message,
        });
      }
    }

    if (ctx && runMeta) {
      await logAgentRun({
        org_id: isUuid(ctx.orgId) ? ctx.orgId : null,
        user_id: ctx.userId,
        agent_id: runMeta.agentId,
        agent_version: runMeta.agentVersion,
        provider: runMeta.provider,
        model: runMeta.model,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0,
        latency_ms: Math.max(1, Date.now() - startedAt),
        status: errorCode.includes('TIMEOUT') ? 'timeout' : 'error',
        error_code: errorCode,
        metadata: {},
      });
    }

    return res.status(status).json({
      success: false,
      error: clientError,
      code: errorCode,
    });
  }
}
