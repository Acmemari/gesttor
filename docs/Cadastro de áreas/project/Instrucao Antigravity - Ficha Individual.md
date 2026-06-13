# Instrução para o Antigravity — Ficha Individual do Animal (INTTEGRA Pecuário)

> Cole este texto no Antigravity. Anexe junto, se possível, os arquivos do protótipo:
> `assets/views_ficha.js`, `assets/ficha_config.js`, `assets/data.js` e `assets/styles.css`.
> A instrução é autossuficiente caso você não anexe nada.

---

## Papel e objetivo

Você é um engenheiro frontend sênior. Implemente o módulo **Ficha Individual do Animal** do sistema **INTTEGRA Pecuário — Sistema Individual** (gestão de rebanho bovino de corte/cria).

Construa **somente o frontend**, em **React + TypeScript**, com um **backend Node mockado/local** (camada de dados em memória + `localStorage`, sem banco real). O código, a UI e todos os rótulos devem ser em **português do Brasil**.

Entregue um componente de ficha que tem **dois modos**:
1. **Visualização** (`FichaAnimal`) — lê e exibe os dados de um animal em abas.
2. **Cadastro/edição** (`NovaFicha`) — formulário com as mesmas abas para criar um animal novo.

E um **editor de campos** (`ConfigurarCampos`) que liga/desliga quais campos aparecem em cada aba, persistido em `localStorage`.

---

## Stack e arquitetura

- **React 18 + TypeScript + Vite.**
- **Estilização:** CSS Modules ou Tailwind (escolha um e seja consistente). Reproduza a estética do protótipo: fonte **Inter** para texto e **JetBrains Mono** para identificadores (IDs, brincos, RFID, SISBOV). Acento primário azul (`#2563eb`).
- **Camada de dados mock (Node):** um módulo `db` em memória que simula a API. Exponha funções assíncronas (`getAnimal`, `listAnimais`, `createAnimal`, `updateAnimal`, `listPesagens`, `listMovimentos`) retornando `Promise`. Persista mutações em `localStorage` para sobreviver a refresh. **Não** use backend real nem rede.
- **Estado de UI:** hooks/local state. Sem Redux a menos que justifique.
- Componentes pequenos e tipados; nada de arquivos gigantes.

---

## Modelo de dados (TypeScript)

```ts
type StatusBrinco = 'ok' | 'sem' | 'duplicado';
type Sexo = 'Macho' | 'Fêmea';

interface Categoria { id: string; nome: string; sexo: 'Macho'|'Fêmea'|'Misto'; faixa: string; }

interface PartoHistorico {
  id: string | null;          // ID da cria (opcional)
  nascimento: string;         // ISO date
  categoria: string | null;   // ref Categoria.id
  pesoNascer: number | null;  // kg
}

interface Pesagem { id: string; animal: string; data: string; peso: number; }

interface Animal {
  id: string;                 // chave interna, ex.: "A-0001" — ÚNICO obrigatório
  brinco: string | null;      // brinco de manejo
  statusBrinco: StatusBrinco; // derivado: 'sem' se sem brinco, 'ok' caso contrário
  rfid: string | null;        // brinco eletrônico
  sisbov: string | null;
  ferro: string | null;       // marcação a ferro
  nome: string | null;
  rgn: string | null;         // registro de nascimento
  rgd: string | null;         // registro definitivo
  grau: string | null;        // grau de sangue (PO, PC, 1/2…)
  foto: string | null;

  sexo: Sexo;
  categoria: string;          // ref Categoria.id
  raca: string;
  vivo: boolean;              // status: true=Ativo, false=Baixado
  nascimento: string | null;
  pelagem: string | null;
  chifre: string | null;      // Aspado, Mocho…
  origemTipo: string | null;  // ver ORIGEM_OPCOES

  pai: string | null;         // ID de animal OU texto livre (referência externa)
  mae: string | null;         // idem (matriz)
  concepcao: string | null;   // Monta Natural | IA | IATF | TE | FIV
  parto: string | null;       // Normal, gêmeo, prematuro…

  entrada: string | null;     // Nascimento | Compra | Transferência | Doação
  dataEntrada: string | null;
  origem: string | null;      // produtor/fazenda de origem
  proprietario: string | null;
  fazenda: string | null;

  pesoNascer: number | null;
  desmama: string | null;
  ppt: number | null;         // Proteína Plasmática Total (g/dL)
  hematocrito: number | null; // %
  progHistorico: PartoHistorico[];
}
```

