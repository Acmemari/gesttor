import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  Layers,
  ChevronRight,
  Upload,
} from 'lucide-react';
import { useHierarchy } from '../contexts/HierarchyContext';
import CadastroAreasView from '../agents/pecuario/areas/CadastroAreasView';
import { fazRootId, updateAreaGeometry } from '../agents/pecuario/areas/areasClient';
import { parseKmlPolygons, KmlError } from '../agents/pecuario/areas/kml';

type ToastFn = (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;

/* ===== Hierarquia da fazenda: Fazenda › Retiro › Setor › Local =====
 * A 1ª coluna lista as FAZENDAS do contexto; clicar numa delas faz o drill para
 * Retiro › Setor › Local daquela fazenda. Os níveis intermediários/folha são
 * opcionais e ativados por fazenda (toggles). Só a Fazenda é obrigatória (raiz).
 * Um Local ancora no nível ATIVO mais profundo acima dele (setor ?? retiro ?? fazenda).
 * As 4 colunas se distribuem em toda a largura; o mapa (mesma hierarquia, com
 * geometria) fica grande logo abaixo. Cada card importa seu próprio KMZ/KML.
 */

interface Retiro {
  id: string;
  farmId: string;
  name: string;
  totalArea: string | null;
  isDefault: boolean;
}
interface Setor {
  id: string;
  farmId: string;
  retiroId: string | null;
  name: string;
  area: string | null;
}
interface Local {
  id: string;
  farmId: string;
  retiroId: string | null;
  setorId: string | null;
  name: string;
  area: string | null;
}
interface Levels {
  retiro: boolean;
  setor: boolean;
  local: boolean;
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
  const res = await fetch(url, { credentials: 'include', ...init });
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

const FarmLocaisTab: React.FC<FarmLocaisTabProps> = ({ farmId, farmName, readOnly, onToast }) => {
  const { farms, loading: hierarchyLoading } = useHierarchy();

  // Fazenda selecionada na 1ª coluna (default = fazenda em edição).
  const [selFarmId, setSelFarmId] = useState<string>(farmId);
  useEffect(() => setSelFarmId(farmId), [farmId]);

  const [levels, setLevels] = useState<Levels>({ retiro: true, setor: false, local: true });
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);

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

  const [adding, setAdding] = useState<{ key: LevelKey; name: string; area: string } | null>(null);
  const [editing, setEditing] = useState<{ key: LevelKey; id: string; name: string; area: string } | null>(null);

  // ── Carrega o bundle da fazenda selecionada ─────────────────────────────────
  useEffect(() => {
    if (!selFarmId) return;
    let cancelled = false;
    setLoading(true);
    setAdding(null);
    setEditing(null);
    fetchJson<{ retiros: Retiro[]; setores: Setor[]; locais: Local[]; levels: Levels }>(
      `${API_BASE}?bundle=${selFarmId}`,
    )
      .then((b) => {
        if (cancelled) return;
        setRetiros(b.retiros);
        setSetores(b.setores);
        setLocais(b.locais);
        setLevels(b.levels);
        setSelRetiro(b.retiros[0]?.id ?? null);
        setSelSetor(null);
      })
      .catch((err) => console.error('Erro ao carregar locais:', err))
      .finally(() => !cancelled && setLoading(false));
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

  const activeLevels = LEVELS.filter((l) => levels[l.key]);

  // ── Toggle de nível (persiste em farm_location_levels da fazenda) ───────────
  const toggleLevel = useCallback(
    async (key: LevelKey) => {
      if (readOnly || togglingKey) return;
      const next = { ...levels, [key]: !levels[key] };
      setLevels(next);
      setTogglingKey(key);
      setAdding(null);
      setEditing(null);
      try {
        await postJson({ type: 'levels', farmId: selFarmId, ...next });
        setMapReloadToken((v) => v + 1);
      } catch (err) {
        console.error('Erro ao salvar níveis:', err);
        setLevels(levels);
      } finally {
        setTogglingKey(null);
      }
    },
    [levels, selFarmId, readOnly, togglingKey],
  );

  // ── CRUD (sempre na fazenda selecionada) ────────────────────────────────────
  const commitAdd = async () => {
    if (!adding || !adding.name.trim()) return;
    const { key, name, area } = adding;
    setSaving(true);
    try {
      if (key === 'retiro') {
        const row = await postJson<Retiro>({ farmId: selFarmId, name: name.trim(), totalArea: area.trim() || null });
        setRetiros((p) => [...p, row]);
        setSelRetiro(row.id);
        setSelSetor(null);
      } else if (key === 'setor') {
        const row = await postJson<Setor>({
          type: 'setor', farmId: selFarmId,
          retiroId: levels.retiro ? effRetiro : null,
          name: name.trim(), area: area.trim() || null,
        });
        setSetores((p) => [...p, row]);
        setSelSetor(row.id);
      } else {
        const row = await postJson<Local>({
          type: 'local', farmId: selFarmId,
          retiroId: levels.retiro ? effRetiro : null,
          setorId: levels.setor ? effSetor : null,
          name: name.trim(), area: area.trim() || null,
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

  const commitEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    const { key, id, name, area } = editing;
    setSaving(true);
    try {
      if (key === 'retiro') {
        const row = await patchJson<Retiro>({ id, name: name.trim(), totalArea: area.trim() || null });
        setRetiros((p) => p.map((r) => (r.id === id ? row : r)));
      } else if (key === 'setor') {
        const row = await patchJson<Setor>({ type: 'setor', id, name: name.trim(), area: area.trim() || null });
        setSetores((p) => p.map((s) => (s.id === id ? row : s)));
      } else {
        const row = await patchJson<Local>({ type: 'local', id, name: name.trim(), area: area.trim() || null });
        setLocais((p) => p.map((l) => (l.id === id ? row : l)));
      }
      setMapReloadToken((v) => v + 1);
      setEditing(null);
    } catch (err) {
      console.error('Erro ao atualizar:', err);
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
    setEditing(null);
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
        if (!polys.length) {
          onToast?.('Nenhum polígono: o arquivo não contém áreas para importar.', 'warning');
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
        await updateAreaGeometry(fid, { id: target.id, nivel: target.level, fonte: 'kml' }, polys[0].ring);
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

  const columnFor = (key: ColKey) => {
    if (key === 'fazenda') {
      return { rows: fazendaRows, selId: selFarmId, parentChosen: true, drillable: true, colReadOnly: true };
    }
    if (key === 'retiro') {
      return {
        rows: retiros.map((r) => ({ id: r.id, name: r.name, area: r.totalArea })),
        selId: effRetiro,
        parentChosen: !!selFarmId,
        drillable: true,
        colReadOnly: !!readOnly,
      };
    }
    if (key === 'setor') {
      return {
        rows: setoresVisible.map((s) => ({ id: s.id, name: s.name, area: s.area })),
        selId: effSetor,
        parentChosen: !levels.retiro || effRetiro != null,
        drillable: true,
        colReadOnly: !!readOnly,
      };
    }
    return {
      rows: locaisVisible.map((l) => ({ id: l.id, name: l.name, area: l.area })),
      selId: locais.some((l) => l.id === selId) ? selId : (null as string | null),
      parentChosen: levels.setor ? effSetor != null : levels.retiro ? effRetiro != null : true,
      drillable: false,
      colReadOnly: !!readOnly,
    };
  };

  const cols: { key: ColKey; style: LevelStyle }[] = [
    { key: 'fazenda', style: FAZENDA_STYLE },
    ...activeLevels.map((l) => ({ key: l.key as ColKey, style: l.s })),
  ];

  return (
    <div className="space-y-4">
      {/* ── Seletores de nível ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={15} className="text-gray-400" />
          <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
            Níveis de localização
          </span>
          <span className="text-[11px] text-gray-400 normal-case font-normal">
            · a Fazenda é a raiz (sempre ativa) · ative os níveis que esta fazenda usa
          </span>
        </div>
        {/* Mesma largura/distribuição das 4 colunas abaixo (4×100px + gaps) */}
        <div className="flex w-[424px] max-w-full flex-wrap items-center gap-2">
          <div className="flex w-[100px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2 py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-600" />
            <span className="text-xs font-semibold text-slate-700">Fazenda</span>
          </div>
          {LEVELS.map((lvl) => {
            const on = levels[lvl.key];
            const busy = togglingKey === lvl.key;
            return (
              <button
                key={lvl.key}
                type="button"
                disabled={readOnly || !!togglingKey || loading}
                onClick={() => toggleLevel(lvl.key)}
                className={`group inline-flex w-[100px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 transition-colors disabled:cursor-not-allowed ${
                  on ? 'border-gray-300 bg-white shadow-sm' : 'border-dashed border-gray-200 bg-gray-50/60'
                } ${readOnly ? 'opacity-70' : 'hover:border-gray-400'}`}
                title={on ? `Desativar nível ${lvl.s.label}` : `Ativar nível ${lvl.s.label}`}
              >
                <span
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                    on ? lvl.s.dot : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                      on ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
                <span className={`text-xs font-semibold ${on ? 'text-gray-800' : 'text-gray-400'}`}>
                  {lvl.s.label}
                </span>
                {busy && <Loader2 size={12} className="animate-spin text-gray-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Colunas (lateral esq., largura do conteúdo) + Mapa grande ────────── */}
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-200px)] lg:min-h-[560px] lg:flex-row">
        {/* Painel das colunas: abraça a largura das colunas (resto vai pro mapa) */}
        <div className="flex w-full gap-2 overflow-x-auto pb-1 lg:h-full lg:w-auto lg:max-w-[40%] lg:shrink-0">
          {cols.map(({ key, style }) => {
            const col = columnFor(key);
            // Enquanto carrega o bundle, mostra spinner nas colunas de nível
            // (a coluna de Fazendas permanece navegável).
            if (key !== 'fazenda' && loading) {
              return (
                <div
                  key={key}
                  className="flex w-[100px] shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white py-12 lg:h-full"
                >
                  <Loader2 size={18} className="animate-spin text-gray-300" />
                </div>
              );
            }
            return (
              <LevelColumn
                key={key}
              style={style}
              rows={col.rows}
              selId={col.selId}
              drillable={col.drillable}
              parentChosen={col.parentChosen}
              readOnly={col.colReadOnly}
              emptyHint={
                key === 'fazenda'
                  ? hierarchyLoading.farms
                    ? 'Carregando fazendas...'
                    : 'Nenhuma fazenda no contexto.'
                  : undefined
              }
              saving={saving}
              adding={key !== 'fazenda' && adding?.key === key ? adding : null}
              editing={key !== 'fazenda' && editing?.key === key ? editing : null}
              onStartAdd={() => {
                setEditing(null);
                setAdding({ key: key as LevelKey, name: '', area: '' });
              }}
              onChangeAdd={(name, area) => setAdding({ key: key as LevelKey, name, area })}
              onCommitAdd={commitAdd}
              onCancelAdd={() => setAdding(null)}
              onStartEdit={(id, name, area) => {
                setAdding(null);
                setEditing({ key: key as LevelKey, id, name, area: area ?? '' });
              }}
              onChangeEdit={(name, area) => setEditing((e) => (e ? { ...e, name, area } : e))}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditing(null)}
                onSelect={(id) => onSelect(key, id)}
                onDelete={(id) => removeItem(key as LevelKey, id)}
                onImport={readOnly ? undefined : (id, name) => startImport(id, key, name)}
              />
            );
          })}
        </div>

        {/* Mapa de áreas (mesma hierarquia, com geometria) — ~70% */}
        <div className="h-[58vh] min-h-[460px] w-full flex-1 lg:h-full lg:min-h-0">
          <CadastroAreasView
            farmId={selFarmId}
            farmName={selFarmName}
            readOnly={readOnly}
            onToast={onToast}
            selId={selId}
            onSelect={selectFromMap}
            levels={levels}
            onEnsureLevel={ensureLevel}
            onMutated={onMapMutated}
            reloadToken={mapReloadToken}
          />
        </div>
      </div>

      {/* Input único de import; o card-alvo é guardado em importTargetRef. */}
      <input
        ref={importInputRef}
        type="file"
        accept=".kml,.kmz"
        className="hidden"
        onChange={(e) => handleImportFile(e.target)}
      />
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
  drillable: boolean;
  parentChosen: boolean;
  readOnly: boolean;
  emptyHint?: string;
  saving: boolean;
  adding: { name: string; area: string } | null;
  editing: { id: string; name: string; area: string } | null;
  onStartAdd: () => void;
  onChangeAdd: (name: string, area: string) => void;
  onCommitAdd: () => void;
  onCancelAdd: () => void;
  onStartEdit: (id: string, name: string, area: string | null) => void;
  onChangeEdit: (name: string, area: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Importar KMZ/KML como contorno deste card (independe de colReadOnly). */
  onImport?: (id: string, name: string) => void;
}

const LevelColumn: React.FC<LevelColumnProps> = ({
  style,
  rows,
  selId,
  drillable,
  parentChosen,
  readOnly,
  emptyHint,
  saving,
  adding,
  editing,
  onStartAdd,
  onChangeAdd,
  onCommitAdd,
  onCancelAdd,
  onStartEdit,
  onChangeEdit,
  onCommitEdit,
  onCancelEdit,
  onSelect,
  onDelete,
  onImport,
}) => {
  const totalArea = rows.reduce((s, r) => {
    const n = r.area ? parseFloat(String(r.area).replace(',', '.')) : 0;
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  return (
    <div className="flex w-[100px] shrink-0 flex-col rounded-xl border border-gray-200 bg-white lg:h-full">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-gray-100 px-1.5 py-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9px] font-bold uppercase tracking-wide text-gray-600">{style.plural}</div>
          <div className="truncate text-[9px] tabular-nums text-gray-400">
            {rows.length}
            {totalArea > 0 && ` · ${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`}
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
            const isEditing = editing?.id === row.id;
            const selected = selId === row.id;
            if (isEditing && editing) {
              return (
                <div key={row.id} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={editing.name}
                    onChange={(e) => onChangeEdit(e.target.value, editing.area)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onCommitEdit();
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    value={editing.area}
                    placeholder="ha"
                    onChange={(e) => onChangeEdit(editing.name, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onCommitEdit();
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                    className="w-14 rounded border border-gray-200 px-2 py-1 text-sm"
                  />
                  <button type="button" onClick={onCommitEdit} disabled={saving || !editing.name.trim()} className={`p-1 ${style.text} disabled:opacity-40`}>
                    <Check size={14} />
                  </button>
                  <button type="button" onClick={onCancelEdit} className="p-1 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              );
            }
            return (
              <div
                key={row.id}
                onClick={() => onSelect(row.id)}
                className={`group flex cursor-pointer items-center gap-0.5 rounded-lg border px-1.5 py-1 transition-colors ${
                  selected ? style.selRow : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium leading-tight text-gray-800">{row.name}</span>
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
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartEdit(row.id, row.name, row.area);
                        }}
                        className="p-0.5 text-gray-400 hover:text-gray-700"
                        title="Editar"
                      >
                        <Pencil size={12} />
                      </button>
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
                    </>
                  )}
                </span>
                {drillable && (
                  <ChevronRight
                    size={12}
                    className={`shrink-0 ${selected ? style.accent : 'text-gray-300'}`}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FarmLocaisTab;
