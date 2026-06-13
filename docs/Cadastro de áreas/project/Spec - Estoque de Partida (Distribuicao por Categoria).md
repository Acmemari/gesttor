# Especificação — Estoque de Partida: Distribuição por Categoria
**Sistema:** INTTEGRA Pecuário — Sistema Individual
**Módulo:** Cadastros › Estoque de Partida
**Versão da spec:** 1.0 — 01/06/2026

---

## 1. Contexto

A tela de **Estoque de Partida** define o mapa inicial do rebanho de um retiro/fazenda numa data
(estado "Rascunho" até ser salvo). Esse mapa é a **relação inicial** que alimenta os saldos
derivados do restante do sistema.

A tela tem **dois modos de entrada**, alternados por um controle no header chamado **DISTRIBUIÇÃO**:

- **Mapa de Pasto** — matriz Local × Categoria (já existente).
- **Distribuição por Categoria** — objeto desta spec.

---

## 2. Controle de alternância (header)

- Rótulo: **DISTRIBUIÇÃO**.
- Controle segmentado com duas opções:
  - `Mapa de Pasto`
  - `Distribuição por Categoria`
- A opção ativa fica destacada (verde).
- Alternar **não apaga** os valores do outro modo (cada modo mantém seu próprio estado).
- As três métricas do topo (**Cabeças**, **Peso médio**, **Lotação**) refletem **o modo ativo**.

---

## 3. Modo "Distribuição por Categoria"

### 3.1 Conceito
Modo **sem distribuição por local**. O usuário informa apenas o total por **categoria** —
útil quando não se quer (ou não se tem) o detalhe pasto a pasto.

### 3.2 Layout da tabela
- **As categorias ficam nas LINHAS** (não as colunas, ao contrário do Mapa de Pasto).
- **NÃO exibir** linha de agrupamento de retiro entre o cabeçalho e a primeira categoria.
  A lista de categorias começa imediatamente após o cabeçalho.
- Colunas:

| Coluna | Tipo | Origem |
|--------|------|--------|
| Categoria | rótulo | nome da categoria |
| QTD | input numérico inteiro | digitado |
| Peso médio (kg) | input decimal (vírgula) | digitado |
| Peso total (kg) | **derivado** | QTD × Peso médio |
| Lotação (cab/ha) | **derivado** | QTD ÷ área total do retiro |

### 3.3 Linhas (categorias padrão)
- Vaca Nelore
- Novilha Rep. 14 meses
- Bezerra Mamando
- Bezerro Mamando

(A lista deve vir do cadastro de categorias do retiro.)

### 3.4 Linha de Total (rodapé)
- **Total QTD** = soma das QTDs.
- **Peso médio** = média ponderada = Σ(QTD×Peso) ÷ ΣQTD.
- **Peso total** = Σ(QTD×Peso).
- **Lotação** = Total QTD ÷ área total do retiro.

---

## 4. Cálculos (derivações ao vivo)

Recalcular a cada digitação, sem perder o foco do campo:

- `pesoTotalLinha = qtd * pesoMedio`
- `lotacaoLinha   = areaTotal > 0 && qtd > 0 ? qtd / areaTotal : 0`
- `totalQtd       = Σ qtd`
- `pesoTotalGeral = Σ (qtd * pesoMedio)`
- `pesoMedioGeral = totalQtd > 0 ? pesoTotalGeral / totalQtd : 0`
- `lotacaoGeral   = areaTotal > 0 ? totalQtd / areaTotal : 0`

> **areaTotal** = soma das áreas dos locais do retiro (mesma base usada no Mapa de Pasto).

Atualizar também as métricas do header (Cabeças, Peso médio, Lotação) com os totais acima.

---

## 5. Formatação (pt-BR)

- QTD: inteiro, sem casas decimais. Vazio/0 → exibir "—".
- Peso (médio/total): 1 casa decimal, separador de milhar ponto e decimal vírgula
  (ex.: `44.000,0`).
- Lotação: 2 casas decimais (ex.: `0,29`).
- Parsing de entrada: aceitar vírgula como decimal; remover separador de milhar ao ler.

---

## 6. Ações da tela (compartilhadas com o Mapa de Pasto)

- **Recolher / Expandir** — afeta a visualização (no Mapa de Pasto recolhe as linhas;
  no modo categoria pode permanecer simples).
- **Salvar mapa** — persiste o estado do **modo ativo** como estoque de partida e exibe
  confirmação com resumo (modo, retiro, total de cabeças, peso médio).
- **Voltar** — retorna à navegação.

---

## 7. Checklist de aceite

- [ ] Header tem o controle "DISTRIBUIÇÃO" com as opções Mapa de Pasto / Distribuição por Categoria.
- [ ] No modo categoria, as categorias aparecem nas LINHAS.
- [ ] Não há linha de retiro entre o cabeçalho e a lista (em nenhum dos dois modos).
- [ ] Colunas: Categoria, QTD, Peso médio, Peso total (derivado), Lotação (derivada).
- [ ] Total no rodapé com QTD, peso médio ponderado, peso total e lotação.
- [ ] Cálculos recalculam ao vivo, incluindo as métricas do topo.
- [ ] Alternar de modo não apaga os valores do outro modo.
- [ ] Formatação pt-BR (vírgula decimal, ponto de milhar).
- [ ] Salvar mapa confirma o modo ativo.
