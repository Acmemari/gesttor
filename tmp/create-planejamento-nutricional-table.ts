/**
 * Cria a tabela `planejamento_nutricional` (plano de terminação por lote) no Neon.
 * Espelha o caminho das tabelas aditivas (lote_eventos, venda_*): SQL bruto
 * idempotente via pg.Pool — NÃO usa drizzle-kit push (tablesFilter explícito).
 *
 * Rodar: npx tsx tmp/create-planejamento-nutricional-table.ts
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
    CREATE TABLE IF NOT EXISTS planejamento_nutricional (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      lote_id uuid NOT NULL,
      peso_inicial numeric(8, 2),
      peso_vivo_abate numeric(8, 2),
      rendimento_carcaca numeric(5, 2),
      meta_valor_venda numeric(12, 2),
      fases jsonb DEFAULT '[]' NOT NULL,
      criado_por text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk('planejamento_nutricional_organization_id_organizations_id_fk', 'planejamento_nutricional', 'organization_id', 'organizations', 'id', 'cascade');
  await ensureFk('planejamento_nutricional_lote_id_lotes_id_fk', 'planejamento_nutricional', 'lote_id', 'lotes', 'id', 'cascade');
  await ensureFk('planejamento_nutricional_criado_por_user_profiles_id_fk', 'planejamento_nutricional', 'criado_por', 'user_profiles', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_planej_nutri_org ON planejamento_nutricional USING btree (organization_id);`);
  // 1 plano por lote (upsert por lote_id).
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS planej_nutri_lote_uidx ON planejamento_nutricional USING btree (lote_id);`);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'planejamento_nutricional'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela planejamento_nutricional:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
