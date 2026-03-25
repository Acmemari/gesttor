import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { db } from '../src/DB/index.js';
import { agentTrainingDocuments, agentTrainingImages } from '../src/DB/schema.js';
import { desc, eq } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) { jsonError(res, 'Não autorizado', { status: 401 }); return; }

  const { type, id } = req.query as Record<string, string>;

  if (!type || !['document', 'image'].includes(type)) {
    jsonError(res, 'Parâmetro type deve ser "document" ou "image"', { status: 400 });
    return;
  }

  // GET — list by agentId
  if (req.method === 'GET') {
    const agentId = typeof req.query?.agentId === 'string' ? req.query.agentId : null;
    if (!agentId) { jsonError(res, 'Parâmetro agentId obrigatório', { status: 400 }); return; }

    if (type === 'document') {
      const rows = await db.select().from(agentTrainingDocuments).where(eq(agentTrainingDocuments.agentId, agentId)).orderBy(desc(agentTrainingDocuments.createdAt));
      jsonSuccess(res, rows);
      return;
    }

    if (type === 'image') {
      const rows = await db.select().from(agentTrainingImages).where(eq(agentTrainingImages.agentId, agentId)).orderBy(desc(agentTrainingImages.createdAt));
      jsonSuccess(res, rows);
      return;
    }
  }

  // POST — insert
  if (req.method === 'POST') {
    if (type === 'document') {
      const body = req.body as {
        agentId: string;
        title: string;
        content: string;
        fileType?: string;
        fileUrl?: string;
        metadata?: object;
      };

      if (!body.agentId || !body.title || !body.content) {
        jsonError(res, 'Campos obrigatórios: agentId, title, content', { status: 400 });
        return;
      }

      const [row] = await db
        .insert(agentTrainingDocuments)
        .values({
          agentId: body.agentId,
          title: body.title,
          content: body.content,
          fileType: body.fileType ?? null,
          fileUrl: body.fileUrl ?? null,
          metadata: body.metadata ?? null,
        })
        .returning();

      jsonSuccess(res, row);
      return;
    }

    if (type === 'image') {
      const body = req.body as {
        agentId: string;
        title: string;
        imageUrl: string;
        description?: string;
        metadata?: object;
      };

      if (!body.agentId || !body.title || !body.imageUrl) {
        jsonError(res, 'Campos obrigatórios: agentId, title, imageUrl', { status: 400 });
        return;
      }

      const [row] = await db
        .insert(agentTrainingImages)
        .values({
          agentId: body.agentId,
          title: body.title,
          imageUrl: body.imageUrl,
          description: body.description ?? null,
          metadata: body.metadata ?? null,
        })
        .returning();

      jsonSuccess(res, row);
      return;
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!id) { jsonError(res, 'Parâmetro id obrigatório', { status: 400 }); return; }

    if (type === 'document') {
      await db.delete(agentTrainingDocuments).where(eq(agentTrainingDocuments.id, id));
      jsonSuccess(res, { deleted: true });
      return;
    }

    if (type === 'image') {
      await db.delete(agentTrainingImages).where(eq(agentTrainingImages.id, id));
      jsonSuccess(res, { deleted: true });
      return;
    }
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
