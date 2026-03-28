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

export function useTokenUsage() {
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
        const res = await fetch('/api/token-usage', { headers });
        const json = await res.json() as { ok: boolean; data?: TokenUsageData; error?: string };
        if (!cancelled) {
          if (json.ok && json.data) {
            setData(json.data);
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
  }, []);

  return { data, loading, error };
}