### Opções do campo "Origem" (procedência)
- **Nascido na fazenda** — bezerro próprio
- **Comprado** — entrada por compra
- **Transferido** — veio de outra fazenda sua
- **Recebido de terceiros** — entrou mas não é seu (consignação, arrendamento)
- **Referência externa** — touro / sêmen

### Dados mock iniciais (semente)
Crie ~10 animais (machos/fêmeas, Nelore/Brangus/Anelorado), categorias (`Bezerro(a)`, `Garrote`, `Boi`, `Novilha`, `Vaca`), algumas pesagens e ao menos uma matriz (ex.: `A-0007` "Estrela") com **2+ progênies** vinculadas (via `mae`) para demonstrar a aba Progênies e o IEP. Inclua um caso de `statusBrinco: 'duplicado'` e um animal sem brinco (`'sem'`).

---

## Abas da ficha (visualização)

Cabeçalho do modal: `Ficha Animal · {id}` e subtítulo `{nome · }{sexo} · {raca} · {categoria}{ · idade}`.

1. **Identificação** — dois cards:
   - *Identificação de rastreabilidade*: ID interno (mono, azul), Origem, Brinco de manejo (com pill "Duplicado" se `duplicado`, ou pill "Sem identificação" se sem brinco), RFID, SISBOV, Marcação a ferro, Nome.
   - *Registro genealógico*: RGN, RGD, Grau de sangue. + card *Foto* (imagem ou placeholder "Sem foto").
   - Logo abaixo, blocos *Classificação* (Sexo, Categoria, Raça, Status=pill Ativo/Baixado) e *Fisiologia* (Nascimento, Idade calculada, Pelagem, Chifre).
2. **Genealogia** — *Filiação* (Pai, Mãe — se o valor casar com um ID de animal, vira **link** que abre a ficha daquele animal; senão texto). *Concepção & parto* (Tipo de concepção, Condições do parto). Nota explicativa sobre concepção (Monta Natural · IA · TE · FIV) e parto atípico.
3. **Progênies** — dois blocos:
   - **IEP (Intervalo entre partos):** média de dias entre nascimentos consecutivos das crias. Mostre a média em dias, conversão em meses (`/30.4`), nº de intervalos e os gaps (`data → data : N d`). Se < 2 partos, exiba "—" e a mensagem de que precisa de ≥ 2 partos.
   - **Tabela de progênies:** lista ordenada por nascimento, unindo (a) **progênies reais** = animais cujo `mae`/`pai` referencia este animal (afetam estoque, ID clicável) e (b) **partos históricos** = registros só da ficha (badge "histórico", não afetam estoque, removíveis). Colunas: ID, Data de nascimento, Categoria, Peso ao nascer. Botão "Adicionar parto histórico" abre form inline (ID opcional, data obrigatória, categoria, peso opcional). Nota deixando claro que histórico **não gera movimento nem entra no estoque**.
4. **Origem & local** — *Entrada* (Tipo, Data, Produtor/fazenda de origem) e *Localização atual* (Proprietário, Fazenda, Lote/grupo de manejo — campo **derivado**, marcado visualmente como calculado).
5. **Biometria & saúde** — *Pesos & marcos* (Peso ao nascer, 1ª pesagem [calc], Desmama, Peso atual [calc], **GMD** = ganho médio diário em kg/dia [calc, verde]). *Testes clínicos* (PPT g/dL, Hematócrito %). Bloco **Curva de peso**: mini-gráfico de linha (SVG) das pesagens + lista data/peso.
6. **Histórico** — linha do tempo (timeline) dos movimentos vinculados ao animal (nascimento, compra, alocação, venda, morte…), ordenada do mais recente ao mais antigo, com ícone, título, data e detalhe.

### Valores ausentes
Campo vazio/`null` deve renderizar um discreto **"Não informado"** (cinza), exceto `0`, que aparece como `0`.

---

## Cadastro / Nova ficha (`NovaFicha`)

