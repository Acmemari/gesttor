# PRD — Assistente "Planejamento Ágil"

> **Versão:** 1.0
> **Data:** 2026-05-07
> **Branch de trabalho:** `Antonio`
> **Status atual:** parcialmente implementado (`agents/AgilePlanning.tsx`, ~4.6k linhas)
> **Localização no produto:** `Sidebar → Assistentes → Planejamento Ágil`

---

## 1. Visão geral

### 1.1 O que é

Assistente de **planejamento estratégico** de pecuária que parte de uma **meta de retorno** (e não de um plano de despesas) para dimensionar o que a fazenda precisa entregar — quantas vendas, matrizes, kg, taxa de desmame — para que a operação atinja a rentabilidade desejada sobre o ativo investido.

Vinculado a **cliente + fazenda** (contexto vem de `ClientContext` + `FarmContext`). Cada simulação pode virar um **Cenário Salvo** (com PDF anexado) que permite comparação posterior em [SavedScenarios.tsx](agents/SavedScenarios.tsx).

### 1.2 Diferencial em uma linha

> "**Quanto preciso produzir** para que esta fazenda dê **X% sobre o ativo pecuário** com margem **Y%**?" — invertido em relação a planilhas tradicionais que partem de `(receita − despesa) = resultado`.

### 1.3 Por que existe

- **Consultor Inttegra** abre uma reunião com o produtor e precisa, em <10 min, materializar uma meta de R$ X de retorno em **indicadores zootécnicos tangíveis** (taxa de desmame, GMD, lotação) que o produtor reconheça como factíveis ou utópicos.
- Substitui planilhas Excel artesanais por uma ferramenta **versionável**, **comparável** e **auditável** (cenário salvo + PDF assinado).
- Alimenta os módulos seguintes: **Comparator** (compara cenários), **Iniciativas** (cada gap vira iniciativa), **Gestão Orçamentária** (a Baseline aprovada nasce de um cenário ágil).

### 1.4 Onde se encaixa

```
Sidebar (Gesttor)
  └─ Assistentes
       ├─ Calculadora de Lucro Pecuário
       ├─ Comparator
       ├─ Planejamento Ágil           ← este PRD
       ├─ Cenários Salvos
       ├─ Atas / Transcrições
       └─ ...
```

---

## 2. Problema e oportunidade

### 2.1 Dor atual

| # | Dor | Evidência |
|---|---|---|
| 1 | Consultor monta cenário em Excel a cada visita; perde 30-60 min por reunião | Feedback recorrente do time de campo |
| 2 | Não há rastro de cenários discutidos com o cliente — discussões viram "achismo" | Sem histórico → produtor não compromete |
| 3 | Métricas calculadas manualmente: erros de fórmula são comuns (especialmente conversão @/kg) | Bugs históricos detectados em revisão de planilhas |
| 4 | Não há vínculo com **iniciativas** (o que fazer para fechar o gap) — meta fica órfã | Demanda explícita do consultor sênior |
| 5 | Cliente não consegue revisitar o que foi discutido na reunião | Falta de PDF assinado |

### 2.2 Hipótese de valor

Centralizar a simulação no Gesttor + salvar como cenário versionado + gerar PDF imediato → **reduz tempo de reunião** e **aumenta a taxa de adesão** do produtor às iniciativas (porque ele tem o documento na mão).

---

## 3. Personas e casos de uso

### 3.1 Personas primárias

| Persona | Contexto | Necessidade-chave |
|---|---|---|
| **Consultor Inttegra (analista)** | Reunião com produtor, 1-2× por trimestre. Notebook + projetor. | Manipular sliders ao vivo, salvar cenário, exportar PDF na hora |
| **Produtor (proprietário)** | Recebe relatório, revisa em casa, dá feedback | Entender o "porquê" da meta; ver indicadores que reconhece |
| **Coordenador da Inttegra (admin)** | Vê todos os cenários gerados pelos analistas | Auditar consistência, comparar cenários entre fazendas |

### 3.2 Casos de uso principais

1. **UC-01 — Simular meta de resultado** _(consultor, ao vivo)_
   Selecionar cliente + fazenda → escolher sistema de produção → ajustar % retorno e % margem → ler indicadores zootécnicos resultantes.
2. **UC-02 — Salvar cenário com PDF** _(consultor, fim da reunião)_
   Após simulação, clicar "Ver Relatório" → revisar → "Salvar cenário" → PDF gerado e anexado em `Cenários Salvos`.
3. **UC-03 — Recarregar cenário existente** _(consultor, próxima reunião)_
   Em `Cenários Salvos` → "Carregar" → sliders voltam ao estado salvo.
4. **UC-04 — Comparar 2-3 cenários** _(consultor + produtor)_
   Selecionar cenários no Comparator → ver diferenças lado a lado.
5. **UC-05 — Gerar iniciativas a partir do gap** _(V2)_
   Para cada indicador abaixo da meta → botão "Criar Iniciativa" → aparece em `Iniciativas Kanban`.

---

## 4. Escopo do produto

### 4.1 No escopo (V1, parcialmente entregue)

