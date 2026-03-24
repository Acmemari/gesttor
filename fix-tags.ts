import 'dotenv/config';
import { pool } from './src/DB/index.js';

async function main() {
  const client = await pool.connect();
  try {
    console.log('Altering column tags in initiatives...');
    await client.query(`
      ALTER TABLE initiatives 
      ALTER COLUMN tags TYPE jsonb 
      USING CASE 
        WHEN tags IS NULL OR tags = '' THEN '[]'::jsonb 
        WHEN tags LIKE '[%]' THEN tags::jsonb 
        ELSE '[]'::jsonb 
      END;
    `);
    console.log('Column altered successfully!');
  } catch (error) {
    console.error('Error altering column:', error);
  } finally {
    client.release();
    // pool.end() might throw if using the proxy, let's just process.exit
    process.exit(0);
  }
}

main();
