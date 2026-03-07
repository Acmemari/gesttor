-- Migration: Allow client users (qualification = 'cliente') to view and manage farms of their organization
-- Clients can SELECT, INSERT, UPDATE, DELETE farms where farms.client_id = user_profiles.client_id

-- Policy: Clients can view farms of their organization
CREATE POLICY "Clients can view their organization farms"
  ON farms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.qualification = 'cliente'
        AND up.client_id IS NOT NULL
        AND up.client_id = farms.client_id
    )
  );

-- Policy: Clients can insert farms into their organization (client_id must match their profile)
CREATE POLICY "Clients can insert farms in their organization"
  ON farms FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.qualification = 'cliente'
        AND up.client_id IS NOT NULL
        AND up.client_id = farms.client_id
    )
  );

-- Policy: Clients can update farms of their organization
CREATE POLICY "Clients can update their organization farms"
  ON farms FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.qualification = 'cliente'
        AND up.client_id IS NOT NULL
        AND up.client_id = farms.client_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.qualification = 'cliente'
        AND up.client_id IS NOT NULL
        AND up.client_id = farms.client_id
    )
  );

-- Policy: Clients can delete farms of their organization
CREATE POLICY "Clients can delete their organization farms"
  ON farms FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.qualification = 'cliente'
        AND up.client_id IS NOT NULL
        AND up.client_id = farms.client_id
    )
  );

COMMENT ON POLICY "Clients can view their organization farms" ON farms IS 'Cliente vê apenas fazendas da sua organização (farms.client_id = user_profiles.client_id)';
COMMENT ON POLICY "Clients can insert farms in their organization" ON farms IS 'Cliente pode cadastrar fazendas apenas na sua organização';
COMMENT ON POLICY "Clients can update their organization farms" ON farms IS 'Cliente pode editar fazendas da sua organização';
COMMENT ON POLICY "Clients can delete their organization farms" ON farms IS 'Cliente pode excluir fazendas da sua organização';

-- =============================================================================
-- Verificação e correção: farms.client_id vs client_farms
-- =============================================================================
-- Se uma fazenda foi vinculada apenas via client_farms e farms.client_id ficou
-- NULL, o cliente não conseguirá vê-la (as policies acima usam farms.client_id).
--
-- 1) Verificar fazendas sem client_id mas com vínculo em client_farms:
--
--   SELECT f.id, f.name, cf.client_id
--   FROM farms f
--   JOIN client_farms cf ON cf.farm_id = f.id
--   WHERE f.client_id IS NULL;
--
-- 2) Corrigir: preencher farms.client_id a partir de client_farms
--    (execute apenas se houver registros no SELECT acima):
--
--   UPDATE farms f
--   SET client_id = cf.client_id
--   FROM client_farms cf
--   WHERE cf.farm_id = f.id
--     AND f.client_id IS NULL;
--
-- Nota: se uma fazenda tiver múltiplos client_farms, o UPDATE usará um deles;
-- para consistência, convém garantir um único vínculo por fazenda ou usar
-- um critério (ex.: MIN(cf.client_id)) na subquery.
-- =============================================================================
