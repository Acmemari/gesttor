# PRD - Rotina Semanal (Gestao Semanal de Atividades)

> **Produto:** Gesttor
> **Funcionalidade:** Rotina Semanal
> **Data:** 2026-04-06
> **Status:** Documentacao da feature existente (as-built)

---

## 1. Visao Geral

A **Rotina Semanal** e o modulo central de gestao operacional do Gesttor, permitindo que analistas e gestores de fazendas planejem, acompanhem e avaliem atividades semanais por responsavel. O modulo opera em ciclos de abertura e fechamento de semanas, com rastreamento de historico, metricas de desempenho, transcricao de reunioes e geracao de atas.

### 1.1 Problema que Resolve

Fazendas e consultorias agropecuarias precisam de um sistema estruturado para:
- Distribuir e acompanhar tarefas semanais por colaborador
- Registrar decisoes de reunioes semanais de equipe
- Medir produtividade individual e coletiva ao longo do tempo
- Manter historico auditavel de semanas encerradas
- Transicionar tarefas pendentes entre semanas sem perda de contexto

### 1.2 Usuarios-Alvo

| Papel | Uso Principal |
|-------|--------------|
| **Analista/Consultor** | Cria semanas, atribui tarefas, fecha semanas, analisa desempenho |
| **Administrador** | Acesso total + permissoes de edicao em semanas fechadas e exclusao |
| **Cliente** | Visualiza atividades e status da fazenda |

---

## 2. Arquitetura do Modulo

### 2.1 Abas / Views

O modulo `GestaoSemanal` e composto por **5 abas**:

| Aba | Componente | Descricao |
|-----|-----------|-----------|
| **Rotina** | `GestaoSemanal.tsx` | Gestao de atividades da semana corrente |
| **Historico** | Inline em `GestaoSemanal.tsx` | Registro de semanas fechadas com metricas |
| **Desempenho** | `DesempenhoView.tsx` | Dashboard analitico de performance por colaborador |
| **Transcricoes** | `TranscricoesView.tsx` | Upload e processamento de transcricoes de reunioes |
| **Atas** | `AtasView.tsx` | Criacao e gestao de atas de reuniao |

### 2.2 Ponto de Entrada

Acessivel via menu lateral **Gestao > Rotinas Fazenda > Rotina Semanal** (`RotinasFazendaDesktop.tsx`). As rotinas Mensal e Trimestral estao previstas mas inativas.

---

## 3. Modelo de Dados

### 3.1 Tabela `semanas` (work_weeks)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | UUID (PK) | Identificador unico |
| `numero` | INTEGER | Numero da semana (1-52 modo ano; sequencial modo safra) |
| `modo` | TEXT | `'ano'` (calendario) ou `'safra'` (jul-jun) |
| `aberta` | BOOLEAN | `true` = semana corrente ativa |
| `dataInicio` | DATE | Segunda-feira da semana |
| `dataFim` | DATE | Domingo da semana |
| `farmId` | TEXT (FK) | Fazenda associada |

**Indexes:** `(farmId, modo, aberta)`, `(numero, modo, farmId)`

### 3.2 Tabela `atividades` (activities)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | UUID (PK) | Identificador unico |
| `semanaId` | UUID (FK -> semanas) | Semana a qual pertence (CASCADE delete) |
| `titulo` | TEXT | Titulo da tarefa (obrigatorio) |
| `descricao` | TEXT | Descricao detalhada |
| `pessoaId` | UUID (FK -> people) | Responsavel atribuido |
| `dataTermino` | DATE | Prazo de conclusao |
| `tag` | TEXT | Categoria (default: `#planejamento`) |
| `status` | TEXT | Estado atual (default: `a fazer`) |
| `prioridade` | TEXT | Nivel de urgencia (default: `media`) |
| `parentId` | UUID (FK -> self) | Subtarefa (maximo 2 niveis) |
| `createdAt` | TIMESTAMP | Data de criacao |

**Indexes:** `semanaId`, `status`, `parentId`

