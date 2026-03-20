/**
 * Validação centralizada de variáveis de ambiente.
 * Garante que todas as variáveis obrigatórias estão presentes.
 */

interface EnvConfig {
  VITE_B2_ENDPOINT: string;
  VITE_B2_REGION: string;
  VITE_B2_BUCKET: string;
  VITE_B2_KEY_ID: string;
  VITE_B2_APP_KEY: string;
}

const requiredEnvVars = [
  'VITE_B2_ENDPOINT',
  'VITE_B2_REGION',
  'VITE_B2_BUCKET',
  'VITE_B2_KEY_ID',
  'VITE_B2_APP_KEY',
] as const;

let _cachedEnv: EnvConfig | null = null;

/**
 * Valida se todas as variáveis de ambiente obrigatórias estão definidas.
 * @throws {Error} Se alguma variável obrigatória estiver faltando
 */
export function validateEnv(): EnvConfig {
  if (_cachedEnv) return _cachedEnv;

  const missing: string[] = [];

  for (const varName of requiredEnvVars) {
    if (!import.meta.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias não encontradas: ${missing.join(', ')}\n` +
        'Por favor, crie um arquivo .env.local com as variáveis necessárias.\n' +
        'Veja .env.example para referência.',
    );
  }

  _cachedEnv = {
    VITE_B2_ENDPOINT: import.meta.env.VITE_B2_ENDPOINT,
    VITE_B2_REGION: import.meta.env.VITE_B2_REGION,
    VITE_B2_BUCKET: import.meta.env.VITE_B2_BUCKET,
    VITE_B2_KEY_ID: import.meta.env.VITE_B2_KEY_ID,
    VITE_B2_APP_KEY: import.meta.env.VITE_B2_APP_KEY,
  };

  return _cachedEnv;
}

/**
 * Obtém variáveis de ambiente com validação (resultado é cacheado).
 */
export function getEnv(): EnvConfig {
  return validateEnv();
}

/**
 * Obtém variável de ambiente de forma segura.
 * @param key Nome da variável
 * @param defaultValue Valor padrão se não encontrado
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key];
  if (!value && !defaultValue) {
    console.warn(`Variável de ambiente ${key} não encontrada`);
  }
  return value || defaultValue || '';
}
