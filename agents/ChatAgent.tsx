import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Eraser, Paperclip, X, FileText } from 'lucide-react';
import { ChatMessage } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ChatAgent: React.FC = () => {
  const { user } = useAuth();
  const [isAgentEnabled, setIsAgentEnabled] = useState(true);
  const [isCheckingAgent, setIsCheckingAgent] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Olá, companheiro. Aqui é o Antonio. Vamos falar de gestão? O que não se mede, não se gerencia. \n\nSe tiver algum relatório ou manual técnico, pode anexar aqui que eu analiso.',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [attachment, setAttachment] = useState<{ name: string; data: string; mimeType: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // agent_config table not in new schema — agent always enabled
  useEffect(() => {
    setIsAgentEnabled(true);
    setIsCheckingAgent(false);
  }, []);

  // Load chat history on mount
  useEffect(() => {
    if (user) {
      loadChatHistory();
    } else {
      setIsLoadingHistory(false);
    }
  }, [user]);

  const loadChatHistory = async () => {
    // chat_messages table not in new schema — history not persisted
    setIsLoadingHistory(false);
  };

  const saveMessage = async (_message: ChatMessage, _attachmentName?: string, _attachmentMimeType?: string) => {
    // chat_messages table not in new schema — messages not persisted
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to Base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = base64String.split(',')[1];

      setAttachment({
        name: file.name,
        data: base64Data,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);

    // Reset input value to allow selecting the same file again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = () => {
    setAttachment(null);
  };

  // Cache da verificação de limite (cache por 30 segundos)
  const limitCheckCache = useRef<{ result: boolean; timestamp: number } | null>(null);
  const CACHE_DURATION = 30000; // 30 segundos

  /**
   * Verifica se o usuário pode enviar mensagens
   * - Planos Pro e Enterprise: chat ilimitado
   * - Plano Basic: máximo 10 mensagens por dia
   * - Em caso de erro de conexão: permite envio (fallback permissivo)
   */
  const checkChatLimit = async (): Promise<{ canSend: boolean; reason?: string }> => {
    if (!user) return { canSend: false, reason: 'Usuário não autenticado' };

    // Admins têm acesso ilimitado
    if (user.role === 'admin') return { canSend: true };

    // chat_messages table not in new schema — rate limiting disabled
    return { canSend: true };
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !attachment) || isLoading) return;

    // Verificar limites antes de enviar
    const limitCheck = await checkChatLimit();

    if (!limitCheck.canSend) {
      // Verificar se a última mensagem já é uma mensagem de limite para evitar duplicatas
      const lastMessage = messages[messages.length - 1];
      const isLastMessageLimit =
        lastMessage && lastMessage.role === 'model' && lastMessage.text.includes('limite de mensagens');

      if (!isLastMessageLimit) {
        let limitMessageText =
          'Você atingiu seu limite de mensagens (10 mensagens/dia no plano básico). Faça upgrade do plano para continuar.';

        // Mensagem diferente se for erro de conexão
        if (limitCheck.reason?.includes('Erro de conexão') || limitCheck.reason?.includes('Erro temporário')) {
          limitMessageText =
            'Não foi possível verificar seu limite de mensagens. A mensagem será enviada. Se atingir o limite, você será notificado.';
        } else if (limitCheck.reason?.includes('Limite atingido')) {
          limitMessageText = `Você atingiu seu limite de mensagens (10 mensagens/dia no plano básico). Faça upgrade do plano para continuar.`;
        }

        const limitMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'model',
          text: limitMessageText,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, limitMessage]);
      }

      // Se for realmente limite atingido, bloquear envio
      if (limitCheck.reason?.includes('Limite atingido')) {
        return;
      }

      // Se for erro de conexão, permitir envio com aviso (já adicionado acima)
    }

    // Preparar mensagem do usuário
    // Nota: anexos não são enviados ao assistente inicialmente (conforme plano)
    // A funcionalidade de anexo permanece na UI para futura implementação
    const questionText = attachment
      ? `${inputText || ''} [Nota: Arquivo anexado: ${attachment.name} - funcionalidade em desenvolvimento]`.trim()
      : inputText.trim();

    if (!questionText) {
      // Se não há texto e não há anexo válido, não enviar
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: attachment ? `[Arquivo: ${attachment.name}] ${inputText}` : inputText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    const currentAttachment = attachment; // Capture current state
    setAttachment(null); // Clear UI attachment immediately
    setIsLoading(true);

    // Save user message
    await saveMessage(userMessage, currentAttachment?.name, currentAttachment?.mimeType);

    try {
      // Chamar API do assistente OpenAI
      const response = await fetch('/api/ask-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: questionText,
          userId: user?.id, // Enviar userId para rastreamento de tokens
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }

      const data = await response.json();

      const modelMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: data.answer || 'Sem resposta do assistente.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, modelMessage]);

      // Save model response
      await saveMessage(modelMessage);
    } catch (error: any) {
      console.error('Erro na API:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: error.message
          ? `Erro ao processar sua solicitação: ${error.message}`
          : 'Tive um problema ao processar sua solicitação. Por favor, tente novamente.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);

      // Save error message
      await saveMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    if (!user) return;

    // chat_messages table not in new schema — only clears in-memory messages
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        text: 'Histórico limpo. Vamos começar uma nova análise.',
        timestamp: new Date(),
      },
    ]);
    setAttachment(null);
  };

  // Show loading while checking agent status
  if (isCheckingAgent) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg border border-ai-border shadow-sm overflow-hidden items-center justify-center">
        <Loader2 size={32} className="animate-spin text-ai-subtext" />
      </div>
    );
  }

  // Show disabled message if agent is not enabled
  if (!isAgentEnabled) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg border border-ai-border shadow-sm overflow-hidden items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Bot size={64} className="mx-auto mb-4 text-ai-subtext opacity-50" />
          <h3 className="text-lg font-bold text-ai-text mb-2">Agente Desabilitado</h3>
          <p className="text-sm text-ai-subtext mb-4">
            O Consultor Antonio está temporariamente desabilitado. Entre em contato com o administrador para mais
            informações.
          </p>
          {user?.role === 'admin' && (
            <p className="text-xs text-ai-accent">
              Como administrador, você pode habilitar o agente na seção "Treinar Antonio".
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-ai-border shadow-sm overflow-hidden">
      {/* Header Area */}
      <div className="p-4 border-b border-ai-border bg-ai-surface/50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-ai-text text-white flex items-center justify-center">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ai-text">Consultor Antonio</h3>
            <p className="text-xs text-ai-subtext">Especialista em Gestão e Métricas</p>
          </div>
        </div>
        <button
          onClick={handleClear}
          className="p-2 text-ai-subtext hover:text-rose-600 transition-colors"
          title="Limpar conversa"
        >
          <Eraser size={16} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 size={24} className="animate-spin text-ai-subtext" />
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`
              max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${
                msg.role === 'user'
                  ? 'bg-ai-text text-white rounded-br-none'
                  : 'bg-ai-surface2 text-ai-text rounded-bl-none border border-ai-border/50'
              }
            `}
              >
                {msg.text.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-2' : ''}>
                    {line}
                  </p>
                ))}
                <span
                  className={`text-[10px] block mt-1 opacity-70 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                >
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-ai-surface2 rounded-2xl rounded-bl-none px-4 py-3 border border-ai-border/50 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-ai-subtext" />
              <span className="text-xs text-ai-subtext">Analisando dados...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-ai-border">
        {/* Attachment Preview */}
        {attachment && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-ai-surface2 rounded-lg border border-ai-border w-fit">
            <FileText size={16} className="text-ai-accent" />
            <span className="text-xs font-medium max-w-[200px] truncate">{attachment.name}</span>
            <button onClick={removeAttachment} className="ml-2 text-ai-subtext hover:text-rose-600">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-ai-surface rounded-xl border border-ai-border focus-within:border-ai-accent focus-within:ring-1 focus-within:ring-ai-accent/20 transition-all p-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.csv,.txt,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-ai-subtext hover:text-ai-text hover:bg-ai-border/30 rounded-lg transition-colors"
            title="Anexar arquivo (PDF, Imagem, Texto)"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Pergunte ou anexe um relatório..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-ai-text resize-none max-h-32 min-h-[24px] py-2"
            rows={1}
            style={{ height: 'auto', minHeight: '44px' }}
          />
          <button
            onClick={handleSend}
            disabled={(!inputText.trim() && !attachment) || isLoading}
            className={`
                    p-2 rounded-lg mb-0.5 transition-colors
                    ${
                      (!inputText.trim() && !attachment) || isLoading
                        ? 'text-ai-border cursor-not-allowed'
                        : 'bg-ai-text text-white hover:bg-black'
                    }
                `}
          >
            <Send size={18} />
          </button>
        </div>
        <div className="text-center mt-2">
          <span className="text-[10px] text-ai-subtext">A IA pode cometer erros. Verifique informações críticas.</span>
        </div>
      </div>
    </div>
  );
};

export default ChatAgent;