- Mesmas abas (sem Histórico): Identificação, Genealogia, Progênies, Origem & local, Biometria & saúde.
- Campos viram **inputs/selects** que persistem num rascunho local conforme o usuário digita.
- **Único campo obrigatório: ID interno.** Sugira o próximo ID automaticamente (`A-####` incremental a partir do maior existente). Todo o resto é opcional e pode ficar para depois.
- Sem brinco → o animal entra como **"não identificado"** (`statusBrinco: 'sem'`) — isso é normal, não bloqueie.
- Ao salvar: validar ID não-vazio e **único** (toast de erro se duplicado), normalizar números/strings (`''`→`null`), `push` no db, fechar modal e **reabrir em modo visualização**. Toast de sucesso.
- Na aba Progênies do cadastro, permita adicionar partos históricos que serão anexados ao salvar.

---

## Editor "Configurar campos" (`ConfigurarCampos`)

- Modal com as mesmas abas; cada aba lista seus campos agrupados, com um **toggle** por campo.
- Tipos de campo: normais (podem desligar), **obrigatório** (`id` — sempre ligado, toggle desabilitado, tag "obrigatório"), **calculado** (idade, GMD, peso atual, 1ª pesagem, lote, status — tag "calculado"), **bloco/section** (IEP, tabela de progênies, curva de peso, timeline — tag "bloco").
- A configuração afeta **tanto a visualização quanto o formulário de nova ficha**. Cards que ficam sem nenhuma linha ativa se ocultam sozinhos.
- Toolbar por aba: contador "X de Y campos ativos", botões "Ativar todos" / "Desativar todos". Rodapé: "Restaurar padrão" (limpa config) e "Concluir" (volta para a ficha).
- Persistir em `localStorage` na chave `inttegra-ficha-campos` como `{ [campoKey]: false }` (ausente = ligado; default tudo ligado).
- Mostre nas abas um indicador `ativos/total` por aba.

---

## Cálculos derivados (implemente)

- **Idade:** a partir de `nascimento` → texto tipo "3a 2m" / "8m" / "22d".
- **GMD:** (peso final − peso inicial) / dias entre a primeira e a última pesagem, em kg/dia (3 casas).
- **Peso atual / 1ª pesagem:** da série de `pesagens` do animal.
- **IEP:** média dos gaps em dias entre nascimentos consecutivos das crias.
- **Lote atual / status:** derivados (no mock, pode vir de um campo simples).
- **statusBrinco:** `sem` quando sem brinco; `ok`/`duplicado` caso haja.

---

## Detalhes de UX a preservar

- IDs, brincos, RFID e SISBOV em **fonte monoespaçada**.
- Pills de status: Ativo (verde), Baixado (neutro), Duplicado (alerta), Sem identificação (pendente).
- Campos derivados visualmente distintos (ícone + cor) para indicar que são calculados.
- Toasts para feedback (sucesso, aviso, erro crítico).
- Acessibilidade: labels nos inputs, toggles com `role`/`aria`, navegação por teclado nas abas.

---

## Critérios de aceite

- [ ] Abrir a ficha de um animal mostra as 6 abas com os dados corretos; ausências aparecem como "Não informado".
- [ ] Pai/Mãe que correspondem a um animal existente são links que navegam para a ficha desse animal.
- [ ] Aba Progênies une crias reais + históricas, calcula o IEP corretamente e permite adicionar/remover parto histórico sem afetar o "estoque".
- [ ] Curva de peso renderiza um gráfico SVG a partir das pesagens.
- [ ] Nova ficha exige só o ID, sugere o próximo ID, valida unicidade e cria o animal; salvar reabre a ficha em visualização.
- [ ] Configurar campos liga/desliga campos, reflete em visualização **e** no formulário, persiste em `localStorage` e tem "Restaurar padrão".
- [ ] Tudo em pt-BR, sem dependência de rede, dados sobrevivem a refresh via `localStorage`.

## Não faça

- Não crie banco de dados real, autenticação ou chamadas de rede.
- Não invente campos/telas além das descritas; se algo faltar, pergunte.
- Não use bibliotecas de UI pesadas (Material, etc.) — reproduza o visual sóbrio do protótipo.
