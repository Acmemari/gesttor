# Etapa 1 — Backend: Suporte a Subtarefas

## Objetivo
Adicionar suporte a subtarefas na tabela `atividades` através de uma coluna `parent_id` (auto-referência). Ajustar repositório, API e client HTTP para suportar o novo campo.

---

## O QUE FAZER

### 1.1 Schema — `src/DB/schema.ts`

- Adicionar coluna `parentId` na tabela `atividades`:
  ```ts
  parentId: uuid('parent_id').references(() => atividades.id, { onDelete: 'cascade' }),
  ```
- Adicionar índice para queries eficientes:
  ```ts
  index('idx_activities_parent_id').on(t.parentId),
  ```
- A coluna é **nullable** (tarefas normais/pai têm `parent_id = null`)
- `onDelete: 'cascade'` garante que ao deletar a tarefa pai, todas as subtarefas são removidas automaticamente pelo banco

### 1.2 Repositório — `src/DB/repositories/semanas.ts`

- Em `listAtividadesBySemana`: não precisa alterar a query, pois o Drizzle retorna todas as colunas. Verificar se `parentId` já é incluído automaticamente no select.
- Em `createAtividade`: aceitar campo `parent_id` no payload de criação. Mapear para `parentId` do Drizzle.
- Em `createAtividadesBulk`: aceitar campo `parent_id` em cada item do array.
- Em `updateAtividade`: aceitar campo `parent_id` no partial update.
- **NÃO alterar** `deleteAtividade` — o cascade do banco resolve a exclusão de subtarefas.
- **NÃO alterar** `deleteAtividadesBySemana` — já deleta tudo da semana.

### 1.3 API — `api/atividades.ts`

- **POST** (criação individual):
  - Aceitar campo `parent_id` no body (opcional, string UUID ou null)
  - Se `parent_id` for fornecido, verificar que a atividade pai existe e pertence à mesma semana
  - Validação: `parent_id` não pode referenciar uma subtarefa (impedir subtarefas de subtarefas — apenas 1 nível)
  - Passar `parent_id` para `createAtividade()`

- **POST bulk** (carry-over):
  - Aceitar `parent_id` em cada item
  - No carry-over, subtarefas devem manter a referência ao novo pai na nova semana (o frontend vai mapear os IDs)

- **PATCH** (atualização):
  - Aceitar `parent_id` no body para permitir mover uma subtarefa de pai
  - Adicionar na seção de `partial`: `if (body.parent_id !== undefined) partial.parent_id = body.parent_id ? String(body.parent_id) : null;`

- **GET**: sem alteração necessária — já retorna todos os campos

- **DELETE**: sem alteração — cascade resolve

### 1.4 Client HTTP — `lib/api/semanasClient.ts`

- Adicionar `parent_id: string | null` ao tipo `AtividadeRow`
- Em `createAtividade()`: adicionar `parent_id` ao payload (opcional)
- Em `createAtividadesBulk()`: adicionar `parent_id` aos items
- Em `updateAtividade()`: aceitar `parent_id` no partial

### 1.5 Aplicar Migration

- Executar: `npx drizzle-kit push`
- Verificar no banco que a coluna `parent_id` foi criada com constraint de FK e cascade

---

## O QUE NÃO FAZER

- **NÃO** criar uma tabela separada para subtarefas. Subtarefas são `atividades` com `parent_id` preenchido.
- **NÃO** permitir mais de 1 nível de aninhamento. Validar que `parent_id` nunca aponte para outra subtarefa.
- **NÃO** alterar a interface de retorno do GET — o frontend vai organizar a hierarquia.
- **NÃO** alterar nenhuma lógica de autenticação/autorização existente (`assertSemanaAccess` continua igual).
- **NÃO** alterar a tabela `historicoSemanas` ou `semanas`.
- **NÃO** alterar o endpoint `/api/semanas.ts`.
- **NÃO** remover nenhum campo existente da tabela `atividades`.
- **NÃO** alterar o comportamento do status — subtarefas usam o mesmo sistema de status.
- **NÃO** alterar os valores válidos de status (`a fazer`, `em andamento`, `pausada`, `concluída`).
- **NÃO** fazer nenhuma alteração no frontend nesta etapa.
- **NÃO** quebrar a API existente — todas as chamadas sem `parent_id` devem continuar funcionando normalmente (parent_id = null por padrão).

---

## Arquivos Alterados

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| `src/DB/schema.ts` | Adicionar coluna + índice |
| `src/DB/repositories/semanas.ts` | Aceitar parent_id em create/update |
| `api/atividades.ts` | Aceitar parent_id em POST/PATCH + validação |
| `lib/api/semanasClient.ts` | Tipo + payload |

## Validação

1. `npx drizzle-kit push` executa sem erro
2. Criar atividade sem `parent_id` funciona como antes
3. Criar atividade com `parent_id` válido retorna a atividade com o campo preenchido
4. Deletar tarefa pai remove automaticamente as subtarefas
5. Tentar criar subtarefa de subtarefa retorna erro 400
