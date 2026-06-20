/**
 * Cliente HTTP da linha do tempo das áreas (/api/area-versoes).
 * Só leitura: reconstrói o mapa da fazenda numa data (slider) e lista o histórico
 * de versões de uma área.
 */
const API_BASE = '/api/area-versoes';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export type NivelVersao = 'retiro' | 'setor' | 'local';

/** Uma versão vigente numa data, já com nome/parent vindos da identidade. */
export interface AreaVersaoDTO {
  areaId: string;
  nivel: NivelVersao;
  validFrom: string;
  validTo: string | null;
  geometry: unknown;
  geometrySource: string | null;
  uso: string | null;
  areaHa: string | null;
  name: string | null;
  parentId: string | null;
  tipo: string | null;
}

export interface ReconstructDTO {
  farmId: string;
  date: string;
  farmName: string | null;
  perimeter: { geometry: unknown; source: string | null } | null;
  retiros: AreaVersaoDTO[];
  setores: AreaVersaoDTO[];
  locais: AreaVersaoDTO[];
}

/** Reconstrói o estado do mapa da fazenda numa data ('AAAA-MM-DD'). */
export async function reconstruct(farmId: string, date: string, signal?: AbortSignal): Promise<ReconstructDTO> {
  return fetchJson<ReconstructDTO>(
    `${API_BASE}?farmId=${encodeURIComponent(farmId)}&date=${encodeURIComponent(date)}`,
    { signal },
  );
}

/** Estado atual (hoje). */
export async function reconstructCurrent(farmId: string, signal?: AbortSignal): Promise<ReconstructDTO> {
  return fetchJson<ReconstructDTO>(`${API_BASE}?farmId=${encodeURIComponent(farmId)}`, { signal });
}

/** Histórico de versões de uma área (identidade). */
export async function listVersoesByArea(areaId: string, signal?: AbortSignal): Promise<AreaVersaoDTO[]> {
  return fetchJson<AreaVersaoDTO[]>(`${API_BASE}?areaId=${encodeURIComponent(areaId)}`, { signal });
}
