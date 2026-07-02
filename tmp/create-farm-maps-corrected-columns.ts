/**
 * Migração aditiva: colunas da CORREÇÃO automática linha→polígono em farm_maps.
 *
 * Ao importar um KMZ/KML, áreas desenhadas como LINHAS fechadas são convertidas
 * em polígonos (skill kmz-line-to-polygon). Guardamos, ao lado do original (nunca
 * sobrescrito), uma cópia .kmz JÁ CORRIGIDA + o relatório da correção:
 *   - corrected_storage_path : caminho do .kmz corrigido no B2
 *   - corrected_file_name     : nome amigável p/ download (ex.: "mapa_corrigido.kmz")
 *   - corrected_file_size     : tamanho em bytes
 *   - correcao_report         : relatório agregado (contagens + listas) em jsonb
 *
 * Todas ANULÁVEIS (mapas antigos ficam NULL). Não-destrutivo e idempotente.
 * Rodar com: npx tsx tmp/create-farm-maps-corrected-columns.ts
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
  await pool.query(`ALTER TABLE farm_maps ADD COLUMN IF NOT EXISTS corrected_storage_path text;`);
  await pool.query(`ALTER TABLE farm_maps ADD COLUMN IF NOT EXISTS corrected_file_name text;`);
  await pool.query(`ALTER TABLE farm_maps ADD COLUMN IF NOT EXISTS corrected_file_size integer;`);
  await pool.query(`ALTER TABLE farm_maps ADD COLUMN IF NOT EXISTS correcao_report jsonb;`);

  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'farm_maps' ORDER BY ordinal_position;`,
  );
  console.log('OK — colunas da correção garantidas em farm_maps.');
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
