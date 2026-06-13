# Instrução para o Antigravity — Cadastro de Fazenda (INTTEGRA Pecuário)

> Cole este texto no Antigravity. Se possível, anexe o protótipo de referência:
> `fazenda/Cadastro de Fazenda.html`, `fazenda/fazenda-app.js`, `fazenda/fazenda.css`, `fazenda/fazenda-seed.js`.
> A instrução é autossuficiente caso você não anexe nada.

---

## Papel e objetivo

Você é um engenheiro frontend sênior. Implemente o módulo **Cadastro de Fazenda** do sistema **INTTEGRA Pecuário — Sistema Individual** (gestão de rebanho bovino de corte).

É uma tela de **mapa interativo** onde o usuário define o território da propriedade — **desenhando polígonos direto no mapa** ou **importando KMZ/KML** — organizado em **4 camadas hierárquicas**: **Fazenda › Retiros › Setores › Locais**. Cada nível pode ser controlado de forma independente, e essa hierarquia geográfica é a base de localização de todo o sistema (lotes, animais, movimentações "moram" num Local que pertence a um Setor, Retiro e Fazenda).

Construa **somente o frontend**, em **React + TypeScript**, com **backend Node mockado/local** (estado em memória + `localStorage`, sem banco real, sem rede). Todo o código, UI e rótulos em **português do Brasil**.

---

## ⭐ Conceito central — a hierarquia

São **4 níveis encaixados**, cada um um polígono no mapa:

| Nível | Índice | Cor | Pertence a | Obrigatório? |
|---|---|---|---|---|
| **Fazenda** | 0 | verde `#16a34a` (tracejado) | — (raiz) | Sim — o perímetro |
| **Retiro** | 1 | azul `#2563eb` | Fazenda | "quando houver" |
| **Setor** | 2 | laranja `#d97706` | Retiro | "quando houver" |
| **Local** | 3 | teal `#0d9488` | Setor (ou nível acima disponível) | Sim — onde o gado fica |

Regras:
- Retiro e Setor são **opcionais** ("quando houver"). Um Local pode se vincular ao Setor, mas se não houver Setor/Retiro, vincula ao nível superior existente (Retiro ou direto na Fazenda).
- O **vínculo (parent)** de uma área é **sugerido automaticamente** pela geometria: ao desenhar/importar um polígono, o sistema acha a **menor área de nível superior cujo interior contém o centroide** do novo polígono e propõe como parent (o usuário pode ajustar).
- Cada polígono tem **área calculada em hectares** (área geodésica).
- Só o **tipo** existe na camada Local (Pasto, Curral, Confinamento, Aguada, Sede, Reserva, Outro).

---

## Stack e bibliotecas

- **React 18 + TypeScript + Vite.**
- **Mapa: Leaflet** (`leaflet@1.9.4`). Use **react-leaflet** OU Leaflet puro via `useRef`/`useEffect` — escolha um e seja consistente.
- **Desenho de polígonos: Leaflet.draw** (`leaflet-draw@1.0.4`) — handler `L.Draw.Polygon` + edição de vértices via `poly.editing`.
- **Área geodésica:** `L.GeometryUtil.geodesicArea(latlngs)` (vem com leaflet-draw) → m²; converta para hectares (`/10000`).
- **Importação KMZ/KML:**
  - KMZ → descompactar com **JSZip** (`jszip@3.10.1`), achar o `.kml` interno.
  - KML → parsear com `DOMParser` e converter com **@tmcw/togeojson** (`togeojson.kml(xmlDoc)`).
  - Extrair Polygon/MultiPolygon do GeoJSON resultante. **Atenção:** GeoJSON é `[lng, lat]`, Leaflet é `[lat, lng]` — inverta. Remova o ponto de fechamento duplicado do anel.
