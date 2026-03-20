/**
 * Evidências de entrega para marcos de iniciativas
 * - Comentários (notes)
 * - Anexos: imagem, vídeo, planilha, documento
 *
 * Todas as operações de banco passam pelo /api/evidence.
 * Upload/download de arquivos usa diretamente o B2 via lib/storage.
 */
import { storageUpload, storageGetSignedUrl, storageRemove } from './storage';
import { getAuthHeaders } from './session';

const STORAGE_PREFIX = 'milestone-evidence';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const API_BASE = '/api/evidence';

export type EvidenceFileType = 'image' | 'video' | 'document' | 'spreadsheet';

export interface MilestoneEvidenceRow {
  id: string;
  milestone_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneEvidenceFileRow {
  id: string;
  evidence_id: string;
  file_name: string;
  storage_path: string;
  file_type: EvidenceFileType;
  file_size: number | null;
  created_at: string;
}

export interface MilestoneEvidenceWithFiles extends MilestoneEvidenceRow {
  files: MilestoneEvidenceFileRow[];
}

const MIME_TO_TYPE: Record<string, EvidenceFileType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.ms-excel': 'spreadsheet',
};

function inferFileType(mime: string, fileName: string): EvidenceFileType {
  const mimeType = MIME_TO_TYPE[mime];
  if (mimeType) return mimeType;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';
  if (['mp4', 'webm', 'mov'].includes(ext || '')) return 'video';
  if (['xlsx', 'xls'].includes(ext || '')) return 'spreadsheet';
  return 'document';
}

function generateStoragePath(milestoneId: string, originalName: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
  const safeName = originalName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50);
  return `${milestoneId}/${timestamp}_${randomId}_${safeName}.${ext}`;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...(init?.headers ?? {}) },
  });
  const json = await res.json() as { ok: boolean; data?: T; error?: string };
  if (!json.ok) throw new Error(json.error || `Erro na requisição (${res.status})`);
  return json.data as T;
}

/**
 * Busca ou cria a evidência para um marco, e retorna com os arquivos
 */
export async function fetchOrCreateEvidence(milestoneId: string): Promise<MilestoneEvidenceWithFiles> {
  if (!milestoneId) throw new Error('ID do marco é obrigatório.');

  const rows = await apiFetch<MilestoneEvidenceWithFiles[]>(
    `${API_BASE}?milestoneId=${encodeURIComponent(milestoneId)}`,
  );

  if (rows.length > 0) return rows[0];

  // Criar evidência vazia
  const created = await apiFetch<MilestoneEvidenceWithFiles>(API_BASE, {
    method: 'POST',
    body: JSON.stringify({ milestone_id: milestoneId, notes: null }),
  });

  return { ...created, files: created.files ?? [] };
}

/**
 * Atualiza as notas/comentários da evidência
 */
export async function updateEvidenceNotes(evidenceId: string, notes: string): Promise<void> {
  await apiFetch(`${API_BASE}?id=${encodeURIComponent(evidenceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes: notes.trim() || null }),
  });
}

/**
 * Faz append de um comentário às notas existentes
 */
export async function appendComment(evidenceId: string, newComment: string): Promise<void> {
  // Buscar notas atuais
  const current = await apiFetch<MilestoneEvidenceRow>(
    `${API_BASE}?evidenceId=${encodeURIComponent(evidenceId)}`,
  );
  const existing = current.notes?.trim() || '';
  const timestamp = new Date().toLocaleString('pt-BR');
  const separator = existing ? '\n\n---\n\n' : '';
  const appended = `${existing}${separator}[${timestamp}] ${newComment.trim()}`;

  await apiFetch(`${API_BASE}?id=${encodeURIComponent(evidenceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes: appended }),
  });
}

/**
 * Faz upload de um arquivo para B2 e registra em milestone_evidence_files via API
 */
export async function uploadEvidenceFile(
  evidenceId: string,
  milestoneId: string,
  file: File,
): Promise<MilestoneEvidenceFileRow> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const fileType = inferFileType(file.type, file.name);
  const storagePath = generateStoragePath(milestoneId, file.name);

  // 1. Upload para B2
  await storageUpload(STORAGE_PREFIX, storagePath, file, { contentType: file.type });

  // 2. Registrar no banco via API (POST com milestone_id + file)
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        milestone_id: milestoneId,
        file: {
          file_name: file.name,
          storage_path: storagePath,
          file_type: fileType,
          file_size: file.size,
        },
      }),
    });
    const json = await res.json() as { ok: boolean; data?: MilestoneEvidenceWithFiles; error?: string };
    if (!json.ok) throw new Error(json.error || 'Erro ao registrar arquivo');

    // A API retorna a evidência com os files; encontrar o arquivo recém-adicionado
    const evidenceRow = json.data;
    const addedFile = evidenceRow?.files?.find(f => f.storage_path === storagePath);
    if (!addedFile) throw new Error('Arquivo registrado mas não encontrado na resposta');
    return addedFile as MilestoneEvidenceFileRow;
  } catch (err) {
    // Rollback B2 se registro no banco falhou
    await storageRemove(STORAGE_PREFIX, [storagePath]);
    throw err;
  }
}

/**
 * Gera URL assinada para download/exibição do arquivo (B2)
 */
export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  return storageGetSignedUrl(STORAGE_PREFIX, storagePath, expiresIn);
}

/**
 * Remove um arquivo de evidência: deleta do banco via API (que retorna storage_path) e remove do B2
 */
export async function deleteEvidenceFile(fileId: string): Promise<void> {
  if (!fileId) throw new Error('ID do arquivo é obrigatório.');

  const result = await apiFetch<{ deleted: boolean; storage_path: string }>(
    `${API_BASE}?fileId=${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  );

  await storageRemove(STORAGE_PREFIX, [result.storage_path]);
}
