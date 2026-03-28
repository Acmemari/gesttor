import React from 'react';
import { Zap, DollarSign, AlertTriangle } from 'lucide-react';
import { useTokenUsage } from '../../hooks/useTokenUsage';

const PLAN_LABELS: Record<string, string> = {
  essencial: 'Essencial',
  gestor:    'Gestor',
  pro:       'Pro',
};

function ProgressBar({ pct, warn }: { pct: number; warn: boolean }) {
  const clamped = Math.min(pct, 1);
  return (
    <div className="w-full h-2 bg-ai-border rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${warn ? 'bg-amber-500' : 'bg-ai-accent'}`}
        style={{ width: `${(clamped * 100).toFixed(1)}%` }}
      />
    </div>
  );
}

export function TokenQuotaCard() {
  const { data, loading, error } = useTokenUsage();

  if (loading) {
    return <div className="rounded-2xl border border-ai-border p-4 animate-pulse h-36" />;
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-ai-border bg-ai-surface p-4 text-xs text-ai-subtext">
        {error ?? 'Nenhum dado de uso disponível para este período.'}
      </div>
    );
  }

  const tokenWarn = data.tokenPct >= 0.8;
  const costWarn  = data.costPct  >= 0.8;
  const planLabel = PLAN_LABELS[data.plan] ?? data.plan;

  return (
    <div className="rounded-2xl border border-ai-border bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ai-text">
          Uso de IA — {planLabel} · {data.period}
        </h4>
      </div>

      {/* Tokens */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ai-subtext flex items-center gap-1">
            <Zap size={12} /> Tokens
          </span>
          {tokenWarn && <AlertTriangle size={12} className="text-amber-500" />}
        </div>
        <ProgressBar pct={data.tokenPct} warn={tokenWarn} />
        <p className="text-xs text-ai-subtext">
          {data.tokensUsed.toLocaleString('pt-BR')} / {data.tokenLimit.toLocaleString('pt-BR')}
          {' '}({(data.tokenPct * 100).toFixed(1)}%)
        </p>
      </div>

      {/* Custo */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ai-subtext flex items-center gap-1">
            <DollarSign size={12} /> Custo USD
          </span>
          {costWarn && <AlertTriangle size={12} className="text-amber-500" />}
        </div>
        <ProgressBar pct={data.costPct} warn={costWarn} />
        <p className="text-xs text-ai-subtext">
          ${data.costUsedUsd.toFixed(4)} / ${data.costLimitUsd.toFixed(2)}
          {' '}({(data.costPct * 100).toFixed(1)}%)
        </p>
      </div>
    </div>
  );
}
