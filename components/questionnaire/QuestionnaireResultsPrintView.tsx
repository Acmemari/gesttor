import React from 'react';
import { FileText, MapPin, Calendar, TrendingUp, Target, BarChart3, Sparkles } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { SavedQuestionnaire } from '../../types';
import { QuestionnaireResultsData } from '../../lib/questionnaireResults';

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  Excelente: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  Bom: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  Regular: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  Ruim: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200' },
  Crítico: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', border: 'border-rose-200' },
};

const COLORS = {
  groups: {
    Gente: '#3B82F6', // Blue 500
    Gestão: '#8B5CF6', // Violet 500
    Produção: '#10B981', // Emerald 500
  },
};

interface QuestionnaireResultsPrintViewProps {
  questionnaire: SavedQuestionnaire;
  results: QuestionnaireResultsData;
  insightsText: string | null;
}

export const QuestionnaireResultsPrintView: React.FC<QuestionnaireResultsPrintViewProps> = ({
  questionnaire,
  results,
  insightsText,
}) => {
  const diagnosisDate = questionnaire.created_at
    ? new Date(questionnaire.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <div className="hidden print:block min-h-screen bg-white font-sans text-slate-900 questionnaire-print-container">
      {/* Container Principal do Relatório */}
      <div className="max-w-5xl mx-auto bg-white overflow-hidden shadow-none border-0 p-8 print:p-8">
        {/* Header Profissional */}
        <header className="relative bg-slate-900 text-white p-8 sm:p-12 overflow-hidden rounded-2xl mb-8 print:break-inside-avoid">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400 font-bold tracking-widest uppercase text-xs">
                <FileText size={14} />
                Diagnóstico de Alta Performance
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-2">Gesttor</h1>
              <div className="flex flex-wrap gap-5 text-slate-400 text-sm">
                <span className="flex items-center gap-1.5">
                  <MapPin size={16} /> {questionnaire.farm_name || 'Fazenda não identificada'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={16} /> {diagnosisDate}
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <TrendingUp size={16} /> {results.totalQuestions} Pontos Analisados
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-3xl min-w-[200px]">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">
                Score Global
              </span>
              <div className="flex items-baseline">
                <span
                  className={`text-6xl font-black leading-none ${
                    results.finalScore >= 80
                      ? 'text-emerald-400'
                      : results.finalScore >= 60
                        ? 'text-yellow-400'
                        : 'text-rose-400'
                  }`}
                >
                  {results.finalScore}
                </span>
                <span className="text-2xl ml-0.5 text-slate-500">%</span>
              </div>
            </div>
          </div>
        </header>

        {/* Corpo do Relatório */}
        <div className="space-y-12">
          {/* Cards de Resumo */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 print:break-inside-avoid">
            {(['Gente', 'Gestão', 'Produção'] as const).map(groupName => {
              const g = results.byGroup[groupName];
              if (!g) return null;
              const color = COLORS.groups[groupName];

              return (
                <div key={groupName} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-8 rounded-full" style={{ backgroundColor: color }}></div>
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{groupName}</h3>
                    </div>
                    <span className="text-2xl font-bold text-slate-800">{g.score}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${g.score}%`, backgroundColor: color }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-3 font-medium">{g.categories.length} categorias analisadas</p>
                </div>
              );
            })}
          </section>

          {/* Seção de Gráficos */}
          <section className="space-y-6 print:break-inside-avoid">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-slate-800">Equilíbrio e Performance</h2>
              <div className="flex-grow h-px bg-slate-100"></div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              {/* Radar: Equilíbrio Operacional */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-slate-100 text-slate-600">
                    <Target size={16} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-600">Equilíbrio dos Pilares</h3>
                </div>
                <div className="h-[350px] w-full border border-slate-100 rounded-xl bg-slate-50/30 p-4 relative">
                  {/* Background Decoration */}
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-transparent opacity-50 rounded-xl pointer-events-none"></div>

                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={results.radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                      <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        fill="#4f46e5"
                        fillOpacity={0.25}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Radar: Performance Detalhada */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-slate-100 text-slate-600">
                    <TrendingUp size={16} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-600">Performance Detalhada</h3>
                </div>
                <div className="h-[350px] w-full border border-slate-100 rounded-xl bg-slate-50/30 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      data={[...results.byCategory].sort((a, b) => a.group.localeCompare(b.group))}
                      margin={{ top: 20, right: 30, bottom: 20, left: 30 }}
                    >
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis
                        dataKey="category"
                        tick={props => {
                          const { x, y, payload } = props;
                          return (
                            <text
                              x={x}
                              y={y}
                              textAnchor={Number(x) > 200 ? 'start' : 'end'}
                              fill="#64748b"
                              fontSize={9}
                              fontFamily="Inter"
                              fontWeight={500}
                            >
                              {String(payload.value).length > 18
                                ? `${String(payload.value).slice(0, 18)}...`
                                : payload.value}
                            </text>
                          );
                        }}
                      />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        fill="#0ea5e9"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {/* AI Insights Section */}
          {insightsText && (
            <section className="bg-indigo-50/40 rounded-2xl border border-indigo-100 p-8 print:break-inside-avoid">
              <div className="flex items-start gap-5">
                <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600 shadow-sm shrink-0">
                  <Sparkles size={24} />
                </div>
                <div className="space-y-4 w-full">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Análise Inteligente e Recomendações</h3>
                    <p className="text-sm text-slate-500">Consultoria automática baseada nos indicadores coletados</p>
                  </div>
                  <div className="prose prose-sm prose-slate prose-headings:font-semibold prose-a:text-indigo-600 max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                    {insightsText}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Tabela de Detalhes */}
          <section className="space-y-6 print:break-inside-avoid">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-800">Detalhamento das Categorias</h2>
              <div className="flex-grow h-px bg-slate-100"></div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Grupo</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                      Score
                    </th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                      Avaliação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.byCategory.map((item, idx) => {
                    const style = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.Crítico;
                    return (
                      <tr key={`${item.category}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-1 rounded border ${COLORS.groups[item.group as keyof typeof COLORS.groups] ? `bg-opacity-10 text-opacity-100` : 'bg-gray-100 text-gray-600'}`}
                            style={{
                              backgroundColor: `${COLORS.groups[item.group as keyof typeof COLORS.groups]}15`,
                              color: COLORS.groups[item.group as keyof typeof COLORS.groups],
                              borderColor: `${COLORS.groups[item.group as keyof typeof COLORS.groups]}30`,
                            }}
                          >
                            {item.group.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-700">{item.category}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-bold text-slate-800">{item.score}%</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`text-[11px] font-bold ${style.text}`}>{item.status}</span>
                            <div className={`w-2 h-2 rounded-full ${style.dot}`}></div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-12 p-8 border-t border-slate-100 flex flex-col sm:row justify-between items-center gap-4 text-slate-400 text-xs font-medium print:break-inside-avoid">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-slate-800 rounded flex items-center justify-center text-white font-bold text-[10px]">
              P
            </div>
            <span>Gesttor Inteligência Animal &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="italic text-slate-300">
            Documento gerado eletronicamente para fins de consultoria técnica.
          </div>
        </footer>
      </div>
    </div>
  );
};
