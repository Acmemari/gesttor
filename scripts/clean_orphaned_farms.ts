import { db } from '../src/DB/index.js';
import { farms } from '../src/DB/schema.js';
import { isNull } from 'drizzle-orm';

async function main() {
  console.log('Deletando fazendas órfãs (sem organizationId)...');
  const result = await db.delete(farms).where(isNull(farms.organizationId)).returning();
  console.log(`Deletadas ${result.length} fazendas.`);
  process.exit(0);
}

main().catch(console.error);
