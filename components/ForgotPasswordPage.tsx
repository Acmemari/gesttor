import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, ArrowRight, Loader2, ArrowLeft } from 'lucide-react';

interface ForgotPasswordPageProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack: () => void;
}

const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onToast, onBack }) => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    // Validação básica de email
    if (!email.trim()) {
      setError('Por favor, informe seu email.');
      setIsSubmitting(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Por favor, informe um email válido.');
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await resetPassword(email);

      if (!result.success) {
        setError(result.error || 'Erro ao enviar email de recuperação. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      // Sucesso
      try {
        localStorage.setItem('password_recovery_email', email.trim());
      } catch (_) {}
      setIsSuccess(true);
      setIsSubmitting(false);
      if (onToast) {
        onToast('Email de recuperação enviado! Verifique sua caixa de entrada.', 'success');
      }
    } catch (err: any) {
      console.error('Reset password error:', err);
      setError(err.message || 'Erro inesperado. Tente novamente.');
      setIsSubmitting(false);
    }
  };

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
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-base sm:text-lg font-semibold mb-2">Email enviado!</h2>
              <p className="text-[10px] sm:text-xs text-ai-subtext mb-6">
                Enviamos um link de recuperação para <strong>{email}</strong>. Verifique sua caixa de entrada e siga as
                instruções para redefinir sua senha.
              </p>
              <p className="text-[10px] sm:text-xs text-ai-subtext mb-6">
                Não recebeu o email? Verifique sua pasta de spam ou tente novamente.
              </p>
              <button
                onClick={onBack}
                className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 bg-ai-text text-white rounded-lg hover:bg-black transition-colors font-medium text-xs sm:text-sm"
              >
                <ArrowLeft size={14} className="sm:w-4 sm:h-4" />
                <span>Voltar ao login</span>
              </button>
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

        {/* Forgot Password Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-4 sm:p-6 md:p-8">
          <div className="mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold">Recuperar senha</h2>
            <p className="text-[10px] sm:text-xs text-ai-subtext mt-1">
              Digite seu email e enviaremos um link para redefinir sua senha.
            </p>
            {email.trim() && (
              <p className="text-xs sm:text-sm text-ai-text mt-2 font-medium">
                Solicitação para: <span className="text-ai-text font-semibold">{email}</span>
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-[10px] sm:text-xs font-medium text-ai-text mb-1.5">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none text-ai-subtext">
                  <Mail size={14} className="sm:w-4 sm:h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  className="block w-full pl-9 sm:pl-10 pr-3 py-2 sm:py-2.5 bg-ai-surface border border-ai-border rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-ai-text focus:border-ai-text transition-all outline-none"
                  placeholder="exemplo@gesttor.com"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-center text-sm font-medium bg-red-50 border border-red-200 rounded-lg py-3 px-4">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center py-2.5 sm:py-3 px-4 bg-ai-text text-white rounded-lg hover:bg-black transition-colors font-medium text-xs sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
              ) : (
                <>
                  <span>Enviar link de recuperação</span>
                  <ArrowRight size={14} className="sm:w-4 sm:h-4 ml-2" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={onBack}
              className="text-[10px] sm:text-xs text-ai-subtext hover:text-ai-text font-medium transition-colors"
            >
              ← Voltar ao login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
