/**
 * Sugestão de destino do Geocadastro de Áreas (texto) — POST /api/areas-suggest-destino
 *
 * Recebe o catálogo "Tipos de Locais" da fazenda (categorias + tipos) e uma lista de
 * feições importadas do mapa (nome + tipo de geometria + tipo cru do arquivo). Para cada
 * feição, recomenda o TIPO do catálogo mais adequado, usando o NOME como sinal principal
 * e a GEOMETRIA como apoio:
 *   - "poligono" (área) → uso do solo: pastagem, lavoura, reserva, mata, açude…
 *   - "ponto"           → infra pontual, em geral ligada à ÁGUA (aguada, poço, bebedouro,
 *                          caixa d'água, reservatório) ou benfeitorias (sede, curral);
 *   - "linha"           → infra linear: rede hidráulica / linhas de água, cercas/divisas,
 *                          estradas/carreadores.
 *
 * Diferente de /api/areas-classify (que usa VISÃO sobre satélite p/ pastagem×reserva),
 * aqui é só TEXTO contra o catálogo real da organização. Stateless — não grava nada.
 * Resposta: { results: [{ id, categoriaId, tipo }] } com ids/nomes EXATOS do catálogo
 * (feições sem casamento ficam de fora).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { getProviderKey } from './_lib/env.js';

type Geom = 'poligono' | 'ponto' | 'linha';

interface CatIn {
  id: string;
  nome: string;
}
interface TipoIn {
  id: string;
  categoriaId: string;
  nome: string;
}
interface FeatIn {
  id: string;
  nome: string;
  geom: Geom;
  tipoArquivo?: string | null;
}
interface ResultOut {
  id: string;
  categoriaId: string;
  tipo: string;
}

const MAX_FEATURES = 80; // teto por chamada (custo/latência); o excedente cai no padrão local do front
const MODEL = 'claude-sonnet-4-6';
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Você classifica feições de um mapa rural (fazenda) escolhendo, para CADA feição, o TIPO DE LOCAL mais adequado de um CATÁLOGO fornecido.

Regras de decisão:
- O NOME da feição é o sinal principal.
- A GEOMETRIA é apoio quando o nome é genérico ou ausente:
  • "poligono" (área): normalmente USO DO SOLO — pastagem, lavoura/talhão, reserva, mata, açude/represa. Padrão de área costuma ser PASTAGEM.
  • "ponto": normalmente INFRAESTRUTURA PONTUAL, com frequência ligada à ÁGUA — aguada, poço, bebedouro, caixa d'água, reservatório, cocho; ou benfeitorias (sede, casa, curral).
  • "linha": normalmente INFRAESTRUTURA LINEAR — rede hidráulica / linhas de água (adutoras), cercas/divisas, estradas/carreadores.
- Escolha SEMPRE um item do catálogo pelo campo "ref". Se nada for minimamente adequado, OMITA a feição (não invente tipo fora do catálogo).
- Responda APENAS com um array JSON válido, sem texto fora dele, no formato:
  [{"id":"<id da feição>","ref":"<ref do tipo escolhido>"}]`;

function ok(res: VercelResponse, data: unknown) {
  return res.status(200).json({ ok: true, data });
}
function fail(res: VercelResponse, message: string, status = 400) {
  return res.status(status).json({ ok: false, error: message });
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Extrai o primeiro array JSON do texto do modelo (tolerante a cercas/prosa). */
function parseRefs(text: string): Array<{ id: string; ref: string }> {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x): { id: string; ref: string } | null =>
        x && typeof x.id === 'string' && typeof x.ref === 'string' ? { id: x.id, ref: x.ref } : null,
      )
      .filter((x): x is { id: string; ref: string } => x !== null);
  } catch {
    return [];
  }
}

