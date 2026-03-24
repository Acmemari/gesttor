# Instrução Padrão de Revisão - Gesttor

> Copie o bloco abaixo, substitua os campos entre `{{...}}` e envie ao agente.

---

```
## Revisão da Tela: {{NOME_DA_TELA}}

Arquivo(s) principal(is): {{CAMINHO_DO_COMPONENTE}}
Endpoint(s) relacionado(s): {{CAMINHO_DA_API}}
Repository/Repositório: {{CAMINHO_DO_REPOSITÓRIO_DB}} (se aplicável)

---

### Contexto da Aplicação Gesttor

O Gesttor é um sistema de gestão agropecuária com as seguintes regras de negócio invioláveis:

**Hierarquia de entidades:**
- Organização → Fazenda(s) → Pessoas → Atividades
- Organização → Projeto(s) → Entrega(s) → Iniciativa(s) → Marco(s) → Tarefa(s)

**Regras de propriedade e acesso:**
1. Toda fazenda DEVE pertencer a uma organização (farms.organizationId NOT NULL)
2. Toda organização DEVE ter um analista principal (organizations.analystId NOT NULL, onDelete: restrict)
3. Organizações podem ter analistas secundários (tabela organizationAnalysts com permissions JSONB)
4. Pessoas pertencem a uma organização (people.organizationId)
5. Pessoas se conectam a fazendas via person_farms (N:N com flag primaryFarm)
6. Projetos, entregas e iniciativas são vinculados a organizationId
7. Iniciativas podem ser vinculadas a uma fazenda específica (initiatives.farmId)

**Regras de autorização (api/_lib/orgAccess.ts):**
- Administrador: acesso total, bypass de todas as verificações
- Analista: só acessa organizações onde é analista principal OU secundário
- Cliente: só acessa sua própria organização
- Visitante: acesso restrito via VisitorContentGuard
- Acesso é hierárquico: org → projeto → entrega → iniciativa → marco → tarefa

**Stack técnica:**
- Frontend: React 19 + TypeScript + Tailwind CSS 4 + Vite 6
- Backend: Vercel Functions (API serverless) com Express 5 em dev
- DB: PostgreSQL (Neon) + Drizzle ORM
- Auth: Better Auth com bearer token via localStorage
- Contextos React: AuthContext, HierarchyContext, FarmContext, ClientContext

---

### O que você DEVE fazer nesta revisão

**FASE 1 — Leitura (NÃO altere nada ainda)**

1. Leia COMPLETAMENTE os arquivos listados acima (componente, API, repositório)
2. Leia o schema relevante em `src/DB/schema.ts` (apenas as tabelas usadas pela tela)
3. Leia `api/_lib/orgAccess.ts` para entender as funções de autorização existentes
4. Leia `api/_lib/betterAuthAdapter.ts` para entender a extração de userId
5. Se a tela usa contextos, leia os contextos relevantes em `contexts/`
6. Identifique TODOS os fluxos de dados: frontend → API → repositório → banco

**FASE 2 — Diagnóstico (relate os problemas encontrados, NÃO corrija ainda)**

Analise e liste problemas encontrados nas seguintes categorias:

**A) Segurança e Autorização:**
- [ ] O endpoint valida o token de autenticação via `getAuthUserIdFromRequest(req)`?
- [ ] O endpoint verifica a role do usuário via `getUserRole(userId)`?
- [ ] O endpoint usa `assertOrgAccess()` ou equivalente para validar acesso à organização?
- [ ] Há verificação de que o recurso pertence à organização do usuário?
- [ ] Dados sensíveis estão expostos desnecessariamente na resposta?
- [ ] Inputs do usuário são validados antes de chegar ao banco?
- [ ] Há risco de IDOR (Insecure Direct Object Reference)?

**B) Integridade de Dados (Regras de Negócio):**
- [ ] Fazendas são sempre criadas/consultadas com organizationId?
- [ ] Organizações sempre mantêm analystId ao ser criadas/editadas?
- [ ] O cascading delete está correto? (farm deleta ao deletar org, etc.)
- [ ] Campos NOT NULL do schema são respeitados nos inserts?
- [ ] Unique constraints são tratadas (ex: cnpj, email)?
- [ ] Foreign keys existem para todas as relações usadas?

**C) Frontend:**
- [ ] O componente respeita o role do usuário (admin/analista/cliente/visitante)?
- [ ] Dados são filtrados por organização antes de exibir?
- [ ] Formulários validam campos obrigatórios antes de enviar?
- [ ] Erros da API são tratados e exibidos ao usuário?
- [ ] Loading states existem durante chamadas async?
- [ ] O componente usa os contextos corretos (AuthContext, HierarchyContext)?

**D) Performance e Qualidade:**
- [ ] Queries usam os índices existentes no schema?
- [ ] Há N+1 queries (loops fazendo queries individuais)?
- [ ] Campos retornados são apenas os necessários (não SELECT *)?
- [ ] useEffect tem dependências corretas?

**FASE 3 — Proposta de Correções**

Para cada problema encontrado na Fase 2:
1. Descreva o problema de forma clara
2. Indique o arquivo e linha exata
3. Proponha a correção mínima necessária
4. Classifique a severidade: CRÍTICO / IMPORTANTE / MELHORIA
5. Indique se a correção pode quebrar algo existente

**Apresente a lista completa e AGUARDE minha aprovação antes de aplicar qualquer mudança.**

---

### O que você NÃO deve fazer

- NÃO altere arquivos sem minha aprovação explícita
- NÃO adicione funcionalidades novas que não foram pedidas
- NÃO refatore código que funciona corretamente apenas por estética
- NÃO mude a estrutura do banco de dados sem discussão prévia
- NÃO adicione bibliotecas ou dependências novas
- NÃO altere arquivos que não estão no escopo da tela sendo revisada
- NÃO assuma como o código funciona — leia o código real antes de diagnosticar
- NÃO invente problemas que não existem no código — seja factual
- NÃO aplique correções em cascata (corrigir A que quebra B que quebra C)
- NÃO remova tratamentos de erro existentes achando que são desnecessários
```

---

## Exemplo de Uso

```
## Revisão da Tela: Gestão de Fazendas

Arquivo(s) principal(is): agents/FarmManagement.tsx
Endpoint(s) relacionado(s): api/farms.ts
Repository/Repositório: src/DB/repositories/hierarchy.ts

[... colar todo o bloco de instrução acima ...]
```

## Variação: Revisão Rápida (apenas segurança)

Se quiser revisar apenas segurança, use apenas a seção A da Fase 2 e adicione:

```
Foque EXCLUSIVAMENTE em problemas de segurança e autorização.
Ignore questões de UI, performance ou estilo de código.
```

## Variação: Revisão de Novo Endpoint

Ao criar um endpoint novo, adicione:

```
Este é um endpoint NOVO. Além da revisão padrão, verifique:
- O padrão segue os endpoints existentes (setCorsHeaders, OPTIONS handler, etc.)
- Usa jsonSuccess/jsonError de api/_lib/apiResponse.ts
- Rate limiting está aplicado se necessário
- O endpoint está registrado no vite.config.ts proxy (dev)
```
