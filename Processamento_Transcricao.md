# Processamento de Transcrição de Reuniões — Gesttor

Documentação completa do fluxo de processamento de transcrições dentro da **Rotina Semanal** do Gesttor. Cobre desde o upload do áudio até a geração estruturada de Resumo, Decisões, Tarefas, Ata, Riscos e Incertezas.

---

## Visão Geral do Fluxo

```
Áudio/Documento ──► Upload (multer) ──► Transcrição (Whisper) ──► Texto Bruto
                                                                       │
                                                                       ▼
                                                              Processamento IA
                                                          (transcricao-proc ou ata-gen)
                                                                       │
                                                                       ▼
                                                              Saída Estruturada
                                                    ┌──────────────────┼──────────────────┐
                                                    │                  │                  │
                                                 Resumo           Decisões            Tarefas
                                                    │                  │                  │
                                                   Ata             Riscos           Incertezas
```

**Fluxo resumido:**
1. O usuário faz upload de um arquivo de áudio (ou documento) na aba **Transcrições** da Rotina Semanal
2. O sistema transcreve o áudio via **OpenAI Whisper** (modelo `whisper-1`)
3. O texto bruto é salvo no banco de dados
4. O usuário clica em **Processar** para enviar o texto ao agente de IA
5. O agente retorna a saída estruturada em JSON com todos os campos organizados

---

## Etapa 1: Upload e Transcrição de Áudio

### Formatos Aceitos

| Formato | MIME Types |
|---------|-----------|
| MP3     | `audio/mpeg`, `audio/mp3` |
| M4A     | `audio/mp4`, `audio/x-m4a`, `audio/m4a` |
| WAV     | `audio/wav`, `audio/x-wav` |
| WebM    | `audio/webm` |
| OGG     | `audio/ogg` |

### Limites de Tamanho

| Parâmetro | Valor |
|-----------|-------|
| Tamanho máximo de upload | **200 MB** |
| Limite por chunk (API OpenAI) | **25 MB** |
| Tamanho alvo de cada chunk | **23 MB** (margem de segurança) |

### Chunking Automático

Quando o arquivo excede 25 MB, o sistema divide automaticamente em segmentos menores:

1. Salva o arquivo em diretório temporário
2. Lê a duração total do áudio via **ffmpeg**
3. Divide em N segmentos proporcionais (cópia de bitstream, sem re-encodar)
4. Transcreve cada segmento sequencialmente via Whisper
5. Concatena todos os textos transcritos
6. Remove arquivos temporários

### Modelo de Transcrição

- **Modelo:** `whisper-1` (OpenAI)
- **Idioma:** `pt` (Português)
- **Formato de resposta:** `text`

### Documentos Suportados (além de áudio)

O sistema também aceita upload de documentos para extração de texto:
- PDF, DOCX, DOC, TXT, MD, RTF, ODT

---

## Etapa 2: Processamento por IA

Existem **dois agentes** disponíveis para processar a transcrição, cada um com finalidade diferente:

| Característica | transcricao-proc | ata-gen |
|---------------|-----------------|---------|
| **Finalidade** | Processamento detalhado da transcrição bruta | Geração simplificada de ata com contexto da semana |
| **Modelo principal** | Claude Sonnet 4.6 | Claude Haiku 4.5 |
| **Fallbacks** | Gemini 2.0 Flash → GPT-4o-mini | Gemini 2.0 Flash → GPT-4o-mini |
| **Temperatura** | 0.2 (mais determinístico) | 0.3 |
| **Max tokens** | 8.000 | 4.000 |
| **Entrada** | Apenas texto da transcrição | Transcrição + atividades + participantes |
| **Campos de saída** | 9 campos detalhados | 5 campos simplificados |

---

## Agente Principal: transcricao-proc

### As 7 Regras de Processamento

O agente `transcricao-proc` segue rigorosamente 7 regras para transformar uma transcrição bruta em uma ata estruturada:

### Regra 1: Trate a Transcrição como Fonte Imperfeita

A transcrição foi gerada por reconhecimento de voz automático (STT). Palavras foram trocadas, nomes foram deturpados e termos técnicos foram corrompidos.

**Instruções:**
- Quando um termo parecer incorreto (nome fora de contexto, palavra estranha para o ambiente rural), **corrija se tiver certeza** ou **sinalize com [?]** e uma sugestão entre parênteses
- Nunca propague um erro de transcrição como se fosse informação real
- Preserve termos técnicos agropecuários corretos: desmama, silagem, palhada, choque perimetral, pastejo em faixa, safrinha, volumoso, etc.

### Regra 2: Lista de Participantes — Distinga Presença de Menção

- **presentesConfirmados**: pessoas que **falaram ativamente** na reunião
- **citados**: pessoas **mencionadas por terceiros** mas que não falaram

### Regra 3: Preserve Todos os Números e Métricas

Números são o dado mais valioso de uma reunião operacional. **Nenhum deve ser omitido.**

Inclua obrigatoriamente no resumo, decisões e tarefas:
- Hectares
- Toneladas
- Datas e prazos
- Quantidades de animais
- Valores financeiros
- Referências de pastos (ex: pasto 63, 42A, 42B)
- Dias de pastejo
- Déficits estimados

