# Plano de Implementação: Visitante com Hierarquia Completa (Analista + Cliente + Fazenda Default)

## Contexto

A aplicação tem uma hierarquia `Analista → Cliente → Fazenda`. Existe um login promocional de visitante (`qualification: 'visitante'`) onde o usuário testa funcionalidades. Para que a hierarquia seja mantida sem alterar layout/UI, o visitante deve carregar automaticamente um analista, cliente e fazenda default.

**Estado atual:** No worktree `naughty-lalande` já existe implementação parcial:
- Analista default: `VISITOR_ANALYST_ID` (fixo, antonio@inttegra.com)
- Cliente default: `VISITOR_CLIENT_ID` (fixo, "Visitante Demo")
- Fazenda default: **NÃO EXISTE** (farmId fica `null`)

**Problema:** Com `farmId: null`, agentes como QuestionnaireFiller e FeedbackAgent retornam early/ficam desabilitados. O comentário na linha 613 do HierarchyContext do worktree menciona "migration 024 + 025", mas a migração 025 não existe.

**Objetivo:** Completar a hierarquia adicionando fazenda demo default e mergear todo o código de visitante para o branch main.

---

## Passo 1: Mergear Código do Worktree para Main

O worktree `naughty-lalande` tem código de visitante que precisa ir para main. Os arquivos modificados/criados são:

### 1.1 Arquivos NOVOS a criar no main:
- `components/VisitorContentGuard.tsx` — Componente guard que mostra conteúdo borrado + overlay de cadeado para features bloqueadas
- `components/VisitorLockedModal.tsx` — Modal de contato WhatsApp quando visitante tenta acessar feature bloqueada
- `lib/supabase/migrations/024_visitor_demo_context.sql` — Migração que cria cliente demo + policies RLS

### 1.2 Arquivos EXISTENTES a atualizar no main:

#### `contexts/HierarchyContext.tsx`
Adicionar no topo (após imports):
```typescript
const VISITOR_ANALYST_ID = '0238f4f4-5967-429e-9dce-3f6cc03f5a80';
const VISITOR_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
const VISITOR_FARM_ID = '00000000-0000-0000-0000-000000000003'; // NOVO
```

Modificar o `effectiveAnalystId` para tratar visitantes:
```typescript
const effectiveAnalystId = useMemo(() => {
  if (!user) return null;
  if (user.qualification === 'visitante') return VISITOR_ANALYST_ID;
  if (user.role === 'admin') return state.analystId;
  return user.id;
}, [user, state.analystId]);
```

Modificar o useEffect de hydrate para visitantes:
```typescript
useEffect(() => {
  if (!user) return;
  if (user.qualification === 'visitante') {
    dispatch({
      type: 'HYDRATE_IDS',
      payload: {
        analystId: VISITOR_ANALYST_ID,
        clientId: VISITOR_CLIENT_ID,
        farmId: VISITOR_FARM_ID, // ← NOVO: antes era null
      },
    });
    return;
  }
  const initial = loadInitialPersistedIds();
  dispatch({ type: 'HYDRATE_IDS', payload: initial });
}, [user?.id]);
```

Pular localStorage para visitantes:
```typescript
useEffect(() => {
  if (!user) return;
  if (user.qualification === 'visitante') return; // IDs são determinísticos
  // ... persist normal
}, [state.analystId, state.clientId, state.farmId, user]);
```

Adicionar inicialização do analista sintético para visitante (no useEffect principal de carregamento):
```typescript
if (user.qualification === 'visitante') {
  dispatch({
    type: 'SET_SELECTED_ANALYST',
    payload: {
      id: VISITOR_ANALYST_ID,
      name: 'Inttegra (Visitante)',
      email: 'antonio@inttegra.com',
      role: 'admin',
      qualification: 'analista',
    },
  });
  return; // loadClients dispara via effectiveAnalystId
}
```

#### `components/Sidebar.tsx`
Adicionar detecção de visitante:
```typescript
const isVisitor = user?.qualification === 'visitante';
```
Adicionar lógica de lock para agentes indisponíveis para visitantes (atualmente `isLockedForVisitor = false` no worktree — ajustar conforme features que quiser bloquear).

#### `agents/FeedbackAgent.tsx`
Já tem tratamento para visitante (isVisitorClient). Manter como está no worktree.