- ✅ Workspace dedicado em `Assistentes → Planejamento Ágil`
- ✅ Seleção de cliente + fazenda via contextos
- ✅ Suporte a 3 sistemas de produção: **Cria**, **Ciclo Completo**, **Recria e Engorda**
- ✅ Método de análise: **Ancoragem de Resultado** (default)
- ✅ 7 categorias animais editáveis (Bezerro, Bezerra, Garrote, Novilha, Boi Gordo, Vaca Descarte, Touro Descarte) + adicionar/remover
- ✅ Sliders de índices reprodutivos para Cria/Ciclo Completo
- ✅ Sliders de Recria-Terminação para Ciclo Completo / Recria e Engorda
- ✅ 18 cálculos centralizados em [useAgilePlanningCalculations.ts](lib/hooks/useAgilePlanningCalculations.ts)
- ✅ Modal de Rebanho Médio com 8 categorias detalhadas (matrizes, bezerros, novilhas 8-12, novilhas 13-24, machos 8-12, 13-24, 25-36, touros)
- ✅ Modal de Indicadores selecionáveis
- ✅ Geração de PDF via [generateAgilePlanningReportPDF.ts](lib/generateAgilePlanningReportPDF.ts)
- ✅ Salvamento de cenário (compartilha tabela com `cattleScenarios`)
- ✅ Permissão dedicada em [permissionKeys.ts](lib/permissions/permissionKeys.ts)

### 4.2 Em desenvolvimento (V1 → V1.1)

- 🚧 Integração total dos hooks de performance (`useDebounce` em todos os sliders) — ver [AGILE_PLANNING_IMPROVEMENTS.md](docs/AGILE_PLANNING_IMPROVEMENTS.md)
- 🚧 Substituição de cálculos inline pelo hook centralizado (a tela tem 4.6k linhas com cálculos espalhados)
- 🚧 Componente `<CustomSlider />` reutilizável (3× duplicado)
- 🚧 Testes unitários do hook de cálculos
- 🚧 Error boundary específico

### 4.3 Próximas versões

- **V2 — Método "Desempenho":** invertido — parte de indicadores atuais e calcula o resultado projetado.
- **V2 — Vínculo com Iniciativas:** botão "criar iniciativa" por indicador, pré-preenchendo `meta_atual / meta_desejada / responsável`.
- **V2 — Diff entre cenários** dentro do próprio Planejamento Ágil (sem precisar abrir Comparator).
- **V3 — Integração com Gestão Orçamentária:** "Aprovar como Baseline" empurra os números para `orcamento_versoes` (tipo=`em_elaboracao`).
- **V3 — Multi-cenário lado-a-lado** na própria tela (split view).

### 4.4 Fora do escopo (decidido)

- ❌ Cálculo financeiro detalhado mês a mês (responsabilidade da Gestão Orçamentária)
- ❌ Importação de realizado / OFX (Gestão Orçamentária)
- ❌ Mapa de pasto, GIS, sensoriamento remoto
- ❌ Multi-fazenda numa única simulação (escopo: 1 simulação = 1 fazenda)
- ❌ Edição colaborativa em tempo real (single-user)

---

## 5. Requisitos funcionais

### 5.1 Seleção de contexto (REQ-CTX)

| ID | Requisito |
|---|---|
| REQ-CTX-01 | Ao abrir o assistente, herdar `selectedClient` e `selectedFarm` dos contextos globais. Se algum estiver vazio, abrir modal de seleção. |
| REQ-CTX-02 | Trocar de fazenda preserva os parâmetros editados (sliders, categorias) — só recarrega os campos derivados da fazenda (área, sistema de produção). |
| REQ-CTX-03 | Trocar de cliente reseta tudo e abre modal para escolher fazenda do novo cliente. |
| REQ-CTX-04 | Modal de seleção lista clientes do analista (ou todos, se admin) e fazendas filtradas pelo cliente. |

### 5.2 Parâmetros de entrada (REQ-IN)

#### 5.2.1 Sistema e método

| ID | Requisito |
|---|---|
| REQ-IN-01 | Dropdown "Sistema de Produção": `Cria` (default) \| `Ciclo Completo` \| `Recria e Engorda`. |
| REQ-IN-02 | Trocar de sistema reseta `expectedMargin` para o default da config (`Cria`=40, `Ciclo Completo`=30, `Recria e Engorda`=20) e `getInitialPercentages()` aplica novos % por categoria. |
| REQ-IN-03 | Dropdown "Método": `Ancoragem de Resultado` (V1) \| `Desempenho` (V2, desabilitado em V1 com tooltip "Em breve"). |
| REQ-IN-04 | Mostrar/esconder painéis condicionais: índices reprodutivos só em `Cria` e `Ciclo Completo`; bloco Recria-Terminação só em `Ciclo Completo` e `Recria e Engorda`. |

#### 5.2.2 Sliders (Cria)

| Slider | Min | Max | Step | Default | Unidade |
|---|---|---|---|---|---|
| % Investimento (sobre ativo) | 2 | 11 | 0.5 | 4 | % |
| Margem Esperada | 30 | 50 | 1 | 40 | % |
| Fertilidade | 70 | 90 | 0.5 | 85 | % |
| Perda Pré-Parto | 3 | 15 | 0.5 | 6 | % |
| Mortalidade Bezerros | 1.5 | 7 | 0.1 | 3.5 | % |
| Peso Desmame Machos | 170 | 260 | 5 | 220 | kg |
| Peso Desmame Fêmeas | 170 | 260 | 5 | 200 | kg |
| Venda Bezerras ao Desmame | 0 | 70 | 5 | 0 | % |
| Idade 1ª Monta | 12 | 24 | 1 | 14 | meses |
| Peso 1ª Monta | 270 | 360 | 5 | 300 | kg |
| Tempo de Monta | 40 | 120 | 5 | 90 | dias |
| Dias para Abate de Vacas | 0 | 90 | 5 | 30 | dias |

