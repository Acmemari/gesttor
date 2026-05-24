# Instrução — Gestão de Versões do Orçamento (Inttegra · Gestão Orçamentária)

> **Escopo:** este documento define as regras de versionamento de orçamentos no módulo "Gestão Orçamentária" do Gestor. Aplica-se ao schema do banco, APIs, UI e mensagens ao usuário. Em qualquer ambiguidade, consulte este documento antes de inferir comportamento.

---

## 1. Conceitos centrais

**Orçamento Mestre** = container da safra (ex: "Safra 25/26 - Santa Fé"). Vive em `orcamentos`. Tem N versões.

**Versão** = snapshot de um Orçamento Mestre num momento de decisão. Vive em `orcamento_versoes`. Tem `tipo` (status), `parent_id` (origem), `valores_mensais` próprios.

**Save** ≠ **Versão**. Save é autosave contínuo do estado atual + audit trail. Versão é snapshot imutável criado por **decisão humana**.

---

## 2. Estados de uma versão

A coluna `orcamento_versoes.tipo` aceita exatamente estes valores:

| Tipo (enum) | Label PT-BR (UI) | Cor (header) | Editável? |
|---|---|---|---|
| `em_elaboracao` | Em Elaboração | cinza | ✅ Total |
| `em_revisao` | Em Revisão | azul | 🔒 Read-only para editores; aprovador comenta |
| `rejeitada` | Rejeitada | cinza médio | 🔒 Read-only (histórico do ciclo de revisão) |
| `baseline` | Baseline | verde + cadeado | 🔒 **Imutável forever** |
| `forecast` | Forecast | laranja | ✅ Apenas meses futuros (≥ `mes_corte`) |
| `baseline_substituida` | Baseline Substituída | cinza médio | 🔒 Read-only (override admin, raro) |
| `arquivada` | Arquivada | cinza médio | 🔒 Read-only |

**Não usar:** "Rascunho" (substituído por "Em Elaboração"), "Em Aprovação" (substituído por "Em Revisão").

---

## 3. Save vs Versão (regra fundamental)

### Save (autosave contínuo)
- Disparado a cada edição (debounce 400ms) ou auto a cada 2s.
- **Atualiza** `valores_mensais` da versão atual + grava entrada em `log_auditoria_orcamento`.
- **NUNCA cria nova versão.**

### Versão (snapshot)
- Criada **apenas** por uma destas decisões humanas:
  1. Wizard de cadastro inicial → cria V1.0 (`em_elaboracao`)
  2. Submeter para aprovação → cria snapshot (`em_revisao`)
  3. Aprovador aprova → snapshot vira `baseline` ou `forecast`
  4. Aprovador rejeita → snapshot vira `rejeitada` + clone vira `em_elaboracao` (continuando edição)
  5. "Criar Forecast" a partir de Baseline/Forecast → novo snapshot (`em_elaboracao` que vira `forecast` ao aprovar)
  6. "Salvar como" / duplicar para cenário alternativo → cria branch (V3.0, V4.0...)

**Anti-padrão:** criar versão a cada save. Isso polui a timeline e confunde "decisão" com "ato técnico".

---

## 4. Regra de ouro da Baseline

> **Existe exatamente UMA Baseline por Orçamento Mestre, para sempre.**

- Aprovação da primeira versão → vira Baseline.
- Após Baseline aprovada, **qualquer mudança = Forecast**, nunca nova Baseline.
- O sistema deve **bloquear no nível do banco** com índice único:

```sql
CREATE UNIQUE INDEX idx_one_baseline_per_orcamento
  ON orcamento_versoes (orcamento_id)
  WHERE tipo = 'baseline';
```

### Override de Baseline (exceção)
Se um erro crítico for descoberto (cadastro errado de fazenda, conversão de moeda incorreta), existe fluxo administrativo:

- Botão **escondido** em `Configurações → Administração → Substituir Baseline`
- Requer permissão especial (`role = 'admin'` + justificativa obrigatória ≥ 50 chars)
- Baseline antiga vira `baseline_substituida` (NÃO `arquivada` — mostra que houve override)
- Audit trail registra ação como `acao = 'baseline_override'`

