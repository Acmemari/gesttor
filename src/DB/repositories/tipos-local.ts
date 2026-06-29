import { eq, and, asc, max, count } from 'drizzle-orm';
import { db } from '../index.js';
import { tipoLocalCategorias, tiposLocal, tipoLocalDetalhes } from '../schema.js';

/**
 * Tipos de Locais: cadastro (nível organização) dos tipos de locais e
 * infraestrutura da fazenda, agrupados em categorias EDITÁVEIS.
 *
 * Duas tabelas:
 *   • tipo_local_categorias — categorias (Pecuária, Agricultura, …); cor/ícone opcionais.
 *   • tipos_local           — tipos dentro de uma categoria; cor/ícone/descrição opcionais.
 *
 * Diferente das forrageiras (que começam vazias), este cadastro é pré-preenchido:
 * `ensureSeed` insere o catálogo padrão na primeira leitura de uma org sem categorias.
 * É um eixo standalone — por ora não alimenta o "Uso" do Cadastro de Áreas.
 */

// ── Catálogo padrão (seed) ──────────────────────────────────────────────────────
// Cor por categoria espelha a paleta USO_COR do mapa de Áreas.
// Ícone = nome de um ícone lucide (preto-e-branco). Ver agents/tiposLocalIcons.tsx.
export interface DefaultCategoria {
  nome: string;
  cor: string;
  icone: string;
  tipos: { nome: string; icone: string }[];
}

// ── Detalhes pré-cadastrados por tipo (3º nível) ─────────────────────────────────
// Fonte única dos defaults consumida pelo seed (orgs novas) E pelo botão
// "Carregar pré-cadastrados" da UI (qualquer org). Chave = nome do tipo em
// minúsculas (casamento por `tipo.nome.toLowerCase()`). Tipo ausente = sem 3º nível.
//
// "Pastagem cultivada" e "Forrageira de corte/Silagem/Feno" NÃO estão aqui de
// propósito: o 3º nível desses tipos é VINCULADO ao cadastro de Espécies
// Forrageiras (a UI projeta/seleciona aquelas espécies), então não semeamos uma
// lista de texto paralela que divergiria do cadastro.
export const DEFAULTS_DETALHE_POR_TIPO: Record<string, string[]> = {
  'pastagem nativa/natural': ['Campo nativo', 'Capim-gordura', 'Grama-batatais'],
  'silagem / cultura anual': ['Milho', 'Sorgo', 'Milheto', 'Silagem de capim'],
  'agricultura perene': ['Café', 'Citros', 'Seringueira', 'Cacau'],
  'agricultura anual': ['Soja', 'Milho', 'Sorgo', 'Algodão', 'Feijão', 'Arroz'],
  'floresta plantada': ['Eucalipto', 'Pinus', 'Teca', 'Seringueira'],
};

