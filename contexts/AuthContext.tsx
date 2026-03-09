import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, AuthContextType, Plan } from '../types';
import { supabase } from '../lib/supabase';
import { loadUserProfile } from '../lib/auth/loadUserProfile';
import { createUserProfileIfMissing } from '../lib/auth/createProfile';
import { checkPermission as checkPermissionUtil, checkLimit as checkLimitUtil } from '../lib/auth/permissions';
import { mapUserProfile } from '../lib/auth/mapUserProfile';
import { logger } from '../lib/logger';

const log = logger.withContext({ component: 'AuthContext' });

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PASSWORD_RECOVERY_KEY = 'password_recovery_email';
const PASSWORD_RECOVERY_MARKER = 'recovery';
const PASSWORD_RECOVERY_MARKER_VALUE = '1';
const HIERARCHY_STORAGE_PREFIX = 'hierarchySelection.';

const AUTH_TIMEOUTS = {
  SAFETY: 10_000,
  PROFILE_WAIT: 500,
  LOGIN_REF_RESET: 3_000,
} as const;

const clearBrowserSessionData = async () => {
  if (typeof window === 'undefined') return;

  try {
    const localKeysToRemove = [
      PASSWORD_RECOVERY_KEY,
      'selectedAnalystId',
      'selectedClientId',
      'selectedFarmId',
      'selectedFarm',
      'selectedCountry',
      'agro-farms',
    ];

    localKeysToRemove.forEach(key => localStorage.removeItem(key));

    // Remove versões antigas e por usuário da hierarquia.
    Object.keys(localStorage)
      .filter(key => key.startsWith(HIERARCHY_STORAGE_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch (_) {
    // limpeza localStorage best-effort
  }

  try {
    sessionStorage.clear();
  } catch (_) {
    // limpeza sessionStorage best-effort
  }

  try {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey)));
    }
  } catch (_) {
    // limpeza cache storage best-effort
  }
};

const cleanupRecoveryUrl = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.pathname !== '/reset-password') return;

  // Remove parâmetros sensíveis/one-shot para evitar loop e reprocessamento
  url.searchParams.delete('code');
  url.searchParams.delete('token');
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  url.hash = '';

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const isRecoveryFlowUrl = (): boolean => {
  if (typeof window === 'undefined') return false;

  const { pathname, hash, search } = window.location;
  const normalizedPath = pathname.toLowerCase();
  const isResetPasswordPath = normalizedPath === '/reset-password' || normalizedPath.includes('reset-password');

  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const searchParams = new URLSearchParams(search);

  const hashType = hashParams.get('type');
  const searchType = searchParams.get('type');
  const hasRecoveryType =
    hashType === 'recovery' ||
    searchType === 'recovery' ||
    hash.includes('type=recovery') ||
    hash.includes('type%3Drecovery') ||
    search.includes('type=recovery') ||
    search.includes('type%3Drecovery');

  const hasRecoveryToken =
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    hashParams.has('token') ||
    hashParams.has('token_hash') ||
    searchParams.has('code') ||
    searchParams.has('token') ||
    searchParams.has('token_hash');

  // Marker explícito na URL de redirect para recovery (funciona mesmo sem localStorage)
  const hasRecoveryMarker = searchParams.get(PASSWORD_RECOVERY_MARKER) === PASSWORD_RECOVERY_MARKER_VALUE;

  // PKCE flow: URL has ?code=xxx and user requested recovery from same browser
  const hasRecoveryFlag = typeof localStorage !== 'undefined' && !!localStorage.getItem(PASSWORD_RECOVERY_KEY);
  const hasPkceCode = searchParams.has('code');
  // Recovery PKCE exige flag explícita (localStorage ou marker na URL).
  // NÃO tratar ?code= sozinho na raiz como recovery — isso conflita com login normal.
  const isPkceRecovery = hasPkceCode && (hasRecoveryFlag || hasRecoveryMarker);

  return isPkceRecovery || hasRecoveryMarker || (hasRecoveryType && hasRecoveryToken);
};