**Default:** correção de erro pós-Baseline deve ser feita via Forecast. Override só em casos excepcionais.

---

## 5. Fluxo completo de aprovação (com revisões)

```
[Wizard] cria V1.0 (em_elaboracao)
    │
    │ ← gerente edita; autosaves contínuos; audit trail registra cada mudança
    ▼
[Submeter para Aprovação]  ← cria snapshot V1.0 (em_revisao)
    │
    ▼
[Aprovador analisa]
    │
    ├── ✅ Aprovar  →  V1.0 vira `baseline` 🔒
    │
    └── ❌ Solicitar alterações com comentários
              │  V1.0 vira `rejeitada` (fica no histórico, não some)
              │  Sistema cria V1.1 (em_elaboracao) clonando V1.0 + comentários abertos
              ▼
        [Gerente endereça comentários]
              │
              ▼
        [Submeter novamente]  ← cria snapshot V1.1 (em_revisao)
              │
              ▼
        [Aprovador analisa V1.1]
              │
              ├── ✅ Aprovar  →  V1.1 vira `baseline` 🔒
              │                    V1.0 fica como histórico do ciclo de revisão
              │
              └── ❌ Rejeitar  →  V1.1 vira `rejeitada`, cria V1.2, ciclo continua
```

### Comentários do aprovador
- Vivem em `comentarios_orcamento` com `tipo = 'pedido_revisao'`.
- Vinculados a célula/item específico via `entidade_id`.
- **Bloqueiam** a versão: gerente não pode submeter de novo enquanto houver comentários `resolvido = false`.

---

## 6. Numeração de versões

Formato `vX.Y`:

- **X** = branch (ciclo de planejamento ou cenário alternativo)
  - X = 1 → ciclo da Baseline original
  - X = 2 → primeiro Forecast e suas revisões
  - X = 3, 4… → branches alternativos (Cenário Seca, Cenário Otimista)
- **Y** = revisão dentro do branch
  - Y incrementa a cada novo snapshot dentro do mesmo X

Exemplo de timeline real:

| Versão | Tipo | Significado |
|---|---|---|
| V1.0 | rejeitada | Primeira tentativa, devolvida pelo aprovador |
| V1.1 | rejeitada | Segunda tentativa, devolvida |
| V1.2 | baseline | Terceira tentativa, aprovada — congelada |
| V2.0 | forecast | Primeiro Forecast (Outubro) |
| V2.1 | forecast | Revisão do F1 |
| V3.0 | em_elaboracao | Branch "Cenário Seca", duplicado de V2.1 |

**Implementação:** numeração é gerada server-side ao criar versão. Lógica:
- `X = (max(X) das versões com mesmo parent_id raiz) + 1` no caso de novo branch
- `Y = (max(Y) das versões com mesmo X) + 1` no caso de revisão

---

## 7. Forecast: meses passados são travados

Forecast nasce de Baseline (ou Forecast anterior) com `mes_corte = data_atual_inicio_mes`. Comportamento:

- Meses **anteriores** a `mes_corte` herdam valores e ficam **read-only** (já são realidade).
- Meses **a partir de** `mes_corte` ficam editáveis.
- Validação no servidor:

```ts
// PATCH /api/orcamentos/itens
if (versao.tipo === 'forecast' && mes < versao.mes_corte) {
  return { ok: false, error: 'Mês já fechado neste forecast' };
}
```

UI mostra meses travados com fundo cinza claro + cursor `not-allowed`.

---

## 8. Arquivamento

### Arquivar VERSÃO — automático
Acontece sem ação do usuário quando:
- Forecast antigo é substituído por Forecast mais recente do mesmo branch
- Limite de 50 versões/safra é atingido (arquiva os mais antigos)
- Usuário descarta um branch alternativo manualmente

Arquivada continua queryable, só some da lista padrão.

### Arquivar ORÇAMENTO MESTRE — manual ou automático condicional
- **Manual:** botão "Arquivar Orçamento" no menu do header.
- **Automático:** sistema arquiva quando `data_fim` passou há ≥ 90 dias **E** existe orçamento da safra seguinte com pelo menos uma Baseline.
- **Bloqueado** se safra ainda está em curso ou não tem sucessor.

