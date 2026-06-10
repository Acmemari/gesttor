import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { padraoRacial } from '../schema.js';

/**
 * Cadastro de Padrão Racial e Grau de Sangue.
 *
 * `classificacao` é o Padrão Racial exclusivo (PO | PC | LA | Comercial) e
 * `ceip` é combinável: pode ficar sozinho ou junto de PO/PC/LA, nunca com Comercial.
 * `grauSangue` é o Grau de Sangue (Puro, 1/2 sangue, 3/4 sangue, ...). A normalização
 * dessas regras é feita na rota de API; aqui ficam apenas as operações de persistência.
 *
 * Mantém o flag `sistema` para paridade com o cadastro de Raças: registros
 * marcados como padrão do sistema só podem ser ativados/inativados.
 */

export async function listByOrganization(organizationId: string) {
  return db.select().from(padraoRacial)
    .where(eq(padraoRacial.organizationId, organizationId))
    .orderBy(asc(padraoRacial.ordem));
}

export async function create(data: {
  organizationId: string;
  nome: string;
  classificacao?: string | null;
  ceip?: boolean;
  grauSangue?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}) {
  const [maxRow] = await db.select({ maxOrdem: max(padraoRacial.ordem) })
    .from(padraoRacial)
    .where(eq(padraoRacial.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(padraoRacial).values({
    organizationId: data.organizationId,
    nome: data.nome,
    classificacao: data.classificacao ?? null,
    ceip: data.ceip ?? false,
    grauSangue: data.grauSangue ?? null,
    observacao: data.observacao ?? null,
    // `sistema` nunca vem do usuário: registros criados na tela não são padrão do sistema.
    sistema: false,
    ativo: data.ativo ?? true,
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  nome?: string;
  classificacao?: string | null;
  ceip?: boolean;
  grauSangue?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}) {
  // Registros padrão do sistema só podem ser ativados/inativados.
  const [existing] = await db.select({ sistema: padraoRacial.sistema })
    .from(padraoRacial)
    .where(eq(padraoRacial.id, id as any));
  if (existing?.sistema) {
    const onlyAtivo = Object.keys(data).every((k) => k === 'ativo');
    if (!onlyAtivo) {
      throw new Error('Registro padrão do sistema: só é permitido ativar/inativar.');
    }
  }

  const [row] = await db.update(padraoRacial)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(padraoRacial.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  // Registros padrão do sistema não podem ser excluídos.
  const [existing] = await db.select({ sistema: padraoRacial.sistema })
    .from(padraoRacial)
    .where(eq(padraoRacial.id, id as any));
  if (existing?.sistema) {
    throw new Error('Registro padrão do sistema não pode ser excluído.');
  }
  await db.delete(padraoRacial).where(eq(padraoRacial.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(padraoRacial)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(padraoRacial.id, item.id as any));
    }
  });
}
