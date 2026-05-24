# Fórmulas — Assistente "Planejamento Ágil" 

> **Status:** documento canônico das fórmulas
> **Data:** 2026-05-07
> **Fontes do código:**
> - [`agents/AgilePlanning.tsx`](agents/AgilePlanning.tsx) — fórmulas inline (4649 linhas)
> - [`lib/hooks/useAgilePlanningCalculations.ts`](lib/hooks/useAgilePlanningCalculations.ts) — hook centralizado (V1.1)
>
> **Em caso de divergência:** o código é a fonte da verdade. Atualize este documento na mesma PR que altera o código.

---

## 0. Convenções

### 0.1 Notação

- `[C-XX]` = ID da fórmula (referenciado no PRD e nos testes)
- `:=` = atribuição/definição
- `Σ` = somatório sobre as categorias
- `⌈ x ⌉` = `Math.ceil(x)`
- `round(x)` = `Math.round(x)`
- `max(0, x)` = `Math.max(0, x)`
- `safeDivide(a, b)` = `b ≤ 0 ou inválido ? 0 : a / b`

### 0.2 Constantes globais

```ts
HERD_CONSTANTS = {
  ARROBA_TO_KG:              30,    // 1 @ = 30 kg
  MATRIZ_WEIGHT_FACTOR:      0.97,  // peso médio matriz = 97% do peso da vaca descarte
  TEMPO_MATRIZES:            12,    // meses (sempre)
  TEMPO_NOVILHAS_8_12:       5,     // meses (fixo)
  TEMPO_TOUROS:              12,    // meses (sempre)
  BEZERRO_WEIGHT_ADJUSTMENT: 30,    // kg (ajuste de peso para bezerro mamando)
}

DIAS_POR_MES = 30.4   (alguns blocos usam 30.4166666667)
DIAS_GESTACAO = 282   (gestação bovina)
PESO_UA = 450         (kg = 1 Unidade Animal)
```

### 0.3 Variáveis de entrada (símbolos)

| Símbolo | Origem | Significado |
|---|---|---|
| `% inv` | slider | Percentual de investimento (% retorno sobre ativo) |
| `M_esp` | slider | Margem esperada |
| `OP_pec` | fazenda (`operationPecuary`) | Valor da operação pecuária (R$) |
| `area_past` | fazenda (`pastureArea`) | Área de pasto (ha) |
| `valor_terra` | fazenda (`propertyValue`) | Valor patrimonial da fazenda |
| `F` | slider | Fertilidade (%) |
| `PPP` | slider | Perda Pré-Parto (%) |
| `MB` | slider | Mortalidade de Bezerros (%) |
| `PD_m` | slider | Peso Desmame Machos (kg) |
| `PD_f` | slider | Peso Desmame Fêmeas (kg) |
| `IPM` | slider | Idade 1ª Monta (meses) |
| `PPM` | slider | Peso 1ª Monta (kg) |
| `T_monta` | slider | Tempo de monta (dias) |
| `D_abate` | slider | Dias para abate de vacas |
| `VBD` | slider | Venda Bezerras ao Desmame (%) |
| `IDD` | slider | Idade ao Desmame (meses) |
| `R_TM` | slider | Relação Matrizes/Touro (%) |
| `P_touro` | slider | Peso médio do touro (kg) |
| `cat[i]` | tabela | Categoria animal: `{%, peso, valor/kg}` |
| `S` | dropdown | Sistema de produção (`Cria` \| `Ciclo Completo` \| `Recria e Engorda`) |

**Específicos de Recria e Engorda:**

| Símbolo | Origem | Significado |
|---|---|---|
| `GMD_R` | slider | GMD Recria (kg/dia) |
| `Mort_R` | slider | Mortalidade Recria (%) |
| `RC_R` | slider | Rendimento de Carcaça Recria (%) |
| `PC_R` | slider | Peso de Compra (kg) |
| `VC_R` | slider | Valor de Compra (R$/kg) |
| `PV_R` | slider | Peso de Venda (kg) |
| `VV_R` | slider | Valor de Venda (R$/@) |

**Específicos de Ciclo Completo:**

| Símbolo | Origem | Significado |
|---|---|---|
| `GMD_CC` | slider | GMD pós-desmame (kg/dia) |
| `PA_CC` | slider | Peso de Abate (kg) |
| `RC_CC` | slider | Rendimento de Carcaça Ciclo Completo (%) |
| `VD_CC` | slider | Venda ao Desmame (%) |

---

## 1. Bloco "Ancoragem de Resultado"

### [C-01] Valor calculado — meta de retorno em R$

> Quanto a operação pecuária precisa **gerar de resultado** (em R$) para atingir o retorno desejado.

```
calculatedValue := safeDivide(% inv × OP_pec, 100)
```

**Equivalente:**
```
calculatedValue = (% inv / 100) × OP_pec
```

**Exemplo:**
- `% inv = 4%`, `OP_pec = R$ 9.230.769`
- `calculatedValue = (4/100) × 9.230.769 = R$ 369.231`

---

### [C-02] Faturamento necessário

> Receita bruta que a operação precisa gerar para resultar no `calculatedValue`, dada a margem esperada.

```
requiredRevenue := M_esp ≤ 0 ? 0 : safeDivide(calculatedValue × 100, M_esp)
```

