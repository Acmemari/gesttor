import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Trash2,
  GripVertical,
  Loader2,
  Save,
  MoreHorizontal,
  Upload,
  Eye,
  Ban,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useClient } from '../contexts/ClientContext';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import TabSwitch from '../components/ui/TabSwitch';
import FormActions from '../components/ui/FormActions';
import { storageUpload, storageGetPublicUrl } from '../lib/storage';
import {
  listRegimesAlimentares,
  createRegimeAlimentar,
  updateRegimeAlimentar,
  deleteRegimeAlimentar,
  reorderRegimesAlimentares,
  type RegimeAlimentar,
  listRegimeHistory,
  addRegimeHistoryEntry,
  deleteRegimeHistoryEntry,
  type RegimeAlimentarHistorico,
  listRegimeGmds,
  setRegimeGmd,
  deleteRegimeGmd,
  type RegimeAlimentarGmd,
  type RegimeAlimentarProduto,
} from '../lib/api/regimesAlimentaresClient';
import { listAnimalCategories, type AnimalCategory } from '../lib/api/animalCategoriesClient';

// ── Types & Constants ─────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

const FIXED_TYPES = [
  {
    tipo: 'Suplementação mineral',
    detalhe: 'Sal mineral, mineral aditivado, mineral com ureia',
  },
  {
    tipo: 'Suplementação proteico-energética',
    detalhe: 'Misturas com proteína, energia, ou ambas. Até 0,1% a 0,7% do peso vivo',
  },
  {
    tipo: 'Volumoso + mineral/proteico',
    detalhe: 'Suplementação volumosa a pasto como feno/silagem/cana mais suplemento',
  },
  {
    tipo: 'Creep-feeding',
    detalhe: 'Suplementação para bezerros ao pé da vaca',
  },
  {
    tipo: 'Recria Intensiva a pasto (RIP)',
    detalhe: 'Estratégia de recria com suplementação a pasto acima de 0,7%',
  },
  {
    tipo: 'Terminação Intensiva a pasto (TIP)',
    detalhe: 'Terminação no pasto com alto nível de concentrado. Oferta acima de 1,5% do peso vivo',
  },
  {
    tipo: 'Semiconfinamento',
    detalhe: 'Pasto + suplementação pesada, normalmente próximo da terminação. Oferta até 1,5% do Peso vivo',
  },
  {
    tipo: 'Confinamento',
    detalhe: 'Dieta total no cocho, sem depender do pasto como base alimentar',
  },
  {
    tipo: 'Outros',
    detalhe: '',
  },
];

const SIMULATED_STOCK_PRODUCTS = [
  { nome: 'Suplemento 1', custoQuilo: 3.50, estoqueQtd: 5000 },
  { nome: 'Suplemento 2', custoQuilo: 4.20, estoqueQtd: 2500 },
  { nome: 'Suplemento 3', custoQuilo: 5.00, estoqueQtd: 1000 },
];

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const selectCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';

// ── Badge de situação (Ativo / Inativo) ─────────────────────────────────────────

