# 04 - Ajuste do Fluxo de Convite de Usuarios

## Contexto

O sistema atual envia **todos** os convites para `/convite?token=xxx`, onde o `ConvitePage.tsx` trata ambos os fluxos (novo usuario e upgrade). O objetivo e:

1. **Novo usuario** (nao cadastrado) → link leva para a **tela de cadastro** (`LoginPage` aba "Cadastrar") com email e organizacao pre-preenchidos
2. **Usuario existente** (ja cadastrado) → link leva para a **tela de login** (`LoginPage` aba "Entrar") e, ao autenticar, as fazendas ja atribuidas sejam vinculadas automaticamente

---

## Diagnostico Completo do Estado Atual

### Fluxo Atual de Convite

```
Admin clica "Convidar" (PeopleManagement.tsx:565)
  -> POST /api/invite { pessoaId }
  -> Gera token 32-byte hex, salva no people (inviteToken, inviteStatus='pending')
  -> Envia email com link: /convite?token=xxx  (invite.ts:240)
  -> Usuario acessa /convite?token=xxx
  -> ConvitePage.tsx valida token via GET /api/invite?token=xxx
  -> Se new_account: mostra form com nome/email readonly + senha -> authClient.signUp.email()
  -> Se upgrade: mostra botao "Aceitar convite" -> acceptInvite(token)
```

### Problemas Identificados

| # | Problema | Arquivo | Linha |
|---|----------|---------|-------|
| 1 | Ambos os tipos de convite geram o mesmo link `/convite?token=xxx` | `api/invite.ts` | 240 |
| 2 | LoginPage **nao** le query params para pre-preencher campos | `components/LoginPage.tsx` | 14-20 |
| 3 | LoginPage nao tem logica para aceitar convite apos login | `components/LoginPage.tsx` | 73-89 |
| 4 | Para upgrade, usuario precisa ir em `/convite` separadamente depois de logar | `components/ConvitePage.tsx` | 73-95 |
| 5 | O hook `session.create.after` NAO verifica convites pendentes | `api/_lib/auth.ts` | 330-337 |
| 6 | O campo `organizationName` do signup e ignorado (param `_organizationName`) | `contexts/AuthContext.tsx` | 191 |

### O que JA Funciona (nao mexer)

| Funcionalidade | Arquivo | Linha | Descricao |
|---------------|---------|-------|-----------|
| Auto-aplicar convite no signup | `api/_lib/auth.ts` | 256-326 | Hook `user.create.after` busca convite pendente pelo email e aplica via `applyInviteCredentials()` |
| Aplicar credenciais do convite | `api/_lib/auth.ts` | 105-145 | Seta role, organizationId (se cliente), vincula people.userId, marca convite aceito |
| Fazendas por pessoaId | `src/DB/schema.ts` | 275-281 | `person_farms` usa `pessoaId`, nao `userId`. Ja existem antes do convite |

---

## Instrucoes Detalhadas de Implementacao

### PASSO 1: Alterar URL do convite no backend

**Arquivo:** `api/invite.ts`
**Linhas a alterar:** 239-240

**Codigo atual:**
```typescript
const appUrl = process.env.APP_PUBLIC_URL ?? process.env.VITE_APP_URL ?? 'https://gesttor.app';
const inviteUrl = `${appUrl}/convite?token=${token}`;
```

**Substituir por:**
```typescript
const appUrl = process.env.APP_PUBLIC_URL ?? process.env.VITE_APP_URL ?? 'https://gesttor.app';

let inviteUrl: string;
if (inviteType === 'new_account') {
  // Novo usuario -> vai para tela de cadastro com dados pre-preenchidos
  const params = new URLSearchParams({
    tab: 'signup',
    email: person.email,
    org: orgName,
    invite: '1',
  });
  inviteUrl = `${appUrl}/sign-in?${params.toString()}`;
} else {
  // Usuario existente (upgrade) -> vai para tela de login com token
  inviteUrl = `${appUrl}/sign-in?invite_token=${token}`;
}
```

