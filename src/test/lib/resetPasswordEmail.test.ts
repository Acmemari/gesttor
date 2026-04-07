import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildPasswordResetLink } from '../../../api/_lib/publicAppUrl';
import { applyResetPasswordTemplate } from '../../../api/_lib/resetPasswordEmail';

describe('reset password email template', () => {
  it('renders the direct app reset link instead of a vercel preview URL', () => {
    const templatePath = path.resolve(process.cwd(), 'lib/email-templates/reset-password.html');
    const template = fs.readFileSync(templatePath, 'utf-8');
    const resetLink = buildPasswordResetLink('reset-token-123', {
      APP_PUBLIC_URL: 'https://gesttor.app',
      VERCEL_URL: 'pecuaria-red.vercel.app',
    } as NodeJS.ProcessEnv);

    const html = applyResetPasswordTemplate(template, resetLink, 'Maria');

    expect(html).toContain('https://gesttor.app/reset-password?token=reset-token-123');
    expect(html).not.toContain('https://pecuaria-red.vercel.app');
    expect(html).toContain('Redefinir Senha');
  });
});
