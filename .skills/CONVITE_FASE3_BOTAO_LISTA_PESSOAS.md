# FASE 3 — Frontend: Botão "Convidar" na Lista de Pessoas (PeopleManagement)

> **Objetivo**: Ajustar o botão "Convidar" para funcionar corretamente nos dois cenários:
> 1. Pessoa sem conta → botão "Convidar" (já funciona)
> 2. Pessoa com conta visitante → botão "Convidar" visível (atualmente escondido atrás de "Ativo")
>
> **Pré-requisito**: FASE 1 e FASE 2 concluídas
> **Complexidade**: Baixa | **Risco**: Baixo (apenas alterações visuais na lista)

---

## CONTEXTO OBRIGATÓRIO — Leia antes de começar

### Arquivo que você VAI modificar
| Arquivo | O que fazer |
|---|---|
| `agents/PeopleManagement.tsx` | Ajustar lógica do botão de convite na lista de pessoas |

### Arquivos que você NÃO deve modificar nesta fase
- `api/invite.ts` → já modificado na FASE 1
- `components/ConvitePage.tsx` → já modificado na FASE 2
- `lib/api/pessoasClient.ts` → já modificado na FASE 2
- `src/DB/schema.ts` → já modificado na FASE 1

### Estado atual do botão (linhas 723-748 de PeopleManagement.tsx)

```tsx
{p.userId ? (
  <span className="...bg-emerald-50 text-emerald-700...">
    <Check size={11} /> Ativo
  </span>
) : p.inviteStatus === 'pending' ? (
  <button onClick={() => handleSendInvite(p)} ...>
    Reenviar  {/* Convite pendente */}
  </button>
) : (
  <button onClick={() => handleSendInvite(p)} ...>
    <Mail size={11} /> Convidar  {/* Sem convite enviado */}
  </button>
) : null}
```

**Problema**: Se `p.userId` existe (qualquer role), mostra "Ativo". Não diferencia visitante de outros roles.

---

## PASSO 1 — Adicionar campo ao tipo `Pessoa`

**Arquivo**: `lib/api/pessoasClient.ts`

A interface `Pessoa` NÃO tem o campo `role` do user (é o role da tabela `people`, não do `user_profiles`). Para saber se o usuário vinculado é visitante, precisamos de uma abordagem.

### Abordagem recomendada: Usar `inviteStatus` como indicador

Em vez de buscar o role do user_profiles (que exigiria JOIN adicional na API de pessoas), usar a lógica:

- `p.userId` existe E `p.inviteStatus === 'accepted'` → conta ativa com permissões → mostrar "Ativo"
- `p.userId` existe E `p.inviteStatus !== 'accepted'` (none/pending/expired) → visitante que se cadastrou sozinho → mostrar "Convidar"
- `p.userId` não existe E `p.inviteStatus === 'pending'` → convite enviado, aguardando signup → mostrar "Pendente / Reenviar"
- `p.userId` não existe E `p.inviteStatus !== 'pending'` → sem convite → mostrar "Convidar"

### PORÉM — Há um problema com essa abordagem

Um visitante que se cadastrou sozinho (sem convite) teria `inviteStatus='none'` e `userId` preenchido. Essa combinação é exatamente o caso que queremos capturar.

**Lógica final simplificada**:

| userId | inviteStatus | O que mostrar |
|---|---|---|
| presente | `'accepted'` | Badge "Ativo" (verde) |
| presente | qualquer outro | Botão "Convidar" (azul) — é visitante |
| ausente | `'pending'` | Botão "Pendente" (amarelo) — reenviar |
| ausente | qualquer outro | Botão "Convidar" (azul) — novo convite |

---

## PASSO 2 — Substituir lógica do botão na lista

**Arquivo**: `agents/PeopleManagement.tsx`

Localizar o bloco do botão de convite (linhas ~723-748) e SUBSTITUIR por:

