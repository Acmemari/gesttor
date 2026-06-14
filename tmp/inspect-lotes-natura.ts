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
  const farmsRes = await pool.query(
    `SELECT id, name, organization_id FROM farms WHERE name ILIKE '%natura%' ORDER BY name;`,
  );
  console.log('=== Fazendas com "natura" no nome ===');
  console.table(farmsRes.rows);

  const lotesRes = await pool.query(
    `SELECT id, nome, codigo, finalidade, farm_id, retiro, organization_id
       FROM lotes
      ORDER BY organization_id, ordem, nome;`,
  );
  console.log(`\n=== Todos os lotes (${lotesRes.rowCount}) ===`);
  console.table(
    lotesRes.rows.map((r) => ({
      nome: r.nome,
      codigo: r.codigo,
      finalidade: r.finalidade,
      farm_id: r.farm_id,
      retiro: r.retiro,
      org: r.organization_id,
    })),
  );

  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
