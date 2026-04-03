# 06 - Otimizacao e Correcao de Bugs no Fluxo de Criacao/Edicao de Projeto

## Contexto

O fluxo de criacao/edicao de projetos apresenta bugs de edicao e problemas graves de performance.
Cada edicao inline recarrega toda a arvore de dados (projetos + entregas + atividades + tarefas),
e a logica de validacao entre frontend e backend esta inconsistente.

---

## Arquivos Envolvidos

| Arquivo | Descricao |
|---------|-----------|
| `components/ProjectDocument.tsx` | Edicao inline com debounce (957 linhas) |
| `components/ProjectWorkbench.tsx` | CRUD via modais (1307 linhas) |
| `components/eap/ProjectModal.tsx` | Modal de formulario do projeto |
| `lib/projects.ts` | Validacao client-side e wrappers CRUD |
| `lib/api/projectsClient.ts` | Cliente HTTP para API de projetos |
| `api/projects.ts` | API Route CRUD (GET/POST/PATCH/DELETE) |
| `src/DB/repositories/projects.ts` | Repositorio Drizzle ORM |
| `src/DB/repositories/initiatives.ts` | Repositorio de atividades |
| `src/DB/repositories/evidence.ts` | Repositorio de evidencias |
| `lib/eapTree.ts` | Carregamento bulk da arvore EAP |

---

## FASE 1: Correcao de Bugs Criticos

### 1.1 — Fix: `loadTree` re-executa ao trocar de projeto selecionado

**Arquivo:** `components/ProjectDocument.tsx`
**Linhas:** 87-117

**Problema:**
`selectedProgramId` esta na dependency array do `useCallback` de `loadTree` (linha 113).
Como `loadTree` chama `setSelectedProgramId` internamente (linhas 99-102), e o `useEffect`
(linhas 115-117) depende de `[loadTree]`, trocar o projeto selecionado causa:
1. `selectedProgramId` muda
2. `loadTree` e recriado (nova referencia)
3. `useEffect` detecta mudanca e chama `loadTree()`
4. Toda a arvore e recarregada do servidor

**Solucao:**
1. Remover `selectedProgramId` da dependency array de `loadTree` (linha 113)
2. Remover as linhas 99-102 de dentro de `loadTree` (logica de auto-selecao)
3. Criar um `useEffect` separado para auto-selecao:

```typescript
// ANTES (dentro de loadTree, REMOVER):
// if (t.length > 0 && !selectedProgramId) {
//   setSelectedProgramId(t[0].data.rawId);
// } else if (t.length > 0 && selectedProgramId && !t.some(...)) {
//   setSelectedProgramId(t[0].data.rawId);
// }

// DEPOIS (novo useEffect separado, ADICIONAR apos o useEffect de loadTree):
useEffect(() => {
  if (tree.length === 0) return;
  if (!selectedProgramId || !tree.some(n => n.data.rawId === selectedProgramId)) {
    setSelectedProgramId(tree[0].data.rawId);
  }
}, [tree, selectedProgramId]);
```

4. A dependency array de `loadTree` fica:
```typescript
}, [effectiveUserId, selectedOrganizationId, selectedFarmId, readonly, toast]);
```

---

### 1.2 — Fix: `updateProject` exige payload completo (impede edicao parcial)

**Arquivo:** `lib/projects.ts`
**Linhas:** 64-83 e 106-120

**Problema:**
`updateProject` (linha 106) chama `validatePayload(payload)` que exige `payload.name` nao vazio.
Para edicoes inline onde so um campo muda (ex: descricao), `name` nao e enviado e a validacao falha.

**Solucao:**
1. Criar funcao `validatePartialPayload`:

```typescript
function validatePartialPayload(payload: Partial<ProjectPayload>): void {
  if (payload.name !== undefined) {
    const name = payload.name?.trim() || '';
    if (!name) throw new Error('O nome do projeto e obrigatorio.');
    if (name.length > MAX_NAME_LENGTH)
      throw new Error(`O nome do projeto e muito longo (max ${MAX_NAME_LENGTH} caracteres).`);
  }

  if (payload.start_date !== undefined && payload.start_date && !isValidISODate(payload.start_date)) {
    throw new Error('Data de inicio do projeto com formato invalido (esperado AAAA-MM-DD).');
  }
  if (payload.end_date !== undefined && payload.end_date && !isValidISODate(payload.end_date)) {
    throw new Error('Data final do projeto com formato invalido (esperado AAAA-MM-DD).');
  }

  if (payload.start_date && payload.end_date && payload.start_date > payload.end_date) {
    throw new Error('A data de inicio do projeto nao pode ser posterior a data final.');
  }

  if (payload.transformations_achievements !== undefined &&
      (payload.transformations_achievements || '').length > MAX_TRANSFORMATIONS_LENGTH) {
    throw new Error('A descricao das transformacoes e muito longa.');
  }
}
```

