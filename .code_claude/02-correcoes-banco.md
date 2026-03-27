# Correcoes do Banco de Dados - Instrucoes Detalhadas

> **PRE-REQUISITO:** Rodar TODAS as queries do arquivo `01-diagnostico-banco.md` e limpar dados orfaos ANTES de aplicar estas correcoes.

---

## Correcao 1 — FK em `userProfiles.id` -> `ba_user.id`

**Arquivo:** `src/DB/schema.ts` (linha ~146)

**Antes:**
```ts
export const userProfiles = pgTable('user_profiles', {
  id: text('id').primaryKey(),
```

**Depois:**
```ts
export const userProfiles = pgTable('user_profiles', {
  id: text('id').primaryKey().references(() => baUser.id, { onDelete: 'cascade' }),
```

**O que faz:** Garante que todo perfil de usuario tem um registro de autenticacao correspondente. Ao deletar um ba_user, o perfil e removido automaticamente (cascade).

**Risco:** Se existirem user_profiles com IDs que nao existem em ba_user, o `drizzle-kit push` vai FALHAR. Por isso o diagnostico e obrigatorio.

**Efeito cascade:** Deletar ba_user -> deleta user_profiles -> deleta organizations (via analyst_id RESTRICT - VAI BLOQUEAR se o analista tem orgs), deleta support_tickets, etc.

> **ATENCAO:** O `onDelete: 'cascade'` pode parecer perigoso aqui. Se um usuario de auth for deletado, o perfil some, MAS a organizacao NAO sera deletada porque `organizations.analystId` usa `onDelete: 'restrict'`. Ou seja: nao e possivel deletar um ba_user que e analista de alguma organizacao. Isso e o comportamento CORRETO.

---

## Correcao 2 — FK em `people.userId` -> `userProfiles.id`

**Arquivo:** `src/DB/schema.ts` (linha ~219)

**Antes:**
```ts
  userId: text('user_id'),
```

**Depois:**
```ts
  userId: text('user_id').references(() => userProfiles.id, { onDelete: 'set null' }),
```

**O que faz:** Garante que o vinculo pessoa<->usuario aponta para um usuario real. Ao deletar um userProfile, o campo e setado para NULL (pessoa continua existindo, so perde o vinculo).

**Risco:** Se existirem people com user_id que nao existe em user_profiles, o push falha.

---

## Correcao 3 — FK em `organizations.ownerId` -> `userProfiles.id`

**Arquivo:** `src/DB/schema.ts` (linha ~117)

**Antes:**
```ts
  ownerId: text('owner_id'),
```

**Depois:**
```ts
  ownerId: text('owner_id').references(() => userProfiles.id, { onDelete: 'set null' }),
```

**O que faz:** Garante que o proprietario da org aponta para um usuario real. Ao deletar o userProfile, owner_id vira NULL.

**Risco:** Se existirem organizations com owner_id que nao existe em user_profiles, o push falha.

---

## Correcao 4 — Unique index em `personPermissions`

**Arquivo:** `src/DB/schema.ts` (linhas ~283-292)

**Antes:**
```ts
export const personPermissions = pgTable('person_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pessoaId: uuid('pessoa_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  assumeTarefasFazenda: boolean('assume_tarefas_fazenda').default(false),
  podeAlterarSemanaFechada: boolean('pode_alterar_semana_fechada').default(false),
  podeApagarSemana: boolean('pode_apagar_semana').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**Depois:**
```ts
export const personPermissions = pgTable('person_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pessoaId: uuid('pessoa_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  assumeTarefasFazenda: boolean('assume_tarefas_fazenda').default(false),
  podeAlterarSemanaFechada: boolean('pode_alterar_semana_fechada').default(false),
  podeApagarSemana: boolean('pode_apagar_semana').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('person_permissions_pessoa_farm_uidx').on(t.pessoaId, t.farmId),
]);
```

**O que faz:** Impede que a mesma pessoa tenha duas linhas de permissao para a mesma fazenda.

**Risco:** Se existirem duplicatas, o push falha. O diagnostico query 4 verifica isso.

---

## Correcao 5 — Remover tabela `pessoas` (assignees) do schema

**Arquivo:** `src/DB/schema.ts` (linhas ~296-299)

**SOMENTE se o diagnostico query 5 confirmar que:**
- A tabela `assignees` tem 0 registros
- Nenhuma FK referencia ela

**Remover estas linhas:**
```ts
export const pessoas = pgTable('assignees', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
});
```

**Apos remover do schema, dropar a tabela no banco:**
```sql
DROP TABLE IF EXISTS assignees;
```

**O que faz:** Remove uma tabela legacy que nao e usada por nenhum codigo. A tabela `people` e a que realmente armazena pessoas.

**Risco:** Nenhum, se confirmado que nao e usada. Ja foi verificado via grep que nenhum arquivo TypeScript importa `pessoas` do schema.

---

## Correcao 6 — FKs em `cattleScenarios`

**Arquivo:** `src/DB/schema.ts` (linhas ~603-614)

> **CONDICIONAL:** So aplicar se o diagnostico query 6 confirmar que os valores de organization_id sao UUIDs validos e nao ha orfaos.

**Antes:**
```ts
  organizationId: text('organization_id'),
  farmId: text('farm_id'),
