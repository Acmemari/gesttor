/**
 * Seed: Cadastra 12 analistas e os vincula à organização "Planejamento Ágil".
 *
 * Insere diretamente no banco (sem passar pela API), evitando rate limits.
 * Idempotente: e-mails já existentes são ignorados com aviso.
 *
 * Executar: npx tsx scripts/seed-analysts-planejamento-agil.ts
 */

import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Carrega .env.local e .env antes de importar o DB
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env.local'))) dotenv.config({ path: join(root, '.env.local') });
dotenv.config({ path: join(root, '.env') });

import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db, baUser, baAccount, userProfiles, organizationAnalysts, organizations } from '../src/DB/index.js';

// ── Dados dos analistas ────────────────────────────────────────────────────────

const SENHA = 'Mudar123@';
const ORG_NAME = 'Planejamento Ágil';

const ANALISTAS = [
  { name: 'Camila Salazar Parra',   email: 'camila@inttegra.com',                  phone: '(44)444.4440' },
  { name: 'Hellen Braga',           email: 'hellen@fazendanota10.com.br',           phone: '(44)444.4441' },
  { name: 'Esdaile Carvalho',       email: 'esdailecarvalho1@gmail.com',            phone: '(44)444.4442' },
  { name: 'Artur Barreiros',        email: 'artur.zoojr@hotmail.com',              phone: '(44)444.4443' },
  { name: 'Luiz Sande',             email: 'lfsande61@gmail.com',                  phone: '(44)444.4444' },
  { name: 'Fabíola Lino',           email: 'fabiolalinozoo@gmail.com',             phone: '(44)444.4445' },
  { name: 'Gian Cambauva',          email: 'giancambauva@gmail.com',               phone: '(44)444.4446' },
  { name: 'Karoline Oliveira',      email: 'karoline@silveirapecuaria.com.br',     phone: '(44)444.4447' },
  { name: 'Anderson Lamag',         email: 'andersonlamag@geagrobr.com.br',        phone: '(44)444.4448' },
  { name: 'Gustavo Haruo',          email: 'gustavo@boinaterradosoja.com',         phone: '(44)444.4449' },
  { name: 'Julia Almeida',          email: 'julia@veredasagronegocio.com',         phone: '(44)444.4450' },
  { name: 'Otávio Henrique Viana',  email: 'otavio.hmv@outlook.com',               phone: '(44)444.4451' },
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Seed: analistas → "${ORG_NAME}"\n`);

  // 1. Localizar organização
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, ORG_NAME))
    .limit(1);

  if (orgs.length === 0) {
    console.error(`❌ Organização "${ORG_NAME}" não encontrada no banco. Verifique o nome exato.`);
    process.exit(1);
  }

  const orgId = orgs[0].id;
  console.log(`✅ Organização encontrada: ${orgId}\n`);

  // 2. Gerar hash de senha uma única vez (bcrypt rounds=12, igual ao Better Auth)
  console.log('🔐 Gerando hash de senha...');
  const passwordHash = await bcrypt.hash(SENHA, 12);
  console.log('✅ Hash gerado.\n');

  // 3. Processar cada analista
  let criados = 0;
  let pulados = 0;

  for (const analista of ANALISTAS) {
    process.stdout.write(`→ ${analista.name} (${analista.email}) ... `);

    // Verificar se e-mail já existe
    const existing = await db
      .select({ id: baUser.id })
      .from(baUser)
      .where(eq(baUser.email, analista.email))
      .limit(1);

    if (existing.length > 0) {
      console.log('⚠️  já existe, pulado.');
      pulados++;
      continue;
    }

    const userId = randomUUID();
    const now = new Date();
    const avatar = analista.name.charAt(0).toUpperCase();

    // ba_user
    await db.insert(baUser).values({
      id: userId,
      name: analista.name,
      email: analista.email,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    // ba_account (credential provider — armazena o hash)
    await db.insert(baAccount).values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // user_profiles
    await db.insert(userProfiles).values({
      id: userId,
      email: analista.email,
      name: analista.name,
      role: 'analista',
      status: 'active',
      ativo: true,
      avatar,
      phone: analista.phone,
      createdAt: now,
      updatedAt: now,
    });

    // organization_analysts (vínculo secundário) — ON CONFLICT DO NOTHING via try/catch
    try {
      await db.insert(organizationAnalysts).values({
        id: randomUUID(),
        organizationId: orgId,
        analystId: userId,
        permissions: {},
        createdAt: now,
        updatedAt: now,
      });
    } catch (err: unknown) {
      // Ignora violação de unique (org_analysts_org_analyst_uidx)
      if (!(err instanceof Error) || !err.message.includes('org_analysts_org_analyst_uidx')) {
        throw err;
      }
    }

    console.log('✅ criado.');
    criados++;
  }

  // 4. Resumo
  console.log(`\n─────────────────────────────────────`);
  console.log(`Concluído: ${criados} criado(s), ${pulados} pulado(s).`);
  console.log(`─────────────────────────────────────\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
