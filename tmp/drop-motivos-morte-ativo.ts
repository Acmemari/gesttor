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
    `ALTER TABLE motivos_morte DROP COLUMN IF EXISTS ativo;`,
  );
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = 'motivos_morte'
      ORDER BY ordinal_position;`,
  );
  console.log('OK — colunas de motivos_morte:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
