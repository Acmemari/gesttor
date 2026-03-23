-- Migration: People & Farms Robustness Improvements
-- Date: 2026-03-22
-- Database: Neon (PostgreSQL)
-- Purpose: Add indexes, UNIQUE constraint on CPF, and created_by to farms
-- How to run: npx tsx scripts/run-migration.ts scripts/migrate-people-farms-robustness.sql
--             OR paste diretamente no Neon SQL Editor

-- ── 1. Indexes on people table ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_people_organization_id ON people(organization_id);
CREATE INDEX IF NOT EXISTS idx_people_farm_id ON people(farm_id);
CREATE INDEX IF NOT EXISTS idx_people_ativo ON people(ativo);
CREATE INDEX IF NOT EXISTS idx_people_created_at ON people(created_at DESC);
-- Composite index for the most common list query pattern
CREATE INDEX IF NOT EXISTS idx_people_org_ativo ON people(organization_id, ativo);

-- ── 2. Partial UNIQUE index on CPF (NULLs are allowed, but non-null must be unique) ──

CREATE UNIQUE INDEX IF NOT EXISTS idx_people_cpf_unique
  ON people(cpf)
  WHERE cpf IS NOT NULL;

-- ── 3. Add created_by to farms (auditing) ──────────────────────────────────────

ALTER TABLE farms ADD COLUMN IF NOT EXISTS created_by text;

-- ── 4. Index on farms.created_by for audit queries ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_farms_created_by ON farms(created_by) WHERE created_by IS NOT NULL;

-- ── 5. Ensure rate_limits table has index on (key, window_start) ──────────────
-- (for performance of rate limit checks)

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON rate_limits(key, window_start);

-- ── 6. Cleanup old rate limit entries (older than 2 minutes) via a function ───

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '2 minutes';
END;
$$;
