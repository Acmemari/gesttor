/**
 * Cria a tabela `lote_eventos` (ledger imutável da Gestão de Lotes) no Neon.
 * Espelha o caminho das tabelas aditivas (venda_*, pelagens): SQL bruto
 * idempotente via pg.Pool — NÃO usa drizzle-kit push (tablesFilter explícito).
 *
 * Rodar: npx tsx tmp/create-lote-eventos-table.ts
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

/** Adiciona uma FK só se ainda não existir (idempotente). */
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lote_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      lote_id uuid NOT NULL,
      tipo text NOT NULL,
      data date NOT NULL,
      resp text,
      dados jsonb DEFAULT '{}' NOT NULL,
      criado_por text,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk('lote_eventos_organization_id_organizations_id_fk', 'lote_eventos', 'organization_id', 'organizations', 'id', 'cascade');
  await ensureFk('lote_eventos_lote_id_lotes_id_fk', 'lote_eventos', 'lote_id', 'lotes', 'id', 'cascade');
  await ensureFk('lote_eventos_criado_por_user_profiles_id_fk', 'lote_eventos', 'criado_por', 'user_profiles', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lote_eventos_org ON lote_eventos USING btree (organization_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lote_eventos_lote ON lote_eventos USING btree (lote_id);`);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'lote_eventos'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela lote_eventos:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
