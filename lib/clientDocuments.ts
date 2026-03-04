/**
 * Operações CRUD para documentos de clientes (mentoria)
 * Suporta PDF, WORD (doc, docx), Excel (xls, xlsx)
 */
import { supabase } from './supabase';
import { ClientDocument, DocumentCategory, DocumentFileType, DocumentUploadParams, DocumentFilter } from '../types';
import { logger } from './logger';
import { storageUpload, storageGetSignedUrl, storageRemove } from './storage';

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
  // Validar tamanho
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Arquivo muito grande. Máximo permitido: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  // Validar tipo MIME
  const fileType = ALLOWED_MIME_TYPES[file.type];
  if (!fileType) {
    // Tentar pela extensão
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
function generateStoragePath(clientId: string, originalName: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
  const safeName = originalName
    .replace(/\.[^/.]+$/, '') // remove extensão
    .replace(/[^a-zA-Z0-9-_]/g, '_') // caracteres especiais
    .substring(0, 50); // limita tamanho

  return `${clientId}/${timestamp}_${randomId}_${safeName}.${ext}`;
}

/**
 * Faz upload de um documento para o cliente
 */
export async function uploadDocument(
  params: DocumentUploadParams,
): Promise<{ success: boolean; document?: ClientDocument; error?: string }> {
  const { clientId, file, category = 'geral', description } = params;

  try {
    // Validar arquivo
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Obter usuário atual
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' };
    }

    // Gerar caminho no storage
    const storagePath = generateStoragePath(clientId, file.name);

    try {
      await storageUpload(STORAGE_PREFIX, storagePath, file, { contentType: file.type });
    } catch (uploadError: unknown) {
      const msg = uploadError instanceof Error ? uploadError.message : 'Erro desconhecido';
      log.error('uploadDocument storage error', new Error(msg));
      return { success: false, error: `Erro ao fazer upload: ${msg}` };
    }

    // Inserir metadados na tabela
    const { data, error: dbError } = await supabase
      .from('client_documents')
      .insert({
        client_id: clientId,
        uploaded_by: user.id,
        file_name: storagePath.split('/').pop(),
        original_name: file.name,
        file_type: validation.fileType,
        file_size: file.size,
        storage_path: storagePath,
        category,
        description,
      })
      .select()
      .single();

    if (dbError) {
      await storageRemove(STORAGE_PREFIX, [storagePath]);
      log.error('uploadDocument DB error', new Error(dbError.message));
      return { success: false, error: `Erro ao salvar documento: ${dbError.message}` };
    }

    return {
      success: true,
      document: mapDocumentFromDatabase(data),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido ao fazer upload';
    log.error('uploadDocument error', error instanceof Error ? error : new Error(msg));
    return { success: false, error: msg };
  }
}

/**
 * Lista documentos de um cliente com filtros opcionais
 */
export async function listDocuments(
  filter: DocumentFilter = {},
): Promise<{ documents: ClientDocument[]; error?: string }> {
  try {
    // Não fazer join com auth.users (uploaded_by) - anon/authenticated não têm permissão.
    // Apenas client_documents + clients.
    let query = supabase
      .from('client_documents')
      .select(
        `
        *,
        clients(name)
      `,
      )
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (filter.clientId) {
      query = query.eq('client_id', filter.clientId);
    }
    if (filter.category) {
      query = query.eq('category', filter.category);
    }
    if (filter.fileType) {
      query = query.eq('file_type', filter.fileType);
    }
    if (filter.searchTerm) {
      query = query.or(`original_name.ilike.%${filter.searchTerm}%,description.ilike.%${filter.searchTerm}%`);
    }

    const { data, error } = await query;

    if (error) {
      log.error('listDocuments query error', new Error(error.message));
      return { documents: [], error: error.message };
    }

    const documents = (data || []).map(doc => ({
      ...mapDocumentFromDatabase(doc as unknown as DatabaseDocument),
      uploaderName: '—',
      clientName: (doc as unknown as { clients?: { name?: string } }).clients?.name || 'Organização',
    }));

    return { documents };
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
    // Primeiro, buscar o documento para obter o storage_path
    const { data: doc, error: fetchError } = await supabase
      .from('client_documents')
      .select('storage_path')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return { success: false, error: 'Documento não encontrado' };
    }

    try {
      await storageRemove(STORAGE_PREFIX, [doc.storage_path]);
    } catch {
      log.warn('deleteDocument storage error (file may already be removed)');
    }

    // Excluir do banco
    const { error: dbError } = await supabase.from('client_documents').delete().eq('id', documentId);

    if (dbError) {
      log.error('deleteDocument DB error', new Error(dbError.message));
      return { success: false, error: dbError.message };
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
    const { error } = await supabase.from('client_documents').update(updates).eq('id', documentId);

    if (error) {
      log.error('updateDocument error', new Error(error.message));
      return { success: false, error: error.message };
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
  client_id: string;
  uploaded_by: string;
  file_name: string;
  original_name: string;
  file_type: DocumentFileType;
  file_size: number;
  storage_path: string;
  category: DocumentCategory;
  description?: string;
  created_at: string;
  updated_at: string;
}

function mapDocumentFromDatabase(doc: DatabaseDocument): ClientDocument {
  return {
    id: doc.id,
    clientId: doc.client_id,
    uploadedBy: doc.uploaded_by,
    fileName: doc.file_name,
    originalName: doc.original_name,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    storagePath: doc.storage_path,
    category: doc.category,
    description: doc.description,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
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
