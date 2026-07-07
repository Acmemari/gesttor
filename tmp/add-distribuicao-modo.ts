/**
 * Migração aditiva: adiciona a coluna `distribuicao_modo` (trava mútua entre
 * Mapa de Pasto e Distribuição por Categoria) aos headers de Estoque de
 * Partida e Mapão. Idempotente (IF NOT EXISTS).
 *
 * Rodar: npx tsx tmp/add-distribuicao-modo.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { pool } from '../src/DB/index.js';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

async function main() {
  await pool.query(
    `ALTER TABLE mapa_rebanho_headers ADD COLUMN IF NOT EXISTS distribuicao_modo text;`,
  );
  await pool.query(
    `ALTER TABLE mapao_headers ADD COLUMN IF NOT EXISTS distribuicao_modo text;`,
  );
  // Backfill seguro e sem ambiguidade: se um mapa tem lançamento (>0) em 2+
  // locais distintos, só pode ter vindo do Mapa de Pasto — o modo Categoria
  // grava tudo num único local. Isso trava a Categoria nesses mapas já
  // preenchidos. Mapas com dados num único local ficam null (ambíguo) e serão
  // resolvidos no próximo lançamento.
  for (const t of ['mapa_rebanho', 'mapao'] as const) {
    await pool.query(
      `UPDATE ${t}_headers h
         SET distribuicao_modo = 'pasto'
       WHERE h.distribuicao_modo IS NULL
         AND (
           SELECT COUNT(DISTINCT l.local_id) FROM ${t}_lancamentos l
           WHERE l.mapa_header_id = h.id AND l.quantidade > 0
         ) > 1;`,
    );
  }
  console.log('OK: coluna distribuicao_modo adicionada + backfill aplicado.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
