/**
 * API de programa de trabalho — carregamento hierárquico sem N+1.
 *
 * GET /api/program?orgId=...       → projetos com progresso (via v_program_progress)
 * GET /api/program?projectId=...   → hierarquia completa: projeto + entregas + iniciativas + marcos + tarefas
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { getUserRole, assertOrgAccess, assertProjectAccess } from './_lib/orgAccess.js';
import { db } from '../src/DB/index.js';
import { sql, eq } from 'drizzle-orm';
import { projects, deliveries, initiatives, initiativeMilestones, initiativeTasks } from '../src/DB/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { jsonError(res, 'Método não permitido', { status: 405 }); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) {
    jsonError(res, 'Não autorizado', { code: 'AUTH_MISSING_OR_INVALID_TOKEN', status: 401 });
    return;
  }

  const orgId = typeof req.query?.orgId === 'string' ? req.query.orgId : null;
  const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId : null;

  try {
    const role = await getUserRole(userId);

    // ── Visão geral de progresso por organização ───────────────────────────────
    if (orgId) {
      await assertOrgAccess(orgId, userId, role);

      const result = await db.execute(sql`
        SELECT
          p.id,
          p.name,
          p.organization_id,
          p.percent,
          p.start_date,
          p.end_date,
          p.sort_order,
          COALESCE(vp.total_tasks, 0)      AS total_tasks,
          COALESCE(vp.completed_tasks, 0)  AS completed_tasks,
          COALESCE(vp.total_deliveries, 0) AS total_deliveries,
          COALESCE(vp.total_initiatives, 0) AS total_initiatives
        FROM projects p
        LEFT JOIN v_program_progress vp ON vp.project_id = p.id
        WHERE p.organization_id = ${orgId}
        ORDER BY p.sort_order ASC, p.name ASC
      `);
      const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? [];
      jsonSuccess(res, rows);
      return;
    }

    // ── Hierarquia completa de um projeto ─────────────────────────────────────
    if (projectId) {
      await assertProjectAccess(projectId, userId, role);

      // Buscar todas as entidades em paralelo (4 queries vs N queries encadeadas)
      const [projectRows, deliveryRows, initiativeRows, milestoneRows, taskRows] = await Promise.all([
        db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
        db.select().from(deliveries).where(eq(deliveries.projectId, projectId)).orderBy(deliveries.sortOrder),
        db.execute(sql`
          SELECT i.* FROM initiatives i
          JOIN deliveries d ON d.id = i.delivery_id
          WHERE d.project_id = ${projectId}
          ORDER BY i.sort_order ASC
        `),
        db.execute(sql`
          SELECT m.* FROM initiative_milestones m
          JOIN initiatives i ON i.id = m.initiative_id
          JOIN deliveries d ON d.id = i.delivery_id
          WHERE d.project_id = ${projectId}
          ORDER BY m.sort_order ASC
        `),
        db.execute(sql`
          SELECT t.* FROM initiative_tasks t
          JOIN initiative_milestones m ON m.id = t.milestone_id
          JOIN initiatives i ON i.id = m.initiative_id
          JOIN deliveries d ON d.id = i.delivery_id
          WHERE d.project_id = ${projectId}
          ORDER BY t.kanban_order ASC
        `),
      ]);

      const project = projectRows[0];
      if (!project) { jsonError(res, 'Projeto não encontrado', { code: 'NOT_FOUND', status: 404 }); return; }

      const rawInitiatives = Array.isArray(initiativeRows) ? initiativeRows : (initiativeRows as { rows?: unknown[] })?.rows ?? [];
      const rawMilestones = Array.isArray(milestoneRows) ? milestoneRows : (milestoneRows as { rows?: unknown[] })?.rows ?? [];
      const rawTasks = Array.isArray(taskRows) ? taskRows : (taskRows as { rows?: unknown[] })?.rows ?? [];

      // Montar árvore em memória (sem queries adicionais)
      type MRow = Record<string, unknown>;
      const tasksByMilestone = new Map<string, MRow[]>();
      for (const t of rawTasks as MRow[]) {
        const mid = String(t.milestone_id);
        const list = tasksByMilestone.get(mid) ?? [];
        list.push(t);
        tasksByMilestone.set(mid, list);
      }

      const milestonesByInitiative = new Map<string, MRow[]>();
      for (const m of rawMilestones as MRow[]) {
        const iid = String(m.initiative_id);
        const list = milestonesByInitiative.get(iid) ?? [];
        list.push({ ...m, tasks: tasksByMilestone.get(String(m.id)) ?? [] });
        milestonesByInitiative.set(iid, list);
      }

      const initiativesByDelivery = new Map<string, MRow[]>();
      for (const i of rawInitiatives as MRow[]) {
        const did = String(i.delivery_id);
        const list = initiativesByDelivery.get(did) ?? [];
        list.push({ ...i, milestones: milestonesByInitiative.get(String(i.id)) ?? [] });
        initiativesByDelivery.set(did, list);
      }

      const deliveriesWithTree = deliveryRows.map(d => ({
        ...d,
        initiatives: initiativesByDelivery.get(d.id) ?? [],
      }));

      jsonSuccess(res, { ...project, deliveries: deliveriesWithTree });
      return;
    }

    jsonError(res, 'orgId ou projectId é obrigatório', { status: 400 });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string };
    jsonError(res, e.message ?? 'Erro interno', { status: e.status ?? 500, code: e.code });
  }
}
