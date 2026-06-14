import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Feature 1 — "data inicial" do cadastro de áreas. Coluna por linha (nullable;
// linhas legadas ficam NULL). Captura única por tela; carimbada em cada save.
async function main() {
  await pool.query(`ALTER TABLE farm_retiros ADD COLUMN IF NOT EXISTS data_inicial date;`);
  await pool.query(`ALTER TABLE farm_setores ADD COLUMN IF NOT EXISTS data_inicial date;`);
  await pool.query(`ALTER TABLE farm_locais  ADD COLUMN IF NOT EXISTS data_inicial date;`);

  const summary = async (table: string) => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = 'data_inicial';`,
      [table],
    );
    return rows;
  };
  console.log('OK — farm_retiros.data_inicial:', JSON.stringify(await summary('farm_retiros')));
  console.log('OK — farm_setores.data_inicial:', JSON.stringify(await summary('farm_setores')));
  console.log('OK — farm_locais.data_inicial:', JSON.stringify(await summary('farm_locais')));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
