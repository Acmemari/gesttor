import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();
if (fs.existsSync('.env.local')) {
  const e = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in e) process.env[k] = e[k];
}
import { pool } from '../src/DB/index.js';
const nn = await pool.query(`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name='people' AND is_nullable='NO'`);
console.log('NOT NULL columns:'); console.log(nn.rows.map((r:any)=>`  ${r.column_name} (${r.data_type})`).join('\n'));
const idx = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='people'`);
console.log('\nINDEXES:'); idx.rows.forEach((r:any)=>console.log('  '+r.indexdef));
const con = await pool.query(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='people'::regclass`);
console.log('\nCONSTRAINTS:'); con.rows.forEach((r:any)=>console.log('  '+r.conname+': '+r.def));
process.exit(0);
