import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Remove os detalhes (tipo_local_detalhes) do tipo "Pastagem cultivada" em TODAS
 * as orgs. Esses registros viraram lista de texto morta: o 3º nível de "Pastagem
 * cultivada" passou a ser projetado (read-only) do cadastro de Espécies Forrageiras.
 * Idempotente — rodar de novo não faz nada se já estiver limpo.
 */
async function main() {
  const { rows } = await pool.query(
    `DELETE FROM tipo_local_detalhes d
       USING tipos_local t
      WHERE d.tipo_id = t.id
        AND lower(trim(t.nome)) = 'pastagem cultivada'
      RETURNING d.id, d.nome, d.organization_id`,
  );
  console.log(`Removidos ${rows.length} detalhe(s) de "Pastagem cultivada".`);
  for (const r of rows) console.log(`  - ${r.nome}  (org ${r.organization_id})`);
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
