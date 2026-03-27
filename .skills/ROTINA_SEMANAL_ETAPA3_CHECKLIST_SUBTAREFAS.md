# Etapa 3 — Frontend: Checklist com Subtarefas

## Objetivo
Transformar a lista de atividades em um checklist visual com tarefas e subtarefas aninhadas, conforme o design das imagens de referência. Cada tarefa pode ter subtarefas expandíveis, com botão "+" para adicionar.

## Pré-requisitos
- Etapa 1 (Backend com parent_id) concluída
- Etapa 2 (Kanban removido + modal criado) concluída

---

## O QUE FAZER

### 3.1 Atualizar Interface Atividade — `agents/GestaoSemanal.tsx`

Adicionar campo na interface:
```ts
interface Atividade {
  // ... campos existentes ...
  parent_id: string | null;  // NOVO
}
```

### 3.2 Criar Lógica de Agrupamento

Adicionar `useMemo` para organizar tarefas hierarquicamente:

```ts
const { parentTasks, subtasksMap } = useMemo(() => {
  const parents = atividades.filter(a => !a.parent_id);
  const subs = new Map<string, Atividade[]>();
  for (const a of atividades) {
    if (a.parent_id) {
      const list = subs.get(a.parent_id) || [];
      list.push(a);
      subs.set(a.parent_id, list);
    }
  }
  return { parentTasks: parents, subtasksMap: subs };
}, [atividades]);
```

- Aplicar filtros e ordenação existentes sobre `parentTasks` (não sobre subtarefas diretamente)
- Subtarefas são exibidas sob sua tarefa pai, sem filtragem independente

### 3.3 Estado de Expansão

- Adicionar estado: `const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())`
- Tarefas com subtarefas: expandidas por padrão ao carregar
- Toggle: clicar no chevron alterna expansão
- Tarefas sem subtarefas: não mostram chevron

### 3.4 Estado de Formulário de Subtarefa

- Adicionar estado: `const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null)`
- Quando `addingSubtaskFor === tarefa.id`, exibir form inline sob a tarefa pai
- Adicionar estado: `const [subtaskForm, setSubtaskForm] = useState({ titulo: '', pessoaId: '', dataTermino: '' })`

### 3.5 Redesenhar Layout da Lista — Estilo Checklist

**Remover colunas do grid antigo.** Substituir `GRID_COLS` por um layout mais simples.

**Layout da Tarefa Pai (card):**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ○ Título da Tarefa    1/2        📅 09 de abr    👤 João Silva  + ▼ │
│   ✓ Subtarefa concluída          📅 24/03/26     👤 João Silva      │
│   ○ Subtarefa pendente           📅 25/03/26     👤 João Silva      │
│   [+ Adicionar subtarefa...]                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Cada tarefa pai é um card com:**
- Borda arredondada (`borderRadius: 12`, `border: 1px solid #E2E8F0`)
- Background branco
- Padding interno
- Margem inferior entre cards (`marginBottom: 8-12`)

**Linha da tarefa pai:**
- Checkbox circular (18x18, borda `#CBD5E1`, fundo verde `#059669` quando concluída)
- Título em negrito (fontSize 14, fontWeight 600, color '#1E293B')
- Badge com contador de subtarefas: "1/2" (concluídas/total) — fontSize 12, color '#94A3B8', background '#F1F5F9', borderRadius 4, padding '1px 6px'
  - Só aparece se a tarefa tiver subtarefas
- Data de término (fontSize 12, color '#64748B', ícone relógio)
- Nome do responsável (fontSize 12, color '#475569')
- Botão "+" para adicionar subtarefa (fontSize 14, color '#94A3B8', hover '#3B82F6')
  - Visível ao hover OU sempre quando tarefa expandida
  - onClick: `setAddingSubtaskFor(tarefa.id)` + expandir tarefa
- Botão chevron "▼" / "▶" para expandir/colapsar
  - Só aparece se a tarefa tem subtarefas
  - Rotação com transição CSS (`transform: rotate(0)` → `rotate(-90deg)`)
- Toda a linha é clicável para editar (abre modal da Etapa 2)
- Botão ✕ de exclusão aparece no hover (manter lógica existente de confirmação)

