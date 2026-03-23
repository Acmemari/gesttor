/**
 * Better Auth — instância do servidor.
 * Usado pelo handler catch-all (/api/auth/*) e pelo betterAuthAdapter.ts.
 *
 * Estratégia de sessão: bearer token (compatível com Authorization: Bearer existente).
 * Hash de senha: bcrypt (compatível com hashes legados em user_profiles.password_hash).
 *
 * LAZY POOL: A conexão com o banco é criada na PRIMEIRA QUERY, não no import.
 * Isso resolve o problema de hoisting ESM onde o módulo é avaliado antes de
 * dotenv.config() carregar DATABASE_URL.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import bcrypt from 'bcrypt';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import { db } from '../../src/DB/index.js';
import { baUser, baSession, baAccount, baVerification, userProfiles } from '../../src/DB/schema.js';

if (!process.env.BETTER_AUTH_SECRET) {
  console.warn('[auth] BETTER_AUTH_SECRET não configurado — usando valor temporário inseguro');
}

// ── Resend (lazy — evita falha se RESEND_API_KEY não estiver definido) ────────

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('[auth] RESEND_API_KEY não está definido. Verifique .env / .env.local');
    }
    _resend = new Resend(key);
  }
  return _resend;
}

// ── Template de email (carregado uma vez, cacheado) ───────────────────────────

let _emailTemplate: string | null = null;

function getResetPasswordHtml(resetUrl: string, userName?: string): string {
  if (!_emailTemplate) {
    try {
      const templatePath = path.resolve(process.cwd(), 'lib/email-templates/reset-password.html');
      _emailTemplate = fs.readFileSync(templatePath, 'utf-8');
    } catch {
      // Fallback se o arquivo não existir
      _emailTemplate = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
          <h1 style="color:#1f1f1f;">Gesttor</h1>
          <p>Olá{{GREETING}},</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
          <p style="text-align:center;margin:32px 0;">
            <a href="{{URL}}" style="background:#1f1f1f;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Redefinir Senha</a>
          </p>
          <p style="font-size:12px;color:#666;">Se você não solicitou esta redefinição, ignore este email.</p>
          <p style="font-size:12px;color:#666;">Este link expira em 1 hora.</p>
        </div>`;
    }
  }

  const greeting = userName ? ` ${userName}` : '';
  return _emailTemplate
    .replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, resetUrl)
    .replace(/\{\{URL\}\}/g, resetUrl)
    .replace(/\{\{GREETING\}\}/g, greeting);
}

// ── Better Auth ────────────────────────────────────────────────────────────────

// ── Better Auth ────────────────────────────────────────────────────────────────

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-insecure-secret-change-me',
  baseURL: process.env.BETTER_AUTH_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3333'),
  basePath: '/api/auth',

  // Passamos schema explicitamente para que o adapter NÃO acesse db._ no import
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: baUser,
      session: baSession,
      account: baAccount,
      verification: baVerification,
    },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 3600, // 1 hora
    revokeSessionsOnPasswordReset: true,

    // Callback de envio de email de recuperação de senha via Resend
    sendResetPassword: async ({ user, url }) => {
      try {
        const resend = getResend();
        const html = getResetPasswordHtml(url, user.name);

        // Não usar await para evitar timing attacks (conforme recomendação Better Auth)
        void resend.emails.send({
          from: 'Gesttor <gesttor@gesttor.app>',
          to: user.email,
          subject: 'Redefinir Senha — Gesttor',
          html,
        }).then((result) => {
          if (result.error) {
            console.error('[auth] Erro ao enviar email de reset:', result.error);
          } else {
            console.log('[auth] Email de reset enviado para:', user.email);
          }
        }).catch((err) => {
          console.error('[auth] Erro ao enviar email de reset:', err);
        });
      } catch (err) {
        console.error('[auth] Erro ao preparar email de reset:', err);
      }
    },

    onPasswordReset: async ({ user }) => {
      console.log(`[auth] Senha redefinida com sucesso para: ${user.email}`);
    },

    password: {
      hash: async (password: string) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        bcrypt.compare(password, hash),
    },
  },

  plugins: [bearer()],

  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3013',
    'http://localhost:3004',
    'http://localhost:3014',
    'http://localhost:3333',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.VITE_APP_URL ? [process.env.VITE_APP_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const { eq } = await import('drizzle-orm');
            const existing = await db
              .select({ id: userProfiles.id })
              .from(userProfiles)
              .where(eq(userProfiles.id, user.id))
              .limit(1);

            if (existing.length === 0) {
              await db.insert(userProfiles).values({
                id: user.id,
                email: user.email,
                name: user.name ?? user.email.split('@')[0],
                role: 'visitante',
                status: 'active',
                ativo: true,
                avatar: (user.name ?? user.email).charAt(0).toUpperCase(),
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            }
          } catch (err) {
            console.error('[auth] Erro ao criar user_profiles após signup:', err);
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
