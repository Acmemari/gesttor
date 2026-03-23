import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Save,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Building2,
  User,
  Mail,
  Phone,
  Users,
  MapPin,
  ToggleLeft,
  ToggleRight,
  XCircle,
  FileText,
  Upload,
  Trash2,
  Download,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import { getAuthHeaders } from '../lib/session';
import { fetchAnalysts } from '../lib/api/hierarchyClient';
import { storageUpload, storageGetSignedUrl, storageRemove } from '../lib/storage';
import type { User as AppUser } from '../types';
import OrgAnalystsSection from '../components/OrgAnalystsSection';

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface OrgItem {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  analystId: string;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  plan: string | null;
  ownerId: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
  ownersCount: number;
  farmsCount: number;
}

interface OrgOwner {
  id?: string;
  name: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
}

interface OrgDetail extends OrgItem {
  owners: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    sortOrder: number;
  }>;
}

type OwnerFieldError = { email?: string; phone?: string };

interface OrgDocument {
  id: string;
  organizationId: string;
  uploadedBy: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  category: string | null;
  description: string | null;
  createdAt: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

type PhoneCountryOption = {
  iso: 'BR' | 'PY' | 'UY' | 'BO' | 'CO' | 'AR';
  code: string;
  label: string;
  localLengths: number[];
};

const PHONE_COUNTRIES: PhoneCountryOption[] = [
  { iso: 'BR', code: '+55', label: 'BR +55', localLengths: [10, 11] },
  { iso: 'PY', code: '+595', label: 'PY +595', localLengths: [9] },
  { iso: 'UY', code: '+598', label: 'UY +598', localLengths: [8] },
  { iso: 'BO', code: '+591', label: 'BO +591', localLengths: [8] },
  { iso: 'CO', code: '+57', label: 'CO +57', localLengths: [10] },
  { iso: 'AR', code: '+54', label: 'AR +54', localLengths: [10] },
];

const DEFAULT_PHONE_COUNTRY_CODE = '+55';

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

// ─── Helpers de telefone ──────────────────────────────────────────────────────

function getCountryByCode(code: string): PhoneCountryOption {
  return (
    PHONE_COUNTRIES.find(c => c.code === code) ||
    PHONE_COUNTRIES.find(c => c.code === DEFAULT_PHONE_COUNTRY_CODE)!
  );
}

function normalizeLocalDigits(value: string, countryCode: string): string {
  const country = getCountryByCode(countryCode);
  const digitsOnly = value.replace(/\D/g, '');
  const countryDigits = countryCode.replace(/\D/g, '');
  const withoutCode = digitsOnly.startsWith(countryDigits) ? digitsOnly.slice(countryDigits.length) : digitsOnly;
  return withoutCode.slice(0, Math.max(...country.localLengths));
}

function formatLocalPhoneByCountry(countryCode: string, rawValue: string): string {
  const country = getCountryByCode(countryCode);
  const digits = normalizeLocalDigits(rawValue, countryCode);
  if (country.iso === 'BR') {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function composePhoneWithCountry(countryCode: string, localPhone: string): string | null {
  const normalized = formatLocalPhoneByCountry(countryCode, localPhone);
  const localDigits = normalized.replace(/\D/g, '');
  if (!localDigits) return null;
  return `${countryCode} ${normalized}`;
}

function splitPhoneForForm(rawPhone?: string | null): { countryCode: string; localPhone: string } {
  if (!rawPhone?.trim()) return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, localPhone: '' };
  const normalized = rawPhone.trim();
  const byPrefix = PHONE_COUNTRIES.find(
    c => normalized.startsWith(`${c.code} `) || normalized.startsWith(c.code),
  );
  if (byPrefix) {
    const countryDigits = byPrefix.code.replace(/\D/g, '');
    const allDigits = normalized.replace(/\D/g, '');
    const localDigits = allDigits.startsWith(countryDigits) ? allDigits.slice(countryDigits.length) : allDigits;
    return { countryCode: byPrefix.code, localPhone: formatLocalPhoneByCountry(byPrefix.code, localDigits) };
  }
  return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, localPhone: formatLocalPhoneByCountry(DEFAULT_PHONE_COUNTRY_CODE, normalized) };
}

// ─── Máscara de CNPJ ─────────────────────────────────────────────────────────

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

// ─── Cliente HTTP para /api/organizations ─────────────────────────────────────

async function orgApiCall<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T; meta?: Record<string, unknown> } | { ok: false; error: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/organizations${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...((options?.headers as Record<string, string>) ?? {}) },
  });
  const json = await res.json().catch(() => ({ ok: false, error: 'Erro de parse' }));
  return json as { ok: true; data: T } | { ok: false; error: string };
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ClientManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// ─── Componente principal ─────────────────────────────────────────────────────

