import { pool } from '../src/DB/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    const sqlPath = path.join(__dirname, '../drizzle/0001_tense_punisher.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    const statements = sqlContent.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

    console.log(`Executing ${statements.length} migration statements...`);
    for (let i = 0; i < statements.length; i++) {
      console.log(`\n[${i + 1}/${statements.length}] Executing:\n${statements[i].split('\\n')[0]}...`);
      try {
        await pool.query(statements[i]);
        console.log('✅ Success');
      } catch (err: any) {
        // Ignorar se a relação já existe ou se a coluna já não existe, etc.
        const msg = err.message || String(err);
        if (msg.includes('already exists') || msg.includes('does not exist') || msg.includes('multiple primary keys')) {
          console.log(`⚠️ Skipped (${msg.substring(0, 100)})`);
        } else {
          console.log(`❌ Failed: ${msg}`);
        }
      }
    }
    console.log('\nMigration script completed.');
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    process.exit(0);
  }
}

main();
