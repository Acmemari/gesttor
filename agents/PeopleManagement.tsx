import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, ArrowLeft, ArrowRight, Search, Trash2, Edit2, Loader2, User, Camera, X,
  Move, ZoomIn, Building2, Star, HelpCircle, Check, Mail, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import {
  listPessoas,
  getPessoa,
  createPessoa,
  updatePessoa,
  deactivatePessoa,
  listPerfis,
  listCargosFuncoes,
  addPessoaPerfil,
  removePessoaPerfil,
  addPessoaFazenda,
  setPrimaryFazenda,
  removePessoaFazenda,
  upsertPessoaPermissao,
  sendInvite,
  formatCPF,
  formatPhone,
  formatCNPJ,
  formatCEP,
  validateCPF,
  type Pessoa,
  type PessoaCompleta,
  type Perfil,
  type CargoFuncao,
  type PessoaPerfil,
  type PessoaFazenda,
  type PessoaPermissao,
} from '../lib/api/pessoasClient';
import { storageUpload, storageGetPublicUrl, storageResolveUrl } from '../lib/storage';
import DateInputBR from '../components/DateInputBR';

interface PeopleManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
}

type TabId = 'dados' | 'detalhes';

const TABS: { id: TabId; label: string; icon: React.ReactNode; editingOnly?: boolean }[] = [
  { id: 'dados', label: 'Dados das Pessoas', icon: <User size={14} /> },
  { id: 'detalhes', label: 'Permissões e Informações', icon: <HelpCircle size={14} /> },
];

const TIPO_OPTIONS = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'transportadora', label: 'Transportadora' },
  { value: 'proprietario', label: 'Proprietário' },
  { value: 'funcionario', label: 'Funcionário' },
] as const;

const TIPO_DOC_OPTIONS = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'rg', label: 'RG' },
  { value: 'cnh', label: 'CNH' },
  { value: 'passaporte', label: 'Passaporte' },
] as const;

const TIPO_CONTA_OPTIONS = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Poupança' },
] as const;

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

const STORAGE_PREFIX = 'people-photos';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const CROP_SIZE = 280;

const initialDados = {
  full_name: '',
  preferred_name: '',
  cpf: '',
  rg: '',
  data_nascimento: '',
  data_contratacao: '',
  email: '',
  phone_whatsapp: '',
  location_city_uf: '',
  endereco: '',
  observacoes: '',
  photo_url: '',
  ativo: true,
  // Novos campos
  tipo: [] as string[],
  razao_social: '',
  inscricao_estadual: '',
  tipo_documento: '',
  numero_documento: '',
  cep: '',
  logradouro: '',
  endereco_numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  banco: '',
  agencia: '',
  conta: '',
  tipo_conta: '',
  titular_conta: '',
  cpf_cnpj_conta: '',
};

// ── Collapsible Section ─────────────────────────────────────────────────────
const CollapsibleSection: React.FC<{
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-5 py-3.5 bg-[#F0FDF4] hover:bg-[#DCFCE7] transition-colors text-left"
      >
        {isOpen ? (
          <ChevronUp size={16} className="text-emerald-600" />
        ) : (
          <ChevronDown size={16} className="text-emerald-600" />
        )}
        <span className="text-sm font-bold text-emerald-700">{title}</span>
      </button>
      {isOpen && <div className="p-5 bg-white space-y-4">{children}</div>}
    </div>
  );
};