Se um cálculo foi feito durante a reunião, registre-o.

### Regra 4: Capture Decisões com Contexto Completo

Para cada decisão, registre **5 campos**:

| Campo | Descrição | Obrigatório |
|-------|-----------|:-----------:|
| `decision` | O que foi decidido | Sim |
| `rationale` | Por que (o argumento que prevaleceu) | Sim |
| `descartado` | O que foi descartado e por quê (quando houver debate) | Não |
| `assignee` | Quem decidiu / quem ficou responsável | Não |
| `impact` | Impacto da decisão | Não |

**Exemplo ruim:**
> "Definido que a estrutura de água será convencional."

**Exemplo bom:**
> "Definido usar estrutura de água convencional existente, sem investimento em linha superficial nova. Motivo: a área de integração tem demanda diferente da pecuária, o que geraria desperdício de material."

### Regra 5: Tarefas — Formato Completo e Acionável

Cada tarefa deve ter:

| Campo | Descrição | Obrigatório |
|-------|-----------|:-----------:|
| `title` | Ação clara (verbo + objeto) | Sim |
| `description` | Detalhamento da ação | Sim |
| `contexto` | Por que essa tarefa existe (qual problema ou decisão gerou a ação) | Não |
| `assignee` | Responsável | Não |
| `priority` | `alta` / `media` / `baixa` | Não |
| `dueDate` | Prazo (se mencionado) | Não |

**Importante:** Nunca crie uma tarefa com termos corruptos da transcrição. Corrija ou sinalize antes.

### Regra 6: Resumo Executivo — Específico, Não Genérico

O campo `summary` deve conter os **fatos concretos** desta reunião específica:
- Os números discutidos
- As decisões que causaram debate
- Os problemas identificados

Um leitor externo deve conseguir entender o que foi resolvido e o que está pendente **sem ler a ata completa**.

**Evite** frases genéricas como *"foram discutidos ajustes na equipe"*.
**Prefira** frases com nomes, números e ações concretas.

### Regra 7: Seção de Incertezas

No campo `incertezas`, liste todos os termos sinalizados com **[?]**:
- Nomes possivelmente errados
- Termos técnicos corrompidos pelo STT
- Referências ambíguas

Esses itens devem ser validados por alguém da equipe antes de distribuir a ata.

---

## Estrutura Completa de Saída (transcricao-proc)

```json
{
  "presentesConfirmados": ["Nome 1 (falou na reunião)", "Nome 2"],
  "citados": ["Nome 3 (mencionado mas não falou)"],
  "summary": "Resumo executivo específico com números, decisões e problemas concretos.",
  "decisions": [
    {
      "decision": "O que foi decidido",
      "rationale": "Por que foi decidido assim (argumento que prevaleceu)",
      "descartado": "O que foi descartado e por quê",
      "assignee": "Responsável",
      "impact": "Impacto da decisão"
    }
  ],
  "tasks": [
    {
      "title": "Verbo + objeto (ação clara)",
      "description": "Detalhamento da ação",
      "contexto": "Por que essa tarefa existe",
      "assignee": "Responsável",
      "priority": "alta | media | baixa",
      "dueDate": "Data ou prazo"
    }
  ],
  "minutes": "# Ata da Reunião\n\n## Participantes\n...\n## Pauta\n...\n## Discussões\n...\n## Decisões\n...\n## Encerramento\n...",
  "riscosBlockers": ["Risco ou bloqueio com números e contexto"],
  "estacionamento": ["Assunto mencionado mas não resolvido"],
  "incertezas": ["Termo [?] — possível significado ou correção sugerida"]
}
```

### Detalhamento de Cada Campo

#### 1. Resumo (`summary`)
- Mínimo 10 caracteres
- Deve ser **específico** com números e fatos concretos
- Deve permitir que um leitor externo entenda o resultado da reunião sem ler a ata completa
- Inclui: problemas discutidos, decisões tomadas, métricas relevantes

#### 2. Decisões (`decisions`)
- Array de objetos com contexto completo
- `decision` e `rationale` são **obrigatórios**
- `descartado` registra alternativas descartadas e seus motivos (importante quando houve debate)
- `assignee` identifica o responsável pela decisão
- `impact` descreve as consequências da decisão

#### 3. Tarefas (`tasks`)
- Array de objetos no formato **acionável**
- `title` deve começar com **verbo + objeto** (ex: "Levantar orçamento de cerca elétrica")
- `description` detalha o que precisa ser feito
- `contexto` explica a origem da tarefa (qual problema ou decisão a gerou)
- `priority`: `alta`, `media` ou `baixa`
- `dueDate`: prazo quando mencionado na reunião

