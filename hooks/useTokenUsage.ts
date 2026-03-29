import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../lib/session';

export interface TokenUsageData {
  period: string;
  orgId: string;
  plan: string;
  tokensUsed: number;
  tokensReserved: number;
  costUsedUsd: number;
  tokenLimit: number;
  costLimitUsd: number;
  tokenPct: number;
  costPct: number;
}

type PlanId = 'essencial' | 'gestor' | 'pro';

const PLAN_DEFAULTS: Record<PlanId, { tokenLimit: number; costLimitUsd: number }> = {
  essencial: { tokenLimit: 500_000,    costLimitUsd: 0.75  },
  gestor:    { tokenLimit: 2_000_000,  costLimitUsd: 3.00  },
  pro:       { tokenLimit: 10_000_000, costLimitUsd: 15.00 },
};

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function useTokenUsage(plan: PlanId = 'essencial') {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setLoading(false);
          return;
        }
        const res = await fetch('/api/ai-usage?period=month', { headers });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json() as {
          ok: boolean;
          data?: { totalTokens: number; estimatedCostUsd: number };
          error?: string;
        };
        if (!cancelled) {
          if (json.ok && json.data) {
            const defaults = PLAN_DEFAULTS[plan] ?? PLAN_DEFAULTS.essencial;
            const tokensUsed = json.data.totalTokens;
            const costUsedUsd = json.data.estimatedCostUsd;
            setData({
              period: getCurrentPeriod(),
              orgId: '',
              plan,
              tokensUsed,
              tokensReserved: 0,
              costUsedUsd,
              tokenLimit: defaults.tokenLimit,
              costLimitUsd: defaults.costLimitUsd,
              tokenPct: defaults.tokenLimit > 0 ? tokensUsed / defaults.tokenLimit : 0,
              costPct: defaults.costLimitUsd > 0 ? costUsedUsd / defaults.costLimitUsd : 0,
            });
          } else {
            setError(json.error ?? 'Erro ao carregar uso de tokens');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro desconhecido');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [plan]);

  return { data, loading, error };
}
