# Instrucao: Aplicar Correcoes Criticas de Autenticacao

**Data do diagnostico**: 2026-03-25
**Status**: PENDENTE — Nenhuma correcao foi aplicada ainda.
**Prioridade**: MAXIMA — Aplicar ANTES de qualquer feature nova.

---

## Regras para o Agente

1. Aplique EXATAMENTE as correcoes descritas abaixo — nao invente correcoes extras
2. Nao refatore codigo ao redor — altere apenas o minimo necessario
3. Nao mude nomes de funcoes, nao mude imports, nao mude estrutura de arquivos
4. Teste mental: apos cada correcao, verifique se o fluxo existente continua funcionando
5. Ao finalizar cada correcao, marque com [x] e indique o que mudou
6. Se encontrar ambiguidade, PARE e pergunte antes de prosseguir
7. NAO execute `drizzle-kit push` sem aprovacao explicita do usuario

---

## CORRECAO #1 — BETTER_AUTH_SECRET obrigatorio [CRITICO]

**Arquivo**: `api/_lib/auth.ts` linha 78
**Problema**: Fallback hardcoded `'dev-insecure-secret-change-me'`. Se a env var nao estiver configurada em producao, tokens podem ser forjados.
**Estado atual**:
```ts
secret: process.env.BETTER_AUTH_SECRET ?? 'dev-insecure-secret-change-me',
```

**Correcao**: Manter fallback APENAS em desenvolvimento. Em producao (Vercel), lancar erro fatal.
```ts
secret: (() => {
  const s = process.env.BETTER_AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('[auth] BETTER_AUTH_SECRET nao configurado em producao');
  }
  return 'dev-insecure-secret-change-me';
})(),
```

**Verificacao pos-correcao**:
- [ ] Em dev local SEM a variavel: deve funcionar normalmente com o fallback
- [ ] Em producao SEM a variavel: servidor nao inicializa (erro fatal)
- [ ] Em producao COM a variavel: funciona normalmente

**Risco de quebra**: MEDIO — Se a variavel nao estiver na Vercel, o deploy vai falhar. Verificar `.env` e Vercel Settings ANTES de aplicar.

---

## CORRECAO #2 — Bloquear alteracao de plan sem autorizacao [CRITICO]

**Arquivo**: `api/auth.ts` linhas 62-81
**Problema**: POST /api/auth aceita `plan` de qualquer usuario autenticado sem checagem de role. Qualquer usuario pode fazer `{ "plan": "pro" }` e ter plano Pro gratis.
**Estado atual**:
```ts
const plan = body.plan;
// ...
...(plan ? { plan } : {}),
```

**Correcao**: Buscar a role do usuario e so permitir alteracao de `plan` se for `administrador`.
```ts
// No inicio do bloco POST, apos extrair o body:
import { getUserRole } from './_lib/orgAccess.js';

// Dentro do POST handler, antes do try/catch do update:
const userRole = await getUserRole(userId);
const safePlan = (userRole === 'administrador') ? plan : undefined;

// Na query de update, trocar:
...(plan ? { plan } : {}),
// Por:
...(safePlan ? { plan: safePlan } : {}),
```

**ATENCAO**: O import de `getUserRole` ja deve existir ou precisa ser adicionado no topo do arquivo. Verificar se `orgAccess.ts` exporta `getUserRole`.

**Verificacao pos-correcao**:
- [ ] Usuario `administrador` altera plan via POST → funciona
- [ ] Usuario `analista` tenta alterar plan via POST → plan nao muda (ignorado silenciosamente)
- [ ] Usuario `visitante` tenta alterar plan via POST → plan nao muda
- [ ] Os demais campos (name, imageUrl, phone) continuam funcionando para todos

**Risco de quebra**: BAIXO — Se houver tela de upgrade de plano para clientes, ela vai parar de funcionar. Verificar se `upgradePlan()` no AuthContext depende disso.

---

## CORRECAO #3 — Alinhar validacao de senha frontend/backend [IMPORTANTE]

**Arquivo**: `components/LoginPage.tsx` linhas 105, 246, 266-267
**Problema**: Frontend valida `>= 6` caracteres, backend exige `minPasswordLength: 8`. Usuario com 7 chars passa validacao visual mas recebe erro generico.
**Estado atual**:
```tsx
// Linha 105
const passwordLengthValid = isSignup ? password === '' || password.length >= 6 : true;

// Linha 246
<span className="text-rose-500 ml-1">(minimo 6 caracteres)</span>

// Linha 266
placeholder={isSignup ? 'Minimo 6 caracteres' : '........'}

// Linha 267
minLength={isSignup ? 6 : undefined}
```