**Exemplo:**
- `calculatedValue = 369.231`, `M_esp = 40%`
- `requiredRevenue = (369.231 × 100) / 40 = R$ 923.077`

---

### [C-03] Valor médio de venda — depende do sistema

#### [C-03a] Cria e Ciclo Completo

> Soma ponderada do valor por cabeça, conforme % de cada categoria.

```
averageValue_CRIA := Σ_i ( cat[i].% × cat[i].peso × cat[i].valor_kg ) / 100
```

**Pré-condição:** `isPercentageSumValid = true` (Σ % = 100). Se inválido → `0`.

**Para bezerros (Bezerro/Bezerra):** peso já em kg.
**Demais categorias:** peso em **@** (1 @ = 30 kg), valor em R$/@.

#### [C-03b] Recria e Engorda — usa "Valor do Boi"

```
recriaValorBoi := PV_R × VV_R × (RC_R / 100) / 15

averageValue_RE := recriaValorBoi
```

**Por que /15:** o valor de venda `VV_R` é em **R$/@ de carcaça**. `PV_R × RC_R%` dá o **peso de carcaça em kg**, dividir por 15 (não 30) dá @ de carcaça (a venda da arroba é da meia-carcaça pendurada).

**Exemplo:**
- `PV_R = 550 kg`, `VV_R = R$ 310/@`, `RC_R = 54.5%`
- `recriaValorBoi = 550 × 310 × 0.545 / 15 = R$ 6.197,33`

---

### [C-04] Vendas necessárias

> Quantas cabeças precisam ser vendidas no ano para atingir `requiredRevenue`.

```
requiredSales := round( safeDivide(requiredRevenue, averageValue) )
```

- Para `Cria` e `Ciclo Completo`: requer `isPercentageSumValid = true`.
- Para `Recria e Engorda`: ignora soma de %, usa `averageValue_RE`.

---

## 2. Bloco reprodutivo (Cria e Ciclo Completo)

### [C-05] Taxa de Desmame

> % das matrizes que entregam um bezerro vivo no desmame.

```
weaningRate := (F/100) × (1 − PPP/100) × (1 − MB/100)
```

**Exemplo:**
- `F = 85%`, `PPP = 6%`, `MB = 3.5%`
- `weaningRate = 0.85 × 0.94 × 0.965 = 0.7710` → **77,10 %**

---

### [C-06] Kg desmamados por matriz

```
kgPerMatrix := weaningRate × ( (PD_m + PD_f) / 2 )
```

**Exemplo:**
- `weaningRate = 0.7710`, `PD_m = 220`, `PD_f = 200`
- `kgPerMatrix = 0.7710 × 210 = 161,9 kg/matriz`

---

### [C-07] Matrizes necessárias

> Quantas vacas em monta são necessárias para entregar `requiredSales` ao desmame.

```
requiredMatrixes := ⌈ safeDivide(requiredSales, weaningRate) ⌉
```

> Usar `Math.ceil`: nunca arredondar matrizes para baixo (faltaria animal para fechar a meta).

---

### [C-08] Matrizes sobre rebanho médio (índice estrutural)

> Fórmula proprietária Inttegra que dá a **proporção de matrizes** num rebanho típico, em função da idade da primeira monta.

```
indiceTempo       := max(0, IPM − 12)
indiceNovilhas    := safeDivide(indiceTempo × 37.5, 12)
indexValorRebanho := indiceNovilhas + 163.375
matricesOverAverageHerd := safeDivide(100, indexValorRebanho)
```

**Interpretação:** quanto **maior** a idade da primeira monta, **mais novilhas** ficam no rebanho retidas → menor a fração de matrizes no rebanho total.

**Exemplo (IPM = 14 meses):**
- `indiceTempo = 14 − 12 = 2`
- `indiceNovilhas = (2 × 37.5) / 12 = 6.25`
- `indexValorRebanho = 6.25 + 163.375 = 169.625`
- `matricesOverAverageHerd = 100 / 169.625 ≈ 0.5895` → **58,95 %**

> ⚠️ **Constantes mágicas:** `37.5` e `163.375` foram calibradas pela equipe Inttegra com base em curvas zootécnicas reais. Não alterar sem revisão técnica.

---

### [C-09] Rebanho médio (estimativa rápida)

> Tamanho estimado do rebanho total a partir das matrizes.

```
averageHerd := safeDivide(requiredMatrixes, matricesOverAverageHerd)
```

> Esta é a estimativa **rápida** usada nos KPIs do header.
> A estimativa **detalhada** vem do `averageHerdTable` (§5).

---

### [C-10] Rebanho médio ajustado pela mortalidade

```
averageHerdAdjusted := averageHerd × (1 + MB/100)
```

> Acrescenta os bezerros que **morreriam** durante o ciclo (eles consomem pasto antes de morrer, então pesam na lotação).

---

## 3. Bloco financeiro

### [C-11] Receita

```
revenue := isPercentageSumValid ∧ averageValue > 0 ∧ requiredSales > 0
           ? averageValue × requiredSales
           : 0
```

> Em todos os sistemas. No `Recria e Engorda`, `isPercentageSumValid` não bloqueia (já tratado em C-04).

---

### [C-12] Desembolso total

> Tudo que **não é resultado** = orçamento operacional implícito.

```
totalDisbursement := revenue ≤ 0 ? 0 : revenue − calculatedValue
```

