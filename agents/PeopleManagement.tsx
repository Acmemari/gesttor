import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, ArrowLeft, Search, Trash2, Edit2, Loader2, User, Camera, X, Move, ZoomIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyst } from '../contexts/AnalystContext';
import { useFarm } from '../contexts/FarmContext';
import {
  fetchPeople,
  createPerson,
  updatePerson,
  deletePerson,
  uploadPersonPhoto,
  type Person,
  type PersonFormData,
} from '../lib/people';
import { storageResolveUrl } from '../lib/storage';

const PERSON_TYPES = [
  'Proprietário',
  'Co-Gestor',
  'Colaborador Fazenda',
  'Consultor',
  'Conselheiro',
  'Analista',
  'Fornecedor',
  'Cliente',
  'Familiar',
  'outro',
] as const;

const JOB_ROLES = [
  'Auxiliar de Escritório',
  'Campeiro',
  'Capataz de Máquinas',
  'Carpinteiro',
  'Cerqueiro',
  'Compras',
  'Controlador Fazenda',
  'Cozinheira/limpeza',
  'Encarregado Adm Geral',
  'Gerente de Operação',
  'Gerente Financeiro',
  'Gerente Geral',
  'Mecânico',
  'Motorista',
  'Operador (Esteira/Pá/Retro)',
  'Pedreiro',
  'Piloto de Avião',
  'Pró-Labore Dono',
  'Chefe de Retiro',
  'RH',
  'Serviço Geral',
  'Técnico Agrícola',
  'Tratador',
  'Tratorista (Pneu)',
  'Zootecnista/Agronomo/Veterinário',
];

interface PeopleManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const initialForm = {
  full_name: '',
  preferred_name: '',
  person_type: 'Colaborador Fazenda',
  job_role: '',
  phone_whatsapp: '',
  email: '',
  location_farm: '',
  location_city_uf: '',
  base: '',
  photo_url: '',
  main_activities: '',
  farm_id: '' as string,
  assume_tarefas_fazenda: false,
};

