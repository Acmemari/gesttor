# Instrução para o Antigravity — Gestão de Lotes (INTTEGRA Pecuário)

> Cole este texto no Antigravity. Se possível, anexe o protótipo de referência:
> `assets/views_lotes2.js`, `assets/data.js`, `assets/styles.css`, `assets/icons.js`.
> A instrução é autossuficiente caso você não anexe nada.

---

## Papel e objetivo

Você é um engenheiro frontend sênior. Implemente o módulo **Gestão de Lotes** do sistema **INTTEGRA Pecuário — Sistema Individual** (gestão de rebanho bovino de corte).

Construa **somente o frontend**, em **React + TypeScript**, com **backend Node mockado/local** (estado em memória + `localStorage`, sem banco real, sem rede). Todo o código, UI e rótulos em **português do Brasil**.

---

## ⭐ Conceito central — leia antes de codar

Este módulo **não** é um CRUD de lotes. Ele segue um modelo mental específico que precisa ser respeitado à risca:

> **O lote é uma identidade. Sua identidade é a _finalidade_ (Cria / Recria / Terminação / Outra). A finalidade não muda enquanto o lote existir.**
>
> **Os estados do lote (quais animais tem, onde está, como é alimentado, fase reprodutiva) são SEMPRE _derivados_ de uma sequência de eventos. O usuário NUNCA edita o estado diretamente — ele _lança um evento_, e o estado é recalculado.**

Regra de ouro a exibir na UI: **"Mudou o _jeito_ de fazer? É um evento. Mudou o _que_ se quer fazer? É um lote novo."**

Consequências que o código DEVE garantir:
- Cada um dos 3 (ou 4) controles mostra um **estado derivado** + um botão que **lança um evento**, nunca um campo editável de estado.
- Nada é apagado: trocar o regime, transferir ou remanejar **empilha** um novo evento; o anterior vira passado na **linha do tempo**.
- A linha do tempo é "a biografia do lote" — base de toda análise de desempenho.

---

## Stack e arquitetura

- **React 18 + TypeScript + Vite.**
- **Estilo:** CSS Modules ou Tailwind (um só, consistente). Reproduza a estética do INTTEGRA: fundo claro neutro, cards brancos com borda `#e5e7eb` e raio ~14px; acento primário **azul `#2563eb`**; verde `#16a34a`; tipografia **Inter**, e **fonte monoespaçada** (JetBrains Mono) para códigos de lote e IDs de animal. Tags/pills suaves. Sem emojis.
- **Dados mock (camada "Node"):** módulo `db`/store em memória que expõe funções assíncronas e persiste mutações em `localStorage` (`inttegra-lotes`). Sem backend real.
- **Derivações** implementadas como **selectors puros** sobre os eventos (ver "Lógica derivada"). Componentes só leem selectors; mutações só acontecem por "lançar evento".

---

## Modelo de dados (TypeScript)

```ts
type Finalidade = 'Cria' | 'Recria' | 'Terminação' | 'Outra Finalidade';
type LoteStatus = 'ativo' | 'encerrado';
type DimManejo = 'nutricional' | 'reprodutivo';
type TipoLocal = 'Retiro' | 'Pasto' | 'Setor' | 'Confinamento' | 'Curral';

interface Lote {
  id: string;
  codigo: string;          // ex.: "RC-01" (mono)
  nome: string;            // ex.: "Recria Machos 24"
  finalidade: Finalidade;  // IDENTIDADE — imutável na prática
  sistema?: string;        // ex.: "Pasto + suplemento"
  status: LoteStatus;
  abertura: string;        // ISO date
  encerramento?: string;   // ISO date (se encerrado)
  obs?: string;
}

// ----- EVENTOS (a única fonte de verdade dos estados) -----

// Composição → Movimento de Alocação
interface Alocacao {
  id: string;
  lote: string;            // lote de DESTINO do registro
  de: string | null;       // lote de ORIGEM (null = entrada nova no rebanho)
  qtd: number;
  categoria: string;       // "Garrote", "Boi gordo", "Vaca matriz"…
  data: string;            // ISO
  resp: string;            // responsável
  naoIdent: number;        // nº de cabeças sem identificação individual → vira pendência
  animais?: string[];      // IDs de animais (quando alocado por ID)
}

// Localização → Transferência de Lote (o lote INTEIRO muda de local)
interface Transferencia {
  id: string; lote: string;
  de: string;              // local de origem
  para: string;            // local de destino
  tipoLocal: TipoLocal;
  data: string; resp: string;
}

// Regime → Evento de Manejo (nutricional ou reprodutivo/protocolo)
interface Manejo {
  id: string; lote: string;
  dim: DimManejo;
  plano: string;           // "Terminação — alto grão 88% NDT"
  data: string; resp: string;
}

// Processo Reprodutivo (só lotes de finalidade "Cria") → Evento Reprodutivo
interface Repro {
  id: string; lote: string;
  fase: string;            // "Estação de monta", "Diagnóstico de gestação", "Parição"…
  detalhe: string;         // "112 prenhes (80%) · 28 vazias"
  data: string; resp: string;
}
```

