# Instrucao de Revisao de Codigo Pre-Commit — /revisar

## Uso

```
/revisar <tela-ou-funcionalidade>
```

Exemplos: `/revisar farms`, `/revisar GestaoSemanal`, `/revisar deliveries`, `/revisar auth`, `/revisar semanas`

## Objetivo

Realizar revisao estruturada e completa de uma tela ou funcionalidade do Gesttor, analisando todas as camadas (banco, backend, frontend) para identificar inconsistencias, riscos e problemas antes de um commit. Reduzir risco de quebra, aumentar robustez e garantir consistencia entre camadas.

---

## Fase 1: Descoberta de Arquivos

Dado o argumento `<tela-ou-funcionalidade>`, localize todos os arquivos relevantes. Nao assuma nomes — sempre busque.

### Estrategia de busca

1. **Schema do banco**: Leia `src/DB/schema.ts` e identifique as tabelas relacionadas ao tema
2. **Repositorios**: Busque em `src/DB/repositories/*.ts` por arquivos que importam ou operam nas tabelas identificadas
3. **Rotas API**: Busque em `api/*.ts` por arquivos cujo nome ou conteudo corresponda a funcionalidade
4. **Libs de API**: Verifique `api/_lib/*.ts` para helpers utilizados pelas rotas encontradas (ex: `orgAccess.ts`, `betterAuthAdapter.ts`)
5. **Clientes HTTP**: Busque em `lib/api/*Client.ts` pelo client que consome as rotas identificadas
6. **Paginas frontend**: Busque em `agents/*.tsx` pela tela correspondente
7. **Componentes**: Use Grep para encontrar componentes em `components/*.tsx` importados pela pagina
8. **Contextos**: Verifique `contexts/*.tsx` usados pela pagina
9. **Tipos**: Verifique `types.ts` na raiz para os tipos compartilhados relevantes
10. **Utilitarios**: Verifique `lib/utils/*.ts` para mappers ou validadores usados

### Comando pratico

Use Glob e Grep para buscar:
- `Glob("src/DB/repositories/*<keyword>*")` ou Grep pelo keyword dentro dos repositorios
- `Glob("api/*<keyword>*")` para rotas
- `Glob("lib/api/*<keyword>*")` para clients
- `Glob("agents/*<keyword>*")` para paginas
- Siga os `import` de cada arquivo encontrado para descobrir dependencias transitivas

Ao final desta fase, liste todos os arquivos identificados agrupados por camada antes de prosseguir.

---

## Fase 2: Revisao por Camada

Leia CADA arquivo identificado e analise conforme os checklists abaixo. Seja especifico — cite linhas e trechos com problemas.

### 2.1 Camada de Banco de Dados (`src/DB/schema.ts` + `src/DB/repositories/`)

- [ ] Tabelas possuem todas as colunas necessarias para a funcionalidade?
- [ ] Foreign keys estao declaradas com `references()` e `onDelete` adequado (cascade vs restrict)?
- [ ] Campos obrigatorios tem `.notNull()`?
- [ ] Campos com valores padrao usam `.default()` ou `.defaultNow()` onde faz sentido?
- [ ] Existem indexes para colunas usadas em WHERE/JOIN frequentes?
- [ ] Tipos numericos estao corretos (`numeric` vs `integer` vs `bigint`)?
- [ ] O repositorio usa parametros tipados (ex: `CreateXInput`, `UpdateXInput`)?
- [ ] Queries do repositorio filtram por `organizationId` ou `farmId` para garantir isolamento de dados entre organizacoes?
- [ ] Soft delete (campo `ativo`/`active`) esta sendo respeitado em queries de listagem?

### 2.2 Camada Backend — Rotas API (`api/*.ts`)

- [ ] Rota valida autenticacao via `getAuthUserIdFromRequest(req)`?
- [ ] Rota verifica permissoes/role do usuario (admin vs analista)?
- [ ] Rota valida acesso a organizacao via `orgAccess.ts` ou equivalente?
- [ ] CORS esta sendo tratado via `setCorsHeaders()`?
- [ ] Metodo OPTIONS esta sendo tratado para preflight?
- [ ] Inputs do body/query sao validados antes de uso (campos obrigatorios, tipos)?
- [ ] Erros sao retornados via `jsonError()` com mensagens claras e status codes corretos?
- [ ] Rate limiting esta aplicado onde necessario (`checkCrudRateLimit`)?
- [ ] Respostas usam `jsonSuccess()` com o formato padrao `{ ok: true, data, meta }`?
- [ ] Rota trata todos os metodos HTTP declarados (GET/POST/PATCH/DELETE) e retorna 405 para metodos nao suportados?
- [ ] Dados sensiveis (senhas, tokens) nao vazam nas respostas?

