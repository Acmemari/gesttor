/**
 * API de Lançamentos de Despesa.
 *
 * GET    /api/lancamentos-orcamento?versaoId=&farmId=&planoContaId?=&incluirShadow?=
 *   → lista lançamentos (com produtos embutidos)
 * POST   /api/lancamentos-orcamento
 *   body: { versaoId, farmId, planoContaId, recorrencia, valorBase, distribuicaoMensal, descricao?, observacao?, status?, produtos[]? }
 *   → lançamento criado + recalcula `itens_orcamento`
 * PATCH  /api/lancamentos-orcamento?id=
 *   body: campos parciais; produtos é replace-all quando presente
 * DELETE /api/lancamentos-orcamento?id=
 *
 * Bloqueia 409 se versão imutável/em_aprovacao/arquivada.
 * Audita cada operação em log_auditoria_orcamento.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { assertFarmAccess, getUserRole } from './_lib/orgAccess.js';
import {
  assertContaFolha,
  createLancamento,
  deleteLancamento,
  getLancamentoById,
  listLancamentos,
  updateLancamento,
  type CreateLancamentoInput,
  type ProdutoInput,
  type Recorrencia,
  type StatusLancamento,
} from '../src/DB/repositories/lancamentosOrcamento.js';
import { appendAudit } from '../src/DB/repositories/auditoriaOrcamento.js';
import { getOrcamentoIdByVersao } from '../src/DB/repositories/itensOrcamento.js';
import { db } from '../src/DB/index.js';
import { orcamentoVersoes } from '../src/DB/schema.js';

const RECORRENCIAS_VALIDAS = ['mensal', 'sazonal', 'unica'] as const;
const STATUS_VALIDOS = ['ativo', 'rascunho'] as const;
const MAX_PRODUTOS = 200;

function isYYYYMM01(s: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(s);
}

function validarDistribuicao(input: unknown): Record<string, number> | string {
  if (!input || typeof input !== 'object') return 'distribuicaoMensal deve ser objeto';
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isYYYYMM01(k)) return `chave inválida em distribuicaoMensal: "${k}" (use YYYY-MM-01)`;
    const n = typeof v === 'string' ? Number(v) : (v as number);
    if (!Number.isFinite(n)) return `valor inválido em ${k}`;
    if (Math.abs(n) > 1e12) return `valor fora de range em ${k}`;
    out[k] = n;
  }
  return out;
}

function validarProdutos(input: unknown): ProdutoInput[] | string {
  if (!Array.isArray(input)) return 'produtos deve ser array';
  if (input.length > MAX_PRODUTOS) return `máximo ${MAX_PRODUTOS} produtos`;
  const out: ProdutoInput[] = [];
  for (const [idx, p] of input.entries()) {
    if (!p || typeof p !== 'object') return `produto ${idx} inválido`;
    const obj = p as Record<string, unknown>;
    if (typeof obj.nome !== 'string' || !obj.nome.trim()) return `produto ${idx}: nome obrigatório`;
    const qtd = typeof obj.quantidade === 'string' ? Number(obj.quantidade) : (obj.quantidade as number);
    if (!Number.isFinite(qtd) || qtd < 0) return `produto ${idx}: quantidade inválida`;
    const valor = typeof obj.valorUnitario === 'string' ? Number(obj.valorUnitario) : (obj.valorUnitario as number);
    if (!Number.isFinite(valor) || valor < 0) return `produto ${idx}: valorUnitario inválido`;
    out.push({
      nome: obj.nome.trim(),
      quantidade: qtd,
      unidade: typeof obj.unidade === 'string' ? obj.unidade : null,
      valorUnitario: valor,
    });
  }
  return out;
}

async function assertVersaoEditavel(versaoId: string): Promise<{ orcamentoId: string } | { error: string; status: number; code: string }> {
  const [versao] = await db
    .select({
      id: orcamentoVersoes.id,
      orcamentoId: orcamentoVersoes.orcamentoId,
      tipo: orcamentoVersoes.tipo,
      imutavel: orcamentoVersoes.imutavel,
    })
    .from(orcamentoVersoes)
    .where(eq(orcamentoVersoes.id, versaoId))
    .limit(1);
  if (!versao) return { error: 'Versão não encontrada', status: 404, code: 'NOT_FOUND' };
  if (versao.imutavel || versao.tipo === 'em_aprovacao' || versao.tipo === 'arquivado') {
    return {
      error: 'Esta versão está travada e não pode ser editada',
      status: 409,
      code: 'VERSAO_TRAVADA',
    };
  }
  return { orcamentoId: versao.orcamentoId };
}

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

  let role: string;
  try {
    role = await getUserRole(userId);
  } catch (err) {
    const e = err as { status?: number; code?: string; message: string };
    jsonError(res, e.message, { code: e.code, status: e.status ?? 401 });
    return;
  }

  if (req.method !== 'GET') {
    const rl = await checkCrudRateLimit({ userId });
    if (!rl.allowed) {
      jsonError(res, 'Muitas requisições.', { status: 429 });
      return;
    }
  }

  // ─── GET ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const versaoId = typeof req.query?.versaoId === 'string' ? req.query.versaoId : null;
    const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : null;
    const planoContaId = typeof req.query?.planoContaId === 'string' ? req.query.planoContaId : undefined;
    const incluirShadow = req.query?.incluirShadow === 'true';

    if (!versaoId || !farmId) {
      jsonError(res, 'versaoId e farmId são obrigatórios', { code: 'VALIDATION', status: 400 });
      return;
    }
    try {
      await assertFarmAccess(farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }

    const lancamentos = await listLancamentos({ versaoId, farmId, planoContaId, incluirShadow });
    jsonSuccess(res, lancamentos);
    return;
  }

  // ─── POST ────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Partial<{
      versaoId: string;
      farmId: string;
      planoContaId: string;
      recorrencia: string;
      valorBase: number | string;
      distribuicaoMensal: Record<string, unknown>;
      descricao: string | null;
      observacao: string | null;
      status: string;
      produtos: unknown[];
    }>;

    if (!body?.versaoId || !body?.farmId || !body?.planoContaId) {
      jsonError(res, 'versaoId, farmId, planoContaId são obrigatórios', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!body?.recorrencia || !RECORRENCIAS_VALIDAS.includes(body.recorrencia as Recorrencia)) {
      jsonError(res, `recorrencia inválida. Use: ${RECORRENCIAS_VALIDAS.join(', ')}`, {
        code: 'VALIDATION',
        status: 400,
      });
      return;
    }
    const distrib = validarDistribuicao(body.distribuicaoMensal);
    if (typeof distrib === 'string') {
      jsonError(res, distrib, { code: 'VALIDATION', status: 400 });
      return;
    }
    let produtos: ProdutoInput[] = [];
    if (body.produtos !== undefined) {
      const p = validarProdutos(body.produtos);
      if (typeof p === 'string') {
        jsonError(res, p, { code: 'VALIDATION', status: 400 });
        return;
      }
      produtos = p;
    }
    const status = (body.status as StatusLancamento | undefined) ?? 'ativo';
    if (!STATUS_VALIDOS.includes(status)) {
      jsonError(res, `status inválido`, { code: 'VALIDATION', status: 400 });
      return;
    }

    try {
      await assertFarmAccess(body.farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }

    const versaoCheck = await assertVersaoEditavel(body.versaoId);
    if ('error' in versaoCheck) {
      jsonError(res, versaoCheck.error, { code: versaoCheck.code, status: versaoCheck.status });
      return;
    }

    if (!(await assertContaFolha(body.planoContaId))) {
      jsonError(res, 'planoContaId deve ser uma conta-folha (isFolha=true)', {
        code: 'NOT_LEAF',
        status: 400,
      });
      return;
    }

    const valorBase = Number(body.valorBase ?? 0);
    if (!Number.isFinite(valorBase) || Math.abs(valorBase) > 1e12) {
      jsonError(res, 'valorBase inválido', { code: 'VALIDATION', status: 400 });
      return;
    }

    try {
      const payload: CreateLancamentoInput = {
        versaoId: body.versaoId,
        farmId: body.farmId,
        planoContaId: body.planoContaId,
        recorrencia: body.recorrencia as Recorrencia,
        valorBase,
        distribuicaoMensal: distrib,
        descricao: body.descricao ?? null,
        observacao: body.observacao ?? null,
        status,
        produtos,
        criadoPor: userId,
        tipoOrigem: 'modal',
      };
      const created = await createLancamento(payload);
      await appendAudit({
        orcamentoId: versaoCheck.orcamentoId,
        versaoId: body.versaoId,
        usuarioId: userId,
        acao: 'criar_lancamento',
        entidade: 'lancamentos_orcamento',
        entidadeId: created.id,
        after: {
          planoContaId: created.planoContaId,
          recorrencia: created.recorrencia,
          valorBase: created.valorBase,
          totalAnual: Object.values(created.distribuicaoMensal).reduce((a, b) => a + b, 0),
          qtdProdutos: created.produtos.length,
        },
      });
      jsonSuccess(res, created);
    } catch (err) {
      console.error('[lancamentos POST] erro:', err);
      jsonError(res, 'Erro ao criar lançamento', { status: 500 });
    }
    return;
  }

  // ─── PATCH ───────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) {
      jsonError(res, 'id é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const existing = await getLancamentoById(id);
    if (!existing) {
      jsonError(res, 'Lançamento não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }

    try {
      await assertFarmAccess(existing.farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }
    const versaoCheck = await assertVersaoEditavel(existing.versaoId);
    if ('error' in versaoCheck) {
      jsonError(res, versaoCheck.error, { code: versaoCheck.code, status: versaoCheck.status });
      return;
    }

    const body = req.body as Partial<{
      recorrencia: string;
      valorBase: number | string;
      distribuicaoMensal: Record<string, unknown>;
      descricao: string | null;
      observacao: string | null;
      status: string;
      produtos: unknown[];
    }>;

    const updates: Parameters<typeof updateLancamento>[1] = { atualizadoPor: userId };

    if (body.recorrencia !== undefined) {
      if (!RECORRENCIAS_VALIDAS.includes(body.recorrencia as Recorrencia)) {
        jsonError(res, 'recorrencia inválida', { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.recorrencia = body.recorrencia as Recorrencia;
    }
    if (body.valorBase !== undefined) {
      const n = Number(body.valorBase);
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) {
        jsonError(res, 'valorBase inválido', { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.valorBase = n;
    }
    if (body.distribuicaoMensal !== undefined) {
      const d = validarDistribuicao(body.distribuicaoMensal);
      if (typeof d === 'string') {
        jsonError(res, d, { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.distribuicaoMensal = d;
    }
    if (body.descricao !== undefined) updates.descricao = body.descricao;
    if (body.observacao !== undefined) updates.observacao = body.observacao;
    if (body.status !== undefined) {
      if (!STATUS_VALIDOS.includes(body.status as StatusLancamento)) {
        jsonError(res, 'status inválido', { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.status = body.status as StatusLancamento;
    }
    if (body.produtos !== undefined) {
      const p = validarProdutos(body.produtos);
      if (typeof p === 'string') {
        jsonError(res, p, { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.produtos = p;
    }

    try {
      const updated = await updateLancamento(id, updates);
      if (!updated) {
        jsonError(res, 'Lançamento não encontrado', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      await appendAudit({
        orcamentoId: versaoCheck.orcamentoId,
        versaoId: existing.versaoId,
        usuarioId: userId,
        acao: 'editar_lancamento',
        entidade: 'lancamentos_orcamento',
        entidadeId: id,
        before: {
          recorrencia: existing.recorrencia,
          valorBase: existing.valorBase,
          status: existing.status,
          qtdProdutos: existing.produtos.length,
        },
        after: {
          recorrencia: updated.recorrencia,
          valorBase: updated.valorBase,
          status: updated.status,
          qtdProdutos: updated.produtos.length,
        },
      });
      jsonSuccess(res, updated);
    } catch (err) {
      console.error('[lancamentos PATCH] erro:', err);
      jsonError(res, 'Erro ao atualizar lançamento', { status: 500 });
    }
    return;
  }

  // ─── DELETE ──────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!id) {
      jsonError(res, 'id é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const existing = await getLancamentoById(id);
    if (!existing) {
      jsonError(res, 'Lançamento não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }
    try {
      await assertFarmAccess(existing.farmId, userId, role);
    } catch (err) {
      const e = err as { status?: number; code?: string; message: string };
      jsonError(res, e.message, { code: e.code, status: e.status ?? 403 });
      return;
    }
    const versaoCheck = await assertVersaoEditavel(existing.versaoId);
    if ('error' in versaoCheck) {
      jsonError(res, versaoCheck.error, { code: versaoCheck.code, status: versaoCheck.status });
      return;
    }

    const ok = await deleteLancamento(id, userId);
    if (!ok) {
      jsonError(res, 'Lançamento não encontrado', { code: 'NOT_FOUND', status: 404 });
      return;
    }

    const orcamentoId = await getOrcamentoIdByVersao(existing.versaoId);
    if (orcamentoId) {
      await appendAudit({
        orcamentoId,
        versaoId: existing.versaoId,
        usuarioId: userId,
        acao: 'remover_lancamento',
        entidade: 'lancamentos_orcamento',
        entidadeId: id,
        before: {
          planoContaId: existing.planoContaId,
          recorrencia: existing.recorrencia,
          valorBase: existing.valorBase,
          qtdProdutos: existing.produtos.length,
        },
      });
    }
    jsonSuccess(res, { id, removed: true });
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
}
