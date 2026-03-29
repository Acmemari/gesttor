import React, { useState, useEffect, useCallback } from 'react';
import {
  listTranscricoesByFarm,
  deleteTranscricaoApi,
  updateTranscricaoProcessedResult,
  type SemanaTranscricaoRow,
  type TranscricaoProcResult,
} from '../lib/api/semanaTranscricoesClient';
import { storageGetSignedUrl, storageRemove } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultTab = 'resumo' | 'decisoes' | 'tarefas' | 'ata' | 'riscos' | 'incertezas';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TranscricoesViewProps {
  farmId: string | null;
  semana: { id: string; numero: number; data_inicio: string; modo: 'ano' | 'safra' } | null;
  organizationId: string | null;
  refreshKey?: number;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', 'Fira Mono', monospace";

const FILE_TYPE_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pdf:  { label: 'PDF',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  docx: { label: 'DOCX', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  doc:  { label: 'DOC',  color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  md:   { label: 'MD',   color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  txt:  { label: 'TXT',  color: '#475569', bg: '#F8FAFC', border: '#E2E8F0' },
  rtf:  { label: 'RTF',  color: '#475569', bg: '#F8FAFC', border: '#E2E8F0' },
  odt:  { label: 'ODT',  color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  audio: { label: 'ÁUDIO', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
};

const PT_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

const PRIORITY_MAP: Record<string, { label: string; color: string; bg: string }> = {
  alta:  { label: 'Alta',  color: '#DC2626', bg: '#FEF2F2' },
  media: { label: 'Média', color: '#D97706', bg: '#FFFBEB' },
  baixa: { label: 'Baixa', color: '#059669', bg: '#ECFDF5' },
};

const TAB_LIST: { key: ResultTab; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'decisoes', label: 'Decisões' },
  { key: 'tarefas', label: 'Tarefas' },
  { key: 'ata', label: 'Ata' },
  { key: 'riscos', label: 'Riscos' },
  { key: 'incertezas', label: 'Incertezas' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileTypeBadge(row: SemanaTranscricaoRow) {
  if (row.tipo === 'audio') return FILE_TYPE_MAP.audio;
  const ext = row.originalName.split('.').pop()?.toLowerCase() ?? '';
  return FILE_TYPE_MAP[ext] ?? { label: ext.toUpperCase() || 'FILE', color: '#475569', bg: '#F8FAFC', border: '#E2E8F0' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getDate().toString().padStart(2, '0')} ${PT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Normaliza tanto camelCase (Drizzle) quanto snake_case
function normalizeRow(row: Record<string, unknown>): SemanaTranscricaoRow {
  return {
    id: String(row.id ?? ''),
    semanaId: String(row.semanaId ?? row.semana_id ?? ''),
    semanaNumero: row.semanaNumero != null ? Number(row.semanaNumero) : row.semana_numero != null ? Number(row.semana_numero) : null,
    farmId: String(row.farmId ?? row.farm_id ?? ''),
    organizationId: String(row.organizationId ?? row.organization_id ?? ''),
    uploadedBy: (row.uploadedBy ?? row.uploaded_by ?? null) as string | null,
    fileName: String(row.fileName ?? row.file_name ?? ''),
    originalName: String(row.originalName ?? row.original_name ?? ''),
    fileType: String(row.fileType ?? row.file_type ?? ''),
    fileSize: Number(row.fileSize ?? row.file_size ?? 0),
    storagePath: String(row.storagePath ?? row.storage_path ?? ''),
    descricao: (row.descricao ?? null) as string | null,
    texto: (row.texto ?? null) as string | null,
    processedResult: (row.processedResult ?? row.processed_result ?? null) as TranscricaoProcResult | null,
    processedAt: (row.processedAt ?? row.processed_at ?? null) as string | null,
    tipo: (row.tipo ?? 'manual') as 'audio' | 'manual',
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  };
}

function buildResultMarkdown(result: TranscricaoProcResult): string {
  const lines: string[] = [];

  lines.push('# Ata de Reunião Processada');
  lines.push('');

  if (result.presentesConfirmados.length > 0) {
    lines.push('## Presentes Confirmados');
    result.presentesConfirmados.forEach(p => lines.push(`- ${p}`));
    lines.push('');
  }

  if (result.citados.length > 0) {
    lines.push('## Citados (não presentes)');
    result.citados.forEach(p => lines.push(`- ${p}`));
    lines.push('');
  }

  lines.push('## Resumo Executivo');
  lines.push(result.summary);
  lines.push('');

  if (result.decisions.length > 0) {
    lines.push('## Decisões');
    result.decisions.forEach((d, i) => {
      lines.push(`### ${i + 1}. ${d.decision}`);
      if (d.rationale) lines.push(`- **Por quê:** ${d.rationale}`);
      if (d.descartado) lines.push(`- **Descartado:** ${d.descartado}`);
      if (d.assignee) lines.push(`- **Responsável:** ${d.assignee}`);
      if (d.impact) lines.push(`- **Impacto:** ${d.impact}`);
      lines.push('');
    });
  }

  if (result.tasks.length > 0) {
    lines.push('## Tarefas');
    result.tasks.forEach((t, i) => {
      lines.push(`### ${i + 1}. ${t.title}`);
      lines.push(`- ${t.description}`);
      if (t.contexto) lines.push(`- **Contexto:** ${t.contexto}`);
      if (t.assignee) lines.push(`- **Responsável:** ${t.assignee}`);
      if (t.priority) lines.push(`- **Prioridade:** ${t.priority}`);
      if (t.dueDate) lines.push(`- **Prazo:** ${t.dueDate}`);
      lines.push('');
    });
  }

  if (result.minutes) {
    lines.push('## Ata Completa');
    lines.push(result.minutes);
    lines.push('');
  }

  if (result.riscosBlockers.length > 0) {
    lines.push('## Riscos e Bloqueios');
    result.riscosBlockers.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }

  if (result.estacionamento.length > 0) {
    lines.push('## Itens de Estacionamento');
    result.estacionamento.forEach(e => lines.push(`- ${e}`));
    lines.push('');
  }

  if (result.incertezas.length > 0) {
    lines.push('## Termos e Referências a Verificar');
    result.incertezas.forEach(inc => lines.push(`- ${inc}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────────

const TranscricoesView: React.FC<TranscricoesViewProps> = ({
  farmId,
  refreshKey,
  onToast,
}) => {
  const { getAccessToken } = useAuth();

  const [rows, setRows] = useState<SemanaTranscricaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Processing state
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processResult, setProcessResult] = useState<TranscricaoProcResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultSourceRow, setResultSourceRow] = useState<SemanaTranscricaoRow | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('resumo');
  const [resultCopied, setResultCopied] = useState(false);

  // Edit / save state
  const [editMode, setEditMode] = useState(false);
  const [editResult, setEditResult] = useState<TranscricaoProcResult | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  const load = useCallback(async () => {
    if (!farmId) { setRows([]); return; }
    setLoading(true);
    try {
      const data = await listTranscricoesByFarm(farmId);
      setRows(data.map(r => normalizeRow(r as unknown as Record<string, unknown>)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function handleDownload(row: SemanaTranscricaoRow) {
    setDownloadingId(row.id);
    try {
      const url = await storageGetSignedUrl('meeting-transcriptions', row.storagePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = row.originalName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      onToast?.('Erro ao gerar link de download.', 'error');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleCopyText(row: SemanaTranscricaoRow) {
    if (!row.texto) return;
    await navigator.clipboard.writeText(row.texto);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDelete(row: SemanaTranscricaoRow) {
    setDeletingId(row.id);
    try {
      const { storagePath } = await deleteTranscricaoApi(row.id);
      if (storagePath) {
        await storageRemove('meeting-transcriptions', [storagePath]);
      }
      setRows(prev => prev.filter(r => r.id !== row.id));
      onToast?.('Transcrição excluída.', 'success');
    } catch {
      onToast?.('Erro ao excluir transcrição.', 'error');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function handleProcessTranscricao(row: SemanaTranscricaoRow) {
    setProcessingId(row.id);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sessão expirada.');

      // If no texto, extract from file first
      let transcricaoTexto = row.texto;
      if (!transcricaoTexto) {
        if (!row.storagePath) throw new Error('Transcrição sem texto e sem arquivo.');
        const extractRes = await fetch('/api/semana-transcricoes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'extract-text', id: row.id }),
        });
        if (!extractRes.ok) {
          const err = await extractRes.json().catch(() => ({}));
          throw new Error(err.error || 'Erro ao extrair texto do documento.');
        }
        const extractData = await extractRes.json();
        transcricaoTexto = extractData.data?.texto || extractData.texto;
        if (!transcricaoTexto) throw new Error('Não foi possível extrair texto do documento.');
      }

      const res = await fetch('/api/agents-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agentId: 'transcricao-proc',
          input: { transcricaoTexto },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setProcessResult(data.data);
        setResultSourceRow(row);
        setShowResultModal(true);
        setActiveTab('resumo');
      } else {
        throw new Error(data.error || 'Falha ao processar transcrição.');
      }
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao processar transcrição.', 'error');
    } finally {
      setProcessingId(null);
    }
  }

  function handleDownloadMarkdown() {
    if (!processResult) return;
    const md = buildResultMarkdown(processResult);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = resultSourceRow?.descricao || resultSourceRow?.originalName || 'transcricao-processada';
    a.download = `${name.replace(/[^a-zA-Z0-9À-ú\s_-]/g, '').replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopyResultMarkdown() {
    if (!processResult) return;
    const md = buildResultMarkdown(processResult);
    await navigator.clipboard.writeText(md);
    setResultCopied(true);
    setTimeout(() => setResultCopied(false), 2000);
  }

  function closeResultModal() {
    setShowResultModal(false);
    setProcessResult(null);
    setResultSourceRow(null);
    setResultCopied(false);
    setEditMode(false);
    setEditResult(null);
  }

  function handleViewProcessedResult(row: SemanaTranscricaoRow) {
    if (!row.processedResult) return;
    setProcessResult(row.processedResult);
    setResultSourceRow(row);
    setShowResultModal(true);
    setActiveTab('resumo');
  }

  async function handleSaveProcessedResult() {
    if (!processResult || !resultSourceRow) return;
    setSavingResult(true);
    try {
      await updateTranscricaoProcessedResult(resultSourceRow.id, processResult);
      setRows(prev => prev.map(r =>
        r.id === resultSourceRow.id
          ? { ...r, processedResult: processResult, processedAt: new Date().toISOString() }
          : r
      ));
      setResultSourceRow(prev => prev ? { ...prev, processedResult: processResult, processedAt: new Date().toISOString() } : prev);
      onToast?.('Resultado salvo com sucesso.', 'success');
    } catch {
      onToast?.('Erro ao salvar resultado.', 'error');
    } finally {
      setSavingResult(false);
    }
  }

  function handleStartEdit() {
    if (!processResult) return;
    setEditResult(JSON.parse(JSON.stringify(processResult)));
    setEditMode(true);
  }

  async function handleSaveEdit() {
    if (!editResult || !resultSourceRow) return;
    setSavingResult(true);
    try {
      await updateTranscricaoProcessedResult(resultSourceRow.id, editResult);
      setRows(prev => prev.map(r =>
        r.id === resultSourceRow.id
          ? { ...r, processedResult: editResult, processedAt: new Date().toISOString() }
          : r
      ));
      setProcessResult(editResult);
      setResultSourceRow(prev => prev ? { ...prev, processedResult: editResult, processedAt: new Date().toISOString() } : prev);
      setEditMode(false);
      setEditResult(null);
      onToast?.('Alterações salvas.', 'success');
    } catch {
      onToast?.('Erro ao salvar alterações.', 'error');
    } finally {
      setSavingResult(false);
    }
  }

  function handleCancelEdit() {
    setEditMode(false);
    setEditResult(null);
  }

  // ─── Empty / loading states ─────────────────────────────────────────────────

  if (!farmId) {
    return (
      <div style={{
        background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
        padding: 48, textAlign: 'center', fontFamily: FONT,
        animation: 'gsFadeIn 0.3s ease',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', margin: '0 0 6px' }}>Transcrições</p>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Selecione uma fazenda para ver as transcrições.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
        padding: 48, textAlign: 'center', color: '#94A3B8', fontFamily: FONT,
        animation: 'gsFadeIn 0.3s ease',
      }}>
        Carregando...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{
        background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
        padding: 48, textAlign: 'center', fontFamily: FONT,
        animation: 'gsFadeIn 0.3s ease',
      }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>📄</div>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', margin: '0 0 8px' }}>Nenhuma transcrição</p>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
          Transcreva um áudio ou envie um documento para começar.
        </p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
      overflow: 'hidden', animation: 'gsFadeIn 0.3s ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', margin: 0, fontFamily: FONT }}>
          Transcrições Salvas
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#94A3B8' }}>
            ({rows.length} {rows.length === 1 ? 'registro' : 'registros'})
          </span>
        </p>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Descrição', 'Tipo', 'Semana', 'Data', 'Observações', ''].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                  color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase',
                  borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const badge = getFileTypeBadge(row);
              const isConfirming = confirmDeleteId === row.id;
              const isDeleting = deletingId === row.id;
              const isDownloading = downloadingId === row.id;
              const isExpanded = expandedId === row.id;
              const isAudio = row.tipo === 'audio';
              const hasFile = !!row.storagePath;
              const isProcessing = processingId === row.id;
              const canProcess = !!row.texto || !!row.storagePath;

              return (
                <React.Fragment key={row.id}>
                  <tr
                    style={{ borderBottom: '1px solid #F8FAFC' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#F8FAFC'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                  >
                    {/* Name / description */}
                    <td style={{ padding: '10px 14px', maxWidth: 260 }}>
                      <span style={{
                        fontSize: 13, color: '#0F172A', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        display: 'block',
                      }} title={isAudio ? (row.descricao || 'Transcrição de áudio') : row.originalName}>
                        {isAudio ? (row.descricao || 'Transcrição de áudio') : row.originalName}
                      </span>
                      {isAudio && row.originalName && (
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>
                          {row.originalName}
                        </span>
                      )}
                      {!isAudio && (
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>
                          {formatFileSize(row.fileSize)}
                        </span>
                      )}
                      {row.processedAt && (
                        <span
                          style={{
                            display: 'inline-block', marginLeft: 6, marginTop: 2,
                            fontSize: 10, fontWeight: 600, padding: '1px 6px',
                            borderRadius: 99, background: '#ECFDF5', color: '#059669',
                            border: '1px solid #A7F3D0', verticalAlign: 'middle',
                            cursor: 'pointer',
                          }}
                          title={`Processado em ${formatDate(row.processedAt)}`}
                          onClick={() => handleViewProcessedResult(row)}
                        >
                          Processado
                        </span>
                      )}
                    </td>

                    {/* File type badge */}
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                        color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                        fontFamily: MONO,
                      }}>
                        {badge.label}
                      </span>
                    </td>

                    {/* Semana */}
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748B', fontFamily: MONO, whiteSpace: 'nowrap' }}>
                      {row.semanaNumero != null ? `Sem. ${String(row.semanaNumero).padStart(2, '0')}` : '—'}
                    </td>

                    {/* Date */}
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748B', whiteSpace: 'nowrap' }}>
                      {formatDate(row.createdAt)}
                    </td>

                    {/* Description */}
                    <td style={{ padding: '10px 14px', maxWidth: 200 }}>
                      {!isAudio && row.descricao ? (
                        <span style={{
                          fontSize: 12, color: '#475569',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          display: 'block',
                        }} title={row.descricao}>
                          {row.descricao}
                        </span>
                      ) : !isAudio ? (
                        <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>
                      ) : null}
                      {isAudio && row.texto && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#3B82F6', fontSize: 12, fontWeight: 500, padding: 0,
                            fontFamily: FONT,
                          }}
                        >
                          {isExpanded ? 'Recolher texto' : 'Ver texto'}
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {isConfirming ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#DC2626' }}>Excluir?</span>
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={isDeleting}
                            style={{
                              padding: '3px 10px', borderRadius: 6, border: 'none',
                              background: '#DC2626', color: '#FFF', fontSize: 11, fontWeight: 600,
                              cursor: isDeleting ? 'wait' : 'pointer', fontFamily: FONT,
                            }}
                          >
                            {isDeleting ? '...' : 'Sim'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={isDeleting}
                            style={{
                              padding: '3px 10px', borderRadius: 6, border: '1px solid #E2E8F0',
                              background: '#FFF', color: '#475569', fontSize: 11, fontWeight: 500,
                              cursor: 'pointer', fontFamily: FONT,
                            }}
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* Ver Resultado button (for saved results) */}
                          {row.processedResult && (
                            <button
                              onClick={() => handleViewProcessedResult(row)}
                              title="Ver resultado processado"
                              style={{
                                padding: '5px 10px', borderRadius: 6,
                                border: '1px solid #BFDBFE',
                                background: '#EFF6FF', color: '#2563EB',
                                fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', fontFamily: FONT,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <span style={{ fontSize: 11 }}>Ver Resultado</span>
                            </button>
                          )}
                          {/* Processar / Reprocessar button */}
                          {canProcess && (
                            <button
                              onClick={() => handleProcessTranscricao(row)}
                              disabled={isProcessing || !!processingId}
                              title={row.processedResult ? 'Reprocessar Transcrição' : 'Processar Transcrição'}
                              style={{
                                padding: '5px 10px', borderRadius: 6,
                                border: '1px solid #A7F3D0',
                                background: isProcessing ? '#D1FAE5' : '#ECFDF5',
                                color: '#059669', fontSize: 12, fontWeight: 500,
                                cursor: isProcessing ? 'wait' : (processingId ? 'not-allowed' : 'pointer'),
                                fontFamily: FONT,
                                display: 'flex', alignItems: 'center', gap: 4,
                                opacity: (processingId && !isProcessing) ? 0.5 : 1,
                              }}
                            >
                              {isProcessing ? (
                                <>
                                  <span style={{
                                    display: 'inline-block', width: 12, height: 12,
                                    border: '2px solid #A7F3D0', borderTopColor: '#059669',
                                    borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite',
                                  }} />
                                  <span style={{ fontSize: 11 }}>Processando...</span>
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: 14, lineHeight: 1 }}>&#9889;</span>
                                  <span style={{ fontSize: 11 }}>{row.processedResult ? 'Reprocessar' : 'Processar'}</span>
                                </>
                              )}
                            </button>
                          )}
                          {isAudio && row.texto ? (
                            <button
                              onClick={() => handleCopyText(row)}
                              title="Copiar texto"
                              style={{
                                padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0',
                                background: '#FFF', color: '#475569', fontSize: 12,
                                cursor: 'pointer', fontFamily: FONT,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              {copiedId === row.id ? '✓' : '📋'}
                            </button>
                          ) : hasFile ? (
                            <button
                              onClick={() => handleDownload(row)}
                              disabled={isDownloading}
                              title="Baixar"
                              style={{
                                padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0',
                                background: '#FFF', color: '#475569', fontSize: 12,
                                cursor: isDownloading ? 'wait' : 'pointer', fontFamily: FONT,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              {isDownloading ? '⏳' : '⬇'}
                            </button>
                          ) : null}
                          <button
                            onClick={() => setConfirmDeleteId(row.id)}
                            title="Excluir"
                            style={{
                              padding: '5px 10px', borderRadius: 6, border: '1px solid #FEE2E2',
                              background: '#FEF2F2', color: '#DC2626', fontSize: 12,
                              cursor: 'pointer', fontFamily: FONT,
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded text row */}
                  {isExpanded && isAudio && row.texto && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0 14px 14px' }}>
                        <div style={{
                          padding: 14, borderRadius: 8, background: '#F8FAFC',
                          border: '1px solid #E2E8F0', maxHeight: 300, overflowY: 'auto',
                        }}>
                          <pre style={{
                            fontSize: 13, color: '#0F172A', whiteSpace: 'pre-wrap',
                            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, margin: 0,
                          }}>
                            {row.texto}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Result Modal ──────────────────────────────────────────────────────── */}
      {showResultModal && processResult && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) closeResultModal(); }}
        >
          <div style={{
            background: '#FFF', borderRadius: 16, width: '100%', maxWidth: 860,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            fontFamily: FONT, overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#F8FAFC',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  Transcrição Processada
                </h3>
                {resultSourceRow && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                    {resultSourceRow.descricao || resultSourceRow.originalName || 'Transcrição de áudio'}
                    {resultSourceRow.semanaNumero != null && ` — Semana ${resultSourceRow.semanaNumero}`}
                  </p>
                )}
              </div>
              <button
                onClick={closeResultModal}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 22, color: '#94A3B8', lineHeight: 1, padding: '4px 8px',
                }}
                title="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Tab Bar */}
            <div style={{
              display: 'flex', gap: 0, borderBottom: '1px solid #E2E8F0',
              padding: '0 24px', background: '#FFF',
            }}>
              {TAB_LIST.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '10px 16px', border: 'none', background: 'none',
                    cursor: 'pointer', fontFamily: FONT,
                    fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
                    color: activeTab === tab.key ? '#059669' : '#64748B',
                    borderBottom: activeTab === tab.key ? '2px solid #059669' : '2px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                  {tab.key === 'decisoes' && processResult.decisions.length > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, background: '#ECFDF5', color: '#059669',
                      padding: '1px 6px', borderRadius: 99, fontWeight: 600,
                    }}>{processResult.decisions.length}</span>
                  )}
                  {tab.key === 'tarefas' && processResult.tasks.length > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, background: '#EFF6FF', color: '#2563EB',
                      padding: '1px 6px', borderRadius: 99, fontWeight: 600,
                    }}>{processResult.tasks.length}</span>
                  )}
                  {tab.key === 'riscos' && (processResult.riscosBlockers.length + processResult.estacionamento.length) > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, background: '#FFFBEB', color: '#D97706',
                      padding: '1px 6px', borderRadius: 99, fontWeight: 600,
                    }}>{processResult.riscosBlockers.length + processResult.estacionamento.length}</span>
                  )}
                  {tab.key === 'incertezas' && processResult.incertezas.length > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, background: '#F5F3FF', color: '#7C3AED',
                      padding: '1px 6px', borderRadius: 99, fontWeight: 600,
                    }}>{processResult.incertezas.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {(() => {
                const dr = editMode && editResult ? editResult : processResult;
                if (!dr) return null;

                const inputStyle: React.CSSProperties = {
                  border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px',
                  fontSize: 13, width: '100%', fontFamily: FONT, color: '#0F172A',
                  background: '#FFF', outline: 'none',
                };
                const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical' as const, minHeight: 60 };

                /* helper: update a field in editResult */
                const setField = <K extends keyof TranscricaoProcResult>(key: K, val: TranscricaoProcResult[K]) =>
                  setEditResult(prev => prev ? { ...prev, [key]: val } : prev);

                /* helper: update an item in a string-array field */
                const setArrayItem = (key: 'presentesConfirmados' | 'citados' | 'riscosBlockers' | 'estacionamento' | 'incertezas', idx: number, val: string) =>
                  setEditResult(prev => {
                    if (!prev) return prev;
                    const arr = [...prev[key]]; arr[idx] = val;
                    return { ...prev, [key]: arr };
                  });
                const removeArrayItem = (key: 'presentesConfirmados' | 'citados' | 'riscosBlockers' | 'estacionamento' | 'incertezas', idx: number) =>
                  setEditResult(prev => {
                    if (!prev) return prev;
                    const arr = [...prev[key]]; arr.splice(idx, 1);
                    return { ...prev, [key]: arr };
                  });
                const addArrayItem = (key: 'presentesConfirmados' | 'citados' | 'riscosBlockers' | 'estacionamento' | 'incertezas') =>
                  setEditResult(prev => prev ? { ...prev, [key]: [...prev[key], ''] } : prev);

                /* helper: editable string-array list */
                const renderEditableList = (
                  label: string, color: string, bgColor: string, borderColor: string,
                  key: 'presentesConfirmados' | 'citados' | 'riscosBlockers' | 'estacionamento' | 'incertezas',
                  items: string[],
                ) => (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
                      {label}
                    </h4>
                    {editMode ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input value={item} onChange={e => setArrayItem(key, i, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                            <button onClick={() => removeArrayItem(key, i)} style={{ border: 'none', background: '#FEF2F2', color: '#DC2626', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                          </div>
                        ))}
                        <button onClick={() => addArrayItem(key)} style={{ border: '1px dashed #CBD5E1', background: 'none', color: '#64748B', borderRadius: 6, padding: '6px 0', cursor: 'pointer', fontSize: 12 }}>+ Adicionar</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {items.map((p, i) => (
                          <span key={i} style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 99,
                            background: bgColor, color, fontWeight: 500,
                            border: `1px solid ${borderColor}`,
                          }}>{p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );

                return (
                  <>
                    {/* Resumo tab */}
                    {activeTab === 'resumo' && (
                      <div>
                          <h4 style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
                            Resumo Executivo
                          </h4>
                          {editMode ? (
                            <textarea value={dr.summary} onChange={e => setField('summary', e.target.value)} style={{ ...textareaStyle, minHeight: 120 }} />
                          ) : (
                            <p style={{ fontSize: 14, color: '#1E293B', lineHeight: 1.7, margin: 0 }}>
                              {dr.summary}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Decisoes tab */}
                    {activeTab === 'decisoes' && (
                      <div>
                        {dr.decisions.length === 0 && !editMode ? (
                          <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 24 }}>
                            Nenhuma decisão identificada na transcrição.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {dr.decisions.map((d, i) => (
                              <div key={i} style={{
                                padding: 16, borderRadius: 10, background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                              }}>
                                {editMode ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Decisão {i + 1}</span>
                                      <button onClick={() => setEditResult(prev => {
                                        if (!prev) return prev;
                                        const arr = [...prev.decisions]; arr.splice(i, 1);
                                        return { ...prev, decisions: arr };
                                      })} style={{ border: 'none', background: '#FEF2F2', color: '#DC2626', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕ Remover</button>
                                    </div>
                                    <input placeholder="Decisão" value={d.decision} onChange={e => setEditResult(prev => {
                                      if (!prev) return prev;
                                      const arr = [...prev.decisions]; arr[i] = { ...arr[i], decision: e.target.value };
                                      return { ...prev, decisions: arr };
                                    })} style={{ ...inputStyle, fontWeight: 600 }} />
                                    <input placeholder="Por quê (rationale)" value={d.rationale ?? ''} onChange={e => setEditResult(prev => {
                                      if (!prev) return prev;
                                      const arr = [...prev.decisions]; arr[i] = { ...arr[i], rationale: e.target.value || undefined };
                                      return { ...prev, decisions: arr };
                                    })} style={inputStyle} />
                                    <input placeholder="Descartado" value={d.descartado ?? ''} onChange={e => setEditResult(prev => {
                                      if (!prev) return prev;
                                      const arr = [...prev.decisions]; arr[i] = { ...arr[i], descartado: e.target.value || undefined };
                                      return { ...prev, decisions: arr };
                                    })} style={inputStyle} />
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <input placeholder="Responsável" value={d.assignee ?? ''} onChange={e => setEditResult(prev => {
                                        if (!prev) return prev;
                                        const arr = [...prev.decisions]; arr[i] = { ...arr[i], assignee: e.target.value || undefined };
                                        return { ...prev, decisions: arr };
                                      })} style={{ ...inputStyle, flex: 1 }} />
                                      <input placeholder="Impacto" value={d.impact ?? ''} onChange={e => setEditResult(prev => {
                                        if (!prev) return prev;
                                        const arr = [...prev.decisions]; arr[i] = { ...arr[i], impact: e.target.value || undefined };
                                        return { ...prev, decisions: arr };
                                      })} style={{ ...inputStyle, flex: 1 }} />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', margin: '0 0 8px' }}>
                                      {i + 1}. {d.decision}
                                    </p>
                                    {d.rationale && (
                                      <p style={{ fontSize: 13, color: '#1E293B', margin: '0 0 6px', lineHeight: 1.5 }}>
                                        <strong style={{ color: '#059669' }}>Por quê:</strong> {d.rationale}
                                      </p>
                                    )}
                                    {d.descartado && (
                                      <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 6px', lineHeight: 1.5, fontStyle: 'italic' }}>
                                        <strong style={{ color: '#94A3B8' }}>Descartado:</strong> {d.descartado}
                                      </p>
                                    )}
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                                      {d.assignee && (
                                        <span style={{ fontSize: 12, color: '#64748B' }}>
                                          <strong style={{ color: '#475569' }}>Responsável:</strong> {d.assignee}
                                        </span>
                                      )}
                                      {d.impact && (
                                        <span style={{ fontSize: 12, color: '#64748B' }}>
                                          <strong style={{ color: '#475569' }}>Impacto:</strong> {d.impact}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                            {editMode && (
                              <button onClick={() => setEditResult(prev => prev ? { ...prev, decisions: [...prev.decisions, { decision: '' }] } : prev)}
                                style={{ border: '1px dashed #CBD5E1', background: 'none', color: '#64748B', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13 }}>
                                + Adicionar Decisão
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tarefas tab */}
                    {activeTab === 'tarefas' && (
                      <div>
                        {dr.tasks.length === 0 && !editMode ? (
                          <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 24 }}>
                            Nenhuma tarefa identificada na transcrição.
                          </p>
                        ) : editMode ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {dr.tasks.map((t, i) => (
                              <div key={i} style={{ padding: 16, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Tarefa {i + 1}</span>
                                  <button onClick={() => setEditResult(prev => {
                                    if (!prev) return prev;
                                    const arr = [...prev.tasks]; arr.splice(i, 1);
                                    return { ...prev, tasks: arr };
                                  })} style={{ border: 'none', background: '#FEF2F2', color: '#DC2626', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕ Remover</button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <input placeholder="Título" value={t.title} onChange={e => setEditResult(prev => {
                                    if (!prev) return prev;
                                    const arr = [...prev.tasks]; arr[i] = { ...arr[i], title: e.target.value };
                                    return { ...prev, tasks: arr };
                                  })} style={{ ...inputStyle, fontWeight: 600 }} />
                                  <textarea placeholder="Descrição" value={t.description} onChange={e => setEditResult(prev => {
                                    if (!prev) return prev;
                                    const arr = [...prev.tasks]; arr[i] = { ...arr[i], description: e.target.value };
                                    return { ...prev, tasks: arr };
                                  })} style={textareaStyle} />
                                  <input placeholder="Contexto" value={t.contexto ?? ''} onChange={e => setEditResult(prev => {
                                    if (!prev) return prev;
                                    const arr = [...prev.tasks]; arr[i] = { ...arr[i], contexto: e.target.value || undefined };
                                    return { ...prev, tasks: arr };
                                  })} style={inputStyle} />
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <input placeholder="Responsável" value={t.assignee ?? ''} onChange={e => setEditResult(prev => {
                                      if (!prev) return prev;
                                      const arr = [...prev.tasks]; arr[i] = { ...arr[i], assignee: e.target.value || undefined };
                                      return { ...prev, tasks: arr };
                                    })} style={{ ...inputStyle, flex: 1 }} />
                                    <select value={t.priority ?? ''} onChange={e => setEditResult(prev => {
                                      if (!prev) return prev;
                                      const arr = [...prev.tasks]; arr[i] = { ...arr[i], priority: (e.target.value || undefined) as any };
                                      return { ...prev, tasks: arr };
                                    })} style={{ ...inputStyle, flex: 1 }}>
                                      <option value="">Prioridade...</option>
                                      <option value="alta">Alta</option>
                                      <option value="media">Média</option>
                                      <option value="baixa">Baixa</option>
                                    </select>
                                    <input placeholder="Prazo" value={t.dueDate ?? ''} onChange={e => setEditResult(prev => {
                                      if (!prev) return prev;
                                      const arr = [...prev.tasks]; arr[i] = { ...arr[i], dueDate: e.target.value || undefined };
                                      return { ...prev, tasks: arr };
                                    })} style={{ ...inputStyle, flex: 1 }} />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <button onClick={() => setEditResult(prev => prev ? { ...prev, tasks: [...prev.tasks, { title: '', description: '' }] } : prev)}
                              style={{ border: '1px dashed #CBD5E1', background: 'none', color: '#64748B', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13 }}>
                              + Adicionar Tarefa
                            </button>
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead>
                                <tr style={{ background: '#F8FAFC' }}>
                                  {['Tarefa', 'Responsável', 'Prioridade', 'Prazo'].map(h => (
                                    <th key={h} style={{
                                      padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                                      color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px',
                                      borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
                                    }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {dr.tasks.map((t, i) => {
                                  const pri = t.priority ? PRIORITY_MAP[t.priority] : null;
                                  return (
                                    <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                      <td style={{ padding: '10px 12px', maxWidth: 320 }}>
                                        <p style={{ margin: 0, fontWeight: 600, color: '#0F172A' }}>{t.title}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>{t.description}</p>
                                        {t.contexto && (
                                          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
                                            Contexto: {t.contexto}
                                          </p>
                                        )}
                                      </td>
                                      <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                        {t.assignee || '—'}
                                      </td>
                                      <td style={{ padding: '10px 12px' }}>
                                        {pri ? (
                                          <span style={{
                                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                                            color: pri.color, background: pri.bg,
                                          }}>{pri.label}</span>
                                        ) : (
                                          <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12 }}>
                                        {t.dueDate || '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ata tab */}
                    {activeTab === 'ata' && (
                      <div>
                        {editMode ? (
                          <textarea
                            value={dr.minutes}
                            onChange={e => setField('minutes', e.target.value)}
                            style={{
                              ...textareaStyle, minHeight: 400, lineHeight: 1.7,
                              padding: 16, borderRadius: 10, background: '#FFF',
                            }}
                          />
                        ) : (
                          <pre style={{
                            fontSize: 13, color: '#1E293B', whiteSpace: 'pre-wrap',
                            fontFamily: FONT, lineHeight: 1.7, margin: 0,
                            padding: 16, borderRadius: 10, background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                          }}>
                            {dr.minutes}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Incertezas tab */}
                    {activeTab === 'incertezas' && (
                      <div>
                        {dr.incertezas.length === 0 && !editMode ? (
                          <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 24 }}>
                            Nenhuma incerteza identificada na transcrição.
                          </p>
                        ) : (
                          <div>
                            {!editMode && (
                              <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                                Termos e referências que precisam ser verificados antes de distribuir a ata:
                              </p>
                            )}
                            {editMode ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {dr.incertezas.map((inc, i) => (
                                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <input value={inc} onChange={e => setArrayItem('incertezas', i, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                    <button onClick={() => removeArrayItem('incertezas', i)} style={{ border: 'none', background: '#FEF2F2', color: '#DC2626', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                                  </div>
                                ))}
                                <button onClick={() => addArrayItem('incertezas')} style={{ border: '1px dashed #CBD5E1', background: 'none', color: '#64748B', borderRadius: 6, padding: '6px 0', cursor: 'pointer', fontSize: 12 }}>+ Adicionar</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {dr.incertezas.map((inc, i) => (
                                  <div key={i} style={{
                                    padding: '10px 14px', borderRadius: 8,
                                    background: '#F5F3FF', border: '1px solid #DDD6FE',
                                    fontSize: 13, color: '#5B21B6',
                                  }}>
                                    {inc}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Riscos tab */}
                    {activeTab === 'riscos' && (
                      <div>
                        {dr.riscosBlockers.length === 0 && dr.estacionamento.length === 0 && !editMode ? (
                          <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 24 }}>
                            Nenhum risco, bloqueio ou item de estacionamento identificado.
                          </p>
                        ) : (
                          <>
                            {(dr.riscosBlockers.length > 0 || editMode) &&
                              renderEditableList('Riscos e Bloqueios', '#DC2626', '#FEF2F2', '#FECACA', 'riscosBlockers', dr.riscosBlockers)
                            }
                            {(dr.estacionamento.length > 0 || editMode) &&
                              renderEditableList('Itens de Estacionamento', '#D97706', '#FFFBEB', '#FDE68A', 'estacionamento', dr.estacionamento)
                            }
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px', borderTop: '1px solid #E2E8F0',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              background: '#F8FAFC',
            }}>
              {editMode ? (
                <>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
                      background: '#FFF', color: '#475569', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', fontFamily: FONT,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingResult}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: '#059669', color: '#FFF', fontSize: 13, fontWeight: 600,
                      cursor: savingResult ? 'wait' : 'pointer', fontFamily: FONT,
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: savingResult ? 0.7 : 1,
                    }}
                  >
                    {savingResult ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleCopyResultMarkdown}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
                      background: '#FFF', color: '#475569', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', fontFamily: FONT,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {resultCopied ? '✓ Copiado!' : '📋 Copiar Markdown'}
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
                      background: '#FFF', color: '#475569', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', fontFamily: FONT,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    ⬇ Baixar .md
                  </button>
                  <button
                    onClick={handleStartEdit}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid #BFDBFE',
                      background: '#EFF6FF', color: '#2563EB', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', fontFamily: FONT,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    ✏ Editar
                  </button>
                  <button
                    onClick={handleSaveProcessedResult}
                    disabled={savingResult}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: '#059669', color: '#FFF', fontSize: 13, fontWeight: 600,
                      cursor: savingResult ? 'wait' : 'pointer', fontFamily: FONT,
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: savingResult ? 0.7 : 1,
                    }}
                  >
                    {savingResult ? 'Salvando...' : (resultSourceRow?.processedAt ? 'Atualizar Resultado' : 'Salvar Resultado')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default TranscricoesView;
