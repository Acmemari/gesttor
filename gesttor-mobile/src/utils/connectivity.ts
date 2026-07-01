import NetInfo from '@react-native-community/netinfo';

/**
 * Verifica se o dispositivo está conectado à internet
 */
export async function checkConnectivity(): Promise<boolean> {
  const state = await NetInfo.fetch();
  // Se isConnected for falso, definitivamente não há conexão.
  // isInternetReachable pode ser null em alguns simuladores, por isso usamos prioritariamente isConnected.
  return state.isConnected === true;
}

/**
 * Inscreve um callback para escutar mudanças no status de conectividade
 */
export function subscribeToConnectivity(callback: (isConnected: boolean) => void) {
  return NetInfo.addEventListener((state) => {
    callback(state.isConnected === true);
  });
}
