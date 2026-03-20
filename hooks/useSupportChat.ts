import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTicketDetail,
  sendTicketMessage,
  updateTicketMessage,
  deleteTicketMessage,
  fetchMessagesSince,
  fetchUserNames,
  withSignedUrls,
  markTicketRead,
  type SupportTicketMessage,
  type SupportTicketAttachment,
  type SupportMessageAuthorType,
} from '../lib/supportTickets';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseSupportChatOptions {
  ticketId: string | null;
  userId: string;
  userName: string;
  authorType: SupportMessageAuthorType;
}

export interface UseSupportChatReturn {
  messages: SupportTicketMessage[];
  attachments: SupportTicketAttachment[];
  ticketDetail: SupportTicketDetail | null;
  connectionStatus: ConnectionStatus;
  typingUsers: string[];
  sendMessage: (payload: { message: string; imageFile?: File | null; replyToId?: string | null }) => Promise<void>;
  editMessage: (messageId: string, newText: string) => Promise<void>;
  removeMessage: (messageId: string) => Promise<void>;
  setTyping: (isTyping: boolean) => void;
  sendingIds: Set<string>;
  loadingInitial: boolean;
  reloadDetail: () => Promise<void>;
}

interface TypingEntry {
  userName: string;
  expiresAt: number;
}

const TYPING_BROADCAST_DEBOUNCE = 1000;
const TYPING_EXPIRE_MS = 3500;
const RECONNECT_DELAY = 2000;

