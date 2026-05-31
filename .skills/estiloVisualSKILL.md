---
name: estilo-visual-inttegra
description: >
  Padrão visual oficial do sistema pecuário Inttegra (Gesttor): tema CLARO, fundo
  branco, cards leves e cores do sistema. Use SEMPRE que for desenhar, prototipar,
  gerar ou revisar QUALQUER interface do Inttegra — tela, card, formulário, modal,
  tabela, sidebar, topbar, dashboard, badge ou botão — mesmo que o pedido não cite
  cor ou layout. Acione com "tela", "card", "layout", "protótipo", "mockup", "UI",
  "interface", "design", "componente", "HTML do sistema", "Cadastro de", "Estoque
  de Partida", "Mesa de Conciliação", "Camada Individual", ou quando o usuário
  reclamar de fundo preto/escuro. O sistema vem gerando telas com fundo preto por
  engano — esta skill existe para corrigir isso: tudo deve ser claro, branco e leve.
  NÃO use para conteúdo de texto, cálculo de rebanho, gestão de pessoas ou DBO.
---

# Estilo visual Inttegra — tema claro

O sistema pecuário Inttegra (marca de produto **Gesttor**) é um SaaS de campo usado
em escritório e no curral, muitas vezes em telas com sol batendo. Por isso o produto
tem **um único tema: claro**. Fundo branco, muito espaço em branco, sombras sutis,
cantos arredondados, acento verde Inttegra. Telas escuras cansam a vista do produtor,
estouram no sol e fogem da identidade. **Nunca** desenhe telas ou cards com fundo
preto/escuro, "dark mode" ou gradientes escuros — esse é exatamente o erro que esta
skill existe para impedir.

Sempre que você for gerar HTML/CSS, um protótipo (React ou página única), um mockup,
ou descrever um layout do Inttegra, parta destes tokens e destes padrões.

## Os 6 princípios visuais (inegociáveis)

1. **Tema claro, sempre.** Página com fundo `#F7F8FA`, superfícies (cards) brancas
   `#FFFFFF`. Nada de fundo preto, navy escuro como base, ou dark mode. O escuro só
   aparece como **texto** e em detalhes mínimos, nunca como plano de fundo de tela.
2. **O card é a unidade.** Conteúdo mora em cards brancos com borda fina `#E5E7EB`,
   raio `12px` e sombra sutil `0 1px 3px rgba(16,24,40,.08)`. Card respira: padding
   generoso (~24–28px).
3. **Verde é acento, não preenchimento.** O verde Inttegra identifica e destaca
   (rótulos de seção, botão primário, ícones, item ativo) — não pinta áreas grandes.
   Fundos verdes só na versão clarinha `#E7F6EC`.
4. **Hierarquia por tipografia, não por cor de fundo.** Título quase-preto, corpo
   cinza, rótulo verde em maiúsculas. Fonte sem serifa (Inter / system-ui).
5. **Cor com significado.** Verde = ok/individual; azul = estoque; laranja =
   conciliação/pendência; amarelo = rascunho; vermelho = crítico. Cor nunca é
   decoração solta — sempre comunica estado.
6. **Leveza.** Bordas finas, sombras baixas, contraste suave. Se a tela parece
   "pesada" ou escura, está errada.

## Tokens do sistema

Use exatamente estes valores. Em CSS, declare como variáveis em `:root` (ver
`references/tokens.css` para o bloco pronto de copiar).

**Superfícies e texto**

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#F7F8FA` | fundo da página |
| `--card` | `#FFFFFF` | cards, sidebar, topbar, modais |
| `--linha` | `#E5E7EB` | bordas e divisórias |
| `--txt` | `#0F172A` | título / texto principal (navy quase-preto) |
| `--txt2` | `#6B7280` | texto secundário / descrições |
| `--txt3` | `#9CA3AF` | legendas, placeholders, metadados |
| `--sombra` | `0 1px 3px rgba(16,24,40,.08)` | sombra de card |

**Verde Inttegra (acento)**

| Token | Hex | Uso |
|---|---|---|
| `--verde` | `#16A34A` | botão primário, ícones, item ativo |
| `--verde-vivo` | `#22C55E` | rótulos de seção (ex.: "CADASTRO DE"), destaques |
| `--verde-claro` | `#E7F6EC` | fundo de chip/realce, hover de item verde |
| `--verde-escuro` | `#15803D` | hover do botão primário, texto sobre verde claro |

**Cores funcionais (estado)**

| Token | Hex | Significado |
|---|---|---|
| `--azul` | `#2563EB` | Camada de Estoque |
| `--ok` | `#16A34A` | sucesso / Camada Individual |
| `--alerta` | `#D97706` | atenção (ex.: aviso amarelo-âmbar) |
| `--pend` | `#EA580C` | pendência / Mesa de Conciliação |
| `--crit` | `#DC2626` | erro crítico |

**Badges de status (pílula: fundo claro + texto forte)**

