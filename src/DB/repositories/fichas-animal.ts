import { eq, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { fichasAnimal } from '../schema.js';

/**
 * Repositório da Ficha Animal (Pecuário › Cadastros › Ficha Animal).
 * Uma linha por animal, identificado pelo ID Manejo (apelido) único por org.
 */

/** Colunas escalares graváveis da ficha (sem metadados/ids gerados). */
export interface FichaAnimalWritable {
  farmId?: string | null;
  nascimentoFichaId?: string | null;
  // Identificação (apelido é obrigatório no create, mas opcional num update parcial)
  apelido?: string;
  nome?: string | null;
  categoriaId?: string | null;
  sexo?: string | null;
  raca?: string | null;
  grau?: string | null;
  pelagem?: string | null;
  chifre?: string | null;
  frame?: string | null;
  categoriaGenealogica?: string | null;
  ceip?: string | null;
  porte?: string | null;
  lote?: string | null;
  rfid?: string | null;
  sisbov?: string | null;
  rgn?: string | null;
  rgd?: string | null;
  serie?: string | null;
  peso?: string | null;
  pesagem?: string | null;
  obs?: string | null;
  // Entrada (Cadastro Essencial)
  eventoEntrada?: string | null;
  dataEntrada?: string | null;
  // Origem
  data?: string | null;
  pesoNascer?: string | null;
  colostro?: string | null;
  parto?: string | null;
  fazendaNascimento?: string | null;
  // Genealogia
  pai?: string | null;
  mae?: string | null;
  avoPaterno?: string | null;
  avoMaterno?: string | null;
  // Situação
  situacao?: string;
  // Campos das abas ainda não estruturadas + futuros.
  extras?: Record<string, unknown>;
}

export async function listByOrganization(organizationId: string) {
  return db.select().from(fichasAnimal)
    .where(eq(fichasAnimal.organizationId, organizationId))
    .orderBy(desc(fichasAnimal.createdAt));
}

export async function create(data: FichaAnimalWritable & {
  organizationId: string;
  apelido: string;
  criadoPor?: string | null;
}) {
  const [row] = await db.insert(fichasAnimal).values({
    organizationId: data.organizationId,
    farmId: data.farmId ?? null,
    nascimentoFichaId: data.nascimentoFichaId ?? null,
    apelido: data.apelido,
    nome: data.nome ?? null,
    categoriaId: data.categoriaId ?? null,
    sexo: data.sexo ?? null,
    raca: data.raca ?? null,
    grau: data.grau ?? null,
    pelagem: data.pelagem ?? null,
    chifre: data.chifre ?? null,
    frame: data.frame ?? null,
    categoriaGenealogica: data.categoriaGenealogica ?? null,
    ceip: data.ceip ?? null,
    porte: data.porte ?? null,
    lote: data.lote ?? null,
    rfid: data.rfid ?? null,
    sisbov: data.sisbov ?? null,
    rgn: data.rgn ?? null,
    rgd: data.rgd ?? null,
    serie: data.serie ?? null,
    peso: data.peso ?? null,
    pesagem: data.pesagem ?? null,
    obs: data.obs ?? null,
    eventoEntrada: data.eventoEntrada ?? null,
    dataEntrada: data.dataEntrada ?? null,
    data: data.data ?? null,
    pesoNascer: data.pesoNascer ?? null,
    colostro: data.colostro ?? null,
    parto: data.parto ?? null,
    fazendaNascimento: data.fazendaNascimento ?? null,
    pai: data.pai ?? null,
    mae: data.mae ?? null,
    avoPaterno: data.avoPaterno ?? null,
    avoMaterno: data.avoMaterno ?? null,
    situacao: data.situacao ?? 'ativo',
    extras: data.extras ?? {},
    criadoPor: data.criadoPor ?? null,
  }).returning();
  return row;
}

export async function update(id: string, data: FichaAnimalWritable) {
  // Só grava as chaves recebidas (atualização parcial).
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const keys: (keyof FichaAnimalWritable)[] = [
    'farmId', 'nascimentoFichaId', 'apelido', 'nome', 'categoriaId', 'sexo', 'raca',
    'grau', 'pelagem', 'chifre', 'frame', 'categoriaGenealogica', 'ceip', 'porte',
    'lote', 'rfid', 'sisbov', 'rgn', 'rgd', 'serie', 'peso', 'pesagem', 'obs',
    'eventoEntrada', 'dataEntrada', 'data', 'pesoNascer', 'colostro', 'parto',
    'fazendaNascimento', 'pai', 'mae', 'avoPaterno', 'avoMaterno', 'situacao', 'extras',
  ];
  for (const k of keys) {
    if (data[k] !== undefined) patch[k] = data[k];
  }
  const [row] = await db.update(fichasAnimal)
    .set(patch)
    .where(eq(fichasAnimal.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(fichasAnimal).where(eq(fichasAnimal.id, id as any));
}
