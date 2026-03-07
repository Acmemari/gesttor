-- Migration: Add pode_alterar_semana_fechada to people
-- Usuários cujo e-mail corresponda a uma pessoa com essa flag terão controle total sobre semanas fechadas.

ALTER TABLE public.people
ADD COLUMN IF NOT EXISTS pode_alterar_semana_fechada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.people.pode_alterar_semana_fechada IS 'Se true, usuário com mesmo email terá controle total sobre semanas fechadas (incluir, editar, excluir tarefas). Apenas analistas/admin podem definir.';
