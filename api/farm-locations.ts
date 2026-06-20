/**
 * API route for farm hierarchy: retiros › setores › locais (+ níveis ativos).
 *
 * Bundle (tudo da fazenda numa chamada):
 *   GET    ?bundle=farmId               — { retiros, setores, locais, levels }
 *
 * Níveis ativos por fazenda:
 *   GET    ?levels=farmId               — { retiro, setor, local, configured, usarMapa }
 *   POST   { type:'levels', farmId, retiro, setor, local, configured?, usarMapa? }
 *
 * Retiros:
 *   GET    ?farmId=xxx                  — list retiros
 *   POST   { farmId, name, totalArea?, isDefault? }
 *   PATCH  { id, name?, totalArea?, isDefault? }
 *   DELETE ?retiroId=xxx
 *
 * Setores:
 *   GET    ?setoresByFarm=xxx           — list setores da fazenda
 *   GET    ?setoresByRetiro=xxx         — list setores de um retiro
 *   POST   { type:'setor', farmId, retiroId?, name, area? }
 *   PATCH  { type:'setor', id, name?, area?, retiroId? }
 *   DELETE ?setorId=xxx
 *
 * Locais:
 *   GET    ?retiroId=xxx                — list locais de um retiro
 *   GET    ?setorId=xxx                 — list locais de um setor
 *   GET    ?farmIdLocais=xxx            — list all locais da fazenda
 *   POST   { type:'local', farmId, retiroId?, setorId?, name, area? }
 *   PATCH  { type:'local', id, name?, area?, retiroId?, setorId? }
 *   DELETE ?localId=xxx
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  getRetiros,
  createRetiro,
  updateRetiro,
  deleteRetiro,
  getSetores,
  getSetoresByRetiro,
  createSetor,
  updateSetor,
  deleteSetor,
  getLocais,
  getLocaisBySetor,
  getLocaisByFarm,
  createLocal,
  updateLocal,
  deleteLocal,
  getLevels,
  setLevels,
  getFarmLocationBundle,
  countLocalDependents,
} from '../src/DB/repositories/farm-locations.js';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

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
      const bundle = str(req.query?.bundle);
      const levels = str(req.query?.levels);
      const farmId = str(req.query?.farmId);
      const retiroId = str(req.query?.retiroId);
      const setorId = str(req.query?.setorId);
      const setoresByFarm = str(req.query?.setoresByFarm);
      const setoresByRetiro = str(req.query?.setoresByRetiro);
      const farmIdLocais = str(req.query?.farmIdLocais);
      const localDependents = str(req.query?.localDependents);

      if (bundle) {
        jsonSuccess(res, await getFarmLocationBundle(bundle));
        return;
      }
      if (localDependents) {
        jsonSuccess(res, await countLocalDependents(localDependents));
        return;
      }
      if (levels) {
        jsonSuccess(res, await getLevels(levels));
        return;
      }
      if (setoresByRetiro) {
        jsonSuccess(res, await getSetoresByRetiro(setoresByRetiro));
        return;
      }
      if (setoresByFarm) {
        jsonSuccess(res, await getSetores(setoresByFarm));
        return;
      }
      if (setorId) {
        jsonSuccess(res, await getLocaisBySetor(setorId));
        return;
      }
      if (retiroId) {
        jsonSuccess(res, await getLocais(retiroId));
        return;
      }
      if (farmIdLocais) {
        // Seletor de local das movimentações: oculta o local padrão (âncora interna).
        const locais = await getLocaisByFarm(farmIdLocais);
        jsonSuccess(res, locais.filter((l: any) => !l.isDefault));
        return;
      }
      if (farmId) {
        jsonSuccess(res, await getRetiros(farmId));
        return;
      }
      jsonError(res, 'Parâmetro de consulta obrigatório', { status: 400 });
      return;
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { type } = req.body ?? {};

      if (type === 'levels') {
        const { farmId, retiro, setor, local, autoNames, configured, usarMapa } = req.body;
        if (!farmId) {
          jsonError(res, 'Campo obrigatório: farmId', { status: 400 });
          return;
        }
        // Nome (do nível anterior) para o registro automático de cada nível
        // desligado; só repassa strings.
        const names =
          autoNames && typeof autoNames === 'object'
            ? {
                retiro: str(autoNames.retiro) || undefined,
                setor: str(autoNames.setor) || undefined,
                local: str(autoNames.local) || undefined,
              }
            : undefined;
        const row = await setLevels(
          farmId,
          {
            retiro: retiro !== false,
            setor: setor === true,
            local: local !== false,
          },
          names,
          // Só repassa quando vier booleano explícito; ausência preserva o atual.
          typeof configured === 'boolean' ? configured : undefined,
          typeof usarMapa === 'boolean' ? usarMapa : undefined,
        );
        jsonSuccess(res, row);
        return;
      }

      if (type === 'setor') {
        const { farmId, retiroId, name, area, dataInicial, geometry, geometrySource } = req.body;
        if (!farmId || !name) {
          jsonError(res, 'Campos obrigatórios: farmId, name', { status: 400 });
          return;
        }
        const row = await createSetor({
          farmId, retiroId: retiroId ?? null, name, area: area ?? null,
          dataInicial: dataInicial ?? null,
          geometry: geometry ?? null, geometrySource: geometrySource ?? null,
        });
        jsonSuccess(res, row);
        return;
      }

      if (type === 'local') {
        const { farmId, retiroId, setorId, name, area, dataInicial, geometry, geometrySource, tipo } = req.body;
        if (!farmId || !name) {
          jsonError(res, 'Campos obrigatórios: farmId, name', { status: 400 });
          return;
        }
        const row = await createLocal({
          farmId,
          retiroId: retiroId ?? null,
          setorId: setorId ?? null,
          name,
          area: area ?? null,
          dataInicial: dataInicial ?? null,
          geometry: geometry ?? null,
          geometrySource: geometrySource ?? null,
          tipo: tipo ?? null,
        });
        jsonSuccess(res, row);
        return;
      }

      // default: retiro
      const { farmId, name, totalArea, isDefault, dataInicial, geometry, geometrySource } = req.body ?? {};
      if (!farmId || !name) {
        jsonError(res, 'Campos obrigatórios: farmId, name', { status: 400 });
        return;
      }
      const row = await createRetiro({
        farmId, name, totalArea: totalArea ?? null, isDefault: isDefault ?? false,
        dataInicial: dataInicial ?? null,
        geometry: geometry ?? null, geometrySource: geometrySource ?? null,
      });
      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { type, id } = req.body ?? {};
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }

      if (type === 'setor') {
        const { name, area, retiroId, dataInicial, geometry, geometrySource } = req.body;
        const row = await updateSetor(id, { name, area, retiroId, dataInicial, geometry, geometrySource });
        jsonSuccess(res, row);
        return;
      }

      if (type === 'local') {
        const { name, area, retiroId, setorId, dataInicial, geometry, geometrySource, tipo } = req.body;
        const row = await updateLocal(id, { name, area, retiroId, setorId, dataInicial, geometry, geometrySource, tipo });
        jsonSuccess(res, row);
        return;
      }

      // default: retiro
      const { name, totalArea, isDefault, dataInicial, geometry, geometrySource } = req.body;
      const row = await updateRetiro(id, { name, totalArea, isDefault, dataInicial, geometry, geometrySource });
      jsonSuccess(res, row);
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const retiroId = str(req.query?.retiroId);
      const setorId = str(req.query?.setorId);
      const localId = str(req.query?.localId);

      if (localId) {
        await deleteLocal(localId);
        jsonSuccess(res, { deleted: true });
        return;
      }
      if (setorId) {
        await deleteSetor(setorId);
        jsonSuccess(res, { deleted: true });
        return;
      }
      if (retiroId) {
        await deleteRetiro(retiroId);
        jsonSuccess(res, { deleted: true });
        return;
      }
      jsonError(res, 'retiroId, setorId ou localId obrigatório', { status: 400 });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err: any) {
    if (err?.message === 'DEFAULT_RECORD_PROTECTED') {
      jsonError(res, 'Registro padrão da fazenda não pode ser excluído.', { status: 409 });
      return;
    }
    console.error('[farm-locations] error:', err);
    jsonError(res, err?.message || 'Erro interno', { status: 500 });
  }
}
