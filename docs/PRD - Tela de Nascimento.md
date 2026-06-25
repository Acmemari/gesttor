# PRD — Tela de Nascimento (reconstrução)
**Produto:** INTTEGRA Pecuário — Sistema Individual
**Módulo:** Movimentação › Nascimento
**Versão:** 2.0 — 22/06/2026 (substitui a Spec 1.0 de 01/06/2026)
**Objetivo do documento:** especificar, em nível de implementação, **tudo** o que a tela de Nascimento faz hoje, para que o time consiga **reconstruir o módulo do zero** (frontend + backend + banco) sem acesso ao código atual.

> ⚠️ **Mudança conceitual em relação à Spec 1.0.** A Spec 1.0 descrevia um modelo de "toggle que trava o grid" e "só salva quando identificados = total". A implementação **atual** evoluiu para um **modelo de dupla camada ADITIVA**: o declarado por categoria (sem ID) e o detalhado animal-a-animal (com ID) **coexistem e se somam**; o total salvo é a soma dos dois e **nada bloqueia o salvamento**. Este PRD descreve o comportamento atual (autoritativo).

---

## 1. Conceito central — dupla camada aditiva

A tela registra **eventos de nascimento de bezerros**. Cada lançamento é **um movimento** com uma quantidade total de cabeças. Essa quantidade é composta por **duas camadas que somam**:

| Camada | O que é | Onde se informa | Persistência |
|---|---|---|---|
| **Declarado (sem ID)** | Quantidade por categoria, **sem** detalhe animal-a-animal. É a parte "pendente de identificação". | Modo **coletivo** (ícone de lote): `Quantidade` + `Categoria` + "**+ mais**". | `nao_identificados` + `cat_decl` |
| **Detalhado (com ID)** | Fichas individuais (1 linha = 1 bezerro), com ID Manejo, categoria, peso etc. | Modo **individual** (ícone de brinco): "Lançamento Rápido". | tabela `nascimento_fichas` |

**Fórmulas-âncora (válidas no Salvar):**
```
detalhado          = nº de fichas individuais (detalhe.length)
declarado          = Σ qtd das categorias declaradas (cats[])
qtdTotal (qtd)     = declarado + detalhado          ← total de cabeças do movimento
naoIdentificados   = declarado                       ← só o declarado sem detalhe é "pendente"
status             = naoIdentificados > 0 ? 'pendente' : 'conciliado'
```

**Regras de ouro:**
1. As duas camadas **nunca se apagam** ao alternar de modo — coexistem e somam.
2. **Identificação nunca bloqueia o estoque.** Não há trava por "identificados < total". Nascimento é sempre **entrada**, então não há risco de saldo negativo.
3. A **quantidade total é a âncora do estoque** (o saldo do rebanho sobe pela `qtd`, independentemente de quantos foram identificados).
4. **Saldos por categoria são derivados, nunca digitados** (ver §13).
5. O que ficar **declarado sem detalhe** vira **pendência** (cartão de conciliação) — a identificação pode ser completada depois, na aba **Registros** / **Atribuir ID**.

---

## 2. Glossário

- **Movimento (de nascimento):** um lançamento. Linha de `nascimento_movimentos`.
- **Ficha:** registro individual de um bezerro identificado. Linha de `nascimento_fichas`.
- **ID Manejo / Apelido (`apelido`):** identificador de manejo do animal (ex.: `504A`, `001`, `BZ-09`). Campo-âncora individual.
- **Categoria:** classe do animal (ex.: "Bezerro(a) ao pé"); só categorias do grupo `bezerros_mamando`.
- **Declarado (sem ID):** quantidade por categoria sem detalhe individual.
- **Detalhado (com ID):** ficha individual.
- **Defina seus campos / Lançamento Rápido:** kit configurável de entrada individual (compartilhado com Compra/Venda/Morte).
- **Destino (place) de um campo:** onde o campo aparece — `top` (Linha Superior "Repete em todos"), `bottom` (Tabela de Lançamento, por animal), `dados` (Dados Adicionais, recolhido), `off` (desativado).
- **Conciliação / Atribuir ID:** completar a identificação de um movimento que tem `nao_identificados > 0`.

---

## 3. Stack & arquitetura de referência

- **Frontend:** React + TypeScript, TailwindCSS, ícones `lucide-react`, drag-and-drop `@dnd-kit`, planilhas via lib XLSX (ex.: `xlsx`/SheetJS).
- **Backend:** rotas serverless estilo Vercel (`api/*.ts`), com `handler(req,res)`. Em dev, **toda rota nova precisa ser registrada à mão** num servidor Express (`server-dev.ts`).
- **Banco:** PostgreSQL (Neon) via Drizzle ORM. Schema em `src/DB/schema.ts`.
- **Multi-tenant:** tudo é escopado por `organizationId` (organização selecionada no contexto de hierarquia).
- **Auth:** toda rota valida o usuário (`getAuthUserIdFromRequest`) e responde 401 se ausente. Respostas padronizadas `{ ok, data }` / `{ ok:false, error }`.

### 3.1 Inventário de arquivos (estrutura sugerida — espelha a atual)

```
agents/pecuario/nascimento/
  NascimentoView.tsx        # container da tela (estado + orquestração)
  CategoriaGrid.tsx         # painel direito: distribuição por categoria (derivada)
  SanitarioSection.tsx      # formulário sanitário (vacinas/medicamentos + custo)
  AtribuirIdPanel.tsx       # painel inline "Atribuição de ID" (Mesa de Conciliação)
  LancamentosRecentes.tsx   # aba Registros (master-detail + atribuição inline)
  FichaInclusaoForm.tsx     # (legado/local) reexporta o form do kit
  FieldControl.tsx          # reexport de ../fichas/FieldControl
  BrincoBovinoIcon.tsx      # ícone SVG do brinco (toggle individual)
  LoteAnimaisIcon.tsx       # ícone SVG do lote (toggle coletivo)
  fieldRegistry.ts          # LR_REGISTRY (campos) + listas estáticas
  types.ts                  # tipos da tela
  util.ts                   # funções puras (datas, safra, próximoApelido, derivações)

agents/pecuario/fichas/      # KIT COMPARTILHADO "Defina seus campos"
  DefinaCamposPanel.tsx     # painel do Lançamento Rápido (form + tabela + import/export)
  FichaInclusaoForm.tsx     # form em 3 seções (top/bottom/dados)
  FieldControl.tsx          # render de 1 campo por tipo
  CamposConfigModal.tsx     # modal do lápis (4 destinos + ordenar + Nº auto)
  FullscreenLancamento.tsx  # shell de tela cheia
  ImportarPlanilhaModal.tsx # revisão de importação (ok/aviso/erro por célula)
  useFieldConfig.ts         # hook de carga/salvamento da config de campos
  useCamposPersonalizados.ts# hook que injeta campos personalizados no registry
  fieldConfig.ts            # helpers puros (defaults, constraints, buildEntryValues)
  importTemplate.ts         # leitura + validação de planilha
  exportTemplate.ts         # geração do modelo .xlsx
  types.ts                  # tipos do kit (LrField, FieldPlace, etc.)
  util.ts                   # utils do kit (datas, parseWeight, proximoApelido, sexoFromCategoria)

lib/api/nascimentosClient.ts            # client HTTP dos movimentos
lib/api/nascimentoFieldConfigClient.ts  # client HTTP da config de campos
api/nascimentos.ts                      # rota dos movimentos (GET/POST/PUT/DELETE)
api/nascimento-field-config.ts          # rota da config de campos (GET/POST)
src/DB/repositories/nascimentos.ts      # repositório dos movimentos/fichas
src/DB/repositories/nascimentoFieldConfig.ts # repositório da config
```

