const PRODUCTION_APP_URL = 'https://gesttor.app';
const LOCAL_AUTH_URL = 'http://localhost:3333';

function normalizeOrigin(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

export function resolvePublicAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const vercelDeploymentUrl = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();

  const candidates = [
    env.APP_PUBLIC_URL,
    env.VITE_APP_URL,
    env.BETTER_AUTH_URL,
    vercelEnv === 'production' ? PRODUCTION_APP_URL : undefined,
    vercelDeploymentUrl,
    PRODUCTION_APP_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeOrigin(candidate);
    if (normalized) return normalized;
  }

  return PRODUCTION_APP_URL;
}

export function resolveAuthBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const publicUrl = resolvePublicAppUrl(env);

  if (
    publicUrl === PRODUCTION_APP_URL &&
    !env.APP_PUBLIC_URL &&
    !env.VITE_APP_URL &&
    !env.BETTER_AUTH_URL &&
    !env.VERCEL_URL &&
    env.NODE_ENV !== 'production'
  ) {
    return LOCAL_AUTH_URL;
  }

  return publicUrl;
}

export function buildPasswordResetLink(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = resolvePublicAppUrl(env);
  const url = new URL('/reset-password', `${baseUrl}/`);
  url.searchParams.set('token', token);
  return url.toString();
}