### 3.3 Tabela `historicoSemanas` (week_history)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | UUID (PK) | Identificador unico |
| `semanaNumero` | INTEGER | Numero da semana registrada |
| `total` | INTEGER | Total de atividades |
| `concluidas` | INTEGER | Atividades concluidas |
| `pendentes` | INTEGER | Atividades pendentes |
| `closedAt` | TIMESTAMP | Data/hora do fechamento |
| `reopenedAt` | TIMESTAMP | Data/hora da reabertura (se houver) |
| `semanaId` | UUID (FK) | Referencia a semana |
| `farmId` | TEXT (FK) | Fazenda |

### 3.4 Tabela `semanaParticipantes` (week_meeting_participants)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | UUID (PK) | Identificador unico |
| `semanaId` | UUID (FK) | Semana da reuniao |
| `pessoaId` | UUID (FK) | Participante |
| `presenca` | BOOLEAN | Presente na reuniao |
| `modalidade` | TEXT | `'online'` ou `'presencial'` |

**Constraint:** UNIQUE `(semanaId, pessoaId)`

### 3.5 Tabela `semanaTranscricoes`

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | UUID (PK) | Identificador unico |
| `semanaId` | UUID (FK) | Semana da reuniao |
| `farmId`, `organizationId` | TEXT (FK) | Contexto organizacional |
| `fileName`, `fileType`, `fileSize` | TEXT/INT | Metadados do arquivo |
| `storagePath` | TEXT | Caminho no S3 |
| `processedResult` | JSONB | Resultado da IA (resumo, decisoes, tarefas, ata, riscos, incertezas) |
| `tipo` | TEXT | `'manual'` ou `'auto'` |

### 3.6 Tabela `atas` (meeting_minutes)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | UUID (PK) | Identificador unico |
| `semanaFechadaId`, `semanaAbertaId` | UUID (FK) | Semanas associadas |
| `farmId`, `organizationId` | TEXT (FK) | Contexto |
| `createdBy` | TEXT (FK) | Autor |
| `dataReuniao` | DATE | Data da reuniao |
| `conteudo` | JSONB | Conteudo estruturado da ata |
| `versao` | INTEGER | Versionamento |

---

## 4. Enumeracoes e Constantes

### 4.1 Status de Atividade

