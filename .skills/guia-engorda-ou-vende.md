# Guia Completo — Skill "Engorda ou Vende?" para Google Antigravity

> Agente decisor de viabilidade de engorda bovina. Chat interativo que compara vender o garrote/boi magro agora vs. engordar na fazenda ou no boitel, com cálculo de TIR, ponto de equilíbrio e relatório final.

---

## 1. O que é esta Skill

A skill **engorda-ou-vende** é um agente conversacional (chat guiado) que ajuda o pecuarista ou consultor a decidir se vale mais a pena:

- **Vender o garrote/boi magro agora**, ou
- **Engordar na fazenda** (pasto, semiconfinamento, confinamento, ILP), ou
- **Enviar para o boitel** (pagamento por diária ou por @ produzida)

O agente coleta os dados passo a passo, valida faixas de mercado, calcula resultado financeiro, TIR mensal, ponto de equilíbrio da @, e gera um relatório completo em Markdown ao final.

---

## 2. Estrutura de Arquivos

A skill segue o padrão universal `SKILL.md` compatível com Antigravity, Claude Code, Cursor, Gemini CLI e outros agentes:

```
engorda-ou-vende/
├── SKILL.md              ← Definição da skill (instruções para o agente)
└── (o artefato .jsx é gerado pelo agente quando acionado)
```

O `SKILL.md` contém toda a lógica conversacional, fórmulas e regras de validação. Quando o agente é acionado, ele lê o SKILL.md e gera o artefato React interativo.

---

## 3. Instalação no Antigravity

### Opção A — Instalação para um projeto específico (recomendado)

Coloque a skill dentro da pasta `.agent/skills/` na raiz do seu projeto Ventor:

```bash
# Na raiz do seu projeto
mkdir -p .agent/skills/engorda-ou-vende

# Copie o SKILL.md para dentro
cp /caminho/do/SKILL.md .agent/skills/engorda-ou-vende/SKILL.md
```

Estrutura final no projeto:

```
ventor/                         ← raiz do seu projeto
├── .agent/
│   └── skills/
│       └── engorda-ou-vende/
│           └── SKILL.md
├── src/
├── package.json
└── ...
```

### Opção B — Instalação global (disponível em todos os projetos)

```bash
# Crie o diretório global de skills do Antigravity
mkdir -p ~/.gemini/antigravity/skills/engorda-ou-vende

# Copie o SKILL.md
cp /caminho/do/SKILL.md ~/.gemini/antigravity/skills/engorda-ou-vende/SKILL.md
```

### Após instalar

- **Feche e reabra o Antigravity** (ou inicie uma nova sessão/conversa)
- O Antigravity redetecta skills ao iniciar cada sessão
- A skill aparecerá na lista de skills disponíveis automaticamente

---

## 4. Como a Skill é Acionada

O Antigravity carrega o `name` e `description` do frontmatter YAML do SKILL.md ao iniciar a sessão. Quando você digitar algo que casa com a descrição, o agente ativa a skill automaticamente.

### Frases que acionam a skill

Qualquer uma dessas (e variações) vai ativar:

- "Vender ou engordar?"
- "Vale a pena engordar esse garrote?"
- "Simular engorda na fazenda"
- "Quero analisar boitel vs fazenda"
- "Custo de engorda de boi magro"
- "Calcular TIR da engorda"
- "Viabilidade de confinamento"
- "Mandar pro boitel ou vender?"

### Acionamento manual

Se a skill não ativar automaticamente, você pode forçar:

```
Use a skill engorda-ou-vende para simular se vale a pena engordar meu garrote
```

---

## 5. Fluxo Completo do Chat

A skill conduz o pecuarista por **5 etapas** em sequência:

### Etapa 1 — Valor Atual do Boi Magro

O agente pergunta **categoria** (macho/fêmea), **peso atual** e **valor de venda atual**.

O valor pode ser informado de 3 formas:

| Forma | Exemplo | Cálculo |
|-------|---------|---------|
| Valor direto | "R$ 5.000" | Aceita direto |
| Por kg vivo | "400 kg a R$ 14/kg" | 400 × 14 = R$ 5.600 |
| Por @ + rendimento | "400 kg, 51%, @ R$ 360" | (400 × 51% / 15) × 360 = R$ 4.896 |

### Etapa 2 — Modalidade

O agente pergunta: **Fazenda, Boitel ou Ambos?**

Botões de atalho aparecem para facilitar.

### Etapa 3A — Engorda na Fazenda

Coleta em sequência:

1. **Tipo de engorda** — pasto + suplementação, semiconfinamento, confinamento, ILP, etc.
2. **Custo diário total (R$/dia)** — alimento + operacional
   - Faixa esperada: R$ 10–20/dia
   - Fora da faixa: pede confirmação
