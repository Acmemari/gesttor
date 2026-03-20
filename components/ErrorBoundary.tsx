import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '../lib/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught error', error, {
      component: 'ErrorBoundary',
      componentStack: errorInfo.componentStack || '',
    });

    // Chamar callback de erro se fornecido
    this.props.onError?.(error, errorInfo);

    // Incrementar contador e verificar loop infinito
    this.setState(
      prev => ({
        errorCount: prev.errorCount + 1,
      }),
      () => {
        if (this.state.errorCount > 5) {
          logger.error('Too many errors detected, resetting app state', undefined, {
            component: 'ErrorBoundary',
            errorCount: this.state.errorCount,
          });

          // Limpar apenas dados da aplicação, não todo o localStorage
          setTimeout(() => {
            try {
              const keysToRemove = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('sb-') || key.startsWith('gesttor-') || key.startsWith('pecuaria-'))) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach(k => localStorage.removeItem(k));
            } catch {
              /* ignore storage errors */
            }
            window.location.href = '/';
          }, 2000);
        }
      },
    );
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDevelopment = import.meta.env?.DEV === true;
      const tooManyErrors = this.state.errorCount > 5;

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-ai-surface">
          <div className="bg-white rounded-xl border border-ai-border shadow-sm p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-rose-500" />
              <h2 className="text-lg font-semibold text-ai-text">
                {tooManyErrors ? 'Erro Crítico' : 'Algo deu errado'}
              </h2>
            </div>

            <p className="text-sm text-ai-subtext mb-6">
              {tooManyErrors
                ? 'Detectamos múltiplos erros. A aplicação será reiniciada em breve...'
                : 'Ocorreu um erro inesperado. Por favor, tente recarregar a página ou entre em contato com o suporte se o problema persistir.'}
            </p>

            {this.state.error && (isDevelopment || !tooManyErrors) && (
              <details className="mb-4">
                <summary className="text-xs text-ai-subtext cursor-pointer mb-2">
                  Detalhes do erro {isDevelopment && '(desenvolvimento)'}
                </summary>
                <pre className="text-xs bg-ai-surface p-3 rounded border border-ai-border overflow-auto max-h-32">
                  {this.state.error.toString()}
                  {isDevelopment && this.state.error.stack && (
                    <>
                      {'\n\n'}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}

            {!tooManyErrors && (
              <div className="flex gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-ai-text text-white rounded-lg hover:bg-black transition-colors font-medium text-sm"
                >
                  <RefreshCw size={16} />
                  Tentar novamente
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
                >
                  <Home size={16} />
                  Ir para Início
                </button>
              </div>
            )}

            {tooManyErrors && (
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ai-text mx-auto"></div>
                <p className="text-xs text-ai-subtext mt-2">Reiniciando...</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
