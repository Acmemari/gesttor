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

export interface Area {
  id: string;
  nivel: Nivel;
  nome: string;
  /** id da área de nível superior (vínculo hierárquico). */
  parent: string | null;
  /** só para nivel === 'local'. */
  tipo: TipoLocal | null;
  /** anel do polígono em [lat, lng] (sem ponto de fechamento duplicado). */
  coords: [number, number][];
  /** 'desenho' (mão) ou 'kml' (importado). */
  fonte: Fonte;
  /** mostra/oculta no mapa. */
  visivel: boolean;
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
