import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Árvore genealógica da Ficha Animal: adiciona as duas avós (mãe do pai e mãe da
// mãe), completando os 4 avós. Colunas dedicadas, espelhando avo_paterno/avo_materno.
async function main() {
  await pool.query(`ALTER TABLE fichas_animal ADD COLUMN IF NOT EXISTS avo_paterna text;`);
  await pool.query(`ALTER TABLE fichas_animal ADD COLUMN IF NOT EXISTS avo_materna text;`);

  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_name = 'fichas_animal' AND column_name IN
       ('pai','mae','avo_paterno','avo_paterna','avo_materno','avo_materna')
     ORDER BY column_name;`,
  );
  console.log('OK — fichas_animal genealogia:', JSON.stringify(rows));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
