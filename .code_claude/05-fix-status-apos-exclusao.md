# Fix: Status "Ativo" persiste após exclusão de usuário

## Problema

Quando um administrador exclui um usuário pelo AdminDashboard (ação `delete-user`), o registro `ba_user` e `user_profiles` são removidos, **mas o registro na tabela `people` não é atualizado**. O campo `people.user_id` continua apontando para o `ba_user.id` já deletado.

No `PeopleManagement.tsx` (linha 730), a lógica de exibição verifica `if (p.userId)` para mostrar o badge "Ativo". Como `userId` ainda está preenchido (apontando para um usuário inexistente), o status continua aparecendo como **"Ativo"** em vez de **"Convidar"**.

## Causa raiz

**Arquivo:** `api/admin.ts` — ação `delete-user` (linhas 211-278)

A transação de exclusão limpa várias tabelas (`cattle_scenarios`, `saved_questionnaires`, `organization_analysts`, etc.) e no final deleta `user_profiles` e `ba_user`. Porém, **não há nenhum step que atualize a tabela `people`** para desvincular a pessoa do usuário excluído.

## Solução

Adicionar um step na transação de `delete-user` em `api/admin.ts` (antes de deletar `user_profiles` e `ba_user`, ~linha 258) com o seguinte SQL:

```sql
UPDATE people
SET user_id = NULL,
    invite_status = 'none',
    invite_token = NULL,
    invite_expires_at = NULL,
    invite_sent_at = NULL,
    updated_at = NOW()
WHERE user_id = $1
```

### O que isso faz

1. **Desvincula a pessoa** do usuário deletado (`userId = NULL`)
2. **Reseta o status do convite** para `'none'` — permitindo enviar novo convite
3. **Limpa campos de token** expirado/obsoleto

### Onde inserir no código

No array `steps` em `api/admin.ts`, adicionar como **primeiro item** (antes de qualquer DELETE), pois `people.user_id` referencia `ba_user.id`:

```typescript
const steps: Array<{ label: string; sql: string }> = [
  // ← ADICIONAR AQUI
  { label: 'people (reset invite)', sql: `UPDATE people SET user_id = NULL, invite_status = 'none', invite_token = NULL, invite_expires_at = NULL, invite_sent_at = NULL, updated_at = NOW() WHERE user_id = $1` },
  // ... steps existentes
  { label: 'cattle_scenarios', sql: `DELETE FROM cattle_scenarios WHERE user_id = $1` },
  // ...
];
```

## Arquivos envolvidos

| Arquivo | Ação |
|---------|------|
| `api/admin.ts` | Adicionar 1 step SQL na transação `delete-user` |

## Lógica de exibição no frontend (referência)

`agents/PeopleManagement.tsx` (linhas 729-774):
- `p.userId` preenchido → mostra **"Ativo"** (verde)
- `p.inviteStatus === 'pending'` → mostra **"Aguardando aceite"** (âmbar)
- `!p.email` → mostra **"Sem email"** (cinza)
- Caso contrário → mostra **"Convidar"** (azul)

Com a correção, após excluir o usuário, `userId` será `NULL` e `inviteStatus` será `'none'`, fazendo a pessoa cair no caso "Convidar".

## Verificação

1. No AdminDashboard, excluir um usuário que também aparece como pessoa no PeopleManagement
2. Ir ao PeopleManagement e verificar que a pessoa agora mostra botão **"Convidar"** (azul) em vez de **"Ativo"** (verde)
3. Verificar que é possível reenviar convite para essa pessoa e que ela consegue criar nova conta