#### 5.2.3 Sliders (Recria-Terminação — Ciclo Completo)

| Slider | Min | Max | Default |
|---|---|---|---|
| GMD pós-desmame | 0.4 | 1.1 | 0.65 kg/dia |
| Peso de abate | 480 | 600 | 550 kg |
| Rendimento de carcaça | 48 | 60 | 54 % |
| Venda ao desmame | 0 | 90 | 10 % |

#### 5.2.4 Sliders (Recria e Engorda — sistema dedicado)

| Slider | Min | Max | Default |
|---|---|---|---|
| GMD | 0.4 | 1.1 | 0.65 kg/dia |
| Mortalidade | 0.2 | 2 | 0.8 % |
| Rendimento de carcaça | 50 | 60 | 54.5 % |
| Peso de compra | 160 | 400 | 220 kg |
| Valor de compra | 10 | 20 | 15 R$/kg |
| Peso de venda | 360 | 600 | 550 kg |
| Valor de venda | 260 | 360 | 310 R$/@ |

#### 5.2.5 Modal "Relação Matrizes/Touro" / Peso Médio Touro / Idade ao Desmame

| Slider | Min | Max | Default | Onde |
|---|---|---|---|---|
| Matrizes/Touro | 0 | 6 | 4 % | Modal Rebanho Médio |
| Peso Médio Touro | 600 | 900 | 710 kg | Modal Rebanho Médio |
| Idade ao Desmame | 4 | 8 | 7 meses | Modal Rebanho Médio |

#### 5.2.6 Tabela de categorias

| ID | Requisito |
|---|---|
| REQ-IN-10 | Tabela com 7 categorias default: Bezerro, Bezerra, Garrote, Novilha, Boi Gordo, Vaca Descarte, Touro Descarte. |
| REQ-IN-11 | Cada linha edita: `% (na composição)`, `peso (kg ou @)`, `valor (R$/kg ou R$/@)`. |
| REQ-IN-12 | Bezerro/Bezerra usam **kg**; demais usam **@** (1@ = 30 kg). Renderizar unidade explicitamente. |
| REQ-IN-13 | Botão "Adicionar categoria" + ícone lixeira por linha. ID gerado server-side ou via `Math.max(...ids)+1`. |
| REQ-IN-14 | Validação: soma dos % das categorias **deve ser 100%**. Se não for, indicar com badge `⚠ Soma = X%` e bloquear cálculos derivados (`isPercentageSumValid`). |
| REQ-IN-15 | Inputs aceitam vírgula como separador decimal (sanitizar antes de calcular via `parseNumberFromComma`). |

### 5.3 Cálculos (REQ-CALC)

> **Fonte canônica de fórmulas:** [`useAgilePlanningCalculations.ts:107`](lib/hooks/useAgilePlanningCalculations.ts:107). Em caso de conflito, o hook prevalece sobre este PRD; abra PR atualizando ambos.

#### 5.3.1 Bloco "Ancoragem"

| # | Métrica | Fórmula | Notas |
|---|---|---|---|
| C-01 | `calculatedValue` | `% × operationPecuaryValue / 100` | Valor a remunerar |
| C-02 | `requiredRevenue` | `calculatedValue × 100 / expectedMargin` | Faturamento necessário |
| C-03 | `averageValue` | `Σ (categoria.% × peso × valorPorKg) / 100` | Valor médio de venda. Ignorar se `isPercentageSumValid=false` |
| C-04 | `requiredSales` | `round(requiredRevenue / averageValue)` | Cabeças a vender |

#### 5.3.2 Bloco reprodutivo (Cria / Ciclo Completo)

| # | Métrica | Fórmula |
|---|---|---|
| C-05 | `weaningRate` | `(fertility/100) × (1 − prePartumLoss/100) × (1 − calfMortality/100)` |
| C-06 | `kgPerMatrix` | `weaningRate × (maleWeaningWeight + femaleWeaningWeight) / 2` |
| C-07 | `requiredMatrixes` | `ceil(requiredSales / weaningRate)` |
| C-08 | `matricesOverAverageHerd` | `100 / (((firstMatingAge − 12) × 37.5 / 12) + 163.375)` |
| C-09 | `averageHerd` | `requiredMatrixes / matricesOverAverageHerd` |
| C-10 | `averageHerdAdjusted` | `averageHerd × (1 + calfMortality/100)` |

#### 5.3.3 Bloco performance e financeiro

