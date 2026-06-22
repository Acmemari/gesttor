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
  // Organizações
  const orgs = await pool.query(`SELECT id, name AS nome FROM organizations ORDER BY name`);

  for (const org of orgs.rows) {
    // Detalhes (3º nível) do tipo "Pastagem cultivada"
    const det = await pool.query(
      `SELECT d.nome, d.ordem
         FROM tipo_local_detalhes d
         JOIN tipos_local t ON t.id = d.tipo_id
        WHERE d.organization_id = $1
          AND lower(trim(t.nome)) = 'pastagem cultivada'
        ORDER BY d.ordem`,
      [org.id],
    );

    // Espécies forrageiras cadastradas
    const esp = await pool.query(
      `SELECT nome, nome_cientifico, ordem
         FROM especies_forrageiras
        WHERE organization_id = $1
        ORDER BY ordem`,
      [org.id],
    );

    if (det.rows.length === 0 && esp.rows.length === 0) continue;

    console.log('\n========================================================');
    console.log(`ORG: ${org.nome}  (${org.id})`);
    console.log('--- Tipos de Locais › "Pastagem cultivada" (detalhes/3º nível) ---');
    if (det.rows.length === 0) console.log('  (nenhum detalhe)');
    det.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.nome}  [ordem=${r.ordem}]`));

    console.log('--- Cadastro de Espécies Forrageiras ---');
    if (esp.rows.length === 0) console.log('  (nenhuma espécie cadastrada)');
    esp.rows.forEach((r, i) =>
      console.log(`  ${i + 1}. ${r.nome}${r.nome_cientifico ? ` (${r.nome_cientifico})` : ''}  [ordem=${r.ordem}]`),
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
