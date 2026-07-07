/**
 * Cliente HTTP do Planejamento Nutricional por lote (/api/planejamento-nutricional).
 * 1 plano por lote (upsert). Colunas numeric voltam do Postgres como string.
 */
const API_BASE = '/api/planejamento-nutricional';

/** Uma fase do plano (armazenada em `fases` jsonb). Os pesos por fase são derivados. */
export interface FaseNutricional {
  id: string;                     // uuid gerado no front
  dataInicio: string;             // 'AAAA-MM-DD'
  dataFinal: string;              // 'AAAA-MM-DD'
  regimeAlimentarId: string | null;
  regimeNome: string | null;      // snapshot p/ resiliência (regime pode ser renomeado/excluído)
  ganhoPrevisto: number;          // kg/dia
}

/** Linha persistida. Metas numéricas chegam como string (numeric) ou null. */
export interface PlanejamentoNutricionalRow {
  id: string;
  organizationId: string;
  loteId: string;
  pesoInicial: string | null;
  pesoVivoAbate: string | null;
  rendimentoCarcaca: string | null;
  metaValorVenda: string | null;
  fases: FaseNutricional[];
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavePlanejamentoInput {
  organizationId: string;
  loteId: string;
  pesoInicial: number | null;
  pesoVivoAbate: number | null;
  rendimentoCarcaca: number | null;
  metaValorVenda: number | null;
  fases: FaseNutricional[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  // Envelope { ok, data } — retorna data (que pode ser null quando não há plano).
  return (json && typeof json === 'object' && 'data' in json) ? json.data : json;
}

/** Retorna o plano do lote, ou null se ainda não existe. */
export async function getPlanejamentoByLote(loteId: string, signal?: AbortSignal): Promise<PlanejamentoNutricionalRow | null> {
  return fetchJson<PlanejamentoNutricionalRow | null>(`${API_BASE}?loteId=${encodeURIComponent(loteId)}`, { signal });
}

/** Cria/atualiza o plano do lote (upsert). */
export async function savePlanejamento(data: SavePlanejamentoInput): Promise<PlanejamentoNutricionalRow> {
  return fetchJson<PlanejamentoNutricionalRow>(API_BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
