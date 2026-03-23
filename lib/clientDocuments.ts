/**
 * Operações CRUD para documentos de clientes (mentoria)
 * Suporta PDF, WORD (doc, docx), Excel (xls, xlsx)
 */
import { ClientDocument, DocumentCategory, DocumentFileType, DocumentUploadParams, DocumentFilter } from '../types';
import { logger } from './logger';
import { storageUpload, storageGetSignedUrl, storageRemove } from './storage';
import { getAuthHeaders } from './session';

const log = logger.withContext({ component: 'clientDocuments' });

const STORAGE_PREFIX = 'client-documents';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Tipos de arquivo permitidos
const ALLOWED_MIME_TYPES: Record<string, DocumentFileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
};

const ALLOWED_EXTENSIONS: DocumentFileType[] = ['pdf', 'docx', 'doc', 'xlsx', 'xls'];

/**
 * Valida o arquivo antes do upload
 */
export function validateFile(file: File): { valid: boolean; error?: string; fileType?: DocumentFileType } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Arquivo muito grande. Máximo permitido: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  const fileType = ALLOWED_MIME_TYPES[file.type];
  if (!fileType) {
    const ext = file.name.split('.').pop()?.toLowerCase() as DocumentFileType;
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: 'Tipo de arquivo não permitido. Use PDF, DOCX, DOC, XLSX ou XLS.' };
    }
    return { valid: true, fileType: ext };
  }

  return { valid: true, fileType };
}

/**
 * Gera nome único para o arquivo no storage
 */
