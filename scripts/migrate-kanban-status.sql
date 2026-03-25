-- Normalização de kanban_status em initiative_tasks
-- Converte os valores Title Case para lowercase (igual a activities.status)
-- 'A Fazer'   → 'a fazer'
-- 'Andamento' → 'em andamento'
-- 'Pausado'   → 'pausada'
-- 'Concluído' → 'concluída'

UPDATE initiative_tasks SET kanban_status = 'a fazer'      WHERE kanban_status = 'A Fazer';
UPDATE initiative_tasks SET kanban_status = 'em andamento' WHERE kanban_status = 'Andamento';
UPDATE initiative_tasks SET kanban_status = 'pausada'      WHERE kanban_status = 'Pausado';
UPDATE initiative_tasks SET kanban_status = 'concluída'    WHERE kanban_status = 'Concluído'
