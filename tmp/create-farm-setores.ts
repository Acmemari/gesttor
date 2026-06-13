import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // ── farm_setores (novo nível entre Retiro e Local) ──────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS farm_setores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      farm_id text NOT NULL,
      retiro_id uuid,
      name text NOT NULL,
      area numeric,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farm_setores_farm_id_farms_id_fk') THEN
        ALTER TABLE farm_setores
          ADD CONSTRAINT farm_setores_farm_id_farms_id_fk
          FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE cascade ON UPDATE no action;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farm_setores_retiro_id_farm_retiros_id_fk') THEN
        ALTER TABLE farm_setores
          ADD CONSTRAINT farm_setores_retiro_id_farm_retiros_id_fk
          FOREIGN KEY (retiro_id) REFERENCES public.farm_retiros(id) ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_farm_setores_farm_id ON farm_setores USING btree (farm_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_farm_setores_retiro_id ON farm_setores USING btree (retiro_id);`);

  // ── farm_locais: setor_id (novo) + retiro_id anulável ───────────────────────
  await pool.query(`ALTER TABLE farm_locais ADD COLUMN IF NOT EXISTS setor_id uuid;`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farm_locais_setor_id_farm_setores_id_fk') THEN
        ALTER TABLE farm_locais
          ADD CONSTRAINT farm_locais_setor_id_farm_setores_id_fk
          FOREIGN KEY (setor_id) REFERENCES public.farm_setores(id) ON DELETE set null ON UPDATE no action;
      END IF;
    END $$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_farm_locais_setor_id ON farm_locais USING btree (setor_id);`);
  // Retiro passa a ser opcional: o Local pode ancorar direto em setor/fazenda.
  await pool.query(`ALTER TABLE farm_locais ALTER COLUMN retiro_id DROP NOT NULL;`);

  // ── farm_location_levels (config de níveis ativos por fazenda) ──────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS farm_location_levels (
      farm_id text PRIMARY KEY,
      retiro boolean DEFAULT true NOT NULL,
      setor boolean DEFAULT false NOT NULL,
      local boolean DEFAULT true NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farm_location_levels_farm_id_farms_id_fk') THEN
        ALTER TABLE farm_location_levels
          ADD CONSTRAINT farm_location_levels_farm_id_farms_id_fk
          FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;
  `);

  const summary = async (table: string) => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position;`,
      [table],
    );
    return rows;
  };
  console.log('OK — farm_setores:', JSON.stringify(await summary('farm_setores'), null, 2));
  console.log('OK — farm_locais:', JSON.stringify(await summary('farm_locais'), null, 2));
  console.log('OK — farm_location_levels:', JSON.stringify(await summary('farm_location_levels'), null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
