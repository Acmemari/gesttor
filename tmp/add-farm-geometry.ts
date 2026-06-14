/**
 * Adiciona geometria à hierarquia da fazenda (integração do mapa "Cadastro de
 * Áreas" na aba Locais):
 *   - farm_retiros.geometry (jsonb), farm_retiros.geometry_source (text)
 *   - farm_setores.geometry (jsonb), farm_setores.geometry_source (text)
 *   - farm_locais.geometry  (jsonb), farm_locais.geometry_source  (text),
 *     farm_locais.tipo (text)            — os 7 valores de TipoLocal
 *   - farms.perimeter_geometry (jsonb), farms.perimeter_source (text)
 *     — o perímetro da fazenda (nível "fazenda" do mapa) mora na própria fazenda.
 *
 * Geometria é o anel [lat,lng][] cru (jsonb), igual ao que o mapa produz/consome.
 * Migração puramente ADITIVA (colunas nuláveis) → a lista atual continua igual.
 *
 * Segue o padrão das colunas aditivas (farm_retiros/farm_locais não estão no
 * tablesFilter do drizzle.config.ts): SQL bruto idempotente via pg.Pool, NÃO
 * drizzle-kit push.
 *
 * Rodar: npx tsx tmp/add-farm-geometry.ts
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const stmts = [
    `ALTER TABLE farm_retiros ADD COLUMN IF NOT EXISTS geometry jsonb;`,
    `ALTER TABLE farm_retiros ADD COLUMN IF NOT EXISTS geometry_source text;`,
    `ALTER TABLE farm_setores ADD COLUMN IF NOT EXISTS geometry jsonb;`,
    `ALTER TABLE farm_setores ADD COLUMN IF NOT EXISTS geometry_source text;`,
    `ALTER TABLE farm_locais  ADD COLUMN IF NOT EXISTS geometry jsonb;`,
    `ALTER TABLE farm_locais  ADD COLUMN IF NOT EXISTS geometry_source text;`,
    `ALTER TABLE farm_locais  ADD COLUMN IF NOT EXISTS tipo text;`,
    `ALTER TABLE farms        ADD COLUMN IF NOT EXISTS perimeter_geometry jsonb;`,
    `ALTER TABLE farms        ADD COLUMN IF NOT EXISTS perimeter_source text;`,
  ];
  for (const sql of stmts) await pool.query(sql);

  for (const table of ['farm_retiros', 'farm_setores', 'farm_locais', 'farms']) {
    const { rows } = await pool.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_name = $1
          AND column_name IN ('geometry','geometry_source','tipo','perimeter_geometry','perimeter_source')
        ORDER BY column_name;`,
      [table],
    );
    console.log(`OK — ${table}:`, JSON.stringify(rows));
  }
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
