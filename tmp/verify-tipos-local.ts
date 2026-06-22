import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();
if (fs.existsSync('.env.local')) { const e = dotenv.parse(fs.readFileSync('.env.local')); for (const k in e) process.env[k] = e[k]; }
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const org = (await pool.query(`SELECT id, name FROM organizations WHERE name = 'Inttegra' LIMIT 1`)).rows[0];
  const cats = (await pool.query(`SELECT id, nome, cor, icone, ordem FROM tipo_local_categorias WHERE organization_id=$1 ORDER BY ordem`, [org.id])).rows;
  console.log(`Org ${org.name}: ${cats.length} categorias`);
  for (const c of cats) {
    const tipos = (await pool.query(`SELECT nome, icone, ordem FROM tipos_local WHERE categoria_id=$1 ORDER BY ordem`, [c.id])).rows;
    console.log(`  ${c.icone} ${c.nome} (${c.cor}) — ${tipos.length} tipos: ${tipos.map((t:any)=>t.nome).join(' | ')}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