**Correcao**: Trocar todos os `6` por `8`:
```tsx
// Linha 105
const passwordLengthValid = isSignup ? password === '' || password.length >= 8 : true;

// Linha 246
<span className="text-rose-500 ml-1">(minimo 8 caracteres)</span>

// Linha 266
placeholder={isSignup ? 'Minimo 8 caracteres' : '........'}

// Linha 267
minLength={isSignup ? 8 : undefined}
```

**Verificacao pos-correcao**:
- [ ] Formulario de signup com 7 chars → exibe alerta vermelho "minimo 8 caracteres"
- [ ] Formulario de signup com 8 chars → validacao passa
- [ ] Formulario de login → sem mudanca (nao tem validacao de minimo)

**Risco de quebra**: NENHUM — Mudanca apenas de constantes visuais no frontend.

---

## CORRECAO #4 — Salvar phone no signup [IMPORTANTE]

**Arquivo**: `contexts/AuthContext.tsx` linha 170
**Problema**: `LoginPage.tsx:64` chama `signup(email, password, name, phone, organizationName)` com 5 parametros, mas `AuthContext.tsx:170` aceita apenas `(email, password, name)`. O `phone` e `organizationName` sao descartados silenciosamente.

**Estado atual**:
```ts
const signup = useCallback(async (email: string, password: string, name: string): Promise<...> => {
  const result = await authClient.signUp.email({ email, password, name });
  // ...
  return { success: true };
}, []);
```

**Correcao em 2 etapas**:

### Etapa 4a — Atualizar assinatura do signup no AuthContext:
```ts
const signup = useCallback(async (
  email: string,
  password: string,
  name: string,
  phone?: string,
  organizationName?: string
): Promise<{ success: boolean; error?: string }> => {
  setAuthError(null);
  try {
    const result = await authClient.signUp.email({ email, password, name });

    if (result.error) {
      // ... tratamento de erro existente (NAO ALTERAR) ...
    }

    // Apos signup bem-sucedido, atualizar phone no perfil
    if (phone) {
      try {
        await apiFetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
      } catch {
        // Phone nao salvo — nao bloquear o signup por isso
        console.warn('[auth] Nao foi possivel salvar o telefone no signup');
      }
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Erro de conexao. Verifique sua internet.' };
  }
}, []);
```

**ATENCAO**: O POST /api/auth requer Bearer token. Como `autoSignIn: false`, o usuario NAO tem token apos signup. Portanto, a abordagem acima NAO vai funcionar diretamente.

### Alternativa recomendada — Salvar phone no hook do servidor:

**Arquivo**: `api/_lib/auth.ts` linhas 185-196 (hook `user.create.after`)

O Better Auth aceita campos extras no `signUp.email()`. Porem, o hook `user.create.after` recebe apenas os campos do `ba_user` (id, name, email). O `phone` nao chega no hook.

### Solucao mais robusta — Salvar phone apos o primeiro login:

1. Armazenar `phone` em `sessionStorage` temporariamente apos o signup
2. No proximo login, verificar se ha `pendingPhone` em sessionStorage
3. Se houver, fazer POST /api/auth com o phone e limpar sessionStorage

**Implementacao**:

No `AuthContext.tsx` (signup):
```ts
// Apos return { success: true }; dentro do signup:
if (phone) {
  sessionStorage.setItem('pendingPhone', phone);
}
return { success: true };
```

No `AuthContext.tsx` (login, apos carregar perfil com sucesso):
```ts
// Apos setUser(profile); dentro do login:
const pendingPhone = sessionStorage.getItem('pendingPhone');
if (pendingPhone) {
  apiFetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: pendingPhone }),
  }).catch(() => {});
  sessionStorage.removeItem('pendingPhone');
}
```

**Verificacao pos-correcao**:
- [ ] Signup com phone → phone salvo em sessionStorage
- [ ] Login apos signup → phone enviado via POST /api/auth e salvo no perfil
- [ ] Signup sem phone → nenhum erro, nenhuma acao extra
- [ ] Login normal (sem pendingPhone) → sem mudanca no comportamento

**Risco de quebra**: BAIXO — Logica aditiva, nao altera fluxo existente.

---

## CORRECAO #5 — Reconciliacao de user_profiles ausente [IMPORTANTE]

**Arquivo**: `api/auth.ts` linhas 50-57 (GET handler)
**Problema**: Se o hook `user.create.after` falhar, `ba_user` existe mas `user_profiles` nao. GET /api/auth retorna 404, usuario fica preso — autentica mas nao tem perfil.

**Estado atual**:
```ts
if (!profile) {
  jsonError(res, 'Perfil nao encontrado', { code: 'NOT_FOUND', status: 404 });
  return;
}
```

