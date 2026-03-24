import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  AlertTriangle,
  FolderOpen,
  Calendar,
  CheckSquare,
  Package,
  Clock,
  Target,
  FileDown,
  ChevronRight,
  CheckCircle2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyst } from '../contexts/AnalystContext';
import { useClient } from '../contexts/ClientContext';
import { fetchProjects, type ProjectRow } from '../lib/projects';
import { fetchDeliveries, type DeliveryRow } from '../lib/deliveries';
import { fetchInitiativesWithTeams, type InitiativeWithTeam } from '../lib/initiatives';
import { generateProjectStructurePdf, generateProjectStructurePdfAsBase64 } from '../lib/generateProjectStructurePdf';
import { saveReportPdf } from '../lib/scenarios';
import { getAuthHeaders } from '../lib/session';

const formatDate = (d: string | null) => {
  if (!d) return '—';
  try {
    const date = new Date(`${d}T00:00:00`);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
};

const getDurationLabel = (startDate: string | null, endDate: string | null) => {
  if (!startDate || !endDate) return 'Prazo em definição';
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 'Prazo em definição';
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
  if (diffDays < 30) return `${diffDays} dias previstos`;
  const months = Math.round((diffDays / 30) * 10) / 10;
  return `${months.toLocaleString('pt-BR')} meses previstos`;
};

const getInitials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
};

const computeSourceHash = (d: DeliveryRow): string => {
  const raw = [d.name, d.description ?? '', d.transformations_achievements ?? ''].join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return h.toString(36);
};

