import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Backfill da Feature 2 (rodar APÓS create-farm-default-spine.ts). Idempotente:
//  1. Garante a spine padrão das fazendas com algum nível desligado.
//  2. Ancora movimentos órfãos (local_id NULL) no local padrão da fazenda.
// Replica a lógica de ensureDefaultSpine/resolveDefaultLocalId do repositório.

type Levels = { retiro: boolean; setor: boolean; local: boolean };

const MOV_TABLES = [
  'nascimento_movimentos',
  'morte_movimentos',
  'consumo_movimentos',
  'desmame_movimentos',
  'mudanca_categoria_movimentos',
  'venda_movimentos',
  'compra_movimentos',
];

async function findDefault(table: string, farmId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM ${table} WHERE farm_id = $1 AND is_default LIMIT 1;`,
    [farmId],
  );
  return rows[0]?.id ?? null;
}

async function ensureDefaultRetiro(farmId: string, name: string): Promise<string> {
  const found = await findDefault('farm_retiros', farmId);
  if (found) return found;
  const ins = await pool.query(
    `INSERT INTO farm_retiros (farm_id, name, is_default) VALUES ($1, $2, true)
     ON CONFLICT DO NOTHING RETURNING id;`,
    [farmId, name],
  );
  return ins.rows[0]?.id ?? (await findDefault('farm_retiros', farmId))!;
}

async function ensureDefaultSetor(farmId: string, name: string, retiroId: string | null): Promise<string> {
  const found = await findDefault('farm_setores', farmId);
  if (found) return found;
  const ins = await pool.query(
    `INSERT INTO farm_setores (farm_id, retiro_id, name, is_default) VALUES ($1, $2, $3, true)
     ON CONFLICT DO NOTHING RETURNING id;`,
    [farmId, retiroId, name],
  );
  return ins.rows[0]?.id ?? (await findDefault('farm_setores', farmId))!;
}

async function ensureDefaultLocal(
  farmId: string, name: string, retiroId: string | null, setorId: string | null,
): Promise<string> {
  const found = await findDefault('farm_locais', farmId);
  if (found) return found;
  // status é omitido de propósito: a coluna pode não existir nesta base; onde
  // existir, o DEFAULT 'ativo' é aplicado. Espelha o insert do repositório.
  const ins = await pool.query(
    `INSERT INTO farm_locais (farm_id, retiro_id, setor_id, name, is_default)
     VALUES ($1, $2, $3, $4, true) ON CONFLICT DO NOTHING RETURNING id;`,
    [farmId, retiroId, setorId, name],
  );
  return ins.rows[0]?.id ?? (await findDefault('farm_locais', farmId))!;
}

async function getLevels(farmId: string): Promise<Levels> {
  const cfg = await pool.query(
    `SELECT retiro, setor, local FROM farm_location_levels WHERE farm_id = $1;`,
    [farmId],
  );
  if (cfg.rows[0]) return cfg.rows[0];
  const ret = await pool.query(`SELECT is_default FROM farm_retiros WHERE farm_id = $1;`, [farmId]);
  const soPadrao = ret.rows.length === 1 && ret.rows[0].is_default === true;
  const semRetiros = ret.rows.length === 0;
  return { retiro: !(soPadrao || semRetiros), setor: false, local: true };
}

// Garante a folha-âncora (local padrão), criando os pais padrão necessários.
async function resolveDefaultLocalId(farmId: string, name: string, levels: Levels): Promise<string> {
  const existing = await findDefault('farm_locais', farmId);
  if (existing) return existing;
  const retiroId = !levels.retiro ? await ensureDefaultRetiro(farmId, name) : null;
  const setorId = !levels.setor ? await ensureDefaultSetor(farmId, name, retiroId) : null;
  return ensureDefaultLocal(farmId, name, retiroId, setorId);
}

async function main() {
  const farms = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM farms;`);
  const nameById = new Map(farms.rows.map((f) => [f.id, f.name]));

  // 1) Spine para fazendas com algum nível explicitamente desligado.
  let spineCount = 0;
  const offFarms = await pool.query<{ farm_id: string }>(
    `SELECT farm_id FROM farm_location_levels WHERE retiro = false OR setor = false OR local = false;`,
  );
  for (const { farm_id } of offFarms.rows) {
    const name = nameById.get(farm_id) ?? 'Padrão';
    const levels = await getLevels(farm_id);
    if (!levels.retiro) await ensureDefaultRetiro(farm_id, name);
    if (!levels.setor) await ensureDefaultSetor(farm_id, name, !levels.retiro ? await findDefault('farm_retiros', farm_id) : null);
    if (!levels.local) await resolveDefaultLocalId(farm_id, name, levels);
    spineCount++;
  }
  console.log(`Spine garantida para ${spineCount} fazenda(s) com nível desligado.`);

  // 2) Ancorar movimentos órfãos (local_id NULL) no local padrão da fazenda.
  for (const table of MOV_TABLES) {
    const orphans = await pool.query<{ farm_id: string; c: number }>(
      `SELECT farm_id, count(*)::int AS c FROM ${table}
       WHERE local_id IS NULL AND farm_id IS NOT NULL GROUP BY farm_id;`,
    );
    let updated = 0;
    for (const { farm_id } of orphans.rows) {
      const name = nameById.get(farm_id) ?? 'Padrão';
      const levels = await getLevels(farm_id);
      const localId = await resolveDefaultLocalId(farm_id, name, levels);
      const res = await pool.query(
        `UPDATE ${table} SET local_id = $1 WHERE local_id IS NULL AND farm_id = $2;`,
        [localId, farm_id],
      );
      updated += res.rowCount ?? 0;
    }
    console.log(`${table}: ${updated} movimento(s) ancorado(s).`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
