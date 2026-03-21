import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Mail, ArrowRight, Loader2, User, Building2, Phone, Eye, EyeOff } from 'lucide-react';
import { APP_VERSION } from '../src/version';
import { formatPhone, validatePhone } from '../lib/utils/phoneMask';

interface LoginPageProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onForgotPassword?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onToast, onForgotPassword }) => {
  const { login, signup } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmitting(true);

    if (isSignup) {
      // Signup flow
      if (password !== confirmPassword) {
        setLoginError('As senhas não coincidem.');
        setIsSubmitting(false);
        return;
      }

      if (password.length < 8) {
        setLoginError('A senha deve ter pelo menos 8 caracteres.');
        setIsSubmitting(false);
        return;
      }

      if (!name.trim()) {
        setLoginError('Por favor, informe seu nome.');
        setIsSubmitting(false);
        return;
      }

      if (!phone.trim()) {
        setLoginError('Por favor, informe seu telefone.');
        setIsSubmitting(false);
        return;
      }

      if (!validatePhone(phone)) {
        setLoginError('Por favor, informe um telefone válido.');
        setIsSubmitting(false);
        return;
      }

      const result = await signup(email, password, name);

      if (!result.success) {
        const errMsg = result.error || '';
        const isEmailTaken = errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('exist') || errMsg.toLowerCase().includes('registered');
        setLoginError(isEmailTaken ? 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' : errMsg || 'Erro ao criar conta. Tente novamente.');
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
    } else {
      // Login flow - SIMPLES
      const result = await login(email, password);

      if (!result.success) {
        // DEFINIR ERRO E PARAR
        setLoginError('Email ou senha incorretos. Verifique suas credenciais.');
        setIsSubmitting(false);
        return; // NÃO CONTINUA
      }
      // Login bem sucedido - AuthContext vai redirecionar
      setIsSubmitting(false);
    }
  };

  // Real-time password validation
  const passwordsMatch = isSignup ? confirmPassword === '' || password === confirmPassword : true;
  const passwordLengthValid = isSignup ? password === '' || password.length >= 6 : true;

  return (
    <div className="w-full min-h-screen bg-[#f5f5f5] text-ai-text font-sans overflow-y-auto flex items-center justify-center">
      <div className="w-full max-w-md mx-auto px-4 py-3 sm:py-4">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-3 sm:mb-4">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Gesttor</h1>
          <p className="text-ai-subtext text-[10px] sm:text-xs mt-0.5">Calculadora de resultados para a pecuária</p>
          <p className="text-ai-subtext text-[10px] sm:text-xs mt-0.5">@ntonio_chaker_</p>
          <p className="text-ai-subtext text-[10px] sm:text-xs">antonio@inttegra.com</p>
          <p className="text-ai-subtext text-[9px] sm:text-[10px] font-medium tracking-wide">v{APP_VERSION} SaaS</p>
        </div>

        {/* Login/Signup Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <div className="mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">{isSignup ? 'Criar nova conta' : 'Acesse sua conta'}</h2>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
              {isSignup
                ? 'Preencha os dados abaixo para começar.'
                : 'Entre com suas credenciais de usuário ou administrador.'}
            </p>
          </div>

          {/* Toggle between Login and Signup */}
          <div className="mb-3 flex p-0.5 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setIsSignup(false);
                setLoginError('');
                setPassword('');
                setConfirmPassword('');
                setName('');
                setPhone('');
                setOrganizationName('');
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all duration-200 ${
                !isSignup ? 'bg-zinc-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignup(true);
                setLoginError('');
                setPassword('');
                setConfirmPassword('');
                setShowPassword(false);
                setShowConfirmPassword(false);
              }}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all duration-200 ${
                isSignup ? 'bg-zinc-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Cadastrar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignup && (
              <div>
                <label className="block text-[11px] sm:text-xs font-medium text-gray-700 mb-1">Nome Completo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <User size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </div>
                  <input
                    type="text"
                    required={isSignup}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="block w-full pl-10 sm:pl-11 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all outline-none"
                    placeholder="Seu nome completo"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] sm:text-xs font-medium text-gray-700 mb-1">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 sm:pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} className="sm:w-[18px] sm:h-[18px]" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  className="block w-full pl-10 sm:pl-11 pr-3 py-2 bg-blue-50/60 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all outline-none"
                  placeholder="exemplo@gesttor.com"
                />
              </div>
            </div>

            {isSignup && (
              <div>
                <label className="block text-[11px] sm:text-xs font-medium text-gray-700 mb-1">
                  Telefone / WhatsApp
                  {phone && !validatePhone(phone) && <span className="text-rose-500 ml-1">(formato inválido)</span>}
                  {phone && validatePhone(phone) && <span className="text-green-600 ml-1">✓</span>}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Phone size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </div>
                  <input
                    type="tel"
                    required={isSignup}
                    value={phone}
                    onChange={e => {
                      const formatted = formatPhone(e.target.value);
                      setPhone(formatted);
                    }}
                    className={`block w-full pl-10 sm:pl-11 pr-3 py-2 bg-gray-50 border rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 transition-all outline-none ${
                      phone && !validatePhone(phone)
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                        : phone && validatePhone(phone)
                          ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                          : 'border-ai-border focus:border-ai-text'
                    }`}
                    placeholder="Ex: (55) 99999-9999"
                    maxLength={15}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] sm:text-xs font-medium text-gray-700 mb-1">
                Senha
                {isSignup && password && !passwordLengthValid && (
                  <span className="text-rose-500 ml-1">(mínimo 6 caracteres)</span>
                )}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 sm:pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} className="sm:w-[18px] sm:h-[18px]" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  className={`block w-full pl-10 sm:pl-11 pr-10 sm:pr-11 py-2 bg-gray-50 border rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-500 transition-all outline-none ${
                    isSignup && password && !passwordLengthValid
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-gray-200 focus:border-gray-500'
                  }`}
                  placeholder={isSignup ? 'Mínimo 6 caracteres' : '••••••••'}
                  minLength={isSignup ? 6 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 sm:pr-3.5 flex items-center text-gray-400 hover:text-gray-600 outline-none"
                >
                  {showPassword ? (
                    <EyeOff size={16} className="sm:w-[18px] sm:h-[18px]" />
                  ) : (
                    <Eye size={16} className="sm:w-[18px] sm:h-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {isSignup && (
              <>
                <div>
                  <label className="block text-[11px] sm:text-xs font-medium text-gray-700 mb-1">
                    Confirmar Senha
                    {confirmPassword && !passwordsMatch && (
                      <span className="text-rose-500 ml-1">(senhas não coincidem)</span>
                    )}
                    {confirmPassword && passwordsMatch && password && <span className="text-green-600 ml-1">✓</span>}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 sm:pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Lock size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required={isSignup}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className={`block w-full pl-10 sm:pl-11 pr-10 sm:pr-11 py-2 bg-gray-50 border rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 transition-all outline-none ${
                        confirmPassword && !passwordsMatch
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                          : confirmPassword && passwordsMatch
                            ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                            : 'border-gray-200 focus:border-gray-400'
                      }`}
                      placeholder="Digite a senha novamente"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 sm:pr-3.5 flex items-center text-gray-400 hover:text-gray-600 outline-none"
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={16} className="sm:w-[18px] sm:h-[18px]" />
                      ) : (
                        <Eye size={16} className="sm:w-[18px] sm:h-[18px]" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] sm:text-xs font-medium text-gray-700 mb-1">
                    Nome da Organização/Fazenda <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 sm:pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Building2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </div>
                    <input
                      type="text"
                      value={organizationName}
                      onChange={e => setOrganizationName(e.target.value)}
                      className="block w-full pl-10 sm:pl-11 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all outline-none"
                      placeholder="Ex: Fazenda Santa Rita"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={
                isSubmitting ||
                isOAuthLoading !== null ||
                (isSignup &&
                  (!passwordsMatch || !passwordLengthValid || !name.trim() || !phone.trim() || !validatePhone(phone)))
              }
              className="w-full flex items-center justify-center py-2.5 px-4 bg-zinc-900 text-white rounded-lg hover:bg-black transition-colors font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>{isSignup ? 'Cadastrar' : 'Entrar'}</span>
                  <ArrowRight size={16} className="ml-2" />
                </>
              )}
            </button>

            {/* MENSAGEM DE ERRO */}
            {loginError && (
              <div className="text-red-600 text-center text-xs font-medium bg-red-50 border border-red-200 rounded-lg py-2.5 px-3">
                {loginError}
              </div>
            )}

            {/* Link Esqueci minha senha - apenas no modo login */}
            {!isSignup && onForgotPassword && (
              <div className="text-center mt-1.5">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-[11px] sm:text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
            )}
          </form>

          {!isSignup && (
            <>
              {/* OAuth Divider */}
              <div className="relative my-3 sm:my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs sm:text-sm">
                  <span className="px-3 bg-white text-gray-400">ou continue com</span>
                </div>
              </div>

              {/* Google Button — visually present but functionally disabled */}
              <div title="Função desabilitada temporariamente" className="w-full">
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-200 rounded-lg cursor-not-allowed font-medium text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-80"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continuar com Google</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer Hints */}
        <div className="mt-3 sm:mt-4 text-center text-[11px] sm:text-xs text-gray-400">
          {isSignup ? (
            <p>
              Já tem uma conta?{' '}
              <button onClick={() => setIsSignup(false)} className="text-gray-700 font-medium hover:underline">
                Faça login
              </button>
            </p>
          ) : (
            <p>
              Não tem uma conta?{' '}
              <button onClick={() => setIsSignup(true)} className="text-gray-700 font-medium hover:underline">
                Cadastre-se
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
