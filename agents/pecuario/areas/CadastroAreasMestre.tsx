/* ===== Cadastro de Áreas — tela mestra =====
 * Evolução do antigo modal "Importar do Google Earth": agora é a tela mestra de
 * cadastro da hierarquia geográfica (Fazenda › Retiro › Setor › Local).
 *
 *  - Importar um KML/KMZ é OPCIONAL: reconstruímos o contorno + os piquetes
 *    internos + os pontos (reusa kmlImport) e cada um vira uma LINHA na lista.
 *  - Cada linha tem um seletor de NÍVEL (Fazenda/Retiro/Setor/Local): é assim que
 *    se marca "contorno do retiro" e "contorno do setor", não só da fazenda.
 *  - O mapa é EDITÁVEL na própria tela: desenhar polígonos novos (leaflet-draw) e
 *    arrastar/inserir/remover vértices (createVertexEditor) antes de salvar.
 *  - Ao confirmar, o container grava a hierarquia inteira em ordem de dependência
 *    e resolve os vínculos pai/filho por contenção espacial.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  Globe,
  X,
  Loader2,
  AlertTriangle,
  Check,
  Pencil,
  Crosshair,
  Save,
  Trash2,
  Layers,
  Maximize2,
  Minimize2,
  MapPin,
  Eye,
  EyeOff,
  Square,
  FileUp,
  ChevronDown,
  ChevronRight,
  Search,
  Minus,
  Sparkles,
  Wand2,
  ArrowRight,
  Spline,
  ListChecks,
  RotateCcw,
  Download,
} from 'lucide-react';
import { areaM2, cleanRing, fmtArea } from './util';
import { NIVEIS, ORDEM, type Area, type Fonte, type Nivel } from './types';
import { importarKmlGoogleEarth, recorrigirKml, KmlImportError, inferCatalogClassification, defaultGeomForTipo, suggestDestino, type KmlImportResult } from './kmlImport';
import type { LineToPolyReport, ConvertidaEntry, IgnoradaNomeEntry } from './kmlLineToPolygon';
import { suggestDestinos } from '../../../lib/api/areasSuggestDestinoClient';
import { createVertexEditor, type VertexEditor } from './mapEditing';
import {
  listTiposLocal,
  type TipoLocalCategoria,
  type TipoLocalItem,
  type TipoLocalDetalhe,
} from '../../../lib/api/tiposLocalClient';
import { TipoIcon } from '../../tiposLocalIcons';
import { buildCatalogIndex, pointDivIcon, pointLatLng, type CatalogIndex } from './mapPoints';
import type { FarmMapData } from '../../../lib/api/farmMapsClient';
import { storageSignedUrlForKey } from '../../../lib/storage';
import DateInputBR from '../../../components/DateInputBR';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import './cadastroAreas.css';

/** Data local de hoje em ISO 'YYYY-MM-DD' (sem deslocamento de fuso). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type ToastFn = (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;

/** Origem de uma área-rascunho (controla o `fonte` na persistência). */
type DraftSource = 'perimeter' | 'paddock' | 'point' | 'drawn';

/** Uma área em rascunho na tela (antes de gravar). */
interface DraftArea {
  id: string;
  nome: string;
  nivel: Nivel;
  /** anel [lat,lng][] (área, ≥3) OU 1 coordenada [[lat,lng]] (ponto). */
  coords: [number, number][];
  /** texto livre: enum legado OU nome de tipo do catálogo. */
  tipo: string | null;
  /** 3º nível do catálogo (detalhe, ex.: "Capim-Marandu"). Texto livre por nome. */
  detalhe: string | null;
  /** categoria do catálogo (só p/ locais criados via barra de categorias). */
  categoriaId: string | null;
  /** área (polígono), ponto (marcador) ou linha (traço: cerca/estrada/rede). */
  geomKind: 'area' | 'point' | 'line';
  source: DraftSource;
  /** entra no cadastro ao confirmar? */
  keep: boolean;
  /** override do pai (id de outra área-rascunho OU de uma área existente). */
  parentId: string | null;
  /** área em m² (cacheada — recalculada só ao editar a forma; 0 p/ ponto). */
  areaM2: number;
  /** estilo do polígono (só retiro/setor): cor da linha, do preenchimento e opacidade 0–1.
   *  null ⇒ usa o padrão do nível (NIVEIS). */
  strokeColor: string | null;
  fillColor: string | null;
  fillOpacity: number | null;
  /** espessura da linha (perímetro) em px. null ⇒ padrão do nível. */
  strokeWeight: number | null;
  /** tipo CRU vindo do KML (propriedade `tipo` do arquivo), usado para agrupar no
   *  de-para por "Coluna tipo" e para sugerir o destino. Não é a classificação final. */
  srcTipo?: string | null;
  /** marcado explicitamente como "não importar este grupo" no de-para. */
  naoImportar?: boolean;
  /** o destino atual veio de sugestão automática (≠ confirmado manualmente). */
  sugerido?: boolean;
  /** classificada individualmente (exceção) — applyDestino do grupo não a sobrescreve. */
  excecao?: boolean;
  /** já foi gravada no banco (Salvar por etapas): permanece visível na lista como
   *  "salvo", fica fora do próximo lote (não re-grava) e some da camada de rascunho
   *  do mapa (passa a aparecer pela camada de áreas já cadastradas). */
  saved?: boolean;
  /** feição JÁ salva cujo destino foi alterado no de-para (re-classificação): entra
   *  no próximo lote como UPDATE (por `localId`), não como insert. Limpo após gravar. */
  dirty?: boolean;
  /** id da Área já salva (existingAreas) à qual esta feição foi re-vinculada na
   *  re-hidratação ao reabrir a tela. Marca a feição como `saved` e evita que a mesma
   *  Área case com duas linhas (consumo 1-para-1) — base do round-trip por id. */
  localId?: string | null;
  /** feição que era uma LINHA fechada e foi convertida em área na importação
   *  (correção automática do KMZ). Vem da proveniência `__corrigido` no GeoJSON. */
  corrigido?: boolean;
  /** distância (m) entre 1º e último ponto da linha original (só p/ tooltip). */
  corrigidoGapM?: number;
}

/** Item enviado ao container para persistir. */
export interface MestreItemOut {
  id: string;
  nome: string;
  nivel: Nivel;
  coords: [number, number][];
  tipo: string | null;
  /** 3º nível do catálogo (detalhe). Só locais; null nos demais níveis. */
  detalhe: string | null;
  parentId: string | null;
  fonte: Fonte;
  geomKind: 'area' | 'point' | 'line';
  /** estilo do polígono (só retiro/setor; null nos demais níveis). */
  strokeColor: string | null;
  fillColor: string | null;
  fillOpacity: number | null;
  strokeWeight: number | null;
  /** Quando presente, é uma área JÁ salva sendo re-classificada (UPDATE por id),
   *  não um novo cadastro (INSERT). O container troca só tipo/detalhe. */
  localId?: string | null;
}

export interface MestreSavePayload {
  items: MestreItemOut[];
  /** salvar o KML cru como camada de referência (farm_maps)? */
  saveOverlay: boolean;
  file: File | null;
  geojson: GeoJSON.FeatureCollection | null;
  /** data de referência escolhida ao salvar (ISO 'YYYY-MM-DD') — carimba os registros. */
  dataReferencia: string;
}

/** Resultado da persistência: ids dos rascunhos efetivamente gravados (idempotência). */
export interface MestreSaveResult {
  savedIds: string[];
}

interface Props {
  /** Áreas já cadastradas (para resolver pais por contenção e oferecer override). */
  existingAreas: Area[];
  /** Organização atual (para carregar o catálogo "Tipos de Locais"). */
  organizationId: string;
  /** A fazenda já tem contorno gravado? (aviso de sobrescrita). */
  hasPerimeter: boolean;
  busy?: boolean;
  /** Níveis ativos da fazenda (controla os toggles Ativo/Inativo dos cards). */
  levels?: { retiro: boolean; setor: boolean; local: boolean };
  /** Liga/desliga um nível da fazenda (persiste); ausência esconde os toggles. */
  onToggleLevel?: (nivel: 'retiro' | 'setor' | 'local') => void | Promise<void>;
  onClose: () => void;
  onConfirm: (payload: MestreSavePayload) => Promise<MestreSaveResult | void> | void;
  /** Persiste o KMZ assim que importado (arquivo de referência): o `file` bruto
   *  original + o `.kmz` já corrigido (linhas fechadas→polígonos) + o GeoJSON
   *  corrigido + o relatório da correção. É re-chamável nas ações desfazer/forçar
   *  do resumo — o container faz UPSERT (mesmo `file` ⇒ atualiza a mesma linha). */
  onImportOriginal?: (payload: {
    file: File;
    geojson: GeoJSON.FeatureCollection;
    correctedKmz?: Blob;
    correcaoReport?: LineToPolyReport;
  }) => void | Promise<void>;
  onToast?: ToastFn;
  /**
   * Quando definido, esta tela é usada como tela inicial (não modal transitório)
   * e o rodapé ganha abas: "Cadastro de áreas" (ativa) e "Colunas". Selecionar
   * "Colunas" chama isto para o container exibir as colunas das áreas cadastradas.
   */
  onShowColumns?: () => void;
  /**
   * Renderiza embutida (preenche o container pai, sem `fixed`/backdrop) em vez de
   * modal flutuante. Esconde o chrome de modal (X, tela cheia, abas do rodapé,
   * Cancelar) — a navegação fica a cargo das abas do container.
   */
  embedded?: boolean;
  /**
   * Mapas de referência JÁ persistidos (farm_maps) — KML/KMZ cru importado em
   * sessões anteriores. O container (CadastroAreasView) carrega esses overlays e
   * os repassa aqui para que sejam renderizados (camada laranja ao fundo). Sem
   * isto, um mapa importado e salvo só aparecia no mapa do container — que fica
   * ESCONDIDO atrás desta tela mestra — sumindo ao sair e voltar (o `geojson`
   * local cobre apenas o arquivo importado nesta sessão).
   */
  referenceMaps?: FarmMapData[];
  /**
   * TODOS os arquivos KML/KMZ já subidos para a fazenda (independente da
   * visibilidade do overlay). Alimenta a lista "Arquivos importados" abaixo do
   * botão de importar, onde cada arquivo pode ser excluído.
   */
  uploadedMaps?: FarmMapData[];
  /** Exclui um arquivo importado (remove a linha em farm_maps E o blob no B2). */
  onDeleteMap?: (m: FarmMapData) => void | Promise<void>;
  /** Somente leitura: esconde os controles de edição (ex.: linha do tempo). */
  readOnly?: boolean;
  /**
   * Edita nome/estilo de um Retiro/Setor JÁ salvo — disparado ao clicar na área no
   * mapa. O container persiste (updateAreaStyle) e recarrega. Ausência ⇒ sem edição.
   */
  onEditSavedArea?: (
    areaId: string,
    patch: { nome: string; strokeColor: string; fillColor: string; fillOpacity: number; strokeWeight: number },
  ) => void | Promise<void>;
  /** Redesenha a GEOMETRIA (vértices) de uma área JÁ salva — disparado ao concluir
   *  a edição de forma no mapa. O container persiste (ledger p/ local, geometria
   *  direta p/ retiro/setor/linha) e recarrega. Ausência ⇒ sem edição de forma salva. */
  onEditSavedGeometry?: (areaId: string, coords: [number, number][]) => void | Promise<void>;
  /** Exclui uma área JÁ salva (polígono ou linha), clicada no mapa. */
  onDeleteSavedArea?: (areaId: string) => void | Promise<void>;
  /** Exclui um arquivo KMZ (Original ou Produção) e limpa o que foi feito nele — o
   *  container apaga o arquivo e, se for produção, as áreas geradas (sequenciado). */
  onDeleteArquivo?: (m: FarmMapData, isProd: boolean) => void | Promise<void>;
  /**
   * Aba ativa CONTROLADA pelo container (embutida): 'mapa' (cadastro no mapa) ou
   * 'uso' (relatório "Uso da terra"). Quando definido, o container desenha a barra
   * de abas e esta tela só obedece — a barra interna do overlay fica oculta.
   * Ausência ⇒ estado interno (abas internas do overlay/topo/rodapé).
   */
  mestreView?: 'mapa' | 'uso';
  /** Notifica o container quando a aba interna muda (ex.: voltar do "Uso da terra"). */
  onMestreViewChange?: (view: 'mapa' | 'uso') => void;
}

const SAT_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const FALLBACK_CENTER: [number, number] = [-15.553, -52.104];

/** Remoção blindada (o Leaflet estoura ao remover um path ainda não renderizado). */
function safeRemoveLayer(map: L.Map | null, layer: L.Layer) {
  try {
    map?.removeLayer(layer);
  } catch {
    /* path ainda não renderizado — ignora */
  }
}

const uuid = () => crypto.randomUUID();

function defaultNome(nivel: Nivel): string {
  if (nivel === 'fazenda') return 'Contorno da fazenda';
  return `Novo ${NIVEIS[nivel].label}`;
}

/** Estilo Leaflet de uma área-rascunho conforme nível/seleção/manter. */
function draftStyle(it: DraftArea, selected: boolean): L.PathOptions {
  if (!it.keep) {
    return { color: '#94a3b8', weight: 1.5, opacity: 0.9, dashArray: '4 4', fillColor: '#94a3b8', fillOpacity: 0.05 };
  }
  const n = NIVEIS[it.nivel];
  // Estilo escolhido (retiro/setor) tem prioridade; null ⇒ padrão do nível.
  // `??`/`!= null` porque opacidade 0 (totalmente transparente) é válida.
  const stroke = it.strokeColor ?? n.cor;
  const fill = it.fillColor ?? n.cor;
  const fillOp = it.fillOpacity != null ? it.fillOpacity : n.fill;
  // Espessura escolhida tem prioridade; selecionado ganha +1,5 px de destaque.
  const baseWeight = it.strokeWeight != null ? it.strokeWeight : it.nivel === 'fazenda' ? 3.5 : 2;
  return {
    color: stroke,
    weight: selected ? baseWeight + 1.5 : baseWeight,
    opacity: 1,
    fillColor: fill,
    fillOpacity: selected ? Math.min(1, fillOp + 0.14) : fillOp,
    dashArray: it.nivel === 'fazenda' ? '7 5' : undefined,
  };
}

/** Rótulo do tipo de geometria (filtro/coluna do de-para). */
const geomLabel = (k: 'area' | 'point' | 'line'): string => (k === 'point' ? 'Ponto' : k === 'line' ? 'Linha' : 'Polígono');

/** Um farm_map é o mapa de PRODUÇÃO? (vs Original). Detector único usado em todos os pontos. */
const isProdMap = (m: FarmMapData): boolean =>
  /mapa|contorno|produ/.test(`${m.original_name || ''} ${m.file_name || ''}`.toLowerCase());

/** Geometria válida p/ persistir: ponto = 1 coord; linha ≥2; área (anel) ≥3. */
function validGeom(coords: [number, number][], geomKind: 'area' | 'point' | 'line'): boolean {
  const n = cleanRing(coords).length;
  if (geomKind === 'point') return n === 1;
  if (geomKind === 'line') return n >= 2;
  return n >= 3;
}

/** Normaliza nome p/ casar feição importada ↔ Área já salva (sem acento/caixa/espaços). */
function normNome(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Centroide simples (média dos vértices) em [lat,lng]; null se vazio. */
function centroidOf(coords: [number, number][]): [number, number] | null {
  const r = cleanRing(coords);
  if (!r.length) return null;
  let lat = 0;
  let lng = 0;
  for (const [a, b] of r) {
    lat += a;
    lng += b;
  }
  return [lat / r.length, lng / r.length];
}

/** geomKind de uma Área salva (inferido a partir das coords quando ausente). */
function areaGeomKind(a: Area): 'area' | 'point' | 'line' {
  if (a.geomKind) return a.geomKind;
  const n = cleanRing(a.coords).length;
  return n <= 1 ? 'point' : n === 2 ? 'line' : 'area';
}

/**
 * Re-hidratação do de-para: casa cada feição importada AINDA pendente com uma Área
 * já gravada no banco (existingAreas), por NOME (sinal forte: o Local nasce com o
 * nome da feição) e/ou GEOMETRIA (centróide praticamente coincidente — a geometria
 * salva veio da própria feição). Casamento GULOSO 1-para-1: cada Área vincula a no
 * máximo uma linha. Devolve os patches que marcam a linha como "salvo" (keep + saved
 * + destino), para que ao reabrir a tela os ATRIBUÍDOS apareçam junto dos pendentes.
 */
function matchSavedAreas(
  pendentes: DraftArea[],
  areas: Area[],
  tipoCatId: (tipo: string | null) => string | null,
): { itemId: string; patch: Partial<DraftArea> }[] {
  const dist2 = (p: [number, number], q: [number, number]) => {
    const dlat = p[0] - q[0];
    const dlng = p[1] - q[1];
    return dlat * dlat + dlng * dlng;
  };
  const NEAR2 = 3e-4 * 3e-4; // ~30 m: "perto" (sinal fraco)
  const VERY_NEAR2 = 5e-5 * 5e-5; // ~5 m: "praticamente coincidente" (sinal forte)

  type Cand = { item: DraftArea; area: Area; score: number };
  const cands: Cand[] = [];
  for (const item of pendentes) {
    const inome = normNome(item.nome);
    const ic = centroidOf(item.coords);
    for (const area of areas) {
      if (areaGeomKind(area) !== item.geomKind) continue; // só casa mesma geometria
      const nameEq = !!inome && inome === normNome(area.nome);
      const ac = centroidOf(area.coords);
      const d2 = ic && ac ? dist2(ic, ac) : Infinity;
      const veryNear = d2 <= VERY_NEAR2;
      const near = d2 <= NEAR2;
      // ratio de área (só polígono) p/ reforçar/confirmar o casamento por geometria.
      let areaOk = true;
      if (item.geomKind === 'area') {
        const aa = Math.max(1, areaM2(area.coords));
        const bb = Math.max(1, item.areaM2 || areaM2(item.coords));
        const r = aa / bb;
        areaOk = r >= 0.8 && r <= 1.25;
      }
      let score = 0;
      if (nameEq) score += 2;
      if (veryNear) score += 2;
      else if (near) score += 1;
      if (near && areaOk && item.geomKind === 'area') score += 1;
      // Aceita: NOME igual; OU geometria praticamente coincidente (com área compatível
      // p/ polígono). Exige score ≥ 2 → nunca casa por sinal isolado fraco.
      const accept = nameEq || (veryNear && (item.geomKind !== 'area' || areaOk));
      if (accept && score >= 2) cands.push({ item, area, score });
    }
  }
  cands.sort((a, b) => b.score - a.score); // guloso: casamentos mais fortes primeiro
  const usedItems = new Set<string>();
  const usedAreas = new Set<string>();
  const out: { itemId: string; patch: Partial<DraftArea> }[] = [];
  for (const c of cands) {
    if (usedItems.has(c.item.id) || usedAreas.has(c.area.id)) continue;
    usedItems.add(c.item.id);
    usedAreas.add(c.area.id);
    const a = c.area;
    const isLocal = a.nivel === 'local';
    out.push({
      itemId: c.item.id,
      patch: {
        keep: true,
        saved: true,
        localId: a.id,
        nivel: a.nivel,
        tipo: isLocal ? a.tipo ?? null : null,
        detalhe: isLocal ? a.detalhe ?? null : null,
        categoriaId: isLocal ? tipoCatId(a.tipo) : null,
        naoImportar: false,
        sugerido: false,
      },
    });
  }
  return out;
}

/** Monta as áreas-rascunho a partir do resultado da importação KML. */
function buildItems(r: KmlImportResult): DraftArea[] {
  const out: DraftArea[] = [];
  
  // 1. Perímetro (se detectado)
  if (r.perimeter && r.perimeter.length >= 3) {
    const coords = cleanRing(r.perimeter);
    if (coords.length >= 3) {
      out.push({
        id: uuid(),
        nome: 'Contorno da fazenda',
        nivel: 'fazenda',
        coords,
        tipo: null,
        detalhe: null,
        categoriaId: null,
        geomKind: 'area',
        source: 'perimeter',
        keep: true,
        parentId: null,
        areaM2: areaM2(coords),
        strokeColor: null,
        fillColor: null,
        fillOpacity: null,
        strokeWeight: null,
      });
    }
  }

  // 2-4. Demais feições (polígonos, pontos e linhas) do GeoJSON cru — reusável na
  // re-hidratação ao reabrir a tela a partir de um KMZ já salvo.
  out.push(...buildItemsFromGeojson(r.geojson));
  return out;
}

/**
 * Rascunhos das feições BRUTAS (polígonos, pontos e linhas) do GeoJSON cru — é o
 * conteúdo da coluna ORIGEM do de-para. Extraído de `buildItems` para ser reusado
 * na RE-HIDRATAÇÃO: ao reabrir a tela mestra a partir de um KMZ já salvo (auto-load),
 * reconstruímos a lista a partir do GeoJSON persistido em `farm_maps`. Sem isto,
 * voltar à tela mostrava o overlay porém com a lista vazia ("Nenhuma feição"),
 * obrigando o usuário a excluir e reimportar o arquivo.
 */
function buildItemsFromGeojson(geojson: GeoJSON.FeatureCollection): DraftArea[] {
  const out: DraftArea[] = [];

  // Polígonos
  let polyIndex = 0;
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const name = (f.properties?.name as string) || (f.properties?.Name as string) || `Polígono ${++polyIndex}`;
      const rings = g.type === 'Polygon'
        ? [g.coordinates[0] as [number, number][]]
        : (g.coordinates as number[][][][]).map((p) => p[0] as [number, number][]);
      for (const ring of rings) {
        const sysRing = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
        const clean = cleanRing(sysRing);
        if (clean.length >= 3) {
          // Proveniência da correção linha→polígono (ExtendedData → properties).
          const corrigido = f.properties?.__corrigido === '1' || f.properties?.__corrigido === true;
          const gapRaw = f.properties?.__gapM;
          out.push({
            id: uuid(),
            nome: name,
            nivel: 'local',
            coords: clean,
            tipo: null,
            detalhe: null,
            categoriaId: null,
            geomKind: 'area',
            source: 'paddock',
            keep: false,
            parentId: null,
            areaM2: areaM2(clean),
            strokeColor: null,
            fillColor: null,
            fillOpacity: null,
            strokeWeight: null,
            srcTipo: (f.properties?.tipo as string) ?? null,
            corrigido: corrigido || undefined,
            corrigidoGapM: corrigido && gapRaw != null ? Number(gapRaw) : undefined,
          });
        }
      }
    }
  }

  // Pontos
  let ptIndex = 0;
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Point' || g.type === 'MultiPoint') {
      const name = (f.properties?.name as string) || (f.properties?.Name as string) || `Ponto ${++ptIndex}`;
      const pts = g.type === 'Point'
        ? [[g.coordinates[1], g.coordinates[0]] as [number, number]]
        : (g.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
      for (const pt of pts) {
        const clean = cleanRing([pt]);
        if (clean.length === 1) {
          out.push({
            id: uuid(),
            nome: name,
            nivel: 'local',
            coords: clean,
            tipo: null,
            detalhe: null,
            categoriaId: null,
            geomKind: 'point',
            source: 'point',
            keep: false,
            parentId: null,
            areaM2: 0,
            strokeColor: null,
            fillColor: null,
            fillOpacity: null,
            strokeWeight: null,
            srcTipo: (f.properties?.tipo as string) ?? null,
          });
        }
      }
    }
  }

  // Linhas (traços: cercas, estradas, rede hidráulica)
  let lineIndex = 0;
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const name = (f.properties?.name as string) || (f.properties?.Name as string) || `Linha ${++lineIndex}`;
      const lines = g.type === 'LineString'
        ? [g.coordinates as number[][]]
        : (g.coordinates as number[][][]);
      for (const line of lines) {
        const sys = line.map(([lng, lat]) => [lat, lng] as [number, number]);
        const clean = cleanRing(sys);
        if (clean.length >= 2) {
          out.push({
            id: uuid(),
            nome: name,
            nivel: 'local',
            coords: clean,
            tipo: null,
            detalhe: null,
            categoriaId: null,
            geomKind: 'line',
            source: 'paddock',
            keep: false,
            parentId: null,
            areaM2: 0,
            strokeColor: null,
            fillColor: null,
            fillOpacity: null,
            strokeWeight: null,
            srcTipo: (f.properties?.tipo as string) ?? null,
          });
        }
      }
    }
  }

  return out;
}

