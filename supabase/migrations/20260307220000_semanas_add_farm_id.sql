-- Migration: vincular semanas e historico_semanas a uma fazenda (farm_id)
-- Antes dessa migration as tabelas eram globais — todos os usuários compartilhavam os mesmos dados.
-- Agora cada semana/histórico pertence a uma fazenda específica, com RLS equivalente a people.

-- ─── Colunas ──────────────────────────────────────────────────────────────────

ALTER TABLE public.semanas
  ADD COLUMN IF NOT EXISTS farm_id TEXT REFERENCES public.farms(id) ON DELETE CASCADE;

ALTER TABLE public.historico_semanas
  ADD COLUMN IF NOT EXISTS farm_id TEXT REFERENCES public.farms(id) ON DELETE CASCADE;

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_semanas_farm_id ON public.semanas(farm_id);
CREATE INDEX IF NOT EXISTS idx_historico_semanas_farm_id ON public.historico_semanas(farm_id);

-- ─── RLS: semanas ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated full access on semanas" ON public.semanas;

CREATE POLICY "Semanas select by farm"
  ON public.semanas FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = semanas.farm_id AND af.analyst_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.farms f
      JOIN public.user_profiles up ON up.client_id = f.client_id
      WHERE f.id = semanas.farm_id AND f.client_id IS NOT NULL AND up.id = auth.uid()
    )
  );

CREATE POLICY "Semanas insert by farm"
  ON public.semanas FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = semanas.farm_id AND af.analyst_id = auth.uid()
    )
  );

CREATE POLICY "Semanas update by farm"
  ON public.semanas FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = semanas.farm_id AND af.analyst_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.farms f
      JOIN public.user_profiles up ON up.client_id = f.client_id
      WHERE f.id = semanas.farm_id AND f.client_id IS NOT NULL AND up.id = auth.uid()
    )
  );

CREATE POLICY "Semanas delete by farm"
  ON public.semanas FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = semanas.farm_id AND af.analyst_id = auth.uid()
    )
  );

-- ─── RLS: historico_semanas ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated full access on historico_semanas" ON public.historico_semanas;

CREATE POLICY "Historico semanas select by farm"
  ON public.historico_semanas FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = historico_semanas.farm_id AND af.analyst_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.farms f
      JOIN public.user_profiles up ON up.client_id = f.client_id
      WHERE f.id = historico_semanas.farm_id AND f.client_id IS NOT NULL AND up.id = auth.uid()
    )
  );

CREATE POLICY "Historico semanas insert by farm"
  ON public.historico_semanas FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = historico_semanas.farm_id AND af.analyst_id = auth.uid()
    )
  );

CREATE POLICY "Historico semanas update by farm"
  ON public.historico_semanas FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = historico_semanas.farm_id AND af.analyst_id = auth.uid()
    )
  );

CREATE POLICY "Historico semanas delete by farm"
  ON public.historico_semanas FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR farm_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.analyst_farms af
      WHERE af.farm_id = historico_semanas.farm_id AND af.analyst_id = auth.uid()
    )
  );

COMMENT ON COLUMN public.semanas.farm_id IS 'Fazenda à qual esta semana pertence. NULL = dados legados pré-migration.';
COMMENT ON COLUMN public.historico_semanas.farm_id IS 'Fazenda à qual este histórico pertence. NULL = dados legados pré-migration.';