---

## 4. Modelo de dados (banco)

### 4.1 `nascimento_movimentos` (1 linha = 1 lançamento)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | uuid PK | default random |
| `organization_id` | uuid NOT NULL | FK organizations (cascade) |
| `farm_id` | text | FK farms (set null) |
| `local_id` | uuid | FK farm_locais (set null). Se vier null no create, resolve para o **local default** da fazenda (ver §18.3) |
| `proprietario_id` | uuid | FK people (set null) |
| `data` | date NOT NULL | `AAAA-MM-DD` |
| `safra` | text | derivada da data (jul→jun) |
| `retiro` | text | nome do retiro (texto livre, não FK) |
| `qtd` | integer NOT NULL default 0 | total de cabeças = declarado + detalhado |
| `nao_identificados` | integer NOT NULL default 0 | = declarado (sem detalhe) |
| `status` | text NOT NULL default `'pendente'` | `'pendente'` \| `'conciliado'` |
| `cat_decl` | jsonb default `'[]'` | `[{ catId, qtd }]` **consolidado** (declarado + detalhado por categoria) |
| `sanitario` | jsonb default `'[]'` | `SanItem[]` (ver §10.7) |
| `criado_por` | text | FK user_profiles (set null) |
| `created_at` | timestamp NOT NULL default now | |
| `updated_at` | timestamp NOT NULL default now | |

Índices: `idx_nascimento_mov_org(organization_id)`, `idx_nascimento_mov_farm(farm_id)`.

### 4.2 `nascimento_fichas` (1 linha = 1 bezerro identificado)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | uuid PK | default random |
| `movimento_id` | uuid NOT NULL | FK nascimento_movimentos (**cascade** — apagar movimento apaga fichas) |
| `categoria_id` | uuid | FK animal_categories (set null) |
| `apelido` | text NOT NULL | ID Manejo (não é único; pode repetir entre lançamentos) |
| `rfid` | text | ID Eletrônica |
| `sisbov` | text | nº SISBOV |
| `porte` | text | `P`\|`M`\|`G` |
| `raca` | text | nome da raça |
| `peso` | numeric(8,2) | peso (kg) |
| `extras` | jsonb NOT NULL default `'{}'` | valores de Campos Personalizados, chaveados `cp_<uuid>` |
| `created_at` | timestamp NOT NULL default now | |

Índice: `idx_nascimento_fichas_mov(movimento_id)`.

### 4.3 `nascimento_field_configs` (1 linha por organização)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL **UNIQUE** | FK organizations (cascade) |
| `config` | jsonb NOT NULL default `'{}'` | blob `{ places, order, autonum }` (ver §11) |
| `created_at` / `updated_at` | timestamp | |

> Tabelas dependentes que precisam preexistir: `organizations`, `farms`, `farm_locais`, `people`, `user_profiles`, `animal_categories`, `animal_breeds`, `campos_personalizados`.
> **Atenção (migração):** tabelas aditivas novas costumam ser criadas por script SQL bruto idempotente (`npx tsx tmp/create-*.ts`) e não por `drizzle-kit push`.

---

## 5. API

Base do client: `fetch(url, { credentials:'include' })`; desembrulha `json.data ?? json`; lança `Error(json.error)` em status não-OK.

### 5.1 `/api/nascimentos` (movimentos + fichas)

- **GET `?organizationId=<id>`** → lista movimentos da org (ordenados por `data desc, created_at desc`), **cada um com `fichas[]`**.
- **GET `?id=<id>`** → um movimento com `fichas[]`.
- **POST** (criar movimento):
  ```jsonc
  {
    "organizationId": "uuid",        // obrigatório
    "farmId": "id|null",
    "localId": "uuid|null",
    "proprietarioId": "uuid|null",
    "data": "AAAA-MM-DD",            // obrigatório, validado por regex
    "safra": "2025/2026|null",
    "retiro": "string|null",
    "qtd": 18,                        // truncado a inteiro ≥ 0
    "naoIdentificados": 5,            // truncado a inteiro ≥ 0
    "status": "pendente|conciliado",  // default 'pendente'
    "catDecl": [{ "catId": "uuid", "qtd": 10 }],
    "sanitario": [ /* SanItem[] */ ],
    "fichas": [
      { "apelido":"504A", "catId":"uuid", "rfid":null, "sisbov":null,
        "porte":"M", "raca":"Nelore", "peso":32.5, "extras": { "cp_x":"v" } }
    ]
  }
  ```
  Cria o movimento e insere as fichas em lote. Retorna o movimento com `fichas[]`.
- **POST `{ action:'add-ficha', movimentoId, apelido, categoriaId?, rfid?, sisbov?, porte?, raca?, peso? }`** → adiciona **uma** ficha a um movimento existente, **decrementa `nao_identificados`** (mín. 0) e recalcula `status`. Retorna o movimento atualizado. (Usado na Atribuição de ID inline.) Erros: 400 se faltar `movimentoId`/`apelido`; 404 se movimento inexistente.
- **PUT `?id=<id>`** (atualizar movimento): mesmo corpo do create (sem `organizationId`). **Substitui integralmente as fichas** (apaga todas e reinsere o conjunto enviado). Retorna atualizado; 404 se não existir.
- **DELETE `?id=<id>`** → exclui o movimento (cascade apaga fichas). Retorna `{ deleted:true }`.

