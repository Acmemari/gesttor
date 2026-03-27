# Diagnostico do Banco de Dados - Queries SQL

> **Objetivo:** Rodar estas queries no console do Neon (ou qualquer client PostgreSQL) ANTES de aplicar as correcoes do schema. Os resultados determinam se e seguro adicionar cada FK/constraint.

---

## 1. userProfiles orfaos (sem ba_user correspondente)

```sql
SELECT up.id, up.email, up.name, up.role
FROM user_profiles up
LEFT JOIN ba_user bu ON bu.id = up.id
WHERE bu.id IS NULL;
```

**Se retornar linhas:** Esses perfis nao tem usuario de autenticacao correspondente. Opcoes:
- Deletar os orfaos: `DELETE FROM user_profiles WHERE id NOT IN (SELECT id FROM ba_user);`
- Ou investigar se sao registros validos que precisam de um ba_user criado manualmente.

**Se retornar vazio:** Seguro adicionar FK.

---

## 2. people.user_id orfaos (apontando para user inexistente)

```sql
SELECT p.id, p.full_name, p.user_id, p.email
FROM people p
WHERE p.user_id IS NOT NULL
  AND p.user_id NOT IN (SELECT id FROM user_profiles);
```

**Se retornar linhas:** Essas pessoas estao vinculadas a usuarios que nao existem em user_profiles. Opcoes:
- Limpar a referencia: `UPDATE people SET user_id = NULL WHERE user_id NOT IN (SELECT id FROM user_profiles);`
- Ou criar os user_profiles faltantes.

**Se retornar vazio:** Seguro adicionar FK.

---

## 3. organizations.owner_id orfaos

```sql
SELECT o.id, o.name, o.owner_id
FROM organizations o
WHERE o.owner_id IS NOT NULL
  AND o.owner_id NOT IN (SELECT id FROM user_profiles);
```

**Se retornar linhas:** Organizacoes com owner_id apontando para usuario inexistente. Opcoes:
- Limpar: `UPDATE organizations SET owner_id = NULL WHERE owner_id IS NOT NULL AND owner_id NOT IN (SELECT id FROM user_profiles);`

**Se retornar vazio:** Seguro adicionar FK.

---

## 4. personPermissions com duplicatas (pessoa_id + farm_id)

```sql
SELECT pessoa_id, farm_id, COUNT(*) as duplicatas
FROM person_permissions
GROUP BY pessoa_id, farm_id
HAVING COUNT(*) > 1;
```

**Se retornar linhas:** Existem permissoes duplicadas. Para manter apenas a mais recente de cada par:
```sql
DELETE FROM person_permissions pp
WHERE pp.id NOT IN (
  SELECT DISTINCT ON (pessoa_id, farm_id) id
  FROM person_permissions
  ORDER BY pessoa_id, farm_id, updated_at DESC
);
```

**Se retornar vazio:** Seguro adicionar unique index.

---

## 5. Tabela assignees (pessoas legacy)

```sql
-- Verificar se tem dados
SELECT COUNT(*) as total_registros FROM assignees;

-- Verificar se alguma outra tabela referencia
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'assignees';
```

**Se total = 0 e sem FKs:** Seguro remover a tabela do schema (e opcionalmente dropar: `DROP TABLE IF EXISTS assignees;`)
**Se total > 0:** Investigar se os dados sao necessarios antes de remover.

---

## 6. cattleScenarios e savedQuestionnaires - FKs orfas

```sql
-- Cenarios com organization_id invalido
SELECT id, name, organization_id
FROM cattle_scenarios
WHERE organization_id IS NOT NULL
  AND organization_id::uuid NOT IN (SELECT id FROM organizations);

-- Cenarios com farm_id invalido
SELECT id, name, farm_id
FROM cattle_scenarios
WHERE farm_id IS NOT NULL
  AND farm_id NOT IN (SELECT id FROM farms);

-- Questionarios com organization_id invalido
SELECT id, name, organization_id
FROM saved_questionnaires
WHERE organization_id IS NOT NULL
  AND organization_id::uuid NOT IN (SELECT id FROM organizations);

-- Questionarios com farm_id invalido
SELECT id, name, farm_id
FROM saved_questionnaires
WHERE farm_id IS NOT NULL
  AND farm_id NOT IN (SELECT id FROM farms);
```

> **ATENCAO:** As colunas organization_id nestas tabelas sao `text` enquanto organizations.id e `uuid`. Se o cast `::uuid` falhar, significa que os valores armazenados NAO sao UUIDs validos e a FK NAO deve ser adicionada.

**Se retornar erro de cast:** NAO adicionar FK em organization_id (tipos incompativeis).
**Se retornar linhas:** Limpar orfaos antes de adicionar FK.
**Se retornar vazio:** Seguro adicionar FK.

---

## 7. Semanas sem fazenda vinculada

```sql
SELECT id, numero, modo, aberta, data_inicio, data_fim
FROM work_weeks
WHERE farm_id IS NULL;
```

**Se retornar linhas:** Existem semanas sem fazenda. Avaliar se isso e intencional (ex: modo global) ou se deveria ser NOT NULL.
**Se retornar vazio:** Considerar tornar farm_id NOT NULL no schema.

---

## Resumo de Acoes por Resultado

| Query | Resultado Vazio | Resultado com Dados |
|-------|----------------|---------------------|
| 1. userProfiles orfaos | Adicionar FK | Limpar orfaos primeiro |
| 2. people.user_id orfaos | Adicionar FK | Setar NULL nos orfaos |
| 3. organizations.owner_id orfaos | Adicionar FK | Setar NULL nos orfaos |
| 4. personPermissions duplicatas | Adicionar unique index | Remover duplicatas primeiro |
| 5. Tabela assignees | Remover do schema | Investigar dados |
| 6. cattle_scenarios/saved_questionnaires | Adicionar FKs | Verificar tipo antes |
| 7. work_weeks sem farm | Considerar NOT NULL | Manter nullable |
