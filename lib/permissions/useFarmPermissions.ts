import { useMemo, useEffect, useState } from 'react';
import { fetchFarmPermissions, fetchFarmPermissionsBatch } from '../api/permissionsClient';
import type { PermissionLevel } from './permissionKeys';
import { DEFAULT_PERMISSIONS } from './permissionKeys';
import { logger } from '../logger';

const log = logger.withContext({ component: 'useFarmPermissions' });

/** Acesso total (admin). Referencia estavel, sem query. */
export const FULL_ACCESS: FarmPermissionsResult = {
  permissions: Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(k => [k, 'edit' as PermissionLevel])) as Record<
    string,
    PermissionLevel
  >,
  canView: () => true,
  canEdit: () => true,
  isHidden: () => false,
  isLoading: false,
  isResponsible: true,
  hasAccess: true,
};

/** Sem acesso (analista sem vínculo com a organização da fazenda). Referencia estavel. */
export const NO_ACCESS: FarmPermissionsResult = {
  permissions: { ...DEFAULT_PERMISSIONS },
  canView: () => false,
  canEdit: () => false,
  isHidden: () => true,
  isLoading: false,
  isResponsible: false,
  hasAccess: false,
};

/** Somente leitura (ex.: cliente): pode ver card e formulário, sem editar/excluir. */
export const VIEW_ONLY: FarmPermissionsResult = {
  permissions: Object.fromEntries(
    Object.keys(DEFAULT_PERMISSIONS).map(k => [k, 'view' as PermissionLevel]),
  ) as Record<string, PermissionLevel>,
  canView: () => true,
  canEdit: () => false,
  isHidden: () => false,
  isLoading: false,
  isResponsible: false,
  hasAccess: true,
};

/** Cliente: pode cadastrar, editar e excluir fazendas da própria organização; não gerencia permissões. */
export const CLIENTE_ACCESS: FarmPermissionsResult = {
  permissions: Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(k => [k, 'edit' as PermissionLevel])) as Record<
    string,
    PermissionLevel
  >,
  canView: () => true,
  canEdit: () => true,
  isHidden: () => false,
  isLoading: false,
  isResponsible: false,
  hasAccess: true,
};

/** Estado de carregamento. Referencia estavel. */
export const LOADING_RESULT: FarmPermissionsResult = {
  permissions: { ...DEFAULT_PERMISSIONS },
  canView: () => false,
  canEdit: () => false,
  isHidden: () => true,
  isLoading: true,
  isResponsible: false,
  hasAccess: false,
};

function buildPermissionsResult(
  analystFarm: { permissions: Record<string, string>; is_responsible: boolean } | null,
  isLoading: boolean,
): FarmPermissionsResult {
  if (analystFarm?.is_responsible === true) {
    return { ...FULL_ACCESS, isLoading };
  }
  const merged: Record<string, PermissionLevel> = { ...DEFAULT_PERMISSIONS };
  if (analystFarm?.permissions) {
    for (const [k, v] of Object.entries(analystFarm.permissions)) {
      if (v === 'hidden' || v === 'view' || v === 'edit') {
        merged[k] = v as PermissionLevel;
      }
    }
  }
  const canView = (key: string): boolean => merged[key] === 'view' || merged[key] === 'edit';
  const canEdit = (key: string): boolean => merged[key] === 'edit';
  const isHidden = (key: string): boolean => merged[key] === 'hidden' || merged[key] === undefined;
  return {
    permissions: merged,
    canView,
    canEdit,
    isHidden,
    isLoading,
    isResponsible: analystFarm?.is_responsible ?? false,
    hasAccess: !!analystFarm,
  };
}

export interface FarmPermissionsResult {
  permissions: Record<string, PermissionLevel>;
  canView: (key: string) => boolean;
  canEdit: (key: string) => boolean;
  isHidden: (key: string) => boolean;
  isLoading: boolean;
  isResponsible: boolean;
  hasAccess: boolean;
}

/**
 * Hook para obter permissões do analista em relação a uma fazenda.
 * - Admin (userRole === 'admin'): retorna FULL_ACCESS imediatamente, sem query
 * - Analista principal da organização: retorna FULL_ACCESS (is_responsible=true)
 * - Analista secundário da organização: usa permissions de organization_analysts
 * - Analista sem vínculo com a organização: sem acesso (isHidden true para tudo)
 */
export function useFarmPermissions(
  farmId: string | null | undefined,
  userId: string | null | undefined,
  userRole?: string | null,
): FarmPermissionsResult {
  const [analystFarm, setAnalystFarm] = useState<{
    permissions: Record<string, string>;
    is_responsible: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (userRole === 'admin' || !farmId || !userId) {
      setAnalystFarm(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchFarmPermissions(farmId);
        if (cancelled) return;
        if (data) {
          setAnalystFarm({
            permissions: data.permissions || {},
            is_responsible: data.is_responsible ?? false,
          });
        } else {
          setAnalystFarm(null);
        }
      } catch (err) {
        if (cancelled) return;
        log.error('Error loading farm permissions', err instanceof Error ? err : new Error(String(err)));
        setAnalystFarm(null);
      }
      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [farmId, userId, userRole]);

  return useMemo(
    () => (userRole === 'admin' ? FULL_ACCESS : buildPermissionsResult(analystFarm, isLoading)),
    [analystFarm, isLoading, userRole],
  );
}

/**
 * Hook para obter permissões de múltiplas fazendas em uma única query (evita N+1).
 * Retorna Record<farmId, FarmPermissionsResult>.
 * Admin (userRole === 'admin'): retorna FULL_ACCESS para todas as fazendas, sem query.
 */
export function useBatchFarmPermissions(
  farmIds: string[],
  userId: string | null | undefined,
  userRole?: string | null,
): Record<string, FarmPermissionsResult> {
  const [rows, setRows] = useState<{ farm_id: string; is_responsible: boolean; permissions: Record<string, string> }[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);

  const idsKey = useMemo(
    () => (farmIds.length > 0 ? [...new Set(farmIds)].sort().join(',') : ''),
    [farmIds.length, farmIds.join(',')],
  );
  const stableIds = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

  useEffect(() => {
    if (userRole === 'admin' || !userId || stableIds.length === 0) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchFarmPermissionsBatch(stableIds);
        if (cancelled) return;
        setRows(
          data.map(r => ({
            farm_id: r.farm_id,
            is_responsible: r.is_responsible ?? false,
            permissions: r.permissions ?? {},
          })),
        );
      } catch (err) {
        if (cancelled) return;
        log.error('useBatchFarmPermissions error', err instanceof Error ? err : new Error(String(err)));
        setRows([]);
      }
      setIsLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, userRole, idsKey]);

  return useMemo(() => {
    if (userRole === 'admin') {
      const map: Record<string, FarmPermissionsResult> = {};
      for (const id of stableIds) {
        map[id] = FULL_ACCESS;
      }
      return map;
    }
    const map: Record<string, FarmPermissionsResult> = {};
    for (const id of stableIds) {
      const row = rows.find(r => r.farm_id === id);
      const analystFarm = row ? { permissions: row.permissions, is_responsible: row.is_responsible } : null;
      map[id] = buildPermissionsResult(analystFarm, isLoading);
    }
    return map;
  }, [rows, stableIds, isLoading, userRole]);
}
