import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION } from '../src/version';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const SignUpPage: React.FC = () => {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signup(email, password, name);
    if (!result.success) {
      setError(result.error ?? 'Erro ao criar conta');
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        window.location.replace('/sign-in');
      }, 2000);
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
          {success ? (
            <div className="text-center py-4">
              <p className="text-green-500 font-semibold text-base">Cadastro efetuado com sucesso!</p>
              <p className="text-ai-subtext text-sm mt-2">Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-5">Criar conta</h2>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm text-ai-subtext mb-1">Nome completo</label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-ai-bg border border-ai-border rounded-lg px-3 py-2 text-sm outline-none focus:border-ai-accent transition"
                    placeholder="Seu nome"
                  />
                </div>

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
                  <label htmlFor="password" className="block text-sm text-ai-subtext mb-1">Senha</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-ai-bg border border-ai-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-ai-accent transition"
                      placeholder="Mínimo 6 caracteres"
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
                  className="w-full bg-ai-accent text-white rounded-lg py-2.5 text-sm font-medium hover:bg-ai-accent/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? 'Criando conta...' : 'Criar conta'}
                </button>
              </form>

              <p className="text-center text-sm text-ai-subtext mt-4">
                Já tem conta?{' '}
                <a href="/sign-in" className="text-ai-accent hover:underline">Entrar</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
