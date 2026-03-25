import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { pool } from '../src/DB/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  // Buscamos se o usuário é admin em todos os requests na API para garantir a segurança
  const { rows: userRows } = await pool.query(
    'SELECT role FROM user_profiles WHERE id = $1',
    [userId]
  );
  const isAdmin = userRows[0]?.role === 'administrador';

  const action = (req.query.action as string) || (req.body as Record<string, string>)?.action;

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {

      if (action === 'list-my') {
        const { rows } = await pool.query(
          `SELECT t.*, st::text as status
           FROM support_tickets t
           WHERE t.created_by = $1
           ORDER BY t.last_message_at DESC`, [userId]
        );
        jsonSuccess(res, rows); return;
      }

      if (action === 'list-admin') {
        if (!isAdmin) { jsonError(res, 'Proibido: Necessita permissão de administrador', { status: 403 }); return; }
        const status = req.query.status as string | undefined;
        const search = req.query.search as string | undefined;

        let sql = `
          SELECT t.*, t.status::text as status, p.name as user_name
          FROM support_tickets t
          LEFT JOIN user_profiles p ON p.id = t.created_by
          WHERE 1=1
        `;

        const params: unknown[] = [];
        if (status) { params.push(status); sql += ` AND t.status = $${params.length}`; }
        if (search?.trim()) {
          const term = `%${search.trim().replace(/[%_\\]/g, ch => `\\${ch}`)}%`;
          params.push(term);
          sql += ` AND (t.subject ILIKE $${params.length} OR t.current_url ILIKE $${params.length})`;
        }
        sql += ` ORDER BY t.last_message_at DESC`;

        const { rows: tickets } = await pool.query(sql, params);
        jsonSuccess(res, tickets);
        return;
      }

      if (action === 'detail') {
        const ticketId = req.query.ticketId as string;
        if (!ticketId) { jsonError(res, 'ticketId obrigatório', { status: 400 }); return; }

        let ticketQuery = `
          SELECT t.*, t.status::text as status, p.name as user_name
          FROM support_tickets t
          LEFT JOIN user_profiles p ON p.id = t.created_by
          WHERE t.id = $1
        `;
        const ticketParams: unknown[] = [ticketId];

        if (!isAdmin) {
          ticketQuery += ' AND t.created_by = $2';
          ticketParams.push(userId);
        }

        const [{ rows: ticketRows }, { rows: messages }, { rows: attachments }] = await Promise.all([
          pool.query(ticketQuery, ticketParams),
          pool.query(`
            SELECT m.*, m.author_type::text as author_type, p.name as author_name
            FROM support_ticket_messages m
            LEFT JOIN user_profiles p ON p.id = m.author_id
            WHERE m.ticket_id = $1
            ORDER BY m.created_at ASC
          `, [ticketId]),
          pool.query(`SELECT * FROM support_ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC`, [ticketId]),
        ]);

        const ticket = ticketRows[0];
        if (!ticket) { jsonError(res, 'Ticket não encontrado ou sem permissão de acesso', { status: 404 }); return; }

        jsonSuccess(res, { ticket, messages, attachments });
        return;
      }

      if (action === 'admin-unread') {
        if (!isAdmin) { jsonError(res, 'Proibido: Necessita permissão de administrador', { status: 403 }); return; }
        const { rows: [row] } = await pool.query(`
          SELECT COUNT(*) as count FROM support_tickets st
          WHERE NOT EXISTS (
            SELECT 1 FROM support_ticket_reads str
            WHERE str.ticket_id = st.id AND str.user_id = $1
              AND str.last_read_at >= st.last_message_at
          )
        `, [userId]);
        jsonSuccess(res, Number(row?.count ?? 0)); return;
      }

      if (action === 'messages-since') {
        const { ticketId, since } = req.query as Record<string, string>;
        if (!ticketId || !since) { jsonError(res, 'ticketId e since obrigatórios', { status: 400 }); return; }
        if (!isAdmin) {
          const { rowCount } = await pool.query(`SELECT 1 FROM support_tickets WHERE id = $1 AND created_by = $2`, [ticketId, userId]);
          if (!rowCount) { jsonError(res, 'Sem permissão ao ticket', { status: 403 }); return; }
        }

        const [{ rows: msgs }, { rows: atts }] = await Promise.all([
          pool.query(`
            SELECT m.*, m.author_type::text as author_type, p.name as author_name
            FROM support_ticket_messages m
            LEFT JOIN user_profiles p ON p.id = m.author_id
            WHERE m.ticket_id = $1 AND m.created_at >= $2
            ORDER BY m.created_at ASC
          `, [ticketId, since]),
          pool.query(`SELECT * FROM support_ticket_attachments WHERE ticket_id = $1 AND created_at >= $2 ORDER BY created_at ASC`, [ticketId, since]),
        ]);
        jsonSuccess(res, { messages: msgs, attachments: atts });
        return;
      }

      if (action === 'message') {
        const { messageId } = req.query as Record<string, string>;
        if (!messageId) { jsonError(res, 'messageId obrigatório', { status: 400 }); return; }
        const { rows: [msg] } = await pool.query(`
          SELECT m.*, m.author_type::text as author_type, p.name as author_name, t.created_by as ticket_owner
          FROM support_ticket_messages m
          LEFT JOIN user_profiles p ON p.id = m.author_id
          JOIN support_tickets t ON t.id = m.ticket_id
          WHERE m.id = $1
        `, [messageId]);

        if (!msg) { jsonSuccess(res, null); return; }
        if (!isAdmin && msg.ticket_owner !== userId) { jsonError(res, 'Sem permissão à mensagem', { status: 403 }); return; }

        delete msg.ticket_owner;
        jsonSuccess(res, msg);
        return;
      }

      if (action === 'user-names') {
        const ids = req.query.ids as string | string[];
        const idList = Array.isArray(ids) ? ids : ids?.split(',').filter(Boolean);
        if (!idList?.length) { jsonSuccess(res, {}); return; }
        const { rows } = await pool.query(`SELECT id, name FROM user_profiles WHERE id = ANY($1)`, [idList]);
        jsonSuccess(res, Object.fromEntries(rows.map((r: Record<string, string>) => [r.id, r.name])));
        return;
      }
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body as Record<string, unknown>;

      if (action === 'create') {
        const { ticketType, subject, currentUrl, locationArea, specificScreen } = body as Record<string, string>;
        const { rows: [ticket] } = await pool.query(`
          INSERT INTO support_tickets (created_by, ticket_type, subject, status, current_url, location_area, specific_screen, last_message_at)
          VALUES ($1, $2, $3, 'open', $4, $5, $6, now())
          RETURNING *
        `, [userId, ticketType, subject || (ticketType === 'erro_tecnico' ? 'Erro técnico' : 'Sugestão/Solicitação'), currentUrl || null, locationArea || null, specificScreen || null]);
        jsonSuccess(res, ticket); return;
      }

      if (action === 'send-message') {
        const { ticketId, message, authorType, replyToId } = body as Record<string, string>;
        if (!isAdmin) {
          const { rowCount } = await pool.query(`SELECT 1 FROM support_tickets WHERE id = $1 AND created_by = $2`, [ticketId, userId]);
          if (!rowCount) { jsonError(res, 'Acesso negado para enviar mensagem a este ticket', { status: 403 }); return; }
        }

        const safeAuthorType = isAdmin && authorType === 'ai' ? 'ai' : (isAdmin ? 'agent' : 'user');

        const { rows: [msg] } = await pool.query(`
          INSERT INTO support_ticket_messages (ticket_id, author_id, author_type, message, reply_to_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [ticketId, userId, safeAuthorType, message, replyToId || null]);
        await pool.query(`UPDATE support_tickets SET last_message_at = now(), updated_at = now() WHERE id = $1`, [ticketId]);
        jsonSuccess(res, msg); return;
      }

      if (action === 'update-message') {
        const { messageId, message } = body as Record<string, string>;
        const { rowCount } = await pool.query(`UPDATE support_ticket_messages SET message = $1, edited_at = now() WHERE id = $2 AND author_id = $3`, [message, messageId, userId]);
        if (!rowCount) { jsonError(res, 'Mensagem não encontrada ou sem permissão de edição', { status: 404 }); return; }
        jsonSuccess(res, null); return;
      }

      if (action === 'delete-message') {
        const { messageId } = body as Record<string, string>;
        const { rowCount } = await pool.query(`DELETE FROM support_ticket_messages WHERE id = $1 AND author_id = $2`, [messageId, userId]);
        if (!rowCount) { jsonError(res, 'Mensagem não encontrada ou sem permissão de exclusão', { status: 404 }); return; }
        jsonSuccess(res, null); return;
      }

      if (action === 'update-status') {
        const { ticketId, status } = body as Record<string, string>;
        // Apenas ADMIN ou dono do ticket (para homologar status "done" de volta pra "open") podem atualizar o ticket
        let queryStr = `UPDATE support_tickets SET status = $1, updated_at = now() WHERE id = $2`;
        const queryParams: unknown[] = [status, ticketId];

        if (!isAdmin) {
          queryStr += ` AND created_by = $3`;
          queryParams.push(userId);
        }

        const { rowCount } = await pool.query(queryStr, queryParams);
        if (!rowCount) { jsonError(res, 'Ocorreu um erro ou você não tem permissão para alterar este ticket', { status: 403 }); return; }
        jsonSuccess(res, null); return;
      }

      if (action === 'mark-read') {
        const { ticketId } = body as Record<string, string>;
        if (!isAdmin) {
          const { rowCount } = await pool.query(`SELECT 1 FROM support_tickets WHERE id = $1 AND created_by = $2`, [ticketId, userId]);
          if (!rowCount) { jsonError(res, 'Sem acesso ao ticket', { status: 403 }); return; }
        }

        await pool.query(`
          INSERT INTO support_ticket_reads (ticket_id, user_id, last_read_at)
          VALUES ($1, $2, now())
          ON CONFLICT (ticket_id, user_id) DO UPDATE SET last_read_at = now(), updated_at = now()
        `, [ticketId, userId]);
        jsonSuccess(res, null); return;
      }

      if (action === 'save-attachment') {
        const { ticketId, messageId, storagePath, fileName, mimeType, fileSize } = body as Record<string, string>;
        if (!isAdmin) {
          const { rowCount } = await pool.query(`SELECT 1 FROM support_tickets WHERE id = $1 AND created_by = $2`, [ticketId, userId]);
          if (!rowCount) { jsonError(res, 'Sem permissão no ticket para anexar arquivo', { status: 403 }); return; }
        }

        const { rows: [att] } = await pool.query(`
          INSERT INTO support_ticket_attachments (ticket_id, message_id, storage_path, file_name, mime_type, file_size, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [ticketId, messageId || null, storagePath, fileName, mimeType, Number(fileSize), userId]);
        jsonSuccess(res, att); return;
      }
    }

    jsonError(res, 'Ação não reconhecida', { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[support-tickets]', msg);
    jsonError(res, msg, { status: 500 });
  }
}
