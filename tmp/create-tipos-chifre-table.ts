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
    CREATE TABLE IF NOT EXISTS tipos_chifre (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      nome text NOT NULL,
      descricao text,
      ativo boolean DEFAULT true NOT NULL,
      ordem integer DEFAULT 0 NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // FK para organizations (idempotente: só cria se ainda não existir)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tipos_chifre_organization_id_organizations_id_fk'
      ) THEN
        ALTER TABLE tipos_chifre
          ADD CONSTRAINT tipos_chifre_organization_id_organizations_id_fk
          FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tipos_chifre_org_id ON tipos_chifre USING btree (organization_id);
  `);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'tipos_chifre'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela tipos_chifre:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
