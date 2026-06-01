# Prompt para Claude Design — Protótipo Sistema Individual Inttegra (visual Gesttor)

Construa um **protótipo navegável de página única** (HTML + CSS + JavaScript puro, dados em memória, sem backend) do módulo **Sistema Individual** do SaaS pecuário **Gesttor / Inttegra**. Deve parecer um recorte real do produto. Pré-carregue dados de exemplo para abrir já navegável.

---

## 1. Identidade visual (espelhar o Gesttor)

Tema claro, muito espaço em branco, cantos arredondados (~12px), sombras sutis, fonte sem serifa (Inter/system-ui). Leve e profissional.

**Sidebar esquerda fixa (~248px, fundo branco):**
- Topo: marca **"Gesttor"** + ícone de recolher.
- Rótulo de grupo em cinza, maiúsculo, espaçado.
- Itens com ícone + texto; submenu mostra chevron `⌄`.
- **Item ativo:** fundo azul claro `#eaf1fb`, texto/ícone azul `#2563eb`, peso 600. Hover cinza levíssimo.
- Rodapé: cartão de usuário (avatar com inicial "A", **"Antonio C Admin"**, **"Administrador"**, **"V1.5.89 SAAS"** em cinza).

**Barra superior (branca, borda inferior fina):**
- Três dropdowns separados por `/`: **Antonio Chaker Analista** ⌄ / **Reunidas Floresta** ⌄ / **Natura 1** ⌄ (Analista → Cliente → Fazenda).
- À direita: botão **"Suporte"** com `?` e ponto vermelho de notificação.

**Conteúdo:**
- Título da página (~18–20px). Quando útil, abas underline (aba ativa sublinhada).
- Grade de cards 3 colunas: card branco, borda fina, ícone monocromático em cima à esquerda, estrela de favorito à direita, título em negrito, descrição cinza.
- Etiqueta de camada no canto superior de cada tela: **Camada de Estoque** (azul) / **Camada Individual** (verde) / **Mesa de Conciliação** (laranja).

**Paleta:** azul `#2563eb`; texto `#1f2430`; secundário `#6b7280`; bordas `#e5e7eb`; fundo `#f9fafb`. Status: ok `#16a34a`, alerta `#d97706`, pendência `#ea580c`, crítico `#dc2626`.

---

## 2. Navegação (3 grupos, nesta ordem)

**CADASTROS**
- **Categoria animal** — nome, sexo, faixa de idade, **estoque de partida** (relação inicial do rebanho).
- **Local** — pasto/retiro da fazenda.
- **Lotes** — agrupamento de animais. Identidade: código, **finalidade** (recria/engorda/reprodução/uniformidade), sistema produtivo, status. SEM campo de local nem de animais.
- **Ficha individual** — ID interno, brinco (opcional), sexo, raça, categoria, lote atual (derivado), histórico.

**MOVIMENTAÇÃO**
- **Nascimento** e **Compra** — entradas; somam ao estoque da categoria.
- **Venda** e **Morte** — saídas; baixam o estoque; concluem mesmo sem brinco.
- **Gestão de lotes** — mover animais entre lotes (movimento de alocação).
- **Pesagens** — evento individual; alimenta GMD e curva de peso.
- **Reprodução** — cobertura/IATF, diagnóstico de gestação, parto.
- **Mesa de Conciliação** — cartões de divergência (badge com nº de pendências).

**RELATÓRIOS**
- **Relatório por movimento** — um por tipo, com status de conciliação.
- **Ganho de peso** — GMD, ranking, desvio da média do grupo.
- **Reprodutivo** — taxa de prenhez, coberturas, partos por matriz.

---

## 3. Regras invioláveis (Dupla Camada de Controle)

1. **Estoque = soma dos movimentos.** Nunca campo editável; nunca soma da tabela de animais.
2. **O individual nunca trava o estoque.** Único bloqueio: erro crítico (baixa > saldo, animal já vendido/morto, data anterior à entrada, animal de outra fazenda).
3. **"Não identificado" é estado normal** — vira pendência, não erro vermelho.
4. **ID interno é a chave**; brinco/RFID são atributos versionados (podem faltar/duplicar).
5. **Lote e Local são identidade; a posição do animal é estado derivado** do último movimento. Nunca editável solto na ficha.
6. **Divergência vira cartão na Mesa**, resolvido depois, com responsável/data/auditoria.
7. **Cobertura individual** (identificados ÷ estoque): Excelente >98% · Bom 95–98% · Atenção 90–95% · Crítico <90%.

---

## 4. Comportamento (não bloqueante)

- Lançamento rápido primeiro (poucos campos + botão "Salvar e mover estoque"); identificação individual opcional, vem depois.
- Microcopy honesto ao concluir com divergência: *"Venda salva no estoque. Conciliação individual 98%. 2 animais sem identificação enviados à Mesa."*
- Toasts suaves no canto inferior-direito.

---

## 5. Estado em memória (sempre derivar)

`categorias[]` {nome, sexo, faixa, estoquePartida} · `locais[]` · `lotes[]` {codigo, finalidade, sistema, status} · `animais[]` {idInterno, brinco, statusBrinco, sexo, raca, categoria, vivo} · `movimentos[]` {tipo, data, responsavel, qtd, categoria?, loteOrigem?, loteDestino?, vinculados[], naoIdentificados, status} · `pesagens[]` · `reproducao[]` · `pendencias[]`.

**Saldo de categoria, saldo de lote, lote atual do animal, GMD e cobertura são SEMPRE calculados a partir de `movimentos` — nunca campos fixos.**

Dados de exemplo: ≈5 categorias com estoque de partida, 3 lotes, ~10 animais (alguns sem brinco), pesagens para GMD, eventos reprodutivos e 1 pendência pré-carregada.

---

## 6. Tom

Português (BR), linguagem de campo (arroba, lote, retiro, recria, engorda, matriz). Use **"Camada de Estoque"** e **"Camada Individual"** — nunca "qualitativo". Rápido no lançamento, rico na análise, honesto na divergência.

> Antes de finalizar, rode o teste dos invariantes: se alguma tela trava o estoque, esconde o não-identificado, usa brinco como chave ou bloqueia divergência — corrija antes de entregar.