**Identidade:** `result + totalDisbursement = revenue`.

---

### [C-13] Resultado

```
result := revenue − totalDisbursement
       (= calculatedValue, exceto quando a margem efetiva diverge)
```

---

### [C-14] Resultado por hectare

```
resultPerHectare := area_past ≤ 0 ∨ result ≤ 0
                    ? 0
                    : safeDivide(result, area_past)
```

---

### [C-15] Margem sobre venda (margem efetiva)

```
marginOverSale := revenue ≤ 0 ∨ result ≤ 0
                  ? 0
                  : safeDivide(result, revenue) × 100
```

> Em equilíbrio com C-02, `marginOverSale ≈ M_esp`. Divergências aparecem em casos de borda (arredondamentos, soma de % inválida).

---

### [C-16] Resultado por cabeça vendida

```
resultPerHead := result ≤ 0 ∨ requiredSales ≤ 0
                 ? 0
                 : safeDivide(result, requiredSales)
```

---

### [C-17] Resultado sobre valor da terra

```
resultOnLandValue := result ≤ 0 ∨ valor_terra ≤ 0
                     ? 0
                     : safeDivide(result, valor_terra) × 100
```

---

### [C-18] Desembolso por bezerro/cabeça vendida

```
disbursementPerCalf := totalDisbursement ≤ 0 ∨ requiredSales ≤ 0
                       ? 0
                       : safeDivide(totalDisbursement, requiredSales)
```

> Apesar do nome `Calf`, na UI aparece como **"Desembolso/Bezerro"** em Cria e como **"Desembolso/Cabeça"** nos demais sistemas.

---

### [C-19] Desembolso médio mensal

```
averageMonthlyDisbursement := totalDisbursement ≤ 0
                              ? 0
                              : safeDivide(totalDisbursement, 12)
```

---

### [C-20] Desembolso por cabeça/mês — depende do sistema

#### [C-20a] Cria

```
disbursementPerHeadMonth_CRIA := safeDivide( safeDivide(totalDisbursement, averageHerd), 12 )
```

#### [C-20b] Recria e Engorda

```
disbursementPerHeadMonth_RE := safeDivide(
                                 safeDivide(desembolsoProducao, rebanhoMedioRT),
                                 12
                               )
```

> Usa `desembolsoProducao` (C-39) e o rebanho médio específico de RT (C-37).

#### [C-20c] Ciclo Completo

```
disbursementPerHeadMonth_CC := safeDivide(
                                 safeDivide(totalDisbursement, rebanhoMedioRT),
                                 12
                               )
```

---

## 4. Bloco performance

### [C-21] Quantidade de cabeças por categoria

```
calculateQuantity(cat[i]) := isPercentageSumValid ∧ requiredSales > 0
                             ? round( safeDivide(requiredSales × cat[i].%, 100) )
                             : 0
```

---

### [C-22] Total de arrobas produzidas (vendas)

```
totalArroba := Σ_i ( quantidade_i × peso_em_arroba_i )

  onde peso_em_arroba_i = isKgCategory(i)
                         ? cat[i].peso / 30
                         : cat[i].peso             // já em @
```

> `isKgCategory(i)` é true para Bezerro (id=1) e Bezerra (id=2).

---

### [C-23] Desembolso por arroba

```
disbursementPerArroba := totalDisbursement ≤ 0 ∨ totalArroba ≤ 0
                         ? 0
                         : safeDivide(totalDisbursement, totalArroba)
```

---

### [C-24] Vendas por hectare

```
salesPerHectare := area_past ≤ 0 ∨ requiredSales ≤ 0
                   ? 0
                   : safeDivide(requiredSales, area_past)
```

---

### [C-25] GMD global (Cria)

> Ganho médio diário ponderado por todo o rebanho médio. Estima a velocidade média de produção de carne.

```
totalPesoKg := Σ_i ( quantidade_i × peso_kg_i )

   onde peso_kg_i = isKgCategory(i)
                   ? cat[i].peso          // já em kg
                   : cat[i].peso × 30      // converte @ para kg

gmdGlobal := safeDivide( safeDivide(totalPesoKg, averageHerd), 365 )
```

---

### [C-26] Produção de @/ha — Cria

```
producaoArrobaHa_CRIA := safeDivide(totalArroba, area_past)
```

### [C-27] Produção de @/ha — Recria e Engorda / Ciclo Completo

> Cálculo em 4 passos. Combina ganho de carcaça com tempo de permanência e rebanho médio.

```
// Passo 1: Peso de venda em @ (carcaça)
pesoVendaArroba := safeDivide(pesoVenda × safeDivide(rendimentoCarcaca, 100), 15)

// Passo 2: Peso de entrada em @ (vivo)
pesoEntradaArroba := safeDivide(pesoEntrada, 30)

// Passo 3: Produção animal por mês
producaoAnimalMes := tempoPermanenciaMeses > 0
                     ? safeDivide(pesoVendaArroba − pesoEntradaArroba, tempoPermanenciaMeses)
                     : 0

// Passo 4: Produção total por ha
producaoArrobaHa_RT := safeDivide( producaoAnimalMes × 12 × rebanhoMedioRT, area_past )
```

**Mapping por sistema:**

