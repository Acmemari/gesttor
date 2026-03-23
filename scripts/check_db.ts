import { pool } from '../src/DB/index.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function checkDb() {
  try {
    const res = await pool.query(`
      SELECT table_name, column_name, is_nullable, data_type
      FROM information_schema.columns 
      WHERE table_name IN ('farms', 'organization_documents', 'analyst_farms')
      ORDER BY table_name, column_name;
    `);
    console.log(JSON.stringify(res.rows, null, 2));
    
    const res2 = await pool.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = 'farms'::regclass;
    `);
    console.log('Constraints on farms:', JSON.stringify(res2.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
checkDb();
