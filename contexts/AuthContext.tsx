import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { User, AuthContextType, Plan } from '../types';
import { mapUserProfile } from '../lib/auth/mapUserProfile';
import { getAuthHeaders, clearToken, getAccessToken as getStoredToken } from '../lib/session';
import { authClient } from '../lib/auth/betterAuthClient';
import { checkPermission as checkPermissionUtil, checkLimit as checkLimitUtil } from '../lib/auth/permissions';
import { logger } from '../lib/logger';

const log = logger.withContext({ component: 'AuthContext' });

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Constantes ────────────────────────────────────────────────────────────────
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const INACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

// ── Helpers de API ────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...headers, ...(options?.headers ?? {}) },
    });
    const json = await res.json() as { ok: boolean; data?: unknown; error?: string };
    return json;
  } catch {
    return { ok: false, error: 'Erro de rede' };
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);

  log.info('AuthProvider render', { hasUser: !!user, isLoading });

  // ── Inactivity timer ────────────────────────────────────────────────────────

  const clearInactivityTimer = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (inactivityTimerRef.current !== null) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (typeof window === 'undefined') return;
    clearInactivityTimer();
    inactivityTimerRef.current = window.setTimeout(() => {
      log.info('Sessão expirada por inatividade (30 min)');
      clearToken();
      setUser(null);
      setAuthError(null);
      window.location.replace('/sign-in');
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer]);

  // Ativar timer de inatividade quando houver user autenticado
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    resetInactivityTimer();

    const handleActivity = () => resetInactivityTimer();
    for (const event of INACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearInactivityTimer();
      for (const event of INACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [user, resetInactivityTimer, clearInactivityTimer]);

  // Ao montar: verifica se existe sessão válida e hidrata o perfil
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      // Verifica se há token armazenado — evita round-trip desnecessário ao servidor
      const token = await getStoredToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Busca perfil completo de user_profiles via /api/auth
      const result = await apiFetch('/api/auth');
      if (cancelled) return;

      if (result.ok && result.data) {
        const profile = mapUserProfile(result.data as Record<string, unknown>);
        if (profile) {
          setUser(profile);
          setAuthError(null);
        } else {
          clearToken();
          setAuthError(new Error('Perfil de usuário inválido'));
        }
      } else {
        // Sessão inválida ou expirada — limpa token silenciosamente
        clearToken();
      }
      setIsLoading(false);
    };

    void hydrate();
    return () => { cancelled = true; };
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);
    try {
      const result = await authClient.signIn.email({ email, password });

      if (result.error) {
        let msg = result.error.message || result.error.statusText || 'Credenciais inválidas';
        if (
          msg.toLowerCase().includes('password') ||
          msg.toLowerCase().includes('credential') ||
          result.error.code === 'INVALID_PASSWORD' ||
          msg === 'Invalid email or password'
        ) {
          msg = 'senha errada';
        }
        log.error('signIn error', new Error(msg), { code: result.error.code, status: result.error.status });
        return { success: false, error: msg };
      }

      // O onSuccess no betterAuthClient já armazenou o token em localStorage.
      // Agora busca o perfil completo de user_profiles.
      const profileResult = await apiFetch('/api/auth');
      if (!profileResult.ok || !profileResult.data) {
        clearToken();
        return { success: false, error: 'Perfil não encontrado após login' };
      }

      const profile = mapUserProfile(profileResult.data as Record<string, unknown>);
      if (!profile) {
        clearToken();
        return { success: false, error: 'Perfil inválido recebido do servidor' };
      }

      setUser(profile);
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão. Verifique sua internet.' };
    }
  }, []);

  // ── Signup ───────────────────────────────────────────────────────────────────
  const signup = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);
    try {
      const result = await authClient.signUp.email({ email, password, name });

      if (result.error) {
        const msg = result.error.message || result.error.statusText || 'Erro ao criar conta';
        log.error('signUp error', new Error(msg), { code: result.error.code, status: result.error.status });
        return { success: false, error: msg };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão. Verifique sua internet.' };
    }
  }, []);

  // ── Logout ───────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    clearInactivityTimer();

    // Invalida a sessão no banco via Better Auth
    try {
      await authClient.signOut();
    } catch (_) {
      // Ignorar erros de rede no signOut — o clearToken abaixo é suficiente
    }

    clearToken();
    setUser(null);
    setAuthError(null);

    try {
      if (typeof window !== 'undefined') {
        const localKeysToRemove = ['selectedAnalystId', 'selectedClientId', 'selectedFarmId', 'selectedFarm', 'selectedCountry', 'agro-farms'];
        localKeysToRemove.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
      }
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.location.replace('/sign-in');
    }
  }, [clearInactivityTimer]);

  // ── resetPassword (solicita email de recuperação) ──────────────────────────
  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}`
        : 'http://localhost:3000';

      // Chama endpoint Better Auth diretamente
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirectTo: `${baseUrl}/reset-password`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        log.error('resetPassword error', new Error(data?.message ?? `HTTP ${res.status}`));
      }

      // Sempre retornar sucesso para evitar enumeração de emails
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão. Tente novamente.' };
    }
  }, []);

  // ── updatePassword (redefine senha com token) ──────────────────────────────
  const updatePassword = useCallback(async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Extrai o token da URL atual
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        return { success: false, error: 'Token de recuperação não encontrado. Solicite um novo link.' };
      }

      // Chama endpoint Better Auth diretamente
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, token }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.message || 'Erro ao redefinir senha';
        if (msg.includes('INVALID_TOKEN') || msg.includes('invalid') || msg.includes('expired')) {
          return { success: false, error: 'Token inválido ou expirado. Solicite um novo link de recuperação.' };
        }
        return { success: false, error: msg };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão. Tente novamente.' };
    }
  }, []);

  // ── refreshProfile ─────────────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    const result = await apiFetch('/api/auth');
    if (result.ok && result.data) {
      const profile = mapUserProfile(result.data as Record<string, unknown>);
      if (profile) setUser(profile);
      else log.warn('refreshProfile: mapUserProfile retornou null');
    } else {
      log.warn('refreshProfile: falhou ao buscar perfil', { ok: result.ok, error: result.error });
    }
  }, []);

  // ── upgradePlan ────────────────────────────────────────────────────────────
  const upgradePlan = useCallback(async (planId: Plan['id']) => {
    if (!user) return;
    const result = await apiFetch('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ plan: planId }),
    });
    if (result.ok) {
      setUser(prev => (prev ? { ...prev, plan: planId } : null));
    } else {
      log.error('Upgrade plan failed', new Error(result.error ?? 'unknown'));
    }
  }, [user]);

  // ── getAccessToken ─────────────────────────────────────────────────────────
  const getAccessToken = useCallback(() => getStoredToken(), []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const sessionReady = !isLoading;

  const isProfileReady = useMemo(() => {
    if (!user) return false;
    return user.qualification !== undefined;
  }, [user]);

  const checkPermission = useCallback(
    (feature: string): boolean => checkPermissionUtil(user, feature),
    [user],
  );

  const checkLimit = useCallback(
    (limit: keyof Plan['limits'], currentValue: number): boolean => checkLimitUtil(user, limit, currentValue),
    [user],
  );

  const authContextValue = useMemo<AuthContextType>(
    () => ({
      user,
      login,
      signup,
      logout,
      isLoading,
      sessionReady,
      isProfileReady,
      authError,
      checkPermission,
      checkLimit,
      upgradePlan,
      refreshProfile,
      getAccessToken,
      resetPassword,
      updatePassword,
    }),
    [user, login, signup, logout, isLoading, sessionReady, isProfileReady, authError, checkPermission, checkLimit, upgradePlan, refreshProfile, getAccessToken, resetPassword, updatePassword],
  );

  return <AuthContext.Provider value={authContextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
