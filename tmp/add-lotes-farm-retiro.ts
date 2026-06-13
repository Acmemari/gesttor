/**
 * Adiciona o vínculo de localização ao Cadastro de Lotes:
 *   - lotes.farm_id (text → farms.id, ON DELETE SET NULL)  — nível Fazenda
 *   - lotes.retiro  (text)                                 — nível Retiro (nome)
 *
 * Segue o padrão das tabelas aditivas (a tabela `lotes` não está no tablesFilter
 * do drizzle.config.ts): SQL bruto idempotente via pg.Pool, NÃO drizzle-kit push.
 *
 * Rodar: npx tsx tmp/add-lotes-farm-retiro.ts
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

async function ensureFk(
  conname: string,
  table: string,
  column: string,
  refTable: string,
  refColumn: string,
  onDelete: 'cascade' | 'set null',
) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${conname}') THEN
        ALTER TABLE ${table}
          ADD CONSTRAINT ${conname}
          FOREIGN KEY (${column}) REFERENCES public.${refTable}(${refColumn})
          ON DELETE ${onDelete} ON UPDATE no action;
      END IF;
    END $$;
  `);
}

async function main() {
  await pool.query(`ALTER TABLE lotes ADD COLUMN IF NOT EXISTS farm_id text;`);
  await pool.query(`ALTER TABLE lotes ADD COLUMN IF NOT EXISTS retiro text;`);

  await ensureFk('lotes_farm_id_farms_id_fk', 'lotes', 'farm_id', 'farms', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lotes_farm_id ON lotes USING btree (farm_id);`);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable
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
