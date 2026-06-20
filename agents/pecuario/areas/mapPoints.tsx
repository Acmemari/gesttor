/* ===== Cadastro de Áreas — pontos (marcadores) e resolução pelo catálogo =====
 * Helpers compartilhados pela tela mestra (CadastroAreasMestre) e pelo mapa
 * principal (CadastroAreasView) para:
 *   - detectar uma feição "ponto" (geometria de 1 coordenada) vs "área" (anel ≥3);
 *   - resolver cor/ícone/categoria de um `tipo` (texto livre) casando, por NOME,
 *     com o catálogo "Tipos de Locais" (tipos_local + tipo_local_categorias);
 *   - montar o L.divIcon do marcador com o ícone lucide do tipo (cacheado).
 *
 * Pontos são guardados como geometria `[[lat,lng]]` (comprimento 1) — a geometria
 * é a fonte da verdade (sobrevive ao reload; `source` é só de rascunho).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import { cleanRing } from './util';
import { NIVEIS } from './types';
import { TipoIcon } from '../../tiposLocalIcons';
import type { TipoLocalCategoria, TipoLocalItem } from '../../../lib/api/tiposLocalClient';

/** A geometria representa um ponto? (1 coordenada válida após limpeza.) */
export function isPointCoords(coords: unknown): boolean {
  return cleanRing(coords).length === 1;
}

/** A única coordenada [lat,lng] de um ponto, ou null se não for ponto. */
export function pointLatLng(coords: unknown): [number, number] | null {
  const r = cleanRing(coords);
  return r.length === 1 ? r[0] : null;
}

export interface TipoResolved {
  cor: string;
  icone: string | null;
  categoriaId: string;
  categoriaNome: string;
}

export interface CatalogIndex {
  /** Resolve por nome do tipo (case-insensitive). */
  resolve: (tipoNome: string | null | undefined) => TipoResolved | null;
}

/** Índice nome→(cor/ícone/categoria) a partir do catálogo carregado. */
export function buildCatalogIndex(
  catalog: { categorias: TipoLocalCategoria[]; tipos: TipoLocalItem[] } | null,
): CatalogIndex {
  const byTipoNome = new Map<string, TipoResolved>();
  if (catalog) {
    const catById = new Map(catalog.categorias.map((c) => [c.id, c]));
    for (const t of catalog.tipos) {
      const cat = catById.get(t.categoriaId);
      const cor = t.cor || cat?.cor || NIVEIS.local.cor;
      byTipoNome.set(t.nome.trim().toLowerCase(), {
        cor,
        icone: t.icone || cat?.icone || null,
        categoriaId: t.categoriaId,
        categoriaNome: cat?.nome ?? '',
      });
    }
  }
  return {
    resolve: (nome) => (nome ? byTipoNome.get(nome.trim().toLowerCase()) ?? null : null),
  };
}

// ── Marcador (divIcon com o ícone lucide do tipo) — cacheado por (ícone|cor) ────
const iconCache = new Map<string, L.DivIcon>();

export function pointDivIcon(icone: string | null | undefined, cor: string): L.DivIcon {
  const key = `${icone ?? ''}|${cor}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const inner = renderToStaticMarkup(React.createElement(TipoIcon, { name: icone ?? undefined, size: 15 }));
  const html =
    `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;` +
    `background:${cor};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(16,24,40,.45)">${inner}</span>`;
  const icon = L.divIcon({ html, className: 'fz-tipo-marker', iconSize: [26, 26], iconAnchor: [13, 13] });
  iconCache.set(key, icon);
  return icon;
}
