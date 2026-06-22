/**
 * Renomeia a categoria de Tipos de Locais "Floresta" → "Silvicultura" nas orgs
 * que já têm o catálogo semeado (o DEFAULT_CATALOGO/seed já nasce "Silvicultura").
 *
 * Idempotente e seguro:
 *   - só altera linhas cujo nome é "Floresta" (case-insensitive);
 *   - pula a org que já tenha uma categoria "Silvicultura" (não duplica/conflita).
 *   - NÃO mexe nos tipos-filhos ("Floresta nativa"/"Floresta plantada").
 *
 * Uso:
 *   npx tsx tmp/rename-floresta-silvicultura.ts --dry-run
 *   npx tsx tmp/rename-floresta-silvicultura.ts
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const sel = await pool.query(`
    SELECT o.name AS org
    FROM tipo_local_categorias c
    JOIN organizations o ON o.id = c.organization_id
    WHERE lower(trim(c.nome)) = 'floresta'
      AND NOT EXISTS (
        SELECT 1 FROM tipo_local_categorias s
        WHERE s.organization_id = c.organization_id AND lower(trim(s.nome)) = 'silvicultura'
      )
    ORDER BY o.name
  `);
  const rows = sel.rows as { org: string }[];
  console.log(`Categorias "Floresta" a renomear: ${rows.length}`);
  rows.forEach((r) => console.log(`  - ${r.org}`));

  const skip = await pool.query(`
    SELECT COUNT(*)::int AS n FROM tipo_local_categorias c
    WHERE lower(trim(c.nome)) = 'floresta'
      AND EXISTS (SELECT 1 FROM tipo_local_categorias s
                  WHERE s.organization_id = c.organization_id AND lower(trim(s.nome)) = 'silvicultura')
  `);
  if (skip.rows[0].n) console.log(`(${skip.rows[0].n} "Floresta" puladas — org já tem "Silvicultura")`);

  if (DRY_RUN) {
    console.log('[DRY-RUN] Nenhuma escrita realizada.');
    await pool.end();
    return;
  }

  const upd = await pool.query(`
    UPDATE tipo_local_categorias c
    SET nome = 'Silvicultura', updated_at = now()
    WHERE lower(trim(c.nome)) = 'floresta'
      AND NOT EXISTS (SELECT 1 FROM tipo_local_categorias s
                      WHERE s.organization_id = c.organization_id AND lower(trim(s.nome)) = 'silvicultura')
  `);
  console.log(`\n✓ ${upd.rowCount} categoria(s) renomeada(s) para "Silvicultura".`);
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
