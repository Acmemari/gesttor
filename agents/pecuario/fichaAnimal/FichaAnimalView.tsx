import React, { useEffect, useMemo, useState } from 'react';
import { Plus, List, ArrowLeft, BadgePlus, Search, Sprout } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import { listAnimalCategories } from '../../../lib/api/animalCategoriesClient';
import { listAnimalBreeds } from '../../../lib/api/animalBreedsClient';
import { listMovimentos, type NascimentoMovimentoRow } from '../../../lib/api/nascimentosClient';
import {
  listFichasAnimal,
  createFichaAnimal,
  updateFichaAnimal,
  fichaToFormValues,
} from '../../../lib/api/fichasAnimalClient';
import { LOTES_ESTATICOS } from '../nascimento/fieldRegistry';
import { sexoFromCategoria } from '../nascimento/util';
import type { LookupItem } from '../nascimento/types';
import FichaAnimalForm from './FichaAnimalForm';
import AnimalStatusBadge from './AnimalStatusBadge';

/** Chaves reservadas (metadados) das fichas derivadas — não são campos do formulário. */
const FICHA_SRC_KEY = '__src';
const FICHA_ID_KEY = '__id';

/**
 * Converte um nascimento persistido em fichas individuais — uma por bezerro
 * identificado. Os dados de nascimento (data, peso, fazenda) já vêm preenchidos,
 * para aparecerem na aba "Origem" da ficha sem nenhum passo extra.
 */
function fichasFromNascimento(
  movimentos: NascimentoMovimentoRow[],
  categories: LookupItem[],
  farmName: (id: string | null) => string,
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of movimentos) {
    for (const f of m.fichas) {
      const peso = f.peso != null ? String(f.peso) : '';
      out.push({
        [FICHA_SRC_KEY]: 'nascimento',
        [FICHA_ID_KEY]: f.id,
        apelido: f.apelido,
        categoria: f.categoriaId || '',
        sexo: sexoFromCategoria(categories, f.categoriaId || '') || '',
        rfid: f.rfid || '',
        sisbov: f.sisbov || '',
        porte: f.porte || '',
        raca: f.raca || '',
        peso,
        situacao: 'ativo',
        // Origem · Dados de nascimento (mesmos ids da aba "Origem")
        data: m.data,
        pesoNascer: peso,
        fazendaNascimento: farmName(m.farmId),
      });
    }
  }
  return out;
}

interface FichaAnimalViewProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  /** Volta para a grade de Cadastros do Pecuário. */
  onBack?: () => void;
}

/**
 * Pecuário · Cadastros › Ficha Animal.
 * Mesma estrutura da tela de Nascimento: abas "Lançar" (formulário da ficha) e
 * "Registros" (relação das fichas), com o seletor em pílula verde no topo.
 */
