import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, ArrowLeft, Search, Trash2, Edit2, Loader2, User, Camera, X,
  Move, ZoomIn, Building2, Star, Shield, Check, Info,
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

interface PeopleManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

type TabId = 'dados' | 'perfis' | 'fazendas' | 'permissoes' | 'outras';

const TABS: { id: TabId; label: string; icon: React.ReactNode; editingOnly?: boolean }[] = [
  { id: 'dados', label: 'Dados Pessoais', icon: <User size={14} /> },
  { id: 'perfis', label: 'Perfis e Cargos', icon: <Building2 size={14} /> },
  { id: 'fazendas', label: 'Fazendas', icon: <Star size={14} /> },
  { id: 'permissoes', label: 'Permissões', icon: <Shield size={14} />, editingOnly: true },
  { id: 'outras', label: 'Outras Informações', icon: <Info size={14} />, editingOnly: true },
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
  const { selectedClient, selectedFarm, farms } = useHierarchy();

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
  const [filterPerfilId, setFilterPerfilId] = useState<number | null>(null);
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
  const [newPerfilId, setNewPerfilId] = useState<number | ''>('');
  const [newCargoId, setNewCargoId] = useState<number | ''>('');

  // ─── Form — Fazendas ─────────────────────────────────────────────────────────
  const [pessoaFazendas, setPessoaFazendas] = useState<PessoaFazenda[]>([]);
  const [addingFazenda, setAddingFazenda] = useState(false);
  const [newFarmId, setNewFarmId] = useState<string>('');

  // ─── Form — Permissões ───────────────────────────────────────────────────────
  const [permissoes, setPermissoes] = useState<PessoaPermissao[]>([]);
  const [savingPerm, setSavingPerm] = useState<string | null>(null);

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
          .filter(p => p.photo_url)
          .map(async p => {
            try { urls[p.id] = await storageResolveUrl(p.photo_url!); } catch { /* silent */ }
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
    setActiveTab('dados');
    setIsNewPerson(true);
    setView('form');
  };

  const openEdit = async (p: Pessoa) => {
    setEditingId(p.id);
    setDados({
      full_name: p.full_name,
      preferred_name: p.preferred_name ?? '',
      cpf: formatCPF(p.cpf ?? ''),
      rg: p.rg ?? '',
      data_nascimento: p.data_nascimento ?? '',
      data_contratacao: p.data_contratacao ?? '',
      email: p.email ?? '',
      phone_whatsapp: formatPhone(p.phone_whatsapp ?? ''),
      location_city_uf: p.location_city_uf ?? '',
      endereco: p.endereco ?? '',
      observacoes: p.observacoes ?? '',
      photo_url: p.photo_url ?? '',
      ativo: p.ativo,
    });
    setPhotoPreview(signedUrls[p.id] ?? p.photo_url ?? null);
    setPhotoFile(null);
    setNewPerfilId('');
    setNewCargoId('');
    setNewFarmId('');
    setActiveTab('dados');
    setIsNewPerson(false);
    setView('form');

    // Carregar sub-recursos
    const completa = await getPessoa(p.id);
    if (completa) {
      setPessoaPerfis(completa.perfis);
      setPessoaFazendas(completa.fazendas);
      setPermissoes(completa.permissoes);
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

  // ─── Salvar dados da pessoa ────────────────────────────────────────────────────
  const handleSaveDados = async () => {
    if (!dados.full_name.trim()) {
      onToast?.('Nome completo é obrigatório', 'error');
      return;
    }
    if (dados.cpf && !validateCPF(dados.cpf)) {
      onToast?.('CPF inválido', 'error');
      return;
    }
    if (!organizationId) {
      onToast?.('Selecione uma organização antes de cadastrar uma pessoa', 'error');
      return;
    }

    setSaving(true);
    try {
      let photoUrl = dados.photo_url;

      // Upload de foto se houver arquivo novo
      if (photoFile && (editingId || !editingId)) {
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
        await updatePessoa(editingId, payload);
        onToast?.('Pessoa atualizada com sucesso', 'success');
      } else {
        const created = await createPessoa({ ...payload, organization_id: organizationId });
        if (created) {
          setEditingId(created.id);
          onToast?.('Pessoa criada com sucesso', 'success');
        }
      }
      loadPessoas();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao salvar pessoa', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Perfis ───────────────────────────────────────────────────────────────────
  const handleAddPerfil = async () => {
    if (!editingId || !newPerfilId) return;
    setAddingPerfil(true);
    try {
      await addPessoaPerfil(editingId, Number(newPerfilId), newCargoId ? Number(newCargoId) : null);
      const completa = await getPessoa(editingId);
      if (completa) setPessoaPerfis(completa.perfis);
      setNewPerfilId('');
      setNewCargoId('');
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
    if (!editingId || !newFarmId) return;
    setAddingFazenda(true);
    try {
      await addPessoaFazenda(editingId, newFarmId);
      const completa = await getPessoa(editingId);
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
        prev.map(f => ({ ...f, is_primary: f.id === pessoaFazendaId })),
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
        const removedFarm = pessoaFazendas.find(f => f.id === pessoaFazendaId)?.farm_id;
        return removedFarm ? prev.filter(p => p.farm_id !== removedFarm) : prev;
      });
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao desvincular fazenda', 'error');
    }
  };

  // ─── Permissões ───────────────────────────────────────────────────────────────
  const getPermissao = (farmId: string): PessoaPermissao | undefined =>
    permissoes.find(p => p.farm_id === farmId);

  const handleTogglePerm = async (
    farmId: string,
    key: 'assume_tarefas_fazenda' | 'pode_alterar_semana_fechada' | 'pode_apagar_semana',
  ) => {
    if (!editingId) return;
    const current = getPermissao(farmId);
    const next = {
      assume_tarefas_fazenda: current?.assume_tarefas_fazenda ?? false,
      pode_alterar_semana_fechada: current?.pode_alterar_semana_fechada ?? false,
      pode_apagar_semana: current?.pode_apagar_semana ?? false,
      [key]: !(current?.[key] ?? false),
    };
    setSavingPerm(farmId);
    try {
      await upsertPessoaPermissao(editingId, farmId, next);
      setPermissoes(prev => {
        const exists = prev.find(p => p.farm_id === farmId);
        if (exists) return prev.map(p => p.farm_id === farmId ? { ...p, ...next } : p);
        return [...prev, { id: `${editingId}-${farmId}`, pessoa_id: editingId, farm_id: farmId, ...next, created_at: '', updated_at: '' }];
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

  // ─── Fazendas disponíveis para vincular (da organização) ──────────────────────
  const farmsDisponiveis = useMemo(
    () => farms.filter(f => !pessoaFazendas.some(pf => pf.farm_id === f.id)),
    [farms, pessoaFazendas],
  );

  // ─── Fazendas vinculadas com nome ─────────────────────────────────────────────
  const fazendasComNome = useMemo(
    () => pessoaFazendas.map(pf => ({
      ...pf,
      farm_name: farms.find(f => f.id === pf.farm_id)?.name ?? pf.farm_id,
    })),
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
                onChange={e => setFilterPerfilId(e.target.value ? Number(e.target.value) : null)}
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
                              <div className="font-medium text-gray-900">{p.preferred_name || p.full_name}</div>
                              {p.preferred_name && (
                                <div className="text-xs text-gray-400">{p.full_name}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{p.phone_whatsapp ? formatPhone(p.phone_whatsapp) : '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{p.email ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${p.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <h1 className="text-xl font-bold text-gray-900 mb-4">
        {editingId ? 'Editar Pessoa' : 'Nova Pessoa'}
      </h1>

      {/* ─── Barra de abas ─── */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
        {TABS.filter(t => !t.editingOnly || editingId).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Aba 1: Dados Pessoais ─── */}
      {activeTab === 'dados' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Foto */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoPreview ? (
                <img src={photoPreview} className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                  <User size={28} className="text-gray-400" />
                </div>
              )}
              <label className="absolute -bottom-1 -right-1 p-1.5 bg-emerald-600 rounded-full cursor-pointer hover:bg-emerald-700 transition-colors">
                <Camera size={12} className="text-white" />
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </label>
            </div>
            {photoPreview && (
              <button
                onClick={handleAdjustPhoto}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                <Move size={14} />
                Ajustar foto
              </button>
            )}
          </div>

          {/* Nome */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
              <input
                value={dados.full_name}
                onChange={e => setDados(d => ({ ...d, full_name: e.target.value }))}
                placeholder="Nome completo"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apelido / Nome Preferido</label>
              <input
                value={dados.preferred_name}
                onChange={e => setDados(d => ({ ...d, preferred_name: e.target.value }))}
                placeholder="Apelido"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input
                value={dados.phone_whatsapp}
                onChange={e => setDados(d => ({ ...d, phone_whatsapp: formatPhone(e.target.value) }))}
                placeholder="(00) 00000-0000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={dados.email}
                onChange={e => setDados(d => ({ ...d, email: e.target.value }))}
                placeholder="email@exemplo.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDados(d => ({ ...d, ativo: !d.ativo }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${dados.ativo ? 'bg-emerald-600' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${dados.ativo ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm text-gray-700">Pessoa ativa</span>
          </div>

          {/* Botão salvar */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveDados}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Salvar Alterações' : 'Criar Pessoa'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Aba 2: Perfis e Cargos ─── */}
      {activeTab === 'perfis' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Lista de perfis */}
          {pessoaPerfis.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum perfil vinculado ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pessoaPerfis.map(pp => (
                <div key={pp.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
                  <span className="text-sm font-medium text-emerald-800">{pp.perfil_nome ?? `Perfil #${pp.perfil_id}`}</span>
                  {pp.cargo_funcao_nome && (
                    <span className="text-xs text-emerald-600">— {pp.cargo_funcao_nome}</span>
                  )}
                  <button
                    onClick={() => handleRemovePerfil(pp.id)}
                    className="text-emerald-400 hover:text-red-500 transition-colors ml-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar perfil */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Adicionar Perfil</p>
            <div className="flex gap-3">
              <select
                value={newPerfilId}
                onChange={e => { setNewPerfilId(e.target.value ? Number(e.target.value) : ''); setNewCargoId(''); }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Selecionar perfil...</option>
                {perfisDisponiveis
                  .filter(p => !pessoaPerfis.some(pp => pp.perfil_id === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
              </select>
              {/* Cargo apenas se perfil for "Colaborador" (id=3) */}
              {newPerfilId && Number(newPerfilId) === 3 && (
                <select
                  value={newCargoId}
                  onChange={e => setNewCargoId(e.target.value ? Number(e.target.value) : '')}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {addingPerfil ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Aba 3: Fazendas ─── */}
      {activeTab === 'fazendas' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {fazendasComNome.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma fazenda vinculada ainda.</p>
          ) : (
            <div className="space-y-2">
              {fazendasComNome.map(pf => (
                <div key={pf.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                  <button
                    onClick={() => handleSetPrimary(pf.id)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      pf.is_primary
                        ? 'border-emerald-600 bg-emerald-600'
                        : 'border-gray-300 hover:border-emerald-400'
                    }`}
                    title={pf.is_primary ? 'Fazenda principal' : 'Definir como principal'}
                  >
                    {pf.is_primary && <span className="w-2 h-2 bg-white rounded-full" />}
                  </button>
                  <span className="flex-1 text-sm font-medium text-gray-800">{pf.farm_name}</span>
                  {pf.is_primary && (
                    <span className="text-xs text-emerald-600 font-medium">Principal</span>
                  )}
                  <button
                    onClick={() => handleRemoveFazenda(pf.id)}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Desvincular"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Vincular nova fazenda */}
          {farmsDisponiveis.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Vincular Fazenda</p>
              <div className="flex gap-3">
                <select
                  value={newFarmId}
                  onChange={e => setNewFarmId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Selecionar fazenda...</option>
                  {farmsDisponiveis.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddFazenda}
                  disabled={!newFarmId || addingFazenda}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {addingFazenda ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Vincular
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Aba 4: Permissões ─── */}
      {activeTab === 'permissoes' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h3 className="font-semibold text-gray-800">Permissões por Fazenda</h3>
          {fazendasComNome.length === 0 ? (
            <p className="text-sm text-gray-400">Vincule fazendas primeiro para configurar permissões.</p>
          ) : (
            <div className="space-y-5">
              {fazendasComNome.map(pf => {
                const perm = getPermissao(pf.farm_id);
                const isSaving = savingPerm === pf.farm_id;
                return (
                  <div key={pf.farm_id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <h4 className="font-medium text-gray-800">{pf.farm_name}</h4>
                      {pf.is_primary && (
                        <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          Principal
                        </span>
                      )}
                      {isSaving && <Loader2 size={14} className="animate-spin text-gray-400" />}
                    </div>
                    <div className="space-y-3">
                      {([
                        { key: 'assume_tarefas_fazenda' as const, label: 'Pode assumir tarefas da fazenda' },
                        { key: 'pode_alterar_semana_fechada' as const, label: 'Pode alterar semana fechada' },
                        { key: 'pode_apagar_semana' as const, label: 'Pode apagar semana' },
                      ]).map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">{label}</span>
                          <button
                            onClick={() => handleTogglePerm(pf.farm_id, key)}
                            disabled={isSaving}
                            className={`relative w-10 h-5.5 rounded-full transition-colors disabled:opacity-50 ${
                              perm?.[key] ? 'bg-emerald-600' : 'bg-gray-200'
                            }`}
                            style={{ height: '22px' }}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${
                              perm?.[key] ? 'translate-x-4' : 'translate-x-0'
                            }`} style={{ width: '18px', height: '18px' }} />
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

      {/* ─── Aba 5: Outras Informações ─── */}
      {activeTab === 'outras' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <p className="text-xs text-gray-400">Todos os campos desta aba são opcionais.</p>

          {/* Documentos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
              <input
                value={dados.cpf}
                onChange={e => setDados(d => ({ ...d, cpf: formatCPF(e.target.value) }))}
                placeholder="000.000.000-00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RG</label>
              <input
                value={dados.rg}
                onChange={e => setDados(d => ({ ...d, rg: e.target.value }))}
                placeholder="Documento de identidade"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento</label>
              <input
                type="date"
                value={dados.data_nascimento}
                onChange={e => setDados(d => ({ ...d, data_nascimento: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Contratação</label>
              <input
                type="date"
                value={dados.data_contratacao}
                onChange={e => setDados(d => ({ ...d, data_contratacao: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Localização */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade / UF</label>
            <input
              value={dados.location_city_uf}
              onChange={e => setDados(d => ({ ...d, location_city_uf: e.target.value }))}
              placeholder="Ex: Goiânia / GO"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Endereço */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <textarea
              value={dados.endereco}
              onChange={e => setDados(d => ({ ...d, endereco: e.target.value }))}
              rows={2}
              placeholder="Endereço completo"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={dados.observacoes}
              onChange={e => setDados(d => ({ ...d, observacoes: e.target.value }))}
              rows={3}
              placeholder="Observações livres"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Botão salvar */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveDados}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

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