2. Alterar `updateProject` para usar `Partial<ProjectPayload>`:

```typescript
export async function updateProject(projectId: string, payload: Partial<ProjectPayload>): Promise<ProjectRow> {
  validateProjectId(projectId);
  validatePartialPayload(payload);
  const stakeholder = Array.isArray(payload.stakeholder_matrix)
    ? payload.stakeholder_matrix.slice(0, MAX_STAKEHOLDER_ROWS)
    : undefined;
  const successEvidence = Array.isArray(payload.success_evidence)
    ? payload.success_evidence.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : undefined;
  return projectsApi.updateProject(projectId, {
    ...payload,
    ...(stakeholder !== undefined ? { stakeholder_matrix: stakeholder } : {}),
    ...(successEvidence !== undefined ? { success_evidence: successEvidence } : {}),
  });
}
```

---

### 1.3 — Fix: Edicao inline envia payload completo em vez de parcial

**Arquivo:** `components/ProjectDocument.tsx`
**Linhas:** 156-194 (funcao `handleProgramChange`)

**Problema:**
Cada mudanca de campo reconstroi o `ProjectPayload` inteiro (linhas 161-169) e envia TODOS
os campos para a API, mesmo mudando so 1. Alem de desperdicio de banda, pode causar
race conditions se dois campos estao sendo editados quase simultaneamente (o segundo
sobrescreve o primeiro com valores antigos).

**Solucao:**
Reescrever `handleProgramChange` para enviar apenas o campo alterado:

```typescript
const handleProgramChange = useCallback(
  (field: keyof ProjectPayload, value: string | string[] | { name: string; activity: string }[] | null) => {
    if (readonly) return;
    if (!selectedProgram?.data.project) return;
    const p = selectedProgram.data.project;

    // Construir payload PARCIAL - so o campo que mudou
    const partial: Partial<ProjectPayload> = {};
    if (field === 'success_evidence' && Array.isArray(value)) {
      partial.success_evidence = value as string[];
    } else if (field === 'stakeholder_matrix' && Array.isArray(value)) {
      partial.stakeholder_matrix = value as { name: string; activity: string }[];
    } else if (typeof value === 'string') {
      (partial as Record<string, unknown>)[field] = value || null;
    }

    // Salvar com debounce - enviar so o campo alterado
    scheduleSave(`program-${p.id}`, async () => {
      await updateProject(p.id, partial);
    });

    // Atualizar state local otimisticamente (mesmo codigo de antes)
    setTree(prev =>
      prev.map(n => {
        if (n.data.rawId !== p.id) return n;
        const proj = n.data.project!;
        const updated = { ...proj };
        if (field === 'success_evidence' && Array.isArray(value)) updated.success_evidence = value as string[];
        else if (field === 'stakeholder_matrix' && Array.isArray(value))
          updated.stakeholder_matrix = value as { name: string; activity: string }[];
        else if (typeof value === 'string') (updated as Record<string, unknown>)[field] = value || null;
        return { ...n, data: { ...n.data, project: updated } };
      }),
    );
  },
  [readonly, selectedProgram, scheduleSave],
);
```

**Nota:** Remover `selectedOrganizationId` da dependency array pois nao e mais necessario.

---

### 1.4 — Fix: Validacao inconsistente entre client e server

**Arquivo:** `api/projects.ts`

**Problema:**
O client (`lib/projects.ts:81`) valida `transformations_achievements.length > 10000` mas
o server nao tem essa validacao. Se alguem enviar direto para a API, passa sem limite.

**Solucao:**
Adicionar no handler POST (apos linha 116) e no handler PATCH (apos linha 196):

```typescript
// Adicionar no POST handler (apos a validacao de success_evidence):
if (body?.transformations_achievements && String(body.transformations_achievements).length > 10000) {
  jsonError(res, 'Descricao das transformacoes muito longa (max 10.000 caracteres)', { status: 400 });
  return;
}

// Adicionar no PATCH handler (apos a validacao de datas):
if (body?.transformations_achievements !== undefined && body.transformations_achievements &&
    String(body.transformations_achievements).length > 10000) {
  jsonError(res, 'Descricao das transformacoes muito longa (max 10.000 caracteres)', { status: 400 });
  return;
}
```

