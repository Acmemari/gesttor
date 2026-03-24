# 🧠 Feature: Rotina Semanal com Visualização Lista + Kanban

## 🎯 Objetivo
Evoluir a tela de **Rotina Semanal** permitindo dois modos de visualização:
- Lista (já existente - default)
- Kanban (novo)

A funcionalidade deve permitir que o usuário **visualize e gerencie as mesmas tarefas** em diferentes formatos, sem duplicação de dados.

---

## ⚠️ Princípio Fundamental
A estrutura de dados **NÃO MUDA**.

- Mesmas tabelas
- Mesmos registros
- Mesma lógica de negócio

👉 Apenas muda a **forma de visualização (UI)**

---

## 🧩 Escopo da Funcionalidade

### 1. Alternância de Visualização

Adicionar um seletor na tela:
- Lista (default)
- Kanban

#### Requisitos:
- Persistir preferência do usuário (opcional - localStorage)
- Troca deve ser instantânea (sem reload)

---

### 2. Visualização Kanban

Utilizar a biblioteca já instalada:

👉 `@dnd-kit`

#### Estrutura do Kanban:
Colunas baseadas no status da tarefa:
- A fazer
- Em andamento
- Concluído

#### Regras:
- Drag and Drop altera status
- Alteração deve persistir no banco
- Atualizar UI em tempo real

---

### 3. Barra Lateral (Nova)

Adicionar sidebar com dois botões:

- **Semana (default)**
- **Projetos**

---

## 🔄 Lógica de Funcionamento

### 📌 Aba "Semana"
Mostra:
- Todas as tarefas criadas na rotina semanal

Fonte:
- Tabela atual de tarefas semanais

---

### 📌 Aba "Projetos"

Mostra:
- Tarefas vindas da aba **Projetos**
- Apenas tarefas que estão **dentro da semana atual**

#### Regra principal:
Se uma tarefa de projeto tem data dentro da semana:
➡️ Ela aparece na rotina semanal

---

## 🔁 Integração Semana ↔ Projetos

- Uma tarefa de projeto pode aparecer:
  - Na aba Projetos
  - Na rotina semanal (lista e kanban)

- É o **mesmo objeto**
- Não duplicar dados

---

## ✏️ Edição de Tarefas

Qualquer tarefa pode ser editada em:
- Lista
- Kanban

Reflexo:
- Atualização deve refletir em todas as visões

---

## 🧱 Estrutura de Dados (Conceito)

Não criar nova tabela.

Se necessário, adicionar campos como:

- `origin`: ("weekly" | "project")
- `project_id` (nullable)
- `due_date`
- `status`

---

## 🎨 UX Requisitos

- Interface limpa (estilo Notion / Linear)
- Kanban fluido
- Feedback visual ao arrastar
- Sem recarregamento de página

---

## ⚙️ Considerações Técnicas

- Usar `@dnd-kit/core`
- Usar `@dnd-kit/sortable`
- Evitar re-render pesado
- Garantir consistência de estado (React Query ou Zustand se necessário)

---

## 🚫 O que NÃO fazer

- Não criar duplicação de tarefas
- Não criar nova lógica paralela
- Não separar banco entre lista e kanban

---

## ✅ Critérios de Aceite

- [ ] Usuário consegue alternar entre Lista e Kanban
- [ ] Drag and drop altera status corretamente
- [ ] Tarefas de projetos aparecem na semana corretamente
- [ ] Atualizações refletem em todas as visualizações
- [ ] Performance fluida

---

## 💡 Próximos Passos (opcional)

- Filtro por responsável
- Filtro por projeto
- Cores por tipo de tarefa
- Prioridade (alta, média, baixa)
