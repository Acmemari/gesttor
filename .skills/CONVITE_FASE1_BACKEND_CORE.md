# FASE 1 — Backend: Permitir Convite para Visitantes + Endpoint de Aceitação

> **Objetivo**: Modificar o backend para suportar dois cenários de convite:
> 1. Pessoa SEM conta → cria senha (fluxo atual, aprimorado)
> 2. Pessoa COM conta visitante → aceita promoção sem criar nova senha
>
> **Complexidade**: Média | **Risco**: Baixo (apenas adiciona, não remove lógica existente)

---

## CONTEXTO OBRIGATÓRIO — Leia antes de começar

### Arquivos que você VAI modificar
| Arquivo | O que fazer |
|---|---|
| `api/invite.ts` | Remover bloqueio de userId, adicionar handler `accept`, adicionar campo `inviteType` |
| `api/_lib/auth.ts` | Extrair lógica de credenciais para função reutilizável |
| `src/DB/schema.ts` | Adicionar campo `inviteType` na tabela `people` |
| `lib/email-templates/invite-upgrade.html` | CRIAR — template de email para visitantes |

### Arquivos que você NÃO deve modificar nesta fase
- `components/ConvitePage.tsx` → será modificado na FASE 2
- `agents/PeopleManagement.tsx` → será modificado na FASE 3
- `lib/api/pessoasClient.ts` → será modificado na FASE 2

---

## PASSO 1 — Adicionar campo `inviteType` no schema

**Arquivo**: `src/DB/schema.ts`

Na definição da tabela `people`, localizar a seção de campos de convite (inviteToken, inviteStatus, etc.) e adicionar:

```typescript
inviteType: text('invite_type').default('new_account'),
```

Posicionar DEPOIS de `inviteRole` e ANTES de `inviteExpiresAt`.

### Valores possíveis
- `'new_account'` — pessoa não tem conta, precisa criar senha
- `'upgrade'` — pessoa já tem conta visitante, só precisa aceitar

### ALERTA — Após modificar schema.ts
Será necessário rodar `npx drizzle-kit push` para aplicar a mudança no banco.
Este campo tem `default('new_account')` então NÃO quebra registros existentes.

---

## PASSO 2 — Criar função reutilizável `applyInviteCredentials`

**Arquivo**: `api/_lib/auth.ts`

Criar uma função exportada ANTES da configuração do `betterAuth` (antes do `export const auth = betterAuth({`).

Esta função será chamada em DOIS lugares:
1. No hook `user.create.after` (novo usuário via convite)
2. No novo endpoint `accept` do invite (visitante existente)

```typescript
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
 *  - NÃO toca em person_farms (já estão vinculados ao pessoaId)
 *  - NÃO toca em person_profiles (já estão vinculados ao pessoaId)
 *  - NÃO toca em person_permissions (já estão vinculados ao pessoaId)
 *  - Essas tabelas usam pessoaId, não userId. Quando people.userId é preenchido,
 *    o sistema já consegue resolver as permissões via pessoaId.
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
```

### IMPORTANTE — Refatorar o hook existente

No hook `user.create.after` (linhas ~217-248 de auth.ts), SUBSTITUIR toda a lógica de aplicação de convite pela chamada:

```typescript
if (invitePerson && invitePerson.inviteExpiresAt && invitePerson.inviteExpiresAt > now) {
  await applyInviteCredentials(user.id, invitePerson);
}
```

### NÃO FAÇA
- NÃO remova o bloco `else` que lida com pessoas sem convite (linhas ~249-270). Esse bloco vincula people.userId quando alguém se cadastra sem convite mas tem email igual — deve continuar funcionando.
- NÃO altere a lógica de criação do user_profiles (linhas ~187-198). Isso deve continuar criando o perfil com role='visitante' por padrão.

---

## PASSO 3 — Modificar `api/invite.ts` — POST (envio de convite)

### 3.1 Remover bloqueio absoluto de userId

**ANTES** (linha 139):
```typescript
if (person.userId) return jsonError(res, 'Pessoa já possui conta ativa', { code: 'VALIDATION', status: 400 });
```

