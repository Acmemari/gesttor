/**
 * Cria a tabela `area_movimentos` (ledger imutável da Movimentação de Áreas) no Neon
 * e aplica as alterações de fundação do ciclo de vida de áreas:
 *   - farm_locais: colunas `status` ('ativo'|'aposentado') e `aposentado_em`;
 *   - mapa_rebanho_lancamentos / mapao_lancamentos: troca da FK de local_id de
 *     ON DELETE CASCADE para ON DELETE RESTRICT (blinda o rebanho — local é
 *     APOSENTADO, nunca excluído).
 *
 * Espelha o caminho das tabelas aditivas (lote_eventos, venda_*, pelagens): SQL
 * bruto idempotente via pg.Pool — NÃO usa drizzle-kit push (tablesFilter explícito).
 *
 * Rodar: npx tsx tmp/create-area-movimentos-table.ts
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

/**
 * Troca QUALQUER FK existente na coluna informada por uma FK ON DELETE RESTRICT.
 * Idempotente: derruba todas as FKs da coluna (inclusive a própria restrict de uma
 * execução anterior) e recria a restrict.
 */
async function swapFkToRestrict(
  table: string,
  column: string,
  conname: string,
  refTable: string,
  refColumn: string,
) {
  await pool.query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
         WHERE con.contype = 'f'
           AND rel.relname = '${table}'
           AND att.attname = '${column}'
      LOOP
        EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I', r.conname);
      END LOOP;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE ${table}
      ADD CONSTRAINT ${conname}
      FOREIGN KEY (${column}) REFERENCES public.${refTable}(${refColumn})
      ON DELETE RESTRICT ON UPDATE no action;
  `);
}

async function main() {
  // 1) Ledger area_movimentos.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS area_movimentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      farm_id text NOT NULL,
      nivel text NOT NULL,
      tipo text NOT NULL,
      classe text NOT NULL DEFAULT 'movimento',
      data date NOT NULL,
      area_id uuid,
      antes jsonb,
      depois jsonb,
      dados jsonb DEFAULT '{}' NOT NULL,
      nota text,
      criado_por text,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk('area_movimentos_organization_id_organizations_id_fk', 'area_movimentos', 'organization_id', 'organizations', 'id', 'cascade');
  await ensureFk('area_movimentos_farm_id_farms_id_fk', 'area_movimentos', 'farm_id', 'farms', 'id', 'cascade');
  await ensureFk('area_movimentos_criado_por_user_profiles_id_fk', 'area_movimentos', 'criado_por', 'user_profiles', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_area_mov_farm_data ON area_movimentos USING btree (farm_id, data);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_area_mov_area ON area_movimentos USING btree (area_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_area_mov_org ON area_movimentos USING btree (organization_id);`);

  // 2) Ciclo de vida em farm_locais (aposentar em vez de excluir).
  await pool.query(`ALTER TABLE farm_locais ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';`);
  await pool.query(`ALTER TABLE farm_locais ADD COLUMN IF NOT EXISTS aposentado_em timestamp;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_farm_locais_status ON farm_locais USING btree (status);`);

  // 3) Blinda mapa/mapão: local_id passa de CASCADE para RESTRICT.
  await swapFkToRestrict('mapa_rebanho_lancamentos', 'local_id', 'mapa_rebanho_lancamentos_local_id_farm_locais_id_fk', 'farm_locais', 'id');
  await swapFkToRestrict('mapao_lancamentos', 'local_id', 'mapao_lancamentos_local_id_farm_locais_id_fk', 'farm_locais', 'id');

  // 4) Resumo.
  const { rows: cols } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'area_movimentos'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela area_movimentos:', JSON.stringify(cols, null, 2));

  const { rows: locaisCols } = await pool.query(`
    SELECT column_name, data_type, column_default
      FROM information_schema.columns
     WHERE table_name = 'farm_locais' AND column_name IN ('status', 'aposentado_em')
     ORDER BY column_name;
  `);
  console.log('OK — farm_locais (status/aposentado_em):', JSON.stringify(locaisCols, null, 2));

  const { rows: fks } = await pool.query(`
    SELECT con.conname, rel.relname AS tabela, con.confdeltype AS on_delete
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE con.contype = 'f'
       AND rel.relname IN ('mapa_rebanho_lancamentos', 'mapao_lancamentos')
       AND con.conname LIKE '%local_id%';
  `);
  // confdeltype: 'a'=no action, 'r'=restrict, 'c'=cascade, 'n'=set null, 'd'=set default
  console.log('OK — FKs local_id (esperado on_delete = r/restrict):', JSON.stringify(fks, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
