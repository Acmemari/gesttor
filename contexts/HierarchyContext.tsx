import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { Client, Farm, User } from '../types';
import { useAuth } from './AuthContext';
import {
  fetchAnalysts,
  fetchClients,
  fetchFarms,
  validateHierarchy as validateHierarchyApi,
} from '../lib/api/hierarchyClient';
import { sanitizeUUID, sanitizeId, sanitizeFarmIdAsUUID } from '../lib/uuid';

const PAGE_SIZE = 50;
const HIERARCHY_STORAGE_KEY_V1 = 'hierarchySelection.v1';
const DEBUG_HIERARCHY = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
const VALIDATE_RETRIES = 3;
const VALIDATE_RETRY_DELAY_MS = 500;

function getHierarchyStorageKey(userId: string): string {
  return `hierarchySelection.v2.${userId}`;
}

const VISITOR_ANALYST_ID = '0238f4f4-5967-429e-9dce-3f6cc03f5a80';
const VISITOR_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000002';
const VISITOR_FARM_ID = '00000000-0000-0000-0000-000000000003';

/** Organização stub para modo visitante; evita query Supabase que pode travar por RLS. */
const VISITOR_ORGANIZATION: Client = {
  id: VISITOR_ORGANIZATION_ID,
  name: 'Inttegra (Visitante)',
  phone: '',
  email: '',
  analystId: VISITOR_ANALYST_ID,
  createdAt: '',
  updatedAt: '',
};

interface HierarchyLoadingState {
  analysts: boolean;
  organizations: boolean;
  farms: boolean;
}

interface HierarchyErrorState {
  analysts: string | null;
  organizations: string | null;
  farms: string | null;
}

interface HierarchyHasMoreState {
  analysts: boolean;
  organizations: boolean;
  farms: boolean;
}

interface HierarchyState {
  analystId: string | null;
  organizationId: string | null;
  farmId: string | null;
  selectedAnalyst: User | null;
  selectedOrganization: Client | null;
  selectedFarm: Farm | null;
  analysts: User[];
  organizations: Client[];
  farms: Farm[];
  loading: HierarchyLoadingState;
  errors: HierarchyErrorState;
  hasMore: HierarchyHasMoreState;
}

type HierarchyAction =
  | { type: 'HYDRATE_IDS'; payload: { analystId: string | null; organizationId: string | null; farmId: string | null } }
  | { type: 'SET_ANALYSTS'; payload: { data: User[]; append: boolean; hasMore: boolean } }
  | { type: 'SET_ORGANIZATIONS'; payload: { data: Client[]; append: boolean; hasMore: boolean } }
  | { type: 'SET_FARMS'; payload: { data: Farm[]; append: boolean; hasMore: boolean } }
  | { type: 'SET_SELECTED_ANALYST'; payload: User | null }
  | { type: 'SET_SELECTED_ORGANIZATION'; payload: Client | null }
  | { type: 'SET_SELECTED_FARM'; payload: Farm | null }
  | { type: 'SET_LOADING'; payload: { level: keyof HierarchyLoadingState; value: boolean } }
  | { type: 'SET_ERROR'; payload: { level: keyof HierarchyErrorState; value: string | null } }
  | { type: 'SELECT_ANALYST_ID'; payload: string | null }
  | { type: 'SELECT_ORGANIZATION_ID'; payload: string | null }
  | { type: 'SELECT_FARM_ID'; payload: string | null };

interface HierarchyContextType extends HierarchyState {
  effectiveAnalystId: string | null;
  setSelectedAnalyst: (analyst: User | null) => void;
  setSelectedOrganization: (organization: Client | null) => void;
  setSelectedFarm: (farm: Farm | null) => void;
  selectAnalystById: (id: string | null) => void;
  selectOrganizationById: (id: string | null) => void;
  selectFarmById: (id: string | null) => void;
  clearFarm: () => void;
  searchAnalysts: (term: string) => Promise<void>;
  searchOrganizations: (term: string) => Promise<void>;
  searchFarms: (term: string) => Promise<void>;
  loadMoreAnalysts: () => Promise<void>;
  loadMoreOrganizations: () => Promise<void>;
  loadMoreFarms: () => Promise<void>;
  refreshCurrentLevel: (level: 'analysts' | 'organizations' | 'farms') => Promise<void>;
}

