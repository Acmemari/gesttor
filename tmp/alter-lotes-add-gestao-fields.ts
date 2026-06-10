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
  // Colunas da Gestão de Lotes adicionadas após a criação inicial da tabela.
  // Idempotente: ADD COLUMN IF NOT EXISTS não falha se a coluna já existir.
  await pool.query(`ALTER TABLE lotes ADD COLUMN IF NOT EXISTS codigo text;`);
  await pool.query(`ALTER TABLE lotes ADD COLUMN IF NOT EXISTS finalidade text;`);
  await pool.query(`ALTER TABLE lotes ADD COLUMN IF NOT EXISTS sistema text;`);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'lotes'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela lotes:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
