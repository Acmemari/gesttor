/**
 * API de perguntas do questionário Gente/Gestão/Produção.
 * GET  — lista todas as perguntas (qualquer usuário autenticado)
 * POST — cria pergunta (somente administrador)
 * PATCH ?id= — atualiza pergunta (somente administrador)
 * DELETE ?id= — remove pergunta (somente administrador)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db, pool } from '../src/DB/index.js';
import { questionnaireQuestions } from '../src/DB/schema.js';
import { eq, asc } from 'drizzle-orm';

async function isAdmin(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_profiles WHERE id = $1 AND role = 'administrador'`,
    [userId],
  );
  return rows.length > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  // GET — qualquer usuário autenticado pode listar
  if (req.method === 'GET') {
    const rows = await db
      .select()
      .from(questionnaireQuestions)
      .orderBy(asc(questionnaireQuestions.pergNumber), asc(questionnaireQuestions.category));
    jsonSuccess(res, rows);
    return;
  }

  // Operações de escrita exigem admin
  if (!(await isAdmin(userId))) {
    jsonError(res, 'Acesso restrito a administradores', { status: 403 });
    return;
  }

  // POST — criar pergunta
  if (req.method === 'POST') {
    const body = req.body as {
      pergNumber?: number;
      category: string;
      group: string;
      question: string;
      positiveAnswer: string;
      applicableTypes?: string[];
    };
    if (!body.category || !body.group || !body.question || !body.positiveAnswer) {
      jsonError(res, 'Campos obrigatórios: category, group, question, positiveAnswer', { status: 400 });
      return;
    }
    const [row] = await db
      .insert(questionnaireQuestions)
      .values({
        pergNumber: body.pergNumber ?? null,
        category: body.category,
        group: body.group,
        question: body.question,
        positiveAnswer: body.positiveAnswer,
        applicableTypes: body.applicableTypes ?? [],
      })
      .returning();
    jsonSuccess(res, row);
    return;
  }

  // PATCH — atualizar pergunta
  if (req.method === 'PATCH') {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

    const body = req.body as Partial<{
      pergNumber: number;
      category: string;
      group: string;
      question: string;
      positiveAnswer: string;
      applicableTypes: string[];
    }>;

    const updates: Partial<typeof questionnaireQuestions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.pergNumber !== undefined) updates.pergNumber = body.pergNumber;
    if (body.category !== undefined) updates.category = body.category;
    if (body.group !== undefined) updates.group = body.group;
    if (body.question !== undefined) updates.question = body.question;
    if (body.positiveAnswer !== undefined) updates.positiveAnswer = body.positiveAnswer;
    if (body.applicableTypes !== undefined) updates.applicableTypes = body.applicableTypes;

    const [row] = await db
      .update(questionnaireQuestions)
      .set(updates)
      .where(eq(questionnaireQuestions.id, id))
      .returning();
    if (!row) { jsonError(res, 'Pergunta não encontrada', { status: 404 }); return; }
    jsonSuccess(res, row);
    return;
  }

  // DELETE — remover pergunta
  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }
    await db.delete(questionnaireQuestions).where(eq(questionnaireQuestions.id, id));
    jsonSuccess(res, { deleted: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
