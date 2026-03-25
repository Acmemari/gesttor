/**
 * Normaliza kanban_status em initiative_tasks para lowercase.
 * Uso: node scripts/run-kanban-status-migration.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não definida no .env.local ou .env');
  process.exit(1);
}

const statements = [
  { sql: "UPDATE initiative_tasks SET kanban_status = 'a fazer'      WHERE kanban_status = 'A Fazer'",   label: "A Fazer → a fazer" },
  { sql: "UPDATE initiative_tasks SET kanban_status = 'em andamento' WHERE kanban_status = 'Andamento'", label: "Andamento → em andamento" },
  { sql: "UPDATE initiative_tasks SET kanban_status = 'pausada'      WHERE kanban_status = 'Pausado'",   label: "Pausado → pausada" },
  { sql: "UPDATE initiative_tasks SET kanban_status = 'concluída'    WHERE kanban_status = 'Concluído'", label: "Concluído → concluída" },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();

let updated = 0;
for (const { sql, label } of statements) {
  const result = await client.query(sql);
  console.log(`✓ ${label} (${result.rowCount} linhas)`);
  updated += result.rowCount ?? 0;
}

client.release();
await pool.end();
console.log(`\nMigração concluída. ${updated} registros atualizados.`);
