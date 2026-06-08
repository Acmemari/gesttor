/**
 * Cliente HTTP da Ficha Animal (Pecuário › Cadastros › Ficha Animal).
 * Endpoints em /api/fichas-animal. Inclui helpers para converter entre a linha
 * do banco e o Record<string,string> plano que o formulário usa.
 */
const API_BASE = '/api/fichas-animal';

export interface FichaAnimalRow {
  id: string;
  organizationId: string;
  farmId: string | null;
  nascimentoFichaId: string | null;
  // Identificação
  apelido: string;
  nome: string | null;
  categoriaId: string | null;
  sexo: string | null;
  raca: string | null;
  grau: string | null;
  pelagem: string | null;
  chifre: string | null;
  frame: string | null;
  categoriaGenealogica: string | null;
  ceip: string | null;
  porte: string | null;
  lote: string | null;
  rfid: string | null;
  sisbov: string | null;
  rgn: string | null;
  rgd: string | null;
  serie: string | null;
  peso: string | null;
  pesagem: string | null;
  obs: string | null;
  // Entrada
  eventoEntrada: string | null;
  dataEntrada: string | null;
  // Origem
  data: string | null;
  pesoNascer: string | null;
  colostro: string | null;
  parto: string | null;
  fazendaNascimento: string | null;
  // Genealogia
  pai: string | null;
  mae: string | null;
  avoPaterno: string | null;
  avoMaterno: string | null;
  // Situação
  situacao: string;
  extras: Record<string, unknown>;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos do formulário que mapeiam direto para colunas da ficha. */
const FORM_COLUMN_FIELDS = [
  'apelido', 'nome', 'sexo', 'raca', 'grau', 'pelagem', 'chifre', 'frame',
  'categoriaGenealogica', 'ceip', 'porte', 'lote', 'rfid', 'sisbov', 'rgn', 'rgd',
  'serie', 'peso', 'pesagem', 'obs', 'eventoEntrada', 'dataEntrada', 'data',
  'pesoNascer', 'colostro', 'parto', 'fazendaNascimento', 'pai', 'mae',
  'avoPaterno', 'avoMaterno', 'situacao',
] as const;

const FORM_COLUMN_SET = new Set<string>([...FORM_COLUMN_FIELDS, 'categoria']);

/**
 * Converte os valores do formulário (Record<string,string>) no corpo aceito pela
 * API. O campo 'categoria' do formulário vira 'categoriaId'; chaves desconhecidas
 * (campos das abas futuras) vão para `extras`. Ignora metadados (prefixo '__').
 */
export function formToFichaBody(values: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k.startsWith('__')) continue;
    if (k === 'categoria') {
      body.categoriaId = v || null;
    } else if (FORM_COLUMN_SET.has(k)) {
      body[k] = v;
    } else {
      extras[k] = v;
    }
  }
  body.extras = extras;
  return body;
}

/** Converte uma linha do banco no Record<string,string> que o formulário consome. */
export function fichaToFormValues(row: FichaAnimalRow): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of FORM_COLUMN_FIELDS) {
    const val = (row as any)[f];
    if (val != null) v[f] = String(val);
  }
  if (row.categoriaId) v.categoria = row.categoriaId;
  // Campos das abas futuras guardados em extras.
  if (row.extras && typeof row.extras === 'object') {
    for (const [k, val] of Object.entries(row.extras)) {
      if (val != null && v[k] === undefined) v[k] = String(val);
    }
  }
  // Metadados para a tela saber que é uma ficha persistida (e seu id no banco).
  v.__src = 'db';
  v.__id = row.id;
  // Vínculo com a ficha de nascimento de origem (quando gerada a partir de um
  // nascimento) — usado para não exibir a versão derivada em duplicidade.
  if (row.nascimentoFichaId) v.__nascId = row.nascimentoFichaId;
  return v;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listFichasAnimal(organizationId: string, signal?: AbortSignal): Promise<FichaAnimalRow[]> {
  return fetchJson<FichaAnimalRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createFichaAnimal(
  organizationId: string,
  values: Record<string, string>,
  extra?: { nascimentoFichaId?: string | null },
): Promise<FichaAnimalRow> {
  return fetchJson<FichaAnimalRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId, ...formToFichaBody(values), ...extra }),
  });
}

export async function updateFichaAnimal(
  id: string,
  values: Record<string, string>,
): Promise<FichaAnimalRow> {
  return fetchJson<FichaAnimalRow>(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...formToFichaBody(values) }),
  });
}

export async function deleteFichaAnimal(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
