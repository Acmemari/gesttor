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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS animal_breeds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      nome text NOT NULL,
      ordem integer DEFAULT 0 NOT NULL,
      ativo boolean DEFAULT true NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // FK para organizations (idempotente: só cria se ainda não existir)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'animal_breeds_organization_id_organizations_id_fk'
      ) THEN
        ALTER TABLE animal_breeds
          ADD CONSTRAINT animal_breeds_organization_id_organizations_id_fk
          FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_animal_breeds_org_id ON animal_breeds USING btree (organization_id);
  `);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'animal_breeds'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela animal_breeds:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
