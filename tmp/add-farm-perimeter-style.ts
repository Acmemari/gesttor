import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Estilo do PERÍMETRO (nível Fazenda) no Cadastro de Áreas: cor da linha, do
// preenchimento, opacidade (0–1) e espessura (px). Colunas aditivas na tabela
// `farms` (que está fora do tablesFilter do drizzle.config.ts) → ALTER TABLE bruto
// idempotente em vez de push. Nulo ⇒ usa o padrão do nível Fazenda (NIVEIS).
// Espelha o que farm_retiros/farm_setores já têm (ver add-area-style-colors.ts).
async function main() {
  const stmts = [
    `ALTER TABLE farms ADD COLUMN IF NOT EXISTS stroke_color text;`,
    `ALTER TABLE farms ADD COLUMN IF NOT EXISTS fill_color text;`,
    `ALTER TABLE farms ADD COLUMN IF NOT EXISTS fill_opacity numeric;`,
    `ALTER TABLE farms ADD COLUMN IF NOT EXISTS stroke_weight numeric;`,
  ];
  for (const sql of stmts) await pool.query(sql);

  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'farms'
        AND column_name IN ('stroke_color', 'fill_color', 'fill_opacity', 'stroke_weight')
      ORDER BY column_name;`,
  );
  console.log('OK — tabela farms:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