**Correcao**: Se o perfil nao existir mas o usuario esta autenticado (tem userId valido), criar automaticamente:
```ts
if (!profile) {
  // Reconciliacao: criar perfil automatico se ba_user existe mas user_profiles nao
  try {
    const [baUser] = await pool.query('SELECT id, email, name FROM ba_user WHERE id = $1', [userId]).then(r => r.rows);
    if (baUser) {
      await db.insert(userProfiles).values({
        id: baUser.id,
        email: baUser.email,
        name: baUser.name ?? baUser.email.split('@')[0],
        role: 'visitante',
        status: 'active',
        ativo: true,
        avatar: (baUser.name ?? baUser.email).charAt(0).toUpperCase(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const reconciled = await getProfileWithClientId(userId);
      if (reconciled) {
        jsonSuccess(res, reconciled);
        return;
      }
    }
  } catch (err) {
    console.error('[auth] Erro na reconciliacao de user_profiles:', err);
  }
  jsonError(res, 'Perfil nao encontrado', { code: 'NOT_FOUND', status: 404 });
  return;
}
```

**ATENCAO**: Importar `userProfiles` e `db` ja devem estar disponiveis no arquivo. Verificar se `pool.query` ja esta importado.

**Verificacao pos-correcao**:
- [ ] Usuario com ba_user + user_profiles → retorna perfil normalmente (sem mudanca)
- [ ] Usuario com ba_user SEM user_profiles → cria perfil automaticamente e retorna
- [ ] Usuario inexistente → retorna 404 como antes

**Risco de quebra**: BAIXO — Logica de fallback, nao altera o caminho feliz.

---

## CORRECAO #6 — Mensagem generica para erro de login [IMPORTANTE]

**Arquivo**: `contexts/AuthContext.tsx` linhas 134-146
**Problema**: Mensagem `'senha errada'` confirma que o email existe no sistema. Atacante pode usar para enumerar emails.

**Estado atual**:
```ts
if (
  msg.toLowerCase().includes('password') ||
  msg.toLowerCase().includes('credential') ||
  result.error.code === 'INVALID_PASSWORD' ||
  msg === 'Invalid email or password'
) {
  msg = 'senha errada';
}
```

**Correcao**: Usar mensagem generica que nao confirma existencia do email:
```ts
if (
  msg.toLowerCase().includes('password') ||
  msg.toLowerCase().includes('credential') ||
  msg.toLowerCase().includes('email') ||
  msg.toLowerCase().includes('user') ||
  result.error.code === 'INVALID_PASSWORD' ||
  result.error.code === 'USER_NOT_FOUND' ||
  msg === 'Invalid email or password'
) {
  msg = 'Email ou senha invalidos';
}
```

**Verificacao pos-correcao**:
- [ ] Login com email existente + senha errada → "Email ou senha invalidos"
- [ ] Login com email inexistente → "Email ou senha invalidos"
- [ ] Login com credenciais corretas → sucesso (sem mudanca)

**Risco de quebra**: NENHUM — Mudanca apenas de string de mensagem.

---

## CORRECAO #7 — Indice em people.userId [IMPORTANTE]

**Arquivo**: `src/DB/schema.ts` linhas 232-237
**Problema**: `people.userId` nao tem indice. Queries de lookup por userId sao full-scan. Fundamental para a feature de convites.

**Estado atual**:
```ts
}, (t) => [
  index('idx_people_organization_id').on(t.organizationId),
  index('idx_people_ativo').on(t.ativo),
]);
```

**Correcao**: Adicionar indice:
```ts
}, (t) => [
  index('idx_people_organization_id').on(t.organizationId),
  index('idx_people_ativo').on(t.ativo),
  index('idx_people_user_id').on(t.userId),
]);
```

**ATENCAO**: Apos alterar o schema, sera necessario executar `npx drizzle-kit push` para aplicar no banco. NAO execute sem aprovacao do usuario.

**Verificacao pos-correcao**:
- [ ] Schema atualizado com novo indice
- [ ] `npx drizzle-kit push` executado com sucesso (aguardar aprovacao)
- [ ] Queries existentes nao afetadas

**Risco de quebra**: NENHUM — Adicao de indice nao altera dados nem queries.

---

## CORRECAO #8 — Vinculacao automatica people <-> user no signup [IMPORTANTE]

**Arquivo**: `api/_lib/auth.ts` linhas 175-200 (hook `user.create.after`)
**Problema**: Quando alguem faz signup com email que ja existe na tabela `people`, o campo `people.userId` nao e atualizado. O vinculo pessoa-usuario nunca e criado.