| Valor | Label | Cor | Comportamento |
|-------|-------|-----|---------------|
| `a fazer` | A Fazer | Cinza (#6B7280) | Estado inicial |
| `em andamento` | Em Andamento | Azul (#2563EB) | Trabalho em progresso |
| `pausada` | Pausada | Laranja (#D97706) | Interrompida temporariamente |
| `concluida` | Concluida | Verde (#059669) | Finalizada |

### 4.2 Prioridade

| Valor | Contexto |
|-------|----------|
| `alta` | Urgente/critica |
| `media` | Normal (default) |
| `baixa` | Pode esperar |

### 4.3 Tags (Categorias)

| Tag | Cor | Uso |
|-----|-----|-----|
| `#planejamento` | Indigo | Atividades de planejamento (default) |
| `#desenvolvimento` | Verde | Implementacao/execucao |
| `#revisao` | Laranja | Revisao e verificacao |
| `#deploy` | Rosa | Deploy/implantacao |
| `#reuniao` | Azul | Reunioes |
| `#bug` | Vermelho | Correcao de problemas |
| `#docs` | Amarelo | Documentacao |

### 4.4 Modos de Semana

| Modo | Calculo |
|------|---------|
| `ano` | ISO week number (semana 1 = semana com a primeira quinta do ano) |
| `safra` | Sequencial a partir de 1 de julho (safra pecuaria) |

---

## 5. Funcionalidades Detalhadas

### 5.1 Ciclo de Vida da Semana

```
[Sem semana] -> Abrir Semana -> [Semana Aberta] -> Fechar Semana -> [Semana Fechada]
                                      ^                               |
                                      +-- Carry-over de pendentes <---+
```

**Abrir Semana:**
1. Calcula a segunda-feira da semana corrente via `getMondayOfWeek()`
2. Define `dataInicio` (segunda) e `dataFim` (domingo)
3. Calcula `numero` da semana conforme o `modo` (ano/safra)
4. Verifica se ja existe semana com mesmo `dataInicio` para a fazenda
5. Cria registro em `semanas` com `aberta = true`
6. Se havia semana anterior fechada: detecta tarefas pendentes e oferece carry-over

**Fechar Semana:**
1. Valida que todas as subtarefas estao concluidas
2. Conta `total`, `concluidas`, `pendentes` das atividades
3. Cria registro em `historicoSemanas` com os totais
4. Atualiza `semanas.aberta = false`
5. Exibe modal de carry-over para tarefas pendentes (tarefas-pai)

**Reabrir Semana:**
- Permitido apenas para usuarios com permissao `canEditClosedWeek`
- Atualiza `reopenedAt` no historico

### 5.2 Gestao de Atividades (Aba Rotina)

**Criacao de Atividade:**
- Campos: titulo (obrigatorio), descricao, responsavel, prazo, tag, prioridade
- Formulario inline no topo da lista
- Modal expandido para edicao detalhada (`showTaskModal`)

**Visualizacao:**
- Grid com colunas: `Titulo | Pessoa (180px) | Prioridade (130px) | Status (110px) | Menu (40px)`
- Agrupamento visual por tag
- Indicador de prazo: `no_prazo` (verde) ou `atrasada` (vermelho)
- Expansao de subtarefas com toggle

**Filtros (AND-based):**
- Prioridade (alta/media/baixa)
- Busca por descricao (texto livre)
- Pessoa responsavel (dropdown)
- Data de termino
- Tag (dropdown)
- Status (dropdown)

**Ordenacao:**
- Colunas: titulo, pessoa, dataTermino, status
- Direcoes: asc/desc (toggle)

**Subtarefas:**
- Maximo 2 niveis (tarefa-pai -> subtarefa)
- Nao e possivel criar sub-subtarefa (validacao na API)
- Tarefa-pai nao pode ser marcada como `concluida` ate todas as subtarefas estarem concluidas
- Delete cascade: ao deletar pai, subtarefas sao removidas

**Carry-Over:**
1. Ao abrir nova semana, detecta tarefas pendentes (`status != concluida`) da semana anterior
2. Modal exibe apenas tarefas-pai pendentes como candidatas
3. Usuario seleciona quais transferir
4. Usa `createAtividadesBulk()` para criar copias na nova semana
5. Tarefas originais permanecem na semana fechada (historico preservado)

### 5.3 Integracao com Projetos

- Aba secundaria `"projetos"` na view de rotina
- Exibe tarefas de `initiative_tasks` vinculadas a semana via `listTasksByWeek()`
- Interface unificada com tipo `UnifiedTask` (campo `origin: 'weekly' | 'project'`)
- Permite atualizar status de tarefas de projeto diretamente da rotina semanal

### 5.4 Participantes de Reuniao

- Lista de pessoas da fazenda exibida para controle de presenca
- Campos por participante: `presenca` (boolean) + `modalidade` (online/presencial)
- Bulk upsert via `/api/semana-participantes` com deduplicacao por `(semanaId, pessoaId)`

### 5.5 Aba Historico

- Lista de todas as semanas fechadas com metricas
- Para cada semana: numero, periodo, total/concluidas/pendentes, data de fechamento
- Permite reabrir semana (com permissao)
- Permite excluir semana (com permissao)

### 5.6 Aba Desempenho (`DesempenhoView.tsx`)

**Filtros de Periodo:**
- Semana atual (baseada na semana aberta)
- Ultima semana
- Mes atual (1o do mes ate hoje)
- Personalizado (date range picker)

**Filtro de Prioridade:**
- Todas / Alta / Media / Baixa
- Aplicado como parametro da query

**Metricas Calculadas (por colaborador):**

| Metrica | Calculo |
|---------|---------|
| `concluidas` | COUNT(status = 'concluida') no periodo |
| `pendentes` | COUNT(status != 'concluida') no periodo |
| `total` | concluidas + pendentes |
| `eficiencia` | (concluidas / total) x 100 |
| `status` | >=80% = Excelente, >=60% = Bom, <60% = Regular |

**Visualizacoes:**

1. **Grafico de Barras** - "Tarefas por Colaborador"
   - Eixo X: nome do colaborador
   - Barras: Alocadas (#79828b) vs Realizadas (#3b82f6)

2. **Grafico de Rosca** - "Eficiencia Media"
   - Centro: eficiencia global %
   - Segmentos: contribuicao por colaborador

3. **Tabela Ranking** - "Ranking de Produtividade"
   - Colunas: Colaborador (avatar+nome), Total, Concluidas (verde), Pendentes (laranja), Eficiencia (barra de progresso + %), Status (badge)
   - Ordenado por eficiencia decrescente

**Exportacao:** PDF via `generateDesempenhoPdf()` com graficos e tabela

### 5.7 Aba Transcricoes (`TranscricoesView.tsx`)

- Upload de arquivos de transcricao (PDF, DOCX, audio)
- Armazenamento no S3 via `storageUpload()`
- Processamento por IA que extrai:
  - Resumo da reuniao
  - Decisoes tomadas
  - Tarefas identificadas
  - Ata sugerida
  - Riscos e incertezas
- Vinculacao a semana e fazenda

### 5.8 Aba Atas (`AtasView.tsx`)

- Criacao/edicao de atas de reuniao formais
- Conteudo estruturado em JSONB (flexivel)
- Upload de fotos e anotacoes
- Integracao com transcricoes processadas
- Exportacao em PDF
- Versionamento (`versao` incremental)
- Vincula semana fechada e semana aberta (transicao)

---

## 6. Permissoes e Controle de Acesso

### 6.1 Verificacao de Acesso a Fazenda

Todas as operacoes passam por `assertFarmAccess(farmId, userId, role)` - retorna 403 se nao autorizado.

### 6.2 Permissoes Granulares

| Permissao | Quem Tem | O que Permite |
|-----------|----------|---------------|
| `canFecharSemana` | Admin, Analista com qualificacao | Fechar semana aberta |
| `canEditClosedWeek` | Admin, pessoa com flag `podeAlterarSemanaFechada` | Editar atividades em semanas fechadas |
| `canDeleteWeek` | Admin, pessoa com flag `podeApagarSemana` | Excluir semanas |

Verificacao via `checkPermsByEmail()` no carregamento do componente.

### 6.3 Restricoes em Semana Fechada

- Atividades nao podem ser criadas/editadas/deletadas (exceto com `canEditClosedWeek`)
- Status nao pode ser alterado
- Formulario de nova atividade fica desabilitado

---

## 7. API Endpoints

### 7.1 Semanas

| Metodo | Endpoint | Parametros | Descricao |
|--------|----------|------------|-----------|
| GET | `/api/semanas?current=true` | `farmId`, `modo` | Obtem semana aberta |
| GET | `/api/semanas?dataInicio=YYYY-MM-DD` | `farmId` | Busca por data de inicio |
| GET | `/api/semanas?id=UUID` | - | Busca por ID |
| GET | `/api/semanas?numero=N&modo=M` | `farmId` | Verifica existencia |
| GET | `/api/semanas?farmId=X&list=true` | - | Lista todas da fazenda |
| POST | `/api/semanas` | Body: `SemanaPayload` | Cria nova semana |
| PATCH | `/api/semanas?id=UUID` | Body: partial | Atualiza (ex: fechar) |
| DELETE | `/api/semanas?id=UUID` | - | Exclui semana |

### 7.2 Atividades

| Metodo | Endpoint | Parametros | Descricao |
|--------|----------|------------|-----------|
| GET | `/api/atividades?semanaId=UUID` | - | Lista atividades da semana |
| POST | `/api/atividades` | Body: `AtividadePayload` | Cria atividade |
| POST | `/api/atividades?bulk=true` | Body: `AtividadePayload[]` | Criacao em lote (carry-over) |
| PATCH | `/api/atividades?id=UUID` | Body: partial | Atualiza atividade |
| DELETE | `/api/atividades?id=UUID` | - | Exclui atividade |
| DELETE | `/api/atividades?semanaId=UUID` | - | Exclui todas da semana |

### 7.3 Historico

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/historico-semanas?farmId=X` | Lista historico da fazenda |
| POST | `/api/historico-semanas` | Cria registro de fechamento |
| PATCH | `/api/historico-semanas?id=UUID` | Atualiza contagens |
| DELETE | `/api/historico-semanas?id=UUID` | Exclui registro |

### 7.4 Participantes

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/semana-participantes?semanaId=UUID` | Lista participantes |
| POST | `/api/semana-participantes` | Upsert participantes |

### 7.5 Desempenho

| Metodo | Endpoint | Parametros | Descricao |
|--------|----------|------------|-----------|
| GET | `/api/desempenho` | `farmId`, `dataInicio`, `dataFim`, `prioridade?` | Metricas de performance |

---

## 8. Fluxos de Usuario

### 8.1 Fluxo Principal - Semana Tipica

```
1. Analista abre nova semana (segunda-feira)
2. Carry-over: seleciona pendentes da semana anterior
3. Cria novas atividades, atribui responsaveis e prazos
4. Durante a semana: colaboradores atualizam status das tarefas
5. Reuniao semanal:
   a. Registra participantes e modalidade
   b. Upload de transcricao da reuniao
   c. IA processa transcricao -> sugere ata
6. Analista revisa e fecha semana
7. Historico registra metricas automaticamente
8. Ciclo recomeca
```

### 8.2 Fluxo de Carry-Over

```
1. Semana anterior fechada com tarefas pendentes
2. Ao abrir nova semana -> modal exibe candidatos
3. Candidatos = tarefas-pai com status != 'concluida'
4. Usuario marca/desmarca via checkbox
5. Confirma -> bulk insert na nova semana
6. Tarefas originais preservadas na semana antiga
```

### 8.3 Fluxo de Analise de Desempenho

```
1. Acessa aba Desempenho
2. Seleciona periodo (preset ou personalizado)
3. Opcionalmente filtra por prioridade
4. Visualiza graficos e ranking
5. Exporta PDF para compartilhar com equipe
```

---

## 9. Stack Tecnica

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + TypeScript + Vite |
| Estilizacao | Tailwind CSS + inline styles |
| Graficos | Recharts |
| PDF | jsPDF + html2canvas |
| Backend | Express 5 + Node.js |
| Banco de Dados | PostgreSQL (Neon) via Drizzle ORM |
| Armazenamento | AWS S3 (presigned URLs) |
| IA | OpenAI SDK (transcricoes) |
| Auth | Better Auth |

---

## 10. Arquivos Criticos

| Arquivo | Linhas | Papel |
|---------|--------|-------|
| `agents/GestaoSemanal.tsx` | ~2.700 | Componente principal (rotina + historico) |
| `agents/DesempenhoView.tsx` | ~150+ | Dashboard de desempenho |
| `agents/TranscricoesView.tsx` | - | Upload/processamento de transcricoes |
| `agents/AtasView.tsx` | - | Gestao de atas |
| `agents/RotinasFazendaDesktop.tsx` | 70 | Pagina de selecao de rotinas |
| `api/semanas.ts` | 163 | API de semanas |
| `api/atividades.ts` | 205 | API de atividades |
| `api/historico-semanas.ts` | 116 | API de historico |
| `api/semana-participantes.ts` | 86 | API de participantes |
| `api/desempenho.ts` | 62 | API de desempenho |
| `lib/api/semanasClient.ts` | 233 | Cliente HTTP para semanas/atividades |
| `lib/api/desempenhoClient.ts` | 35 | Cliente HTTP para desempenho |
| `src/DB/repositories/semanas.ts` | 365 | Repository layer (queries SQL) |
| `src/DB/schema.ts` | - | Schema do banco (linhas 301-400) |
| `types.ts` | - | Tipos compartilhados |

---

## 11. Limitacoes Conhecidas e Decisoes de Design

1. **Subtarefas limitadas a 2 niveis** - Decisao intencional para manter simplicidade; validada na API
2. **Carry-over copia, nao move** - Tarefas originais preservadas para integridade do historico
3. **Uma semana aberta por fazenda** - Constraint implicita no fluxo (nao no banco)
4. **Modo safra** - Contagem sequencial a partir de julho, alinhada ao calendario pecuario brasileiro
5. **Componente monolitico (~2.700 linhas)** - `GestaoSemanal.tsx` concentra toda a logica da aba Rotina + Historico
6. **Rotinas Mensal e Trimestral** - Previstas no `RotinasFazendaDesktop.tsx` mas ainda nao implementadas (cards inativos)
7. **Integracao com Projetos** - Tarefas de `initiative_tasks` exibidas na rotina semanal via tipo unificado `UnifiedTask`
