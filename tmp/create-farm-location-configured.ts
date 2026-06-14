/**
 * Migração aditiva: adiciona a coluna `configured` em farm_location_levels.
 *
 * `configured` marca que o usuário JÁ escolheu explicitamente a combinação de
 * níveis (Fazenda › Retiro? › Setor? › Local?) da fazenda. Enquanto false, a aba
 * "Locais" exibe o cadastro de combinação (gate) antes de liberar o mapa.
 *
 * Backfill: toda fazenda que JÁ tem uma linha de config de níveis foi configurada
 * no passado (pelos toggles), então marcamos configured = true para não forçá-las
 * de novo pelo gate. Fazendas sem linha (config derivada) e sem áreas do usuário
 * caem no gate na leitura do bundle.
 *
 * Idempotente. Rodar com: npx tsx tmp/create-farm-location-configured.ts
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
  await pool.query(
    `ALTER TABLE farm_location_levels ADD COLUMN IF NOT EXISTS configured boolean DEFAULT false NOT NULL;`,
  );
  // Linhas pré-existentes representam combinações já escolhidas — não re-gatear.
  const { rowCount } = await pool.query(
    `UPDATE farm_location_levels SET configured = true WHERE configured = false;`,
  );

  const summary = async (table: string) => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position;`,
      [table],
    );
    return rows;
  };
  console.log(`OK — backfill configured=true em ${rowCount} linha(s).`);
  console.log('OK — farm_location_levels:', JSON.stringify(await summary('farm_location_levels'), null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
