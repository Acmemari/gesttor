/**
 * Migra os ícones do cadastro "Tipos de Locais" de EMOJI → nome de ícone lucide.
 *
 * O campo `icone` (tipos_local.icone e tipo_local_categorias.icone) passou a
 * guardar o nome de um ícone lucide (ex.: "Sprout") em vez de um emoji. Este
 * script converte as linhas já gravadas no banco para todas as organizações.
 *
 * - Idempotente: linhas cujo `icone` já é um nome lucide conhecido são puladas.
 * - Best-effort: o mapa é por emoji; emojis ambíguos (ex.: 🌳, 🏞️) recebem a
 *   conversão mais comum. Emojis sem mapeamento são apenas listados (não tocados).
 *
 * Uso:
 *   npx tsx tmp/migrate-tipos-local-icons.ts            # grava no banco
 *   npx tsx tmp/migrate-tipos-local-icons.ts --dry-run  # só imprime o que faria
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

// emoji → nome de ícone lucide. Cobre os emojis usados no catálogo padrão
// e no antigo picker (EMOJI_PRESETS).
const EMOJI_TO_LUCIDE: Record<string, string> = {
  '🐂': 'Beef', '🐄': 'Beef',
  '🌱': 'Sprout', '🌾': 'Wheat', '🚜': 'Tractor', '🎋': 'Leaf',
  '🔄': 'Recycle', '♻️': 'Recycle', '🌽': 'Carrot',
  '🌳': 'Trees', '🌲': 'TreePine', '🪵': 'TreePine',
  '🛡️': 'Shield', '🏞️': 'Mountain', '⛰️': 'MountainSnow', '🌿': 'Fence',
  '💧': 'Droplet', '🚰': 'Droplets', '🕳️': 'Droplet', '🪣': 'Container',
  '🌊': 'Waves', '💦': 'Waves', '🪷': 'Flower2',
  '🏠': 'Home', '🏡': 'House', '🏘️': 'House', '🛏️': 'BedDouble',
  '🏢': 'Building2', '👥': 'Users', '🍽️': 'Utensils', '📦': 'Package',
  '🫘': 'Bean', '🥣': 'Soup', '🏟️': 'Fence', '🏭': 'Factory',
  '🛢️': 'Cylinder', '🧱': 'BrickWall', '🍂': 'Leaf', '🔧': 'Wrench',
  '🚿': 'ShowerHead', '⛽': 'Fuel', '⚡': 'Zap', '☀️': 'Sun',
  '📡': 'Antenna', '📹': 'Cctv', '🛂': 'DoorClosed',
  '🛣️': 'Route', '🛤️': 'Milestone', '🌉': 'Construction', '🚧': 'Construction',
  '🅿️': 'SquareParking', '🚛': 'Truck',
};

const KNOWN_NAMES = new Set([...Object.values(EMOJI_TO_LUCIDE), 'PastagemCultivada', 'BrachiariaHumidicola']);

async function migrateTable(pool: Pool, table: 'tipos_local' | 'tipo_local_categorias') {
  const res = await pool.query(
    `SELECT icone, COUNT(*)::int AS n FROM ${table} WHERE icone IS NOT NULL AND icone <> '' GROUP BY icone`,
  );
  let updated = 0;
  const unmapped: { icone: string; n: number }[] = [];
  for (const row of res.rows as { icone: string; n: number }[]) {
    const cur = row.icone;
    if (KNOWN_NAMES.has(cur)) continue; // já é nome lucide → idempotente
    const target = EMOJI_TO_LUCIDE[cur];
    if (!target) {
      unmapped.push(row);
      continue;
    }
    if (!DRY_RUN) {
      await pool.query(`UPDATE ${table} SET icone = $1 WHERE icone = $2`, [target, cur]);
    }
    updated += row.n;
    console.log(`  ${table}: ${cur} → ${target} (${row.n} linha${row.n === 1 ? '' : 's'})`);
  }
  if (unmapped.length) {
    console.log(`  ${table}: sem mapeamento (mantidos): ${unmapped.map((u) => `${u.icone}×${u.n}`).join(', ')}`);
  }
  return updated;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log(DRY_RUN ? '[DRY-RUN] Nenhuma escrita realizada.\n' : 'Migrando ícones emoji → lucide...\n');
  const a = await migrateTable(pool, 'tipo_local_categorias');
  const b = await migrateTable(pool, 'tipos_local');
  console.log(`\n✓ Concluído: ${a + b} linhas ${DRY_RUN ? 'seriam atualizadas' : 'atualizadas'}.`);
  await pool.end();
}

main().catch((err) => { console.error('ERRO:', err); process.exit(1); });
