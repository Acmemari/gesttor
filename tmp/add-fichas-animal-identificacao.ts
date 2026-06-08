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
  await pool.query(`
    ALTER TABLE fichas_animal
      ADD COLUMN IF NOT EXISTS frame text,
      ADD COLUMN IF NOT EXISTS categoria_genealogica text,
      ADD COLUMN IF NOT EXISTS ceip text,
      ADD COLUMN IF NOT EXISTS evento_entrada text,
      ADD COLUMN IF NOT EXISTS data_entrada date;
  `);
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'fichas_animal'
        AND column_name IN ('frame', 'categoria_genealogica', 'ceip', 'evento_entrada', 'data_entrada')
      ORDER BY column_name;`,
  );
  console.log('OK — colunas fichas_animal:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