**Estado atual no hook**:
```ts
after: async (user) => {
  try {
    // ... cria user_profiles ...
  } catch (err) {
    console.error('[auth] Erro ao criar user_profiles apos signup:', err);
  }
},
```

**Correcao**: Adicionar vinculacao APOS a criacao do user_profiles:
```ts
after: async (user) => {
  try {
    // ... codigo existente de criacao do user_profiles (NAO ALTERAR) ...

    // Vincular people existentes com o mesmo email
    try {
      const { eq, isNull, and } = await import('drizzle-orm');
      await db
        .update(people)
        .set({ userId: user.id, updatedAt: new Date() })
        .where(
          and(
            eq(people.email, user.email),
            isNull(people.userId)
          )
        );
    } catch (linkErr) {
      console.error('[auth] Erro ao vincular people ao novo usuario:', linkErr);
    }
  } catch (err) {
    console.error('[auth] Erro ao criar user_profiles apos signup:', err);
  }
},
```

**ATENCAO**: Verificar se `people` esta importado no topo de `auth.ts`. Se nao, adicionar import.

**Verificacao pos-correcao**:
- [ ] Signup com email que existe em `people` → `people.userId` atualizado
- [ ] Signup com email que NAO existe em `people` → nenhum efeito colateral
- [ ] Se o email existe em multiplas orgs (multiplos registros em `people`) → todos sao vinculados
- [ ] Se `people.userId` ja tem valor (vinculado a outro usuario) → NAO sobrescreve (por causa do `isNull(people.userId)`)

**Risco de quebra**: BAIXO — Logica aditiva no hook existente.

---

## CORRECAO #17 — Remover email dos logs de producao [MELHORIA/LGPD]

**Arquivo**: `api/_lib/auth.ts` linhas 118 e 129
**Problema**: `console.log` expoe emails reais nos logs da Vercel. Violacao de LGPD.

**Estado atual**:
```ts
// Linha 118
console.log('[auth] Email de reset enviado para:', user.email);

// Linha 129
console.log(`[auth] Senha redefinida com sucesso para: ${user.email}`);
```

**Correcao**:
```ts
// Linha 118
console.log('[auth] Email de reset enviado com sucesso');

// Linha 129
console.log('[auth] Senha redefinida com sucesso');
```

**Verificacao pos-correcao**:
- [ ] Logs nao contem emails de usuarios
- [ ] Funcionalidade de reset de senha continua funcionando

**Risco de quebra**: NENHUM.

---

## CORRECAO #18 — Limite de tamanho no campo name [MELHORIA]

**Arquivo**: `api/auth.ts` linha 69
**Problema**: Campo `name` aceita qualquer tamanho. Payload com nome de 1MB seria aceito.

**Estado atual**:
```ts
const name = (body.name ?? '').trim();
```

**Correcao**:
```ts
const name = (body.name ?? '').trim().slice(0, 200);
```

**Verificacao pos-correcao**:
- [ ] Nome com menos de 200 chars → salvo normalmente
- [ ] Nome com mais de 200 chars → truncado em 200 sem erro

**Risco de quebra**: NENHUM.

---

## Ordem de Aplicacao Recomendada

```
Fase 1 — Seguranca Critica (aplicar imediatamente)
  1. #1  BETTER_AUTH_SECRET obrigatorio
  2. #2  Bloquear alteracao de plan
  3. #6  Mensagem generica de login
  4. #17 Remover emails dos logs

Fase 2 — Integridade de Dados
  5. #3  Alinhar validacao de senha (6 → 8)
  6. #18 Limite de tamanho no name
  7. #4  Salvar phone no signup
  8. #5  Reconciliacao de user_profiles

Fase 3 — Preparacao para Convites
  9. #7  Indice em people.userId
  10. #8  Vinculacao automatica people <-> user
  → Executar `npx drizzle-kit push` (com aprovacao)
```

---

## Checklist Final Pos-Correcoes

- [ ] Todas as 10 correcoes aplicadas
- [ ] Login funciona normalmente (email + senha corretos)
- [ ] Login com credenciais erradas exibe "Email ou senha invalidos"
- [ ] Signup funciona e cria user_profiles com role='visitante'
- [ ] Phone e salvo apos primeiro login
- [ ] Reset de senha envia email e funciona
- [ ] POST /api/auth nao aceita plan de usuario nao-admin
- [ ] Logs nao contem emails de usuarios
- [ ] `npx drizzle-kit push` aplicado sem erros
- [ ] Deploy na Vercel funciona (BETTER_AUTH_SECRET configurado)

---

## Como Usar Esta Instrucao

```
Aplique as correcoes criticas de autenticacao seguindo
.skills/CORRECOES_CRITICAS_AUTH.md

Fase: [1 | 2 | 3 | todas]
```