async function suggestWithClaude(
  apiKey: string,
  tipos: TipoIn[],
  catNomeById: Map<string, string>,
  features: FeatIn[],
): Promise<ResultOut[]> {
  // Catálogo com "ref" estável (evita ambiguidade de tipos homônimos entre categorias).
  const refOfTipo = tipos.map((t, i) => ({ ref: `t${i}`, t }));
  const catalogo = refOfTipo.map(({ ref, t }) => ({
    ref,
    categoria: catNomeById.get(t.categoriaId) ?? '',
    tipo: t.nome,
  }));
  const feats = features.map((f) => ({
    id: f.id,
    nome: f.nome,
    geom: f.geom,
    ...(f.tipoArquivo ? { tipoArquivo: f.tipoArquivo } : {}),
  }));

  const userText =
    `CATÁLOGO (tipos disponíveis):\n${JSON.stringify(catalogo)}\n\n` +
    `FEIÇÕES a classificar:\n${JSON.stringify(feats)}\n\n` +
    `Para cada feição, escolha o "ref" do tipo mais adequado do catálogo. ` +
    `Retorne SOMENTE o array JSON [{"id","ref"}], um objeto por feição que você conseguir classificar.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userText }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${body}`);
    }
    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    let text = '';
    if (Array.isArray(data.content)) {
      for (const block of data.content) if (block.type === 'text') text += block.text ?? '';
    }
    // ref → tipo do catálogo (resolve categoriaId; descarta refs inventados).
    const byRef = new Map(refOfTipo.map(({ ref, t }) => [ref, t] as const));
    const out: ResultOut[] = [];
    const seen = new Set<string>();
    for (const r of parseRefs(text)) {
      if (seen.has(r.id)) continue;
      const t = byRef.get(r.ref);
      if (!t) continue;
      seen.add(r.id);
      out.push({ id: r.id, categoriaId: t.categoriaId, tipo: t.nome });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) return fail(res, 'Não autorizado', 401);

  if (req.method?.toUpperCase() !== 'POST') return fail(res, 'Método não suportado', 405);

  const apiKey = getProviderKey('anthropic');
  if (!apiKey) return fail(res, 'IA não configurada (ANTHROPIC_API_KEY).', 503);

  const body = (req.body ?? {}) as { categorias?: unknown; tipos?: unknown; features?: unknown };

  // Saneia o catálogo.
  const categorias: CatIn[] = Array.isArray(body.categorias)
    ? (body.categorias as CatIn[])
        .filter((c) => c && typeof c.id === 'string' && typeof c.nome === 'string')
        .map((c) => ({ id: c.id, nome: c.nome }))
    : [];
  const tipos: TipoIn[] = Array.isArray(body.tipos)
    ? (body.tipos as TipoIn[])
        .filter((t) => t && typeof t.id === 'string' && typeof t.categoriaId === 'string' && typeof t.nome === 'string')
        .map((t) => ({ id: t.id, categoriaId: t.categoriaId, nome: t.nome }))
    : [];
  if (!tipos.length) return fail(res, 'Catálogo vazio: envie os tipos do catálogo.');

  // Saneia as feições (limita o teto; nome obrigatório só como string, pode ser vazio).
  const rawFeats = Array.isArray(body.features) ? (body.features as FeatIn[]) : [];
  const features: FeatIn[] = [];
  for (const f of rawFeats) {
    if (!f || typeof f.id !== 'string') continue;
    const geom: Geom = f.geom === 'ponto' || f.geom === 'linha' ? f.geom : 'poligono';
    if (features.length < MAX_FEATURES) {
      features.push({ id: f.id, nome: asStr(f.nome), geom, tipoArquivo: asStr(f.tipoArquivo) || null });
    }
  }
  if (!features.length) return fail(res, 'Envie ao menos uma feição ({ id, nome, geom }).');

  try {
    const catNomeById = new Map(categorias.map((c) => [c.id, c.nome] as const));
    const results = await suggestWithClaude(apiKey, tipos, catNomeById, features);
    return ok(res, { results });
  } catch (err: unknown) {
    console.error('[areas-suggest-destino] falha:', err);
    return fail(res, 'Falha ao sugerir os destinos pela IA.', 502);
  }
}