Após arquivamento:
- Tudo (todas as versões, comentários, audit trail) vira read-only.
- Some da lista padrão; aparece em "Mostrar arquivados".
- Retenção mínima: **7 anos** (alinhado com guarda fiscal — NFR-05 do PRD).

---

## 9. Schema (Drizzle / Postgres)

### Tabela `orcamento_versoes`

```ts
export const orcamentoVersoes = pgTable('orcamento_versoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  orcamento_id: uuid('orcamento_id').notNull().references(() => orcamentos.id, { onDelete: 'cascade' }),
  parent_id: uuid('parent_id').references((): AnyPgColumn => orcamentoVersoes.id, { onDelete: 'set null' }),
  numero: text('numero').notNull(),  // "V1.0", "V2.4"
  nome: text('nome').notNull(),       // "Forecast Março"
  tipo: text('tipo', {
    enum: ['em_elaboracao', 'em_revisao', 'rejeitada', 'baseline', 'forecast', 'baseline_substituida', 'arquivada']
  }).notNull().default('em_elaboracao'),
  mes_corte: date('mes_corte'),       // só forecast
  imutavel: boolean('imutavel').notNull().default(false),  // true em baseline e arquivada
  criado_por: text('criado_por').notNull().references(() => userProfiles.id),
  criado_em: timestamp('criado_em').notNull().defaultNow(),
  submetido_em: timestamp('submetido_em'),
  decidido_em: timestamp('decidido_em'),
  decidido_por: text('decidido_por').references(() => userProfiles.id),
  motivo_rejeicao: text('motivo_rejeicao'),
}, (t) => ({
  uniqueBaseline: uniqueIndex('idx_one_baseline_per_orcamento')
    .on(t.orcamento_id)
    .where(sql`tipo = 'baseline'`),
  parentIdx: index('idx_versoes_parent').on(t.parent_id),
}));
```

### Tabela `comentarios_orcamento`

```ts
export const comentariosOrcamento = pgTable('comentarios_orcamento', {
  id: uuid('id').defaultRandom().primaryKey(),
  versao_id: uuid('versao_id').notNull().references(() => orcamentoVersoes.id, { onDelete: 'cascade' }),
  tipo: text('tipo', { enum: ['comentario', 'pedido_revisao'] }).notNull().default('comentario'),
  entidade: text('entidade'),       // ex: 'item_orcamento'
  entidade_id: uuid('entidade_id'), // ex: id do item afetado
  parent_id: uuid('parent_id').references((): AnyPgColumn => comentariosOrcamento.id),
  autor_id: text('autor_id').notNull().references(() => userProfiles.id),
  texto: text('texto').notNull(),
  resolvido: boolean('resolvido').notNull().default(false),
  resolvido_por: text('resolvido_por').references(() => userProfiles.id),
  resolvido_em: timestamp('resolvido_em'),
  criado_em: timestamp('criado_em').notNull().defaultNow(),
});
```

---

## 10. Regras de API

### Endpoints críticos

```
POST   /api/orcamentos/versoes/submeter        → versão atual: em_elaboracao → em_revisao
POST   /api/orcamentos/versoes/aprovar         → versão: em_revisao → baseline (1ª vez) ou forecast
POST   /api/orcamentos/versoes/rejeitar        → versão: em_revisao → rejeitada + cria nova em_elaboracao
POST   /api/orcamentos/versoes/criar-forecast  → cria nova versão a partir de baseline/forecast
POST   /api/orcamentos/versoes/override-baseline → admin only, vira baseline_substituida
GET    /api/orcamentos/versoes/diff?from=&to=  → diff agregado entre 2 versões
```

### Validações server-side obrigatórias

```ts
// Bloqueio de edição em versão imutável
if (versao.imutavel) {
  return { ok: false, error: 'Versão imutável. Crie um Forecast para alterar.' };
}

// Bloqueio de edição em mês fechado de Forecast
if (versao.tipo === 'forecast' && mes_alvo < versao.mes_corte) {
  return { ok: false, error: 'Mês já fechado neste forecast.' };
}

// Bloqueio de submissão com comentários abertos
const pendentes = await comentariosPendentes(versao.id);
if (pendentes.length > 0) {
  return { ok: false, error: `${pendentes.length} comentários não resolvidos.` };
}

// Bloqueio de aprovar como Baseline se já existe outra
if (target === 'baseline') {
  const existing = await baselineExistente(versao.orcamento_id);
  if (existing) {
    return { ok: false, error: 'Já existe Baseline. Aprovar como Forecast.' };
  }
}
```