// ── Input Field Component ───────────────────────────────────────────────────
const Field: React.FC<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ label, required, children, className = '' }) => (
  <div className={className}>
    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder-gray-400';
const selectClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-gray-700';

const PeopleManagement: React.FC<PeopleManagementProps> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedOrganization: selectedClient, selectedFarm, farms } = useHierarchy();

  // ─── View State ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<'list' | 'form'>('list');
  const [activeTab, setActiveTab] = useState<TabId>('dados');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNewPerson, setIsNewPerson] = useState(false);

  // ─── List State ──────────────────────────────────────────────────────────────
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAtivo, setFilterAtivo] = useState<boolean | undefined>(true);
  const [filterPerfilId, setFilterPerfilId] = useState<string | null>(null);
  const [filterFarmId, setFilterFarmId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // ─── Form — Dados ────────────────────────────────────────────────────────────
  const [dados, setDados] = useState(initialDados);
  const [saving, setSaving] = useState(false);

  // ─── Form — Foto ─────────────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropMinZoom, setCropMinZoom] = useState(0.1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = useState<{ w: number; h: number } | null>(null);
  const cropDragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);

  // ─── Form — Perfis ───────────────────────────────────────────────────────────
  const [pessoaPerfis, setPessoaPerfis] = useState<PessoaPerfil[]>([]);
  const [perfisDisponiveis, setPerfisDisponiveis] = useState<Perfil[]>([]);
  const [cargosDisponiveis, setCargosDisponiveis] = useState<CargoFuncao[]>([]);
  const [addingPerfil, setAddingPerfil] = useState(false);
  const [newPerfilId, setNewPerfilId] = useState<string>('');
  const [newCargoId, setNewCargoId] = useState<string>('');

  // ─── Form — Fazendas ─────────────────────────────────────────────────────────
  const [pessoaFazendas, setPessoaFazendas] = useState<PessoaFazenda[]>([]);
  const [addingFazenda, setAddingFazenda] = useState(false);
  const [newFarmId, setNewFarmId] = useState<string>('');

  // ─── Form — Permissões ───────────────────────────────────────────────────────
  const [permissoes, setPermissoes] = useState<PessoaPermissao[]>([]);
  const [savingPerm, setSavingPerm] = useState<string | null>(null);

  // ─── Convite ──────────────────────────────────────────────────────────────────
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);

  const organizationId = useMemo(() => selectedClient?.id ?? null, [selectedClient]);

  // ─── Notificação de view ──────────────────────────────────────────────────────
  useEffect(() => {
    let detail: string = view;
    if (view === 'form') detail = isNewPerson ? 'form-new' : 'form-edit';
    window.dispatchEvent(new CustomEvent('peopleViewChange', { detail }));
  }, [view, isNewPerson]);

  useEffect(() => {
    const handleCancelForm = () => setView('list');
    window.addEventListener('peopleCancelForm', handleCancelForm);
    return () => window.removeEventListener('peopleCancelForm', handleCancelForm);
  }, []);

  // ─── Carregar lista ───────────────────────────────────────────────────────────
  const loadPessoas = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data } = await listPessoas({
        organizationId,
        search: search || undefined,
        ativo: filterAtivo,
        perfilId: filterPerfilId ?? undefined,
        farmId: filterFarmId ?? undefined,
      });
      setPessoas(data);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao carregar pessoas', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, search, filterAtivo, filterPerfilId, filterFarmId, onToast]);

  useEffect(() => { loadPessoas(); }, [loadPessoas]);

  // ─── Resolver URLs das fotos ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const urls: Record<string, string> = {};
      await Promise.all(
        pessoas
          .filter(p => p.photoUrl)
          .map(async p => {
            try { urls[p.id] = await storageResolveUrl(p.photoUrl!); } catch { /* silent */ }
          }),
      );
      if (!cancelled) setSignedUrls(urls);
    };
    resolve();
    return () => { cancelled = true; };
  }, [pessoas]);

  // ─── Carregar perfis e cargos ────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) return;
    Promise.all([listPerfis(), listCargosFuncoes()]).then(([p, c]) => {
      setPerfisDisponiveis(p);
      setCargosDisponiveis(c);
    });
  }, [organizationId]);

  // ─── Abrir novo / editar ──────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setDados(initialDados);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPessoaPerfis([]);
    setPessoaFazendas([]);
    setPermissoes([]);
    setNewPerfilId('');
    setNewCargoId('');
    setNewFarmId('');
    setActiveTab('dados');
    setIsNewPerson(true);
    setView('form');
  };

  const openEdit = async (p: Pessoa) => {
    setEditingId(p.id);
    setDados({
      full_name: p.fullName,
      preferred_name: p.preferredName ?? '',
      cpf: formatCPF(p.cpf ?? ''),
      rg: p.rg ?? '',
      data_nascimento: p.dataNascimento ?? '',
      data_contratacao: p.dataContratacao ?? '',
      email: p.email ?? '',
      phone_whatsapp: formatPhone(p.phoneWhatsapp ?? ''),
      location_city_uf: p.locationCityUf ?? '',
      endereco: p.endereco ?? '',
      observacoes: p.observacoes ?? '',
      photo_url: p.photoUrl ?? '',
      ativo: p.ativo,
      // Novos campos
      tipo: Array.isArray(p.tipo) ? p.tipo : [],
      razao_social: p.razaoSocial ?? '',
      inscricao_estadual: p.inscricaoEstadual ?? '',
      tipo_documento: p.tipoDocumento ?? '',
      numero_documento: p.numeroDocumento ?? '',
      cep: formatCEP(p.cep ?? ''),
      logradouro: p.logradouro ?? '',
      endereco_numero: p.enderecoNumero ?? '',
      complemento: p.complemento ?? '',
      bairro: p.bairro ?? '',
      cidade: p.cidade ?? '',
      estado: p.estado ?? '',
      banco: p.banco ?? '',
      agencia: p.agencia ?? '',
      conta: p.conta ?? '',
      tipo_conta: p.tipoConta ?? '',
      titular_conta: p.titularConta ?? '',
      cpf_cnpj_conta: p.cpfCnpjConta ?? '',
    });
    setPhotoPreview(signedUrls[p.id] ?? p.photoUrl ?? null);
    setPhotoFile(null);
    setNewPerfilId('');
    setNewCargoId('');
    setNewFarmId('');
    setActiveTab('dados');
    setIsNewPerson(false);
    setView('form');

    const completa = await getPessoa(p.id);
    if (completa) {
      setPessoaPerfis(completa.perfis);
      setPessoaFazendas(completa.fazendas);
      setPermissoes(completa.permissoes);
      if (completa.perfis.length > 0) {
        const p0 = completa.perfis[0];
        setNewPerfilId(p0.perfilId);
        setNewCargoId(p0.cargoFuncaoId || '');
      } else {
        setNewPerfilId('');
        setNewCargoId('');
      }
    }
  };

  const backToList = () => {
    setView('list');
    setEditingId(null);
    setIsNewPerson(false);
  };

  // ─── Foto / Crop ──────────────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setCropSourceUrl(url);
    setCropZoom(0.1);
    setCropMinZoom(0.1);
    setCropPosition({ x: 0, y: 0 });
    setCropImageSize(null);
    setShowCropModal(true);
    e.target.value = '';
  };

  const handleAdjustPhoto = async () => {
    if (!photoPreview) return;
    try {
      let url: string;
      if (photoFile) {
        url = URL.createObjectURL(photoFile);
      } else {
        const res = await fetch(photoPreview);
        if (!res.ok) throw new Error('Não foi possível carregar a foto');
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
      }
      setCropSourceUrl(url);
      setCropZoom(0.1);
      setCropMinZoom(0.1);
      setCropPosition({ x: 0, y: 0 });
      setCropImageSize(null);
      setShowCropModal(true);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao carregar foto para ajuste', 'error');
    }
  };

  const applyCrop = () => {
    if (!cropSourceUrl || !cropImageSize) return;
    const canvas = document.createElement('canvas');
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx || !cropImageRef.current) return;

    const img = cropImageRef.current;
    const { w, h } = cropImageSize;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);

    const renderedW = w * cropZoom;
    const renderedH = h * cropZoom;
    const imgX = CROP_SIZE / 2 + cropPosition.x - renderedW / 2;
    const imgY = CROP_SIZE / 2 + cropPosition.y - renderedH / 2;

    ctx.drawImage(img, imgX, imgY, renderedW, renderedH);

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      setPhotoFile(file);
      setPhotoPreview(canvas.toDataURL('image/jpeg'));
      setShowCropModal(false);
    }, 'image/jpeg', 0.92);
  };

  const onCropMouseDown = (e: React.MouseEvent) => {
    cropDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPos: { ...cropPosition },
    };
  };

  const onCropMouseMove = (e: React.MouseEvent) => {
    if (!cropDragRef.current) return;
    const dx = e.clientX - cropDragRef.current.startX;
    const dy = e.clientY - cropDragRef.current.startY;
    setCropPosition({
      x: cropDragRef.current.startPos.x + dx,
      y: cropDragRef.current.startPos.y + dy,
    });
  };

  const onCropMouseUp = () => { cropDragRef.current = null; };

  // ─── Tipo toggle ──────────────────────────────────────────────────────────────
  const toggleTipo = (value: string) => {
    setDados(prev => ({
      ...prev,
      tipo: prev.tipo.includes(value)
        ? prev.tipo.filter(t => t !== value)
        : [...prev.tipo, value],
    }));
  };

  // ─── Document mask ────────────────────────────────────────────────────────────
  const formatDocumento = (value: string, tipo: string): string => {
    const digits = value.replace(/\D/g, '');
    switch (tipo) {
      case 'cpf': return formatCPF(digits);
      case 'cnpj': return formatCNPJ(digits);
      default: return value;
    }
  };

  // ─── Troca de aba com auto-criação ────────────────────────────────────────────
  const handleTabChange = async (tab: TabId) => {
    if (!editingId && dados.full_name.trim() && tab !== activeTab) {
      await handleSaveDados();
    }
    setActiveTab(tab);
  };

  // ─── Salvar dados da pessoa ────────────────────────────────────────────────────
  const handleSaveDados = async (): Promise<string | null> => {
    if (!dados.full_name.trim()) {
      onToast?.('Nome completo é obrigatório', 'error');
      return null;
    }
    if (dados.tipo.length === 0) {
      onToast?.('Selecione ao menos um tipo', 'error');
      return null;
    }
    if (dados.cpf && !validateCPF(dados.cpf)) {
      onToast?.('CPF inválido', 'error');
      return null;
    }
    if (!organizationId) {
      onToast?.('Selecione uma organização antes de cadastrar uma pessoa', 'error');
      return null;
    }

    setSaving(true);
    try {
      let photoUrl = dados.photo_url;

      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg';
        const tempId = editingId ?? `new-${Date.now()}`;
        const path = `${user?.id ?? 'unknown'}/${tempId}-${Date.now()}.${ext}`;
        await storageUpload(STORAGE_PREFIX, path, photoFile, { contentType: photoFile.type, upsert: true });
        photoUrl = storageGetPublicUrl(STORAGE_PREFIX, path);
      }

      const payload = {
        full_name: dados.full_name.trim(),
        preferred_name: dados.preferred_name.trim() || null,
        cpf: dados.cpf.replace(/\D/g, '') || null,
        rg: dados.rg.trim() || null,
        data_nascimento: dados.data_nascimento || null,
        data_contratacao: dados.data_contratacao || null,
        email: dados.email.trim().toLowerCase() || null,
        phone_whatsapp: dados.phone_whatsapp.replace(/\D/g, '') || null,
        location_city_uf: dados.location_city_uf.trim() || null,
        endereco: dados.endereco.trim() || null,
        observacoes: dados.observacoes.trim() || null,
        photo_url: photoUrl || null,
        ativo: dados.ativo,
        // Novos campos
        tipo: dados.tipo,
        razao_social: dados.razao_social.trim() || null,
        inscricao_estadual: dados.inscricao_estadual.trim() || null,
        tipo_documento: dados.tipo_documento || null,
        numero_documento: dados.numero_documento.replace(/\D/g, '') || null,
        cep: dados.cep.replace(/\D/g, '') || null,
        logradouro: dados.logradouro.trim() || null,
        endereco_numero: dados.endereco_numero.trim() || null,
        complemento: dados.complemento.trim() || null,
        bairro: dados.bairro.trim() || null,
        cidade: dados.cidade.trim() || null,
        estado: dados.estado || null,
        banco: dados.banco.trim() || null,
        agencia: dados.agencia.trim() || null,
        conta: dados.conta.trim() || null,
        tipo_conta: dados.tipo_conta || null,
        titular_conta: dados.titular_conta.trim() || null,
        cpf_cnpj_conta: dados.cpf_cnpj_conta.replace(/\D/g, '') || null,
      };

      if (editingId) {
        const result = await updatePessoa(editingId, payload);
        if (result?.inviteWasReset) {
          onToast?.('Email atualizado. O convite anterior foi cancelado — envie um novo convite.', 'warning');
        } else {
          onToast?.('Pessoa atualizada com sucesso', 'success');
        }
        loadPessoas();
        backToList();
        return editingId;
      } else {
        const created = await createPessoa({ ...payload, organization_id: organizationId });
        if (created) {
          setEditingId(created.id);
          setIsNewPerson(false);
          onToast?.('Pessoa criada! Agora vincule o perfil e as fazendas.', 'success');
          loadPessoas();
          return created.id;
        }
        return null;
      }
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao salvar pessoa', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  // ─── Perfis ───────────────────────────────────────────────────────────────────
  const handleAddPerfil = async () => {
    if (!newPerfilId) return;
    let id = editingId;
    if (!id) {
      id = await handleSaveDados();
      if (!id) return;
    }
    setAddingPerfil(true);
    try {
      await addPessoaPerfil(id, newPerfilId, newCargoId || null);
      const completa = await getPessoa(id);
      if (completa) setPessoaPerfis(completa.perfis);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao adicionar perfil', 'error');
    } finally {
      setAddingPerfil(false);
    }
  };

  const handleRemovePerfil = async (pessoaPerfilId: string) => {
    if (!editingId) return;
    try {
      await removePessoaPerfil(pessoaPerfilId, editingId);
      setPessoaPerfis(prev => prev.filter(p => p.id !== pessoaPerfilId));
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao remover perfil', 'error');
    }
  };

  // ─── Fazendas ─────────────────────────────────────────────────────────────────
  const handleAddFazenda = async () => {
    if (!newFarmId) return;
    let id = editingId;
    if (!id) {
      id = await handleSaveDados();
      if (!id) return;
    }
    setAddingFazenda(true);
    try {
      await addPessoaFazenda(id, newFarmId);
      const completa = await getPessoa(id);
      if (completa) setPessoaFazendas(completa.fazendas);
      setNewFarmId('');
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao vincular fazenda', 'error');
    } finally {
      setAddingFazenda(false);
    }
  };

  const handleSetPrimary = async (pessoaFazendaId: string) => {
    if (!editingId) return;
    try {
      await setPrimaryFazenda(editingId, pessoaFazendaId);
      setPessoaFazendas(prev =>
        prev.map(f => ({ ...f, isPrimary: f.id === pessoaFazendaId })),
      );
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao definir fazenda principal', 'error');
    }
  };

  const handleRemoveFazenda = async (pessoaFazendaId: string) => {
    if (!editingId) return;
    try {
      await removePessoaFazenda(pessoaFazendaId, editingId);
      setPessoaFazendas(prev => prev.filter(f => f.id !== pessoaFazendaId));
      setPermissoes(prev => {
        const removedFarmId = pessoaFazendas.find(f => f.id === pessoaFazendaId)?.farmId;
        return removedFarmId ? prev.filter(p => p.farmId !== removedFarmId) : prev;
      });
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao desvincular fazenda', 'error');
    }
  };

  // ─── Permissões ───────────────────────────────────────────────────────────────
  const getPermissao = (farmId: string): PessoaPermissao | undefined =>
    permissoes.find(p => p.farmId === farmId);

  const handleTogglePerm = async (
    farmId: string,
    key: 'assumeTarefasFazenda' | 'podeAlterarSemanaFechada' | 'podeApagarSemana',
    internalKey: 'assume_tarefas_fazenda' | 'pode_alterar_semana_fechada' | 'pode_apagar_semana',
  ) => {
    if (!editingId) return;
    const current = getPermissao(farmId);
    const next = {
      assumeTarefasFazenda: current?.assumeTarefasFazenda ?? false,
      podeAlterarSemanaFechada: current?.podeAlterarSemanaFechada ?? false,
      podeApagarSemana: current?.podeApagarSemana ?? false,
      [key]: !(current?.[key] ?? false),
    };
    setSavingPerm(farmId);
    try {
      await upsertPessoaPermissao(editingId, farmId, { [internalKey]: next[key] });
      setPermissoes(prev => {
        const exists = prev.find(p => p.farmId === farmId);
        if (exists) return prev.map(p => p.farmId === farmId ? { ...p, ...next } : p);
        return [...prev, {
          id: `${editingId}-${farmId}`,
          pessoaId: editingId,
          farmId: farmId,
          ...next,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as PessoaPermissao];
      });
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao salvar permissão', 'error');
    } finally {
      setSavingPerm(null);
    }
  };

  // ─── Desativar pessoa ─────────────────────────────────────────────────────────
  const handleDeactivate = async (id: string) => {
    if (!confirm('Deseja desativar esta pessoa?')) return;
    try {
      await deactivatePessoa(id);
      onToast?.('Pessoa desativada', 'success');
      loadPessoas();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao desativar pessoa', 'error');
    }
  };

  // ─── Convidar pessoa ──────────────────────────────────────────────────────────
  const handleSendInvite = async (p: Pessoa) => {
    if (!p.email) { onToast?.('Pessoa sem email cadastrado', 'warning'); return; }
    setSendingInvite(p.id);
    try {
      const result = await sendInvite(p.id);
      const typeLabel = result.inviteType === 'upgrade' ? 'Convite de atualização' : 'Convite';
      onToast?.(`${typeLabel} enviado para ${p.email}`, 'success');
      loadPessoas();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao enviar convite', 'error');
    } finally {
      setSendingInvite(null);
    }
  };

  // ─── Fazendas disponíveis ─────────────────────────────────────────────────────
  const farmsDisponiveis = useMemo(
    () => farms.filter(f => f.ativo && !pessoaFazendas.some(pf => pf.farmId === f.id)),
    [farms, pessoaFazendas],
  );

  const fazendasComNome = useMemo(
    () => {
      const seen = new Set<string>();
      return pessoaFazendas
        .filter(pf => {
          if (seen.has(pf.farmId)) return false;
          seen.add(pf.farmId);
          return true;
        })
        .map(pf => ({
          ...pf,
          farm_name: pf.farmName ?? farms.find(f => f.id === pf.farmId)?.name ?? pf.farmId,
        }));
    },
    [pessoaFazendas, farms],
  );

  // ─── TIPO label helper ────────────────────────────────────────────────────────
  const getTipoLabels = (tipos: string[] | null): string => {
    if (!tipos || tipos.length === 0) return '—';
    return tipos.map(t => TIPO_OPTIONS.find(o => o.value === t)?.label ?? t).join(', ');
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER: LIST
  // ═════════════════════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Voltar"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cadastro de Pessoas</h1>
              {organizationId && (
                <p className="text-sm text-gray-500 mt-0.5">{selectedClient?.name}</p>
              )}
            </div>
          </div>
          <button
            onClick={openNew}
            disabled={!organizationId}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Nova Pessoa
          </button>
        </div>

        {!organizationId && (
          <div className="text-center py-16 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Selecione uma organização para ver as pessoas</p>
          </div>
        )}

        {organizationId && (
          <>
            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex-1 min-w-48 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou email..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <select
                value={filterPerfilId ?? ''}
                onChange={e => setFilterPerfilId(e.target.value || null)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Todos os perfis</option>
                {perfisDisponiveis.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              <select
                value={filterFarmId ?? ''}
                onChange={e => setFilterFarmId(e.target.value || null)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Todas as fazendas</option>
                {farms.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <select
                value={filterAtivo === undefined ? '' : String(filterAtivo)}
                onChange={e => setFilterAtivo(e.target.value === '' ? undefined : e.target.value === 'true')}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="true">Ativos</option>
                <option value="false">Inativos</option>
                <option value="">Todos</option>
              </select>
            </div>

            {/* Tabela */}
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={32} className="animate-spin text-emerald-600" />
              </div>
            ) : pessoas.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <User size={40} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">Nenhuma pessoa encontrada</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Telefone</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pessoas.map(p => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {signedUrls[p.id] ? (
                              <img src={signedUrls[p.id]} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                <User size={14} className="text-emerald-600" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-gray-900">{p.preferredName || p.fullName}</div>
                              {p.preferredName && (
                                <div className="text-xs text-gray-400">{p.fullName}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {getTipoLabels(p.tipo)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{p.phoneWhatsapp ? formatPhone(p.phoneWhatsapp) : '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{p.email ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${p.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {/* Botão de convite / status */}
                            {(() => {
                              if (p.userId) {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700"
                                    title="Usuário com conta ativa e permissões configuradas"
                                  >
                                    <Check size={11} /> Ativo
                                  </span>
                                );
                              }
                              if (p.inviteStatus === 'pending') {
                                return (
                                  <button
                                    onClick={() => handleSendInvite(p)}
                                    disabled={sendingInvite === p.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                                    title="Reenviar convite"
                                  >
                                    {sendingInvite === p.id ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                                    Aguardando aceite
                                  </button>
                                );
                              }
                              if (!p.email) {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-400"
                                    title="Cadastre um email para poder convidar"
                                  >
                                    <Mail size={11} /> Sem email
                                  </span>
                                );
                              }
                              return (
                                <button
                                  onClick={() => handleSendInvite(p)}
                                  disabled={sendingInvite === p.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                                  title={p.userId ? 'Convidar para atualizar permissões (visitante)' : 'Enviar convite por email'}
                                >
                                  {sendingInvite === p.id ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                                  Convidar
                                </button>
                              );
                            })()}
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            {p.ativo && (
                              <button
                                onClick={() => handleDeactivate(p.id)}
                                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                title="Desativar"
                              >
                                <Trash2 size={14} />
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
          </>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER: FORM
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Modal Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Cadastro de Pessoas</h2>
        <button
          onClick={backToList}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Dados das Pessoas ═══ */}
      {activeTab === 'dados' && (
        <div className="space-y-6">
          {/* Tipo */}
          <Field label="Tipo" required>
            <div className="flex flex-wrap gap-3 mt-1">
              {TIPO_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dados.tipo.includes(opt.value)}
                    onChange={() => toggleTipo(opt.value)}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Nome Completo */}
          <Field label="Nome Completo" required>
            <input
              type="text"
              value={dados.full_name}
              onChange={e => setDados(d => ({ ...d, full_name: e.target.value }))}
              placeholder="Digite o nome da pessoa"
              className={inputClass}
            />
          </Field>

          {/* Razão Social + Inscrição Estadual */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Razão Social">
              <input
                type="text"
                value={dados.razao_social}
                onChange={e => setDados(d => ({ ...d, razao_social: e.target.value }))}
                placeholder="Informe a razão social da pessoa"
                className={inputClass}
              />
            </Field>
            <Field label="Inscrição Estadual">
              <input
                type="text"
                value={dados.inscricao_estadual}
                onChange={e => setDados(d => ({ ...d, inscricao_estadual: e.target.value }))}
                placeholder="Informe a Inscrição Estadual"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Tipo de Documento + Número */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo de Documento" required>
              <select
                value={dados.tipo_documento}
                onChange={e => setDados(d => ({ ...d, tipo_documento: e.target.value, numero_documento: '' }))}
                className={selectClass}
              >
                <option value="">Selecione um item</option>
                {TIPO_DOC_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Número do documento">
              <input
                type="text"
                value={dados.numero_documento}
                onChange={e => setDados(d => ({
                  ...d,
                  numero_documento: formatDocumento(e.target.value, d.tipo_documento),
                }))}
                placeholder={dados.tipo_documento === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                className={inputClass}
                disabled={!dados.tipo_documento}
              />
            </Field>
          </div>

          {/* E-mail + Telefone */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <Field label="E-mail">
              <input
                type="email"
                value={dados.email}
                onChange={e => setDados(d => ({ ...d, email: e.target.value }))}
                placeholder="Informe o e-mail do cadastrado"
                className={inputClass}
              />
            </Field>
            <Field label="Telefone" className="min-w-[200px]">
              <input
                type="text"
                value={dados.phone_whatsapp}
                onChange={e => setDados(d => ({ ...d, phone_whatsapp: formatPhone(e.target.value) }))}
                placeholder="(00) 00000-0000"
                className={inputClass}
                maxLength={15}
              />
            </Field>
          </div>

          {/* Dados de Endereço */}
          <CollapsibleSection title="Dados de Endereço">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="CEP">
                <input
                  type="text"
                  value={dados.cep}
                  onChange={e => setDados(d => ({ ...d, cep: formatCEP(e.target.value) }))}
                  placeholder="00000-000"
                  className={inputClass}
                  maxLength={9}
                />
              </Field>
              <Field label="Logradouro" className="md:col-span-2">
                <input
                  type="text"
                  value={dados.logradouro}
                  onChange={e => setDados(d => ({ ...d, logradouro: e.target.value }))}
                  placeholder="Rua, Avenida, Rodovia..."
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Número">
                <input
                  type="text"
                  value={dados.endereco_numero}
                  onChange={e => setDados(d => ({ ...d, endereco_numero: e.target.value }))}
                  placeholder="Nº"
                  className={inputClass}
                />
              </Field>
              <Field label="Complemento">
                <input
                  type="text"
                  value={dados.complemento}
                  onChange={e => setDados(d => ({ ...d, complemento: e.target.value }))}
                  placeholder="Sala, Andar, Bloco..."
                  className={inputClass}
                />
              </Field>
              <Field label="Bairro">
                <input
                  type="text"
                  value={dados.bairro}
                  onChange={e => setDados(d => ({ ...d, bairro: e.target.value }))}
                  placeholder="Bairro"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Cidade">
                <input
                  type="text"
                  value={dados.cidade}
                  onChange={e => setDados(d => ({ ...d, cidade: e.target.value }))}
                  placeholder="Cidade"
                  className={inputClass}
                />
              </Field>
              <Field label="Estado">
                <select
                  value={dados.estado}
                  onChange={e => setDados(d => ({ ...d, estado: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">Selecione o estado</option>
                  {UF_OPTIONS.map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </Field>
            </div>
          </CollapsibleSection>

          {/* Dados Bancários */}
          <CollapsibleSection title="Dados Bancários">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Banco">
                <input
                  type="text"
                  value={dados.banco}
                  onChange={e => setDados(d => ({ ...d, banco: e.target.value }))}
                  placeholder="Nome do banco"
                  className={inputClass}
                />
              </Field>
              <Field label="Agência">
                <input
                  type="text"
                  value={dados.agencia}
                  onChange={e => setDados(d => ({ ...d, agencia: e.target.value }))}
                  placeholder="0000"
                  className={inputClass}
                />
              </Field>
              <Field label="Conta">
                <input
                  type="text"
                  value={dados.conta}
                  onChange={e => setDados(d => ({ ...d, conta: e.target.value }))}
                  placeholder="00000-0"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Tipo de Conta">
                <select
                  value={dados.tipo_conta}
                  onChange={e => setDados(d => ({ ...d, tipo_conta: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">Selecione</option>
                  {TIPO_CONTA_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Titular da Conta">
                <input
                  type="text"
                  value={dados.titular_conta}
                  onChange={e => setDados(d => ({ ...d, titular_conta: e.target.value }))}
                  placeholder="Nome do titular"
                  className={inputClass}
                />
              </Field>
              <Field label="CPF/CNPJ do Titular">
                <input
                  type="text"
                  value={dados.cpf_cnpj_conta}
                  onChange={e => setDados(d => ({ ...d, cpf_cnpj_conta: e.target.value }))}
                  placeholder="000.000.000-00"
                  className={inputClass}
                />
              </Field>
            </div>
          </CollapsibleSection>

          {/* Botões */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={backToList}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveDados}
              disabled={!dados.full_name.trim() || dados.tipo.length === 0 || saving}
              className="px-6 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* ═══ TAB: Permissões e Informações ═══ */}
      {activeTab === 'detalhes' && (
        <div className="space-y-6">
          {/* Perfil e Cargo */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-800">Perfil e Cargo</h3>
            <div className="flex gap-3 flex-wrap">
              <select value={newPerfilId} onChange={e => setNewPerfilId(e.target.value)} className={selectClass + ' max-w-xs'}>
                <option value="">Selecione o perfil</option>
                {perfisDisponiveis.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              <select value={newCargoId} onChange={e => setNewCargoId(e.target.value)} className={selectClass + ' max-w-xs'}>
                <option value="">Cargo (opcional)</option>
                {cargosDisponiveis.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <button
                onClick={handleAddPerfil}
                disabled={!newPerfilId || addingPerfil}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {addingPerfil && <Loader2 size={12} className="animate-spin" />}
                Vincular
              </button>
            </div>
            {pessoaPerfis.length > 0 && (
              <div className="space-y-2">
                {pessoaPerfis.map(pp => (
                  <div key={pp.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                    <div>
                      <span className="font-medium text-sm text-gray-800">{pp.perfilNome}</span>
                      {pp.cargoFuncaoNome && (
                        <span className="text-xs text-gray-500 ml-2">· {pp.cargoFuncaoNome}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemovePerfil(pp.id)}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fazendas */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-800">Fazendas Vinculadas</h3>
            <div className="flex gap-3 flex-wrap">
              <select value={newFarmId} onChange={e => setNewFarmId(e.target.value)} className={selectClass + ' max-w-xs'}>
                <option value="">Selecione a fazenda</option>
                {farmsDisponiveis.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <button
                onClick={handleAddFazenda}
                disabled={!newFarmId || addingFazenda}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {addingFazenda && <Loader2 size={12} className="animate-spin" />}
                Vincular
              </button>
            </div>
            {fazendasComNome.length > 0 && (
              <div className="space-y-2">
                {fazendasComNome.map(pf => (
                  <div key={pf.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-800">{pf.farm_name}</span>
                      {pf.isPrimary && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">
                          <Star size={10} /> Principal
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!pf.isPrimary && (
                        <button
                          onClick={() => handleSetPrimary(pf.id)}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-medium transition-colors"
                        >
                          Definir principal
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveFazenda(pf.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Permissões por Fazenda */}
          {fazendasComNome.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-800">Permissões por Fazenda</h3>
              {fazendasComNome.map(pf => {
                const perm = getPermissao(pf.farmId);
                const isSaving = savingPerm === pf.farmId;
                return (
                  <div key={pf.farmId} className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-700">{pf.farm_name}</p>
                    <div className="flex flex-wrap gap-4">
                      {([
                        { key: 'assumeTarefasFazenda' as const, internalKey: 'assume_tarefas_fazenda' as const, label: 'Assume tarefas' },
                        { key: 'podeAlterarSemanaFechada' as const, internalKey: 'pode_alterar_semana_fechada' as const, label: 'Alterar semana fechada' },
                        { key: 'podeApagarSemana' as const, internalKey: 'pode_apagar_semana' as const, label: 'Apagar semana' },
                      ]).map(({ key, internalKey, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={perm?.[key] ?? false}
                            onChange={() => handleTogglePerm(pf.farmId, key, internalKey)}
                            disabled={isSaving}
                            className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                          />
                          <span className="text-sm text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Informações adicionais: Data nascimento, contratação, observações */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-800">Informações Adicionais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Data de Nascimento">
                <DateInputBR
                  value={dados.data_nascimento}
                  onChange={v => setDados(d => ({ ...d, data_nascimento: v }))}
                />
              </Field>
              <Field label="Data de Contratação">
                <DateInputBR
                  value={dados.data_contratacao}
                  onChange={v => setDados(d => ({ ...d, data_contratacao: v }))}
                />
              </Field>
            </div>
            <Field label="Observações">
              <textarea
                value={dados.observacoes}
                onChange={e => setDados(d => ({ ...d, observacoes: e.target.value }))}
                placeholder="Observações sobre esta pessoa..."
                rows={3}
                className={inputClass + ' resize-none'}
              />
            </Field>
          </div>

          {/* Botões */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={backToList}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveDados}
              disabled={!dados.full_name.trim() || dados.tipo.length === 0 || saving}
              className="px-6 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* ── Crop Modal ─────────────────────────────────────────────────────────── */}
      {showCropModal && cropSourceUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Ajustar Foto</h3>
              <button onClick={() => setShowCropModal(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <div
              className="relative w-[280px] h-[280px] mx-auto rounded-full overflow-hidden bg-gray-100 cursor-move"
              onMouseDown={onCropMouseDown}
              onMouseMove={onCropMouseMove}
              onMouseUp={onCropMouseUp}
              onMouseLeave={onCropMouseUp}
            >
              <img
                ref={cropImageRef}
                src={cropSourceUrl}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setCropImageSize({ w: img.naturalWidth, h: img.naturalHeight });
                  const minScale = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
                  setCropMinZoom(minScale);
                  setCropZoom(minScale);
                }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${cropZoom})`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  maxWidth: 'none',
                }}
                draggable={false}
              />
            </div>

            <div className="flex items-center gap-3">
              <ZoomIn size={16} className="text-gray-500" />
              <input
                type="range"
                min={cropMinZoom}
                max={cropMinZoom * 4}
                step={0.01}
                value={cropZoom}
                onChange={e => setCropZoom(Number(e.target.value))}
                className="flex-1 accent-emerald-600"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCropModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={applyCrop}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeopleManagement;