**Por que:** O token NAO precisa ir na URL para `new_account` porque o hook `user.create.after` ja faz match automatico por email. Para `upgrade`, o token e necessario para o `acceptInvite()` apos login.

**Seguranca:** O email na URL nao e sensivel (o usuario ja recebeu no inbox). O token de upgrade e equivalente ao approach atual.

---

### PASSO 2: Adicionar orgName ao GET /api/invite

**Arquivo:** `api/invite.ts`
**Funcao:** `handleGetToken` (linhas 109-147)

**Por que:** O redirect de `/convite` (backward compatibility) precisa do nome da organizacao para construir a URL de signup.

**Apos a linha 133 (apos o `limit(1)`)**, adicionar busca da org:

```typescript
// Buscar nome da organizacao para redirect
let orgName = '';
if (person.organizationId) {
  // Precisa importar organizationId do person - adicionar ao select
  // NOTA: o select atual nao inclui organizationId, precisa adicionar
}
```

**Alterar o select (linhas 115-123)** para incluir `organizationId`:

```typescript
const [person] = await db
  .select({
    id: people.id,
    fullName: people.fullName,
    email: people.email,
    organizationId: people.organizationId,  // NOVO
    inviteRole: people.inviteRole,
    inviteStatus: people.inviteStatus,
    inviteExpiresAt: people.inviteExpiresAt,
    inviteType: people.inviteType,
    userId: people.userId,
  })
  .from(people)
  .where(/* ... igual ... */)
  .limit(1);
```

**Apos a validacao de expirado (linha 137)**, adicionar:

```typescript
// Buscar nome da org
let orgName = '';
if (person.organizationId) {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, person.organizationId))
    .limit(1);
  if (org) orgName = org.name;
}
```

**Alterar o return (linhas 139-146)** para incluir `orgName`:

```typescript
return jsonSuccess(res, {
  valid: true,
  name: person.fullName,
  email: person.email,
  role: person.inviteRole,
  inviteType: person.inviteType ?? 'new_account',
  hasAccount: !!person.userId,
  orgName,  // NOVO
});
```

---

### PASSO 3: LoginPage - ler query params e pre-preencher

**Arquivo:** `components/LoginPage.tsx`

#### 3.1 - Adicionar imports

No topo do arquivo, adicionar:
```typescript
import { acceptInvite } from '../lib/api/pessoasClient';
```

#### 3.2 - Adicionar onToast ao interface

**Linha 8** - a interface ja tem `onToast?`, entao OK. Se nao tiver, adicionar.

#### 3.3 - Parsear URL params

**Apos a linha 12** (dentro do componente, antes dos useState), adicionar:

```typescript
// Ler parametros de convite da URL (uma vez)
const [urlParams] = useState(() => new URLSearchParams(window.location.search));
const urlTab = urlParams.get('tab');
const urlEmail = urlParams.get('email');
const urlOrg = urlParams.get('org');
const urlInvite = urlParams.get('invite') === '1';
const urlInviteToken = urlParams.get('invite_token');
```

#### 3.4 - Alterar inicializacao dos states

**Linha 14** - `isSignup`:
```typescript
// ANTES:
const [isSignup, setIsSignup] = useState(false);
// DEPOIS:
const [isSignup, setIsSignup] = useState(urlTab === 'signup');
```

**Linha 15** - `email`:
```typescript
// ANTES:
const [email, setEmail] = useState('');
// DEPOIS:
const [email, setEmail] = useState(urlEmail ?? '');
```

**Linha 20** - `organizationName`:
```typescript
// ANTES:
const [organizationName, setOrganizationName] = useState('');
// DEPOIS:
const [organizationName, setOrganizationName] = useState(urlOrg ?? '');
```

**Adicionar novo state para invite token:**
```typescript
const [inviteToken] = useState(urlInviteToken ?? '');
const isInviteSignup = urlInvite;
```