**Linha da subtarefa (indentada):**
- Padding-left: 40px (indentação sob o pai)
- Checkbox circular (16x16)
  - Quando concluída: fundo verde, ícone ✓, texto com line-through e cor `#94A3B8`
  - Quando pendente: borda `#CBD5E1`, sem preenchimento
- Título (fontSize 13, fontWeight 400)
- Data de término à direita (fontSize 11, color '#94A3B8')
- Responsável à direita (fontSize 11, color '#475569')
- Botão ✕ de exclusão no hover
- Clicável para editar (abre modal com campos reduzidos — apenas título, responsável, data)
- BorderBottom: `1px solid #F1F5F9` entre subtarefas

**Tarefas sem subtarefas (itens simples):**
- Mesmo layout de card, mas sem chevron e sem badge de contador
- Botão "+" aparece apenas no hover para poder adicionar a primeira subtarefa
- São cards individuais como os que têm subtarefas

### 3.6 Formulário Inline de Subtarefa

Quando o usuário clica "+" em uma tarefa, exibir uma linha extra sob as subtarefas existentes:

```
│   [ Título da subtarefa...  ] [Responsável ▼] [dd/mm/aaaa] [Adicionar] [✕] │
```

- Input de título: flex grow, placeholder "Nova subtarefa..."
- Select de responsável: mesmo select de `pessoas`, default = responsável da tarefa pai
- DateInputBR para data de término: default = data de término da tarefa pai
- Botão "Adicionar" (azul, pequeno)
- Botão "✕" para cancelar (fecha o form inline)
- Enter no input de título também salva
- Após salvar, o form permanece aberto para adicionar outra subtarefa (limpa apenas o título)
- A subtarefa é criada via `semanasApi.createAtividade()` com `parent_id = tarefa.id`, `semana_id` da semana atual

### 3.7 Handler de Salvar Subtarefa

```ts
const handleSaveSubtask = useCallback(async (parentId: string) => {
  if (operating || !subtaskForm.titulo.trim() || !semana) return;
  setOperating(true);
  try {
    const parent = atividades.find(a => a.id === parentId);
    const pessoaId = subtaskForm.pessoaId || parent?.pessoa_id || pessoas[0]?.id;
    const res = await semanasApi.createAtividade({
      semana_id: semana.id,
      titulo: subtaskForm.titulo.trim(),
      descricao: '',
      pessoa_id: pessoaId,
      data_termino: subtaskForm.dataTermino || parent?.data_termino || null,
      tag: parent?.tag || '#planejamento',
      status: 'a fazer',
      parent_id: parentId,
    });
    if (!res.ok) { onToast?.('Erro ao adicionar subtarefa.', 'error'); return; }
    setAtividades(prev => [...prev, res.data as Atividade]);
    setSubtaskForm(prev => ({ ...prev, titulo: '' })); // mantém pessoaId e data
    // Garantir que a tarefa pai está expandida
    setExpandedTasks(prev => new Set(prev).add(parentId));
  } finally {
    setOperating(false);
  }
}, [subtaskForm, semana, pessoas, atividades, operating, onToast]);
```

### 3.8 Atualizar Filtros e Ordenação

- Filtros e ordenação (sort header) devem ser aplicados sobre `parentTasks`
- Simplificar colunas do header de filtro para: TÍTULO, RESPONSÁVEL, TÉRMINO, STATUS
- Remover colunas DESCRIÇÃO e TAG do header de filtros (esses campos ficam apenas no modal)
- Atualizar `GRID_COLS` para o novo layout
- O header de sort/filtro fica acima de todos os cards
- Alternativamente, manter header existente com colunas reduzidas

### 3.9 Atualizar Stats

- Os contadores (Total, A fazer, Em andamento, Pausada, Concluída) devem incluir **todas** as atividades (pai + subtarefas)
- O progresso (%) deve considerar todas as atividades
- Sem alteração na lógica, pois já conta `activeTasks` que inclui tudo

### 3.10 Atualizar Carry-Over

- No modal de carry-over, exibir tarefas pai com suas subtarefas pendentes agrupadas
- Ao selecionar uma tarefa pai para carry-over, incluir automaticamente suas subtarefas pendentes
- No `createAtividadesBulk`, as subtarefas devem referenciar o novo ID do pai na nova semana
- Fluxo: criar pais primeiro → obter novos IDs → criar subtarefas com novo parent_id

