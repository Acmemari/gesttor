/**
 * Helpers de configuração de campos do kit "Defina seus campos". Derivam os
 * defaults (destino/ordem/valores iniciais) a partir do registro de campos de
 * cada movimento e aplicam as restrições de campos travados.
 */
import { todayISO } from './util';
import type { FieldPlace, FieldPlaces, LrField } from './types';

/** Mapa id → campo. */
export function buildFieldById(registry: LrField[]): Record<string, LrField> {
  return Object.fromEntries(registry.map((f) => [f.id, f]));
}

/** Ordem padrão de exibição (índice do registro). */
export function defaultOrder(registry: LrField[]): string[] {
  return registry.map((f) => f.id);
}

/** Mapa padrão campo → destino. */
export function defaultPlaces(registry: LrField[]): FieldPlaces {
  const p: FieldPlaces = {};
  for (const f of registry) p[f.id] = f.def;
  return p;
}

/**
 * Restringe o destino escolhido conforme o tipo de campo:
 * - locked (ID âncora): só 'bottom' (Tabela) ou 'off' (Desativar).
 * - enableOnly (Sanitário/seção): só 'top' (Superior) ou 'off' (Desativar).
 */
export function constrainPlace(field: LrField | undefined, val: FieldPlace): FieldPlace {
  if (field?.locked) return val === 'off' ? 'off' : 'bottom';
  if (field?.enableOnly) return val === 'top' || val === 'off' ? val : 'top';
  return val;
}

/**
 * Valores iniciais de uma entrada (por field id). 'date' assume hoje quando o
 * campo não tem default; os demais usam `field.default`. Campos de seção
 * (sanitario) são ignorados.
 */
export function buildEntryValues(
  registry: LrField[],
  today: string = todayISO(),
  overrides?: Record<string, string>,
): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of registry) {
    if (f.type === 'sanitario') continue;
    v[f.id] = f.type === 'date' ? (f.default ?? today) : (f.default ?? '');
  }
  if (overrides) Object.assign(v, overrides);
  return v;
}

/** Field id do campo-âncora de ID (locked), se houver. */
export function lockedFieldId(registry: LrField[]): string | undefined {
  return registry.find((f) => f.locked)?.id;
}