#### 3.5 - Email readonly quando e convite de signup

**Linhas 195-206** - No input de email, adicionar `readOnly` condicional:

```tsx
<input
  type="email"
  required
  readOnly={isInviteSignup}                          // NOVO
  value={email}
  onChange={e => {
    if (!isInviteSignup) {                            // NOVO: so permite editar se nao e convite
      setEmail(e.target.value);
      if (loginError) setLoginError('');
    }
  }}
  className={`block w-full pl-10 sm:pl-11 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all outline-none ${
    isInviteSignup
      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'   // NOVO: estilo readonly
      : 'bg-blue-50/60'
  }`}
  placeholder="exemplo@gesttor.app"
/>
```

#### 3.6 - Banner informativo para convite

**Apos a linha 128** (apos o paragrafo de subtitulo, dentro do card), adicionar:

```tsx
{/* Banner de convite */}
{isInviteSignup && urlOrg && (
  <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
    <p className="text-xs text-blue-700 font-medium">
      Complete seu cadastro para acessar <strong>{urlOrg}</strong>
    </p>
  </div>
)}

{inviteToken && !isSignup && (
  <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
    <p className="text-xs text-amber-700 font-medium">
      Faca login para aceitar o convite e acessar seus novos recursos
    </p>
  </div>
)}
```

#### 3.7 - Desabilitar toggle de aba quando e convite

**Linhas 131-167** - Quando `isInviteSignup`, desabilitar o botao "Entrar" (usuario PRECISA se cadastrar):

```tsx
<button
  type="button"
  disabled={isInviteSignup}                           // NOVO
  onClick={() => { /* ... toggle para login ... */ }}
  className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all duration-200 ${
    !isSignup ? 'bg-zinc-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
  } ${isInviteSignup ? 'opacity-50 cursor-not-allowed' : ''}`}   // NOVO
>
  Entrar
</button>
```

Quando `inviteToken` existe e !isSignup, desabilitar o botao "Cadastrar" (usuario JA tem conta):
```tsx
<button
  type="button"
  disabled={!!inviteToken}                            // NOVO
  onClick={() => { /* ... toggle para signup ... */ }}
  className={`... ${inviteToken ? 'opacity-50 cursor-not-allowed' : ''}`}
>
  Cadastrar