| # | Métrica | Fórmula |
|---|---|---|
| C-11 | `gmdGlobal` | `(Σ qtd_categoria × peso_kg) / averageHerd / 365`. Bezerros usam `weight` em kg, demais em `weight × 30` |
| C-12 | `lotacaoCabHa` | `averageHerdAdjusted / pastureArea` |
| C-13 | `salesPerHectare` | `requiredSales / pastureArea` |
| C-14 | `revenue` | `averageValue × requiredSales` |
| C-15 | `totalDisbursement` | `revenue − calculatedValue` |
| C-16 | `result` | `revenue − totalDisbursement` (= `calculatedValue`) |
| C-17 | `resultPerHectare` | `result / pastureArea` |
| C-18 | `marginOverSale` | `result × 100 / revenue` |
| C-19 | `disbursementPerHeadMonth` | `totalDisbursement / averageHerd / 12` |

> **Regra de divisão segura:** todas as divisões usam `safeDivide(num, den)` — se `den ≤ 0` ou inválido, retorna 0. Sem exceções.

#### 5.3.4 Tabela de Rebanho Médio (modal)

8 colunas: `Vacas`, `Bezerros Mamando`, `Novilhas 8-12`, `Novilhas 13-24`, `Machos 8-12`, `Machos 13-24`, `Machos 25-36`, `Touros`. Para cada uma:
- **Quantidade** (cabeças) — derivada das matrizes e da curva temporal
- **Tempo permanência** (meses) — `12` para vacas/touros, fixo `5` para novilhas 8-12, etc.
- **Peso individual** (kg) — calculado a partir do peso da Vaca Descarte (`× 0.97` para matrizes), do desmame, ou de inputs do usuário
- **Peso vivo total** (kg) — `quantidade × peso_individual`

Constantes em `HERD_CONSTANTS` ([AgilePlanning.tsx:186](agents/AgilePlanning.tsx:186)): `ARROBA_TO_KG=30`, `MATRIZ_WEIGHT_FACTOR=0.97`, `TEMPO_MATRIZES=12`, `TEMPO_NOVILHAS_8_12=5`, `TEMPO_TOUROS=12`, `BEZERRO_WEIGHT_ADJUSTMENT=30`.

### 5.4 Saídas / UI (REQ-OUT)

| ID | Requisito |
|---|---|
| REQ-OUT-01 | Header com breadcrumb `Assistentes › Planejamento Ágil`, botão "Ver Relatório" (azul, sticky), seletor de Sistema de Produção, badge de método, e 3 KPIs: `Valor Total`, `Op. Pecuária`, `Área Pecuária`. |
| REQ-OUT-02 | Card "Percentual de Investimento" com slider + valor calculado destacado em azul. |
| REQ-OUT-03 | Card "Margem Esperada" com slider + Faturamento Necessário destacado em roxo. |
| REQ-OUT-04 | Card "VALORES": Valor Médio de Venda, Vendas Necessárias, Matrizes Necessárias, Rebanho Médio, Total UAs. Vacas e Rebanho Médio são editáveis (ícone lápis). |
| REQ-OUT-05 | 2 cards "ÍNDICES REPRODUTIVOS" lado a lado com sliders agrupados (5 + 5 sliders). |
| REQ-OUT-06 | Card "RESULTADOS DE PERFORMANCE" com 5 indicadores selecionáveis (default: Taxa de Desmame, Kg desm/Matriz, GMD global, Lotação UA/ha, Produção @/ha). Botão de configuração abre modal de seleção. |
| REQ-OUT-07 | Bloco "Finanças: Meta de Resultado" no rodapé, com 12 KPIs em grid 4×3 (Receita, Valor do rebanho, Resultado/ha, Resultado Sobre Ativo Pecuário, Desembolso Total, Desembolso/@, Resultado por Cabeça, Resultado Sobre Valor da Terra, Desembolso/Bezerro, Margem Sobre a Venda, Desembolso Médio Mensal, Desembolso/Cab/Mês). |
| REQ-OUT-08 | Cores: positivos em verde-emerald-600; negativos em vermelho-red-600; neutros em slate-700. |
| REQ-OUT-09 | Formato monetário: `R$ 9.230.769` (sem decimais para >R$1k; com 2 decimais quando <R$1k). Locale `pt-BR`. |
| REQ-OUT-10 | Indicadores que dependem de `pastureArea` ou `operationPecuaryValue` exibem "—" se a fazenda não tem o campo, com tooltip "Cadastre na fazenda" + link para edição. |

### 5.5 Relatório PDF (REQ-PDF)

Gerado por [`generateAgilePlanningReportPDF.ts`](lib/generateAgilePlanningReportPDF.ts).

| ID | Requisito |
|---|---|
| REQ-PDF-01 | Formato A4 portrait, gerado client-side via `jsPDF`. Sem dependência de servidor. |
| REQ-PDF-02 | Estrutura do PDF: cabeçalho (fazenda, localização, sistema, data) → dados da fazenda e dimensões → patrimônio e ativos → composição do rebanho → índices zootécnicos → resultado financeiro. |
| REQ-PDF-03 | Cor de marca verde `#22c55e` para divisores e badges. Tipografia helvetica. |
| REQ-PDF-04 | Quebra de página automática (`checkNewPage`) — nada deve ficar cortado. |
| REQ-PDF-05 | "Salvar cenário" gera o PDF, sobe para storage e grava referência no scenario via `saveReportPdf` ([lib/scenarios.ts](lib/scenarios.ts)). |
| REQ-PDF-06 | Nome do arquivo: `planejamento-agil_<fazenda-slug>_<YYYY-MM-DD>.pdf`. Prefixo definido em `FILE_PREFIX_BY_REPORT_TYPE` em [SavedScenarios.tsx:68](agents/SavedScenarios.tsx:68). |
| REQ-PDF-07 | "Baixar PDF" (sem salvar cenário) também disponível — não cria registro. |

