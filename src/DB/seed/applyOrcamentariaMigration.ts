/**
 * Aplica a migração filtrada da Gestão Orçamentária no banco.
 *
 * Lê `drizzle/0004_orcamentos_only.sql`, divide por `--> statement-breakpoint`
 * e executa cada statement em sequência via Pool do pg.
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS` + `DO $$ BEGIN ... EXCEPTION
 * WHEN duplicate_object` em todas as constraints, então pode rodar 2x sem efeito
 * colateral.
 *
 * Uso: tsx src/DB/seed/applyOrcamentariaMigration.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

import { pool } from '../index.js';

async function main() {
  const sqlPath = path.resolve('drizzle', '0004_lying_mandarin.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`[migrate] Arquivo não encontrado: ${sqlPath}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((chunk) =>
      // Remove linhas de comentário ("-- ...") preservando o SQL.
      chunk
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);

  console.log(`[migrate] aplicando ${statements.length} statements…`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 80).replace(/\s+/g, ' ');
      console.log(`  [${i + 1}/${statements.length}] ${preview}…`);
      await client.query(stmt);
    }
    await client.query('COMMIT');
    console.log('[migrate] concluído.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] erro, rollback aplicado:', err);
    process.exit(1);
  } finally {
    client.release();
  }
  process.exit(0);
}

main();
