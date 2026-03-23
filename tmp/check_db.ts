import { Client } from 'pg';
import fs from 'fs';
import 'dotenv/config';

async function checkDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  
  const tables = ['pessoa_fazendas', 'pessoa_perfis', 'pessoa_permissoes', 'person_farms', 'person_profiles', 'person_permissions'];
  const log: string[] = [];
  
  for (const table of tables) {
    try {
      const res = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      log.push(`${table}: ${res.rows[0].count} rows`);
    } catch (e: any) {
      log.push(`${table}: NOT FOUND`);
    }
  }
  await client.end();
  fs.writeFileSync('c:/gesttor/tmp/db_log.txt', log.join('\n'));
}

checkDb().catch(console.error);
