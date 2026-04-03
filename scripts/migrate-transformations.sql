-- Migration: Move existing transformations_achievements + success_evidence
-- into the new project_transformations table.
-- Run AFTER `npx drizzle-kit push` creates the table.

-- 1. Projects with transformations_achievements text
INSERT INTO project_transformations (id, project_id, text, evidence, sort_order, created_at, updated_at)
SELECT
  gen_random_uuid(),
  p.id,
  p.transformations_achievements,
  COALESCE(p.success_evidence, '[]'::jsonb),
  0,
  NOW(),
  NOW()
FROM projects p
WHERE p.transformations_achievements IS NOT NULL
  AND TRIM(p.transformations_achievements) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM project_transformations pt WHERE pt.project_id = p.id
  );

-- 2. Projects without transformations text but with non-empty success_evidence
INSERT INTO project_transformations (id, project_id, text, evidence, sort_order, created_at, updated_at)
SELECT
  gen_random_uuid(),
  p.id,
  'Geral',
  p.success_evidence,
  0,
  NOW(),
  NOW()
FROM projects p
WHERE (p.transformations_achievements IS NULL OR TRIM(p.transformations_achievements) = '')
  AND p.success_evidence IS NOT NULL
  AND p.success_evidence::text <> '[]'
  AND jsonb_array_length(p.success_evidence) > 0
  AND NOT EXISTS (
    SELECT 1 FROM project_transformations pt WHERE pt.project_id = p.id
  );
