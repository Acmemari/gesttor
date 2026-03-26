import React, { useEffect, useState } from 'react';
import { Lock, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { authClient } from '../lib/auth/betterAuthClient';

interface InviteData {
  valid: boolean;
  reason?: string;
  name?: string;
  email?: string;
  role?: string;
}

interface ConvitePageProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onSuccess: () => void;
}

const ConvitePage: React.FC<ConvitePageProps> = ({ onToast, onSuccess }) => {
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  useEffect(() => {
    if (!token) { setInvite({ valid: false, reason: 'not_found' }); setLoading(false); return; }
    fetch(`/api/invite?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(json => setInvite(json.data ?? { valid: false, reason: 'not_found' }))
      .catch(() => setInvite({ valid: false, reason: 'not_found' }))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    if (!invite?.email || !invite?.name) return;

    setIsSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        email: invite.email,
        password,
        name: invite.name,
      });

      if (result.error) {
        setError(result.error.message || 'Erro ao criar conta. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      setIsSubmitting(false);
      onToast?.('Conta criada com sucesso! Faça login para continuar.', 'success');
      setTimeout(() => onSuccess(), 2500);
    } catch (err: any) {
      setError(err.message || 'Erro inesperado. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="w-full min-h-screen bg-ai-bg flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-ai-subtext" />
      </div>
    );
  }

  // Convite inválido / expirado
  if (!invite?.valid) {
    return (
      <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto">
        <div className="w-full max-w-md mx-auto px-4 py-8 pb-12">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gesttor</h1>
            <p className="text-ai-subtext text-xs sm:text-sm mt-1">Gestão de precisão para sua fazenda</p>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-6 sm:p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle size={32} className="text-red-600" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold mb-2">Convite inválido ou expirado</h2>
            <p className="text-xs sm:text-sm text-ai-subtext mb-6">
              Este link de convite expirou ou não é válido. Peça ao administrador que envie um novo convite.
            </p>
            <button
              onClick={() => window.location.replace('/sign-in')}
              className="text-xs text-ai-subtext hover:text-ai-text underline transition-colors"
            >
              Ir para login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sucesso
  if (isSuccess) {
    return (
      <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto">
        <div className="w-full max-w-md mx-auto px-4 py-8 pb-12">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gesttor</h1>
            <p className="text-ai-subtext text-xs sm:text-sm mt-1">Gestão de precisão para sua fazenda</p>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-6 sm:p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold mb-2">Conta criada!</h2>
            <p className="text-xs sm:text-sm text-ai-subtext">
              Sua conta foi criada com sucesso. Você será redirecionado para o login.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Formulário
  return (
    <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-4 py-6 sm:py-8 pb-12">
        <div className="flex flex-col items-center mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gesttor</h1>
          <p className="text-ai-subtext text-xs sm:text-sm mt-1 sm:mt-2">Gestão de precisão para sua fazenda</p>
        </div>

        <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-4 sm:p-6 md:p-8">
          <div className="mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold">Criar sua senha</h2>
            <p className="text-[10px] sm:text-xs text-ai-subtext mt-1">
              Bem-vindo(a)! Defina uma senha para acessar a plataforma.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Nome (readonly) */}
            <div>
              <label className="block text-[10px] sm:text-xs font-medium text-ai-text mb-1.5">Nome</label>
              <input
                type="text"
                readOnly
                value={invite.name ?? ''}
                className="block w-full px-3 py-2 sm:py-2.5 bg-gray-50 border border-ai-border rounded-lg text-xs sm:text-sm text-ai-subtext cursor-not-allowed"
              />
            </div>

            {/* Email (readonly) */}
            <div>
              <label className="block text-[10px] sm:text-xs font-medium text-ai-text mb-1.5">E-mail</label>
              <input
                type="email"
                readOnly
                value={invite.email ?? ''}
                className="block w-full px-3 py-2 sm:py-2.5 bg-gray-50 border border-ai-border rounded-lg text-xs sm:text-sm text-ai-subtext cursor-not-allowed"
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-[10px] sm:text-xs font-medium text-ai-text mb-1.5">
                Senha
                {password && password.length < 8 && <span className="text-rose-500 ml-1">(mínimo 8 caracteres)</span>}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none text-ai-subtext">
                  <Lock size={14} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (error) setError(''); }}
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

            {/* Confirmar Senha */}
            <div>
              <label className="block text-[10px] sm:text-xs font-medium text-ai-text mb-1.5">
                Confirmar Senha
                {confirmPassword && password !== confirmPassword && <span className="text-rose-500 ml-1">(senhas não coincidem)</span>}
                {confirmPassword && password === confirmPassword && password.length >= 8 && <span className="text-green-600 ml-1">✓</span>}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none text-ai-subtext">
                  <Lock size={14} />
                </div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); if (error) setError(''); }}
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

            <button
              type="submit"
              disabled={isSubmitting || password.length < 8 || password !== confirmPassword}
              className="w-full flex items-center justify-center py-2.5 sm:py-3 px-4 bg-ai-text text-white rounded-lg hover:bg-black transition-colors font-medium text-xs sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <span>Criar conta</span>
                  <ArrowRight size={14} className="ml-2" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] sm:text-xs text-ai-subtext mt-4">
            Já tem uma conta?{' '}
            <button onClick={() => window.location.replace('/sign-in')} className="text-ai-text hover:underline font-medium">
              Faça login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConvitePage;