const SituacaoBadge: React.FC<{ ativo: boolean }> = ({ ativo }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
      ativo ? 'bg-[#e7f6ec] text-[#15803d]' : 'bg-gray-100 text-gray-500'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${ativo ? 'bg-[#16a34a]' : 'bg-gray-400'}`} />
    {ativo ? 'Ativo' : 'Inativo'}
  </span>
);

// ── Item do menu de ações (•••) ─────────────────────────────────────────────────

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, danger, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors ${
      danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className={danger ? 'text-red-500' : 'text-[#16a34a]'}>{icon}</span>
    {label}
  </button>
);

// ── Linha da tabela (master) ────────────────────────────────────────────────────

interface SortableRowProps {
  regime: RegimeAlimentar;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (r: RegimeAlimentar) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ regime, selected, menuOpen, onSelect, onMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: regime.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(regime)}
      className={`cursor-pointer border-t border-gray-100 transition-colors ${
        selected ? 'bg-[#e7f6ec]' : 'hover:bg-gray-50'
      }`}
    >
      <td className="p-3">
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing transition-colors text-gray-400 hover:text-[#16A34A]"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      </td>
      <td className={`p-3 font-semibold ${selected ? 'text-[#16a34a]' : 'text-gray-800'}`}>{regime.nome}</td>
      <td className="p-3 text-xs text-gray-500">{regime.codigoCurto}</td>
      <td className="p-3 text-xs text-gray-500">{regime.tipo}</td>
      <td className="p-3">
        <SituacaoBadge ativo={regime.ativo} />
      </td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={(e) => onMenu(e, regime.id)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            menuOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
          }`}
          title="Ações"
          aria-label="Ações"
        >
          <MoreHorizontal size={18} />
        </button>
      </td>
    </tr>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const RegimesAlimentaresManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [regimes, setRegimes] = useState<RegimeAlimentar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Abas Lançamentos / Registros
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');

  // Entrada da aba Lançamentos
  const [nome, setNome] = useState('');
  const [codigoCurto, setCodigoCurto] = useState('');
  const [tipo, setTipo] = useState(FIXED_TYPES[0].tipo);
  const [nivelIngestaoValor, setNivelIngestaoValor] = useState('');
  const [nivelIngestaoTipo, setNivelIngestaoTipo] = useState('% do PV');
  const [custoQuilo, setCustoQuilo] = useState('');
  const [anexoUrl, setAnexoUrl] = useState('');
  const [anexoNome, setAnexoNome] = useState('');
  const nomeRef = useRef<HTMLInputElement>(null);

  // Origem e produtos para lançamento
  const [origemProduto, setOrigemProduto] = useState<'estoque' | 'manual'>('estoque');
  const [selectedStockProductIdx, setSelectedStockProductIdx] = useState(0);
  const [manualProductName, setManualProductName] = useState('');
  const [manualProductCost, setManualProductCost] = useState('');
  const [produtosList, setProdutosList] = useState<RegimeAlimentarProduto[]>([]);

  // Detalhamento editável (aba Registros)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCodigoCurto, setEditCodigoCurto] = useState('');
  const [editTipo, setEditTipo] = useState(FIXED_TYPES[0].tipo);
  const [editNivelIngestaoValor, setEditNivelIngestaoValor] = useState('');
  const [editNivelIngestaoTipo, setEditNivelIngestaoTipo] = useState('% do PV');
  const [editCustoQuilo, setEditCustoQuilo] = useState('');
  const [editAnexoUrl, setEditAnexoUrl] = useState('');
  const [editAnexoNome, setEditAnexoNome] = useState('');

  // Origem e produtos para edição
  const [editOrigemProduto, setEditOrigemProduto] = useState<'estoque' | 'manual'>('estoque');
  const [editSelectedStockProductIdx, setEditSelectedStockProductIdx] = useState(0);
  const [editManualProductName, setEditManualProductName] = useState('');
  const [editManualProductCost, setEditManualProductCost] = useState('');
  const [editProdutosList, setEditProdutosList] = useState<RegimeAlimentarProduto[]>([]);

  // Detalhamento abas
  const [detailTab, setDetailTab] = useState<'geral' | 'historico' | 'gmd'>('geral');

  // GMD States
  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [gmdConfigs, setGmdConfigs] = useState<RegimeAlimentarGmd[]>([]);
  const [loadingGmd, setLoadingGmd] = useState(false);
  const [editingGmdCell, setEditingGmdCell] = useState<{ categoryId: string; estacao: string } | null>(null);
  const [gmdInputValue, setGmdInputValue] = useState('');

  // Histórico & Formulação
  const [historyList, setHistoryList] = useState<RegimeAlimentarHistorico[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [histDataVigencia, setHistDataVigencia] = useState('');
  const [histCustoQuilo, setHistCustoQuilo] = useState('');
  const [histFormulacao, setHistFormulacao] = useState('');
  const [histAnexoUrl, setHistAnexoUrl] = useState('');
  const [histAnexoNome, setHistAnexoNome] = useState('');
  const [savingHistory, setSavingHistory] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadRegimes = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listRegimesAlimentares(organizationId);
      setRegimes(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar regimes alimentares', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadRegimes();
  }, [loadRegimes]);

  // Auto-seleciona o primeiro regime e mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && regimes.some((r) => r.id === prev)) return prev;
      return regimes[0]?.id ?? null;
    });
  }, [regimes]);

  // Carrega os dados do regime selecionado no detalhamento editável.
  const selected = regimes.find((r) => r.id === selectedId) || null;
  useEffect(() => {
    if (selected) {
      setEditNome(selected.nome);
      setEditCodigoCurto(selected.codigoCurto);
      setEditTipo(selected.tipo);
      setEditNivelIngestaoValor(selected.nivelIngestaoValor ?? '');
      setEditNivelIngestaoTipo(selected.nivelIngestaoTipo ?? '% do PV');
      setEditCustoQuilo(selected.custoQuilo ?? '');
      setEditAnexoUrl(selected.anexoUrl ?? '');
      setEditAnexoNome(selected.anexoNome ?? '');
      setEditProdutosList(selected.produtos ?? []);
      setEditOrigemProduto('estoque');
      setEditSelectedStockProductIdx(0);
      setEditManualProductName('');
      setEditManualProductCost('');
      setDetailTab('geral');
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File Upload ────────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'create' | 'edit' | 'history') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'dat';
      const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      await storageUpload('regimes-alimentares', path, file, { contentType: file.type });
      const url = storageGetPublicUrl('regimes-alimentares', path);

      if (target === 'edit') {
        setEditAnexoUrl(url);
        setEditAnexoNome(file.name);
      } else if (target === 'history') {
        setHistAnexoUrl(url);
        setHistAnexoNome(file.name);
      } else {
        setAnexoUrl(url);
        setAnexoNome(file.name);
      }
      onToast?.('Arquivo anexado com sucesso', 'success');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao fazer upload do arquivo', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Histórico & Formulação Lógica ──────────────────────────────────────────

  const loadHistory = useCallback(async (regimeId: string) => {
    try {
      setLoadingHistory(true);
      const rows = await listRegimeHistory(regimeId);
      setHistoryList(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar histórico', 'error');
    } finally {
      setLoadingHistory(false);
    }
  }, [onToast]);

  const handleAddHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    if (!histDataVigencia || !histCustoQuilo.trim()) {
      onToast?.('Preencha a data de vigência e o custo por quilo', 'warning');
      return;
    }

    try {
      setSavingHistory(true);
      await addRegimeHistoryEntry({
        regimeAlimentarId: selectedId,
        dataVigencia: histDataVigencia,
        custoQuilo: parseFloat(histCustoQuilo),
        formulacao: histFormulacao.trim() || null,
        anexoUrl: histAnexoUrl || null,
        anexoNome: histAnexoNome || null,
      });

      onToast?.('Histórico/Formulação inserido com sucesso!', 'success');
      
      // Reset history form fields
      setHistDataVigencia('');
      setHistCustoQuilo('');
      setHistFormulacao('');
      setHistAnexoUrl('');
      setHistAnexoNome('');

      // Reload history list & regimes list to update the cache/grid
      await loadHistory(selectedId);
      await loadRegimes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar histórico', 'error');
    } finally {
      setSavingHistory(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!selectedId) return;
    if (!window.confirm('Tem certeza que deseja excluir esta formulação/preço do histórico?')) return;

    try {
      await deleteRegimeHistoryEntry(id, selectedId);
      onToast?.('Lançamento excluído do histórico com sucesso!', 'success');
      await loadHistory(selectedId);
      await loadRegimes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir histórico', 'error');
    }
  };

  useEffect(() => {
    if (selectedId && detailTab === 'historico') {
      loadHistory(selectedId);
    }
  }, [selectedId, detailTab, loadHistory]);

  // ── GMD Lógica ─────────────────────────────────────────────────────────────

  const loadGmdData = useCallback(async (regimeId: string) => {
    if (!organizationId) return;
    try {
      setLoadingGmd(true);
      const [cats, configs] = await Promise.all([
        listAnimalCategories(organizationId),
        listRegimeGmds(regimeId),
      ]);
      setCategories(cats.filter((c) => c.ativo || configs.some((cfg) => cfg.categoriaId === c.id)));
      setGmdConfigs(configs);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar dados do GMD', 'error');
    } finally {
      setLoadingGmd(false);
    }
  }, [organizationId, onToast]);

  const handleSaveGmdValue = async (categoriaId: string, estacao: string, valueStr: string) => {
    if (!selectedId) return;
    const cleanStr = valueStr.trim().replace(',', '.');
    if (!cleanStr) return;

    const value = parseFloat(cleanStr);
    if (isNaN(value) || value < 0) {
      onToast?.('Informe um valor de GMD válido', 'warning');
      return;
    }

    try {
      await setRegimeGmd({
        regimeAlimentarId: selectedId,
        categoriaId,
        estacao,
        gmd: value,
      });
      await loadGmdData(selectedId);
      onToast?.('GMD configurado com sucesso!', 'success');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar GMD', 'error');
    }
  };

  const handleDeleteGmdValue = async (id: string) => {
    if (!selectedId) return;
    try {
      await deleteRegimeGmd(id);
      await loadGmdData(selectedId);
      onToast?.('Configuração de GMD removida', 'success');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao remover GMD', 'error');
    }
  };

  useEffect(() => {
    if (selectedId && detailTab === 'gmd') {
      loadGmdData(selectedId);
    }
  }, [selectedId, detailTab, loadGmdData]);

  // ── Gestão de Múltiplos Produtos ───────────────────────────────────────────

  const handleAddProduct = (target: 'create' | 'edit') => {
    const isCreate = target === 'create';
    const origem = isCreate ? origemProduto : editOrigemProduto;
    let newProd: RegimeAlimentarProduto;

    if (origem === 'estoque') {
      const stockIdx = isCreate ? selectedStockProductIdx : editSelectedStockProductIdx;
      const baseProd = SIMULATED_STOCK_PRODUCTS[stockIdx];
      newProd = {
        nome: baseProd.nome,
        origem: 'estoque',
        custoQuilo: baseProd.custoQuilo,
        estoqueQtd: baseProd.estoqueQtd,
      };
    } else {
      const name = isCreate ? manualProductName : editManualProductName;
      const costStr = isCreate ? manualProductCost : editManualProductCost;
      if (!name.trim()) {
        onToast?.('Informe o nome do produto', 'warning');
        return;
      }
      const cost = parseFloat(costStr.replace(',', '.'));
      if (isNaN(cost) || cost < 0) {
        onToast?.('Informe um valor de custo válido', 'warning');
        return;
      }
      newProd = {
        nome: name.trim(),
        origem: 'manual',
        custoQuilo: cost,
        estoqueQtd: null,
      };
    }

    if (isCreate) {
      const updated = [...produtosList, newProd];
      setProdutosList(updated);
      setManualProductName('');
      setManualProductCost('');
      if (updated.length > 0) {
        setCustoQuilo(String(updated[0].custoQuilo));
      }
    } else {
      const updated = [...editProdutosList, newProd];
      setEditProdutosList(updated);
      setEditManualProductName('');
      setEditManualProductCost('');
      if (updated.length > 0) {
        setEditCustoQuilo(String(updated[0].custoQuilo));
      }
    }
  };

  const handleRemoveProduct = (index: number, target: 'create' | 'edit') => {
    if (target === 'create') {
      const updated = produtosList.filter((_, i) => i !== index);
      setProdutosList(updated);
      setCustoQuilo(updated.length > 0 ? String(updated[0].custoQuilo) : '');
    } else {
      const updated = editProdutosList.filter((_, i) => i !== index);
      setEditProdutosList(updated);
      setEditCustoQuilo(updated.length > 0 ? String(updated[0].custoQuilo) : '');
    }
  };

  const handleMoveProduct = (index: number, direction: 'up' | 'down', target: 'create' | 'edit') => {
    const list = target === 'create' ? [...produtosList] : [...editProdutosList];
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === list.length - 1) return;

    const swapWith = direction === 'up' ? index - 1 : index + 1;
    const temp = list[index];
    list[index] = list[swapWith];
    list[swapWith] = temp;

    if (target === 'create') {
      setProdutosList(list);
      if (list.length > 0) {
        setCustoQuilo(String(list[0].custoQuilo));
      }
    } else {
      setEditProdutosList(list);
      if (list.length > 0) {
        setEditCustoQuilo(String(list[0].custoQuilo));
      }
    }
  };

  const cancelLancamento = useCallback(() => {
    setNome('');
    setCodigoCurto('');
    setTipo(FIXED_TYPES[0].tipo);
    setNivelIngestaoValor('');
    setNivelIngestaoTipo('% do PV');
    setCustoQuilo('');
    setAnexoUrl('');
    setAnexoNome('');
    setProdutosList([]);
    setOrigemProduto('estoque');
    setSelectedStockProductIdx(0);
    setManualProductName('');
    setManualProductCost('');
  }, []);

  const salvar = useCallback(async () => {
    if (!nome.trim()) {
      onToast?.('Informe o nome do regime alimentar', 'error');
      return;
    }
    if (!codigoCurto.trim()) {
      onToast?.('Informe o código curto', 'error');
      return;
    }
    const lowerNome = nome.trim().toLowerCase();
    const lowerCod = codigoCurto.trim().toLowerCase();
    if (regimes.some((r) => r.nome.trim().toLowerCase() === lowerNome)) {
      onToast?.('Este regime alimentar já está cadastrado', 'warning');
      return;
    }
    if (regimes.some((r) => r.codigoCurto.trim().toLowerCase() === lowerCod)) {
      onToast?.('Este código curto já está em uso', 'warning');
      return;
    }

    setSaving(true);
    try {
      await createRegimeAlimentar({
        nome: nome.trim(),
        codigoCurto: codigoCurto.trim().toUpperCase(),
        tipo,
        nivelIngestaoValor: nivelIngestaoValor.trim() || null,
        nivelIngestaoTipo: nivelIngestaoTipo || null,
        custoQuilo: custoQuilo.trim() || null,
        anexoUrl: anexoUrl || null,
        anexoNome: anexoNome || null,
        produtos: produtosList.length > 0 ? produtosList : null,
        organizationId,
      });
      onToast?.('Regime alimentar salvo com sucesso', 'success');
      cancelLancamento();
      await loadRegimes();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar regime alimentar', 'error');
    } finally {
      setSaving(false);
    }
  }, [nome, codigoCurto, tipo, nivelIngestaoValor, nivelIngestaoTipo, custoQuilo, anexoUrl, anexoNome, produtosList, organizationId, regimes, onToast, loadRegimes, cancelLancamento]);

  // ── Edição (detalhamento da aba Registros) ──────────────────────────────────

  const salvarDetalhe = useCallback(async () => {
    if (!selectedId) return;
    if (!editNome.trim()) {
      onToast?.('Informe o nome do regime alimentar', 'error');
      return;
    }
    if (!editCodigoCurto.trim()) {
      onToast?.('Informe o código curto', 'error');
      return;
    }

    setSaving(true);
    try {
      await updateRegimeAlimentar(selectedId, {
        nome: editNome.trim(),
        codigoCurto: editCodigoCurto.trim().toUpperCase(),
        tipo: editTipo,
        nivelIngestaoValor: editNivelIngestaoValor.trim() || null,
        nivelIngestaoTipo: editNivelIngestaoTipo || null,
        custoQuilo: editCustoQuilo.trim() || null,
        anexoUrl: editAnexoUrl || null,
        anexoNome: editAnexoNome || null,
        produtos: editProdutosList.length > 0 ? editProdutosList : null,
      });
      onToast?.('Regime alimentar atualizado com sucesso', 'success');
      await loadRegimes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar regime alimentar', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editNome, editCodigoCurto, editTipo, editNivelIngestaoValor, editNivelIngestaoTipo, editCustoQuilo, editAnexoUrl, editAnexoNome, editProdutosList, onToast, loadRegimes]);

  // ── Ativar / Inativar (Situações) ───────────────────────────────────────────

  const toggleAtivo = useCallback(async (regime: RegimeAlimentar) => {
    try {
      await updateRegimeAlimentar(regime.id, { ativo: !regime.ativo });
      onToast?.(regime.ativo ? 'Regime alimentar inativado' : 'Regime alimentar ativado', 'success');
      await loadRegimes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao alterar situação', 'error');
    }
  }, [onToast, loadRegimes]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteRegimeAlimentar(deleteConfirmId);
      onToast?.('Regime alimentar removido', 'success');
      setDeleteConfirmId(null);
      await loadRegimes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir regime alimentar', 'error');
    }
  };

  // ── Drag-and-Drop ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: { active: { id: unknown } }) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const oldIndex = regimes.findIndex((r) => r.id === String(active.id));
      const newIndex = regimes.findIndex((r) => r.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...regimes];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setRegimes(reordered);

      const items = reordered.map((r, i) => ({ id: r.id, ordem: i }));
      try {
        await reorderRegimesAlimentares(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadRegimes();
      }
    },
    [regimes, onToast, loadRegimes],
  );

  const sortableIds = regimes.map((r) => r.id);
  const activeDragRegime = activeId ? regimes.find((r) => r.id === activeId) : null;

  // ── Menu de ações (•••) ─────────────────────────────────────────────────────
  const toggleMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuTipo = menu ? regimes.find((r) => r.id === menu.id) ?? null : null;

  // ── Resizing ───────────────────────────────────────────────────────────────
  const splitRef = useRef<HTMLDivElement>(null);
  const [masterPct, setMasterPct] = useState(50);
  const draggingRef = useRef(false);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResize = (e: React.PointerEvent) => {
    if (!draggingRef.current || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setMasterPct(Math.min(85, Math.max(15, pct)));
  };
  const endResize = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar os regimes alimentares.
      </div>
    );
  }

  const selectedTypeDetail = FIXED_TYPES.find((t) => t.tipo === tipo)?.detalhe ?? '';
  const editTypeDetail = FIXED_TYPES.find((t) => t.tipo === editTipo)?.detalhe ?? '';

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-4xl mx-auto w-full min-h-screen animate-in fade-in duration-500">
      {/* Cabeçalho padrão */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-5 p-2.5 rounded-xl transition-all text-gray-500 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1">
          <PageHeader
            title="Cadastro de Regime Alimentar"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: regimes.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

            {aba === 'lancar' ? (
        /* ── Aba Lançamentos: formulário de cadastro ──────────────────────────── */
        <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Nome <span className="text-[#DC2626]">*</span>
              </label>
              <input
                ref={nomeRef}
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Suplementação 0,3% PV"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Código curto <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                value={codigoCurto}
                onChange={(e) => setCodigoCurto(e.target.value)}
                placeholder="Ex: SUP03"
                maxLength={10}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Tipo <span className="text-[#DC2626]">*</span>
              </label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={selectCls}>
                {FIXED_TYPES.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.tipo}
                  </option>
                ))}
              </select>
              {selectedTypeDetail && (
                <p className="mt-1.5 text-xs text-[#16a34a] font-medium leading-relaxed bg-[#e7f6ec] px-2.5 py-1.5 rounded-lg border border-[#e7f6ec]">
                  {selectedTypeDetail}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[12.5px] font-bold text-gray-700">Nível de Ingestão</label>
              <div className="grid grid-cols-2 gap-3 bg-gray-50/50 p-3.5 rounded-xl border border-gray-150">
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Unidade de Ingestão</label>
                  <select
                    value={nivelIngestaoTipo}
                    onChange={(e) => setNivelIngestaoTipo(e.target.value)}
                    className={selectCls}
                  >
                    <option value="% do PV">% do PV</option>
                    <option value="Gramas/cab/dia">Gramas/cab/dia</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Valor de Ingestão</label>
                  <input
                    type="number"
                    step="any"
                    value={nivelIngestaoValor}
                    onChange={(e) => setNivelIngestaoValor(e.target.value)}
                    placeholder="Ex: 0.3 ou 150"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Composição de Produtos do Regime */}
          <div className="bg-gray-50/50 p-4.5 rounded-xl border border-gray-150 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-150 pb-2">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Produtos, Suplementos e formulados
              </h4>
              <span className="text-[10px] text-gray-400">
                Adicione um ou mais suplementos ao regime.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="mb-1 block text-[11px] font-semibold text-gray-600">Origem do Produto</label>
                <select
                  value={origemProduto}
                  onChange={(e) => setOrigemProduto(e.target.value as 'estoque' | 'manual')}
                  className={selectCls}
                >
                  <option value="estoque">Estoque (Simulado)</option>
                  <option value="manual">Manual (Digitação)</option>
                </select>
              </div>

              {origemProduto === 'estoque' ? (
                <div className="md:col-span-7">
                  <label className="mb-1 block text-[11px] font-semibold text-gray-600">Selecionar do Estoque</label>
                  <select
                    value={selectedStockProductIdx}
                    onChange={(e) => setSelectedStockProductIdx(Number(e.target.value))}
                    className={selectCls}
                  >
                    {SIMULATED_STOCK_PRODUCTS.map((prod, idx) => (
                      <option key={idx} value={idx}>
                        {prod.nome} (Estoque: {prod.estoqueQtd} kg — R$ {prod.custoQuilo.toFixed(2)}/kg)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="md:col-span-4">
                    <label className="mb-1 block text-[11px] font-semibold text-gray-600">Nome do Produto</label>
                    <input
                      type="text"
                      value={manualProductName}
                      onChange={(e) => setManualProductName(e.target.value)}
                      placeholder="Ex: Farelo de Soja"
                      className={inputCls}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-[11px] font-semibold text-gray-600">Custo (/kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={manualProductCost}
                      onChange={(e) => setManualProductCost(e.target.value)}
                      placeholder="R$ 0,00"
                      className={inputCls}
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => handleAddProduct('create')}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#E7F6EC] px-3 font-bold text-[#15803d] hover:bg-[#d1f0db] active:scale-[0.98] transition-all"
                >
                  <Plus size={15} />
                  Adicionar
                </button>
              </div>
            </div>

            {produtosList.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-gray-150 bg-white">
                <table className="w-full border-collapse text-left text-xs text-gray-600">
                  <thead>
                    <tr className="border-b border-gray-150 bg-gray-50 text-gray-700 font-semibold">
                      <th className="p-2 w-16 text-center">Ordem</th>
                      <th className="p-2">Nome do Produto</th>
                      <th className="p-2 w-24 text-center">Origem</th>
                      <th className="p-2 w-32 text-right">Qtd Estoque</th>
                      <th className="p-2 w-28 text-right">Custo/kg</th>
                      <th className="p-2 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtosList.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/30">
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveProduct(idx, 'up', 'create')}
                              disabled={idx === 0}
                              className="text-gray-400 hover:text-[#16A34A] disabled:opacity-30 p-0.5 rounded transition-colors"
                              title="Mover para cima"
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveProduct(idx, 'down', 'create')}
                              disabled={idx === produtosList.length - 1}
                              className="text-gray-400 hover:text-[#16A34A] disabled:opacity-30 p-0.5 rounded transition-colors"
                              title="Mover para baixo"
                            >
                              <ArrowDown size={13} />
                            </button>
                          </div>
                        </td>
                        <td className="p-2 font-medium text-gray-800">{item.nome}</td>
                        <td className="p-2 text-center">
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${item.origem === 'estoque' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                            {item.origem}
                          </span>
                        </td>
                        <td className="p-2 text-right text-gray-500">
                          {item.estoqueQtd !== null ? `${item.estoqueQtd.toLocaleString('pt-BR')} kg` : '—'}
                        </td>
                        <td className="p-2 text-right font-bold text-gray-800">
                          R$ {item.custoQuilo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(idx, 'create')}
                            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                            title="Remover produto"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Anexo</label>
              <div className="flex items-center gap-2">
                <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-100 w-full transition-colors">
                  {uploading ? (
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                  ) : (
                    <Upload size={16} className="text-gray-400" />
                  )}
                  {anexoNome ? 'Substituir arquivo' : 'Selecionar arquivo (imagem/pdf...)'}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'create')}
                    disabled={uploading}
                  />
                </label>
                {anexoUrl && (
                  <a
                    href={anexoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0"
                    title={anexoNome || 'Ver anexo'}
                  >
                    <Eye size={16} />
                  </a>
                )}
              </div>
              {anexoNome && (
                <p className="mt-1 text-[11px] text-gray-500 truncate" title={anexoNome}>
                  Anexado: {anexoNome}
                </p>
              )}
            </div>
          </div>
          <FormActions
            onCancel={cancelLancamento}
            onSave={salvar}
            saveDisabled={!nome.trim() || !codigoCurto.trim() || saving || uploading}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : (
        /* ── Aba Registros: grid master-detail com divisão arrastável vertical ──────── */
        <div
          ref={splitRef}
          onPointerMove={onResize}
          className="relative flex flex-col flex-1 rounded-2xl border border-gray-200 bg-white overflow-hidden"
          style={{ height: 'calc(100vh - 180px)' }}
        >
          {/* Bloco Superior: Lista (Master) */}
          <div className="overflow-y-auto" style={{ height: `${masterPct}%` }}>
            {loading ? (
              <div className="flex h-full items-center justify-center p-8">
                <Loader2 size={24} className="animate-spin text-[#16A34A]" />
              </div>
            ) : regimes.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">Nenhum regime alimentar cadastrado.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-400 select-none">
                    <th className="w-10 p-3" />
                    <th className="p-3">Nome</th>
                    <th className="p-3">Código</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Situação</th>
                    <th className="w-12 p-3 text-center" />
                  </tr>
                </thead>
                <tbody>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                      {regimes.map((r) => (
                        <SortableRow
                          key={r.id}
                          regime={r}
                          selected={r.id === selectedId}
                          menuOpen={menu?.id === r.id}
                          onSelect={(row) => setSelectedId(row.id)}
                          onMenu={toggleMenu}
                        />
                      ))}
                    </SortableContext>
                    <DragOverlay>
                      {activeDragRegime ? (
                        <table className="w-full text-left border-collapse opacity-80 bg-white shadow-xl rounded-lg">
                          <tbody>
                            <tr className="border-t border-gray-100">
                              <td className="w-10 p-3 text-gray-400">
                                <GripVertical size={14} />
                              </td>
                              <td className="p-3 font-semibold text-gray-800">{activeDragRegime.nome}</td>
                              <td className="p-3 text-xs text-gray-500">{activeDragRegime.codigoCurto}</td>
                              <td className="p-3 text-xs text-gray-500">{activeDragRegime.tipo}</td>
                              <td className="p-3">
                                <SituacaoBadge ativo={activeDragRegime.ativo} />
                              </td>
                              <td className="w-12 p-3" />
                            </tr>
                          </tbody>
                        </table>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </tbody>
              </table>
            )}
          </div>

          {/* Divisor arrastável */}
          <div
            onPointerDown={startResize}
            onPointerUp={endResize}
            className="h-1.5 bg-gray-100 hover:bg-[#16A34A] active:bg-[#16A34A] cursor-ns-resize flex items-center justify-center transition-colors border-t border-b border-gray-200 select-none z-10"
            title="Arraste para redimensionar"
          />

          {/* Bloco Inferior: Detalhe do selecionado */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50 p-5">
            {selected ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 gap-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <h3 className="text-sm font-bold text-gray-850">Detalhes do Registro</h3>
                    <TabSwitch
                      tabs={[
                        { id: 'geral', label: 'Dados Gerais' },
                        { id: 'historico', label: 'Formulação / Histórico', badge: historyList.length || undefined },
                        { id: 'gmd', label: 'GMD' },
                      ]}
                      value={detailTab}
                      onChange={(id) => setDetailTab(id as 'geral' | 'historico' | 'gmd')}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {detailTab === 'geral' && (
                      <button
                        type="button"
                        onClick={salvarDetalhe}
                        disabled={saving || !editNome.trim() || !editCodigoCurto.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#e7f6ec] px-3 py-1.5 text-xs font-semibold text-[#15803d] hover:bg-[#d1f0db] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        Salvar alterações
                      </button>
                    )}
                  </div>
                </div>

                {detailTab === 'geral' && (
                  <div className="flex flex-col gap-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Nome</label>
                        <input
                          type="text"
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Código curto</label>
                        <input
                          type="text"
                          value={editCodigoCurto}
                          onChange={(e) => setEditCodigoCurto(e.target.value)}
                          className={inputCls}
                          maxLength={10}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Tipo</label>
                        <select
                          value={editTipo}
                          onChange={(e) => setEditTipo(e.target.value)}
                          className={selectCls}
                        >
                          {FIXED_TYPES.map((t) => (
                            <option key={t.tipo} value={t.tipo}>
                              {t.tipo}
                            </option>
                          ))}
                        </select>
                        {editTypeDetail && (
                          <p className="mt-1 text-[11px] text-[#16a34a] bg-[#e7f6ec] px-2 py-1 rounded">
                            {editTypeDetail}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-gray-700">Nível de Ingestão</label>
                        <div className="grid grid-cols-2 gap-3 bg-gray-50/50 p-3.5 rounded-xl border border-gray-150">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-gray-500">Unidade de Ingestão</label>
                            <select
                              value={editNivelIngestaoTipo}
                              onChange={(e) => setEditNivelIngestaoTipo(e.target.value)}
                              className={selectCls}
                            >
                              <option value="% do PV">% do PV</option>
                              <option value="Gramas/cab/dia">Gramas/cab/dia</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-gray-500">Valor de Ingestão</label>
                            <input
                              type="number"
                              step="any"
                              value={editNivelIngestaoValor}
                              onChange={(e) => setEditNivelIngestaoValor(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Composição de Produtos para Edição */}
                    <div className="bg-gray-50/50 p-4.5 rounded-xl border border-gray-150 flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-gray-150 pb-2">
                        <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Produtos, Suplementos e formulados
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-3">
                          <label className="mb-1 block text-[11px] font-semibold text-gray-600">Origem</label>
                          <select
                            value={editOrigemProduto}
                            onChange={(e) => setEditOrigemProduto(e.target.value as 'estoque' | 'manual')}
                            className={selectCls}
                          >
                            <option value="estoque">Estoque (Simulado)</option>
                            <option value="manual">Manual (Digitação)</option>
                          </select>
                        </div>

                        {editOrigemProduto === 'estoque' ? (
                          <div className="md:col-span-7">
                            <label className="mb-1 block text-[11px] font-semibold text-gray-600">Selecionar do Estoque</label>
                            <select
                              value={editSelectedStockProductIdx}
                              onChange={(e) => setEditSelectedStockProductIdx(Number(e.target.value))}
                              className={selectCls}
                            >
                              {SIMULATED_STOCK_PRODUCTS.map((prod, idx) => (
                                <option key={idx} value={idx}>
                                  {prod.nome} (Estoque: {prod.estoqueQtd} kg — R$ {prod.custoQuilo.toFixed(2)}/kg)
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <>
                            <div className="md:col-span-4">
                              <label className="mb-1 block text-[11px] font-semibold text-gray-600">Nome do Produto</label>
                              <input
                                type="text"
                                value={editManualProductName}
                                onChange={(e) => setEditManualProductName(e.target.value)}
                                placeholder="Ex: Farelo de Soja"
                                className={inputCls}
                              />
                            </div>
                            <div className="md:col-span-3">
                              <label className="mb-1 block text-[11px] font-semibold text-gray-600">Custo (/kg)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={editManualProductCost}
                                onChange={(e) => setEditManualProductCost(e.target.value)}
                                placeholder="R$ 0,00"
                                className={inputCls}
                              />
                            </div>
                          </>
                        )}

                        <div className="md:col-span-2">
                          <button
                            type="button"
                            onClick={() => handleAddProduct('edit')}
                            className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#E7F6EC] px-3 font-bold text-[#15803d] hover:bg-[#d1f0db] active:scale-[0.98] transition-all"
                          >
                            <Plus size={15} />
                            Adicionar
                          </button>
                        </div>
                      </div>

                      {editProdutosList.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-gray-150 bg-white">
                          <table className="w-full border-collapse text-left text-xs text-gray-600">
                            <thead>
                              <tr className="border-b border-gray-150 bg-gray-50 text-gray-700 font-semibold">
                                <th className="p-2 w-16 text-center">Ordem</th>
                                <th className="p-2">Nome do Produto</th>
                                <th className="p-2 w-24 text-center">Origem</th>
                                <th className="p-2 w-32 text-right">Qtd Estoque</th>
                                <th className="p-2 w-28 text-right">Custo/kg</th>
                                <th className="p-2 w-12 text-center"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {editProdutosList.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/30">
                                  <td className="p-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleMoveProduct(idx, 'up', 'edit')}
                                        disabled={idx === 0}
                                        className="text-gray-400 hover:text-[#16A34A] disabled:opacity-30 p-0.5 rounded transition-colors"
                                        title="Mover para cima"
                                      >
                                        <ArrowUp size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveProduct(idx, 'down', 'edit')}
                                        disabled={idx === editProdutosList.length - 1}
                                        className="text-gray-400 hover:text-[#16A34A] disabled:opacity-30 p-0.5 rounded transition-colors"
                                        title="Mover para baixo"
                                      >
                                        <ArrowDown size={13} />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="p-2 font-medium text-gray-800">{item.nome}</td>
                                  <td className="p-2 text-center">
                                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${item.origem === 'estoque' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                      {item.origem}
                                    </span>
                                  </td>
                                  <td className="p-2 text-right text-gray-500">
                                    {item.estoqueQtd !== null ? `${item.estoqueQtd.toLocaleString('pt-BR')} kg` : '—'}
                                  </td>
                                  <td className="p-2 text-right font-bold text-gray-800">
                                    R$ {item.custoQuilo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveProduct(idx, 'edit')}
                                      className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                                      title="Remover produto"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Anexo padrão</label>
                        <div className="flex items-center gap-2">
                          <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-100 w-full transition-colors opacity-60 pointer-events-none">
                            <Upload size={16} className="text-gray-400" />
                            Herdado do histórico
                          </label>
                          {editAnexoUrl && (
                            <a
                              href={editAnexoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0"
                              title={editAnexoNome || 'Ver anexo'}
                            >
                              <Eye size={16} />
                            </a>
                          )}
                        </div>
                        {editAnexoNome && (
                          <p className="mt-1 text-[11px] text-gray-500 truncate" title={editAnexoNome}>
                            Anexo atual: {editAnexoNome}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'historico' && (
                  <div className="flex flex-col gap-5">
                    {/* Novo Reajuste / Formulação */}
                    <form onSubmit={handleAddHistory} className="bg-white p-5 rounded-xl border border-gray-150 shadow-sm flex flex-col gap-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Novo Reajuste / Formulação</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Data de Vigência</label>
                          <input
                            type="date"
                            value={histDataVigencia}
                            onChange={(e) => setHistDataVigencia(e.target.value)}
                            className={inputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Custo do suplemento (/kg)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={histCustoQuilo}
                            onChange={(e) => setHistCustoQuilo(e.target.value)}
                            placeholder="Ex: 3.80"
                            className={inputCls}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Formulação (Composição / Ingredientes)</label>
                        <textarea
                          rows={3}
                          value={histFormulacao}
                          onChange={(e) => setHistFormulacao(e.target.value)}
                          placeholder="Descreva a fórmula (ex: Milho 60%, Farelo Soja 30%, Núcleo 10%)"
                          className={`${inputCls} py-2 resize-y`}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Anexo da Ficha Técnica / Análise</label>
                        <div className="flex items-center gap-2">
                          <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-100 w-full transition-colors">
                            {uploading ? (
                              <Loader2 size={16} className="animate-spin text-gray-400" />
                            ) : (
                              <Upload size={16} className="text-gray-400" />
                            )}
                            {histAnexoUrl ? 'Substituir arquivo' : 'Selecionar arquivo (imagem/pdf...)'}
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, 'history')}
                              disabled={uploading}
                            />
                          </label>
                          {histAnexoUrl && (
                            <a
                              href={histAnexoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0"
                              title={histAnexoNome || 'Ver anexo'}
                            >
                              <Eye size={16} />
                            </a>
                          )}
                        </div>
                        {histAnexoNome && (
                          <p className="mt-1 text-[11px] text-gray-500 truncate" title={histAnexoNome}>
                            Anexado: {histAnexoNome}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={savingHistory || uploading || !histDataVigencia || !histCustoQuilo}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#e7f6ec] px-4 py-2 text-xs font-bold text-[#15803d] hover:bg-[#d1f0db] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {savingHistory ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                          Adicionar ao Histórico
                        </button>
                      </div>
                    </form>

                    {/* Lista do histórico */}
                    <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-sm flex flex-col gap-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Linha do Tempo de Preços e Formulações</h4>
                      {loadingHistory ? (
                        <div className="flex justify-center py-6 text-gray-400">
                          <Loader2 size={24} className="animate-spin" />
                        </div>
                      ) : historyList.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-6">Nenhum reajuste ou formulação cadastrada.</p>
                      ) : (
                        <div className="relative border-l border-gray-100 ml-3 pl-6 flex flex-col gap-6 my-2">
                          {historyList.map((item) => {
                            const dateParts = item.dataVigencia.split('-');
                            const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : item.dataVigencia;
                            return (
                              <div key={item.id} className="relative">
                                {/* Dot on timeline */}
                                <span className="absolute -left-[32px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white border border-[#16A34A] text-[9px] font-bold text-[#16A34A]">
                                  $
                                </span>
                                
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-gray-800">{formattedDate}</span>
                                      <span className="rounded-full bg-[#E7F6EC] px-2 py-0.5 text-[11px] font-bold text-[#16A34A]">
                                        R$ {parseFloat(item.custoQuilo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /kg
                                      </span>
                                    </div>
                                    {item.formulacao && (
                                      <p className="mt-1.5 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{item.formulacao}</p>
                                    )}
                                    {item.anexoUrl && (
                                      <div className="mt-2 flex items-center gap-1.5">
                                        <a
                                          href={item.anexoUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16A34A] hover:underline"
                                        >
                                          <Eye size={12} />
                                          {item.anexoNome || 'Ver anexo'}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteHistory(item.id)}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors shrink-0"
                                    title="Excluir lançamento"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {detailTab === 'gmd' && (
                  <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-sm flex flex-col gap-4 overflow-x-auto animate-in fade-in duration-350">
                    <div className="flex items-center justify-between border-b border-gray-150 pb-3 flex-wrap gap-2">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                        Planejamento de GMD por Categoria e Fase do Ano
                      </h4>
                      <span className="text-[10px] text-gray-400 font-medium">
                        * Clique no valor ou no + para editar. Pressione Enter para salvar.
                      </span>
                    </div>

                    {loadingGmd ? (
                      <div className="flex justify-center py-8 text-gray-400">
                        <Loader2 size={24} className="animate-spin" />
                      </div>
                    ) : categories.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">
                        Nenhuma categoria de animal ativa cadastrada no sistema.
                      </p>
                    ) : (
                      <table className="w-full border-collapse text-left text-xs text-gray-600">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-700 bg-gray-50/50">
                            <th className="p-3 font-semibold text-gray-600">Categoria</th>
                            <th className="p-3 font-semibold w-40 text-center text-gray-600">Águas</th>
                            <th className="p-3 font-semibold w-40 text-center text-gray-600">Transição Águas/Secas</th>
                            <th className="p-3 font-semibold w-40 text-center text-gray-600">Secas</th>
                            <th className="p-3 font-semibold w-40 text-center text-gray-600">Transição Secas/Águas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.map((cat) => (
                            <tr key={cat.id} className="border-b border-gray-100 hover:bg-gray-50/40">
                              <td className="p-3 font-semibold text-gray-800">
                                <div>{cat.nome}</div>
                                {cat.complemento && (
                                  <div className="text-[10px] font-normal text-gray-400">{cat.complemento}</div>
                                )}
                              </td>
                              {['aguas', 'transicao_aguas_secas', 'secas', 'transicao_secas_aguas'].map((season) => {
                                const config = gmdConfigs.find(
                                  (cfg) => cfg.categoriaId === cat.id && cfg.estacao === season
                                );
                                const isEditing =
                                  editingGmdCell?.categoryId === cat.id &&
                                  editingGmdCell?.estacao === season;

                                return (
                                  <td key={season} className="p-2 text-center h-12 relative w-40">
                                    {isEditing ? (
                                      <input
                                        type="number"
                                        step="0.001"
                                        value={gmdInputValue}
                                        onChange={(e) => setGmdInputValue(e.target.value)}
                                        onBlur={() => {
                                          handleSaveGmdValue(cat.id, season, gmdInputValue);
                                          setEditingGmdCell(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveGmdValue(cat.id, season, gmdInputValue);
                                            setEditingGmdCell(null);
                                          } else if (e.key === 'Escape') {
                                            setEditingGmdCell(null);
                                          }
                                        }}
                                        className="w-24 px-2 py-1 border border-[#16A34A] rounded text-center focus:outline-none focus:ring-1 focus:ring-[#16A34A] text-xs font-bold text-gray-800"
                                        autoFocus
                                        placeholder="0.000"
                                      />
                                    ) : (
                                      <div className="flex items-center justify-center gap-1.5 group">
                                        {config ? (
                                          <>
                                            <span
                                              onClick={() => {
                                                setEditingGmdCell({ categoryId: cat.id, estacao: season });
                                                setGmdInputValue(config.gmd);
                                              }}
                                              className="cursor-pointer font-bold text-gray-700 hover:text-[#15803d] hover:bg-[#e7f6ec] px-2 py-0.5 rounded transition-all text-xs"
                                              title="Clique para editar"
                                            >
                                              {parseFloat(config.gmd).toLocaleString('pt-BR', {
                                                minimumFractionDigits: 3,
                                                maximumFractionDigits: 3,
                                              })} kg/dia
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteGmdValue(config.id)}
                                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5 rounded"
                                              title="Remover GMD"
                                            >
                                              <Trash2 size={11} />
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingGmdCell({ categoryId: cat.id, estacao: season });
                                              setGmdInputValue('');
                                            }}
                                            className="h-6 w-6 flex items-center justify-center rounded-full border border-dashed border-gray-300 hover:border-[#16A34A] hover:bg-[#e7f6ec] text-gray-400 hover:text-[#16a34a] transition-all"
                                            title="Adicionar GMD"
                                          >
                                            <Plus size={12} />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Selecione um regime alimentar na lista superior para ver e editar seus detalhes.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Menu de ações flutuante (•••) */}
      {menu && menuTipo && (
        <>
          <div className="fixed inset-0 z-30" onClick={closeMenu} />
          <div
            className="fixed z-40 min-w-[150px] overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
            style={{ left: `${menu.x - 150}px`, top: `${menu.y}px` }}
          >
            <MenuItem
              icon={menuTipo.ativo ? <Ban size={14} /> : <CheckCircle2 size={14} />}
              label={menuTipo.ativo ? 'Inativar' : 'Ativar'}
              onClick={() => {
                closeMenu();
                toggleAtivo(menuTipo);
              }}
            />
            <MenuItem
              icon={<Trash2 size={14} />}
              label="Excluir"
              danger
              onClick={() => {
                closeMenu();
                setDeleteConfirmId(menuTipo.id);
              }}
            />
          </div>
        </>
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Registro?</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-6">
              Esta ação removerá definitivamente o regime alimentar do sistema. Tem certeza que deseja continuar?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white active:scale-95 transition-all shadow-md shadow-red-600/10"
              >
                Confirmar e Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegimesAlimentaresManagement;