const ClientManagement: React.FC<ClientManagementProps> = ({ onToast }) => {
  const { user: currentUser } = useAuth();
  const { refreshCurrentLevel } = useHierarchy();
  const clientFormReadOnly = currentUser?.role === 'admin' ? false : currentUser?.qualification !== 'analista';

  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [analysts, setAnalysts] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterState, setFilterState] = useState<string>('');
  const [view, setView] = useState<'list' | 'form'>('list');

  // Notificar App.tsx sobre mudanças de view
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('clientViewChange', { detail: view }));
  }, [view]);

  const [editingOrg, setEditingOrg] = useState<OrgItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [owners, setOwners] = useState<OrgOwner[]>([]);
  const [ownerErrors, setOwnerErrors] = useState<OwnerFieldError[]>([]);
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Verificação de nome duplicado (debounce)
  const [nameError, setNameError] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    email: '',
    cnpj: '',
    address: '',
    city: '',
    state: '',
    status: 'active',
    plan: 'essencial',
    ativo: true,
    analystId: currentUser?.id || '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Carregar dados ──────────────────────────────────────────────────────────

  const loadOrgs = useCallback(async () => {
    if (!currentUser) return;
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterState) params.set('state', filterState);
      params.set('limit', '100');

      const res = await orgApiCall<OrgItem[]>(`?${params.toString()}`);
      if (!res.ok) {
        setError(`Erro ao carregar organizações: ${res.error}`);
        return;
      }
      setOrgs(res.data || []);
    } catch (err: unknown) {
      setError(`Erro inesperado: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, filterStatus, filterState]);

  const loadAnalysts = useCallback(async () => {
    if (currentUser?.role !== 'admin') return;
    try {
      const { data } = await fetchAnalysts({ limit: 200 });
      setAnalysts(data);
    } catch {
      // analistas são opcionais para admin
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && (currentUser.role === 'admin' || currentUser.qualification === 'analista')) {
      void loadOrgs();
      void loadAnalysts();
    } else if (currentUser) {
      setError('Acesso negado. Apenas analistas e administradores podem acessar esta página.');
      setIsLoading(false);
    }
  }, [currentUser, loadOrgs, loadAnalysts]);

  // ── Verificação de nome duplicado ───────────────────────────────────────────

  const triggerNameCheck = useCallback(
    (name: string) => {
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
      if (name.trim().length < 3) {
        setNameError(null);
        return;
      }
      nameDebounceRef.current = setTimeout(async () => {
        setCheckingName(true);
        try {
          const params = new URLSearchParams({ action: 'check-name', name: name.trim() });
          if (editingOrg?.id) params.set('excludeId', editingOrg.id);
          const res = await orgApiCall<{ exists: boolean }>(`?${params.toString()}`);
          if (res.ok && res.data.exists) {
            setNameError('Este nome de organização já está em uso.');
          } else {
            setNameError(null);
          }
        } finally {
          setCheckingName(false);
        }
      }, 500);
    },
    [editingOrg],
  );

  // ── Validação ───────────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Nome é obrigatório';
    if (!formData.email.trim()) errors.email = 'Email é obrigatório';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Email inválido';
    if (!formData.analystId) errors.analystId = 'Analista responsável é obrigatório';
    if (formData.phone.trim()) {
      const country = getCountryByCode(formData.phoneCountryCode);
      const phoneDigits = normalizeLocalDigits(formData.phone, formData.phoneCountryCode);
      if (!country.localLengths.includes(phoneDigits.length)) {
        errors.phone = `Telefone inválido para ${country.label}`;
      }
    }
    if (nameError) errors.name = nameError;
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateOwnerContacts = (): boolean => {
    const nextErrors: OwnerFieldError[] = owners.map(() => ({}));
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let hasError = false;
    owners.forEach((owner, idx) => {
      const email = owner.email.trim();
      const country = getCountryByCode(owner.phoneCountryCode);
      const phoneDigits = normalizeLocalDigits(owner.phone, owner.phoneCountryCode);
      const hasContent = owner.name.trim() || email || phoneDigits;
      if (!hasContent) return;
      if (email && !emailRegex.test(email)) {
        nextErrors[idx].email = 'Informe um e-mail válido';
        hasError = true;
      }
      if (phoneDigits && !country.localLengths.includes(phoneDigits.length)) {
        nextErrors[idx].phone = `Telefone inválido para ${country.label}`;
        hasError = true;
      }
    });
    setOwnerErrors(nextErrors);
    return !hasError;
  };

  // ── Salvar ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      onToast?.('Corrija os campos obrigatórios.', 'error');
      document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!validateOwnerContacts()) {
      onToast?.('Corrija os contatos dos proprietários gestores.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const ownersPayload = owners
        .filter(o => o.name.trim())
        .map((o, i) => ({
          name: o.name.trim(),
          email: o.email.trim().toLowerCase() || null,
          phone: composePhoneWithCountry(o.phoneCountryCode, o.phone),
          sortOrder: i,
        }));

      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: composePhoneWithCountry(formData.phoneCountryCode, formData.phone),
        cnpj: formData.cnpj.replace(/\D/g, '') ? formData.cnpj : null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        status: formData.status,
        plan: formData.plan,
        ativo: formData.ativo,
        owners: ownersPayload,
      };
      if (currentUser?.role === 'admin') {
        body.analystId = formData.analystId;
      }

      let res;
      if (editingOrg) {
        res = await orgApiCall('', {
          method: 'PATCH',
          body: JSON.stringify({ id: editingOrg.id, ...body }),
        });
      } else {
        res = await orgApiCall('', { method: 'POST', body: JSON.stringify(body) });
      }

      if (!res.ok) {
        onToast?.(`Erro ao salvar: ${res.error}`, 'error');
        return;
      }

      onToast?.(editingOrg ? 'Organização atualizada com sucesso!' : 'Organização cadastrada com sucesso!', 'success');
      resetForm();
      setView('list');
      void loadOrgs();
      void refreshCurrentLevel('clients');
    } catch (err: unknown) {
      onToast?.(`Erro inesperado: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Editar ──────────────────────────────────────────────────────────────────

  const handleEdit = async (org: OrgItem) => {
    const phoneParts = splitPhoneForForm(org.phone || '');
    setEditingOrg(org);
    setFormData({
      name: org.name,
      phone: phoneParts.localPhone,
      phoneCountryCode: phoneParts.countryCode,
      email: org.email,
      cnpj: org.cnpj ? formatCNPJ(org.cnpj) : '',
      address: org.address || '',
      city: org.city || '',
      state: org.state || '',
      status: org.status || 'active',
      plan: org.plan || 'essencial',
      ativo: org.ativo,
      analystId: org.analystId,
    });

    setDocs([]);
    try {
      const res = await orgApiCall<OrgDetail>(`?id=${org.id}`);
      if (res.ok && res.data.owners) {
        setOwners(
          res.data.owners.map(o => ({
            id: o.id,
            name: o.name || '',
            email: o.email || '',
            phone: splitPhoneForForm(o.phone || '').localPhone,
            phoneCountryCode: splitPhoneForForm(o.phone || '').countryCode,
          })),
        );
        setOwnerErrors(Array(res.data.owners.length).fill({}));
      }
    } catch {
      setOwners([]);
      setOwnerErrors([]);
    }

    // Carregar documentos existentes
    setDocsLoading(true);
    try {
      const docsRes = await orgApiCall<OrgDocument[]>(`?action=documents&organizationId=${org.id}`);
      if (docsRes.ok) setDocs(docsRes.data);
    } finally {
      setDocsLoading(false);
    }

    setView('form');
  };

  // ── Desativar (soft delete) ─────────────────────────────────────────────────

  const handleDeactivate = useCallback(
    async (orgId: string, orgName: string) => {
      const confirmed = window.confirm(
        `Desativar a organização "${orgName}"?\n\nA organização ficará inativa mas não será excluída. As fazendas vinculadas permanecem no sistema.`,
      );
      if (!confirmed) return;

      setDeactivatingId(orgId);
      try {
        const res = await orgApiCall('', {
          method: 'PATCH',
          body: JSON.stringify({ id: orgId, action: 'deactivate' }),
        });
        if (!res.ok) {
          onToast?.(`Erro ao desativar: ${res.error}`, 'error');
          return;
        }
        onToast?.('Organização desativada com sucesso.', 'success');
        void loadOrgs();
        void refreshCurrentLevel('clients');
      } catch (err: unknown) {
        onToast?.(`Erro inesperado: ${err instanceof Error ? err.message : ''}`, 'error');
      } finally {
        setDeactivatingId(null);
      }
    },
    [loadOrgs, onToast, refreshCurrentLevel],
  );

  // ── Resetar form ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      email: '',
      cnpj: '',
      address: '',
      city: '',
      state: '',
      status: 'active',
      plan: 'essencial',
      ativo: true,
      analystId: currentUser?.id || '',
    });
    setFormErrors({});
    setNameError(null);
    setEditingOrg(null);
    setOwners([]);
    setOwnerErrors([]);
    setDocs([]);
  };

  const handleCancel = () => {
    resetForm();
    setView('list');
    window.dispatchEvent(new CustomEvent('clientCancelForm'));
  };

  // ── Eventos da barra superior (App.tsx) ──────────────────────────────────────

  useEffect(() => {
    const handleCancelForm = () => {
      if (view === 'form') { resetForm(); setView('list'); }
    };
    window.addEventListener('clientCancelForm', handleCancelForm);
    return () => window.removeEventListener('clientCancelForm', handleCancelForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    const handleNewClient = () => { resetForm(); setView('form'); };
    window.addEventListener('clientNewClient', handleNewClient);
    return () => window.removeEventListener('clientNewClient', handleNewClient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lista filtrada (busca local) ─────────────────────────────────────────────

  const filteredOrgs = useMemo(() => {
    if (!searchTerm) return orgs;
    const term = searchTerm.toLowerCase();
    return orgs.filter(
      o =>
        o.name.toLowerCase().includes(term) ||
        o.email.toLowerCase().includes(term) ||
        (o.phone && o.phone.includes(term)) ||
        (o.cnpj && o.cnpj.includes(term)),
    );
  }, [orgs, searchTerm]);

  // ── Documentos ───────────────────────────────────────────────────────────────

  const STORAGE_PREFIX = 'organization-documents';

  const handleDocUpload = async (file: File) => {
    if (!editingOrg) return;
    setUploadingDoc(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const safeName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
      const path = `${editingOrg.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}.${ext}`;

      await storageUpload(STORAGE_PREFIX, path, file, { contentType: file.type });

      const res = await orgApiCall<OrgDocument>('', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create-document',
          organizationId: editingOrg.id,
          storagePath: path,
          fileName: path,
          originalName: file.name,
          fileType: file.type,
          fileSize: file.size,
          category: 'geral',
        }),
      });

      if (res.ok) {
        setDocs(prev => [...prev, res.data]);
        onToast?.('Documento enviado com sucesso!', 'success');
      } else {
        onToast?.(`Erro ao registrar documento: ${res.error}`, 'error');
      }
    } catch (err: unknown) {
      onToast?.(`Erro no upload: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, 'error');
    } finally {
      setUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleDocDelete = async (doc: OrgDocument) => {
    const confirmed = window.confirm(`Remover o documento "${doc.originalName}"?`);
    if (!confirmed) return;

    setDeletingDocId(doc.id);
    try {
      await storageRemove(STORAGE_PREFIX, [doc.storagePath]);
      const res = await orgApiCall<{ deleted: boolean }>(`?action=delete-document&documentId=${doc.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDocs(prev => prev.filter(d => d.id !== doc.id));
        onToast?.('Documento removido.', 'success');
      } else {
        onToast?.(`Erro ao remover: ${res.error}`, 'error');
      }
    } catch (err: unknown) {
      onToast?.(`Erro ao remover: ${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleDocDownload = async (doc: OrgDocument) => {
    try {
      const url = await storageGetSignedUrl(STORAGE_PREFIX, doc.storagePath);
      window.open(url, '_blank');
    } catch {
      onToast?.('Não foi possível gerar o link de download.', 'error');
    }
  };

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── Guard de acesso ──────────────────────────────────────────────────────────

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.qualification !== 'analista')) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-ai-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-ai-text mb-2">Acesso Negado</h2>
          <p className="text-ai-subtext">Apenas analistas e administradores podem acessar esta página.</p>
        </div>
      </div>
    );
  }

  // ── View: Formulário ─────────────────────────────────────────────────────────

  if (view === 'form') {
    return (
      <div className={`h-full overflow-y-auto ${clientFormReadOnly ? 'bg-ai-bg' : 'bg-white'}`}>
        <div className="max-w-4xl mx-auto p-6">
          <div className={`rounded-lg shadow-lg p-6 ${clientFormReadOnly ? 'bg-ai-surface' : 'bg-white border border-ai-border'}`}>
            <div className="flex items-center justify-end mb-6">
              <button onClick={handleCancel} className="p-2 hover:bg-ai-surface2 rounded-md transition-colors" title="Cancelar">
                <X className="w-5 h-5 text-ai-subtext" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <fieldset disabled={clientFormReadOnly} className={clientFormReadOnly ? 'opacity-75' : ''}>

                {/* Nome */}
                <div className={`mb-4 ${formErrors.name || nameError ? 'bg-red-500/5 rounded-lg px-3 pt-2 pb-1 -mx-3' : ''}`} data-error={formErrors.name || nameError ? 'true' : undefined}>
                  <label className={`block text-sm font-medium mb-2 flex items-center gap-1.5 ${formErrors.name || nameError ? 'text-ai-error' : 'text-ai-text'}`}>
                    {(formErrors.name || nameError) && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    Nome da Organização / Grupo Econômico <span className="text-ai-error">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => {
                        setFormData({ ...formData, name: e.target.value });
                        triggerNameCheck(e.target.value);
                      }}
                      className={`w-full px-4 py-2 bg-ai-surface2 border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent pr-8 ${
                        formErrors.name || nameError ? 'border-ai-error' : 'border-ai-border'
                      }`}
                      placeholder="Digite o nome da organização"
                    />
                    {checkingName && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-ai-subtext" />
                    )}
                    {!checkingName && formData.name.trim().length >= 3 && !nameError && (
                      <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                    )}
                    {!checkingName && nameError && (
                      <XCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-ai-error" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ai-subtext">Nome da Organização, Agropecuária ou Grupo Econômico</p>
                  {(formErrors.name || nameError) && (
                    <p className="mt-1 text-sm text-ai-error">{nameError || formErrors.name}</p>
                  )}
                </div>

                {/* Email */}
                <div className={`mb-4 ${formErrors.email ? 'bg-red-500/5 rounded-lg px-3 pt-2 pb-1 -mx-3' : ''}`} data-error={formErrors.email ? 'true' : undefined}>
                  <label className={`block text-sm font-medium mb-2 flex items-center gap-1.5 ${formErrors.email ? 'text-ai-error' : 'text-ai-text'}`}>
                    {formErrors.email && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    E-mail do Contato Administrativo <span className="text-ai-error">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-4 py-2 bg-ai-surface2 border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                      formErrors.email ? 'border-ai-error' : 'border-ai-border'
                    }`}
                    placeholder="organizacao@exemplo.com"
                  />
                  {formErrors.email && <p className="mt-1 text-sm text-ai-error">{formErrors.email}</p>}
                </div>

                {/* Telefone */}
                <div className="mb-4" data-error={formErrors.phone ? 'true' : undefined}>
                  <label className="block text-sm font-medium text-ai-text mb-2">Telefone do Contato Administrativo</label>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <select
                      value={formData.phoneCountryCode}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          phoneCountryCode: e.target.value,
                          phone: formatLocalPhoneByCountry(e.target.value, formData.phone),
                        })
                      }
                      className="w-full px-3 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent text-sm"
                    >
                      {PHONE_COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e =>
                        setFormData({ ...formData, phone: formatLocalPhoneByCountry(formData.phoneCountryCode, e.target.value) })
                      }
                      className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  {formErrors.phone && <p className="mt-1 text-sm text-ai-error">{formErrors.phone}</p>}
                </div>

                {/* CNPJ */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-ai-text mb-2">CNPJ</label>
                  <input
                    type="text"
                    value={formData.cnpj}
                    onChange={e => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                    className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                  />
                </div>

                {/* Endereço */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-ai-text mb-2">Endereço</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    placeholder="Rua, número, complemento"
                  />
                </div>

                {/* Cidade e Estado */}
                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-2">Cidade</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                      placeholder="Cidade"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-2">Estado (UF)</label>
                    <select
                      value={formData.state}
                      onChange={e => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    >
                      <option value="">Selecione o estado</option>
                      {UF_LIST.map(uf => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Status e Plano */}
                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ai-text mb-2">Plano</label>
                    <select
                      value={formData.plan}
                      onChange={e => setFormData({ ...formData, plan: e.target.value })}
                      className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    >
                      <option value="essencial">Essencial</option>
                      <option value="gestor">Gestor</option>
                      <option value="pro">Pró</option>
                    </select>
                  </div>
                </div>

                {/* Toggle Ativo */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-ai-text mb-2">Situação</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, ativo: !formData.ativo })}
                    className="flex items-center gap-2 text-sm text-ai-text"
                  >
                    {formData.ativo ? (
                      <ToggleRight className="w-8 h-8 text-ai-accent" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-ai-subtext" />
                    )}
                    <span>{formData.ativo ? 'Organização ativa' : 'Organização inativa'}</span>
                  </button>
                </div>

                {/* Proprietários/Sócios */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-ai-text">Proprietário(s) Gestores</label>
                    <button
                      type="button"
                      onClick={() => {
                        setOwners([...owners, { name: '', email: '', phone: '', phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE }]);
                        setOwnerErrors([...ownerErrors, {}]);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-ai-border text-ai-subtext hover:text-ai-text text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-ai-subtext mb-3">Nome dos sócios gestores relacionados com a operação</p>
                  {owners.length === 0 ? (
                    <div className="border border-dashed border-ai-border rounded-md p-4 text-center">
                      <p className="text-xs text-ai-subtext">Nenhum proprietário gestor cadastrado.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setOwners([{ name: '', email: '', phone: '', phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE }]);
                          setOwnerErrors([{}]);
                        }}
                        className="mt-2 text-xs text-ai-accent hover:underline"
                      >
                        Adicionar primeiro proprietário
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {owners.map((owner, idx) => (
                        <div key={idx} className="rounded-lg border border-ai-border bg-ai-surface2 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-ai-subtext">Proprietário {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setOwners(owners.filter((_, i) => i !== idx));
                                setOwnerErrors(ownerErrors.filter((_, i) => i !== idx));
                              }}
                              className="p-1 rounded text-red-500 hover:bg-red-50"
                              title="Remover proprietário"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={owner.name}
                              onChange={e => {
                                const next = [...owners];
                                next[idx] = { ...next[idx], name: e.target.value };
                                setOwners(next);
                              }}
                              className="w-full px-3 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
                              placeholder="Nome"
                            />
                            <div>
                              <input
                                type="email"
                                value={owner.email}
                                onChange={e => {
                                  const next = [...owners];
                                  next[idx] = { ...next[idx], email: e.target.value.replace(/\s+/g, '').toLowerCase() };
                                  setOwners(next);
                                  const errs = [...ownerErrors];
                                  errs[idx] = { ...errs[idx], email: undefined };
                                  setOwnerErrors(errs);
                                }}
                                className="w-full px-3 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
                                placeholder="nome@dominio.com"
                              />
                              {ownerErrors[idx]?.email && (
                                <p className="text-xs text-ai-error mt-1">{ownerErrors[idx].email}</p>
                              )}
                            </div>
                            <div>
                              <div className="grid grid-cols-[96px_1fr] gap-2">
                                <select
                                  value={owner.phoneCountryCode}
                                  onChange={e => {
                                    const next = [...owners];
                                    next[idx] = {
                                      ...next[idx],
                                      phoneCountryCode: e.target.value,
                                      phone: formatLocalPhoneByCountry(e.target.value, next[idx].phone),
                                    };
                                    setOwners(next);
                                  }}
                                  className="w-full px-2 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-xs focus:outline-none focus:ring-2 focus:ring-ai-accent"
                                >
                                  {PHONE_COUNTRIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.iso} {c.code}</option>
                                  ))}
                                </select>
                                <input
                                  type="tel"
                                  value={owner.phone}
                                  onChange={e => {
                                    const next = [...owners];
                                    next[idx] = {
                                      ...next[idx],
                                      phone: formatLocalPhoneByCountry(next[idx].phoneCountryCode, e.target.value),
                                    };
                                    setOwners(next);
                                    const errs = [...ownerErrors];
                                    errs[idx] = { ...errs[idx], phone: undefined };
                                    setOwnerErrors(errs);
                                  }}
                                  className="w-full px-3 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
                                  placeholder="(00) 00000-0000"
                                />
                              </div>
                              {ownerErrors[idx]?.phone && (
                                <p className="text-xs text-ai-error mt-1">{ownerErrors[idx].phone}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Documentos (somente ao editar) */}
                {editingOrg && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-ai-text">Documentos</label>
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        disabled={uploadingDoc}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-ai-border text-ai-subtext hover:text-ai-text text-xs disabled:opacity-50"
                      >
                        {uploadingDoc ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        {uploadingDoc ? 'Enviando...' : 'Enviar arquivo'}
                      </button>
                      <input
                        ref={docInputRef}
                        type="file"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) void handleDocUpload(file);
                        }}
                      />
                    </div>
                    <p className="text-xs text-ai-subtext mb-3">Contratos, licenças e outros documentos da organização</p>
                    {docsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-ai-subtext" />
                      </div>
                    ) : docs.length === 0 ? (
                      <div className="border border-dashed border-ai-border rounded-md p-4 text-center">
                        <FileText className="w-8 h-8 text-ai-subtext mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-ai-subtext">Nenhum documento cadastrado.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {docs.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-ai-border bg-ai-surface2 px-3 py-2">
                            <FileText className="w-4 h-4 text-ai-subtext flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-ai-text truncate" title={doc.originalName}>{doc.originalName}</p>
                              <p className="text-xs text-ai-subtext">{formatFileSize(doc.fileSize)} · {doc.fileType}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDocDownload(doc)}
                              className="p-1.5 rounded text-ai-subtext hover:text-ai-accent hover:bg-ai-surface3 transition-colors"
                              title="Baixar"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDocDelete(doc)}
                              disabled={deletingDocId === doc.id}
                              className="p-1.5 rounded text-ai-subtext hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Remover"
                            >
                              {deletingDocId === doc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Analistas Secundários (somente ao editar) */}
                {editingOrg && (
                  <OrgAnalystsSection
                    orgId={editingOrg.id}
                    canManage={currentUser.role === 'admin' || editingOrg.analystId === currentUser.id}
                    onToast={onToast}
                  />
                )}

                {/* Analista Responsável (somente admin) */}
                {currentUser.role === 'admin' && (
                  <div className={`mb-4 ${formErrors.analystId ? 'bg-red-500/5 rounded-lg px-3 pt-2 pb-1 -mx-3' : ''}`} data-error={formErrors.analystId ? 'true' : undefined}>
                    <label className={`block text-sm font-medium mb-2 flex items-center gap-1.5 ${formErrors.analystId ? 'text-ai-error' : 'text-ai-text'}`}>
                      {formErrors.analystId && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                      Analista Responsável <span className="text-ai-error">*</span>
                    </label>
                    <select
                      value={formData.analystId}
                      onChange={e => setFormData({ ...formData, analystId: e.target.value })}
                      className={`w-full px-4 py-2 bg-ai-surface2 border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                        formErrors.analystId ? 'border-ai-error' : 'border-ai-border'
                      }`}
                    >
                      <option value="">Selecione um analista</option>
                      {analysts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} {a.email ? `(${a.email})` : ''}
                        </option>
                      ))}
                    </select>
                    {formErrors.analystId && <p className="mt-1 text-sm text-ai-error">{formErrors.analystId}</p>}
                  </div>
                )}
              </fieldset>

              {/* Ações */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-ai-border">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-ai-text bg-ai-surface2 hover:bg-ai-surface3 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || clientFormReadOnly || !!nameError || checkingName}
                  className="px-4 py-2 bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isSaving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span>Salvando...</span></>
                  ) : (
                    <><Save className="w-4 h-4" /><span>{editingOrg ? 'Atualizar' : 'Cadastrar'}</span></>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── View: Lista ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-ai-bg">
      <div className="max-w-7xl mx-auto p-6">
        {/* Busca e Filtros */}
        <div className="mb-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ai-subtext" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, email, CNPJ ou telefone..."
              className="w-full pl-10 pr-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent text-sm"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
          <select
            value={filterState}
            onChange={e => setFilterState(e.target.value)}
            className="px-3 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent text-sm"
          >
            <option value="">Todos os estados</option>
            {UF_LIST.map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>

        {/* Erro */}
        {error && (
          <div className="mb-6 p-4 bg-ai-error/10 border border-ai-error rounded-md flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-ai-error" />
            <p className="text-ai-error">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-ai-accent" />
          </div>
        ) : (
          <div className="bg-ai-surface rounded-lg shadow-lg overflow-hidden">
            {filteredOrgs.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-16 h-16 text-ai-subtext mx-auto mb-4" />
                <p className="text-ai-subtext text-lg">
                  {searchTerm || filterStatus || filterState
                    ? 'Nenhuma organização encontrada para os filtros selecionados'
                    : 'Nenhuma organização cadastrada'}
                </p>
                {!searchTerm && !filterStatus && !filterState && (
                  <button
                    onClick={() => { resetForm(); setView('form'); }}
                    className="mt-4 px-4 py-2 bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 transition-colors"
                  >
                    Cadastrar Primeira Organização
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-ai-surface2">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">Organização</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">Contato</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">Localização</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">Gestores</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">Fazendas</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-ai-subtext uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ai-border">
                    {filteredOrgs.map(org => (
                      <tr key={org.id} className={`hover:bg-ai-surface2 transition-colors ${!org.ativo ? 'opacity-60' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-10 h-10 rounded-full bg-ai-accent/20 flex items-center justify-center mr-3 flex-shrink-0">
                              <User className="w-5 h-5 text-ai-accent" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-ai-text">{org.name}</div>
                              {org.cnpj && <div className="text-xs text-ai-subtext">{org.cnpj}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-ai-text space-y-1">
                            <div className="flex items-center space-x-2">
                              <Mail className="w-4 h-4 text-ai-subtext flex-shrink-0" />
                              <span className="truncate max-w-[180px]">{org.email}</span>
                            </div>
                            {org.phone && (
                              <div className="flex items-center space-x-2">
                                <Phone className="w-4 h-4 text-ai-subtext flex-shrink-0" />
                                <span>{org.phone}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {(org.city || org.state) && (
                            <div className="flex items-center gap-1 text-sm text-ai-text">
                              <MapPin className="w-4 h-4 text-ai-subtext flex-shrink-0" />
                              <span>{[org.city, org.state].filter(Boolean).join(' / ')}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1 text-sm text-ai-text">
                            <Users className="w-4 h-4 text-ai-subtext" />
                            <span>{org.ownersCount}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1 text-sm text-ai-text">
                            <Building2 className="w-4 h-4 text-ai-subtext" />
                            <span>{org.farmsCount} fazenda{org.farmsCount !== 1 ? 's' : ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
                              org.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {org.status === 'active' ? 'Ativo' : 'Inativo'}
                            </span>
                            {!org.ativo && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 w-fit">
                                Desativado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleEdit(org)}
                              className="p-2 text-ai-accent hover:bg-ai-surface2 rounded-md transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {org.ativo && (
                              <button
                                onClick={() => handleDeactivate(org.id, org.name)}
                                disabled={deactivatingId === org.id}
                                className="p-2 text-amber-500 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-50"
                                title="Desativar organização"
                              >
                                {deactivatingId === org.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <ToggleRight className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientManagement;
