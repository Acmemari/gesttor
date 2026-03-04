-- Migration: compartilhamento do Cadastro de Pessoas por fazenda/organização.
-- Antes dessa migration, people usava apenas created_by (owner-only).
-- Agora qualquer analista que tenha acesso à fazenda (via analyst_farms),
-- ou cliente vinculado à organização (via user_profiles.client_id), pode ler os registros.
-- Admin continua vendo tudo.
-- INSERT/UPDATE/DELETE: quem for analista/admin da fazenda pode modificar.

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- ─── SELECT ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "People select own or admin" ON public.people;
DROP POLICY IF EXISTS "People select by farm analysts or clients" ON public.people;

CREATE POLICY "People select by farm analysts or clients"
  ON public.people
  FOR SELECT
  TO authenticated
  USING (
    -- Admin vê tudo
    public.is_admin()
    -- Dono (criador) sempre vê
    OR created_by = auth.uid()
    -- Analista com acesso à fazenda (via analyst_farms)
    OR (
      farm_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.analyst_farms af
        WHERE af.farm_id = people.farm_id
          AND af.analyst_id = auth.uid()
      )
    )
    -- Cliente vinculado à organização que tem essa fazenda
    OR (
      farm_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.farms f
        JOIN public.user_profiles up ON up.client_id = f.client_id
        WHERE f.id = people.farm_id
          AND f.client_id IS NOT NULL
          AND up.id = auth.uid()
          AND up.qualification = 'cliente'
      )
    )
  );

-- ─── INSERT ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "People insert own" ON public.people;
DROP POLICY IF EXISTS "People insert analysts or admin" ON public.people;

CREATE POLICY "People insert analysts or admin"
  ON public.people
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR created_by = auth.uid()
    OR (
      farm_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.analyst_farms af
        WHERE af.farm_id = people.farm_id
          AND af.analyst_id = auth.uid()
      )
    )
  );

-- ─── UPDATE ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "People update own" ON public.people;
DROP POLICY IF EXISTS "People update analysts or admin" ON public.people;

CREATE POLICY "People update analysts or admin"
  ON public.people
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR created_by = auth.uid()
    OR (
      farm_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.analyst_farms af
        WHERE af.farm_id = people.farm_id
          AND af.analyst_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR created_by = auth.uid()
    OR (
      farm_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.analyst_farms af
        WHERE af.farm_id = people.farm_id
          AND af.analyst_id = auth.uid()
      )
    )
  );

-- ─── DELETE ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "People delete own" ON public.people;
DROP POLICY IF EXISTS "People delete analysts or admin" ON public.people;

CREATE POLICY "People delete analysts or admin"
  ON public.people
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR created_by = auth.uid()
    OR (
      farm_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.analyst_farms af
        WHERE af.farm_id = people.farm_id
          AND af.analyst_id = auth.uid()
      )
    )
  );
