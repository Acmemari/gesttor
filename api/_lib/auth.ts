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
import { baUser, baSession, baAccount, baVerification, baRateLimit, userProfiles, people, organizations } from '../../src/DB/schema.js';

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
    // Tentar múltiplos caminhos (process.cwd() pode variar em serverless)
    const possiblePaths = [
      path.resolve(process.cwd(), 'lib/email-templates/reset-password.html'),
      path.resolve(__dirname, '../../lib/email-templates/reset-password.html'),
      path.resolve('/var/task', 'lib/email-templates/reset-password.html'),
    ];

    for (const p of possiblePaths) {
      try {
        _emailTemplate = fs.readFileSync(p, 'utf-8');
        break;
      } catch {
        // Tentar próximo caminho
      }
    }

    if (!_emailTemplate) {
      console.warn('[auth] Template de reset não encontrado, usando fallback inline');
      // Fallback inline
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

// ── applyInviteCredentials ────────────────────────────────────────────────────

/**
 * Aplica as credenciais do convite ao user_profiles.
 * Chamado tanto no signup de novo usuário quanto na aceitação por visitante.
 *
 * O que faz:
 *  - Atualiza user_profiles.role com o inviteRole
 *  - Atualiza user_profiles.organizationId (se cliente)
 *  - Sincroniza phone/foto de people → user_profiles
 *  - Vincula people.userId ao usuário
 *  - Marca convite como aceito (inviteStatus='accepted', inviteToken=null)
 *
 * O que NÃO faz (e NÃO deve fazer):
 *  - NÃO toca em person_farms, person_profiles, person_permissions
 *    (essas tabelas usam pessoaId, não userId)
 */
export async function applyInviteCredentials(
  userId: string,
  invitePerson: typeof people.$inferSelect,
): Promise<void> {
  const { eq } = await import('drizzle-orm');
  const inviteRole = invitePerson.inviteRole ?? 'visitante';

  // 1. Atualizar role e organização no user_profiles
  await db
    .update(userProfiles)
    .set({
      role: inviteRole,
      organizationId: inviteRole === 'cliente' ? invitePerson.organizationId : null,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.id, userId));

  // 2. Vincular people → user e marcar convite como aceito
  await db
    .update(people)
    .set({
      userId: userId,
      inviteStatus: 'accepted',
      inviteToken: null,
      updatedAt: new Date(),
    })
    .where(eq(people.id, invitePerson.id));

  // 3. Sincronizar phone/foto de people → user_profiles
  const syncFields: Record<string, unknown> = { updatedAt: new Date() };
  if (invitePerson.phoneWhatsapp) syncFields.phone = invitePerson.phoneWhatsapp;
  if (invitePerson.photoUrl) {
    syncFields.imageUrl = invitePerson.photoUrl;
    syncFields.avatar = invitePerson.photoUrl;
  }
  if (Object.keys(syncFields).length > 1) {
    await db.update(userProfiles).set(syncFields).where(eq(userProfiles.id, userId));
  }

  console.log(`[invite] Credenciais aplicadas: role=${inviteRole} userId=${userId} pessoaId=${invitePerson.id}`);
}

// ── Better Auth ────────────────────────────────────────────────────────────────

export const auth = betterAuth({
  secret: (() => {
    const s = process.env.BETTER_AUTH_SECRET;
    if (s) return s;
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      throw new Error('[auth] BETTER_AUTH_SECRET não configurado em produção');
    }
    return 'dev-insecure-secret-change-me';
  })(),
  baseURL: (() => {
    // Em produção (Vercel), priorizar VERCEL_URL para evitar localhost em links de email
    if (process.env.VERCEL_URL) {
      return process.env.BETTER_AUTH_URL?.startsWith('https://')
        ? process.env.BETTER_AUTH_URL
        : `https://${process.env.VERCEL_URL}`;
    }
    return process.env.BETTER_AUTH_URL ?? 'http://localhost:3333';
  })(),
  basePath: '/api/auth',

  // Passamos schema explicitamente para que o adapter NÃO acesse db._ no import
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: baUser,
      session: baSession,
      account: baAccount,
      verification: baVerification,
      rateLimit: baRateLimit,
    },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 3600, // 1 hora
    revokeSessionsOnPasswordReset: true,

    // Callback de envio de email de recuperação de senha via Resend
    // Better Auth já trata timing attacks via runInBackgroundOrAwait — await aqui é seguro
    sendResetPassword: async ({ user, url }) => {
      const resend = getResend();
      const html = getResetPasswordHtml(url, user.name);

      const result = await resend.emails.send({
        from: 'Gesttor <gesttor@gesttor.app>',
        to: user.email,
        subject: 'Redefinir Senha — Gesttor',
        html,
      });

      if (result.error) {
        console.error('[auth] Erro ao enviar email de reset:', result.error);
        throw new Error(`Falha ao enviar email: ${result.error.message}`);
      }

      console.log('[auth] Email de reset enviado para', user.email);
    },

    onPasswordReset: async ({ user }) => {
      console.log('[auth] Senha redefinida com sucesso');
    },

    password: {
      hash: async (password: string) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        bcrypt.compare(password, hash),
    },
  },

  plugins: [bearer()],

  rateLimit: {
    enabled: true,
    window: 60,  // 60 segundos
    max: 100,    // limite global (maioria das rotas)
    storage: 'database',
    customRules: {
      '/sign-in/email':          { window: 60,  max: 5  }, // 5 tentativas/min por IP
      '/sign-up/email':          { window: 60,  max: 5  }, // 5 cadastros/min por IP
      '/request-password-reset': { window: 900, max: 3  }, // 3 resets por 15 min por IP
      '/reset-password':         { window: 60,  max: 5  },
    },
  },

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

            // Verificar convite pendente e aplicar role/org corretos
            try {
              const { isNull, and, gt, isNotNull } = await import('drizzle-orm');
              const now = new Date();
              const [invitePerson] = await db
                .select()
                .from(people)
                .where(
                  and(
                    eq(people.email, user.email),
                    eq(people.inviteStatus, 'pending'),
                    isNotNull(people.inviteExpiresAt),
                  ),
                )
                .limit(1);

              if (invitePerson && invitePerson.inviteExpiresAt && invitePerson.inviteExpiresAt > now) {
                await applyInviteCredentials(user.id, invitePerson);
              } else {
                // Sem convite: buscar people pelo email para obter phone/foto antes de vincular
                const linkedPeople = await db
                  .select()
                  .from(people)
                  .where(and(eq(people.email, user.email), isNull(people.userId)));

                if (linkedPeople.length > 0) {
                  await db
                    .update(people)
                    .set({ userId: user.id, updatedAt: new Date() })
                    .where(and(eq(people.email, user.email), isNull(people.userId)));

                  // Copiar phone/foto do primeiro registro people → user_profiles
                  const source = linkedPeople[0];
                  const syncFields: Record<string, unknown> = { updatedAt: new Date() };
                  if (source.phoneWhatsapp) syncFields.phone = source.phoneWhatsapp;
                  if (source.photoUrl) { syncFields.imageUrl = source.photoUrl; syncFields.avatar = source.photoUrl; }
                  if (Object.keys(syncFields).length > 1) {
                    await db.update(userProfiles).set(syncFields).where(eq(userProfiles.id, user.id));
                  }
                }
              }
            } catch (linkErr) {
              console.error('[auth] Erro ao vincular people ao novo usuário:', linkErr);
            }
          } catch (err) {
            console.error('[auth] Erro ao criar user_profiles após signup:', err);
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          try {
            const { eq } = await import('drizzle-orm');
            await db
              .update(userProfiles)
              .set({ lastLogin: new Date() })
              .where(eq(userProfiles.id, session.userId));
          } catch (err) {
            console.error('[auth] Erro ao atualizar last_login:', err);
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
