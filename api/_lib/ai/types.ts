import type { ZodTypeAny } from 'zod';

export type AIProviderName = 'gemini' | 'openai' | 'anthropic';
export type PlanId = 'essencial' | 'gestor' | 'pro';

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIRequest {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  responseFormat?: 'text' | 'json';
}

export interface AIResponse {
  content: string;
  usage: AIUsage;
  model: string;
  provider: AIProviderName;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: AIProviderName;
  complete(request: AIRequest): Promise<AIResponse>;
}

export interface AgentModelPolicy {
  provider: AIProviderName;
  model: string;
  fallback?: Array<{
    provider: AIProviderName;
    model: string;
  }>;
}

export interface AgentManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  modelPolicy: AgentModelPolicy;
  estimatedTokensPerCall: number;
  systemPrompt?: string;
}

export interface RoutedModel {
  provider: AIProviderName;
  model: string;
}

export interface AgentRunRecord {
  org_id: string;
  user_id: string | null;
  agent_id: string;
  agent_version: string;
  provider: AIProviderName;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  status: 'success' | 'error' | 'timeout';
  error_code?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TokenReservation {
  id: string;
  orgId: string;
  userId: string;
  period: string;
  reservedTokens: number;
  createdAt: string;
}
