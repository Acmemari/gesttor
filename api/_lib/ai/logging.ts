import { db, agentRuns } from '../../../src/DB/index.js';
import type { AgentRunRecord } from './types.js';

export async function logAgentRun(record: AgentRunRecord): Promise<string | null> {
  try {
    const [data] = await db
      .insert(agentRuns)
      .values({
        orgId: record.org_id,
        userId: record.user_id,
        agentId: record.agent_id,
        agentVersion: record.agent_version,
        provider: record.provider,
        model: record.model,
        inputTokens: record.input_tokens,
        outputTokens: record.output_tokens,
        totalTokens: record.total_tokens,
        estimatedCostUsd: String(record.estimated_cost_usd),
        latencyMs: record.latency_ms,
        status: record.status,
        errorCode: record.error_code ?? null,
        metadata: record.metadata ?? {},
      })
      .returning({ id: agentRuns.id });

    return data?.id ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ai.logging] failed to insert agent run', { message });
    return null;
  }
}
