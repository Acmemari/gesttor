/* ===== Cadastro de Áreas — modelo de dados =====
 * Hierarquia geográfica da propriedade em 4 níveis encaixados:
 * Fazenda › Retiros › Setores › Locais. Cada área é um polígono no mapa.
 * É a base de localização de todo o sistema (lotes/animais "moram" num Local).
 */

export type Nivel = 'fazenda' | 'retiro' | 'setor' | 'local';
export type Fonte = 'desenho' | 'kml';
export type TipoLocal =
  | 'Pasto'
  | 'Curral'
  | 'Confinamento'
  | 'Aguada'
  | 'Sede'
  | 'Reserva'
  | 'Outro';

/** Uso da terra (eixo distinto de TipoLocal). Versionado em area_versoes. */
export type Uso = 'Pastagem' | 'Agricultura' | 'Reserva' | 'Silvicultura' | 'Outro';

export interface Area {
  id: string;
  nivel: Nivel;
  nome: string;
  /** id da área de nível superior (vínculo hierárquico). */
  parent: string | null;
  /** só para nivel === 'local'. Texto livre: enum legado (TipoLocal) OU nome de
   *  tipo do catálogo "Tipos de Locais" (ex.: "Pastagem cultivada"). */
  tipo: string | null;
  /** só para nivel === 'local'. 3º nível do catálogo (detalhe, ex.: "Capim-Marandu").
   *  Texto livre casado por nome — espelha o contrato free-text de `tipo`. */
  detalhe?: string | null;
  /** uso da terra (só nivel === 'local'); muda pela Conversão de Uso. */
  uso?: Uso | null;
  /** tipo de geometria do local: 'area' | 'point' | 'line'. undefined = inferir por nº de coords. */
  geomKind?: 'area' | 'point' | 'line';
  /** anel do polígono em [lat, lng] (sem ponto de fechamento duplicado). */
  coords: [number, number][];
  /** 'desenho' (mão) ou 'kml' (importado). */
  fonte: Fonte;
  /** data inicial do cadastro (ISO 'YYYY-MM-DD') ou null. Única por tela. */
  dataInicial?: string | null;
  /** registro padrão (âncora oculta) gerado ao desativar um nível. */
  isDefault?: boolean;
  /** mostra/oculta no mapa. */
  visivel: boolean;
  /** cor da linha (perímetro) escolhida ao desenhar. null ⇒ usa NIVEIS[nivel].cor. Só retiro/setor. */
  strokeColor?: string | null;
  /** cor de preenchimento. null ⇒ usa NIVEIS[nivel].cor. Só retiro/setor. */
  fillColor?: string | null;
  /** opacidade do preenchimento 0–1 (transparência = 1 − este valor). null ⇒ usa NIVEIS[nivel].fill. Só retiro/setor. */
  fillOpacity?: number | null;
  /** espessura da linha (perímetro) em px. null ⇒ padrão do nível. Só retiro/setor. */
  strokeWeight?: number | null;
}

export interface NivelInfo {
  idx: number;
  label: string;
  plural: string;
  cor: string;
  /** opacidade de preenchimento do polígono. */
  fill: number;
}

export const NIVEIS: Record<Nivel, NivelInfo> = {
  fazenda: { idx: 0, label: 'Fazenda', plural: 'Fazenda', cor: '#16a34a', fill: 0.1 },
  retiro: { idx: 1, label: 'Retiro', plural: 'Retiros', cor: '#2563eb', fill: 0.1 },
  setor: { idx: 2, label: 'Setor', plural: 'Setores', cor: '#d97706', fill: 0.12 },
  local: { idx: 3, label: 'Local', plural: 'Locais', cor: '#0d9488', fill: 0.16 },
};

export const ORDEM: Nivel[] = ['fazenda', 'retiro', 'setor', 'local'];

export const TIPOS_LOCAL: TipoLocal[] = [
  'Pasto',
  'Curral',
  'Confinamento',
  'Aguada',
  'Sede',
  'Reserva',
  'Outro',
];

export const USOS: Uso[] = ['Pastagem', 'Agricultura', 'Reserva', 'Silvicultura', 'Outro'];

/** Cor por uso da terra (para colorir o mapa por uso). */
export const USO_COR: Record<Uso, string> = {
  Pastagem: '#16a34a',
  Agricultura: '#ca8a04',
  Reserva: '#0e7490',
  Silvicultura: '#15803d',
  Outro: '#6b7280',
};

/* ===== Movimentação de Áreas — ledger (/api/area-movimentos) ===== */

export type AreaMovimentoTipo =
  | 'abertura' | 'renomear' | 'remodelar' | 'mover'
  | 'aposentar' | 'reativar' | 'dividir' | 'criado_divisao'
  | 'unir' | 'unido' | 'nivel' | 'correcao';

/** Foto de uma área num evento (para diff/reconstrução). */
export interface AreaSnapshotDTO {
  name?: string;
  area?: string | null;
  geometry?: unknown;
  geometrySource?: string | null;
  tipo?: string | null;
  retiroId?: string | null;
  setorId?: string | null;
}

/** Linha persistida de um movimento de área. */
export interface AreaMovimentoRow {
  id: string;
  organizationId: string;
  farmId: string;
  nivel: Nivel;
  tipo: AreaMovimentoTipo;
  classe: 'movimento' | 'correcao';
  data: string;                 // 'AAAA-MM-DD' (data efetiva)
  areaId: string | null;
  antes: AreaSnapshotDTO | null;
  depois: AreaSnapshotDTO | null;
  dados: Record<string, any>;
  nota: string | null;
  criadoPor: string | null;
  createdAt: string;
}
