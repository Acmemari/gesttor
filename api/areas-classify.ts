/**
 * Classificação de áreas por visão — Cadastro de Áreas.
 * POST /api/areas-classify
 *
 * Recebe polígonos (id + bbox geográfico) reconstruídos do mapa importado e
 * classifica cada um, a partir da imagem de satélite, como:
 *   - "pastagem" → pasto manejado/aberto (verde-claro, possível malha de piquetes);
 *   - "reserva"  → mata nativa densa / reserva legal (verde-escuro);
 *   - "outro"    → indefinido (água, solo exposto, benfeitoria…).
 *
 * O recorte de satélite é buscado AQUI (server-side, sem CORS) no ArcGIS World
 * Imagery e enviado ao Claude (visão) numa única mensagem com vários recortes
 * rotulados. Resposta: { results: [{ id, classe, confianca }] }.
 *
 * Stateless — não grava nada. A pré-seleção/confirmação acontece no frontend.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { getProviderKey } from './_lib/env.js';

type Classe = 'pastagem' | 'reserva' | 'outro';

/** [minLng, minLat, maxLng, maxLat] em WGS84. */
type Bbox = [number, number, number, number];

interface PolyIn {
  id: string;
  bbox: Bbox;
}
interface ResultOut {
  id: string;
  classe: Classe;
  confianca: number;
}