#### `agents/AdminDashboard.tsx`
Já tem tratamento para qualification no worktree (seletor de qualificação para editar usuários).

---

## Passo 2: Criar Migração 025 — Fazenda Demo

Criar arquivo: `lib/supabase/migrations/025_visitor_demo_farm.sql`

```sql
-- ============================================================
-- MIGRATION 025: Visitor Demo Farm
-- Creates a fixed demo farm under the visitor demo client.
-- Completes the hierarchy: Analyst → Client → Farm for visitors.
-- ============================================================

-- 0. Precondition: verify client from migration 024 exists; fail loudly if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = '00000000-0000-0000-0000-000000000002'::uuid) THEN
    RAISE EXCEPTION 'Migration 025 requires client_id 00000000-0000-0000-0000-000000000002 from migration 024. Run 024_visitor_demo_context.sql first.';
  END IF;
END $$;

-- 1. Insert the demo farm with a fixed ID
INSERT INTO farms (id, name, country, state, city, client_id, property_type, weight_metric, production_system, total_area, pasture_area, average_herd, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Fazenda Demo',
  'Brasil',
  'PR',
  'Maringá',
  '00000000-0000-0000-0000-000000000002',  -- Visitante Demo client
  'Própria',
  'Arroba (@)',
  'Ciclo Completo',
  500,    -- total_area (hectares)
  350,    -- pasture_area (hectares)
  800,    -- average_herd (cabeças)
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
```

**Nota:** A RLS para visitantes verem fazendas do cliente demo já existe na migração 024 (`"Visitantes podem ver fazendas demo"` filtra por `client_id = '00000000-0000-0000-0000-000000000002'`). Não precisa criar policy nova.

**Campos da fazenda demo (sugestões de valores realistas):**
- `name`: "Fazenda Demo"
- `country`: "Brasil"
- `state`: "PR" (Paraná — sede Inttegra)
- `city`: "Maringá"
- `property_type`: "Própria"
- `weight_metric`: "Arroba (@)"
- `production_system`: "Ciclo Completo"
- `total_area`: 500 ha
- `pasture_area`: 350 ha
- `average_herd`: 800 cabeças

---

## Passo 3: Rodar Migração no Supabase

```bash
# No dashboard do Supabase, executar o SQL da migração 025
# Ou via CLI:
supabase db push
```

Verificar no banco:
```sql
SELECT * FROM farms WHERE id = '00000000-0000-0000-0000-000000000003';
-- Deve retornar a fazenda "Fazenda Demo" com client_id do visitante demo
```

---

## Passo 4: Atualizar HierarchyContext com VISITOR_FARM_ID

No `contexts/HierarchyContext.tsx`, adicionar a constante e usar no HYDRATE_IDS (como descrito no Passo 1). O farmId fixo garante que:

1. O visitante já entra com fazenda selecionada
2. Todos os agentes que dependem de `selectedFarm` funcionam imediatamente
3. Os seletores (AnalystSelector, ClientSelector, FarmSelector) ficam ocultos/desabilitados para visitantes

---

## Passo 5: Verificação e Testes

### 5.1 Testar login de visitante
1. Logar com conta de qualification `'visitante'`
2. Verificar que o header mostra: Analista "Inttegra (Visitante)" → Cliente "Visitante Demo" → Fazenda "Fazenda Demo"
3. Os seletores devem estar desabilitados/ocultos

### 5.2 Testar agentes que dependem de farm
- **CattleProfitCalculator**: Deve funcionar normalmente, permitir salvar cenários com farmId
- **QuestionnaireFiller**: Deve carregar com a fazenda demo selecionada (antes retornava early com farm null)
- **SavedScenarios**: Deve filtrar por fazenda demo
- **AgilePlanning**: Deve carregar dados da fazenda (pastureArea, etc.)

### 5.3 Testar RLS no banco
```sql
-- Como visitante autenticado, verificar que:
-- 1. Consegue ver a fazenda demo
SELECT * FROM farms WHERE client_id = '00000000-0000-0000-0000-000000000002';

-- 2. NÃO consegue ver fazendas de outros clientes
SELECT * FROM farms WHERE client_id != '00000000-0000-0000-0000-000000000002';
-- Deve retornar vazio
```

