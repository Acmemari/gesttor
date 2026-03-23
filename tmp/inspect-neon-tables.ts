import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;
import * as fs from 'fs';

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Neon database');

    const tablesToInspect = [
      'people',
      'pessoas',
      'person_farms',
      'pessoa_fazendas',
      'person_fazendas',
      'person_profiles',
      'pessoa_perfis',
      'person_perfils',
      'person_permissions',
      'pessoa_permissoes',
      'profiles',
      'perfils',
      'job_roles',
      'cargo_funcao'
    ];

    const results: any = {
      tableCounts: {},
      personFarmsSchema: [],
      peoplePessoasSchema: []
    };

    console.log('Counting rows...');
    for (const table of tablesToInspect) {
      try {
        const res = await client.query(`SELECT count(*) FROM public."${table}"`);
        results.tableCounts[table] = res.rows[0].count;
      } catch (e) {
        results.tableCounts[table] = 'NOT FOUND';
      }
    }

    console.log('Fetching schemas...');
    const schemaQuery = `
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('person_farms', 'pessoa_fazendas', 'person_fazendas')
      ORDER BY table_name, ordinal_position;
    `;
    const schemaRes = await client.query(schemaQuery);
    results.personFarmsSchema = schemaRes.rows;

    const peopleSchemaRes = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('people', 'pessoas')
      ORDER BY table_name, ordinal_position;
    `);
    results.peoplePessoasSchema = peopleSchemaRes.rows;

    fs.writeFileSync('c:\\gesttor\\tmp\\inspect-results.json', JSON.stringify(results, null, 2));
    console.log('Results written to c:\\gesttor\\tmp\\inspect-results.json');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
