import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain,
  FileText,
  Upload,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Settings,
  BarChart3,
  Zap,
  RefreshCw,
  Plus,
  Star,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  XCircle,
  Hash,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../lib/session';
import { storageUpload } from '../lib/storage';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface KnowledgeDocument {
  id: string;
  title: string;
  source_type: string;
  status: string;
  error_message: string | null;
  file_size_bytes: number | null;
  chunk_count: number | null;
  collection_name: string | null;
  created_at: string;
  updated_at: string;
}

interface IngestionJob {
  id: string;
  document_id: string;
  document_title: string;
  status: string;
  step: string | null;
  chunks_total: number | null;
  chunks_done: number;
  embedding_tokens_used: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface KnowledgeStats {
  published_documents: number;
  total_chunks: number;
  total_queries: number;
  avg_latency_ms: number | null;
  avg_rating: number | null;
  queries_last_7d: number;
  total_embedding_tokens: number;
  total_query_tokens: number;
}

interface RetrievalLog {
  id: string;
  question: string;
  answer: string | null;
  model: string | null;
  tokens_used: number | null;
  latency_ms: number | null;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

type Tab = 'documentos' | 'processamento' | 'config' | 'logs';

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sourceTypeExt(type: string): string {
  const map: Record<string, string> = { pdf: 'PDF', docx: 'DOCX', txt: 'TXT', md: 'Markdown' };
  return map[type] ?? type.toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    pending:    { color: 'bg-gray-100 text-gray-600', label: 'Pendente' },
    extracting: { color: 'bg-blue-100 text-blue-700', label: 'Extraindo' },
    chunking:   { color: 'bg-indigo-100 text-indigo-700', label: 'Chunkando' },
    embedding:  { color: 'bg-violet-100 text-violet-700', label: 'Vetorizando' },
    published:  { color: 'bg-green-100 text-green-700', label: 'Publicado' },
    error:      { color: 'bg-red-100 text-red-700', label: 'Erro' },
    queued:     { color: 'bg-yellow-100 text-yellow-700', label: 'Na fila' },
    running:    { color: 'bg-blue-100 text-blue-700', label: 'Processando' },
    completed:  { color: 'bg-green-100 text-green-700', label: 'Concluído' },
    failed:     { color: 'bg-red-100 text-red-700', label: 'Falhou' },
  };
  const c = config[status] ?? { color: 'bg-gray-100 text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      {(status === 'extracting' || status === 'chunking' || status === 'embedding' || status === 'running') && (
        <Loader2 size={10} className="animate-spin" />
      )}
      {status === 'published' || status === 'completed' ? <CheckCircle size={10} /> : null}
      {status === 'error' || status === 'failed' ? <XCircle size={10} /> : null}
      {c.label}
    </span>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

const AntonioAdmin: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('documentos');

  // Estado — Documentos
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado — Jobs
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Estado — Stats & Logs
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [logs, setLogs] = useState<RetrievalLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Estado — Config
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Toast simples
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch — hooks devem vir ANTES de qualquer return condicional ──────────────

