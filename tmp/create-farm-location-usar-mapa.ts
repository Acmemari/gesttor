/**
 * Migração aditiva: adiciona a coluna `usar_mapa` em farm_location_levels.
 *
 * `usar_mapa` marca se a fazenda controla os locais COM mapa (colunas + mapa
 * Leaflet) ou SEM mapa (apenas as colunas Fazenda › Retiro › Setor › Local, com
 * hectares digitados à mão). É um modo de apresentação por fazenda, editado no
 * rodapé de "Dados Gerais". NÃO-destrutivo: alternar nunca apaga geometria.
 *
 * Default `true` (todas as fazendas atuais ficam "com mapa"). Não precisa de
 * backfill: o `NOT NULL DEFAULT true` preenche as linhas existentes no próprio
 * ALTER. Idempotente. Rodar com: npx tsx tmp/create-farm-location-usar-mapa.ts
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
    `ALTER TABLE farm_location_levels ADD COLUMN IF NOT EXISTS usar_mapa boolean DEFAULT true NOT NULL;`,
  );

  const summary = async (table: string) => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position;`,
      [table],
    );
    return rows;
  };
  console.log('OK — coluna usar_mapa garantida em farm_location_levels.');
  console.log('OK — farm_location_levels:', JSON.stringify(await summary('farm_location_levels'), null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