- **Basemaps:** Satélite (Esri World Imagery: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`) e Mapa (OpenStreetMap). Botão para alternar.
- **Estilo:** reproduza o INTTEGRA — cards brancos borda `#e5e7eb` raio ~14px, acento azul `#2563eb`, verde `#16a34a`, tipografia **Inter**, **monoespaçada** (JetBrains Mono) só para códigos. Sem emojis. Toasts para feedback. Modais simples.
- **Dados mock:** módulo em memória + persistência em `localStorage` (`inttegra-fazenda`). Sem backend real.

---

## Modelo de dados (TypeScript)

```ts
type Nivel = 'fazenda' | 'retiro' | 'setor' | 'local';
type Fonte = 'desenho' | 'kml';
type TipoLocal = 'Pasto' | 'Curral' | 'Confinamento' | 'Aguada' | 'Sede' | 'Reserva' | 'Outro';

interface Area {
  id: string;
  nivel: Nivel;
  nome: string;
  parent: string | null;        // id da área de nível superior (vínculo hierárquico)
  tipo: TipoLocal | null;       // só para nivel === 'local'
  coords: [number, number][];   // anel do polígono em [lat, lng] (sem ponto de fechamento duplicado)
  fonte: Fonte;                 // 'desenho' (mão) ou 'kml' (importado)
  visivel: boolean;             // mostra/oculta no mapa
}
```

Constantes de nível (índice + cor + opacidade de preenchimento):
```ts
const NIVEIS = {
  fazenda: { idx:0, label:'Fazenda', plural:'Fazenda',  cor:'#16a34a', fill:0.10 },
  retiro:  { idx:1, label:'Retiro',  plural:'Retiros',  cor:'#2563eb', fill:0.10 },
  setor:   { idx:2, label:'Setor',   plural:'Setores',  cor:'#d97706', fill:0.12 },
  local:   { idx:3, label:'Local',   plural:'Locais',   cor:'#0d9488', fill:0.16 },
};
const ORDEM = ['fazenda','retiro','setor','local'];
```

### Dados-semente
Crie 1 Fazenda (octógono — perímetro tracejado), 2 Retiros (Sede, Brejo), 3 Setores (Cabeceira, Baixão → no Sede; Brejo Norte → no Brejo) e 6 Locais (Pasto Cabeceira 1 e 2, Curral de Manejo, Pasto Baixão, Confinamento, Pasto Brejo) — **geometricamente encaixados** (gere os polígonos por código a partir de um centro fictício no cerrado, garantindo que retiro ⊂ fazenda, setor ⊂ retiro, local ⊂ setor). A fazenda começa com `fonte:'kml'` (simula import); os demais `fonte:'desenho'`.

---

## Layout da tela

Tela embutida no shell do INTTEGRA (sidebar + topbar). A área de conteúdo **não rola** — o mapa preenche.

**Cabeçalho da página:** título "Cadastro de Fazenda" (ícone de propriedade), subtítulo explicando que se desenha/importa em camadas Fazenda › Retiros › Setores › Locais. Ações à direita: "Cancelar" e "Salvar cadastro".

**Corpo dividido em duas regiões:**

### Esquerda — Mapa (Leaflet, preenche)
Sobreposições flutuantes (z-index acima do mapa):
- **Toolbar (canto sup. esq.)**, três blocos em cards:
  1. **Seletor de Camada** — segmented control com os 4 níveis (Fazenda / Retiro / Setor / Local), cada um com sua cor. **Esta é a camada "ativa"** — define o nível do que será desenhado/importado E o **filtro do mapa** (ver "Filtro cumulativo").
  2. **Botões:** "Desenhar" (primário, verde — alterna o handler de desenho), "Importar KMZ/KML" (abre `<input type=file accept=".kml,.kmz">`), "Editar forma" (liga/desliga arrastar vértices da área selecionada).
  3. **Faixa de dica** contextual (muda conforme o modo).
- **Switch de basemap (canto sup. dir.):** Satélite / Mapa.
- **Legenda (canto inf. esq.):** as 4 cores → níveis.
- **Controle de zoom** no canto inf. dir. (`L.control.zoom({position:'bottomright'})`, `zoomControl:false` no map).

Cada polígono no mapa tem **rótulo permanente** (tooltip) com o nome, colorido pelo nível. Clicar no polígono seleciona a área.

### Direita — Painel "Camadas da propriedade" (largura ~556px)
**Navegador em 4 colunas paralelas (estilo Miller / drill-down):**

```
┌──────────┬──────────┬──────────┬──────────┐
│ FAZENDA  │ RETIROS  │ SETORES  │ LOCAIS   │
│ (1 área) │ (do faz.)│ (do ret.)│ (do set.)│
└──────────┴──────────┴──────────┴──────────┘
```

- Cada coluna tem **cabeçalho**: swatch da cor + nome do nível (plural) + contagem de áreas + área total em ha + botão de olho (mostra/oculta a camada inteira).
- Cada **linha** (área) mostra: olho (mostra/oculta a área), nome, ponto-azul se foi importada de KML, seta `›` se a área abre o próximo nível (todos menos Local), e na linha de baixo a **área em ha** (+ tipo se Local) e os botões **Centralizar / Editar / Excluir** (aparecem no hover).
- **Drill-down:** clicar numa **Fazenda** preenche a coluna Retiros com os retiros dela; clicar num **Retiro** preenche Setores; clicar num **Setor** preenche Locais. A seleção em cada coluna é mantida em estado (`COL = {fazenda, retiro, setor}`), com auto-resolução (se o selecionado sumir, cai para o primeiro disponível).
- A linha selecionada fica destacada (fundo azul claro + borda colorida do nível).
- Coluna vazia mostra texto de orientação ("Nenhum setor aqui. Selecione esta camada e desenhe ou importe.").

---

## Comportamentos exatos

### Filtro cumulativo do mapa (drill-down visual)
A **camada ativa** filtra o que aparece no mapa de forma **cumulativa, do perímetro para dentro**:
- **Fazenda** ativa → mostra só o perímetro da Fazenda.
- **Retiro** ativo → mostra Fazenda + Retiros.
- **Setor** ativo → mostra Fazenda + Retiros + Setores.
- **Local** ativo → mostra tudo.

Implementação: ao trocar o nível ativo (`applyLevel(nivel)`), para cada área faça `area.visivel = NIVEIS[area.nivel].idx <= NIVEIS[nivel].idx` e aplique no mapa. No segmented control, marque o nível ativo (preenchido com a cor) e os níveis incluídos no filtro (fundo claro).

**Clicar numa área no painel** ajusta o nível ativo para o nível dela (atualizando o filtro do mapa) e **destaca** a área — **mas NÃO dá zoom**. O enquadramento/zoom só acontece pelo botão **Centralizar** (alvo) de cada linha. (Importante: clicar para mostrar/ocultar e navegar **não** deve mexer no zoom/posição do mapa.)

### Desenhar
- Botão "Desenhar" liga o `L.Draw.Polygon` com a cor da camada ativa (tracejado se Fazenda). A dica vira "Clique no mapa para marcar os vértices… Clique no primeiro ponto para fechar." Clicar de novo cancela.
- Ao concluir o polígono (`L.Draw.Event.CREATED`), abre o **modal de propriedades** (ver abaixo) com as coordenadas, já com a **área em ha** e o **parent sugerido** pela geometria.

### Importar KMZ/KML
- Lê o arquivo, extrai todos os polígonos, e adiciona **um Area por polígono** na camada ativa, com `fonte:'kml'`, nome vindo do KML (ou "Retiro importado N"), e parent auto-sugerido. Dá `fitBounds` no conjunto importado e toast com a contagem. Mensagens de erro claras (KMZ sem KML, formato inválido, nenhum polígono).

### Modal de propriedades (criar / editar)
- Mostra leitura destacada da **área desenhada em hectares**.
- Campos: **Nome** (obrigatório), **Camada** (select dos 4 níveis — ao trocar, recalcula opções de vínculo e mostra/esconde o campo Tipo), **Tipo de local** (só se Camada = Local), **Vínculo** (select agrupado por nível superior, com o parent sugerido pré-selecionado, opção "— sem vínculo —").
- Salvar valida nome; cria/atualiza a Area, redesenha o polígono e seleciona. Toast de sucesso. Cancelar de uma criação descarta o polígono pendente.

### Editar forma
- "Editar forma" só com uma área selecionada: liga `poly.editing.enable()` (arrastar vértices); ao concluir, salva os novos `coords` e recalcula a área. Toast.

### Mostrar/ocultar
- Olho por **área** alterna `visivel` daquela área no mapa.
- Olho por **camada** (no cabeçalho da coluna) alterna todas as áreas daquele nível de uma vez.

### Excluir
- Modal de confirmação. Se a área tiver filhas, avisa que elas ficarão **sem vínculo** (parent → null) mas **não** serão excluídas. Remove do mapa e do estado. Toast.

---

## Selectors / utilitários (implemente)

- `areaM2(coords)` → área geodésica; `fmtArea(m2)` → "1.234 ha" (pt-BR, casas decimais conforme tamanho).
- `centroid(coords)` e `pointInPoly(pt, coords)` (ray casting).
- `sugerirParent(coords, nivel)` → menor área de nível superior cujo interior contém o centroide.
- `childrenOf(nivel, parentId)` → filhas diretas de uma área num nível.
- `applyLevel(nivel)` → define camada ativa + filtro cumulativo do mapa.

---

## Critérios de aceite

- [ ] Mapa satélite renderiza com os polígonos aninhados das 4 camadas, cada um rotulado e colorido por nível (Fazenda tracejada).
- [ ] Seletor de camada filtra o mapa de forma cumulativa (Fazenda → só perímetro; Local → tudo).
- [ ] Painel em **4 colunas drill-down**: clicar numa Fazenda lista seus Retiros; num Retiro, seus Setores; num Setor, seus Locais.
- [ ] **Clicar numa área mostra/destaca no mapa sem dar zoom**; o zoom só ocorre pelo botão Centralizar.
- [ ] Desenhar um polígono abre o modal com **área em ha** e **vínculo auto-sugerido** pela posição.
- [ ] Importar KMZ e KML adiciona os polígonos na camada ativa (corrige a ordem lat/lng), com vínculo sugerido.
- [ ] Editar forma arrasta vértices e recalcula a área; editar propriedades muda nome/camada/tipo/vínculo.
- [ ] Olho por área e por camada mostra/oculta; excluir confirma e desvincula filhas sem apagá-las.
- [ ] Tudo em pt-BR; dados persistem em `localStorage`; sem rede.

## Não faça

- Não dê zoom/`fitBounds` ao apenas selecionar/navegar pelas áreas — só no botão Centralizar.
- Não invente um 5º nível nem campos além dos descritos; se faltar algo, pergunte.
- Não troque Leaflet por Google Maps/Mapbox (evita chave/SDK pago).
- Não use bibliotecas de UI pesadas (Material etc.) — reproduza o visual sóbrio do protótipo.