export const DEFAULT_CATALOGO: DefaultCategoria[] = [
  {
    nome: 'Pecuária',
    cor: '#16a34a',
    icone: 'Beef',
    tipos: [
      { nome: 'Pastagem cultivada', icone: 'PastagemCultivada' },
      { nome: 'Pastagem nativa/natural', icone: 'Wheat' },
      { nome: 'Pastagem em formação/reforma', icone: 'Tractor' },
      { nome: 'Forrageira de corte/Silagem/Feno', icone: 'Leaf' },
      { nome: 'Integração (ILP / ILPF / ILF)', icone: 'Recycle' },
      { nome: 'Silagem / Cultura anual', icone: 'Carrot' },
    ],
  },
  {
    nome: 'Agricultura',
    cor: '#ca8a04',
    icone: 'Wheat',
    tipos: [
      { nome: 'Agricultura perene', icone: 'Trees' },
      { nome: 'Agricultura anual', icone: 'Carrot' },
    ],
  },
  {
    nome: 'Silvicultura',
    cor: '#15803d',
    icone: 'TreePine',
    tipos: [
      { nome: 'Floresta nativa', icone: 'TreeDeciduous' },
      { nome: 'Floresta plantada', icone: 'TreePine' },
    ],
  },
  {
    nome: 'Ambiental / legal',
    cor: '#0e7490',
    icone: 'Shield',
    tipos: [
      { nome: 'Reserva Legal (RL)', icone: 'ShieldCheck' },
      { nome: 'APP — Área de Preservação Permanente', icone: 'Mountain' },
      { nome: 'APPs cercadas', icone: 'Fence' },
      { nome: 'Nascentes protegidas', icone: 'Droplet' },
      { nome: 'Área em recuperação', icone: 'Recycle' },
    ],
  },
  {
    nome: 'Água',
    cor: '#2563eb',
    icone: 'Droplet',
    tipos: [
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
    nome: 'Infraestrutura',
    cor: '#6b7280',
    icone: 'Home',
    tipos: [
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

/**
 * Insere o catálogo padrão se a org ainda não tem nenhuma categoria.
 * Idempotente por contagem: só semeia quando está vazio.
 */
export async function ensureSeed(organizationId: string) {
  const [c] = await db.select({ n: count() })
    .from(tipoLocalCategorias)
    .where(eq(tipoLocalCategorias.organizationId, organizationId));
  if ((c?.n ?? 0) > 0) return;

  await db.transaction(async (tx) => {
    let catOrdem = 0;
    for (const cat of DEFAULT_CATALOGO) {
      const [catRow] = await tx.insert(tipoLocalCategorias).values({
        organizationId,
        nome: cat.nome,
        cor: cat.cor,
        icone: cat.icone,
        ordem: catOrdem++,
      }).returning();
      let tipoOrdem = 0;
      for (const t of cat.tipos) {
        const [tipoRow] = await tx.insert(tiposLocal).values({
          organizationId,
          categoriaId: catRow.id,
          nome: t.nome,
          cor: null,
          icone: t.icone,
          descricao: null,
          ordem: tipoOrdem++,
        }).returning();
        // 3º nível: detalhes pré-cadastrados do tipo, se houver.
        const detalhes = DEFAULTS_DETALHE_POR_TIPO[t.nome.trim().toLowerCase()] ?? [];
        let detOrdem = 0;
        for (const nome of detalhes) {
          await tx.insert(tipoLocalDetalhes).values({
            organizationId,
            tipoId: tipoRow.id,
            nome,
            cor: null,
            icone: null,
            ordem: detOrdem++,
          });
        }
      }
    }
  });
}

export async function listByOrganization(organizationId: string) {
  const [categorias, tipos, detalhes] = await Promise.all([
    db.select().from(tipoLocalCategorias)
      .where(eq(tipoLocalCategorias.organizationId, organizationId))
      .orderBy(asc(tipoLocalCategorias.ordem)),
    db.select().from(tiposLocal)
      .where(eq(tiposLocal.organizationId, organizationId))
      .orderBy(asc(tiposLocal.ordem)),
    db.select().from(tipoLocalDetalhes)
      .where(eq(tipoLocalDetalhes.organizationId, organizationId))
      .orderBy(asc(tipoLocalDetalhes.ordem)),
  ]);
  return { categorias, tipos, detalhes };
}

// ── Categorias ──────────────────────────────────────────────────────────────────
export async function createCategoria(data: {
  organizationId: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(tipoLocalCategorias.ordem) })
    .from(tipoLocalCategorias)
    .where(eq(tipoLocalCategorias.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(tipoLocalCategorias).values({
    organizationId: data.organizationId,
    nome: data.nome,
    cor: data.cor ?? null,
    icone: data.icone ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function updateCategoria(id: string, data: {
  nome?: string;
  cor?: string | null;
  icone?: string | null;
}) {
  const [row] = await db.update(tipoLocalCategorias)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tipoLocalCategorias.id, id as any))
    .returning();
  return row;
}

export async function removeCategoria(id: string) {
  // Cascade no banco remove os tipos da categoria.
  await db.delete(tipoLocalCategorias).where(eq(tipoLocalCategorias.id, id as any));
}

export async function reorderCategorias(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(tipoLocalCategorias)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(tipoLocalCategorias.id, item.id as any));
    }
  });
}

// ── Tipos ───────────────────────────────────────────────────────────────────────
export async function createTipo(data: {
  organizationId: string;
  categoriaId: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
  descricao?: string | null;
}) {
  // Ordem é por categoria.
  const [maxRow] = await db.select({ maxOrdem: max(tiposLocal.ordem) })
    .from(tiposLocal)
    .where(and(
      eq(tiposLocal.organizationId, data.organizationId),
      eq(tiposLocal.categoriaId, data.categoriaId as any),
    ));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(tiposLocal).values({
    organizationId: data.organizationId,
    categoriaId: data.categoriaId,
    nome: data.nome,
    cor: data.cor ?? null,
    icone: data.icone ?? null,
    descricao: data.descricao ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function updateTipo(id: string, data: {
  categoriaId?: string;
  nome?: string;
  cor?: string | null;
  icone?: string | null;
  descricao?: string | null;
}) {
  const [row] = await db.update(tiposLocal)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tiposLocal.id, id as any))
    .returning();
  return row;
}

// Tipos do sistema que NÃO podem ser excluídos (nome em minúsculas).
// "Pastagem cultivada" é o tipo-base ligado às espécies forrageiras (espelho read-only).
// "Forrageira de corte/Silagem/Feno" vincula espécies forrageiras escolhidas (seletor).
export const TIPOS_PROTEGIDOS = new Set([
  'pastagem cultivada',
  'forrageira de corte/silagem/feno',
]);

export async function removeTipo(id: string) {
  const [t] = await db.select({ nome: tiposLocal.nome })
    .from(tiposLocal)
    .where(eq(tiposLocal.id, id as any));
  if (t && TIPOS_PROTEGIDOS.has(t.nome.trim().toLowerCase())) {
    throw new Error('Este é um tipo do sistema e não pode ser excluído.');
  }
  await db.delete(tiposLocal).where(eq(tiposLocal.id, id as any));
}

export async function reorderTipos(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(tiposLocal)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(tiposLocal.id, item.id as any));
    }
  });
}

