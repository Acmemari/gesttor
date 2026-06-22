/**
 * Padroniza o tipo de local "Capineira / forrageira de corte" → "Forrageira de
 * corte/Silagem/Feno" em TODAS as organizações (alinha ao novo nome canônico,
 * que é tipo do sistema protegido + seletor de Espécies Forrageiras).
 *
 * Idempotente e seguro:
 *   - só altera linhas cujo nome é "Capineira / forrageira de corte" (case-insensitive);
 *   - pula a org que JÁ tenha "Forrageira de corte/Silagem/Feno" (não duplica/conflita);
 *   - NÃO mexe em "Silagem / Cultura anual" (segue como tipo separado, como na org
 *     de referência Reunidas Floresta) nem nos detalhes existentes.
 *
 * Uso:
 *   npx tsx tmp/rename-forrageira-corte.ts --dry-run
 *   npx tsx tmp/rename-forrageira-corte.ts
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
const DE = 'capineira / forrageira de corte';
const PARA = 'Forrageira de corte/Silagem/Feno';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Orgs com o nome legado e SEM o nome canônico (a renomear de fato).
  const sel = await pool.query(
    `
    SELECT o.name AS org, t.id
    FROM tipos_local t
    JOIN organizations o ON o.id = t.organization_id
    WHERE lower(trim(t.nome)) = $1
      AND NOT EXISTS (
        SELECT 1 FROM tipos_local s
        WHERE s.organization_id = t.organization_id
          AND lower(trim(s.nome)) = lower(trim($2))
      )
    ORDER BY o.name
    `,
    [DE, PARA],
  );
  const rows = sel.rows as { org: string; id: string }[];
  console.log(`Tipos "Capineira / forrageira de corte" a renomear: ${rows.length}`);
  rows.forEach((r) => console.log(`  - ${r.org}`));

  // Orgs puladas porque já têm o nome canônico (evita duplicar).
  const skip = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM tipos_local t
    WHERE lower(trim(t.nome)) = $1
      AND EXISTS (
        SELECT 1 FROM tipos_local s
        WHERE s.organization_id = t.organization_id
          AND lower(trim(s.nome)) = lower(trim($2))
      )
    `,
    [DE, PARA],
  );
  if (skip.rows[0].n) console.log(`(${skip.rows[0].n} pulada(s) — org já tem "${PARA}")`);

  if (DRY_RUN) {
    console.log('[DRY-RUN] Nenhuma escrita realizada.');
    await pool.end();
    return;
  }

  const upd = await pool.query(
    `
    UPDATE tipos_local t
    SET nome = $2, updated_at = now()
    WHERE lower(trim(t.nome)) = $1
      AND NOT EXISTS (
        SELECT 1 FROM tipos_local s
        WHERE s.organization_id = t.organization_id
          AND lower(trim(s.nome)) = lower(trim($2))
      )
    `,
    [DE, PARA],
  );
  console.log(`\n✓ ${upd.rowCount} tipo(s) renomeado(s) para "${PARA}".`);
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
