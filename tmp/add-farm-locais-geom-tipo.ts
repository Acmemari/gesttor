/**
 * Migração aditiva: adiciona a coluna `geom_tipo` em farm_locais.
 *
 * `geom_tipo` registra o TIPO DE GEOMETRIA do local: 'area' (polígono) | 'point'
 * (ponto) | 'line' (traço: cerca/estrada/rede hidráulica). Necessária porque o
 * de-para de importação agora classifica também LINHAS, e sem este campo uma
 * linha (coords abertas) seria recarregada como polígono. null = legado →
 * o app infere por nº de coordenadas (1 = ponto, ≥3 = área).
 *
 * NÃO-destrutivo (nullable, sem default forçado). Idempotente.
 * Rodar com: npx tsx tmp/add-farm-locais-geom-tipo.ts
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
  await pool.query(`ALTER TABLE farm_locais ADD COLUMN IF NOT EXISTS geom_tipo text;`);

  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'farm_locais' AND column_name = 'geom_tipo';`,
  );
  console.log('OK — coluna geom_tipo garantida em farm_locais:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
