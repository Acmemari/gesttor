/**
 * Verificação rápida pós-migração: conta registros nas 7 tabelas orçamentárias.
 * Uso: tsx src/DB/seed/verifyOrcamentaria.ts
 */
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

import { pool } from '../index.js';

const TABELAS = [
  'plano_contas',
  'orcamentos',
  'orcamento_farms',
  'orcamento_colaboradores',
  'orcamento_versoes',
  'premissas',
  'log_auditoria_orcamento',
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('Tabelas orçamentárias:');
    for (const t of TABELAS) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
      console.log(`  ${t.padEnd(30)} ${r.rows[0].n}`);
    }
    const r = await client.query(
      `SELECT numero, nome, nivel, is_folha FROM plano_contas ORDER BY numero LIMIT 10`,
    );
    console.log('\nAmostra de plano_contas:');
    for (const row of r.rows) {
      console.log(`  ${row.numero.padEnd(8)} ${row.nome.padEnd(40)} nivel=${row.nivel} folha=${row.is_folha}`);
    }
  } finally {
    client.release();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