Validações server-side: `data` no formato `AAAA-MM-DD`; `status` ∈ {pendente, conciliado}; números truncados e clampados a ≥ 0.

### 5.2 `/api/nascimento-field-config` (config de campos)

- **GET `?organizationId=<id>`** → `{ config: MovimentoFieldConfig | null }` (null se nunca salvo).
- **POST `{ organizationId, config }`** → upsert (1 linha por org). `config = { places, order, autonum }`.

---

## 6. Estrutura da tela

### 6.1 Cabeçalho global
Linha com:
- **Ícone de brinco + título "Nascimentos"** (verde `#16a34a`).
- **Toggle de abas** (2 botões de largura idêntica):
  - **"Lançamentos"** (ícone `+`) → formulário de lançamento.
  - **"Registros"** (ícone lista) → histórico master-detail; mostra um **badge** com a contagem de movimentos.

### 6.2 Aba "Lançamentos" — um único cartão dividido
Container com **container query**: divide em 2 colunas só quando largura ≥ 1180px; senão empilha.
- **Painel ESQUERDO (~65%):** cabeçalho do lançamento + toggles de modo + quantidade/categoria + resumo + ações (Cancelar/Salvar).
- **Painel DIREITO (~35%):** **"Distribuição por categoria"** (CategoriaGrid) + rodapé com o total (Sem ID / Com ID / total cab.).

Abaixo do cartão:
- **Card "Lançamento Rápido"** (só no modo individual) — o kit "Defina seus campos".
- **Painel "Atribuição de ID"** (quando aberto a partir de Registros).

### 6.3 Tela cheia (Expandir)
O Lançamento Rápido pode abrir em **tela cheia** (`FullscreenLancamento`): overlay fixo, header fixo (ícone+título+abas), um **cabeçalho compacto** (Data, Proprietário, Fazenda, Retiro) e o corpo rolável com o painel. Trava o scroll do `body`; **Esc** fecha.

### 6.4 Aba "Registros"
Master-detail completo (`LancamentosRecentes`) — ver §14.

---

## 7. Cabeçalho do lançamento (campos do movimento)

Distribuídos em linha que quebra (flex-wrap):

| Campo | Controle | Regras |
|---|---|---|
| **Data** | `<input type=date>` (≈130px) | default = hoje (ISO local). |
| **Safra** | texto derivado (read-only) | Calculada da data, ciclo **jul→jun**: mês ≥ 7 ⇒ `Y/Y+1`, senão `Y-1/Y`. Exibida abaixo da Data: "Safra **2025/2026**". **Não editável.** |
| **Proprietário** | `PessoaSelector` (filtro `proprietario`) | opcional. |
| **Fazenda** | `<select>` das `farms` do contexto | default = primeira fazenda; troca de fazenda recarrega Locais. |
| **Retiro** | `<select>` (nomes distintos dos locais da fazenda) | Se a fazenda tem **um único retiro**, vem pré-selecionado. Trocar retiro **limpa** o Local. |
| **Local** | `<select>` (locais filtrados pelo retiro) | opcional. |

Os locais vêm de `GET /api/farm-locations?farmIdLocais=<farmId>` → `FarmLocal[] { id, name, retiroName? }` (apenas locais não-default).

---

## 8. Quantidade e seleção de modo

Linha com (da esquerda p/ direita):

1. **Toggle de modo** — dois `IconCardButton`:
   - **Brinco** (`BrincoBovinoIcon`) → modo **individual** ("Detalhamento individual (vem do ID)"). `fromId = true`.
   - **Lote** (`LoteAnimaisIcon`) → modo **coletivo** ("Lote de animais (visão coletiva)"). `fromId = false`.
   - Trocar de modo **fecha** Sanitário e Dados Adicionais; **não apaga** dados (declarado e detalhado coexistem).
2. **Quantidade `*` (cab.)** — `<input type=number min=1>` (≈150px). **Desabilitada no modo individual** (cinza), pois nesse modo a quantidade vem das fichas.
3. **Categoria (sem detalhe)** — `<select>` das categorias `bezerros_mamando`. **Desabilitada no modo individual.**
4. **Botão "+ mais"** — adiciona a dupla (categoria + quantidade) à lista declarada. **Desabilitado no modo individual.**

> O par "Quantidade + Categoria" representa **uma entrada declarada**. O valor do campo Quantidade é usado como a quantidade da categoria ao clicar "+ mais".

---

## 9. Modo coletivo — declarado por categoria

- Ao clicar **"+ mais"** (`addCat`):
  - Valida: categoria selecionada (senão toast erro "Selecione a categoria") e quantidade ≥ 1 (senão "Informe a quantidade desta categoria").
  - Se a categoria já existe na lista, **soma** as quantidades; senão adiciona `{ catId, catNome, qtd }`.
  - Limpa `catSel` e `Quantidade`. Toast sucesso: `"Categoria adicionada · <nome> · <qtd> cab."`.
- A lista declarada é exibida/derivada no painel direito (CategoriaGrid).
- **Editar** uma categoria declarada (`editCat`): remove-a da lista e recarrega seus valores nos campos `Categoria`/`Quantidade` para reedição.
- **Remover** (`removeCat`): tira da lista.

Estrutura de dados: `NascCat { catId, catNome, qtd }`.

---

## 10. Modo individual — "Lançamento Rápido" (kit Defina seus campos)

Renderizado pelo componente **`DefinaCamposPanel`**. Cabeçalho do card: ícone de **lápis** (abre a configuração de campos) + título + botões **Planilha (exportar)**, **Planilha (importar)**, **Fechar** (volta ao coletivo) e **Expandir/Reduzir** (tela cheia).

O formulário (`FichaInclusaoForm`) tem **3 seções**, conforme o destino de cada campo:

### 10.1 Seção "Repete em todos" (destino `top`)
- Caixa **verde** (`border #cdebd7`, `bg #f5fbf7`). Cabeçalho: "REPETE EM TODOS — vale para cada animal lançado".
- Campos cujo valor **persiste** entre um animal e o outro (padrão: `Data`, `Raça`, `Lote`).
- Slot à direita: **botão Sanitário** (quando habilitado). Slot abaixo: a **seção Sanitário** quando aberta.

### 10.2 Seção "Individual · por animal" (destino `bottom`)
- Caixa **branca/cinza**. Cabeçalho: "INDIVIDUAL · POR ANIMAL — muda a cada lançamento".
- Campos preenchidos a cada animal (padrão: `ID Manejo`, `Categoria`, `ID Eletrônica`, `SISBOV`, `Sexo`, `Porte`, `Colostro?`, `Peso nasc.`, `Pesagem`).
- **Botão "Adicionar"** (verde, altura 38px) → `addDetalhe`.

