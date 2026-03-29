import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  listAtasByFarm,
  createAta,
  updateAta,
  deleteAtaApi,
  type AtaRow,
  type AtaConteudo,
} from '../lib/api/atasClient';
import { listSemanasByFarm, type SemanaRow } from '../lib/api/semanasClient';
import { listTranscricoesByFarm, type SemanaTranscricaoRow } from '../lib/api/semanaTranscricoesClient';
import { generateAtaPdf } from '../components/AtaPrintPDF';
import { storageUpload, storageGetPublicUrl } from '../lib/storage';

const FONT = "'DM Sans', sans-serif";
const STORAGE_PREFIX = 'ata-fotos';

interface AtasViewProps {
  farmId: string | null;
  organizationId: string | null;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface FotoParaUpload {
  file: File;
  legenda: string;
  preview: string;
}

function formatDateBR(d: string | null | undefined): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const AtasView: React.FC<AtasViewProps> = ({ farmId, organizationId, onToast }) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [atas, setAtas] = useState<AtaRow[]>([]);
  const [semanas, setSemanas] = useState<SemanaRow[]>([]);
  const [selectedSemanaId, setSelectedSemanaId] = useState('');
  const [selectedAta, setSelectedAta] = useState<AtaRow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editConteudo, setEditConteudo] = useState<AtaConteudo | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Transcricao + Fotos states
  const [transcricaoTexto, setTranscricaoTexto] = useState('');
  const [showTranscricaoModal, setShowTranscricaoModal] = useState(false);
  const [transcricoes, setTranscricoes] = useState<SemanaTranscricaoRow[]>([]);
  const [fotosParaUpload, setFotosParaUpload] = useState<FotoParaUpload[]>([]);
  const [showFotosModal, setShowFotosModal] = useState(false);
  const fotosInputRef = useRef<HTMLInputElement>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const [atasData, semanasData, transcricoesData] = await Promise.all([
        listAtasByFarm(farmId),
        listSemanasByFarm(farmId),
        listTranscricoesByFarm(farmId),
      ]);
      setAtas(atasData);
      setTranscricoes(transcricoesData);
      const normalized = semanasData.map(s => ({
        ...s,
        aberta: s.aberta === true || (s.aberta as unknown) === 'true',
      }));
      setSemanas(normalized);
      const sorted = [...normalized].sort((a, b) => b.numero - a.numero);
      const closed = sorted.filter(s => !s.aberta);
      if (!selectedSemanaId && sorted.length > 0) {
        setSelectedSemanaId(closed.length > 0 ? closed[0].id : sorted[0].id);
      }
    } catch {
      onToast?.('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Upload fotos to B2 and return URLs
  const uploadFotos = async (): Promise<Array<{ url: string; legenda: string; storagePath: string }>> => {
    const uploaded: Array<{ url: string; legenda: string; storagePath: string }> = [];
    for (let i = 0; i < fotosParaUpload.length; i++) {
      const foto = fotosParaUpload[i];
      const ext = foto.file.name.split('.').pop() || 'jpg';
      const path = `${farmId}/${Date.now()}_${i}.${ext}`;
      await storageUpload(STORAGE_PREFIX, path, foto.file, { contentType: foto.file.type });
      const url = storageGetPublicUrl(STORAGE_PREFIX, path);
      uploaded.push({ url, legenda: foto.legenda, storagePath: `${STORAGE_PREFIX}/${path}` });
    }
    return uploaded;
  };

  // Generate ata
  const handleGenerate = async () => {
    if (!selectedSemanaId || !farmId || !organizationId) {
      onToast?.('Selecione uma semana', 'warning');
      return;
    }
    setGenerating(true);
    try {
      // Upload fotos first
      let fotos: Array<{ url: string; legenda: string; storagePath: string }> = [];
      if (fotosParaUpload.length > 0) {
        onToast?.('Enviando fotos...', 'info');
        fotos = await uploadFotos();
      }

      if (transcricaoTexto.trim()) {
        onToast?.('Processando transcricao com IA...', 'info');
      }

      const newAta = await createAta({
        semanaFechadaId: selectedSemanaId,
        farmId,
        organizationId,
        transcricaoTexto: transcricaoTexto.trim() || undefined,
        fotos: fotos.length > 0 ? fotos : undefined,
      });
      setAtas(prev => [newAta, ...prev]);
      setSelectedAta(newAta);
      // Reset inputs
      setTranscricaoTexto('');
      setFotosParaUpload([]);
      onToast?.('Ata gerada com sucesso!', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Erro ao gerar ata', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Export PDF
  const handleExportPdf = async (ata: AtaRow) => {
    try {
      const c = ata.conteudo as AtaConteudo;
      await generateAtaPdf(c, c.metadata.semanaFechada, c.metadata.semanaAberta);
      onToast?.('PDF exportado!', 'success');
    } catch {
      onToast?.('Erro ao exportar PDF', 'error');
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      await deleteAtaApi(id);
      setAtas(prev => prev.filter(a => a.id !== id));
      if (selectedAta?.id === id) setSelectedAta(null);
      setConfirmDeleteId(null);
      onToast?.('Ata excluida', 'success');
    } catch {
      onToast?.('Erro ao excluir ata', 'error');
    }
  };

  // Edit mode
  const handleStartEdit = (ata: AtaRow) => {
    setEditConteudo(JSON.parse(JSON.stringify(ata.conteudo)));
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedAta || !editConteudo) return;
    setSaving(true);
    try {
      const updated = await updateAta(selectedAta.id, editConteudo);
      setAtas(prev => prev.map(a => a.id === updated.id ? updated : a));
      setSelectedAta(updated);
      setEditMode(false);
      onToast?.('Alteracoes salvas', 'success');
    } catch {
      onToast?.('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Fotos handlers
  const handleFotosSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFotos = files.map(file => ({
      file,
      legenda: '',
      preview: URL.createObjectURL(file),
    }));
    setFotosParaUpload(prev => [...prev, ...newFotos]);
    if (fotosInputRef.current) fotosInputRef.current.value = '';
  };

  const handleFotoLegenda = (idx: number, legenda: string) => {
    setFotosParaUpload(prev => prev.map((f, i) => i === idx ? { ...f, legenda } : f));
  };

  const handleFotoRemove = (idx: number) => {
    setFotosParaUpload(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const sortedSemanas = [...semanas].sort((a, b) => b.numero - a.numero);

  if (!farmId) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8', fontFamily: FONT }}>
        <p style={{ fontSize: 15 }}>Selecione uma fazenda para visualizar as atas.</p>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedAta) {
    const c = (editMode ? editConteudo : selectedAta.conteudo) as AtaConteudo;
    if (!c) return null;

    return (
      <div style={{ fontFamily: FONT }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <button
            onClick={() => { setSelectedAta(null); setEditMode(false); }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFF', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: FONT }}
          >
            Voltar
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {!editMode ? (
              <>
                <button onClick={() => handleStartEdit(selectedAta)} style={btnSecondary}>Editar</button>
                <button onClick={() => handleExportPdf(selectedAta)} style={btnAccent}>Exportar PDF</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditMode(false)} style={btnSecondary}>Cancelar</button>
                <button onClick={handleSaveEdit} disabled={saving} style={btnPrimary}>
                  {saving ? 'Salvando...' : 'Salvar Alteracoes'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Header info */}
        <div style={{ background: '#1B2A4A', borderRadius: 12, padding: '20px 24px', color: 'white', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ fontSize: 11, color: '#C8A96E', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' }}>Ata de Reuniao Semanal</p>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                Semana {c.metadata.semanaFechada} <span style={{ color: '#C8A96E' }}>&rarr;</span> Semana {c.metadata.semanaAberta}
              </h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>Reuniao em {formatDateBR(c.metadata.dataReuniao)}</p>
              <p style={{ fontSize: 11, margin: '2px 0 0', opacity: 0.5 }}>
                {formatDateBR(c.metadata.periodoFechada.inicio)} — {formatDateBR(c.metadata.periodoAberta.fim)}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {[
              { label: 'Participantes', value: c.participantes.length },
              { label: 'Concluidas', value: c.atividadesConcluidas.length },
              { label: 'Pendentes', value: c.atividadesPendentes.length },
              { label: 'Planejadas', value: c.atividadesPlanejadas.length },
            ].map(m => (
              <div key={m.label}>
                <p style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{m.value}</p>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', margin: 0 }}>{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Participantes — sem coluna Presenca */}
        <SectionTitle title="Participantes da Reuniao" />
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={th}>Nome</th>
                <th style={th}>Modalidade</th>
              </tr>
            </thead>
            <tbody>
              {c.participantes.map((p, i) => (
                <tr key={i} style={i % 2 !== 0 ? { background: '#FAFAF8' } : {}}>
                  <td style={td}><strong>{p.nome}</strong></td>
                  <td style={td}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: p.modalidade === 'online' ? '#EFF6FF' : '#F0FDF4',
                      color: p.modalidade === 'online' ? '#2563EB' : '#16A34A',
                    }}>
                      {p.modalidade === 'online' ? 'Online' : 'Presencial'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Atividades Concluidas */}
        {c.atividadesConcluidas.length > 0 && (
          <>
            <SectionTitle title={`Atividades Concluidas — Semana ${c.metadata.semanaFechada}`} color="#16A34A" />
            <ActivityTable activities={c.atividadesConcluidas} color="#16A34A" showStatus={false} />
          </>
        )}

        {/* Atividades Pendentes */}
        {c.atividadesPendentes.length > 0 && (
          <>
            <SectionTitle title={`Atividades Pendentes — Semana ${c.metadata.semanaFechada}`} color="#D97706" />
            <ActivityTable activities={c.atividadesPendentes} color="#D97706" showStatus />
          </>
        )}

        {/* Atividades Planejadas */}
        {c.atividadesPlanejadas.length > 0 && (
          <>
            <SectionTitle title={`Atividades Programadas — Semana ${c.metadata.semanaAberta}`} color="#2563EB" />
            <ActivityTable activities={c.atividadesPlanejadas} color="#2563EB" showStatus />
          </>
        )}

        {/* Relatorio da Reuniao */}
        {c.resumoTranscricao && (
          <>
            <SectionTitle title="Relatorio da Reuniao" />

            <div style={{ background: '#F8F7F4', borderLeft: '3px solid #C8A96E', padding: '14px 18px', borderRadius: 6, marginBottom: 16 }}>
              {editMode ? (
                <textarea
                  value={editConteudo?.resumoTranscricao?.sumario || ''}
                  onChange={e => setEditConteudo(prev => prev ? { ...prev, resumoTranscricao: { ...prev.resumoTranscricao!, sumario: e.target.value } } : prev)}
                  style={{ width: '100%', minHeight: 60, border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, fontFamily: FONT, fontSize: 13, resize: 'vertical' }}
                />
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: '#4a4a5a', lineHeight: 1.6 }}>{c.resumoTranscricao.sumario}</p>
              )}
            </div>

            {c.resumoTranscricao.decisoes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1B2A4A', margin: '0 0 8px' }}>Decisoes Tomadas</h4>
                {c.resumoTranscricao.decisoes.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, padding: '4px 0' }}>
                    <span style={{ color: '#C8A96E', fontWeight: 700, minWidth: 18 }}>{i + 1}.</span>
                    {editMode ? (
                      <input
                        value={editConteudo?.resumoTranscricao?.decisoes[i] || ''}
                        onChange={e => {
                          const newD = [...(editConteudo?.resumoTranscricao?.decisoes || [])];
                          newD[i] = e.target.value;
                          setEditConteudo(prev => prev ? { ...prev, resumoTranscricao: { ...prev.resumoTranscricao!, decisoes: newD } } : prev);
                        }}
                        style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 4, padding: '4px 8px', fontFamily: FONT, fontSize: 13 }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: '#4a4a5a' }}>{d}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {c.resumoTranscricao.acoes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1B2A4A', margin: '0 0 8px' }}>Acoes Definidas</h4>
                {c.resumoTranscricao.acoes.map((a, i) => (
                  <div key={i} style={{ background: '#FFF', border: '1px solid #E8E6E1', borderRadius: 8, borderTop: '2.5px solid #C8A96E', padding: '10px 14px', marginBottom: 8 }}>
                    {editMode ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input value={editConteudo?.resumoTranscricao?.acoes[i]?.descricao || ''} onChange={e => { const newA = [...(editConteudo?.resumoTranscricao?.acoes || [])]; newA[i] = { ...newA[i], descricao: e.target.value }; setEditConteudo(prev => prev ? { ...prev, resumoTranscricao: { ...prev.resumoTranscricao!, acoes: newA } } : prev); }} placeholder="Descricao" style={inputStyle} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input value={editConteudo?.resumoTranscricao?.acoes[i]?.responsavel || ''} onChange={e => { const newA = [...(editConteudo?.resumoTranscricao?.acoes || [])]; newA[i] = { ...newA[i], responsavel: e.target.value }; setEditConteudo(prev => prev ? { ...prev, resumoTranscricao: { ...prev.resumoTranscricao!, acoes: newA } } : prev); }} placeholder="Responsavel" style={{ ...inputStyle, flex: 1 }} />
                          <input value={editConteudo?.resumoTranscricao?.acoes[i]?.prazo || ''} onChange={e => { const newA = [...(editConteudo?.resumoTranscricao?.acoes || [])]; newA[i] = { ...newA[i], prazo: e.target.value }; setEditConteudo(prev => prev ? { ...prev, resumoTranscricao: { ...prev.resumoTranscricao!, acoes: newA } } : prev); }} placeholder="Prazo" style={{ ...inputStyle, width: 140 }} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1B2A4A', margin: '0 0 3px' }}>{a.descricao}</p>
                        <p style={{ fontSize: 11, color: '#7a7a8a', margin: 0 }}>Responsavel: {a.responsavel} | Prazo: {a.prazo}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {c.resumoTranscricao.estacionamento.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1B2A4A', margin: '0 0 8px' }}>Itens de Estacionamento</h4>
                {c.resumoTranscricao.estacionamento.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#C8A96E', fontWeight: 700 }}>-</span>
                    <span style={{ fontSize: 13, color: '#4a4a5a' }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {c.resumoTranscricao.riscosBlockers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1B2A4A', margin: '0 0 8px' }}>Riscos e Bloqueios</h4>
                {c.resumoTranscricao.riscosBlockers.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#DC2626', fontWeight: 700 }}>!</span>
                    <span style={{ fontSize: 13, color: '#4a4a5a' }}>{r}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Fotos */}
        {c.fotos && c.fotos.length > 0 && (
          <>
            <SectionTitle title="Registro Fotografico" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
              {c.fotos.map((foto, i) => (
                <div key={i} style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={foto.url} alt={foto.legenda} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
                  <p style={{ padding: '8px 12px', margin: 0, fontSize: 12, color: '#4a4a5a', background: '#F8F7F4' }}>{foto.legenda || 'Sem legenda'}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Observacoes */}
        <SectionTitle title="Observacoes" />
        <div style={{ background: '#F8F7F4', borderLeft: '3px solid #C8A96E', padding: '14px 18px', borderRadius: 6, marginBottom: 20 }}>
          {editMode ? (
            <textarea
              value={editConteudo?.observacoes || ''}
              onChange={e => setEditConteudo(prev => prev ? { ...prev, observacoes: e.target.value } : prev)}
              placeholder="Adicione observacoes..."
              style={{ width: '100%', minHeight: 80, border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, fontFamily: FONT, fontSize: 13, resize: 'vertical' }}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: '#4a4a5a' }}>{c.observacoes || 'Nenhuma observacao registrada.'}</p>
          )}
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Atas de Reuniao</h2>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Gere e gerencie atas de reunioes semanais</p>
      </div>

      {/* Generate bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: 16, marginBottom: 24,
        background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 12, flexWrap: 'wrap',
      }}>
        <select
          value={selectedSemanaId}
          onChange={e => setSelectedSemanaId(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, fontFamily: FONT, color: '#1E293B', background: '#F8FAFC', minWidth: 220 }}
        >
          <option value="">Selecione uma semana...</option>
          {sortedSemanas.map(s => (
            <option key={s.id} value={s.id}>
              Semana {s.numero} ({s.modo}) — {formatDateBR(s.data_inicio)} a {formatDateBR(s.data_fim)}{s.aberta ? ' [Aberta]' : ''}
            </option>
          ))}
        </select>

        {/* Adicionar Transcricao */}
        <button
          onClick={() => setShowTranscricaoModal(true)}
          style={{
            ...btnSecondary,
            position: 'relative',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>📝</span> Transcricao
          {transcricaoTexto.trim() && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A', position: 'absolute', top: -2, right: -2 }} />
          )}
        </button>

        {/* Adicionar Fotos */}
        <button
          onClick={() => setShowFotosModal(true)}
          style={{
            ...btnSecondary,
            position: 'relative',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>📷</span> Fotos
          {fotosParaUpload.length > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              background: '#C8A96E', color: '#FFF', fontSize: 10, fontWeight: 700,
              width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {fotosParaUpload.length}
            </span>
          )}
        </button>

        {/* Gerar Ata */}
        <button
          onClick={handleGenerate}
          disabled={generating || !selectedSemanaId}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: generating ? '#94A3B8' : '#C8A96E', color: '#FFF',
            fontSize: 14, fontWeight: 600, cursor: generating ? 'wait' : 'pointer',
            fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Gerando...
            </>
          ) : 'Gerar Ata'}
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* ── Modal Transcricao ──────────────────────────────────────────────── */}
      {showTranscricaoModal && (
        <div style={modalOverlay} onClick={() => setShowTranscricaoModal(false)}>
          <div style={{ ...modalBox, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#1B2A4A' }}>Adicionar Transcricao</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94A3B8' }}>Carregue uma transcricao existente ou cole o texto manualmente. Sera processado por IA.</p>

            {/* Lista de transcricoes existentes */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>Transcricoes disponiveis — clique para carregar:</p>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                {transcricoes.length === 0 && (
                  <div style={{ padding: '20px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
                    Nenhuma transcricao encontrada para esta fazenda. Transcricoes de audio podem ser criadas na aba "Transcricoes".
                  </div>
                )}
                {transcricoes.map(t => {
                  const hasText = t.texto && t.texto.trim().length > 0;
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        if (hasText) setTranscricaoTexto(prev => prev ? prev + '\n\n' + t.texto! : t.texto!);
                        else onToast?.('Esta transcricao nao possui texto extraido', 'warning');
                      }}
                      style={{
                        padding: '10px 14px', borderBottom: '1px solid #F1F5F9',
                        cursor: hasText ? 'pointer' : 'not-allowed',
                        opacity: hasText ? 1 : 0.5,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (hasText) e.currentTarget.style.background = '#F8FAFC'; }}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                            background: t.tipo === 'audio' ? '#FEF3C7' : '#EFF6FF',
                            color: t.tipo === 'audio' ? '#D97706' : '#2563EB',
                          }}>
                            {t.tipo === 'audio' ? 'Audio' : 'Documento'}
                          </span>
                          {t.semanaNumero != null && <span style={{ fontSize: 11, color: '#94A3B8' }}>Semana {t.semanaNumero}</span>}
                          <span style={{ fontSize: 11, color: '#CBD5E1' }}>{t.originalName}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {hasText ? t.texto!.substring(0, 120) + '...' : 'Sem texto extraido'}
                        </p>
                      </div>
                      {hasText && <span style={{ ...btnSecondary, fontSize: 11, padding: '4px 10px', flexShrink: 0, marginLeft: 8 }}>Carregar</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <textarea
              value={transcricaoTexto}
              onChange={e => setTranscricaoTexto(e.target.value)}
              placeholder="Cole aqui o texto da transcricao..."
              style={{ width: '100%', minHeight: 180, border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, fontFamily: FONT, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{transcricaoTexto.length > 0 ? `${transcricaoTexto.length} caracteres` : ''}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setTranscricaoTexto('')} style={btnSecondary}>Limpar</button>
                <button onClick={() => setShowTranscricaoModal(false)} style={btnPrimary}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Fotos ────────────────────────────────────────────────────── */}
      {showFotosModal && (
        <div style={modalOverlay} onClick={() => setShowFotosModal(false)}>
          <div style={{ ...modalBox, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#1B2A4A' }}>Adicionar Fotos</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94A3B8' }}>Selecione fotos e adicione legendas. Serao incluidas na ata e no PDF.</p>

            <input ref={fotosInputRef} type="file" accept="image/*" multiple onChange={handleFotosSelect} style={{ display: 'none' }} />
            <button onClick={() => fotosInputRef.current?.click()} style={{ ...btnSecondary, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>+</span> Selecionar Fotos
            </button>

            {fotosParaUpload.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
                {fotosParaUpload.map((foto, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 10, border: '1px solid #E2E8F0', borderRadius: 8 }}>
                    <img src={foto.preview} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 6px', fontSize: 11, color: '#94A3B8' }}>{foto.file.name}</p>
                      <input
                        value={foto.legenda}
                        onChange={e => handleFotoLegenda(i, e.target.value)}
                        placeholder="Legenda da foto..."
                        style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', fontFamily: FONT, fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                    <button onClick={() => handleFotoRemove(i)} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>x</button>
                  </div>
                ))}
              </div>
            )}

            {fotosParaUpload.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: 8 }}>
                <p style={{ margin: 0 }}>Nenhuma foto selecionada</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowFotosModal(false)} style={btnPrimary}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
          <p>Carregando...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && atas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#64748B', margin: '0 0 4px' }}>Nenhuma ata gerada</p>
          <p style={{ fontSize: 13, margin: 0 }}>Selecione uma semana e clique em "Gerar Ata" para comecar.</p>
        </div>
      )}

      {/* Ata cards */}
      {!loading && atas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {atas.map(ata => {
            const ac = ata.conteudo as AtaConteudo;
            return (
              <div
                key={ata.id}
                style={{
                  background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 12,
                  padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: 12, transition: 'box-shadow 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ background: '#1B2A4A', color: '#C8A96E', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6 }}>
                      S{ac.metadata.semanaFechada} &rarr; S{ac.metadata.semanaAberta}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>Reuniao em {formatDateBR(ac.metadata.dataReuniao)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: '#94A3B8' }}>
                    <span>{ac.participantes.length} participantes</span>
                    <span>{ac.atividadesConcluidas.length} concluidas</span>
                    <span>{ac.atividadesPendentes.length} pendentes</span>
                    {ac.resumoTranscricao && <span style={{ color: '#C8A96E' }}>IA processada</span>}
                    {ac.fotos && ac.fotos.length > 0 && <span>{ac.fotos.length} fotos</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setSelectedAta(ata)} style={btnSecondary}>Visualizar</button>
                  <button onClick={() => handleExportPdf(ata)} style={btnAccent}>PDF</button>
                  {confirmDeleteId === ata.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleDelete(ata.id)} style={{ ...btnSecondary, color: '#DC2626', borderColor: '#FCA5A5' }}>Confirmar</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={btnSecondary}>Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(ata.id)} style={{ ...btnSecondary, color: '#DC2626' }}>Excluir</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ title, color }: { title: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 12px' }}>
      {color && <div style={{ width: 4, height: 18, borderRadius: 2, background: color }} />}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1B2A4A', margin: 0, fontFamily: FONT }}>{title}</h3>
      <div style={{ flex: 1, height: 1, background: '#E8E6E1' }} />
    </div>
  );
}

function ActivityTable({ activities, color, showStatus }: {
  activities: Array<{ titulo: string; responsavel: string; tag: string; status?: string }>;
  color: string;
  showStatus: boolean;
}) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: color, color: '#FFF' }}>
            <th style={{ ...th, color: '#FFF' }}>Atividade</th>
            <th style={{ ...th, color: '#FFF' }}>Responsavel</th>
            {showStatus && <th style={{ ...th, color: '#FFF' }}>Status</th>}
            <th style={{ ...th, color: '#FFF' }}>Tag</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a, i) => (
            <tr key={i} style={i % 2 !== 0 ? { background: '#FAFAF8' } : {}}>
              <td style={td}><strong>{a.titulo}</strong></td>
              <td style={td}>{a.responsavel || '—'}</td>
              {showStatus && <td style={td}>{a.status || '—'}</td>}
              <td style={td}>{a.tag || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94A3B8', borderBottom: '1px solid #E2E8F0' };
const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #F1F5F9', fontSize: 13 };

const btnBase: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s' };
const btnSecondary: React.CSSProperties = { ...btnBase, border: '1px solid #E2E8F0', background: '#FFF', color: '#475569' };
const btnPrimary: React.CSSProperties = { ...btnBase, border: 'none', background: '#1B2A4A', color: '#FFF' };
const btnAccent: React.CSSProperties = { ...btnBase, border: 'none', background: '#C8A96E', color: '#FFF' };
const inputStyle: React.CSSProperties = { border: '1px solid #E2E8F0', borderRadius: 4, padding: '4px 8px', fontFamily: FONT, fontSize: 13 };

const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox: React.CSSProperties = { background: '#FFF', borderRadius: 12, padding: 24, width: '90%', maxWidth: 560, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' };

export default AtasView;