  const fetchDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/knowledge?action=documents', { headers });
      const json = await res.json();
      if (json.ok) setDocuments(json.data);
    } catch { /* silencioso */ }
    finally { setLoadingDocs(false); }
  }, []);

  const fetchCollections = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/knowledge?action=collections', { headers });
      const json = await res.json();
      if (json.ok) setCollections(json.data);
    } catch { /* silencioso */ }
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/knowledge?action=jobs', { headers });
      const json = await res.json();
      if (json.ok) setJobs(json.data);
    } catch { /* silencioso */ }
    finally { setLoadingJobs(false); }
  }, []);

  const fetchStatsAndLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const headers = await getAuthHeaders();
      const [sRes, lRes] = await Promise.all([
        fetch('/api/knowledge?action=stats', { headers }),
        fetch('/api/knowledge?action=logs&limit=50', { headers }),
      ]);
      const sJson = await sRes.json();
      const lJson = await lRes.json();
      if (sJson.ok) setStats(sJson.data);
      if (lJson.ok) setLogs(lJson.data);
    } catch { /* silencioso */ }
    finally { setLoadingLogs(false); }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchCollections();
  }, []);

  useEffect(() => {
    if (activeTab === 'processamento') fetchJobs();
    if (activeTab === 'logs') fetchStatsAndLogs();
  }, [activeTab]);

  // Polling para jobs em execução
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'running' || j.status === 'queued');
    if (!hasRunning) return;
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [jobs]);

  // ── Upload de arquivo ────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const supportedTypes: Record<string, string> = { pdf: 'pdf', docx: 'docx', txt: 'txt', md: 'md' };
    const sourceType = supportedTypes[ext];
    if (!sourceType) {
      showToast('Formato não suportado. Use PDF, DOCX, TXT ou MD.', 'error');
      return;
    }

    setUploadingFile(true);
    try {
      const uniqueKey = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storageKey = `knowledge-docs/${uniqueKey}`;

      // 1. Upload para B2
      await storageUpload('knowledge-docs', uniqueKey, file, { contentType: file.type });

      // 2. Registrar no banco
      const headers = await getAuthHeaders();
      const res = await fetch('/api/knowledge?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, ''),
          sourceType,
          storageKey,
          fileSizeBytes: file.size,
          collectionId: selectedCollectionId || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro ao registrar documento');

      showToast(`"${file.name}" enviado com sucesso. Clique em "Processar" para vetorizar.`);
      await fetchDocuments();
    } catch (err: any) {
      showToast(err.message ?? 'Erro no upload', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  // ── Processar (pipeline de ingestão) ────────────────────────────────────────

  const handleProcess = async (documentId: string) => {
    setProcessingId(documentId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/knowledge?action=process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro no processamento');
      showToast('Documento vetorizado e publicado com sucesso!');
      await fetchDocuments();
    } catch (err: any) {
      showToast(err.message ?? 'Erro ao processar', 'error');
      await fetchDocuments();
    } finally {
      setProcessingId(null);
    }
  };

  // ── Deletar documento ────────────────────────────────────────────────────────

  const handleDelete = async (documentId: string, title: string) => {
    if (!confirm(`Remover "${title}" e todos os seus chunks da base de conhecimento?`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/knowledge?action=document&documentId=${documentId}`, {
        method: 'DELETE',
        headers,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro ao deletar');
      showToast(`"${title}" removido da base.`);
      await fetchDocuments();
    } catch (err: any) {
      showToast(err.message ?? 'Erro ao remover', 'error');
    }
  };

  // ── Criar coleção ────────────────────────────────────────────────────────────

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    setCreatingCollection(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/knowledge?action=collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: newCollectionName.trim(), description: newCollectionDesc.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Erro ao criar coleção');
      showToast(`Coleção "${newCollectionName}" criada.`);
      setNewCollectionName('');
      setNewCollectionDesc('');
      await fetchCollections();
    } catch (err: any) {
      showToast(err.message ?? 'Erro', 'error');
    } finally {
      setCreatingCollection(false);
    }
  };

  // ── Acesso restrito (após todos os hooks) ───────────────────────────────────
  if (!user || user.role !== 'admin') {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="mx-auto mb-4 text-rose-500" />
          <h2 className="text-lg font-bold text-ai-text">Acesso Restrito</h2>
          <p className="text-sm text-ai-subtext mt-1">Apenas administradores podem acessar a base de conhecimento.</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'documentos', label: 'Documentos', icon: <FileText size={15} />, count: documents.length },
    { id: 'processamento', label: 'Processamento', icon: <Zap size={15} /> },
    { id: 'config', label: 'Configurações', icon: <Settings size={15} /> },
    { id: 'logs', label: 'Logs e avaliação', icon: <BarChart3 size={15} /> },
  ];

  return (
    <div className="h-full flex flex-col bg-white rounded-lg border border-ai-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-ai-border bg-ai-surface/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ai-text text-white flex items-center justify-center">
              <Brain size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ai-text">Antonio — Base de Conhecimento</h3>
              <p className="text-xs text-ai-subtext">RAG com pgvector + Voyage AI</p>
            </div>
          </div>
          <button
            onClick={() => { fetchDocuments(); fetchCollections(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ai-subtext hover:text-ai-text border border-ai-border rounded-md transition-colors"
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-ai-border bg-white px-4 shrink-0 flex overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-ai-accent text-ai-accent'
                : 'border-transparent text-ai-subtext hover:text-ai-text'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 px-1.5 py-0.5 bg-ai-surface text-ai-subtext rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Tab: Documentos ─────────────────────────────────────────────── */}
        {activeTab === 'documentos' && (
          <div className="p-6 space-y-5">
            {/* Upload area */}
            <div className="border-2 border-dashed border-ai-border rounded-xl p-6 text-center bg-ai-surface/30 hover:bg-ai-surface/50 transition-colors">
              <Upload size={28} className="mx-auto mb-3 text-ai-subtext" />
              <p className="text-sm font-medium text-ai-text mb-1">Arraste um arquivo ou clique para selecionar</p>
              <p className="text-xs text-ai-subtext mb-4">PDF, DOCX, TXT ou Markdown</p>

              {collections.length > 0 && (
                <div className="mb-3 flex justify-center">
                  <select
                    value={selectedCollectionId}
                    onChange={e => setSelectedCollectionId(e.target.value)}
                    className="text-xs border border-ai-border rounded-md px-2 py-1.5 bg-white text-ai-text"
                  >
                    <option value="">Sem coleção</option>
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="px-4 py-2 text-sm bg-ai-text text-white rounded-lg hover:bg-ai-text/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
              >
                {uploadingFile ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <><Upload size={14} /> Selecionar arquivo</>}
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={handleFileSelect} />
            </div>

            {/* Lista de documentos */}
            <div>
              <h4 className="text-xs font-semibold text-ai-subtext uppercase tracking-wide mb-3">
                Base de documentos ({documents.length})
              </h4>

              {loadingDocs ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-ai-subtext" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-ai-subtext">
                  <FileText size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum documento na base. Faça o upload acima.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border border-ai-border rounded-lg bg-white hover:bg-ai-surface/20 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={16} className="text-ai-subtext shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ai-text truncate">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-ai-subtext">{sourceTypeExt(doc.source_type)}</span>
                            {doc.file_size_bytes && <span className="text-xs text-ai-subtext">· {formatBytes(doc.file_size_bytes)}</span>}
                            {doc.chunk_count ? <span className="text-xs text-ai-subtext">· {doc.chunk_count} chunks</span> : null}
                            {doc.collection_name && <span className="text-xs text-ai-subtext">· {doc.collection_name}</span>}
                          </div>
                          {doc.error_message && <p className="text-xs text-red-500 mt-0.5 truncate">{doc.error_message}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <StatusBadge status={doc.status} />
                        {(doc.status === 'pending' || doc.status === 'error') && (
                          <button
                            onClick={() => handleProcess(doc.id)}
                            disabled={processingId === doc.id}
                            className="px-2 py-1 text-xs bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 disabled:opacity-50 flex items-center gap-1 transition-colors"
                          >
                            {processingId === doc.id ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                            Processar
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(doc.id, doc.title)}
                          className="p-1.5 text-ai-subtext hover:text-red-500 rounded-md transition-colors"
                          title="Remover documento"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Processamento ──────────────────────────────────────────── */}
        {activeTab === 'processamento' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-ai-subtext uppercase tracking-wide">
                Jobs de ingestão ({jobs.length})
              </h4>
              <button
                onClick={fetchJobs}
                disabled={loadingJobs}
                className="flex items-center gap-1 text-xs text-ai-subtext hover:text-ai-text"
              >
                <RefreshCw size={12} className={loadingJobs ? 'animate-spin' : ''} /> Atualizar
              </button>
            </div>

            {/* Pipeline visual */}
            <div className="flex items-center gap-1 text-xs text-ai-subtext overflow-x-auto pb-2">
              {['pending', 'extracting', 'chunking', 'embedding', 'published'].map((step, i, arr) => (
                <React.Fragment key={step}>
                  <span className="px-2 py-1 bg-ai-surface rounded-md whitespace-nowrap capitalize">{step}</span>
                  {i < arr.length - 1 && <ChevronRight size={12} className="shrink-0" />}
                </React.Fragment>
              ))}
            </div>

            {loadingJobs ? (
              <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-ai-subtext" /></div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-8 text-ai-subtext">
                <Clock size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum job de processamento ainda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map(job => {
                  const progress = job.chunks_total ? Math.round((job.chunks_done / job.chunks_total) * 100) : 0;
                  return (
                    <div key={job.id} className="p-3 border border-ai-border rounded-lg bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ai-text truncate">{job.document_title}</p>
                          <p className="text-xs text-ai-subtext">
                            {job.step ? `Etapa: ${job.step}` : 'Aguardando'}
                            {job.embedding_tokens_used > 0 && ` · ${job.embedding_tokens_used.toLocaleString()} tokens`}
                          </p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>

                      {job.chunks_total && job.status !== 'completed' && (
                        <div>
                          <div className="flex justify-between text-xs text-ai-subtext mb-1">
                            <span>{job.chunks_done} / {job.chunks_total} chunks</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-1.5 bg-ai-surface rounded-full overflow-hidden">
                            <div
                              className="h-full bg-ai-accent rounded-full transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {job.error_message && (
                        <p className="text-xs text-red-500 bg-red-50 rounded p-2">{job.error_message}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Configurações ──────────────────────────────────────────── */}
        {activeTab === 'config' && (
          <div className="p-6 space-y-6">
            {/* Parâmetros de embedding (informativos) */}
            <div>
              <h4 className="text-xs font-semibold text-ai-subtext uppercase tracking-wide mb-3">Configurações de embedding</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Modelo de embedding', value: 'voyage-3-large (1024 dims)' },
                  { label: 'Modelo de resposta', value: 'Claude Sonnet 4.6' },
                  { label: 'Tamanho do chunk', value: '1.000 chars (~750 tokens)' },
                  { label: 'Overlap do chunk', value: '200 chars' },
                  { label: 'Top-K na busca', value: '6 chunks' },
                  { label: 'Índice pgvector', value: 'HNSW (cosine)' },
                ].map(item => (
                  <div key={item.label} className="p-3 bg-ai-surface/30 rounded-lg border border-ai-border">
                    <p className="text-xs text-ai-subtext mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-ai-text">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Coleções */}
            <div>
              <h4 className="text-xs font-semibold text-ai-subtext uppercase tracking-wide mb-3">
                Coleções de documentos ({collections.length})
              </h4>

              {collections.length > 0 && (
                <div className="space-y-2 mb-4">
                  {collections.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 border border-ai-border rounded-lg bg-white">
                      <div>
                        <p className="text-sm font-medium text-ai-text">{c.name}</p>
                        {c.description && <p className="text-xs text-ai-subtext">{c.description}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 border border-dashed border-ai-border rounded-lg space-y-3">
                <p className="text-xs font-medium text-ai-text flex items-center gap-1"><Plus size={12} /> Nova coleção</p>
                <input
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  placeholder="Nome da coleção (ex: Manual da Fazenda)"
                  className="w-full text-sm border border-ai-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ai-accent"
                />
                <input
                  value={newCollectionDesc}
                  onChange={e => setNewCollectionDesc(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="w-full text-sm border border-ai-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ai-accent"
                />
                <button
                  onClick={handleCreateCollection}
                  disabled={!newCollectionName.trim() || creatingCollection}
                  className="px-4 py-2 text-sm bg-ai-text text-white rounded-lg hover:bg-ai-text/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {creatingCollection ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Criar coleção
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Logs e avaliação ───────────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div className="p-6 space-y-6">
            {/* Métricas */}
            {stats && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Docs publicados', value: stats.published_documents, icon: <FileText size={16} /> },
                  { label: 'Total de chunks', value: stats.total_chunks?.toLocaleString() ?? '—', icon: <Brain size={16} /> },
                  { label: 'Total de consultas', value: stats.total_queries, icon: <MessageSquare size={16} /> },
                  { label: 'Consultas (7 dias)', value: stats.queries_last_7d, icon: <BarChart3 size={16} /> },
                  { label: 'Latência média', value: stats.avg_latency_ms ? `${stats.avg_latency_ms}ms` : '—', icon: <Zap size={16} /> },
                  { label: 'Avaliação média', value: stats.avg_rating ? `${Number(stats.avg_rating).toFixed(1)} / 5` : '—', icon: <Star size={16} /> },
                  { label: 'Tokens de embedding', value: stats.total_embedding_tokens ? stats.total_embedding_tokens.toLocaleString() : '0', icon: <Hash size={16} /> },
                  { label: 'Tokens de consulta', value: stats.total_query_tokens ? stats.total_query_tokens.toLocaleString() : '0', icon: <Hash size={16} /> },
                ].map(m => (
                  <div key={m.label} className="p-3 border border-ai-border rounded-lg bg-white">
                    <div className="flex items-center gap-2 text-ai-subtext mb-1">{m.icon}<span className="text-xs">{m.label}</span></div>
                    <p className="text-lg font-bold text-ai-text">{m.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tabela de logs */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-ai-subtext uppercase tracking-wide">Últimas consultas</h4>
                <button onClick={fetchStatsAndLogs} className="flex items-center gap-1 text-xs text-ai-subtext hover:text-ai-text">
                  <RefreshCw size={12} className={loadingLogs ? 'animate-spin' : ''} /> Atualizar
                </button>
              </div>

              {loadingLogs ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-ai-subtext" /></div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-ai-subtext">
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma consulta registrada ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => (
                    <LogEntry key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm text-white transition-all ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

// ─── Sub-componente: Log entry ────────────────────────────────────────────────

function LogEntry({ log }: { log: RetrievalLog }) {
  const [expanded, setExpanded] = useState(false);
  const [showFullAnswer, setShowFullAnswer] = useState(false);
  return (
    <div className="border border-ai-border rounded-lg bg-white overflow-hidden">
      <button
        className="w-full flex items-start justify-between p-3 hover:bg-ai-surface/20 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ai-text truncate">{log.question}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-ai-subtext">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
            {log.latency_ms && <span className="text-xs text-ai-subtext">{log.latency_ms}ms</span>}
            {log.rating && (
              <span className="flex items-center gap-0.5 text-xs text-amber-500">
                <Star size={10} className="fill-amber-500" /> {log.rating}/5
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={14} className={`text-ai-subtext shrink-0 ml-2 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-ai-border/50 pt-2 space-y-2">
          {log.answer && (
            <div>
              <p className="text-xs font-medium text-ai-subtext mb-1">Resposta</p>
              <p className={`text-xs text-ai-text bg-ai-surface/30 rounded p-2 whitespace-pre-wrap ${showFullAnswer ? '' : 'line-clamp-6'}`}>{log.answer}</p>
              <button
                onClick={e => { e.stopPropagation(); setShowFullAnswer(v => !v); }}
                className="text-xs text-ai-subtext hover:text-ai-text mt-1 underline underline-offset-2"
              >
                {showFullAnswer ? 'Recolher' : 'Ver completo'}
              </button>
            </div>
          )}
          {log.comment && (
            <div>
              <p className="text-xs font-medium text-ai-subtext mb-1">Comentário do usuário</p>
              <p className="text-xs text-ai-text italic">{log.comment}</p>
            </div>
          )}
          <div className="flex gap-3 text-xs text-ai-subtext">
            {log.model && <span>Modelo: {log.model}</span>}
            {log.tokens_used && <span>Tokens: {log.tokens_used.toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default AntonioAdmin;
