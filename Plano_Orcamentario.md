# Plano — Workspace "Gestão Orçamentária" no Gestor

## Contexto

Hoje o Gestor (Vite + React 19, app SPA) já comporta dois workspaces que se alternam via `activeApp` em [App.tsx:113](App.tsx:113): o `gesttor` (sidebar/header padrão de cadastros, calculadoras, atas, iniciativas) e o `inttegra` (sidebar dark estilo ERP rural com módulos Pecuária / Estoque / Máquinas — hoje é placeholder com `InttegraDashboard` em "Workspace em construção"). O usuário quer adicionar uma **terceira** "macro funcionalidade" — **Gestão Orçamentária** — com header e sidebar próprios e um conjunto extenso de telas (briefs em `OneDrive\Inttegra\.INTTEGRA+\gestao_orcamentaria\`). Os protótipos React/Tailwind das telas já existem (zip em Downloads, extraído em `/tmp/plano_orcamentario/`), em altíssima fidelidade — eles servem de base direta para a portagem.

**Decisões já tomadas com o usuário:**
1. **Coexistir** com o workspace `inttegra` existente — não mexer nele; adicionar um terceiro `activeApp = 'gestao-orcamentaria'`.
2. **MVP enxuto:** Shell completo (workspace switcher, header versão-aware, sidebar 4 seções, gaveta de governança) + Cadastro de Orçamento (wizard 6 etapas) + tela de Despesas (planilha editável). Dashboard Executivo, Fluxo de Caixa, Previsto×Realizado, Centros de Custo (Mão de Obra), Simulador, Copiloto e Premissas ficam para fases seguintes.
3. **Realizado por upload Excel/OFX** (REQ-030 do PRD). Não há entrada manual, nem integração ERP no MVP.
4. Branch de trabalho: `Antonio` (memória registra que nunca commitar em `main`).

---

## 1. Arquitetura macro

### 1.1 Padrão de workspace

Estender o switcher já existente em `App.tsx`:

```ts
const [activeApp, setActiveApp] = useState<'gesttor' | 'inttegra' | 'gestao-orcamentaria'>('gesttor');
```

Espelhar o bloco condicional `if (activeApp === 'inttegra') { ... }` em [App.tsx:1060-1112](App.tsx:1060) com um terceiro `if (activeApp === 'gestao-orcamentaria')` que renderiza:

- `<OrcamentoSidebar>` (própria, light, conforme brief 03)
- **Esconder o `<AnalystHeader/>`** dentro deste workspace — o `OrcamentoHeader` já carrega seletor de fazenda. Manter `AnalystHeader` poluiria o topo com 3 barras.
- `<OrcamentoHeader>` (versão-aware, cor muda por status)
- `<OrcamentoWorkspace>` no main (roteia internamente entre as telas)
- `<GavetaGovernanca>` lateral direita (controlada por estado interno)

Ponto de entrada (botão de troca) fica:
- Na `Sidebar.tsx` do gesttor: novo botão de workspace ao lado do "Inttegra" existente (linha ~435 da sidebar atual), com ícone `Calculator` ou `Wallet` e label "Gestão Orçamentária". Chama `setActiveApp('gestao-orcamentaria')`.
- O caminho de volta é a seta "voltar para Gesttor" no rodapé da `OrcamentoSidebar` (mesmo padrão do `InttegraSidebar`).

### 1.2 Roteamento interno do workspace

Não há roteamento por URL no app — segue padrão existente, com state-based switching. Estado interno:

```ts
type OrcamentoView =
  | 'dashboard' | 'prev-real' | 'fluxo'
  | 'receitas' | 'despesas' | 'pecuaria' | 'agricultura' | 'premissas'
  | 'centro-custo:mao-de-obra' | 'centro-custo:replicar-safra'
  | 'simulador' | 'copiloto'
  | 'cadastro:wizard';
const [view, setView] = useState<OrcamentoView>('dashboard');
```

`OrcamentoWorkspace.tsx` faz o switch e renderiza a tela ativa em `<Suspense>` com `lazy()`.

### 1.3 Contexto

Criar `contexts/OrcamentoContext.tsx` com:
- `versaoAtiva` (id + status + dados leves)
- `orcamentoAtivo` (id + safra + nome)
- `planoContas` (cache; carregado uma vez)
- `premissas` (cache da versão ativa)
- `setVersao(id)`, `criarForecast()`, `aprovarBaseline()`

Reusa `useHierarchy()` para `selectedOrganization` + `selectedFarm` (não duplicar). Provider injetado no bloco `gestao-orcamentaria` do `App.tsx`, fora do qual não existe.

---

## 2. Estrutura de arquivos (nova)

```
agents/orcamento/                          ← screens
  OrcamentoWorkspace.tsx                   ← entry-point (switch sobre OrcamentoView)
  CadastroOrcamentoWizard.tsx              ← brief 05 (V1)
  DespesasPlanilha.tsx                     ← brief 06 (V1)
  DashboardExecutivo.tsx                   ← brief 04 (V2)
  PrevistoRealizado.tsx                    ← brief 07 (V2)
  FluxoCaixa.tsx                           ← brief 08 (V2)
  Premissas.tsx                            ← V2
  centros-custo/
    MaoDeObraPermanente.tsx                ← V2
    ReplicarSafra.tsx                      ← V2
  v3/
    SimuladorSensibilidade.tsx             ← brief 10 (V3)
    Copiloto.tsx                           ← brief 11 (V3)

components/orcamento/                      ← primitivos compartilhados
  OrcamentoSidebar.tsx                     ← brief 03 (V1)
  OrcamentoHeader.tsx                      ← brief 02 (V1) — versão-aware
  GavetaGovernanca.tsx                     ← brief 09 (V1, esqueleto; abas avançadas em V2)
  VersaoBadge.tsx
  VersaoDropdown.tsx
  PlanoContasSelect.tsx                    ← V2
  TabelaPlanilhaEditavel.tsx               ← base reutilizada (V1 já usa em Despesas)
  status-tokens.ts                         ← cores/labels por status (extraído do protótipo)

contexts/OrcamentoContext.tsx

src/DB/
  schema.ts                                ← adicionar tabelas (ver §3)
  repositories/
    orcamentos.ts
    versoes.ts
    itens.ts
    premissas.ts
    planoContas.ts
    auditoria.ts
  seed/
    centro_de_custo_seed.csv               ← exportar do CSV oficial
    seedPlanoContas.ts                     ← script idempotente

api/
  orcamentos.ts                            ← CRUD orçamento + versões
  orcamentos-itens.ts                      ← CRUD itens (bulk PATCH crítico)
  orcamentos-premissas.ts
  orcamentos-realizados.ts                 ← upload Excel/OFX
  plano-contas.ts                          ← global, leitura
  orcamentos-auditoria.ts
  _lib/
    withAudit.ts                           ← middleware event sourcing
    parseOfx.ts                            ← parser do OFX
```

**Convenção:** PT-BR para nomes de domínio (`orcamentos`, `versoes`, `premissas`), camelCase para arquivos TS, snake_case para colunas/tabelas no DB — alinha com o que o gesttor já faz em `farms`, `people`, etc.

---

## 3. Schema do banco (Drizzle)

Adicionar a [src/DB/schema.ts](src/DB/schema.ts), reusando `organizations`, `farms`, `userProfiles`. Multi-tenancy via `organization_id`.

| Tabela | Colunas-chave | Notas |
|---|---|---|
| `plano_contas` | `id` (uuid PK), `numero` ("4.1.3"), `numero_pai_id` (FK self, NULL=raiz), `nome`, `perfil_desembolso` (enum), `areas_negocio` (text[]), `nivel` (1-4), `is_folha` (bool), `ativo` (bool) | **Global**, não tenant — seedado via CSV (`Centro_de_Custo.csv`). Idempotente, executado uma vez por ambiente. |
| `orcamentos` | `id` (uuid), `organization_id` (FK), `nome`, `safra` ("25/26"), `data_inicio` (date), `data_fim` (date), `criado_por` (FK userProfiles), `arquivado` (bool, default false), `created_at`, `updated_at` | Container da safra (1 por safra por org). |
| `orcamento_farms` | `orcamento_id` + `farm_id` (PK composta) | Multi-fazenda. Default 1 fazenda — UI mostra seletor se >1. |
| `orcamento_versoes` | `id` (uuid), `orcamento_id` (FK), `parent_id` (FK self, NULL=root), `tipo` (enum: 'rascunho'\|'em_aprovacao'\|'baseline'\|'forecast'\|'arquivado'), `nome` ("Forecast Março"), `criado_por`, `aprovado_por`, `aprovado_em`, `mes_corte` (date, último mês fechado num forecast), `imutavel` (bool, true em baseline) | Núcleo do versionamento. |
| `premissas` | `id`, `versao_id` (FK), `chave` ("preco_arroba_at", "dolar", "ipca", "indice_reajuste_folha", etc.), `valor` (numeric), `unidade`, `mes` (date NULL = anual) | Documentadas em `REF-premissas-orcamento.md`. |
| `itens_orcamento` | `id`, `versao_id` (FK), `plano_conta_id` (FK), `farm_id` (FK), `descricao`, `valores_mensais` (jsonb: `{"2025-08": 12000, "2025-09": 11500, ...}`), `quantidade` (numeric NULL), `unidade` (text NULL), `meta` (jsonb — campos especiais por família: folha, máquinas) | JSONB economiza 12× linhas e habilita `valores_mensais ->> '2025-08'` em índice. |
| `realizados` | `id`, `orcamento_id` (FK), `plano_conta_id` (FK), `farm_id` (FK), `mes` (date), `valor` (numeric), `origem` (enum: 'manual'\|'ofx'\|'excel'), `import_lote_id` (uuid NULL — agrupa upload) | V2. |
| `realizados_lotes` | `id`, `orcamento_id`, `arquivo_nome`, `tipo` ('ofx'\|'excel'), `linhas_total`, `linhas_aceitas`, `criado_por`, `created_at` | Auditoria de imports. |
| `log_auditoria_orcamento` | `id`, `versao_id`, `usuario_id`, `acao` (enum), `entidade`, `entidade_id`, `before` (jsonb), `after` (jsonb), `justificativa` (text NULL), `created_at` | Event sourcing. |
| `comentarios_orcamento` | `id`, `versao_id`, `entidade`, `entidade_id`, `parent_id` (thread), `usuario_id`, `texto`, `resolvido` (bool), `created_at` | V2. |

**Índices críticos:**
- `itens_orcamento (versao_id, plano_conta_id)` — base do redraw da planilha.
- `itens_orcamento (versao_id, farm_id)` — filtro multi-fazenda.
- `realizados (orcamento_id, plano_conta_id, mes)` — comparativo Previsto×Realizado.
- `log_auditoria (versao_id, created_at desc)` — feed do drawer.

**Migrations:** geradas via `npm run db:generate` e aplicadas com `npm run db:drizzle-push` (padrão do projeto).

---

## 4. API (rotas e padrões)

Padrão idêntico aos endpoints existentes (`api/farms.ts`, `api/organizations.ts`): switch sobre `req.method`, auth via `getAuthUserIdFromRequest`, repositório isolado.

| Rota | Métodos | Responsabilidade |
|---|---|---|
| `/api/orcamentos` | GET, POST, PATCH, DELETE | CRUD de Orçamento Mestre. Filtros por org/farm/safra. |
| `/api/orcamentos/versoes` | GET, POST, PATCH | Listar versões; criar Forecast/Rascunho; renomear; arquivar. |
| `/api/orcamentos/versoes/aprovar` | POST | Vira baseline. Trigger trava `imutavel = true`. Apenas admin/proprietário. |
| `/api/orcamentos/versoes/diff` | GET (`?from=&to=`) | Diff agregado entre 2 versões (Δ receitas/despesas/margem + maiores variações). |
| `/api/orcamentos/itens` | GET, POST, PATCH (bulk), DELETE | **Crítico:** PATCH em batch. Aceita `{ items: [{ id, valores_mensais, ... }] }`. Sem isso, planilha trava com 1 request por célula. |
| `/api/orcamentos/premissas` | GET, POST, PATCH | Editar dispara aviso "alteração em Baseline gera Forecast" (lógica server-side: bloqueia PATCH se versão imutável). |
| `/api/plano-contas` | GET (cache 24h) | Lê tabela global. |
| `/api/orcamentos/realizados` | POST (upload), GET | POST recebe `multipart/form-data` com arquivo OFX ou Excel. Usa o mesmo padrão do `multer` já presente em `TranscreverReuniao` (memória registra). Retorna preview pré-confirmação (lote em status "pendente"). |
| `/api/orcamentos/realizados/confirmar` | POST | Grava lote (transição pendente → confirmado). |
| `/api/orcamentos/auditoria` | GET (`?versao_id=`) | Feed do drawer. |
| `/api/orcamentos/comentarios` | GET, POST, PATCH | V2. |

**Middleware `withAudit`** ([api/_lib/withAudit.ts](api/_lib/withAudit.ts)): wrapper que captura `before/after` em PATCH/DELETE e grava em `log_auditoria_orcamento`. Sem isso, audit trail vira inconsistente. Aplicado nos endpoints de itens, premissas, versoes.

**Resposta padrão:** `{ ok: boolean, data?: T, error?: string }` (já é o padrão do gesttor — confirmado no `apiResponse.ts`).

---

## 5. Telas do MVP (V1) — escopo confirmado

### 5.1 Shell (4 componentes — vital)

1. **`OrcamentoSidebar`** — porta direta de [/tmp/plano_orcamentario/sidebar3/sidebar.jsx](sidebar3/sidebar.jsx). 4 seções (Visões / Planejamento / Centros de Custo / Inteligência). Itens "Em breve" com ⏳ + opacity-50. Atalho `[` para colapsar. Footer com seletor de fazenda. **Adaptações:** trocar `window.lucide.X` por `import { X } from 'lucide-react'`, integrar com `useHierarchy()` para fazendas, integrar com `setView` interno do workspace.
2. **`OrcamentoHeader`** — porta de [/tmp/plano_orcamentario/header2/header.jsx](header2/header.jsx). Cor de fundo muda por status da versão (Baseline=verde, Forecast=laranja, Rascunho=cinza, Em Aprovação=azul, Arquivado=cinza-médio). Dropdown de versão, badge de status com tooltip explicativo, avatares de colaboradores (V2 — placeholder estático no V1), botão "Novo Forecast". **Adaptações:** linkar `onChangeVersion` ao `OrcamentoContext.setVersao`. Esconder colaboradores online no V1 (basta seção comentada).
3. **`GavetaGovernanca`** — esqueleto da [/tmp/plano_orcamentario/drawer/parts.jsx](drawer/parts.jsx). V1 entrega só a aba "Linha do Tempo" (audit trail). "Pessoas" e "Diff" ficam V2. Slide-in 200ms via Tailwind (não precisa framer-motion).
4. **Workspace switcher** — botão na [components/Sidebar.tsx](components/Sidebar.tsx) ao lado do Inttegra existente.

### 5.2 Cadastro de Orçamento (wizard 6 etapas)

Porta direta de [/tmp/plano_orcamentario/cadastro/](cadastro/). Stepper horizontal, 6 telas:
1. Identificação (nome, safra dropdown, datepicker via `react-datepicker` já instalado)
2. Fazendas (lista filtrada por `selectedOrganization`)
3. Colaboradores (busca em `userProfiles` da org)
4. Aprovadores (subset dos colaboradores)
5. Premissas iniciais (8 linhas pré-preenchidas — preço @, dólar, IPCA, etc.)
6. Revisão + botão "Criar Orçamento" → POST `/api/orcamentos` + `/api/orcamentos/versoes` (cria V1.0 em Rascunho).

### 5.3 Despesas — Planilha editável

A tela mais complexa do MVP. Porta de [/tmp/plano_orcamentario/despesas2/](despesas2/) (versão refinada). **Nota crítica do brief 06:** "NÃO use TanStack Table — implemente manualmente". Isso bate com o package.json (não está instalado).

Componentes-chave:
- **Layout:** sticky-left col (item), 12 cols meses, sticky-right col (total), footer com total geral. CSS Grid + `position: sticky`.
- **Hierarquia:** categoria expansível (▼/►) → itens. Soma na linha de categoria.
- **Edição inline:** click em célula vira `<input type="number">`. Tab move horizontal, Enter move vertical, Esc cancela, Ctrl+Z desfaz última. **Performance:** debounce 400ms + bulk PATCH (acumular edições e enviar de 5 em 5).
- **Faróis:** verde/amarelo/vermelho conforme `Math.abs((real-plan)/plan) <= 0.05 / 0.10`. Em V1 (sem Realizado), ignorar — só mostrar quando V2 chegar.
- **Travas:** mês passado em Forecast (não-editável, fundo cinza). Em Baseline, tudo travado.

**Aviso de Miopia (brief 11):** OUT do MVP — só tela; sem cálculo zootécnico. Apenas placeholder de hook `onPerformanceCutDetected()` deixado preparado.

---

## 6. Phased delivery

| Fase | Entregas | Demoable em |
|---|---|---|
| **Phase 1 — Shell + Cadastro (MVP M1)** | Workspace switcher; OrcamentoSidebar; OrcamentoHeader (versão-aware); GavetaGovernanca (aba audit trail); CadastroOrcamentoWizard (6 etapas); schema completo; APIs `/api/orcamentos` + `/api/orcamentos/versoes` + seed plano de contas + seed premissas iniciais. | Criar orçamento, ver header com badge Rascunho, navegar pela sidebar. |
| **Phase 2 — Despesas (MVP M2)** | DespesasPlanilha (edição inline, atalhos, hierarquia); APIs `/api/orcamentos/itens` (bulk PATCH); middleware `withAudit`; gaveta mostrando edições; submeter para aprovação → vira Em Aprovação → aprovar → Baseline. | Consultor monta orçamento de despesas end-to-end. |
| **Phase 3 — Visualização + Realizado (V2)** | DashboardExecutivo; FluxoCaixa; PrevistoRealizado (com faróis); upload OFX/Excel + parser + preview de mapeamento; criar Forecast a partir de Baseline (com `mes_corte`); diff viewer no GavetaGovernanca. | Dono vê orçamento full-circle: previsto, realizado, desvios. |
| **Phase 4 — Centros de Custo (V2)** | MaoDeObraPermanente, Premissas (tela própria), ReplicarSafra (wizard 3 etapas). | Cadastrar colaboradores e replicar safra anterior com reajuste automático. |
| **Phase 5 — Inteligência (V3)** | SimuladorSensibilidade, Copiloto + Alerta Miopia. | Stress test de cenários e copiloto IA. |

**Recomendação:** validar Phase 1 + Phase 2 com 1-2 fazendas reais antes de seguir para Phase 3. Os briefs já marcam Simulador (10) e Copiloto (11) como V2 explicitamente — empurrar para Phase 5 é coerente.

---

## 7. Riscos e pontos sensíveis

1. **Performance da planilha** — 5000 itens × 12 meses = 60k células. Sem virtualização, scroll trava. Decisão: **não instalar `@tanstack/react-table` ainda**; usar `IntersectionObserver` ou `react-window` (peso mínimo) para virtualizar linhas. Adicionar `react-window` (~6kb) é aceitável.
2. **Versionamento Baseline → Forecast com freeze parcial** — Forecast herda meses ≤ `mes_corte` como read-only. Implementação errada = sobrescrita silenciosa. Mitigação: validação dupla (UI bloqueia + server rejeita PATCH em mês ≤ corte se `tipo='forecast'`).
3. **Audit trail event-sourced** — sem o middleware `withAudit`, os hooks ad-hoc espalhados por handler causam buracos no histórico. Implementar **na Phase 1** (mesmo que seja over-engineering naquele momento) para evitar dívida.
4. **Seed do plano de contas (~370 contas)** — `numero` hierárquico ("4.1.3") é frágil para reorder; manter `numero_pai_id` como FK real. Seed idempotente checando por `(organization_id IS NULL, numero)` antes de inserir.
5. **Protótipos JSX → TSX** — os 12 prototypes em `/tmp/plano_orcamentario/` são vanilla JSX (`window.X`, dados estáticos). Tradução é ~70% mecânica mas os 30% (handlers, types, integração com context) consomem mais tempo do que parece. Estimativa: 1 dia/tela na portagem.
6. **AnalystHeader vs OrcamentoHeader** — duplicar cabeçalhos polui. Decisão: ocultar `<AnalystHeader/>` quando `activeApp === 'gestao-orcamentaria'` (tem precedente: o padrão atual da Inttegra ainda mostra os dois — corrigir aqui).
7. **Multi-fazenda** — schema tem `orcamento_farms` (N:N), mas UI do MVP é single-farm-por-vez. **Suposição não confirmada com o usuário** — se ele quiser cross-farm desde V1, é refator pequeno; se nunca, podemos simplificar para FK direta. Marcar como "decisão diferida".

---

## 8. Arquivos críticos a modificar/criar

**Modificar:**
- [App.tsx](App.tsx) — linha 113 (estender union de `activeApp`); novo bloco condicional após linha 1112; importar workspace.
- [components/Sidebar.tsx](components/Sidebar.tsx) — adicionar botão de troca para "Gestão Orçamentária" (~linha 435).

**Criar (Phase 1):**
- [agents/orcamento/OrcamentoWorkspace.tsx](agents/orcamento/OrcamentoWorkspace.tsx)
- [agents/orcamento/CadastroOrcamentoWizard.tsx](agents/orcamento/CadastroOrcamentoWizard.tsx)
- [components/orcamento/OrcamentoSidebar.tsx](components/orcamento/OrcamentoSidebar.tsx)
- [components/orcamento/OrcamentoHeader.tsx](components/orcamento/OrcamentoHeader.tsx)
- [components/orcamento/GavetaGovernanca.tsx](components/orcamento/GavetaGovernanca.tsx)
- [components/orcamento/status-tokens.ts](components/orcamento/status-tokens.ts)
- [contexts/OrcamentoContext.tsx](contexts/OrcamentoContext.tsx)
- [src/DB/schema.ts](src/DB/schema.ts) — append (não modificar tabelas existentes)
- [src/DB/repositories/orcamentos.ts](src/DB/repositories/orcamentos.ts), [versoes.ts](src/DB/repositories/versoes.ts), [planoContas.ts](src/DB/repositories/planoContas.ts), [auditoria.ts](src/DB/repositories/auditoria.ts)
- [src/DB/seed/seedPlanoContas.ts](src/DB/seed/seedPlanoContas.ts)
- [src/DB/seed/centro_de_custo_seed.csv](src/DB/seed/centro_de_custo_seed.csv) (exportado do CSV oficial citado em `REF-plano-de-contas-centro-de-custo.md`)
- [api/orcamentos.ts](api/orcamentos.ts), [api/plano-contas.ts](api/plano-contas.ts), [api/orcamentos-auditoria.ts](api/orcamentos-auditoria.ts)
- [api/_lib/withAudit.ts](api/_lib/withAudit.ts)

**Criar (Phase 2):**
- [agents/orcamento/DespesasPlanilha.tsx](agents/orcamento/DespesasPlanilha.tsx)
- [components/orcamento/TabelaPlanilhaEditavel.tsx](components/orcamento/TabelaPlanilhaEditavel.tsx)
- [src/DB/repositories/itens.ts](src/DB/repositories/itens.ts), [premissas.ts](src/DB/repositories/premissas.ts)
- [api/orcamentos-itens.ts](api/orcamentos-itens.ts), [api/orcamentos-premissas.ts](api/orcamentos-premissas.ts)

**Dependências a adicionar:**
- `react-window` (~6kb) — virtualização da planilha. Adicionar em Phase 2.
- Nenhuma outra. Recharts, lucide-react, date-fns, react-datepicker, drizzle, zod, multer já estão no `package.json`.

---

## 9. Verificação (como testar end-to-end)

**Phase 1:**
1. `npm run dev:all` (Vite + Express).
2. Login como admin/analista.
3. No sidebar do Gesttor, clicar "Gestão Orçamentária" → workspace troca.
4. Header mostra fazenda selecionada (do `HierarchyContext`); sidebar mostra 4 seções; gaveta abre/fecha pela tecla ou botão.
5. Clicar "Novo Orçamento" → wizard abre; preencher 6 etapas → POST grava em `orcamentos` + cria `orcamento_versoes` (V1.0, tipo=rascunho).
6. Header reflete: badge "Rascunho", cor cinza, autor + timestamp.
7. Verificar no banco com `npx drizzle-kit studio`: tabelas populadas, plano_contas tem ~370 linhas.
8. `npm test` (vitest) — escrever 2-3 testes de unit em `src/DB/repositories/orcamentos.test.ts` (criação, listagem, soft delete).

**Phase 2:**
1. Abrir tela Despesas, ver hierarquia de categorias.
2. Editar célula → debounce → bulk PATCH → audit trail registra alteração.
3. Submeter para aprovação → tipo vira `em_aprovacao` → aprovar → vira `baseline` → header verde + cadeado, células não editáveis.
4. Tentar editar uma célula em Baseline → bloqueio com mensagem "alteração em Baseline gera Forecast".
5. Botão "Novo Forecast" → cria V2.0 com `parent_id=V1.0` + `mes_corte=último_mês_fechado`. Editar mês passado → bloqueado.

**Smoke test do servidor:** `npm run test:e2e` (Playwright) — escrever um teste cobrindo o fluxo de criação + aprovação.

---

## 10. Decisões diferidas (a confirmar antes da Phase 3+)

- **Multi-fazenda em editar:** orçamento opera sempre 1 fazenda por vez ou tem visão consolidada editável?
- **Permissões de aprovação:** só admin/analista, ou criar papel "aprovador" custom?
- **Inttegra atual:** após Phase 2, decidir se mantém, deprecia ou funde.
- **Premissas globais vs por versão:** brief sugere premissas viajam com a versão (correto); confirmar se há premissas "compartilhadas" entre versões.
- **Notificações:** in-app (existe?) e e-mail para alertas de desvio (REQ-031). Bloqueado no v1 enquanto NotificationContext não estiver maduro.
