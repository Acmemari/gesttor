/**
 * Cliente HTTP para Movimentação › Vendas (Venda Abate · versão lote).
 * Endpoints em /api/vendas cobrem o cabeçalho da venda e seus itens por categoria.
 *
 * Colunas `numeric` chegam como string no JSON (ex.: "1850.00"). Os campos
 * monetários/peso são tipados como `string | null`; o consumidor converte com
 * Number() antes de qualquer cálculo/formatação.
 */
const API_BASE = '/api/vendas';

export interface VendaItemRow {
  id: string;
  movimentoId: string;
  categoriaId: string | null;
  qtd: number;
  idadeMeses: number | null;
  pesoVivoKg: string | null;
  valorArroba: string | null;
  pesoMortoTotal: string | null;
  desconto: string | null;
  createdAt: string;
}

export interface VendaFichaRow {
  id: string;
  movimentoId: string;
  categoriaId: string | null;
  apelido: string | null;
  rfid: string | null;
  pesoVivoKg: string | null;
  pesoMortoKg: string | null;
  valorArroba: string | null;
  extras: Record<string, string>;
  createdAt: string;
}

export interface VendaMovimentoRow {
  id: string;
  organizationId: string;
  farmId: string | null;
  localId: string | null;
  proprietarioId: string | null;
  clienteId: string | null;
  data: string; // 'AAAA-MM-DD'
  safra: string | null;
  retiro: string | null;
  tipoVenda: 'abate' | 'pe';
  tipoPeso: 'arroba' | 'kg';
  valorArroba: string | null;
  pesoMortoTotal: string | null;
  qtd: number;
  valorTotal: string | null;
  pesoMortoArroba: string | null;
  rendimento: string | null;
  status: 'pendente' | 'conciliado';
  obs: string | null;
  desconto: string | null;
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  itens: VendaItemRow[];
  fichas: VendaFichaRow[];
}

export interface CreateVendaInput {
  organizationId: string;
  farmId?: string | null;
  localId?: string | null;
  proprietarioId?: string | null;
  clienteId?: string | null;
  data: string;
  safra?: string | null;
  retiro?: string | null;
  tipoVenda: 'abate' | 'pe';
  tipoPeso: 'arroba' | 'kg';
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
    extras?: Record<string, string>;
  }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

export async function listMovimentos(organizationId: string, signal?: AbortSignal): Promise<VendaMovimentoRow[]> {
  return fetchJson<VendaMovimentoRow[]>(`${API_BASE}?organizationId=${encodeURIComponent(organizationId)}`, { signal });
}

export async function createMovimento(data: CreateVendaInput): Promise<VendaMovimentoRow> {
  return fetchJson<VendaMovimentoRow>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateMovimento(
  id: string,
  data: Omit<CreateVendaInput, 'organizationId'>,
): Promise<VendaMovimentoRow> {
  return fetchJson<VendaMovimentoRow>(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMovimento(id: string): Promise<void> {
  await fetchJson<any>(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