// ── Detalhes (3º nível) ───────────────────────────────────────────────────────────
export async function createDetalhe(data: {
  organizationId: string;
  tipoId: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
}) {
  // Ordem é por tipo pai.
  const [maxRow] = await db.select({ maxOrdem: max(tipoLocalDetalhes.ordem) })
    .from(tipoLocalDetalhes)
    .where(and(
      eq(tipoLocalDetalhes.organizationId, data.organizationId),
      eq(tipoLocalDetalhes.tipoId, data.tipoId as any),
    ));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(tipoLocalDetalhes).values({
    organizationId: data.organizationId,
    tipoId: data.tipoId,
    nome: data.nome,
    cor: data.cor ?? null,
    icone: data.icone ?? null,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function updateDetalhe(id: string, data: {
  tipoId?: string;
  nome?: string;
  cor?: string | null;
  icone?: string | null;
}) {
  const [row] = await db.update(tipoLocalDetalhes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tipoLocalDetalhes.id, id as any))
    .returning();
  return row;
}

export async function removeDetalhe(id: string) {
  await db.delete(tipoLocalDetalhes).where(eq(tipoLocalDetalhes.id, id as any));
}

export async function reorderDetalhes(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(tipoLocalDetalhes)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(tipoLocalDetalhes.id, item.id as any));
    }
  });
}

/**
 * "Carregar pré-cadastrados": insere os detalhes default do tipo
 * (DEFAULTS_DETALHE_POR_TIPO, casado pelo nome do tipo) que ainda não existem.
 * Idempotente — nunca duplica (compara por nome, case-insensitive).
 */
export async function seedDetalhesForTipo(organizationId: string, tipoId: string) {
  const [tipo] = await db.select({ nome: tiposLocal.nome })
    .from(tiposLocal)
    .where(and(
      eq(tiposLocal.organizationId, organizationId),
      eq(tiposLocal.id, tipoId as any),
    ));
  const defaults = tipo ? (DEFAULTS_DETALHE_POR_TIPO[tipo.nome.trim().toLowerCase()] ?? []) : [];
  if (defaults.length === 0) return { inserted: 0, available: 0 };

  const existing = await db.select({ nome: tipoLocalDetalhes.nome })
    .from(tipoLocalDetalhes)
    .where(and(
      eq(tipoLocalDetalhes.organizationId, organizationId),
      eq(tipoLocalDetalhes.tipoId, tipoId as any),
    ));
  const existingSet = new Set(existing.map((d) => d.nome.trim().toLowerCase()));

  const [maxRow] = await db.select({ maxOrdem: max(tipoLocalDetalhes.ordem) })
    .from(tipoLocalDetalhes)
    .where(and(
      eq(tipoLocalDetalhes.organizationId, organizationId),
      eq(tipoLocalDetalhes.tipoId, tipoId as any),
    ));
  let ordem = (maxRow?.maxOrdem ?? -1) + 1;

  const toInsert = defaults.filter((nome) => !existingSet.has(nome.trim().toLowerCase()));
  for (const nome of toInsert) {
    await db.insert(tipoLocalDetalhes).values({
      organizationId, tipoId, nome, cor: null, icone: null, ordem: ordem++,
    });
  }
  return { inserted: toInsert.length, available: defaults.length };
}
