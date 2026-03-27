import { getAuthHeaders, clearToken } from './session';
import { storageUpload, storageGetSignedUrl, storageRemove } from './storage';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const STORAGE_PREFIX = 'support-ticket-attachments';

export type SupportTicketType = 'erro_tecnico' | 'sugestao_solicitacao';
export type SupportTicketStatus = 'open' | 'in_progress' | 'testing' | 'done';
export type SupportMessageAuthorType = 'user' | 'ai' | 'agent';
export type SupportLocationArea = 'main' | 'sidebar' | 'header' | 'modal' | 'other';

export interface SupportTicket {
  id: string;
  created_by: string;
  ticket_type: SupportTicketType;
  subject: string;
  status: SupportTicketStatus;
  current_url: string | null;
  location_area: SupportLocationArea | null;
  specific_screen: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  user_name?: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  author_type: SupportMessageAuthorType;
  message: string;
  created_at: string;
  read_at: string | null;
  edited_at?: string | null;
  author_name?: string;
  reply_to_id?: string | null;
}

export interface SupportTicketAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_by: string;
  created_at: string;
  signed_url?: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
  attachments: SupportTicketAttachment[];
}

interface TicketCreatePayload {
  ticketType: SupportTicketType;
  subject?: string;
  currentUrl?: string;
  initialMessage?: string;
  locationArea?: SupportLocationArea;
  specificScreen?: string;
}

export interface SendTicketMessagePayload {
  message: string;
  imageFile?: File | null;
  authorType?: SupportMessageAuthorType;
  replyToId?: string | null;
}

export interface SendTicketMessageResult {
  message: SupportTicketMessage;
  attachment?: SupportTicketAttachment;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeText(value: string | null | undefined, maxLength = 600): string {
  if (!value) return '';
  return value.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
}

function safeLocationHref(): string {
  if (typeof window !== 'undefined' && window.location) return window.location.href;
  return '';
}

function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME.includes(file.type)) throw new Error('Formato inválido. Use JPEG, PNG, WEBP ou GIF.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('Imagem muito grande. Máximo permitido: 5MB.');
}

function getSafeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function buildStoragePath(ticketId: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const safe = getSafeFileName(fileName.replace(/\.[^/.]+$/, ''));
  return `${ticketId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}.${ext}`;
}

function debounce(fn: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

function handleUnauthorized(): void {
  clearToken();
  if (typeof window !== 'undefined') window.location.replace('/sign-in');
}

async function apiGet<T>(action: string, params?: Record<string, string>): Promise<T> {
  const headers = await getAuthHeaders();
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`/api/support-tickets?${qs}`, { headers });
  if (res.status === 401) { handleUnauthorized(); throw new Error('Sessão expirada'); }
  const json = await res.json() as { ok: boolean; data: T; error?: string };
  if (!json.ok) throw new Error(json.error || 'Erro na API');
  return json.data;
}

async function apiPost<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/support-tickets', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  if (res.status === 401) { handleUnauthorized(); throw new Error('Sessão expirada'); }
  const json = await res.json() as { ok: boolean; data: T; error?: string };
  if (!json.ok) throw new Error(json.error || 'Erro na API');
  return json.data;
}

// ── Exported functions ────────────────────────────────────────────────────────

export async function fetchUserNames(userIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};
  return apiGet<Record<string, string>>('user-names', { ids: uniqueIds.join(',') });
}

export async function withSignedUrls(attachments: SupportTicketAttachment[]): Promise<SupportTicketAttachment[]> {
  return Promise.all(
    attachments.map(async att => {
      try {
        const signedUrl = await storageGetSignedUrl(STORAGE_PREFIX, att.storage_path, 3600);
        return { ...att, signed_url: signedUrl };
      } catch {
        return att;
      }
    }),
  );
}

export async function createTicket(payload: TicketCreatePayload): Promise<SupportTicket> {
  const subject = normalizeText(payload.subject || '', 200)
    || (payload.ticketType === 'erro_tecnico' ? 'Erro técnico' : 'Sugestão/Solicitação');

  const ticket = await apiPost<SupportTicket>('create', {
    ticketType: payload.ticketType,
    subject,
    currentUrl: normalizeText(payload.currentUrl || safeLocationHref(), 1200) || '',
    locationArea: payload.locationArea || '',
    specificScreen: normalizeText(payload.specificScreen || '', 200) || '',
  });

  if (payload.initialMessage?.trim()) {
    await sendTicketMessage(ticket.id, { message: payload.initialMessage.trim() });
  }

  await markTicketRead(ticket.id);
  return ticket;
}

