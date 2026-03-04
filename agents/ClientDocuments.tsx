/**
 * Gerenciamento de Documentos de Cliente (Mentoria)
 * - Upload de PDF, WORD, XLSX
 * - Analistas e clientes podem fazer upload
 * - Apenas analistas podem excluir
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  Download,
  Trash2,
  Search,
  Filter,
  FileText,
  FileSpreadsheet,
  File,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  FolderOpen,
  Calendar,
  User,
  Tag,
  MoreVertical,
  Eye,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useClient } from '../contexts/ClientContext';
import { Client, ClientDocument, DocumentCategory, DocumentFileType } from '../types';
import { supabase } from '../lib/supabase';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  getDocumentUrl,
  updateDocument,
  formatFileSize,
  getFileTypeColor,
  CATEGORY_LABELS,
  validateFile,
} from '../lib/clientDocuments';

interface ClientDocumentsProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const ClientDocuments: React.FC<ClientDocumentsProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  // States
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | ''>('');
  const [filterClient, setFilterClient] = useState<string>('');

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('geral');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Menu de ações
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verificar se é analista ou admin
  const isAnalystOrAdmin = user?.role === 'admin' || user?.qualification === 'analista';
  const canDelete = isAnalystOrAdmin;

  // Carregar clientes (para filtro e seleção)
  const loadClients = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase.from('clients').select('*');

      // Se for analista, mostrar apenas seus clientes
      if (user.qualification === 'analista' && user.role !== 'admin') {
        query = query.eq('analyst_id', user.id);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;

      setClients(
        data?.map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          analystId: c.analyst_id,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })) || [],
      );
    } catch (err: any) {
      console.error('[loadClients]', err);
    }
  }, [user]);

  // Carregar documentos
  const loadDocuments = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      setError(null);

      const { documents: docs, error: loadError } = await listDocuments({
        clientId: filterClient || selectedClient?.id || undefined,
        category: filterCategory || undefined,
        searchTerm: searchTerm || undefined,
      });

      if (loadError) {
        setError(loadError);
        return;
      }

      setDocuments(docs);
    } catch (err: any) {
      console.error('[loadDocuments]', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user, filterClient, filterCategory, searchTerm, selectedClient]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Usar cliente selecionado como filtro padrão
  useEffect(() => {
    if (selectedClient && !filterClient) {
      setFilterClient(selectedClient.id);
    }
  }, [selectedClient]);

  // Handlers de drag & drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      onToast?.(validation.error!, 'error');
      return;
    }
    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  // Upload de documento
  const handleUpload = async () => {
    if (!selectedFile) {
      onToast?.('Selecione um arquivo', 'error');
      return;
    }

    const clientId = filterClient || selectedClient?.id;
    if (!clientId) {
      onToast?.('Selecione um cliente', 'error');
      return;
    }

    setIsUploading(true);

    try {
      const { success, document, error } = await uploadDocument({
        clientId,
        file: selectedFile,
        category: uploadCategory,
        description: uploadDescription || undefined,
      });

      if (!success) {
        onToast?.(error || 'Erro ao fazer upload', 'error');
        return;
      }

      onToast?.('Documento enviado com sucesso!', 'success');
      setShowUploadModal(false);
      resetUploadForm();
      loadDocuments();
    } catch (err: any) {
      console.error('[handleUpload]', err);
      onToast?.(err.message || 'Erro ao fazer upload', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setUploadCategory('geral');
    setUploadDescription('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Download de documento
  const handleDownload = async (doc: ClientDocument) => {
    try {
      const { url, error } = await getDocumentUrl(doc.storagePath);

      if (error || !url) {
        onToast?.(error || 'Erro ao gerar link', 'error');
        return;
      }

      // Abrir em nova aba para download
      window.open(url, '_blank');
    } catch (err: any) {
      console.error('[handleDownload]', err);
      onToast?.('Erro ao baixar documento', 'error');
    }
  };

  // Excluir documento
  const handleDelete = async (doc: ClientDocument) => {
    if (!canDelete) {
      onToast?.('Apenas analistas podem excluir documentos', 'error');
      return;
    }

    if (!confirm(`Excluir "${doc.originalName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletingId(doc.id);

    try {
      const { success, error } = await deleteDocument(doc.id);

      if (!success) {
        onToast?.(error || 'Erro ao excluir', 'error');
        return;
      }

      onToast?.('Documento excluído', 'success');
      loadDocuments();
    } catch (err: any) {
      console.error('[handleDelete]', err);
      onToast?.('Erro ao excluir documento', 'error');
    } finally {
      setDeletingId(null);
      setActiveMenu(null);
    }
  };

  // Ícone do tipo de arquivo
  const FileIcon = ({ type }: { type: DocumentFileType }) => {
    const colorClass = getFileTypeColor(type);
    switch (type) {
      case 'pdf':
        return <FileText className={`${colorClass}`} size={20} />;
      case 'xlsx':
      case 'xls':
        return <FileSpreadsheet className={`${colorClass}`} size={20} />;
      default:
        return <File className={`${colorClass}`} size={20} />;
    }
  };

  // Cliente selecionado ou nenhum
  const currentClientId = filterClient || selectedClient?.id;
  const currentClientName = clients.find(c => c.id === currentClientId)?.name || selectedClient?.name;

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full text-ai-subtext">
        <AlertCircle className="mr-2" size={20} />
        Faça login para acessar os documentos
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ai-bg p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ai-text mb-2">Documentos da Mentoria</h1>
        <p className="text-sm text-ai-subtext">Gerencie os documentos da organização. PDF, Word e Excel são aceitos.</p>
      </div>

      {/* Filtros e Ações */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        {/* Seletor de Organização */}
        <div className="flex-1 md:max-w-xs">
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-ai-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
          >
            <option value="">Todas as organizações</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        {/* Busca */}
        <div className="flex-1 md:max-w-sm relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ai-subtext" size={16} />
          <input
            type="text"
            placeholder="Buscar documentos..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-ai-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
          />
        </div>

        {/* Filtro por Categoria */}
        <div className="md:w-40">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value as DocumentCategory | '')}
            className="w-full px-3 py-2 bg-white border border-ai-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
          >
            <option value="">Todas categorias</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Botão Upload */}
        <button
          onClick={() => {
            if (!currentClientId) {
              onToast?.('Selecione um cliente primeiro', 'warning');
              return;
            }
            setShowUploadModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accent/90 transition-colors text-sm font-medium"
        >
          <Upload size={16} />
          Enviar Documento
        </button>
      </div>

      {/* Cliente atual */}
      {currentClientName && (
          <div className="mb-4 px-3 py-2 bg-ai-surface rounded-lg border border-ai-border">
          <span className="text-sm text-ai-subtext">Organização: </span>
          <span className="text-sm font-medium text-ai-text">{currentClientName}</span>
        </div>
      )}

      {/* Lista de Documentos */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-ai-accent" size={32} />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-500">
            <AlertCircle className="mr-2" size={20} />
            {error}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-ai-subtext">
            <FolderOpen size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">Nenhum documento encontrado</p>
            <p className="text-sm">
              {currentClientId
                ? 'Envie o primeiro documento clicando no botão acima.'
                : 'Selecione uma organização para ver seus documentos.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {documents.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-4 p-4 bg-white border border-ai-border rounded-lg hover:shadow-md transition-shadow"
              >
                {/* Ícone do tipo */}
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-ai-surface rounded-lg">
                  <FileIcon type={doc.fileType} />
                </div>

                {/* Info do documento */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-ai-text truncate" title={doc.originalName}>
                    {doc.originalName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-ai-subtext">
                    <span className="flex items-center gap-1">
                      <Tag size={12} />
                      {CATEGORY_LABELS[doc.category]}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                    {doc.uploaderName && (
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {doc.uploaderName}
                      </span>
                    )}
                  </div>
                  {doc.description && <p className="text-xs text-ai-subtext mt-1 truncate">{doc.description}</p>}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-2 text-ai-subtext hover:text-ai-accent hover:bg-ai-surface rounded-lg transition-colors"
                    title="Baixar"
                  >
                    <Download size={18} />
                  </button>

                  {canDelete && (
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      className="p-2 text-ai-subtext hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Excluir"
                    >
                      {deletingId === doc.id ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Upload */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-ai-border">
              <h2 className="text-lg font-bold text-ai-text">Enviar Documento</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  resetUploadForm();
                }}
                className="p-1 text-ai-subtext hover:text-ai-text rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              {/* Organização */}
              <div className="px-3 py-2 bg-ai-surface rounded-lg">
                <span className="text-sm text-ai-subtext">Organização: </span>
                <span className="text-sm font-medium text-ai-text">{currentClientName}</span>
              </div>

              {/* Área de drop */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${dragActive ? 'border-ai-accent bg-ai-accent/5' : 'border-ai-border hover:border-ai-accent/50'}
                  ${selectedFile ? 'bg-green-50 border-green-300' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle2 className="text-green-500" size={24} />
                    <div className="text-left">
                      <p className="font-medium text-ai-text">{selectedFile.name}</p>
                      <p className="text-sm text-ai-subtext">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="p-1 text-ai-subtext hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto mb-3 text-ai-subtext" size={32} />
                    <p className="text-ai-text font-medium mb-1">Arraste um arquivo ou clique para selecionar</p>
                    <p className="text-sm text-ai-subtext">PDF, DOCX, DOC, XLSX, XLS (máx. 10MB)</p>
                  </>
                )}
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Categoria</label>
                <select
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value as DocumentCategory)}
                  className="w-full px-3 py-2 border border-ai-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Descrição (opcional)</label>
                <textarea
                  value={uploadDescription}
                  onChange={e => setUploadDescription(e.target.value)}
                  placeholder="Adicione uma descrição para o documento..."
                  rows={2}
                  className="w-full px-3 py-2 border border-ai-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t border-ai-border">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  resetUploadForm();
                }}
                className="px-4 py-2 text-ai-subtext hover:text-ai-text transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="flex items-center gap-2 px-4 py-2 bg-ai-accent text-white rounded-lg hover:bg-ai-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Enviar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDocuments;