---

## FASE 2: Otimizacao de Performance

### 2.1 — Eliminar `loadTree()` do `scheduleSave` (MAIOR GANHO)

**Arquivo:** `components/ProjectDocument.tsx`
**Linhas:** 133-152

**Problema:**
Apos CADA edicao inline (debounced 600ms), `scheduleSave` chama `await loadTree()` que
faz 3+ requests HTTP para recarregar TODA a arvore: projetos → entregas → atividades → tarefas.
A atualizacao otimista local (que ja acontece em `handleProgramChange`, `handleDeliveryChange`,
`handleActivityChange`, `handleTaskChange`) ja mantem o UI sincronizado.

**Solucao:**
Mover `loadTree()` para o `catch` block (revert em caso de erro):

```typescript
const scheduleSave = useCallback(
  (key: string, fn: () => Promise<void>) => {
    if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);
    debounceRefs.current[key] = setTimeout(async () => {
      delete debounceRefs.current[key];
      if (!mountedRef.current) return;
      setSaving(true);
      try {
        await fn();
        if (mountedRef.current) toast('Salvo.', 'success');
        // NAO recarregar arvore - a atualizacao otimista ja esta aplicada
      } catch (err) {
        if (mountedRef.current) {
          toast(err instanceof Error ? err.message : 'Erro ao salvar.', 'error');
          await loadTree(); // Reverter estado otimista em caso de erro
        }
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    }, DEBOUNCE_MS);
  },
  [loadTree, toast],
);
```

**Impacto:** Elimina 3+ requests HTTP por edicao. Em uma sessao com 10 edicoes rapidas,
economiza ~30 requests.

---

### 2.2 — Usar resposta da API para atualizar state local no ProjectWorkbench

**Arquivo:** `components/ProjectWorkbench.tsx`
**Linhas:** 540-552 (funcao `saveProgram`)

**Problema:**
Apos `createProject` ou `updateProject`, chama `await loadProjects()` (linha 543) que
re-busca TODOS os projetos do servidor. A variavel `saved` ja contem o row atualizado.

**Solucao:**

```typescript
const saveProgram = useCallback(async () => {
  // ... validacao existente (linhas 507-524) ...

  const payload: ProjectPayload = { /* ... mesmo de antes ... */ };

  setSaving(true);
  try {
    const saved = editingId
      ? await updateProject(editingId, payload)
      : await createProject(effectiveUserId, payload);

    // Atualizar state local diretamente com a resposta da API
    if (editingId) {
      setProjects(prev => prev.map(p => p.id === saved.id ? saved : p));
    } else {
      setProjects(prev => [...prev, saved]);
    }

    setSelectedProgramId(saved.id);
    toast(editingId ? 'Projeto atualizado.' : 'Projeto criado.', 'success');
    closeModal();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Erro ao salvar projeto.', 'error');
  } finally {
    setSaving(false);
  }
}, [/* dependencias existentes */]);
```

---

### 2.3 — Paralelizar queries em `getInitiativeById`

**Arquivo:** `src/DB/repositories/initiatives.ts`
**Linhas:** 17-27

**Problema:**
4 queries sequenciais: initiative → team → milestones → participants.
Team, milestones e participants sao independentes entre si.

**Solucao:**

```typescript
export async function getInitiativeById(id: string) {
  const [row] = await db.select().from(initiatives)
    .where(eq(initiatives.id, id as any)).limit(1);
  if (!row) return undefined;

  // Queries independentes em paralelo
  const [team, milestones, participants] = await Promise.all([
    db.select().from(initiativeTeam)
      .where(eq(initiativeTeam.initiativeId, row.id as any)),
    db.select().from(initiativeMilestones)
      .where(eq(initiativeMilestones.initiativeId, row.id as any))
      .orderBy(initiativeMilestones.sortOrder),
    db.select().from(initiativeParticipants)
      .where(eq(initiativeParticipants.initiativeId, row.id as any)),
  ]);

  return { ...row, team, milestones, participants };
}
```

**Impacto:** Reduz de ~4 round-trips sequenciais para ~2 (1 initiative + 3 paralelos).

---

### 2.4 — Batch loading de evidence files (eliminar N+1)

**Arquivo:** `src/DB/repositories/evidence.ts`
**Linhas:** 5-12

**Problema:**
`listEvidenceByMilestone()` carrega evidence rows e depois faz uma query individual
para files de cada evidence (N+1 pattern).