### 10.3 Botão "Adicionar" (`addDetalhe`)
- Valida **obrigatórios**: `ID Manejo` (senão "Informe o ID Manejo") e `Categoria` (senão "Selecione a categoria"). **Peso não é obrigatório.**
- Cria `NascDetalhe { id, values }` (snapshot dos `entryValues`) e adiciona à tabela de detalhe.
- **Reset pós-adição:** mantém os campos `top` (Data/Raça/Lote e demais `top`), reseta o resto; se a **numeração automática** estiver ligada, sugere o **próximo ID Manejo** (senão limpa).
- Não há trava por "ultrapassar total" (modelo aditivo).

### 10.4 Tabela de detalhe (abaixo do form)
Colunas fixas (independente da config): `ID Manejo`, `ID Eletrônica`, `SISBOV`, `Sexo`, `Categoria`, `Porte`, `Colostro`, `Peso` (direita). Cada linha tem ação **remover** (lixeira). Estado vazio: "Nenhum animal identificado ainda." (com ícone).

### 10.5 Numeração automática (`autonum` + `proximoApelido`)
- Configurável pelo chip **"Nº auto"** no campo ID Manejo (dentro do modal de config).
- `proximoApelido(prev)`: incrementa o número **preservando prefixo, sufixo e zeros à esquerda** via regex `^(.*?)(\d+)(\D*)$`. Ex.: `001 → 002`, `BZ-09 → BZ-10`. Sem dígitos, retorna o original.

### 10.6 Auto-preenchimento de Sexo a partir da Categoria (`sexoFromCategoria`)
Padrão do sistema: ao escolher a **Categoria** (tipo `cat`), o campo **Sexo** é preenchido automaticamente a partir do `sexo` cru da categoria (`'macho'|'femea'` → `'Macho'|'Fêmea'`). Não sobrescreve se a categoria não define sexo.

### 10.7 Sanitário (`SanitarioSection`)
Botão recolhível na linha "Repete em todos" (só aparece se o campo `sanitario` estiver no destino `top`). Abre um formulário de aplicações:
- **Tipo de Aplicação** (rádio): "Aplicação Única" (default) | "Protocolo".
- **Protocolo Sanitário** (`<select>` de `PROTOCOLOS`): habilitado só no modo "Protocolo".
- **Vacina/Medicamento** (`<select>` de `MEDICAMENTOS`).
- **Unidade de Medida** (input read-only, auto do medicamento; "—" se nenhum).
- **Tipo de Dose** (`<select>` de `TIPO_DOSE` = `Fixa | Por Peso`).
- **Dose `*`** (decimal). Validação: `> 0`.
- **Por Cada (X) Kg** (decimal, com sufixo "Kg").
- **Botão "Adicionar"**: cria `SanItem`, calcula **custo da aplicação = `custoUnit × dose`**, limpa o form, toast com o nome do medicamento.
- **Tabela de aplicações**: `Vacina/Medicamento | Tipo de Dose | Qtde/Por Cada (X) Kg | Dose | Unidade | Custo da Aplicação | Ações(editar/remover)`. Rodapé: **"Custo total da aplicação" = Σ custos** (verde). Estado vazio: "Nenhuma aplicação adicionada."
- `SanItem { id, medId, nome, unidade, tipoDose, dose, porKg, custo }`. O array inteiro é persistido em `nascimento_movimentos.sanitario` (jsonb).

### 10.8 Dados Adicionais (destino `dados`)
Botão verde recolhível abaixo da linha individual. Abre um **grid** (1/2/3 colunas; campos podem ocupar `span` 2 ou 3). Campos padrão: `Nome Completo`(span 2), `Peso ao Nascer`, `Grau de Sangue`, `RGN/Tatuagem`, `Pelagem`, `Tipo de Chifre`, `RGD`, `Série Alfa`, `Pai - ID Usual`, `Mãe - ID Usual`, `Observação`(span 3).

### 10.9 Importar / Exportar planilha
- **Exportar modelo** (`exportTemplate.ts`): gera `.xlsx` com 2 abas — **"Lançamento"** (cabeçalho = labels dos campos ativos, na ordem configurada, exceto `off`/`sanitario`) e **"Instruções"** (`Campo | Obrigatório | Tipo | Valores aceitos`). Nome do arquivo: `<filenamePrefix>-<hoje>.xlsx` (prefixo `modelo-lancamento-nascimento`). Toast: "Modelo exportado · N colunas...".
- **Importar** (`importTemplate.ts` + `ImportarPlanilhaModal`): aceita `.xlsx/.xls/.csv`. Lê linhas (`readSheetRows` — prioriza a aba "Lançamento"; CSV detecta `;`/`,`). **Valida célula a célula** por tipo do campo:
  - obrigatório vazio → **erro** ("Obrigatório"); vazio com default → **aviso** ("usaria '<default>'"); opcional vazio → **ok** (usa default).
  - `cat`/`lote`/`lookup` → casa por **nome** (case-insensitive) e devolve o id, senão erro.
  - `sexo` → normaliza para `Macho`/`Fêmea`.
  - `select` → casa contra `options` (case-insensitive), valor canônico.
  - `weight`/`money`/`number` → parse decimal (vírgula/ponto).
  - `date` → aceita `AAAA-MM-DD` ou `DD/MM/AAAA` → ISO.
  - duplicidade no campo-âncora (ID Manejo) → aviso.
  - se há `cat`+`sexo` e o sexo está vazio, **deriva** da categoria.
  - **status da linha = pior status das células.**
- O **modal de revisão** mostra: contadores **OK/aviso/erro** (verde/laranja/vermelho), banner de colunas obrigatórias ausentes / colunas ignoradas, tabela linha-a-linha com destaque por célula, e botão **"Importar N linhas OK"** (só as 100% conformes entram). As linhas OK viram `NascDetalhe[]`. Toast: "N animais importados da planilha".

---

## 11. Configuração de campos (modal do lápis — `CamposConfigModal`)

Modal (largura ≤ 920px) em **tabela**, 1 linha por campo do sistema. Persiste por organização o blob `MovimentoFieldConfig = { places, order, autonum }`.

