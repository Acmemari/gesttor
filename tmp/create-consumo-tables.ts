import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Cria uma FK só se ainda não existir (idempotente). */
async function ensureFk(name: string, sql: string) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
        ${sql}
      END IF;
    END $$;
  `);
}

async function main() {
  // ── consumo_movimentos ─────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consumo_movimentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      farm_id text,
      local_id uuid,
      proprietario_id uuid,
      data date NOT NULL,
      safra text,
      retiro text,
      qtd integer DEFAULT 0 NOT NULL,
      nao_identificados integer DEFAULT 0 NOT NULL,
      status text DEFAULT 'pendente' NOT NULL,
      cat_decl jsonb DEFAULT '[]',
      obs text,
      criado_por text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk(
    'consumo_movimentos_organization_id_organizations_id_fk',
    `ALTER TABLE consumo_movimentos ADD CONSTRAINT consumo_movimentos_organization_id_organizations_id_fk
       FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE cascade ON UPDATE no action;`,
  );
  await ensureFk(
    'consumo_movimentos_farm_id_farms_id_fk',
    `ALTER TABLE consumo_movimentos ADD CONSTRAINT consumo_movimentos_farm_id_farms_id_fk
       FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE set null ON UPDATE no action;`,
  );
  await ensureFk(
    'consumo_movimentos_local_id_farm_locais_id_fk',
    `ALTER TABLE consumo_movimentos ADD CONSTRAINT consumo_movimentos_local_id_farm_locais_id_fk
       FOREIGN KEY (local_id) REFERENCES public.farm_locais(id) ON DELETE set null ON UPDATE no action;`,
  );
  await ensureFk(
    'consumo_movimentos_proprietario_id_people_id_fk',
    `ALTER TABLE consumo_movimentos ADD CONSTRAINT consumo_movimentos_proprietario_id_people_id_fk
       FOREIGN KEY (proprietario_id) REFERENCES public.people(id) ON DELETE set null ON UPDATE no action;`,
  );
  await ensureFk(
    'consumo_movimentos_criado_por_user_profiles_id_fk',
    `ALTER TABLE consumo_movimentos ADD CONSTRAINT consumo_movimentos_criado_por_user_profiles_id_fk
       FOREIGN KEY (criado_por) REFERENCES public.user_profiles(id) ON DELETE set null ON UPDATE no action;`,
  );

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consumo_mov_org ON consumo_movimentos USING btree (organization_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consumo_mov_farm ON consumo_movimentos USING btree (farm_id);`);

  // ── consumo_fichas ─────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consumo_fichas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      movimento_id uuid NOT NULL,
      categoria_id uuid,
      tipo text,
      apelido text,
      rfid text,
      peso_vivo numeric(8, 2),
      peso_morto numeric(8, 2),
      valor numeric(12, 2),
      obs text,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk(
    'consumo_fichas_movimento_id_consumo_movimentos_id_fk',
    `ALTER TABLE consumo_fichas ADD CONSTRAINT consumo_fichas_movimento_id_consumo_movimentos_id_fk
       FOREIGN KEY (movimento_id) REFERENCES public.consumo_movimentos(id) ON DELETE cascade ON UPDATE no action;`,
  );
  await ensureFk(
    'consumo_fichas_categoria_id_animal_categories_id_fk',
    `ALTER TABLE consumo_fichas ADD CONSTRAINT consumo_fichas_categoria_id_animal_categories_id_fk
       FOREIGN KEY (categoria_id) REFERENCES public.animal_categories(id) ON DELETE set null ON UPDATE no action;`,
  );

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consumo_fichas_mov ON consumo_fichas USING btree (movimento_id);`);

  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('consumo_movimentos', 'consumo_fichas')
     ORDER BY table_name;
  `);
  console.log('OK — tabelas criadas:', tables.rows.map((r) => r.table_name).join(', '));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