**DEPOIS** — substituir por lógica condicional:
```typescript
// Determinar tipo de convite
let inviteType: 'new_account' | 'upgrade' = 'new_account';

if (person.userId) {
  // Pessoa já tem conta — verificar se é visitante
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

  // É visitante — permitir convite de upgrade
  inviteType = 'upgrade';
}
```

### 3.2 Adicionar import de `userProfiles`

No topo de `api/invite.ts`, adicionar `userProfiles` ao import do schema:

```typescript
import { people, organizations, organizationAnalysts, userProfiles } from '../src/DB/schema.js';
```

### 3.3 Salvar inviteType no banco

No `db.update(people).set({...})` (linhas 172-182), adicionar o campo:

```typescript
await db
  .update(people)
  .set({
    inviteToken: token,
    inviteStatus: 'pending',
    inviteRole,
    inviteType,  // ← ADICIONAR
    inviteExpiresAt: expiresAt,
    inviteSentAt: new Date(),
    updatedAt: new Date(),
  })
  .where(eq(people.id, pessoaId));
```

### 3.4 Usar template de email diferente para upgrade

Adicionar função para template de upgrade (logo após `getInviteHtml`):

```typescript
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
```

### 3.5 Modificar envio de email

Substituir o bloco de envio (linhas 184-199):

```typescript
const appUrl = process.env.BETTER_AUTH_URL ?? process.env.VITE_APP_URL ?? 'https://gesttor.app';
const inviteUrl = `${appUrl}/convite?token=${token}`;

const html = inviteType === 'upgrade'
  ? getUpgradeHtml(inviteUrl, person.fullName, orgName, inviteRole === 'analista' ? 'Analista' : 'Cliente')
  : getInviteHtml(inviteUrl, person.fullName, orgName);

const subject = inviteType === 'upgrade'
  ? `Você foi adicionado à ${orgName} no Gesttor`
  : `Você foi convidado para o Gesttor — ${orgName}`;

void getResend().emails.send({
  from: 'Gesttor <gesttor@gesttor.app>',
  to: person.email,
  subject,
  html,
}).then((result) => {
  if (result.error) console.error('[invite] Erro ao enviar email:', result.error);
  else console.log(`[invite] Email de ${inviteType} enviado para`, person.email);
}).catch((err) => {
  console.error('[invite] Falha ao enviar email:', err);
});

return jsonSuccess(res, { ok: true, email: person.email, inviteRole, inviteType, expiresAt });
```

---

## PASSO 4 — Modificar `api/invite.ts` — GET (validação de token)

Modificar a resposta do `handleGetToken` para incluir `inviteType`:

**ANTES**:
```typescript
return jsonSuccess(res, {
  valid: true,
  name: person.fullName,
  email: person.email,
  role: person.inviteRole,
});
```

**DEPOIS** — adicionar campos:
```typescript
// Adicionar inviteType ao select (junto com os outros campos)
// No .select({...}), adicionar:
//   inviteType: people.inviteType,

return jsonSuccess(res, {
  valid: true,
  name: person.fullName,
  email: person.email,
  role: person.inviteRole,
  inviteType: person.inviteType ?? 'new_account',
  hasAccount: !!person.userId,
});
```

Lembrar de adicionar `inviteType` e `userId` ao `.select()` da query do handleGetToken.

---

## PASSO 5 — Novo handler: POST aceitação de convite (upgrade)

Adicionar no `handler` principal, ANTES do `return jsonError 405`:

```typescript
// POST com action='accept' — visitante aceita promoção
if (req.method === 'POST' && req.body?.action === 'accept') return handleAcceptUpgrade(req, res);
```

### Nova função `handleAcceptUpgrade`:

```typescript
async function handleAcceptUpgrade(req: VercelRequest, res: VercelResponse) {
  // IMPORTANTE: Requer autenticação — o visitante precisa estar logado
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

  // SEGURANÇA: Verificar que o token pertence ao userId autenticado
  // O userId do people deve ser o mesmo do usuário logado
  if (person.userId && person.userId !== userId) {
    return jsonError(res, 'Este convite não pertence à sua conta', { code: 'FORBIDDEN', status: 403 });
  }

  // Se a pessoa não tem userId, vincular ao usuário logado
  // (caso edge: visitante que se cadastrou com email diferente)
  if (!person.userId) {
    await db
      .update(people)
      .set({ userId, updatedAt: new Date() })
      .where(eq(people.id, person.id));
    person.userId = userId;
  }

  // Importar e chamar a função de aplicação de credenciais
  const { applyInviteCredentials } = await import('./_lib/auth.js');
  await applyInviteCredentials(userId, person);

  return jsonSuccess(res, {
    ok: true,
    role: person.inviteRole,
    message: 'Convite aceito com sucesso',
  });
}
```