### 11.1 Colunas / destinos (pílulas)
| Coluna | Place | Cor da pílula (ON) | Significado |
|---|---|---|---|
| **Linha Superior** | `top` | âmbar (`bg #fef6e0 / border #f3d98a / text #a06a12`) | repete em todos os lançamentos |
| **Linha Tabela Lançamento** | `bottom` | verde (`bg #e3f7ea / border #9bdcb2 / text #15803d`) | preenchido por animal |
| **Dados Adicionais** | `dados` | verde claro (`bg #e7f6ec / border #b7e0c4 / text #16a34a`) | recolhido na seção verde |
| **Desativado** | `off` | vermelho (`bg #fdecec / border #f3c0c0 / text #dc2626`) | não aparece |

Pílula inativa: `border-gray-200 bg-white text-gray-500`. Clicar numa pílula aplica o destino **ao vivo**.

### 11.2 Ordenar (drag-and-drop)
Alça `GripVertical` por linha (`@dnd-kit`, sensor com 5px de ativação, `closestCenter`, `arrayMove`). Define a **ordem global** (`order`) em que os campos aparecem.

### 11.3 Casos especiais (constraints)
- **`locked`** (ID Manejo): só permite `bottom` ou `off` (nunca `top`/`dados`). Exibe o chip **"Nº auto"** (checkbox) que liga/desliga `autonum`. É obrigatório.
- **`enableOnly`** (Sanitário): só permite `top` (Superior) ou `off` (Desativar).
- Demais campos: qualquer um dos 4 destinos.

### 11.4 Rodapé
- **"Restaurar padrão"** → reset de `places`/`order`/`autonum` para os defaults do registry.
- **"Concluir"** (verde) → fecha **e persiste** (`saveFieldConfig(org, { places, order, autonum })`).

### 11.5 Hook `useFieldConfig`
Carrega a config por org no mount/troca de org; mescla com defaults do registry (campos novos recebem seu `def` e são anexados ao `order`); expõe `{ fieldById, places, order, setOrder, autonum, setAutonum, configOpen, setConfigOpen, setPlace (com constraint), reset, closeConfig }`. `setPlace` aplica `constrainPlace`. `closeConfig` salva e trata erro via toast.

---

## 12. Registro de campos (LR_REGISTRY) — tabela completa

Ordem de exibição = ordem abaixo. Campos com `def` = destino padrão; `locked`/`enableOnly`/`span`/`default` conforme indicado.

| id | label | type | obrig. | destino padrão (`def`) | observações |
|---|---|---|---|---|---|
| `apelido` | ID Manejo | text | **sim** | `bottom` | **locked**; placeholder `504A`; Nº auto |
| `categoria` | Categoria | cat | **sim** | `bottom` | alimenta a distribuição + auto-Sexo |
| `data` | Data | date | sim | `top` | default hoje |
| `raca` | Raça | select | sim | `top` | options dinâmicas (raças ativas) ou `RACAS`; default `Nelore` |
| `lote` | Lote | lote | — | `top` | `LOTES_ESTATICOS` (mock) |
| `rfid` | ID Eletrônica | text | — | `bottom` | placeholder `RFID` |
| `sisbov` | Nº SISBOV | text | — | `bottom` | placeholder `SISBOV` |
| `sexo` | Sexo | sexo | sim | `bottom` | default `Macho`; auto da categoria |
| `porte` | Porte | select | sim | `bottom` | `PORTES = P,M,G`; default `M` |
| `colostro` | Colostro? | select | — | `bottom` | `Sim,Não`; default `Sim` |
| `peso` | Peso nasc. | weight | — | `bottom` | sufixo "Kg" |
| `pesagem` | Pesagem | select | — | `bottom` | `Manual,Balança`; default `Manual` |
| `sanitario` | Sanitário | sanitario | — | `top` | **enableOnly**; não é input (seção) |
| `nome` | Nome Completo | text | — | `dados` | span 2 |
| `pesoNascer` | Peso ao Nascer | weight | — | `dados` | |
| `grau` | Grau de Sangue | select | — | `dados` | `GRAUS` |
| `rgn` | RGN/Tatuagem | text | — | `dados` | |
| `pelagem` | Pelagem | select | — | `dados` | `PELAGENS` |
| `chifre` | Tipo de Chifre | select | — | `dados` | `CHIFRES` |
| `rgd` | RGD | text | — | `dados` | |
| `serie` | Série Alfa | text | — | `dados` | |
| `pai` | Pai - ID Usual | text | — | `dados` | |
| `mae` | Mãe - ID Usual | text | — | `dados` | |
| `obs` | Observação | textarea | — | `dados` | span 3 |

**Listas estáticas (mock — ver §20):**
- `RACAS = [Nelore, Anelorado, Brangus, Angus, Senepol, Cruzado]`
- `GRAUS = [PO, PC, 1/2 sangue, 3/4 sangue, 5/8 sangue, Cruzado]`
- `PELAGENS = [Branca, Preta, Cinza, Vermelha, Amarela, Baia, Castanha]`
- `CHIFRES = [Aspado, Mocho, Mochado, Batoque]`
- `PORTES = [P, M, G]` · `PESAGENS = [Manual, Balança]` · `COLOSTRO = [Sim, Não]` · `TIPO_DOSE = [Fixa, Por Peso]`
- `LOTES_ESTATICOS = [{lote-1: 'RC-01 · Recria Machos 24'}, {lote-2: 'EN-02 · Engorda Confinamento'}, {lote-3: 'RP-03 · Matrizes IATF'}]`
- `MEDICAMENTOS` (id, nome, unidade, custoUnit): Vacina Aftosa(DOSE,2.4), Brucelose B19(DOSE,3.1), Clostridiose(DOSE,1.8), Vermífugo Ivermectina 1%(ML,0.65), Agulha 40x12(UNIDADE,0.01), Mineral Injetável ADE(ML,0.9).
- `PROTOCOLOS`: Protocolo Cria — 1ª dose; Protocolo Sanitário Anual; Protocolo Pré-desmame.

### 12.1 Renderização por tipo de campo (`FieldControl`)
Tamanhos: `compact` (h≈38px, tabela) / default (h-10, form) / `grid` (h-10, Dados Adicionais). Foco verde (`border #16a34a` + ring).

| type | render |
|---|---|
| `text` | `<input type=text>` com placeholder |
| `textarea` | `<textarea rows=2 resize-y>` |
| `number` | `<input type=text inputMode=decimal>` |
| `date` | `<input type=date>` |
| `weight` | input decimal + sufixo **"Kg"** (verde) |
| `money` | prefixo **"R$"** + input decimal |
| `sexo` | `<select>`: `♂ M` (Macho) / `♀ F` (Fêmea) |
| `cat` | `<select>` das `categories` (option `Selecione` vazio) |
| `lote` | `<select>` dos `lotes` (option `—` vazio) |
| `lookup` | `<select>` de `lookups[lookupKey ?? id]` |
| `select` | `<select>` de `optionsOverride[id] ?? options` |
| `sanitario` | retorna `null` (é seção, não input) |

