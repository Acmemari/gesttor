import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Lock, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

interface ResetPasswordPageProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onSuccess: () => void;
}

/** Página de redefinição de senha via Better Auth. */
const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onToast, onSuccess }) => {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const readRecoveryEmail = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);

        // Verificar token/error na URL imediatamente
        const urlError = searchParams.get('error');
        const token = searchParams.get('token');

        if (isMounted && (urlError || !token)) {
          if (urlError === 'INVALID_TOKEN') {
            setError('Token inválido ou expirado. Solicite um novo link de recuperação.');
          } else if (!token) {
            setError('Token de recuperação não encontrado. Solicite um novo link.');
          } else {
            setError('Link de recuperação inválido. Solicite um novo link.');
          }
          setTokenMissing(true);
          return;
        }

        // Fonte 1: localStorage (definido ao solicitar recovery - PKCE flow)
        const emailFromStorage = localStorage.getItem('password_recovery_email');
        if (emailFromStorage && isMounted) {
          setRecoveryEmail(emailFromStorage);
        }

        // Fonte 2: URL params
        const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '');
        const emailFromUrl = searchParams.get('email') || hashParams.get('email');
        if (emailFromUrl && isMounted) {
          setRecoveryEmail(emailFromUrl);
        }

      } catch (err) {
        console.warn('Could not load recovery email', err);
      }
    };

    readRecoveryEmail();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validações
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await updatePassword(password);

      if (!result.success) {
        setError(result.error || 'Erro ao redefinir senha. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      // Sucesso: limpar flag de recovery no localStorage
      try {
        localStorage.removeItem('password_recovery_email');
      } catch (_) {}
      setIsSuccess(true);
      setIsSubmitting(false);
      if (onToast) {
        onToast('Senha redefinida com sucesso!', 'success');
      }

      // Redirecionar após 2 segundos
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      console.error('Reset password error:', err);
      setError(err.message || 'Erro inesperado. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  // Tela de sucesso após redefinir a senha
  if (isSuccess) {
    return (
      <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto">
        <div className="w-full max-w-md mx-auto px-4 py-6 sm:py-8 pb-12">
          {/* Logo Section */}
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gesttor</h1>
            <p className="text-ai-subtext text-xs sm:text-sm mt-1 sm:mt-2">Gestão de precisão para sua fazenda</p>
          </div>

          {/* Success Card */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-4 sm:p-6 md:p-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <h2 className="text-base sm:text-lg font-semibold mb-2">Senha redefinida!</h2>
              <p className="text-[10px] sm:text-xs text-ai-subtext mb-6">
                Sua senha foi redefinida com sucesso. Você será redirecionado para a página de login.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-4 py-6 sm:py-8 pb-12">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gesttor</h1>
          <p className="text-ai-subtext text-xs sm:text-sm mt-1 sm:mt-2">Gestão de precisão para sua fazenda</p>
        </div>

        {/* Reset Password Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-4 sm:p-6 md:p-8">
          <div className="mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold">Redefinir senha</h2>
            <p className="text-[10px] sm:text-xs text-ai-subtext mt-1">
              Digite sua nova senha abaixo. A senha deve ter no mínimo 8 caracteres.
            </p>
            {recoveryEmail && (
              <p className="text-[10px] sm:text-xs text-ai-text mt-2">
                Recuperação solicitada para: <span className="font-semibold">{recoveryEmail}</span>
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-[10px] sm:text-xs font-medium text-ai-text mb-1.5">
                Nova Senha
                {password && password.length < 8 && <span className="text-rose-500 ml-1">(mínimo 8 caracteres)</span>}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none text-ai-subtext">
                  <Lock size={14} className="sm:w-4 sm:h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  className={`block w-full pl-9 sm:pl-10 pr-3 py-2 sm:py-2.5 bg-ai-surface border rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-ai-text transition-all outline-none ${
                    password && password.length < 8
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-ai-border focus:border-ai-text'
                  }`}
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-medium text-ai-text mb-1.5">
                Confirmar Senha
                {confirmPassword && password !== confirmPassword && (
                  <span className="text-rose-500 ml-1">(senhas não coincidem)</span>
                )}
                {confirmPassword && password === confirmPassword && password.length >= 8 && (
                  <span className="text-green-600 ml-1">✓</span>
                )}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none text-ai-subtext">
                  <Lock size={14} className="sm:w-4 sm:h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    if (error) setError('');
                  }}
                  className={`block w-full pl-9 sm:pl-10 pr-3 py-2 sm:py-2.5 bg-ai-surface border rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-ai-text transition-all outline-none ${
                    confirmPassword && password !== confirmPassword
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                      : confirmPassword && password === confirmPassword && password.length >= 8
                        ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                        : 'border-ai-border focus:border-ai-text'
                  }`}
                  placeholder="Digite a senha novamente"
                  minLength={8}
                />
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-center text-sm font-medium bg-red-50 border border-red-200 rounded-lg py-3 px-4">
                {error}
              </p>
            )}

            {tokenMissing && (
              <button
                type="button"
                onClick={() => window.location.replace('/forgot-password')}
                className="w-full flex items-center justify-center py-2.5 sm:py-3 px-4 bg-ai-text text-white rounded-lg hover:bg-black transition-colors font-medium text-xs sm:text-sm"
              >
                <span>Solicitar novo link</span>
                <ArrowRight size={14} className="sm:w-4 sm:h-4 ml-2" />
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting || password.length < 8 || password !== confirmPassword || tokenMissing}
              className="w-full flex items-center justify-center py-2.5 sm:py-3 px-4 bg-ai-text text-white rounded-lg hover:bg-black transition-colors font-medium text-xs sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
              ) : (
                <>
                  <span>Redefinir senha</span>
                  <ArrowRight size={14} className="sm:w-4 sm:h-4 ml-2" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