### Listas de domínio
- **Locais:** Retiro Sede, Retiro Brejo, Pasto Cabeceira, Pasto Baixão, Confinamento, Curral de Manejo.
- **Categorias:** Garrote, Boi gordo, Novilha, Vaca matriz, Bezerro(a).
- **Fases reprodutivas:** Estação de monta, Diagnóstico de gestação, Parição, Desmama, Repasse com touro, Descarte de vazias.

### Dados-semente (crie ao menos)
- **RC-01 · Recria Machos 24** (Recria, ativo): alocação +84 Garrote; transferências Curral→Retiro Sede→Pasto Cabeceira; 2 manejos nutricionais (adaptação → crescimento).
- **TM-02 · Terminação Confinamento** (Terminação, ativo): +120 Boi gordo (com 6 sem identificação → pendência) e +30 Garrote vindos de RC-01; manejos adaptação → terminação alto grão.
- **CR-03 · Matrizes IATF** (Cria, ativo, com `obs`): +140 Vaca matriz; manejo reprodutivo (IATF D0) + nutricional; **eventos repro**: Estação de monta → Diagnóstico (112 prenhes/28 vazias). Este exercita o 4º card.
- **TM-04 · Terminação Safra 24/25** (Terminação, **encerrado**): demonstra estado arquivado.

---

## Layout da tela

Cabeçalho da página: título **"Gestão de Lotes"**.

**Duas colunas (master-detail):**

### Coluna esquerda — Lista de lotes
- Cabeçalho "Lotes" + botão **"Novo lote"**.
- Um **card por lote** (clicável, seleção destacada). Cada card mostra:
  - `codigo` (mono) + **tag de finalidade**; se encerrado, pill cinza "Encerrado" à direita.
  - `nome` em destaque.
  - meta-linha: **saldo de cabeças** (ícone camadas), **local atual**, e — se houver — um badge de alerta com o **nº de pendências** (sem identificação).
- Lotes encerrados aparecem visualmente esmaecidos.

### Coluna direita — Ficha do lote selecionado
1. **Cabeçalho da ficha:** `codigo` grande (mono), `nome`, sub-linha "Finalidade: **X** · aberto em DD/MM/AAAA", e `obs` se houver. Ações à direita: **Editar** e **Encerrar** (ocultas se já encerrado → mostra "Encerrado em DD/MM/AAAA").

2. **Nota de modelo mental** (faixa informativa fixa): explica que finalidade é a identidade e que os estados abaixo são derivados de eventos — "você não edita, você lança o evento".

3. **Cards de controle** (grid; **4 colunas quando finalidade = Cria**, senão 3). Cada card de controle tem: ícone colorido, **título**, **pergunta-guia**, **estado atual derivado**, rodapé "muda por: **<Tipo de Evento>**" e o(s) botão(ões) de ação:

   | Card | Pergunta | Estado derivado mostrado | Botão → evento |
   |---|---|---|---|
   | **Composição** (laranja) | "Quais animais estão nele?" | saldo `N cab.`, tags por categoria, lista de IDs vinculados (clicáveis → abrem ficha do animal), aviso de pendências | **Remanejar animais** + **Incluir por ID** → _Movimento de Alocação_ |
   | **Localização** (azul) | "Onde ele está?" | local atual (derivado da última transferência) | **Transferir lote** → _Transferência de Lote_ |
   | **Regime nutricional** (verde) | "Como é alimentado?" | plano nutricional vigente + tag de protocolo reprodutivo ativo se houver | **Mudar regime** → _Evento de Manejo_ |
   | **Processo Reprodutivo** (verde, só Cria) | "Em que fase reprodutiva está?" | última fase + detalhe/data | **Registrar evento** → _Evento Reprodutivo_ |

   Se o lote estiver **encerrado**, os botões de ação somem (somente leitura).

4. **Linha do tempo do lote** (painel): subtítulo "A biografia do lote — base de toda análise de desempenho". Lista **todos** os eventos (alocações ±, transferências, manejos, eventos reprodutivos) ordenados **do mais recente ao mais antigo**, cada item com: ponto colorido + ícone por tipo, título, data, meta (detalhe) e responsável. Rail vertical conectando os pontos.

---

## Eventos (modais) — comportamento exato

Todo "lançar evento" abre um modal, valida, **empilha** o evento e re-renderiza (estados e timeline recalculam sozinhos). Cada modal traz uma faixa explicativa curta reforçando o modelo mental.