### 5.6 Persistência (REQ-PERS)

| ID | Requisito |
|---|---|
| REQ-PERS-01 | Cenário salvo grava todos os 30+ parâmetros de input + nome dado pelo usuário (default `Cenário <fazenda> <YYYY-MM-DD HH:mm>`). |
| REQ-PERS-02 | Salvar usa a mesma tabela `cattleScenarios` da Calculadora (tipo `agile_planning_pdf` em `results.type`) — sem schema novo no V1. |
| REQ-PERS-03 | "Carregar cenário" desde `Cenários Salvos` → pré-popula todos os sliders/categorias e dispara recálculo. |
| REQ-PERS-04 | Edição do nome do cenário em `Cenários Salvos` via `EditScenarioNameModal`. |
| REQ-PERS-05 | Exclusão exige confirmação modal (texto "Deletar cenário?"). |
| REQ-PERS-06 | Auto-save **NÃO** existe — só salva por ação explícita ("Salvar Cenário"). Estado em memória se perde ao trocar de tela. |

### 5.7 Permissões (REQ-PERM)

| ID | Requisito |
|---|---|
| REQ-PERM-01 | Acessar a tela exige `permissions.assistentes.planejamento_agil.access = true`. Definida em [permissionKeys.ts](lib/permissions/permissionKeys.ts). |
| REQ-PERM-02 | Ver cenários de outros analistas exige `role = 'admin'`. Analista normal só vê os próprios (filtro `targetUserId = selectedAnalyst?.id ?? user.id`). |
| REQ-PERM-03 | Apagar cenário exige ser o criador OU `role = 'admin'`. |
| REQ-PERM-04 | Seed inicial de permissões para qualificação `analista` em [scripts/seed-analysts-planejamento-agil.ts](scripts/seed-analysts-planejamento-agil.ts) — executar uma vez por ambiente. |

---

## 6. Requisitos não-funcionais

### 6.1 Performance (NFR-PERF)

| Métrica | Alvo | Justificativa |
|---|---|---|
| Re-render durante drag de slider | ≤ 5/seg | Sliders disparam em sequência rápida; sem debounce, trava browsers de campo |
| Tempo de cálculo completo (18 fórmulas) | ≤ 30 ms | Reunião ao vivo — atraso é percebido como bug |
| Bundle size adicional | ≤ 50 KB gzip | Tela já está em ~4.6k linhas — não inflar mais |
| Tempo de geração de PDF | ≤ 2 s para A4 com 4-6 páginas | Ação do consultor "na hora" |

**Implementação:**
- `useDebounce` (200-300 ms) em **todos** os sliders antes de propagar para `useAgilePlanningCalculations`
- `useMemo` em todas as 18 fórmulas (já implementado)
- `React.memo` nos cards de output

### 6.2 Acessibilidade (NFR-A11Y)

- Sliders devem ter `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
- Modal: foco preso; ESC fecha; clique fora fecha
- Navegação por teclado: Tab entre sliders, ←/→ ajusta valor, Home/End vai aos extremos
- Contraste mínimo WCAG AA nos textos de KPI

### 6.3 Segurança (NFR-SEC)

- Inputs de nome de categoria sanitizados via `sanitizeString` ([validation.ts](lib/utils/validation.ts)) antes de gravar — evita XSS no PDF e em listagens
- Bounds em todos os números (`clampNumber`) antes de calcular — evita NaN/Infinity
- Schema validation no payload do cenário antes de gravar (Zod recomendado, ainda não aplicado)
- Nunca enviar `pastureArea` ou `operationPecuary` em URL — só body

### 6.4 Robustez (NFR-ROB)

- Error boundary específico envolvendo o componente, com fallback "Recarregar simulação" + `console.error` estruturado
- Divisões protegidas (`safeDivide`)
- Type guards (`isValidNumber`) antes de qualquer math
- localStorage validado com schema antes de hidratar (V2 — não há localStorage no V1)

### 6.5 Telemetria (NFR-TEL — V2)

Eventos a logar (provider a definir):
- `agile_planning.opened` (clienteId, fazendaId, sistema)
- `agile_planning.scenario_saved` (clienteId, fazendaId, sistema, % retorno, % margem)
- `agile_planning.pdf_generated`
- `agile_planning.scenario_loaded` (cenárioId)
- `agile_planning.calculation_error` (campo, valor)

---

## 7. Modelo de dados

### 7.1 Persistência atual (V1)

Reusa `cattleScenarios` da Calculadora — JSON livre em `inputs` + tipo discriminador em `results.type='agile_planning_pdf'`.

```ts
// Shape do payload em cattleScenarios.inputs (V1):
{
  type: 'agile_planning',
  productionSystem: 'Cria' | 'Ciclo Completo' | 'Recria e Engorda',
  analysisMethod: 'ancoragem' | 'desempenho',
  percentage: number,
  expectedMargin: number,
  fertility: number,
  prePartumLoss: number,
  calfMortality: number,
  maleWeaningWeight: number,
  femaleWeaningWeight: number,
  firstMatingAge: number,
  pesoPrimeiraMonta: number,
  matingPeriodDays: number,
  cowSlaughterDays: number,
  vendaBezerrasAoDesmame: number,
  // bloco recria
  recriaGmd: number,
  recriaMortalidade: number,
  recriaRendimentoCarcaca: number,
  recriaPesoCompra: number,
  recriaValorCompra: number,
  recriaPesoVenda: number,
  recriaValorVenda: number,
  // bloco ciclo completo
  cicloGmdPosDesmame: number,
  cicloPesoAbate: number,
  cicloRendimentoCarcaca: number,
  cicloVendaAoDesmame: number,
  // rebanho médio
  bullCowRatioPercent: number,
  pesoMedioTouro: number,
  weaningAgeMonths: number,
  // categorias
  animalCategories: AnimalCategory[],
  // indicadores selecionados
  selectedIndicators: string[],
  selectedRecriaIndicators: string[],
}
```

### 7.2 Schema dedicado (V2 — proposto)

Quando volume ultrapassar ~1000 cenários, separar:

```sql
-- Nova tabela
CREATE TABLE planejamento_agil_cenarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  client_id       uuid NOT NULL REFERENCES clients(id),
  farm_id         uuid NOT NULL REFERENCES farms(id),
  created_by      text NOT NULL REFERENCES user_profiles(id),
  nome            text NOT NULL,
  production_system text NOT NULL CHECK (production_system IN ('Cria','Ciclo Completo','Recria e Engorda')),
  analysis_method   text NOT NULL DEFAULT 'ancoragem',
  inputs          jsonb NOT NULL,
  results_snapshot jsonb NOT NULL,  -- snapshot dos 18 cálculos no momento do save
  pdf_url         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pa_cenarios_farm     ON planejamento_agil_cenarios (farm_id, created_at DESC);
