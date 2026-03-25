import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { savedFeedbacks } from '../src/DB/schema.js';
import { and, desc, eq, type SQL } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  // GET — list by user (optionally filtered by farmId)
  if (req.method === 'GET') {
    const { farmId } = req.query as Record<string, string>;
    const conditions: SQL[] = [eq(savedFeedbacks.createdBy, userId)];
    if (farmId) conditions.push(eq(savedFeedbacks.farmId, farmId));
    const rows = await db
      .select()
      .from(savedFeedbacks)
      .where(and(...conditions))
      .orderBy(desc(savedFeedbacks.createdAt));
    jsonSuccess(res, rows);
    return;
  }

  // POST — insert
  if (req.method === 'POST') {
    const body = req.body as {
      createdBy: string;
      recipientPersonId?: string | null;
      recipientName: string;
      recipientEmail?: string | null;
      context: string;
      feedbackType: string;
      objective: string;
      whatHappened?: string | null;
      eventDate?: string | null;
      eventMoment?: string | null;
      damages?: string | null;
      tone: string;
      format: string;
      structure: string;
      lengthPreference: string;
      generatedFeedback: string;
      generatedStructure: string;
      tips?: string[];
      farmId?: string | null;
    };

    const required = ['createdBy', 'recipientName', 'context', 'feedbackType', 'objective',
      'tone', 'format', 'structure', 'lengthPreference', 'generatedFeedback', 'generatedStructure'];
    for (const field of required) {
      if (!body[field as keyof typeof body]) {
        jsonError(res, `Campo obrigatório ausente: ${field}`, { status: 400 });
        return;
      }
    }

    const [row] = await db
      .insert(savedFeedbacks)
      .values({
        createdBy: body.createdBy,
        recipientPersonId: body.recipientPersonId ?? null,
        recipientName: body.recipientName,
        recipientEmail: body.recipientEmail ?? null,
        context: body.context,
        feedbackType: body.feedbackType,
        objective: body.objective,
        whatHappened: body.whatHappened ?? null,
        eventDate: body.eventDate ?? null,
        eventMoment: body.eventMoment ?? null,
        damages: body.damages ?? null,
        tone: body.tone,
        format: body.format,
        structure: body.structure,
        lengthPreference: body.lengthPreference,
        generatedFeedback: body.generatedFeedback,
        generatedStructure: body.generatedStructure,
        tips: body.tips ?? [],
        farmId: body.farmId ?? null,
      })
      .returning();

    jsonSuccess(res, row);
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
