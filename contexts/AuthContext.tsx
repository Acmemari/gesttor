import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
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
  const isRootPath = normalizedPath === '/';
  // Fallback importante: links de recovery podem chegar em "/?code=..." quando redirectTo é ignorado.
  // Com OAuth indo para /auth/callback, code na raiz passa a ser tratado como recovery.
  const isRootCodeFallback = isRootPath && hasPkceCode;
  const isPkceRecovery = hasPkceCode && (hasRecoveryFlag || hasRecoveryMarker || isRootCodeFallback);

  return isPkceRecovery || hasRecoveryMarker || (hasRecoveryType && hasRecoveryToken);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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
    }, 10000); // 10 segundos máximo

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
          // Optimistically set user from session metadata specific to Supabase Auth
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || 'Usuário',
            role: (session.user.user_metadata?.role as 'admin' | 'client') || 'client',
            plan: (session.user.user_metadata?.plan as 'basic' | 'pro' | 'enterprise') || 'basic',
            avatar: session.user.user_metadata?.avatar || session.user.email?.[0].toUpperCase() || 'U',
            status: 'active',
          });

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
          const isRootPath = window.location.pathname === '/';
          const waitingForPkceExchange = hasPkceCode && (hasRecoveryFlag || hasRecoveryMarker || isRootPath);

          if (!waitingForPkceExchange) {
            setUser(null);
            clearTimeout(safetyTimeout);
            setIsLoading(false);
          }
          // Se waitingForPkceExchange: não setar isLoading=false aqui;
          // PASSWORD_RECOVERY ou SIGNED_IN vai chamar setIsLoading(false)
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
        // PKCE flow: localStorage flag indica recovery; URL pode não ter type=recovery
        const isRootPath = window.location.pathname === '/';
        const hasCode = new URLSearchParams(window.location.search).has('code');
        if (isRecoveryFlowUrl() || (isRootPath && hasCode)) {
          log.info('Recovery session detected via SIGNED_IN, activating recovery mode');
          // Após troca do code, remove parâmetros one-shot para não entrar em loop
          cleanupRecoveryUrl();
          setIsPasswordRecovery(true);
          clearTimeout(safetyTimeout);
          setIsLoading(false);
          return;
        }

        // Wait a bit for trigger to create profile
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try to load profile
        let userProfile = await loadUserProfile(session.user.id, 3, 1000);

        // If profile still doesn't exist, try to create it
        if (!userProfile && session.user) {
          log.info('Profile not found, attempting to create using RPC');
          const created = await createUserProfileIfMissing(session.user.id);

          if (created) {
            // Wait a bit more and try loading again
            await new Promise(resolve => setTimeout(resolve, 1500));
            userProfile = await loadUserProfile(session.user.id, 3, 1000);
          }
        }

        if (userProfile) {
          setUser(userProfile);
        } else {
          log.warn('Profile not found after SIGNED_IN event and creation attempt');
          // Even without profile, we can set a basic user object to allow access
          // The profile will be created by the trigger eventually
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || 'Usuário',
            role: (session.user.user_metadata?.role as 'admin' | 'client') || 'client',
            plan: (session.user.user_metadata?.plan as 'basic' | 'pro' | 'enterprise') || 'basic',
            avatar: session.user.user_metadata?.avatar || session.user.email?.[0].toUpperCase() || 'U',
            status: 'active',
          });
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        const userProfile = await loadUserProfile(session.user.id);
        if (userProfile) {
          setUser(userProfile);
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
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        log.error('Login error', new Error(error.message));
        // NÃO chamar setIsLoading aqui - o LoginPage permanece montado e mantém o estado de erro

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
        // Wait a moment for the trigger to potentially create the profile
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try to load the profile with retries
        let userProfile = await loadUserProfile(data.user.id, 3, 1000);

        // If profile doesn't exist, try to create it
        if (!userProfile) {
          log.info('Profile not found after login, attempting to create');
          const created = await createUserProfileIfMissing(data.user.id);

          if (created) {
            // Wait a bit more and try loading again
            await new Promise(resolve => setTimeout(resolve, 1500));
            userProfile = await loadUserProfile(data.user.id, 3, 1000);
          }
        }

        if (userProfile) {
          log.info('User profile loaded, setting user state');
          setUser(userProfile);
          setIsLoading(false);
          return { success: true };
        } else {
          log.warn('Profile not found after login and creation attempt');
          // Create a temporary user object from auth data
          // The profile will be created by trigger or on next login
          setUser({
            id: data.user.id,
            email: data.user.email || '',
            name: data.user.user_metadata?.name || data.user.user_metadata?.full_name || 'Usuário',
            role: (data.user.user_metadata?.role as 'admin' | 'client') || 'client',
            plan: (data.user.user_metadata?.plan as 'basic' | 'pro' | 'enterprise') || 'basic',
            avatar: data.user.user_metadata?.avatar || data.user.email?.[0].toUpperCase() || 'U',
            status: 'active',
          });
          setIsLoading(false);
          return { success: true };
        }
      }

      // NÃO chamar setIsLoading aqui para manter o LoginPage montado
      return { success: false, error: 'Erro inesperado ao realizar login.' };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Login error', err);
      return { success: false, error: err.message || 'Erro inesperado ao realizar login.' };
    }
  }, []);

  const logout = useCallback(async () => {
    // Clear user state immediately to ensure UI update
    setUser(null);
    try {
      await supabase.auth.signOut();
    } catch (error: unknown) {
      log.error('Logout error', error instanceof Error ? error : new Error(String(error)));
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