CREATE INDEX idx_pa_cenarios_client   ON planejamento_agil_cenarios (client_id);
CREATE INDEX idx_pa_cenarios_creator  ON planejamento_agil_cenarios (created_by);
```

> Migrar dados existentes via script (rever `cattleScenarios.inputs.type='agile_planning'` → nova tabela).

### 7.3 Dependências de campos da fazenda

Tela depende de:
- `farms.pastureArea` (NFR — sem isso, lotação e produção/ha viram "—")
- `farms.productionSystem` (default do dropdown)
- `farms.operationPecuary` (extensão `ExtendedFarm`) — valor do ativo pecuário

> **Decisão:** se `operationPecuary` for ausente, mostrar modal pedindo o valor antes de habilitar a simulação. Não calcular em cima de zero.

---

## 8. APIs

### 8.1 Endpoints atuais

V1 reusa `lib/scenarios.ts`:

| Função | Rota implícita | Uso |
|---|---|---|
| `getSavedScenarios(userId)` | GET (existente) | Listar cenários do usuário |
| `getScenario(id)` | GET por ID | Carregar para edição |
| `deleteScenario(id)` | DELETE | Remover |
| `updateScenario(id, payload)` | PATCH | Editar nome / inputs |
| `saveReportPdf(scenarioId, blob)` | POST | Anexar PDF |

### 8.2 Endpoints dedicados (V2)

```
GET    /api/planejamento-agil/cenarios?farm_id=&client_id=
POST   /api/planejamento-agil/cenarios
PATCH  /api/planejamento-agil/cenarios/:id
DELETE /api/planejamento-agil/cenarios/:id
POST   /api/planejamento-agil/cenarios/:id/pdf  (multipart)
GET    /api/planejamento-agil/cenarios/:id/diff?against=:other_id   (V2)
```

Padrão de resposta `{ ok, data, error }` (igual ao restante do gesttor).

---

## 9. Fluxos de UX

### 9.1 Fluxo 1 — Primeira simulação

```
[Sidebar] → "Planejamento Ágil"
    │
    ├── selectedFarm já existe ─→ tela carregada com defaults
    └── selectedFarm vazio ─→ modal de seleção (cliente + fazenda) → tela
        │
        ▼
[Tela] sliders nos defaults; KPIs já calculados
    │
    │ usuário move slider "% Investimento" de 4 para 6
    ▼
[useDebounce 250ms] → [useAgilePlanningCalculations] → KPIs atualizados
    │
    │ usuário ajusta categorias (% / peso / valor)
    ▼
[Validação soma=100%] → KPIs derivados aparecem ou ficam "—"
    │
    │ clica "Ver Relatório"
    ▼
[AgilePlanningReportView] preview do PDF
    │
    ├── "Baixar PDF"        ─→ download direto, sem persistência
    └── "Salvar cenário"    ─→ modal "Nome" → POST → toast → reload `Cenários Salvos`
```

### 9.2 Fluxo 2 — Recarregar cenário

```
[Cenários Salvos] → filtrar por fazenda → "Carregar"
    │
    ▼
[Planejamento Ágil] sliders + categorias setados ao estado salvo
    │
    │ usuário ajusta e clica "Salvar como novo"
    ▼
Cria novo registro (não sobrescreve o original)
```

### 9.3 Fluxo 3 — Comparação

```
[Cenários Salvos] → seleciona 2-3 com checkbox → "Comparar"
    │
    ▼