#### 4. Ata (`minutes`)
- Texto em **Markdown completo** com a ata da reunião
- Estrutura esperada:
  ```markdown
  # Ata da Reunião
  
  ## Participantes
  - Nome 1 (presente)
  - Nome 2 (presente)
  - Nome 3 (citado)
  
  ## Pauta
  - Tópico 1
  - Tópico 2
  
  ## Discussões
  ### Tópico 1
  Detalhamento da discussão com números e métricas...
  
  ### Tópico 2
  Detalhamento...
  
  ## Decisões
  1. Decisão X — Motivo Y
  2. Decisão Z — Motivo W
  
  ## Encerramento
  Próximos passos e encaminhamentos.
  ```
- Deve incluir **todas as métricas** discutidas durante a reunião

#### 5. Riscos e Bloqueios (`riscosBlockers`)
- Array de strings
- Cada risco deve conter **dados concretos** (números, datas, referências)
- Identifica problemas que podem atrasar ou impedir o progresso
- Exemplo: "Déficit de 12 toneladas de silagem pode comprometer a suplementação do lote 3 até março"

#### 6. Incertezas (`incertezas`)
- Array de strings
- Lista termos de STT duvidosos sinalizados com **[?]**
- Formato: `"Termo [?] — possível significado ou correção sugerida"`
- Serve para que a equipe valide antes de distribuir a ata
- Exemplo: `"Mencionado 'pasto Cassiana' [?] — possível referência ao pasto 'Caçanjure' ou nome de pessoa"`

### Campos Adicionais

#### Participantes Confirmados (`presentesConfirmados`)
- Pessoas que **falaram ativamente** durante a reunião

#### Citados (`citados`)
- Pessoas **mencionadas por terceiros** mas que não falaram

#### Estacionamento (`estacionamento`)
- Assuntos mencionados durante a reunião mas **não resolvidos**
- Ficam pendentes para reuniões futuras

---

## Agente Simplificado: ata-gen

O agente `ata-gen` é usado para gerar atas de forma mais rápida, recebendo **contexto adicional da semana** (atividades concluídas, pendentes e planejadas).

### Entrada

| Campo | Descrição |
|-------|-----------|
| `transcricaoTexto` | Texto da transcrição (mínimo 10 caracteres) |
| `atividadesConcluidas` | Lista de atividades concluídas na semana anterior |
| `atividadesPendentes` | Lista de atividades pendentes da semana anterior |
| `atividadesPlanejadas` | Lista de atividades planejadas para a próxima semana |
| `participantes` | Lista de participantes da reunião |

### Saída

```json
{
  "sumario": "Resumo executivo da reunião em 2-4 frases.",
  "decisoes": ["Decisão 1", "Decisão 2"],
  "acoes": [
    {
      "descricao": "Descrição da ação",
      "responsavel": "Nome da pessoa",
      "prazo": "Data ou prazo"
    }
  ],
  "estacionamento": ["Item pendente 1", "Item pendente 2"],
  "riscosBlockers": ["Risco ou bloqueio 1"]
}
```

### Regras do ata-gen

- Responde sempre em português do Brasil
- **NUNCA alucina**: menciona APENAS fatos, decisões e compromissos explícitos na transcrição
- Não inventa nomes, datas ou decisões que não estejam na transcrição
- Foca em fatos observáveis e decisões concretas
- Se uma informação não está clara, **NÃO inclui**
- Para ações, tenta identificar responsável e prazo. Se não mencionados, usa **"A definir"**
- Resumo conciso (2-4 frases) capturando objetivo e resultado principal
- Decisões = declarações claras e objetivas
- Estacionamento = assuntos mencionados mas não resolvidos
- Riscos e bloqueios = problemas que podem atrasar ou impedir progresso

---

## Regras Gerais de Processamento

### Idioma e Tom
- Sempre em **português do Brasil**
- Linguagem leve, profissional e direta
- Evitar formalidade excessiva
- Escrever como alguém experiente do agro explicando de forma simples

### Tratamento de Erros de STT
- A transcrição é gerada automaticamente e **contém erros**
- Interpretar o sentido real por trás do texto bruto
- Corrigir termos técnicos agropecuários corrompidos
- Sinalizar incertezas com **[?]** e sugestão de correção
- Nunca propagar erro de transcrição como informação real

### Formato de Saída
- Saída **exclusivamente em JSON válido**
- Todos os campos obrigatórios devem estar presentes
- Arrays podem ser vazios se não houver conteúdo aplicável

---

## Referência de Arquivos do Sistema

| Arquivo | Função |
|---------|--------|
| `api/_lib/transcription.ts` | Serviço de transcrição Whisper com chunking |
| `api/transcrever-reuniao.ts` | Endpoint POST de upload de áudio |
| `api/semana-transcricoes.ts` | CRUD de transcrições no banco |
| `api/_lib/agents/transcricao-proc/handler.ts` | Agente processador (prompt + lógica) |
| `api/_lib/agents/transcricao-proc/manifest.ts` | Schema de entrada/saída |
| `api/_lib/agents/ata-gen/handler.ts` | Agente gerador de ata (prompt + lógica) |
| `api/_lib/agents/ata-gen/manifest.ts` | Schema de entrada/saída |
| `agents/TranscreverReuniao.tsx` | UI de upload de áudio |
| `agents/TranscricoesView.tsx` | UI de listagem e processamento |
| `agents/AtasView.tsx` | UI de gestão de atas |