| Variável | Recria e Engorda | Ciclo Completo |
|---|---|---|
| `pesoVenda` | `PV_R` | `PA_CC` |
| `pesoEntrada` | `PC_R` | `PD_m` (peso desmame machos) |
| `rendimentoCarcaca` | `RC_R` | `RC_CC` |
| `tempoPermanenciaMeses` | `(PV_R − PC_R) / GMD_R / 30.4166666667` | `(PA_CC − PD_m) / GMD_CC / 30.4166666667` |

---

### [C-28] Lotação UA/ha (Cria) — usa rebanho detalhado

```
totalUAsCalculado := Σ_categorias_RM ( quantidade × tempo × peso ) / 12 / 450

totalUAsAjustado := totalUAsCalculado × (1 + MB/100)

lotacaoUaHa := area_past ≤ 0 ? 0 : safeDivide(totalUAsAjustado, area_past)
```

> Onde **categorias_RM** são as 8 categorias da tabela de Rebanho Médio (§5):
> Vacas, Bezerros Mamando, Novilhas 8-12, Novilhas 13-24, Machos 8-12, 13-24, 25-36, Touros.
>
> Diferente de C-29 (que é cabeças/ha sem ponderar peso), C-28 usa **UAs** (1 UA = 450 kg de peso vivo).

---

### [C-29] Lotação Cab./ha (Cria) — versão simples

```
lotacaoCabecasHa := area_past ≤ 0 ? 0 : safeDivide(rebanhoMedioAjustado, area_past)
```

> Onde `rebanhoMedioAjustado` é C-32 (rebanho médio detalhado × ajuste mortalidade).

---

### [C-30] Lotação Cab/ha — Recria e Engorda

```
recriaLotacaoCabHa := area_past ≤ 0 ? 0 : safeDivide(recriaRebanhoMedioAjustado, area_past)
```

### [C-31] Lotação UA/ha — Recria e Engorda

```
pesoMedio := (PC_R + PV_R) / 2

recriaLotacaoUaHa := (pesoMedio / 450) × recriaLotacaoCabHa
```

> Pondera a lotação Cab/ha pelo peso médio do animal em UA.

---

## 5. Tabela detalhada de Rebanho Médio (modal)

> 8 categorias com **quantidade**, **tempo de permanência (meses)**, **peso individual (kg)** e **peso vivo total (kg)**.
> Disponível só em `Cria` e `Ciclo Completo`.

### 5.1 Vacas (Matrizes)

```
vacas         := round(requiredMatrixes)
tempoVacas    := (282 + T_monta + D_abate) / 30.4
pesoMedioVaca := pesoVacaDescarte_arroba × 30 × 0.97
                 // 0.97 = MATRIZ_WEIGHT_FACTOR
pesoVivoVacas := vacas × pesoMedioVaca
```

> `pesoVacaDescarte_arroba` vem da categoria `Vaca Descarte` (id=6) na tabela.
> O `tempoVacas` representa o ciclo gestação (282d) + monta + dias até abate, em meses.

---

### 5.2 Bezerros Mamando

```
bezerrosMamando         := round(vacas × weaningRate)
tempoBezerros           := IDD                          // Idade ao Desmame
pesoMedioDesmame        := (PD_m + PD_f) / 2
pesoMedioBezerroMamando := (pesoMedioDesmame − 30) / 2
                            // − 30 = BEZERRO_WEIGHT_ADJUSTMENT
                            // / 2  = média do peso na fase mamando
pesoVivoBezerros        := bezerrosMamando × pesoMedioBezerroMamando
```

---

### 5.3 Novilhas 8-12 meses

```
ganhoTotalAteMonta := PPM − PD_f
periodoAteMonta    := IPM − IDD
ganhoMensal        := safeDivide(ganhoTotalAteMonta, periodoAteMonta)
pesoInicialDesmame := PD_f

novilhas8a12       := round( (bezerrosMamando / 2) × (1 − VBD/100) )
                       // metade dos bezerros são fêmeas; descontar venda no desmame
tempoNovilhas8a12  := 5    // FIXO (TEMPO_NOVILHAS_8_12)
mesesAte12Meses    := 12 − IDD
pesoAos12Meses     := pesoInicialDesmame + ganhoMensal × mesesAte12Meses
pesoMedioNovilha8a12 := (pesoInicialDesmame + pesoAos12Meses) / 2
pesoVivoNovilhas8a12 := novilhas8a12 × pesoMedioNovilha8a12
```

---

### 5.4 Novilhas 13-24 meses

```
novilhas13a24      := novilhas8a12          // mesma quantidade
tempoNovilhas13a24 := max(0, IPM − 12)      // varia conforme IPM
mesesAte13Meses    := 13 − IDD
pesoAos13Meses     := pesoInicialDesmame + ganhoMensal × mesesAte13Meses
pesoMedioNovilha13a24 := (pesoAos13Meses + PPM) / 2
pesoVivoNovilhas13a24 := novilhas13a24 × pesoMedioNovilha13a24
```

---

### 5.5 Machos 8-12, 13-24, 25-36 meses (só Ciclo Completo)

> Aparecem apenas se `productionSystem = 'Ciclo Completo'` E `GMD_CC > 0`.

```
totalDias  := (PA_CC − PD_m) / GMD_CC
totalMeses := totalDias / 30.4
qtdMachos  := round( vacas × weaningRate × 0.5 × (1 − VD_CC/100) )

// Função peso em mês M:
pesoEmMeses(M) := PD_m + GMD_CC × (M − IDD) × 30.4
```

