-- Migration: add pode_apagar_semana flag for deleting weeks from history
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS pode_apagar_semana boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.people.pode_apagar_semana IS 'Se true, usuário com mesmo email pode excluir semanas do histórico (apenas da última para a primeira).';
