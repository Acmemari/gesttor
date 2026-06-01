import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { logger } from './logger';

const RELOAD_FLAG = 'gesttor-chunk-reloaded';

/**
 * Versão de `React.lazy` resiliente a chunks obsoletos.
 *
 * Após um novo deploy, o navegador ainda pode ter o app antigo carregado,
 * que referencia hashes de chunk que não existem mais no CDN. Quando o
 * `import()` dinâmico falha por esse motivo, recarregamos a página uma única
 * vez para buscar o `index.html` novo (com os hashes atualizados).
 *
 * Um flag em `sessionStorage` evita loop infinito de reload caso a falha
 * seja por outro motivo (ex.: offline). Nesse caso o erro é propagado para
 * o ErrorBoundary normalmente.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const component = await factory();
      // Import OK: limpa o flag para permitir um novo reload em futuros deploys.
      window.sessionStorage.removeItem(RELOAD_FLAG);
      return component;
    } catch (error) {
      const alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG) === 'true';

      if (!alreadyReloaded) {
        logger.warn('Falha ao carregar chunk dinâmico, recarregando para buscar versão nova', {
          component: 'lazyWithRetry',
          error: error instanceof Error ? error.message : String(error),
        });
        window.sessionStorage.setItem(RELOAD_FLAG, 'true');
        window.location.reload();
        // Mantém o Suspense em loading enquanto a página recarrega.
        return new Promise<{ default: T }>(() => {});
      }

      // Já recarregamos e ainda falhou: propaga para o ErrorBoundary.
      throw error;
    }
  });
}