const VALID_QUALIFICATIONS = ['visitante', 'cliente', 'analista'] as const;

const inferQualification = (metadata?: Record<string, unknown>): User['qualification'] => {
  const raw = metadata?.qualification;
  if (typeof raw === 'string' && VALID_QUALIFICATIONS.includes(raw as typeof VALID_QUALIFICATIONS[number])) {
    return raw as User['qualification'];
  }
  if (metadata?.client_id) return 'cliente';
  return undefined;
};

const buildBasicUser = (
  authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
): User => {
  const meta = authUser.user_metadata;
  return {
    id: authUser.id,
    email: authUser.email || '',
    name: (meta?.name || meta?.full_name || 'Usuário') as string,
    role: (meta?.role as 'admin' | 'client') || 'client',
    plan: (meta?.plan as 'basic' | 'pro' | 'enterprise') || 'basic',
    avatar: (meta?.avatar || authUser.email?.[0].toUpperCase() || 'U') as string,
    status: 'active',
    qualification: inferQualification(meta),
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const loginInProgressRef = useRef(false);

  useEffect(() => {
    // Limpa resíduo antigo de recovery quando não há fluxo ativo na URL
    const initialSearchParams = new URLSearchParams(window.location.search);
    const hasInitialCode = initialSearchParams.has('code');
    const hasInitialRecoveryMarker =
      initialSearchParams.get(PASSWORD_RECOVERY_MARKER) === PASSWORD_RECOVERY_MARKER_VALUE;
    if (!hasInitialCode && !hasInitialRecoveryMarker && !isRecoveryFlowUrl()) {
      localStorage.removeItem(PASSWORD_RECOVERY_KEY);
    }

    // Detectar recovery pela URL IMEDIATAMENTE (antes de qualquer async)
    // Evita cair na tela de login enquanto o onAuthStateChange ainda não disparou
    if (isRecoveryFlowUrl()) {
      log.info('Recovery URL detected on load, showing reset password page');
      setIsPasswordRecovery(true);
    }

    // Timeout de segurança para garantir que isLoading sempre se torne false
    const safetyTimeout = setTimeout(() => {
      log.warn('Auth initialization timeout - forçando isLoading = false');
      setIsLoading(false);
    }, AUTH_TIMEOUTS.SAFETY);

    // Check for existing session
    const initAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          log.error('Error getting session', error instanceof Error ? error : new Error(String(error)));
          setIsLoading(false);
        } else if (session?.user) {
          setUser(buildBasicUser(session.user));

          // Load full profile in background
          loadUserProfile(session.user.id)
            .then(profile => {
              if (profile) setUser(profile);
            })
            .catch((err: unknown) => {
              log.error('Error loading user profile', err instanceof Error ? err : new Error(String(err)));
            });
          clearTimeout(safetyTimeout);
          setIsLoading(false);
        } else {
          // Sem sessão: verificar se há code PKCE na URL (SDK ainda pode trocar)
          const searchParams = new URLSearchParams(window.location.search);
          const hasPkceCode = searchParams.has('code');
          const hasRecoveryFlag = !!localStorage.getItem(PASSWORD_RECOVERY_KEY);
          const hasRecoveryMarker = searchParams.get(PASSWORD_RECOVERY_MARKER) === PASSWORD_RECOVERY_MARKER_VALUE;
          const isAuthCallback = window.location.pathname === '/auth/callback';

          const waitingForPkceExchange = hasPkceCode && (hasRecoveryFlag || hasRecoveryMarker || isAuthCallback);

          if (!waitingForPkceExchange) {
            setUser(null);
            clearTimeout(safetyTimeout);
            setIsLoading(false);
          }
          // Se waitingForPkceExchange: o safetyTimeout de 10s garante que isLoading eventualmente será false
          // O onAuthStateChange com SIGNED_IN vai setar o user e isLoading
        }
      } catch (error: unknown) {
        log.error('Error initializing auth', error instanceof Error ? error : new Error(String(error)));
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes - registrar ANTES do return para evitar dead code
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      log.debug(`Auth state changed: ${event}`, { userId: session?.user?.id });

      // Detectar evento de recovery - mostrar página de reset de senha
      if (event === 'PASSWORD_RECOVERY') {
        log.info('Password recovery token detected, showing reset password page');
        cleanupRecoveryUrl();
        setIsPasswordRecovery(true);
        clearTimeout(safetyTimeout);
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        // Recovery só é detectado via isRecoveryFlowUrl() que exige flag explícita
        if (isRecoveryFlowUrl()) {
          log.info('Recovery session detected via SIGNED_IN, activating recovery mode');
          cleanupRecoveryUrl();
          setIsPasswordRecovery(true);
          clearTimeout(safetyTimeout);
          setIsLoading(false);
          return;
        }

        // Se login() já está tratando, não duplicar o processamento de perfil
        if (loginInProgressRef.current) {
          log.debug('Login in progress, skipping profile load in onAuthStateChange');
          clearTimeout(safetyTimeout);
          setIsLoading(false);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, AUTH_TIMEOUTS.PROFILE_WAIT));

        const userProfile = await loadUserProfile(session.user.id, 3, 1000);
        if (userProfile) {
          setUser(userProfile);
        } else {
          log.warn('Profile not found after SIGNED_IN, using basic user');
          setUser(buildBasicUser(session.user));
        }
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        const userProfile = await loadUserProfile(session.user.id);
        if (userProfile) {
          setUser(prev => {
            if (prev && prev.id === userProfile.id && prev.email === userProfile.email) {
              const changed = Object.keys(userProfile).some(
                key => (userProfile as any)[key] !== (prev as any)[key]
              );
              return changed ? userProfile : prev;
            }
            return userProfile;
          });
        }
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // NÃO chamar setIsLoading(true) aqui para não causar re-montagem do LoginPage
    // O LoginPage já tem seu próprio estado de loading (isSubmitting)
    loginInProgressRef.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        log.error('Login error', new Error(error.message));

        // Map Supabase errors to user-friendly messages
        let errorMessage = 'Erro ao realizar login.';
        const errorMsg = error.message.toLowerCase();

        if (errorMsg === 'invalid login credentials' || errorMsg.includes('invalid login credentials')) {
          errorMessage = 'Email ou senha incorretos. Verifique suas credenciais.';
        } else if (errorMsg.includes('email not confirmed') || errorMsg.includes('email_not_confirmed')) {
          errorMessage = 'Email não confirmado. Verifique sua caixa de entrada.';
        } else if (errorMsg.includes('user not found') || errorMsg.includes('user_not_found')) {
          errorMessage = 'Email não encontrado. Verifique se o email está correto.';
        } else if (errorMsg.includes('invalid email')) {
          errorMessage = 'Email inválido. Verifique o formato do email.';
        } else if (errorMsg.includes('too many requests') || errorMsg.includes('rate limit')) {
          errorMessage = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
        } else if (errorMsg.includes('password')) {
          errorMessage = 'Senha incorreta. Verifique sua senha e tente novamente.';
        }

        return { success: false, error: errorMessage };
      }

      if (data.user) {
        log.info('Login successful', { userId: data.user.id });

        setUser(buildBasicUser(data.user));
        setIsLoading(false);

        const loadFullProfile = async () => {
          await new Promise(resolve => setTimeout(resolve, AUTH_TIMEOUTS.PROFILE_WAIT));
          const userProfile = await loadUserProfile(data.user!.id, 2, 800);
          if (userProfile) {
            setUser(userProfile);
            return;
          }
          // Se perfil não existe, tentar criar
          log.info('Profile not found after login, attempting to create');
          await createUserProfileIfMissing(data.user!.id);
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retryProfile = await loadUserProfile(data.user!.id, 2, 800);
          if (retryProfile) {
            setUser(retryProfile);
          }
        };

        // Não bloquear o login — carregar perfil completo em background
        loadFullProfile().catch((err: unknown) => {
          log.warn('Background profile load failed, using basic user', {
            error: err instanceof Error ? err.message : String(err),
          });
        });

        return { success: true };
      }

      return { success: false, error: 'Erro inesperado ao realizar login.' };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Login error', err);
      return { success: false, error: err.message || 'Erro inesperado ao realizar login.' };
    } finally {
      setTimeout(() => {
        loginInProgressRef.current = false;
      }, AUTH_TIMEOUTS.LOGIN_REF_RESET);
    }
  }, []);

  const logout = useCallback(async () => {
    // Clear user state immediately to ensure UI update
    setUser(null);
    try {
      await supabase.auth.signOut();
    } catch (error: unknown) {
      log.error('Logout error', error instanceof Error ? error : new Error(String(error)));
    } finally {
      await clearBrowserSessionData();
    }
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google') => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // Isola callback OAuth para não conflitar com recovery em "/?code=..."
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        log.error('OAuth error', new Error(error.message));
        throw error;
      }

      return data;
    } catch (error: unknown) {
      log.error('OAuth error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, []);

  const checkPermission = useCallback(
    (feature: string): boolean => {
      return checkPermissionUtil(user, feature);
    },
    [user],
  );

  const checkLimit = useCallback(
    (limit: keyof Plan['limits'], currentValue: number): boolean => {
      return checkLimitUtil(user, limit, currentValue);
    },
    [user],
  );

  const signup = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      phone: string,
      organizationName?: string,
    ): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      try {
        // Sign up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
              full_name: name,
              organization_name: organizationName || `${name}'s Organization`,
              role: 'client',
              plan: 'basic',
              avatar: name.charAt(0).toUpperCase(),
              phone: phone,
            },
            emailRedirectTo: `${window.location.origin}`,
          },
        });

        if (error) {
          log.error('Signup error', new Error(error.message));
          setIsLoading(false);
          return { success: false, error: error.message };
        }

        if (data.user) {
          // Update the profile with phone number if it exists
          // The trigger will create the profile, but we need to update it with phone
          try {
            const { error: updateError } = await supabase
              .from('user_profiles')
              .update({ phone: phone })
              .eq('id', data.user.id);

            if (updateError) {
              log.warn('Could not update phone in profile');
            }
          } catch (err: unknown) {
            log.warn('Error updating phone');
          }

          // Wait a bit for the trigger to create the profile
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Try to load the profile with retries
          const userProfile = await loadUserProfile(data.user.id, 5, 800);
          if (userProfile) {
            setUser(userProfile);
            setIsLoading(false);
            return { success: true };
          } else {
            // Wait a bit more and try again
            log.warn('Profile not found after signup, retrying');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const retryProfile = await loadUserProfile(data.user.id, 3, 1000);
            if (retryProfile) {
              setUser(retryProfile);
              setIsLoading(false);
              return { success: true };
            }
          }

          setIsLoading(false);
          return { success: true }; // Return success even if profile not loaded yet - it will be created by trigger
        }

        setIsLoading(false);
        return { success: false, error: 'Erro ao criar conta' };
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error('Signup error', err);
        setIsLoading(false);
        return { success: false, error: err.message || 'Erro ao criar conta' };
      }
    },
    [],
  );

  const upgradePlan = useCallback(
    async (planId: Plan['id']) => {
      if (!user) return;

      try {
        const { error } = await supabase.from('user_profiles').update({ plan: planId }).eq('id', user.id);

        if (error) {
          log.error('Error upgrading plan', new Error(error.message));
          return;
        }

        const updatedUser = { ...user, plan: planId };
        setUser(updatedUser);
      } catch (error: unknown) {
        log.error('Error upgrading plan', error instanceof Error ? error : new Error(String(error)));
      }
    },
    [user],
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    try {
      const userProfile = await loadUserProfile(user.id, 1, 0);
      if (userProfile) {
        setUser(userProfile);
      }
    } catch (error: unknown) {
      log.error('Error refreshing profile', error instanceof Error ? error : new Error(String(error)));
    }
  }, [user]);

  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Persistir intent para detecção quando usuário clicar no link (PKCE flow)
      localStorage.setItem(PASSWORD_RECOVERY_KEY, email);

      // Garantir que a URL use o protocolo correto (https em produção)
      const origin = window.location.origin || window.location.protocol + '//' + window.location.host;
      const redirectUrl = `${origin}/reset-password?${PASSWORD_RECOVERY_MARKER}=${PASSWORD_RECOVERY_MARKER_VALUE}&email=${encodeURIComponent(email)}`;

      log.debug(`Sending password reset email with redirect URL: ${redirectUrl}`);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        log.error('Reset password error', new Error(error.message));
        localStorage.removeItem(PASSWORD_RECOVERY_KEY);

        let errorMessage = 'Erro ao enviar email de recuperação.';
        const errorMsg = error.message.toLowerCase();

        if (errorMsg.includes('user not found') || errorMsg.includes('user_not_found')) {
          errorMessage = 'Email não encontrado. Verifique se o email está correto.';
        } else if (errorMsg.includes('invalid email')) {
          errorMessage = 'Email inválido. Verifique o formato do email.';
        } else if (errorMsg.includes('too many requests') || errorMsg.includes('rate limit')) {
          errorMessage = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
        }

        return { success: false, error: errorMessage };
      }

      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Reset password error', err);
      return { success: false, error: err.message || 'Erro inesperado ao enviar email de recuperação.' };
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const tryUpdatePassword = async () =>
        supabase.auth.updateUser({
          password: newPassword,
        });

      let { error } = await tryUpdatePassword();

      // Alguns links PKCE chegam sem sessão pronta. Tentar exchange e retry uma vez.
      if (error?.message?.toLowerCase().includes('auth session missing')) {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError) {
            const retry = await tryUpdatePassword();
            error = retry.error;
          }
        }
      }

      if (error) {
        log.error('Update password error', new Error(error.message));

        let errorMessage = 'Erro ao atualizar senha.';
        const errorMsg = error.message.toLowerCase();

        if (errorMsg.includes('password')) {
          errorMessage = 'A senha não atende aos requisitos mínimos.';
        } else if (errorMsg.includes('token') || errorMsg.includes('expired') || errorMsg.includes('invalid grant')) {
          errorMessage = 'Link de recuperação expirado ou inválido. Solicite um novo link.';
        } else if (error.message) {
          errorMessage = error.message;
        }

        return { success: false, error: errorMessage };
      }

      // Limpa URL IMEDIATAMENTE para impedir re-detecção por event handlers do onAuthStateChange
      localStorage.removeItem(PASSWORD_RECOVERY_KEY);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
      // NÃO chamar signOut nem setIsPasswordRecovery aqui.
      // ResetPasswordPage mostra tela de sucesso por 2s, depois onSuccess → clearPasswordRecovery()
      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Update password error', err);
      return { success: false, error: err.message || 'Erro inesperado ao atualizar senha.' };
    }
  }, []);

  // Função para limpar estado de recovery (após sucesso ou quando usuário cancela)
  const clearPasswordRecovery = useCallback(async () => {
    localStorage.removeItem(PASSWORD_RECOVERY_KEY);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (_) {
      // signOut pode falhar se sessão já expirou — OK
    }
    setIsPasswordRecovery(false);
  }, []);

  const authContextValue = useMemo(
    () => ({
      user,
      login,
      logout,
      isLoading,
      isPasswordRecovery,
      checkPermission,
      checkLimit,
      upgradePlan,
      refreshProfile,
      signInWithOAuth,
      signup,
      resetPassword,
      updatePassword,
      clearPasswordRecovery,
    }),
    [
      user,
      login,
      logout,
      isLoading,
      isPasswordRecovery,
      checkPermission,
      checkLimit,
      upgradePlan,
      refreshProfile,
      signInWithOAuth,
      signup,
      resetPassword,
      updatePassword,
      clearPasswordRecovery,
    ],
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
