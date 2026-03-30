/**
 * API de convite de usuários.
 *
 * POST /api/invite   { pessoaId }        → gera token e envia email de convite
 * GET  /api/invite?token=xxx             → valida token e retorna dados pré-preenchidos (público)
 *
 * Regra de role:
 *  - Se pessoa está em organization_analysts → inviteRole = 'analista'
 *  - Caso contrário → inviteRole = 'cliente'
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { eq, and, gt, isNotNull } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '../src/DB/index.js';
import { people, organizations, organizationAnalysts, userProfiles } from '../src/DB/schema.js';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole } from './_lib/orgAccess.js';

// ── Resend (lazy) ────────────────────────────────────────────────────────────

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('[invite] RESEND_API_KEY não definido');
    _resend = new Resend(key);
  }
  return _resend;
}

// ── Email template ───────────────────────────────────────────────────────────

let _inviteTemplate: string | null = null;

function getInviteHtml(inviteUrl: string, userName: string, orgName: string): string {
  if (!_inviteTemplate) {
    try {
      const p = path.resolve(process.cwd(), 'lib/email-templates/invite.html');
      _inviteTemplate = fs.readFileSync(p, 'utf-8');
    } catch {
      _inviteTemplate = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
          <h1 style="color:#1f1f1f;">Gesttor</h1>
          <p>Olá {{NAME}},</p>
          <p>Você foi adicionado(a) à organização <strong>{{ORG_NAME}}</strong> no Gesttor.</p>
          <p style="text-align:center;margin:32px 0;">
            <a href="{{INVITE_URL}}" style="background:#1f1f1f;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Criar minha senha</a>
          </p>
          <p style="font-size:12px;color:#666;">Este link expira em 72 horas.</p>
        </div>`;
    }
  }
  return _inviteTemplate
    .replace(/\{\{NAME\}\}/g, userName)
    .replace(/\{\{ORG_NAME\}\}/g, orgName)
    .replace(/\{\{INVITE_URL\}\}/g, inviteUrl);
}

let _upgradeTemplate: string | null = null;

function getUpgradeHtml(inviteUrl: string, userName: string, orgName: string, roleName: string): string {
  if (!_upgradeTemplate) {
    try {
      const p = path.resolve(process.cwd(), 'lib/email-templates/invite-upgrade.html');
      _upgradeTemplate = fs.readFileSync(p, 'utf-8');
    } catch {
      _upgradeTemplate = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
          <h1 style="color:#1f1f1f;">Gesttor</h1>
          <p>Olá {{NAME}},</p>
          <p>Você foi adicionado(a) à organização <strong>{{ORG_NAME}}</strong> como <strong>{{ROLE_NAME}}</strong> no Gesttor.</p>
          <p>Como você já possui uma conta, basta aceitar o convite para acessar todos os recursos.</p>
          <p style="text-align:center;margin:32px 0;">
            <a href="{{INVITE_URL}}" style="background:#1f1f1f;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Aceitar convite</a>
          </p>
          <p style="font-size:12px;color:#666;">Este link expira em 72 horas.</p>
        </div>`;
    }
  }
  return _upgradeTemplate
    .replace(/\{\{NAME\}\}/g, userName)
    .replace(/\{\{ORG_NAME\}\}/g, orgName)
    .replace(/\{\{ROLE_NAME\}\}/g, roleName)
    .replace(/\{\{INVITE_URL\}\}/g, inviteUrl);
}

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') return handleGetToken(req, res);

  if (req.method === 'POST') {
    if (req.body?.action === 'accept') return handleAcceptUpgrade(req, res);
    return handleSendInvite(req, res);
  }

  return jsonError(res, 'Método não permitido', { status: 405 });
}

// ── GET /api/invite?token=xxx ─────────────────────────────────────────────────

async function handleGetToken(req: VercelRequest, res: VercelResponse) {
  const token = req.query.token as string | undefined;
  if (!token) return jsonError(res, 'Token obrigatório', { code: 'VALIDATION', status: 400 });

  const now = new Date();
  const [person] = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      email: people.email,
      inviteRole: people.inviteRole,
      inviteStatus: people.inviteStatus,
      inviteExpiresAt: people.inviteExpiresAt,
      inviteType: people.inviteType,
      userId: people.userId,
    })
    .from(people)
    .where(
      and(
        eq(people.inviteToken, token),
        eq(people.inviteStatus, 'pending'),
        isNotNull(people.inviteExpiresAt),
      ),
    )
    .limit(1);

  if (!person || !person.inviteExpiresAt || person.inviteExpiresAt <= now) {
    return jsonSuccess(res, { valid: false, reason: person ? 'expired' : 'not_found' });
  }

  return jsonSuccess(res, {
    valid: true,
    name: person.fullName,
    email: person.email,
    role: person.inviteRole,
    inviteType: person.inviteType ?? 'new_account',
    hasAccount: !!person.userId,
  });
}

// ── POST /api/invite ──────────────────────────────────────────────────────────

async function handleSendInvite(req: VercelRequest, res: VercelResponse) {
  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) return jsonError(res, 'Não autenticado', { code: 'AUTH_REQUIRED', status: 401 });

  const role = await getUserRole(userId);
  if (role !== 'administrador' && role !== 'analista') {
    return jsonError(res, 'Sem permissão para convidar usuários', { code: 'FORBIDDEN', status: 403 });
  }

  const { pessoaId } = req.body ?? {};
  if (!pessoaId) return jsonError(res, 'pessoaId obrigatório', { code: 'VALIDATION', status: 400 });

  // Buscar pessoa
  const [person] = await db
    .select()
    .from(people)
    .where(eq(people.id, pessoaId))
    .limit(1);

  if (!person) return jsonError(res, 'Pessoa não encontrada', { code: 'NOT_FOUND', status: 404 });
  if (!person.email) return jsonError(res, 'Pessoa sem email cadastrado', { code: 'VALIDATION', status: 400 });

  // Determinar tipo de convite
  let inviteType: 'new_account' | 'upgrade' = 'new_account';

  if (person.userId) {
    const [existingProfile] = await db
      .select({ role: userProfiles.role })
      .from(userProfiles)
      .where(eq(userProfiles.id, person.userId))
      .limit(1);

    if (!existingProfile) {
      return jsonError(res, 'Perfil de usuário não encontrado', { code: 'NOT_FOUND', status: 404 });
    }

    if (existingProfile.role !== 'visitante') {
      return jsonError(res, 'Pessoa já possui conta ativa com permissões', { code: 'VALIDATION', status: 400 });
    }

    inviteType = 'upgrade';
  }

  // Inferir role: analista se estiver em organization_analysts
  let inviteRole = 'cliente';
  if (person.organizationId) {
    const [analystLink] = await db
      .select({ id: organizationAnalysts.id })
      .from(organizationAnalysts)
      .where(
        and(
          eq(organizationAnalysts.organizationId, person.organizationId),
          eq(organizationAnalysts.analystId, person.id),
        ),
      )
      .limit(1);
    if (analystLink) inviteRole = 'analista';
  }

  // Buscar nome da organização para o email
  let orgName = 'sua organização';
  if (person.organizationId) {
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, person.organizationId))
      .limit(1);
    if (org) orgName = org.name;
  }

  // Gerar token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h

  await db
    .update(people)
    .set({
      inviteToken: token,
      inviteStatus: 'pending',
      inviteRole,
      inviteType,
      inviteExpiresAt: expiresAt,
      inviteSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(people.id, pessoaId));

  // Enviar email
  const appUrl = process.env.APP_PUBLIC_URL ?? process.env.VITE_APP_URL ?? 'https://gesttor.app';
  const inviteUrl = `${appUrl}/convite?token=${token}`;

  const html = inviteType === 'upgrade'
    ? getUpgradeHtml(inviteUrl, person.fullName, orgName, inviteRole === 'analista' ? 'Analista' : 'Cliente')
    : getInviteHtml(inviteUrl, person.fullName, orgName);

  const subject = inviteType === 'upgrade'
    ? `Você foi adicionado à ${orgName} no Gesttor`
    : `Você foi convidado para o Gesttor — ${orgName}`;

  const result = await getResend().emails.send({
    from: 'Gesttor <gesttor@gesttor.app>',
    to: person.email,
    subject,
    html,
  });

  if (result.error) {
    console.error('[invite] Erro ao enviar email:', result.error);
  } else {
    console.log(`[invite] Email de ${inviteType} enviado para`, person.email);
  }

  return jsonSuccess(res, { ok: true, email: person.email, inviteRole, inviteType, expiresAt });
}

// ── POST /api/invite { action: 'accept', token } ──────────────────────────────

async function handleAcceptUpgrade(req: VercelRequest, res: VercelResponse) {
  // Requer autenticação — o visitante precisa estar logado
  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) return jsonError(res, 'Não autenticado', { code: 'AUTH_REQUIRED', status: 401 });

  const { token } = req.body ?? {};
  if (!token) return jsonError(res, 'Token obrigatório', { code: 'VALIDATION', status: 400 });

  const now = new Date();
  const [person] = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.inviteToken, token),
        eq(people.inviteStatus, 'pending'),
        isNotNull(people.inviteExpiresAt),
      ),
    )
    .limit(1);

  if (!person || !person.inviteExpiresAt || person.inviteExpiresAt <= now) {
    return jsonError(res, 'Convite inválido ou expirado', { code: 'INVALID_TOKEN', status: 400 });
  }

  // Segurança: verificar que o token pertence ao userId autenticado
  if (person.userId && person.userId !== userId) {
    return jsonError(res, 'Este convite não pertence à sua conta', { code: 'FORBIDDEN', status: 403 });
  }

  // Se a pessoa não tem userId, vincular ao usuário logado
  if (!person.userId) {
    await db
      .update(people)
      .set({ userId, updatedAt: new Date() })
      .where(eq(people.id, person.id));
    person.userId = userId;
  }

  const { applyInviteCredentials } = await import('./_lib/auth.js');
  await applyInviteCredentials(userId, person);

  return jsonSuccess(res, {
    ok: true,
    role: person.inviteRole,
    message: 'Convite aceito com sucesso',
  });
}
