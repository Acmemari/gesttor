import 'dotenv/config';
import { pool } from './src/DB/index.js';

async function main() {
  const client = await pool.connect();
  const res = await client.query("SELECT id, name FROM organizations ORDER BY name LIMIT 30");
  console.log(JSON.stringify(res.rows, null, 2));
  client.release();
  process.exit(0);
}
main();