```tsx
{/* Botão de convite / status */}
{(() => {
  // Pessoa com conta E convite aceito → ativo
  if (p.userId && p.inviteStatus === 'accepted') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700"
        title="Usuário com conta ativa e permissões configuradas"
      >
        <Check size={11} /> Ativo
      </span>
    );
  }

  // Convite pendente (com ou sem conta) → reenviar
  if (p.inviteStatus === 'pending') {
    return (
      <button
        onClick={() => handleSendInvite(p)}
        disabled={sendingInvite === p.id}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
        title="Reenviar convite"
      >
        {sendingInvite === p.id ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
        Pendente
      </button>
    );
  }

  // Pessoa sem email → não pode convidar
  if (!p.email) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-400"
        title="Cadastre um email para poder convidar"
      >
        <Mail size={11} /> Sem email
      </span>
    );
  }

  // Todos os outros casos → botão convidar
  // Inclui: pessoa sem conta, ou pessoa com conta visitante (userId + inviteStatus='none')
  return (
    <button
      onClick={() => handleSendInvite(p)}
      disabled={sendingInvite === p.id}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
      title={p.userId ? 'Convidar para atualizar permissões (visitante)' : 'Enviar convite por email'}
    >
      {sendingInvite === p.id ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
      Convidar
    </button>
  );
})()}
```

### POR QUE usar IIFE `(() => { ... })()`?

A lógica tem 4 branches com early returns. Um ternário triplo seria ilegível. A IIFE mantém o JSX limpo e cada caso é claro.

---

## PASSO 3 — Atualizar toast de sucesso

No `handleSendInvite` existente (linhas ~560-571), o toast é genérico. Melhorar para indicar o tipo:

**ANTES**:
```typescript
const handleSendInvite = async (p: Pessoa) => {
  if (!p.email) { onToast?.('Pessoa sem email cadastrado', 'warning'); return; }
  setSendingInvite(p.id);
  try {
    await sendInvite(p.id);
    onToast?.(`Convite enviado para ${p.email}`, 'success');
    loadPessoas();
  } catch (e) {
    onToast?.(e instanceof Error ? e.message : 'Erro ao enviar convite', 'error');
  } finally {
    setSendingInvite(null);
  }
};
```

**DEPOIS**:
```typescript
const handleSendInvite = async (p: Pessoa) => {
  if (!p.email) { onToast?.('Pessoa sem email cadastrado', 'warning'); return; }
  setSendingInvite(p.id);
  try {
    const result = await sendInvite(p.id);
    const typeLabel = result.inviteType === 'upgrade'
      ? 'Convite de atualização'
      : 'Convite';
    onToast?.(`${typeLabel} enviado para ${p.email}`, 'success');
    loadPessoas();
  } catch (e) {
    onToast?.(e instanceof Error ? e.message : 'Erro ao enviar convite', 'error');
  } finally {
    setSendingInvite(null);
  }
};
```

### ATENÇÃO — Atualizar tipo de retorno do `sendInvite`

No `lib/api/pessoasClient.ts`, o retorno de `sendInvite` precisa incluir `inviteType`:

```typescript
export async function sendInvite(pessoaId: string): Promise<{ email: string; inviteRole: string; inviteType: string; expiresAt: string }> {
```

Isso é uma mudança retrocompatível — apenas adiciona um campo ao retorno.

---

## PASSO 4 — Verificar estado `sendingInvite`

Confirmar que o state `sendingInvite` já existe no componente. Deve estar declarado como:

```typescript
const [sendingInvite, setSendingInvite] = useState<string | null>(null);
```

Se não existir, adicioná-lo na seção de state do componente.

---

## CHECKLIST DE VALIDAÇÃO — FASE 3

Antes de considerar a fase 3 completa, verificar:

### Cenário A — Pessoa sem conta, sem email
- [ ] Mostra badge cinza "Sem email"
- [ ] NÃO mostra botão de convite clicável

### Cenário B — Pessoa sem conta, com email, sem convite
- [ ] Mostra botão azul "Convidar"
- [ ] Ao clicar → envia convite → toast "Convite enviado para xxx"
- [ ] Após envio → botão muda para "Pendente" (amarelo)

### Cenário C — Pessoa sem conta, convite pendente
- [ ] Mostra botão amarelo "Pendente"
- [ ] Ao clicar → reenvia convite → toast de sucesso

### Cenário D — Pessoa com conta, convite aceito
- [ ] Mostra badge verde "Ativo"
- [ ] NÃO mostra botão de convite

