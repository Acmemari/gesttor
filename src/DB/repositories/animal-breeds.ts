import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { animalBreeds } from '../schema.js';

/**
 * Raças padrão do sistema. Toda organização recebe esta lista pré-cadastrada
 * na primeira vez que abre o cadastro (auto-seed quando vazio). São marcadas
 * com `sistema: true` e, por isso, só podem ser ativadas/inativadas — nunca
 * alteradas ou excluídas. `codigoAsbia` é o código ASBIA/INTERBULL (2 letras).
 *
 * TODO(lista): preencher com a lista exata fornecida pelo usuário (nome → código).
 */
export const DEFAULT_ANIMAL_BREEDS: { nome: string; codigoAsbia: string }[] = [
  { nome: 'Africander', codigoAsbia: 'AF' },
  { nome: 'Aberdeen Angus', codigoAsbia: 'AN' },
  { nome: 'Red Angus', codigoAsbia: 'AR' },
  { nome: 'Belgian Blue', codigoAsbia: 'BB' },
  { nome: "Blonde D'Aquitaine", codigoAsbia: 'BD' },
  { nome: 'Brangus', codigoAsbia: 'BN' },
  { nome: 'Braford', codigoAsbia: 'BO' },
  { nome: 'Brahman', codigoAsbia: 'BR' },
  { nome: 'Chianina', codigoAsbia: 'CA' },
  { nome: 'Canchim', codigoAsbia: 'CC' },
  { nome: 'Charolês', codigoAsbia: 'CH' },
  { nome: 'Devon', codigoAsbia: 'DE' },
  { nome: 'South Devon', codigoAsbia: 'DS' },
  { nome: 'Guzerá', codigoAsbia: 'GZ' },
  { nome: 'Hereford', codigoAsbia: 'HH' },
  { nome: 'Holandês', codigoAsbia: 'HO' },
  { nome: 'Limousin', codigoAsbia: 'LM' },
  { nome: 'Marchigiana', codigoAsbia: 'MR' },
  { nome: 'Montana', codigoAsbia: 'MT' },
  { nome: 'Nelore', codigoAsbia: 'NE' },
  { nome: 'Nelore Mocho', codigoAsbia: 'NM' },
  { nome: 'Pardo Suíço', codigoAsbia: 'SB' },
  { nome: 'Pitangueiras', codigoAsbia: 'PT' },
  { nome: 'Red Brangus', codigoAsbia: 'RB' },
  { nome: 'Rubia Gallega', codigoAsbia: 'RG' },
  { nome: 'Red Poll', codigoAsbia: 'RP' },
  { nome: 'Sindi', codigoAsbia: 'SD' },
  { nome: 'Senepol', codigoAsbia: 'SE' },
  { nome: 'Santa Gertrudis', codigoAsbia: 'SG' },
  { nome: 'Simbrasil', codigoAsbia: 'SI' },
  { nome: 'Simental', codigoAsbia: 'SM' },
  { nome: 'Shorthorn', codigoAsbia: 'SS' },
  { nome: 'Tabapuã', codigoAsbia: 'TB' },
  { nome: 'Texas Longhorn', codigoAsbia: 'TL' },
  { nome: 'Wagyu/Kobe', codigoAsbia: 'WG' },
];

async function seedDefaults(organizationId: string) {
  if (DEFAULT_ANIMAL_BREEDS.length === 0) return;
  await db.insert(animalBreeds).values(
    DEFAULT_ANIMAL_BREEDS.map((b, i) => ({
      organizationId,
      nome: b.nome,
      codigoAsbia: b.codigoAsbia || null,
      sistema: true,
      ativo: true,
      ordem: i,
    })),
  );
}

export async function listByOrganization(organizationId: string) {
  const rows = await db.select().from(animalBreeds)
    .where(eq(animalBreeds.organizationId, organizationId))
    .orderBy(asc(animalBreeds.ordem));

  // Auto-seed: na primeira vez que a org abre o cadastro, popula a lista padrão.
  if (rows.length === 0 && DEFAULT_ANIMAL_BREEDS.length > 0) {
    await seedDefaults(organizationId);
    return db.select().from(animalBreeds)
      .where(eq(animalBreeds.organizationId, organizationId))
      .orderBy(asc(animalBreeds.ordem));
  }

  return rows;
}

export async function create(data: {
  organizationId: string;
  nome: string;
  classificacaoRegistro?: string | null;
  codigoAsbia?: string | null;
  ceip?: boolean;
  semCadastroAsbia?: boolean;
  observacao?: string | null;
  ativo?: boolean;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(animalBreeds.ordem) })
    .from(animalBreeds)
    .where(eq(animalBreeds.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(animalBreeds).values({
    organizationId: data.organizationId,
    nome: data.nome,
    classificacaoRegistro: data.classificacaoRegistro ?? null,
    codigoAsbia: data.codigoAsbia ?? null,
    ceip: data.ceip ?? false,
    semCadastroAsbia: data.semCadastroAsbia ?? false,
    observacao: data.observacao ?? null,
    // `sistema` nunca vem do usuário: raças criadas na tela não são padrão do sistema.
    sistema: false,
    ativo: data.ativo ?? true,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  classificacaoRegistro?: string | null;
  codigoAsbia?: string | null;
  ceip?: boolean;
  semCadastroAsbia?: boolean;
  observacao?: string | null;
  ativo?: boolean;
}) {
  // Raças padrão do sistema só podem ser ativadas/inativadas.
  const [existing] = await db.select({ sistema: animalBreeds.sistema })
    .from(animalBreeds)
    .where(eq(animalBreeds.id, id as any));
  if (existing?.sistema) {
    const onlyAtivo = Object.keys(data).every((k) => k === 'ativo');
    if (!onlyAtivo) {
      throw new Error('Raça padrão do sistema: só é permitido ativar/inativar.');
    }
  }

  const [row] = await db.update(animalBreeds)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(animalBreeds.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  // Raças padrão do sistema não podem ser excluídas.
  const [existing] = await db.select({ sistema: animalBreeds.sistema })
    .from(animalBreeds)
    .where(eq(animalBreeds.id, id as any));
  if (existing?.sistema) {
    throw new Error('Raça padrão do sistema não pode ser excluída.');
  }
  await db.delete(animalBreeds).where(eq(animalBreeds.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(animalBreeds)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(animalBreeds.id, item.id as any));
    }
  });
}
