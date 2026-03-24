import 'dotenv/config';
import { pool } from './src/DB/index.js';

const ANALYST_EMAIL = 'chakerdev12@gmail.com';
const ORG_NAME = 'reunidas floresta';

async function main() {
  const client = await pool.connect();
  try {
    // 1. Find user by email
    const userRes = await client.query(
      `SELECT id, name, email, role FROM user_profiles WHERE email = $1 LIMIT 1`,
      [ANALYST_EMAIL]
    );

    if (userRes.rowCount === 0) {
      // Try better-auth users table
      const baRes = await client.query(
        `SELECT id, name, email FROM "user" WHERE email = $1 LIMIT 1`,
        [ANALYST_EMAIL]
      );
      if (baRes.rowCount === 0) {
        console.log(`ERRO: Usuário com email "${ANALYST_EMAIL}" não encontrado.`);
        process.exit(1);
      }
      console.log('Usuário encontrado (ba_user):', baRes.rows[0]);
      userRes.rows.push(baRes.rows[0]);
    }

    const user = userRes.rows[0];
    console.log('Usuário encontrado:', user);

    // 2. Find organization by name (case-insensitive)
    const orgRes = await client.query(
      `SELECT id, name, analyst_id FROM organizations WHERE name ILIKE $1 LIMIT 1`,
      [`%${ORG_NAME}%`]
    );

    if (orgRes.rowCount === 0) {
      console.log(`ERRO: Organização "${ORG_NAME}" não encontrada.`);
      process.exit(1);
    }

    const org = orgRes.rows[0];
    console.log('Organização encontrada:', org);

    // 3. Update primary analyst_id on organization
    await client.query(
      `UPDATE organizations SET analyst_id = $1, updated_at = NOW() WHERE id = $2`,
      [user.id, org.id]
    );
    console.log(`✓ analyst_id da organização "${org.name}" atualizado para ${user.id}`);

    // 4. Also insert into organization_analysts (secondary/many-to-many)
    const existsRes = await client.query(
      `SELECT id FROM organization_analysts WHERE organization_id = $1 AND analyst_id = $2 LIMIT 1`,
      [org.id, user.id]
    );

    if (existsRes.rowCount === 0) {
      await client.query(
        `INSERT INTO organization_analysts (id, organization_id, analyst_id, permissions, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, '{}', NOW(), NOW())`,
        [org.id, user.id]
      );
      console.log(`✓ Vínculo inserido em organization_analysts`);
    } else {
      console.log(`ℹ️  Vínculo já existe em organization_analysts`);
    }

    console.log('\nVinculação concluída com sucesso!');
  } catch (error: any) {
    console.error('ERRO:', error.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