[Comparator] tabela lado-a-lado — KPIs × cenário
```

---

## 10. Edge cases e regras de negócio

| Cenário | Comportamento |
|---|---|
| Soma de % das categorias ≠ 100% | `isPercentageSumValid=false` → KPIs derivados ("Valor Médio", "Vendas Necessárias", "Receita", "Margem") aparecem como "—" + badge ⚠ na tabela |
| `expectedMargin = 0` | `requiredRevenue = 0` (safeDivide) — mostrar warning "Margem 0% não tem sentido econômico" |
| `pastureArea` ausente | Lotação, produção/ha, vendas/ha = "—" + tooltip "Cadastre área de pasto na fazenda" |
| `operationPecuary` ausente | Modal bloqueia simulação até preenchimento |
| Usuário troca de sistema com cenário não salvo | Modal "Você tem alterações não salvas. Trocar mesmo assim?" |
| Categoria com `weight=0` ou `valuePerKg=0` | Categoria contribui 0 para `averageValue` — sem erro, mas KPI fica baixo (esperado) |
| Idade 1ª monta < 12 meses | `indiceTempo = max(0, idade-12)` — não quebra, mas C-08 fica em valor base |
| Tentativa de criar 2 cenários com nome igual | Permitir (não há unique constraint) — listar com timestamp para diferenciar |
| Carregar cenário antigo cujo schema mudou | Hidratar campos conhecidos; aplicar defaults nos novos; alertar "Cenário criado em versão anterior — alguns campos foram preenchidos com valores padrão" |
| Recria e Engorda + modal Rebanho Médio | Modal escondido (não faz sentido — não há matrizes) |
| `requiredSales` resulta em 0 (sem vendas) | KPIs financeiros = 0; mostrar "Ajuste parâmetros para gerar receita" |

---

## 11. Acceptance criteria (V1)

A feature está "pronta" para uso em produção quando todos os critérios abaixo forem `✅`:

### Funcional
- [ ] Consultor abre o assistente, seleciona cliente+fazenda, ajusta % de retorno e margem, e vê os 18 KPIs recalculados em tempo real
- [ ] Trocar entre os 3 sistemas de produção aplica defaults corretos e mostra/esconde painéis condicionais
- [ ] Tabela de categorias soma 100% e bloqueia derivações se não somar
- [ ] Modal "Indicadores" permite escolher 5 indicadores entre os 9 disponíveis
- [ ] Modal "Rebanho Médio" calcula 8 categorias e seus pesos individuais
- [ ] Botão "Salvar Cenário" grava no banco e gera PDF anexado
- [ ] Botão "Baixar PDF" gera arquivo nomeado `planejamento-agil_<fazenda>_<data>.pdf`
- [ ] Em `Cenários Salvos`, o cenário aparece, pode ser carregado, renomeado e excluído

### Não-funcional
- [ ] Drag de qualquer slider mantém UI responsiva (sem freeze >100ms)
- [ ] PDF gerado em < 2s
- [ ] Acesso bloqueado para usuário sem `permissions.assistentes.planejamento_agil.access`
- [ ] Sem erros em console durante fluxo completo
- [ ] Type-check (`npm run type-check`) sem erros no escopo da feature
- [ ] Cobertura mínima de 60% no hook `useAgilePlanningCalculations` (tests unitários)

### UX
- [ ] PDF abre corretamente em Adobe Reader, Chrome PDF e mobile (testado em iPad)
- [ ] Reunião real com consultor sênior aprova o relatório (validação qualitativa)

---

## 12. Métricas de sucesso (KPIs do produto)

| Métrica | Alvo 30d | Alvo 90d | Como medir |
|---|---|---|---|
| Cenários criados / mês | 50 | 200 | Count de `cattleScenarios` com `type='agile_planning'` |
| Analistas ativos / total | 30% | 70% | Distinct `created_by` ÷ total analistas |
| Taxa de retorno (cenários reabertos) | 20% | 40% | Eventos `scenario_loaded` ÷ `scenario_saved` |
| Tempo médio de simulação até "Salvar" | — | < 8 min | Telemetria (V2) |
| % de cenários que viram iniciativa | — | 25% | Vínculo via tabela `iniciativas.origem_id` (V2) |
| NPS do consultor sênior pós-feature | — | ≥ 7/10 | Pesquisa qualitativa |

---

## 13. Roadmap

| Fase | Entregas | Prazo target |
|---|---|---|
| **V1.0 (atual)** | Tela funcional, 3 sistemas, 18 cálculos, PDF, salvar cenário | ✅ entregue |
| **V1.1 — Performance & Limpeza** | Migrar cálculos inline para hook centralizado; `useDebounce` em todos sliders; `<CustomSlider />`; testes unitários | 2-3 sprints |
| **V1.2 — Schema dedicado** | Tabela `planejamento_agil_cenarios` + migração de dados; APIs dedicadas | 1-2 sprints |
| **V2.0 — Método "Desempenho"** | Inverte o cálculo; usuário entra com indicadores → sistema projeta resultado | 3 sprints |
| **V2.1 — Vínculo com Iniciativas** | Botão "criar iniciativa" por gap; aparece em Iniciativas Kanban | 2 sprints |
| **V2.2 — Diff in-place** | Comparar 2 cenários sem sair da tela | 2 sprints |
| **V3.0 — Bridge para Gestão Orçamentária** | "Aprovar como Baseline" empurra valores para `orcamento_versoes` | 3 sprints |
| **V3.1 — Multi-cenário lado-a-lado** | Split view com 2-3 simulações simultâneas | 2 sprints |

---

## 14. Riscos e mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R-01 | Tela de 4.6k linhas vira intratável; cada bug exige horas para entender | Alta | Alto | V1.1 — refator obrigatório antes de qualquer feature nova |
| R-02 | Fórmulas zootécnicas erradas — analista chega ao produtor com número falso | Média | **Crítico** | Testes unitários de cada uma das 18 fórmulas com casos canônicos validados pelo consultor sênior |
| R-03 | PDF gerado client-side falha em browsers antigos / mobile | Baixa | Médio | Detectar `jsPDF` features missing; fallback "Gerar no servidor" (V2) |
| R-04 | Schema reusado com `cattleScenarios` causa confusão e queries lentas | Média | Médio | Migrar para tabela dedicada na V1.2 |
| R-05 | Consultor pede campos novos a cada reunião — escopo creep | Alta | Médio | Roadmap blindado; novas demandas viram backlog priorizado mensal |
| R-06 | Tela depende de `operationPecuary` em fazenda; cadastros antigos não têm | Alta | Alto | Fluxo de "completar cadastro" antes de simular; backfill via script |

---

## 15. Decisões em aberto (a confirmar)

1. **Salvar PDF no storage do Vercel ou em S3 dedicado?** Hoje usa caminho do `lib/scenarios.ts` que está no Neon — verificar limite de tamanho.
2. **Numeração de cenário** — usar `v1.0` igual à Gestão Orçamentária, ou apenas timestamp?
3. **Acesso multi-organização** — admin Inttegra vê cenários de TODAS as orgs ou só da própria?
4. **Período de retenção** — quanto tempo guardar cenários? (sugestão: 5 anos, alinhado com retenção fiscal)
5. **Exportação Excel** — surge sempre que apresentamos; deve ser V2 ou só V3?
6. **Autoria conjunta** — um analista pode editar cenário criado por outro? (sugestão: não, só admin pode)

---

## 16. Glossário

| Termo | Definição |
|---|---|
| **Ancoragem de Resultado** | Método em que o usuário define a meta financeira (% retorno, % margem) e o sistema calcula os indicadores zootécnicos necessários |
| **Sistema de Produção** | Modelo de exploração: Cria (foco em desmame), Ciclo Completo (cria + recria + engorda), Recria e Engorda (compra magro, vende gordo) |
| **% Investimento** | Percentual sobre o valor do ativo pecuário que o produtor quer remunerar — equivale ao "lucro alvo" |
| **Margem Esperada** | Razão lucro / faturamento — define o desembolso operacional implícito |
| **Cenário Salvo** | Snapshot dos 30+ inputs + PDF anexado, persistido em `cattleScenarios` |
| **Rebanho Médio** | Quantidade média de cabeças ao longo do ano, considerando entradas (nascimentos) e saídas (vendas, mortes) — base para calcular GMD global e lotação |
| **UA (Unidade Animal)** | 450 kg de peso vivo. Lotação `UA/ha` é métrica padrão de eficiência zootécnica |
| **Operação Pecuária** | Valor do patrimônio dedicado à atividade pecuária (rebanho + benfeitorias + máquinas) — base para o cálculo de retorno |
| **GMD (Ganho Médio Diário)** | Kg ganhos por animal por dia. GMD global = média ponderada do rebanho médio |
| **Taxa de Desmame** | `Fertilidade × (1 − perda pré-parto) × (1 − mortalidade)` — % de matrizes que entregam um bezerro vivo |

---

## 17. Referências internas

- [`agents/AgilePlanning.tsx`](agents/AgilePlanning.tsx) — componente principal (4649 linhas)
- [`lib/hooks/useAgilePlanningCalculations.ts`](lib/hooks/useAgilePlanningCalculations.ts) — hook canônico de cálculo (V1.1)
- [`lib/generateAgilePlanningReportPDF.ts`](lib/generateAgilePlanningReportPDF.ts) — gerador de PDF
- [`lib/agilePlanningReportTypes.ts`](lib/agilePlanningReportTypes.ts) — tipos do payload do PDF
- [`agents/SavedScenarios.tsx`](agents/SavedScenarios.tsx) — listagem e filtros
- [`scripts/seed-analysts-planejamento-agil.ts`](scripts/seed-analysts-planejamento-agil.ts) — seed de permissão
- [`docs/AGILE_PLANNING_IMPROVEMENTS.md`](docs/AGILE_PLANNING_IMPROVEMENTS.md) — relatório técnico das melhorias
- [`lib/permissions/permissionKeys.ts`](lib/permissions/permissionKeys.ts) — chave de permissão
- [`lib/utils/validation.ts`](lib/utils/validation.ts) — utilitários de sanitização

---

> **Quando este PRD divergir do código:**
> 1. Se a divergência for bug → abrir issue, alinhar com Antonio, corrigir o código.
> 2. Se for evolução intencional → atualizar este PRD **na mesma PR** que altera o código.
> 3. Em caso de dúvida sobre fórmulas → o hook `useAgilePlanningCalculations` é a fonte de verdade.
