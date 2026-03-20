import React, { useState, useEffect } from 'react';
import {
  Bot,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Brain,
  Sparkles,
  MessageSquare,
  ChevronRight,
} from 'lucide-react';
import { getAuthHeaders } from '../lib/session';
import { useAuth } from '../contexts/AuthContext';

interface AgentRegistryEntry {
  id: string;
  version: string;
  name: string;
  description: string;
  system_prompt: string;
}

const AIAgentConfigAdmin: React.FC = () => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<AgentRegistryEntry[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [config, setConfig] = useState<AgentRegistryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadAgents();
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
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="mx-auto mb-4 text-rose-500" />
          <h2 className="text-lg font-bold text-ai-text mb-2">Acesso Restrito</h2>
          <p className="text-sm text-ai-subtext">Apenas administradores podem configurar as instruções da IA.</p>
        </div>
      </div>
    );
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const loadAgents = async () => {
    try {
      setIsLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/agent-registry', { headers });
      const json = await res.json() as { ok: boolean; data?: Array<{ id: string; version: string; name: string; description: string; systemPrompt: string }>; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar agentes');
      const raw = json.data ?? [];
      // Map camelCase from API to snake_case used in component
      const mapped: AgentRegistryEntry[] = raw.map(a => ({ id: a.id, version: a.version, name: a.name, description: a.description, system_prompt: a.systemPrompt }));

      // Filter to keep only latest version of each agent for simplicity in this UI
      const latestAgents: Record<string, AgentRegistryEntry> = {};
      mapped.forEach(agent => {
        if (!latestAgents[agent.id] || agent.version > latestAgents[agent.id].version) {
          latestAgents[agent.id] = agent;
        }
      });

      const agentsList = Object.values(latestAgents);
      setAgents(agentsList);

      // Select feedback by default if available
      const feedbackAgent = agentsList.find(a => a.id === 'feedback');
      if (feedbackAgent) {
        setSelectedAgentId(feedbackAgent.id);
        setConfig({ ...feedbackAgent });
      } else if (agentsList.length > 0) {
        setSelectedAgentId(agentsList[0].id);
        setConfig({ ...agentsList[0] });
      }
    } catch (err: unknown) {
      console.error('Error loading agents:', err);
      showToast('Erro ao carregar agentes da IA', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAgent = (agent: AgentRegistryEntry) => {
    setSelectedAgentId(agent.id);
    setConfig({ ...agent });
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    try {
      setIsSaving(true);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/agent-registry?id=${encodeURIComponent(config.id)}&version=${encodeURIComponent(config.version)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ systemPrompt: config.system_prompt }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao salvar');

      // Update local list
      setAgents(prev => prev.map(a => (a.id === config.id ? { ...a, system_prompt: config.system_prompt } : a)));

      showToast('Instruções salvas com sucesso!', 'success');
    } catch (err: unknown) {
      console.error('Error saving config:', err);
      showToast('Erro ao salvar instruções', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-ai-subtext" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ai-surface/30 p-4 md:p-6 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col gap-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-ai-accent text-white flex items-center justify-center shadow-lg shadow-ai-accent/20">
              <Brain size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ai-text">Especialista IA</h2>
              <p className="text-sm text-ai-subtext font-medium">Configure as instruções e o comportamento das IAs</p>
            </div>
          </div>

          {config && (
            <button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-6 py-2.5 bg-ai-accent text-white rounded-xl font-bold hover:bg-ai-accentHover transition-all shadow-lg shadow-ai-accent/20 disabled:opacity-50 flex items-center gap-2 active:scale-95"
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Salvar Alterações
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
          {/* Sidebar: Agent List */}
          <div className="w-1/3 lg:w-1/4 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
            <h3 className="text-xs font-bold text-ai-subtext uppercase tracking-wider px-2">Agentes Disponíveis</h3>
            <div className="space-y-2">
              {agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-3 group ${
                    selectedAgentId === agent.id
                      ? 'bg-white border-ai-accent shadow-md'
                      : 'bg-white/50 border-ai-border hover:bg-white hover:border-ai-accent/30'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      selectedAgentId === agent.id
                        ? 'bg-ai-accent text-white'
                        : 'bg-ai-surface text-ai-subtext group-hover:bg-ai-accent/10 group-hover:text-ai-accent'
                    }`}
                  >
                    {agent.id === 'feedback' ? (
                      <MessageSquare size={20} />
                    ) : agent.id === 'damages-gen' ? (
                      <Sparkles size={20} />
                    ) : (
                      <Bot size={20} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-bold truncate ${selectedAgentId === agent.id ? 'text-ai-text' : 'text-ai-subtext group-hover:text-ai-text'}`}
                    >
                      {agent.name}
                    </p>
                    <p className="text-[10px] text-ai-subtext font-medium uppercase tracking-tight">v{agent.version}</p>
                  </div>
                  <ChevronRight
                    size={16}
                    className={`transition-transform ${selectedAgentId === agent.id ? 'text-ai-accent' : 'text-ai-subtext opacity-0 group-hover:opacity-100 group-hover:translate-x-1'}`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Main Content: Prompt Editor */}
          <div className="flex-1 bg-white rounded-3xl border border-ai-border shadow-sm flex flex-col overflow-hidden">
            {config ? (
              <>
                <div className="p-6 border-b border-ai-border bg-ai-surface/30">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-lg font-bold text-ai-text">{config.name}</h3>
                    <span className="px-2 py-0.5 bg-ai-accent/10 text-ai-accent rounded text-[10px] font-bold uppercase tracking-wider border border-ai-accent/20">
                      Instruções do Sistema
                    </span>
                  </div>
                  <p className="text-sm text-ai-subtext">{config.description}</p>
                </div>

                <div className="flex-1 p-6 flex flex-col gap-4">
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-ai-subtext uppercase tracking-widest flex items-center gap-2">
                        <Brain size={14} className="text-ai-accent" />
                        Prompt de Sistema (System Prompt)
                      </label>
                      <span className="text-[10px] text-ai-subtext font-mono">
                        {config.system_prompt.length} caracteres
                      </span>
                    </div>
                    <textarea
                      value={config.system_prompt}
                      onChange={e => setConfig({ ...config, system_prompt: e.target.value })}
                      className="flex-1 w-full p-6 border-2 border-ai-border rounded-2xl bg-ai-surface/5 text-ai-text focus:outline-none focus:ring-4 focus:ring-ai-accent/10 focus:border-ai-accent transition-all font-mono text-sm leading-relaxed custom-scrollbar resize-none"
                      placeholder="Descreva as instruções fundamentais para este agente..."
                    />
                  </div>

                  <div className="p-4 bg-ai-accent/5 rounded-2xl border border-ai-accent/10 flex items-start gap-3">
                    <div className="p-2 bg-ai-accent/10 rounded-lg text-ai-accent">
                      <Sparkles size={16} />
                    </div>
                    <div className="text-xs text-ai-text leading-relaxed">
                      <p className="font-bold text-ai-accent mb-1">Dica de Especialista:</p>
                      Para o Agente de Feedback, você pode alterar aqui as regras para o **MARCA**, **Sanduíche** ou
                      **Feedforward**. Seja específico sobre o tom de voz e o que ele deve ou não responder.
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-ai-surface text-ai-subtext flex items-center justify-center mb-4">
                  <Bot size={32} />
                </div>
                <h3 className="text-lg font-bold text-ai-text mb-2">Selecione um Agente</h3>
                <p className="text-sm text-ai-subtext max-w-xs">
                  Escolha um dos agentes na barra lateral para editar suas instruções de treinamento.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl ${
              toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span className="text-sm font-bold tracking-tight">{toast.message}</span>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
};

export default AIAgentConfigAdmin;
