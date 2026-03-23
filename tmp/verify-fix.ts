
import { db } from './src/DB/index.js';
import { personPerfils, people, perfils } from './src/DB/schema.js';
import { addPessoaPerfil, getPessoaPerfis } from './src/DB/repositories/pessoas.js';
import { eq } from 'drizzle-orm';

async function verify() {
  console.log('--- Verifying Single Profile Rule ---');
  
  // Find a person to test with
  const [person] = await db.select().from(people).limit(1);
  if (!person) {
    console.log('No person found to test with.');
    return;
  }
  const pessoaId = person.id;
  console.log(`Testing with person: ${person.fullName} (${pessoaId})`);

  // Find two profiles to test with
  const availablePerfis = await db.select().from(perfils).limit(2);
  if (availablePerfis.length < 2) {
    console.log('Not enough profiles found to test with.');
    return;
  }
  const p1 = availablePerfis[0].id;
  const p2 = availablePerfis[1].id;

  console.log(`Adding first profile: ${availablePerfis[0].nome}`);
  await addPessoaPerfil({ pessoaId, perfilId: p1 });
  let perfis = await getPessoaPerfis(pessoaId);
  console.log(`Current profiles count: ${perfis.length}`);
  
  console.log(`Adding second profile (should replace first): ${availablePerfis[1].nome}`);
  await addPessoaPerfil({ pessoaId, perfilId: p2 });
  perfis = await getPessoaPerfis(pessoaId);
  console.log(`Current profiles count: ${perfis.length}`);
  
  if (perfis.length === 1 && perfis[0].perfilId === p2) {
    console.log('SUCCESS: Second profile replaced the first one.');
  } else {
    console.log('FAILURE: Profile count is not 1 or profile ID mismatch.');
    console.log('Profiles:', perfis);
  }

  console.log('\n--- Verifying camelCase Keys ---');
  console.log('Profile keys:', Object.keys(perfis[0]));
  const expectedKeys = ['id', 'pessoaId', 'perfilId', 'cargoFuncaoId', 'createdAt', 'perfilNome', 'cargoFuncaoNome'];
  const hasAllKeys = expectedKeys.every(k => k in perfis[0]);
  if (hasAllKeys) {
    console.log('SUCCESS: Repository returns camelCase keys.');
  } else {
    console.log('FAILURE: Missing expected camelCase keys.', Object.keys(perfis[0]));
  }
}

verify().catch(console.error);
