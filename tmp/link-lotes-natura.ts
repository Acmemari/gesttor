import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FARM_ID = '4939e33d-81a3-4e2b-bfaa-bca57b6b41cc'; // Natura 1
const ORG_ID = 'ffba116a-5538-492e-bacf-7656ed546dfb';

async function main() {
  const res = await pool.query(
    `UPDATE lotes
        SET farm_id = $1, updated_at = now()
      WHERE organization_id = $2
        AND farm_id IS NULL
      RETURNING nome, codigo, farm_id;`,
    [FARM_ID, ORG_ID],
  );
  console.log(`Lotes vinculados à Natura 1: ${res.rowCount}`);
  console.table(res.rows);
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
