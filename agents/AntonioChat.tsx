import React, { useState, useRef, useEffect } from 'react';
import { Send, Brain, Loader2, Eraser, ThumbsUp, ThumbsDown, MessageSquare, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../lib/session';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  logId?: string | null;
  tokensUsed?: number | null;
  queryEmbeddingTokens?: number | null;
  collectionName?: string | null;
  timestamp: Date;
}

interface FeedbackState {
  [logId: string]: 'up' | 'down' | null;
}

const AntonioChat: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Olá, companheiro. Aqui é o Antonio.\n\nMinhas respostas agora são baseadas na base de conhecimento da sua organização. Faça uma pergunta sobre gestão, pecuária ou qualquer documento que o administrador tenha carregado.',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const question = inputText.trim();
    if (!question || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: question,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const headers = await getAuthHeaders();
      // Inclui as últimas 3 trocas (6 mensagens) para follow-ups contextuais
      const history = messages
        .filter(m => m.id !== 'welcome')
        .slice(-6)
        .map(m => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/knowledge?action=ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ question, history }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error('Servidor indisponível. Tente novamente em instantes.');
      }
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Erro ${res.status}`);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: json.data.answer,
        sources: json.data.sources,
        logId: json.data.logId,
        tokensUsed: json.data.tokensUsed ?? null,
        queryEmbeddingTokens: json.data.queryEmbeddingTokens ?? null,
        collectionName: json.data.collectionName ?? null,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Erro ao processar sua pergunta: ${err.message ?? 'tente novamente.'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFeedback = async (logId: string, rating: 1 | 5) => {
    if (feedback[logId]) return; // já votou
    setFeedback(prev => ({ ...prev, [logId]: rating === 5 ? 'up' : 'down' }));
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/knowledge?action=feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ logId, rating }),
      });
    } catch { /* silencioso */ }
  };

  const handleClear = () => {
    setMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      text: 'Conversa reiniciada. Como posso ajudar?',
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ai-border bg-ai-surface/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-ai-text text-white flex items-center justify-center">
            <Brain size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ai-text">Antonio</h3>
            <p className="text-xs text-ai-subtext">Consultor · Base de conhecimento RAG</p>
          </div>
        </div>
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 text-xs text-ai-subtext hover:text-ai-text transition-colors px-2 py-1.5 rounded-md hover:bg-ai-surface"
        >
          <Eraser size={13} /> Limpar
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            feedbackState={msg.logId ? feedback[msg.logId] : undefined}
            onFeedback={handleFeedback}
          />
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-ai-text text-white flex items-center justify-center shrink-0 mt-0.5">
              <Brain size={14} />
            </div>
            <div className="bg-ai-surface/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-ai-subtext" />
              <span className="text-sm text-ai-subtext">Consultando a base de conhecimento...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-ai-border bg-white shrink-0">
        <div className="flex items-end gap-2 bg-ai-surface/30 rounded-xl border border-ai-border px-3 py-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Faça uma pergunta sobre a base de conhecimento..."
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-ai-text placeholder:text-ai-subtext resize-none focus:outline-none max-h-32 disabled:opacity-50"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="p-2 bg-ai-text text-white rounded-lg hover:bg-ai-text/90 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-xs text-ai-subtext text-center mt-1.5">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
};

// ─── Bolha de mensagem ────────────────────────────────────────────────────────

function MessageBubble({
  message,
  feedbackState,
  onFeedback,
}: {
  message: Message;
  feedbackState?: 'up' | 'down' | null;
  onFeedback: (logId: string, rating: 1 | 5) => void;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-ai-text text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
          <p className="text-sm whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-ai-text text-white flex items-center justify-center shrink-0 mt-0.5">
        <Brain size={14} />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="bg-ai-surface/40 rounded-2xl rounded-tl-sm px-4 py-3">
          <p className="text-sm text-ai-text whitespace-pre-wrap">{message.text}</p>
        </div>

        {/* Fontes */}
        {message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.sources.map((src, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-ai-surface text-ai-subtext rounded-full text-xs border border-ai-border"
              >
                <BookOpen size={10} /> {src}
              </span>
            ))}
          </div>
        )}

        {/* Coleção consultada */}
        {message.collectionName && (
          <p className="text-xs text-ai-subtext/60 italic">
            Coleção: {message.collectionName}
          </p>
        )}

        {/* Tokens */}
        {(message.tokensUsed != null || message.queryEmbeddingTokens != null) && (
          <div className="flex items-center gap-2 text-xs text-ai-subtext/70">
            {message.tokensUsed != null && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare size={10} /> {message.tokensUsed.toLocaleString()} tokens
              </span>
            )}
            {message.queryEmbeddingTokens != null && (
              <span className="inline-flex items-center gap-1 opacity-60">
                · embed: {message.queryEmbeddingTokens}
              </span>
            )}
          </div>
        )}

        {/* Feedback */}
        {message.logId && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-ai-subtext mr-1">Útil?</span>
            <button
              onClick={() => onFeedback(message.logId!, 5)}
              disabled={!!feedbackState}
              className={`p-1.5 rounded-md transition-colors ${
                feedbackState === 'up'
                  ? 'bg-green-100 text-green-600'
                  : 'text-ai-subtext hover:bg-ai-surface hover:text-green-600'
              } disabled:cursor-default`}
            >
              <ThumbsUp size={13} />
            </button>
            <button
              onClick={() => onFeedback(message.logId!, 1)}
              disabled={!!feedbackState}
              className={`p-1.5 rounded-md transition-colors ${
                feedbackState === 'down'
                  ? 'bg-red-100 text-red-500'
                  : 'text-ai-subtext hover:bg-ai-surface hover:text-red-500'
              } disabled:cursor-default`}
            >
              <ThumbsDown size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AntonioChat;