**Solucao:**

```typescript
import { eq, inArray } from 'drizzle-orm';

export async function listEvidenceByMilestone(milestoneId: string) {
  const evidenceRows = await db.select().from(evidence)
    .where(eq(evidence.milestoneId, milestoneId as any));

  if (evidenceRows.length === 0) return [];

  // Buscar TODOS os files de uma vez
  const evidenceIds = evidenceRows.map(e => e.id);
  const allFiles = await db.select().from(evidenceFiles)
    .where(inArray(evidenceFiles.evidenceId, evidenceIds));

  // Agrupar em memoria
  const filesByEvidence = allFiles.reduce((acc, f) => {
    const eid = f.evidenceId as string;
    if (!acc[eid]) acc[eid] = [];
    acc[eid].push(f);
    return acc;
  }, {} as Record<string, typeof allFiles>);

  return evidenceRows.map(e => ({
    ...e,
    files: filesByEvidence[e.id as string] || [],
  }));
}
```

**Impacto:** Reduz de N+1 queries para 2 queries fixas.

---

## FASE 3: Qualidade de Codigo

### 3.1 — Deduplicar `addDaysIso`

**Duplicado em:**
- `components/ProjectWorkbench.tsx:75-85`
- `components/ProjectDocument.tsx:16-26`

**Solucao:**
Criar ou adicionar em `lib/dateHelpers.ts`:

```typescript
export function addDaysIso(iso: string, days: number): string {
  try {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const dt = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return '';
    dt.setDate(dt.getDate() + (Number.isFinite(days) ? days : 0));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}
```

Importar nos dois componentes: `import { addDaysIso } from '../lib/dateHelpers';`
Remover as definicoes locais.

---

### 3.2 — Deduplicar `formatDateBR`

**Duplicado em:**
- `components/ProjectWorkbench.tsx:87-97`
- `lib/eapTree.ts:32-46`

**Nota:** `lib/dateFormatters.ts` ja exporta `formatDateBR` com logica identica.

**Solucao:**
- Em `ProjectWorkbench.tsx`: Remover definicao local, adicionar `import { formatDateBR } from '../lib/dateFormatters';`
- Em `lib/eapTree.ts`: Remover definicao local, adicionar `import { formatDateBR } from './dateFormatters';`

---

### 3.3 — Remover `as any` no repositorio de projetos

**Arquivo:** `src/DB/repositories/projects.ts`

**Casts a remover:**
- Linha 43: `(data.success_evidence ?? []) as any` → `(data.success_evidence ?? []) as string[]`
- Linha 46: `(data.stakeholder_matrix ?? []) as any` → tipo adequado
- Linha 66: `eq(projects.id, id as any)` → testar `eq(projects.id, id)` (Drizzle uuid aceita string)
- Linha 71: `eq(projects.id, id as any)` → mesmo fix

**Teste:** Compilar com `npx tsc --noEmit` apos cada mudanca para verificar compatibilidade.

---

## Ordem de Implementacao

```
Fase 1 (bugs criticos - fazer primeiro):
  1.1 → Fix loadTree dependency
  1.2 → Partial validation para updateProject
  1.3 → handleProgramChange parcial
  1.4 → Validacao server-side

Fase 2 (performance - fazer segundo):
  2.1 → Remover loadTree do scheduleSave
  2.2 → State local no saveProgram
  2.3 → Promise.all em getInitiativeById
  2.4 → Batch evidence files

Fase 3 (codigo - fazer por ultimo):
  3.1 → Dedup addDaysIso
  3.2 → Dedup formatDateBR
  3.3 → Remover as any
```

---

## Verificacao

1. **Edicao inline (ProjectDocument):** Editar campo → confirmar que NAO recarrega toda a arvore
   - DevTools Network: nenhuma chamada a `/api/projects` apos save inline
   - Apenas 1 request PATCH com o campo alterado

2. **Troca de projeto:** Clicar em outro projeto → confirmar que NAO recarrega arvore
   - DevTools Network: sem requests extras

3. **Edicao via modal (ProjectWorkbench):** Salvar → lista NAO pisca (sem reload completo)
   - Apenas 1 request PATCH, estado local atualizado com resposta

4. **Criacao de projeto:** Criar novo → aparece na lista sem reload

5. **Validacao:** Nome vazio, data invalida, transformations > 10000 chars → erros adequados
   - Testar tanto via modal quanto via API direta (curl/Postman)

6. **Regressao:** Verificar que edicao de entregas, atividades e tarefas continuam funcionando
