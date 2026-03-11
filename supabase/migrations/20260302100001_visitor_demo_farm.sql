-- ============================================================
-- MIGRATION: Visitor Demo Farm
-- Creates a fixed demo farm under the visitor demo client.
-- Completes the hierarchy: Analyst → Client → Farm for visitors.
-- IDs must match HierarchyContext: VISITOR_FARM_ID, VISITOR_CLIENT_ID.
-- ============================================================

-- 0. Precondition: verify client from migration 024 exists; fail loudly if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = '00000000-0000-0000-0000-000000000002'::uuid) THEN
    RAISE EXCEPTION 'Migration 025 requires client_id 00000000-0000-0000-0000-000000000002 from 20260302100000_visitor_demo_context.sql. Run that migration first.';
  END IF;
END $$;

-- 1. Insert the demo farm with a fixed ID (farms.id is TEXT)
INSERT INTO public.farms (
  id,
  name,
  country,
  state,
  city,
  client_id,
  property_type,
  weight_metric,
  production_system,
  total_area,
  pasture_area,
  average_herd,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Fazenda Demo',
  'Brasil',
  'PR',
  'Maringá',
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Própria',
  'Arroba (@)',
  'Ciclo Completo',
  500,
  350,
  800,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
