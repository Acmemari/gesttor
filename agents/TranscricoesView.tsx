import React, { useState, useEffect, useCallback } from 'react';
import {
  listTranscricoesByFarm,
  deleteTranscricaoApi,
  type SemanaTranscricaoRow,
} from '../lib/api/semanaTranscricoesClient';
import { storageGetSignedUrl, storageRemove } from '../lib/storage';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface TranscricoesViewProps {
  farmId: string | null;
  semana: { id: string; numero: number; data_inicio: string; modo: 'ano' | 'safra' } | null;
  organizationId: string | null;
  refreshKey?: number;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

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
};

const PT_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getFileTypeBadge(originalName: string) {
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
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
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  };
}

// ─── Component ─────────────────────────────────────────────────────────────────

const TranscricoesView: React.FC<TranscricoesViewProps> = ({
  farmId,
  refreshKey,
  onToast,
}) => {
  const [rows, setRows] = useState<SemanaTranscricaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  async function handleDelete(row: SemanaTranscricaoRow) {
    setDeletingId(row.id);
    try {
      const { storagePath } = await deleteTranscricaoApi(row.id);
      await storageRemove('meeting-transcriptions', [storagePath]);
      setRows(prev => prev.filter(r => r.id !== row.id));
      onToast?.('Transcrição excluída.', 'success');
    } catch {
      onToast?.('Erro ao excluir transcrição.', 'error');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

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
          Use o botão <strong>📄 Transcrição</strong> no cabeçalho para enviar arquivos de transcrição de reunião.
        </p>
      </div>
    );
  }

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
          Transcrições
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#94A3B8' }}>
            ({rows.length} {rows.length === 1 ? 'arquivo' : 'arquivos'})
          </span>
        </p>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Arquivo', 'Tipo', 'Tamanho', 'Semana', 'Data', 'Observações', ''].map(h => (
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
              const badge = getFileTypeBadge(row.originalName);
              const isConfirming = confirmDeleteId === row.id;
              const isDeleting = deletingId === row.id;
              const isDownloading = downloadingId === row.id;

              return (
                <tr
                  key={row.id}
                  style={{ borderBottom: '1px solid #F8FAFC' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#F8FAFC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                >
                  {/* File name */}
                  <td style={{ padding: '10px 14px', maxWidth: 260 }}>
                    <span style={{
                      fontSize: 13, color: '#0F172A', fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'block',
                    }} title={row.originalName}>
                      {row.originalName}
                    </span>
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

                  {/* Size */}
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748B', fontFamily: MONO, whiteSpace: 'nowrap' }}>
                    {formatFileSize(row.fileSize)}
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
                    {row.descricao ? (
                      <span style={{
                        fontSize: 12, color: '#475569',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        display: 'block',
                      }} title={row.descricao}>
                        {row.descricao}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TranscricoesView;
