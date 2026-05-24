/** Diagnóstico: lista orçamentos no banco com org/farm/safra/criador. */
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

import { pool } from '../index.js';

async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(`
      SELECT o.id, o.nome, o.safra, o.organization_id, o.criado_por, o.arquivado, o.created_at,
             org.name AS org_name,
             (SELECT string_agg(f.name, ', ') FROM orcamento_farms of2 JOIN farms f ON f.id = of2.farm_id WHERE of2.orcamento_id = o.id) AS fazendas
      FROM orcamentos o
      LEFT JOIN organizations org ON org.id = o.organization_id
      ORDER BY o.created_at DESC
    `);
    console.log(`Total: ${r.rows.length}\n`);
    for (const row of r.rows) {
      console.log(`- ${row.nome}`);
      console.log(`  id=${row.id}`);
      console.log(`  org=${row.org_name} (${row.organization_id})`);
      console.log(`  safra=${row.safra} · arquivado=${row.arquivado} · criado=${row.created_at?.toISOString?.() ?? row.created_at}`);
      console.log(`  fazendas=${row.fazendas ?? '—'}`);
      console.log(`  criador=${row.criado_por}`);
      console.log('');
    }
  } finally {
    client.release();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
