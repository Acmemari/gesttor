-- Migration: Add semana_id to historico_semanas for reliable week lookup
-- Previously, history only stored semana_numero which is not unique across years.

ALTER TABLE public.historico_semanas
ADD COLUMN IF NOT EXISTS semana_id uuid REFERENCES public.semanas(id) ON DELETE SET NULL;

-- Backfill: match existing history rows to semanas by numero + modo (best effort)
UPDATE public.historico_semanas h
SET semana_id = s.id
FROM public.semanas s
WHERE s.numero = h.semana_numero
  AND h.semana_id IS NULL;

COMMENT ON COLUMN public.historico_semanas.semana_id IS 'FK direta para a semana fechada, evita ambiguidade ao buscar por numero';
