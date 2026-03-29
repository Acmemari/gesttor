/**
 * API route for meeting minutes (atas).
 * GET    ?farmId=xxx       — list all atas for a farm
 * GET    ?id=xxx           — get a single ata by ID
 * POST   { semanaFechadaId, farmId, organizationId }  — generate a new ata
 * PATCH  ?id=xxx  { conteudo }  — update ata content
 * DELETE ?id=xxx           — delete an ata
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, and, gt, asc, inArray } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import {
  listAtasByFarm,
  getAtaById,
  createAta,
  updateAta,
  deleteAta,
} from '../src/DB/repositories/atas.js';
import {
  getSemanaById,
  listAtividadesBySemana,
  listSemanaParticipantes,
} from '../src/DB/repositories/semanas.js';
import { db } from '../src/DB/index.js';
import { semanas, semanaTranscricoes } from '../src/DB/schema.js';
import { getAgentManifest } from './_lib/agents/registry.js';
import { getProvider } from './_lib/ai/providers/index.js';
import { getFallbackRoutes, routeAgent } from './_lib/ai/router.js';
import { runAtaGenAgent } from './_lib/agents/ata-gen/handler.js';
import type { AtaGenInput } from './_lib/agents/ata-gen/manifest.js';

export const maxDuration = 60;

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
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (id) {
        const ata = await getAtaById(id);
        if (!ata) {
          jsonError(res, 'Ata não encontrada', { status: 404 });
          return;
        }
        jsonSuccess(res, ata);
        return;
      }

      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : '';
      if (!farmId) {
        jsonError(res, 'farmId obrigatório', { status: 400 });
        return;
      }
      const rows = await listAtasByFarm(farmId);
      jsonSuccess(res, rows);
      return;
    }

    // ── POST — Generate new ata ────────────────────────────────────────────
    if (req.method === 'POST') {
      const { semanaFechadaId, farmId, organizationId, transcricaoTexto: transcricaoTextoBody, fotos: fotosBody } = req.body ?? {};

      if (!semanaFechadaId || !farmId || !organizationId) {
        jsonError(res, 'Campos obrigatórios: semanaFechadaId, farmId, organizationId', { status: 400 });
        return;
      }

      // 1. Fetch closed week
      const semanaFechada = await getSemanaById(semanaFechadaId);
      if (!semanaFechada) {
        jsonError(res, 'Semana fechada não encontrada', { status: 404 });
        return;
      }

      // 2. Find the next week (open week) by data_inicio after the closed week
      const [semanaAberta] = await db
        .select()
        .from(semanas)
        .where(
          and(
            eq(semanas.farmId, farmId),
            eq(semanas.modo, semanaFechada.modo),
            gt(semanas.dataInicio, semanaFechada.dataInicio),
          ),
        )
        .orderBy(asc(semanas.dataInicio))
        .limit(1);

      // 3. Fetch participants (prefer open week, fallback to closed)
      const participantesSemanaId = semanaAberta?.id ?? semanaFechadaId;
      const participantesRaw = await listSemanaParticipantes(participantesSemanaId);
      const participantes = participantesRaw.map(p => ({
        nome: p.preferredName || p.fullName,
        modalidade: p.modalidade as 'online' | 'presencial',
        presente: p.presenca,
        photoUrl: p.photoUrl ?? null,
      }));

      // 4. Fetch activities for closed week
      const atividadesFechada = await listAtividadesBySemana(semanaFechadaId);
      const atividadesConcluidas = atividadesFechada
        .filter(a => a.status === 'concluída')
        .map(a => ({ titulo: a.titulo, responsavel: '', tag: a.tag || '' }));
      const atividadesPendentes = atividadesFechada
        .filter(a => a.status !== 'concluída')
        .map(a => ({ titulo: a.titulo, responsavel: '', tag: a.tag || '', status: a.status }));

      // 5. Fetch activities for open week (planned)
      let atividadesPlanejadas: Array<{ titulo: string; responsavel: string; tag: string; status: string }> = [];
      if (semanaAberta) {
        const atividadesAberta = await listAtividadesBySemana(semanaAberta.id);
        atividadesPlanejadas = atividadesAberta.map(a => ({
          titulo: a.titulo,
          responsavel: '',
          tag: a.tag || '',
          status: a.status,
        }));
      }

      // 6. Enrich activities with person names
      // Build a map of pessoaId -> name from participants
      const pessoaNameMap = new Map<string, string>();
      participantesRaw.forEach(p => pessoaNameMap.set(p.pessoaId, p.preferredName || p.fullName));

      // Also fetch participants from closed week if different
      if (semanaAberta && semanaAberta.id !== semanaFechadaId) {
        const partsFechada = await listSemanaParticipantes(semanaFechadaId);
        partsFechada.forEach(p => pessoaNameMap.set(p.pessoaId, p.preferredName || p.fullName));
      }

      // Enrich closed week activities
      atividadesFechada.forEach((a, _i) => {
        const name = a.pessoaId ? pessoaNameMap.get(a.pessoaId) || '' : '';
        const isConcluida = a.status === 'concluída';
        if (isConcluida) {
          const item = atividadesConcluidas.find(c => c.titulo === a.titulo);
          if (item) item.responsavel = name;
        } else {
          const item = atividadesPendentes.find(c => c.titulo === a.titulo);
          if (item) item.responsavel = name;
        }
      });

      // Enrich open week activities
      if (semanaAberta) {
        const atividadesAberta = await listAtividadesBySemana(semanaAberta.id);
        atividadesAberta.forEach((a, i) => {
          const name = a.pessoaId ? pessoaNameMap.get(a.pessoaId) || '' : '';
          if (atividadesPlanejadas[i]) atividadesPlanejadas[i].responsavel = name;
        });
      }

      // 7. Fetch transcriptions from BOTH weeks (any type with texto)
      let resumoTranscricao = null;
      const semanaIds = [semanaFechadaId];
      if (semanaAberta) semanaIds.push(semanaAberta.id);

      const transcricoes = await db
        .select({ texto: semanaTranscricoes.texto })
        .from(semanaTranscricoes)
        .where(inArray(semanaTranscricoes.semanaId, semanaIds));

      const textosBanco = transcricoes.map(t => t.texto).filter(Boolean) as string[];
      if (transcricaoTextoBody && typeof transcricaoTextoBody === 'string' && transcricaoTextoBody.trim()) {
        textosBanco.push(transcricaoTextoBody.trim());
      }
      const textoCompleto = textosBanco.join('\n\n');
      console.log(`[api/atas] Found ${transcricoes.length} DB transcriptions + ${transcricaoTextoBody ? 'user text' : 'no user text'}, total length: ${textoCompleto.length}`);

      // 8. If transcription text exists, call AI agent
      if (textoCompleto.trim().length >= 10) {
        try {
          const manifest = await getAgentManifest('ata-gen');
          if (manifest) {
            const routes = getFallbackRoutes(manifest);
            const routed = await routeAgent(routes);
            const provider = getProvider(routed.provider);

            const agentInput: AtaGenInput = {
              transcricaoTexto: textoCompleto,
              atividadesConcluidas: atividadesConcluidas.map(a => `${a.titulo} (${a.responsavel || 'Sem responsável'})`),
              atividadesPendentes: atividadesPendentes.map(a => `${a.titulo} - ${a.status} (${a.responsavel || 'Sem responsável'})`),
              atividadesPlanejadas: atividadesPlanejadas.map(a => `${a.titulo} (${a.responsavel || 'Sem responsável'})`),
              participantes: participantes.filter(p => p.presente).map(p => `${p.nome} (${p.modalidade})`),
            };

            const result = await runAtaGenAgent({
              input: agentInput,
              provider,
              model: routed.model,
              systemPrompt: manifest.systemPrompt,
            });

            resumoTranscricao = result.data;
          }
        } catch (aiErr) {
          console.error('[api/atas] AI agent error:', aiErr);
          // Continue without AI summary — ata is still valid
        }
      }

      // 9. Assemble ata content
      const conteudo = {
        metadata: {
          dataReuniao: new Date().toISOString().split('T')[0],
          semanaFechada: semanaFechada.numero,
          semanaAberta: semanaAberta?.numero ?? semanaFechada.numero + 1,
          periodoFechada: { inicio: semanaFechada.dataInicio, fim: semanaFechada.dataFim },
          periodoAberta: semanaAberta
            ? { inicio: semanaAberta.dataInicio, fim: semanaAberta.dataFim }
            : { inicio: '', fim: '' },
          farmName: '',
        },
        participantes,
        atividadesConcluidas,
        atividadesPendentes,
        atividadesPlanejadas,
        resumoTranscricao,
        transcricaoTextoOriginal: textoCompleto || null,
        fotos: Array.isArray(fotosBody) ? fotosBody : [],
        observacoes: '',
      };

      // 10. Insert and return
      const row = await createAta({
        semanaFechadaId,
        semanaAbertaId: semanaAberta?.id ?? null,
        farmId,
        organizationId,
        createdBy: userId,
        dataReuniao: conteudo.metadata.dataReuniao,
        conteudo,
      });

      jsonSuccess(res, row);
      return;
    }

    // ── PATCH ──────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      const existing = await getAtaById(id);
      if (!existing) {
        jsonError(res, 'Ata não encontrada', { status: 404 });
        return;
      }

      const { conteudo } = req.body ?? {};
      if (!conteudo) {
        jsonError(res, 'conteudo obrigatório', { status: 400 });
        return;
      }

      const row = await updateAta(id, { conteudo, versao: (existing.versao ?? 1) + 1 });
      jsonSuccess(res, row);
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!id) {
        jsonError(res, 'id obrigatório', { status: 400 });
        return;
      }
      const existing = await getAtaById(id);
      if (!existing) {
        jsonError(res, 'Ata não encontrada', { status: 404 });
        return;
      }
      await deleteAta(id);
      jsonSuccess(res, { deleted: true });
      return;
    }

    jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[api/atas]', message);
    jsonError(res, message, { status: 500 });
  }
}
