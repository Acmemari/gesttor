import React from 'react';
import { TrendingUp, TrendingDown, Minus, Activity, Zap, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';

export interface SentimentData {
  signal: 'bullish' | 'neutral' | 'bearish';
  score: number;
  summary: string;
  keyFactors: string[];
  trend: 'up' | 'stable' | 'down';
  trendLabel: string;
  analyzedAt: string;
  newsCount: number;
}

const SIGNAL_CONFIG = {
  bullish: {
    label: 'Otimista',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    ring: 'ring-emerald-500/20',
    gaugeColor: '#10b981',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-green-400',
    Icon: TrendingUp,
    emoji: '🟢',
  },
  neutral: {
    label: 'Neutro',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    ring: 'ring-amber-500/20',
    gaugeColor: '#f59e0b',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-yellow-400',
    Icon: Minus,
    emoji: '🟡',
  },
  bearish: {
    label: 'Pessimista',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    ring: 'ring-red-500/20',
    gaugeColor: '#ef4444',
    gradientFrom: 'from-red-500',
    gradientTo: 'to-rose-400',
    Icon: TrendingDown,
    emoji: '🔴',
  },
};

const TREND_ICON = {
  up: ArrowUpRight,
  stable: ArrowRight,
  down: ArrowDownRight,
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)} dias`;
}

// ─── Score Gauge (Arc) ────────────────────────────────────────────────────────

const ScoreGauge: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const radius = 40;
  const circumference = Math.PI * radius; // half circle
  const progress = (score / 100) * circumference;

  return (
    <div className="relative w-[100px] h-[56px]">
      <svg viewBox="0 0 100 56" className="w-full h-full">
        {/* Background arc */}
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-0.5">
        <span className="text-2xl font-black text-gray-900">{score}</span>
        <span className="text-[10px] text-gray-400 ml-0.5 mb-1">/100</span>
      </div>
    </div>
  );
};

// ─── Full Panel (inside NoticiasPecuaria) ─────────────────────────────────────

export const SentimentPanel: React.FC<{ data: SentimentData }> = ({ data }) => {
  const config = SIGNAL_CONFIG[data.signal];
  const SignalIcon = config.Icon;
  const TrendIcon = TREND_ICON[data.trend];

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-5 mb-5`}>
      <div className="flex flex-col sm:flex-row gap-5">
        {/* Left: Gauge + Signal */}
        <div className="flex flex-col items-center gap-2 sm:min-w-[120px]">
          <ScoreGauge score={data.score} color={config.gaugeColor} />
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${config.bg} border ${config.border}`}>
            <SignalIcon size={14} className={config.color} />
            <span className={`text-xs font-bold ${config.color}`}>{config.label}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <TrendIcon size={12} />
            <span>{data.trendLabel}</span>
          </div>
        </div>

        {/* Right: Summary + Factors */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={16} className={config.color} />
            <h3 className="text-sm font-bold text-gray-900">Análise do Mercado</h3>
            <span className="text-[10px] text-gray-400 ml-auto">
              {data.newsCount} notícias · {timeAgo(data.analyzedAt)}
            </span>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {data.summary}
          </p>

          {data.keyFactors.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fatores-chave</p>
              {data.keyFactors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <Zap size={11} className={`${config.color} shrink-0 mt-0.5`} />
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Mini Card (for CalculadorasDesktop) ───────────────────────────────────────

export const SentimentMiniCard: React.FC<{ data: SentimentData | null; onClick?: () => void }> = ({ data, onClick }) => {
  if (!data) return null;

  const config = SIGNAL_CONFIG[data.signal];
  const SignalIcon = config.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border ${config.border} ${config.bg} hover:shadow-sm transition-all text-left`}
    >
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} flex items-center justify-center shadow-sm`}>
        <SignalIcon size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${config.color}`}>{config.emoji} {config.label}</span>
          <span className="text-[11px] font-bold text-gray-900">{data.score}/100</span>
        </div>
        <p className="text-[11px] text-gray-500 truncate">{data.summary}</p>
      </div>
      <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(data.analyzedAt)}</span>
    </button>
  );
};