export function useSupportChat({
  ticketId,
  userId,
  userName,
  authorType,
}: UseSupportChatOptions): UseSupportChatReturn {
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [attachments, setAttachments] = useState<SupportTicketAttachment[]>([]);
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetail | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [typingMap, setTypingMap] = useState<Map<string, TypingEntry>>(new Map());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [loadingInitial, setLoadingInitial] = useState(false);

  const channelRef = useRef<{ send: (payload: unknown) => void } | null>(null);
  const userNameCacheRef = useRef<Map<string, string>>(new Map());
  const knownMsgIdsRef = useRef<Set<string>>(new Set());
  const knownAttIdsRef = useRef<Set<string>>(new Set());
  const lastMsgTimestampRef = useRef<string | null>(null);
  const lastTypingBroadcastRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolveAuthorName = useCallback(async (authorId: string): Promise<string> => {
    const cached = userNameCacheRef.current.get(authorId);
    if (cached) return cached;
    const nameMap = await fetchUserNames([authorId]);
    const name = nameMap[authorId] || 'Usuário';
    userNameCacheRef.current.set(authorId, name);
    return name;
  }, []);

  const addOrUpdateMessage = useCallback((msg: SupportTicketMessage) => {
    knownMsgIdsRef.current.add(msg.id);
    if (!lastMsgTimestampRef.current || msg.created_at > lastMsgTimestampRef.current) {
      lastMsgTimestampRef.current = msg.created_at;
    }
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...msg };
        return updated;
      }
      const inserted = [...prev, msg];
      inserted.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return inserted;
    });
  }, []);

  const removeMessageById = useCallback((messageId: string) => {
    knownMsgIdsRef.current.delete(messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setAttachments(prev => prev.filter(a => a.message_id !== messageId));
  }, []);

  const addOrUpdateAttachment = useCallback((att: SupportTicketAttachment) => {
    knownAttIdsRef.current.add(att.id);
    setAttachments(prev => {
      const idx = prev.findIndex(a => a.id === att.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = att;
        return updated;
      }
      return [...prev, att];
    });
  }, []);

  const loadInitialData = useCallback(async (tid: string) => {
    setLoadingInitial(true);
    try {
      const detail = await getTicketDetail(tid);
      if (!mountedRef.current) return;
      setTicketDetail(detail);
      setMessages(detail.messages);
      setAttachments(detail.attachments);

      knownMsgIdsRef.current = new Set(detail.messages.map(m => m.id));
      knownAttIdsRef.current = new Set(detail.attachments.map(a => a.id));
      const lastMsg = detail.messages[detail.messages.length - 1];
      lastMsgTimestampRef.current = lastMsg?.created_at ?? null;

      detail.messages.forEach(m => {
        userNameCacheRef.current.set(m.author_id, m.author_name || 'Usuário');
      });
      if (detail.ticket.created_by && detail.ticket.user_name) {
        userNameCacheRef.current.set(detail.ticket.created_by, detail.ticket.user_name);
      }

      void markTicketRead(tid).catch(() => {});
    } catch (err) {
      if (mountedRef.current) {
        console.error('[useSupportChat] loadInitialData error:', err);
      }
      throw err;
    } finally {
      if (mountedRef.current) setLoadingInitial(false);
    }
  }, []);

  const reloadDetail = useCallback(async () => {
    if (!ticketId) return;
    await loadInitialData(ticketId);
  }, [ticketId, loadInitialData]);

  const syncMissedMessages = useCallback(
    async (tid: string) => {
      const since = lastMsgTimestampRef.current;
      if (!since) {
        await loadInitialData(tid);
        return;
      }
      try {
        const { messages: newMsgs, attachments: newAtts } = await fetchMessagesSince(tid, since);
        if (!mountedRef.current) return;
        newMsgs.forEach(addOrUpdateMessage);
        newAtts.forEach(addOrUpdateAttachment);
      } catch {
        await loadInitialData(tid);
      }
    },
    [loadInitialData, addOrUpdateMessage, addOrUpdateAttachment],
  );

  const POLL_INTERVAL = 5000; // poll every 5 seconds

  // -- Polling-based subscription (replaces Supabase realtime) --
  useEffect(() => {
    if (!ticketId || !userId) {
      setMessages([]);
      setAttachments([]);
      setTicketDetail(null);
      setConnectionStatus('connecting');
      return;
    }

    void loadInitialData(ticketId).then(() => {
      if (mountedRef.current) setConnectionStatus('connected');
    }).catch(() => {
      if (mountedRef.current) setConnectionStatus('disconnected');
    });

    // No-op channel stub so sendMessage/editMessage/removeMessage broadcasts still compile
    channelRef.current = { send: () => {} };

    const pollTimer = setInterval(() => {
      if (!mountedRef.current || !ticketId) return;
      void syncMissedMessages(ticketId);
    }, POLL_INTERVAL);

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      clearInterval(pollTimer);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, userId]);

  // -- Typing expiry cleaner --
  useEffect(() => {
    if (typingMap.size === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypingMap(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [uid, entry] of next) {
          if (entry.expiresAt <= now) {
            next.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typingMap.size]);

  const typingUsers = useMemo(() => Array.from(typingMap.values()).map(e => e.userName), [typingMap]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      const now = Date.now();
      if (isTyping && now - lastTypingBroadcastRef.current < TYPING_BROADCAST_DEBOUNCE) return;
      lastTypingBroadcastRef.current = now;

      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, userName, isTyping },
      });

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (isTyping) {
        typingTimerRef.current = setTimeout(() => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, userName, isTyping: false },
          });
        }, TYPING_EXPIRE_MS);
      }
    },
    [userId, userName],
  );

  const sendMessage = useCallback(
    async (payload: { message: string; imageFile?: File | null; replyToId?: string | null }) => {
      if (!ticketId) throw new Error('Nenhum ticket selecionado.');

      const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const optimisticMsg: SupportTicketMessage = {
        id: optimisticId,
        ticket_id: ticketId,
        author_id: userId,
        author_type: authorType,
        message: payload.message.trim() || '[imagem]',
        created_at: new Date().toISOString(),
        read_at: null,
        author_name: userName,
        reply_to_id: payload.replyToId ?? null,
      };

      setMessages(prev => [...prev, optimisticMsg]);
      setSendingIds(prev => new Set(prev).add(optimisticId));

      setTyping(false);

      try {
        const result = await sendTicketMessage(ticketId, {
          message: payload.message,
          imageFile: payload.imageFile,
          authorType,
          replyToId: payload.replyToId,
        });

        const realMsg: SupportTicketMessage = {
          ...result.message,
          author_name: userName,
        };

        setMessages(prev => prev.map(m => (m.id === optimisticId ? realMsg : m)));

        if (result.attachment) {
          addOrUpdateAttachment(result.attachment);
        }

        channelRef.current?.send({
          type: 'broadcast',
          event: 'new_message',
          payload: { message: realMsg, attachment: result.attachment },
        });
      } catch (err) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        throw err;
      } finally {
        setSendingIds(prev => {
          const next = new Set(prev);
          next.delete(optimisticId);
          return next;
        });
      }
    },
    [ticketId, userId, userName, authorType, setTyping, addOrUpdateAttachment],
  );

  const editMessage = useCallback(async (messageId: string, newText: string) => {
    let prevMsg: SupportTicketMessage | undefined;
    setMessages(prev => {
      prevMsg = prev.find(m => m.id === messageId);
      if (!prevMsg) return prev;
      return prev.map(m => (m.id === messageId ? { ...m, message: newText, edited_at: new Date().toISOString() } : m));
    });
    if (!prevMsg) return;

    try {
      await updateTicketMessage(messageId, newText);

      const updated = { ...prevMsg, message: newText, edited_at: new Date().toISOString() };
      channelRef.current?.send({
        type: 'broadcast',
        event: 'message_updated',
        payload: { message: updated },
      });
    } catch (err) {
      setMessages(prev => prev.map(m => (m.id === messageId && prevMsg ? prevMsg : m)));
      throw err;
    }
  }, []);

  const removeMessage = useCallback(
    async (messageId: string) => {
      let prevMsg: SupportTicketMessage | undefined;
      setMessages(prev => {
        prevMsg = prev.find(m => m.id === messageId);
        return prev;
      });
      removeMessageById(messageId);

      try {
        await deleteTicketMessage(messageId);

        channelRef.current?.send({
          type: 'broadcast',
          event: 'message_deleted',
          payload: { messageId },
        });
      } catch (err) {
        if (prevMsg) addOrUpdateMessage(prevMsg);
        throw err;
      }
    },
    [removeMessageById, addOrUpdateMessage],
  );

  return {
    messages,
    attachments,
    ticketDetail,
    connectionStatus,
    typingUsers,
    sendMessage,
    editMessage,
    removeMessage,
    setTyping,
    sendingIds,
    loadingInitial,
    reloadDetail,
  };
}
