import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, ArrowLeft, ArrowRight, Search, Trash2, Edit2, Loader2, User, Camera, X,
  Move, ZoomIn, Building2, Star, Shield, Check, Mail,
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
}

type TabId = 'nome' | 'detalhes';

const TABS: { id: TabId; label: string; icon: React.ReactNode; editingOnly?: boolean }[] = [
  { id: 'nome', label: 'Nome, Cargo e Fazenda', icon: <User size={14} /> },
  { id: 'detalhes', label: 'Permissões e Informações', icon: <Shield size={14} /> },
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
};

const PeopleManagement: React.FC<PeopleManagementProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedOrganization: selectedClient, selectedFarm, farms } = useHierarchy();

  // ─── View State ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<'list' | 'form'>('list');
  const [activeTab, setActiveTab] = useState<TabId>('nome');
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

  // ─── Carregar perfis e cargos (necessários para filtro na lista e formulário) ──
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
    setActiveTab('nome');
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
    });
    setPhotoPreview(signedUrls[p.id] ?? p.photoUrl ?? null);
    setPhotoFile(null);
    setNewPerfilId('');
    setNewCargoId('');
    setNewFarmId('');
    setActiveTab('nome');
    setIsNewPerson(false);
    setView('form');

    // Carregar sub-recursos
    const completa = await getPessoa(p.id);
    if (completa) {
      setPessoaPerfis(completa.perfis);
      setPessoaFazendas(completa.fazendas);
      setPermissoes(completa.permissoes);
      
      // Inicializar seleção com o perfil atual (se houver)
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

    // Fundo branco (JPEG não tem transparência — sem isso fica preto)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);

    // Espelha exatamente o transform CSS do modal:
    //   translate(-50% + cropPosition.x, -50% + cropPosition.y) scale(cropZoom)
    // com a imagem centrada no círculo (centro = CROP_SIZE/2)
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

  // ─── Troca de aba com auto-criação ────────────────────────────────────────────
  const handleTabChange = async (tab: TabId) => {
    if (!editingId && dados.full_name.trim() && tab !== activeTab) {
      await handleSaveDados();
    }
    setActiveTab(tab);
  };

  // ─── Salvar dados da pessoa ────────────────────────────────────────────────────
  // Retorna o id da pessoa (criada ou existente), ou null em caso de erro.
  const handleSaveDados = async (): Promise<string | null> => {
    if (!dados.full_name.trim()) {
      onToast?.('Nome completo é obrigatório', 'error');
      return null;
    }
    const phoneDigits = dados.phone_whatsapp.replace(/\D/g, '');
    if (!phoneDigits) {
      onToast?.('Telefone (WhatsApp) é obrigatório', 'error');
      return null;
    }
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      onToast?.('Telefone inválido. Informe DDD + número', 'error');
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

  // ─── Fazendas disponíveis para vincular (da organização) ──────────────────────
  const farmsDisponiveis = useMemo(
    () => farms.filter(f => f.ativo && !pessoaFazendas.some(pf => pf.farmId === f.id)),
    [farms, pessoaFazendas],
  );

  // ─── Fazendas vinculadas com nome (deduplicadas por farmId) ──────────────────
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

  // ─── Render: Lista ────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pessoas</h1>
            {organizationId && (
              <p className="text-sm text-gray-500 mt-0.5">{selectedClient?.name}</p>
            )}
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

  // ─── Render: Formulário ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Header ─── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6">
          {/* Linha superior: voltar + identidade */}
          <div className="flex items-center gap-3 py-4">
            <button
              onClick={backToList}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              {photoPreview ? (
                <img src={photoPreview} className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <User size={16} className="text-emerald-600" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-base font-bold text-gray-900 leading-tight truncate">
                  {dados.full_name || (editingId ? 'Editar Pessoa' : 'Nova Pessoa')}
                </h1>
                {(dados.preferred_name || pessoaPerfis[0]?.perfilNome) && (
                  <p className="text-xs text-gray-400 truncate">
                    {[dados.preferred_name, pessoaPerfis[0]?.perfilNome].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {!dados.ativo && (
              <span className="shrink-0 text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2.5 py-1">
                Inativo
              </span>
            )}
          </div>

          {/* Abas */}
          <div className="flex gap-0 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Conteúdo ─── */}
      <div className="max-w-3xl mx-auto px-6 pt-6 pb-6">

        {/* ══ Aba 1: Nome, Cargo e Fazenda ══ */}
        {activeTab === 'nome' && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

            {/* ── Dados Pessoais ── */}
            <div className="p-6">
              <div className="flex gap-5 items-start">
                {/* Foto */}
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <div className="relative">
                    {photoPreview ? (
                      <img src={photoPreview} className="w-24 h-24 rounded-xl object-cover border border-gray-200" />
                    ) : (
                      <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center border border-dashed border-gray-300">
                        <User size={30} className="text-gray-300" />
                      </div>
                    )}
                    <label className="absolute -bottom-2 -right-2 p-1.5 bg-emerald-600 rounded-full cursor-pointer hover:bg-emerald-700 transition-colors shadow-md">
                      <Camera size={12} className="text-white" />
                      <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                    </label>
                  </div>
                  {photoPreview && (
                    <button
                      onClick={handleAdjustPhoto}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors"
                    >
                      <Move size={11} />
                      Ajustar
                    </button>
                  )}
                </div>

                {/* Campos de nome */}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome Completo *</label>
                    <input
                      value={dados.full_name}
                      onChange={e => setDados(d => ({ ...d, full_name: e.target.value }))}
                      placeholder="Nome completo da pessoa"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Apelido / Nome Preferido</label>
                    <input
                      value={dados.preferred_name}
                      onChange={e => setDados(d => ({ ...d, preferred_name: e.target.value }))}
                      placeholder="Como é chamado"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Contato */}
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">WhatsApp <span className="text-red-500">*</span></label>
                  <input
                    value={dados.phone_whatsapp}
                    onChange={e => setDados(d => ({ ...d, phone_whatsapp: formatPhone(e.target.value) }))}
                    placeholder="(00) 00000-0000"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={dados.email}
                    onChange={e => setDados(d => ({ ...d, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>

            </div>

            {/* ── Perfil e Cargo ── */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={14} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Perfil e Cargo</span>
              </div>

              {!dados.full_name.trim() ? (
                <p className="text-sm text-gray-400">Preencha o nome para ativar este campo.</p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <select
                      value={newPerfilId}
                      onChange={e => { setNewPerfilId(e.target.value); setNewCargoId(''); }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="">Selecionar perfil...</option>
                      {perfisDisponiveis.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>

                    {newPerfilId && perfisDisponiveis.find(p => p.id === newPerfilId)?.nome === 'Colaborador Fazenda' && (
                      <select
                        value={newCargoId}
                        onChange={e => setNewCargoId(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="">Cargo (opcional)...</option>
                        {cargosDisponiveis.map(c => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    )}

                    <button
                      onClick={handleAddPerfil}
                      disabled={!newPerfilId || addingPerfil}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium shrink-0"
                    >
                      {addingPerfil ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {pessoaPerfis.length > 0 ? 'Atualizar' : 'Vincular'}
                    </button>
                  </div>

                  {pessoaPerfis.length > 0 && (
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs text-gray-400">Perfil atual:</span>
                      <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium rounded-full px-3 py-1">
                        {pessoaPerfis[0].perfilNome}
                        {pessoaPerfis[0].cargoFuncaoNome && (
                          <span className="text-emerald-400">· {pessoaPerfis[0].cargoFuncaoNome}</span>
                        )}
                        <button
                          onClick={() => handleRemovePerfil(pessoaPerfis[0].id)}
                          className="text-emerald-300 hover:text-red-400 transition-colors ml-0.5"
                          title="Remover vínculo"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Fazendas ── */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Star size={14} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fazendas</span>
              </div>

              {!dados.full_name.trim() ? (
                <p className="text-sm text-gray-400">Preencha o nome para ativar este campo.</p>
              ) : (
                <>
                  {fazendasComNome.length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      {fazendasComNome.map(pf => (
                        <div
                          key={pf.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                            pf.isPrimary
                              ? 'border-emerald-200 bg-emerald-50/60'
                              : 'border-gray-100 bg-gray-50/60 hover:bg-gray-50'
                          }`}
                        >
                          <button
                            onClick={() => handleSetPrimary(pf.id)}
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              pf.isPrimary
                                ? 'border-emerald-500 bg-emerald-500'
                                : 'border-gray-300 hover:border-emerald-400'
                            }`}
                            title={pf.isPrimary ? 'Fazenda principal' : 'Definir como principal'}
                          >
                            {pf.isPrimary && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </button>
                          <span className="flex-1 text-sm text-gray-800 font-medium">{pf.farmName}</span>
                          {pf.isPrimary && (
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 rounded-md px-2 py-0.5">
                              Principal
                            </span>
                          )}
                          <button
                            onClick={() => handleRemoveFazenda(pf.id)}
                            className="p-1 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                            title="Desvincular"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {farmsDisponiveis.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        value={newFarmId}
                        onChange={e => setNewFarmId(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="">Selecionar fazenda para vincular...</option>
                        {farmsDisponiveis.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleAddFazenda}
                        disabled={!newFarmId || addingFazenda}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium shrink-0"
                      >
                        {addingFazenda ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        Vincular
                      </button>
                    </div>
                  ) : fazendasComNome.length === 0 && (
                    <p className="text-sm text-gray-400">Nenhuma fazenda disponível para vincular.</p>
                  )}
                </>
              )}
            </div>

            {/* ── Ações ── */}
            <div className="p-6 flex items-center justify-between">
              <button
                onClick={() => setDados(d => ({ ...d, ativo: !d.ativo }))}
                className="flex items-center gap-2.5 group"
              >
                <span className={`relative inline-block w-10 h-[22px] rounded-full transition-colors ${dados.ativo ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${dados.ativo ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </span>
                <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">Pessoa ativa</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDados}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {editingId ? 'Salvar Alterações' : 'Adicionar Pessoa'}
                </button>
                <button
                  onClick={() => handleTabChange('detalhes')}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  Próximo
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ══ Aba 2: Permissões e Informações ══ */}
        {activeTab === 'detalhes' && (
          <div className="space-y-4">

            {/* Permissões */}
            {editingId && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">Permissões por Fazenda</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Configure o que esta pessoa pode fazer em cada fazenda.</p>
                </div>

                {fazendasComNome.length === 0 ? (
                  <div className="py-14 text-center">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <Star size={20} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-400">Nenhuma fazenda vinculada</p>
                    <p className="text-xs text-gray-300 mt-1">Vincule fazendas na aba anterior para configurar permissões.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {fazendasComNome.map(pf => {
                      const farmId = pf.farmId;
                      const perm = getPermissao(farmId);
                      const isSaving = savingPerm === farmId;
                      return (
                        <div key={farmId}>
                          <div className="flex items-center gap-2 px-6 py-3 bg-gray-50/70">
                            <span className="text-sm font-semibold text-gray-700 flex-1">{pf.farmName}</span>
                            {pf.isPrimary && (
                              <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                Principal
                              </span>
                            )}
                            {isSaving && <Loader2 size={13} className="animate-spin text-gray-400" />}
                          </div>
                          <div className="divide-y divide-gray-50">
                            {([
                              { key: 'assumeTarefasFazenda' as const, internalKey: 'assume_tarefas_fazenda' as const, label: 'Pode assumir tarefas da fazenda' },
                              { key: 'podeAlterarSemanaFechada' as const, internalKey: 'pode_alterar_semana_fechada' as const, label: 'Pode alterar semana fechada' },
                              { key: 'podeApagarSemana' as const, internalKey: 'pode_apagar_semana' as const, label: 'Pode apagar semana' },
                            ]).map(({ key, internalKey, label }) => (
                              <div key={key} className="flex items-center justify-between px-6 py-3">
                                <span className="text-sm text-gray-600">{label}</span>
                                <button
                                  onClick={() => handleTogglePerm(farmId, key, internalKey)}
                                  disabled={isSaving}
                                  className={`relative w-10 h-[22px] rounded-full transition-colors disabled:opacity-50 shrink-0 ${
                                    perm?.[key] ? 'bg-emerald-500' : 'bg-gray-200'
                                  }`}
                                >
                                  <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${
                                    perm?.[key] ? 'translate-x-[18px]' : 'translate-x-0'
                                  }`} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Outras Informações */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

              {/* Documentos */}
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Documentos</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">CPF</label>
                    <input
                      value={dados.cpf}
                      onChange={e => setDados(d => ({ ...d, cpf: formatCPF(e.target.value) }))}
                      placeholder="000.000.000-00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">RG</label>
                    <input
                      value={dados.rg}
                      onChange={e => setDados(d => ({ ...d, rg: e.target.value }))}
                      placeholder="Documento de identidade"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Datas */}
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Datas</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Nascimento</label>
                    <DateInputBR
                      value={dados.data_nascimento}
                      onChange={v => setDados(d => ({ ...d, data_nascimento: v }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Contratação</label>
                    <DateInputBR
                      value={dados.data_contratacao}
                      onChange={v => setDados(d => ({ ...d, data_contratacao: v }))}
                    />
                  </div>
                </div>
              </div>

              {/* Localização */}
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Localização</p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Cidade / UF</label>
                  <input
                    value={dados.location_city_uf}
                    onChange={e => setDados(d => ({ ...d, location_city_uf: e.target.value }))}
                    placeholder="Ex: Goiânia / GO"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Endereço</label>
                  <textarea
                    value={dados.endereco}
                    onChange={e => setDados(d => ({ ...d, endereco: e.target.value }))}
                    rows={2}
                    placeholder="Endereço completo"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>

              {/* Observações */}
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Observações</p>
                <textarea
                  value={dados.observacoes}
                  onChange={e => setDados(d => ({ ...d, observacoes: e.target.value }))}
                  rows={4}
                  placeholder="Anotações livres sobre esta pessoa..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Salvar Tab 2 */}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                <button
                  onClick={handleSaveDados}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Salvar Alterações
                </button>
              </div>

            </div>

          </div>
        )}

      </div>{/* /content */}


      {/* ─── Modal de Crop ──────────────────────────────────────────────────────── */}
      {showCropModal && cropSourceUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Ajustar Foto</h3>
              <button onClick={() => setShowCropModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Canvas de crop */}
            <div
              className="relative overflow-hidden rounded-full border-4 border-emerald-200 mx-auto cursor-move"
              style={{ width: CROP_SIZE, height: CROP_SIZE }}
              onMouseDown={onCropMouseDown}
              onMouseMove={onCropMouseMove}
              onMouseUp={onCropMouseUp}
              onMouseLeave={onCropMouseUp}
            >
              <img
                ref={cropImageRef}
                src={cropSourceUrl}
                alt="Crop"
                draggable={false}
                onLoad={e => {
                  const img = e.currentTarget;
                  const w = img.naturalWidth;
                  const h = img.naturalHeight;
                  setCropImageSize({ w, h });
                  // fitZoom: menor escala para que a imagem inteira caiba no círculo
                  const fitZoom = CROP_SIZE / Math.max(w, h);
                  const minZoom = Math.min(fitZoom, 1);
                  setCropMinZoom(minZoom);
                  setCropZoom(minZoom);
                  setCropPosition({ x: 0, y: 0 });
                }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${cropZoom})`,
                  maxWidth: 'none',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-3 mt-4">
              <ZoomIn size={14} className="text-gray-400" />
              <input
                type="range"
                min={cropMinZoom}
                max={4}
                step={0.01}
                value={cropZoom}
                onChange={e => setCropZoom(Number(e.target.value))}
                className="flex-1"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowCropModal(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={applyCrop}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
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
