import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Users, Calendar } from 'lucide-react';
import { getAuthHeaders } from '../lib/session';
import { useAuth } from '../contexts/AuthContext';

interface TokenUsage {
  total_tokens: number;
  tokens_input: number;
  tokens_output: number;
}

interface UsageStats {
  today: TokenUsage;
  thisMonth: TokenUsage;
  total: TokenUsage;
  estimatedCost: {
    today: number;
    thisMonth: number;
    total: number;
  };
}

const AgentUsageDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadUsageStats();
    } else {
      setIsLoading(false);
      setError('Acesso negado. Apenas administradores podem ver este painel.');
    }
  }, [user]);

  const loadUsageStats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const headers = await getAuthHeaders();

      const fetchPeriod = async (period: string): Promise<TokenUsage> => {
        const res = await fetch(`/api/ai-usage?period=${period}`, { headers });
        const json = await res.json() as { ok: boolean; data?: { tokensInput: number; tokensOutput: number; totalTokens: number }; error?: string };
        if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar uso');
        const d = json.data ?? { tokensInput: 0, tokensOutput: 0, totalTokens: 0 };
        return { tokens_input: d.tokensInput, tokens_output: d.tokensOutput, total_tokens: d.totalTokens };
      };

      const [today, thisMonth, total] = await Promise.all([
        fetchPeriod('today'),
        fetchPeriod('month'),
        fetchPeriod('all'),
      ]);

      // Estimar custos (usando preços médios do GPT-4 Turbo)
      // Input: $0.01/1K tokens, Output: $0.03/1K tokens
      const estimateCost = (usage: TokenUsage): number => {
        const inputCost = (usage.tokens_input / 1000) * 0.01;
        const outputCost = (usage.tokens_output / 1000) * 0.03;
        return inputCost + outputCost;
      };

      setStats({
        today,
        thisMonth,
        total,
        estimatedCost: {
          today: estimateCost(today),
          thisMonth: estimateCost(thisMonth),
          total: estimateCost(total),
        },
      });
    } catch (err: unknown) {
      console.error('Erro ao carregar estatísticas:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de uso');
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('pt-BR').format(num);
  };

  const formatCurrency = (num: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ai-subtext">Acesso negado. Apenas administradores podem ver este painel.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ai-accent mx-auto mb-4"></div>
          <p className="text-ai-subtext">Carregando estatísticas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadUsageStats}
            className="px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accent/90 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ai-subtext">Nenhum dado disponível.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-ai-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-ai-border bg-ai-surface/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-ai-accent text-white flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ai-text">Uso de Tokens IA</h2>
            <p className="text-sm text-ai-subtext">Monitoramento de consumo do agente Antonio</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Hoje */}
          <div className="bg-ai-surface rounded-lg border border-ai-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-ai-accent" />
                <h3 className="text-sm font-semibold text-ai-text uppercase">Hoje</h3>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-ai-subtext mb-1">Total de Tokens</p>
                <p className="text-2xl font-bold text-ai-text">{formatNumber(stats.today.total_tokens)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-ai-subtext">Input</p>
                  <p className="font-medium text-ai-text">{formatNumber(stats.today.tokens_input)}</p>
                </div>
                <div>
                  <p className="text-ai-subtext">Output</p>
                  <p className="font-medium text-ai-text">{formatNumber(stats.today.tokens_output)}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-ai-border">
                <p className="text-xs text-ai-subtext mb-1">Custo Estimado</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(stats.estimatedCost.today)}</p>
              </div>
            </div>
          </div>

          {/* Este Mês */}
          <div className="bg-ai-surface rounded-lg border border-ai-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-ai-accent" />
                <h3 className="text-sm font-semibold text-ai-text uppercase">Este Mês</h3>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-ai-subtext mb-1">Total de Tokens</p>
                <p className="text-2xl font-bold text-ai-text">{formatNumber(stats.thisMonth.total_tokens)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-ai-subtext">Input</p>
                  <p className="font-medium text-ai-text">{formatNumber(stats.thisMonth.tokens_input)}</p>
                </div>
                <div>
                  <p className="text-ai-subtext">Output</p>
                  <p className="font-medium text-ai-text">{formatNumber(stats.thisMonth.tokens_output)}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-ai-border">
                <p className="text-xs text-ai-subtext mb-1">Custo Estimado</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(stats.estimatedCost.thisMonth)}</p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="bg-ai-surface rounded-lg border border-ai-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-ai-accent" />
                <h3 className="text-sm font-semibold text-ai-text uppercase">Total</h3>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-ai-subtext mb-1">Total de Tokens</p>
                <p className="text-2xl font-bold text-ai-text">{formatNumber(stats.total.total_tokens)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-ai-subtext">Input</p>
                  <p className="font-medium text-ai-text">{formatNumber(stats.total.tokens_input)}</p>
                </div>
                <div>
                  <p className="text-ai-subtext">Output</p>
                  <p className="font-medium text-ai-text">{formatNumber(stats.total.tokens_output)}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-ai-border">
                <p className="text-xs text-ai-subtext mb-1">Custo Estimado</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(stats.estimatedCost.total)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <DollarSign size={20} className="text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-900 mb-1">Sobre os Custos</h4>
              <p className="text-xs text-blue-700">
                Os custos são estimados com base nos preços médios do GPT-4 Turbo (Input: $0.01/1K tokens, Output:
                $0.03/1K tokens). Os valores reais podem variar dependendo do modelo configurado no OpenAI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentUsageDashboard;
