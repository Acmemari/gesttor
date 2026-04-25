import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, ExternalLink, Globe, Youtube, Instagram, Filter, Clock, AlertCircle, Newspaper, ChevronDown, BrainCircuit, Loader2, TrendingUp, Ship, Wheat, Building2, CloudSun, Scale, Handshake, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SentimentPanel, type SentimentData } from '../components/SentimentoIndicator';

type Category =
  | 'mercado'
  | 'exportacao'
  | 'graos'
  | 'empresas'
  | 'clima'
  | 'geopolitica'
  | 'ma'
  | 'outros';

interface NewsItem {
  id: string;
  title: string;
  source: 'web' | 'youtube' | 'instagram';
  sourceLabel: string;
  url: string;
  description: string;
  imageUrl?: string;
  publishedAt?: string;
  author?: string;
  category: Category;
  priorityScore: number;
}

type SourceFilter = 'all' | 'web' | 'youtube' | 'instagram';
type CategoryFilter = 'all' | Category;

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  mercado: { label: 'Mercado', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  exportacao: { label: 'Exportação', icon: Ship, color: 'text-blue-600', bg: 'bg-blue-50' },
  graos: { label: 'Grãos', icon: Wheat, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  empresas: { label: 'Empresas', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  clima: { label: 'Clima', icon: CloudSun, color: 'text-sky-600', bg: 'bg-sky-50' },
  geopolitica: { label: 'Geopolítica', icon: Scale, color: 'text-rose-600', bg: 'bg-rose-50' },
  ma: { label: 'M&A', icon: Handshake, color: 'text-purple-600', bg: 'bg-purple-50' },
  outros: { label: 'Outros', icon: Filter, color: 'text-gray-500', bg: 'bg-gray-50' },
};

const CATEGORY_ORDER: Category[] = ['mercado', 'exportacao', 'graos', 'empresas', 'clima', 'geopolitica', 'ma', 'outros'];

const SOURCE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  web: { icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'Web' },
  youtube: { icon: Youtube, color: 'text-red-400', bg: 'bg-red-500/15', label: 'YouTube' },
  instagram: { icon: Instagram, color: 'text-pink-400', bg: 'bg-pink-500/15', label: 'Instagram' },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const SkeletonCard: React.FC = () => (
  <div className="flex gap-4 p-4 rounded-xl border border-gray-200 bg-white animate-pulse">
    <div className="w-10 h-10 rounded-lg bg-gray-200 shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-100 rounded w-full" />
      <div className="h-3 bg-gray-100 rounded w-1/2" />
    </div>
  </div>
);

const NewsCard: React.FC<{ item: NewsItem }> = ({ item }) => {
  const config = SOURCE_CONFIG[item.source] || SOURCE_CONFIG.web;
  const Icon = config.icon;
  const catConfig = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.outros;
  const CatIcon = catConfig.icon;
  const isPriority = item.priorityScore >= 70;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm transition-all duration-200"
    >
      {/* Source icon badge */}
      <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
        <Icon size={20} className={config.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <h3 className="flex-1 text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
            {item.title}
          </h3>
          {isPriority && (
            <span
              title="Fonte prioritária (dados oficiais / portal especializado)"
              className="shrink-0 mt-0.5"
            >
              <Star size={12} className="text-amber-500 fill-amber-500" />
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">{item.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${catConfig.bg} ${catConfig.color} font-medium`}
          >
            <CatIcon size={10} />
            {catConfig.label}
          </span>
          <span className={`font-medium ${config.color}`}>{config.label}</span>
          {item.author && (
            <>
              <span>·</span>
              <span className="truncate max-w-[120px]">{item.author}</span>
            </>
          )}
          {item.publishedAt && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {timeAgo(item.publishedAt)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Thumbnail (when available) */}
      {item.imageUrl && (
        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 hidden sm:block">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      {/* External link indicator */}
      <div className="self-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink size={14} className="text-gray-400" />
      </div>
    </a>
  );
};

interface NoticiasPecuariaProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const NoticiasPecuaria: React.FC<NoticiasPecuariaProps> = ({ onToast }) => {
  const { getAccessToken } = useAuth();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [errors, setErrors] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Load cached sentiment from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('gesttor:sentimento-mercado');
      if (cached) setSentiment(JSON.parse(cached));
    } catch { /* ignore */ }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setErrors([]);
    try {
      const token = await getAccessToken();
      const resp = await fetch('/api/noticias-pecuaria', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sources: ['web', 'youtube', 'instagram'],
        }),
      });

      const json = await resp.json();

      if (!json.ok) {
        throw new Error(json.error || 'Erro ao buscar notícias');
      }

      setNews(json.data.news || []);
      setLastUpdated(json.data.updatedAt);
      setErrors(json.data.errors || []);
      setHasSearched(true);

      if (json.data.news?.length > 0) {
        onToast?.(`${json.data.totalResults} notícias encontradas!`, 'success');
      } else {
        onToast?.('Nenhuma notícia encontrada nesta busca.', 'warning');
      }
    } catch (err: any) {
      console.error('[NoticiasPecuaria] Error:', err);
      setErrors([err.message || 'Erro ao buscar notícias']);
      onToast?.(err.message || 'Erro ao buscar notícias', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, onToast]);

  const handleAnalyzeSentiment = useCallback(async () => {
    if (news.length === 0) {
      onToast?.('Primeiro busque as notícias clicando em "Atualizar".', 'warning');
      return;
    }
    setIsAnalyzing(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch('/api/sentimento-mercado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          news: news.map(n => ({
            title: n.title,
            source: n.sourceLabel,
            description: n.description,
            publishedAt: n.publishedAt,
            category: n.category,
          })),
        }),
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.error || 'Erro ao analisar sentimento');

      const data: SentimentData = json.data;
      setSentiment(data);
      // Persist to localStorage for the mini card on desktop
      localStorage.setItem('gesttor:sentimento-mercado', JSON.stringify(data));
      onToast?.('Análise de sentimento concluída!', 'success');
    } catch (err: any) {
      console.error('[Sentimento] Error:', err);
      onToast?.(err.message || 'Erro ao analisar sentimento', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [news, getAccessToken, onToast]);

  const filteredNews = news.filter(n => {
    if (filter !== 'all' && n.source !== filter) return false;
    if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
    return true;
  });

  const sourceCounts = {
    all: news.length,
    web: news.filter(n => n.source === 'web').length,
    youtube: news.filter(n => n.source === 'youtube').length,
    instagram: news.filter(n => n.source === 'instagram').length,
  };

  const categoryCounts: Record<CategoryFilter, number> = {
    all: news.length,
    mercado: 0, exportacao: 0, graos: 0, empresas: 0,
    clima: 0, geopolitica: 0, ma: 0, outros: 0,
  };
  for (const n of news) categoryCounts[n.category]++;

  const visibleCategories = CATEGORY_ORDER.filter(c => categoryCounts[c] > 0);

  const filterOptions: { id: SourceFilter; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'all', label: 'Todas', icon: Filter, color: 'text-gray-600' },
    { id: 'web', label: 'Web', icon: Globe, color: 'text-blue-500' },
    { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500' },
    { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Newspaper size={22} className="text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Notícias da Pecuária</h1>
              <p className="text-xs text-gray-500">
                Mercado pecuário, preços e tendências
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {news.length > 0 && (
              <button
                onClick={handleAnalyzeSentiment}
                disabled={isAnalyzing || isLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isAnalyzing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <BrainCircuit size={16} />
                )}
                {isAnalyzing ? 'Analisando...' : 'Analisar Sentimento'}
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? 'Buscando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Atualizado {timeAgo(lastUpdated)}
              </span>
            )}
            {news.length > 0 && (
              <span>{news.length} notícias</span>
            )}
          </div>

          {/* Filter dropdown */}
          {news.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-medium transition-colors"
              >
                {React.createElement(filterOptions.find(f => f.id === filter)?.icon || Filter, { size: 12 })}
                <span>{filterOptions.find(f => f.id === filter)?.label}</span>
                <ChevronDown size={12} className={`transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showFilterDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[160px] py-1">
                    {filterOptions.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => { setFilter(opt.id); setShowFilterDropdown(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${
                          filter === opt.id ? 'font-semibold bg-gray-50' : ''
                        }`}
                      >
                        <opt.icon size={14} className={opt.color} />
                        <span className="flex-1 text-left">{opt.label}</span>
                        <span className="text-gray-400">{sourceCounts[opt.id]}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Category filter row */}
        {news.length > 0 && visibleCategories.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todas
              <span className={`${categoryFilter === 'all' ? 'text-gray-300' : 'text-gray-400'}`}>
                {categoryCounts.all}
              </span>
            </button>
            {visibleCategories.map(cat => {
              const cfg = CATEGORY_CONFIG[cat];
              const CIcon = cfg.icon;
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    active
                      ? `${cfg.bg} ${cfg.color} ring-1 ring-current`
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <CIcon size={11} />
                  {cfg.label}
                  <span className={active ? 'opacity-70' : 'text-gray-400'}>
                    {categoryCounts[cat]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <RefreshCw size={14} className="animate-spin" />
              <span>Buscando notícias em Sites, YouTube e Instagram...</span>
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty state (before first search) */}
        {!isLoading && !hasSearched && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-amber-50 flex items-center justify-center mb-6">
              <Newspaper size={36} className="text-amber-400" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">
              Notícias do Mercado Pecuário
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">
              Clique em <strong>"Atualizar"</strong> para buscar as últimas notícias sobre
              o mercado pecuário em sites, YouTube e Instagram.
            </p>
            <div className="flex items-center gap-6 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <Globe size={14} className="text-blue-400" /> Sites
              </span>
              <span className="flex items-center gap-1.5">
                <Youtube size={14} className="text-red-400" /> YouTube
              </span>
              <span className="flex items-center gap-1.5">
                <Instagram size={14} className="text-pink-400" /> Instagram
              </span>
            </div>
          </div>
        )}

        {/* Results */}
        {!isLoading && hasSearched && (
          <>
            {/* Sentiment Panel */}
            {sentiment && <SentimentPanel data={sentiment} />}
            {/* Errors */}
            {errors.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Algumas fontes não retornaram resultados:</p>
                  {errors.map((e, i) => (
                    <p key={i}>• {e}</p>
                  ))}
                </div>
              </div>
            )}

            {/* News list */}
            {filteredNews.length > 0 ? (
              <div className="space-y-2">
                {filteredNews.map(item => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 text-sm">
                {filter !== 'all' || categoryFilter !== 'all'
                  ? 'Nenhuma notícia encontrada com os filtros atuais.'
                  : 'Nenhuma notícia encontrada. Tente novamente em alguns minutos.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NoticiasPecuaria;
