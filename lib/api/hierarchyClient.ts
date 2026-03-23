/**
 * Cliente HTTP para API de hierarquia (Drizzle backend).
 * Substitui chamadas diretas a supabase.from/rpc no HierarchyContext.
 */
import { getAuthHeaders, clearToken } from '../session';
import type { Client, Farm, User } from '../types';
import { mapFarmsFromDatabase } from '../utils/farmMapper';

const API_BASE = '/api';

interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { offset?: number; limit?: number; hasMore?: boolean };
}

interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiSuccess<T> | ApiError> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
    signal: options?.signal,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') { clearToken(); window.location.replace('/sign-in'); }
    return { ok: false, error: 'Não autorizado' };
  }
  const json = (await res.json()) as ApiSuccess<T> | ApiError;
  if (!res.ok && json && typeof json === 'object' && 'error' in json) {
    return json as ApiError;
  }
  if (!res.ok) {
    return { ok: false, error: (json as { error?: string })?.error || `HTTP ${res.status}` };
  }
  return json as ApiSuccess<T>;
}

function apiUrl(path: string, params?: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
    }
  }
  const qs = search.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

interface AnalystApiRow {
  id: string;
  name: string;
  email: string;
  role: string;
  qualification: string;
}

interface OrganizationApiRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  analystId: string;
  createdAt: string;
  updatedAt: string;
}

function mapAnalyst(r: AnalystApiRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: (r.role as 'admin' | 'client') || 'client',
    qualification: (r.qualification as User['qualification']) || 'visitante',
  };
}

function mapOrganization(r: OrganizationApiRow): Client {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone || '',
    email: r.email,
    analystId: r.analystId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Lista analistas (admin only). */
export async function fetchAnalysts(options: {
  offset?: number;
  limit?: number;
  search?: string;
  signal?: AbortSignal;
}): Promise<{ data: User[]; hasMore: boolean }> {
  const res = await fetchApi<AnalystApiRow[]>(
    apiUrl('/hierarchy', {
      level: 'analysts',
      offset: options.offset ?? 0,
      limit: options.limit ?? 50,
      search: options.search || undefined,
    }),
    { signal: options.signal },
  );
  if (!res.ok) throw new Error(res.error);
  const data = (res.data || []).map(mapAnalyst);
  return { data, hasMore: res.meta?.hasMore ?? false };
}

/** Lista organizações por analista ou organização fixa. */
export async function fetchClients(options: {
  analystId?: string | null;
  organizationId?: string | null;
  offset?: number;
  limit?: number;
  search?: string;
  signal?: AbortSignal;
}): Promise<{ data: Client[]; hasMore: boolean }> {
  const params: Record<string, string | number | undefined | null> = {
    level: 'organizations',
    offset: options.offset ?? 0,
    limit: options.limit ?? 50,
    search: options.search || undefined,
  };
  if (options.analystId) params.analystId = options.analystId;
  if (options.organizationId) params.organizationId = options.organizationId;

  const res = await fetchApi<OrganizationApiRow[]>(apiUrl('/hierarchy', params), { signal: options.signal });
  if (!res.ok) throw new Error(res.error);
  const data = (res.data || []).map(mapOrganization);
  return { data, hasMore: res.meta?.hasMore ?? false };
}

/** Lista fazendas por organização. */
export async function fetchFarms(options: {
  organizationId: string;
  offset?: number;
  limit?: number;
  search?: string;
  includeInactive?: boolean;
  signal?: AbortSignal;
}): Promise<{ data: Farm[]; hasMore: boolean }> {
  const res = await fetchApi<unknown[]>(
    apiUrl('/hierarchy', {
      level: 'farms',
      organizationId: options.organizationId,
      offset: options.offset ?? 0,
      limit: options.limit ?? 50,
      search: options.search || undefined,
      includeInactive: options.includeInactive ? 'true' : undefined,
    }),
    { signal: options.signal },
  );
  if (!res.ok) throw new Error(res.error);
  const data = mapFarmsFromDatabase((res.data || []) as Parameters<typeof mapFarmsFromDatabase>[0]);
  return { data, hasMore: res.meta?.hasMore ?? false };
}

/** Valida hierarquia analyst -> organization -> farm. */
export async function validateHierarchy(p: {
  analystId: string | null;
  organizationId: string | null;
  farmId: string | null;
  signal?: AbortSignal;
}): Promise<{ analyst_valid: boolean; organization_valid: boolean; farm_valid: boolean }> {
  const res = await fetchApi<{ analyst_valid: boolean; organization_valid: boolean; farm_valid: boolean }>(
    `${API_BASE}/hierarchy`,
    {
      method: 'POST',
      body: JSON.stringify({
        analystId: p.analystId,
        organizationId: p.organizationId,
        farmId: p.farmId,
      }),
      signal: p.signal,
    },
  );
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}
