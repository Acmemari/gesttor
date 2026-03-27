/**
 * API de administração de usuários.
 * Substitui as RPCs Supabase: get_users_for_admin, admin_update_user_profile, delete_user_completely.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { pool } from '../src/DB/index.js';

async function isAdmin(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_profiles WHERE id = $1 AND role = 'administrador'`,
    [userId],
  );
  return rows.length > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  if (!(await isAdmin(userId))) {
    jsonError(res, 'Acesso restrito a administradores', { status: 403 });
    return;
  }

  const action = (req.query.action as string) || (req.body as Record<string, string>)?.action;

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {

      // Lista todos os usuários (exceto administradores)
      if (action === 'list-users') {
        // Reconciliação: garante que todo ba_user tem user_profiles (cobre usuários antigos)
        await pool.query(`
          INSERT INTO user_profiles (id, email, name, role, status, ativo, avatar, created_at, updated_at)
          SELECT b.id, b.email, COALESCE(b.name, split_part(b.email, '@', 1)),
                 'visitante', 'active', true,
                 upper(left(COALESCE(b.name, b.email), 1)), now(), now()
          FROM ba_user b
          WHERE NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = b.id)
          ON CONFLICT (id) DO NOTHING
        `);

        const search = (req.query.search as string)?.trim() || null;
        const offset = Number(req.query.offset) || 0;
        const limit = Math.min(Number(req.query.limit) || 500, 500);

        let sql = `
          SELECT up.id, up.name, up.email, up.role, up.avatar, up.image_url, up.plan, up.status,
                 up.last_login, up.phone, up.created_at, up.updated_at,
                 o.id AS client_id
          FROM user_profiles up
          LEFT JOIN organizations o ON o.owner_id = up.id
          WHERE 1=1
        `;
        const params: unknown[] = [];

        if (search) {
          params.push(`%${search}%`);
          sql += ` AND (up.name ILIKE $${params.length} OR up.email ILIKE $${params.length})`;
        }

        sql += ` ORDER BY up.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const { rows } = await pool.query(sql, params);
        jsonSuccess(res, rows);
        return;
      }

      // Lista analistas e administradores (para AnalystManagement)
      if (action === 'list-analysts') {
        const { rows } = await pool.query(
          `SELECT id, name, email FROM user_profiles WHERE role IN ('analista', 'administrador') ORDER BY name ASC`,
        );
        jsonSuccess(res, rows);
        return;
      }

      // Lista organizações ativas (para o seletor do modal de edição)
      if (action === 'list-organizations') {
        const { rows } = await pool.query(
          `SELECT id, name FROM organizations WHERE status = 'active' ORDER BY name ASC`,
        );
        jsonSuccess(res, rows);
        return;
      }

      // Retorna dados vinculados a um usuário (para exibir antes de excluir)
      if (action === 'user-links') {
        const targetUserId = req.query.targetUserId as string;
        if (!targetUserId) { jsonError(res, 'targetUserId é obrigatório', { status: 400 }); return; }

        const [orgsRes, farmsRes, ticketsRes, scenariosRes, questionnairesRes, feedbacksRes, farmMapsRes, orgDocsRes] = await Promise.all([
          pool.query(`SELECT name FROM organizations WHERE analyst_id = $1 ORDER BY name`, [targetUserId]),
          pool.query(`SELECT COUNT(*) AS count FROM organization_analysts WHERE analyst_id = $1`, [targetUserId]),
          pool.query(`SELECT COUNT(*) AS count FROM support_tickets WHERE created_by = $1`, [targetUserId]),
          pool.query(`SELECT COUNT(*) AS count FROM cattle_scenarios WHERE user_id = $1`, [targetUserId]),
          pool.query(`SELECT COUNT(*) AS count FROM saved_questionnaires WHERE user_id = $1`, [targetUserId]),
          pool.query(`SELECT COUNT(*) AS count FROM saved_feedbacks WHERE created_by = $1`, [targetUserId]),
          pool.query(`SELECT COUNT(*) AS count FROM farm_maps WHERE uploaded_by = $1`, [targetUserId]),
          pool.query(`SELECT COUNT(*) AS count FROM organization_documents WHERE uploaded_by = $1`, [targetUserId]),
        ]);

        jsonSuccess(res, {
          organizations: orgsRes.rows.map((r: { name: string }) => r.name) as string[],
          farmPermissions: Number(farmsRes.rows[0].count),
          supportTickets: Number(ticketsRes.rows[0].count),
          cattleScenarios: Number(scenariosRes.rows[0].count),
          savedQuestionnaires: Number(questionnairesRes.rows[0].count),
          savedFeedbacks: Number(feedbacksRes.rows[0].count),
          farmMaps: Number(farmMapsRes.rows[0].count),
          orgDocuments: Number(orgDocsRes.rows[0].count),
        });
        return;
      }
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body as Record<string, unknown>;

      // Atualiza role/status de um usuário + vínculo com organização
      if (action === 'update-user') {
        const { targetUserId, role, status, organizationId, clientOrgId } = body as {
          targetUserId: string;
          role: string;
          status: string;
          organizationId?: string | null;
          clientOrgId?: string | null;
        };

        if (!targetUserId || !role || !status) {
          jsonError(res, 'targetUserId, role e status são obrigatórios', { status: 400 });
          return;
        }

        // Não pode alterar outro administrador (mas pode alterar a si mesmo)
        const { rows: targetRows } = await pool.query(
          `SELECT role FROM user_profiles WHERE id = $1`,
          [targetUserId],
        );
        if (!targetRows.length) { jsonError(res, 'Usuário não encontrado', { status: 404 }); return; }
        if (targetRows[0].role === 'administrador' && targetUserId !== userId) {
          jsonError(res, 'Não é possível alterar outro administrador', { status: 403 });
          return;
        }

        const validRoles = ['visitante', 'analista', 'cliente', 'administrador'];
        if (!validRoles.includes(role)) {
          jsonError(res, `Role inválido. Use: ${validRoles.join(', ')}`, { status: 400 });
          return;
        }

        await pool.query(
          `UPDATE user_profiles SET role = $1, status = $2, updated_at = now() WHERE id = $3`,
          [role, status, targetUserId],
        );

        // Gerencia vínculos com organizações
        if (role === 'analista' && organizationId) {
          // Vincula analista à organização como responsável
          await pool.query(
            `UPDATE organizations SET analyst_id = $1 WHERE id = $2`,
            [targetUserId, organizationId],
          );
        } else {
          // Limpa qualquer vínculo owner_id anterior deste usuário
          await pool.query(
            `UPDATE organizations SET owner_id = NULL WHERE owner_id = $1`,
            [targetUserId],
          );
          // Se for cliente com organização selecionada, vincula como proprietário
          if (role === 'cliente' && clientOrgId) {
            await pool.query(
              `UPDATE organizations SET owner_id = $1 WHERE id = $2`,
              [targetUserId, clientOrgId],
            );
          }
        }

        const { rows: updated } = await pool.query(
          `SELECT id, name, email, role, status FROM user_profiles WHERE id = $1`,
          [targetUserId],
        );
        jsonSuccess(res, updated[0]);
        return;
      }

      // Exclui usuário e todos os dados relacionados
      if (action === 'delete-user') {
        const { targetUserId } = body as { targetUserId: string };

        if (!targetUserId) { jsonError(res, 'targetUserId é obrigatório', { status: 400 }); return; }

        // Não pode excluir administrador
        const { rows: targetRows } = await pool.query(
          `SELECT role FROM user_profiles WHERE id = $1`,
          [targetUserId],
        );
        if (!targetRows.length) { jsonError(res, 'Usuário não encontrado', { status: 404 }); return; }
        if (targetRows[0].role === 'administrador') {
          jsonError(res, 'Não é possível excluir um administrador', { status: 403 });
          return;
        }

        // Remoção em cascata dentro de uma transação para garantir atomicidade
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Tabelas com created_by: reassigna para o admin em vez de setar NULL
          const reassignSteps = [
            { label: 'initiatives (created_by)', sql: `UPDATE initiatives SET created_by = $2 WHERE created_by = $1` },
            { label: 'deliveries (created_by)', sql: `UPDATE deliveries SET created_by = $2 WHERE created_by = $1` },
            { label: 'projects (created_by)', sql: `UPDATE projects SET created_by = $2 WHERE created_by = $1` },
            { label: 'assignees (created_by)', sql: `UPDATE assignees SET created_by = $2 WHERE created_by = $1` },
          ];
          for (const step of reassignSteps) {
            await client.query(step.sql, [targetUserId, userId]).catch(e => {
              throw new Error(`Falha ao reatribuir "${step.label}": ${e.message}`);
            });
          }

          const steps: Array<{ label: string; sql: string }> = [
            { label: 'cattle_scenarios', sql: `DELETE FROM cattle_scenarios WHERE user_id = $1` },
            { label: 'saved_questionnaires', sql: `DELETE FROM saved_questionnaires WHERE user_id = $1` },
            { label: 'saved_feedbacks', sql: `DELETE FROM saved_feedbacks WHERE created_by = $1` },
            { label: 'ai_token_usage', sql: `DELETE FROM ai_token_usage WHERE user_id = $1` },
            { label: 'program_audit_log', sql: `DELETE FROM program_audit_log WHERE changed_by = $1` },
            { label: 'farm_maps', sql: `DELETE FROM farm_maps WHERE uploaded_by = $1` },
            { label: 'organization_documents', sql: `DELETE FROM organization_documents WHERE uploaded_by = $1` },
            { label: 'support_ticket_messages', sql: `DELETE FROM support_ticket_messages WHERE author_id = $1` },
            { label: 'support_tickets', sql: `DELETE FROM support_tickets WHERE created_by = $1` },
            { label: 'organizations (analyst_id)', sql: `UPDATE organizations SET analyst_id = NULL WHERE analyst_id = $1` },
            { label: 'organizations (owner_id)', sql: `UPDATE organizations SET owner_id = NULL WHERE owner_id = $1` },
            { label: 'organization_analysts', sql: `DELETE FROM organization_analysts WHERE analyst_id = $1` },
            { label: 'agent_runs', sql: `DELETE FROM agent_runs WHERE user_id = $1` },
            { label: 'token_ledger', sql: `DELETE FROM token_ledger WHERE user_id = $1` },
            { label: 'user_profiles', sql: `DELETE FROM user_profiles WHERE id = $1` },
            { label: 'ba_user', sql: `DELETE FROM ba_user WHERE id = $1` },
          ];
          for (const step of steps) {
            await client.query(step.sql, [targetUserId]).catch(e => {
              throw new Error(`Falha ao limpar "${step.label}": ${e.message}`);
            });
          }

          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          throw txErr;
        } finally {
          client.release();
        }

        jsonSuccess(res, null);
        return;
      }
    }

    jsonError(res, 'Ação não reconhecida', { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin]', msg);
    jsonError(res, msg, { status: 500 });
  }
}