### 2.3 Camada Frontend — Cliente HTTP (`lib/api/*Client.ts`)

- [ ] Funcoes do client correspondem 1:1 com os endpoints da rota API?
- [ ] Tipos de request/response do client sao consistentes com o que a API espera/retorna?
- [ ] Client usa `getAuthHeaders()` para autenticacao?
- [ ] Client trata erro 401 redirecionando para login?
- [ ] Assinaturas de funcao usam tipos do `types.ts` (nao tipos inline duplicados)?
- [ ] Client aplica mappers quando necessario (ex: `mapFarmFromDatabase`)?

### 2.4 Camada Frontend — Pagina/Componentes (`agents/*.tsx`, `components/*.tsx`)

- [ ] Props e state estao tipados corretamente?
- [ ] useEffect tem array de dependencias correto (sem deps faltando ou excessivas)?
- [ ] Chamadas a API tratam estados de loading, erro e vazio?
- [ ] Dados sao recarregados apos operacoes de mutacao (create/update/delete)?
- [ ] Formularios validam inputs antes de submissao?
- [ ] Contextos (`useAuth`, `useClient`, `useHierarchy`, etc.) sao usados corretamente?
- [ ] Nao ha chamadas diretas a `fetch` — deve usar o client correspondente?
- [ ] Componentes grandes poderiam ser extraidos para `components/`?
- [ ] Nao ha dados sensiveis expostos na UI (ex: IDs internos desnecessarios)?

### 2.5 Regras de Negocio e Consistencia Cross-Layer

- [ ] Os tipos TypeScript fluem consistentemente: schema -> repositorio -> API response -> client -> componente?
- [ ] Campos adicionados no schema estao sendo salvos pelo repositorio, retornados pela API, consumidos pelo client e exibidos na UI?
- [ ] Campos removidos ou renomeados foram atualizados em TODAS as camadas?
- [ ] Logica de permissao (admin vs analista) esta consistente entre backend e frontend?
- [ ] Filtros de organizacao sao aplicados tanto no backend quanto no frontend?
- [ ] Validacoes estao duplicadas consistentemente (backend valida mesmo que frontend tambem valide)?
- [ ] Ordem de campos em formularios corresponde a importancia para o negocio?
- [ ] Operacoes destrutivas (delete) tem confirmacao na UI e soft-delete no backend?

---

## Fase 3: Relatorio de Resultados

Apresente os achados no seguinte formato estruturado:

```
## Revisao: <nome-da-funcionalidade>

### Arquivos Analisados
- **Banco**: [lista de arquivos]
- **Backend**: [lista de arquivos]
- **Frontend**: [lista de arquivos]
- **Tipos/Utils**: [lista de arquivos]

### Achados Criticos 🔴
> Problemas que podem causar erro em producao, perda de dados ou falha de seguranca.
1. [arquivo:linha] Descricao do problema — Impacto — Correcao sugerida

### Alertas ⚠️
> Problemas que podem causar comportamento inesperado ou dificultar manutencao.
1. [arquivo:linha] Descricao do problema — Impacto — Correcao sugerida

### Sugestoes 💡
> Melhorias de qualidade, performance ou legibilidade.
1. [arquivo:linha] Descricao — Beneficio

### Riscos de Breaking Change
> Mudancas que podem quebrar funcionalidades existentes se deployadas.
- [descricao do risco e quais camadas sao afetadas]

### Resumo
- Total de achados: X criticos, Y alertas, Z sugestoes
- Risco geral: [ALTO / MEDIO / BAIXO]
- Recomendacao: [SEGURO PARA COMMIT / CORRIGIR ANTES DE COMMIT / REQUER DISCUSSAO]
```

---

## Regras de Conduta

1. **Leia os arquivos reais** — nunca assuma o conteudo de um arquivo. Sempre use Read/Grep.
2. **Cite linhas especificas** — todo achado deve referenciar arquivo e numero de linha.
3. **Nao faca alteracoes** — esta instrucao e apenas de analise. Nao edite nenhum arquivo.
4. **Seja pragmatico** — priorize problemas reais sobre purismo. O Gesttor e um produto em crescimento.
5. **Considere o contexto Vercel** — as rotas sao serverless functions; considere cold starts e limites de execucao.
6. **Considere multi-tenancy** — o sistema serve multiplas organizacoes; isolamento de dados e critico.
7. **Se o escopo for muito grande** (ex: `/revisar auth` que toca muitas rotas), foque nos arquivos mais criticos e liste os demais como "nao revisados — recomenda-se revisao adicional".