#### Machos 8-12 meses (sempre presente em CC)

```
machos8a12              := qtdMachos
tempoMachos8a12         := 5
pesoIndividualMachos8a12 := ( pesoEmMeses(8) + pesoEmMeses(12) ) / 2
pesoVivoMachos8a12       := machos8a12 × pesoIndividualMachos8a12
```

#### Machos 13-24 meses (só se `totalMeses > 12`)

```
machos13a24      := qtdMachos
tempoMachos13a24 := min(12, totalMeses − 12)
                   // Limite de 12 meses; excedente vai para 25-36
pesoIndividualMachos13a24 := ( pesoEmMeses(13) + min(pesoEmMeses(24), PA_CC) ) / 2
pesoVivoMachos13a24       := machos13a24 × pesoIndividualMachos13a24
```

#### Machos 25-36 meses (só se `totalMeses > 24`)

```
machos25a36      := qtdMachos
tempoMachos25a36 := totalMeses − 24
pesoIndividualMachos25a36 := ( pesoEmMeses(25) + PA_CC ) / 2
pesoVivoMachos25a36       := machos25a36 × pesoIndividualMachos25a36
```

---

### 5.6 Touros

```
touros         := R_TM > 0 ? ⌈ vacas × (R_TM / 100) ⌉ : 0
tempoTouros    := 12             // FIXO (TEMPO_TOUROS)
pesoVivoTouros := touros × P_touro
```

---

### [C-32] Rebanho Médio detalhado (consolidação da tabela)

```
rebanhoMedioCalculado := Σ_categorias_RM ( quantidade × tempo ) / 12

rebanhoMedioAjustado  := rebanhoMedioCalculado × (1 + MB/100)
```

> Mais preciso que C-09 (estimativa rápida). É o que alimenta C-29 (lotação Cab./ha).

---

### [C-33] Total de UAs

```
totalUAsCalculado := Σ_categorias_RM ( quantidade × tempo × peso_individual ) / 12 / 450

totalUAsAjustado  := totalUAsCalculado × (1 + MB/100)
```

> 1 UA = 450 kg de peso vivo. Esta é a base do C-28 (Lotação UA/ha).

---

### [C-34] Valor do rebanho — Cria

```
valorRebanhoCalculadoCria := S = 'Cria' ∧ averageValue > 0
                              ? rebanhoMedioCalculado × averageValue
                              : 0
```

---

## 6. Bloco Recria e Engorda (sistema dedicado)

### [C-35] Tempo de permanência (meses)

```
recriaTempoPermanenciaMeses := GMD_R ≤ 0
                               ? 0
                               : (PV_R − PC_R) / GMD_R / 30.4166666667
```

**Exemplo:**
- `PV_R = 550`, `PC_R = 220`, `GMD_R = 0.65 kg/dia`
- ciclo dias = `(550 − 220) / 0.65 = 507.7 dias`
- `recriaTempoPermanenciaMeses = 507.7 / 30.4166666667 ≈ 16.69 meses`

---

### [C-36] Giro de estoque (%)

```
recriaGiroEstoque := recriaTempoPermanenciaMeses ≤ 0
                     ? 0
                     : (12 / recriaTempoPermanenciaMeses) × 100
```

> `100 %` = renova o estoque uma vez ao ano.
> Quanto **maior** o giro, mais eficiente em uso de capital.

---

### [C-37] Rebanho médio Recria e Engorda

```
cicloDias    := (PV_R − PC_R) / GMD_R
cicloMeses   := cicloDias / 30.4
recriaRebanhoMedio := requiredSales × (cicloMeses / 12)

recriaRebanhoMedioAjustado := recriaRebanhoMedio × (1 + Mort_R/100)
```

> Em RT, o rebanho médio é função direta do **fluxo de animais** (vendas) × **tempo que cada um fica na fazenda**.

---

### [C-38] Investimento em reposição

> Capital empatado em compra de animais magros.

```
investimentoReposicao := requiredSales ≤ 0
                         ? 0
                         : PC_R × VC_R × requiredSales
```

---

### [C-39] Desembolso de produção

> O que sobra para custos operacionais depois de subtrair compra dos magros e o resultado-meta da receita.

```
desembolsoProducao := max(0, requiredRevenue − investimentoReposicao − calculatedValue)
```

> Em RT, este valor é o **orçamento operacional disponível** — distinto do `totalDisbursement` (C-12) porque já desconta a reposição.

---

### [C-40] Peso em @ (Recria e Engorda)

```
recriaPesoArroba := PV_R × (RC_R / 100) / 15
```

> Convertendo peso vivo para arrobas de carcaça. Usado como KPI de eficiência.

---

### [C-41] Valor do rebanho — Recria e Engorda / Ciclo Completo

> Em 4 passos: estima o **valor médio** de cada animal no estágio médio do ciclo.

```
// Passo 1
pesoEntradaArroba := safeDivide(pesoCompra, 30)

// Passo 2
pesoSaidaArroba := safeDivide(pesoVenda × safeDivide(rendimentoCarcaca, 100), 15)

// Passo 3
pesoMedioArroba := (pesoEntradaArroba + pesoSaidaArroba) / 2

// Passo 4
valorUnitario := pesoMedioArroba × valorVenda

rebanhoMedioReaisRT := rebanhoMedioRT × valorUnitario
```

