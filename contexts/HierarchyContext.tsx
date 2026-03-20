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
const VISITOR_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
const VISITOR_FARM_ID = '00000000-0000-0000-0000-000000000003';

/** Cliente stub para modo visitante; evita query Supabase que pode travar por RLS. */
const VISITOR_CLIENT: Client = {
  id: VISITOR_CLIENT_ID,
  name: 'Inttegra (Visitante)',
  phone: '',
  email: '',
  analystId: VISITOR_ANALYST_ID,
  createdAt: '',
  updatedAt: '',
};

interface HierarchyLoadingState {
  analysts: boolean;
  clients: boolean;
  farms: boolean;
}

interface HierarchyErrorState {
  analysts: string | null;
  clients: string | null;
  farms: string | null;
}

interface HierarchyHasMoreState {
  analysts: boolean;
  clients: boolean;
  farms: boolean;
}

interface HierarchyState {
  analystId: string | null;
  clientId: string | null;
  farmId: string | null;
  selectedAnalyst: User | null;
  selectedClient: Client | null;
  selectedFarm: Farm | null;
  analysts: User[];
  clients: Client[];
  farms: Farm[];
  loading: HierarchyLoadingState;
  errors: HierarchyErrorState;
  hasMore: HierarchyHasMoreState;
}

type HierarchyAction =
  | { type: 'HYDRATE_IDS'; payload: { analystId: string | null; clientId: string | null; farmId: string | null } }
  | { type: 'SET_ANALYSTS'; payload: { data: User[]; append: boolean; hasMore: boolean } }
  | { type: 'SET_CLIENTS'; payload: { data: Client[]; append: boolean; hasMore: boolean } }
  | { type: 'SET_FARMS'; payload: { data: Farm[]; append: boolean; hasMore: boolean } }
  | { type: 'SET_SELECTED_ANALYST'; payload: User | null }
  | { type: 'SET_SELECTED_CLIENT'; payload: Client | null }
  | { type: 'SET_SELECTED_FARM'; payload: Farm | null }
  | { type: 'SET_LOADING'; payload: { level: keyof HierarchyLoadingState; value: boolean } }
  | { type: 'SET_ERROR'; payload: { level: keyof HierarchyErrorState; value: string | null } }
  | { type: 'SELECT_ANALYST_ID'; payload: string | null }
  | { type: 'SELECT_CLIENT_ID'; payload: string | null }
  | { type: 'SELECT_FARM_ID'; payload: string | null };

interface HierarchyContextType extends HierarchyState {
  effectiveAnalystId: string | null;
  setSelectedAnalyst: (analyst: User | null) => void;
  setSelectedClient: (client: Client | null) => void;
  setSelectedFarm: (farm: Farm | null) => void;
  selectAnalystById: (id: string | null) => void;
  selectClientById: (id: string | null) => void;
  selectFarmById: (id: string | null) => void;
  clearFarm: () => void;
  searchAnalysts: (term: string) => Promise<void>;
  searchClients: (term: string) => Promise<void>;
  searchFarms: (term: string) => Promise<void>;
  loadMoreAnalysts: () => Promise<void>;
  loadMoreClients: () => Promise<void>;
  loadMoreFarms: () => Promise<void>;
  refreshCurrentLevel: (level: 'analysts' | 'clients' | 'farms') => Promise<void>;
}

