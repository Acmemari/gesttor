# Etapa 2 — Frontend: Remover Kanban e Criar Modal de Nova Tarefa

## Objetivo
Remover completamente a visualização Kanban e o formulário inline. Substituir por um botão "+ Nova Tarefa" que abre um modal flutuante para criação/edição de tarefas.

## Pré-requisito
Etapa 1 (Backend) concluída e migration aplicada.

---

## O QUE FAZER

### 2.1 Remover Código Kanban — `agents/GestaoSemanal.tsx`

**Imports a remover:**
```ts
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

**Componentes a remover:**
- Função `KanbanCardItem` (aprox. linhas 203-250)
- Função `KanbanColumnContainer` (componente de coluna do Kanban)
- Todo o conteúdo dentro do `{/* 6b. KANBAN */}` (linhas 1659-1698)
- Todo o modal `{/* 6c. KANBAN ADD MODAL */}` (linhas 1700-1794)

**Constantes a remover:**
- `KANBAN_COLUMN_LABELS`
- `KANBAN_COLUMN_COLORS`

**Estado a remover:**
- `viewMode` e `setViewMode` — não há mais toggle
- `kanbanAddStatus` e `setKanbanAddStatus`
- `kanbanForm` e `setKanbanForm`
- `activeDragTask` e `setActiveDragTask`

**Handlers a remover:**
- `handleDragStart`
- `handleDragEnd`
- `handleKanbanSave`

**Referências a remover:**
- `sensors` (useSensor, useSensors)
- `localStorage.setItem('gestao-view-mode', viewMode)` e `localStorage.getItem`
- Toggle de visualização no header (botões "Lista" / "Kanban") — linhas 1151-1167

**Condições a simplificar:**
- Remover `viewMode === 'lista' &&` antes do bloco da lista (sempre será lista)
- Remover `viewMode !== 'kanban' &&` antes do formulário
- O bloco `<DndContext>` inteiro é removido

### 2.2 Remover Formulário Inline

- Remover todo o bloco `{/* 5. FORM */}` (linhas 1303-1399) — o formulário que aparece acima da lista
- Remover o `formRef` (useRef para scroll ao formulário)
- Manter os estados `newForm`, `setNewForm`, `editingId`, `setEditingId` — serão reutilizados pelo modal

### 2.3 Adicionar Botão "+ Nova Tarefa" no Header

- Posicionar no lado direito do header, junto aos outros botões (onde ficavam os botões de visualização)
- Estilo: botão azul (`#3B82F6`), texto branco, borderRadius 8, ícone "+" antes do texto
- Texto: "+ Nova Tarefa"
- Visível apenas quando `canEditInWeek === true` e `sourceTab === 'semana'`
- onClick: abrir o modal (setar um estado `showTaskModal: true`)

### 2.4 Criar Modal Flutuante de Tarefa

**Estrutura do modal:**
- Backdrop escuro (rgba(15,23,42,0.4)) com click para fechar
- Card branco centralizado, borderRadius 16, padding 24, maxWidth ~700px
- Título: "Nova atividade" ou "Editando atividade" conforme `editingId`
- Botão X no canto superior direito para fechar

**Campos em layout horizontal (flex, wrap):**
1. **TÍTULO** — input text, placeholder "Título", flex: 1 1 160px (obrigatório)
2. **DESCRIÇÃO** — input text, placeholder "Descrição breve", flex: 2 1 220px
3. **RESPONSÁVEL** — select com `pessoas`, flex: 0 1 140px
   - Default: primeiro da lista ou o usuário logado
4. **DATA TÉRMINO** — componente `DateInputBR`, flex: 0 1 140px
   - Default: data de hoje ao criar nova tarefa
5. **#** — input text, placeholder "#tag", valor default "#planejamento", flex: 0 1 140px

**Labels:** uppercase, fontSize 11, fontWeight 700, color '#94A3B8', letterSpacing '0.5px'

**Botões no rodapé do modal:**
- "Cancelar" (cinza, borda) — fecha modal e reseta form
- "Adicionar" / "Salvar" (azul #3B82F6) — chama `handleSave` existente, depois fecha modal

**Reusar lógica existente:**
- `handleSave` já faz create/update, só precisa fechar o modal após sucesso
- `handleEditStart` precisa ser ajustado para abrir o modal ao invés de scrollar ao form
- `handleEditCancel` precisa fechar o modal

### 2.5 Ajustar Edição via Click na Linha

- Ao clicar em uma tarefa na lista, ao invés de scrollar ao formulário inline, abrir o modal preenchido
- Modificar `handleEditStart` para: setar `newForm` com dados da tarefa + setar `editingId` + abrir modal (`showTaskModal = true`)
- Remover `formRef.current?.scrollIntoView()`

---

## O QUE NÃO FAZER

- **NÃO** alterar a lógica de `handleSave` (create/update) — apenas encapsular com abertura/fechamento do modal
- **NÃO** alterar a API ou o backend nesta etapa
- **NÃO** alterar os headers da lista (TÍTULO, DESCRIÇÃO, RESPONSÁVEL, etc.) — isso será feito na Etapa 3
- **NÃO** alterar os filtros ou a ordenação
- **NÃO** remover o bloco da lista (seção 6) — continua exatamente como está
- **NÃO** alterar as stats (Total, A fazer, etc.)
- **NÃO** alterar o histórico
- **NÃO** alterar o carry-over modal
- **NÃO** alterar o Project Task Edit Modal
- **NÃO** alterar a aba "Projetos" — ela continua funcionando independente
- **NÃO** alterar o drawer de source (Semana/Projetos)
- **NÃO** remover a funcionalidade de excluir (botão ✕ na linha)
- **NÃO** remover a funcionalidade de checkbox (toggle concluída)
- **NÃO** alterar as permissões (`canEditInWeek`, `canFecharSemana`, etc.)
- **NÃO** criar nenhum arquivo novo — toda alteração é no `GestaoSemanal.tsx`
- **NÃO** mover a lógica para componentes separados (manter no mesmo arquivo por ora)
- **NÃO** alterar estilos dos botões de header existentes (Ano/Safra, Semana/Projetos, Histórico, etc.)

---

## Arquivos Alterados

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| `agents/GestaoSemanal.tsx` | Remover Kanban + form inline, adicionar botão e modal |

## Validação

1. Tela carrega sem erros — lista aparece diretamente sem toggle
2. Botão "+ Nova Tarefa" aparece no header quando semana aberta
3. Clicar no botão abre modal com campos vazios (responsável e data preenchidos com defaults)
4. Preencher e salvar cria tarefa na lista
5. Clicar em tarefa existente abre modal preenchido para edição
6. Salvar edição atualiza a tarefa na lista
7. Cancelar/fechar modal não altera dados
8. Checkbox de concluída continua funcionando
9. Excluir (✕) continua funcionando
10. Filtros e ordenação continuam funcionando
11. Fechar/Abrir semana continua funcionando
12. Carry-over continua funcionando
13. Nenhum erro no console relacionado a @dnd-kit
