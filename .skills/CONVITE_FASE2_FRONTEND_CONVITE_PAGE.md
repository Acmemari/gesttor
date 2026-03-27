# FASE 2 — Frontend: ConvitePage com Fluxo Duplo + Client HTTP

> **Objetivo**: Modificar a página de convite para suportar dois fluxos:
> 1. Novo usuário → formulário de criação de senha (fluxo atual, mantido)
> 2. Visitante existente → tela de aceitação (sem campo de senha)
>
> **Pré-requisito**: FASE 1 concluída (backend funcional)
> **Complexidade**: Média | **Risco**: Baixo (alterações isoladas no frontend)

---

## CONTEXTO OBRIGATÓRIO — Leia antes de começar

### Arquivos que você VAI modificar
| Arquivo | O que fazer |
|---|---|
| `components/ConvitePage.tsx` | Adicionar fluxo de upgrade para visitantes |
| `lib/api/pessoasClient.ts` | Adicionar função `acceptInvite()` |

### Arquivos que você NÃO deve modificar nesta fase
- `api/invite.ts` → já foi modificado na FASE 1
- `api/_lib/auth.ts` → já foi modificado na FASE 1
- `agents/PeopleManagement.tsx` → será modificado na FASE 3
- `App.tsx` → rota `/convite` já existe, não precisa alterar

### Estado atual dos arquivos
- `ConvitePage.tsx`: Recebe `onToast` e `onSuccess` como props. Usa `authClient.signUp.email()` para criar conta.
- `pessoasClient.ts`: Já tem `sendInvite()`. Falta `acceptInvite()`.

---

## PASSO 1 — Adicionar `acceptInvite()` ao client HTTP

**Arquivo**: `lib/api/pessoasClient.ts`

Localizar a seção `// ─── Convites` (após `sendInvite`) e adicionar:

```typescript
export async function acceptInvite(token: string): Promise<{ ok: boolean; role: string; message: string }> {
  const res = await fetchApi<{ ok: boolean; role: string; message: string }>(`${API_BASE}/invite`, {
    method: 'POST',
    body: JSON.stringify({ action: 'accept', token }),
  });
  if (!res.ok) throw new Error((res as ApiError).error);
  return res.data;
}
```

### NÃO FAÇA
- NÃO altere a função `sendInvite()` existente
- NÃO altere os tipos/interfaces existentes no arquivo

---

## PASSO 2 — Modificar `ConvitePage.tsx` — Interface de dados

Atualizar a interface `InviteData` para incluir os novos campos:

**ANTES**:
```typescript
interface InviteData {
  valid: boolean;
  reason?: string;
  name?: string;
  email?: string;
  role?: string;
}
```

**DEPOIS**:
```typescript
interface InviteData {
  valid: boolean;
  reason?: string;
  name?: string;
  email?: string;
  role?: string;
  inviteType?: 'new_account' | 'upgrade';
  hasAccount?: boolean;
}
```

---

## PASSO 3 — Adicionar imports necessários

Adicionar ao bloco de imports do `ConvitePage.tsx`:

```typescript
import { acceptInvite } from '../lib/api/pessoasClient';
```

Adicionar `UserCheck` ao import do lucide-react (para o ícone da tela de upgrade):

```typescript
import { Lock, ArrowRight, Loader2, CheckCircle2, AlertCircle, UserCheck } from 'lucide-react';
```

---

## PASSO 4 — Adicionar handler de aceitação de upgrade

Dentro do componente `ConvitePage`, APÓS o `handleSubmit` existente, adicionar:

```typescript
const handleAcceptUpgrade = async () => {
  if (!token) return;
  setIsSubmitting(true);
  setError('');

  try {
    await acceptInvite(token);
    setIsSuccess(true);
    setIsSubmitting(false);
    onToast?.('Convite aceito! Suas permissões foram atualizadas.', 'success');
    // Redireciona para home (não para sign-in, pois já está logado)
    setTimeout(() => {
      window.location.replace('/');
    }, 2500);
  } catch (err: any) {
    // Se receber 401, o visitante não está logado — redirecionar para login
    if (err.message?.includes('Não autenticado') || err.message?.includes('401')) {
      onToast?.('Faça login primeiro para aceitar o convite.', 'warning');
      // Guardar token na URL para retornar após login
      window.location.replace(`/sign-in?redirect=/convite?token=${encodeURIComponent(token)}`);
      return;
    }
    setError(err.message || 'Erro ao aceitar convite. Tente novamente.');
    setIsSubmitting(false);
  }
};
```

