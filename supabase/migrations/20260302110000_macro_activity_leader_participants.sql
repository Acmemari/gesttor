-- =============================================================================
-- Migration: Macro Activity - internal_leader + initiative_participants
-- =============================================================================
-- Adds:
-- 1) initiatives.internal_leader (TEXT) - Lider Interno
-- 2) initiative_participants table - Incluir Participantes (multi-select)
-- =============================================================================

-- 1) Add internal_leader to initiatives (same pattern as leader)
ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS internal_leader TEXT;

COMMENT ON COLUMN public.initiatives.internal_leader IS 'Lider interno da atividade (nome da pessoa, excl. Co-Gestor/Consultor/Analista).';

-- 2) Create initiative_participants table
CREATE TABLE IF NOT EXISTS public.initiative_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  UNIQUE(initiative_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_initiative_participants_initiative_id
  ON public.initiative_participants(initiative_id);
CREATE INDEX IF NOT EXISTS idx_initiative_participants_person_id
  ON public.initiative_participants(person_id);

COMMENT ON TABLE public.initiative_participants IS 'Participantes vinculados à iniciativa (Macro Atividade).';

ALTER TABLE public.initiative_participants ENABLE ROW LEVEL SECURITY;

-- RLS: same access rules as initiatives (initiative owner or admin)
DROP POLICY IF EXISTS "initiative_participants_select" ON public.initiative_participants;
CREATE POLICY "initiative_participants_select"
  ON public.initiative_participants FOR SELECT
  USING (
    current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.initiatives i
      WHERE i.id = initiative_participants.initiative_id
        AND (
          i.created_by = auth.uid()
          AND (
            i.farm_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.analyst_farms af
              WHERE af.analyst_id = auth.uid()
                AND af.farm_id = i.farm_id
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "initiative_participants_insert" ON public.initiative_participants;
CREATE POLICY "initiative_participants_insert"
  ON public.initiative_participants FOR INSERT
  WITH CHECK (
    current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.initiatives i
      WHERE i.id = initiative_participants.initiative_id
        AND (
          i.created_by = auth.uid()
          AND (
            i.farm_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.analyst_farms af
              WHERE af.analyst_id = auth.uid()
                AND af.farm_id = i.farm_id
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "initiative_participants_delete" ON public.initiative_participants;
CREATE POLICY "initiative_participants_delete"
  ON public.initiative_participants FOR DELETE
  USING (
    current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.initiatives i
      WHERE i.id = initiative_participants.initiative_id
        AND (
          i.created_by = auth.uid()
          AND (
            i.farm_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.analyst_farms af
              WHERE af.analyst_id = auth.uid()
                AND af.farm_id = i.farm_id
            )
          )
        )
    )
  );