---

## 13. Distribuição por categoria, resumo e Salvar

### 13.1 Painel direito — `CategoriaGrid` (derivado, nunca digitado)
Tabela read-only consolidando **declarado (Sem ID)** + **detalhado (Com ID)** por categoria:

| Coluna | Conteúdo |
|---|---|
| **Categoria** | nome |
| **Sem ID** | `declarado` (qtd da `cats[]`) |
| **Com ID** | `detalhado` (contagem das fichas naquela categoria) — em **azul `#2563eb`** |
| **Total** | `declarado + detalhado` + "cab." |
| **Ações** | menu •••: **Editar**/**Excluir** — só habilitado quando `declarado > 0` (linhas só-com-ID mostram "só com ID", geridas no Lançamento Rápido) |

Mostra até ~4 linhas com header sticky; rola se houver mais (altura calculada via `ResizeObserver`). Menu via `createPortal`. Estado vazio: "Nenhuma categoria adicionada — o total começa em 0."

Linha consolidada (`ConsolidatedRow`): união dos `catId` de `cats[]` e do tally dos detalhados; `{ catId, catNome, declarado, detalhado, total }`.

Rodapé do painel: **Sem ID `<declarado>` · Com ID `<detalhado>` · `<total>` cab.**

### 13.2 Resumo ao vivo
Chip sob a linha de quantidade:
- só detalhado: verde "Total N cab. · X identificados".
- com declarado: cinza "Total N cab. · X identificados · Y a detalhar".

E na barra de ações: ícone+texto (laranja se houver "a detalhar", verde se tudo identificado).

### 13.3 Botão Salvar — habilitação e regras (`salvar`)
- **Habilitado** quando: `Σcats > 0` **ou** `detalhe.length > 0` **ou** (`catSel` selecionada **e** `total > 0`). (Botão desabilitado fica cinza `#86cfa4`.)
- Ao salvar:
  1. `declaradas = cats` (fallback: se vazio e houver `catSel`+`total>0`, cria `[{catSel,total}]`).
  2. `naoIdent = Σ declaradas.qtd`; `qtdTotal = naoIdent + detalhe.length`. Se `qtdTotal < 1` → erro "Informe ao menos uma categoria (sem detalhe) ou detalhe um animal".
  3. `fichas` = mapeadas dos detalhados (apelido, catId, rfid, sisbov, porte, raca, peso, **extras** via `extractExtras`).
  4. `catDecl` = **tally consolidado**: detalhado por categoria **+** declarado por categoria, somados por `catId`.
  5. `status = naoIdent > 0 ? 'pendente' : 'conciliado'`.
  6. Monta o payload (cabeçalho + qtd + naoIdent + status + catDecl + sanitario + fichas) e chama **create** (ou **update** se `editingId`).
  7. Limpa o formulário; sai do modo individual e da tela cheia.
- **Toasts:**
  - novo, com pendência: ⚠️ "Nascimento salvo · X identificados + Y a detalhar · total N cab." (warning)
  - novo, conciliado: ✅ "Nascimento salvo e conciliado · N cab. identificadas" (success)
  - edição: equivalentes com "Lançamento atualizado…".
  - sem org: erro "Selecione uma organização antes de salvar".
- **Cancelar** (`novo`): zera todo o estado do formulário e sai do modo edição.

---

## 14. Aba "Registros" (`LancamentosRecentes`) — master-detail

Título: "Todos os lançamentos — Nascimento"; subtítulo: "Clique em um lançamento para abri-lo; use ••• para ver, editar, atribuir ID ou excluir."

### 14.1 Master (lista, em cima)
Tabela rolável (altura `calc(100vh-240px)`, mín. 440px; a divisória ajusta a proporção). Header sticky. Colunas: chevron | **Data** | **Categoria** | **Qtd** (direita) | **Ações** (•••).
- **Data:** `DD/MM/AAAA`.
- **Categoria:** resumo "Categoria (qtd), ..." (helper de sumarização do `cat_decl`), ou "A detalhar".
- **Qtd:** `+N`.
- **Chevron:** expande as **subcategorias** do movimento (linhas indentadas, fundo verde claro), e seleciona o movimento (abre o detalhe).
- **Menu •••:** **Ver** (Eye) · **Editar** (FilePen) · **Atribuir ID** (IdCard) · **Excluir** (Trash2, vermelho). Renderizado via portal, posição fixa.
- Estado vazio: ícone Baby + "Nenhum lançamento ainda."

### 14.2 Divisória arrastável
Separador horizontal (cursor `row-resize`) entre master e detalhe; arrastar ajusta `masterPct` (15–85%).

### 14.3 Detail (embaixo) — `LancamentoDetalhe`
- Header sticky: "Detalhamento · DD/MM/AAAA" + badges de situação:
  - filtrado por categoria: badge da categoria (com X p/ limpar) + "X de N detalhados".
  - sem filtro: "N cab."; se `restantes>0` → laranja "X de N detalhados"; se 0 → verde "Totalmente identificado".
  - botão **"Atribuir ID"** (abre o form inline) / **"Fechar"**.
- **Form inline** (quando "Atribuir ID" ativo): reusa `FichaInclusaoForm` com a mesma config (places/order). **Enter** num campo dispara adicionar. Cada adição chama `onAddFicha` (→ `/api/nascimentos` action `add-ficha`, que **decrementa `nao_identificados`** e recalcula status no servidor). Auto-clear e auto-incremento do ID Manejo se `autonum`.
- **Tabela de fichas:** `ID Manejo | Categoria | ID Eletrônica | SISBOV | Peso | Porte`; filtrável por categoria (clicando na subcategoria do master). Estados vazios contextuais.

> A aba Registros **é a Mesa de Conciliação**: cada movimento pendente aparece aqui; identificar reduz a pendência até zerar (status → conciliado).

---

## 15. Atribuição de ID inline (`AtribuirIdPanel`)

Acionado por "Atribuir ID" (no menu ••• do master, ou via aba Lançamentos quando `abrirAtribuicao`). Painel com:
- Header: "Atribuição de ID" + badge "**X de N detalhados**" (laranja se faltam, verde se completo) + **Fechar**.
- Banner: "Individualizando o nascimento de DD/MM/AAAA — total N cab. (a quantidade é a base de conciliação)…".
- Tally por categoria (badges) + "Y a detalhar".
- **Linha de inclusão** (form): `ID Manejo *`, `Categoria` (default = `catDecl[0]` ou 1ª), `ID Eletrônica`, `SISBOV`, `Peso` (sufixo Kg), `Porte` (P/M/G), botão **Adicionar**. **Enter** adiciona. Valida `apelido` + `catId` + `restantes > 0`.
- Tabela das fichas já incluídas. Estado vazio: "Nenhum bezerro individualizado neste lançamento ainda."
- Toast ao adicionar: "Bezerro identificado · <apelido>".

---

## 16. Editar e Excluir movimento

### 16.1 Editar (`editarMovimento`)
Reabre o lançamento no formulário superior:
- Restaura cabeçalho (data/fazenda/retiro/local/proprietário).
- Reconstrói **detalhado** (1 `NascDetalhe` por ficha, com seus `values` + extras) e **declarado** `cats[]` = `catDecl[catId].qtd − (nº de fichas daquela categoria)`, filtrando `qtd > 0` (ou seja, `catDecl` é consolidado e o detalhado é subtraído para achar o declarado puro).
- Liga o modo individual se houver fichas; entra em `editingId`. Banner laranja "Editando um lançamento existente…". Botão vira **"Salvar alterações"** → `PUT` (substitui as fichas integralmente). Toast informativo.

### 16.2 Excluir (`excluirMovimento`)
Confirmação ("Excluir o lançamento de DD/MM/AAAA (N cab.)? Esta ação não pode ser desfeita."), `DELETE`, remove da lista; se estava em edição/atribuição, limpa o estado. Toast "Lançamento excluído".

---

## 17. Campos Personalizados (extras)

- Cadastro central `campos_personalizados` (por org): `{ id, nome, tipo: 'texto'|'numero'|'lista', opcoes[] (máx 4), movimentos[] (compra/venda/nascimento/morte/consumo), obrigatorio, ordem }`. CRUD em `/api/campos-personalizados` (GET/POST/PATCH/DELETE + `action:'reorder'`).
- `useCamposPersonalizados(org, 'nascimento')` filtra os que incluem `'nascimento'` e os converte em `LrField` com **id `cp_<uuid>`**, `type` mapeado (`texto→text`, `numero→number`, `lista→select`), `options = opcoes` (para lista), `def: 'dados'`. São **mesclados** ao registry: `registry = [...LR_REGISTRY, ...cpFields]`.
- No Salvar, `extractExtras(values)` extrai só as chaves `cp_*` não-vazias → gravadas em `nascimento_fichas.extras` (jsonb). Aparecem na configuração de campos como linhas normais (default em Dados Adicionais).

---

## 18. Integrações e dependências

### 18.1 Categorias (`/api/animal-categories?organizationId=`)
A tela **filtra para `grupo === 'bezerros_mamando'`** (nascimento de bezerros). Usa `{ id, nome, sexo }`; `sexo` alimenta o auto-Sexo.

### 18.2 Raças (`/api/animal-breeds?organizationId=`)
Filtra `ativo === true`; nomes entram como `optionsOverride.raca` (substitui `RACAS` quando houver raças cadastradas).

### 18.3 Locais e `resolveDefaultLocalId`
`GET /api/farm-locations?farmIdLocais=<farmId>` → locais não-default `{ id, name, retiroName }`. No create/update do movimento, se `localId` for null e houver `farmId`, o repositório chama `resolveDefaultLocalId(farmId)` (acha/cria a "espinha" default retiro/setor/local e devolve o local folha).

### 18.4 Downstream — rebanho vivo (`animalRegistry.ts`)
As `nascimento_fichas` **alimentam a Categoria atual / rebanho vivo**: cada ficha vira um registro `{ __src:'nascimento', apelido, categoria, sexo (derivado), rfid, sisbov, porte, raca, peso, situacao:'ativo', data, fazendaNascimento, … }`. A união com `fichas_animal` (cadastro) é **deduplicada por `apelido`** (case-insensitive), com o cadastro tendo prioridade; mortes (por apelido/rfid) marcam `situacao:'morte'`. **Consequência para o rebuild:** o contrato das fichas (apelido como chave, categoria, sexo derivável) precisa ser preservado.

---

## 19. Regras de negócio / invariantes (resumo para QA)

1. `qtd = naoIdentificados + (nº de fichas)` em todo movimento salvo.
2. `naoIdentificados = Σ cat_decl.qtd − (nº de fichas)`? **Não** diretamente: `cat_decl` é **consolidado** (declarado + detalhado). O **declarado puro** = `cat_decl − tally(fichas)`; `naoIdentificados` = Σ declarado puro. Ao reabrir para editar, reconstroem-se as duas camadas a partir de `cat_decl` e das fichas.
3. `status` é sempre derivado de `naoIdentificados` (>0 ⇒ pendente).
4. `add-ficha` decrementa `naoIdentificados` (mín. 0) e recalcula status no servidor.
5. `update` **substitui todas as fichas** (delete+insert).
6. `delete` do movimento **cascateia** as fichas.
7. Categoria, ID Manejo e (no individual) o conjunto mínimo são os obrigatórios; **peso nunca é obrigatório**.
8. Safra é sempre derivada da data (jul→jun) e nunca digitada.
9. Saldos por categoria são **derivados** (declarado + detalhado), nunca persistidos como verdade independente.
10. Trocar de modo (brinco/lote) não apaga dados.

---

## 20. Listas estáticas / dívidas técnicas (mock a substituir)

As seguintes listas são **mock no front** e devem virar dados reais no rebuild (ou ser explicitamente mantidas):
- **Lotes** (`LOTES_ESTATICOS`) — sem backend de Movimentação de lotes nesta tela.
- **Medicamentos / Protocolos / Tipo de Dose** do Sanitário — estáticos com custo fixo; o custo total é apenas informativo (não integra financeiro ainda).
- **Raças/Graus/Pelagens/Chifres** — `RACAS` é sobreposto pelas raças cadastradas; os demais seguem estáticos.
- `retiro` é **texto livre** no movimento (não FK) — considerar normalizar.

---

## 21. Design tokens (paleta)

| Uso | Cor |
|---|---|
| Primária / sucesso / ações | `#16a34a` (hover `#15803d`; desabilitado `#86cfa4`) |
| Seleção/realce verde | `#e7f6ec` / `#cfeede` / `#f5fbf7` / `#cdebd7` |
| "Com ID" (identificado) | `#2563eb` (azul) |
| Aviso / pendência | texto `#ea580c`, fundo `#fdeee3`/`#fff7ed`, banner edição `#ea580c`/`#fff7ed`/`#fcd9b6` |
| Erro / desativado | `#dc2626`, fundo `#fdecec`, borda `#f3c0c0` |
| Destino "Superior" (config) | `#a06a12` / `#fef6e0` / `#f3d98a` (âmbar) |
| Texto | `#0F172A`/`#111827` (títulos), gray-800/700/500/400 |
| Bordas | gray-200 (padrão), gray-100/50 |
| Foco de input | borda `#16a34a` + ring `#16a34a`/15 |

Tipografia: títulos `font-black`; labels `12.5px font-semibold`; inputs `h-10` (form) / `38px` (tabela).

---

## 22. Mensagens (toasts) — texto exato

| Evento | Tipo | Mensagem |
|---|---|---|
| Categoria adicionada | success | `Categoria adicionada · <nome> · <qtd> cab.` |
| Falta categoria | error | `Selecione a categoria` |
| Falta quantidade | error | `Informe a quantidade desta categoria` |
| Falta ID Manejo | error | `Informe o ID Manejo` |
| Importação | success | `<N> animais importados da planilha` |
| Salvar novo c/ pendência | warning | `Nascimento salvo · X identificados + Y a detalhar · total N cab.` |
| Salvar novo conciliado | success | `Nascimento salvo e conciliado · N cab. identificadas` |
| Salvar edição | warning/success | `Lançamento atualizado…` (equivalentes) |
| Sem org | error | `Selecione uma organização antes de salvar` |
| Identificou bezerro | success | `Bezerro identificado · <apelido>` |
| Entrou em edição | info | `Editando lançamento de DD/MM/AAAA — altere e clique em Salvar` |
| Excluiu | success | `Lançamento excluído` |
| Erro genérico | error | `Erro ao salvar/atualizar/excluir nascimento` |

---

## 23. Critérios de aceite (checklist de QA)

- [ ] Cabeçalho com Data (safra derivada read-only), Proprietário, Fazenda, Retiro (auto se único), Local (filtrado por retiro).
- [ ] Toggle brinco/lote alterna individual×coletivo **sem apagar** dados.
- [ ] Modo coletivo: Quantidade+Categoria+"+ mais" some por categoria; editar/remover; soma exibida.
- [ ] Modo individual: Lançamento Rápido com 3 seções (Repete em todos / Individual / Dados Adicionais).
- [ ] ID Manejo + Categoria obrigatórios; peso opcional; numeração automática preservando prefixo/sufixo/zeros.
- [ ] Sexo auto-preenchido pela categoria.
- [ ] Sanitário: form + tabela + custo por aplicação + custo total; só Superior/Desativar.
- [ ] Lápis abre modal com 4 destinos (Superior âmbar / Tabela verde / Adicionais verde-claro / Desativado vermelho), drag-to-reorder, chip "Nº auto", Restaurar padrão / Concluir (persistido por org).
- [ ] Distribuição por categoria é **derivada** (Sem ID + Com ID = Total); nunca digitada.
- [ ] Salvar habilita com declarado e/ou detalhado; `qtd = declarado + detalhado`; `status` derivado; `catDecl` consolidado.
- [ ] **Identificação não bloqueia o salvamento** (pode salvar com pendência).
- [ ] Importar/Exportar planilha com revisão célula-a-célula (só importa linhas 100% OK).
- [ ] Tela cheia (Expandir) com Esc para sair e scroll do body travado.
- [ ] Aba Registros: master-detail, menu ••• (Ver/Editar/Atribuir ID/Excluir), filtro por subcategoria, divisória arrastável.
- [ ] Atribuir ID inline decrementa `nao_identificados` e zera → status `conciliado`.
- [ ] Editar reconstrói as duas camadas e salva via PUT (substitui fichas). Excluir cascateia fichas.
- [ ] Campos Personalizados (`cp_*`) entram no kit e gravam em `extras`.
- [ ] Categorias restritas a `grupo='bezerros_mamando'`; raças a `ativo=true`.
- [ ] Local nulo resolve para o local default da fazenda.
- [ ] Fichas geradas mantêm o contrato consumido pelo rebanho vivo (dedup por apelido).

---

### Anexo A — Tipos TypeScript de referência

```ts
type FieldPlace = 'top' | 'bottom' | 'dados' | 'off';
type FieldType  = 'text'|'textarea'|'number'|'date'|'weight'|'money'|'select'|'cat'|'lote'|'lookup'|'sexo'|'sanitario';

interface LrField {
  id: string; label: string; type: FieldType;
  req?: boolean; placeholder?: string; options?: readonly string[];
  lookupKey?: string; default?: string; def: FieldPlace;
  locked?: boolean; enableOnly?: boolean; span?: 1|2|3;
}
interface MovimentoFieldConfig { places: Record<string,FieldPlace>; order: string[]; autonum: boolean; }

interface NascCat { catId: string; catNome: string; qtd: number; }                 // declarado
interface NascDetalhe { id: number; values: Record<string,string>; }               // detalhado (form)
interface ConsolidatedRow { catId: string; catNome: string; declarado: number; detalhado: number; total: number; }
interface SanItem { id: number; medId: string; nome: string; unidade: string; tipoDose: string; dose: number; porKg: number; custo: number; }
interface AtribFicha { id: number; apelido: string; catId: string; rfid?: string; sisbov?: string; porte?: string; raca?: string; peso?: number; extras?: Record<string,string>; }

interface MovimentoNasc {
  id: string; data: string; qtd: number; categoria: null;
  catDecl: { catId: string; qtd: number }[]; fichas: AtribFicha[];
  naoIdentificados: number; status: 'pendente'|'conciliado';
  fazenda?: string; retiro?: string; local?: string; proprietario?: string; safra?: string; sanitario?: SanItem[];
}
```

### Anexo B — Funções puras de referência (`util.ts`)
- `todayISO()` → `AAAA-MM-DD` local.
- `formatDateBR(iso)` → `DD/MM/AAAA`.
- `safraDaData(iso)` → safra jul→jun.
- `proximoApelido(prev)` → incremento preservando prefixo/sufixo/zeros.
- `parseWeight(str)` → número (aceita vírgula/ponto), 0 se inválido.
- `somaCategorias(cats)`, `semCategoria(total, contribuido)`, `statusFrom(naoIdent)`, `custoSanitario(items)`, `tallyPorCategoria(detalhe)`, `sexoFromCategoria(categories, catId)`, `fmtMoeda(n)`.

---
*Fim do PRD. Em caso de divergência entre este documento e a Spec 1.0, **este (v2.0) prevalece** — ele reflete o comportamento aditivo atualmente implementado.*
