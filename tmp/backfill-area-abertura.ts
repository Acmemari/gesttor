/**
 * Backfill do ledger area_movimentos: grava um evento de ABERTURA para cada área
 * já cadastrada (retiro/setor/local) e um evento de nível de linha-base por
 * fazenda que tenha config explícita em farm_location_levels.
 *
 * Idempotente: só insere onde ainda não existe a abertura/baseline correspondente.
 * Pré-requisito: rodar antes `npx tsx tmp/create-area-movimentos-table.ts`.
 * (Crítico: registrar a abertura ANTES de qualquer movimento — o passado não se
 * reconstrói depois.)
 *
 * Rodar: npx tsx tmp/backfill-area-abertura.ts
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
  // 1) Abertura dos LOCAIS.
  const locais = await pool.query(`
    INSERT INTO area_movimentos
      (organization_id, farm_id, nivel, tipo, classe, data, area_id, depois, dados, nota, created_at)
    SELECT f.organization_id, l.farm_id, 'local', 'abertura', 'movimento',
           l.created_at::date, l.id,
           jsonb_build_object(
             'name', l.name, 'area', l.area, 'geometry', l.geometry,
             'geometrySource', l.geometry_source, 'tipo', l.tipo,
             'retiroId', l.retiro_id, 'setorId', l.setor_id),
           '{}'::jsonb, 'abertura (backfill)', now()
      FROM farm_locais l
      JOIN farms f ON f.id = l.farm_id
     WHERE NOT EXISTS (
       SELECT 1 FROM area_movimentos m WHERE m.area_id = l.id AND m.tipo = 'abertura'
     );
  `);

  // 2) Abertura dos SETORES.
  const setores = await pool.query(`
    INSERT INTO area_movimentos
      (organization_id, farm_id, nivel, tipo, classe, data, area_id, depois, dados, nota, created_at)
    SELECT f.organization_id, s.farm_id, 'setor', 'abertura', 'movimento',
           s.created_at::date, s.id,
           jsonb_build_object(
             'name', s.name, 'area', s.area, 'geometry', s.geometry,
             'geometrySource', s.geometry_source, 'tipo', NULL,
             'retiroId', s.retiro_id, 'setorId', NULL),
           '{}'::jsonb, 'abertura (backfill)', now()
      FROM farm_setores s
      JOIN farms f ON f.id = s.farm_id
     WHERE NOT EXISTS (
       SELECT 1 FROM area_movimentos m WHERE m.area_id = s.id AND m.tipo = 'abertura'
     );
  `);

  // 3) Abertura dos RETIROS.
  const retiros = await pool.query(`
    INSERT INTO area_movimentos
      (organization_id, farm_id, nivel, tipo, classe, data, area_id, depois, dados, nota, created_at)
    SELECT f.organization_id, r.farm_id, 'retiro', 'abertura', 'movimento',
           r.created_at::date, r.id,
           jsonb_build_object(
             'name', r.name, 'area', r.total_area, 'geometry', r.geometry,
             'geometrySource', r.geometry_source, 'tipo', NULL,
             'retiroId', NULL, 'setorId', NULL),
           '{}'::jsonb, 'abertura (backfill)', now()
      FROM farm_retiros r
      JOIN farms f ON f.id = r.farm_id
     WHERE NOT EXISTS (
       SELECT 1 FROM area_movimentos m WHERE m.area_id = r.id AND m.tipo = 'abertura'
     );
  `);

  // 4) Linha-base de NÍVEIS por fazenda (só onde há config explícita).
  const niveis = await pool.query(`
    INSERT INTO area_movimentos
      (organization_id, farm_id, nivel, tipo, classe, data, area_id, dados, nota, created_at)
    SELECT f.organization_id, ll.farm_id, 'fazenda', 'nivel', 'movimento',
           ll.updated_at::date, NULL,
           jsonb_build_object(
             'para', jsonb_build_object('retiro', ll.retiro, 'setor', ll.setor, 'local', ll.local),
             'baseline', true),
           'abertura (backfill)', now()
      FROM farm_location_levels ll
      JOIN farms f ON f.id = ll.farm_id
     WHERE NOT EXISTS (
       SELECT 1 FROM area_movimentos m
        WHERE m.farm_id = ll.farm_id AND m.tipo = 'nivel' AND m.nota = 'abertura (backfill)'
     );
  `);

  console.log('Backfill concluído:');
  console.log(`  locais   : ${locais.rowCount} aberturas`);
  console.log(`  setores  : ${setores.rowCount} aberturas`);
  console.log(`  retiros  : ${retiros.rowCount} aberturas`);
  console.log(`  níveis   : ${niveis.rowCount} linhas-base`);

  const { rows } = await pool.query(`
    SELECT tipo, count(*)::int AS total FROM area_movimentos GROUP BY tipo ORDER BY tipo;
  `);
  console.log('Totais por tipo:', JSON.stringify(rows, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
