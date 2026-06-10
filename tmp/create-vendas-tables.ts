/**
 * Cria as tabelas de Movimentação › Vendas (venda_movimentos + venda_itens) no Neon.
 * Espelha o caminho de migração das tabelas aditivas (pelagens, tipos_chifre):
 * SQL bruto idempotente via pg.Pool — NÃO usa drizzle-kit push (o tablesFilter
 * do drizzle.config.ts é explícito e não inclui estas tabelas).
 *
 * Rodar: npx tsx tmp/create-vendas-tables.ts
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
  // ── venda_movimentos (cabeçalho da venda) ─────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS venda_movimentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      farm_id text,
      local_id uuid,
      proprietario_id uuid,
      cliente_id uuid,
      data date NOT NULL,
      safra text,
      retiro text,
      tipo_venda text DEFAULT 'abate' NOT NULL,
      tipo_peso text DEFAULT 'arroba' NOT NULL,
      valor_arroba numeric,
      peso_morto_total numeric,
      qtd integer DEFAULT 0 NOT NULL,
      valor_total numeric,
      peso_morto_arroba numeric,
      rendimento numeric,
      status text DEFAULT 'conciliado' NOT NULL,
      obs text,
      criado_por text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk('venda_movimentos_organization_id_organizations_id_fk', 'venda_movimentos', 'organization_id', 'organizations', 'id', 'cascade');
  await ensureFk('venda_movimentos_farm_id_farms_id_fk', 'venda_movimentos', 'farm_id', 'farms', 'id', 'set null');
  await ensureFk('venda_movimentos_local_id_farm_locais_id_fk', 'venda_movimentos', 'local_id', 'farm_locais', 'id', 'set null');
  await ensureFk('venda_movimentos_proprietario_id_people_id_fk', 'venda_movimentos', 'proprietario_id', 'people', 'id', 'set null');
  await ensureFk('venda_movimentos_cliente_id_people_id_fk', 'venda_movimentos', 'cliente_id', 'people', 'id', 'set null');
  await ensureFk('venda_movimentos_criado_por_user_profiles_id_fk', 'venda_movimentos', 'criado_por', 'user_profiles', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_venda_mov_org ON venda_movimentos USING btree (organization_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_venda_mov_farm ON venda_movimentos USING btree (farm_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_venda_mov_cliente ON venda_movimentos USING btree (cliente_id);`);

  // ── venda_itens (linhas por categoria) ────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS venda_itens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      movimento_id uuid NOT NULL,
      categoria_id uuid,
      qtd integer DEFAULT 0 NOT NULL,
      idade_meses integer,
      peso_vivo_kg numeric,
      valor_arroba numeric,
      peso_morto_total numeric,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // Valores comerciais por categoria: migrados do cabeçalho para o item
  // (idempotente — não falha em bancos que já têm as colunas).
  await pool.query(`ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS valor_arroba numeric;`);
  await pool.query(`ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS peso_morto_total numeric;`);

  await ensureFk('venda_itens_movimento_id_venda_movimentos_id_fk', 'venda_itens', 'movimento_id', 'venda_movimentos', 'id', 'cascade');
  await ensureFk('venda_itens_categoria_id_animal_categories_id_fk', 'venda_itens', 'categoria_id', 'animal_categories', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_venda_itens_mov ON venda_itens USING btree (movimento_id);`);

  // ── venda_fichas (animais detalhados por ID — modo individual / "Com ID") ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS venda_fichas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      movimento_id uuid NOT NULL,
      categoria_id uuid,
      apelido text,
      rfid text,
      peso_vivo_kg numeric,
      peso_morto_kg numeric,
      valor_arroba numeric,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // Valor/@ por animal (padrão = valor/@ do lote) — idempotente.
  await pool.query(`ALTER TABLE venda_fichas ADD COLUMN IF NOT EXISTS valor_arroba numeric;`);

  await ensureFk('venda_fichas_movimento_id_venda_movimentos_id_fk', 'venda_fichas', 'movimento_id', 'venda_movimentos', 'id', 'cascade');
  await ensureFk('venda_fichas_categoria_id_animal_categories_id_fk', 'venda_fichas', 'categoria_id', 'animal_categories', 'id', 'set null');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_venda_fichas_mov ON venda_fichas USING btree (movimento_id);`);

  for (const table of ['venda_movimentos', 'venda_itens', 'venda_fichas']) {
    const { rows } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_name = '${table}'
       ORDER BY ordinal_position;
    `);
    console.log(`OK — tabela ${table}:`, JSON.stringify(rows, null, 2));
  }
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
