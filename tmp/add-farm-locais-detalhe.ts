import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 3º nível do catálogo "Tipos de Locais" (detalhe) por local. Coluna aditiva em
// tabela existente — farm_locais NÃO está no tablesFilter do drizzle.config.ts,
// então usamos ALTER TABLE bruto (idempotente) em vez de push. Texto livre casado
// por nome, espelhando o contrato free-text de `tipo` (sem FK). Nulo ⇒ sem detalhe.
async function main() {
  const stmts = [
    `ALTER TABLE farm_locais ADD COLUMN IF NOT EXISTS detalhe text;`,
  ];
  for (const sql of stmts) await pool.query(sql);

  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'farm_locais'
        AND column_name = 'detalhe'
      ORDER BY column_name;`,
  );
  console.log('OK — tabela farm_locais:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