### IMPORTANTE — Ordem no handler principal

O handler principal deve ficar:
```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') return handleGetToken(req, res);

  if (req.method === 'POST') {
    // action='accept' → visitante aceita upgrade
    if (req.body?.action === 'accept') return handleAcceptUpgrade(req, res);
    // default POST → enviar convite
    return handleSendInvite(req, res);
  }

  return jsonError(res, 'Método não permitido', { status: 405 });
}
```

---

## PASSO 6 — Criar template de email para upgrade

**Arquivo NOVO**: `lib/email-templates/invite-upgrade.html`

Copiar o template `lib/email-templates/invite.html` existente como base e modificar:
- Título: "Você foi adicionado à {{ORG_NAME}}"
- Texto: "Como você já possui uma conta no Gesttor, basta aceitar o convite..."
- Botão: "Aceitar convite" (em vez de "Criar minha senha")
- Manter placeholders: `{{NAME}}`, `{{ORG_NAME}}`, `{{INVITE_URL}}`, `{{ROLE_NAME}}`

---

## CHECKLIST DE VALIDAÇÃO — FASE 1

Antes de considerar a fase 1 completa, verificar:

- [ ] `npx drizzle-kit push` executado sem erros após adicionar `inviteType`
- [ ] POST `/api/invite` com pessoaId de pessoa SEM conta → funciona como antes (inviteType='new_account')
- [ ] POST `/api/invite` com pessoaId de pessoa COM conta visitante → retorna ok com inviteType='upgrade'
- [ ] POST `/api/invite` com pessoaId de pessoa COM conta ativa (não visitante) → retorna erro 400
- [ ] GET `/api/invite?token=xxx` retorna `inviteType` e `hasAccount` na resposta
- [ ] POST `/api/invite` com `{ action: 'accept', token }` → aplica credenciais ao visitante logado
- [ ] POST `/api/invite` com `{ action: 'accept', token }` sem autenticação → retorna 401
- [ ] POST `/api/invite` com `{ action: 'accept', token }` com userId diferente → retorna 403
- [ ] Hook `user.create.after` continua funcionando para novos signups via convite
- [ ] Signup normal (sem convite) continua funcionando

---

## RISCOS E ARMADILHAS

### NÃO FAÇA — Coisas que quebram a aplicação

1. **NÃO remova o `isNotNull(people.inviteExpiresAt)` das queries** — sem isso, convites sem data de expiração seriam considerados válidos
2. **NÃO esqueça de exportar `applyInviteCredentials`** — o endpoint accept precisa importá-la
3. **NÃO altere a ordem dos hooks do Better Auth** — o hook `session.create.after` deve ficar intacto
4. **NÃO use `await` no envio de email** — é `void` de propósito para não bloquear a resposta (timing attack prevention)
5. **NÃO modifique `person_farms`, `person_profiles` ou `person_permissions`** durante o aceite — essas tabelas são indexadas por `pessoaId`, não por `userId`. O sistema já resolve permissões via `people.userId` → `pessoaId`
6. **NÃO faça drizzle-kit push em produção** sem testar em desenvolvimento primeiro

### CUIDADOS

1. **Import circular**: `handleAcceptUpgrade` importa `applyInviteCredentials` de `_lib/auth.ts`. Usar `await import()` dinâmico para evitar circular dependency
2. **Race condition**: Se dois requests de accept chegarem simultaneamente, o segundo falhará porque `inviteToken` já foi setado para null. Isso é o comportamento esperado (fail safe)
3. **Email não enviado**: O Resend pode falhar silenciosamente. O convite fica como 'pending' no banco — o admin pode reenviar
