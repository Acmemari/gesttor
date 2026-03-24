import { db } from './src/DB/index.js';
import { atividades, semanas, people } from './src/DB/schema.js';
import { eq, desc } from 'drizzle-orm';

async function main() {
  try {
    const [semana] = await db.select().from(semanas).orderBy(desc(semanas.createdAt)).limit(1);
    const [person] = await db.select().from(people).orderBy(desc(people.createdAt)).limit(1);
    console.log("Found semana:", semana?.id);
    
    if (!semana || !person) {
      console.log("No semana or person found.");
      process.exit(0);
    }

    const row = await db.insert(atividades).values({
      semanaId: semana.id,
      titulo: 'Test Atividade',
      descricao: '',
      pessoaId: person.id,
      dataTermino: '2026-03-24',
      tag: '#planejamento',
      status: 'a fazer',
    }).returning();
    
    console.log("Success:", row);
  } catch (err: any) {
    console.error("Error inserting:", err.message);
    if (err.detail) console.error("Detail:", err.detail);
    if (err.code) console.error("Code:", err.code);
  }
  process.exit();
}
main();