3. **GMD (kg/dia)** — ganho de peso diário
   - Machos: 0,8–1,9 kg/dia | Fêmeas: 0,8–1,5 kg/dia
4. **Dados de venda do gordo** — peso ao abate, rendimento de carcaça, valor da @

**Cálculos realizados:**

```
Ganho necessário       = Peso abate – Peso atual
Tempo para abate       = Ganho / GMD
Custo total            = Tempo × Custo diário
Arrobas ao abate       = (Peso abate × Rend. carcaça) / 15
Receita bruta          = Arrobas × Valor @
Resultado líquido      = Receita – Custo total
```

**Veredicto:** Se Resultado líquido > Valor atual → vale a pena. Senão → não vale.

**Ponto de equilíbrio:** valor mínimo da @ para empatar com a venda imediata:
```
@ equilíbrio = (Valor atual + Custo total) / Arrobas ao abate
```

### Etapa 3B — Engorda no Boitel

Primeiro pergunta: **diária (R$/dia) ou @ produzida?**

- **Se diária:** mesmo esquema da fazenda
- **Se @ produzida:**
  ```
  @ produzidas  = ((Peso abate – Peso atual) × Rend. carcaça) / 15
  Custo total   = @ produzidas × Custo por @ boitel
  Receita       = (Peso abate × Rend. / 15) × Valor @ venda
  Resultado     = Receita – Custo
  ```

### Etapa 4 — TIR e Metas

Para cada cenário calculado:

```
TIR mensal = ((Resultado / Valor atual) ^ (1 / meses)) – 1
```

Se TIR < 1,5% a.m., calcula automaticamente qual @ é necessária para atingir 1,5%.

O agente pergunta se quer definir uma **meta personalizada**:
- **R$/boi** — lucro por cabeça desejado
- **% ao mês** — TIR mensal desejada

E calcula o valor da @ necessário para atingir a meta.

### Etapa 5 — Relatório Final

O agente pergunta se quer gerar o relatório. Se sim, renderiza em tela com:

- Situação atual (categoria, peso, valor)
- Cenário Fazenda (premissas, cálculos, resultado, TIR, ponto de equilíbrio)
- Cenário Boitel (idem)
- Comparativo lado a lado (se analisou ambos)
- Meta personalizada (se definida)
- Conclusão com recomendação
- Aviso de simulação

Botões de **Copiar** e **Download .md** ficam disponíveis.

---

## 6. Exemplo Completo de Uso

Aqui está um fluxo real simulado:

```
Você:    Quero ver se vale a pena engordar meu garrote
Agente:  Olá! Qual categoria (macho/fêmea), peso e valor atual?
Você:    Macho, 400 kg, valor R$ 5.600
Agente:  ✅ Macho, 400 kg, R$ 5.600. Fazenda, Boitel ou Ambos?
Você:    Fazenda
Agente:  Qual sistema? (pasto, confinamento, ILP...)
Você:    Confinamento
Agente:  Custo diário total (R$/dia)?
Você:    15
Agente:  ✅ R$ 15/dia. GMD esperado (kg/dia)?
Você:    1,15
Agente:  ✅ 1,15 kg/dia. Peso ao abate, rendimento e valor da @?
Você:    550 kg, 55%, R$ 350
Agente:  📋 Resumo — confirma para calcular?
Você:    Sim
Agente:  ❌ RESULTADO — Engorda na Fazenda
         • Ganho: 150 kg
         • Tempo: 130 dias (4,35 meses)
         • Custo total: R$ 1.956,52
         • Arrobas: 20,17 @
         • Receita: R$ 7.058,33
         • Resultado líquido: R$ 5.101,81
         • Valor atual: R$ 5.600,00
         Não vale a pena engordar neste cenário.
         TIR: -2,18% a.m.
         Ponto de equilíbrio: R$ 374,70/@
         Para TIR 1,5% a.m.: @ ≥ R$ 384,50
```

---

## 7. Faixas de Validação (Referência Rápida)

| Parâmetro | Machos | Fêmeas |
|-----------|--------|--------|
| Custo diário (R$/dia) | 10–20 | 10–20 |
| GMD (kg/dia) | 0,8–1,9 | 0,8–1,5 |
| Peso ao abate (kg) | 480–600 | 360–550 |
| Rendimento carcaça (%) | 53–58 | 50–55 |
| Valor @ venda (R$) | 300–400 | 300–400 |

Valores fora dessas faixas são aceitos após confirmação do usuário.

---

## 8. Fórmulas Utilizadas

### Valor por @ (Etapa 1)
```
Qtd @ = (Peso vivo × Rendimento carcaça%) / 15
Valor = Qtd @ × Preço @
```