| Estado | Fundo | Texto |
|---|---|---|
| Rascunho | `#FEF3C7` | `#92400E` |
| Ativo / OK | `#DCFCE7` | `#166534` |
| Atenção | `#FEF3C7` | `#92400E` |
| Pendência | `#FFEDD5` | `#9A3412` |
| Crítico | `#FEE2E2` | `#991B1B` |

## Anatomia de um card (o padrão do print)

O card de cadastro do sistema é a referência canônica. Estrutura:

```
┌─────────────────────────────────────┐
│ CADASTRO DE            ← rótulo verde-vivo, MAIÚSCULAS, letter-spacing, ~13px, 700
│ Estoque de Partida     ← título --txt, ~24px, 700
│                                       │
│ Registre o inventário  ← corpo --txt2, ~16px, 1.5 de linha
│ inicial do rebanho...                 │
└─────────────────────────────────────┘
   card branco · borda --linha · raio 12px · sombra --sombra · padding 24–28px
```

HTML/CSS de referência:

```html
<article class="card">
  <span class="card__eyebrow">CADASTRO DE</span>
  <h3 class="card__title">Estoque de Partida</h3>
  <p class="card__desc">Registre o inventário inicial do rebanho por fazenda e
     categoria animal, base para movimentações e relatórios.</p>
</article>
```

```css
.card{
  background:var(--card); border:1px solid var(--linha);
  border-radius:12px; box-shadow:var(--sombra); padding:26px;
}
.card__eyebrow{
  color:var(--verde-vivo); font-size:13px; font-weight:700;
  letter-spacing:.08em; text-transform:uppercase;
}
.card__title{ color:var(--txt); font-size:24px; font-weight:700; margin:8px 0 12px; }
.card__desc{ color:var(--txt2); font-size:16px; line-height:1.5; }
```

## Padrões de componentes

**Sidebar / topbar:** brancas (`--card`), borda inferior/lateral fina `--linha`.
Item de menu ativo: fundo `--verde-claro`, texto e ícone `--verde`, peso 600. Hover:
cinza levíssimo `#F3F4F6`.

**Botões:** primário = fundo `--verde`, texto branco, hover `--verde-escuro`.
Secundário = fundo branco, borda `--verde`, texto `--verde`. Raio 8–10px. Em telas
de movimentação, **"Novo"** (secundário) sempre à esquerda de **"Salvar"** (primário).

**Etiqueta de camada (canto da tela):** pílula clara indicando o contexto —
Camada de Estoque (azul `--azul`), Camada Individual (verde `--verde`), Mesa de
Conciliação (laranja `--pend`). Sempre fundo claro + texto na cor da camada.

**Avisos:** caixa de fundo claro da cor do estado (ex.: aviso = `#FEF3C7` com texto
`#92400E`), nunca caixa escura.

**Ícones — nunca emoji.** Não use emojis como ícones em lugar nenhum (nada de 📅
ao lado da data, ✅, ⚠️, 🐄 etc.). Emoji quebra a identidade, renderiza diferente em
cada sistema operacional e parece amador. Use um único conjunto de ícones de linha,
monocromáticos e consistentes (Lucide, Tabler ou Feather — outline, mesma espessura),
herdando a cor do contexto (`--txt2` para neutro, `--verde` quando é acento). E só
use ícone quando ele acrescenta clareza: data, metadados e legendas geralmente ficam
melhor como **texto puro, sem ícone nenhum** — ex.: `31/05/2026`, não `📅 31/05/2026`.

**Tabelas:** cabeçalho em `--txt2` maiúsculo pequeno, linhas brancas, divisória
`--linha`, hover de linha `#F9FAFB`. Sem zebra escura.

**"Não identificado" e divergências** são estado normal: use cinza/âmbar suave
(`--alerta`), **nunca** vermelho de erro. Vermelho `--crit` só para bloqueio real.

## Checklist antes de entregar qualquer tela

Rode esta verificação mental — se algo falhar, corrija antes de mostrar:

- O fundo da página é claro (`#F7F8FA`) e os cards são brancos? (Se há fundo preto
  ou navy escuro como base, **está errado** — reescreva.)
- Título quase-preto, corpo cinza, rótulo de seção em verde-vivo maiúsculo?
- Verde usado como acento (botão/ícone/rótulo), não como preenchimento de áreas?
- Bordas finas `--linha`, raio 12px nos cards, sombra sutil?
- Badges e status seguem o significado de cor (rascunho âmbar, ok verde, etc.)?
- Nada de "dark mode", gradiente escuro ou alto contraste agressivo?
- Nenhum emoji como ícone (sem 📅 na data, etc.)? Ícones só de um conjunto de linha,
  e datas/metadados preferencialmente em texto puro?

Se você se pegou desenhando um fundo escuro "porque fica moderno", pare: o Inttegra
é claro por decisão de produto (uso a campo, sob sol, leveza profissional). Reabra
os tokens acima e refaça em branco.
