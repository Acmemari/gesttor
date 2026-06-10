import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Adiciona a coluna `composicao_racial` (jsonb) em animal_breeds.
 * Guarda um array de { breedId, nome, percentual, principal }.
 * Default '[]' faz backfill das linhas existentes. Idempotente.
 */
async function main() {
  await pool.query(
    `ALTER TABLE animal_breeds ADD COLUMN IF NOT EXISTS composicao_racial jsonb DEFAULT '[]'::jsonb;`,
  );

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'animal_breeds'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela animal_breeds:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