### 5.4 Testar VisitorContentGuard
- Acessar feature bloqueada
- Verificar que conteúdo aparece borrado com cadeado
- Clicar no cadeado abre VisitorLockedModal com formulário WhatsApp

### 5.5 Testes de edge-case (imutabilidade, persistência, isolamento, acessibilidade, RLS negativo)

#### 5.5.1 Imutabilidade (visitor não pode INSERT/UPDATE/DELETE farms fora do demo)
```sql
-- Como visitante autenticado, executar e verificar FALHA:
INSERT INTO farms (id, name, client_id, ...) VALUES (gen_random_uuid(), 'Test', '<outro_client_id>', ...);
UPDATE farms SET name = 'Hacked' WHERE client_id != '00000000-0000-0000-0000-000000000002';
DELETE FROM farms WHERE client_id != '00000000-0000-0000-0000-000000000002';
-- Cada comando deve retornar erro de RLS (0 rows affected ou permission denied)
```

#### 5.5.2 Persistência (visitor IDs não vão para localStorage)
- Após login como visitante, inspecionar `localStorage` (chave `hierarchySelection.v1`)
- **Assert:** Nenhum valor com VISITOR_ANALYST_ID, VISITOR_CLIENT_ID ou VISITOR_FARM_ID deve ser persistido; ou a chave não deve existir para visitantes
- Referência: HierarchyContext.tsx pula persistência quando `user.qualification === 'visitante'`

#### 5.5.3 Isolamento (manipulação de IDs em URL/storage não retorna dados cross-client)
- Manipular URL ou sessionStorage com IDs de outros clientes/analistas
- **Assert:** API/RLS não retorna dados de outros clientes; apenas dados do demo context
- Verificar que `effectiveAnalystId` para visitante é sempre VISITOR_ANALYST_ID, independente de parâmetros

#### 5.5.4 Navegação e acessibilidade (seletores realmente desabilitados)
- Verificar via DOM/DevTools que AnalystSelector, ClientSelector e FarmSelector têm `disabled` ou `aria-disabled="true"` quando `isVisitor`
- **Assert:** Não basta `display:none` ou `visibility:hidden`; elementos devem estar desabilitados em estado para leitores de tela
- Referência: VisitorContentGuard e VisitorLockedModal — verificar que botões bloqueados têm `disabled`/`aria-disabled`

#### 5.5.5 RLS negativo (queries devem falhar)
```sql
-- Como visitante, executar e verificar FALHA:
-- UPDATE em farm de outro cliente
UPDATE farms SET total_area = 999 WHERE client_id != '00000000-0000-0000-0000-000000000002';

-- INSERT em farm com client_id de outro analista
INSERT INTO farms (id, name, client_id, ...) 
SELECT gen_random_uuid(), 'Fake', c.id, ... FROM clients c 
WHERE c.analyst_id != '0238f4f4-5967-429e-9dce-3f6cc03f5a80' LIMIT 1;

-- SELECT de farms de outros clientes
SELECT * FROM farms WHERE client_id != '00000000-0000-0000-0000-000000000002';
-- Deve retornar vazio (0 rows)
```
- **Assert:** Cada operação deve falhar ou retornar 0 rows; incluir asserções automatizadas em testes E2E ou de integração

---

## Arquivos Críticos (resumo)

| Arquivo | Ação |
|---------|------|
| `contexts/HierarchyContext.tsx` | ATUALIZAR — adicionar constantes visitante + lógica de hydrate com farmId |
| `components/VisitorContentGuard.tsx` | CRIAR — guard de conteúdo bloqueado |
| `components/VisitorLockedModal.tsx` | CRIAR — modal de contato WhatsApp |
| `lib/supabase/migrations/024_visitor_demo_context.sql` | CRIAR — cliente demo + RLS |
| `lib/supabase/migrations/025_visitor_demo_farm.sql` | CRIAR — fazenda demo |
| `components/Sidebar.tsx` | ATUALIZAR — adicionar `isVisitor` e lógica de lock |
| `agents/FeedbackAgent.tsx` | ATUALIZAR — tratamento isVisitorClient |
| `agents/AdminDashboard.tsx` | ATUALIZAR — seletor de qualification |

---

## Dependência entre Agentes e Farm Selection

### Agentes que USAM `selectedFarm` (14 agentes):