const initialState: HierarchyState = {
  analystId: null,
  organizationId: null,
  farmId: null,
  selectedAnalyst: null,
  selectedOrganization: null,
  selectedFarm: null,
  analysts: [],
  organizations: [],
  farms: [],
  loading: {
    analysts: false,
    organizations: false,
    farms: false,
  },
  errors: {
    analysts: null,
    organizations: null,
    farms: null,
  },
  hasMore: {
    analysts: true,
    organizations: true,
    farms: true,
  },
};

const HierarchyContext = createContext<HierarchyContextType | undefined>(undefined);

function parseLegacyId(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') return parsed.id;
  } catch {
    if (value.length > 20) {
      return value;
    }
  }
  return null;
}

function loadInitialPersistedIds(userId: string): { analystId: string | null; organizationId: string | null; farmId: string | null } {
  const fallback = { analystId: null, organizationId: null, farmId: null };
  const scopedKey = getHierarchyStorageKey(userId);

  try {
    const modernRaw = localStorage.getItem(scopedKey);
    if (modernRaw) {
      const modern = JSON.parse(modernRaw);
      return {
        analystId: sanitizeId(typeof modern?.analystId === 'string' ? modern.analystId : null),
        organizationId: sanitizeUUID(typeof modern?.organizationId === 'string' ? modern.organizationId : null),
        farmId: sanitizeFarmIdAsUUID(typeof modern?.farmId === 'string' ? modern.farmId : null),
      };
    }
  } catch {
    // ignore invalid storage
  }

  try {
    const legacyRaw = localStorage.getItem(HIERARCHY_STORAGE_KEY_V1);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const migrated = {
        analystId: sanitizeId(typeof legacy?.analystId === 'string' ? legacy.analystId : null),
        organizationId: sanitizeUUID(typeof legacy?.clientId === 'string' ? legacy.clientId : null),
        farmId: sanitizeFarmIdAsUUID(typeof legacy?.farmId === 'string' ? legacy.farmId : null),
      };
      localStorage.setItem(scopedKey, JSON.stringify(migrated));
      localStorage.removeItem(HIERARCHY_STORAGE_KEY_V1);
      return migrated;
    }
  } catch {
    // ignore invalid legacy storage
  }

  const analystId = sanitizeId(parseLegacyId(localStorage.getItem('selectedAnalystId')));
  const organizationId = sanitizeUUID(parseLegacyId(localStorage.getItem('selectedClientId')));
  const farmId = sanitizeFarmIdAsUUID(
    localStorage.getItem('selectedFarmId') || parseLegacyId(localStorage.getItem('selectedFarm')),
  );
  const normalized = { analystId, organizationId, farmId };
  try {
    localStorage.setItem(scopedKey, JSON.stringify(normalized));
  } catch {
    // ignore storage write errors
  }
  return normalized;
}

function hierarchyReducer(state: HierarchyState, action: HierarchyAction): HierarchyState {
  switch (action.type) {
    case 'HYDRATE_IDS':
      return {
        ...state,
        analystId: action.payload.analystId,
        organizationId: action.payload.organizationId,
        farmId: action.payload.farmId,
        selectedAnalyst: action.payload.analystId !== state.analystId ? null : state.selectedAnalyst,
        selectedOrganization: action.payload.organizationId !== state.organizationId ? null : state.selectedOrganization,
        selectedFarm: action.payload.farmId !== state.farmId ? null : state.selectedFarm,
      };
    case 'SET_ANALYSTS':
      return {
        ...state,
        analysts: action.payload.append ? [...state.analysts, ...action.payload.data] : action.payload.data,
        hasMore: { ...state.hasMore, analysts: action.payload.hasMore },
      };
    case 'SET_ORGANIZATIONS':
      return {
        ...state,
        organizations: action.payload.append ? [...state.organizations, ...action.payload.data] : action.payload.data,
        hasMore: { ...state.hasMore, organizations: action.payload.hasMore },
      };
    case 'SET_FARMS':
      return {
        ...state,
        farms: action.payload.append ? [...state.farms, ...action.payload.data] : action.payload.data,
        hasMore: { ...state.hasMore, farms: action.payload.hasMore },
      };
    case 'SET_SELECTED_ANALYST':
      return {
        ...state,
        selectedAnalyst: action.payload,
      };
    case 'SET_SELECTED_ORGANIZATION':
      return {
        ...state,
        selectedOrganization: action.payload,
      };
    case 'SET_SELECTED_FARM':
      return {
        ...state,
        selectedFarm: action.payload,
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: { ...state.loading, [action.payload.level]: action.payload.value },
      };
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.payload.level]: action.payload.value },
      };
    case 'SELECT_ANALYST_ID':
      return {
        ...state,
        analystId: action.payload,
        selectedAnalyst: state.analysts.find(a => a.id === action.payload) || null,
        organizationId: null,
        farmId: null,
        selectedOrganization: null,
        selectedFarm: null,
        organizations: [],
        farms: [],
      };
    case 'SELECT_ORGANIZATION_ID':
      return {
        ...state,
        organizationId: action.payload,
        selectedOrganization: state.organizations.find(o => o.id === action.payload) || null,
        farmId: null,
        selectedFarm: null,
        farms: [],
      };
    case 'SELECT_FARM_ID':
      return {
        ...state,
        farmId: action.payload,
        selectedFarm: state.farms.find(f => f.id === action.payload) || null,
      };
    default:
      return state;
  }
}

