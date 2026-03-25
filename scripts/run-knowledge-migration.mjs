/**
 * Aplica a migração das tabelas do RAG (knowledge_*) no banco Neon.
 * Não requer psql — usa a mesma conexão pg do app.
 *
 * Uso: node scripts/run-knowledge-migration.mjs
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Carrega variáveis de ambiente (mesma ordem do app)
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não definida no .env.local ou .env');
  process.exit(1);
}

console.log('Conectando ao banco...');

const sqlFile = path.join(__dirname, 'migrate-knowledge-tables.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

// Divide em statements individuais para identificar exatamente qual falha
// Normaliza CRLF → LF antes de processar
const normalizedSql = sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const statements = normalizedSql
  .split(/;\n/)
  .map(s => {
    // Remove linhas que são só comentários do início do statement
    const lines = s.split('\n').filter(l => !l.trimStart().startsWith('--'));
    return lines.join('\n').trim();
  })
  .filter(s => s.length > 0);

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const client = await pool.connect();
let ok = 0;
let failed = 0;

for (const stmt of statements) {
  const preview = stmt.substring(0, 70).replace(/\n/g, ' ');
  try {
    await client.query(stmt);
    console.log(`✓ ${preview}...`);
    ok++;
  } catch (err) {
    console.error(`✗ FALHOU: ${preview}...`);
    console.error(`  → ${err.message}`);
    failed++;
  }
}

client.release();
await pool.end();

console.log(`\nResultado: ${ok} OK | ${failed} falhou`);

if (failed > 0) {
  console.log('\nSe o erro foi "could not open extension control file" ou similar,');
  console.log('habilite o pgvector no Neon Console antes de rodar novamente:');
  console.log('  SQL Editor → CREATE EXTENSION IF NOT EXISTS vector;');
  process.exit(1);
} else {
  console.log('\nMigração aplicada com sucesso! As tabelas knowledge_* foram criadas.');
}
