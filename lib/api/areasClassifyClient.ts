/**
 * Client HTTP da classificação de áreas por visão (/api/areas-classify).
 * Recebe polígonos (id + bbox geográfico) e devolve a classe de cada um
 * ("pastagem" | "reserva" | "outro") segundo a imagem de satélite + Claude.
 */
import { getAuthHeaders, clearToken } from '../session';

export type AreaClasse = 'pastagem' | 'reserva' | 'outro';

/** [minLng, minLat, maxLng, maxLat] em WGS84. */
export type Bbox = [number, number, number, number];

export interface AreaPolyIn {
  id: string;
  bbox: Bbox;
}
export interface AreaClassResult {
  id: string;
  classe: AreaClasse;
  confianca: number;
}

/**
 * Classifica os polígonos pela imagem de satélite. Lança em falha de rede/servidor.
 */
export async function classifyAreas(polygons: AreaPolyIn[]): Promise<AreaClassResult[]> {
  if (!polygons.length) return [];
  const headers = await getAuthHeaders();
  const res = await fetch('/api/areas-classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ polygons }),
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    throw new Error('Não autorizado');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return (json.data?.results ?? []) as AreaClassResult[];
}
