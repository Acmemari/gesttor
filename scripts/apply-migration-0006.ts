/**
 * Aplica somente a migration 0006 (Mapa de Rebanho) no banco.
 * Lê o arquivo SQL e executa cada statement separado por `--> statement-breakpoint`.
 *
 * Uso: npx tsx scripts/apply-migration-0006.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();
try { dotenv.config({ path: '.env.local', override: true }); } catch {}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');

  const sqlPath = resolve('drizzle/0006_skinny_bill_hollister.sql');
  const raw = readFileSync(sqlPath, 'utf8');
  const statements = raw
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const pool = new Pool({
    connectionString: url.includes('sslmode=') ? url : url + (url.includes('?') ? '&' : '?') + 'sslmode=require',
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log(`[migration] aplicando ${statements.length} statements de 0006_skinny_bill_hollister.sql...`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.split('\n')[0].slice(0, 80);
      console.log(`  [${i + 1}/${statements.length}] ${preview}...`);
      await pool.query(stmt);
    }
    console.log('[migration] OK ✓');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[migration] erro:', err);
  process.exit(1);
});