**Mapping:**

| Variável | Recria e Engorda | Ciclo Completo |
|---|---|---|
| `pesoCompra` | `PC_R` | `PD_m` |
| `pesoVenda` | `PV_R` | `PA_CC` |
| `rendimentoCarcaca` | `RC_R` | `RC_CC` |
| `valorVenda` | `VV_R` | `boiGordoSaleValue` (categoria Boi Gordo) |
| `rebanhoMedioRT` | `recriaRebanhoMedio` (C-37) | `rebanhoMedioCalculado` (C-32) |

---

### [C-42] Valor do rebanho — consolidado

```
valorRebanhoCalculado := isRecriaTerminacao
                         ? rebanhoMedioReaisRT     // C-41
                         : valorRebanhoCalculadoCria  // C-34
```

> Onde `isRecriaTerminacao = (S = 'Recria e Engorda') ∨ (S = 'Ciclo Completo')`.

---

## 7. Resultado sobre ativo pecuário (consolidado)

### [C-43] Resultado sobre ativo pecuário

#### [C-43a] Cria (legado)

```
resultOnLivestockAssetLegacy := result ≤ 0 ∨ valorRebanhoCalculadoCria ≤ 0
                                ? 0
                                : safeDivide(result, valorRebanhoCalculadoCria) × 100
```

#### [C-43b] Recria e Engorda / Ciclo Completo

```
resultOnLivestockAsset_RT := result ≤ 0 ∨ rebanhoMedioReaisRT ≤ 0
                             ? 0
                             : safeDivide(result, rebanhoMedioReaisRT) × 100
```

#### Branch final

```
resultOnLivestockAsset := isRecriaTerminacao
                          ? resultOnLivestockAsset_RT
                          : resultOnLivestockAssetLegacy
```

---

## 8. Tabela auxiliar: Index RB (matrizes em monta)

> Soma ponderada `quantidade × tempo`. Usado internamente para visualizações na gaveta de governança.

```
matricesMonta_RB := requiredMatrixes × 12      // tempo = 12 meses

bezerrosMamando_RB := bezerrosMamando × 7      // tempo = 7 meses (default)

novilhas8a12      := totalNovilhas / 2          // 50% das novilhas
novilhas12a24     := totalNovilhas / 2          // 50% das novilhas
tempoNovilhas8a12  := 5
tempoNovilhas12a24 := max(0, IPM − 12)

novilhas8a12_RB    := novilhas8a12  × tempoNovilhas8a12
novilhas12a24_RB   := novilhas12a24 × tempoNovilhas12a24

touros_RB := torousQuantity × 12

totalIndexRB := matricesMonta_RB + bezerrosMamando_RB
              + novilhas8a12_RB + novilhas12a24_RB + touros_RB
```

> ⚠️ **Atenção:** este bloco usa parâmetros simplificados (tempo de bezerros fixado em 7 meses; novilhas 50/50). É **diferente** da tabela detalhada (§5). Mantido para compatibilidade.

---

## 9. Validações e regras transversais

### 9.1 Soma de percentuais

```
percentageSum         := Σ_i cat[i].%
isPercentageSumValid  := |percentageSum − 100| < 0.01
```

> **Tolerância de 0.01:** absorve erros de arredondamento mas rejeita digitação clara (ex. 99.5).

**Bloqueio:** se `isPercentageSumValid = false`, **bloquear**:
- C-03 (averageValue) → 0
- C-04 (requiredSales) → 0
- C-11 (revenue) → 0
- C-21 (calculateQuantity) → 0
- Todos os derivados

**Exceção:** Recria e Engorda usa C-03b (não depende da soma).

### 9.2 Divisão segura

```
safeDivide(a, b) := b = 0 ∨ ¬isFinite(a) ∨ ¬isFinite(b)
                    ? 0
                    : (isFinite(a/b) ? a/b : 0)
```

**Aplicação:** **toda** divisão neste documento usa `safeDivide`. Não existe NaN/Infinity propagado em UI.

### 9.3 Validação de bounds

| Campo | Min | Max | Comportamento se fora |
|---|---|---|---|
| `cat[i].%` | 0 | 100 | clamp |
| `cat[i].peso` | 0 | 9999 | clamp |
| `cat[i].valor_kg` | 0 | 9999 | clamp |
| Sliders | min/max do slider | min/max do slider | UI já restringe |

### 9.4 Renderização "—" / "!!!"

| Estado | Símbolo |
|---|---|
| Cálculo válido com valor 0 | `—` |
| Dado faltando (ex: `pastureArea` ausente) | `!!!` (com tooltip "Cadastre na fazenda") |
| Soma % inválida | `—` + badge ⚠ na tabela |

---

## 10. Mapeamento UI → fórmula

> Tabela de rastreabilidade entre o que o usuário vê e o ID da fórmula.

### Header

| Label UI | ID | Bloco |
|---|---|---|
| Valor Total | (campo da fazenda) | n/a |
| Op. Pecuária | `OP_pec` (campo da fazenda) | n/a |
| Área Pecuária | `area_past` (campo da fazenda) | n/a |
| Valor Calculado | C-01 | Ancoragem |
| Faturamento Necessário | C-02 | Ancoragem |

### Card "VALORES"

| Label UI | ID |
|---|---|
| Valor Médio de Venda | C-03 |
| Vendas Necessárias | C-04 |
| Matrizes Necessárias | C-07 |
| Rebanho Médio | C-32 |
| Total UAs | C-33 |