const initialState: HierarchyState = {
  analystId: null,
  clientId: null,
  farmId: null,
  selectedAnalyst: null,
  selectedClient: null,
  selectedFarm: null,
  analysts: [],
  clients: [],
  farms: [],
  loading: {
    analysts: false,
    clients: false,
    farms: false,
  },
  errors: {
    analysts: null,
    clients: null,
    farms: null,
  },
  hasMore: {
    analysts: true,
    clients: true,
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

function loadInitialPersistedIds(userId: string): { analystId: string | null; clientId: string | null; farmId: string | null } {
  const fallback = { analystId: null, clientId: null, farmId: null };
  const scopedKey = getHierarchyStorageKey(userId);

  try {
    const modernRaw = localStorage.getItem(scopedKey);
    if (modernRaw) {
      const modern = JSON.parse(modernRaw);
      return {
        analystId: sanitizeId(typeof modern?.analystId === 'string' ? modern.analystId : null),
        clientId: sanitizeUUID(typeof modern?.clientId === 'string' ? modern.clientId : null),
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
        clientId: sanitizeUUID(typeof legacy?.clientId === 'string' ? legacy.clientId : null),
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
  const clientId = sanitizeUUID(parseLegacyId(localStorage.getItem('selectedClientId')));
  const farmId = sanitizeFarmIdAsUUID(
    localStorage.getItem('selectedFarmId') || parseLegacyId(localStorage.getItem('selectedFarm')),
  );
  const normalized = { analystId, clientId, farmId };
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
        clientId: action.payload.clientId,
        farmId: action.payload.farmId,
        selectedAnalyst: action.payload.analystId !== state.analystId ? null : state.selectedAnalyst,
        selectedClient: action.payload.clientId !== state.clientId ? null : state.selectedClient,
        selectedFarm: action.payload.farmId !== state.farmId ? null : state.selectedFarm,
      };
    case 'SET_ANALYSTS':
      return {
        ...state,
        analysts: action.payload.append ? [...state.analysts, ...action.payload.data] : action.payload.data,
        hasMore: { ...state.hasMore, analysts: action.payload.hasMore },
      };
    case 'SET_CLIENTS':
      return {
        ...state,
        clients: action.payload.append ? [...state.clients, ...action.payload.data] : action.payload.data,
        hasMore: { ...state.hasMore, clients: action.payload.hasMore },
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
    case 'SET_SELECTED_CLIENT':
      return {
        ...state,
        selectedClient: action.payload,
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
        clientId: null,
        farmId: null,
        selectedClient: null,
        selectedFarm: null,
        clients: [],
        farms: [],
      };
    case 'SELECT_CLIENT_ID':
      return {
        ...state,
        clientId: action.payload,
        selectedClient: state.clients.find(c => c.id === action.payload) || null,
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
    clientsOffset: 0,
    farmsOffset: 0,
    analystsSearch: '',
    clientsSearch: '',
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
  const loadClientsRef = useRef<((options?: { append?: boolean; search?: string }) => Promise<void>) | null>(null);
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
    // Clientes têm contexto fixo pelo clientId — não usam analista próprio como filtro.
    // Se o perfil ainda não carregou a qualification mas clientId já existe, tratar como cliente.
    if (user.qualification === 'cliente' || (user.clientId && !user.qualification)) return null;
    if (user.role === 'admin') return state.analystId;
    return user.id;
  }, [user, state.analystId]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    if (user.qualification === 'visitante') {
      dispatch({
        type: 'HYDRATE_IDS',
        payload: {
          analystId: VISITOR_ANALYST_ID,
          clientId: VISITOR_CLIENT_ID,
          farmId: VISITOR_FARM_ID,
        },
      });
      return;
    }
    // Trata como cliente se: qualification='cliente' OU se clientId existe
    // (cobre o estado transitório onde qualification ainda não foi carregada do perfil real).
    const isClientProfile = user.qualification === 'cliente' || Boolean(user.clientId);
    if (isClientProfile) {
      if (!user.clientId) {
        // Cliente sem organização vinculada ainda: aguarda perfil completo sem fixar IDs de visitante
        dispatch({ type: 'HYDRATE_IDS', payload: { analystId: null, clientId: null, farmId: null } });
        return;
      }
      // Carrega o cliente fixo vinculado ao perfil. Restaura fazenda do localStorage se existir.
      const persisted = loadInitialPersistedIds(user.id);
      // Garante que não use clientId/analystId de outra sessão (ex: sessão de visitante anterior)
      const safeFarmId =
        persisted.farmId && persisted.farmId !== VISITOR_FARM_ID ? persisted.farmId : null;
      dispatch({
        type: 'HYDRATE_IDS',
        payload: {
          analystId: null,
          clientId: user.clientId,
          farmId: safeFarmId,
        },
      });
      return;
    }
    const initial = loadInitialPersistedIds(user.id);
    if (user.role !== 'admin') {
      initial.analystId = user.id;
    }
    dispatch({ type: 'HYDRATE_IDS', payload: initial });
  }, [sessionReady, user?.id, user?.role, user?.qualification, user?.clientId, isProfileReady]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    if (user.qualification === 'visitante') return; // IDs são determinísticos, não persistir
    const scopedKey = getHierarchyStorageKey(user.id);
    if (user.qualification === 'cliente') {
      // Para clientes, persiste apenas a fazenda (o clientId vem sempre do perfil); só UUID
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
      clientId: state.clientId,
      farmId: sanitizeFarmIdAsUUID(state.farmId),
    };
    localStorage.setItem(scopedKey, JSON.stringify(payload));
  }, [state.analystId, state.clientId, state.farmId, user, isProfileReady, sessionReady]);

  const nextController = useCallback((level: keyof HierarchyLoadingState) => {
    abortRef.current[level]?.abort();
    const controller = new AbortController();
    abortRef.current[level] = controller;
    return controller;
  }, []);

  const loadAnalysts = useCallback(
    async (options?: { append?: boolean; search?: string }) => {
      if (!user || user.role !== 'admin') return;
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

  const loadClients = useCallback(
    async (options?: { append?: boolean; search?: string }) => {
      // Usuário com qualification='cliente' busca diretamente pelo seu client_id fixo.
      // Também cobre estado transitório: perfil com clientId mas qualification ainda indefinida.
      const isClientUser = user?.qualification === 'cliente' || Boolean(user?.clientId && !user?.qualification);

      if (!user || (!effectiveAnalystId && !isClientUser)) {
        dispatch({ type: 'SET_CLIENTS', payload: { data: [], append: false, hasMore: false } });
        dispatch({ type: 'SELECT_CLIENT_ID', payload: null });
        return;
      }

      // Visitante: não chamar Supabase (query com analyst_id = VISITOR_ANALYST_ID pode travar por RLS).
      if (effectiveAnalystId === VISITOR_ANALYST_ID) {
        dispatch({
          type: 'SET_CLIENTS',
          payload: { data: [VISITOR_CLIENT], append: false, hasMore: false },
        });
        dispatch({ type: 'SELECT_CLIENT_ID', payload: VISITOR_CLIENT_ID });
        dispatch({ type: 'SET_LOADING', payload: { level: 'clients', value: false } });
        return;
      }

      const append = options?.append ?? false;
      const search = options?.search ?? paginationRef.current.clientsSearch;
      paginationRef.current.clientsSearch = search;
      if (!append) paginationRef.current.clientsOffset = 0;

      const trigger = append || search ? 'user' : 'effect';
      if (DEBUG_HIERARCHY) {
        console.debug('[HierarchyContext] loadClients start', { trigger, effectiveAnalystId, append, search });
      }

      const offset = paginationRef.current.clientsOffset;
      const controller = nextController('clients');
      dispatch({ type: 'SET_LOADING', payload: { level: 'clients', value: true } });
      dispatch({ type: 'SET_ERROR', payload: { level: 'clients', value: null } });

      if (!isClientUser && !effectiveAnalystId) {
        dispatch({ type: 'SET_CLIENTS', payload: { data: [], append: false, hasMore: false } });
        return;
      }

      try {
        const { data: mapped, hasMore: hasMoreData } = await fetchClients({
          analystId: isClientUser && user.clientId ? null : effectiveAnalystId ?? undefined,
          clientId: isClientUser && user.clientId ? user.clientId : null,
          offset,
          limit: PAGE_SIZE,
          search: search || undefined,
          signal: controller.signal,
        });
        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] loadClients end ok', { count: mapped.length });
        }
        dispatch({
          type: 'SET_CLIENTS',
          payload: {
            data: mapped,
            append,
            hasMore: hasMoreData,
          },
        });
        paginationRef.current.clientsOffset = append ? offset + mapped.length : mapped.length;

        const current = stateRef.current;
        const selectedId = current.clientId;
        if (!selectedId && mapped.length > 0 && !search) {
          dispatch({ type: 'SELECT_CLIENT_ID', payload: mapped[0].id });
        } else if (selectedId && !append) {
          const exists = mapped.some(client => client.id === selectedId);
          if (!exists) {
            dispatch({ type: 'SELECT_CLIENT_ID', payload: mapped.length > 0 ? mapped[0].id : null });
          } else {
            dispatch({
              type: 'SET_SELECTED_CLIENT',
              payload: mapped.find(client => client.id === selectedId) || null,
            });
          }
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (DEBUG_HIERARCHY) console.debug('[HierarchyContext] loadClients end aborted');
          return;
        }
        const msg = error instanceof Error ? error.message : '';
        const isNetwork = error instanceof TypeError || /fetch|network|ECONNREFUSED/i.test(msg);
        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] loadClients end error', {
            type: isNetwork ? 'network' : 'rpc',
            message: error instanceof Error ? error.message : String(error),
          });
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar organizações.';
        dispatch({
          type: 'SET_ERROR',
          payload: { level: 'clients', value: message },
        });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: { level: 'clients', value: false } });
      }
    },
    [effectiveAnalystId, nextController, user?.id, user?.qualification, user?.clientId],
  );

  const loadFarms = useCallback(
    async (options?: { append?: boolean; search?: string }) => {
      const selectedClientId = stateRef.current.clientId;
      if (!selectedClientId) {
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
        console.debug('[HierarchyContext] loadFarms start', { trigger, selectedClientId, append, search });
      }

      const offset = paginationRef.current.farmsOffset;
      const controller = nextController('farms');
      dispatch({ type: 'SET_LOADING', payload: { level: 'farms', value: true } });
      dispatch({ type: 'SET_ERROR', payload: { level: 'farms', value: null } });

      try {
        const { data: mapped, hasMore: hasMoreData } = await fetchFarms({
          clientId: selectedClientId,
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
        const msg = error instanceof Error ? error.message : '';
        const isNetwork = error instanceof TypeError || /fetch|network|ECONNREFUSED/i.test(msg);
        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] loadFarms end error', {
            type: isNetwork ? 'network' : 'rpc',
            message: error instanceof Error ? error.message : String(error),
          });
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
    loadClientsRef.current = loadClients;
  }, [loadClients]);

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
    if (user.qualification === 'cliente' || (user.clientId && !user.qualification)) {
      dispatch({ type: 'SET_SELECTED_ANALYST', payload: null });
      return;
    }
    if (user.role === 'admin') {
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
  }, [user?.id, user?.role, user?.qualification, user?.clientId, user?.name, user?.email, isProfileReady, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    const key = `${effectiveAnalystId ?? ''}-${user.clientId ?? ''}`;
    if (lastLoadClientsKeyRef.current === key) return;
    lastLoadClientsKeyRef.current = key;
    void loadClientsRef.current?.({ append: false, search: '' });
  }, [sessionReady, effectiveAnalystId, isProfileReady, user?.id, user?.role, user?.qualification, user?.clientId]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    const key = String(state.clientId ?? '');
    if (lastLoadFarmsKeyRef.current === key) return;
    lastLoadFarmsKeyRef.current = key;
    void loadFarmsRef.current?.({ append: false, search: '' });
  }, [sessionReady, state.clientId, isProfileReady, user?.id]);

  useEffect(() => {
    if (!sessionReady || !user || !isProfileReady) return;
    if (user.qualification === 'visitante') return;

    const abortController = new AbortController();

    const timer = window.setTimeout(() => {
      const runValidation = async () => {
        const current = stateRef.current;
        const sanitizedAnalystId = sanitizeId(effectiveAnalystId);
        const sanitizedClientId = sanitizeUUID(current.clientId);
        const sanitizedFarmId = sanitizeId(current.farmId);
        if (!sanitizedAnalystId && !sanitizedClientId && !sanitizedFarmId) return;

        // Bootstrap guard: skip validation when only analystId is set; fetchClients will
        // auto-select the first client and this effect will re-run with clientId.
        if (sanitizedAnalystId && !sanitizedClientId && !sanitizedFarmId) return;

        const snapshotClientId = current.clientId;

        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] validate_hierarchy start', {
            analystId: sanitizedAnalystId,
            clientId: sanitizedClientId,
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
              clientId: sanitizedClientId,
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
            validationFailureCountRef.current += 1;
            if (validationFailureCountRef.current >= 2) {
              if (abortController.signal.aborted) return;
              if (stateRef.current.clientId !== snapshotClientId) return;
              if (DEBUG_HIERARCHY) {
                console.debug('[HierarchyContext] validate_hierarchy RESET IDs (consecutive RPC failures)');
              }
              dispatch({
                type: 'HYDRATE_IDS',
                payload: {
                  analystId: stateRef.current.analystId,
                  clientId: null,
                  farmId: null,
                },
              });
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

        if (stateRef.current.clientId !== snapshotClientId) {
          if (DEBUG_HIERARCHY) {
            console.debug('[HierarchyContext] State changed during validate_hierarchy, discarding stale result');
          }
          return;
        }

        validationFailureCountRef.current = 0;
        const result = data[0];
        const nextAnalystId = result.analyst_valid ? sanitizedAnalystId : null;
        const nextClientId = result.client_valid ? sanitizedClientId : null;
        const nextFarmId = result.farm_valid ? sanitizedFarmId : null;

        if (DEBUG_HIERARCHY) {
          console.debug('[HierarchyContext] validate_hierarchy end ok', {
            analystValid: result.analyst_valid,
            clientValid: result.client_valid,
            farmValid: result.farm_valid,
          });
        }

        dispatch({
          type: 'HYDRATE_IDS',
          payload: {
            analystId: nextAnalystId,
            clientId: nextClientId,
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
    user?.clientId,
    isProfileReady,
    effectiveAnalystId,
    state.analystId,
    state.clientId,
    state.farmId,
  ]);

  // Realtime subscription removida: dados vêm via API Drizzle.
  // Use refreshCurrentLevel para atualizar manualmente.

  const setSelectedAnalyst = useCallback((analyst: User | null) => {
    dispatch({ type: 'SELECT_ANALYST_ID', payload: analyst?.id || null });
    dispatch({ type: 'SET_SELECTED_ANALYST', payload: analyst });
  }, []);

  const setSelectedClient = useCallback((client: Client | null) => {
    dispatch({ type: 'SELECT_CLIENT_ID', payload: client?.id || null });
    dispatch({ type: 'SET_SELECTED_CLIENT', payload: client });
  }, []);

  const setSelectedFarm = useCallback((farm: Farm | null) => {
    dispatch({ type: 'SELECT_FARM_ID', payload: farm?.id || null });
    dispatch({ type: 'SET_SELECTED_FARM', payload: farm });
  }, []);

  const selectAnalystById = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_ANALYST_ID', payload: id });
  }, []);

  const selectClientById = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_CLIENT_ID', payload: id });
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

  const searchClients = useCallback(
    async (term: string) => {
      await loadClients({ append: false, search: term });
    },
    [loadClients],
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

  const loadMoreClients = useCallback(async () => {
    if (!stateRef.current.hasMore.clients || stateRef.current.loading.clients) return;
    await loadClients({ append: true });
  }, [loadClients]);

  const loadMoreFarms = useCallback(async () => {
    if (!stateRef.current.hasMore.farms || stateRef.current.loading.farms) return;
    await loadFarms({ append: true });
  }, [loadFarms]);

  const refreshCurrentLevel = useCallback(
    async (level: 'analysts' | 'clients' | 'farms') => {
      if (level === 'analysts') {
        await loadAnalysts({ append: false, search: paginationRef.current.analystsSearch });
        return;
      }
      if (level === 'clients') {
        await loadClients({ append: false, search: paginationRef.current.clientsSearch });
        return;
      }
      await loadFarms({ append: false, search: paginationRef.current.farmsSearch });
    },
    [loadAnalysts, loadClients, loadFarms],
  );

  const value = useMemo<HierarchyContextType>(
    () => ({
      ...state,
      effectiveAnalystId,
      setSelectedAnalyst,
      setSelectedClient,
      setSelectedFarm,
      selectAnalystById,
      selectClientById,
      selectFarmById,
      clearFarm,
      searchAnalysts,
      searchClients,
      searchFarms,
      loadMoreAnalysts,
      loadMoreClients,
      loadMoreFarms,
      refreshCurrentLevel,
    }),
    [
      state,
      effectiveAnalystId,
      setSelectedAnalyst,
      setSelectedClient,
      setSelectedFarm,
      selectAnalystById,
      selectClientById,
      selectFarmById,
      clearFarm,
      searchAnalysts,
      searchClients,
      searchFarms,
      loadMoreAnalysts,
      loadMoreClients,
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