| Agente | Comportamento com farm null |
|--------|-----------------------------|
| **QuestionnaireFiller** | BLOQUEADO — retorna early, nada carrega |
| **FeedbackAgent** | BLOQUEADO — retorna early para visitantes |
| **CattleProfitCalculator** | OK — salva farmId como null |
| **Comparator** | OK — salva farmId como null |
| **SavedScenarios** | OK — filtra opcionalmente |
| **AgilePlanning** | OK — usa optional chaining, retorna 0 |
| **InitiativesActivities** | OK — filtro opcional |
| **InitiativesKanban** | OK — filtro opcional |
| **InitiativesOverview** | OK — filtro opcional |
| **ProjectManagement** | OK — passa null, tratado como opcional |
| **PeopleManagement** | OK — filtro opcional |
| **FarmManagement** | Independente — gerencia CRUD de farms |
| **ClientManagement** | Independente — foca em clientes |
| **AnalystManagement** | Independente — foca em analistas |

### Agentes que NÃO usam farm (18 agentes):
AdminDashboard, AgentTrainingAdmin, AgentUsageDashboard, AIAgentConfigAdmin, AreaCertificadosDesktop, CadastrosDesktop, CalculadorasDesktop, ChatAgent, ClientDocuments, DeliveryManagement, FeedbackList, MarketTrends, ProjetoDesktop, ProjectStructureReport, RotinasFazendaDesktop, SupportTicketsDashboard

---

## Componentes de Visitante (código completo do worktree)

### VisitorContentGuard.tsx
Componente wrapper que:
- Se `!isVisitor || isAllowed` → renderiza children normalmente
- Se visitante + não permitido → mostra conteúdo com `blur(3px)` e `opacity: 0.45`
- Overlay com ícone de cadeado + botão "Quero conhecer →"
- Clique abre `VisitorLockedModal`

### VisitorLockedModal.tsx
Modal com:
- Header gradient emerald/green com ícone de cadeado
- Formulário: nome + WhatsApp
- Submissão abre `wa.me/5544991333278` com mensagem pré-formatada
- Botão alternativo "Falar pelo WhatsApp agora"
- Botão "Agora não, continuar explorando"

---

## Padrão de IDs Fixos

O padrão de IDs fixos para visitante segue a convenção:
- `VISITOR_ANALYST_ID = '0238f4f4-5967-429e-9dce-3f6cc03f5a80'` (admin real — antonio@inttegra.com)
- `VISITOR_CLIENT_ID = '00000000-0000-0000-0000-000000000002'` (UUID semântico com zeros)
- `VISITOR_FARM_ID = '00000000-0000-0000-0000-000000000003'` (UUID semântico com zeros)

Todos definidos como constantes no `HierarchyContext.tsx` e referenciados nas migrações SQL.
Os IDs semânticos (com zeros) facilitam identificação visual e debug.

---

## Segurança e Auditoria para IDs Fixos de Visitante

### 1. Marcador de auditoria no HierarchyContext
- Manter `VISITOR_ANALYST_ID`, `VISITOR_CLIENT_ID` e `VISITOR_FARM_ID` como constantes
- Em operações sensíveis (ex.: salvamento de cenários, feedbacks), incluir `is_visitor_action: true` ou garantir que queries de auditoria filtrem por `qualification = 'visitante'` no JWT para distinguir ações de visitantes em logs

### 2. RLS com verificação de qualification
- Nas migrações `024_visitor_demo_context.sql` e `025_visitor_demo_farm.sql`, as policies RLS devem exigir `auth.jwt() ->> 'qualification' = 'visitante'` (ou equivalente via subquery em `user_profiles`) **além** das checagens de ID
- Isso evita reutilização/bypass: um usuário não-visitante não pode acessar dados demo apenas conhecendo os IDs fixos
- Padrão atual nas policies: `EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND qualification = 'visitante')` — já atende

### 3. Usuário analista admin obrigatório
- O analista `0238f4f4-5967-429e-9dce-3f6cc03f5a80` (antonio@inttegra.com) deve existir com `role = 'admin'` antes de habilitar fluxos de visitante
- Criar migração ou seed que: (a) insere o usuário se não existir, ou (b) falha com mensagem clara se o usuário não existir
- Garante que o cliente demo e a fazenda demo tenham um `analyst_id` válido
