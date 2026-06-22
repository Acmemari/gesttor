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
  // ── Detalhes de tipo de local (3º nível: categoria › tipo › detalhe) ───────
  // Sub-lista inline de um tipo (ex.: Pastagem cultivada › Capim-Marandu,
  // Silagem › Milho/Sorgo). Um tipo sem detalhes simplesmente não tem 3º nível.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tipo_local_detalhes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL,
      tipo_id uuid NOT NULL,
      nome text NOT NULL,
      cor text,
      icone text,
      ordem integer DEFAULT 0 NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tipo_local_detalhes_organization_id_organizations_id_fk'
      ) THEN
        ALTER TABLE tipo_local_detalhes
          ADD CONSTRAINT tipo_local_detalhes_organization_id_organizations_id_fk
          FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
          ON DELETE cascade ON UPDATE no action;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tipo_local_detalhes_tipo_id_tipos_local_id_fk'
      ) THEN
        ALTER TABLE tipo_local_detalhes
          ADD CONSTRAINT tipo_local_detalhes_tipo_id_tipos_local_id_fk
          FOREIGN KEY (tipo_id) REFERENCES public.tipos_local(id)
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tipo_local_detalhes_org_id ON tipo_local_detalhes USING btree (organization_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tipo_local_detalhes_tipo_id ON tipo_local_detalhes USING btree (tipo_id);
  `);

  for (const table of ['tipo_local_detalhes']) {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;`,
      [table],
    );
    console.log(`OK — tabela ${table}:`, JSON.stringify(rows, null, 2));
  }
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
