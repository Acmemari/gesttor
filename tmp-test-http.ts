import { db } from './src/DB/index.js';
import { semanas, people, baSession } from './src/DB/schema.js';
import { eq, desc } from 'drizzle-orm';

async function main() {
  try {
    const [semana] = await db.select().from(semanas).orderBy(desc(semanas.createdAt)).limit(1);
    const [person] = await db.select().from(people).orderBy(desc(people.createdAt)).limit(1);
    const [session] = await db.select().from(baSession).orderBy(desc(baSession.createdAt)).limit(1);

    if (!semana || !person || !session) {
      console.log("Missing data");
      process.exit(1);
    }

    const payload = {
      semana_id: semana.id,
      titulo: 'Apartar novilhas',
      descricao: 'Descrição breve',
      pessoa_id: person.id,
      data_termino: '2026-03-24',
      tag: '#planejamento',
      status: 'a fazer'
    };

    console.log("Sending POST request...");
    const res = await fetch('http://localhost:3002/api/atividades', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `better-auth.session_token=${session.token}`
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("Response status:", res.status);
    console.log("Response body:", text.substring(0, 1000));
  } catch (err: any) {
    console.error("HTTP error:", err.message);
  }
  process.exit();
}
main();