### 3.11 Atualizar Edição de Subtarefa

- Ao clicar em uma subtarefa, abrir o modal (da Etapa 2) com campos reduzidos:
  - TÍTULO, RESPONSÁVEL, DATA TÉRMINO (sem Descrição e sem Tag)
  - Ou exibir todos os campos mas com descrição e tag opcionais/escondidos
- Ao salvar, chamar `updateAtividade` normalmente

### 3.12 Atualizar Exclusão

- Excluir tarefa pai: confirmação com aviso de que subtarefas também serão excluídas
  - Texto do botão pode mudar para "?" (como atual) mas com tooltip "Excluir tarefa e subtarefas"
  - O cascade do banco garante a exclusão das subtarefas
  - No frontend, remover da lista: `prev.filter(a => a.id !== id && a.parent_id !== id)`
- Excluir subtarefa: comportamento normal (apenas a subtarefa)

---

## O QUE NÃO FAZER

- **NÃO** alterar a API ou o backend nesta etapa — tudo já foi preparado na Etapa 1
- **NÃO** permitir subtarefas de subtarefas (apenas 1 nível)
- **NÃO** alterar o header principal (Ano/Safra, número da semana, badge ABERTA/FECHADA)
- **NÃO** alterar as stats cards (Total, A fazer, Em andamento, Pausada, Concluída, Progresso)
- **NÃO** alterar o histórico de semanas
- **NÃO** alterar a aba Projetos — ela mantém seu próprio layout
- **NÃO** alterar o drawer de source (Semana/Projetos)
- **NÃO** alterar os botões Fechar Semana / Abrir Semana
- **NÃO** alterar as permissões
- **NÃO** remover a funcionalidade de checkbox (concluída)
- **NÃO** remover a funcionalidade de status dropdown nas tarefas pai
- **NÃO** criar arquivos novos — toda a alteração é no `GestaoSemanal.tsx`
- **NÃO** alterar `TAG_STYLES` ou `STATUS_STYLES` — continuar usando
- **NÃO** implementar drag-and-drop para reordenar tarefas/subtarefas
- **NÃO** adicionar persistência de estado de expansão (localStorage) — estado de sessão é suficiente
- **NÃO** alterar a fonte (`DM Sans`) ou a paleta de cores base
- **NÃO** quebrar a funcionalidade de tarefas existentes que não têm subtarefas (parent_id = null)

---

## Arquivos Alterados

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| `agents/GestaoSemanal.tsx` | Redesenhar lista como checklist, adicionar subtarefas |

## Validação

1. **Tarefas existentes**: todas aparecem como cards individuais (parent_id = null)
2. **Criar subtarefa**: clicar "+" na tarefa → form inline aparece → preencher → salvar → subtarefa aparece indentada
3. **Expandir/Colapsar**: chevron funciona, subtarefas aparecem/desaparecem
4. **Contador**: badge "1/2" atualiza ao marcar subtarefa como concluída
5. **Checkbox tarefa pai**: marca como concluída com line-through
6. **Checkbox subtarefa**: marca como concluída com line-through e ícone verde
7. **Editar tarefa**: clicar na tarefa → modal abre preenchido → salvar atualiza
8. **Editar subtarefa**: clicar na subtarefa → modal abre com campos reduzidos → salvar atualiza
9. **Excluir tarefa pai**: confirmação → tarefa + subtarefas removidas da lista
10. **Excluir subtarefa**: confirmação → apenas subtarefa removida, contador atualiza
11. **Filtros**: filtrar por título mostra apenas tarefas pai que correspondem (com suas subtarefas)
12. **Stats**: contadores incluem pai + subtarefas
13. **Carry-over**: ao fechar semana, tarefas pendentes com subtarefas aparecem agrupadas
14. **Sem subtarefas**: tarefas sem subtarefas exibem normalmente, "+" aparece no hover
15. **Form inline permanece**: após salvar subtarefa, form não fecha — limpa título para adicionar outra
16. **Responsável default**: form de subtarefa herda responsável da tarefa pai
17. **Data default**: form de subtarefa herda data de término da tarefa pai