export async function listMyTickets(): Promise<SupportTicket[]> {
  return apiGet<SupportTicket[]>('list-my');
}

export async function listAdminTickets(params?: {
  status?: SupportTicketStatus;
  search?: string;
}): Promise<SupportTicket[]> {
  const p: Record<string, string> = {};
  if (params?.status) p.status = params.status;
  if (params?.search?.trim()) p.search = params.search.trim();
  return apiGet<SupportTicket[]>('list-admin', p);
}

export async function getTicketDetail(ticketId: string): Promise<SupportTicketDetail> {
  if (!ticketId) throw new Error('Ticket inválido.');
  const detail = await apiGet<SupportTicketDetail>('detail', { ticketId });
  detail.attachments = await withSignedUrls(detail.attachments);
  return detail;
}

export async function uploadTicketAttachment(
  ticketId: string,
  file: File,
  messageId?: string,
): Promise<SupportTicketAttachment> {
  validateImageFile(file);
  const storagePath = buildStoragePath(ticketId, file.name || 'imagem');

  await storageUpload(STORAGE_PREFIX, storagePath, file, { contentType: file.type });

  try {
    const att = await apiPost<SupportTicketAttachment>('save-attachment', {
      ticketId,
      messageId: messageId || '',
      storagePath,
      fileName: file.name || 'imagem',
      mimeType: file.type || 'image/jpeg',
      fileSize: String(file.size || 0),
    });
    const [signed] = await withSignedUrls([att]);
    return signed;
  } catch (err) {
    await storageRemove(STORAGE_PREFIX, [storagePath]);
    throw err;
  }
}

export async function sendTicketMessage(
  ticketId: string,
  payload: SendTicketMessagePayload,
): Promise<SendTicketMessageResult> {
  const text = normalizeText(payload.message, 4000);
  if (!text && !payload.imageFile) throw new Error('Digite uma mensagem ou anexe uma imagem.');

  const msg = await apiPost<SupportTicketMessage>('send-message', {
    ticketId,
    message: text || '[imagem]',
    authorType: payload.authorType || 'user',
    replyToId: payload.replyToId || '',
  });

  let attachment: SupportTicketAttachment | undefined;
  if (payload.imageFile) {
    attachment = await uploadTicketAttachment(ticketId, payload.imageFile, msg.id);
  }

  return { message: msg, attachment };
}

export async function updateTicketMessage(messageId: string, newMessage: string): Promise<void> {
  const text = normalizeText(newMessage, 4000);
  if (!text) throw new Error('A mensagem não pode ficar vazia.');
  await apiPost('update-message', { messageId, message: text });
}

export async function deleteTicketMessage(messageId: string): Promise<void> {
  await apiPost('delete-message', { messageId });
}

export async function updateTicketStatus(ticketId: string, status: SupportTicketStatus): Promise<void> {
  await apiPost('update-status', { ticketId, status });
}

export async function markTicketRead(ticketId: string): Promise<void> {
  await apiPost('mark-read', { ticketId });
}

export async function getAdminUnreadCount(): Promise<number> {
  return apiGet<number>('admin-unread');
}

export async function sendAIMessage(ticketId: string, message: string): Promise<SendTicketMessageResult> {
  return sendTicketMessage(ticketId, { message, authorType: 'ai' });
}

export async function fetchMessageWithAuthor(messageId: string): Promise<SupportTicketMessage | null> {
  return apiGet<SupportTicketMessage | null>('message', { messageId });
}

export async function fetchMessagesSince(
  ticketId: string,
  since: string,
): Promise<{ messages: SupportTicketMessage[]; attachments: SupportTicketAttachment[] }> {
  const result = await apiGet<{ messages: SupportTicketMessage[]; attachments: SupportTicketAttachment[] }>(
    'messages-since', { ticketId, since }
  );
  result.attachments = await withSignedUrls(result.attachments);
  return result;
}

/** Polling-based subscription (Neon não suporta realtime nativo). */
export function subscribeTicketMessages(ticketId: string, onRefresh: () => void): () => void {
  const debouncedRefresh = debounce(onRefresh, 400);
  const id = setInterval(() => debouncedRefresh(), 5000);
  return () => clearInterval(id);
}

/** Polling-based subscription para notificações admin. */
export function subscribeAdminUnread(onRefresh: () => void): () => void {
  const debouncedRefresh = debounce(onRefresh, 800);
  const id = setInterval(() => debouncedRefresh(), 15000);
  return () => clearInterval(id);
}
