/**
 * Cliente HTTP para Movimentação › Compras (Compra Peso Vivo · versão lote).
 * Endpoints em /api/compras cobrem o cabeçalho da compra e seus itens por categoria.
 */
const API_BASE = '/api/compras';

export interface CompraItemRow {
  id: string;
  movimentoId: string;
  categoriaId: string | null;
  qtd: number;
  idadeMeses: number | null;
  pesoVivoKg: string | null;
  valorArroba: string | null; // Valor por kg
  pesoMortoTotal: string | null; // Peso vivo total
  desconto: string | null;
  createdAt: string;
}

export interface CompraFichaRow {
  id: string;
  movimentoId: string;
  categoriaId: string | null;
  apelido: string | null;
  rfid: string | null;
  pesoVivoKg: string | null;
  pesoMortoKg: string | null;
  valorArroba: string | null; // Valor por kg
  createdAt: string;
}

export interface CompraMovimentoRow {
  id: string;
  organizationId: string;
  farmId: string | null;
  localId: string | null;
  proprietarioId: string | null;
  clienteId: string | null;
  data: string; // 'AAAA-MM-DD'
  safra: string | null;
  retiro: string | null;
  tipoVenda: string;
  tipoPeso: string;
  valorArroba: string | null; // valor/kg médio
  pesoMortoTotal: string | null; // peso vivo total
  qtd: number;
  valorTotal: string | null;
  pesoMortoArroba: string | null;
  rendimento: string | null;
  status: string;
  obs: string | null;
  desconto: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  itens: CompraItemRow[];
  fichas: CompraFichaRow[];
}

export interface CreateCompraInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  clienteId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  tipoVenda: string;
  tipoPeso: string;
  obs?: string | null;
  desconto?: number | null;
  itens: Array<{
    categoriaId?: string | null;
    qtd: number;
    idadeMeses?: number | null;
    pesoVivoKg?: number | null;
    valorArroba?: number | null;
    pesoMortoTotal?: number | null;
    desconto?: number | null;
  }>;
  fichas?: Array<{
    categoriaId?: string | null;
    idManejo?: string | null;
    idEletronico?: string | null;
    pesoVivoKg?: number | null;
    pesoMortoKg?: number | null;
    valorArroba?: number | null;
  }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listMovimentos(organizationId: string, signal?: AbortSignal): Promise<CompraMovimentoRow[]> {
  return fetchJson<CompraMovimentoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createMovimento(data: CreateCompraInput): Promise<CompraMovimentoRow> {
  return fetchJson<CompraMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateMovimento(
  id: string,
  data: Omit<CreateCompraInput, 'organizationId'>,
): Promise<CompraMovimentoRow> {
  return fetchJson<CompraMovimentoRow>(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMovimento(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
