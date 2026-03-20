import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION } from '../src/version';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const SignInPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (!result.success) {
      setError(result.error ?? 'senha errada');
      setLoading(false);
    } else {
      window.location.replace('/');
    }
  };

  return (
    <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Gesttor</h1>
          <p className="text-ai-subtext text-sm mt-1">Calculadora de resultados para a pecuária</p>
          <p className="text-ai-subtext text-xs mt-0.5 font-medium tracking-wide">v{APP_VERSION} SaaS</p>
        </div>

        <div className="bg-ai-surface border border-ai-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5">Entrar na sua conta</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-sm text-ai-subtext mb-1">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-ai-bg border border-ai-border rounded-lg px-3 py-2 text-sm outline-none focus:border-ai-accent transition"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm text-ai-subtext">Senha</label>
                <a
                  href="/forgot-password"
                  className="text-xs text-ai-accent hover:underline"
                  tabIndex={-1}
                >
                  Esqueci minha senha
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-ai-bg border border-ai-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-ai-accent transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ai-subtext hover:text-ai-text transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ai-accent text-white rounded-lg py-2.5 text-sm font-medium hover:bg-ai-accentHover transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-sm text-ai-subtext mt-4">
            Não tem conta?{' '}
            <a href="/sign-up" className="text-ai-accent hover:underline">Cadastre-se</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