</button>
```

#### 3.8 - Aceitar convite apos login bem-sucedido

**Linhas 75-84** - No bloco de login (else do handleSubmit), alterar:

```typescript
// Login flow
try {
  const result = await login(email, password);

  if (!result.success) {
    setLoginError(result.error || 'Email ou senha incorretos.');
    setIsSubmitting(false);
    return;
  }

  // NOVO: Se tem invite_token, aceitar convite apos login
  if (inviteToken) {
    try {
      await acceptInvite(inviteToken);
      onToast?.('Convite aceito! Suas permissoes foram atualizadas.', 'success');
    } catch (err: any) {
      // Nao bloquear login se invite falhar
      console.warn('[login] Erro ao aceitar convite:', err);
      onToast?.('Login realizado, mas houve um erro ao aceitar o convite. Contate o administrador.', 'warning');
    }
  }

  // Login bem sucedido - AuthContext vai redirecionar
  setIsSubmitting(false);
} catch {
  setLoginError('Erro de conexao.');
  setIsSubmitting(false);
}
```

---

### PASSO 4: Auto-aceitar convite no hook de sessao (safety net)

**Arquivo:** `api/_lib/auth.ts`
**Local:** Hook `session.create.after` (apos linha 337, apos o update de `lastLogin`)

**Adicionar:**

```typescript
// Auto-aceitar convite pendente para usuarios existentes (safety net)
try {
  const { and, isNotNull } = await import('drizzle-orm');
  const now = new Date();
  const [pendingInvite] = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.userId, session.userId),
        eq(people.inviteStatus, 'pending'),
        isNotNull(people.inviteExpiresAt),
      ),
    )
    .limit(1);

  if (pendingInvite && pendingInvite.inviteExpiresAt && pendingInvite.inviteExpiresAt > now) {
    await applyInviteCredentials(session.userId, pendingInvite);
    console.log(`[auth] Convite auto-aceito no login para userId=${session.userId}`);
  }
} catch (inviteErr) {
  console.error('[auth] Erro ao auto-aceitar convite no login:', inviteErr);
}
```

**Por que este passo e crucial:** Garante que o convite e aceito mesmo quando:
- O usuario acessa `/sign-in` diretamente (sem params na URL)
- O usuario faz login pelo Google OAuth
- O usuario recupera a senha e depois loga
- O link do email foi copiado sem os query params

**Idempotencia:** Se o convite ja foi aceito pelo client-side (Passo 3.8), `applyInviteCredentials` nao encontrara convite pendente e nao fara nada.

---

### PASSO 5: Converter /convite em redirect (backward compatibility)

**Arquivo:** `App.tsx` (linhas 477-484)

**Substituir o bloco de ConvitePage por um componente de redirect:**

```tsx
// Aceitar convite — redirect para /sign-in com params adequados
if (pathname === '/convite') {
  return <ConviteRedirect />;
}
```

**Criar componente ConviteRedirect** (pode ser inline no App.tsx ou em arquivo separado):

```tsx
const ConviteRedirect: React.FC = () => {
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      window.location.replace('/sign-in');
      return;
    }

    fetch(`/api/invite?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(json => {
        const data = json.data;
        if (!data?.valid) {
          window.location.replace('/sign-in');
          return;
        }

        if (data.inviteType === 'upgrade' || data.hasAccount) {
          // Usuario existente -> login com token
          window.location.replace(`/sign-in?invite_token=${token}`);
        } else {
          // Novo usuario -> signup com dados pre-preenchidos
          const params = new URLSearchParams({
            tab: 'signup',
            email: data.email ?? '',
            org: data.orgName ?? '',
            invite: '1',
          });
          window.location.replace(`/sign-in?${params.toString()}`);
        }
      })
      .catch(() => {
        window.location.replace('/sign-in');
      });
  }, []);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-ai-bg">
      <Loader2 size={32} className="animate-spin text-ai-subtext" />
    </div>
  );
};
```

**Na linha 453**, passar `onToast` para o LoginPage:

```tsx
// ANTES:
return pathname.startsWith('/sign-in') ? <LoginPage onForgotPassword={...} /> : <SignUpPage />;

// DEPOIS:
return pathname.startsWith('/sign-in')
  ? <LoginPage onToast={handleToast} onForgotPassword={() => window.location.replace('/forgot-password')} />
  : <SignUpPage />;
```

---

### PASSO 6 (Opcional): Ajustar texto do template de email de upgrade

**Arquivo:** `lib/email-templates/invite-upgrade.html`

Localizar o paragrafo que diz algo como:
```
Como voce ja possui uma conta, basta aceitar o convite para acessar todos os recursos.
```

Substituir por:
```
Como voce ja possui uma conta, basta fazer login para acessar automaticamente seus novos recursos.
```

O botao pode mudar de "Aceitar convite" para "Fazer login" (opcional).

---

## Resumo de Arquivos a Modificar

| # | Arquivo | Mudanca | Prioridade |
|---|---------|---------|------------|
| 1 | `api/invite.ts` | Gerar URLs diferentes por inviteType + orgName no GET | Alta |
| 2 | `components/LoginPage.tsx` | Ler query params, pre-preencher, aceitar invite apos login | Alta |
| 3 | `api/_lib/auth.ts` | Auto-aceitar convite no `session.create.after` | Alta |
| 4 | `App.tsx` | Converter /convite em redirect; passar onToast ao LoginPage | Alta |
| 5 | `components/ConvitePage.tsx` | Substituir por redirect ou remover (apos passo 5) | Media |
| 6 | `lib/email-templates/invite-upgrade.html` | Ajustar texto | Baixa |

## Funcoes Existentes a Reutilizar (NAO reescrever)

| Funcao | Arquivo | Linha | Uso |
|--------|---------|-------|-----|
| `applyInviteCredentials()` | `api/_lib/auth.ts` | 105 | Ja aplica role, org, vincula userId, marca aceito |
| `acceptInvite()` | `lib/api/pessoasClient.ts` | 303 | Client-side wrapper para POST /api/invite {action:'accept'} |
| `databaseHooks.user.create.after` | `api/_lib/auth.ts` | 256 | Ja auto-aplica convite no signup por match de email |
| `sendInvite()` | `lib/api/pessoasClient.ts` | 294 | Client-side wrapper para POST /api/invite |
| `formatPhone()` / `validatePhone()` | `lib/utils/phoneMask.ts` | - | Ja usados no LoginPage |

## Sobre Fazendas (person_farms) - NAO precisa mudar

As fazendas atribuidas ao usuario convidado ja estao na tabela `person_farms` (vinculadas por `pessoaId`). Quando `people.userId` e setado (no signup pelo hook ou no upgrade pelo `applyInviteCredentials`), queries que fazem JOIN `people -> personFarms` passam a funcionar para aquele usuario. **Nao e necessaria nenhuma mudanca em person_farms.**

A sequencia e:
1. Admin cadastra pessoa e atribui fazendas (cria registros em `person_farms` com `pessoaId`)
2. Admin envia convite
3. Usuario se cadastra ou faz login
4. `people.userId` e vinculado ao `ba_user.id`
5. Queries que buscam fazendas do usuario fazem: `user -> people (via userId) -> person_farms (via pessoaId) -> farms`

---

## Roteiro de Testes

### Teste 1: Novo usuario (new_account)
1. No PeopleManagement, cadastrar pessoa SEM userId, com email e organizacao
2. Atribuir fazendas a essa pessoa
3. Clicar "Convidar"
4. Verificar no log/email que o link e: `/sign-in?tab=signup&email=X&org=Y&invite=1`
5. Abrir link no browser
6. Confirmar: aba "Cadastrar" ativa, email preenchido e readonly, org preenchida
7. Preencher nome, telefone, senha, confirmar senha
8. Clicar "Cadastrar"
9. Fazer login com email/senha criados
10. Verificar: `user_profiles.role` correto, `organizationId` setado, fazendas acessiveis

### Teste 2: Usuario existente (upgrade)
1. No PeopleManagement, ter pessoa COM userId (role visitante)
2. Atribuir fazendas a essa pessoa
3. Clicar "Convidar"
4. Verificar que o link e: `/sign-in?invite_token=TOKEN`
5. Abrir link
6. Confirmar: aba "Entrar" ativa, banner "Faca login para aceitar o convite"
7. Fazer login com credenciais existentes
8. Verificar: toast de "Convite aceito", role atualizado, fazendas acessiveis

### Teste 3: Backward compatibility (emails antigos)
1. Acessar `/convite?token=xxx` com token valido de new_account
2. Confirmar redirect para `/sign-in?tab=signup&email=X&org=Y&invite=1`
3. Acessar `/convite?token=xxx` com token valido de upgrade
4. Confirmar redirect para `/sign-in?invite_token=xxx`
5. Acessar `/convite?token=xxx` com token invalido/expirado
6. Confirmar redirect para `/sign-in`

### Teste 4: Safety net (login sem params)
1. Ter usuario existente com convite pendente (inviteStatus='pending')
2. Acessar `/sign-in` diretamente (sem query params)
3. Fazer login normalmente
4. Verificar que o hook `session.create.after` aceitou o convite automaticamente
5. Confirmar: role atualizado, fazendas acessiveis

### Teste 5: Recuperacao de senha + convite
1. Ter usuario existente com convite pendente
2. Ir para "Esqueci minha senha"
3. Redefinir senha
4. Fazer login com nova senha
5. Verificar que convite foi aceito automaticamente (via safety net)