```

**Depois (se viavel):**
```ts
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
```

> **IMPORTANTE:** `organizations.id` e `uuid` mas `cattleScenarios.organizationId` e `text`. O PostgreSQL pode rejeitar a FK por incompatibilidade de tipos. Se o cast `::uuid` falhou no diagnostico, NAO aplique esta correcao. Neste caso, a solucao correta seria alterar a coluna para `uuid`, o que requer migracao de dados.

---

## Correcao 7 — FKs em `savedQuestionnaires`

**Arquivo:** `src/DB/schema.ts` (linhas ~616-628)

Mesma logica da Correcao 6. So aplicar se diagnostico confirmar compatibilidade.

**Antes:**
```ts
  organizationId: text('organization_id'),
  farmId: text('farm_id'),
```

**Depois (se viavel):**
```ts
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  farmId: text('farm_id').references(() => farms.id, { onDelete: 'set null' }),
```

---

## Correcao 8 — Transacoes em `src/DB/repositories/pessoas.ts`

### 8a. Funcao `addPessoaPerfil`

Localizar o padrao de delete + insert e envolver em transacao:

**Antes (padrao aproximado):**
```ts
await db.delete(personProfiles).where(eq(personProfiles.pessoaId, pessoaId));
await db.insert(personProfiles).values({ ... });
```

**Depois:**
```ts
await db.transaction(async (tx) => {
  await tx.delete(personProfiles).where(eq(personProfiles.pessoaId, pessoaId));
  await tx.insert(personProfiles).values({ ... });
});
```

### 8b. Funcao `setPrimaryFazenda`

**Antes (padrao aproximado):**
```ts
await db.update(personFarms).set({ primaryFarm: false }).where(eq(personFarms.pessoaId, pessoaId));
await db.update(personFarms).set({ primaryFarm: true }).where(and(eq(personFarms.pessoaId, pessoaId), eq(personFarms.farmId, farmId)));
```

**Depois:**
```ts
await db.transaction(async (tx) => {
  await tx.update(personFarms).set({ primaryFarm: false }).where(eq(personFarms.pessoaId, pessoaId));
  await tx.update(personFarms).set({ primaryFarm: true }).where(and(eq(personFarms.pessoaId, pessoaId), eq(personFarms.farmId, farmId)));
});
```

**O que faz:** Garante que se o segundo comando falhar, o primeiro e revertido. Sem transacao, a pessoa ficaria sem fazenda primaria.

---

## Correcao 9 — Transacoes em `src/DB/repositories/initiatives.ts`

### 9a. Funcao `createInitiativeWithTeamAndMilestones`

Envolver a criacao da initiative + team + milestones em uma unica transacao.

### 9b. Funcao `replaceParticipants`

**Antes:**
```ts
await db.delete(initiativeParticipants).where(eq(initiativeParticipants.initiativeId, initiativeId));
await db.insert(initiativeParticipants).values(participants.map(...));
```

**Depois:**
```ts
await db.transaction(async (tx) => {
  await tx.delete(initiativeParticipants).where(eq(initiativeParticipants.initiativeId, initiativeId));
  if (participants.length > 0) {
    await tx.insert(initiativeParticipants).values(participants.map(...));
  }
});
```

---

## Correcao 10 — Transacoes em `src/DB/repositories/organizations.ts`

### Funcao `saveOrganizationOwners`

**Antes:**
```ts
await db.delete(organizationOwners).where(eq(organizationOwners.organizationId, orgId));
await db.insert(organizationOwners).values(owners.map(...));
```

**Depois:**
```ts
await db.transaction(async (tx) => {
  await tx.delete(organizationOwners).where(eq(organizationOwners.organizationId, orgId));
  if (owners.length > 0) {
    await tx.insert(organizationOwners).values(owners.map(...));
  }
});
```

---

## Ordem de Aplicacao

1. Rodar **TODAS** as queries do `01-diagnostico-banco.md`
2. Limpar dados orfaos conforme indicado nos resultados
3. Aplicar correcoes 1-5 no schema (FKs + unique index + remover tabela legacy)
4. Aplicar correcoes 6-7 SOMENTE se diagnostico confirmou viabilidade
5. Aplicar correcoes 8-10 nos repositories (transacoes)
6. Rodar `npx drizzle-kit push` para aplicar mudancas no banco
7. Testar: login, criar org, vincular pessoa, criar permissoes

---

## Rollback (se algo der errado)

As alteracoes no schema sao apenas adicao de constraints. Se o `drizzle-kit push` falhar:
- **Nada e aplicado** — PostgreSQL e transacional, falha = rollback automatico
- Basta corrigir os dados orfaos e rodar push novamente

As alteracoes nos repositories (transacoes) sao 100% retrocompativeis:
- O comportamento funcional e identico
- A unica diferenca e que agora operacoes compostas sao atomicas
- Nao ha risco de quebra
