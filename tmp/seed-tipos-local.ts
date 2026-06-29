/**
 * Seed do catálogo padrão de Tipos de Locais nas organizações reais.
 *
 * O app já faz auto-seed na primeira leitura (GET /api/tipos-local) de uma org
 * sem categorias. Este script cobre orgs existentes em lote, sem esperar o GET.
 *
 * - Exclui orgs de teste E2E (nome começa com "Organização ").
 * - Idempotente: pula categorias/tipos cujo `nome` já existe na org.
 *
 * Uso:
 *   npx tsx tmp/seed-tipos-local.ts            # grava no banco
 *   npx tsx tmp/seed-tipos-local.ts --dry-run  # só imprime o que faria
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const DRY_RUN = process.argv.includes('--dry-run');

// Catálogo padrão (espelha DEFAULT_CATALOGO em src/DB/repositories/tipos-local.ts).
const CATALOGO: { nome: string; cor: string; icone: string; tipos: { nome: string; icone: string }[] }[] = [
  {
    nome: 'Pecuária', cor: '#16a34a', icone: 'Beef', tipos: [
      { nome: 'Pastagem cultivada', icone: 'PastagemCultivada' },
      { nome: 'Pastagem nativa/natural', icone: 'Wheat' },
      { nome: 'Pastagem em formação/reforma', icone: 'Tractor' },
      { nome: 'Forrageira de corte/Silagem/Feno', icone: 'Leaf' },
      { nome: 'Integração (ILP / ILPF / ILF)', icone: 'Recycle' },
      { nome: 'Silagem / Cultura anual', icone: 'Carrot' },
    ],
  },
  {
    nome: 'Agricultura', cor: '#ca8a04', icone: 'Wheat', tipos: [
      { nome: 'Agricultura perene', icone: 'Trees' },
      { nome: 'Agricultura anual', icone: 'Carrot' },
    ],
  },
  {
    nome: 'Silvicultura', cor: '#15803d', icone: 'TreePine', tipos: [
      { nome: 'Floresta nativa', icone: 'TreeDeciduous' },
      { nome: 'Floresta plantada', icone: 'TreePine' },
    ],
  },
  {
    nome: 'Ambiental / legal', cor: '#0e7490', icone: 'Shield', tipos: [
      { nome: 'Reserva Legal (RL)', icone: 'ShieldCheck' },
      { nome: 'APP — Área de Preservação Permanente', icone: 'Mountain' },
      { nome: 'APPs cercadas', icone: 'Fence' },
      { nome: 'Nascentes protegidas', icone: 'Droplet' },
      { nome: 'Área em recuperação', icone: 'Recycle' },
    ],
  },
  {
    nome: 'Água', cor: '#2563eb', icone: 'Droplet', tipos: [
      { nome: 'Várzea', icone: 'Waves' },
      { nome: 'Açude / represa / lago', icone: 'Droplets' },
      { nome: 'Brejo / banhado', icone: 'Flower2' },
      { nome: 'Reservatórios de água', icone: 'Droplets' },
      { nome: 'Poços artesianos', icone: 'Droplet' },
      { nome: "Caixas d'água", icone: 'Container' },
      { nome: 'Rede hidráulica', icone: 'Waves' },
      { nome: 'Bebedouro', icone: 'Soup' },
    ],
  },
  {
    nome: 'Infraestrutura', cor: '#6b7280', icone: 'Home', tipos: [
      { nome: 'Sede / benfeitorias', icone: 'Home' },
      { nome: 'Casa sede', icone: 'House' },
      { nome: 'Casas de colaboradores', icone: 'House' },
      { nome: 'Alojamento de funcionários', icone: 'BedDouble' },
      { nome: 'Escritório', icone: 'Building2' },
      { nome: 'Sala de reunião', icone: 'Users' },
      { nome: 'Refeitório', icone: 'Utensils' },
      { nome: 'Almoxarifado', icone: 'Package' },
      { nome: 'Depósito de sementes', icone: 'Bean' },
      { nome: 'Curral de manejo / Mangueiro', icone: 'Fence' },
      { nome: 'Cochos de suplementação', icone: 'Soup' },
      { nome: 'Área de confinamento', icone: 'Fence' },
      { nome: 'Estruturas de manejo (curral, brete, piquete de apartação)', icone: 'Fence' },
      { nome: 'Fábrica de ração', icone: 'Factory' },
      { nome: 'Silo graneleiro', icone: 'Cylinder' },
      { nome: 'Silo trincheira / Superfície', icone: 'BrickWall' },
      { nome: 'Pátio de compostagem', icone: 'Leaf' },
      { nome: 'Oficina', icone: 'Wrench' },
      { nome: 'Lavador de máquinas', icone: 'ShowerHead' },
      { nome: 'Tanque de combustível', icone: 'Fuel' },
      { nome: 'Rede elétrica', icone: 'Zap' },
      { nome: 'Energia solar', icone: 'Sun' },
      { nome: 'Internet / torre de comunicação', icone: 'Antenna' },
      { nome: 'Sistema de câmeras', icone: 'Cctv' },
      { nome: 'Guarita / portaria', icone: 'DoorClosed' },
      { nome: 'Estradas / carreadores / aceiros', icone: 'Route' },
      { nome: 'Estradas internas', icone: 'Milestone' },
      { nome: 'Pontes', icone: 'Construction' },
      { nome: 'Mata-burros', icone: 'Construction' },
      { nome: 'Pátio de manobra', icone: 'SquareParking' },
      { nome: 'Pátio de carga e descarga', icone: 'Truck' },
    ],
  },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const orgsRes = await pool.query(
    `SELECT id, name FROM organizations WHERE name NOT ILIKE 'Organização %' ORDER BY name`,
  );
  const orgs = orgsRes.rows as { id: string; name: string }[];
  console.log(`Organizações-alvo (${orgs.length}): ${orgs.map((o) => o.name).join(', ')}\n`);

  if (DRY_RUN) {
    console.log('[DRY-RUN] Nenhuma escrita realizada.');
    const totTipos = CATALOGO.reduce((s, c) => s + c.tipos.length, 0);
    console.log(`Seria semeado: ${CATALOGO.length} categorias e ${totTipos} tipos por org (pulando os já existentes).`);
    await pool.end();
    return;
  }

  let totalCat = 0;
  let totalTipo = 0;
  for (const org of orgs) {
    // Categorias já existentes (por nome).
    const existingCats = await pool.query(
      `SELECT id, nome FROM tipo_local_categorias WHERE organization_id = $1`,
      [org.id],
    );
    const catByNome = new Map<string, string>(
      existingCats.rows.map((r: any) => [String(r.nome).trim().toLowerCase(), r.id]),
    );
    const catMaxRes = await pool.query(
      `SELECT COALESCE(MAX(ordem), -1) AS m FROM tipo_local_categorias WHERE organization_id = $1`,
      [org.id],
    );
    let nextCatOrdem = Number(catMaxRes.rows[0].m) + 1;

    let insCat = 0;
    let insTipo = 0;
    for (const cat of CATALOGO) {
      let catId = catByNome.get(cat.nome.toLowerCase());
      if (!catId) {
        const r = await pool.query(
          `INSERT INTO tipo_local_categorias (organization_id, nome, cor, icone, ordem)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [org.id, cat.nome, cat.cor, cat.icone, nextCatOrdem++],
        );
        catId = r.rows[0].id;
        catByNome.set(cat.nome.toLowerCase(), catId);
        insCat++;
      }

      // Tipos já existentes nessa categoria (por nome).
      const existingTipos = await pool.query(
        `SELECT nome FROM tipos_local WHERE categoria_id = $1`,
        [catId],
      );
      const haveTipo = new Set(existingTipos.rows.map((r: any) => String(r.nome).trim().toLowerCase()));
      const tipoMaxRes = await pool.query(
        `SELECT COALESCE(MAX(ordem), -1) AS m FROM tipos_local WHERE categoria_id = $1`,
        [catId],
      );
      let nextTipoOrdem = Number(tipoMaxRes.rows[0].m) + 1;

      for (const t of cat.tipos) {
        if (haveTipo.has(t.nome.toLowerCase())) continue;
        await pool.query(
          `INSERT INTO tipos_local (organization_id, categoria_id, nome, cor, icone, descricao, ordem)
           VALUES ($1, $2, $3, NULL, $4, NULL, $5)`,
          [org.id, catId, t.nome, t.icone, nextTipoOrdem++],
        );
        insTipo++;
      }
    }
    totalCat += insCat;
    totalTipo += insTipo;
    console.log(`  ${org.name.padEnd(34)} → +${insCat} categorias, +${insTipo} tipos`);
  }

  console.log(`\n✓ Concluído: ${totalCat} categorias e ${totalTipo} tipos inseridos no total.`);
  await pool.end();
}

main().catch((err) => { console.error('ERRO:', err); process.exit(1); });
