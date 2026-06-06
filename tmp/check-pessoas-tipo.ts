import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
if (fs.existsSync('.env.local')) {
  const c = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in c) process.env[k] = c[k];
}
const { pool } = await import('../src/DB/index.js');
const r = await pool.query(
  `select id, full_name, tipo, ativo, organization_id
     from people
    order by full_name
    limit 50`,
);
for (const row of r.rows as any[]) {
  console.log(
    JSON.stringify({ nome: row.full_name, tipo: row.tipo, ativo: row.ativo, org: row.organization_id }),
  );
}
console.log('TOTAL:', r.rows.length);
await pool.end();
process.exit(0);
