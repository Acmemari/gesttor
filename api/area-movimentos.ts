/**
 * API route do ledger de eventos da Movimentação de Áreas (area_movimentos).
 *
 *   GET    ?organizationId=xxx   — lista movimentos da org
 *   GET    ?farmId=xxx           — lista movimentos da fazenda
 *   GET    ?areaId=xxx           — lista movimentos de uma área (toda a história dela)
 *   POST   { tipo, organizationId, farmId, data, ...campos-do-tipo } — lança um movimento
 *
 * Eventos são IMUTÁVEIS — sem PUT/DELETE. Correção é um novo evento (classe='correcao').
 * Cada movimento grava o evento E atualiza a projeção (cadastro) na mesma transação.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listByOrganization,
  listByFarm,
  listByArea,
  abrir,
  renomear,
  remodelar,
  conversaoUso,
  mover,
  aposentar,
  reativar,
  dividir,
  unir,
  mudarNivel,
} from '../src/DB/repositories/area-movimentos.js';

const VALID_TIPOS = [
  'abertura', 'renomear', 'remodelar', 'conversao_uso', 'mover',
  'aposentar', 'reativar', 'dividir', 'unir', 'nivel',
];

const USOS_VALIDOS = ['Pastagem', 'Agricultura', 'Reserva', 'Silvicultura', 'Outro'];

/** Erros de regra de negócio que viram 400 (validação) em vez de 500. */
const VALIDATION_ERRORS = ['LOCAL_APOSENTADO', 'GEOMETRY_INVALIDA', 'REALOCACAO_DESTINO_INVALIDO', 'DEFAULT_RECORD_PROTECTED'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  try {
    // ── GET ────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const areaId = typeof req.query?.areaId === 'string' ? req.query.areaId : '';
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      const organizationId = typeof req.query?.organizationId === 'string' ? req.query.organizationId : '';
      if (areaId) { jsonSuccess(res, await listByArea(areaId)); return; }
      if (farmId) { jsonSuccess(res, await listByFarm(farmId)); return; }
      if (organizationId) { jsonSuccess(res, await listByOrganization(organizationId)); return; }
      jsonError(res, 'Informe organizationId, farmId ou areaId', { status: 400 });
      return;
    }

    // ── POST (lança movimento) ────────────────────────────────────────────────
    if (req.method === 'POST') {
      const b = req.body ?? {};
      const { tipo, organizationId, farmId, data } = b;

      if (!tipo || !organizationId || !farmId || !data) {
        jsonError(res, 'Campos obrigatórios: tipo, organizationId, farmId, data', { status: 400 });
        return;
      }
      if (!VALID_TIPOS.includes(tipo)) {
        jsonError(res, `tipo inválido. Suportado: ${VALID_TIPOS.join(', ')}`, { status: 400 });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        jsonError(res, 'data deve estar no formato AAAA-MM-DD', { status: 400 });
        return;
      }

      const base = {
        organizationId,
        farmId,
        data: String(data),
        nota: b.nota ?? null,
        classe: b.classe === 'correcao' ? 'correcao' as const : 'movimento' as const,
        criadoPor: userId,
      };

      let result: unknown;
      switch (tipo) {
        case 'abertura':
          if (!b.areaId) return jsonError(res, 'abertura exige areaId', { status: 400 });
          result = await abrir({ ...base, areaId: b.areaId, nivel: b.nivel, depois: b.depois });
          break;
        case 'renomear':
          if (!b.areaId || !b.name) return jsonError(res, 'renomear exige areaId e name', { status: 400 });
          result = await renomear({ ...base, areaId: b.areaId, name: String(b.name).trim() });
          break;
        case 'remodelar':
          if (!b.areaId) return jsonError(res, 'remodelar exige areaId', { status: 400 });
          result = await remodelar({ ...base, areaId: b.areaId, geometry: b.geometry ?? null, geometrySource: b.geometrySource, area: b.area });
          break;
        case 'conversao_uso':
          if (!b.areaId || !b.uso) return jsonError(res, 'conversao_uso exige areaId e uso', { status: 400 });
          if (!USOS_VALIDOS.includes(b.uso)) return jsonError(res, `uso inválido. Suportado: ${USOS_VALIDOS.join(', ')}`, { status: 400 });
          result = await conversaoUso({ ...base, areaId: b.areaId, uso: String(b.uso) });
          break;
        case 'mover':
          if (!b.areaId) return jsonError(res, 'mover exige areaId', { status: 400 });
          result = await mover({ ...base, areaId: b.areaId, retiroId: b.retiroId, setorId: b.setorId });
          break;
        case 'aposentar':
          if (!b.areaId) return jsonError(res, 'aposentar exige areaId', { status: 400 });
          result = await aposentar({ ...base, areaId: b.areaId, motivo: b.motivo ?? null });
          break;
        case 'reativar':
          if (!b.areaId) return jsonError(res, 'reativar exige areaId', { status: 400 });
          result = await reativar({ ...base, areaId: b.areaId });
          break;
        case 'dividir':
          if (!b.parentId || !Array.isArray(b.filhos)) return jsonError(res, 'dividir exige parentId e filhos[]', { status: 400 });
          result = await dividir({ ...base, parentId: b.parentId, filhos: b.filhos, realocacao: b.realocacao, ackTolerancia: b.ackTolerancia });
          break;
        case 'unir':
          if (!Array.isArray(b.origemIds) || !b.destino) return jsonError(res, 'unir exige origemIds[] e destino', { status: 400 });
          result = await unir({ ...base, origemIds: b.origemIds, destino: b.destino, realocacao: b.realocacao, ackTolerancia: b.ackTolerancia });
          break;
        case 'nivel':
          if (!b.nivel || typeof b.retiro !== 'boolean' || typeof b.setor !== 'boolean' || typeof b.local !== 'boolean') {
            return jsonError(res, 'nivel exige nivel e os booleanos retiro/setor/local', { status: 400 });
          }
          result = await mudarNivel({ ...base, nivel: b.nivel, retiro: b.retiro, setor: b.setor, local: b.local });
          break;
        default:
          return jsonError(res, 'tipo não suportado', { status: 400 });
      }

      jsonSuccess(res, result);
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    // 409 com payload extra (jsonError não carrega campos extras): o front precisa
    // dos detalhes para abrir o modal de realocação / confirmar a tolerância.
    if (err?.code === 'REBANHO_PENDENTE') {
      res.status(409).json({ ok: false, error: err.message, code: 'REBANHO_PENDENTE', locais: err.locais });
      return;
    }
    if (err?.code === 'AREA_TOLERANCIA') {
      res.status(409).json({ ok: false, error: err.message, code: 'AREA_TOLERANCIA', esperado: err.esperado, informado: err.informado, difPct: err.difPct });
      return;
    }
    if (VALIDATION_ERRORS.includes(err?.message)) {
      jsonError(res, err.message, { code: 'VALIDATION', status: 400 });
      return;
    }
    console.error('[area-movimentos] error:', err);
    jsonError(res, err?.message || 'Erro ao processar movimento de área. Tente novamente.', { code: 'INTERNAL', status: 500 });
  }
}
