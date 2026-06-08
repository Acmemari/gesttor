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
  await pool.query(`ALTER TABLE animal_breeds ADD COLUMN IF NOT EXISTS codigo_asbia text;`);
  await pool.query(`ALTER TABLE animal_breeds ADD COLUMN IF NOT EXISTS ceip boolean NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE animal_breeds ADD COLUMN IF NOT EXISTS sem_cadastro_asbia boolean NOT NULL DEFAULT false;`);

  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = 'animal_breeds'
        AND column_name IN ('codigo_asbia', 'ceip', 'sem_cadastro_asbia')
      ORDER BY column_name;`,
  );
  console.log('OK — colunas ASBIA em animal_breeds:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
