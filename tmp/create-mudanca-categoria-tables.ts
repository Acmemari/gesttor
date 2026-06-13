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
  // ── mudanca_categoria_movimentos ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mudanca_categoria_movimentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      farm_id text,
      local_id uuid,
      proprietario_id uuid,
      data date NOT NULL,
      safra text,
      retiro text,
      qtd integer DEFAULT 0 NOT NULL,
      cat_decl jsonb DEFAULT '[]',
      obs text,
      criado_por text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk(
    'mudanca_categoria_movimentos_organization_id_organizations_id_fk',
    `ALTER TABLE mudanca_categoria_movimentos ADD CONSTRAINT mudanca_categoria_movimentos_organization_id_organizations_id_fk
       FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE cascade ON UPDATE no action;`,
  );
  await ensureFk(
    'mudanca_categoria_movimentos_farm_id_farms_id_fk',
    `ALTER TABLE mudanca_categoria_movimentos ADD CONSTRAINT mudanca_categoria_movimentos_farm_id_farms_id_fk
       FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE set null ON UPDATE no action;`,
  );
  await ensureFk(
    'mudanca_categoria_movimentos_local_id_farm_locais_id_fk',
    `ALTER TABLE mudanca_categoria_movimentos ADD CONSTRAINT mudanca_categoria_movimentos_local_id_farm_locais_id_fk
       FOREIGN KEY (local_id) REFERENCES public.farm_locais(id) ON DELETE set null ON UPDATE no action;`,
  );
  await ensureFk(
    'mudanca_categoria_movimentos_proprietario_id_people_id_fk',
    `ALTER TABLE mudanca_categoria_movimentos ADD CONSTRAINT mudanca_categoria_movimentos_proprietario_id_people_id_fk
       FOREIGN KEY (proprietario_id) REFERENCES public.people(id) ON DELETE set null ON UPDATE no action;`,
  );
  await ensureFk(
    'mudanca_categoria_movimentos_criado_por_user_profiles_id_fk',
    `ALTER TABLE mudanca_categoria_movimentos ADD CONSTRAINT mudanca_categoria_movimentos_criado_por_user_profiles_id_fk
       FOREIGN KEY (criado_por) REFERENCES public.user_profiles(id) ON DELETE set null ON UPDATE no action;`,
  );

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mudcat_mov_org ON mudanca_categoria_movimentos USING btree (organization_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mudcat_mov_farm ON mudanca_categoria_movimentos USING btree (farm_id);`);

  // ── mudanca_categoria_fichas ──────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mudanca_categoria_fichas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      movimento_id uuid NOT NULL,
      apelido text,
      rfid text,
      categoria_origem_id uuid,
      categoria_destino_id uuid,
      qtd integer DEFAULT 1 NOT NULL,
      peso numeric(8, 2),
      valor numeric(14, 2),
      obs text,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await ensureFk(
    'mudanca_categoria_fichas_movimento_id_mudanca_categoria_movimentos_id_fk',
    `ALTER TABLE mudanca_categoria_fichas ADD CONSTRAINT mudanca_categoria_fichas_movimento_id_mudanca_categoria_movimentos_id_fk
       FOREIGN KEY (movimento_id) REFERENCES public.mudanca_categoria_movimentos(id) ON DELETE cascade ON UPDATE no action;`,
  );
  await ensureFk(
    'mudanca_categoria_fichas_categoria_origem_id_animal_categories_id_fk',
    `ALTER TABLE mudanca_categoria_fichas ADD CONSTRAINT mudanca_categoria_fichas_categoria_origem_id_animal_categories_id_fk
       FOREIGN KEY (categoria_origem_id) REFERENCES public.animal_categories(id) ON DELETE set null ON UPDATE no action;`,
  );
  await ensureFk(
    'mudanca_categoria_fichas_categoria_destino_id_animal_categories_id_fk',
    `ALTER TABLE mudanca_categoria_fichas ADD CONSTRAINT mudanca_categoria_fichas_categoria_destino_id_animal_categories_id_fk
       FOREIGN KEY (categoria_destino_id) REFERENCES public.animal_categories(id) ON DELETE set null ON UPDATE no action;`,
  );

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mudcat_fichas_mov ON mudanca_categoria_fichas USING btree (movimento_id);`);

  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('mudanca_categoria_movimentos', 'mudanca_categoria_fichas')
     ORDER BY table_name;
  `);
  console.log('OK — tabelas criadas:', tables.rows.map((r) => r.table_name).join(', '));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
