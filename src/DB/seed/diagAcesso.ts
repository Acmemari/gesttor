import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}
import { pool } from '../index.js';

async function main() {
  const userId = 'JuKsvzM4l8KjBq5tI9zImYidzykWU4xC';
  const orgId = 'ffba116a-5538-492e-bacf-7656ed546dfb';
  const c = await pool.connect();
  try {
    const u = await c.query(
      `SELECT id, name, email, role, ativo, organization_id FROM user_profiles WHERE id = $1`,
      [userId],
    );
    console.log('USER:', u.rows[0]);
    const orgPrincipal = await c.query(
      `SELECT id, name, analyst_id FROM organizations WHERE id = $1`,
      [orgId],
    );
    console.log('ORG:', orgPrincipal.rows[0]);
    const sec = await c.query(
      `SELECT * FROM organization_analysts WHERE organization_id = $1 AND analyst_id = $2`,
      [orgId, userId],
    );
    console.log('SEC ACCESS:', sec.rows.length > 0 ? sec.rows[0] : 'NENHUM');
    console.log('\nIs analystId match?', orgPrincipal.rows[0]?.analyst_id === userId);
  } finally {
    c.release();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
