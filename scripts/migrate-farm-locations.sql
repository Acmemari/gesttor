-- Migration: farm_retiros e farm_locais
-- Hierarquia: Fazenda > Retiro > Local
-- Execução: psql $DATABASE_URL -f scripts/migrate-farm-locations.sql

-- 1. Tabela de Retiros
CREATE TABLE IF NOT EXISTS farm_retiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_area NUMERIC,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farm_retiros_farm_id ON farm_retiros(farm_id);

-- 2. Tabela de Locais (dentro de um retiro)
CREATE TABLE IF NOT EXISTS farm_locais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retiro_id UUID NOT NULL REFERENCES farm_retiros(id) ON DELETE CASCADE,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area NUMERIC,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farm_locais_retiro_id ON farm_locais(retiro_id);
CREATE INDEX IF NOT EXISTS idx_farm_locais_farm_id ON farm_locais(farm_id);
