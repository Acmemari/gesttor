import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Espessura da linha (perímetro) por área (Retiro/Setor) no Cadastro de Áreas.
// Coluna aditiva em tabelas existentes — farm_retiros/farm_setores NÃO estão no
// tablesFilter do drizzle.config.ts, então usamos ALTER TABLE bruto (idempotente)
// em vez de push. Nulo ⇒ usa a espessura padrão do nível. Em px.
async function main() {
  const stmts = [
    `ALTER TABLE farm_retiros ADD COLUMN IF NOT EXISTS stroke_weight numeric;`,
    `ALTER TABLE farm_setores ADD COLUMN IF NOT EXISTS stroke_weight numeric;`,
  ];
  for (const sql of stmts) await pool.query(sql);

  for (const table of ['farm_retiros', 'farm_setores']) {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = $1
          AND column_name = 'stroke_weight'
        ORDER BY column_name;`,
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
