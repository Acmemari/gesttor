import { describe, expect, it } from 'vitest';
import { buildPasswordResetLink, resolveAuthBaseUrl, resolvePublicAppUrl } from '../../../api/_lib/publicAppUrl';

describe('publicAppUrl helpers', () => {
  it('prefers APP_PUBLIC_URL over VERCEL_URL', () => {
    const env = {
      APP_PUBLIC_URL: 'https://gesttor.app',
      VERCEL_URL: 'pecuaria-red.vercel.app',
    } as NodeJS.ProcessEnv;

    expect(resolvePublicAppUrl(env)).toBe('https://gesttor.app');
  });

  it('falls back through the expected env precedence', () => {
    expect(resolvePublicAppUrl({
      VITE_APP_URL: 'https://staging.gesttor.app',
      BETTER_AUTH_URL: 'https://auth.gesttor.app',
    } as NodeJS.ProcessEnv)).toBe('https://staging.gesttor.app');

    expect(resolvePublicAppUrl({
      BETTER_AUTH_URL: 'https://auth.gesttor.app',
    } as NodeJS.ProcessEnv)).toBe('https://auth.gesttor.app');

    expect(resolvePublicAppUrl({
      VERCEL_URL: 'pecuaria-red.vercel.app',
    } as NodeJS.ProcessEnv)).toBe('https://pecuaria-red.vercel.app');
  });

  it('builds a direct reset-password link on the app domain', () => {
    const env = {
      APP_PUBLIC_URL: 'https://gesttor.app',
      VERCEL_URL: 'pecuaria-red.vercel.app',
    } as NodeJS.ProcessEnv;

    expect(buildPasswordResetLink('reset-token-123', env)).toBe(
      'https://gesttor.app/reset-password?token=reset-token-123',
    );
  });

  it('keeps localhost auth base fallback in non-production without explicit env', () => {
    expect(resolveAuthBaseUrl({
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv)).toBe('http://localhost:3333');
  });
});