interface ProjectStructureReportProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const ProjectStructureReport: React.FC<ProjectStructureReportProps> = ({ onToast }) => {
  const { user, getAccessToken } = useAuth();
  const { selectedAnalyst } = useAnalyst();
  const { selectedClient } = useClient();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeWithTeam[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'deliveries'>('overview');
  const [expandedDeliveryIds, setExpandedDeliveryIds] = useState<Set<string>>(new Set());
  const [deliverySummaries, setDeliverySummaries] = useState<Record<string, string>>({});
  const [deliverySummaryLoading, setDeliverySummaryLoading] = useState<Set<string>>(new Set());
  const [deliverySummaryErrors, setDeliverySummaryErrors] = useState<Record<string, string>>({});
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [pendingScrollDeliveryId, setPendingScrollDeliveryId] = useState<string | null>(null);
  const deliveryItemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleDelivery = useCallback((id: string) => {
    setExpandedDeliveryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openDeliveryDetail = useCallback((deliveryId: string) => {
    setActiveTab('deliveries');
    setExpandedDeliveryIds(prev => {
      if (prev.has(deliveryId)) return prev;
      const next = new Set(prev);
      next.add(deliveryId);
      return next;
    });
    setPendingScrollDeliveryId(deliveryId);
  }, []);

  const handleSaveSummary = useCallback(
    async (delivery: DeliveryRow) => {
      const trimmed = editDraft.trim();
      if (!trimmed) return;
      const headers = await getAuthHeaders();
      const upsertRes = await fetch('/api/delivery-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ deliveryId: delivery.id, summary: trimmed, sourceHash: computeSourceHash(delivery) }),
      });
      const upsertJson = await upsertRes.json() as { ok: boolean; error?: string };
      if (!upsertJson.ok) {
        console.error('[handleSaveSummary]', upsertJson.error);
        onToast?.('Erro ao salvar resumo.', 'error');
        return;
      }
      setDeliverySummaries(prev => ({ ...prev, [delivery.id]: trimmed }));
      setEditingDeliveryId(null);
      onToast?.('Resumo salvo.', 'success');
    },
    [editDraft, onToast],
  );

  const isAdmin = user?.role === 'admin';
  const effectiveUserId = useMemo(
    () => (isAdmin && selectedAnalyst ? selectedAnalyst.id : user?.id),
    [isAdmin, selectedAnalyst, user?.id],
  );

  const clientFilter = useMemo(
    () => (selectedClient?.id ? { organizationId: selectedClient.id } : undefined),
    [selectedClient?.id],
  );

  const loadData = useCallback(async () => {
    if (!effectiveUserId) {
      setProjects([]);
      setDeliveries([]);
      setInitiatives([]);
      setSelectedProjectId('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [projectRows, deliveryRows, initiativeRows] = await Promise.all([
        fetchProjects(effectiveUserId, clientFilter),
        fetchDeliveries(effectiveUserId, clientFilter),
        fetchInitiativesWithTeams(effectiveUserId, clientFilter),
      ]);
      setProjects(projectRows);
      setDeliveries(deliveryRows);
      setInitiatives(initiativeRows);
      setSelectedProjectId(prev => {
        if (prev && projectRows.some(p => p.id === prev)) return prev;
        return projectRows[0]?.id || '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados do relatório.');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, clientFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const projectDeliveries = useMemo(() => {
    if (!selectedProject) return [];
    return deliveries
      .filter(d => d.project_id === selectedProject.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR'));
  }, [deliveries, selectedProject]);

  const initiativesByDelivery = useMemo(() => {
    const map = new Map<string, InitiativeWithTeam[]>();
    for (const initiative of initiatives) {
      if (!initiative.delivery_id) continue;
      const current = map.get(initiative.delivery_id) || [];
      current.push(initiative);
      map.set(initiative.delivery_id, current);
    }
    for (const [deliveryId, list] of map.entries()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      map.set(deliveryId, list);
    }
    return map;
  }, [initiatives]);

  const initiativesByDeliveryIdRecord = useMemo(
    () => Object.fromEntries(initiativesByDelivery),
    [initiativesByDelivery],
  );

  const handleGeneratePdf = useCallback(async () => {
    if (!selectedProject) return;
    setPdfError(null);
    setIsGeneratingPdf(true);
    try {
      const pdfPayload = {
        project: selectedProject,
        deliveries: projectDeliveries,
        initiativesByDeliveryId: initiativesByDeliveryIdRecord,
        userName: user?.email ?? user?.full_name ?? undefined,
      };
      generateProjectStructurePdf(pdfPayload);

      if (user?.id) {
        try {
          const base64 = generateProjectStructurePdfAsBase64(pdfPayload);
          const reportName = `Estrutura - ${selectedProject.name} - ${new Date().toLocaleDateString('pt-BR')}`;
          await saveReportPdf(user.id, reportName, base64, 'project_structure_pdf', {
            organizationId: selectedClient?.id ?? null,
          });
        } catch (saveErr) {
          console.error('Erro ao salvar PDF em Meus Salvos:', saveErr);
        }
      }

      onToast?.('PDF gerado com sucesso.', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível gerar o PDF.';
      setPdfError(msg);
      onToast?.(msg, 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [
    selectedProject,
    projectDeliveries,
    initiativesByDeliveryIdRecord,
    user?.id,
    user?.email,
    user?.full_name,
    selectedClient?.id,
    onToast,
  ]);

  const summaryRunRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ids = projectDeliveries
      .map(d => d.id)
      .sort()
      .join(',');
    const runKey = `${selectedProjectId}::${ids}`;
    if (summaryRunRef.current === runKey) return;
    summaryRunRef.current = runKey;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDeliverySummaries({});
    setDeliverySummaryLoading(new Set());
    setDeliverySummaryErrors({});

    if (!projectDeliveries.length) return;

    const deliveryIds = projectDeliveries.map(d => d.id);
    const hashMap: Record<string, string> = {};
    projectDeliveries.forEach(d => {
      hashMap[d.id] = computeSourceHash(d);
    });

    const generateOne = async (
      d: DeliveryRow,
      fnUrl: string,
      accessToken: string,
      signal: AbortSignal,
    ) => {
      try {
        const res = await fetch(fnUrl, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: d.name,
            description: d.description ?? '',
            transformations_achievements: d.transformations_achievements ?? '',
          }),
        });

        if (signal.aborted) return;
        if (!res.ok) throw new Error('Erro ao gerar resumo.');
        const json = await res.json();
        const summary = typeof json?.summary === 'string' ? json.summary.trim() : '';
        if (!summary) throw new Error('Resumo vazio.');

        const hdr = await getAuthHeaders();
        await fetch('/api/delivery-summaries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...hdr },
          body: JSON.stringify({ deliveryId: d.id, summary, sourceHash: hashMap[d.id] }),
        });

        if (!signal.aborted) {
          setDeliverySummaries(prev => ({ ...prev, [d.id]: summary }));
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setDeliverySummaryErrors(prev => ({ ...prev, [d.id]: 'Resumo indisponível.' }));
      } finally {
        if (!signal.aborted) {
          setDeliverySummaryLoading(prev => {
            const next = new Set(prev);
            next.delete(d.id);
            return next;
          });
        }
      }
    };

    const run = async () => {
      try {
        const hdrs = await getAuthHeaders();
        const savedRes = await fetch(`/api/delivery-summaries?deliveryIds=${encodeURIComponent(deliveryIds.join(','))}`, { headers: hdrs });
        if (controller.signal.aborted) return;
        const savedJson = await savedRes.json() as { ok: boolean; data?: Array<{ deliveryId: string; summary: string; sourceHash: string }>; error?: string };
        if (!savedJson.ok) {
          console.error('[summaries] Erro ao buscar cache:', savedJson.error);
        }

        const savedMap = new Map<string, { summary: string; source_hash: string }>();
        (savedJson.data ?? []).forEach((r) => {
          savedMap.set(r.deliveryId, { summary: r.summary, source_hash: r.sourceHash });
        });

        const cached: Record<string, string> = {};
        const toGenerate: DeliveryRow[] = [];

        projectDeliveries.forEach(d => {
          const existing = savedMap.get(d.id);
          if (existing && existing.source_hash === hashMap[d.id]) {
            cached[d.id] = existing.summary;
          } else {
            toGenerate.push(d);
          }
        });

        if (Object.keys(cached).length) {
          setDeliverySummaries(cached);
        }

        if (!toGenerate.length) return;

        setDeliverySummaryLoading(new Set(toGenerate.map(d => d.id)));

        const accessToken = await getAccessToken();
        if (!accessToken) {
          const errMap: Record<string, string> = {};
          toGenerate.forEach(d => {
            errMap[d.id] = 'Sessão expirada.';
          });
          setDeliverySummaryErrors(errMap);
          setDeliverySummaryLoading(new Set());
          return;
        }

        const fnUrl = '/api/delivery-summary';
        const CONCURRENCY = 3;

        for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
          if (controller.signal.aborted) return;
          const batch = toGenerate.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            batch.map(d => generateOne(d, fnUrl, accessToken || '', controller.signal)),
          );
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('[summaries] Erro inesperado:', err);
        // Set error state for ALL deliveries so the UI doesn't stay stuck on "Resumo em breve."
        const errMap: Record<string, string> = {};
        projectDeliveries.forEach(d => {
          if (!deliverySummaries[d.id]) {
            errMap[d.id] = 'Resumo indisponível.';
          }
        });
        setDeliverySummaryErrors(prev => ({ ...prev, ...errMap }));
        setDeliverySummaryLoading(new Set());
      }
    };

    run();

    return () => {
      controller.abort();
      summaryRunRef.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDeliveries, selectedProjectId]);

  useEffect(() => {
    if (activeTab !== 'deliveries' || !pendingScrollDeliveryId) return;
    const targetNode = deliveryItemRefs.current[pendingScrollDeliveryId];
    if (!targetNode) return;

    const rafId = window.requestAnimationFrame(() => {
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollDeliveryId(null);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeTab, pendingScrollDeliveryId, projectDeliveries]);

  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-0 items-center justify-center">
        <Loader2 size={40} className="animate-spin text-ai-accent" />
        <p className="text-sm text-ai-subtext mt-3">Carregando relatório de planejamento...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full min-h-0 items-center justify-center text-red-500">
        <p className="text-sm">{error}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 px-4 py-2 rounded-lg bg-ai-accent text-white text-sm hover:opacity-90"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-auto">
        <div className="p-4 md:p-6">
          <nav className="text-xs text-ai-subtext uppercase tracking-widest mb-0.5">
            Gestão do Projeto &gt; Estrutura
          </nav>
          <h1 className="text-xl font-bold text-ai-text tracking-tight">Estrutura do Projeto</h1>
          <div className="bg-ai-surface/50 border border-ai-border rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[280px] mt-6">
            <FolderOpen size={56} className="text-ai-subtext/40 mb-4" />
            <h2 className="text-lg font-semibold text-ai-text mb-2">Nenhum projeto cadastrado</h2>
            <p className="text-ai-subtext max-w-sm">
              Cadastre um projeto em Projeto e Entregas para gerar um relatório de planejamento.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div className="flex flex-col h-full min-h-0 items-center justify-center">
        <p className="text-sm text-ai-subtext">Selecione um projeto para visualizar o relatório.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white">
      <div className="p-4 md:p-6 space-y-5">
        {isAdmin && !selectedAnalyst && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800">
              Selecione um <strong>Analista</strong> no cabeçalho para visualizar a estrutura.
            </p>
          </div>
        )}

        {/* Header: seletor, nome do projeto, branding, PDF */}
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <select
              value={selectedProject.id}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="mb-2 block w-full max-w-xs px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-900 text-sm"
              aria-label="Selecionar projeto"
            >
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{selectedProject.name}</h1>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mt-1">Gesttor</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-ai-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Salvar e imprimir relatório em PDF"
              aria-label="Salvar e imprimir PDF"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <FileDown size={13} />
                  Salvar/Imprimir PDF
                </>
              )}
            </button>
          </div>
        </header>

        {pdfError && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            {pdfError}
            <button type="button" onClick={() => setPdfError(null)} className="ml-auto text-red-600 hover:underline">
              Fechar
            </button>
          </div>
        )}

        {/* Seção de Impacto: Conquistas acima, Evidências abaixo */}
        <section className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-12 h-12 flex items-center justify-center [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] bg-slate-800">
                <Target size={24} className="text-slate-300" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white mb-2">Conquistas Esperadas</h2>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {selectedProject.transformations_achievements?.trim() || 'Não informado.'}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-sm bg-slate-100 rotate-45 overflow-hidden">
                <CheckSquare size={20} className="text-slate-600 -rotate-45" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">Evidências de Sucesso</h2>
                {selectedProject.success_evidence.length === 0 ? (
                  <p className="text-sm text-slate-600">Nenhuma evidência cadastrada.</p>
                ) : (
                  <ol className="list-decimal pl-5 space-y-1 text-slate-600 text-sm">
                    {selectedProject.success_evidence.map((item, idx) => (
                      <li key={`${selectedProject.id}-evidence-${idx}`} className="leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 3 cards de métricas */}
        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center gap-3">
            <div className="rounded-full bg-indigo-50 text-indigo-600 p-2">
              <Calendar size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Período</p>
              <p className="text-sm font-medium text-slate-800">
                {formatDate(selectedProject.start_date)} — {formatDate(selectedProject.end_date)}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center gap-3">
            <div className="rounded-full bg-emerald-50 text-emerald-600 p-2">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Duração</p>
              <p className="text-sm font-medium text-slate-800">
                {getDurationLabel(selectedProject.start_date, selectedProject.end_date)}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center gap-3">
            <div className="rounded-full bg-slate-100 text-slate-600 p-2">
              <Package size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Total de Entregas</p>
              <p className="text-sm font-medium text-slate-800">{projectDeliveries.length}</p>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div>
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                activeTab === 'overview'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Visão Geral
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('deliveries')}
              className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                activeTab === 'deliveries'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Detalhamento
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="pt-5 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Detalhamento</h3>
                {projectDeliveries.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma entrega vinculada.</p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {projectDeliveries.map((d, index) => {
                      const summary = deliverySummaries[d.id];
                      const isLoading = deliverySummaryLoading.has(d.id);
                      const errorMsg = deliverySummaryErrors[d.id];
                      const isEditing = editingDeliveryId === d.id;
                      const canEdit = !isLoading && (!!summary || !!errorMsg);
                      return (
                        <div
                          key={d.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Abrir detalhamento da entrega ${d.name}`}
                          onClick={event => {
                            const target = event.target as HTMLElement;
                            if (target.closest('button,textarea,input,a')) return;
                            openDeliveryDetail(d.id);
                          }}
                          onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            openDeliveryDetail(d.id);
                          }}
                          className="group rounded-lg border border-slate-100 bg-slate-50/50 p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1 transition-colors"
                        >
                          <span
                            className="rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm w-8 h-8 flex items-center justify-center shrink-0"
                            aria-hidden
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-baseline gap-2">
                              <span className="font-medium text-slate-800">{d.name}</span>
                              <span className="text-xs text-slate-400 shrink-0">{formatDate(d.due_date ?? null)}</span>
                            </div>
                            <div className="mt-2 text-sm text-slate-600">
                              {isEditing ? (
                                <>
                                  <textarea
                                    value={editDraft}
                                    onChange={e => setEditDraft(e.target.value)}
                                    rows={2}
                                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-800 text-sm resize-none"
                                    placeholder="Editar resumo…"
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-2 mt-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveSummary(d)}
                                      disabled={!editDraft.trim()}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Check size={14} />
                                      Salvar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingDeliveryId(null);
                                        setEditDraft('');
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50"
                                    >
                                      <X size={14} />
                                      Cancelar
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    {isLoading && (
                                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                                        <Loader2 size={14} className="animate-spin shrink-0" />
                                        Gerando resumo…
                                      </span>
                                    )}
                                    {!isLoading && summary && (
                                      <span className="block break-words">{summary.replace(/\s*\n+\s*/g, ' ')}</span>
                                    )}
                                    {!isLoading && errorMsg && (
                                      <span className="text-slate-400 italic">{errorMsg}</span>
                                    )}
                                    {!isLoading && !summary && !errorMsg && (
                                      <span className="text-slate-400 italic">Resumo em breve.</span>
                                    )}
                                  </div>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingDeliveryId(d.id);
                                        setEditDraft(summary || '');
                                      }}
                                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                      title="Editar resumo"
                                      aria-label="Editar resumo"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Stakeholders</h3>
                {selectedProject.stakeholder_matrix.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum stakeholder cadastrado.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedProject.stakeholder_matrix.map((row, idx) => (
                      <div
                        key={`${selectedProject.id}-stakeholder-${idx}`}
                        className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                      >
                        <div className="rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm w-9 h-9 flex items-center justify-center shrink-0">
                          {getInitials(row.name || '')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {row.name || 'Stakeholder não informado'}
                          </p>
                          <p className="text-xs text-slate-500">{row.activity || 'Atividade não informada'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'deliveries' && (
            <div className="pt-5">
              {projectDeliveries.length === 0 ? (
                <p className="text-sm text-slate-500">Este projeto ainda não possui entregas vinculadas.</p>
              ) : (
                <div className="space-y-2">
                  {projectDeliveries.map(delivery => {
                    const initiativesList = initiativesByDelivery.get(delivery.id) || [];
                    const isExpanded = expandedDeliveryIds.has(delivery.id);
                    return (
                      <div
                        key={delivery.id}
                        ref={node => {
                          deliveryItemRefs.current[delivery.id] = node;
                        }}
                        className="rounded-lg border border-slate-100 bg-white overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleDelivery(delivery.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/50 transition-colors"
                        >
                          <ChevronRight
                            size={18}
                            className={`text-slate-500 shrink-0 transition-transform duration-200 ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          />
                          <span className="font-semibold text-slate-800 flex-1 min-w-0">{delivery.name}</span>
                          <span className="text-xs text-slate-400 shrink-0">
                            {formatDate(delivery.due_date ?? null)}
                          </span>
                          <span className="rounded-full bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5">
                            {initiativesList.length} atividade(s)
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/30">
                            {delivery.description?.trim() && (
                              <p className="text-sm text-slate-600 whitespace-pre-wrap mb-3">{delivery.description}</p>
                            )}
                            {initiativesList.length === 0 ? (
                              <p className="text-sm text-slate-500">Nenhuma atividade vinculada.</p>
                            ) : (
                              <div className="relative pl-6 border-l-2 border-indigo-200 space-y-4">
                                {initiativesList.map(initiative => {
                                  const milestones = initiative.milestones || [];
                                  const totalM = milestones.length;
                                  const completedM = milestones.filter(m => m.completed).length;
                                  const pct = totalM > 0 ? Math.round((completedM / totalM) * 100) : 0;
                                  return (
                                    <div key={initiative.id} className="relative">
                                      <div
                                        className={`absolute -left-6 top-2 w-3 h-3 rounded-full border-2 border-white ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                      />
                                      <div className="pb-2">
                                        <p className="font-medium text-slate-800">{initiative.name}</p>
                                        {initiative.description?.trim() && (
                                          <p className="text-sm text-slate-500 mt-0.5">{initiative.description}</p>
                                        )}
                                        <p className="text-xs text-slate-400 mt-1">
                                          {formatDate(initiative.start_date)} — {formatDate(initiative.end_date)}
                                        </p>
                                        {(initiative.leader || initiative.progress > 0) && (
                                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            {initiative.leader && (
                                              <span>
                                                Lider: <strong className="text-slate-700">{initiative.leader}</strong>
                                              </span>
                                            )}
                                            {initiative.progress > 0 && (
                                              <span
                                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                                  initiative.progress === 100
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'bg-indigo-50 text-indigo-700'
                                                }`}
                                              >
                                                {initiative.progress}%
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {initiative.team && initiative.team.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {initiative.team.map((member, idx) => (
                                              <span
                                                key={`${initiative.id}-team-${idx}`}
                                                title={`${member.name} - ${member.role}`}
                                                className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold flex items-center justify-center"
                                              >
                                                {getInitials(member.name)}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      {milestones.length > 0 && (
                                        <div className="mt-2 flex items-center gap-2">
                                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                            <div
                                              className="h-full rounded-full bg-indigo-500"
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <span className="text-xs text-slate-500">{pct}%</span>
                                          {pct === 100 && (
                                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                          )}
                                        </div>
                                      )}
                                      {milestones.length > 0 && (
                                        <div className="mt-3 space-y-1.5 pl-2">
                                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            Marcos
                                          </p>
                                          {milestones.map(m => (
                                            <div key={m.id} className="flex items-center gap-2 text-xs text-slate-600">
                                              {m.completed ? (
                                                <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                              ) : (
                                                <div className="w-3 h-3 rounded-full border-2 border-slate-300 shrink-0" />
                                              )}
                                              <span className={m.completed ? 'line-through text-slate-400' : ''}>
                                                {m.title}
                                              </span>
                                              {m.due_date && (
                                                <span className="text-slate-400 ml-auto shrink-0">
                                                  {formatDate(m.due_date)}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectStructureReport;
