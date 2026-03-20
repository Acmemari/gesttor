/**
 * Hook centralizado de sessão.
 * Expõe sessionReady e getAccessToken() para componentes que fazem requisições ao backend.
 */
import { useAuth } from '../contexts/AuthContext';

export function useSession() {
  const auth = useAuth();
  return {
    ...auth,
    /** true quando a sessão foi restaurada/estabelecida — seguro para iniciar fetches */
    sessionReady: auth.sessionReady,
    /** Obtém o token JWT atual. Use antes de cada chamada à API Node. */
    getAccessToken: auth.getAccessToken,
  };
}