### Card "RESULTADOS DE PERFORMANCE"

| Label UI | ID |
|---|---|
| Taxa de Desmame | C-05 |
| Kg desm./Matriz | C-06 |
| Matrizes s/ Rebanho | C-08 |
| Vendas/ha | C-24 |
| GMD global | C-25 |
| Lotação UA/ha | C-28 |
| Produção de @/ha | C-26 / C-27 |
| Lotação Cab./ha | C-29 |

### Card "Recria e Engorda — Performance"

| Label UI | ID |
|---|---|
| Tempo Perm. | C-35 |
| Peso em @ | C-40 |
| Prod. @/ha/ano | C-27 |
| Giro de Estoque | C-36 |
| Lotação Cab/ha | C-30 |
| Lotação UA/ha | C-31 |

### Bloco "Finanças: Meta de Resultado"

| Label UI | ID |
|---|---|
| Receita | C-11 |
| Valor do rebanho | C-42 |
| Resultado/ha | C-14 |
| Resultado Sobre Ativo Pecuário | C-43 |
| Desembolso Total | C-12 |
| Desembolso/@ | C-23 |
| Resultado por Cabeça | C-16 |
| Resultado Sobre Valor da Terra | C-17 |
| Desembolso/Bezerro | C-18 |
| Margem Sobre a Venda | C-15 |
| Desembolso Médio Mensal | C-19 |
| Desembolso/Cab/Mês | C-20 |

---

## 11. Casos de teste (canônicos)

> Use estes casos como **fixtures** para testes unitários. Valores aprovados pelo consultor sênior.

### 11.1 Caso "Cria – Default"

**Inputs:**
```
S = 'Cria'
% inv = 4%, M_esp = 40%
OP_pec = R$ 9.230.769, area_past = 230 ha
F = 85, PPP = 6, MB = 3.5, PD_m = 220, PD_f = 200, IPM = 14
T_monta = 90, D_abate = 30, IDD = 7, R_TM = 4, P_touro = 710
PPM = 300, VBD = 0
Categorias: Bezerro=50% × 220kg × R$14, Novilha=17% × 13@ × R$290,
            Vaca Descarte=33% × 15@ × R$320
```

**Outputs esperados:**
```
calculatedValue        ≈ R$ 369.231        [C-01]
requiredRevenue        ≈ R$ 923.077        [C-02]
averageValue           ≈ R$ 3.765          [C-03a]
requiredSales          ≈ 245 cabeças       [C-04]
weaningRate            ≈ 77,10 %           [C-05]
kgPerMatrix            ≈ 161,9 kg          [C-06]
requiredMatrixes       ≈ 318 matrizes      [C-07]
matricesOverAverageHerd ≈ 58,95 %          [C-08]
averageHerd            ≈ 540 cabeças       [C-09]
revenue                ≈ R$ 922.401        [C-11]
totalDisbursement      ≈ R$ 553.170        [C-12]
result                 ≈ R$ 369.231        [C-13]
resultPerHectare       ≈ R$ 1.605/ha       [C-14]
marginOverSale         ≈ 40,0 %            [C-15]
disbursementPerArroba  ≈ R$ 208/@          [C-23]
gmdGlobal              ≈ 0,41 kg/dia       [C-25]
```

### 11.2 Caso "Recria e Engorda – Default"

**Inputs:**
```
S = 'Recria e Engorda'
% inv = 4%, M_esp = 20%
OP_pec, area_past idem
GMD_R = 0.65, Mort_R = 0.8, RC_R = 54.5
PC_R = 220, VC_R = 15, PV_R = 550, VV_R = 310
```

**Outputs esperados:**
```
recriaValorBoi              ≈ R$ 6.197      [C-03b]
recriaTempoPermanenciaMeses ≈ 16,69 meses  [C-35]
recriaGiroEstoque           ≈ 71,9 %       [C-36]
recriaPesoArroba            ≈ 19,98 @      [C-40]
```

### 11.3 Casos de borda

| Cenário | Comportamento esperado |
|---|---|
| `Σ % = 99.5` | `isPercentageSumValid = false` → C-03, C-04, C-11 = 0 |
| `M_esp = 0` | `requiredRevenue = 0` (C-02) |
| `area_past = null` | C-14, C-17, C-24, C-26-31 retornam 0 ou "!!!" |
| `IPM < 12` | `indiceTempo = 0` → `indexValorRebanho = 163.375` (caso base) |
| `weaningRate = 0` (mortalidade 100%) | `requiredMatrixes = 0` (C-07) — sem divisão por zero |
| `GMD_R = 0` | `recriaTempoPermanenciaMeses = 0` → C-35, C-36 = 0 |
| `cat[i].peso = 0` ∧ `cat[i].valor_kg = 0` | Categoria contribui 0 a `averageValue` — sem erro |

---

## 12. Referência cruzada — formulário rápido

