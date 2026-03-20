/**
 * API de evidências de marcos (milestone_evidence + milestone_evidence_files).
 *
 * GET    /api/evidence?milestoneId=...         → listEvidenceByMilestone
 * POST   /api/evidence                         → createEvidence + registrar arquivo (pós-upload B2)
 * PATCH  /api/evidence?id=...                  → updateEvidenceNotes
 * DELETE /api/evidence?id=...                  → deleteEvidence (cascade)
 * DELETE /api/evidence?fileId=...              → deleteEvidenceFile → retorna storage_path para cliente remover do B2
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listEvidenceByMilestone,
  getEvidenceById,
  createEvidence,
  addEvidenceFile,
  updateEvidenceNotes,
  deleteEvidenceFile,
  deleteEvidence,
} from '../src/DB/repositories/evidence.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  if (req.method === 'GET') {
    // GET by evidence id (single record)
    const evidenceId = typeof req.query?.evidenceId === 'string' ? req.query.evidenceId : null;
    if (evidenceId) {
      const row = await getEvidenceById(evidenceId);
      if (!row) { jsonError(res, 'Evidência não encontrada', { status: 404 }); return; }
      jsonSuccess(res, row);
      return;
    }
    const milestoneId = typeof req.query?.milestoneId === 'string' ? req.query.milestoneId : null;
    if (!milestoneId) { jsonError(res, 'milestoneId ou evidenceId é obrigatório', { status: 400 }); return; }
    const rows = await listEvidenceByMilestone(milestoneId);
    jsonSuccess(res, rows);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;
    const milestoneId = String(body?.milestone_id ?? '').trim();
    if (!milestoneId) { jsonError(res, 'milestone_id é obrigatório', { status: 400 }); return; }

    const evidence = await createEvidence(milestoneId, body?.notes ? String(body.notes) : null);

    // Registrar arquivo cujo upload para B2 já foi feito pelo cliente
    if (body?.file) {
      const file = body.file as Record<string, unknown>;
      if (file.storage_path && file.file_name && file.file_type) {
        await addEvidenceFile(evidence.id, {
          file_name: String(file.file_name),
          storage_path: String(file.storage_path),
          file_type: String(file.file_type),
          file_size: file.file_size !== undefined ? Number(file.file_size) : null,
        });
      }
    }

    const rows = await listEvidenceByMilestone(milestoneId);
    jsonSuccess(res, rows[0] ?? evidence);
    return;
  }

  if (req.method === 'PATCH') {
    const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
    if (!id) { jsonError(res, 'id é obrigatório', { status: 400 }); return; }
    const body = (req.body || {}) as Record<string, unknown>;
    const notes = body?.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : null;
    const row = await updateEvidenceNotes(id, notes);
    jsonSuccess(res, row);
    return;
  }

  if (req.method === 'DELETE') {
    // DELETE de arquivo individual: retorna storage_path para cliente limpar B2
    const fileId = typeof req.query?.fileId === 'string' ? req.query.fileId : null;
    if (fileId) {
      const result = await deleteEvidenceFile(fileId);
      jsonSuccess(res, { deleted: true, storage_path: result.storage_path });
      return;
    }

    // DELETE da evidência inteira (cascade apaga arquivos no banco, cliente limpa B2 antes)
    const id = typeof req.query?.id === 'string' ? req.query.id : (req.body as { id?: string })?.id;
    if (!id) { jsonError(res, 'id ou fileId é obrigatório', { status: 400 }); return; }
    await deleteEvidence(id);
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