---

## 11. Regras de UI

- **Cor do header muda por `tipo`:**
  - `em_elaboracao` → cinza claro (slate-100)
  - `em_revisao` → azul claro (blue-50)
  - `rejeitada` → cinza com hachura ou ribbon "Devolvida"
  - `baseline` → verde claro (emerald-50) + ícone cadeado
  - `forecast` → laranja claro (orange-50)
  - `baseline_substituida` / `arquivada` → cinza médio (slate-200)

- **Botão de aprovação contextual:**
  - Se safra **não tem** Baseline → label = "Aprovar como Baseline"
  - Se safra **já tem** Baseline → label = "Aprovar Forecast"

- **Quando mostrar comentários abertos:** badge no header com contagem + abertura automática da gaveta na primeira visita após rejeição.

- **Numeração visual:** nunca esconder. Sempre `vX.Y — Nome` (ex: `v1.2 — Forecast Março`). É a identidade da versão.

- **Empty states:**
  - Sem orçamento: "Crie o orçamento da Safra YY/YY"
  - Sem Baseline ainda: header neutro, sem cadeado, com instrução "Submeta para aprovação para travar a Baseline"

---

## 12. Anti-padrões — NÃO fazer

❌ Criar versão a cada save / autosave.
❌ Permitir editar uma Baseline (mesmo o admin "só dessa vez").
❌ Permitir 2 Baselines simultâneas (constraint de banco impede, mas validar no servidor também).
❌ Usar palavras "Rascunho" ou "Em Aprovação" — substituídas por "Em Elaboração" e "Em Revisão".
❌ Apagar versões rejeitadas — elas são histórico do ciclo de revisão, ficam read-only.
❌ Permitir editar mês ≤ `mes_corte` num Forecast.
❌ Gerar números de versão no cliente — sempre server-side, sob transação, para evitar race condition.
❌ Confundir `baseline_substituida` com `arquivada` — são situações distintas (override vs. fim de ciclo).

---

## 13. Casos de borda

| Cenário | Comportamento esperado |
|---|---|
| Aprovador rejeita versão sem comentários | Permitir, mas alertar "Sem comentários, gerente não saberá o que ajustar". |
| Gerente submete versão idêntica à anterior | Permitir (talvez foi pedida só uma re-validação). |
| Dois aprovadores aprovam ao mesmo tempo | Primeiro vence (otimistic lock via `updated_at`). Segundo recebe "versão já decidida". |
| Tentativa de criar Forecast a partir de versão `em_elaboracao` | Bloquear. Forecast só nasce de `baseline` ou outro `forecast`. |
| Orçamento Mestre sem nenhuma Baseline ainda + tentar arquivar | Permitir só se todas as versões forem `em_elaboracao` ou `arquivada` há > 30 dias (descarte de planejamento abandonado). |
| Forecast com `mes_corte` no futuro (cliente errou data) | Permitir, mas todos os meses ficam editáveis (caso degenerado equivale a "novo plano completo"). |

---

## 14. Glossário rápido

- **Baseline** = plano oficial aprovado, imutável.
- **Forecast** = revisão de Baseline com ajustes para meses futuros.
- **Em Elaboração** = trabalhando, ainda não submetido (era "Rascunho").
- **Em Revisão** = submetido, esperando decisão (era "Em Aprovação").
- **Rejeitada** = aprovador devolveu com comentários; vira histórico do ciclo.
- **Override de Baseline** = ação administrativa rara que substitui a Baseline original.
- **Save** = autosave do estado atual (NÃO cria versão).
- **Snapshot/Versão** = imutável, criado por decisão humana.

---

> Quando este documento e qualquer outro brief divergirem, **este documento prevalece** para regras de versionamento. Decisões adicionais que mudem essas regras devem atualizar este arquivo primeiro.
