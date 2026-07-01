import 'dotenv/config';
import { pool } from './src/DB/index.js';

async function main() {
  const client = await pool.connect();
  try {
    const orgs = await client.query("SELECT id, name FROM organizations");
    console.log("Organizations:");
    console.log(JSON.stringify(orgs.rows, null, 2));

    const farms = await client.query("SELECT id, name, slug, organization_id FROM farms");
    console.log("Farms:");
    console.log(JSON.stringify(farms.rows, null, 2));
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}
main();