const MAX_POLY = 24; // recortes por chamada (limita custo/latência da visão)
const IMG_SIZE = 320; // px do recorte de satélite (quadrado)
const MIN_SPAN_DEG = 0.0022; // ~250 m: amplia bbox minúsculo p/ dar contexto à IA
const CONTEXT_PAD = 0.15; // 15% de folga em volta do polígono
const ARCGIS_EXPORT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';
const MODEL = 'claude-sonnet-4-6';
const VISION_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Você é um especialista em sensoriamento remoto e mapeamento rural brasileiro.
Recebe vários RECORTES de imagem de satélite, cada um precedido por "Polígono <id>:" e centrado em uma área de uma fazenda.
Classifique CADA recorte em exatamente uma classe:
- "pastagem": pasto cultivado/manejado — vegetação rasteira aberta, tom verde-claro a amarelado, textura homogênea, frequentemente em talhões/piquetes com divisas retas. É o uso mais comum da fazenda.
- "reserva": mata nativa / reserva legal / APP — floresta densa, copa fechada, verde-escuro, textura "encaroçada" e irregular, normalmente sem divisas retas.
- "outro": água, solo exposto, benfeitorias, estradas ou quando não der para decidir.
Na dúvida entre pastagem e reserva, observe a TEXTURA (lisa=pastagem, encaroçada=reserva) e a COR (clara=pastagem, escura=reserva).
Responda APENAS com um array JSON válido, sem texto fora dele, no formato:
[{"id":"<id>","classe":"pastagem|reserva|outro","confianca":0.0-1.0}]`;

function ok(res: VercelResponse, data: unknown) {
  return res.status(200).json({ ok: true, data });
}
function fail(res: VercelResponse, message: string, status = 400) {
  return res.status(status).json({ ok: false, error: message });
}

/** Amplia o bbox para um tamanho mínimo + folga de contexto. */
function padBbox([minLng, minLat, maxLng, maxLat]: Bbox): Bbox {
  const w = maxLng - minLng;
  const h = maxLat - minLat;
  let padX = w * CONTEXT_PAD;
  let padY = h * CONTEXT_PAD;
  if (w < MIN_SPAN_DEG) padX += (MIN_SPAN_DEG - w) / 2;
  if (h < MIN_SPAN_DEG) padY += (MIN_SPAN_DEG - h) / 2;
  return [minLng - padX, minLat - padY, maxLng + padX, maxLat + padY];
}

function validBbox(b: unknown): b is Bbox {
  return (
    Array.isArray(b) &&
    b.length === 4 &&
    b.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(b[0]) <= 180 &&
    Math.abs(b[2]) <= 180 &&
    Math.abs(b[1]) <= 90 &&
    Math.abs(b[3]) <= 90
  );
}

/** Busca o recorte de satélite (server-side) e devolve base64 PNG, ou null. */
async function fetchSatellite(bbox: Bbox): Promise<string | null> {
  const [minLng, minLat, maxLng, maxLat] = padBbox(bbox);
  const url =
    `${ARCGIS_EXPORT}?bbox=${minLng},${minLat},${maxLng},${maxLat}` +
    `&bboxSR=4326&imageSR=4326&size=${IMG_SIZE},${IMG_SIZE}&format=png&f=image`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return null;
    return buf.toString('base64');
  } catch {
    return null;
  }
}

/** Extrai o primeiro array JSON do texto do modelo (tolerante a cercas/prosa). */
function parseResults(text: string): ResultOut[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x): ResultOut | null => {
        if (!x || typeof x.id !== 'string') return null;
        const classe: Classe =
          x.classe === 'pastagem' || x.classe === 'reserva' ? x.classe : 'outro';
        const conf = Number(x.confianca);
        return { id: x.id, classe, confianca: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5 };
      })
      .filter((x): x is ResultOut => x !== null);
  } catch {
    return [];
  }
}

interface AnthropicBlock {
  type: 'text' | 'image';
  text?: string;
  source?: { type: 'base64'; media_type: 'image/png'; data: string };
}

async function classifyWithClaude(
  apiKey: string,
  items: Array<{ id: string; image: string }>,
): Promise<ResultOut[]> {
  const content: AnthropicBlock[] = [];
  for (const it of items) {
    content.push({ type: 'text', text: `Polígono ${it.id}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: it.image } });
  }
  content.push({
    type: 'text',
    text:
      `Classifique os ${items.length} polígonos acima. ` +
      `Retorne SOMENTE o array JSON com um objeto por polígono (use exatamente os ids informados).`,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
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
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
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
    return parseResults(text);
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

  const raw = (req.body?.polygons ?? []) as unknown[];
  if (!Array.isArray(raw) || raw.length === 0) {
    return fail(res, 'Envie ao menos um polígono ({ id, bbox }).');
  }

  // Saneia + limita; o que exceder MAX_POLY volta como "outro" (sem classificar).
  const valid: PolyIn[] = [];
  const overflow: ResultOut[] = [];
  for (const p of raw as PolyIn[]) {
    if (p && typeof p.id === 'string' && validBbox(p.bbox)) {
      if (valid.length < MAX_POLY) valid.push({ id: p.id, bbox: p.bbox });
      else overflow.push({ id: p.id, classe: 'outro', confianca: 0 });
    }
  }
  if (valid.length === 0) return fail(res, 'Nenhum polígono com bbox válido.');

  try {
    // Recortes de satélite em paralelo.
    const imgs = await Promise.all(
      valid.map(async (p) => ({ id: p.id, image: await fetchSatellite(p.bbox) })),
    );
    const withImg = imgs.filter((x): x is { id: string; image: string } => !!x.image);
    const noImg: ResultOut[] = imgs
      .filter((x) => !x.image)
      .map((x) => ({ id: x.id, classe: 'outro', confianca: 0 }));

    let classified: ResultOut[] = [];
    if (withImg.length) classified = await classifyWithClaude(apiKey, withImg);

    // Garante uma entrada por polígono pedido (fallback "outro" p/ ausentes).
    const byId = new Map<string, ResultOut>();
    for (const r of [...overflow, ...noImg, ...classified]) byId.set(r.id, r);
    const results: ResultOut[] = (raw as PolyIn[])
      .filter((p) => p && typeof p.id === 'string')
      .map((p) => byId.get(p.id) ?? { id: p.id, classe: 'outro', confianca: 0 });

    return ok(res, { results });
  } catch (err: unknown) {
    console.error('[areas-classify] falha:', err);
    return fail(res, 'Falha ao classificar as áreas pela imagem de satélite.', 502);
  }
}
