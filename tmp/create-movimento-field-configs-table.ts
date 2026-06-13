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
    CREATE TABLE IF NOT EXISTS movimento_field_configs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      tipo text NOT NULL,
      config jsonb DEFAULT '{}' NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // FK para organizations (idempotente: só cria se ainda não existir)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'movimento_field_configs_organization_id_organizations_id_fk'
      ) THEN
        ALTER TABLE movimento_field_configs
          ADD CONSTRAINT movimento_field_configs_organization_id_organizations_id_fk
          FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;
  `);

  // Unique por (organização, tipo): 1 configuração por movimento.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS movimento_field_config_org_tipo_uidx
      ON movimento_field_configs USING btree (organization_id, tipo);
  `);

  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'movimento_field_configs'
     ORDER BY ordinal_position;
  `);
  console.log('OK — tabela movimento_field_configs:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
