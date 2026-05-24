---
name: engorda-ou-vende
description: Agente decisor para pecuarista que precisa decidir se vende o garrote/boi magro agora, engorda na fazenda ou envia para o boitel. Use SEMPRE que o usuário mencionar "vender ou engordar", "boitel", "engorda", "boi magro", "garrote", "confinamento", "TIR da engorda", "custo diário engorda", "viabilidade da engorda", "ponto de equilíbrio engorda", "vale a pena engordar", "mandar pro boitel", "diária boitel", "@ produzida", "decisão de venda boi", "simulação de engorda", "retorno da recria", "retorno do confinamento", ou qualquer variação de análise financeira comparando venda imediata vs engorda de bovinos. Também aciona quando o usuário quer calcular TIR mensal da engorda, ponto de equilíbrio de preço da @, ou gerar relatório de viabilidade de engorda. Funciona como um chat interativo guiado que coleta dados passo a passo e gera relatório final em Markdown.
---

# Engorda ou Vende — Agente Decisor de Viabilidade de Engorda

## Objetivo

Guiar o pecuarista (ou consultor) por um fluxo conversacional interativo para decidir se é melhor vender o garrote/boi magro agora ou engordá-lo (na fazenda ou no boitel). O fluxo coleta dados passo a passo, faz os cálculos financeiros e gera um relatório final.

## Implementação

Crie um artefato React (.jsx) que funcione como um chat interativo completo. O artefato deve ser autossuficiente — todo o motor de cálculo, fluxo conversacional e geração de relatório ficam dentro do componente.

Antes de escrever o código, leia `/mnt/skills/public/frontend-design/SKILL.md` para seguir as diretrizes de design.

## Fluxo Conversacional

O chat segue estas etapas em sequência. A cada etapa, o agente faz perguntas e valida as respostas antes de avançar.

### Etapa 1 — Valor Atual do Boi Magro

Mensagem inicial do agente:
> Olá! Vamos analisar se vale mais a pena vender ou engordar. Primeiro, me fale qual **categoria** vamos analisar (macho ou fêmea) e qual o **peso atual (kg)** e **valor de venda atual** do animal, antes de engordar. Se quiser, posso te ajudar a calcular o valor.

O usuário pode informar o valor de 3 formas:

**Forma 1 — Valor direto:**
Usuário digita algo como "Valor do boi magro é R$ 5.000". O agente aceita e segue.

**Forma 2 — Venda no peso vivo:**
Peso atual × Valor por kg = Valor do boi magro.
Exemplo: 400 kg × R$ 14/kg = R$ 5.600

**Forma 3 — Venda por @ com rendimento de carcaça:**
(Peso atual × Rendimento de carcaça) / 15 = Quantidade de @
Quantidade de @ × Valor da @ = Valor do boi magro.
Exemplo: 400 kg × 51% / 15 = 13,6@ → 13,6 × R$ 360 = R$ 4.896

O agente deve extrair os dados da mensagem do usuário de forma inteligente (linguagem natural) e confirmar o valor calculado antes de prosseguir.

### Etapa 2 — Modalidade de Engorda

Pergunta:
> Agora me diga: vamos analisar **engorda na fazenda**, **boitel**, ou **ambos**?

Dependendo da resposta, o fluxo se bifurca (ou faz ambos em sequência).

### Etapa 3A — Engorda na Fazenda

Perguntas em sequência:

1. **Tipo de engorda:** "Me conte um pouco mais: será pasto com suplementação, semiconfinamento, confinamento, ILP ou outro sistema?"

2. **Custo diário total (R$/dia):** Alimento + Operacional.
   - Faixa esperada: R$ 10 a R$ 20/dia.
   - Se fora da faixa: "Esse valor está fora da faixa usual (R$ 10–20/dia). Confirma que é isso mesmo?"

3. **Ganho de peso diário (GMD) em kg/dia:**
   - Faixa para machos: 0,8 a 1,9 kg/dia
   - Faixa para fêmeas: 0,8 a 1,5 kg/dia
   - Se fora da faixa: confirmar.

4. **Dados de venda do boi gordo:**
   - Peso vivo ao abate: machos 480–600 kg, fêmeas 360–550 kg
   - Rendimento de carcaça: machos 53–58%, fêmeas 50–55%
   - Valor da @ de venda: R$ 300–400
   - Validar faixas e confirmar se fora delas.

#### Cálculos — Engorda na Fazenda

Com os dados confirmados:

