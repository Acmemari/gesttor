/**
 * Cria a tabela `area_versoes` (linha do tempo materializada das áreas) no Neon e
 * adiciona a coluna `uso` em `farm_locais` (cache do uso da versão corrente).
 *
 * Cada versão é a "foto" (geometria + uso) vigente num intervalo [valid_from,
 * valid_to). É DERIVADA do ledger area_movimentos — cada operação que muda
 * forma/uso fecha a versão aberta e abre uma nova. Alimenta a reconstrução do
 * mapa por data (slider).
 *
 * Espelha o caminho das tabelas aditivas (area_movimentos, lote_eventos): SQL
 * bruto idempotente via pg.Pool — NÃO usa drizzle-kit push (tablesFilter explícito).
 *
 * Rodar: npx tsx tmp/create-area-versoes-table.ts
 * (Rodar o backfill em seguida: npx tsx tmp/backfill-area-versoes.ts)
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
  // 1) Tabela area_versoes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS area_versoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      area_id uuid NOT NULL,
      nivel text NOT NULL,
      organization_id uuid NOT NULL,
      farm_id text NOT NULL,
      valid_from date NOT NULL,
      valid_to date,
      geometry jsonb,
      geometry_source text,
      uso text,
      area_ha numeric,
      movimento_id uuid,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk('area_versoes_organization_id_organizations_id_fk', 'area_versoes', 'organization_id', 'organizations', 'id', 'cascade');
  await ensureFk('area_versoes_farm_id_farms_id_fk', 'area_versoes', 'farm_id', 'farms', 'id', 'cascade');
  await ensureFk('area_versoes_movimento_id_area_movimentos_id_fk', 'area_versoes', 'movimento_id', 'area_movimentos', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_area_versoes_farm_vigencia ON area_versoes USING btree (farm_id, valid_from, valid_to);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_area_versoes_area ON area_versoes USING btree (area_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_area_versoes_org ON area_versoes USING btree (organization_id);`);
  // Invariante: no máx. 1 versão aberta (valid_to IS NULL) por identidade.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_area_versoes_aberta ON area_versoes (area_id) WHERE valid_to IS NULL;`);

  // 2) Coluna `uso` em farm_locais (cache da versão corrente).
  await pool.query(`ALTER TABLE farm_locais ADD COLUMN IF NOT EXISTS uso text;`);

  // 3) Resumo.
  const { rows: cols } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'area_versoes'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela area_versoes:', JSON.stringify(cols, null, 2));

  const { rows: usoCol } = await pool.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'farm_locais' AND column_name = 'uso';
  `);
  console.log('OK — farm_locais.uso:', JSON.stringify(usoCol, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
