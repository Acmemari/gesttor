import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Tabelas de fichas das 5 movimentações que usam o kit "Defina seus campos".
const TABLES = [
  'compra_fichas',
  'venda_fichas',
  'nascimento_fichas',
  'morte_fichas',
  'consumo_fichas',
];

async function main() {
  for (const table of TABLES) {
    // Coluna `extras` (jsonb) guarda os valores dos Campos Personalizados por ficha.
    await pool.query(`
      ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}';
    `);
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'extras';`,
      [table],
    );
    console.log(`OK — ${table}.extras:`, JSON.stringify(rows));
  }
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
