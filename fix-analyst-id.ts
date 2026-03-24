import 'dotenv/config';
import { pool } from './src/DB/index.js';

async function main() {
  const client = await pool.connect();
  try {
    const uuidRegex = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    console.log('--- Cleaning organizations ---');
    // If it's not a UUID and not null, set it to NULL (if the DB allows it).
    // If the DB has NOT NULL constraint, this might fail, so we catch it.
    try {
      await client.query(`UPDATE organizations SET analyst_id = NULL WHERE analyst_id IS NOT NULL AND analyst_id !~* '${uuidRegex}'`);
    } catch (e: any) {
      console.log('Failed to nullify organizations.analyst_id, deleting instead...', e.message);
      await client.query(`DELETE FROM organizations WHERE analyst_id IS NOT NULL AND analyst_id !~* '${uuidRegex}'`);
    }

    console.log('--- Altering organizations.analyst_id ---');
    await client.query(`
      ALTER TABLE organizations 
      ALTER COLUMN analyst_id TYPE uuid 
      USING analyst_id::uuid;
    `);

    console.log('--- Cleaning organization_analysts ---');
    await client.query(`
      DELETE FROM organization_analysts 
      WHERE analyst_id IS NOT NULL AND analyst_id !~* '${uuidRegex}';
    `);

    console.log('--- Altering organization_analysts.analyst_id ---');
    await client.query(`
      ALTER TABLE organization_analysts 
      ALTER COLUMN analyst_id TYPE uuid 
      USING analyst_id::uuid;
    `);

    console.log('Done successfully!');
  } catch (error: any) {
    console.log('ERROR CAUGHT:', error.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
