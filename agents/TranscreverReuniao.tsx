import React, { useState, useRef, useEffect } from 'react';
import { Mic, Upload, Loader2, CheckCircle, AlertCircle, Copy, Save } from 'lucide-react';
import { getAuthHeaders } from '../lib/session';
import { createTranscricao } from '../lib/api/semanaTranscricoesClient';
import { useFarm } from '../contexts/FarmContext';
import { useAuth } from '../contexts/AuthContext';
import { listSemanasByFarm } from '../lib/api/semanasClient';

const ACCEPTED_TYPES = '.mp3,.m4a,.wav,.webm,.ogg';
const MAX_MB = 200;
const FONT = "'DM Sans', sans-serif";

const PT_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function formatDateShort(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

interface SemanaOption {
  id: string;
  numero: number;
  data_inicio: string;
  data_fim: string;
  modo: string;
  aberta: boolean;
}

interface TranscricaoData {
  texto: string;
  modelo: string;
  chunks: number;
}

interface TranscreverReuniaoProps {
  farmId?: string;
  organizationId?: string;
  semanas?: SemanaOption[];
  onSaved?: () => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function TranscreverReuniao({ farmId: farmIdProp, organizationId: orgIdProp, semanas: semanasProp, onSaved, onToast }: TranscreverReuniaoProps) {
  const { selectedFarm } = useFarm();
  const { user } = useAuth();

  const farmId = farmIdProp ?? selectedFarm?.id ?? '';
  const organizationId = orgIdProp ?? user?.organizationId ?? '';

  const [localSemanas, setLocalSemanas] = useState<SemanaOption[]>([]);
  const semanas = semanasProp ?? localSemanas;

  // Carregar semanas quando não recebidas via prop
  useEffect(() => {
    if (semanasProp || !farmId) return;
    listSemanasByFarm(farmId).then(rows =>
      setLocalSemanas(rows.map(s => ({
        id: s.id,
        numero: s.numero,
        data_inicio: s.data_inicio,
        data_fim: s.data_fim,
        modo: s.modo,
        aberta: s.aberta,
      }))),
    ).catch(() => setLocalSemanas([]));
  }, [farmId, semanasProp]);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscricaoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedSemanaId, setSelectedSemanaId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Selecionar semana aberta quando semanas carregarem
  useEffect(() => {
    if (!selectedSemanaId && semanas.length > 0) {
      setSelectedSemanaId(semanas.find(s => s.aberta)?.id ?? semanas[0]?.id ?? '');
    }
  }, [semanas, selectedSemanaId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setError(null);
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || loading) return;
    if (!selectedSemanaId) {
      setError('Selecione uma reunião semanal.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);

    try {
      const authHeaders = await getAuthHeaders();
      const formData = new FormData();
      formData.append('audio', file);

      const res = await fetch('/api/transcrever-reuniao', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      const json = (await res.json()) as { ok: boolean; data?: TranscricaoData; error?: string };

      if (json.ok && json.data) {
        setResult(json.data);
      } else {
        setError(json.error ?? `Erro ${res.status}`);
      }
    } catch (err) {
      setError((err as Error).message ?? 'Falha na requisição.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.texto);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    if (!result || !selectedSemanaId || saving || saved) return;
    setSaving(true);
    try {
      await createTranscricao({
        semanaId: selectedSemanaId,
        farmId,
        organizationId,
        tipo: 'audio',
        texto: result.texto,
        originalName: file?.name ?? 'audio',
        descricao: file ? `Transcrição de áudio: ${file.name}` : null,
      });
      setSaved(true);
      onToast?.('Transcrição salva com sucesso!', 'success');
      onSaved?.();
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Erro ao salvar transcrição.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setFile(null);
    setResult(null);
    setError(null);
    setSaved(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;
  const selectedSemana = semanas.find(s => s.id === selectedSemanaId);

  return (
    <div style={{
      background: '#FFF', borderRadius: 12, border: '1px solid #E2E8F0',
      padding: 24, fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Mic className="text-ai-accent shrink-0" size={20} />
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', margin: 0 }}>
            Transcrição de Áudio
          </p>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>
            Faça upload do áudio da reunião e receba a transcrição em texto
          </p>
        </div>
      </div>

      {/* Week selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
          Reunião Semanal
        </label>
        <select
          value={selectedSemanaId}
          onChange={e => setSelectedSemanaId(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid #E2E8F0', fontSize: 13, color: '#0F172A',
            fontFamily: FONT, background: '#F8FAFC', cursor: 'pointer',
            outline: 'none',
          }}
        >
          {semanas.length === 0 && (
            <option value="">Nenhuma semana disponível</option>
          )}
          {semanas.map(s => (
            <option key={s.id} value={s.id}>
              Semana {String(s.numero).padStart(2, '0')} — {formatDateShort(s.data_inicio)} a {formatDateShort(s.data_fim)}
              {s.aberta ? ' (aberta)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Upload form */}
      <form onSubmit={handleSubmit}>
        <div
          role="button"
          tabIndex={0}
          style={{
            border: '2px dashed #E2E8F0', borderRadius: 12, padding: '28px 16px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            cursor: 'pointer', transition: 'border-color 0.15s',
            background: '#FAFBFC',
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
        >
          <Upload size={24} style={{ color: '#94A3B8' }} />
          {file ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', margin: 0 }}>{file.name}</p>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>{fileSizeMB} MB</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#0F172A', margin: 0 }}>Clique para selecionar o arquivo de áudio</p>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>
                mp3, m4a, wav, webm — até {MAX_MB} MB
              </p>
              <p style={{ fontSize: 11, color: '#3B82F6', margin: '2px 0 0', opacity: 0.7 }}>
                arquivos acima de 25 MB são divididos automaticamente
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        <button
          type="submit"
          disabled={!file || loading || !selectedSemanaId}
          style={{
            width: '100%', marginTop: 12, padding: '10px 16px', borderRadius: 8,
            border: 'none', fontSize: 13, fontWeight: 600, fontFamily: FONT,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: file && !loading && selectedSemanaId ? 'pointer' : 'not-allowed',
            background: file && !loading && selectedSemanaId ? '#3B82F6' : '#E2E8F0',
            color: file && !loading && selectedSemanaId ? '#FFF' : '#94A3B8',
            transition: 'opacity 0.15s',
          }}
        >
          {loading ? (
            <>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              Transcrevendo...
            </>
          ) : (
            <>
              <Mic size={15} />
              Transcrever
            </>
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: 12, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA',
        }}>
          <AlertCircle size={15} style={{ color: '#DC2626', marginTop: 1, flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CheckCircle size={15} style={{ color: '#059669', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Transcrição concluída</span>
            <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
              {result.modelo}
              {result.chunks > 1 && ` · ${result.chunks} partes`}
            </span>
          </div>

          <div style={{
            padding: 14, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0',
            maxHeight: 300, overflowY: 'auto',
          }}>
            <pre style={{
              fontSize: 13, color: '#0F172A', whiteSpace: 'pre-wrap',
              fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, margin: 0,
            }}>
              {result.texto}
            </pre>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFF',
                color: '#475569', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT,
              }}
            >
              <Copy size={12} />
              {copied ? 'Copiado!' : 'Copiar texto'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
                borderRadius: 6, border: 'none', fontFamily: FONT,
                background: saved ? '#ECFDF5' : saving ? '#E2E8F0' : '#059669',
                color: saved ? '#059669' : saving ? '#94A3B8' : '#FFF',
                fontSize: 12, fontWeight: 600,
                cursor: saving || saved ? 'default' : 'pointer',
              }}
            >
              {saved ? (
                <>
                  <CheckCircle size={12} />
                  Salvo
                </>
              ) : saving ? (
                <>
                  <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={12} />
                  Salvar Transcrição
                </>
              )}
            </button>

            {saved && (
              <button
                type="button"
                onClick={handleReset}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                  borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFF',
                  color: '#475569', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT,
                }}
              >
                Nova transcrição
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