### Cenário E — Pessoa com conta visitante (userId + inviteStatus='none')
- [ ] Mostra botão azul "Convidar"
- [ ] Tooltip mostra "Convidar para atualizar permissões (visitante)"
- [ ] Ao clicar → envia convite de upgrade → toast "Convite de atualização enviado"
- [ ] Após envio → botão muda para "Pendente" (amarelo)

### Cenário F — Recarregar lista
- [ ] Após enviar convite, `loadPessoas()` atualiza a lista
- [ ] Estados dos botões refletem `inviteStatus` atualizado do servidor

---

## RISCOS E ARMADILHAS

### NÃO FAÇA — Coisas que quebram a aplicação

1. **NÃO remova o `handleSendInvite` existente** — apenas modifique o toast. A função `sendInvite()` do pessoasClient.ts continua sendo a mesma para ambos os cenários (new_account e upgrade). O backend decide o tipo.
2. **NÃO adicione chamadas adicionais ao backend** para verificar o role do user_profiles — isso adicionaria latência e complexidade. Use `inviteStatus` como proxy.
3. **NÃO modifique a API `/api/pessoas`** para incluir role do user_profiles — isso quebraria o contrato da API e pode ter efeitos colaterais em outros componentes que consomem a mesma API.
4. **NÃO altere o comportamento do botão de editar/deletar** — eles são independentes do convite.
5. **NÃO remova o check `if (!p.email)`** do handleSendInvite — pessoas sem email NÃO podem receber convite.

### CUIDADOS

1. **Race condition visual**: Se o admin clica "Convidar" e a pessoa aceita imediatamente (em outra aba), a lista não reflete o status atualizado até o próximo `loadPessoas()`. Isso é aceitável — basta clicar para atualizar.
2. **Pessoa com conta visitante + convite expirado**: `inviteStatus` seria 'expired'. A lógica mostra "Convidar" (correto — pode reenviar).
3. **Ordem dos checks na IIFE**: A ordem importa! `accepted` primeiro, depois `pending`, depois `!email`, depois default. Alterar a ordem pode mostrar o botão errado.

---

## RESUMO VISUAL DOS ESTADOS DO BOTÃO

```
┌─────────────────────────────────────────────────────────┐
│ PESSOA NA LISTA                                          │
├──────────┬──────────────┬────────────────────────────────┤
│ userId   │ inviteStatus │ Botão                          │
├──────────┼──────────────┼────────────────────────────────┤
│ presente │ accepted     │ ✓ Ativo          (verde)       │
│ presente │ pending      │ ✉ Pendente       (amarelo)     │
│ presente │ none/expired │ ✉ Convidar       (azul)        │
│ ausente  │ pending      │ ✉ Pendente       (amarelo)     │
│ ausente  │ none/expired │ ✉ Convidar       (azul)        │
│ ausente  │ * (sem email)│   Sem email      (cinza)       │
└──────────┴──────────────┴────────────────────────────────┘
```

---

## PÓS-IMPLEMENTAÇÃO — Teste End-to-End Completo

Após completar as 3 fases, executar o teste completo:

### Teste 1 — Novo usuário
1. Admin cadastra pessoa com email `novo@teste.com`, configura fazenda, perfil, cargo, permissões
2. Admin clica "Convidar" → botão muda para "Pendente"
3. Email chega com link "Criar minha senha"
4. Pessoa clica → ConvitePage mostra formulário de senha
5. Pessoa cria senha → redirecionado para login
6. Pessoa faz login → acessa plataforma com role e org corretos
7. Na lista, pessoa mostra badge "Ativo"

### Teste 2 — Visitante existente
1. Visitante se cadastra sozinho em `visitante@teste.com` → role=visitante
2. Admin cadastra pessoa com mesmo email, configura fazenda, perfil, cargo
3. Admin clica "Convidar" → botão muda para "Pendente"
4. Email chega com link "Aceitar convite"
5. Visitante (logado) clica → ConvitePage mostra tela de aceitação com resumo
6. Visitante clica "Aceitar" → toast sucesso, redirecionado para home
7. Visitante tem role atualizado, acesso à org e fazendas
8. Na lista, pessoa mostra badge "Ativo"

### Teste 3 — Reenvio
1. Admin envia convite → botão "Pendente"
2. Token expira (ou admin quer reenviar)
3. Admin clica "Pendente" → novo token gerado, novo email enviado
4. Link anterior para de funcionar, novo link funciona
