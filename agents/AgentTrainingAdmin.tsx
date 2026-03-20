import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Save,
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
  Settings,
  BookOpen,
  Brain,
} from 'lucide-react';
import { getAuthHeaders } from '../lib/session';
import { storageUpload, storageGetPublicUrl } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';

interface AgentConfig {
  id: string;
  agent_id: string;
  name: string;
  system_prompt: string;
  context_instructions: string;
  is_enabled: boolean;
}

interface TrainingDocument {
  id: string;
  agent_id: string;
  title: string;
  content: string;
  file_type: string;
  created_at: string;
}

interface TrainingImage {
  id: string;
  agent_id: string;
  title: string;
  description: string;
  image_url: string;
  created_at: string;
}

const AgentTrainingAdmin: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [images, setImages] = useState<TrainingImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'documents' | 'images'>('config');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Check admin permission (after all hooks)
  if (!user || user.role !== 'admin') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-rose-500" />
          <h2 className="text-lg font-bold text-ai-text mb-2">Acesso Restrito</h2>
          <p className="text-sm text-ai-subtext">Apenas administradores podem acessar esta página.</p>
        </div>
      </div>
    );
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const headers = await getAuthHeaders();

      // Load config from agent_registry (replaces agent_config)
      const configRes = await fetch('/api/agent-registry', { headers });
      const configJson = await configRes.json() as { ok: boolean; data?: Array<{ id: string; version: string; name: string; description: string; systemPrompt: string }> };
      const agentRow = (configJson.data ?? []).find(a => a.id === 'ask-antonio');
      if (agentRow) {
        setConfig({ id: agentRow.id, agent_id: agentRow.id, name: agentRow.name, system_prompt: agentRow.systemPrompt, context_instructions: '', is_enabled: true });
      }

      // Load documents
      const docsRes = await fetch('/api/agent-training?type=document&agentId=ask-antonio', { headers });
      const docsJson = await docsRes.json() as { ok: boolean; data?: Array<{ id: string; agentId: string; title: string; content: string; fileType: string | null; createdAt: string }> };
      setDocuments((docsJson.data ?? []).map(d => ({ id: d.id, agent_id: d.agentId, title: d.title, content: d.content, file_type: d.fileType ?? '', created_at: d.createdAt })));

      // Load images
      const imgsRes = await fetch('/api/agent-training?type=image&agentId=ask-antonio', { headers });
      const imgsJson = await imgsRes.json() as { ok: boolean; data?: Array<{ id: string; agentId: string; title: string; description: string | null; imageUrl: string; createdAt: string }> };
      setImages((imgsJson.data ?? []).map(i => ({ id: i.id, agent_id: i.agentId, title: i.title, description: i.description ?? '', image_url: i.imageUrl, created_at: i.createdAt })));
    } catch (err: unknown) {
      console.error('Error loading data:', err);
      showToast('Erro ao carregar dados', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    try {
      setIsSaving(true);
      // agent_registry doesn't have version here; use 'v1' as default
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/agent-registry?id=${encodeURIComponent(config.id)}&version=v1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ systemPrompt: config.system_prompt }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao salvar');
      showToast('Configuração salva com sucesso!', 'success');
    } catch (err: unknown) {
      console.error('Error saving config:', err);
      showToast('Erro ao salvar configuração', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async event => {
        const content = event.target?.result as string;

        const headers = await getAuthHeaders();
        const res = await fetch('/api/agent-training?type=document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ agentId: 'ask-antonio', title: file.name, content, fileType: file.type, metadata: { size: file.size } }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? 'Erro ao inserir documento');

        showToast('Documento adicionado com sucesso!', 'success');
        loadData();
      };

      reader.readAsText(file);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      showToast('Erro ao fazer upload do arquivo', 'error');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `agent-training/${fileName}`;

      await storageUpload('public', filePath, file, { contentType: file.type });

      const publicUrl = storageGetPublicUrl('public', filePath);

      // Save to database
      const headers = await getAuthHeaders();
      const res = await fetch('/api/agent-training?type=image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ agentId: 'ask-antonio', title: file.name, description: '', imageUrl: publicUrl, metadata: { size: file.size } }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao inserir imagem');

      showToast('Imagem adicionada com sucesso!', 'success');
      loadData();
    } catch (error: any) {
      console.error('Error uploading image:', error);
      showToast('Erro ao fazer upload da imagem', 'error');
    }

    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar este documento?')) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/agent-training?type=document&id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao deletar');
      showToast('Documento deletado', 'success');
      loadData();
    } catch (err: unknown) {
      console.error('Error deleting document:', err);
      showToast('Erro ao deletar documento', 'error');
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar esta imagem?')) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/agent-training?type=image&id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao deletar');
      showToast('Imagem deletada', 'success');
      loadData();
    } catch (err: unknown) {
      console.error('Error deleting image:', err);
      showToast('Erro ao deletar imagem', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-ai-subtext" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-rose-500" />
          <h2 className="text-lg font-bold text-ai-text mb-2">Configuração não encontrada</h2>
          <p className="text-sm text-ai-subtext">Erro ao carregar configuração do agente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg border border-ai-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-ai-border bg-ai-surface/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ai-text text-white flex items-center justify-center">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ai-text">Treinamento do Agente Antonio</h3>
              <p className="text-xs text-ai-subtext">Configure e treine o assistente virtual</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ai-subtext">Ativo:</span>
              <button
                onClick={() => setConfig({ ...config, is_enabled: !config.is_enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.is_enabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.is_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
            <button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Salvar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-ai-border bg-white px-4">
        <div className="flex gap-1">
          {[
            { id: 'config', label: 'Configuração', icon: <Settings size={16} /> },
            { id: 'documents', label: 'Documentos', icon: <BookOpen size={16} />, count: documents.length },
            { id: 'images', label: 'Imagens', icon: <ImageIcon size={16} />, count: images.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-ai-accent text-ai-accent'
                  : 'border-transparent text-ai-subtext hover:text-ai-text'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1 px-2 py-0.5 bg-ai-surface text-ai-subtext rounded-full text-xs">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Configuration Tab */}
        {activeTab === 'config' && (
          <div className="space-y-6 max-w-3xl">
            {/* System Prompt */}
            <div>
              <label className="block text-sm font-semibold text-ai-text mb-2 flex items-center gap-2">
                <Brain size={16} className="text-ai-accent" />
                System Prompt (Personalidade e Comportamento)
              </label>
              <p className="text-xs text-ai-subtext mb-3">
                Define como o agente se comporta, seu tom de voz e expertise. Este prompt é enviado em todas as
                conversas.
              </p>
              <textarea
                value={config.system_prompt}
                onChange={e => setConfig({ ...config, system_prompt: e.target.value })}
                className="w-full h-40 px-4 py-3 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent resize-none font-mono text-sm"
                placeholder="Ex: Você é um especialista em pecuária..."
              />
            </div>

            {/* Context Instructions */}
            <div>
              <label className="block text-sm font-semibold text-ai-text mb-2">Instruções de Contexto</label>
              <p className="text-xs text-ai-subtext mb-3">
                Instruções adicionais sobre como usar os documentos de treinamento e dados fornecidos.
              </p>
              <textarea
                value={config.context_instructions || ''}
                onChange={e => setConfig({ ...config, context_instructions: e.target.value })}
                className="w-full h-32 px-4 py-3 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent resize-none font-mono text-sm"
                placeholder="Ex: Use os documentos fornecidos para fundamentar suas respostas..."
              />
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>💡 Dica:</strong> Para melhor performance, seja específico sobre a especialidade do agente e
                forneça exemplos de como ele deve responder.
              </p>
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {/* Upload Section */}
            <div className="border-2 border-dashed border-ai-border rounded-lg p-8 text-center bg-ai-surface/30 hover:bg-ai-surface/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.csv,.md"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload size={48} className="mx-auto mb-4 text-ai-subtext" />
              <h3 className="text-sm font-semibold text-ai-text mb-2">Upload de Documentos</h3>
              <p className="text-xs text-ai-subtext mb-4">
                Arquivos de texto, PDF, CSV ou Markdown com informações para treinar o agente.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors flex items-center gap-2 mx-auto"
              >
                <Plus size={16} />
                Adicionar Documento
              </button>
            </div>

            {/* Documents List */}
            <div className="space-y-2">
              {documents.length === 0 ? (
                <div className="text-center py-8 text-ai-subtext">
                  <FileText size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum documento adicionado ainda.</p>
                </div>
              ) : (
                documents.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-3 p-4 bg-white border border-ai-border rounded-lg hover:border-ai-accent/30 transition-colors group"
                  >
                    <FileText size={20} className="text-ai-accent flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-ai-text truncate">{doc.title}</h4>
                      <p className="text-xs text-ai-subtext mt-1 line-clamp-2">{doc.content.substring(0, 150)}...</p>
                      <span className="text-xs text-ai-subtext mt-2 inline-block">
                        {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-ai-subtext hover:text-rose-600 transition-all"
                      title="Deletar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Images Tab */}
        {activeTab === 'images' && (
          <div className="space-y-4">
            {/* Upload Section */}
            <div className="border-2 border-dashed border-ai-border rounded-lg p-8 text-center bg-ai-surface/30 hover:bg-ai-surface/50 transition-colors">
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <ImageIcon size={48} className="mx-auto mb-4 text-ai-subtext" />
              <h3 className="text-sm font-semibold text-ai-text mb-2">Upload de Imagens</h3>
              <p className="text-xs text-ai-subtext mb-4">
                Imagens, gráficos ou diagramas que o agente pode referenciar.
              </p>
              <button
                onClick={() => imageInputRef.current?.click()}
                className="px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors flex items-center gap-2 mx-auto"
              >
                <Plus size={16} />
                Adicionar Imagem
              </button>
            </div>

            {/* Images Grid */}
            {images.length === 0 ? (
              <div className="text-center py-8 text-ai-subtext">
                <ImageIcon size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma imagem adicionada ainda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {images.map(img => (
                  <div
                    key={img.id}
                    className="relative border border-ai-border rounded-lg overflow-hidden hover:border-ai-accent/30 transition-colors group"
                  >
                    <img src={img.image_url} alt={img.title} className="w-full h-48 object-cover" />
                    <div className="p-3 bg-white border-t border-ai-border">
                      <h4 className="text-sm font-semibold text-ai-text truncate">{img.title}</h4>
                      <span className="text-xs text-ai-subtext">
                        {new Date(img.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteImage(img.id)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-2 bg-white rounded-lg shadow-lg text-rose-600 hover:bg-rose-50 transition-all"
                      title="Deletar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentTrainingAdmin;
