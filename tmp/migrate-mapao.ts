/**
 * Migração cirúrgica: cria SOMENTE as tabelas do Mapa Rebanho - Mapão.
 * Espelha exatamente a estrutura (já existente e funcional) do mapa_rebanho.
 * Idempotente (IF NOT EXISTS) e dentro de uma transação. Não toca nenhuma
 * outra tabela — por isso não usamos `drizzle-kit push` (que reconciliaria
 * drift pré-existente de outras tabelas, ex.: ba_user).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const { pool } = await import('../src/DB/index.js');

const DDL = `
CREATE TABLE IF NOT EXISTS mapao_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id text NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  data_referencia date NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  observacao text,
  criado_por text REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mapao_headers_farm_data_uidx ON mapao_headers (farm_id, data_referencia);
CREATE INDEX IF NOT EXISTS idx_mapao_headers_org ON mapao_headers (organization_id);
CREATE INDEX IF NOT EXISTS idx_mapao_headers_farm ON mapao_headers (farm_id);

CREATE TABLE IF NOT EXISTS mapao_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapa_header_id uuid NOT NULL REFERENCES mapao_headers(id) ON DELETE CASCADE,
  local_id uuid NOT NULL REFERENCES farm_locais(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES animal_categories(id) ON DELETE CASCADE,
  quantidade integer NOT NULL DEFAULT 0,
  peso_kg_cabeca numeric(8,2) NOT NULL DEFAULT '0',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mapao_lanc_header_local_cat_uidx ON mapao_lancamentos (mapa_header_id, local_id, categoria_id);
CREATE INDEX IF NOT EXISTS idx_mapao_lanc_header ON mapao_lancamentos (mapa_header_id);
`;

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(DDL);
  await client.query('COMMIT');
  console.log('✅ Tabelas mapao_headers / mapao_lancamentos criadas (ou já existentes).');

  const check = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('mapao_headers','mapao_lancamentos')
     ORDER BY table_name;`
  );
  console.log('Tabelas presentes:', check.rows.map((r: any) => r.table_name).join(', '));
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ Migração falhou, rollback aplicado:', err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