- **Remanejar animais / Incluir por ID** → cria `Alocacao`.
  - Dois modos alternáveis: **Por quantidade (grupo)** e **Por ID do animal**.
  - **Sentido:** "Entrar no lote" ou "Sair para outro lote"; e seletor de outro lote/origem ("Sem lote (entrada nova)" só é válido como origem de entrada — bloquear se sentido=saída).
  - Modo grupo: categoria + quantidade + "identificados agora" (opcional). O que faltar (`qtd − identificados`) vira `naoIdent` → **pendência na Mesa**, e **nunca bloqueia** o lançamento.
  - Modo ID: busca por ID/brinco/raça, filtro "somente sem lote", multiseleção com checkbox, lista dos selecionados. Ao salvar por ID, agrupar por categoria real dos animais; `naoIdent = 0` (vínculo individual completo).
  - Toasts: sucesso normal; se houve `naoIdent`, toast de aviso citando que foram enviados à Mesa.
- **Transferir lote** → cria `Transferencia`. Move **o lote inteiro**; origem é o local atual (read-only), escolhe tipo de local + destino. Cada animal "herda" o novo local. Toast confirmando origem→destino.
- **Mudar regime** → cria `Manejo`. Dimensão (nutricional/reprodutivo) + data início + descrição do plano (obrigatória). O plano anterior **não é apagado** — vira passado. Toast: "anterior preservado no histórico".
- **Registrar evento reprodutivo** (só Cria) → cria `Repro`. Fase (obrigatória) + data + detalhe. Estado = última fase.
- **Editar lote** → altera `codigo`, `nome`, `finalidade`, `obs`. São atributos — **não mexem em histórico nem nos estados derivados**.
- **Encerrar lote** → `status='encerrado'`, grava `encerramento`. **Não deleta**: sai das listas operacionais, segue consultável. Reforçar isso no modal.
- **Novo lote** → exige `codigo`; `finalidade` é a identidade. Após criar, seleciona o lote e orienta a lançar os primeiros eventos.

---

## Lógica derivada (selectors puros — implemente todos)

- **`localAtual(lote)`** = `para` da última transferência (por data); senão "—".
- **`planoNutri(lote)`** = `plano` do último manejo `dim='nutricional'`.
- **`protocolo(lote)`** = `plano` do último manejo `dim='reprodutivo'` (ou null).
- **`faseRepro(lote)`** = `fase` do último evento repro; senão "Sem evento reprodutivo".
- **`saldo(lote)`** = Σ alocações que **entram** no lote − Σ alocações que **saem** dele.
- **`composicao(lote)`** = mapa categoria→quantidade líquida (entradas − saídas), só categorias com saldo > 0.
- **`pendencias(lote)`** = Σ `naoIdent` das alocações do lote.
- **`animaisVinculados(lote)`** = conjunto de IDs que entraram por ID e não saíram (entradas − saídas, dedup).
- **`loteDoAnimal(animalId)`** = primeiro lote cujo `animaisVinculados` contém o ID (null = sem lote).
- **`timeline(lote)`** = união de todos os eventos do lote mapeados para `{data, tipo, ícone, cor, título, meta, resp}`, ordenada desc por data. Alocações de entrada e de saída geram itens distintos (+N / −N).

---

## Critérios de aceite

- [ ] Lista master-detail funciona; selecionar um lote mostra sua ficha com estados corretos.
- [ ] Os estados dos cards são **100% derivados dos eventos** — não existe nenhum campo que edite o estado diretamente.
- [ ] Lançar qualquer evento empilha um registro, recalcula saldo/local/regime/fase **e** aparece no topo da linha do tempo.
- [ ] Remanejar por ID vincula animais individualmente (0 pendências); por grupo, o não-identificado vira pendência e **não bloqueia**.
- [ ] O 4º card (Processo Reprodutivo) aparece **apenas** para lotes de finalidade "Cria".
- [ ] Lote de finalidade "Cria" mostra grid de 4 cards; demais, 3 cards.
- [ ] Encerrar não deleta; lote some das ações mas continua consultável e na lista (esmaecido).
- [ ] IDs de animal e códigos de lote em fonte monoespaçada; clicar num ID vinculado chama um hook `onAbrirFicha(id)` (pode ser stub).
- [ ] Tudo em pt-BR; dados persistem em `localStorage`; sem rede.

## Não faça

- Não transforme isto num CRUD onde se edita "local", "regime" ou "saldo" num formulário — **isso quebra o modelo**. Estado só muda via evento.
- Não delete eventos ao corrigir/atualizar; sempre empilhe.
- Não bloqueie lançamento por falta de identificação — gere pendência.
- Não invente telas/campos além dos descritos; se faltar algo, pergunte.
- Sem bibliotecas de UI pesadas (Material etc.) — reproduza o visual sóbrio do protótipo.