export const HierarchyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isProfileReady, sessionReady } = useAuth();
  const [state, dispatch] = useReducer(hierarchyReducer, initialState);
  const stateRef = useRef(state);
  const paginationRef = useRef({
    analystsOffset: 0,
    organizationsOffset: 0,
    farmsOffset: 0,
    analystsSearch: '',
    organizationsSearch: '',
    farmsSearch: '',
  });
  const abortRef = useRef<{
    analysts: AbortController | null;
    clients: AbortController | null;
    farms: AbortController | null;
  }>({
    analysts: null,
    clients: null,
    farms: null,
  });
  const validationFailureCountRef = useRef(0);
  const prevUserIdRef = useRef<string | null>(null);
  const loadAnalystsRef = useRef<((options?: { append?: boolean; search?: string }) => Promise<void>) | null>(null);
  const loadOrganizationsRef = useRef<((options?: { append?: boolean; search?: string }) => Promise<void>) | null>(null);
  const loadFarmsRef = useRef<((options?: { append?: boolean; search?: string }) => Promise<void>) | null>(null);
  const lastLoadClientsKeyRef = useRef<string>('');
  const lastLoadFarmsKeyRef = useRef<string>('');

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (user?.id !== prevUserIdRef.current) {
      validationFailureCountRef.current = 0;
      prevUserIdRef.current = user?.id ?? null;
      lastLoadClientsKeyRef.current = '';
      lastLoadFarmsKeyRef.current = '';
    }
  }, [user?.id]);

  const effectiveAnalystId = useMemo(() => {
    if (!user) return null;
    if (user.qualification === 'visitante') return VISITOR_ANALYST_ID;
    // Organizações têm contexto fixo pelo organizationId — não usam analista próprio como filtro.
    // Se o perfil ainda não carregou a qualification mas organizationId já existe, tratar como cliente.
    if (user.qualification === 'cliente' || (user.organizationId && !user.qualification)) return null;
    if (user.role === 'admin' || user.role === 'administrador') return state.analystId;
    return user.id;
  }, [user, state.analystId]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    if (user.qualification === 'visitante') {
      dispatch({
        type: 'HYDRATE_IDS',
        payload: {
          analystId: VISITOR_ANALYST_ID,
          organizationId: VISITOR_ORGANIZATION_ID,
          farmId: VISITOR_FARM_ID,
        },
      });
      return;
    }
    // Trata como cliente se: qualification='cliente' OU se organizationId existe
    // (cobre o estado transitório onde qualification ainda não foi carregada do perfil real).
    const isClientProfile = user.qualification === 'cliente' || Boolean(user.organizationId);
    if (isClientProfile) {
      if (!user.organizationId) {
        // Cliente sem organização vinculada ainda: aguarda perfil completo sem fixar IDs de visitante
        dispatch({ type: 'HYDRATE_IDS', payload: { analystId: null, organizationId: null, farmId: null } });
        return;
      }
      // Carrega a organização fixa vinculada ao perfil. Restaura fazenda do localStorage se existir.
      const persisted = loadInitialPersistedIds(user.id);
      // Garante que não use organizationId/analystId de outra sessão (ex: sessão de visitante anterior)
      const safeFarmId =
        persisted.farmId && persisted.farmId !== VISITOR_FARM_ID ? persisted.farmId : null;
      dispatch({
        type: 'HYDRATE_IDS',
        payload: {
          analystId: null,
          organizationId: user.organizationId,
          farmId: safeFarmId,
        },
      });
      return;
    }
    const initial = loadInitialPersistedIds(user.id);
    if (user.role !== 'admin' && user.role !== 'administrador') {
      initial.analystId = user.id;
    }
    dispatch({ type: 'HYDRATE_IDS', payload: initial });
  }, [sessionReady, user?.id, user?.role, user?.qualification, user?.organizationId, isProfileReady]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    if (user.qualification === 'visitante') return; // IDs são determinísticos, não persistir
    const scopedKey = getHierarchyStorageKey(user.id);
    if (user.qualification === 'cliente') {
      // Para clientes, persiste apenas a fazenda (o organizationId vem sempre do perfil); só UUID
      const farmIdToSave = sanitizeFarmIdAsUUID(state.farmId);
      try {
        const stored = localStorage.getItem(scopedKey);
        const parsed = stored ? JSON.parse(stored) : {};
        localStorage.setItem(scopedKey, JSON.stringify({ ...parsed, farmId: farmIdToSave }));
      } catch {
        // Dados corrompidos: sobrescreve com estado limpo
        localStorage.setItem(scopedKey, JSON.stringify({ farmId: farmIdToSave }));
      }
      return;
    }
    const payload = {
      analystId: state.analystId,
      organizationId: state.organizationId,
      farmId: sanitizeFarmIdAsUUID(state.farmId),
    };
    localStorage.setItem(scopedKey, JSON.stringify(payload));
  }, [state.analystId, state.organizationId, state.farmId, user, isProfileReady, sessionReady]);

  const nextController = useCallback((level: keyof HierarchyLoadingState) => {
    abortRef.current[level]?.abort();
    const controller = new AbortController();
    abortRef.current[level] = controller;
    return controller;
  }, []);

  const loadAnalysts = useCallback(
    async (options?: { append?: boolean; search?: string }) => {
      if (!user || (user.role !== 'admin' && user.role !== 'administrador')) return;
      const append = options?.append ?? false;
      const search = options?.search ?? paginationRef.current.analystsSearch;
      paginationRef.current.analystsSearch = search;
      if (!append) paginationRef.current.analystsOffset = 0;

      const offset = paginationRef.current.analystsOffset;
      const controller = nextController('analysts');
      dispatch({ type: 'SET_LOADING', payload: { level: 'analysts', value: true } });
      dispatch({ type: 'SET_ERROR', payload: { level: 'analysts', value: null } });

      try {
        const { data: mapped, hasMore: hasMoreData } = await fetchAnalysts({
          offset,
          limit: PAGE_SIZE,
          search: search || undefined,
          signal: controller.signal,
        });
        dispatch({
          type: 'SET_ANALYSTS',
          payload: {
            data: mapped,
            append,
            hasMore: hasMoreData,
          },
        });
        paginationRef.current.analystsOffset = append ? offset + mapped.length : mapped.length;

        const current = stateRef.current;
        const selectedId = current.analystId;
        if (!selectedId && mapped.length > 0 && !search) {
          dispatch({ type: 'SELECT_ANALYST_ID', payload: mapped[0].id });
        } else if (selectedId && !append) {
          const exists = mapped.some(analyst => analyst.id === selectedId);
          if (!exists) {
            dispatch({ type: 'SELECT_ANALYST_ID', payload: mapped.length > 0 ? mapped[0].id : null });
          } else {
            dispatch({
              type: 'SET_SELECTED_ANALYST',
              payload: mapped.find(analyst => analyst.id === selectedId) || null,
            });
          }
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Falha ao carregar analistas.';
        dispatch({
          type: 'SET_ERROR',
          payload: { level: 'analysts', value: message },
        });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: { level: 'analysts', value: false } });
      }
    },
    [nextController, user],
  );

  const loadOrganizations = useCallback(
    async (options?: { append?: boolean; search?: string }) => {
      // Usuário com qualification='cliente' busca diretamente pelo seu organization_id fixo.
      // Também cobre estado transitório: perfil com organizationId mas qualification ainda indefinida.
      const isClientUser = user?.qualification === 'cliente' || Boolean(user?.organizationId && !user?.qualification);

      if (!user || (!effectiveAnalystId && !isClientUser)) {
        dispatch({ type: 'SET_ORGANIZATIONS', payload: { data: [], append: false, hasMore: false } });
        dispatch({ type: 'SELECT_ORGANIZATION_ID', payload: null });
        return;
      }

      // Visitante: não chamar API — usa stub local para evitar query com ID fictício.
      if (user?.qualification === 'visitante') {
        dispatch({
          type: 'SET_ORGANIZATIONS',
          payload: { data: [VISITOR_ORGANIZATION], append: false, hasMore: false },
        });
        dispatch({ type: 'SELECT_ORGANIZATION_ID', payload: VISITOR_ORGANIZATION_ID });
        dispatch({ type: 'SET_LOADING', payload: { level: 'organizations', value: false } });
        return;
      }

      const append = options?.append ?? false;
      const search = options?.search ?? paginationRef.current.organizationsSearch;
      paginationRef.current.organizationsSearch = search;
      if (!append) paginationRef.current.organizationsOffset = 0;

      const trigger = append || search ? 'user' : 'effect';
      if (DEBUG_HIERARCHY) {
        console.debug('[HierarchyContext] loadOrganizations start', { trigger, effectiveAnalystId, append, search });
      }

      const offset = paginationRef.current.organizationsOffset;
      const controller = nextController('organizations');
      dispatch({ type: 'SET_LOADING', payload: { level: 'organizations', value: true } });
      dispatch({ type: 'SET_ERROR', payload: { level: 'organizations', value: null } });

      if (!isClientUser && !effectiveAnalystId) {
        dispatch({ type: 'SET_ORGANIZATIONS', payload: { data: [], append: false, hasMore: false } });
        return;
      }

      try {
        const { data: mapped, hasMore: hasMoreData } = await fetchClients({
          analystId: isClientUser && user.organizationId ? null : effectiveAnalystId ?? undefined,
          organizationId: isClientUser && user.organizationId ? user.organizationId : null,
          offset,
          limit: PAGE_SIZE,
          search: search || undefined,
          signal: controller.signal,
        });
        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] loadOrganizations end ok', { count: mapped.length });
        }
        dispatch({
          type: 'SET_ORGANIZATIONS',
          payload: {
            data: mapped,
            append,
            hasMore: hasMoreData,
          },
        });
        paginationRef.current.organizationsOffset = append ? offset + mapped.length : mapped.length;

        const current = stateRef.current;
        const selectedId = current.organizationId;
        if (!selectedId && mapped.length > 0 && !search) {
          dispatch({ type: 'SELECT_ORGANIZATION_ID', payload: mapped[0].id });
        } else if (selectedId && !append) {
          const exists = mapped.some(org => org.id === selectedId);
          if (!exists) {
            dispatch({ type: 'SELECT_ORGANIZATION_ID', payload: mapped.length > 0 ? mapped[0].id : null });
          } else {
            dispatch({
              type: 'SET_SELECTED_ORGANIZATION',
              payload: mapped.find(org => org.id === selectedId) || null,
            });
          }
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (DEBUG_HIERARCHY) console.debug('[HierarchyContext] loadOrganizations end aborted');
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar organizações.';
        dispatch({
          type: 'SET_ERROR',
          payload: { level: 'organizations', value: message },
        });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: { level: 'organizations', value: false } });
      }
    },
    [effectiveAnalystId, nextController, user?.id, user?.qualification, user?.organizationId],
  );

  const loadFarms = useCallback(
    async (options?: { append?: boolean; search?: string }) => {
      const selectedOrganizationId = stateRef.current.organizationId;
      if (!selectedOrganizationId) {
        dispatch({ type: 'SET_FARMS', payload: { data: [], append: false, hasMore: false } });
        dispatch({ type: 'SELECT_FARM_ID', payload: null });
        return;
      }

      const append = options?.append ?? false;
      const search = options?.search ?? paginationRef.current.farmsSearch;
      paginationRef.current.farmsSearch = search;
      if (!append) paginationRef.current.farmsOffset = 0;

      const trigger = append || search ? 'user' : 'effect';
      if (DEBUG_HIERARCHY) {
        console.debug('[HierarchyContext] loadFarms start', { trigger, selectedOrganizationId, append, search });
      }

      const offset = paginationRef.current.farmsOffset;
      const controller = nextController('farms');
      dispatch({ type: 'SET_LOADING', payload: { level: 'farms', value: true } });
      dispatch({ type: 'SET_ERROR', payload: { level: 'farms', value: null } });

      try {
        const { data: mapped, hasMore: hasMoreData } = await fetchFarms({
          organizationId: selectedOrganizationId,
          offset,
          limit: PAGE_SIZE,
          search: search || undefined,
          includeInactive: true,
          signal: controller.signal,
        });
        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] loadFarms end ok', { count: mapped.length });
        }
        dispatch({
          type: 'SET_FARMS',
          payload: {
            data: mapped,
            append,
            hasMore: hasMoreData,
          },
        });
        paginationRef.current.farmsOffset = append ? offset + mapped.length : mapped.length;

        const current = stateRef.current;
        const selectedId = current.farmId;
        if (!selectedId && mapped.length > 0 && !search) {
          dispatch({ type: 'SELECT_FARM_ID', payload: mapped[0].id });
        } else if (selectedId && !append) {
          const exists = mapped.some(farm => farm.id === selectedId);
          if (!exists) {
            dispatch({ type: 'SELECT_FARM_ID', payload: mapped.length > 0 ? mapped[0].id : null });
          } else {
            dispatch({
              type: 'SET_SELECTED_FARM',
              payload: mapped.find(farm => farm.id === selectedId) || null,
            });
          }
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (DEBUG_HIERARCHY) console.debug('[HierarchyContext] loadFarms end aborted');
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar fazendas.';
        dispatch({
          type: 'SET_ERROR',
          payload: { level: 'farms', value: message },
        });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: { level: 'farms', value: false } });
      }
    },
    [nextController],
  );

  useEffect(() => {
    loadAnalystsRef.current = loadAnalysts;
  }, [loadAnalysts]);

  useEffect(() => {
    loadOrganizationsRef.current = loadOrganizations;
  }, [loadOrganizations]);

  useEffect(() => {
    loadFarmsRef.current = loadFarms;
  }, [loadFarms]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    if (user.qualification === 'visitante') {
      dispatch({
        type: 'SET_SELECTED_ANALYST',
        payload: {
          id: VISITOR_ANALYST_ID,
          name: 'Inttegra (Visitante)',
          email: 'antonio@inttegra.com',
          role: 'admin',
          qualification: 'analista',
        },
      });
      return; // loadClients dispara via effectiveAnalystId
    }
    // Clientes não têm analista próprio — context de analista não se aplica.
    // Cobre também estado transitório onde clientId existe mas qualification ainda não chegou.
    if (user.qualification === 'cliente' || (user.organizationId && !user.qualification)) {
      dispatch({ type: 'SET_SELECTED_ANALYST', payload: null });
      return;
    }
    if (user.role === 'admin' || user.role === 'administrador') {
      void loadAnalystsRef.current?.({ append: false, search: '' });
      return;
    }
    dispatch({
      type: 'SET_SELECTED_ANALYST',
      payload: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        qualification: user.qualification,
      },
    });
  }, [user?.id, user?.role, user?.qualification, user?.organizationId, user?.name, user?.email, isProfileReady, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    const key = `${effectiveAnalystId ?? ''}-${user.organizationId ?? ''}`;
    if (lastLoadClientsKeyRef.current === key) return;
    lastLoadClientsKeyRef.current = key;
    void loadOrganizationsRef.current?.({ append: false, search: '' });
  }, [sessionReady, effectiveAnalystId, isProfileReady, user?.id, user?.role, user?.qualification, user?.organizationId]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    const key = String(state.organizationId ?? '');
    if (lastLoadFarmsKeyRef.current === key) return;
    lastLoadFarmsKeyRef.current = key;
    void loadFarmsRef.current?.({ append: false, search: '' });
  }, [sessionReady, state.organizationId, isProfileReady, user?.id]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    if (user.qualification === 'visitante') return;

    const abortController = new AbortController();

    const timer = window.setTimeout(() => {
      const runValidation = async () => {
        const current = stateRef.current;
        const sanitizedAnalystId = sanitizeId(effectiveAnalystId);
        const sanitizedOrganizationId = sanitizeUUID(current.organizationId);
        const sanitizedFarmId = sanitizeId(current.farmId);
        if (!sanitizedAnalystId && !sanitizedOrganizationId && !sanitizedFarmId) return;

        // Bootstrap guard: skip validation when only analystId is set; fetchClients will
        // auto-select the first organization and this effect will re-run with organizationId.
        if (sanitizedAnalystId && !sanitizedOrganizationId && !sanitizedFarmId) return;

        const snapshotOrganizationId = current.organizationId;

        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] validate_hierarchy start', {
            analystId: sanitizedAnalystId,
            organizationId: sanitizedOrganizationId,
            farmId: sanitizedFarmId,
          });
        }

        let data: unknown = null;
        let error: { message?: string } | null = null;

        for (let attempt = 0; attempt < VALIDATE_RETRIES; attempt++) {
          if (abortController.signal.aborted) return;

          try {
            const result = await validateHierarchyApi({
              analystId: sanitizedAnalystId,
              organizationId: sanitizedOrganizationId,
              farmId: sanitizedFarmId,
              signal: abortController.signal,
            });
            data = [result];
            error = null;
          } catch (e: unknown) {
            error = { message: e instanceof Error ? e.message : String(e) };
          }

          if (!error) break;

          const msg = error.message || '';
          const isNetwork = /fetch|network|ECONNREFUSED|Failed to fetch|aggregateerror/i.test(msg);
          const isAbort = error?.message?.toLowerCase?.().includes('abort') ?? false;

          if (isAbort || abortController.signal.aborted) return;

          console.warn('[HierarchyContext] validate_hierarchy failed:', {
            attempt: attempt + 1,
            totalRetries: VALIDATE_RETRIES,
            type: isNetwork ? 'network' : 'rpc',
            message: msg,
          });

          if (!isNetwork) {
            // Só reseta IDs em erros explícitos de acesso negado (403/FORBIDDEN),
            // não em erros genéricos de servidor (500) ou falhas transitórias.
            const isForbidden = /acesso negado|forbidden|403/i.test(msg);
            if (isForbidden) {
              validationFailureCountRef.current += 1;
              if (validationFailureCountRef.current >= 3) {
                if (abortController.signal.aborted) return;
                if (stateRef.current.organizationId !== snapshotOrganizationId) return;
                if (DEBUG_HIERARCHY) {
                  console.debug('[HierarchyContext] validate_hierarchy RESET IDs (consecutive FORBIDDEN failures)');
                }
                dispatch({
                  type: 'HYDRATE_IDS',
                  payload: {
                    analystId: stateRef.current.analystId,
                    organizationId: null,
                    farmId: null,
                  },
                });
              }
            }
            return;
          }

          if (attempt < VALIDATE_RETRIES - 1) {
            const delayMs = VALIDATE_RETRY_DELAY_MS * Math.pow(2, attempt);
            if (DEBUG_HIERARCHY) {
              console.debug('[HierarchyContext] validate_hierarchy retry in', delayMs, 'ms');
            }
            await new Promise(r => setTimeout(r, delayMs));
            if (abortController.signal.aborted) return;
          }
        }

        if (abortController.signal.aborted) return;

        if (error) {
          console.warn('[HierarchyContext] validate_hierarchy failed after retries:', error.message);
          return;
        }

        if (!data || !Array.isArray(data) || data.length === 0) {
          if (DEBUG_HIERARCHY) console.debug('[HierarchyContext] validate_hierarchy empty data');
          console.warn('[HierarchyContext] validate_hierarchy returned empty data');
          return;
        }

        if (stateRef.current.organizationId !== snapshotOrganizationId) {
          if (DEBUG_HIERARCHY) {
            console.debug('[HierarchyContext] State changed during validate_hierarchy, discarding stale result');
          }
          return;
        }

        validationFailureCountRef.current = 0;
        const result = data[0] as {
          analyst_valid: boolean;
          organization_valid: boolean;
          farm_valid: boolean;
        };
        const nextAnalystId = result.analyst_valid ? sanitizedAnalystId : null;
        const nextOrganizationId = result.organization_valid ? sanitizedOrganizationId : null;
        const nextFarmId = result.farm_valid ? sanitizedFarmId : null;

        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] validate_hierarchy end ok', {
            analystValid: result.analyst_valid,
            organizationValid: result.organization_valid,
            farmValid: result.farm_valid,
          });
        }

        dispatch({
          type: 'HYDRATE_IDS',
          payload: {
            analystId: nextAnalystId,
            organizationId: nextOrganizationId,
            farmId: nextFarmId,
          },
        });
      };

      void runValidation();
    }, 150);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [
    user?.id,
    user?.role,
    user?.qualification,
    user?.organizationId,
    isProfileReady,
    effectiveAnalystId,
    state.analystId,
    state.organizationId,
    state.farmId,
  ]);

  // Realtime subscription removida: dados vêm via API Drizzle.
  // Use refreshCurrentLevel para atualizar manualmente.

  const setSelectedAnalyst = useCallback((analyst: User | null) => {
    dispatch({ type: 'SELECT_ANALYST_ID', payload: analyst?.id || null });
    dispatch({ type: 'SET_SELECTED_ANALYST', payload: analyst });
  }, []);

  const setSelectedOrganization = useCallback((organization: Client | null) => {
    dispatch({ type: 'SELECT_ORGANIZATION_ID', payload: organization?.id || null });
    dispatch({ type: 'SET_SELECTED_ORGANIZATION', payload: organization });
  }, []);

  const setSelectedFarm = useCallback((farm: Farm | null) => {
    dispatch({ type: 'SELECT_FARM_ID', payload: farm?.id || null });
    dispatch({ type: 'SET_SELECTED_FARM', payload: farm });
  }, []);

  const selectAnalystById = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_ANALYST_ID', payload: id });
  }, []);

  const selectOrganizationById = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_ORGANIZATION_ID', payload: id });
  }, []);

  const selectFarmById = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_FARM_ID', payload: id });
  }, []);

  const clearFarm = useCallback(() => {
    dispatch({ type: 'SELECT_FARM_ID', payload: null });
    dispatch({ type: 'SET_SELECTED_FARM', payload: null });
  }, []);

  const searchAnalysts = useCallback(
    async (term: string) => {
      await loadAnalysts({ append: false, search: term });
    },
    [loadAnalysts],
  );

  const searchOrganizations = useCallback(
    async (term: string) => {
      await loadOrganizations({ append: false, search: term });
    },
    [loadOrganizations],
  );

  const searchFarms = useCallback(
    async (term: string) => {
      await loadFarms({ append: false, search: term });
    },
    [loadFarms],
  );

  const loadMoreAnalysts = useCallback(async () => {
    if (!stateRef.current.hasMore.analysts || stateRef.current.loading.analysts) return;
    await loadAnalysts({ append: true });
  }, [loadAnalysts]);

  const loadMoreOrganizations = useCallback(async () => {
    if (!stateRef.current.hasMore.organizations || stateRef.current.loading.organizations) return;
    await loadOrganizations({ append: true });
  }, [loadOrganizations]);

  const loadMoreFarms = useCallback(async () => {
    if (!stateRef.current.hasMore.farms || stateRef.current.loading.farms) return;
    await loadFarms({ append: true });
  }, [loadFarms]);

  const refreshCurrentLevel = useCallback(
    async (level: 'analysts' | 'organizations' | 'farms') => {
      if (level === 'analysts') {
        await loadAnalysts({ append: false, search: paginationRef.current.analystsSearch });
        return;
      }
      if (level === 'organizations') {
        await loadOrganizations({ append: false, search: paginationRef.current.organizationsSearch });
        return;
      }
      await loadFarms({ append: false, search: paginationRef.current.farmsSearch });
    },
    [loadAnalysts, loadOrganizations, loadFarms],
  );

  const value = useMemo<HierarchyContextType>(
    () => ({
      ...state,
      effectiveAnalystId,
      setSelectedAnalyst,
      setSelectedOrganization,
      setSelectedFarm,
      selectAnalystById,
      selectOrganizationById,
      selectFarmById,
      clearFarm,
      searchAnalysts,
      searchOrganizations,
      searchFarms,
      loadMoreAnalysts,
      loadMoreOrganizations,
      loadMoreFarms,
      refreshCurrentLevel,
    }),
    [
      state,
      effectiveAnalystId,
      setSelectedAnalyst,
      setSelectedOrganization,
      setSelectedFarm,
      selectAnalystById,
      selectOrganizationById,
      selectFarmById,
      clearFarm,
      searchAnalysts,
      searchOrganizations,
      searchFarms,
      loadMoreAnalysts,
      loadMoreOrganizations,
      loadMoreFarms,
      refreshCurrentLevel,
    ],
  );

  return <HierarchyContext.Provider value={value}>{children}</HierarchyContext.Provider>;
};

export const useHierarchy = () => {
  const context = useContext(HierarchyContext);
  if (context === undefined) {
    throw new Error('useHierarchy must be used within a HierarchyProvider');
  }
  return context;
};
