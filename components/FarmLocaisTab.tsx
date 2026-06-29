import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronRight,
  Upload,
  AlertTriangle,
  Link2,
  Sparkles,
} from 'lucide-react';
import { useHierarchy } from '../contexts/HierarchyContext';
import { getAuthHeaders } from '../lib/session';
import CadastroAreasView from '../agents/pecuario/areas/CadastroAreasView';
import { fazRootId, updateAreaGeometry } from '../agents/pecuario/areas/areasClient';
import { parseKmlPolygons, KmlError } from '../agents/pecuario/areas/kml';
import { importarKmlGoogleEarth } from '../agents/pecuario/areas/kmlImport';
import { centroid, pointInPoly, cleanRing } from '../agents/pecuario/areas/util';

type ToastFn = (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;

/* ===== Hierarquia da fazenda: Fazenda › Retiro › Setor › Local =====
 * A 1ª coluna lista as FAZENDAS do contexto; clicar numa delas faz o drill para
 * Retiro › Setor › Local daquela fazenda. Os níveis intermediários/folha são
 * opcionais e ativados por fazenda (toggles). Só a Fazenda é obrigatória (raiz).
 * Um Local ancora no nível ATIVO mais profundo acima dele (setor ?? retiro ?? fazenda).
 * Layout do painel: Fazenda/Retiro/Setor ficam em 3 colunas estreitas no topo
 * (~40% da altura) e os Locais ocupam uma caixa larga em grade logo abaixo
 * (~60%); o mapa (mesma hierarquia, com geometria) fica grande à direita. Cada
 * card importa seu próprio KMZ/KML.
 */

interface Retiro {
  id: string;
  farmId: string;
  name: string;
  totalArea: string | null;
  isDefault: boolean;
  dataInicial?: string | null;
  geometry?: unknown;
}
interface Setor {
  id: string;
  farmId: string;
  retiroId: string | null;
  name: string;
  area: string | null;
  isDefault?: boolean;
  dataInicial?: string | null;
  geometry?: unknown;
}
interface Local {
  id: string;
  farmId: string;
  retiroId: string | null;
  setorId: string | null;
  name: string;
  area: string | null;
  isDefault?: boolean;
  dataInicial?: string | null;
  geometry?: unknown;
}
interface Levels {
  retiro: boolean;
  setor: boolean;
  local: boolean;
  /** O usuário já escolheu a combinação de níveis desta fazenda? (gate do mapa) */
  configured?: boolean;
  /** Controla os locais com mapa (colunas + mapa) ou sem mapa (só colunas)? */
  usarMapa?: boolean;
}

/** Atalho de re-vínculo sugerido pela posição no mapa (ponto-em-polígono). */
interface OrphanSuggestion {
  name: string;
  apply: () => void;
}
/** Item exibido na faixa "Sem vínculo" de uma coluna (órfão pós-ativação de nível). */
interface OrphanRow {
  id: string;
  name: string;
  area: string | null;
  /** vincula ao nó selecionado à esquerda (destino padrão); undefined ⇒ sem destino. */
  onAttach?: () => void;
  /** vincula ao pai sugerido pela geometria, quando difere do selecionado. */
  suggestion?: OrphanSuggestion;
}

type LevelKey = 'retiro' | 'setor' | 'local';
type ColKey = 'fazenda' | LevelKey;

interface FarmLocaisTabProps {
  farmId: string;
  farmName: string;
  pastureArea?: number | null;
  readOnly?: boolean;
  onToast?: ToastFn;
}

const API_BASE = '/api/farm-locations';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  // Auth por Bearer token (sessionStorage) — o app não usa cookie de sessão.
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { ...authHeaders, ...(init?.headers as Record<string, string> | undefined) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

function postJson<T>(body: unknown): Promise<T> {
  return fetchJson<T>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function patchJson<T>(body: unknown): Promise<T> {
  return fetchJson<T>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface LevelStyle {
  label: string;
  plural: string;
  dot: string;
  text: string;
  selRow: string;
  accent: string;
  addBox: string;
}

const FAZENDA_STYLE: LevelStyle = {
  label: 'Fazenda', plural: 'Fazendas',
  dot: 'bg-slate-600', text: 'text-slate-700',
  selRow: 'border-slate-400 bg-slate-50', accent: 'text-slate-700',
  addBox: 'border-slate-300 bg-slate-50',
};

const LEVELS: { key: LevelKey; s: LevelStyle }[] = [
  {
    key: 'retiro',
    s: {
      label: 'Retiro', plural: 'Retiros',
      dot: 'bg-emerald-500', text: 'text-emerald-600',
      selRow: 'border-emerald-400 bg-emerald-50', accent: 'text-emerald-600',
      addBox: 'border-emerald-300 bg-emerald-50',
    },
  },
  {
    key: 'setor',
    s: {
      label: 'Setor', plural: 'Setores',
      dot: 'bg-amber-500', text: 'text-amber-600',
      selRow: 'border-amber-400 bg-amber-50', accent: 'text-amber-600',
      addBox: 'border-amber-300 bg-amber-50',
    },
  },
  {
    key: 'local',
    s: {
      label: 'Local', plural: 'Locais',
      dot: 'bg-blue-500', text: 'text-blue-600',
      selRow: 'border-blue-400 bg-blue-50', accent: 'text-blue-600',
      addBox: 'border-blue-300 bg-blue-50',
    },
  },
];

function fmtArea(area: string | null): string | null {
  if (!area) return null;
  const n = parseFloat(String(area).replace(',', '.'));
  if (isNaN(n)) return null;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`;
}

/** "Hoje" em ISO 'YYYY-MM-DD' por hora local (evita o off-by-one de toISOString). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sugere o pai de um órfão pela posição no mapa: o 1º candidato cujo polígono
 *  contém o centroide do polígono do órfão (ponto-em-polígono). null se o órfão
 *  não tem geometria válida ou não cai em nenhum candidato. Atalho opcional. */
function suggestContainer<T extends { id: string; name: string; geometry?: unknown }>(
  geom: unknown,
  candidates: T[],
): T | null {
  const ring = cleanRing(geom);
  if (ring.length < 3) return null;
  const ct = centroid(ring);
  for (const c of candidates) {
    const cr = cleanRing(c.geometry);
    if (cr.length >= 3 && pointInPoly(ct, cr)) return c;
  }
  return null;
}

const FarmLocaisTab: React.FC<FarmLocaisTabProps> = ({ farmId, farmName, readOnly, onToast }) => {
  const { farms, loading: hierarchyLoading } = useHierarchy();

  // Fazenda selecionada na 1ª coluna (default = fazenda em edição).
  const [selFarmId, setSelFarmId] = useState<string>(farmId);
  useEffect(() => setSelFarmId(farmId), [farmId]);

  const [levels, setLevels] = useState<Levels>({ retiro: true, setor: false, local: true });
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  // Registro automático (is_default) de cada nível: aparece, somente leitura, na
  // coluna do nível quando ele está DESATIVADO — nomeado com o nível anterior.
  const [defaultRetiro, setDefaultRetiro] = useState<Retiro | null>(null);
  const [defaultSetor, setDefaultSetor] = useState<Setor | null>(null);
  const [defaultLocal, setDefaultLocal] = useState<Local | null>(null);

  const [selRetiro, setSelRetiro] = useState<string | null>(null);
  const [selSetor, setSelSetor] = useState<string | null>(null);

  // Seleção compartilhada com o mapa (id de área: retiro/setor/local ou faz:<id>).
  const [selId, setSelId] = useState<string | null>(null);
  // Sincronização lista ↔ mapa: o mapa recarrega quando a lista muda (mapReloadToken);
  // a lista recarrega quando o mapa muda (listReloadVersion).
  const [mapReloadToken, setMapReloadToken] = useState(0);
  const [listReloadVersion, setListReloadVersion] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingKey, setTogglingKey] = useState<LevelKey | null>(null);
  // Primeira carga desta fazenda: só nela mostramos o spinner de tela cheia; nos
  // reloads (toggle de nível, mutação do mapa) mantemos as colunas/mapa montados.
  const didFirstLoad = useRef(false);

  const [adding, setAdding] = useState<{ key: LevelKey; name: string; area: string } | null>(null);
  // Card clicado → abre a "tela" (modal) com os dados do item para preenchimento.
  // A Fazenda também abre, porém somente leitura. A navegação/drill saiu do corpo
  // do card e passou para a setinha (chevron).
  const [modal, setModal] = useState<{ key: ColKey; id: string } | null>(null);

  // Painel das colunas recolhível → o mapa ocupa toda a largura quando recolhido.

  // Modo mapa: a tela INICIAL é a de "Cadastro de Áreas" (tela mestra sobre o
  // mapa); a aba "Colunas" no rodapé volta às colunas das áreas cadastradas.
  // Em readOnly começa nas colunas (não força a tela de edição).
  const [mapaView, setMapaView] = useState<'cadastro' | 'colunas' | 'uso'>(readOnly ? 'colunas' : 'cadastro');

  // Data inicial única da tela: carimbada em todo registro criado/editado aqui.
  // Data dos registros criados nas colunas; a do mapa é perguntada ao Salvar.
  const [dataInicial] = useState<string>(todayIso());

  // Troca de fazenda → próxima carga é "primeira" de novo (mostra o spinner).
  useEffect(() => {
    didFirstLoad.current = false;
  }, [selFarmId]);

  // ── Carrega o bundle da fazenda selecionada ─────────────────────────────────
  useEffect(() => {
    if (!selFarmId) return;
    let cancelled = false;
    setLoading(true);
    setAdding(null);
    setModal(null);
    fetchJson<{ retiros: Retiro[]; setores: Setor[]; locais: Local[]; levels: Levels }>(
      `${API_BASE}?bundle=${selFarmId}`,
    )
      .then((b) => {
        if (cancelled) return;
        // Registros padrão (is_default) são as âncoras do back-end. Os níveis
        // ATIVOS listam só os do usuário (sem default); os níveis DESATIVADOS
        // exibem o respectivo default (somente leitura) na sua coluna.
        const userRetiros = b.retiros.filter((r) => !r.isDefault);
        setRetiros(userRetiros);
        setSetores(b.setores.filter((s) => !s.isDefault));
        setLocais(b.locais.filter((l) => !l.isDefault));
        setDefaultRetiro(b.retiros.find((r) => r.isDefault) ?? null);
        setDefaultSetor(b.setores.find((s) => s.isDefault) ?? null);
        setDefaultLocal(b.locais.find((l) => l.isDefault) ?? null);
        setLevels(b.levels);
        // Preserva a seleção atual num reload (toggle de nível, mutação do mapa);
        // só reseta quando o item sumiu (ex.: troca de fazenda).
        setSelRetiro((prev) => (userRetiros.some((r) => r.id === prev) ? prev : (userRetiros[0]?.id ?? null)));
        setSelSetor((prev) => (b.setores.some((s) => !s.isDefault && s.id === prev) ? prev : null));
      })
      .catch((err) => console.error('Erro ao carregar locais:', err))
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        didFirstLoad.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [selFarmId, listReloadVersion]);

  // ── Seleção efetiva (derivada) ──────────────────────────────────────────────
  const effRetiro = retiros.some((r) => r.id === selRetiro) ? selRetiro : (retiros[0]?.id ?? null);
  const setoresVisible = useMemo(
    () => (levels.retiro ? setores.filter((s) => s.retiroId === effRetiro) : setores),
    [levels.retiro, setores, effRetiro],
  );
  const effSetor = setoresVisible.some((s) => s.id === selSetor) ? selSetor : (setoresVisible[0]?.id ?? null);
  const locaisVisible = useMemo(() => {
    if (levels.setor) return locais.filter((l) => l.setorId === effSetor);
    if (levels.retiro) return locais.filter((l) => l.retiroId === effRetiro);
    return locais;
  }, [levels.setor, levels.retiro, locais, effSetor, effRetiro]);

  // ── Órfãos: registros sem vínculo no nível ativo mais profundo acima deles ────
  // Quando o usuário ATIVA um nível depois de já ter cadastrado locais/setores, os
  // registros antigos ficam com o FK daquele nível = null e SUMIRIAM da coluna
  // (locaisVisible/setoresVisible filtram por effSetor/effRetiro). Aqui os
  // detectamos para reexibi-los numa faixa "Sem vínculo" e permitir re-vinculá-los.
  // Só são "órfãos a vincular" quando EXISTE um nó de destino selecionado que os
  // exclui da lista normal: com effSetor/effRetiro == null o filtro casa com null
  // e eles continuam visíveis na coluna (sem destino, basta criar/selecionar um).
  const orphanLocais = useMemo(() => {
    if (levels.setor) return effSetor != null ? locais.filter((l) => l.setorId == null) : [];
    if (levels.retiro) return effRetiro != null ? locais.filter((l) => l.retiroId == null) : [];
    return [];
  }, [levels.setor, levels.retiro, locais, effSetor, effRetiro]);

  const orphanSetores = useMemo(
    () => (levels.retiro && effRetiro != null ? setores.filter((s) => s.retiroId == null) : []),
    [levels.retiro, effRetiro, setores],
  );

  // Destino "padrão" da re-vinculação = o nó selecionado à esquerda (effSetor para
  // locais, effRetiro para setores), espelhando como commitAdd ancora um novo item.
  const localTarget = useMemo<{ setorId: string | null; retiroId: string | null } | null>(() => {
    if (levels.setor) return effSetor ? { setorId: effSetor, retiroId: levels.retiro ? effRetiro : null } : null;
    if (levels.retiro) return effRetiro ? { setorId: null, retiroId: effRetiro } : null;
    return null;
  }, [levels.setor, levels.retiro, effSetor, effRetiro]);

  const localTargetName = useMemo(() => {
    if (levels.setor) return setoresVisible.find((s) => s.id === effSetor)?.name ?? null;
    if (levels.retiro) return retiros.find((r) => r.id === effRetiro)?.name ?? null;
    return null;
  }, [levels.setor, levels.retiro, setoresVisible, effSetor, retiros, effRetiro]);

  const setorTargetName = useMemo(
    () => (levels.retiro ? retiros.find((r) => r.id === effRetiro)?.name ?? null : null),
    [levels.retiro, retiros, effRetiro],
  );

  // ── Re-vínculo de órfãos (PATCH direto, sem evento no ledger) ────────────────
  const patchLocalLink = useCallback(
    async (ids: string[], target: { setorId: string | null; retiroId: string | null }) => {
      if (!ids.length) return;
      setSaving(true);
      // Otimista: aplica o vínculo já no estado (some da faixa, entra na lista).
      setLocais((p) => p.map((l) => (ids.includes(l.id) ? { ...l, ...target } : l)));
      try {
        await Promise.all(
          ids.map((id) => patchJson({ type: 'local', id, setorId: target.setorId, retiroId: target.retiroId })),
        );
        setMapReloadToken((v) => v + 1);
        onToast?.(
          ids.length > 1 ? `${ids.length} locais vinculados.` : 'Local vinculado.',
          'success',
        );
      } catch (err) {
        console.error('Erro ao vincular local(is):', err);
        onToast?.('Não foi possível vincular. Recarregando…', 'error');
        setListReloadVersion((v) => v + 1); // reconcilia em caso de falha parcial
      } finally {
        setSaving(false);
      }
    },
    [onToast],
  );

  const patchSetorLink = useCallback(
    async (ids: string[], retiroId: string | null) => {
      if (!ids.length) return;
      setSaving(true);
      setSetores((p) => p.map((s) => (ids.includes(s.id) ? { ...s, retiroId } : s)));
      try {
        await Promise.all(ids.map((id) => patchJson({ type: 'setor', id, retiroId })));
        setMapReloadToken((v) => v + 1);
        onToast?.(ids.length > 1 ? `${ids.length} setores vinculados.` : 'Setor vinculado.', 'success');
      } catch (err) {
        console.error('Erro ao vincular setor(es):', err);
        onToast?.('Não foi possível vincular. Recarregando…', 'error');
        setListReloadVersion((v) => v + 1);
      } finally {
        setSaving(false);
      }
    },
    [onToast],
  );

  // Linhas de órfãos prontas para a faixa "Sem vínculo" (destino + sugestão).
  const localOrphanRows = useMemo<OrphanRow[]>(
    () =>
      orphanLocais.map((l) => {
        let suggestion: OrphanSuggestion | undefined;
        if (levels.setor) {
          const s = suggestContainer(l.geometry, setores);
          if (s && s.id !== effSetor)
            suggestion = {
              name: s.name,
              apply: () => patchLocalLink([l.id], { setorId: s.id, retiroId: s.retiroId ?? (levels.retiro ? effRetiro : null) }),
            };
        } else if (levels.retiro) {
          const r = suggestContainer(l.geometry, retiros);
          if (r && r.id !== effRetiro)
            suggestion = { name: r.name, apply: () => patchLocalLink([l.id], { setorId: null, retiroId: r.id }) };
        }
        return {
          id: l.id,
          name: l.name,
          area: l.area,
          onAttach: localTarget ? () => patchLocalLink([l.id], localTarget) : undefined,
          suggestion,
        };
      }),
    [orphanLocais, levels.setor, levels.retiro, setores, retiros, effSetor, effRetiro, localTarget, patchLocalLink],
  );

  const setorOrphanRows = useMemo<OrphanRow[]>(
    () =>
      orphanSetores.map((s) => {
        let suggestion: OrphanSuggestion | undefined;
        const r = suggestContainer(s.geometry, retiros);
        if (r && r.id !== effRetiro)
          suggestion = { name: r.name, apply: () => patchSetorLink([s.id], r.id) };
        return {
          id: s.id,
          name: s.name,
          area: s.area,
          onAttach: effRetiro ? () => patchSetorLink([s.id], effRetiro) : undefined,
          suggestion,
        };
      }),
    [orphanSetores, retiros, effRetiro, patchSetorLink],
  );

  const attachAllLocais = useCallback(() => {
    if (localTarget) patchLocalLink(orphanLocais.map((o) => o.id), localTarget);
  }, [localTarget, orphanLocais, patchLocalLink]);

  const attachAllSetores = useCallback(() => {
    if (effRetiro) patchSetorLink(orphanSetores.map((o) => o.id), effRetiro);
  }, [effRetiro, orphanSetores, patchSetorLink]);

  // Nome do "nível anterior" (pai ativo) p/ batizar o registro automático que o
  // back-end grava quando um nível é desativado.
  const parentNameFor = useCallback(
    (key: LevelKey): string => {
      const farmDisplayName = farms.find((f) => f.id === selFarmId)?.name ?? farmName ?? 'Padrão';
      if (key === 'retiro') return farmDisplayName;
      const retiroName = retiros.find((r) => r.id === effRetiro)?.name;
      if (key === 'setor') return (levels.retiro && retiroName) || farmDisplayName;
      // local: ancora no nível ativo mais profundo acima dele.
      const setorName = setoresVisible.find((s) => s.id === effSetor)?.name;
      if (levels.setor && setorName) return setorName;
      if (levels.retiro && retiroName) return retiroName;
      return farmDisplayName;
    },
    [farms, selFarmId, farmName, retiros, effRetiro, setoresVisible, effSetor, levels.retiro, levels.setor],
  );

  // ── Toggle de nível (persiste em farm_location_levels da fazenda) ───────────
  const toggleLevel = useCallback(
    async (key: LevelKey) => {
      if (readOnly || togglingKey) return;
      const next = { ...levels, [key]: !levels[key] };
      const turningOff = !next[key];
      const parentName = turningOff ? parentNameFor(key) : null;
      setLevels(next);
      setTogglingKey(key);
      setAdding(null);
      setModal(null);
      // Espelha na hora o registro automático que o back-end vai gravar, para a
      // coluna desativada já aparecer com o nome do nível anterior (sem refetch).
      if (turningOff && parentName) {
        if (key === 'retiro')
          setDefaultRetiro((p) => ({ ...(p ?? { id: 'auto-retiro', farmId: selFarmId, totalArea: null, isDefault: true } as Retiro), name: parentName }));
        else if (key === 'setor')
          setDefaultSetor((p) => ({ ...(p ?? { id: 'auto-setor', farmId: selFarmId, retiroId: null, area: null, isDefault: true } as Setor), name: parentName }));
        else
          setDefaultLocal((p) => ({ ...(p ?? { id: 'auto-local', farmId: selFarmId, retiroId: null, setorId: null, area: null, isDefault: true } as Local), name: parentName }));
      }
      try {
        // Ao desativar, grava o registro automático do nível com o nome do pai.
        const autoNames = turningOff ? { [key]: parentName } : undefined;
        await postJson({ type: 'levels', farmId: selFarmId, ...next, autoNames });
        setMapReloadToken((v) => v + 1);
      } catch (err) {
        console.error('Erro ao salvar níveis:', err);
        setLevels(levels);
      } finally {
        setTogglingKey(null);
      }
    },
    [levels, selFarmId, readOnly, togglingKey, parentNameFor],
  );

  // ── CRUD (sempre na fazenda selecionada) ────────────────────────────────────
  const commitAdd = async () => {
    if (!adding || !adding.name.trim()) return;
    const { key, name, area } = adding;
    setSaving(true);
    try {
      if (key === 'retiro') {
        const row = await postJson<Retiro>({ farmId: selFarmId, name: name.trim(), totalArea: area.trim() || null, dataInicial });
        setRetiros((p) => [...p, row]);
        setSelRetiro(row.id);
        setSelSetor(null);
      } else if (key === 'setor') {
        const row = await postJson<Setor>({
          type: 'setor', farmId: selFarmId,
          retiroId: levels.retiro ? effRetiro : null,
          name: name.trim(), area: area.trim() || null, dataInicial,
        });
        setSetores((p) => [...p, row]);
        setSelSetor(row.id);
      } else {
        const row = await postJson<Local>({
          type: 'local', farmId: selFarmId,
          retiroId: levels.retiro ? effRetiro : null,
          setorId: levels.setor ? effSetor : null,
          name: name.trim(), area: area.trim() || null, dataInicial,
        });
        setLocais((p) => [...p, row]);
      }
      setMapReloadToken((v) => v + 1);
      setAdding(null);
    } catch (err) {
      console.error('Erro ao adicionar:', err);
    } finally {
      setSaving(false);
    }
  };

  // Salva os dados da "tela" (modal) do card. Grava nome + área + vínculo (pai) num
  // único PATCH — o back-end só toca nos campos enviados (os demais ficam intactos).
  // A Fazenda é somente leitura, então nunca chega aqui.
  const saveModal = async (data: { name: string; area: string; parentId: string | null }) => {
    if (!modal || modal.key === 'fazenda') return;
    const key = modal.key as LevelKey;
    const id = modal.id;
    const name = data.name.trim();
    if (!name) return;
    const area = data.area.trim() || null;
    setSaving(true);
    try {
      if (key === 'retiro') {
        const row = await patchJson<Retiro>({ id, name, totalArea: area, dataInicial });
        setRetiros((p) => p.map((r) => (r.id === id ? row : r)));
      } else if (key === 'setor') {
        const retiroId = levels.retiro ? data.parentId : null;
        const row = await patchJson<Setor>({ type: 'setor', id, name, area, retiroId, dataInicial });
        setSetores((p) => p.map((s) => (s.id === id ? row : s)));
      } else {
        // Local ancora no nível ativo mais profundo acima dele: setor (herdando o
        // retiro do setor escolhido) ou, sem setor, o retiro.
        let setorId: string | null = null;
        let retiroId: string | null = null;
        if (levels.setor) {
          setorId = data.parentId;
          const setor = setores.find((s) => s.id === data.parentId);
          retiroId = setor?.retiroId ?? (levels.retiro ? effRetiro : null);
        } else if (levels.retiro) {
          retiroId = data.parentId;
        }
        const row = await patchJson<Local>({ type: 'local', id, name, area, setorId, retiroId, dataInicial });
        setLocais((p) => p.map((l) => (l.id === id ? row : l)));
      }
      setMapReloadToken((v) => v + 1);
      setModal(null);
    } catch (err) {
      console.error('Erro ao atualizar:', err);
      onToast?.('Não foi possível salvar as alterações.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (key: LevelKey, id: string) => {
    const label = key === 'retiro' ? 'retiro' : key === 'setor' ? 'setor' : 'local';
    const extra =
      key === 'retiro'
        ? ' Os setores e locais ligados a ele também serão removidos.'
        : key === 'setor'
          ? ' Os locais ligados a ele perderão o vínculo de setor.'
          : '';
    if (!window.confirm(`Excluir este ${label}?${extra}`)) return;
    setSaving(true);
    try {
      const param = key === 'retiro' ? 'retiroId' : key === 'setor' ? 'setorId' : 'localId';
      await fetchJson(`${API_BASE}?${param}=${id}`, { method: 'DELETE' });
      if (key === 'retiro') {
        setRetiros((p) => p.filter((r) => r.id !== id));
        setSetores((p) => p.filter((s) => s.retiroId !== id));
        setLocais((p) => p.filter((l) => l.retiroId !== id));
        if (selRetiro === id) setSelRetiro(null);
      } else if (key === 'setor') {
        setSetores((p) => p.filter((s) => s.id !== id));
        setLocais((p) => p.map((l) => (l.setorId === id ? { ...l, setorId: null } : l)));
        if (selSetor === id) setSelSetor(null);
      } else {
        setLocais((p) => p.filter((l) => l.id !== id));
      }
      setMapReloadToken((v) => v + 1);
    } catch (err) {
      console.error('Erro ao excluir:', err);
      onToast?.(err instanceof Error ? err.message : 'Não foi possível excluir.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const onSelect = (key: ColKey, id: string) => {
    if (key === 'fazenda') {
      setSelFarmId(id);
      setSelRetiro(null);
      setSelSetor(null);
      setSelId(fazRootId(id));
    } else if (key === 'retiro') {
      setSelRetiro(id);
      setSelSetor(null);
      setSelId(id);
    } else if (key === 'setor') {
      setSelSetor(id);
      setSelId(id);
    } else {
      setSelId(id);
    }
    setModal(null);
  };

  // ── Integração com o mapa ───────────────────────────────────────────────────
  // Auto-ativa um nível quando o mapa desenha/importa nele estando desligado.
  const ensureLevel = useCallback(
    async (key: LevelKey) => {
      if (levels[key]) return;
      const next = { ...levels, [key]: true };
      setLevels(next);
      try {
        await postJson({ type: 'levels', farmId: selFarmId, ...next });
      } catch (err) {
        console.error('Erro ao ativar nível:', err);
        setLevels(levels);
      }
    },
    [levels, selFarmId],
  );

  // Seleção vinda do mapa: destaca o item e abre o caminho de drill na lista.
  const selectFromMap = useCallback(
    (id: string | null) => {
      setSelId(id);
      if (!id) return;
      const r = retiros.find((x) => x.id === id);
      if (r) {
        setSelRetiro(r.id);
        setSelSetor(null);
        return;
      }
      const s = setores.find((x) => x.id === id);
      if (s) {
        if (s.retiroId) setSelRetiro(s.retiroId);
        setSelSetor(s.id);
        return;
      }
      const l = locais.find((x) => x.id === id);
      if (l) {
        if (l.retiroId) setSelRetiro(l.retiroId);
        if (l.setorId) setSelSetor(l.setorId);
      }
    },
    [retiros, setores, locais],
  );

  // Mapa mutou a hierarquia → recarrega a lista.
  const onMapMutated = useCallback(() => setListReloadVersion((v) => v + 1), []);

  // ── Importar KMZ/KML direto num card → vira o contorno daquele registro ─────
  // (Fazenda → perímetro; Retiro/Setor/Local → geometria da linha.) Reaproveita
  // updateAreaGeometry, que também recalcula o ha a partir do polígono.
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importTargetRef = useRef<{ id: string; level: ColKey; label: string } | null>(null);

  const startImport = useCallback((id: string, level: ColKey, label: string) => {
    if (readOnly) return;
    importTargetRef.current = { id, level, label };
    importInputRef.current?.click();
  }, [readOnly]);

  const handleImportFile = useCallback(
    async (input: HTMLInputElement) => {
      const file = input.files?.[0];
      input.value = '';
      const target = importTargetRef.current;
      if (!file || !target) return;
      setSaving(true);
      try {
        const polys = await parseKmlPolygons(file);
        let ring = polys[0]?.ring ?? null;
        if (!ring) {
          // Arquivo só com linhas/pontos (típico do Google Earth) → reconstrói 1 contorno.
          const r = await importarKmlGoogleEarth(file);
          if (r.perimeter) ring = r.perimeter;
        }
        if (!ring) {
          onToast?.(
            'Nenhuma área encontrada: o arquivo não tem polígonos nem linhas que formem um contorno.',
            'warning',
          );
          return;
        }
        if (polys.length > 1) {
          onToast?.(
            `O arquivo tem ${polys.length} polígonos; usei o primeiro como contorno de "${target.label}".`,
            'info',
          );
        }
        // Para a Fazenda, o perímetro é gravado na própria fazenda do card.
        const fid = target.level === 'fazenda' ? target.id : selFarmId;
        await updateAreaGeometry(fid, { id: target.id, nivel: target.level, fonte: 'kml' }, ring);
        if (target.level === 'fazenda' && target.id !== selFarmId) setSelFarmId(target.id);
        setMapReloadToken((v) => v + 1);
        setListReloadVersion((v) => v + 1);
        onToast?.(`Contorno de "${target.label}" importado do KMZ. A área (ha) foi recalculada.`, 'success');
      } catch (err) {
        if (err instanceof KmlError) onToast?.(err.message, 'error');
        else {
          console.error('Falha ao importar KMZ no card:', err);
          onToast?.('Falha ao importar: verifique se é um KML/KMZ válido.', 'error');
        }
      } finally {
        setSaving(false);
      }
    },
    [selFarmId, onToast],
  );

  // ── Excluir o mapa (contorno) importado de um card ──────────────────────────
  // Limpa a geometria do registro (não exclui o registro em si). Para a Fazenda,
  // remove o perímetro; para os demais níveis, zera o contorno daquele item.
  const clearMap = useCallback(
    async (id: string, level: ColKey, label: string) => {
      if (readOnly) return;
      if (
        !window.confirm(
          `Excluir o mapa (contorno) de "${label}"?\nA geometria importada será removida do mapa. O registro "${label}" continua existindo.`,
        )
      )
        return;
      setSaving(true);
      try {
        const fid = level === 'fazenda' ? id : selFarmId;
        await updateAreaGeometry(fid, { id, nivel: level, fonte: 'kml' }, []);
        setMapReloadToken((v) => v + 1);
        setListReloadVersion((v) => v + 1);
        onToast?.(`Mapa de "${label}" excluído.`, 'success');
      } catch (err) {
        console.error('Falha ao excluir o mapa do card:', err);
        onToast?.('Não foi possível excluir o mapa.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [readOnly, selFarmId, onToast],
  );

  const selFarmName = useMemo(
    () => farms.find((f) => f.id === selFarmId)?.name ?? farmName ?? '',
    [farms, selFarmId, farmName],
  );

  // ── Descrição de cada coluna ────────────────────────────────────────────────
  const fazendaRows = useMemo(
    () =>
      farms.map((f) => ({
        id: f.id,
        name: f.name,
        area:
          (f as any).pastureArea != null
            ? String((f as any).pastureArea)
            : (f as any).totalArea != null
              ? String((f as any).totalArea)
              : null,
      })),
    [farms],
  );

  // Coluna de um nível DESATIVADO: mostra só o registro automático (default),
  // somente leitura, com o nome do nível anterior. Se o default ainda não foi
  // gravado (fazenda em config derivada que nunca togglou), cai no nome do pai
  // ativo para a coluna nunca aparecer vazia.
  const inactiveColumn = (key: LevelKey, def: Retiro | Setor | Local | null, area: string | null) => ({
    rows: [{ id: def?.id ?? `auto-${key}`, name: def?.name ?? parentNameFor(key), area: def ? area : null }],
    selId: null as string | null,
    parentChosen: true,
    drillable: false,
    colReadOnly: true,
    inactive: true,
  });

  const columnFor = (key: ColKey) => {
    if (key === 'fazenda') {
      return { rows: fazendaRows, selId: selFarmId, parentChosen: true, drillable: true, colReadOnly: true, inactive: false };
    }
    if (key === 'retiro') {
      if (!levels.retiro) return inactiveColumn('retiro', defaultRetiro, defaultRetiro?.totalArea ?? null);
      return {
        rows: retiros.map((r) => ({ id: r.id, name: r.name, area: r.totalArea })),
        selId: effRetiro,
        parentChosen: !!selFarmId,
        drillable: true,
        colReadOnly: !!readOnly,
        inactive: false,
      };
    }
    if (key === 'setor') {
      if (!levels.setor) return inactiveColumn('setor', defaultSetor, defaultSetor?.area ?? null);
      return {
        rows: setoresVisible.map((s) => ({ id: s.id, name: s.name, area: s.area })),
        selId: effSetor,
        parentChosen: !levels.retiro || effRetiro != null,
        drillable: true,
        colReadOnly: !!readOnly,
        inactive: false,
      };
    }
    if (!levels.local) return inactiveColumn('local', defaultLocal, defaultLocal?.area ?? null);
    return {
      rows: locaisVisible.map((l) => ({ id: l.id, name: l.name, area: l.area })),
      selId: locais.some((l) => l.id === selId) ? selId : (null as string | null),
      parentChosen: levels.setor ? effSetor != null : levels.retiro ? effRetiro != null : true,
      drillable: false,
      colReadOnly: !!readOnly,
      inactive: false,
    };
  };

  // Todas as colunas ficam visíveis; os níveis desativados aparecem em cinza
  // (somente leitura) em vez de sumirem do layout.
  const cols: { key: ColKey; style: LevelStyle }[] = [
    { key: 'fazenda', style: FAZENDA_STYLE },
    ...LEVELS.map((l) => ({ key: l.key as ColKey, style: l.s })),
  ];

  // Modo "sem mapa": a fazenda controla os locais só pelas colunas (sem o mapa
  // Leaflet). Escolhido no rodapé de "Dados Gerais" (NiveisInline) e lido do bundle.
  const semMapa = levels.usarMapa === false;

  // Dados do item aberto na "tela" (modal) ao clicar no card. A Fazenda sempre
  // abre somente leitura; os demais níveis são editáveis (salvo readOnly global).
  // "Vínculo" é o pai do item: vira um seletor quando há um nível-pai ativo com
  // opções; senão (ex.: retiro sob a fazenda) aparece só como informação.
  const modalCtx = (() => {
    if (!modal) return null;
    const { key, id } = modal;
    const farmDisplayName = farms.find((f) => f.id === selFarmId)?.name ?? farmName ?? 'Fazenda';
    if (key === 'fazenda') {
      const f = fazendaRows.find((r) => r.id === id);
      if (!f) return null;
      return {
        style: FAZENDA_STYLE, readOnly: true,
        name: f.name, area: f.area ?? '',
        parentId: null as string | null, parentLabel: null as string | null,
        parentName: null as string | null, parentOptions: null as { id: string; name: string }[] | null,
      };
    }
    const style = LEVELS.find((l) => l.key === key)!.s;
    const ro = !!readOnly;
    if (key === 'retiro') {
      const r = retiros.find((x) => x.id === id);
      if (!r) return null;
      return {
        style, readOnly: ro, name: r.name, area: r.totalArea ?? '',
        parentId: null, parentLabel: 'Fazenda', parentName: farmDisplayName, parentOptions: null,
      };
    }
    if (key === 'setor') {
      const s = setores.find((x) => x.id === id);
      if (!s) return null;
      const hasRetiro = levels.retiro;
      return {
        style, readOnly: ro, name: s.name, area: s.area ?? '',
        parentId: hasRetiro ? s.retiroId : null,
        parentLabel: hasRetiro ? 'Retiro' : 'Fazenda',
        parentName: hasRetiro ? (retiros.find((r) => r.id === s.retiroId)?.name ?? null) : farmDisplayName,
        parentOptions: hasRetiro ? retiros.map((r) => ({ id: r.id, name: r.name })) : null,
      };
    }
    // local
    const l = locais.find((x) => x.id === id);
    if (!l) return null;
    if (levels.setor) {
      return {
        style, readOnly: ro, name: l.name, area: l.area ?? '',
        parentId: l.setorId, parentLabel: 'Setor',
        parentName: setores.find((s) => s.id === l.setorId)?.name ?? null,
        parentOptions: setores.map((s) => ({ id: s.id, name: s.name })),
      };
    }
    if (levels.retiro) {
      return {
        style, readOnly: ro, name: l.name, area: l.area ?? '',
        parentId: l.retiroId, parentLabel: 'Retiro',
        parentName: retiros.find((r) => r.id === l.retiroId)?.name ?? null,
        parentOptions: retiros.map((r) => ({ id: r.id, name: r.name })),
      };
    }
    return {
      style, readOnly: ro, name: l.name, area: l.area ?? '',
      parentId: null, parentLabel: 'Fazenda', parentName: farmDisplayName, parentOptions: null,
    };
  })();

  // Render compartilhado de uma coluna (todas estreitas, lado a lado, crescendo
  // para preencher a largura — Fazenda/Retiro/Setor/Local em paralelo).
  const renderColumn = (key: ColKey, style: LevelStyle, opts: { grow?: boolean } = {}) => {
    const { grow = false } = opts;
    const col = columnFor(key);
    // Faixa "Sem vínculo": órfãos pós-ativação de nível, só nas colunas ativas e
    // editáveis de Local e Setor.
    const orphans = readOnly || col.inactive
      ? []
      : key === 'local'
        ? localOrphanRows
        : key === 'setor'
          ? setorOrphanRows
          : [];
    const orphanDestName = key === 'local' ? localTargetName : key === 'setor' ? setorTargetName : null;
    const onAttachAll = key === 'local' ? attachAllLocais : key === 'setor' ? attachAllSetores : undefined;
    const attachEnabled = key === 'local' ? !!localTarget : key === 'setor' ? !!effRetiro : false;
    // Enquanto carrega o bundle, mostra spinner nas colunas de nível
    // (a coluna de Fazendas permanece navegável).
    if (key !== 'fazenda' && loading) {
      return (
        <div
          key={key}
          className={`flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white py-12 ${
            grow ? 'min-w-[96px] flex-1 lg:h-full' : 'w-[100px] lg:h-full'
          }`}
        >
          <Loader2 size={18} className="animate-spin text-gray-300" />
        </div>
      );
    }
    return (
      <LevelColumn
        key={key}
        grow={grow}
        style={style}
        rows={col.rows}
        selId={col.selId}
        drillable={col.drillable}
        parentChosen={col.parentChosen}
        readOnly={col.colReadOnly}
        inactive={col.inactive}
        emptyHint={
          key === 'fazenda'
            ? hierarchyLoading.farms
              ? 'Carregando fazendas...'
              : 'Nenhuma fazenda no contexto.'
            : undefined
        }
        saving={saving}
        adding={key !== 'fazenda' && adding?.key === key ? adding : null}
        onStartAdd={() => {
          setModal(null);
          setAdding({ key: key as LevelKey, name: '', area: '' });
        }}
        onChangeAdd={(name, area) => setAdding({ key: key as LevelKey, name, area })}
        onCommitAdd={commitAdd}
        onCancelAdd={() => setAdding(null)}
        onOpenData={(id) => {
          setAdding(null);
          setModal({ key, id });
        }}
        onSelect={(id) => onSelect(key, id)}
        onDelete={(id) => removeItem(key as LevelKey, id)}
        onImport={readOnly || col.colReadOnly || semMapa ? undefined : (id, name) => startImport(id, key, name)}
        orphans={orphans}
        orphanDestName={orphanDestName}
        orphanAttachEnabled={attachEnabled}
        onAttachAllOrphans={onAttachAll}
      />
    );
  };

  // A combinação de níveis é definida no rodapé da aba "Dados Gerais" da fazenda;
  // aqui a aba abre direto nas colunas/mapa. Na primeira carga da fazenda mostra
  // só o spinner para não montar o mapa e logo recarregá-lo.
  if (loading && !didFirstLoad.current) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={22} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* A data dos registros é perguntada ao Salvar no Cadastro de Áreas; os níveis
          de localização são definidos no cadastro da fazenda. */}

      {/* ── Banner-resumo de órfãos: avisa que há registros ocultos sem vínculo ── */}
      {!readOnly && (orphanLocais.length > 0 || orphanSetores.length > 0) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-[12.5px] leading-snug text-amber-800">
            <b>
              {[
                orphanLocais.length > 0 && `${orphanLocais.length} ${orphanLocais.length > 1 ? 'locais' : 'local'}`,
                orphanSetores.length > 0 && `${orphanSetores.length} ${orphanSetores.length > 1 ? 'setores' : 'setor'}`,
              ]
                .filter(Boolean)
                .join(' e ')}
            </b>{' '}
            sem vínculo no nível ativado e {orphanLocais.length + orphanSetores.length > 1 ? 'estão ocultos' : 'está oculto'} da
            hierarquia. Use a faixa <span className="font-semibold">"Sem vínculo"</span> nas colunas abaixo para vinculá-los.
          </div>
        </div>
      )}

      {/* ── Conteúdo: tela principal de Áreas (abas no topo) OU só colunas ────── */}
      {semMapa ? (
        /* Sem mapa: as colunas ocupam a largura toda (o Leaflet nem é montado). */
        <div className="flex flex-col gap-2 lg:h-[calc(100vh-200px)] lg:min-h-[560px]">
          <div className="flex h-full w-full flex-col gap-2">
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1 lg:min-h-0">
              {cols.map(({ key, style }) => renderColumn(key, style, { grow: true }))}
            </div>
          </div>
        </div>
      ) : (
        /* Com mapa: tela PRINCIPAL de Cadastro de Áreas, com abas internas fixas no
           topo. Cada aba ocupa a tela toda (não flutua): "Cadastro de áreas" abre a
           tela mestra EMBUTIDA no mapa; "Colunas" mostra as colunas das áreas. */
        <div className="flex flex-col gap-2 lg:h-[calc(100vh-200px)] lg:min-h-[560px]">
          {/* Abas fixas no topo */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
              {([
                { key: 'cadastro', label: 'Cadastro de áreas' },
                { key: 'colunas', label: 'Colunas' },
                { key: 'uso', label: 'Uso da terra' },
              ] as const).map((t) => {
                const on = mapaView === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setMapaView(t.key)}
                    className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <span className="text-[11.5px] text-gray-400">
              {mapaView === 'cadastro'
                ? 'Cadastre as áreas no mapa: escolha uma categoria e desenhe áreas ou insira pontos.'
                : mapaView === 'uso'
                  ? 'Tipos de locais já alocados no mapa, com suas áreas e hectares.'
                  : 'Veja e organize as colunas das áreas já cadastradas.'}
            </span>
          </div>

          {/* Conteúdo da aba — ocupa a tela toda */}
          <div className="flex min-h-[460px] flex-1 flex-col lg:min-h-0">
            {/* Cadastro de áreas: tela mestra EMBUTIDA no mapa (não flutua). Fica
                montada e só escondida na aba Colunas, para não recarregar o mapa. */}
            <div className={`min-h-0 flex-1 ${mapaView === 'colunas' ? 'hidden' : ''}`}>
              <CadastroAreasView
                // Remonta ao trocar a fazenda (1ª coluna): recria o mapa Leaflet
                // e limpa os refs imperativos para a nova fazenda. Mesmo padrão
                // de MovimentacaoAreasView (key={fazenda}).
                key={selFarmId}
                farmId={selFarmId}
                farmName={selFarmName}
                readOnly={readOnly}
                onToast={onToast}
                selId={selId}
                onSelect={selectFromMap}
                levels={levels}
                onEnsureLevel={ensureLevel}
                onToggleLevel={toggleLevel}
                dataInicial={dataInicial}
                onMutated={onMapMutated}
                reloadToken={mapReloadToken}
                resizeSignal={mapaView === 'cadastro' ? 1 : 0}
                mestreOpen={mapaView === 'cadastro' || mapaView === 'uso'}
                onMestreOpenChange={(open) => setMapaView(open ? 'cadastro' : 'colunas')}
                mestreColumnsTab
                mestreEmbedded
                mestreView={mapaView === 'uso' ? 'uso' : 'mapa'}
                onMestreViewChange={(v) => setMapaView(v === 'uso' ? 'uso' : 'cadastro')}
              />
            </div>

            {/* Colunas: ocupam a tela toda quando ativas */}
            {mapaView === 'colunas' && (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                <div className="flex flex-1 gap-2 overflow-x-auto pb-1 lg:min-h-0">
                  {cols.map(({ key, style }) => renderColumn(key, style, { grow: true }))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input único de import; o card-alvo é guardado em importTargetRef. */}
      <input
        ref={importInputRef}
        type="file"
        accept=".kml,.kmz"
        className="hidden"
        onChange={(e) => handleImportFile(e.target)}
      />

      {/* Tela (modal) de dados do card clicado. */}
      {modal && modalCtx && (
        <AreaDataModal
          key={`${modal.key}:${modal.id}`}
          style={modalCtx.style}
          levelLabel={modalCtx.style.label}
          readOnly={modalCtx.readOnly}
          saving={saving}
          initialName={modalCtx.name}
          initialArea={modalCtx.area}
          initialParentId={modalCtx.parentId}
          parentLabel={modalCtx.parentLabel}
          parentName={modalCtx.parentName}
          parentOptions={modalCtx.parentOptions}
          onClose={() => setModal(null)}
          onSave={saveModal}
          onImport={
            readOnly || semMapa
              ? undefined
              : () => {
                  setModal(null);
                  startImport(modal.id, modal.key, modalCtx.name);
                }
          }
          onClearMap={
            readOnly || semMapa
              ? undefined
              : () => {
                  setModal(null);
                  clearMap(modal.id, modal.key, modalCtx.name);
                }
          }
        />
      )}
    </div>
  );
};

/* ===== Coluna de um nível ===== */
interface Row {
  id: string;
  name: string;
  area: string | null;
}
interface LevelColumnProps {
  style: LevelStyle;
  rows: Row[];
  selId: string | null;
  /** Coluna estreita que cresce para preencher a largura disponível. */
  grow?: boolean;
  /** Nível desativado: coluna cinza, somente leitura, mostra só o registro automático. */
  inactive?: boolean;
  drillable: boolean;
  parentChosen: boolean;
  readOnly: boolean;
  emptyHint?: string;
  saving: boolean;
  adding: { name: string; area: string } | null;
  onStartAdd: () => void;
  onChangeAdd: (name: string, area: string) => void;
  onCommitAdd: () => void;
  onCancelAdd: () => void;
  /** Clique no corpo do card → abre a tela (modal) de dados do item. */
  onOpenData: (id: string) => void;
  /** Clique na setinha (chevron) → navega/drill para o nível seguinte. */
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Importar KMZ/KML como contorno deste card (independe de colReadOnly). */
  onImport?: (id: string, name: string) => void;
  /** Órfãos sem vínculo no nível ativo (faixa "Sem vínculo" no topo da coluna). */
  orphans?: OrphanRow[];
  /** Nome do destino selecionado à esquerda (para rótulos "Vincular a X"). */
  orphanDestName?: string | null;
  /** Há um destino selecionado para ancorar os órfãos? (senão, só sugestões). */
  orphanAttachEnabled?: boolean;
  /** Vincula todos os órfãos ao destino selecionado de uma vez. */
  onAttachAllOrphans?: () => void;
}

const LevelColumn: React.FC<LevelColumnProps> = ({
  style,
  rows,
  selId,
  grow = false,
  inactive = false,
  drillable,
  parentChosen,
  readOnly,
  emptyHint,
  saving,
  adding,
  onStartAdd,
  onChangeAdd,
  onCommitAdd,
  onCancelAdd,
  onOpenData,
  onSelect,
  onDelete,
  orphans = [],
  orphanDestName,
  orphanAttachEnabled = false,
  onAttachAllOrphans,
  onImport,
}) => {
  const totalArea = rows.reduce((s, r) => {
    const n = r.area ? parseFloat(String(r.area).replace(',', '.')) : 0;
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  return (
    <div
      className={`flex min-w-0 flex-col rounded-xl border ${
        inactive ? 'border-dashed border-gray-200 bg-gray-50/70' : 'border-gray-200 bg-white'
      } ${grow ? 'min-w-[96px] flex-1 lg:h-full' : 'w-[100px] shrink-0 lg:h-full'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-gray-100 px-1.5 py-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${inactive ? 'bg-gray-300' : style.dot}`} />
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[9px] font-bold uppercase tracking-wide ${inactive ? 'text-gray-400' : 'text-gray-600'}`}>
            {style.plural}
          </div>
          <div className="truncate text-[9px] tabular-nums text-gray-400">
            {inactive ? (
              'desativado'
            ) : (
              <>
                {rows.length}
                {totalArea > 0 && ` · ${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`}
              </>
            )}
          </div>
        </div>
        {!readOnly && parentChosen && (
          <button
            type="button"
            onClick={onStartAdd}
            title={`Adicionar ${style.label.toLowerCase()}`}
            className={`shrink-0 rounded p-0.5 ${style.text} hover:opacity-80`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Inline add */}
      {adding && (
        <div className={`m-1.5 flex items-center gap-1.5 rounded-lg border p-1.5 ${style.addBox}`}>
          <input
            autoFocus
            type="text"
            placeholder={`Nome do ${style.label.toLowerCase()}`}
            value={adding.name}
            onChange={(e) => onChangeAdd(e.target.value, adding.area)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitAdd();
              if (e.key === 'Escape') onCancelAdd();
            }}
            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            placeholder="ha"
            value={adding.area}
            onChange={(e) => onChangeAdd(adding.name, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitAdd();
              if (e.key === 'Escape') onCancelAdd();
            }}
            className="w-14 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          />
          <button type="button" onClick={onCommitAdd} disabled={saving || !adding.name.trim()} className={`p-1 ${style.text} disabled:opacity-40`}>
            <Check size={16} />
          </button>
          <button type="button" onClick={onCancelAdd} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Faixa "Sem vínculo": órfãos que sumiriam ao ativar este nível. */}
      {orphans.length > 0 && (
        <div className="m-1.5 rounded-lg border border-amber-200 bg-amber-50/80">
          <div className="flex items-center gap-1.5 border-b border-amber-200/70 px-2 py-1.5">
            <AlertTriangle size={12} className="shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-amber-700">
              {orphans.length} sem vínculo
            </span>
            {onAttachAllOrphans && orphans.length > 1 && (
              <button
                type="button"
                onClick={onAttachAllOrphans}
                disabled={saving || !orphanAttachEnabled}
                title={orphanAttachEnabled ? `Vincular todos a ${orphanDestName ?? 'destino'}` : 'Selecione um destino à esquerda'}
                className="shrink-0 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
              >
                Vincular todos
              </button>
            )}
          </div>
          {!orphanAttachEnabled && (
            <div className="px-2 pt-1.5 text-[10px] italic leading-snug text-amber-700/80">
              Selecione (ou crie) um {style.label.toLowerCase()} de destino à esquerda — ou use a sugestão pela posição.
            </div>
          )}
          <div className="flex flex-col gap-1 p-1.5">
            {orphans.map((o) => (
              <div key={o.id} className="rounded-md border border-amber-200 bg-white px-1.5 py-1">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-800" title={o.name}>
                    {o.name}
                  </span>
                  {o.onAttach && (
                    <button
                      type="button"
                      onClick={o.onAttach}
                      disabled={saving || !orphanAttachEnabled}
                      title={orphanAttachEnabled ? `Vincular a ${orphanDestName ?? 'destino'}` : 'Selecione um destino à esquerda'}
                      className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-40"
                    >
                      <Link2 size={11} /> Aqui
                    </button>
                  )}
                </div>
                {o.suggestion && (
                  <button
                    type="button"
                    onClick={o.suggestion.apply}
                    disabled={saving}
                    title={`Vincular a ${o.suggestion.name} (sugerido pela posição no mapa)`}
                    className="mt-1 inline-flex max-w-full items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                  >
                    <Sparkles size={11} className="shrink-0" />
                    <span className="truncate">Sugerido: {o.suggestion.name}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex max-h-[42vh] min-h-[60px] flex-1 flex-col gap-1 overflow-y-auto p-1.5 lg:max-h-none">
        {rows.length === 0 && !adding ? (
          <div className="px-2 py-6 text-center text-[11.5px] italic text-gray-400">
            {emptyHint
              ? emptyHint
              : parentChosen
                ? `Nenhum ${style.label.toLowerCase()} cadastrado.`
                : `Selecione um item à esquerda.`}
          </div>
        ) : (
          rows.map((row) => {
            const selected = selId === row.id;
            return (
              <div
                key={row.id}
                onClick={inactive ? undefined : () => onOpenData(row.id)}
                title={inactive ? undefined : 'Abrir dados'}
                className={`group flex items-center gap-0.5 rounded-lg border px-1.5 py-1 transition-colors ${
                  inactive
                    ? 'cursor-default border-dashed border-gray-200 bg-gray-50'
                    : `cursor-pointer ${selected ? style.selRow : 'border-gray-200 bg-white hover:border-gray-300'}`
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className={`block truncate text-[11px] font-medium leading-tight ${inactive ? 'text-gray-500' : 'text-gray-800'}`}>
                    {row.name}
                  </span>
                  {fmtArea(row.area) && <span className="text-[9px] text-gray-500">{fmtArea(row.area)}</span>}
                </div>
                <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
                  {onImport && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onImport(row.id, row.name);
                      }}
                      className="p-0.5 text-gray-400 hover:text-emerald-600"
                      title="Importar KMZ/KML (contorno desta área)"
                    >
                      <Upload size={12} />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(row.id);
                      }}
                      className="p-0.5 text-gray-400 hover:text-red-500"
                      title="Excluir"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
                {drillable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(row.id);
                    }}
                    title="Abrir / ver o que há dentro"
                    className="shrink-0 rounded p-0.5 hover:bg-black/5"
                  >
                    <ChevronRight size={14} className={selected ? style.accent : 'text-gray-400'} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/* ===== Tela (modal) com os dados do card clicado =====
 * Abre ao clicar no corpo de um card de qualquer nível. Editável para
 * Retiro/Setor/Local (nome, área e vínculo); a Fazenda abre somente leitura.
 */
interface AreaDataModalProps {
  style: LevelStyle;
  levelLabel: string;
  readOnly: boolean;
  saving: boolean;
  initialName: string;
  initialArea: string;
  initialParentId: string | null;
  /** Rótulo do nível-pai ("Fazenda" / "Retiro" / "Setor"); null ⇒ sem campo de vínculo. */
  parentLabel: string | null;
  /** Nome do pai atual (exibição quando o vínculo é só leitura). */
  parentName: string | null;
  /** Opções de vínculo; quando presente (e editável), o campo vira um seletor. */
  parentOptions: { id: string; name: string }[] | null;
  onClose: () => void;
  onSave: (d: { name: string; area: string; parentId: string | null }) => void;
  /** Importar KMZ/KML como contorno deste item; ausente ⇒ não mostra o botão. */
  onImport?: () => void;
  /** Excluir o mapa (contorno) deste item; ausente ⇒ não mostra o botão. */
  onClearMap?: () => void;
}

const AreaDataModal: React.FC<AreaDataModalProps> = ({
  style,
  levelLabel,
  readOnly,
  saving,
  initialName,
  initialArea,
  initialParentId,
  parentLabel,
  parentName,
  parentOptions,
  onClose,
  onSave,
  onImport,
  onClearMap,
}) => {
  const [name, setName] = useState(initialName);
  const [area, setArea] = useState(initialArea);
  const [parentId, setParentId] = useState<string | null>(initialParentId);

  const canSave = !readOnly && !saving && name.trim().length > 0;
  const submit = () => {
    if (canSave) onSave({ name, area, parentId });
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="w-[460px] max-w-full overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-start gap-2.5 px-6 pb-3 pt-5">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[16px] font-bold text-gray-900">
              {readOnly ? levelLabel : `Editar ${levelLabel.toLowerCase()}`}
            </h3>
            <div className="mt-0.5 text-[12.5px] text-gray-500">
              {readOnly ? 'Somente visualização.' : 'Preencha os dados deste item.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Campos */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-6 pb-2">
          <div className="col-span-2 flex flex-col gap-1.5">
            <label className="text-[12.5px] font-semibold text-gray-700">
              Nome {!readOnly && <span className="text-red-500">*</span>}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              autoFocus={!readOnly}
              placeholder={`Nome do ${levelLabel.toLowerCase()}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12.5px] font-semibold text-gray-700">Área (ha)</label>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={readOnly}
              placeholder="ha"
              inputMode="decimal"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {parentLabel && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-gray-700">{parentLabel}</label>
              {parentOptions && !readOnly ? (
                <select
                  value={parentId ?? ''}
                  onChange={(e) => setParentId(e.target.value || null)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">— sem vínculo —</option>
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13.5px] text-gray-600">
                  {parentName ?? '— sem vínculo —'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 px-6 py-3.5">
          <div className="flex items-center gap-2">
            {onImport && (
              <button
                type="button"
                onClick={onImport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                title="Importar KMZ/KML como contorno deste item"
              >
                <Upload size={14} />
                Importar KMZ
              </button>
            )}
            {onClearMap && (
              <button
                type="button"
                onClick={onClearMap}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                title="Excluir o mapa (contorno) deste item"
              >
                <Trash2 size={14} />
                Excluir mapa
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Fechar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSave}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${style.dot}`}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Salvar
              </button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmLocaisTab;