function generateStoragePath(organizationId: string, originalName: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
  const safeName = originalName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50);

  return `${organizationId}/${timestamp}_${randomId}_${safeName}.${ext}`;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...headers, ...(init?.headers ?? {}) },
    });
    const json = await res.json() as { ok: boolean; data?: T; error?: string };
    if (json.ok) return { ok: true, data: json.data as T };
    return { ok: false, error: json.error || `Erro ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Faz upload de um documento para a organização
 */
export async function uploadDocument(
  params: DocumentUploadParams,
): Promise<{ success: boolean; document?: ClientDocument; error?: string }> {
  const { organizationId, file, category = 'geral', description } = params;

  try {
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const storagePath = generateStoragePath(organizationId, file.name);

    try {
      await storageUpload(STORAGE_PREFIX, storagePath, file, { contentType: file.type });
    } catch (uploadError: unknown) {
      const msg = uploadError instanceof Error ? uploadError.message : 'Erro desconhecido';
      log.error('uploadDocument storage error', new Error(msg));
      return { success: false, error: `Erro ao fazer upload: ${msg}` };
    }

    const result = await apiFetch<Record<string, unknown>>('/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-document',
        organizationId: organizationId,
        fileName: storagePath.split('/').pop(),
        originalName: file.name,
        fileType: validation.fileType,
        fileSize: file.size,
        storagePath,
        category,
        description,
      }),
    });

    if (!result.ok) {
      const errRes = result as { ok: false; error: string };
      await storageRemove(STORAGE_PREFIX, [storagePath]);
      log.error('uploadDocument DB error', new Error(errRes.error));
      return { success: false, error: `Erro ao salvar documento: ${errRes.error}` };
    }

    return {
      success: true,
      document: mapDocumentFromDatabase(result.data as unknown as DatabaseDocument),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido ao fazer upload';
    log.error('uploadDocument error', error instanceof Error ? error : new Error(msg));
    return { success: false, error: msg };
  }
}

/**
 * Lista documentos de uma organização com filtros opcionais
 */
export async function listDocuments(
  filter: DocumentFilter = {},
): Promise<{ documents: ClientDocument[]; error?: string }> {
  try {
    if (!filter.organizationId) {
      return { documents: [] };
    }

    const result = await apiFetch<DatabaseDocument[]>(
      `/api/organizations?action=documents&organizationId=${encodeURIComponent(filter.organizationId)}`,
    );

    if (!result.ok) {
      const errRes = result as { ok: false; error: string };
      return { documents: [], error: errRes.error };
    }

    let docs = result.data ?? [];

    if (filter.category) {
      docs = docs.filter(d => d.category === filter.category);
    }
    if (filter.fileType) {
      docs = docs.filter(d => d.file_type === filter.fileType);
    }
    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      docs = docs.filter(
        d =>
          d.original_name?.toLowerCase().includes(term) ||
          d.description?.toLowerCase().includes(term),
      );
    }

    return {
      documents: docs.map(doc => ({
        ...mapDocumentFromDatabase(doc),
        clientName: 'Organização',
      })),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar documentos';
    log.error('listDocuments error', error instanceof Error ? error : new Error(msg));
    return { documents: [], error: msg };
  }
}

/**
 * Obtém URL de download temporário para um documento
 */
export async function getDocumentUrl(storagePath: string): Promise<{ url?: string; error?: string }> {
  try {
    const url = await storageGetSignedUrl(STORAGE_PREFIX, storagePath, 3600);
    return { url };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao obter URL do documento';
    log.error('getDocumentUrl error', error instanceof Error ? error : new Error(msg));
    return { error: msg };
  }
}

/**
 * Exclui um documento (apenas analistas e admins)
 */
export async function deleteDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await apiFetch<{ deleted: boolean; storagePath: string | null }>(
      `/api/organizations?action=delete-document&documentId=${encodeURIComponent(documentId)}`,
      { method: 'DELETE' },
    );

    if (!result.ok) {
      const errRes = result as { ok: false; error: string };
      return { success: false, error: errRes.error };
    }

    if (result.data.storagePath) {
      try {
        await storageRemove(STORAGE_PREFIX, [result.data.storagePath]);
      } catch {
        log.warn('deleteDocument storage error (file may already be removed)');
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao excluir documento';
    log.error('deleteDocument error', error instanceof Error ? error : new Error(msg));
    return { success: false, error: msg };
  }
}

export async function updateDocument(
  documentId: string,
  updates: { category?: DocumentCategory; description?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await apiFetch<{ updated: boolean }>('/api/organizations', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'update-document', documentId, ...updates }),
    });

    if (!result.ok) {
      const errRes = result as { ok: false; error: string };
      log.error('updateDocument error', new Error(errRes.error));
      return { success: false, error: errRes.error };
    }

    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao atualizar documento';
    log.error('updateDocument error', error instanceof Error ? error : new Error(msg));
    return { success: false, error: msg };
  }
}

/**
 * Mapeia documento do formato do banco para o tipo TypeScript
 */
interface DatabaseDocument {
  id: string;
  organizationId?: string;
  client_id?: string;
  uploadedBy?: string;
  uploaded_by?: string;
  fileName?: string;
  file_name?: string;
  originalName?: string;
  original_name?: string;
  fileType?: DocumentFileType;
  file_type?: DocumentFileType;
  fileSize?: number;
  file_size?: number;
  storagePath?: string;
  storage_path?: string;
  category?: DocumentCategory;
  description?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

function mapDocumentFromDatabase(doc: DatabaseDocument): ClientDocument {
  return {
    id: doc.id,
    organizationId: doc.organizationId ?? doc.client_id ?? '',
    uploadedBy: doc.uploadedBy ?? doc.uploaded_by ?? '',
    fileName: doc.fileName ?? doc.file_name ?? '',
    originalName: doc.originalName ?? doc.original_name ?? '',
    fileType: doc.fileType ?? doc.file_type ?? 'pdf',
    fileSize: doc.fileSize ?? doc.file_size ?? 0,
    storagePath: doc.storagePath ?? doc.storage_path ?? '',
    category: doc.category ?? 'geral',
    description: doc.description,
    createdAt: doc.createdAt ?? doc.created_at ?? '',
    updatedAt: doc.updatedAt ?? doc.updated_at ?? '',
  };
}

/**
 * Formata o tamanho do arquivo para exibição
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Retorna ícone baseado no tipo de arquivo
 */
export function getFileTypeIcon(fileType: DocumentFileType): string {
  switch (fileType) {
    case 'pdf':
      return '📄';
    case 'docx':
    case 'doc':
      return '📝';
    case 'xlsx':
    case 'xls':
      return '📊';
    default:
      return '📁';
  }
}

/**
 * Retorna cor baseada no tipo de arquivo
 */
export function getFileTypeColor(fileType: DocumentFileType): string {
  switch (fileType) {
    case 'pdf':
      return 'text-red-500';
    case 'docx':
    case 'doc':
      return 'text-blue-500';
    case 'xlsx':
    case 'xls':
      return 'text-green-500';
    default:
      return 'text-gray-500';
  }
}

/**
 * Labels para categorias
 */
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  geral: 'Geral',
  contrato: 'Contrato',
  relatorio: 'Relatório',
  financeiro: 'Financeiro',
  tecnico: 'Técnico',
  outro: 'Outro',
};