const PeopleManagement: React.FC<PeopleManagementProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedAnalyst } = useAnalyst();
  const { selectedFarm } = useFarm();
  const [people, setPeople] = useState<Person[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [formData, setFormData] = useState(initialForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = useState<{ w: number; h: number } | null>(null);
  const cropDragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);
  const CROP_SIZE = 280;

  const isAdmin = user?.role === 'admin';
  const effectiveUserId = useMemo(
    () => (isAdmin && selectedAnalyst ? selectedAnalyst.id : user?.id),
    [isAdmin, selectedAnalyst, user?.id],
  );

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('peopleViewChange', { detail: view }));
  }, [view]);

  useEffect(() => {
    const handleCancelForm = () => setView('list');
    window.addEventListener('peopleCancelForm', handleCancelForm);
    return () => window.removeEventListener('peopleCancelForm', handleCancelForm);
  }, []);

  const loadPeople = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      const filters = selectedFarm?.id ? { farmId: selectedFarm.id } : undefined;
      const list = await fetchPeople(effectiveUserId, filters);
      setPeople(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar pessoas';
      onToast?.(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, selectedFarm?.id, onToast]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const urls: Record<string, string> = {};
      await Promise.all(
        people
          .filter((p) => p.photo_url)
          .map(async (p) => {
            try {
              urls[p.id] = await storageResolveUrl(p.photo_url!);
            } catch { /* keep empty — fallback icon will show */ }
          }),
      );
      if (!cancelled) setSignedUrls(urls);
    };
    resolve();
    return () => { cancelled = true; };
  }, [people]);

  const openNew = () => {
    setEditing(null);
    setFormData({
      ...initialForm,
      location_farm: selectedFarm?.name ?? '',
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setView('form');
  };

  const openEdit = async (p: Person) => {
    setEditing(p);
    setFormData({
      full_name: p.full_name,
      preferred_name: p.preferred_name ?? '',
      person_type: p.person_type,
      job_role: p.job_role ?? '',
      phone_whatsapp: p.phone_whatsapp ?? '',
      email: p.email ?? '',
      location_farm: p.location_farm ?? '',
      location_city_uf: p.location_city_uf ?? '',
      base: p.base ?? '',
      photo_url: p.photo_url ?? '',
      main_activities: p.main_activities ?? '',
      farm_id: p.farm_id ?? selectedFarm?.id ?? '',
      assume_tarefas_fazenda: p.assume_tarefas_fazenda ?? false,
    });
    setPhotoPreview(signedUrls[p.id] ?? p.photo_url);
    setPhotoFile(null);
    setView('form');
  };

  const backToList = () => {
    setView('list');
    setEditing(null);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setCropSourceUrl(url);
    setCropZoom(1);
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
      setCropZoom(1);
      setCropPosition({ x: 0, y: 0 });
      setCropImageSize(null);
      setShowCropModal(true);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao carregar foto para ajuste', 'error');
    }
  };

  const closeCropModal = useCallback(() => {
    if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
    setShowCropModal(false);
    setCropSourceUrl(null);
  }, [cropSourceUrl]);

  const getCroppedBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = cropImageRef.current;
      if (!img || !cropImageSize) {
        reject(new Error('Imagem não carregada'));
        return;
      }
      const { w: nw, h: nh } = cropImageSize;
      const s0 = Math.max(CROP_SIZE / nw, CROP_SIZE / nh);
      const z = cropZoom;
      const size = CROP_SIZE / (z * s0);
      const cropX = nw / 2 - (CROP_SIZE / 2 + cropPosition.x) / (z * s0);
      const cropY = nh / 2 - (CROP_SIZE / 2 + cropPosition.y) / (z * s0);
      const canvas = document.createElement('canvas');
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas não disponível'));
        return;
      }
      ctx.beginPath();
      ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const sx = Math.max(0, cropX);
      const sy = Math.max(0, cropY);
      const sw = Math.min(size, nw - sx);
      const sh = Math.min(size, nh - sy);
      if (sw > 0 && sh > 0) {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CROP_SIZE, CROP_SIZE);
      }
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem'))), 'image/jpeg', 0.92);
    });
  }, [cropZoom, cropPosition, cropImageSize]);

  const handleCropApply = useCallback(async () => {
    try {
      const blob = await getCroppedBlob();
      const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(blob));
      closeCropModal();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Erro ao processar foto', 'error');
    }
  }, [getCroppedBlob, closeCropModal, onToast]);

  const onCropMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    cropDragRef.current = { startX: e.clientX, startY: e.clientY, startPos: { ...cropPosition } };
  };
  const onCropMouseMove = useCallback((e: MouseEvent) => {
    if (!cropDragRef.current) return;
    const dx = e.clientX - cropDragRef.current.startX;
    const dy = e.clientY - cropDragRef.current.startY;
    setCropPosition({ x: cropDragRef.current.startPos.x + dx, y: cropDragRef.current.startPos.y + dy });
  }, []);
  const onCropMouseUp = useCallback(() => {
    cropDragRef.current = null;
  }, []);
  useEffect(() => {
    if (!showCropModal) return;
    window.addEventListener('mousemove', onCropMouseMove);
    window.addEventListener('mouseup', onCropMouseUp);
    return () => {
      window.removeEventListener('mousemove', onCropMouseMove);
      window.removeEventListener('mouseup', onCropMouseUp);
    };
  }, [showCropModal, onCropMouseMove, onCropMouseUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      onToast?.('Faça login para continuar.', 'warning');
      return;
    }
    if (!formData.full_name.trim()) {
      onToast?.('Informe o nome completo.', 'warning');
      return;
    }
    const creatorId = effectiveUserId || user.id;
    if (!creatorId) {
      onToast?.('Não foi possível identificar o analista.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<PersonFormData> = {
        full_name: formData.full_name.trim(),
        preferred_name: formData.preferred_name.trim() || undefined,
        person_type: formData.person_type,
        job_role: formData.person_type === 'Colaborador Fazenda' ? formData.job_role || undefined : undefined,
        phone_whatsapp: formData.phone_whatsapp.trim() || undefined,
        email: formData.email.trim() || undefined,
        location_farm: editing ? (formData.location_farm.trim() || undefined) : (selectedFarm?.name || formData.location_farm.trim() || undefined),
        location_city_uf: formData.location_city_uf?.trim() || undefined,
        base: formData.base.trim() || undefined,
        main_activities: formData.main_activities.trim() || undefined,
        // Ao editar, manter farm_id da pessoa; ao criar, usar fazenda selecionada
        farm_id: editing ? (formData.farm_id || null) : (selectedFarm?.id || formData.farm_id || null),
        assume_tarefas_fazenda: formData.assume_tarefas_fazenda,
      };

      if (editing) {
        let photoUrl = editing.photo_url;
        if (photoFile) {
          photoUrl = await uploadPersonPhoto(user!.id, editing.id, photoFile);
        }
        await updatePerson(editing.id, { ...payload, photo_url: photoUrl ?? undefined });
        onToast?.('Pessoa atualizada com sucesso.', 'success');
      } else {
        const created = await createPerson(creatorId, payload);
        if (photoFile) {
          const photoUrl = await uploadPersonPhoto(user!.id, created.id, photoFile);
          await updatePerson(created.id, { photo_url: photoUrl });
        }
        onToast?.('Pessoa cadastrada com sucesso.', 'success');
      }
      backToList();
      loadPeople();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar';
      onToast?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Person) => {
    if (!window.confirm(`Excluir "${p.full_name}"?`)) return;
    try {
      await deletePerson(p.id);
      onToast?.('Pessoa excluída.', 'success');
      loadPeople();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao excluir';
      onToast?.(msg, 'error');
    }
  };

  const filtered = people.filter(
    p =>
      !search ||
      [p.full_name, p.preferred_name, p.person_type, p.job_role, p.email].some(
        v => v && String(v).toLowerCase().includes(search.toLowerCase()),
      ),
  );

  if (view === 'form') {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-auto">
        <div className="p-4 md:p-6 max-w-3xl mx-auto w-full space-y-6">
          <button
            type="button"
            onClick={backToList}
            className="flex items-center gap-2 text-ai-subtext hover:text-ai-text text-sm"
          >
            <ArrowLeft size={16} /> Voltar para lista
          </button>
          <h1 className="text-xl font-semibold text-ai-text">{editing ? 'Editar pessoa' : 'Nova pessoa'}</h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Nome completo *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={e => setFormData(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Como gosta de ser chamado</label>
                <input
                  type="text"
                  value={formData.preferred_name}
                  onChange={e => setFormData(f => ({ ...f, preferred_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                  placeholder="Apelido ou nome preferido"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Tipo de pessoa</label>
                <select
                  value={formData.person_type}
                  onChange={e => {
                    const next = e.target.value;
                    setFormData(f => ({
                      ...f,
                      person_type: next,
                      job_role: next === 'Colaborador Fazenda' ? f.job_role : '',
                    }));
                  }}
                  className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                >
                  {PERSON_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {formData.person_type === 'Colaborador Fazenda' && (
                <div>
                  <label className="block text-sm font-medium text-ai-text mb-1">Cargo/função</label>
                  <select
                    value={formData.job_role}
                    onChange={e => setFormData(f => ({ ...f, job_role: e.target.value }))}
                    className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                  >
                    <option value="">Selecione...</option>
                    {JOB_ROLES.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Telefone/WhatsApp (principal)</label>
                <input
                  type="tel"
                  value={formData.phone_whatsapp}
                  onChange={e => setFormData(f => ({ ...f, phone_whatsapp: e.target.value }))}
                  className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">E-mail</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ai-text mb-1">
                Base (onde fica a maior parte do tempo)
              </label>
              <input
                type="text"
                value={formData.base}
                onChange={e => setFormData(f => ({ ...f, base: e.target.value }))}
                className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
                placeholder="Ex: Sede, Retiro Norte..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ai-text mb-1">Foto</label>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-20 h-20 rounded-full bg-ai-surface border border-ai-border overflow-hidden flex items-center justify-center shrink-0">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={24} className="text-ai-subtext" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="cursor-pointer">
                    <span className="text-sm text-ai-accent hover:underline">Escolher arquivo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </label>
                  {photoPreview && (
                    <>
                      <button
                        type="button"
                        onClick={handleAdjustPhoto}
                        className="text-sm text-ai-accent hover:underline text-left"
                      >
                        Ajustar (centralizar/cortar)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoFile(null);
                          setPhotoPreview(null);
                        }}
                        className="text-sm text-ai-subtext hover:text-red-500 text-left"
                      >
                        Remover foto
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ai-text mb-1">Descrição das principais atividades</label>
              <textarea
                value={formData.main_activities}
                onChange={e => setFormData(f => ({ ...f, main_activities: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm resize-none"
                placeholder="Descreva as principais atividades desta pessoa..."
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-ai-border bg-ai-surface px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ai-text">Assume tarefas na fazenda</p>
                <p className="text-xs text-ai-subtext mt-0.5">Aparece como responsável na Gestão Semanal</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData(f => ({ ...f, assume_tarefas_fazenda: !f.assume_tarefas_fazenda }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${formData.assume_tarefas_fazenda ? 'bg-ai-accent' : 'bg-ai-surface2'}`}
                role="switch"
                aria-checked={formData.assume_tarefas_fazenda}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${formData.assume_tarefas_fazenda ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={backToList}
                className="px-4 py-2 rounded-md border border-ai-border text-ai-text bg-transparent hover:bg-ai-surface2"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-ai-accent text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {editing ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </form>
        </div>

        {/* Modal de recorte e centralização da foto */}
        {showCropModal && cropSourceUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={closeCropModal}>
            <div
              className="bg-ai-bg border border-ai-border rounded-xl shadow-xl max-w-lg w-full overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-ai-border">
                <span className="text-sm font-medium text-ai-text flex items-center gap-2">
                  <Move size={16} /> Arraste para centralizar · use o zoom para cortar
                </span>
                <button
                  type="button"
                  onClick={closeCropModal}
                  className="p-1.5 text-ai-subtext hover:text-ai-text rounded"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 flex flex-col items-center gap-4">
                <div
                  className="rounded-full overflow-hidden border-2 border-ai-border bg-ai-surface cursor-move select-none"
                  style={{ width: CROP_SIZE, height: CROP_SIZE }}
                  onMouseDown={onCropMouseDown}
                >
                  <div
                    className="w-full h-full overflow-hidden flex items-center justify-center"
                    style={{ transform: `scale(${cropZoom}) translate(${cropPosition.x}px, ${cropPosition.y}px)` }}
                  >
                    <img
                      ref={cropImageRef}
                      src={cropSourceUrl}
                      alt="Crop"
                      className="max-w-none object-cover"
                      style={{
                        width: CROP_SIZE,
                        height: CROP_SIZE,
                        objectPosition: 'center',
                      }}
                      onLoad={e => {
                        const el = e.currentTarget;
                        setCropImageSize({ w: el.naturalWidth, h: el.naturalHeight });
                      }}
                      draggable={false}
                    />
                  </div>
                </div>
                <div className="w-full max-w-xs flex items-center gap-3">
                  <ZoomIn size={18} className="text-ai-subtext shrink-0" />
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={cropZoom}
                    onChange={e => setCropZoom(Number(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none bg-ai-surface2 accent-ai-accent"
                  />
                  <span className="text-xs text-ai-subtext w-8">{cropZoom.toFixed(1)}×</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-ai-border">
                <button
                  type="button"
                  onClick={closeCropModal}
                  className="px-4 py-2 rounded-md border border-ai-border text-ai-text hover:bg-ai-surface2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCropApply}
                  disabled={!cropImageSize}
                  className="px-4 py-2 rounded-md bg-ai-accent text-white hover:opacity-90 disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ai-text">Cadastro de Pessoas</h1>
            <p className="text-sm text-ai-subtext mt-1">
              Colaboradores, consultores, fornecedores e clientes familiares.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-ai-accent text-white text-sm font-medium hover:opacity-90 shrink-0"
          >
            <Plus size={18} /> Nova pessoa
          </button>
        </div>

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ai-subtext" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, tipo, cargo, e-mail..."
            className="w-full pl-9 pr-3 py-2 border border-ai-border rounded-md bg-ai-surface text-ai-text text-sm"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={32} className="animate-spin text-ai-accent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-ai-surface border border-ai-border rounded-lg p-8 text-center">
            <User size={48} className="mx-auto text-ai-subtext/50 mb-3" />
            <p className="text-ai-text font-medium mb-1">
              {search ? 'Nenhum resultado para a busca.' : 'Nenhuma pessoa cadastrada.'}
            </p>
            <p className="text-sm text-ai-subtext mb-4">
              {search ? 'Tente outro termo.' : 'Cadastre colaboradores, consultores e outros contatos.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-ai-accent text-white text-sm"
              >
                <Plus size={18} /> Nova pessoa
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(p => (
              <li
                key={p.id}
                className="bg-ai-surface border border-ai-border rounded-lg p-4 flex items-center gap-4 hover:border-ai-accent/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-ai-surface2 flex items-center justify-center overflow-hidden shrink-0">
                  {signedUrls[p.id] ? (
                    <img
                      src={signedUrls[p.id]}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={() => {
                        console.warn('[PeopleManagement] Foto não carregou para pessoa', p.id, signedUrls[p.id]);
                        setSignedUrls(prev => {
                          const next = { ...prev };
                          delete next[p.id];
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <User size={24} className="text-ai-subtext" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ai-text truncate">
                    {p.full_name}
                    {p.preferred_name && <span className="text-ai-subtext font-normal"> ({p.preferred_name})</span>}
                  </p>
                  <p className="text-sm text-ai-subtext truncate">
                    {p.person_type}
                    {p.job_role && ` · ${p.job_role}`}
                  </p>
                  {(p.phone_whatsapp || p.email) && (
                    <p className="text-xs text-ai-subtext mt-0.5 truncate">
                      {[p.phone_whatsapp, p.email].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="p-2 text-ai-subtext hover:text-ai-accent rounded"
                    title="Editar"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="p-2 text-ai-subtext hover:text-red-500 rounded"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PeopleManagement;
