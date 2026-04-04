-- Migration: animal_categories
-- Categorias de animais no nível da organização
-- Execução: psql $DATABASE_URL -f scripts/migrate-animal-categories.sql

CREATE TABLE IF NOT EXISTS animal_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  complemento TEXT,
  sexo TEXT NOT NULL,
  grupo TEXT NOT NULL,
  idade_faixa TEXT,
  peso_kg NUMERIC(8,2),
  ordem INTEGER NOT NULL DEFAULT 0,
  percentual NUMERIC(5,2),
  unidade_peso TEXT,
  valor_kg_arroba NUMERIC(10,2),
  valor_cabeca NUMERIC(10,2),
  quantidade INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_animal_categories_org_id ON animal_categories(organization_id);
