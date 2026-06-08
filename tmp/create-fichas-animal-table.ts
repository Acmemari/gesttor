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
  // Tabela espelha src/DB/schema.ts → fichasAnimal.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fichas_animal (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      farm_id text,
      nascimento_ficha_id uuid,

      -- Identificação
      apelido text NOT NULL,
      nome text,
      categoria_id uuid,
      sexo text,
      raca text,
      grau text,
      pelagem text,
      chifre text,
      porte text,
      lote text,
      rfid text,
      sisbov text,
      rgn text,
      rgd text,
      serie text,
      peso numeric(8, 2),
      pesagem text,
      obs text,

      -- Origem / Nascimento
      data date,
      peso_nascer numeric(8, 2),
      colostro text,
      parto text,
      fazenda_nascimento text,

      -- Genealogia
      pai text,
      mae text,
      avo_paterno text,
      avo_materno text,

      -- Situação
      situacao text DEFAULT 'ativo' NOT NULL,

      extras jsonb DEFAULT '{}'::jsonb NOT NULL,

      criado_por text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // FKs idempotentes
  const fks: Array<{ name: string; sql: string }> = [
    {
      name: 'fichas_animal_organization_id_organizations_id_fk',
      sql: `ALTER TABLE fichas_animal ADD CONSTRAINT fichas_animal_organization_id_organizations_id_fk
            FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE cascade ON UPDATE no action;`,
    },
    {
      name: 'fichas_animal_farm_id_farms_id_fk',
      sql: `ALTER TABLE fichas_animal ADD CONSTRAINT fichas_animal_farm_id_farms_id_fk
            FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE set null ON UPDATE no action;`,
    },
    {
      name: 'fichas_animal_nascimento_ficha_id_nascimento_fichas_id_fk',
      sql: `ALTER TABLE fichas_animal ADD CONSTRAINT fichas_animal_nascimento_ficha_id_nascimento_fichas_id_fk
            FOREIGN KEY (nascimento_ficha_id) REFERENCES public.nascimento_fichas(id) ON DELETE set null ON UPDATE no action;`,
    },
    {
      name: 'fichas_animal_categoria_id_animal_categories_id_fk',
      sql: `ALTER TABLE fichas_animal ADD CONSTRAINT fichas_animal_categoria_id_animal_categories_id_fk
            FOREIGN KEY (categoria_id) REFERENCES public.animal_categories(id) ON DELETE set null ON UPDATE no action;`,
    },
    {
      name: 'fichas_animal_criado_por_user_profiles_id_fk',
      sql: `ALTER TABLE fichas_animal ADD CONSTRAINT fichas_animal_criado_por_user_profiles_id_fk
            FOREIGN KEY (criado_por) REFERENCES public.user_profiles(id) ON DELETE set null ON UPDATE no action;`,
    },
  ];
  for (const fk of fks) {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk.name}') THEN
          ${fk.sql}
        END IF;
      END $$;
    `);
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fichas_animal_org ON fichas_animal USING btree (organization_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fichas_animal_farm ON fichas_animal USING btree (farm_id);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS fichas_animal_org_apelido_uidx ON fichas_animal USING btree (organization_id, apelido);`);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'fichas_animal'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela fichas_animal:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