| ID | Métrica | Fórmula resumida |
|---|---|---|
| C-01 | Valor calculado | `% inv × OP_pec / 100` |
| C-02 | Faturamento necessário | `calculatedValue × 100 / M_esp` |
| C-03a | Valor médio (Cria/CC) | `Σ cat.% × cat.peso × cat.valor / 100` |
| C-03b | Valor médio (RE) | `PV_R × VV_R × RC_R/100 / 15` |
| C-04 | Vendas necessárias | `round(requiredRevenue / averageValue)` |
| C-05 | Taxa de desmame | `F/100 × (1−PPP/100) × (1−MB/100)` |
| C-06 | Kg/matriz | `weaningRate × (PD_m + PD_f)/2` |
| C-07 | Matrizes necessárias | `⌈ requiredSales / weaningRate ⌉` |
| C-08 | Matrizes s/ rebanho | `100 / ((max(0,IPM−12) × 37.5/12) + 163.375)` |
| C-09 | Rebanho médio rápido | `requiredMatrixes / matricesOverAverageHerd` |
| C-10 | Rebanho médio ajust. | `averageHerd × (1 + MB/100)` |
| C-11 | Receita | `averageValue × requiredSales` |
| C-12 | Desembolso total | `revenue − calculatedValue` |
| C-13 | Resultado | `revenue − totalDisbursement` |
| C-14 | Resultado/ha | `result / area_past` |
| C-15 | Margem s/ venda | `result / revenue × 100` |
| C-16 | Resultado/cabeça | `result / requiredSales` |
| C-17 | Resultado s/ terra | `result / valor_terra × 100` |
| C-18 | Desembolso/cabeça | `totalDisbursement / requiredSales` |
| C-19 | Desembolso médio mês | `totalDisbursement / 12` |
| C-20 | Desembolso/cab/mês | `totalDisbursement / averageHerd / 12` |
| C-21 | Quantidade categoria | `round(requiredSales × cat.% / 100)` |
| C-22 | Total arrobas | `Σ qtd × peso_em_arroba` |
| C-23 | Desembolso/@ | `totalDisbursement / totalArroba` |
| C-24 | Vendas/ha | `requiredSales / area_past` |
| C-25 | GMD global | `Σ qtd × peso_kg / averageHerd / 365` |
| C-26 | Prod @/ha (Cria) | `totalArroba / area_past` |
| C-27 | Prod @/ha (RT) | `producaoAnimalMes × 12 × rebanhoMedioRT / area_past` |
| C-28 | Lotação UA/ha | `totalUAsAjustado / area_past` |
| C-29 | Lotação Cab/ha | `rebanhoMedioAjustado / area_past` |
| C-30 | Lotação Cab/ha (RE) | `recriaRebanhoMedioAjustado / area_past` |
| C-31 | Lotação UA/ha (RE) | `(pesoMedio/450) × recriaLotacaoCabHa` |
| C-32 | Rebanho médio detalh. | `Σ qtd × tempo / 12` (8 categorias) |
| C-33 | Total UAs | `Σ qtd × tempo × peso / 12 / 450` |
| C-34 | Valor rebanho (Cria) | `rebanhoMedioCalculado × averageValue` |
| C-35 | Tempo permanência RE | `(PV_R − PC_R) / GMD_R / 30.4166666667` |
| C-36 | Giro de estoque | `12 / tempoPermanencia × 100` |
| C-37 | Rebanho médio RE | `requiredSales × cicloMeses / 12` |
| C-38 | Investimento reposição | `PC_R × VC_R × requiredSales` |
| C-39 | Desembolso produção | `max(0, requiredRevenue − investReposicao − calculatedValue)` |
| C-40 | Peso em @ (RE) | `PV_R × RC_R/100 / 15` |
| C-41 | Valor rebanho (RT) | `rebanhoMedioRT × pesoMedioArroba × valorVenda` |
| C-42 | Valor rebanho consolid | branch por sistema |
| C-43 | Resultado s/ ativo pec. | `result / valorRebanhoRT × 100` (RT) ou idem Cria |

---

## 13. Notas finais

### 13.1 Constantes a NÃO alterar sem revisão técnica

- `37.5` e `163.375` em C-08 (curva de matrizes/rebanho) → calibração Inttegra
- `0.97` em §5.1 (peso médio matriz vs vaca descarte) → empírico
- `30` em `BEZERRO_WEIGHT_ADJUSTMENT` (§5.2) → ajuste de fase mamando
- `15` em C-03b, C-27, C-40, C-41 (R$/@ de carcaça) → meia-carcaça pendurada
- `30` em C-22 (1 @ = 30 kg) e `30.4` (dias por mês) → constantes universais
- `450` em C-28, C-31, C-33 (peso UA) → padrão zootécnico

### 13.2 Diferença entre `30.4` e `30.4166666667`

Existem **duas convenções** no código:
- `30.4` — usado em §5 (tabela de rebanho médio)
- `30.4166666667` — usado em C-35 e C-27 (Recria e Engorda)

> 365.25 / 12 = 30.4375. As duas são aproximações — verificar se vale unificar para `30.4375` em V1.1.

### 13.3 Próximos passos

1. ✅ Documentar todas as fórmulas (este documento)
2. ⏳ Migrar fórmulas inline de `AgilePlanning.tsx` para o hook `useAgilePlanningCalculations`
3. ⏳ Escrever testes unitários cobrindo §11 (casos canônicos)
4. ⏳ Revisão técnica das constantes mágicas (§13.1) com consultor sênior
5. ⏳ Decidir sobre unificação de `30.4` vs `30.4166666667`

---

> **Quando este documento divergir do código:** o código vence. Abra issue + PR atualizando ambos na mesma entrega.
