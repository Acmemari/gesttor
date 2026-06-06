import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
if (fs.existsSync('.env.local')) {
  const c = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in c) process.env[k] = c[k];
}
const { pool } = await import('../src/DB/index.js');
const r = await pool.query(
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('nascimento_movimentos','nascimento_fichas') order by table_name",
);
console.log('TABELAS ENCONTRADAS:', r.rows.map((x: any) => x.table_name));
await pool.end();
process.exit(0);