/** Modal rápido: ao clicar num polígono, atribui Nome + Tipo de local (catálogo). */
/**
 * Caixa de classificação de um Local em 3 níveis em cascata do catálogo "Tipos de
 * Locais": Categoria → Tipo → Detalhe (+ Nome). Abre ao clicar num polígono do
 * mapa importado (criar + classificar) ou num rascunho já criado (re-editar). Vem
 * pré-preenchida pelo que o mapa original tiver (nome do placemark + palpite de
 * tipo/detalhe). Valores legados/free-text fora do catálogo viram opção "(atual)".
 */
const ClassificarLocalModal: React.FC<{
  item: DraftArea;
  catalog: { categorias: TipoLocalCategoria[]; tipos: TipoLocalItem[]; detalhes?: TipoLocalDetalhe[] } | null;
  onClose: () => void;
  onSave: (nome: string, categoriaId: string | null, tipo: string | null, detalhe: string | null) => void;
}> = ({ item, catalog, onClose, onSave }) => {
  const tiposPorCat = useMemo(() => {
    const m = new Map<string, TipoLocalItem[]>();
    (catalog?.tipos ?? []).forEach((t) => {
      const arr = m.get(t.categoriaId);
      if (arr) arr.push(t);
      else m.set(t.categoriaId, [t]);
    });
    return m;
  }, [catalog]);
  const detalhesPorTipo = useMemo(() => {
    const m = new Map<string, TipoLocalDetalhe[]>();
    (catalog?.detalhes ?? []).forEach((d) => {
      const arr = m.get(d.tipoId);
      if (arr) arr.push(d);
      else m.set(d.tipoId, [d]);
    });
    return m;
  }, [catalog]);
  const tipoByNome = useMemo(
    () => new Map((catalog?.tipos ?? []).map((t) => [t.nome, t] as const)),
    [catalog],
  );

  const [nome, setNome] = useState(item.nome);
  // Semeia categoria: a explícita do item, senão a do tipo casado no catálogo.
  const [categoriaId, setCategoriaId] = useState<string>(
    item.categoriaId ?? (item.tipo ? tipoByNome.get(item.tipo)?.categoriaId ?? '' : ''),
  );
  const [tipo, setTipo] = useState<string>(item.tipo ?? '');
  const [detalhe, setDetalhe] = useState<string>(item.detalhe ?? '');

  const knownTipos = useMemo(() => new Set((catalog?.tipos ?? []).map((t) => t.nome)), [catalog]);
  const tipoSel = tipo ? tipoByNome.get(tipo) ?? null : null;
  const detalhesDoTipo = tipoSel ? detalhesPorTipo.get(tipoSel.id) ?? [] : [];
  const knownDetalhes = new Set(detalhesDoTipo.map((d) => d.nome));

  const tiposDaCat = categoriaId ? tiposPorCat.get(categoriaId) ?? [] : [];

  const onChangeCategoria = (id: string) => {
    setCategoriaId(id);
    setTipo('');
    setDetalhe('');
  };
  const onChangeTipo = (nm: string) => {
    setTipo(nm);
    setDetalhe('');
    // Mantém a categoria coerente com o tipo escolhido.
    const cat = nm ? tipoByNome.get(nm)?.categoriaId : undefined;
    if (cat) setCategoriaId(cat);
  };

  const save = () => {
    const t = tipo || null;
    const cat = (t ? tipoByNome.get(t)?.categoriaId : null) ?? (categoriaId || null);
    onSave(nome.trim() || item.nome, cat, t, detalhe || null);
  };

  const selectCls =
    'rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="w-[420px] max-w-full rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[16px] font-bold text-gray-900">Classificar local</h3>
            <div className="mt-0.5 text-[12.5px] text-gray-500">
              Defina o nome e a classificação desta área ({fmtArea(item.areaM2)}).
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
              placeholder="Ex.: Pasto Cabeceira 1"
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          {/* Categoria (1º nível) */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">Categoria</label>
            <select value={categoriaId} onChange={(e) => onChangeCategoria(e.target.value)} className={selectCls}>
              <option value="">— sem categoria —</option>
              {(catalog?.categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          {/* Tipo (2º nível) — filtrado pela categoria */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">Tipo de local</label>
            <select value={tipo} onChange={(e) => onChangeTipo(e.target.value)} className={selectCls}>
              <option value="">— sem tipo —</option>
              {tipo && !knownTipos.has(tipo) && <option value={tipo}>{tipo} (atual)</option>}
              {tiposDaCat.map((t) => (
                <option key={t.id} value={t.nome}>
                  {t.nome}
                </option>
              ))}
            </select>
            {!categoriaId && (
              <span className="text-[11px] text-gray-400">Escolha uma categoria para listar os tipos.</span>
            )}
          </div>
          {/* Detalhe (3º nível) — filtrado pelo tipo */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">Detalhe</label>
            <select
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              disabled={!tipoSel && !detalhe}
              className={selectCls}
            >
              <option value="">— sem detalhe —</option>
              {detalhe && !knownDetalhes.has(detalhe) && <option value={detalhe}>{detalhe} (atual)</option>}
              {detalhesDoTipo.map((d) => (
                <option key={d.id} value={d.nome}>
                  {d.nome}
                </option>
              ))}
            </select>
            {tipoSel && detalhesDoTipo.length === 0 && (
              <span className="text-[11px] text-gray-400">Este tipo não tem detalhes cadastrados.</span>
            )}
          </div>
          {!catalog?.tipos.length && (
            <span className="text-[11px] text-gray-400">Cadastre tipos em "Tipos de Locais" para classificar.</span>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Check size={16} /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Modal de estilo de um Retiro/Setor: nome + cor da linha (perímetro) + cor do
 * preenchimento + transparência. Aberto ao desenhar e ao clicar numa área já
 * salva (aí mostra também o botão Excluir). A transparência é o inverso da
 * opacidade (transp% = (1 − fillOpacity) × 100); persistimos a opacidade 0–1.
 */
/** Paleta de cores pré-definidas (swatches) usada na seleção de linha/preenchimento. */
const STYLE_PALETTE = [
  '#16a34a', '#10b981', '#22c55e', '#4d7c0f', '#0d9488', '#06b6d4', '#0ea5e9', '#3b82f6', '#2563eb', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#7c3f12',
  '#111827', '#6b7280', '#ffffff',
];

/** Grade de swatches clicáveis; o swatch ativo ganha anel de destaque. */
const SwatchGrid: React.FC<{ value: string; onChange: (c: string) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className={`flex flex-wrap gap-1.5 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
    {STYLE_PALETTE.map((c) => {
      const active = value.toLowerCase() === c.toLowerCase();
      return (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
            active ? 'ring-2 ring-offset-1 ring-gray-800' : 'border-black/10'
          }`}
          style={{ background: c }}
        />
      );
    })}
  </div>
);

/** Resumo da correção automática de linhas fechadas → polígonos aplicada ao
 *  importar um KMZ/KML. Mostra ao usuário o que foi feito (convertidas), o que
 *  ficou de fora e por quê, com ações por feição: "desfazer" (volta a ser linha)
 *  e "converter mesmo assim" (para as fechadas ignoradas por nome). */
const CorrecaoResumoModal: React.FC<{
  report: LineToPolyReport;
  recorrigindo: boolean;
  onClose: () => void;
  onToggleConvertida: (e: ConvertidaEntry) => void;
  onToggleIgnoradaNome: (e: IgnoradaNomeEntry) => void;
}> = ({ report, recorrigindo, onClose, onToggleConvertida, onToggleIgnoradaNome }) => {
  const [showAbertas, setShowAbertas] = useState(false);
  const aplicadas = report.convertidas.filter((c) => c.aplicada).length;
  const forcadas = report.ignoradasNome.filter((c) => c.forcada).length;
  const nDegeneradas = report.ignoradasGeom.length;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-[460px] max-w-full flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <Wand2 size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[16px] font-bold text-gray-900">Correção automática do mapa</h3>
            <div className="mt-0.5 text-[12.5px] text-gray-500">
              Áreas desenhadas como <b>linha</b> foram convertidas em <b>polígono</b>. O arquivo é
              salvo já corrigido; o original é preservado.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Resumo em números */}
        <div className="flex flex-wrap gap-1.5 px-5 py-2 text-[11px]">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
            {aplicadas} convertida{aplicadas === 1 ? '' : 's'}
          </span>
          {report.poligonosExistentes > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
              {report.poligonosExistentes} já {report.poligonosExistentes === 1 ? 'era' : 'eram'} polígono
            </span>
          )}
          {report.pontos > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
              {report.pontos} ponto{report.pontos === 1 ? '' : 's'}
            </span>
          )}
          {report.mantidasAbertas.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
              {report.mantidasAbertas.length} linha{report.mantidasAbertas.length === 1 ? '' : 's'} aberta{report.mantidasAbertas.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Corpo (scroll) */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-1">
          {recorrigindo && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Loader2 size={22} className="animate-spin text-indigo-600" />
            </div>
          )}

          {/* Convertidas */}
          {report.convertidas.length > 0 && (
            <section className="mb-3">
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                Convertidas em área
              </h4>
              <ul className="flex flex-col gap-1">
                {report.convertidas.map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                      c.aplicada ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-gray-50 opacity-70'
                    }`}
                  >
                    <Square size={13} className="shrink-0 text-emerald-600" />
                    <span className={`min-w-0 flex-1 truncate ${c.aplicada ? 'text-gray-800' : 'text-gray-500 line-through'}`}>
                      {c.nome}
                    </span>
                    <span className="shrink-0 tabular-nums text-[11px] text-gray-500">
                      {c.areaHa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha
                    </span>
                    <button
                      type="button"
                      disabled={recorrigindo}
                      onClick={() => onToggleConvertida(c)}
                      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-500 hover:bg-white disabled:opacity-50"
                      title={c.aplicada ? 'Manter como linha (desfazer)' : 'Converter de novo'}
                    >
                      {c.aplicada ? <><RotateCcw size={12} /> desfazer</> : <><Wand2 size={12} /> refazer</>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Ignoradas por nome (candidatas a "converter mesmo assim") */}
          {report.ignoradasNome.length > 0 && (
            <section className="mb-3">
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                Fechadas, mas o nome parece de estrada/cerca/rede
              </h4>
              <p className="mb-1.5 text-[11px] text-gray-500">
                Não convertidas por precaução. Converta se forem áreas de verdade.
              </p>
              <ul className="flex flex-col gap-1">
                {report.ignoradasNome.map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                      c.forcada ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
                    }`}
                  >
                    {c.forcada ? <Square size={13} className="shrink-0 text-emerald-600" /> : <Spline size={13} className="shrink-0 text-amber-600" />}
                    <span className="min-w-0 flex-1 truncate text-gray-800">{c.nome}</span>
                    <span className="shrink-0 tabular-nums text-[11px] text-gray-500">
                      {c.areaHa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha
                    </span>
                    <button
                      type="button"
                      disabled={recorrigindo}
                      onClick={() => onToggleIgnoradaNome(c)}
                      className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                        c.forcada ? 'text-gray-500 hover:bg-white' : 'text-emerald-700 hover:bg-white'
                      }`}
                      title={c.forcada ? 'Manter como linha (desfazer)' : 'Converter mesmo assim'}
                    >
                      {c.forcada ? <><RotateCcw size={12} /> desfazer</> : <><Wand2 size={12} /> converter</>}
                    </button>
                  </li>
                ))}
              </ul>
              {forcadas > 0 && (
                <div className="mt-1 text-[10.5px] text-emerald-700">{forcadas} forçada(s) a converter.</div>
              )}
            </section>
          )}

          {/* Mantidas abertas (colapsável) */}
          {report.mantidasAbertas.length > 0 && (
            <section className="mb-2">
              <button
                type="button"
                onClick={() => setShowAbertas((v) => !v)}
                className="flex w-full items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-500 hover:text-gray-700"
              >
                {showAbertas ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Mantidas como linha ({report.mantidasAbertas.length})
              </button>
              {showAbertas && (
                <ul className="mt-1 flex flex-col gap-1">
                  {report.mantidasAbertas.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px]">
                      <Spline size={13} className="shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-gray-600">{c.nome}</span>
                      <span className="shrink-0 text-[10.5px] text-gray-400">abertura {c.gapM} m</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {nDegeneradas > 0 && (
            <div className="mb-2 text-[10.5px] text-gray-400">
              {nDegeneradas} feição(ões) ignorada(s) por geometria inválida (poucos pontos ou área ínfima).
            </div>
          )}

          {report.convertidas.length === 0 && report.ignoradasNome.length === 0 && (
            <div className="py-6 text-center text-[13px] text-gray-500">
              Nenhuma linha fechada para converter — o arquivo já estava correto. 👍
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Check size={16} /> Entendi
          </button>
        </div>
      </div>
    </div>
  );
};

const EstiloAreaModal: React.FC<{
  nivel: Nivel;
  nome: string;
  areaM2: number;
  strokeColor: string | null;
  fillColor: string | null;
  fillOpacity: number | null;
  strokeWeight: number | null;
  /** edição de área já salva → exibe o botão Excluir. */
  onDelete?: () => void;
  onClose: () => void;
  onSave: (nome: string, strokeColor: string, fillColor: string, fillOpacity: number, strokeWeight: number) => void;
}> = ({ nivel, nome: nome0, areaM2: m2, strokeColor, fillColor, fillOpacity, strokeWeight, onDelete, onClose, onSave }) => {
  const n = NIVEIS[nivel];
  const [nome, setNome] = useState(nome0);
  const [stroke, setStroke] = useState(strokeColor ?? n.cor);
  const [fill, setFill] = useState(fillColor ?? n.cor);
  // Espessura da linha em px (1–8). Default: o escolhido OU o padrão do nível
  // (perímetro/Fazenda é mais grosso, 3 px; demais, 2 px) p/ não afinar sem querer.
  const [weight, setWeight] = useState(strokeWeight != null ? strokeWeight : nivel === 'fazenda' ? 3 : 2);
  // "Sem preenchimento" = opacidade 0 (apenas contorno). Estado derivado do valor entrante.
  const [noFill, setNoFill] = useState(fillOpacity === 0);
  // Slider em % de TRANSPARÊNCIA (0 = opaco, 100 = invisível). Opacidade = 1 − t/100.
  const op0 = fillOpacity != null && fillOpacity > 0 ? fillOpacity : n.fill;
  const [transp, setTransp] = useState(Math.round((1 - op0) * 100));
  const opacity = noFill ? 0 : 1 - transp / 100;

  const save = () => onSave(nome.trim() || defaultNome(nivel), stroke, fill, opacity, weight);

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="max-h-[92vh] w-[440px] max-w-full overflow-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[16px] font-bold text-gray-900">
              {nivel === 'fazenda' ? 'Estilo do perímetro' : `Estilo do ${n.label}`}
            </h3>
            <div className="mt-0.5 text-[12.5px] text-gray-500">
              {nivel === 'fazenda'
                ? `Defina as cores do contorno da fazenda (${fmtArea(m2)}).`
                : `Defina o nome e as cores deste ${n.label.toLowerCase()} (${fmtArea(m2)}).`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3.5 px-5 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={nivel === 'fazenda'}
              autoFocus={nivel !== 'fazenda'}
              placeholder={`Ex.: ${n.label} Sede`}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-[13.5px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Pré-visualização (topo) — fundo xadrez para revelar a transparência. */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-gray-700">Pré-visualização</label>
            <div
              className="flex h-24 items-center justify-center rounded-lg border border-gray-100"
              style={{
                backgroundImage:
                  'linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)',
                backgroundSize: '14px 14px',
                backgroundPosition: '0 0,0 7px,7px -7px,-7px 0',
              }}
            >
              <svg viewBox="0 0 120 56" className="h-[72%] w-[80%]" preserveAspectRatio="none">
                <polygon
                  points="8,48 24,8 112,12 96,50"
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={stroke}
                  strokeWidth={weight}
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {nivel === 'fazenda' && (
            <p className="-mt-1 text-[11px] text-gray-400">
              O nome do perímetro é o nome da fazenda (editado em Dados Gerais).
            </p>
          )}
          {/* Cor da linha — paleta de swatches */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-gray-700">Cor da linha</label>
            <SwatchGrid value={stroke} onChange={setStroke} />
          </div>

              {/* Espessura da linha */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between text-[12px] font-semibold text-gray-700">
                  <span>Espessura da linha</span>
                  <span className="tabular-nums text-gray-500">{weight} px</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>

              {/* Preenchimento — checkbox "sem preenchimento" + paleta */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-gray-700">Preenchimento</label>
                <label className="flex w-fit items-center gap-2 text-[12px] text-gray-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={noFill}
                    onChange={(e) => setNoFill(e.target.checked)}
                  />
                  Sem preenchimento (apenas contorno)
                </label>
                <SwatchGrid value={fill} onChange={setFill} disabled={noFill} />
              </div>

              {/* Transparência do preenchimento */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between text-[12px] font-semibold text-gray-700">
                  <span>Transparência do preenchimento</span>
                  <span className="tabular-nums text-gray-500">{noFill ? '—' : `${transp}%`}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={transp}
                  disabled={noFill}
                  onChange={(e) => setTransp(Number(e.target.value))}
                  className="w-full accent-emerald-600 disabled:opacity-40"
                />
              </div>
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Check size={16} /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

const outerRingsOfGeoJSON = (g: GeoJSON.Geometry): [number, number][][] => {
  if (g.type === 'Polygon') return [g.coordinates[0] as [number, number][]];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).map((p) => p[0] as [number, number][]);
  return [];
};

const toSystemRingCoords = (ring: [number, number][]): [number, number][] => {
  const flipped = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
  const clean = cleanRing(flipped);
  if (
    clean.length > 1 &&
    clean[0][0] === clean[clean.length - 1][0] &&
    clean[0][1] === clean[clean.length - 1][1]
  ) {
    clean.pop();
  }
  return clean;
};

/** Destino escolhido no de-para para um grupo de feições importadas. */
export type Destino =
  | { kind: 'perimetro'; nivel: 'fazenda' | 'retiro' | 'setor' }
  | { kind: 'tipo'; categoriaId: string; tipo: string }
  | { kind: 'none' };

/** Subtipos do "tipo" especial Perímetro (estrutura geográfica da fazenda). */
const PERIMETRO_OPCOES: { nivel: 'fazenda' | 'retiro' | 'setor'; label: string; cor: string }[] = [
  { nivel: 'fazenda', label: 'Fazenda', cor: NIVEIS.fazenda.cor },
  { nivel: 'retiro', label: 'Retiro', cor: NIVEIS.retiro.cor },
  { nivel: 'setor', label: 'Setor', cor: NIVEIS.setor.cor },
];

/** Dois destinos são iguais? (para detectar grupo homogêneo no de-para). */
function sameDestino(a: Destino | null, b: Destino | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'perimetro' && b.kind === 'perimetro') return a.nivel === b.nivel;
  if (a.kind === 'tipo' && b.kind === 'tipo') return a.categoriaId === b.categoriaId && a.tipo === b.tipo;
  return true; // ambos 'none'
}

/**
 * Popover buscável de destino do de-para: lista o "tipo" Perímetro (Fazenda/Retiro/
 * Setor) e, abaixo, as categorias do catálogo com seus tipos. Posição fixa (escapa
 * do overflow da tabela). Rodapé: "Não importar este grupo".
 */
const DestinoPicker: React.FC<{
  anchor: DOMRect;
  catalog: { categorias: TipoLocalCategoria[]; tipos: TipoLocalItem[] } | null;
  tiposByCat: Map<string, TipoLocalItem[]>;
  /** mostra o "tipo" Perímetro? (só quando o grupo tem polígono — perímetro não é ponto). */
  allowPerimetro: boolean;
  /** níveis de perímetro ATIVOS na fazenda (Fazenda sempre; Retiro/Setor conforme config).
   *  undefined ⇒ todos permitidos (compatibilidade). */
  perimetroNiveis?: Set<'fazenda' | 'retiro' | 'setor'>;
  /** destino atual do grupo (marca a opção com ✓). */
  current: Destino | null;
  onPick: (d: Destino) => void;
  onClose: () => void;
}> = ({ anchor, catalog, tiposByCat, allowPerimetro, perimetroNiveis, current, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const ql = q.trim().toLowerCase();
  const perim = !allowPerimetro
    ? []
    : PERIMETRO_OPCOES.filter(
        (p) =>
          (!perimetroNiveis || perimetroNiveis.has(p.nivel)) &&
          (!ql || p.label.toLowerCase().includes(ql) || 'perímetro perimetro'.includes(ql)),
      );
  const cats = (catalog?.categorias ?? [])
    .map((c) => ({
      cat: c,
      tipos: (tiposByCat.get(c.id) ?? []).filter(
        (t) => !ql || t.nome.toLowerCase().includes(ql) || c.nome.toLowerCase().includes(ql),
      ),
    }))
    .filter((g) => g.tipos.length > 0);

  const width = 300;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 12));
  const top = Math.min(anchor.bottom + 4, Math.max(8, window.innerHeight - 372));

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top, left, width }}
      className="z-[2200] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
    >
      <div className="border-b border-gray-100 p-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/15">
          <Search size={13} className="shrink-0 text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tipo..."
            className="w-full bg-transparent text-[12.5px] outline-none"
          />
        </div>
      </div>
      <div className="max-h-[280px] overflow-auto py-1">
        {perim.length > 0 && (
          <>
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Perímetro
            </div>
            {perim.map((p) => {
              const sel = sameDestino(current, { kind: 'perimetro', nivel: p.nivel });
              return (
                <button
                  key={p.nivel}
                  type="button"
                  onClick={() => onPick({ kind: 'perimetro', nivel: p.nivel })}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-gray-50"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded" style={{ background: `${p.cor}1a`, color: p.cor }}>
                    <Square size={12} />
                  </span>
                  <span className="flex-1 text-gray-800">{p.label}</span>
                  {sel && <Check size={14} className="shrink-0 text-emerald-600" />}
                </button>
              );
            })}
          </>
        )}
        {cats.map(({ cat, tipos }) => {
          const catCor = cat.cor ?? '#9ca3af';
          return (
            <React.Fragment key={cat.id}>
              <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: catCor }}>
                {cat.nome}
              </div>
              {tipos.map((t) => {
                const tcor = t.cor || cat.cor || '#6b7280';
                const sel = sameDestino(current, { kind: 'tipo', categoriaId: cat.id, tipo: t.nome });
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onPick({ kind: 'tipo', categoriaId: cat.id, tipo: t.nome })}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-gray-50"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded" style={{ background: `${tcor}1a`, color: tcor }}>
                      <TipoIcon name={t.icone} size={12} fallback={<span className="h-1.5 w-1.5 rounded-full" style={{ background: tcor }} />} />
                    </span>
                    <span className="flex-1 text-gray-800">{t.nome}</span>
                    {sel && <Check size={14} className="shrink-0 text-emerald-600" />}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
        {perim.length === 0 && cats.length === 0 && (
          <div className="px-3 py-3 text-center text-[12px] text-gray-400">Nada encontrado.</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPick({ kind: 'none' })}
        className="flex w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-[12px] font-medium text-gray-500 hover:bg-gray-50"
      >
        <Minus size={13} /> Não importar este grupo
      </button>
    </div>
  );
};

const CadastroAreasMestre: React.FC<Props> = ({
  existingAreas,
  organizationId,
  busy = false,
  levels,
  onClose,
  onConfirm,
  onImportOriginal,
  onToast,
  onShowColumns,
  embedded = false,
  referenceMaps,
  uploadedMaps,
  readOnly = false,
  onEditSavedArea,
  onEditSavedGeometry,
  onDeleteSavedArea,
  onDeleteArquivo,
  mestreView,
  onMestreViewChange,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMapIds, setSelectedMapIds] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<DraftArea[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  // ── Correção automática linha→polígono (skill kmz-line-to-polygon) ──────────
  // Relatório da correção aplicada ao importar; abre o resumo e alimenta os selos.
  const [correcaoReport, setCorrecaoReport] = useState<LineToPolyReport | null>(null);
  const [showCorrecao, setShowCorrecao] = useState(false);
  // Overrides por feição (lpId): forçadas ("converter mesmo assim") e desfeitas.
  const [forceIds, setForceIds] = useState<Set<string>>(new Set());
  const [revertIds, setRevertIds] = useState<Set<string>>(new Set());
  // Recomputando a correção após uma ação do resumo (evita cliques concorrentes).
  const [recorrigindo, setRecorrigindo] = useState(false);
  // Mapa importado é guardado como camada de referência por padrão (auto ao carregar o KMZ).
  const [saveOverlay, setSaveOverlay] = useState(true);
  const [drawNivel, setDrawNivel] = useState<Nivel>('local');
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  /** tela cheia (ocupa toda a janela). */
  const [fullscreen, setFullscreen] = useState(false);
  /** aba ativa do rodapé/topo: 'mapa' (cadastro no mapa) ou 'uso' (relatório Uso da terra).
   *  Controlada pelo container quando `mestreView` é passado (embutida); senão interna. */
  const [internalView, setInternalView] = useState<'mapa' | 'uso'>('mapa');
  const view = mestreView ?? internalView;
  const setView = useCallback(
    (v: 'mapa' | 'uso') => {
      if (mestreView === undefined) setInternalView(v);
      onMestreViewChange?.(v);
    },
    [mestreView, onMestreViewChange],
  );
  /** diálogo "Data de referência" ao salvar (pergunta a data e grava com ela). */
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [dataRef, setDataRef] = useState<string>(todayIso());
  /** níveis ocultos no mapa (legenda/visualizador clicável). */
  const [hiddenLevels, setHiddenLevels] = useState<Set<Nivel>>(new Set());
  const toggleLevelVisibility = useCallback((nv: Nivel) => {
    setHiddenLevels((prev) => {
      const next = new Set(prev);
      if (next.has(nv)) next.delete(nv);
      else next.add(nv);
      return next;
    });
  }, []);
  /** retiros/setores individuais ocultos no mapa (legenda nomeada, por id). */
  const [hiddenAreaIds, setHiddenAreaIds] = useState<Set<string>>(new Set());
  const toggleAreaVisibility = useCallback((id: string) => {
    setHiddenAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  /**
   * Fonte exibida no mapa (botão "Mostrar no mapa"):
   *  - 'producao' (padrão): o NOVO mapa = itens classificados (editáveis), controlados pela legenda.
   *  - 'original': só a referência crua (KMZ importado/salvo) — laranja, NÃO editável.
   *  - 'ambos': os dois.
   * A legenda (ocultar/mostrar elementos) age SÓ na produção; o original é referência
   * e só aparece quando selecionado aqui (regra do usuário).
   */
  const [mapSource, setMapSource] = useState<'original' | 'producao' | 'ambos'>('producao');
  const showOriginal = mapSource === 'original' || mapSource === 'ambos';
  const showProducao = mapSource === 'producao' || mapSource === 'ambos';
  /** O nível está ativo na fazenda? (sem `levels`, considera tudo ativo.) */
  const levelActive = useCallback(
    (nv: Nivel): boolean => (nv === 'fazenda' ? true : !levels ? true : !!levels[nv as 'retiro' | 'setor' | 'local']),
    [levels],
  );
  /** Níveis de perímetro oferecidos no de-para/legenda: Fazenda sempre + Retiro/Setor
   *  só se ativos na fazenda. Quando a fazenda não tem subdivisões, sobra só o
   *  perímetro (Fazenda). */
  const perimetroNiveis = useMemo(
    () => new Set<'fazenda' | 'retiro' | 'setor'>((['fazenda', 'retiro', 'setor'] as const).filter((nv) => levelActive(nv))),
    [levelActive],
  );
  /** Níveis da hierarquia ATIVOS na fazenda, em ordem (Fazenda › … › Local). Os
   *  níveis desativados não aparecem no mapa (legenda/perímetro/visibilidade). */
  const activeOrdem = useMemo(() => ORDEM.filter((nv) => levelActive(nv)), [levelActive]);

  // ── Catálogo "Tipos de Locais" (categorias + tipos da organização) ────────
  const [catalog, setCatalog] = useState<{
    categorias: TipoLocalCategoria[];
    tipos: TipoLocalItem[];
    detalhes?: TipoLocalDetalhe[];
  } | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  /** categoria ativa no header: 'perimetro' (estrutura/import) ou um categoriaId. */
  const [activeCat, setActiveCat] = useState<'perimetro' | string>('perimetro');
  /** tipo expandido (mostra a lista de feições) no painel de categoria. */
  const [expandedTipo, setExpandedTipo] = useState<string | null>(null);
  /** ponto pendente: ao clicar no mapa, cria um Local-ponto deste tipo. */
  const [pointMode, setPointMode] = useState<{ tipo: string; categoriaId: string } | null>(null);
  /** id do Local cuja classificação (caixa Categoria→Tipo→Detalhe) está aberta. */
  const [assignId, setAssignId] = useState<string | null>(null);
  /** o Local da caixa acabou de ser criado pelo clique no mapa? (Cancelar descarta) */
  const [pendingClassifyIsNew, setPendingClassifyIsNew] = useState(false);
  /** id do RASCUNHO de retiro/setor em edição de estilo (ao desenhar ou clicar). */
  const [styleId, setStyleId] = useState<string | null>(null);
  /** id de um retiro/setor JÁ SALVO em edição de estilo (clicado no mapa). */
  const [savedEditId, setSavedEditId] = useState<string | null>(null);
  /** área JÁ salva (Produção) selecionada no mapa p/ Editar forma / Apagar. */
  const [savedSelId, setSavedSelId] = useState<string | null>(null);
  const savedSelIdRef = useRef<string | null>(null);
  /** camadas Leaflet das áreas salvas, por id (p/ o editor de vértices pegar a forma). */
  const savedLayersRef = useRef<Map<string, L.Polygon | L.Polyline>>(new Map());
  /** true enquanto se edita a forma de uma área SALVA (≠ rascunho): muda o destino
   *  do "Concluir forma" e faz o effect das áreas salvas não recriar a camada. */
  const editingSavedRef = useRef(false);
  /** categorias/tipos ocultos no visualizador (além dos níveis). */
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [hiddenTipos, setHiddenTipos] = useState<Set<string>>(new Set());

  // ── De-para do Geocadastro: feições importadas → destino (tipo/subtipo) ──
  /** busca por feição (filtra a lista do de-para). */
  const [groupQuery, setGroupQuery] = useState('');
  /** picker de destino aberto: chave do grupo + retângulo do gatilho (posição fixa). */
  const [openPicker, setOpenPicker] = useState<{ key: string; rect: DOMRect } | null>(null);
  /** picker de destino EM LOTE ("Identificar vários"): aloca todos os itens marcados
   *  ao mesmo destino. Só o retângulo do gatilho (os alvos vêm de checkedGroups). */
  const [bulkPicker, setBulkPicker] = useState<DOMRect | null>(null);
  /** "Sugerir destino" em andamento (heurística local + IA). */
  const [suggesting, setSuggesting] = useState(false);
  /** geometrias OCULTAS no de-para (filtro de tipo no cabeçalho da coluna Origem). */
  const [hiddenGeoms, setHiddenGeoms] = useState<Set<string>>(new Set());
  const [geomMenuOpen, setGeomMenuOpen] = useState(false);
  const geomMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!geomMenuOpen) return;
    const onDown = (e: MouseEvent) => { if (geomMenuRef.current && !geomMenuRef.current.contains(e.target as Node)) setGeomMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [geomMenuOpen]);
  /** menu "Arquivo KMZ" (lista Original + Produção com excluir). */
  const [arquivoMenuOpen, setArquivoMenuOpen] = useState(false);
  const arquivoMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!arquivoMenuOpen) return;
    const onDown = (e: MouseEvent) => { if (arquivoMenuRef.current && !arquivoMenuRef.current.contains(e.target as Node)) setArquivoMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [arquivoMenuOpen]);
  /** grupos marcados (checkbox) para exibir simultaneamente no mapa. */
  const [checkedGroups, setCheckedGroups] = useState<Set<string>>(new Set());
  const toggleCheckedGroup = useCallback((k: string) => {
    setCheckedGroups((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, []);
  const toggleGeom = useCallback((lab: string) => {
    setHiddenGeoms((prev) => { const n = new Set(prev); if (n.has(lab)) n.delete(lab); else n.add(lab); return n; });
  }, []);

  const catalogIndex = useMemo<CatalogIndex>(() => buildCatalogIndex(catalog), [catalog]);

  const tiposByCat = useMemo(() => {
    const m = new Map<string, TipoLocalItem[]>();
    (catalog?.tipos ?? []).forEach((t) => {
      const arr = m.get(t.categoriaId);
      if (arr) arr.push(t);
      else m.set(t.categoriaId, [t]);
    });
    return m;
  }, [catalog]);
  /** detalhes (3º nível) agrupados por tipoId. */
  const detalhesByTipo = useMemo(() => {
    const m = new Map<string, TipoLocalDetalhe[]>();
    (catalog?.detalhes ?? []).forEach((d) => {
      const arr = m.get(d.tipoId);
      if (arr) arr.push(d);
      else m.set(d.tipoId, [d]);
    });
    return m;
  }, [catalog]);

  // ── Relatório "Uso da terra" — Locais já cadastrados (polígonos com área),
  //    agrupados por Categoria › Tipo, com hectares e % da área total. ────────
  const usoTerra = useMemo(() => {
    type Item = { id: string; nome: string; detalhe: string | null; ha: number };
    type TipoGrp = { tipo: string; cor: string; icone: string | null; totalHa: number; items: Item[] };
    type CatGrp = { categoria: string; cor: string; totalHa: number; tipos: TipoGrp[] };

    // Só Locais que são polígonos de área (pontos/linhas não têm hectares).
    const locais = existingAreas.filter(
      (a) => a.nivel === 'local' && areaGeomKind(a) === 'area' && cleanRing(a.coords).length >= 3,
    );

    const catMap = new Map<string, CatGrp & { tipoMap: Map<string, TipoGrp> }>();
    let totalHa = 0;
    for (const a of locais) {
      const ha = areaM2(a.coords) / 10000;
      if (!(ha > 0)) continue;
      totalHa += ha;
      const res = catalogIndex.resolve(a.tipo);
      const tipoNome = (a.tipo && a.tipo.trim()) || 'Não classificado';
      const catNome = res?.categoriaNome || (a.tipo ? 'Outros' : 'Não classificado');
      const cor = res?.cor ?? NIVEIS.local.cor;

      let cat = catMap.get(catNome);
      if (!cat) {
        cat = { categoria: catNome, cor, totalHa: 0, tipos: [], tipoMap: new Map() };
        catMap.set(catNome, cat);
      }
      cat.totalHa += ha;

      let tg = cat.tipoMap.get(tipoNome);
      if (!tg) {
        tg = { tipo: tipoNome, cor, icone: res?.icone ?? null, totalHa: 0, items: [] };
        cat.tipoMap.set(tipoNome, tg);
        cat.tipos.push(tg);
      }
      tg.totalHa += ha;
      tg.items.push({ id: a.id, nome: a.nome || 'Local sem nome', detalhe: a.detalhe ?? null, ha });
    }

    const groups = Array.from(catMap.values())
      .map((c) => {
        c.tipos.sort((x, y) => y.totalHa - x.totalHa);
        c.tipos.forEach((t) => t.items.sort((x, y) => y.ha - x.ha));
        return c as CatGrp;
      })
      .sort((x, y) => y.totalHa - x.totalHa);

    const count = locais.length;
    return { groups, totalHa, count };
  }, [existingAreas, catalogIndex]);

  const allTipos = useMemo(() => {
    const list: Array<{
      tipo: string;
      categoria: string;
      cor: string;
      icone: string | null;
      totalHa: number;
      items: Array<{ id: string; nome: string; detalhe: string | null; ha: number }>;
    }> = [];

    for (const g of usoTerra.groups) {
      for (const t of g.tipos) {
        list.push({
          tipo: t.tipo,
          categoria: g.categoria,
          cor: t.cor,
          icone: t.icone,
          totalHa: t.totalHa,
          items: t.items,
        });
      }
    }

    return list.sort((a, b) => b.totalHa - a.totalHa);
  }, [usoTerra]);

  // Tipos expandidos na tabela "Uso da terra" (mostra os Locais-folha do tipo).
  const [expandedTipos, setExpandedTipos] = useState<Set<string>>(new Set());
  const toggleTipoExpanded = useCallback((tipoName: string) => {
    setExpandedTipos((prev) => {
      const next = new Set(prev);
      if (next.has(tipoName)) next.delete(tipoName);
      else next.add(tipoName);
      return next;
    });
  }, []);

  const pieData = useMemo(() => {
    return allTipos.map((t) => ({
      name: t.tipo,
      value: t.totalHa,
      color: t.cor,
    }));
  }, [allTipos]);

  const toggleCatVisibility = useCallback((key: string) => {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleTipoVisibility = useCallback((key: string) => {
    setHiddenTipos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<string, L.Polygon>>(new Map());
  const overlayLayerRef = useRef<L.Layer | null>(null);
  /** camada de destaque MÚLTIPLO (grupos marcados no checkbox do de-para). */
  const multiHighlightRef = useRef<L.LayerGroup | null>(null);
  /** camada dos mapas de referência JÁ persistidos (farm_maps) — fundo. */
  const referenceLayerRef = useRef<L.LayerGroup | null>(null);
  const drawHandlerRef = useRef<{ enable: () => void; disable: () => void } | null>(null);
  const editorRef = useRef<VertexEditor | null>(null);
  const pendingFitRef = useRef(false);
  /** marcadores dos Locais-ponto (separado das camadas de polígono). */
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  /** camada read-only das áreas JÁ cadastradas (referência no mapa). */
  const existingLayerRef = useRef<L.LayerGroup | null>(null);
  const existingFittedRef = useRef(false);

  // Espelhos para callbacks imperativos do Leaflet.
  const itemsRef = useRef<DraftArea[]>(items);
  const selIdRef = useRef<string | null>(selId);
  const drawNivelRef = useRef<Nivel>(drawNivel);
  const editingRef = useRef(false);
  const drawingRef = useRef(false);
  const handleImportFeatureToDraftRef = useRef<((f: GeoJSON.Feature, silent?: boolean) => void) | null>(null);
  /** contexto da próxima feição desenhada: nível + tipo/categoria + geometria (área/linha). */
  const drawContextRef = useRef<{ nivel: Nivel; tipo: string | null; categoriaId: string | null; geom: 'area' | 'line' }>({ nivel: 'local', tipo: null, categoriaId: null, geom: 'area' });
  /** modo "inserir ponto" ativo (clique no mapa cria o ponto). */
  const pointModeRef = useRef<{ tipo: string; categoriaId: string } | null>(null);
  itemsRef.current = items;
  selIdRef.current = selId;
  drawNivelRef.current = drawNivel;
  editingRef.current = editing;
  drawingRef.current = drawing;
  pointModeRef.current = pointMode;
  savedSelIdRef.current = savedSelId;

  const selectItem = useCallback((id: string | null) => {
    if (editingRef.current) return; // seleção travada durante a edição de forma
    setSelId(id);
    if (id) setSavedSelId(null); // selecionar um rascunho tira a seleção de área salva
  }, []);

  /** Seleciona uma área JÁ salva (Produção) no mapa p/ Editar forma / Apagar. */
  const selectSaved = useCallback((id: string) => {
    if (editingRef.current) return; // não troca seleção durante a edição de forma
    setSavedSelId(id);
    setSelId(null); // limpa a seleção de rascunho
  }, []);

  // ── Importa um arquivo KML/KMZ → áreas-rascunho ──────────────────────────
  const onPick = useCallback(async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setParsing(true);
    // Cada novo arquivo zera os overrides da correção da sessão anterior.
    setForceIds(new Set());
    setRevertIds(new Set());
    try {
      const r = await importarKmlGoogleEarth(f);
      setGeojson(r.geojson);
      const built = buildItems(r);
      setItems(built);
      setSelId(built.find((i) => i.nivel !== 'fazenda')?.id ?? built[0]?.id ?? null);
      // Original já é persistido AGORA (no import) como arquivo de referência → não re-salvar no Salvar.
      setSaveOverlay(false);
      // Ao importar, mostra o original (referência) + a produção que vai sendo desenhada.
      setMapSource('ambos');
      pendingFitRef.current = true;
      // Resumo da correção: abre só quando há algo a mostrar (convertidas ou
      // linhas fechadas ignoradas por nome, candidatas a "converter mesmo assim").
      setCorrecaoReport(r.correcaoReport);
      const temResumo =
        r.correcaoReport.convertidas.length > 0 || r.correcaoReport.ignoradasNome.length > 0;
      setShowCorrecao(temResumo);
      void onImportOriginal?.({
        file: f,
        geojson: r.geojson,
        correctedKmz: r.correctedKmz,
        correcaoReport: r.correcaoReport,
      });
    } catch (err) {
      setError(
        err instanceof KmlImportError
          ? err.message
          : 'Falha ao ler o arquivo. Verifique se é um KML/KMZ válido do Google Earth.',
      );
    } finally {
      setParsing(false);
    }
  }, [onImportOriginal]);

  // ── Ações do resumo da correção (desfazer / converter mesmo assim) ─────────
  // Recomputa a correção do MESMO arquivo com os overrides ajustados: gera um
  // GeoJSON e um .kmz consistentes, reconstrói as feições brutas (preservando o
  // perímetro e o que foi desenhado à mão) e re-persiste (o container faz upsert).
  const aplicarOverridesCorrecao = useCallback(
    async (nextForce: Set<string>, nextRevert: Set<string>) => {
      if (!file) return;
      setRecorrigindo(true);
      try {
        const r = await recorrigirKml(file, { forceIds: nextForce, revertIds: nextRevert });
        setForceIds(nextForce);
        setRevertIds(nextRevert);
        setGeojson(r.geojson);
        setCorrecaoReport(r.report);
        setItems((prev) => {
          const preservar = prev.filter((i) => i.source === 'perimeter' || i.source === 'drawn');
          return [...preservar, ...buildItemsFromGeojson(r.geojson)];
        });
        void onImportOriginal?.({
          file,
          geojson: r.geojson,
          correctedKmz: r.correctedKmz,
          correcaoReport: r.report,
        });
      } catch {
        onToast?.('Não foi possível recalcular a correção do arquivo.', 'error');
      } finally {
        setRecorrigindo(false);
      }
    },
    [file, onImportOriginal, onToast],
  );

  const toggleConvertida = useCallback(
    (e: ConvertidaEntry) => {
      const nr = new Set(revertIds);
      if (e.aplicada) nr.add(e.id);
      else nr.delete(e.id); // refazer a conversão desfeita
      void aplicarOverridesCorrecao(forceIds, nr);
    },
    [forceIds, revertIds, aplicarOverridesCorrecao],
  );

  const toggleIgnoradaNome = useCallback(
    (e: IgnoradaNomeEntry) => {
      const nf = new Set(forceIds);
      if (e.forcada) nf.delete(e.id); // desfazer o "converter mesmo assim"
      else nf.add(e.id);
      void aplicarOverridesCorrecao(nf, revertIds);
    },
    [forceIds, revertIds, aplicarOverridesCorrecao],
  );

  // ── Excluir um arquivo KMZ (Original ou Produção) e LIMPAR o trabalho feito nele ──
  // UMA confirmação aqui; o container faz a exclusão (arquivo + se produção, as áreas)
  // de forma sequenciada, sem segundo prompt.
  const handleDeleteArquivo = useCallback(
    (m: FarmMapData, prod: boolean) => {
      const alvo = prod
        ? 'o mapa de PRODUÇÃO — apaga as áreas geradas (locais com rebanho vinculado são aposentados)'
        : 'o arquivo ORIGINAL e a importação em andamento';
      if (typeof window !== 'undefined' && !window.confirm(`Excluir ${alvo}?\n"${m.original_name || m.file_name || ''}"\nEsta ação não pode ser desfeita.`)) return;
      setArquivoMenuOpen(false);
      void onDeleteArquivo?.(m, prod);
      // limpa o trabalho de sessão feito sobre o arquivo (de-para em andamento)
      setItems([]);
      setGeojson(null);
      setFile(null);
      setSelId(null);
      setSaveOverlay(false);
      setMapSource('producao');
      setSelectedMapIds((prev) => { const n = new Set(prev); n.delete(m.id); return n; });
    },
    [onDeleteArquivo],
  );

  // ── Baixar a cópia .kmz JÁ CORRIGIDA (linhas fechadas→polígonos) do arquivo ──
  const baixarCorrigido = useCallback(
    async (m: FarmMapData) => {
      if (!m.corrected_storage_path) return;
      try {
        const url = await storageSignedUrlForKey(m.corrected_storage_path);
        if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
      } catch {
        onToast?.('Não foi possível gerar o link do arquivo corrigido.', 'error');
      }
    },
    [onToast],
  );

  // ── Carrega o catálogo "Tipos de Locais" da organização ──────────────────
  useEffect(() => {
    if (!organizationId) return;
    const ac = new AbortController();
    setCatLoading(true);
    listTiposLocal(organizationId, ac.signal)
      .then((d) => {
        if (!ac.signal.aborted) setCatalog(d);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        console.error('Falha ao carregar Tipos de Locais', e);
        onToast?.('Não foi possível carregar os Tipos de Locais. Use só o Geocadastro.', 'warning');
      })
      .finally(() => {
        if (!ac.signal.aborted) setCatLoading(false);
      });
    return () => ac.abort();
  }, [organizationId, onToast]);

  // ── Inicializa o mapa (1x) + carrega leaflet-draw ────────────────────────
  useEffect(() => {
    let cancelled = false;
    const store = layersRef.current; // instância estável (só mutada) — segura no cleanup
    (async () => {
      (window as unknown as { L?: typeof L }).L = L;
      await import('leaflet-draw');
      if (cancelled || !mapElRef.current || mapRef.current) return;

      const map = L.map(mapElRef.current, {
        zoomControl: false,
        attributionControl: false,
        center: FALLBACK_CENTER,
        zoom: 5,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer(SAT_TILES, { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      setMapReady(true);

      map.on('draw:created', (e: { layerType?: string; layer: L.Polygon | L.Polyline }) => {
        const ctx = drawContextRef.current;
        const isLine = e.layerType === 'polyline' || ctx.geom === 'line';
        // Polígono: getLatLngs()[0] é o anel; linha (polyline): getLatLngs() é a lista direta.
        const latlngs = isLine
          ? (e.layer.getLatLngs() as L.LatLng[])
          : ((e.layer as L.Polygon).getLatLngs()[0] as L.LatLng[]);
        const coords = cleanRing(latlngs.map((p) => [p.lat, p.lng] as [number, number]));
        drawHandlerRef.current = null;
        setDrawing(false);
        if (coords.length < (isLine ? 2 : 3)) return;
        const id = uuid();
        setItems((prev) => [
          ...prev,
          {
            id,
            nome: ctx.tipo ?? defaultNome(ctx.nivel),
            nivel: ctx.nivel,
            coords,
            // Sem tipo específico: numa categoria deixa em branco (o modal lista os
            // tipos dela); fora de categoria mantém o padrão legado "Pasto".
            tipo: ctx.nivel === 'local' ? (ctx.tipo ?? (ctx.categoriaId ? null : 'Pasto')) : null,
            detalhe: null,
            categoriaId: ctx.categoriaId,
            geomKind: isLine ? 'line' : 'area',
            source: 'drawn',
            keep: true,
            parentId: null,
            areaM2: isLine ? 0 : areaM2(coords),
            strokeColor: null,
            fillColor: null,
            fillOpacity: null,
            strokeWeight: null,
          },
        ]);
        setSelId(id);
        // Logo após desenhar, abre a caixa de configuração da feição:
        //  • Local → classificação (Categoria→Tipo→Detalhe + nome); Cancelar descarta o rascunho.
        //  • Fazenda/Retiro/Setor → estilo (nome + cor da linha + preenchimento).
        if (ctx.nivel === 'local') { setPendingClassifyIsNew(true); setAssignId(id); }
        else if (!isLine) setStyleId(id);
      });
      map.on('draw:drawstop', () => {
        if (drawHandlerRef.current) {
          drawHandlerRef.current = null;
          setDrawing(false);
        }
      });

      // Clique no mapa no modo "inserir ponto" → cria um Local-ponto do tipo.
      map.on('click', (e: L.LeafletMouseEvent) => {
        const pm = pointModeRef.current;
        if (!pm) return;
        const { lat, lng } = e.latlng;
        const id = uuid();
        setItems((prev) => [
          ...prev,
          {
            id,
            nome: pm.tipo,
            nivel: 'local',
            coords: [[lat, lng]],
            tipo: pm.tipo,
            detalhe: null,
            categoriaId: pm.categoriaId,
            geomKind: 'point',
            source: 'drawn',
            keep: true,
            parentId: null,
            areaM2: 0,
            strokeColor: null,
            fillColor: null,
            fillOpacity: null,
            strokeWeight: null,
          },
        ]);
        setSelId(id);
        // Mantém o modo ativo para inserir vários pontos seguidos.
      });

      setTimeout(() => map.invalidateSize(), 60);
    })();

    const markerStore = markersRef.current;
    return () => {
      cancelled = true;
      const map = mapRef.current;
      editorRef.current?.teardown();
      if (map) {
        store.forEach((l) => safeRemoveLayer(map, l));
        store.clear();
        markerStore.forEach((m) => safeRemoveLayer(map, m));
        markerStore.clear();
        if (overlayLayerRef.current) safeRemoveLayer(map, overlayLayerRef.current);
        try {
          map.remove();
        } catch {
          /* path ainda não renderizado — ignora */
        }
      }
      mapRef.current = null;
    };
  }, []);

  // ── Mantém o tamanho do mapa ao redimensionar/aparecer o container ────────
  // Embutida como tela principal, o mapa pode montar antes do container ter
  // tamanho (aba/painel ainda sem layout). Sem isto, o Leaflet trava em 0×0 e
  // só mostra o fundo escuro (sem tiles) até um invalidateSize — o que parecia
  // "o mapa deixou de aparecer". O ResizeObserver dispara quando o container
  // ganha/altera tamanho. (Mesmo padrão do CadastroAreasView.)
  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Camada de referência (KML cru) abaixo das áreas-rascunho ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (overlayLayerRef.current) {
      safeRemoveLayer(map, overlayLayerRef.current);
      overlayLayerRef.current = null;
    }
    if (!geojson || !showOriginal) return; // original é referência: só aparece quando selecionado no botão
    try {
      const gj = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
        style: () => ({ color: '#f59e0b', weight: 1.5, opacity: 0.75, fillColor: '#f59e0b', fillOpacity: 0.05 }),
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, { radius: 4, color: '#fff', weight: 1.5, fillColor: '#f59e0b', fillOpacity: 0.9 }),
        onEachFeature: (f, lyr) => {
          const nm = f.properties && (f.properties.name as string);
          if (nm) lyr.bindTooltip(String(nm), { sticky: true });
          lyr.on('click', (e) => {
            if (pointModeRef.current || drawingRef.current || editingRef.current) return;
            L.DomEvent.stop(e);
            handleImportFeatureToDraftRef.current?.(f);
          });
        },
      });
      gj.addTo(map);
      gj.bringToBack();
      overlayLayerRef.current = gj;
    } catch {
      /* geojson inválido — ignora */
    }
  }, [geojson, mapReady, showOriginal]);

  // ── Mapas de referência JÁ persistidos (farm_maps) — camada laranja ao fundo ──
  // Esta tela mestra é a principal e cobre o mapa do container (CadastroAreasView),
  // que era o único a desenhar os overlays salvos. Sem renderizá-los aqui, um KML/
  // KMZ importado e guardado some ao sair e voltar. Recebemos a lista já carregada
  // pelo container e desenhamos o mesmo GeoJSON cru (independente do `geojson` da
  // sessão atual, que cobre só o arquivo recém-importado e ainda não salvo).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!referenceLayerRef.current) referenceLayerRef.current = L.layerGroup().addTo(map);
    const grp = referenceLayerRef.current;
    grp.clearLayers();
    if (!showOriginal) return; // original é referência: só aparece quando selecionado no botão
    for (const m of referenceMaps ?? []) {
      if (!selectedMapIds.has(m.id)) continue;
      if (!m.geojson) continue;
      try {
        const gj = L.geoJSON(m.geojson as GeoJSON.GeoJsonObject, {
          style: () => ({ color: '#f59e0b', weight: 1.5, opacity: 0.75, fillColor: '#f59e0b', fillOpacity: 0.05 }),
          pointToLayer: (_f, latlng) =>
            L.circleMarker(latlng, { radius: 4, color: '#fff', weight: 1.5, fillColor: '#f59e0b', fillOpacity: 0.9 }),
          onEachFeature: (f, lyr) => {
            const nm = f.properties && (f.properties.name as string);
            if (nm) lyr.bindTooltip(String(nm), { sticky: true });
            lyr.on('click', (e) => {
              if (pointModeRef.current || drawingRef.current || editingRef.current) return;
              L.DomEvent.stop(e);
              handleImportFeatureToDraftRef.current?.(f);
            });
          },
        });
        grp.addLayer(gj);
        gj.bringToBack();
      } catch {
        /* geojson inválido — ignora */
      }
    }
  }, [referenceMaps, mapReady, showOriginal, selectedMapIds]);

  // ── Sincroniza áreas-rascunho ⇄ camadas Leaflet (polígonos + marcadores) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const polyStore = layersRef.current;
    const markStore = markersRef.current;
    // Feições já salvas saem da camada de RASCUNHO (passam a ser desenhadas pela
    // camada de áreas já cadastradas) — fora do `present` p/ remover seus layers.
    const present = new Set(items.filter((i) => !i.saved).map((i) => i.id));
    for (const [id, layer] of polyStore) {
      if (!present.has(id)) {
        safeRemoveLayer(map, layer);
        polyStore.delete(id);
      }
    }
    for (const [id, mk] of markStore) {
      if (!present.has(id)) {
        safeRemoveLayer(map, mk);
        markStore.delete(id);
      }
    }

    // Oculto se o nível, a própria área (retiro/setor), a categoria OU o tipo
    // estiverem desligados no visualizador.
    const hiddenOf = (it: DraftArea) =>
      hiddenLevels.has(it.nivel) ||
      hiddenAreaIds.has(it.id) ||
      (it.categoriaId != null && hiddenCats.has(it.categoriaId)) ||
      (it.tipo != null && hiddenTipos.has(it.tipo));

    for (const it of items) {
      if (it.saved) continue; // já cadastrada → desenhada pela camada de referência
      const ring = cleanRing(it.coords);
      // O NOVO mapa (produção) desenha só feições classificadas (keep) e quando a
      // fonte inclui produção; legenda (hiddenOf) filtra por nível/categoria/tipo.
      const hidden = !showProducao || !it.keep || hiddenOf(it);

      // ── Ponto (1 coordenada) → marcador com o ícone do tipo ──
      if (it.geomKind === 'point' || ring.length === 1) {
        const stalePoly = polyStore.get(it.id);
        if (stalePoly) {
          safeRemoveLayer(map, stalePoly);
          polyStore.delete(it.id);
        }
        const pt = pointLatLng(it.coords);
        let mk = markStore.get(it.id);
        if (!pt) {
          if (mk) {
            safeRemoveLayer(map, mk);
            markStore.delete(it.id);
          }
          continue;
        }
        const r = catalogIndex.resolve(it.tipo);
        const icon = pointDivIcon(r?.icone ?? null, r?.cor ?? NIVEIS.local.cor);
        if (!mk) {
          mk = L.marker(pt, { icon, draggable: true });
          mk.on('click', (e) => {
            if (pointModeRef.current) return; // não atrapalha inserir ponto
            L.DomEvent.stop(e);
            selectItem(it.id);
          });
          mk.on('dragend', () => {
            const ll = mk!.getLatLng();
            setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, coords: [[ll.lat, ll.lng]] } : x)));
          });
          mk.bindTooltip(it.nome, { direction: 'top', opacity: 0.95 });
          markStore.set(it.id, mk);
        } else {
          mk.setLatLng(pt);
          mk.setIcon(icon);
          if (mk.getTooltip()) mk.setTooltipContent(it.nome);
        }
        if (hidden) {
          if (map.hasLayer(mk)) safeRemoveLayer(map, mk);
          continue;
        }
        if (!map.hasLayer(mk)) mk.addTo(map);
        mk.setZIndexOffset(it.id === selId ? 1000 : 0);
        continue;
      }

      // ── Linha (traço ≥2): cerca/estrada/rede — renderiza como polyline ──
      if (it.geomKind === 'line') {
        const staleMk = markStore.get(it.id);
        if (staleMk) { safeRemoveLayer(map, staleMk); markStore.delete(it.id); }
        let lineLayer = polyStore.get(it.id) as unknown as L.Polyline | undefined;
        if (ring.length < 2) {
          if (lineLayer) { safeRemoveLayer(map, lineLayer); polyStore.delete(it.id); }
          continue;
        }
        const rl = it.keep && it.categoriaId ? catalogIndex.resolve(it.tipo) : null;
        const lstyle: L.PolylineOptions = { color: rl?.cor ?? '#6366f1', weight: it.id === selId ? 5 : 3, opacity: 0.95 };
        if (!lineLayer) {
          lineLayer = L.polyline(ring, lstyle);
          lineLayer.on('click', (e) => {
            if (pointModeRef.current) return;
            L.DomEvent.stop(e);
            selectItem(it.id);
            if (editingRef.current) return;
            const cur = itemsRef.current.find((x) => x.id === it.id);
            if (cur?.nivel === 'local') { setPendingClassifyIsNew(false); setAssignId(it.id); }
          });
          lineLayer.bindTooltip(it.nome, { sticky: true });
          polyStore.set(it.id, lineLayer as unknown as L.Polygon);
        } else {
          lineLayer.setStyle(lstyle);
          if (lineLayer.getTooltip()) lineLayer.setTooltipContent(it.nome);
          const editingThis = editingRef.current && (editorRef.current?.layer() as L.Layer | undefined) === lineLayer;
          if (!editingThis) lineLayer.setLatLngs(ring);
        }
        if (hidden) { if (map.hasLayer(lineLayer)) safeRemoveLayer(map, lineLayer); continue; }
        if (!map.hasLayer(lineLayer)) lineLayer.addTo(map);
        continue;
      }

      // ── Área (polígono ≥3) ──
      let layer = polyStore.get(it.id);
      if (ring.length < 3) {
        if (layer) {
          safeRemoveLayer(map, layer);
          polyStore.delete(it.id);
        }
        continue;
      }
      let style = draftStyle(it, it.id === selId);
      if (it.keep && it.categoriaId) {
        const r = catalogIndex.resolve(it.tipo);
        if (r) style = { ...style, color: r.cor, fillColor: r.cor };
      }
      if (!layer) {
        layer = L.polygon(ring, style);
        // Abre a caixa de configuração da feição-rascunho: Local → classificação
        // (Categoria→Tipo→Detalhe); Fazenda/Retiro/Setor → estilo (nome+cor+preenchimento).
        const openConfig = () => {
          if (editingRef.current) return;
          const cur = itemsRef.current.find((x) => x.id === it.id);
          if (cur?.nivel === 'local') { setPendingClassifyIsNew(false); setAssignId(it.id); }
          else setStyleId(it.id);
        };
        layer.on('click', (e) => {
          if (pointModeRef.current) return;
          L.DomEvent.stop(e);
          selectItem(it.id);
          openConfig();
        });
        // Duplo-clique também abre a configuração (e não deixa o mapa dar zoom).
        layer.on('dblclick', (e) => {
          if (pointModeRef.current) return;
          L.DomEvent.stop(e);
          selectItem(it.id);
          openConfig();
        });
        layer.bindTooltip(it.nome, { sticky: true });
        polyStore.set(it.id, layer);
      } else {
        layer.setStyle(style);
        if (layer.getTooltip()) layer.setTooltipContent(it.nome);
        // Não sobrescreve a geometria do polígono enquanto seus vértices são editados.
        if (!(editingRef.current && editorRef.current?.layer() === layer)) layer.setLatLngs(ring);
      }
      if (hidden) {
        if (map.hasLayer(layer)) safeRemoveLayer(map, layer);
        continue;
      }
      if (!map.hasLayer(layer)) layer.addTo(map);
      if (it.id === selId) layer.bringToFront();
      // Perímetro (Fazenda) ao fundo: assim o hover acerta a feição interna, não o contorno.
      else if (it.nivel === 'fazenda') layer.bringToBack();
    }
  }, [items, selId, selectItem, hiddenLevels, hiddenAreaIds, hiddenCats, hiddenTipos, catalogIndex, showProducao]);

  // ── Áreas JÁ cadastradas: camada de referência read-only no mapa ──────────
  // Sem isto, a tela mestra (embutida em tela cheia) mostraria o mapa vazio mesmo
  // havendo perímetro/retiros/setores/locais salvos — parecendo que "não persiste".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // Enquanto se edita a FORMA de uma área salva, o editor de vértices está montado
    // sobre uma dessas camadas — recriar o grupo removeria a camada em edição e
    // quebraria o arraste. Preserva tudo como está até "Concluir forma".
    if (editingSavedRef.current) return;
    if (!existingLayerRef.current) existingLayerRef.current = L.layerGroup().addTo(map);
    const grp = existingLayerRef.current;
    grp.clearLayers();
    savedLayersRef.current.clear();
    if (!showProducao) return; // áreas salvas = produção; some quando a fonte é só "Original"
    // Selecionar/editar/apagar área já salva clicando no mapa. Só fora do modo
    // desenho/edição (senão os cliques são para os vértices) e quando o container
    // ofereceu os callbacks. Agora vale p/ TODOS os níveis + linhas (não só retiro/setor).
    const editavelSalvo = !readOnly && (!!onEditSavedGeometry || !!onDeleteSavedArea) && !drawing && !editing;
    const estilizavel = !readOnly && !!onEditSavedArea; // modal de estilo: só polígono retiro/setor/fazenda
    // Hover deve mostrar o NOME da própria feição. Para isso TODA área salva precisa
    // capturar o mouse (interactive) quando não se está desenhando/editando — senão o
    // clique do desenho seria interceptado. Sem isto, só o perímetro (Fazenda) era
    // interactive e qualquer feição por cima dele aparecia no hover como "perímetro".
    const hoverable = !drawing && !editing;
    // Empilhamento: Fazenda ao fundo; Retiro→Setor→Local→Linha por cima, para que a
    // feição mais INTERNA sob o cursor (e não o perímetro que a envolve) ganhe o
    // tooltip. Processa do topo para o fundo e usa bringToBack: a última processada
    // (Fazenda) acaba no fundo de tudo; e todas ficam atrás dos rascunhos.
    const stackRank = (a: Area): number =>
      a.geomKind === 'line' ? 4 : a.nivel === 'local' ? 3 : a.nivel === 'setor' ? 2 : a.nivel === 'retiro' ? 1 : 0;
    const ordered = [...existingAreas].sort((a, b) => stackRank(b) - stackRank(a));
    for (const a of ordered) {
      if (hiddenLevels.has(a.nivel) || hiddenAreaIds.has(a.id) || (a.tipo != null && hiddenTipos.has(a.tipo))) continue;
      const ring = cleanRing(a.coords);
      const selecionada = a.id === savedSelId;
      // Linha salva (cerca/estrada/rede) → polyline. Agora selecionável p/ editar/apagar.
      if (a.geomKind === 'line') {
        if (ring.length < 2) continue;
        const cor = (a.tipo ? catalogIndex.resolve(a.tipo)?.cor : null) ?? '#6366f1';
        const line = L.polyline(ring, {
          color: selecionada ? '#2563eb' : cor,
          weight: selecionada ? 5 : 3,
          opacity: 0.9,
          interactive: editavelSalvo || hoverable,
        });
        line.bindTooltip(`${a.nome} · já cadastrado${editavelSalvo ? ' · clique para selecionar' : ''}`, { sticky: true });
        if (editavelSalvo) {
          line.on('click', (e: L.LeafletMouseEvent) => {
            if (pointModeRef.current) return;
            L.DomEvent.stop(e);
            selectSaved(a.id);
          });
        }
        grp.addLayer(line);
        savedLayersRef.current.set(a.id, line);
        line.bringToBack();
        continue;
      }
      if (ring.length < 3) continue;
      const resolved = a.tipo ? catalogIndex.resolve(a.tipo) : null;
      const baseCor = resolved?.cor ?? NIVEIS[a.nivel].cor;
      // Estilo por área (retiro/setor) tem prioridade; null ⇒ padrão do nível.
      const stroke = a.strokeColor ?? baseCor;
      const fill = a.fillColor ?? baseCor;
      const fillOp = a.fillOpacity != null ? a.fillOpacity : (a.nivel === 'fazenda' ? 0.04 : 0.1);
      // Estilo (nome/cor) por duplo-clique só faz sentido p/ polígono retiro/setor/fazenda.
      const podeEstilo = estilizavel && (a.nivel === 'fazenda' || a.nivel === 'retiro' || a.nivel === 'setor');
      const poly = L.polygon(ring, {
        color: selecionada ? '#2563eb' : stroke,
        weight: selecionada ? 3.5 : (a.strokeWeight != null ? a.strokeWeight : a.nivel === 'fazenda' ? 3 : 1.5),
        opacity: 0.9,
        fillColor: fill,
        fillOpacity: selecionada ? Math.max(fillOp, 0.18) : fillOp,
        dashArray: selecionada ? '6 3' : (a.nivel === 'fazenda' ? '6 4' : undefined),
        interactive: editavelSalvo || hoverable,
      });
      poly.bindTooltip(`${a.nome} · já cadastrado${editavelSalvo ? ' · clique para selecionar' : ''}`, { sticky: true });
      if (editavelSalvo) {
        // Clique simples SELECIONA (p/ Editar forma / Apagar na barra do mapa).
        poly.on('click', (e: L.LeafletMouseEvent) => {
          if (pointModeRef.current) return;
          L.DomEvent.stop(e);
          selectSaved(a.id);
        });
        // Duplo-clique abre o estilo (nome/cor) dos polígonos retiro/setor/fazenda.
        if (podeEstilo) {
          poly.on('dblclick', (e: L.LeafletMouseEvent) => {
            if (pointModeRef.current) return;
            L.DomEvent.stop(e);
            setSavedEditId(a.id);
          });
        }
      }
      grp.addLayer(poly);
      savedLayersRef.current.set(a.id, poly);
      poly.bringToBack(); // fica atrás dos rascunhos (que são adicionados depois)
    }
  }, [existingAreas, hiddenLevels, hiddenAreaIds, hiddenTipos, catalogIndex, mapReady, readOnly, onEditSavedArea, onEditSavedGeometry, onDeleteSavedArea, drawing, editing, showProducao, savedSelId, selectSaved]);

  // ── Enquadra nas áreas já cadastradas ao abrir (quando não há rascunhos) ──
  // Fallback: sem perímetro/áreas estruturadas, enquadra no mapa de referência
  // salvo (farm_maps) — senão o overlay renderizaria fora da vista e pareceria
  // que "não persiste" (caso típico de fazenda só com o KML importado).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || existingFittedRef.current || items.length > 0) return;
    const rings = existingAreas.map((a) => cleanRing(a.coords)).filter((r) => r.length >= 3);
    try {
      let b: L.LatLngBounds | null = null;
      if (rings.length) {
        b = L.latLngBounds(rings[0]);
        rings.forEach((r) => (b = b!.extend(L.latLngBounds(r))));
      } else {
        for (const m of referenceMaps ?? []) {
          if (!m.geojson) continue;
          try {
            const gb = L.geoJSON(m.geojson as GeoJSON.GeoJsonObject).getBounds();
            if (gb.isValid()) b = b ? b.extend(gb) : gb;
          } catch {
            /* geojson inválido — ignora */
          }
        }
      }
      if (b && b.isValid()) {
        map.fitBounds(b, { padding: [24, 24], maxZoom: 16 });
        existingFittedRef.current = true;
      }
    } catch {
      /* bounds inválidos — ignora */
    }
  }, [existingAreas, mapReady, items.length, referenceMaps]);

  // ── Enquadra nas áreas assim que importa / desenha a 1ª ──────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pendingFitRef.current) return;
    const rings = items.map((i) => cleanRing(i.coords)).filter((r) => r.length >= 3);
    if (!rings.length) return;
    try {
      let b = L.latLngBounds(rings[0]);
      rings.forEach((r) => (b = b.extend(L.latLngBounds(r))));
      if (b.isValid()) {
        map.fitBounds(b, { padding: [24, 24], maxZoom: 16 });
        pendingFitRef.current = false;
      }
    } catch {
      /* bounds inválidos — ignora */
    }
  }, [items, mapReady]);

  // ── Recalcula o tamanho do mapa ao alternar tela cheia ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timers = [0, 80, 260].map((d) => window.setTimeout(() => map.invalidateSize(), d));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [fullscreen]);

  // ── Desenhar (leaflet-draw) ──────────────────────────────────────────────
  /** Começa a desenhar um polígono OU uma linha já fixado num contexto (nível + tipo/categoria). */
  const beginDraw = useCallback(
    (nivel: Nivel, tipo: string | null = null, categoriaId: string | null = null, geom: 'area' | 'line' = 'area') => {
      const map = mapRef.current;
      if (!map || editingRef.current) return;
      setPointMode(null); // sai do modo "inserir ponto"
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
      drawContextRef.current = { nivel, tipo, categoriaId, geom };
      drawNivelRef.current = nivel;
      setDrawNivel(nivel);
      const n = NIVEIS[nivel];
      const cor = categoriaId ? catalogIndex.resolve(tipo)?.cor ?? n.cor : n.cor;
      const DrawNS = (L as unknown as { Draw: {
        Polygon: new (m: L.Map, o: unknown) => { enable: () => void; disable: () => void };
        Polyline: new (m: L.Map, o: unknown) => { enable: () => void; disable: () => void };
      } }).Draw;
      const handler =
        geom === 'line'
          ? new DrawNS.Polyline(map, {
              allowIntersection: true,
              shapeOptions: { color: cor, weight: 4, opacity: 0.95 },
            })
          : new DrawNS.Polygon(map, {
              allowIntersection: false,
              showArea: false,
              shapeOptions: { color: cor, weight: 3, fillColor: cor, fillOpacity: n.fill, dashArray: nivel === 'fazenda' ? '7 5' : undefined },
            });
      handler.enable();
      drawHandlerRef.current = handler;
      setDrawing(true);
    },
    [catalogIndex],
  );

  /** Liga/desliga o modo "inserir ponto" para um tipo do catálogo. */
  const togglePointMode = useCallback(
    (categoriaId: string, tipo: string) => {
      if (editingRef.current) {
        onToast?.('Conclua a edição de forma antes de inserir pontos.', 'warning');
        return;
      }
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        setDrawing(false);
      }
      setPointMode((cur) => (cur && cur.tipo === tipo && cur.categoriaId === categoriaId ? null : { categoriaId, tipo }));
    },
    [onToast],
  );

  /** Botão "Desenhar" da barra do mapa: liga/desliga. Considera a CATEGORIA ativa:
   *  fora de "Perímetro", desenha um LOCAL já vinculado à categoria selecionada (e ao
   *  tipo, se um estiver expandido) — assim o modal "Classificar local" abre com a
   *  categoria/tipo pré-preenchidos, sem cair em "sem categoria". */
  const toggleDraw = useCallback(() => {
    if (drawHandlerRef.current) {
      drawHandlerRef.current.disable();
      drawHandlerRef.current = null;
      setDrawing(false);
      return;
    }
    if (activeCat !== 'perimetro') {
      const tAtivo = (tiposByCat.get(activeCat) ?? []).find((t) => t.id === expandedTipo) ?? null;
      const geom = tAtivo && defaultGeomForTipo(tAtivo.nome) === 'line' ? 'line' : 'area';
      beginDraw('local', tAtivo?.nome ?? null, activeCat, geom);
      return;
    }
    beginDraw(drawNivelRef.current);
  }, [beginDraw, activeCat, tiposByCat, expandedTipo]);

  // ── Editar forma (vértices) ──────────────────────────────────────────────
  const beginEdit = useCallback(
    (id: string) => {
      const map = mapRef.current;
      if (!map) return;
      const layer = layersRef.current.get(id);
      if (!layer) return;
      const ring = cleanRing((layer.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as [number, number]));
      if (ring.length < 3) {
        onToast?.('Esta área não tem uma forma editável.', 'warning');
        return;
      }
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        setDrawing(false);
      }
      if (!editorRef.current) editorRef.current = createVertexEditor(map);
      editorRef.current.begin(layer, ring, { onWarn: (m) => onToast?.(m, 'warning') });
      selIdRef.current = id;
      setSelId(id);
      setEditing(true);
      layer.bringToFront();
      onToast?.('Arraste os vértices. Clique no ponto azul-claro para inserir e botão direito para remover. Depois clique em "Concluir forma".', 'info');
    },
    [onToast],
  );

  // ── Editar a FORMA (vértices) de uma área JÁ salva (Produção) ──────────────
  // Reusa o mesmo editor de vértices; ao concluir, persiste via onEditSavedGeometry
  // (o container decide ledger p/ local ou geometria direta p/ retiro/setor/linha).
  const beginEditSaved = useCallback(
    (id: string) => {
      const map = mapRef.current;
      if (!map) return;
      const area = existingAreas.find((a) => a.id === id);
      const layer = savedLayersRef.current.get(id);
      if (!area || !layer) return;
      const isLine = area.geomKind === 'line';
      const latlngs = isLine
        ? (layer.getLatLngs() as L.LatLng[])
        : ((layer.getLatLngs()[0] as L.LatLng[]) ?? []);
      const ring = cleanRing(latlngs.map((p) => [p.lat, p.lng] as [number, number]));
      const minV = isLine ? 2 : 3;
      if (ring.length < minV) {
        onToast?.('Esta feição não tem uma forma editável.', 'warning');
        return;
      }
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        setDrawing(false);
      }
      if (!editorRef.current) editorRef.current = createVertexEditor(map);
      editingSavedRef.current = true;
      editorRef.current.begin(layer, ring, { closed: !isLine, onWarn: (m) => onToast?.(m, 'warning') });
      setEditing(true);
      layer.bringToFront();
      onToast?.('Arraste os vértices. Clique no ponto claro para inserir e botão direito para remover. Depois clique em "Concluir forma".', 'info');
    },
    [existingAreas, onToast],
  );

  const endEdit = useCallback(() => {
    const coords = cleanRing(editorRef.current?.current() ?? []);
    const wasSaved = editingSavedRef.current;
    editorRef.current?.teardown();
    editingSavedRef.current = false;
    setEditing(false);
    // Edição de área JÁ salva → persiste no banco (via container).
    if (wasSaved) {
      const id = savedSelIdRef.current;
      const area = id ? existingAreas.find((a) => a.id === id) : null;
      const minV = area?.geomKind === 'line' ? 2 : 3;
      if (id && coords.length >= minV) {
        void onEditSavedGeometry?.(id, coords);
      } else {
        onToast?.('Forma inválida — edição descartada.', 'warning');
      }
      return;
    }
    // Edição de rascunho → atualiza a lista local.
    const id = selIdRef.current;
    if (id && coords.length >= 3) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, coords, areaM2: areaM2(coords) } : i)));
    } else if (coords.length < 3) {
      onToast?.('A forma precisa de pelo menos 3 vértices — edição descartada.', 'warning');
    }
  }, [onToast, existingAreas, onEditSavedGeometry]);

  const toggleEdit = useCallback(() => {
    if (editing) {
      endEdit();
      return;
    }
    // Prioriza a área salva selecionada (Produção); senão, o rascunho selecionado.
    if (savedSelIdRef.current) {
      beginEditSaved(savedSelIdRef.current);
      return;
    }
    const id = selIdRef.current;
    if (!id) {
      onToast?.('Selecione uma área (clique nela no mapa) para ajustar a forma.', 'warning');
      return;
    }
    beginEdit(id);
  }, [editing, beginEdit, beginEditSaved, endEdit, onToast]);

  /** Apaga a feição selecionada: área SALVA (via container, com aposentar do local
   *  com rebanho) OU rascunho (remoção local). Descarta a edição em andamento. */
  const removeSelected = useCallback(() => {
    const savedId = savedSelIdRef.current;
    if (savedId) {
      const area = existingAreas.find((a) => a.id === savedId);
      if (editingRef.current) {
        editorRef.current?.teardown();
        editingSavedRef.current = false;
        setEditing(false);
      }
      if (typeof window !== 'undefined' &&
          !window.confirm(`Excluir "${area?.nome ?? 'esta feição'}" do mapa de produção?\nEsta ação não pode ser desfeita.`)) return;
      void onDeleteSavedArea?.(savedId);
      setSavedSelId(null);
      return;
    }
    const id = selIdRef.current;
    if (!id) {
      onToast?.('Selecione uma área para apagar.', 'warning');
      return;
    }
    if (editingRef.current) {
      editorRef.current?.teardown();
      setEditing(false);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelId(null);
    onToast?.('Polígono apagado.', 'info');
  }, [onToast, existingAreas, onDeleteSavedArea]);

  // ── Edição da lista (nível / nome / manter / tipo / pai) ──────────────────
  const patchItem = useCallback((id: string, patch: Partial<DraftArea>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelId((cur) => (cur === id ? null : cur));
  }, []);

  /** Seleciona e centraliza o mapa na área (polígono) ou no ponto (marcador). */
  const focusItem = useCallback(
    (id: string) => {
      selectItem(id);
      const map = mapRef.current;
      if (!map) return;
      const poly = layersRef.current.get(id);
      const mk = markersRef.current.get(id);
      if (poly) {
        try {
          map.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 16 });
        } catch {
          /* bounds inválidos — ignora */
        }
      } else if (mk) {
        map.setView(mk.getLatLng(), Math.max(map.getZoom(), 16));
      }
    },
    [selectItem],
  );

  /** Centraliza o mapa numa área JÁ cadastrada (não é rascunho — não está em layersRef). */
  /** Converte uma feição importada/carregada do KML/KMZ em um rascunho de área (DraftArea) editável. */
  const handleImportFeatureToDraft = useCallback(
    (f: GeoJSON.Feature, silent = false) => {
      if (!f.geometry) return;

      const isPerim = activeCat === 'perimetro';
      const nv = isPerim ? drawNivelRef.current : 'local';

      const coords = f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
        ? outerRingsOfGeoJSON(f.geometry)
        : null;

      const pt = f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint'
        ? (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates)
        : null;

      if (!coords && !pt) {
        onToast?.('Tipo de geometria não suportado para edição direta.', 'warning');
        return;
      }

      const ring = coords ? toSystemRingCoords(coords[0] as [number, number][]) : null;
      const pointCoords = pt ? (pt as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]) : null;

      const geomKind = ring ? 'area' : 'point';
      const finalCoords = ring || pointCoords || [];

      if (geomKind === 'area' && finalCoords.length < 3) return;

      const name = (f.properties && (f.properties.name as string)) || defaultNome(nv);
      const isLocal = nv === 'local';

      // Já existe um rascunho com essa geometria? → reabre a caixa dele (não duplica).
      const dup = itemsRef.current.find(
        (x) => x.coords.length === finalCoords.length && x.coords[0]?.[0] === finalCoords[0]?.[0],
      );
      if (dup) {
        if (!silent) {
          setSelId(dup.id);
          if (dup.nivel === 'local') {
            setPendingClassifyIsNew(false);
            setAssignId(dup.id);
          }
        }
        return;
      }

      // Classificação pré-preenchida: o tipo ativo (modo categoria) tem prioridade;
      // senão, palpite pelo nome do placemark contra o catálogo (Categoria→Tipo→Detalhe).
      let tipo: string | null = null;
      let detalhe: string | null = null;
      let categoriaId: string | null = null;
      if (isLocal) {
        const activeTipo = !isPerim
          ? (tiposByCat.get(activeCat) ?? []).find((t) => t.id === expandedTipo) ?? null
          : null;
        if (activeTipo) {
          tipo = activeTipo.nome;
          categoriaId = activeCat;
        } else {
          const guess = inferCatalogClassification(name, catalog);
          tipo = guess.tipo;
          detalhe = guess.detalhe;
          // Numa categoria específica, ela é o padrão quando o palpite não achou nada.
          categoriaId = guess.categoriaId ?? (!isPerim ? activeCat : null);
        }
      }

      const id = uuid();
      const draft: DraftArea = {
        id,
        nome: name,
        nivel: nv,
        coords: finalCoords,
        tipo: isLocal ? tipo : null,
        detalhe: isLocal ? detalhe : null,
        categoriaId: isLocal ? categoriaId : null,
        geomKind,
        source: 'drawn',
        keep: true,
        parentId: null,
        areaM2: geomKind === 'area' ? areaM2(finalCoords) : 0,
        strokeColor: null,
        fillColor: null,
        fillOpacity: null,
        strokeWeight: null,
      };
      setItems((prev) => [...prev, draft]);
      if (!silent) {
        setSelId(id);
      }

      if (isLocal && !silent) {
        // Local → abre a caixa de classificação (Categoria→Tipo→Detalhe), pré-preenchida.
        // Cancelar descarta este rascunho recém-criado (ver render do modal).
        setPendingClassifyIsNew(true);
        setAssignId(id);
      } else if (geomKind === 'area' && !silent) {
        // Fazenda/Retiro/Setor (modo Perímetros) → edição de vértices direto, sem caixa.
        onToast?.(`Área "${name}" carregada para edição.`, 'success');
        setTimeout(() => {
          beginEdit(id);
        }, 100);
      }
    },
    [activeCat, tiposByCat, expandedTipo, catalog, beginEdit, onToast]
  );
  handleImportFeatureToDraftRef.current = handleImportFeatureToDraft;

  /** Centraliza o mapa para cobrir todas as feições (tanto rascunhos quanto já cadastradas) de um nível. */
  const fitLevel = useCallback(
    (nv: Nivel) => {
      const map = mapRef.current;
      if (!map) return;

      const levelItems = items.filter((i) => i.nivel === nv);
      const levelExisting = existingAreas.filter((a) => a.nivel === nv);

      const bounds = L.latLngBounds([]);
      let hasGeom = false;

      for (const it of levelItems) {
        const ring = cleanRing(it.coords);
        if (it.geomKind === 'point' && ring.length > 0) {
          bounds.extend(ring[0]);
          hasGeom = true;
        } else if (ring.length >= 3) {
          bounds.extend(ring);
          hasGeom = true;
        }
      }

      for (const a of levelExisting) {
        const ring = cleanRing(a.coords);
        if (ring.length === 1) {
          bounds.extend(ring[0]);
          hasGeom = true;
        } else if (ring.length >= 3) {
          bounds.extend(ring);
          hasGeom = true;
        }
      }

      if (hasGeom && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else {
        onToast?.(`Nenhum(a) ${NIVEIS[nv].label.toLowerCase()} cadastrado(a) no mapa para focar.`, 'info');
      }

      // Se for a fazenda, seleciona o único rascunho de fazenda se houver
      if (nv === 'fazenda' && levelItems[0]) {
        selectItem(levelItems[0].id);
      }
    },
    [items, existingAreas, selectItem, onToast]
  );

  // ── Confirmar ────────────────────────────────────────────────────────────
  // Lote do próximo Salvar: vinculadas e ainda NÃO gravadas (as `saved` já estão no
  // banco e permanecem na lista só para visualização — re-gravá-las duplicaria).
  const keptItems = useMemo(() => items.filter((i) => i.keep && !i.saved && validGeom(i.coords, i.geomKind)), [items]);
  // Feições JÁ salvas re-classificadas no de-para: entram no lote como UPDATE (por
  // `localId`), trocando só o tipo/3º nível do Local — sem virar insert/duplicata.
  const dirtySavedItems = useMemo(
    () => items.filter((i) => i.saved && i.dirty && i.localId && i.nivel === 'local' && !!i.tipo && validGeom(i.coords, i.geomKind)),
    [items],
  );
  const keptByLevel = useMemo(() => {
    const c: Record<Nivel, number> = { fazenda: 0, retiro: 0, setor: 0, local: 0 };
    keptItems.forEach((i) => (c[i.nivel] += 1));
    return c;
  }, [keptItems]);

  // ── De-para: feições importadas → destino do sistema (tipo/subtipo) ──────────
  /** índice tipo(nome)→tipo do catálogo (para resolver detalhes/subtipos). */
  const tipoByNome = useMemo(
    () => new Map((catalog?.tipos ?? []).map((t) => [t.nome, t] as const)),
    [catalog],
  );
  /** índice categoria(id)→categoria (para o rótulo de categoria no chip de destino). */
  const catById = useMemo(
    () => new Map((catalog?.categorias ?? []).map((c) => [c.id, c] as const)),
    [catalog],
  );
  /** feições vindas do arquivo (linhas do de-para; perímetro auto-traçado fica fora). */
  const importedItems = useMemo(
    () => items.filter((i) => i.source === 'paddock' || i.source === 'point'),
    [items],
  );
  // ── Re-hidratação do de-para: ATRIBUÍDOS + pendentes na mesma lista ──────────
  // Ao reabrir a tela, a lista é reconstruída do KMZ cru (buildItemsFromGeojson) com
  // TODAS as feições pendentes — perdendo o que já fora classificado/salvo. Aqui
  // casamos cada feição ainda pendente com a Área já gravada no banco (existingAreas)
  // e marcamos a linha como "salvo" (com seu destino). Resultado: os atribuídos voltam
  // a aparecer (travados, selo "salvo") ao lado dos pendentes, em vez de tudo virar
  // pendente. Roda quando existingAreas/catálogo chegam (podem carregar após o
  // auto-load) e só toca linhas pendentes — nunca sobrescreve atribuição em curso nem
  // re-grava o que já está salvo (keptItems exige !saved).
  useEffect(() => {
    const cur = itemsRef.current;
    const patches = new Map<string, Partial<DraftArea>>();

    // (A) Catálogo pode chegar DEPOIS do casamento (existingAreas é prop, catálogo é
    // fetch interno): completa a categoria das linhas já re-hidratadas que ficaram sem.
    if (tipoByNome.size) {
      for (const i of cur) {
        if (i.localId && i.nivel === 'local' && i.tipo && !i.categoriaId) {
          const cid = tipoByNome.get(i.tipo)?.categoriaId ?? null;
          if (cid) patches.set(i.id, { categoriaId: cid });
        }
      }
    }

    // (B) Casa cada feição ainda pendente com uma Área já salva (consumo 1-para-1).
    if (existingAreas.length) {
      // Áreas já vinculadas a alguma linha (salva nesta sessão ou re-hidratada) saem do pool.
      const claimed = new Set(cur.map((i) => i.localId).filter(Boolean) as string[]);
      const pool = existingAreas.filter((a) => a.nivel !== 'fazenda' && !a.isDefault && !claimed.has(a.id));
      const pendentes = cur.filter(
        (i) => (i.source === 'paddock' || i.source === 'point') && !i.saved && !i.keep && !i.naoImportar,
      );
      if (pool.length && pendentes.length) {
        const matches = matchSavedAreas(pendentes, pool, (tipo) =>
          tipo ? tipoByNome.get(tipo)?.categoriaId ?? null : null,
        );
        for (const m of matches) patches.set(m.itemId, m.patch);
      }
    }

    if (!patches.size) return;
    setItems((prev) => prev.map((i) => (patches.has(i.id) ? { ...i, ...patches.get(i.id) } : i)));
  }, [existingAreas, tipoByNome, items]);
  /** Grupos da coluna ORIGEM conforme "Agrupar por". */
  type FeatGroup = { key: string; label: string; items: DraftArea[] };
  // SEM agrupamento: a lista fica aberta — uma linha por feição importada.
  const groups = useMemo<FeatGroup[]>(() => {
    let arr: FeatGroup[] = importedItems.map((it) => ({ key: it.id, label: it.nome || '(sem nome)', items: [it] }));
    const ql = groupQuery.trim().toLowerCase();
    if (ql) arr = arr.filter((g) => g.label.toLowerCase().includes(ql));
    // Filtro por tipo de geometria (cabeçalho da coluna Origem).
    if (hiddenGeoms.size) {
      arr = arr.filter((g) => !hiddenGeoms.has(geomLabel(g.items[0].geomKind)));
    }
    return arr;
  }, [importedItems, groupQuery, hiddenGeoms]);
  /** Tipos de geometria presentes no arquivo + contagem (para o filtro do cabeçalho). */
  const geomStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of importedItems) {
      const lab = geomLabel(it.geomKind);
      m.set(lab, (m.get(lab) ?? 0) + 1);
    }
    return m;
  }, [importedItems]);
  /** Destaque MÚLTIPLO no mapa: desenha (azul) todas as feições dos grupos marcados + enquadra. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (multiHighlightRef.current) { safeRemoveLayer(map, multiHighlightRef.current); multiHighlightRef.current = null; }
    if (checkedGroups.size === 0) return;
    const grp = L.layerGroup();
    const b = L.latLngBounds([]);
    let has = false;
    for (const g of groups) {
      if (!checkedGroups.has(g.key)) continue;
      for (const it of g.items) {
        const ring = cleanRing(it.coords);
        if (it.geomKind === 'point' && ring[0]) {
          L.circleMarker(ring[0], { radius: 7, color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.85 }).addTo(grp);
          b.extend(ring[0]); has = true;
        } else if (it.geomKind === 'line' && ring.length >= 2) {
          L.polyline(ring, { color: '#2563eb', weight: 4, opacity: 0.95 }).addTo(grp);
          b.extend(ring); has = true;
        } else if (ring.length >= 3) {
          L.polygon(ring, { color: '#2563eb', weight: 3, opacity: 0.95, fillColor: '#2563eb', fillOpacity: 0.2 }).addTo(grp);
          b.extend(ring); has = true;
        }
      }
    }
    grp.addTo(map);
    multiHighlightRef.current = grp;
    if (has && b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
  }, [checkedGroups, groups, mapReady]);
  /** Contagem de grupos distintos por modo (badges do "Agrupar por"). */
  /** Destino atual de UMA feição (para derivar o destino do grupo). */
  const destOfItem = useCallback((it: DraftArea): Destino | null => {
    if (it.naoImportar) return { kind: 'none' };
    if (it.keep && (it.nivel === 'fazenda' || it.nivel === 'retiro' || it.nivel === 'setor'))
      return { kind: 'perimetro', nivel: it.nivel };
    if (it.keep && it.tipo) return { kind: 'tipo', categoriaId: it.categoriaId ?? '', tipo: it.tipo };
    return null; // pendente
  }, []);
  /** Destino do grupo (das feições NÃO-exceção) + flags "misto"/"sugerido" + nº de exceções. */
  const destOfGroup = useCallback(
    (g: FeatGroup): { dest: Destino | null; mixed: boolean; suggested: boolean; excecoes: number } => {
      const excecoes = g.items.filter((it) => it.excecao).length;
      const base = g.items.filter((it) => !it.excecao);
      const arr = base.length ? base : g.items;
      const ds = arr.map(destOfItem);
      const first = ds[0] ?? null;
      const allSame = ds.every((d) => sameDestino(d, first));
      const dest = allSame ? first : null;
      const suggested = !!dest && dest.kind === 'tipo' && arr.every((it) => it.sugerido);
      return { dest, mixed: !allSame, suggested, excecoes };
    },
    [destOfItem],
  );
  /** Monta o patch de um destino (sem mexer em `excecao`). */
  const patchOfDestino = useCallback((d: Destino, opts?: { suggested?: boolean; detalhe?: string | null }): Partial<DraftArea> => {
    const suggested = opts?.suggested ?? false;
    return d.kind === 'perimetro'
      ? { keep: true, nivel: d.nivel, categoriaId: null, tipo: null, detalhe: null, naoImportar: false, sugerido: false }
      : d.kind === 'tipo'
        ? { keep: true, nivel: 'local', categoriaId: d.categoriaId, tipo: d.tipo, detalhe: opts?.detalhe ?? null, naoImportar: false, sugerido: suggested }
        : { keep: false, nivel: 'local', categoriaId: null, tipo: null, detalhe: null, naoImportar: true, sugerido: false };
  }, []);
  /** Aplica um destino ao GRUPO (preserva exceções). Tudo é alocado manualmente. */
  const applyDestino = useCallback(
    (g: FeatGroup, d: Destino, opts?: { suggested?: boolean; detalhe?: string | null }) => {
      // Feição JÁ salva: o de-para permite RE-CLASSIFICAR (trocar o tipo/3º nível de
      // um Local já gravado) — vira UPDATE por `localId` ao salvar. Mudar de nível
      // (perímetro) ou "Não importar" mexe na estrutura/exclusão e é feito no mapa.
      const isSaved = g.items.some((it) => it.saved);
      if (isSaved && d.kind !== 'tipo') {
        onToast?.('Para mudar o nível ou remover uma área já salva, use o mapa.', 'info');
        setOpenPicker(null);
        return;
      }
      const patch = patchOfDestino(d, opts);
      // Se TODAS são exceção, o destino do grupo volta a valer para todas (limpa a exceção).
      const allExc = g.items.length > 0 && g.items.every((it) => it.excecao);
      g.items.forEach((it) => {
        // Re-classificar uma feição salva marca-a como `dirty` (re-entra no lote como UPDATE).
        const dirtyPatch = it.saved ? { dirty: true } : {};
        if (allExc) patchItem(it.id, { ...patch, ...dirtyPatch, excecao: false });
        else if (!it.excecao) patchItem(it.id, { ...patch, ...dirtyPatch });
      });
      setOpenPicker(null);
    },
    [patchItem, patchOfDestino, onToast],
  );
  /** "Identificar vários": aplica UM destino a TODAS as feições marcadas (checkbox da
   *  coluna Origem) de uma vez. Pula as já salvas (linhas travadas) e limpa a seleção. */
  const applyDestinoBulk = useCallback(
    (d: Destino) => {
      const alvos = groups.filter((g) => checkedGroups.has(g.key) && !g.items.some((it) => it.saved));
      alvos.forEach((g) => applyDestino(g, d));
      setBulkPicker(null);
      setCheckedGroups(new Set());
      if (alvos.length > 0) {
        onToast?.(`${alvos.length} ${alvos.length === 1 ? 'item identificado' : 'itens identificados'} com o mesmo destino.`, 'success');
      }
    },
    [groups, checkedGroups, applyDestino, onToast],
  );
  /** Define o subtipo (detalhe) de um grupo — vira vínculo confirmado (não-exceção). */
  const applySubtipo = useCallback(
    (g: FeatGroup, detalhe: string | null) => {
      const allExc = g.items.length > 0 && g.items.every((it) => it.excecao);
      g.items.forEach((it) => {
        if (allExc || !it.excecao) patchItem(it.id, { detalhe, sugerido: false, ...(it.saved ? { dirty: true } : {}) });
      });
    },
    [patchItem],
  );
  /**
   * "Sugerir destino": recomenda um tipo do catálogo para cada feição AINDA pendente,
   * a partir da origem (nome + geometria). Em camadas, da mais confiável à mais genérica:
   *   1) NOME / tipo cru do arquivo  → casamento local (synônimos/tokens — kmlImport);
   *   2) IA (Claude) para o que sobrar → usa nome + geometria + o catálogo real;
   *   3) padrão por GEOMETRIA          → polígono ⇒ pastagem, ponto ⇒ água, linha ⇒ linha de água.
   * Tudo entra como `sugerido:true` (selo "✨ sugerido"), NUNCA como salvo — a barra de
   * seleção continua liberada para o usuário confirmar ou trocar o destino.
   */
  const GEOM_KEYWORD: Record<'area' | 'point' | 'line', string> = useMemo(
    () => ({ area: 'pastagem', point: 'aguada agua bebedouro poco', line: 'rede hidraulica agua' }),
    [],
  );
  const runSuggestDestinos = useCallback(async () => {
    if (suggesting) return;
    const pend = importedItems.filter((it) => !it.saved && !it.keep && !it.naoImportar);
    if (!pend.length) { onToast?.('Nenhuma feição pendente para sugerir.', 'info'); return; }
    if (!catalog?.tipos?.length) { onToast?.('Cadastre os Tipos de Locais antes de sugerir destinos.', 'warning'); return; }

    setSuggesting(true);
    try {
      const patches = new Map<string, Partial<DraftArea>>();
      const setTipo = (id: string, categoriaId: string, tipo: string, detalhe: string | null = null) =>
        patches.set(id, { keep: true, nivel: 'local', categoriaId, tipo, detalhe, naoImportar: false, sugerido: true });

      // 1) Nome / tipo cru do arquivo (heurística local — sinônimos + tokens).
      const unresolved: DraftArea[] = [];
      for (const it of pend) {
        const byName = suggestDestino(it.nome || '', catalog) || (it.srcTipo ? suggestDestino(it.srcTipo, catalog) : null);
        if (byName) setTipo(it.id, byName.categoriaId, byName.tipo, byName.detalhe);
        else unresolved.push(it);
      }

      // 2) IA (Claude) para as feições que o nome não resolveu — "se necessário".
      let aiCount = 0;
      if (unresolved.length) {
        try {
          const results = await suggestDestinos({
            categorias: catalog.categorias.map((c) => ({ id: c.id, nome: c.nome })),
            tipos: catalog.tipos.map((t) => ({ id: t.id, categoriaId: t.categoriaId, nome: t.nome })),
            features: unresolved.map((it) => ({
              id: it.id,
              nome: it.nome || '',
              geom: it.geomKind === 'area' ? 'poligono' : it.geomKind === 'point' ? 'ponto' : 'linha',
              tipoArquivo: it.srcTipo ?? null,
            })),
          });
          const byId = new Map(results.map((r) => [r.id, r] as const));
          for (const it of unresolved) {
            const r = byId.get(it.id);
            if (!r?.tipo) continue;
            // Confia só se o tipo existir no catálogo (resolve a categoria pelo nome).
            const cid = tipoByNome.get(r.tipo)?.categoriaId ?? (r.categoriaId || null);
            if (cid) { setTipo(it.id, cid, r.tipo); aiCount += 1; }
          }
        } catch {
          /* IA indisponível (sem chave / offline) — segue para o padrão por geometria. */
        }
      }

      // 3) Padrão por geometria (regra explícita: polígono→pastagem, ponto→água, linha→linha de água).
      for (const it of unresolved) {
        if (patches.has(it.id)) continue;
        const g = suggestDestino(GEOM_KEYWORD[it.geomKind], catalog);
        if (g) setTipo(it.id, g.categoriaId, g.tipo, g.detalhe);
      }

      if (!patches.size) {
        onToast?.('Não encontrei destinos compatíveis no catálogo. Classifique manualmente.', 'warning');
        return;
      }
      setItems((prev) => prev.map((i) => (patches.has(i.id) ? { ...i, ...patches.get(i.id) } : i)));
      const restante = pend.length - patches.size;
      onToast?.(
        `${patches.size} destino(s) sugerido(s)${aiCount ? ` · ${aiCount} via IA` : ''}` +
          `${restante > 0 ? ` · ${restante} sem palpite` : ''}. Revise e ajuste se necessário.`,
        'success',
      );
    } finally {
      setSuggesting(false);
    }
  }, [suggesting, importedItems, catalog, tipoByNome, GEOM_KEYWORD, onToast]);
  /** Progresso do de-para por FEIÇÃO efetiva (salvas · vinculadas a salvar · ignoradas · pendentes). */
  const deparaProgress = useMemo(() => {
    let salvas = 0, vinculadas = 0, ignoradas = 0, pendentes = 0;
    for (const it of importedItems) {
      // Salva mas re-classificada (dirty): conta como "a salvar" — há trabalho pendente.
      if (it.saved && it.dirty) vinculadas += 1;
      else if (it.saved) salvas += 1;
      else if (it.naoImportar) ignoradas += 1;
      else if (it.keep && (!!it.tipo || it.nivel !== 'local')) vinculadas += 1;
      else pendentes += 1;
    }
    return { total: importedItems.length, salvas, vinculadas, ignoradas, pendentes };
  }, [importedItems]);
  /** Centraliza o mapa em todas as feições de um grupo. */
  const fitGroup = useCallback((g: FeatGroup) => {
    const map = mapRef.current;
    if (!map) return;
    const b = L.latLngBounds([]);
    let has = false;
    for (const it of g.items) {
      const ring = cleanRing(it.coords);
      if (it.geomKind === 'point' && ring[0]) { b.extend(ring[0]); has = true; }
      else if (ring.length >= 2) { b.extend(ring); has = true; }
    }
    if (has && b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
  }, []);

  /**
   * Entrar direto na ferramenta de alocação: se ainda não há arquivo aberto mas
   * existe mapa salvo, carrega automaticamente o mais relevante (prioriza o
   * "Original" importado, não o "_Mapa"/contorno de produção) — pula a tela inicial.
   */
  const autoLoadRef = useRef(false);
  useEffect(() => {
    if (autoLoadRef.current || geojson || !uploadedMaps?.length) return;
    const cand = uploadedMaps.find((m) => !isProdMap(m) && m.geojson) ?? uploadedMaps.find((m) => m.geojson);
    if (!cand?.geojson) return;
    autoLoadRef.current = true;
    const gj = cand.geojson as GeoJSON.FeatureCollection;
    setFile(new File([], cand.original_name || cand.file_name || ''));
    setGeojson(gj);
    // Reconstrói as feições do de-para (coluna ORIGEM) a partir do GeoJSON salvo.
    // Sem isto, ao reabrir a tela só o overlay reaparecia e a lista voltava vazia
    // ("Nenhuma feição"), obrigando a excluir e reimportar o arquivo.
    const built = buildItemsFromGeojson(gj);
    setItems(built);
    setSelId(built.find((i) => i.nivel !== 'fazenda')?.id ?? built[0]?.id ?? null);
    // Como na importação: mostra o original (referência) + a produção e enquadra.
    setMapSource('ambos');
    setSaveOverlay(false);
    pendingFitRef.current = true;
    setSelectedMapIds((prev) => { const next = new Set(prev); next.add(cand.id); return next; });
  }, [geojson, uploadedMaps]);

  /** Categorias/tipos com feições no mapa (para o visualizador). */
  const presentLegend = useMemo(() => {
    const catMap = new Map<
      string,
      { nome: string; cor: string; tipos: Map<string, { cor: string; icone: string | null }> }
    >();
    for (const it of items) {
      if (!it.categoriaId || !it.tipo) continue;
      const cat = catalog?.categorias.find((c) => c.id === it.categoriaId);
      let entry = catMap.get(it.categoriaId);
      if (!entry) {
        entry = { nome: cat?.nome ?? 'Outros', cor: cat?.cor ?? '#6b7280', tipos: new Map() };
        catMap.set(it.categoriaId, entry);
      }
      if (!entry.tipos.has(it.tipo)) {
        const r = catalogIndex.resolve(it.tipo);
        entry.tipos.set(it.tipo, { cor: r?.cor ?? entry.cor, icone: r?.icone ?? null });
      }
    }
    return [...catMap.entries()];
  }, [items, catalog, catalogIndex]);

  /**
   * Retiros e Setores NOMEADOS (rascunho que será mantido + já salvos) para a
   * legenda individual: cada um vira uma linha sob o seu nível, com show/oculta
   * próprio. Rascunhos têm prioridade (o id já salvo, se reaparecer, não duplica).
   */
  const legendAreasByLevel = useMemo(() => {
    const out: Record<'retiro' | 'setor', { id: string; nome: string; cor: string }[]> = {
      retiro: [],
      setor: [],
    };
    const seen = new Set<string>();
    for (const it of items) {
      // Pula as já salvas: entram pela lista de `existingAreas` (evita 2 entradas).
      if ((it.nivel === 'retiro' || it.nivel === 'setor') && it.keep && !it.saved && validGeom(it.coords, it.geomKind)) {
        out[it.nivel].push({
          id: it.id,
          nome: (it.nome || '').trim() || defaultNome(it.nivel),
          cor: it.strokeColor ?? NIVEIS[it.nivel].cor,
        });
        seen.add(it.id);
      }
    }
    for (const a of existingAreas) {
      if ((a.nivel === 'retiro' || a.nivel === 'setor') && !seen.has(a.id)) {
        out[a.nivel].push({ id: a.id, nome: a.nome, cor: a.strokeColor ?? NIVEIS[a.nivel].cor });
      }
    }
    return out;
  }, [items, existingAreas]);

  // No Geocadastro o de-para é resolvido POR ETAPAS: pode salvar as feições já
  // vinculadas mesmo havendo pendentes — estas têm keep=false, não são gravadas e
  // permanecem na lista para o usuário classificar depois.
  const canConfirm = !parsing && !busy && !editing && !drawing && (keptItems.length > 0 || dirtySavedItems.length > 0 || (saveOverlay && !!geojson));

  const submit = useCallback(async (dataReferencia: string) => {
    if (!canConfirm) return;
    // keptItems → INSERT; dirtySavedItems → UPDATE (carregam `localId`).
    const out: MestreItemOut[] = [...keptItems, ...dirtySavedItems].map((i) => {
      const temEstilo = i.nivel === 'retiro' || i.nivel === 'setor';
      return {
        id: i.id,
        nome: (i.nome || '').trim() || defaultNome(i.nivel),
        nivel: i.nivel,
        coords: cleanRing(i.coords),
        tipo: i.nivel === 'local' ? i.tipo ?? 'Pasto' : null,
        detalhe: i.nivel === 'local' ? i.detalhe ?? null : null,
        parentId: i.parentId,
        fonte: i.source === 'drawn' ? 'desenho' : 'kml',
        geomKind: i.geomKind,
        strokeColor: temEstilo ? i.strokeColor : null,
        fillColor: temEstilo ? i.fillColor : null,
        fillOpacity: temEstilo ? i.fillOpacity : null,
        strokeWeight: temEstilo ? i.strokeWeight : null,
        localId: i.saved ? i.localId ?? null : null,
      };
    });
    try {
      const res = await onConfirm({ items: out, saveOverlay, file, geojson, dataReferencia });
      if (res && Array.isArray(res.savedIds)) {
        const saved = new Set(res.savedIds);
        // Salvar POR ETAPAS, mantendo TODAS as feições na lista: as gravadas viram
        // `saved:true` (exibidas como "salvo", fora do próximo lote e da camada de
        // rascunho do mapa) e as demais (pendentes/ignoradas) seguem para
        // classificar. Nada é removido da lista — o usuário vê o todo o tempo todo.
        const next = itemsRef.current.map((i) => (saved.has(i.id) ? { ...i, saved: true, dirty: false } : i));
        setItems(next);
        // Modal avulso (não-embutido): fecha quando não há mais nada a fazer —
        // nada a gravar (keep ainda não salvo) nem feição importada pendente.
        if (!embedded) {
          const isPendenteImport = (i: DraftArea) =>
            !i.keep && !i.naoImportar && (i.source === 'paddock' || i.source === 'point') && validGeom(i.coords, i.geomKind);
          const temTrabalho = next.some(
            (i) => (i.keep && !i.saved && validGeom(i.coords, i.geomKind)) || isPendenteImport(i),
          );
          if (!temTrabalho) onClose();
        }
      } else if (!embedded) {
        onClose();
      }
    } catch (err) {
      console.error('Falha ao salvar o cadastro de áreas:', err);
      onToast?.('Não foi possível concluir o cadastro.', 'error');
    }
  }, [canConfirm, keptItems, dirtySavedItems, saveOverlay, file, geojson, onConfirm, onClose, onToast, embedded]);

  // ── Clicar num arquivo importado: aproxima o mapa na geometria dele ──────────
  const zoomToMap = useCallback((m: FarmMapData) => {
    const map = mapRef.current;
    if (!map || !m.geojson) {
      onToast?.('Este arquivo não tem geometria para aproximar.', 'warning');
      return;
    }
    try {
      const b = L.geoJSON(m.geojson as GeoJSON.GeoJsonObject).getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 16 });
      else onToast?.('Não foi possível localizar a geometria deste arquivo.', 'warning');
    } catch {
      onToast?.('Geometria do arquivo inválida.', 'warning');
    }
  }, [onToast]);

  return (
    <>
    <div
      className={
        embedded
          ? fullscreen
            ? 'fixed inset-0 z-[2000] flex' // tela cheia: cobre o viewport inteiro
            : 'absolute inset-0 z-[1100] flex' // embutida: preenche a área de conteúdo (acima do controle de zoom do Leaflet de baixo, z-index 1000, que senão "vaza" como zoom duplicado)
          : `fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(16,24,40,.42)] backdrop-blur-[2px] ${
              fullscreen ? 'p-0' : 'p-4'
            }`
      }
      onClick={embedded ? undefined : onClose}
    >
      <div
        className={`relative flex flex-col overflow-hidden bg-white ${
          embedded
            ? 'h-full w-full max-h-none max-w-none rounded-none'
            : fullscreen
              ? 'h-full w-full max-h-none max-w-none rounded-none shadow-2xl'
              : 'max-h-[94vh] w-[1240px] max-w-[96vw] rounded-2xl shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Abas no topo — só em TELA CHEIA embutida. A barra "Cadastro de áreas /
            Colunas" do container (FarmLocaisTab) fica coberta por este overlay
            fixed; replicamos aqui para continuar navegável. "Colunas" sai da tela
            cheia e volta às colunas (onShowColumns desmonta esta tela). */}
        {embedded && fullscreen && onShowColumns && (
          <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-6 pb-2 pt-3">
            <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
              <span
                className="rounded-md bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-900 shadow-sm"
                title="Cadastro de áreas no mapa (tela atual)"
              >
                Cadastro de áreas
              </span>
              <button
                type="button"
                onClick={onShowColumns}
                className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"
                title="Ver as colunas das áreas cadastradas (sai da tela cheia)"
              >
                Colunas
              </button>
              <button
                type="button"
                onClick={() => setView('uso')}
                className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"
                title="Uso da terra: áreas alocadas por tipo de local, com hectares"
              >
                Uso da terra
              </button>
            </div>
            <span className="text-[11.5px] text-gray-400">
              Cadastre as áreas no mapa: escolha uma categoria e desenhe áreas ou insira pontos.
            </span>
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-6 pb-3 pt-5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Layers size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[17px] font-bold text-gray-900">Cadastro de Áreas</h3>
            <div className="mt-0.5 text-[13px] text-gray-500">
              Reproduza no mapa tudo da fazenda: escolha uma <b>categoria</b> acima e <b>desenhe áreas</b> ou{' '}
              <b>insira pontos</b> de cada tipo. <b>Geocadastro</b> cuida dos contornos e da importação.
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Restaurar tamanho' : 'Tela cheia'}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Barra de categorias (header) — Geocadastro + categorias do catálogo */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 px-4 py-2">
          {(
            [
              { id: 'perimetro', nome: 'Geocadastro', cor: NIVEIS.fazenda.cor, icone: null },
              { id: 'perimetroLista', nome: 'Perímetro', cor: NIVEIS.fazenda.cor, icone: null },
              ...(catalog?.categorias ?? []),
            ] as Array<{ id: string; nome: string; cor: string | null; icone: string | null }>
          ).map((c) => {
            const on = activeCat === c.id;
            const cor = c.cor ?? '#6b7280';
            // 'perimetro' e 'perimetroLista' compartilham o olho: ligam/desligam os 4 níveis.
            const isPerim = c.id === 'perimetro' || c.id === 'perimetroLista';
            const hidden = isPerim ? activeOrdem.every((nv) => hiddenLevels.has(nv)) : hiddenCats.has(c.id);
            return (
              <div
                key={c.id}
                className={`flex shrink-0 items-center rounded-lg border transition-colors ${
                  on ? 'text-white' : 'bg-white text-gray-600'
                }`}
                style={on ? { background: cor, borderColor: cor } : { borderColor: '#e5e7eb' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveCat(c.id);
                    setExpandedTipo(null);
                    setPointMode(null);
                  }}
                  className={`py-1.5 pl-2.5 pr-1 text-[12.5px] font-semibold ${on ? '' : 'hover:text-gray-900'}`}
                >
                  {c.nome}
                </button>
                <button
                  type="button"
                  title={hidden ? `Mostrar ${c.nome} no mapa` : `Ocultar ${c.nome} no mapa`}
                  onClick={() => {
                    if (isPerim) {
                      setHiddenLevels((prev) => (activeOrdem.every((nv) => prev.has(nv)) ? new Set<Nivel>() : new Set<Nivel>(activeOrdem)));
                    } else {
                      toggleCatVisibility(c.id);
                    }
                  }}
                  className={`flex h-7 w-6 items-center justify-center rounded-r-lg ${
                    on ? 'hover:bg-white/20' : 'text-gray-400 hover:bg-gray-50'
                  } ${hidden ? 'opacity-50' : ''}`}
                >
                  {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            );
          })}
          {catLoading && !catalog && <Loader2 size={15} className="shrink-0 animate-spin text-gray-300" />}
        </div>

        {/* Segunda linha — tipos da categoria ativa. Cada chip = ícone + nome +
            olho (mostrar/ocultar no mapa). Desenhar área / inserir ponto ficam no
            painel do tipo (abre ao clicar no chip), à esquerda. */}
        {activeCat !== 'perimetro' && activeCat !== 'perimetroLista' &&
          (() => {
            const cat = catalog?.categorias.find((c) => c.id === activeCat);
            const catCor = cat?.cor ?? '#6b7280';
            const tipos = tiposByCat.get(activeCat) ?? [];
            return (
              <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 bg-gray-50/60 px-4 py-2">
                {tipos.length === 0 ? (
                  <span className="text-[12px] text-gray-400">
                    Nenhum tipo nesta categoria. Cadastre em <b>Tipos de Locais</b>.
                  </span>
                ) : (
                  tipos.map((t) => {
                    const cor = t.cor || catCor;
                    const sel = expandedTipo === t.id;
                    const feats = items.filter((i) => i.categoriaId === activeCat && i.tipo === t.nome);
                    return (
                      <div
                        key={t.id}
                        className={`flex shrink-0 items-center gap-1.5 rounded-lg border bg-white py-1 pl-1.5 pr-1 transition-colors ${
                          sel ? '' : 'border-gray-200'
                        }`}
                        style={sel ? { borderColor: cor, boxShadow: `0 0 0 1px ${cor}` } : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedTipo(sel ? null : t.id)}
                          className="flex items-center gap-1.5"
                          title={`Detalhar ${t.nome}`}
                        >
                          <span
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                            style={{ background: `${cor}1a`, color: cor }}
                          >
                            <TipoIcon name={t.icone} size={14} fallback={<span className="h-2 w-2 rounded-full" style={{ background: cor }} />} />
                          </span>
                          <span className="text-[12px] font-semibold text-gray-800">{t.nome}</span>
                          {feats.length > 0 && (
                            <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600">
                              {feats.length}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          title={hiddenTipos.has(t.nome) ? 'Mostrar no mapa' : 'Ocultar no mapa'}
                          onClick={() => toggleTipoVisibility(t.nome)}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                        >
                          {hiddenTipos.has(t.nome) ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}

        {/* Corpo — painéis laterais + mapa */}
        <div className={`grid min-h-0 flex-1 grid-cols-1 gap-0 ${
          activeCat === 'perimetro'
            ? 'md:grid-cols-2'
            : 'md:grid-cols-[minmax(360px,440px)_1fr]'
        }`}>
          {activeCat === 'perimetro' ? (
            <>
              {/* Painel de-para (50%): ORIGEM (arquivo) → DESTINO (sistema) */}
              <div className="flex min-h-0 flex-col overflow-hidden border-r border-gray-100">
                {/* Seletor de arquivo (oculto) */}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".kml,.kmz"
                  className="hidden"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />

                {!geojson ? (
                  /* ── Sem arquivo: zona de importação ── */
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-4">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      disabled={parsing || busy}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 py-3 text-[13px] font-semibold text-gray-600 hover:border-emerald-400 hover:bg-emerald-50/40 disabled:opacity-60"
                    >
                      {parsing ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                      {parsing ? 'Lendo arquivo…' : 'Importar do Google Earth (.kml/.kmz)'}
                    </button>
                    {error && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
                        <AlertTriangle size={15} className="flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}
                    <p className="text-[12px] leading-snug text-gray-500">
                      Importe o KML/KMZ da fazenda. Depois faça o <b>de-para</b>: para cada feição do
                      arquivo escolha o <b>tipo</b> de destino no sistema (ou <b>Perímetro</b> → Fazenda/Retiro/Setor).
                    </p>
                    {uploadedMaps && uploadedMaps.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Arquivos salvos</span>
                        <div className="flex max-h-[280px] flex-col gap-1 overflow-auto rounded-lg border border-gray-200 bg-gray-50/60 p-2">
                          {uploadedMaps.map((m) => {
                            const isProduction = isProdMap(m);
                            return (
                              <div key={m.id} className="flex items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFile(new File([], m.original_name || m.file_name || ''));
                                    setGeojson(m.geojson as GeoJSON.FeatureCollection);
                                    setSaveOverlay(false);
                                    setSelectedMapIds((prev) => { const next = new Set(prev); next.add(m.id); return next; });
                                    zoomToMap(m);
                                  }}
                                  title="Carregar este arquivo e suas marcações"
                                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-emerald-50/50"
                                >
                                  <FileUp size={14} className="shrink-0 text-emerald-500" />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <span className="truncate text-[12px] font-semibold text-gray-700" title={m.original_name || m.file_name}>
                                        {m.original_name || m.file_name || 'Arquivo importado'}
                                      </span>
                                      <span className={`shrink-0 rounded border px-1.5 py-0.25 text-[9px] font-bold ${isProduction ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                                        {isProduction ? 'Produção' : 'Original'}
                                      </span>
                                    </span>
                                    <span className="block text-[10.5px] text-gray-400">
                                      {(m.file_type || '').toUpperCase()}
                                      {m.file_size ? ` · ${(m.file_size / 1024).toFixed(0)} KB` : ''}
                                      {m.created_at ? ` · ${new Date(m.created_at).toLocaleDateString('pt-BR')}` : ''}
                                    </span>
                                  </span>
                                </button>
                                {m.corrected_storage_path && (
                                  <button
                                    type="button"
                                    onClick={() => baixarCorrigido(m)}
                                    title="Baixar o .kmz já corrigido (linhas fechadas viraram áreas)"
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
                                  >
                                    <Download size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={busy || !onDeleteArquivo}
                                  onClick={() => handleDeleteArquivo(m, isProduction)}
                                  title={isProduction ? 'Excluir o mapa de produção e as áreas geradas' : 'Excluir este arquivo importado'}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Com arquivo: de-para (ORIGEM → DESTINO) ── */
                  <>
                    {/* Barra: progresso + sugerir + buscar */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${deparaProgress.pendentes > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {deparaProgress.pendentes > 0 ? `${deparaProgress.pendentes} pendente(s)` : 'tudo resolvido'}
                      </span>
                      {/* Arquivo KMZ: abre a lista dos 2 arquivos (Original + Produção) com excluir */}
                      <div className="relative" ref={arquivoMenuRef}>
                        <button
                          type="button"
                          onClick={() => setArquivoMenuOpen((v) => !v)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          <FileUp size={14} /> Arquivo KMZ
                          <ChevronDown size={13} className={`transition-transform ${arquivoMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {arquivoMenuOpen && (
                          <div className="absolute left-0 top-full z-[1500] mt-1 w-72 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                            {(uploadedMaps ?? []).length === 0 ? (
                              <div className="px-3 py-2 text-[12px] text-gray-400">Nenhum arquivo salvo ainda.</div>
                            ) : (
                              (uploadedMaps ?? []).map((m) => {
                                const isProd = isProdMap(m);
                                return (
                                  <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
                                    <span className={`shrink-0 rounded border px-1.5 py-0.25 text-[9px] font-bold ${isProd ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                                      {isProd ? 'Produção' : 'Original'}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700" title={m.original_name || m.file_name}>
                                      {m.original_name || m.file_name || 'arquivo'}
                                    </span>
                                    {m.corrected_storage_path && (
                                      <button
                                        type="button"
                                        onClick={() => baixarCorrigido(m)}
                                        title="Baixar o .kmz já corrigido (linhas fechadas viraram áreas)"
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
                                      >
                                        <Download size={14} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={busy || !onDeleteArquivo}
                                      title={isProd ? 'Excluir o mapa de produção e as áreas geradas' : 'Excluir o arquivo original e limpar a importação'}
                                      onClick={() => handleDeleteArquivo(m, isProd)}
                                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                );
                              })
                            )}
                            <button
                              type="button"
                              onClick={() => { setArquivoMenuOpen(false); inputRef.current?.click(); }}
                              disabled={parsing || busy}
                              className="mt-1 flex w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              <FileUp size={14} /> Importar outro arquivo…
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Identificar vários: aloca todas as feições MARCADAS (caixa à esquerda) ao mesmo destino de uma vez. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          if (checkedGroups.size === 0) {
                            onToast?.('Marque ao menos um item na lista (caixa à esquerda) para identificar vários.', 'info');
                            return;
                          }
                          setBulkPicker((e.currentTarget as HTMLElement).getBoundingClientRect());
                        }}
                        disabled={checkedGroups.size === 0}
                        title="Marque vários itens pelas caixas à esquerda e escolha um único destino para todos de uma vez."
                        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ListChecks size={14} />
                        {checkedGroups.size > 0 ? `Identificar vários (${checkedGroups.size})` : 'Identificar vários'}
                      </button>
                      {/* Sugerir destino: recomenda o tipo de cada feição pendente (nome + geometria + IA). */}
                      <button
                        type="button"
                        onClick={runSuggestDestinos}
                        disabled={suggesting || deparaProgress.pendentes === 0}
                        title="Recomenda um destino para cada feição pendente a partir da origem: nome do arquivo e tipo de geometria (polígono → pastagem, ponto → água, linha → linha de água). Você pode ajustar depois."
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {suggesting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                        {suggesting ? 'Sugerindo…' : 'Sugerir Ítem do mapa'}
                      </button>
                      {/* Mostrar no mapa: novo mapa (Produção) e/ou o KMZ Original (referência) */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-gray-500">Mostrar:</span>
                        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                          {([['producao', 'Produção'], ['original', 'Original'], ['ambos', 'Ambos']] as const).map(([v, label]) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setMapSource(v)}
                              title={v === 'producao' ? 'Mostra o novo mapa (editável)' : v === 'original' ? 'Mostra o KMZ original (referência)' : 'Mostra os dois'}
                              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${mapSource === v ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 focus-within:border-emerald-400">
                        <Search size={13} className="shrink-0 text-gray-400" />
                        <input
                          value={groupQuery}
                          onChange={(e) => setGroupQuery(e.target.value)}
                          placeholder="Buscar grupo..."
                          className="w-32 bg-transparent text-[12px] outline-none"
                        />
                      </div>
                    </div>

                    {/* Cabeçalho da tabela */}
                    <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <input
                        type="checkbox"
                        title="Selecionar todos para ver no mapa"
                        className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
                        checked={groups.length > 0 && groups.every((g) => checkedGroups.has(g.key))}
                        ref={(el) => { if (el) el.indeterminate = checkedGroups.size > 0 && !groups.every((g) => checkedGroups.has(g.key)); }}
                        onChange={(e) => setCheckedGroups(e.target.checked ? new Set(groups.map((g) => g.key)) : new Set())}
                      />
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span>Origem · Arquivo</span>
                        <div className="relative" ref={geomMenuRef}>
                          <button
                            type="button"
                            onClick={() => setGeomMenuOpen((v) => !v)}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal ${hiddenGeoms.size > 0 ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
                          >
                            Tipo
                            <ChevronDown size={11} className={`transition-transform ${geomMenuOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {geomMenuOpen && (
                            <div className="absolute left-0 top-full z-[1500] mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 normal-case tracking-normal shadow-lg">
                              {[...geomStats.entries()].map(([lab, count]) => {
                                const visible = !hiddenGeoms.has(lab);
                                return (
                                  <button key={lab} type="button" onClick={() => toggleGeom(lab)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] font-medium text-gray-700 hover:bg-gray-50">
                                    <input type="checkbox" readOnly checked={visible} className="pointer-events-none h-3.5 w-3.5 accent-blue-600" />
                                    {lab === 'Ponto' ? <MapPin size={12} className="text-amber-600" /> : lab === 'Linha' ? <Spline size={12} className="text-indigo-600" /> : <Square size={12} className="text-emerald-600" />}
                                    <span className="flex-1">{lab}</span>
                                    <span className="text-[10px] tabular-nums text-gray-400">{count}</span>
                                  </button>
                                );
                              })}
                              {geomStats.size === 0 && <div className="px-2.5 py-2 text-[11px] text-gray-400">Sem feições.</div>}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="w-[44%] shrink-0">Destino · Sistema</span>
                      <span className="w-[82px] shrink-0 text-right">Situação</span>
                    </div>

                    {/* Linhas do de-para */}
                    <div className="min-h-0 flex-1 overflow-auto">
                      {groups.length === 0 ? (
                        <div className="py-10 text-center text-[12.5px] text-gray-400">
                          {importedItems.length === 0 ? 'Nenhuma feição (área/ponto/linha) no arquivo.' : 'Nenhum grupo encontrado para a busca.'}
                        </div>
                      ) : (
                        groups.map((g) => {
                          const { dest, mixed, suggested } = destOfGroup(g);
                          const tipoEntry = dest?.kind === 'tipo' ? tipoByNome.get(dest.tipo) ?? null : null;
                          const destCat = dest?.kind === 'tipo' ? catById.get(dest.categoriaId) ?? null : null;
                          const detalhes = tipoEntry ? (detalhesByTipo.get(tipoEntry.id) ?? []) : [];
                          const curDetalhe = dest?.kind === 'tipo' ? (g.items[0]?.detalhe ?? '') : '';
                          const gKind = g.items[0]?.geomKind ?? null;
                          // Feição já gravada (Salvar por etapas): marcada "salvo". O destino
                          // continua editável — re-classificar grava como UPDATE (vira "alterado").
                          const saved = !!g.items[0]?.saved;
                          const dirty = !!g.items[0]?.dirty;
                          return (
                            <div key={g.key} className={`border-b border-gray-50 ${checkedGroups.has(g.key) ? 'bg-blue-50/40' : ''}`}>
                              <div className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50/50">
                                <input
                                  type="checkbox"
                                  title="Marcar para ver no mapa (várias ao mesmo tempo)"
                                  className="h-3.5 w-3.5 shrink-0 accent-blue-600"
                                  checked={checkedGroups.has(g.key)}
                                  onChange={() => toggleCheckedGroup(g.key)}
                                />
                                {/* ORIGEM */}
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <button type="button" onClick={() => fitGroup(g)} title="Mostrar no mapa" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                                    {gKind === 'point' ? <MapPin size={14} className="text-amber-600" /> : gKind === 'line' ? <Spline size={14} className="text-indigo-600" /> : <Square size={14} className="text-emerald-600" />}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <button type="button" onClick={() => fitGroup(g)} className="block max-w-full truncate text-left text-[12.5px] font-semibold text-gray-800 hover:text-emerald-700" title={`${g.label} — clique para mostrar no mapa`}>
                                      {g.label}
                                    </button>
                                    <span className="text-[11px] text-gray-400">
                                      {geomLabel(g.items[0].geomKind)}
                                      {g.items[0].geomKind === 'area' && g.items[0].areaM2 > 0 && (
                                        <span className="tabular-nums text-gray-500"> · {(g.items[0].areaM2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha</span>
                                      )}
                                      {g.items[0].corrigido && (
                                        <span
                                          title={`Era uma linha fechada no arquivo; convertida em área automaticamente${g.items[0].corrigidoGapM != null ? ` (fechamento de ${g.items[0].corrigidoGapM} m)` : ''}.`}
                                          className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 align-middle"
                                        >
                                          <Spline size={9} /> linha → área
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                                <ArrowRight size={14} className="hidden shrink-0 text-gray-300 sm:block" />
                                {/* DESTINO */}
                                <div className="w-[44%] shrink-0">
                                  <button
                                    type="button"
                                    title={saved ? 'Clique para re-classificar esta área já salva' : undefined}
                                    onClick={(e) => setOpenPicker({ key: g.key, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-gray-50 ${dirty ? 'border-amber-300 bg-amber-50/40' : saved ? 'border-emerald-200 bg-emerald-50/30' : dest && dest.kind !== 'none' ? 'border-emerald-300 bg-emerald-50/40' : mixed ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'}`}
                                  >
                                    {(() => {
                                      if (mixed) return <span className="min-w-0 flex-1 truncate text-gray-500">Vários destinos…</span>;
                                      if (!dest) return <span className="min-w-0 flex-1 truncate text-gray-400">Escolher tipo…</span>;
                                      if (dest.kind === 'none') return (<><Minus size={14} className="shrink-0 text-gray-400" /><span className="min-w-0 flex-1 truncate text-gray-500">Não importar</span></>);
                                      const isPerim = dest.kind === 'perimetro';
                                      const tc = isPerim ? NIVEIS[dest.nivel].cor : (tipoEntry?.cor || destCat?.cor || '#16a34a');
                                      const catLabel = isPerim ? 'PERÍMETRO' : (destCat?.nome ?? '');
                                      const catColor = isPerim ? NIVEIS[dest.nivel].cor : (destCat?.cor ?? '#9ca3af');
                                      const typeName = isPerim ? NIVEIS[dest.nivel].label : dest.tipo;
                                      return (
                                        <>
                                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${tc}1a`, color: tc }}>
                                            {isPerim ? <Square size={14} /> : <TipoIcon name={tipoEntry?.icone} size={14} fallback={<span className="h-2 w-2 rounded-full" style={{ background: tc }} />} />}
                                          </span>
                                          <span className="min-w-0 flex-1">
                                            {catLabel && <span className="block truncate text-[9px] font-bold uppercase tracking-wider" style={{ color: catColor }}>{catLabel}</span>}
                                            <span className="flex items-center gap-1.5">
                                              <span className="min-w-0 truncate text-[12.5px] font-semibold text-gray-800">{typeName}</span>
                                              {suggested && (
                                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                                                  <Sparkles size={9} /> sugerido
                                                </span>
                                              )}
                                            </span>
                                          </span>
                                        </>
                                      );
                                    })()}
                                    <ChevronDown size={14} className="ml-auto shrink-0 text-gray-400" />
                                  </button>
                                  {dest?.kind === 'tipo' && detalhes.length > 0 && (
                                    <select
                                      value={curDetalhe}
                                      onChange={(e) => applySubtipo(g, e.target.value || null)}
                                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11.5px] text-gray-700 outline-none focus:border-emerald-400"
                                    >
                                      <option value="">— subtipo (opcional) —</option>
                                      {curDetalhe && !detalhes.some((d) => d.nome === curDetalhe) && <option value={curDetalhe}>{curDetalhe} (atual)</option>}
                                      {detalhes.map((d) => <option key={d.id} value={d.nome}>{d.nome}</option>)}
                                    </select>
                                  )}
                                </div>
                                {/* SITUAÇÃO */}
                                <div className="w-[82px] shrink-0 text-right">
                                  {(() => {
                                    if (dirty) return <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"><Sparkles size={10} /> alterado</span>;
                                    if (saved) return <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700"><Check size={10} /> salvo</span>;
                                    if (mixed) return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">misto</span>;
                                    if (!dest) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">pendente</span>;
                                    if (dest.kind === 'none') return <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">ignorado</span>;
                                    if (suggested) return <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"><Sparkles size={10} /> sugerido</span>;
                                    return <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><Check size={10} /> vinculado</span>;
                                  })()}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Rodapé fixo: progresso por feição + lembrar vínculos */}
                    <div className="shrink-0 border-t border-gray-100 px-4 py-2.5">
                      {(() => {
                        const { total, salvas, vinculadas, ignoradas, pendentes } = deparaProgress;
                        const pct = total ? Math.round(((salvas + vinculadas + ignoradas) / total) * 100) : 0;
                        return (
                          <>
                            <div className="mb-1 flex items-center justify-between text-[11.5px]">
                              <span className="font-semibold text-gray-700">
                                <span className="text-sky-700">{salvas} salvas</span>
                                <span className="font-normal text-gray-400"> de {total} · </span>
                                {vinculadas > 0 && <span className="text-emerald-700">{vinculadas} a salvar · </span>}
                                {ignoradas > 0 && <span className="font-normal text-gray-400">{ignoradas} ignoradas · </span>}
                                {pendentes > 0
                                  ? <span className="font-semibold text-amber-600">{pendentes} pendentes</span>
                                  : <span className="font-semibold text-emerald-600">nada pendente ✓</span>}
                              </span>
                              <span className="tabular-nums text-[11px] text-gray-400">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                              <div className={`h-full rounded-full transition-all ${pendentes > 0 ? 'bg-emerald-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </>
                        );
                      })()}
                      {deparaProgress.pendentes > 0 && (
                        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
                          {deparaProgress.pendentes} feição(ões) ainda pendente(s). Você pode salvar as já resolvidas agora e classificar o restante depois.
                        </div>
                      )}
                    </div>

                    {/* Picker de destino (posição fixa — escapa do overflow da tabela) */}
                    {openPicker && (() => {
                      const g = groups.find((x) => x.key === openPicker.key);
                      if (!g) return null;
                      return (
                        <DestinoPicker
                          anchor={openPicker.rect}
                          catalog={catalog}
                          tiposByCat={tiposByCat}
                          allowPerimetro={g.items.every((it) => it.geomKind === 'area')}
                          perimetroNiveis={perimetroNiveis}
                          current={destOfGroup(g).dest}
                          onClose={() => setOpenPicker(null)}
                          onPick={(d) => applyDestino(g, d)}
                        />
                      );
                    })()}
                    {/* Picker EM LOTE ("Identificar vários"): destino único p/ todos os marcados. */}
                    {bulkPicker && (() => {
                      const sel = groups.filter((g) => checkedGroups.has(g.key) && !g.items.some((it) => it.saved));
                      if (!sel.length) return null;
                      // Só oferece "Perímetro" quando TODAS as feições marcadas são polígonos.
                      const allArea = sel.every((g) => g.items.every((it) => it.geomKind === 'area'));
                      return (
                        <DestinoPicker
                          anchor={bulkPicker}
                          catalog={catalog}
                          tiposByCat={tiposByCat}
                          allowPerimetro={allArea}
                          perimetroNiveis={perimetroNiveis}
                          current={null}
                          onClose={() => setBulkPicker(null)}
                          onPick={(d) => applyDestinoBulk(d)}
                        />
                      );
                    })()}
                  </>
                )}
              </div>
            </>
          ) : activeCat === 'perimetroLista' ? (
            /* Painel "Perímetro" — lista os 4 níveis da hierarquia geográfica. */
            <div className="flex min-h-0 flex-col gap-3 overflow-auto border-r border-gray-100 px-5 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold text-gray-800">Perímetro</span>
                <span className="text-[12px] text-gray-500">
                  Hierarquia geográfica da fazenda. Clique num nível para localizá-lo no mapa.
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {activeOrdem.map((nv) => {
                  const info = NIVEIS[nv];
                  const total =
                    items.filter((i) => i.nivel === nv).length +
                    existingAreas.filter((a) => a.nivel === nv).length;
                  const active = levelActive(nv);
                  return (
                    <button
                      key={nv}
                      type="button"
                      onClick={() => {
                        if (drawing || editing) return;
                        fitLevel(nv);
                        setDrawNivel(nv);
                      }}
                      className={`flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 text-left transition-all hover:bg-gray-50/60 ${
                        drawNivel === nv ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200'
                      } ${nv !== 'fazenda' && !active ? 'opacity-60' : ''}`}
                    >
                      <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: info.cor }} />
                      <span className="min-w-0 flex-1 text-[13px] font-semibold text-gray-800">{info.label}</span>
                      {nv !== 'fazenda' && !active && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
                          Inativo
                        </span>
                      )}
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">
                        {total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Painel esquerdo para categorias comuns */
            <div className="flex min-h-0 flex-col gap-3 overflow-auto border-r border-gray-100 px-5 py-4">
              {/* ── Painel de categoria: 3º nível (detalhamento) do tipo selecionado ── */}
              {(() => {
                const cat = catalog?.categorias.find((c) => c.id === activeCat);
                if (!cat) return <div className="text-[12.5px] text-gray-500">Categoria não encontrada.</div>;
                const catCor = cat.cor ?? '#6b7280';
                const tipos = tiposByCat.get(activeCat) ?? [];
                const tipo = tipos.find((t) => t.id === expandedTipo) ?? null;

                if (tipos.length === 0)
                  return (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-center text-[12px] text-gray-500">
                      Nenhum tipo nesta categoria. Cadastre tipos em <b>Tipos de Locais</b>.
                    </div>
                  );

                if (!tipo)
                  return (
                    <div
                      className="rounded-lg border px-3 py-3 text-[12px] text-gray-700"
                      style={{ borderColor: `${catCor}40`, background: `${catCor}0f` }}
                    >
                      Escolha um <b>tipo</b> de {cat.nome} na barra acima para desenhar áreas, inserir pontos
                      e ver o <b>detalhamento</b> (3º nível) aqui.
                    </div>
                  );

                const cor = tipo.cor || catCor;
                const feats = items.filter((i) => i.categoriaId === activeCat && i.tipo === tipo.nome);
                const detalhes = detalhesByTipo.get(tipo.id) ?? [];
                return (
                  <div className="flex flex-col gap-3">
                    {/* Cabeçalho do tipo selecionado */}
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: `${cor}1a`, color: cor }}
                      >
                        <TipoIcon name={tipo.icone} size={16} fallback={<span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-bold text-gray-900">{tipo.nome}</div>
                        <div className="text-[11.5px] text-gray-500">
                          {cat.nome} · {feats.length} no mapa
                        </div>
                      </div>
                    </div>

                    {/* Ações do tipo: desenhar área / linha / ponto. A ferramenta PADRÃO
                        (inferida pelo nome do tipo — ex.: "Rede hidráulica" ⇒ linha) vem
                        primeiro e em destaque; as outras seguem disponíveis. Para classificar
                        polígonos do mapa importado, clique direto no polígono (abre a caixa). */}
                    {(() => {
                      const def = defaultGeomForTipo(tipo.nome);
                      const pmAtivo = !!pointMode && pointMode.tipo === tipo.nome && pointMode.categoriaId === activeCat;
                      const btns: Record<'area' | 'line' | 'point', React.ReactNode> = {
                        area: (
                          <button
                            key="area"
                            type="button"
                            title="Desenhar a ÁREA deste tipo no mapa (polígono à mão)"
                            disabled={editing}
                            onClick={() => beginDraw('local', tipo.nome, activeCat, 'area')}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              def === 'area'
                                ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            <Square size={13} /> Desenhar área
                          </button>
                        ),
                        line: (
                          <button
                            key="line"
                            type="button"
                            title="Desenhar uma LINHA deste tipo no mapa (rede hidráulica, cerca, estrada…)"
                            disabled={editing}
                            onClick={() => beginDraw('local', tipo.nome, activeCat, 'line')}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              def === 'line'
                                ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50'
                            }`}
                          >
                            <Spline size={13} /> Desenhar linha
                          </button>
                        ),
                        point: (
                          <button
                            key="point"
                            type="button"
                            title="Inserir PONTO deste tipo (clique no mapa) — para aguada, sede, curral etc."
                            onClick={() => togglePointMode(activeCat, tipo.nome)}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold ${
                              pmAtivo
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : def === 'point'
                                  ? 'border-blue-600 bg-white text-blue-700 hover:bg-blue-50'
                                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            <MapPin size={12} /> Ponto
                          </button>
                        ),
                      };
                      const ordem: ('area' | 'line' | 'point')[] = [def, ...(['area', 'line', 'point'] as const).filter((k) => k !== def)];
                      return <div className="flex flex-wrap items-center gap-1.5">{ordem.map((k) => btns[k])}</div>;
                    })()}

                    {/* Detalhamento (3º nível) */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                        Detalhamento (3º nível)
                      </div>
                      {detalhes.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-3 text-[12px] text-gray-500">
                          Sem detalhes para <b>{tipo.nome}</b>. Cadastre o 3º nível em <b>Tipos de Locais</b>.
                        </div>
                      ) : (
                        detalhes.map((d) => {
                          const dcor = d.cor || cor;
                          return (
                            <div
                              key={d.id}
                              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5"
                            >
                              <span
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                                style={{ background: `${dcor}1a`, color: dcor }}
                              >
                                <TipoIcon name={d.icone} size={13} fallback={<span className="h-1.5 w-1.5 rounded-full" style={{ background: dcor }} />} />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-800">{d.nome}</span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Feições já marcadas deste tipo */}
                    {feats.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">No mapa</div>
                        <div className="flex flex-col gap-1">
                          {feats.map((it) => (
                            <div
                              key={it.id}
                              onClick={() => focusItem(it.id)}
                              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 ${
                                it.id === selId ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: cor }}>
                                {it.geomKind === 'point' ? <MapPin size={12} /> : it.geomKind === 'line' ? <Spline size={11} /> : <Square size={11} />}
                              </span>
                              <input
                                type="text"
                                value={it.nome}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => patchItem(it.id, { nome: e.target.value })}
                                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-gray-800 hover:border-gray-200 focus:border-emerald-300 focus:bg-white focus:outline-none"
                              />
                              {it.geomKind === 'area' && (
                                <span className="shrink-0 text-[10.5px] tabular-nums text-gray-500">{fmtArea(it.areaM2)}</span>
                              )}
                              {it.geomKind === 'area' && (
                                <button
                                  type="button"
                                  title="Editar forma"
                                  disabled={editing}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    beginEdit(it.id);
                                  }}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                                >
                                  <Crosshair size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                title="Remover"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeItem(it.id);
                                }}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Painel direito — mapa editável */}
          <div className="relative min-h-[420px] bg-[#0b1f2a]">
            <div ref={mapElRef} className="absolute inset-0" />

            {/* Ferramentas do mapa — o nível é definido pelos botões do painel
                (Marcar no mapa / Desenhar área), então não há seletor de nível aqui. */}
            <div className="absolute left-3 top-3 z-[600] flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
              <button
                type="button"
                onClick={toggleDraw}
                disabled={editing}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${
                  drawing ? 'border-blue-600 bg-blue-600 text-white' : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {drawing ? <X size={15} /> : <Pencil size={15} />}
                {drawing ? 'Cancelar' : 'Desenhar'}
              </button>
              <button
                type="button"
                onClick={toggleEdit}
                disabled={!selId && !savedSelId && !editing}
                title="Editar os vértices da feição selecionada"
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${
                  editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {editing ? <Save size={15} /> : <Crosshair size={15} />}
                {editing ? 'Concluir forma' : 'Editar forma'}
              </button>
              <button
                type="button"
                onClick={removeSelected}
                disabled={!selId && !savedSelId && !editing}
                title="Apagar a feição selecionada"
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={15} />
                Apagar
              </button>
            </div>

            {(drawing || editing) && (
              <div className="absolute left-3 top-16 z-[600] max-w-[320px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-snug text-gray-700 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
                {drawing
                  ? `Clique no mapa para marcar os vértices do(a) ${NIVEIS[drawNivel].label.toLowerCase()}. Clique no primeiro ponto para fechar.`
                  : 'Arraste os vértices · clique no ponto claro para inserir · botão direito remove.'}
              </div>
            )}

            {/* Feição de PRODUÇÃO selecionada: instrui a usar Editar forma / Apagar. */}
            {savedSelId && !drawing && !editing && !pointMode && (
              <div className="absolute left-3 top-16 z-[600] flex max-w-[340px] items-center gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-snug text-blue-800 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
                <Crosshair size={14} className="shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1">
                  Feição de produção selecionada — use <b>Editar forma</b> para mover os pontos ou <b>Apagar</b> para excluir.
                </span>
                <button
                  type="button"
                  onClick={() => setSavedSelId(null)}
                  className="shrink-0 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Modo "inserir ponto" */}
            {pointMode && (
              <div className="absolute left-3 top-16 z-[600] flex max-w-[340px] items-center gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[11.5px] text-blue-800 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
                <MapPin size={14} className="shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1">
                  Clique no mapa para inserir <b>{pointMode.tipo}</b>. Continue clicando para vários.
                </span>
                <button
                  type="button"
                  onClick={() => setPointMode(null)}
                  className="shrink-0 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                >
                  Concluir
                </button>
              </div>
            )}

            {/* Visualizador da fazenda — legenda clicável (níveis + categorias + tipos) */}
            <div className="absolute bottom-3 left-3 z-[600] flex max-h-[68%] w-[206px] flex-col gap-0.5 overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-[0_2px_10px_rgba(16,24,40,.12)]">
              <div className="px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Estrutura</div>
              {activeOrdem.map((nv) => {
                const hidden = hiddenLevels.has(nv);
                // Retiro/Setor: lista cada um, pelo nome salvo, com olho próprio.
                const named = nv === 'retiro' || nv === 'setor' ? legendAreasByLevel[nv] : [];
                return (
                  <React.Fragment key={nv}>
                    <button
                      type="button"
                      onClick={() => toggleLevelVisibility(nv)}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] font-semibold transition-colors hover:bg-gray-50 ${
                        hidden ? 'text-gray-300' : 'text-gray-700'
                      }`}
                      title={hidden ? `Mostrar ${NIVEIS[nv].plural}` : `Ocultar ${NIVEIS[nv].plural}`}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded border border-white shadow-[0_0_0_1px_rgba(0,0,0,.12)]"
                        style={{ background: hidden ? '#d1d5db' : NIVEIS[nv].cor }}
                      />
                      <span className={`flex-1 truncate text-left ${hidden ? 'line-through' : ''}`}>{NIVEIS[nv].label}</span>
                      {hidden ? <EyeOff size={12} /> : <Eye size={12} className="text-gray-300" />}
                    </button>
                    {named.map((a) => {
                      const selfHidden = hiddenAreaIds.has(a.id);
                      const off = hidden || selfHidden; // nível oculto desliga todos os filhos
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAreaVisibility(a.id)}
                          disabled={hidden}
                          className={`flex w-full items-center gap-1.5 rounded-lg py-0.5 pl-5 pr-2 text-[11px] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                            off ? 'text-gray-300' : 'text-gray-600'
                          }`}
                          title={selfHidden ? `Mostrar ${a.nome}` : `Ocultar ${a.nome}`}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,.12)]"
                            style={{ background: off ? '#d1d5db' : a.cor }}
                          />
                          <span className={`flex-1 truncate text-left ${selfHidden ? 'line-through' : ''}`}>{a.nome}</span>
                          {selfHidden ? <EyeOff size={11} /> : <Eye size={11} className="text-gray-300" />}
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {presentLegend.map(([catId, entry]) => {
                const catHidden = hiddenCats.has(catId);
                return (
                  <div key={catId} className="mt-1 border-t border-gray-100 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleCatVisibility(catId)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-colors hover:bg-gray-50 ${
                        catHidden ? 'text-gray-300' : 'text-gray-700'
                      }`}
                      title={catHidden ? `Mostrar ${entry.nome}` : `Ocultar ${entry.nome}`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded" style={{ background: catHidden ? '#d1d5db' : entry.cor }} />
                      <span className={`flex-1 truncate text-left ${catHidden ? 'line-through' : ''}`}>{entry.nome}</span>
                      {catHidden ? <EyeOff size={12} /> : <Eye size={12} className="text-gray-300" />}
                    </button>
                    {[...entry.tipos.entries()].map(([tipoNome, t]) => {
                      const tipoHidden = hiddenTipos.has(tipoNome);
                      const off = tipoHidden || catHidden;
                      return (
                        <button
                          key={tipoNome}
                          type="button"
                          onClick={() => toggleTipoVisibility(tipoNome)}
                          className={`flex w-full items-center gap-1.5 rounded-lg py-0.5 pl-5 pr-2 text-[11px] transition-colors hover:bg-gray-50 ${
                            off ? 'text-gray-300' : 'text-gray-600'
                          }`}
                          title={tipoHidden ? `Mostrar ${tipoNome}` : `Ocultar ${tipoNome}`}
                        >
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" style={{ color: off ? '#d1d5db' : t.cor }}>
                            <TipoIcon name={t.icone} size={12} fallback={<span className="h-1.5 w-1.5 rounded-full" style={{ background: off ? '#d1d5db' : t.cor }} />} />
                          </span>
                          <span className={`flex-1 truncate text-left ${tipoHidden ? 'line-through' : ''}`}>{tipoNome}</span>
                          {tipoHidden ? <EyeOff size={11} /> : <Eye size={11} className="text-gray-300" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-2.5 border-t border-gray-100 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {/* Abas: esta tela (Cadastro de áreas) × colunas das áreas cadastradas.
                Embutida: as abas ficam no topo do container, então aqui escondemos. */}
            {!embedded && onShowColumns && (
              <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
                <span
                  className="rounded-md bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-900 shadow-sm"
                  title="Cadastro de áreas no mapa (tela atual)"
                >
                  Cadastro de áreas
                </span>
                <button
                  type="button"
                  onClick={onShowColumns}
                  className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"
                  title="Ver as colunas das áreas cadastradas (Fazenda › Retiro › Setor › Local)"
                >
                  Colunas
                </button>
                <button
                  type="button"
                  onClick={() => setView('uso')}
                  className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"
                  title="Uso da terra: áreas alocadas por tipo de local, com hectares"
                >
                  Uso da terra
                </button>
              </div>
            )}
            <div className="hidden min-w-0 truncate text-[12px] text-gray-500 sm:block">
              {keptItems.length > 0 ? (
                <span>
                  A cadastrar:{' '}
                  {ORDEM.filter((nv) => keptByLevel[nv] > 0)
                    .map((nv) => `${keptByLevel[nv]} ${keptByLevel[nv] === 1 ? NIVEIS[nv].label.toLowerCase() : NIVEIS[nv].plural.toLowerCase()}`)
                    .join(' · ')}
                </span>
              ) : (
                <span>Marque ao menos uma área (ou guarde só o mapa de referência).</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                {onShowColumns ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setDataRef(todayIso()); setDateDialogOpen(true); }}
              disabled={!canConfirm}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar
            </button>
          </div>
        </div>

        {/* ===== Aba "Uso da terra" — relatório das áreas alocadas ===== *
         * Overlay sobre o card inteiro (que é `relative`); traz sua própria
         * barra de abas para voltar ao mapa / colunas. Lê os Locais já salvos
         * (existingAreas) agrupados por Categoria › Tipo, com hectares. */}
        {view === 'uso' && (
          <div className="absolute inset-0 z-[1100] flex flex-col bg-white">
            {/* Abas — quando NÃO controlada pelo container (a barra externa do
                FarmLocaisTab cuida da navegação no modo embutido) OU em tela cheia
                (que cobre a barra externa do container; sem isto não há como voltar). */}
            {(mestreView === undefined || fullscreen) && (
              <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-6 pb-2 pt-3">
                <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setView('mapa')}
                    className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"
                    title="Voltar ao cadastro de áreas no mapa"
                  >
                    Cadastro de áreas
                  </button>
                  {onShowColumns && (
                    <button
                      type="button"
                      onClick={() => { setView('mapa'); onShowColumns(); }}
                      className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800"
                      title="Ver as colunas das áreas cadastradas"
                    >
                      Colunas
                    </button>
                  )}
                  <span
                    className="rounded-md bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-900 shadow-sm"
                    title="Uso da terra (tela atual)"
                  >
                    Uso da terra
                  </span>
                </div>
                <span className="text-[11.5px] text-gray-400">
                  Áreas já alocadas no mapa, por tipo de local, com seus hectares.
                </span>
              </div>
            )}

            {/* Cabeçalho + total */}
            <div className="flex items-start gap-3 border-b border-gray-100 px-6 pb-3 pt-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Layers size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="m-0 text-[17px] font-bold text-gray-900">Uso da terra</h3>
                <div className="mt-0.5 text-[13px] text-gray-500">
                  Descrição dos <b>tipos de locais</b> cadastrados no mapa com suas respectivas <b>áreas</b> e <b>hectares</b>.
                </div>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div className="text-[20px] font-bold tabular-nums text-gray-900">
                  {usoTerra.totalHa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha
                </div>
                <div className="text-[11.5px] text-gray-500">
                  {usoTerra.count} {usoTerra.count === 1 ? 'área' : 'áreas'}
                </div>
              </div>
            </div>

            {/* Corpo — tabela unificada + gráfico de pizza */}
            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              {usoTerra.totalHa === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
                  <Layers size={28} className="text-gray-300" />
                  <p className="text-[13px]">
                    Nenhuma área alocada ainda. Cadastre Locais (polígonos) no mapa para vê-los aqui.
                  </p>
                </div>
              ) : (
                <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
                  {/* Tabela de feições */}
                  <div className="min-w-0">
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <table className="w-full border-collapse text-[12.5px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                            <th className="px-4 py-3 text-left font-semibold">Tipo / Local</th>
                            <th className="px-3 py-3 text-left font-semibold">Detalhe</th>
                            <th className="px-4 py-3 text-right font-semibold">Área (ha)</th>
                            <th className="px-4 py-3 text-right font-semibold">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allTipos.map((t) => {
                            const tPct = usoTerra.totalHa > 0 ? (t.totalHa / usoTerra.totalHa) * 100 : 0;
                            const isExpanded = expandedTipos.has(t.tipo);
                            return (
                              <React.Fragment key={t.tipo}>
                                <tr
                                  className="border-b border-gray-100 bg-white hover:bg-gray-50 cursor-pointer select-none transition-colors"
                                  onClick={() => toggleTipoExpanded(t.tipo)}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 font-semibold text-gray-700">
                                      <span className="text-gray-400 transition-transform duration-200">
                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                      </span>
                                      <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: t.cor }}>
                                        <TipoIcon name={t.icone} size={14} fallback={<span className="h-2 w-2 rounded-full" style={{ background: t.cor }} />} />
                                      </span>
                                      <span className="truncate">{t.tipo}</span>
                                      <span
                                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                        style={{ background: `${t.cor}1a`, color: t.cor }}
                                      >
                                        {t.categoria}
                                      </span>
                                      <span className="text-[11px] font-normal text-gray-400">
                                        ({t.items.length})
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-gray-400">—</td>
                                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-800">
                                    {t.totalHa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-600">
                                    {tPct.toFixed(1)}%
                                  </td>
                                </tr>
                                {isExpanded &&
                                  t.items.map((it) => {
                                    const iPct = usoTerra.totalHa > 0 ? (it.ha / usoTerra.totalHa) * 100 : 0;
                                    return (
                                      <tr key={it.id} className="border-b border-gray-50 bg-gray-50/20 text-gray-600 hover:bg-gray-50">
                                        <td className="py-2.5 pl-10 pr-4">
                                          <span className="block truncate font-medium text-gray-700">{it.nome}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-gray-400">
                                          <span className="block truncate">{it.detalhe || '—'}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                                          {it.ha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                                          {iPct.toFixed(1)}%
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Coluna do Gráfico de Pizza */}
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h4 className="m-0 text-[14px] font-bold text-gray-900">Distribuição do Uso da Terra</h4>
                      <p className="mt-1 text-[11.5px] text-gray-500">Distribuição proporcional da área ocupada por cada tipo de local.</p>
                      
                      <div className="mt-4 flex flex-col items-center justify-center min-h-[220px]">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number) => {
                                const pct = usoTerra.totalHa > 0 ? (value / usoTerra.totalHa) * 100 : 0;
                                return [
                                  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha (${pct.toFixed(1)}%)`,
                                  'Área'
                                ];
                              }}
                              contentStyle={{
                                fontSize: '12px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 10px rgba(16,24,40,.08)'
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Legenda Customizada */}
                      <div className="mt-4 flex flex-col gap-2 overflow-auto max-h-[200px] border-t border-gray-100 pt-3">
                        {allTipos.map((t) => {
                          const tPct = usoTerra.totalHa > 0 ? (t.totalHa / usoTerra.totalHa) * 100 : 0;
                          return (
                            <div key={t.tipo} className="flex items-center justify-between gap-3 text-[12.5px]">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.cor }} />
                                <span className="truncate font-medium text-gray-700">{t.tipo}</span>
                              </div>
                              <span className="shrink-0 font-semibold tabular-nums text-gray-600 font-mono">
                                {t.totalHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha
                                <span className="ml-1.5 font-normal text-gray-400">{tPct.toFixed(1)}%</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {assignId &&
      (() => {
        const it = items.find((i) => i.id === assignId);
        if (!it) return null;
        const closeClassify = () => {
          // Cancelar num Local recém-criado pelo clique no mapa descarta o rascunho.
          if (pendingClassifyIsNew) removeItem(it.id);
          setAssignId(null);
          setPendingClassifyIsNew(false);
        };
        return (
          <ClassificarLocalModal
            item={it}
            catalog={catalog}
            onClose={closeClassify}
            onSave={(nome, categoriaId, tipo, detalhe) => {
              patchItem(it.id, { nome, categoriaId, tipo, detalhe });
              setAssignId(null);
              setPendingClassifyIsNew(false);
            }}
          />
        );
      })()}

    {/* Resumo da correção automática linha→polígono (skill kmz-line-to-polygon). */}
    {showCorrecao && correcaoReport && (
      <CorrecaoResumoModal
        report={correcaoReport}
        recorrigindo={recorrigindo}
        onClose={() => setShowCorrecao(false)}
        onToggleConvertida={toggleConvertida}
        onToggleIgnoradaNome={toggleIgnoradaNome}
      />
    )}

    {/* Estilo de um RASCUNHO de retiro/setor (ao desenhar ou ao clicar nele). */}
    {styleId &&
      (() => {
        const it = items.find((i) => i.id === styleId);
        if (!it) return null;
        return (
          <EstiloAreaModal
            nivel={it.nivel}
            nome={it.nome}
            areaM2={it.areaM2}
            strokeColor={it.strokeColor}
            fillColor={it.fillColor}
            fillOpacity={it.fillOpacity}
            strokeWeight={it.strokeWeight}
            onClose={() => setStyleId(null)}
            onSave={(nome, strokeColor, fillColor, fillOpacity, strokeWeight) => {
              patchItem(it.id, { nome, strokeColor, fillColor, fillOpacity, strokeWeight });
              setStyleId(null);
            }}
          />
        );
      })()}

    {/* Estilo de um retiro/setor JÁ SALVO (editar/excluir clicando no mapa). */}
    {savedEditId &&
      (() => {
        const a = existingAreas.find((x) => x.id === savedEditId);
        if (!a) return null;
        return (
          <EstiloAreaModal
            nivel={a.nivel}
            nome={a.nome}
            areaM2={areaM2(a.coords)}
            strokeColor={a.strokeColor ?? null}
            fillColor={a.fillColor ?? null}
            fillOpacity={a.fillOpacity ?? null}
            strokeWeight={a.strokeWeight ?? null}
            onClose={() => setSavedEditId(null)}
            onSave={(nome, strokeColor, fillColor, fillOpacity, strokeWeight) => {
              onEditSavedArea?.(a.id, { nome, strokeColor, fillColor, fillOpacity, strokeWeight });
              setSavedEditId(null);
            }}
            onDelete={
              // O perímetro (Fazenda) não é excluído pelo mapa — só estilizado.
              onDeleteSavedArea && a.nivel !== 'fazenda'
                ? () => {
                    if (window.confirm(`Excluir ${NIVEIS[a.nivel].label.toLowerCase()} "${a.nome}"?`)) {
                      onDeleteSavedArea(a.id);
                      setSavedEditId(null);
                    }
                  }
                : undefined
            }
          />
        );
      })()}

    {/* Diálogo "Data de referência" — perguntado ao Salvar; carimba os registros. */}
    {dateDialogOpen && (
      <div
        className="fixed inset-0 z-[2100] flex items-center justify-center bg-[rgba(16,24,40,.42)] p-4 backdrop-blur-[2px]"
        onClick={() => setDateDialogOpen(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Save size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-[16px] font-bold text-gray-900">Data de referência</h3>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Data que será carimbada nos registros cadastrados agora.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-[12px] font-semibold text-gray-600">Data</label>
            <DateInputBR value={dataRef} onChange={(v) => setDataRef(v || todayIso())} className="w-44" />
          </div>
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setDateDialogOpen(false)}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!dataRef || busy}
              onClick={() => { setDateDialogOpen(false); submit(dataRef); }}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default CadastroAreasMestre;
