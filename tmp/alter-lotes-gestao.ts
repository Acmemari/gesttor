/**
 * Adiciona à tabela `lotes` os campos de identidade da Gestão de Lotes:
 *  - codigo     text  → ex.: "RC-01"
 *  - finalidade text  → Cria | Recria | Terminação | Outra Finalidade
 *  - sistema    text  → ex.: "Pasto + suplemento"
 * SQL bruto idempotente via pg.Pool (não usa drizzle-kit push — tablesFilter explícito).
 *
 * Rodar: npx tsx tmp/alter-lotes-gestao.ts
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