### ATENÇÃO — Redirecionamento pós-aceitação
- Novo usuário (new_account) → redireciona para `/sign-in` (precisa fazer login)
- Visitante (upgrade) → redireciona para `/` (já está logado, refresh de sessão)
- Se visitante NÃO está logado → redireciona para `/sign-in` com redirect param

---

## PASSO 5 — Adicionar tela de upgrade ao JSX

No return do componente, ANTES do bloco de formulário (`// Formulário`), adicionar o bloco de upgrade:

```tsx
// Upgrade — visitante com conta existente
if (invite?.valid && invite.inviteType === 'upgrade') {
  // Sucesso de upgrade
  if (isSuccess) {
    return (
      <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto">
        <div className="w-full max-w-md mx-auto px-4 py-8 pb-12">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gesttor</h1>
            <p className="text-ai-subtext text-xs sm:text-sm mt-1">Gestão de precisão para sua fazenda</p>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-6 sm:p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold mb-2">Convite aceito!</h2>
            <p className="text-xs sm:text-sm text-ai-subtext">
              Suas permissões foram atualizadas. Você será redirecionado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Tela de aceitação
  return (
    <div className="w-full min-h-screen bg-ai-bg text-ai-text font-sans overflow-y-auto">
      <div className="w-full max-w-md mx-auto px-4 py-6 sm:py-8 pb-12">
        <div className="flex flex-col items-center mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gesttor</h1>
          <p className="text-ai-subtext text-xs sm:text-sm mt-1 sm:mt-2">Gestão de precisão para sua fazenda</p>
        </div>

        <div className="bg-white rounded-xl sm:rounded-2xl border border-ai-border shadow-sm p-4 sm:p-6 md:p-8">
          <div className="flex items-center justify-center mb-4 sm:mb-6">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
              <UserCheck size={28} className="text-blue-600" />
            </div>
          </div>

          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold mb-2">Você foi convidado!</h2>
            <p className="text-xs sm:text-sm text-ai-subtext">
              Sua conta será atualizada com as novas permissões.
            </p>
          </div>

          {/* Resumo do convite */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4 sm:mb-6 space-y-2">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-ai-subtext">Nome</span>
              <span className="font-medium">{invite.name}</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-ai-subtext">E-mail</span>
              <span className="font-medium">{invite.email}</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-ai-subtext">Perfil</span>
              <span className="font-medium capitalize">{invite.role}</span>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-center text-sm font-medium bg-red-50 border border-red-200 rounded-lg py-3 px-4 mb-4">
              {error}
            </p>
          )}

          <button
            onClick={handleAcceptUpgrade}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center py-2.5 sm:py-3 px-4 bg-ai-text text-white rounded-lg hover:bg-black transition-colors font-medium text-xs sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <span>Aceitar convite</span>
                <ArrowRight size={14} className="ml-2" />
              </>
            )}
          </button>

          <p className="text-center text-[10px] sm:text-xs text-ai-subtext mt-4">
            Não reconhece este convite?{' '}
            <button onClick={() => window.location.replace('/')} className="text-ai-text hover:underline font-medium">
              Voltar ao início
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
```

### POSICIONAMENTO NO CÓDIGO

A ordem dos blocos de retorno no componente deve ser:

1. `if (loading)` → spinner
2. `if (!invite?.valid)` → convite inválido/expirado
3. `if (isSuccess)` → sucesso do fluxo new_account (JÁ EXISTE)
4. **`if (invite?.valid && invite.inviteType === 'upgrade')`** → NOVO BLOCO (tem seu próprio isSuccess interno)
5. Formulário de criação de senha → fluxo new_account (JÁ EXISTE)

### ATENÇÃO — O bloco de sucesso existente (isSuccess)