### Tempo e Custo de Engorda
```
Dias = (Peso abate – Peso atual) / GMD
Custo = Dias × Custo diário
```

### Resultado
```
Arrobas gordo = (Peso abate × Rend%) / 15
Receita = Arrobas × Valor @
Resultado = Receita – Custo
```

### TIR Mensal
```
Meses = Dias / 30
TIR = ((Resultado / Investimento) ^ (1/Meses)) – 1
```

### Ponto de Equilíbrio
```
@ equilíbrio = (Valor atual + Custo total) / Arrobas gordo
```

### @ para Meta de TIR
```
Meta retorno = Investimento × (1 + TIR meta) ^ Meses
@ necessária = Meta retorno / Arrobas gordo
```

### @ para Meta de Lucro (R$/boi)
```
@ necessária = (Valor atual + Lucro desejado + Custo total) / Arrobas gordo
```

---

## 9. Personalização

### Alterar a TIR padrão de referência

No código do artefato React, a constante está no topo:

```javascript
const META_TIR_PADRAO = 1.5; // % ao mês
```

Altere para a taxa que preferir (ex: `2.0` para 2% a.m.).

### Alterar faixas de validação

No objeto `RANGES`:

```javascript
const RANGES = {
  macho: { custoDia: [10, 20], gmd: [0.8, 1.9], pesoAbate: [480, 600], ... },
  femea: { custoDia: [10, 20], gmd: [0.8, 1.5], pesoAbate: [360, 550], ... },
};
```

### Alterar visual/cores

O tema usa cores terrosas/agro. As cores principais no componente:
- Fundo: `#1a1f16` (verde muito escuro)
- Destaque: `#b8860b` (dourado/ouro velho)
- Texto: `#e8e0d4` (bege claro)
- Bot: `rgba(40,38,32,0.85)` (marrom escuro)
- Usuário: `#2d5016` (verde mata)

---

## 10. Integração com o Ventor

Para incorporar este chat como módulo dentro do Ventor (React/Node/Supabase):

### Como componente React

1. Salve o arquivo `.jsx` como `src/components/EngordaOuVende.jsx`
2. Importe no seu roteador:

```jsx
import EngordaOuVende from './components/EngordaOuVende';

// Na rota desejada:
<Route path="/simulador-engorda" element={<EngordaOuVende />} />
```

3. O componente é **autossuficiente** — não precisa de backend, API ou banco de dados
4. Toda a lógica roda no frontend (cálculos, fluxo, relatório)

### Persistência (opcional)

Se quiser salvar simulações no Supabase:

1. Crie uma tabela `simulacoes_engorda` com os campos do `data` state
2. Adicione um botão "Salvar Simulação" ao final do fluxo
3. Use o Supabase client para inserir

### Multi-tenant

O componente não tem estado persistente — cada sessão é independente. Para associar ao fazendeiro/consultor, passe props:

```jsx
<EngordaOuVende fazendaId={fazenda.id} consultorId={user.id} />
```

---

## 11. Troubleshooting

| Problema | Solução |
|----------|---------|
| Skill não aparece no Antigravity | Feche e reabra o Antigravity. Verifique se o `SKILL.md` está em `.agent/skills/engorda-ou-vende/SKILL.md` |
| Skill não aciona automaticamente | Use acionamento manual: "Use a skill engorda-ou-vende para..." |
| Valores com vírgula não são reconhecidos | O parser aceita vírgula como decimal (padrão BR). Use ponto ou vírgula |
| TIR aparece negativa | Normal quando o resultado líquido é menor que o investimento — significa prejuízo |
| Relatório não renderiza tabelas | Verifique se o Markdown está sendo renderizado com suporte a tabelas (GFM) |

---

## 12. Conteúdo do SKILL.md

O arquivo `SKILL.md` que deve ser colocado em `.agent/skills/engorda-ou-vende/` está disponível junto com este guia. Ele contém:

- **Frontmatter YAML** com `name` e `description` (gatilho de ativação)
- **Instruções completas** do fluxo conversacional em 5 etapas
- **Fórmulas** detalhadas para cada cálculo
- **Faixas de validação** por categoria (macho/fêmea)
- **Diretrizes de UX** para o tom conversacional
- **Estrutura do relatório** final

---

## Resumo dos Arquivos Entregues

| Arquivo | O que é | Onde colocar |
|---------|---------|--------------|
| `SKILL.md` | Definição da skill (instruções para o agente) | `.agent/skills/engorda-ou-vende/SKILL.md` |
| `engorda-ou-vende.jsx` | Artefato React (chat interativo completo) | `src/components/` no Ventor ou usado como artifact |
| Este guia (`.md`) | Documentação completa | Onde preferir (docs, wiki, etc.) |

---

*Skill criada para o Sistema Inttegra / Ventor — Consultoria Agropecuária*
