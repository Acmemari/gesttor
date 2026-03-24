import 'dotenv/config';
import { pool } from './src/DB/index.js';

async function main() {
  const client = await pool.connect();
  try {
    const uuidRegex = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    console.log('--- Cleaning organizations owner_id ---');
    try {
      await client.query(`UPDATE organizations SET owner_id = NULL WHERE owner_id IS NOT NULL AND owner_id !~* '${uuidRegex}'`);
    } catch (e: any) {
      console.log('Failed to nullify organizations.owner_id, deleting instead...', e.message);
      await client.query(`DELETE FROM organizations WHERE owner_id IS NOT NULL AND owner_id !~* '${uuidRegex}'`);
    }

    console.log('--- Altering organizations.owner_id ---');
    await client.query(`
      ALTER TABLE organizations 
      ALTER COLUMN owner_id TYPE uuid 
      USING owner_id::uuid;
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
