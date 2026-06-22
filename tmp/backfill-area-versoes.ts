/**
 * Backfill da linha do tempo (area_versoes): semeia UMA versão aberta
 * (valid_to = NULL) para cada retiro/setor/local já cadastrado, formando a
 * baseline a partir da qual o slider reconstrói o mapa. Sem isto, datas
 * anteriores ao primeiro movimento não teriam o que mostrar.
 *
 * - valid_from  = COALESCE(data_inicial, created_at::date)
 * - geometry / geometry_source / area_ha vêm da própria identidade (área já em ha)
 * - uso = NULL (eixo distinto de `tipo`; não há dado de uso a herdar)
 * - movimento_id = NULL (baseline sintética, sem evento de ledger)
 * - Locais: só status='ativo' (aposentados ficam sem versão aberta — invariante).
 *
 * Idempotente: só insere onde a identidade ainda não tem versão aberta.
 * Pré-requisito: rodar antes `npx tsx tmp/create-area-versoes-table.ts`.
 *
 * Rodar: npx tsx tmp/backfill-area-versoes.ts
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // 1) RETIROS.
  const retiros = await pool.query(`
    INSERT INTO area_versoes
      (area_id, nivel, organization_id, farm_id, valid_from, valid_to,
       geometry, geometry_source, uso, area_ha, movimento_id)
    SELECT r.id, 'retiro', f.organization_id, r.farm_id,
           COALESCE(r.data_inicial, r.created_at::date), NULL,
           r.geometry, r.geometry_source, NULL, r.total_area::numeric, NULL
      FROM farm_retiros r
      JOIN farms f ON f.id = r.farm_id
     WHERE NOT EXISTS (
       SELECT 1 FROM area_versoes v WHERE v.area_id = r.id AND v.valid_to IS NULL
     );
  `);

  // 2) SETORES.
  const setores = await pool.query(`
    INSERT INTO area_versoes
      (area_id, nivel, organization_id, farm_id, valid_from, valid_to,
       geometry, geometry_source, uso, area_ha, movimento_id)
    SELECT s.id, 'setor', f.organization_id, s.farm_id,
           COALESCE(s.data_inicial, s.created_at::date), NULL,
           s.geometry, s.geometry_source, NULL, s.area::numeric, NULL
      FROM farm_setores s
      JOIN farms f ON f.id = s.farm_id
     WHERE NOT EXISTS (
       SELECT 1 FROM area_versoes v WHERE v.area_id = s.id AND v.valid_to IS NULL
     );
  `);

  // 3) LOCAIS (somente ativos).
  const locais = await pool.query(`
    INSERT INTO area_versoes
      (area_id, nivel, organization_id, farm_id, valid_from, valid_to,
       geometry, geometry_source, uso, area_ha, movimento_id)
    SELECT l.id, 'local', f.organization_id, l.farm_id,
           COALESCE(l.data_inicial, l.created_at::date), NULL,
           l.geometry, l.geometry_source, l.uso, l.area::numeric, NULL
      FROM farm_locais l
      JOIN farms f ON f.id = l.farm_id
     WHERE l.status = 'ativo'
       AND NOT EXISTS (
         SELECT 1 FROM area_versoes v WHERE v.area_id = l.id AND v.valid_to IS NULL
       );
  `);

  console.log('Backfill area_versoes concluído:');
  console.log(`  retiros : ${retiros.rowCount} versões`);
  console.log(`  setores : ${setores.rowCount} versões`);
  console.log(`  locais  : ${locais.rowCount} versões`);

  const { rows } = await pool.query(`
    SELECT nivel, count(*)::int AS total FROM area_versoes GROUP BY nivel ORDER BY nivel;
  `);
  console.log('Totais por nível:', JSON.stringify(rows, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
