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
 * Desambigua os campos de padrao_racial:
 *  - a coluna `grau_sangue` original guardava o Padrão Racial → renomeada para `classificacao`;
 *  - cria a nova coluna `grau_sangue` para o Grau de Sangue (Puro, 1/2 sangue, ...).
 * Idempotente.
 */
async function main() {
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'padrao_racial' AND column_name = 'grau_sangue'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'padrao_racial' AND column_name = 'classificacao'
      ) THEN
        ALTER TABLE padrao_racial RENAME COLUMN grau_sangue TO classificacao;
      END IF;
    END $$;
  `);

  await pool.query(`ALTER TABLE padrao_racial ADD COLUMN IF NOT EXISTS grau_sangue text;`);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'padrao_racial'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela padrao_racial:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