O bloco `if (isSuccess)` existente (linhas 109-129) é usado pelo fluxo de new_account. O fluxo de upgrade tem seu próprio tratamento de sucesso DENTRO do bloco de upgrade.

Para evitar conflito, o bloco de upgrade deve vir ANTES do `if (isSuccess)` existente, pois o early return no upgrade impede que o isSuccess do new_account seja acionado erroneamente.

**Ordem correta**:
```tsx
if (loading) return (...)
if (!invite?.valid) return (...)
if (invite?.valid && invite.inviteType === 'upgrade') return (...) // inclui seu próprio isSuccess
if (isSuccess) return (...) // só para new_account
return (...) // formulário de senha
```

---

## PASSO 6 — Lidar com visitante não logado

Quando um visitante recebe o email e clica no link mas NÃO está logado, o `acceptInvite()` retorna 401. O `handleAcceptUpgrade` já redireciona para `/sign-in`.

### Fluxo de redirect

Atualmente `App.tsx` não processa query param `redirect` no sign-in. Duas opções:

**Opção A (simples, recomendada)**: Após o login, o visitante precisa clicar no link do email novamente. A ConvitePage detecta `inviteType='upgrade'` e mostra o botão aceitar.

**Opção B (melhor UX)**: Modificar `App.tsx` para suportar redirect após login. Isso é mais complexo e pode ser feito como melhoria futura.

### RECOMENDAÇÃO: Usar Opção A nesta fase. No `handleAcceptUpgrade`, quando recebe 401:

```typescript
onToast?.('Faça login primeiro e depois clique novamente no link do email.', 'warning');
setTimeout(() => window.location.replace('/sign-in'), 2000);
```

---

## CHECKLIST DE VALIDAÇÃO — FASE 2

Antes de considerar a fase 2 completa, verificar:

- [ ] Acessar `/convite?token=TOKEN_NEW_ACCOUNT` → mostra formulário de criação de senha (sem regressão)
- [ ] Criar conta via formulário → redireciona para `/sign-in` com toast de sucesso
- [ ] Acessar `/convite?token=TOKEN_UPGRADE` logado como visitante → mostra tela de aceitação
- [ ] Clicar "Aceitar convite" → toast de sucesso, redireciona para `/`
- [ ] Acessar `/convite?token=TOKEN_UPGRADE` SEM estar logado → mostra tela de aceitação, ao clicar recebe mensagem para fazer login
- [ ] Acessar `/convite?token=EXPIRADO` → mostra tela de convite inválido (sem regressão)
- [ ] Acessar `/convite` sem token → mostra tela de convite inválido (sem regressão)

---

## RISCOS E ARMADILHAS

### NÃO FAÇA — Coisas que quebram a aplicação

1. **NÃO remova o fluxo de `handleSubmit` existente** — ele é usado para new_account. O fluxo de upgrade usa `handleAcceptUpgrade` separado.
2. **NÃO altere o `onSuccess` prop** — ele é chamado pelo fluxo new_account para redirecionar ao sign-in. O upgrade redireciona para `/` diretamente.
3. **NÃO altere a rota `/convite` no App.tsx** — ela já funciona. O ConvitePage é o único componente que precisa mudar.
4. **NÃO importe `getAuthHeaders` diretamente** no ConvitePage — use `acceptInvite()` do pessoasClient que já lida com headers de autenticação internamente.
5. **NÃO use `authClient.signUp.email()` para o fluxo de upgrade** — visitante já tem conta, não precisa de signup.
6. **NÃO altere a ordem dos early returns** sem seguir a ordem documentada no PASSO 5 — isso pode fazer o fluxo errado ser renderizado.

### CUIDADOS

1. **Estado `isSubmitting` compartilhado**: Ambos os handlers usam o mesmo state `isSubmitting`. Isso é correto porque apenas um fluxo é renderizado por vez.
2. **Estado `error` compartilhado**: Idem — funciona porque são fluxos mutuamente exclusivos.
3. **Estilo visual**: Manter consistência com o design existente (cores `ai-*`, tamanhos de fonte, border-radius). Não inventar novos padrões de estilo.
