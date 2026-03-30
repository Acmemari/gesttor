import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Download, SlidersHorizontal, X } from 'lucide-react';
import DateInputBR from '../components/DateInputBR';
import { generateDesempenhoPdf } from '../lib/generateDesempenhoPdf';
import { getDesempenho } from '../lib/api/desempenhoClient';
import type { ColaboradorStats, DesempenhoData } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Semana {
  id: string;
  data_inicio: string;
  data_fim: string;
  aberta: boolean;
}

type PeriodoPreset = 'semana-atual' | 'ultima-semana' | 'mes-atual' | 'personalizado';

interface DesempenhoViewProps {
  farmId: string | null;
  semana: Semana | null;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Excelente: { bg: '#dcfce7', color: '#15803d' },
  Bom:       { bg: '#fef9c3', color: '#a16207' },
  Regular:   { bg: '#ffedd5', color: '#c2410c' },
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toIso(date: Date) {
  return date.toISOString().split('T')[0];
}

// ─── Component ────────────────────────────────────────────────────────────────

const DesempenhoView: React.FC<DesempenhoViewProps> = ({ farmId, semana, onToast }) => {
  const [preset, setPreset] = useState<PeriodoPreset>('semana-atual');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<DesempenhoData | null>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

  // Compute date range from preset
  const getRange = useCallback((): { dataInicio: string; dataFim: string } | null => {
    const today = new Date();
    if (preset === 'semana-atual') {
      if (!semana) return null;
      return { dataInicio: semana.data_inicio, dataFim: semana.data_fim };
    }
    if (preset === 'ultima-semana') {
      const mon = new Date(today);
      mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - 7);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      return { dataInicio: toIso(mon), dataFim: toIso(sun) };
    }
    if (preset === 'mes-atual') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dataInicio: toIso(first), dataFim: toIso(today) };
    }
    if (preset === 'personalizado') {
      if (!customFrom || !customTo) return null;
      return { dataInicio: customFrom, dataFim: customTo };
    }
    return null;
  }, [preset, semana, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    if (!farmId) return;
    const range = getRange();
    if (!range) return;
    setLoading(true);
    try {
      const result = await getDesempenho(farmId, range.dataInicio, range.dataFim);
      if (result.ok) {
        setData(result.data);
      } else {
        onToast?.('Erro ao carregar dados de desempenho', 'error');
      }
    } catch {
      onToast?.('Erro ao carregar dados de desempenho', 'error');
    } finally {
      setLoading(false);
    }
  }, [farmId, getRange, onToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportPdf = async () => {
    if (!data || !chartsRef.current) return;
    const range = getRange();
    setExporting(true);
    try {
      const periodoLabel = range
        ? `${fmtDate(range.dataInicio)} – ${fmtDate(range.dataFim)}`
        : '';
      await generateDesempenhoPdf(chartsRef.current, data.colaboradores, periodoLabel);
      onToast?.('PDF exportado com sucesso', 'success');
    } catch {
      onToast?.('Erro ao gerar PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  const range = getRange();
  const { colaboradores = [], totalGlobal } = data ?? { colaboradores: [], totalGlobal: { concluidas: 0, pendentes: 0, eficienciaMedia: 0 } };

  // Bar chart data
  const barData = colaboradores.map((c, i) => ({
    nome: c.nome.split(' ')[0],
    Alocadas: c.total,
    Realizadas: c.concluidas,
    color: COLORS[i % COLORS.length],
  }));

  // Pie data
  const pieData = colaboradores.map((c, i) => ({
    name: c.nome,
    value: c.eficiencia,
    color: COLORS[i % COLORS.length],
  }));

  const presetLabels: Record<PeriodoPreset, string> = {
    'semana-atual':   'Semana atual',
    'ultima-semana':  'Última semana',
    'mes-atual':      'Mês atual',
    'personalizado':  'Período personalizado',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'gsFadeIn 0.3s ease' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', letterSpacing: 1, margin: 0 }}>ANALYTICS</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '2px 0 0' }}>Painel de Desempenho</h2>
          {range && (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>
              {presetLabels[preset]} &nbsp;·&nbsp; {fmtDate(range.dataInicio)} – {fmtDate(range.dataFim)}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleExportPdf}
            disabled={exporting || !data || colaboradores.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
              fontSize: 13, fontWeight: 500, color: '#334155', cursor: 'pointer',
              opacity: (exporting || !data || colaboradores.length === 0) ? 0.5 : 1,
            }}>
            <Download size={14} />
            {exporting ? 'Gerando…' : 'Exportar PDF'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowFilter(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                border: 'none', borderRadius: 8, background: '#3b82f6',
                fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
              }}>
              <SlidersHorizontal size={14} />
              Filtrar Período
            </button>

            {/* Filter Dropdown */}
            {showFilter && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 16, minWidth: 260,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Filtrar período</span>
                  <button onClick={() => setShowFilter(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                    <X size={16} />
                  </button>
                </div>
                {(['semana-atual', 'ultima-semana', 'mes-atual', 'personalizado'] as PeriodoPreset[]).map(p => (
                  <button
                    key={p}
                    onClick={() => { setPreset(p); if (p !== 'personalizado') setShowFilter(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                      borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                      fontWeight: preset === p ? 600 : 400,
                      background: preset === p ? '#eff6ff' : 'transparent',
                      color: preset === p ? '#1d4ed8' : '#334155',
                      marginBottom: 2,
                    }}>
                    {presetLabels[p]}
                  </button>
                ))}
                {preset === 'personalizado' && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>De</label>
                      <DateInputBR value={customFrom} onChange={setCustomFrom} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Até</label>
                      <DateInputBR value={customTo} onChange={setCustomTo} />
                    </div>
                    <button
                      onClick={() => { if (customFrom && customTo) { fetchData(); setShowFilter(false); } }}
                      disabled={!customFrom || !customTo}
                      style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none', background: '#3b82f6',
                        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        opacity: (!customFrom || !customTo) ? 0.5 : 1,
                      }}>
                      Aplicar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', height: 320, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* ── Empty ─────────────────────────────────────────────────────────── */}
      {!loading && data && colaboradores.length === 0 && (
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
          padding: 48, textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📊</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>Nenhum dado encontrado</p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Não há tarefas com responsável atribuído no período selecionado.
          </p>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {!loading && colaboradores.length > 0 && (
        <div ref={chartsRef} id="desempenho-charts">
          {/* Row 1: Bar + Donut */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Bar Chart */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>Tarefas por Colaborador</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="nome" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="Alocadas" fill="#79828b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Realizadas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Donut Chart */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>Eficiência Média</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ flex: '0 0 auto' }}>
                  <PieChart width={200} height={200}>
                    <Pie
                      data={pieData}
                      cx={95}
                      cy={95}
                      innerRadius={62}
                      outerRadius={90}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <text x={100} y={88} textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: 26, fontWeight: 700, fill: '#0f172a' }}>
                      {totalGlobal.eficienciaMedia}%
                    </text>
                    <text x={100} y={112} textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: 11, fill: '#94a3b8', letterSpacing: 1 }}>
                      GLOBAL
                    </text>
                  </PieChart>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colaboradores.map((c, i) => (
                    <div key={c.pessoaId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ color: '#334155' }}>{c.nome.split(' ')[0]}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{c.eficiencia}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Ranking Table */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>Ranking de Produtividade</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['COLABORADOR', 'TOTAL', 'CONCLUÍDAS', 'PENDENTES', 'EFICIÊNCIA', 'STATUS'].map(col => (
                    <th key={col} style={{
                      textAlign: col === 'COLABORADOR' ? 'left' : 'center',
                      fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: 0.5,
                      paddingBottom: 10, borderBottom: '1px solid #f1f5f9',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((c, i) => {
                  const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.Regular;
                  return (
                    <tr key={c.pessoaId} style={{ borderBottom: i < colaboradores.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                      {/* Colaborador */}
                      <td style={{ padding: '14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          background: '#f1f5f9', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#475569',
                        }}>
                          {c.iniciais}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{c.nome}</span>
                      </td>
                      {/* Total */}
                      <td style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#334155' }}>
                        {c.total}
                      </td>
                      {/* Concluídas */}
                      <td style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                        {c.concluidas}
                      </td>
                      {/* Pendentes */}
                      <td style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#ea580c' }}>
                        {c.pendentes}
                      </td>
                      {/* Eficiência bar */}
                      <td style={{ padding: '14px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 99,
                              width: `${c.eficiencia}%`,
                              background: COLORS[i % COLORS.length],
                              transition: 'width 0.6s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155', flexShrink: 0, minWidth: 36 }}>
                            {c.eficiencia}%
                          </span>
                        </div>
                      </td>
                      {/* Status badge */}
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 99,
                          background: st.bg, color: st.color,
                          fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                        }}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesempenhoView;
