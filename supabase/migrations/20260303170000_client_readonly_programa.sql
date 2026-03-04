-- Migration: Acesso readonly de cliente ao Programa de Trabalho vinculado à sua organização.
-- Clientes podem ler projects/deliveries/initiatives/milestones/tasks da própria organização.
-- Nenhuma policy de INSERT/UPDATE/DELETE é criada para cliente nessas tabelas.

-- ─── projects ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Clientes podem ver programas da sua organizacao" ON public.projects;
CREATE POLICY "Clientes podem ver programas da sua organizacao"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT up.client_id
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.client_id IS NOT NULL
        AND up.qualification = 'cliente'
    )
  );

-- ─── deliveries ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Clientes podem ver entregas da sua organizacao" ON public.deliveries;
CREATE POLICY "Clientes podem ver entregas da sua organizacao"
  ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT up.client_id
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.client_id IS NOT NULL
        AND up.qualification = 'cliente'
    )
  );

-- ─── initiatives ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Clientes podem ver atividades da sua organizacao" ON public.initiatives;
CREATE POLICY "Clientes podem ver atividades da sua organizacao"
  ON public.initiatives
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT up.client_id
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.client_id IS NOT NULL
        AND up.qualification = 'cliente'
    )
  );

-- ─── initiative_milestones ───────────────────────────────────────────────────
-- A tabela não tem client_id próprio; acesso via vínculo com initiatives.
DROP POLICY IF EXISTS "Clientes podem ver marcos da sua organizacao" ON public.initiative_milestones;
CREATE POLICY "Clientes podem ver marcos da sua organizacao"
  ON public.initiative_milestones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.initiatives i
      JOIN public.user_profiles up ON up.id = auth.uid()
      WHERE i.id = initiative_milestones.initiative_id
        AND i.client_id = up.client_id
        AND up.client_id IS NOT NULL
        AND up.qualification = 'cliente'
    )
  );

-- ─── initiative_tasks ────────────────────────────────────────────────────────
-- Acesso via initiative_milestones -> initiatives.
DROP POLICY IF EXISTS "Clientes podem ver tarefas da sua organizacao" ON public.initiative_tasks;
CREATE POLICY "Clientes podem ver tarefas da sua organizacao"
  ON public.initiative_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.initiative_milestones im
      JOIN public.initiatives i ON i.id = im.initiative_id
      JOIN public.user_profiles up ON up.id = auth.uid()
      WHERE im.id = initiative_tasks.milestone_id
        AND i.client_id = up.client_id
        AND up.client_id IS NOT NULL
        AND up.qualification = 'cliente'
    )
  );
