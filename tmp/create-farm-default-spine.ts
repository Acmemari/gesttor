import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Feature 2 — registros padrão (âncora) por nível. Generaliza farm_retiros.is_default
// para setor e local. Índices parciais garantem no máx. 1 padrão por fazenda em cada
// nível (find-or-create à prova de corrida; sem duplicar).
async function main() {
  await pool.query(`ALTER TABLE farm_setores ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;`);
  await pool.query(`ALTER TABLE farm_locais  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;`);

  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_retiros_default ON farm_retiros (farm_id) WHERE is_default;`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_setores_default ON farm_setores (farm_id) WHERE is_default;`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_locais_default ON farm_locais (farm_id) WHERE is_default;`,
  );

  const summary = async (table: string) => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = 'is_default';`,
      [table],
    );
    return rows;
  };
  const idx = async (name: string) => {
    const { rows } = await pool.query(`SELECT indexname FROM pg_indexes WHERE indexname = $1;`, [name]);
    return rows.length ? 'OK' : 'FALTANDO';
  };
  console.log('OK — farm_setores.is_default:', JSON.stringify(await summary('farm_setores')));
  console.log('OK — farm_locais.is_default:', JSON.stringify(await summary('farm_locais')));
  console.log('idx uq_farm_retiros_default:', await idx('uq_farm_retiros_default'));
  console.log('idx uq_farm_setores_default:', await idx('uq_farm_setores_default'));
  console.log('idx uq_farm_locais_default:', await idx('uq_farm_locais_default'));
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
