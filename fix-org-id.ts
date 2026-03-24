import 'dotenv/config';
import { pool } from './src/DB/index.js';

async function main() {
  const client = await pool.connect();
  try {
    console.log('Altering column organization_id to uuid safely...');
    
    // Convert invalid UUIDs to NULL safely
    const uuidRegex = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    
    await client.query(`
      ALTER TABLE people 
      ALTER COLUMN organization_id TYPE uuid 
      USING CASE 
        WHEN organization_id ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN organization_id::uuid 
        ELSE NULL 
      END;
    `);
    console.log('people table altered!');

    await client.query(`
      ALTER TABLE initiatives 
      ALTER COLUMN organization_id TYPE uuid 
      USING CASE 
        WHEN organization_id ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN organization_id::uuid 
        ELSE NULL 
      END;
    `);
    console.log('initiatives table altered!');

  } catch (error: any) {
    console.error('Error altering column:', error.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
