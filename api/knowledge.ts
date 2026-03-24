/**
 * Knowledge RAG API — Base de conhecimento do Antonio.
 * POST/GET/DELETE /api/knowledge?action=<action>
 *
 * Actions:
 *   GET  documents        → lista documentos (admin)
 *   GET  jobs             → status dos jobs de ingestão (admin)
 *   GET  collections      → lista coleções ativas
 *   GET  logs             → histórico de queries (admin)
 *   GET  stats            → métricas agregadas (admin)
 *   POST register         → cria registro de documento (admin)
 *   POST process          → executa pipeline de ingestão (admin)
 *   POST ask              → RAG Q&A (todos os autenticados)
 *   POST feedback         → registra feedback sobre resposta
 *   POST collection       → cria coleção (admin)
 *   DELETE document       → remove documento + chunks (admin)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pool } from '../src/DB/index.js';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { runIngestionPipeline } from './_lib/knowledge/pipeline.js';
import { embedSingleWithUsage } from './_lib/knowledge/embed.js';
import { semanticSearch } from './_lib/knowledge/search.js';
import { completeWithFallback } from './_lib/ai/providers/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res: VercelResponse, data: unknown) {
  return res.status(200).json({ ok: true, data });
}
function fail(res: VercelResponse, message: string, status = 400) {
  return res.status(status).json({ ok: false, error: message });
}

async function isAdmin(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_profiles WHERE id = $1 AND role = 'administrador'`,
    [userId],
  );
  return rows.length > 0;
}

// ─── System prompt do Antonio ─────────────────────────────────────────────────

const ANTONIO_SYSTEM_PROMPT = `Você é o Antonio, consultor especialista em gestão agropecuária do Gesttor.
Responda com base EXCLUSIVAMENTE no contexto fornecido abaixo.
Seja direto, pragmático e focado em resultados (R$/ha).
Use frases curtas. Cite as fontes usando [1], [2], etc. referentes ao contexto.
Se não tiver informação suficiente no contexto, diga: "Não encontrei essa informação na base de conhecimento."
Vocabulário: nunca use "chão" — use "Solo" ou "Terra".`;

// ─── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight — browsers send OPTIONS before POST with Content-Type: application/json
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  const userId = await getAuthUserIdFromRequest(req);
  if (!userId) return fail(res, 'Não autorizado', 401);

  const action = (req.query.action as string) || (req.body?.action as string);
  const method = req.method?.toUpperCase();

  try {
    // ── GET actions ──────────────────────────────────────────────────────────
    if (method === 'GET') {
      switch (action) {
        case 'documents':
          return await handleGetDocuments(req, res, userId);
        case 'jobs':
          return await handleGetJobs(req, res, userId);
        case 'collections':
          return await handleGetCollections(req, res, userId);
        case 'logs':
          return await handleGetLogs(req, res, userId);
        case 'stats':
          return await handleGetStats(req, res, userId);
        default:
          return fail(res, `Ação desconhecida: ${action}`);
      }
    }

    // ── DELETE actions ───────────────────────────────────────────────────────
    if (method === 'DELETE') {
      if (action === 'document') return await handleDeleteDocument(req, res, userId);
      return fail(res, `Ação DELETE desconhecida: ${action}`);
    }

    // ── POST actions ─────────────────────────────────────────────────────────
    if (method === 'POST') {
      switch (action) {
        case 'register':
          return await handleRegister(req, res, userId);
        case 'process':
          return await handleProcess(req, res, userId);
        case 'ask':
          return await handleAsk(req, res, userId);
        case 'feedback':
          return await handleFeedback(req, res, userId);
        case 'collection':
          return await handleCreateCollection(req, res, userId);
        default:
          return fail(res, `Ação POST desconhecida: ${action}`);
      }
    }

    return fail(res, 'Método não suportado', 405);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[api/knowledge]', action, message);
    return fail(res, message, 500);
  }
}

// ─── GET: documentos ─────────────────────────────────────────────────────────

async function handleGetDocuments(req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const { rows } = await pool.query(`
    SELECT
      kd.id, kd.title, kd.source_type, kd.storage_key,
      kd.file_size_bytes, kd.status, kd.error_message,
      kd.metadata, kd.created_at, kd.updated_at,
      kc_agg.chunk_count,
      kc.name AS collection_name
    FROM knowledge_documents kd
    LEFT JOIN knowledge_collections kc ON kc.id = kd.collection_id
    LEFT JOIN (
      SELECT document_id, COUNT(*) AS chunk_count
      FROM knowledge_chunks
      GROUP BY document_id
    ) kc_agg ON kc_agg.document_id = kd.id
    ORDER BY kd.created_at DESC
  `);
  return ok(res, rows);
}

// ─── GET: jobs ───────────────────────────────────────────────────────────────

async function handleGetJobs(req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const { rows } = await pool.query(`
    SELECT j.*, kd.title AS document_title
    FROM knowledge_ingestion_jobs j
    JOIN knowledge_documents kd ON kd.id = j.document_id
    ORDER BY j.created_at DESC
    LIMIT 100
  `);
  return ok(res, rows);
}

// ─── GET: coleções ───────────────────────────────────────────────────────────

async function handleGetCollections(_req: VercelRequest, res: VercelResponse, _userId: string) {
  const { rows } = await pool.query(`
    SELECT id, name, description, is_active, created_at
    FROM knowledge_collections
    ORDER BY name ASC
  `);
  return ok(res, rows);
}

// ─── GET: logs ───────────────────────────────────────────────────────────────

async function handleGetLogs(req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
  const { rows } = await pool.query(`
    SELECT
      rl.id, rl.question, rl.answer, rl.model,
      rl.tokens_used, rl.latency_ms, rl.created_at,
      rl.chunks_retrieved,
      kf.rating, kf.comment
    FROM knowledge_retrieval_logs rl
    LEFT JOIN knowledge_feedback kf ON kf.retrieval_log_id = rl.id
    ORDER BY rl.created_at DESC
    LIMIT $1
  `, [limit]);
  return ok(res, rows);
}

// ─── GET: stats ──────────────────────────────────────────────────────────────

async function handleGetStats(_req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_documents WHERE status = 'published') AS published_documents,
      (SELECT COUNT(*) FROM knowledge_chunks) AS total_chunks,
      (SELECT COUNT(*) FROM knowledge_retrieval_logs) AS total_queries,
      (SELECT ROUND(AVG(latency_ms)) FROM knowledge_retrieval_logs WHERE latency_ms IS NOT NULL) AS avg_latency_ms,
      (SELECT ROUND(AVG(rating), 2) FROM knowledge_feedback WHERE rating IS NOT NULL) AS avg_rating,
      (SELECT COUNT(*) FROM knowledge_retrieval_logs WHERE created_at > now() - interval '7 days') AS queries_last_7d,
      (SELECT COALESCE(SUM(embedding_tokens_used), 0) FROM knowledge_ingestion_jobs WHERE status = 'completed') AS total_embedding_tokens,
      (SELECT COALESCE(SUM(tokens_used), 0) FROM knowledge_retrieval_logs WHERE tokens_used IS NOT NULL) AS total_query_tokens
  `);
  return ok(res, rows[0]);
}

// ─── POST: registrar documento ───────────────────────────────────────────────

async function handleRegister(req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const { title, sourceType, storageKey, fileSizeBytes, collectionId, metadata } = req.body ?? {};
  if (!title || typeof title !== 'string') return fail(res, 'Campo obrigatório: title');
  if (!storageKey || typeof storageKey !== 'string') return fail(res, 'Campo obrigatório: storageKey');

  const validTypes = ['pdf', 'docx', 'txt', 'md'];
  const type = (sourceType || 'pdf').toLowerCase();
  if (!validTypes.includes(type)) return fail(res, `sourceType inválido. Use: ${validTypes.join(', ')}`);

  const { rows } = await pool.query(
    `INSERT INTO knowledge_documents (title, source_type, storage_key, file_size_bytes, collection_id, metadata, uploaded_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id, title, status, created_at`,
    [title, type, storageKey, fileSizeBytes ?? null, collectionId ?? null, JSON.stringify(metadata ?? {}), userId],
  );
  return ok(res, rows[0]);
}

// ─── POST: processar documento (pipeline de ingestão) ────────────────────────

async function handleProcess(req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const { documentId } = req.body ?? {};
  if (!documentId) return fail(res, 'Campo obrigatório: documentId');

  // Verifica se já está sendo processado
  const { rows: docRows } = await pool.query(
    `SELECT status FROM knowledge_documents WHERE id = $1`,
    [documentId],
  );
  if (!docRows.length) return fail(res, 'Documento não encontrado', 404);
  if (docRows[0].status === 'extracting' || docRows[0].status === 'chunking' || docRows[0].status === 'embedding') {
    return fail(res, 'Documento já está sendo processado');
  }

  // Executa pipeline (síncrono — Vercel Pro 60s timeout é suficiente para a maioria dos docs)
  await runIngestionPipeline(documentId);
  return ok(res, { documentId, status: 'published' });
}

// ─── POST: ask (RAG Q&A) ─────────────────────────────────────────────────────

type HistoryEntry = { role: 'user' | 'assistant'; text: string };

function buildUserPrompt(
  context: string,
  history: HistoryEntry[],
  question: string,
): string {
  const historyBlock =
    history.length > 0
      ? history
          .map(m => `${m.role === 'user' ? 'Usuário' : 'Antonio'}: ${m.text}`)
          .join('\n') + '\n\n'
      : '';
  return `Contexto da base de conhecimento:\n${context}\n\n${historyBlock}Usuário: ${question}`;
}

async function handleAsk(req: VercelRequest, res: VercelResponse, userId: string) {
  const { question, topK, history } = req.body ?? {};
  const conversationHistory: HistoryEntry[] = Array.isArray(history)
    ? (history as HistoryEntry[]).slice(-6)
    : [];
  if (!question || typeof question !== 'string' || !question.trim()) {
    return fail(res, 'Campo obrigatório: question');
  }

  const k = Math.min(parseInt(String(topK ?? '6'), 10), 12);
  const startMs = Date.now();

  // 1. Embed da pergunta (inputType='query' — otimizado para busca semântica)
  const { embedding: queryEmbedding, tokens: queryEmbeddingTokens } = await embedSingleWithUsage(question.trim(), 'query');

  // 2. Busca semântica
  const chunks = await semanticSearch(queryEmbedding, k);

  if (chunks.length === 0) {
    return ok(res, {
      answer: 'Não encontrei informações relevantes na base de conhecimento para responder sua pergunta.',
      sources: [],
      logId: null,
    });
  }

  // 3. Montar contexto com numeração de fontes
  const context = chunks
    .map((c, i) => `[${i + 1}] Fonte: ${c.documentTitle}\n${c.content}`)
    .join('\n\n---\n\n');

  // 4. Gerar resposta com Claude (fallback automático para outros providers)
  const aiResponse = await completeWithFallback({
    preferredProvider: 'anthropic',
    model: 'claude-sonnet-4-6',
    request: {
      systemPrompt: ANTONIO_SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(context, conversationHistory, question),
      maxTokens: 1024,
      temperature: 0.3,
    },
  });

  const latencyMs = Date.now() - startMs;

  // 5. Registrar no log
  const { rows: logRows } = await pool.query(
    `INSERT INTO knowledge_retrieval_logs
       (question, chunks_retrieved, answer, model, tokens_used, latency_ms, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      question,
      JSON.stringify(chunks.map(c => ({ chunkId: c.chunkId, score: c.score, documentTitle: c.documentTitle }))),
      aiResponse.content,
      aiResponse.model,
      aiResponse.usage.totalTokens,
      latencyMs,
      userId,
    ],
  );

  return ok(res, {
    answer: aiResponse.content,
    sources: [...new Set(chunks.map(c => c.documentTitle))],
    logId: logRows[0]?.id ?? null,
    latencyMs,
    tokensUsed: aiResponse.usage?.totalTokens ?? null,
    queryEmbeddingTokens: queryEmbeddingTokens ?? null,
  });
}

// ─── POST: feedback ──────────────────────────────────────────────────────────

async function handleFeedback(req: VercelRequest, res: VercelResponse, userId: string) {
  const { logId, rating, comment } = req.body ?? {};
  if (!logId) return fail(res, 'Campo obrigatório: logId');
  if (rating !== undefined && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
    return fail(res, 'rating deve ser um número entre 1 e 5');
  }

  // Verifica se o log existe
  const { rows: logRows } = await pool.query(
    `SELECT id FROM knowledge_retrieval_logs WHERE id = $1`, [logId],
  );
  if (!logRows.length) return fail(res, 'Log não encontrado', 404);

  const { rows } = await pool.query(
    `INSERT INTO knowledge_feedback (retrieval_log_id, rating, comment, user_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [logId, rating ?? null, comment ?? null, userId],
  );
  return ok(res, { feedbackId: rows[0].id });
}

// ─── POST: criar coleção ─────────────────────────────────────────────────────

async function handleCreateCollection(req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const { name, description } = req.body ?? {};
  if (!name || typeof name !== 'string') return fail(res, 'Campo obrigatório: name');

  const { rows } = await pool.query(
    `INSERT INTO knowledge_collections (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`,
    [name, description ?? null, userId],
  );
  return ok(res, rows[0]);
}

// ─── DELETE: documento ───────────────────────────────────────────────────────

async function handleDeleteDocument(req: VercelRequest, res: VercelResponse, userId: string) {
  if (!(await isAdmin(userId))) return fail(res, 'Acesso restrito a administradores', 403);

  const documentId = (req.query.documentId as string) || req.body?.documentId;
  if (!documentId) return fail(res, 'Campo obrigatório: documentId');

  const { rows } = await pool.query(
    `DELETE FROM knowledge_documents WHERE id = $1 RETURNING id, title, storage_key`,
    [documentId],
  );
  if (!rows.length) return fail(res, 'Documento não encontrado', 404);

  return ok(res, { deleted: rows[0] });
}