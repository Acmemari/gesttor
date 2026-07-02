/**
 * Client HTTP for farm maps API (/api/farm-maps).
 */
import { getAuthHeaders, clearToken } from '../session';
import { storageRemoveKeys } from '../storage';

const API_BASE = '/api';

interface FarmMapData {
  id: string;
  farm_id: string;
  uploaded_by: string;
  file_name: string;
  original_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  geojson: unknown;
  /** .kmz já corrigido (linhas fechadas→polígonos), ao lado do original. */
  corrected_storage_path: string | null;
  corrected_file_name: string | null;
  corrected_file_size: number | null;
  /** relatório agregado da correção linha→polígono. */
  correcao_report: unknown;
  created_at: string | null;
  updated_at: string | null;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    return { ok: false, error: 'Não autorizado' };
  }
  // Resposta de erro pode NÃO ser JSON (ex.: 413 Payload Too Large devolve a
  // página HTML padrão do servidor) — ler como texto e tentar parsear, em vez de
  // estourar "Unexpected token '<'" no res.json().
  const raw = await res.text();
  let json: { data?: T; error?: string } | null = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    /* corpo não-JSON (HTML de erro) — json fica null */
  }
  if (!res.ok) {
    const error =
      res.status === 413
        ? 'Arquivo grande demais para o servidor (limite de tamanho excedido).'
        : json?.error || `HTTP ${res.status}`;
    return { ok: false, error };
  }
  return { ok: true, data: json?.data };
}

/**
 * Normaliza a linha que volta da API para o shape snake_case de `FarmMapData`.
 * O Drizzle/`jsonSuccess` devolve as colunas em **camelCase** (`storagePath`,
 * `originalName`…) — sem isto, `m.original_name`/`m.storage_path` saíam
 * `undefined` em runtime (só `id`/`geojson` coincidiam). Lê as duas grafias por
 * segurança caso a API mude.
 */
function normalizeFarmMap(raw: Record<string, unknown>): FarmMapData {
  const pick = (a: string, b: string) => (raw[a] ?? raw[b]) as never;
  return {
    id: raw.id as string,
    farm_id: pick('farm_id', 'farmId') ?? '',
    uploaded_by: pick('uploaded_by', 'uploadedBy') ?? '',
    file_name: pick('file_name', 'fileName') ?? '',
    original_name: pick('original_name', 'originalName') ?? '',
    file_type: pick('file_type', 'fileType') ?? '',
    file_size: pick('file_size', 'fileSize') ?? 0,
    storage_path: pick('storage_path', 'storagePath') ?? '',
    geojson: raw.geojson ?? null,
    corrected_storage_path: pick('corrected_storage_path', 'correctedStoragePath') ?? null,
    corrected_file_name: pick('corrected_file_name', 'correctedFileName') ?? null,
    corrected_file_size: pick('corrected_file_size', 'correctedFileSize') ?? null,
    correcao_report: (raw.correcao_report ?? raw.correcaoReport) ?? null,
    created_at: pick('created_at', 'createdAt') ?? null,
    updated_at: pick('updated_at', 'updatedAt') ?? null,
  };
}

export async function listFarmMaps(farmId: string): Promise<FarmMapData[]> {
  const res = await fetchApi<Record<string, unknown>[]>(
    `${API_BASE}/farm-maps?farmId=${encodeURIComponent(farmId)}`,
  );
  if (!res.ok) throw new Error(res.error);
  return (res.data || []).map(normalizeFarmMap);
}

export async function createFarmMap(data: {
  farmId: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  geojson?: unknown;
  correctedStoragePath?: string | null;
  correctedFileName?: string | null;
  correctedFileSize?: number | null;
  correcaoReport?: unknown;
}): Promise<FarmMapData> {
  const res = await fetchApi<Record<string, unknown>>(`${API_BASE}/farm-maps`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(res.error);
  return normalizeFarmMap(res.data!);
}

/** Atualiza um mapa existente (re-persistência das ações desfazer/converter
 *  mesmo assim do resumo da correção): mesmo registro, novo GeoJSON/.kmz. */
export async function updateFarmMap(
  id: string,
  data: {
    geojson?: unknown;
    correctedStoragePath?: string | null;
    correctedFileName?: string | null;
    correctedFileSize?: number | null;
    correcaoReport?: unknown;
  },
): Promise<FarmMapData> {
  const res = await fetchApi<Record<string, unknown>>(
    `${API_BASE}/farm-maps?id=${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
  if (!res.ok) throw new Error(res.error);
  return normalizeFarmMap(res.data!);
}

export async function deleteFarmMapApi(
  id: string,
): Promise<{ storagePath: string; correctedStoragePath: string | null }> {
  const res = await fetchApi<{ deleted: boolean; storagePath: string; correctedStoragePath?: string | null }>(
    `${API_BASE}/farm-maps?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(res.error);
  return { storagePath: res.data!.storagePath, correctedStoragePath: res.data!.correctedStoragePath ?? null };
}

/**
 * Exclui por completo o mapa (KMZ/KML) vinculado a uma fazenda:
 *   1) remove a linha em `farm_maps` (DELETE /api/farm-maps), que devolve o
 *      `storage_path` do arquivo;
 *   2) apaga o arquivo correspondente no storage (B2) usando esse caminho.
 *
 * Sem o passo 2 o blob ficava órfão no bucket (o `deleteFarmMapApi` sozinho só
 * tira o registro). A falha em apagar o blob NÃO derruba a operação — o mapa já
 * saiu do banco/UI; o órfão só é registrado em console.warn.
 */
export async function deleteFarmMap(id: string): Promise<void> {
  const { storagePath, correctedStoragePath } = await deleteFarmMapApi(id);
  const keys = [storagePath, correctedStoragePath].filter((k): k is string => !!k);
  if (keys.length) {
    try {
      await storageRemoveKeys(keys);
    } catch (e) {
      console.warn('[farmMapsClient] arquivo(s) de storage não removido(s):', keys, e);
    }
  }
}

export type { FarmMapData };
