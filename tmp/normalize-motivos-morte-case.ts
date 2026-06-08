import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Primeira letra maiúscula, demais minúsculas (ex.: "ENROSCADO NA CERCA" → "Enroscado na cerca"). */
function toSentenceCase(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

async function main() {
  const { rows } = await pool.query<{ id: string; nome: string }>(
    `SELECT id, nome FROM motivos_morte ORDER BY nome;`,
  );

  let changed = 0;
  for (const r of rows) {
    const novo = toSentenceCase(r.nome);
    if (novo !== r.nome) {
      await pool.query(
        `UPDATE motivos_morte SET nome = $1, updated_at = now() WHERE id = $2;`,
        [novo, r.id],
      );
      console.log(`  "${r.nome}" → "${novo}"`);
      changed++;
    }
  }

  console.log(`\nOK — ${changed} de ${rows.length} motivo(s) normalizado(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