```
Ganho necessário = Peso abate - Peso atual
Tempo para abate (dias) = Ganho necessário / GMD
Custo total engorda = Tempo × Custo diário
Quantidade de @ gordo = (Peso abate × Rendimento carcaça) / 15
Receita bruta = Quantidade @ × Valor @
Resultado líquido = Receita bruta - Custo total engorda
Comparação: Resultado líquido vs Valor atual do boi magro
```

Se Resultado líquido < Valor atual → "Neste cenário de preço e desempenho, **não vale a pena engordar**."
Se Resultado líquido > Valor atual → "Neste cenário, **vale a pena engordar**, com ganho de R$ X sobre a venda imediata."

#### Ponto de Equilíbrio

Calcular o valor mínimo da @ para que Resultado líquido = Valor atual:
```
@ equilíbrio = (Valor atual + Custo total) / Quantidade de @
```

### Etapa 3B — Engorda no Boitel

Perguntar: **"No boitel vai pagar por diária (R$/dia) ou por @ produzida?"**

**Se por diária:** segue exatamente o mesmo esquema da fazenda (Etapa 3A), usando custo diário do boitel.

**Se por @ produzida:**
```
@ produzidas = ((Peso abate - Peso atual) × Rend. carcaça) / 15
Custo total boitel = @ produzidas × Custo por @ boitel
Receita bruta = (Peso abate × Rend. carcaça / 15) × Valor @ venda
Resultado líquido = Receita bruta - Custo total boitel
```
Comparar com valor atual e calcular ponto de equilíbrio.

### Etapa 4 — Cálculo de TIR e Metas

Para cada cenário calculado (fazenda e/ou boitel):

**TIR Mensal:**
```
Investimento = Valor atual do boi magro
Retorno = Resultado líquido (receita - custo)
Prazo em meses = Tempo para abate / 30
TIR mensal = ((Retorno / Investimento) ^ (1 / meses)) - 1
```

Se TIR < 1,5% a.m., calcular qual valor da @ é necessário para atingir 1,5% a.m.:
```
Meta retorno = Investimento × (1 + 0,015) ^ meses
@ necessária = Meta retorno / Quantidade de @
```

**Pergunta de meta personalizada:**
> Quer definir uma meta diferente? Pode ser em **R$/boi** (lucro por cabeça) ou **% ao mês** (retorno mensal). Me diga qual prefere e o valor.

Com base na meta do usuário, calcular o valor da @ necessário para atingi-la.

### Etapa 5 — Relatório Final

Ao final, perguntar: **"Quer que eu gere um relatório detalhado com todas as conclusões?"**

Se sim, gerar um Markdown completo (e oferecer download) com:

1. **Cabeçalho:** Data, categoria do animal
2. **Situação Atual:** Peso, valor de venda atual
3. **Cenário Fazenda** (se aplicável):
   - Premissas (sistema, custo, GMD, dados de venda)
   - Cálculos detalhados
   - Resultado (receita, custo, saldo, comparação)
   - TIR mensal
   - Ponto de equilíbrio da @
   - Valor da @ para meta (se definida)
4. **Cenário Boitel** (se aplicável):
   - Mesma estrutura
5. **Comparativo** (se ambos): tabela lado a lado
6. **Conclusão:** recomendação clara
7. **Aviso:** "Esta análise é uma simulação baseada nas premissas informadas. Resultados reais dependem de condições de mercado, desempenho animal e gestão."

## Diretrizes de UX do Chat

- Tom conversacional, acessível, como um consultor amigo do pecuarista
- Use "garrote" e "boi magro" como sinônimos sem preferência
- Valide faixas mas não bloqueie — sempre permita confirmar valores fora da faixa
- Mostre os cálculos intermediários para transparência
- Use formatação com negrito nos números importantes
- O chat deve ter scroll suave e manter foco na última mensagem
- Botões de atalho quando possível (ex: "Fazenda", "Boitel", "Ambos")
- Cores no tema agro: verdes escuros, terrosos, com destaque em amarelo/dourado para resultados financeiros
- O relatório deve ser renderizado em tela e com botão de copiar/download

## Faixas de Validação (referência)

| Parâmetro | Machos | Fêmeas |
|---|---|---|
| Custo diário (R$/dia) | 10–20 | 10–20 |
| GMD (kg/dia) | 0,8–1,9 | 0,8–1,5 |
| Peso abate (kg) | 480–600 | 360–550 |
| Rend. carcaça (%) | 53–58 | 50–55 |
| Valor @ venda (R$) | 300–400 | 300–400 |