const FichaAnimalView: React.FC<FichaAnimalViewProps> = ({ onToast, onBack }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [racas, setRacas] = useState<string[]>([]);
  const lotes: LookupItem[] = LOTES_ESTATICOS;

  // Aba ativa: formulário (Lançar) vs. relação de fichas (Registros).
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');
  // Fichas persistidas no banco (convertidas para o Record<string,string> do form).
  const [fichas, setFichas] = useState<Record<string, string>[]>([]);
  // Chave de recarga: incrementa após salvar para repuxar as fichas do banco.
  const [refreshKey, setRefreshKey] = useState(0);
  // Nascimentos salvos — origem das fichas geradas automaticamente.
  const [movimentos, setMovimentos] = useState<NascimentoMovimentoRow[]>([]);
  // Ficha aberta para visualização/edição (Registros → clique). Null = lista.
  const [viewing, setViewing] = useState<Record<string, string> | null>(null);
  const [busca, setBusca] = useState('');

  const farmName = useMemo(() => {
    const byId = new Map(farms.map((f) => [f.id, f.name]));
    return (id: string | null) => (id ? byId.get(id) || '' : '');
  }, [farms]);

  const optionsOverride = useMemo(
    () => (racas.length > 0 ? { raca: racas } : undefined),
    [racas],
  );

  // Carrega categorias e raças cadastradas (mesmas fontes da tela de Nascimento).
  useEffect(() => {
    if (!organizationId) {
      setCategories([]);
      setRacas([]);
      return;
    }
    let cancelled = false;
    listAnimalCategories(organizationId)
      .then((rows) => {
        if (!cancelled) setCategories(rows.map((c) => ({ id: c.id, nome: c.nome, sexo: c.sexo })));
      })
      .catch((err) => onToast?.((err as Error)?.message || 'Erro ao carregar categorias', 'error'));
    listAnimalBreeds(organizationId)
      .then((rows) => {
        if (!cancelled) setRacas(rows.filter((b) => b.ativo).map((b) => b.nome));
      })
      .catch(() => {
        if (!cancelled) setRacas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

  // Carrega os nascimentos salvos (Neon) para gerar as fichas automaticamente.
  useEffect(() => {
    if (!organizationId) {
      setMovimentos([]);
      return;
    }
    let cancelled = false;
    listMovimentos(organizationId)
      .then((rows) => {
        if (!cancelled) setMovimentos(rows);
      })
      .catch((err) => {
        if (!cancelled) onToast?.((err as Error)?.message || 'Erro ao carregar nascimentos', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

  // Carrega as fichas animais persistidas (Neon). Recarrega ao salvar (refreshKey).
  useEffect(() => {
    if (!organizationId) {
      setFichas([]);
      return;
    }
    let cancelled = false;
    listFichasAnimal(organizationId)
      .then((rows) => {
        if (!cancelled) setFichas(rows.map(fichaToFormValues));
      })
      .catch((err) => {
        if (!cancelled) onToast?.((err as Error)?.message || 'Erro ao carregar fichas', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast, refreshKey]);

  const catName = (id: string) => categories.find((c) => c.id === id)?.nome || '—';

  // Fichas geradas a partir dos nascimentos salvos, com os dados de nascimento já preenchidos.
  const nascFichas = useMemo(
    () => fichasFromNascimento(movimentos, categories, farmName),
    [movimentos, categories, farmName],
  );

  // Relação completa: fichas do banco + fichas de nascimento ainda não persistidas
  // (dedup por ID Manejo — a ficha persistida tem prioridade sobre a derivada).
  const todasFichas = useMemo(() => {
    const dbApelidos = new Set(
      fichas.map((f) => (f.apelido || '').trim().toLowerCase()).filter(Boolean),
    );
    const nascOnly = nascFichas.filter(
      (f) => !dbApelidos.has((f.apelido || '').trim().toLowerCase()),
    );
    return [...fichas, ...nascOnly];
  }, [nascFichas, fichas]);

  const fichasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return todasFichas;
    const nameOf = (id: string) => categories.find((c) => c.id === id)?.nome || '';
    return todasFichas.filter((f) =>
      [f.apelido, f.nome, f.rfid, f.sisbov, nameOf(f.categoria), f.raca]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [todasFichas, busca, categories]);

  // Persiste a ficha no banco. Ficha já persistida (__src 'db') → atualiza pelo id;
  // ficha derivada de nascimento (__src 'nascimento') → cria, preservando o vínculo;
  // ficha nova → cria. Recarrega a lista ao concluir.
  const addFicha = async (values: Record<string, string>): Promise<boolean> => {
    if (!organizationId) {
      onToast?.('Selecione uma organização antes de salvar', 'error');
      return false;
    }
    try {
      const isUpdate = values.__src === 'db' && values.__id;
      if (isUpdate) {
        await updateFichaAnimal(values.__id, values);
      } else if (values.__src === 'nascimento' && values.__id) {
        await createFichaAnimal(organizationId, values, { nascimentoFichaId: values.__id });
      } else {
        await createFichaAnimal(organizationId, values);
      }
      const apelido = (values.apelido || '').trim();
      onToast?.(
        isUpdate ? `Ficha atualizada · ${apelido}` : `Ficha animal criada · ${apelido}`,
        'success',
      );
      setViewing(null);
      setAba('registros');
      setRefreshKey((k) => k + 1);
      return true;
    } catch (err) {
      onToast?.((err as Error)?.message || 'Erro ao salvar ficha', 'error');
      return false;
    }
  };

  return (
    <div className="min-h-full bg-[#f9fafb] p-6 md:p-8">
      {/* Cabeçalho */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-gray-900">Ficha Animal</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Cadastro individual de animais do rebanho — identificação, genealogia e desempenho.
          </p>
        </div>
      </div>

      {/* Abas: Lançar (formulário) vs. Registros (relação de fichas) */}
      <div className="mb-5 inline-flex rounded-xl border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setAba('lancar')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            aba === 'lancar' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Plus size={16} /> Lançar
        </button>
        <button
          type="button"
          onClick={() => setAba('registros')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            aba === 'registros' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <List size={16} /> Registros
          {todasFichas.length ? (
            <span
              className={`ml-0.5 rounded-full px-1.5 text-[11px] font-bold ${
                aba === 'registros' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {todasFichas.length}
            </span>
          ) : null}
        </button>
      </div>

      {viewing ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setViewing(null)}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft size={16} /> Voltar aos registros
          </button>
          <FichaAnimalForm
            key={viewing[FICHA_ID_KEY] || viewing.apelido}
            initialValues={viewing}
            onSave={addFicha}
            categories={categories}
            lotes={lotes}
            optionsOverride={optionsOverride}
            onToast={onToast}
          />
        </div>
      ) : aba === 'lancar' ? (
        <FichaAnimalForm
          onSave={addFicha}
          categories={categories}
          lotes={lotes}
          optionsOverride={optionsOverride}
          onToast={onToast}
        />
      ) : (
        <>
          {/* Busca */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por ID, nome, brinco, SISBOV, raça..."
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 focus:border-[#16a34a] focus:outline-none focus:ring-[3px] focus:ring-[#16a34a]/15"
              />
            </div>
          </div>

          {/* Lista de fichas */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {fichasFiltradas.length ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#fcfcfd] text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="border-b border-gray-200 px-4 py-3">ID Manejo</th>
                    <th className="border-b border-gray-200 px-4 py-3">Nome</th>
                    <th className="border-b border-gray-200 px-4 py-3">Categoria</th>
                    <th className="border-b border-gray-200 px-4 py-3">Raça</th>
                    <th className="border-b border-gray-200 px-4 py-3">Sexo</th>
                    <th className="border-b border-gray-200 px-4 py-3">Nascimento</th>
                    <th className="border-b border-gray-200 px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fichasFiltradas.map((f, i) => (
                    <tr
                      key={`${f[FICHA_ID_KEY] || f.apelido}-${i}`}
                      onClick={() => setViewing(f)}
                      className="cursor-pointer hover:bg-[#fafbfc]"
                      title="Abrir ficha do animal"
                    >
                      <td className="border-b border-[#f1f2f4] px-4 py-3 font-semibold text-gray-800">
                        <span className="inline-flex items-center gap-2">
                          {f.apelido || '—'}
                          {f[FICHA_SRC_KEY] === 'nascimento' ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ec] px-1.5 py-0.5 text-[10px] font-semibold text-[#16a34a]"
                              title="Ficha gerada a partir de um nascimento"
                            >
                              <Sprout size={11} /> Nascimento
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-600">{f.nome || '—'}</td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-600">{catName(f.categoria)}</td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-600">{f.raca || '—'}</td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-600">{f.sexo || '—'}</td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-600">{f.data || '—'}</td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3">
                        <AnimalStatusBadge situacao={f.situacao} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f6ec] text-[#16a34a]">
                  <BadgePlus size={26} />
                </div>
                <h4 className="text-sm font-bold text-gray-700">
                  {busca ? 'Nenhuma ficha encontrada' : 'Nenhuma ficha cadastrada ainda'}
                </h4>
                <p className="max-w-sm text-[12.5px] leading-relaxed text-gray-400">
                  {busca
                    ? 'Ajuste a busca ou cadastre uma nova ficha na aba “Lançar”.'
                    : 'Vá até a aba “Lançar” para cadastrar o primeiro animal do rebanho.'}
                </p>
                {!busca ? (
                  <button
                    type="button"
                    onClick={() => setAba('lancar')}
                    className="mt-1 inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
                  >
                    <Plus size={16} /> Lançar ficha
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FichaAnimalView;
