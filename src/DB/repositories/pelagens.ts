import { eq, asc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { pelagens } from '../schema.js';

/**
 * Pelagens padrão do sistema. Toda organização recebe esta lista
 * pré-cadastrada na primeira vez que abre o cadastro (auto-seed quando vazio).
 */
export const DEFAULT_PELAGENS: {
  descricao: string;
  bovino: boolean;
  equideo: boolean;
  observacao: string;
  imagens: string[];
}[] = [
  {
    descricao: 'Alazã',
    bovino: false,
    equideo: true,
    observacao: 'Corpo avermelhado, com crina e cauda geralmente da mesma cor ou mais claras.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Alazã.png']
  },
  {
    descricao: 'Castanha',
    bovino: false,
    equideo: true,
    observacao: 'Corpo marrom/vermelho com crina, cauda e extremidades pretas. Pode ser castanha clara ou castanha escura.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Castanha.png']
  },
  {
    descricao: 'Preta',
    bovino: false,
    equideo: true,
    observacao: 'Corpo, crina e cauda pretos.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Preta.png']
  },
  {
    descricao: 'Tordilha',
    bovino: false,
    equideo: true,
    observacao: 'Nasce escura e vai clareando com a idade, podendo ficar quase branca.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Tordilha.png']
  },
  {
    descricao: 'Baia',
    bovino: false,
    equideo: true,
    observacao: 'Tom amarelo-claro, creme ou dourado, geralmente com crina, cauda e extremidades escuras.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Baia.png']
  },
  {
    descricao: 'Lobuna',
    bovino: false,
    equideo: true,
    observacao: 'Tom acinzentado ou amarronzado, geralmente com crina e cauda escuras.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Lobuna.png']
  },
  {
    descricao: 'Rosilha',
    bovino: false,
    equideo: true,
    observacao: 'Mistura de pelos brancos com pelos coloridos, sem clarear tanto com a idade.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Rosilha.png']
  },
  {
    descricao: 'Pampa',
    bovino: false,
    equideo: true,
    observacao: 'Pelagem com grandes manchas brancas e coloridas.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Pampa.png']
  },
  {
    descricao: 'Tobiana',
    bovino: false,
    equideo: true,
    observacao: 'Tipo de pampa, com manchas grandes e bem distribuídas.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Tobiana.png']
  },
  {
    descricao: 'Oveira',
    bovino: false,
    equideo: true,
    observacao: 'Manchas brancas irregulares, geralmente sem cruzar totalmente o dorso.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Oveira.png']
  },
  {
    descricao: 'Apalusa',
    bovino: false,
    equideo: true,
    observacao: 'Pelagem com pintas, manchas ou salpicados, comum na raça Appaloosa.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Apalusa.png']
  },
  {
    descricao: 'Gateada',
    bovino: false,
    equideo: true,
    observacao: 'Tom amarelado ou acastanhado, muitas vezes com listra dorsal.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Gateada.png']
  },
  {
    descricao: 'Zaina',
    bovino: false,
    equideo: true,
    observacao: 'Castanha escura, quase preta, geralmente sem marcas brancas.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Zaina.png']
  },
  {
    descricao: 'Ruão',
    bovino: false,
    equideo: true,
    observacao: 'Mistura uniforme de pelos brancos com outra cor.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Ruã.png']
  },
  {
    descricao: 'Isabel',
    bovino: false,
    equideo: true,
    observacao: 'Corpo creme/dourado claro, crina e cauda claras.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Isabel.png']
  },
  {
    descricao: 'Palomina',
    bovino: false,
    equideo: true,
    observacao: 'Corpo dourado com crina e cauda brancas ou bem claras.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Palomina.png']
  },
  {
    descricao: 'Cremela',
    bovino: false,
    equideo: true,
    observacao: 'Pelagem creme muito clara.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Cremela.png']
  },
  {
    descricao: 'Perlina',
    bovino: false,
    equideo: true,
    observacao: 'Parecida com cremela, mas com tom levemente mais escuro ou perolado.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Perlina.png']
  },
  {
    descricao: 'Branca',
    bovino: true,
    equideo: false,
    observacao: 'Pelagem branca predominante. Em equinos, pode ser confundida com tordilha muito clara.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Branca.png']
  },
  {
    descricao: 'Cinza',
    bovino: true,
    equideo: false,
    observacao: 'Pelagem acinzentada. No caso de bovinos, é a \'branca\' comum do Nelore; pode ser dividida em cinza clara e cinza escura.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Cinza.png']
  },
  {
    descricao: 'Vermelha',
    bovino: true,
    equideo: false,
    observacao: 'Pelagem de tom vermelho ou avermelhado.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Vermelha.png']
  },
  {
    descricao: 'Amarela',
    bovino: true,
    equideo: false,
    observacao: 'Pelagem amarelada, podendo variar do amarelo mais vivo ao tom palha.',
    imagens: ['https://s3.us-east-005.backblazeb2.com/gesttor/pelagens-photos/defaults/Amarela.png']
  }
];

async function seedDefaults(organizationId: string) {
  await db.insert(pelagens).values(
    DEFAULT_PELAGENS.map((p, i) => ({
      organizationId,
      descricao: p.descricao,
      bovino: p.bovino,
      equideo: p.equideo,
      observacao: p.observacao,
      imagens: p.imagens,
      ordem: i,
    })),
  );
}

export async function listByOrganization(organizationId: string) {
  const rows = await db.select().from(pelagens)
    .where(eq(pelagens.organizationId, organizationId))
    .orderBy(asc(pelagens.ordem));

  // Auto-seed: na primeira vez que a org abre o cadastro, popula a lista padrão.
  if (rows.length === 0) {
    await seedDefaults(organizationId);
    return db.select().from(pelagens)
      .where(eq(pelagens.organizationId, organizationId))
      .orderBy(asc(pelagens.ordem));
  }

  return rows;
}

export async function create(data: {
  organizationId: string;
  descricao: string;
  bovino: boolean;
  equideo: boolean;
  observacao?: string | null;
  imagens?: string[];
}) {
  const [maxRow] = await db.select({ maxOrdem: max(pelagens.ordem) })
    .from(pelagens)
    .where(eq(pelagens.organizationId, data.organizationId));
  const nextOrdem = (maxRow?.maxOrdem ?? -1) + 1;

  const [row] = await db.insert(pelagens).values({
    organizationId: data.organizationId,
    descricao: data.descricao,
    bovino: data.bovino,
    equideo: data.equideo,
    observacao: data.observacao ?? null,
    imagens: data.imagens ?? [],
    ordem: nextOrdem,
  }).returning();
  return row;
}

export async function update(id: string, data: {
  descricao?: string;
  bovino?: boolean;
  equideo?: boolean;
  observacao?: string | null;
  imagens?: string[];
}) {
  const [row] = await db.update(pelagens)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pelagens.id, id as any))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(pelagens).where(eq(pelagens.id, id as any));
}

export async function reorder(items: { id: string; ordem: number }[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(pelagens)
        .set({ ordem: item.ordem, updatedAt: new Date() })
        .where(eq(pelagens.id, item.id as any));
    }
  });
}
