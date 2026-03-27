/**
 * API de pessoas (CRUD completo + sub-recursos).
 *
 * GET  /api/pessoas?id=xxx                       → 1 pessoa com perfis+fazendas+permissões
 * GET  /api/pessoas?organizationId=xxx           → lista pessoas da org
 *   Params opcionais: search, offset, limit, ativo, perfilId, farmId
 * GET  /api/pessoas?resource=perfis              → lista todos os perfis (inclui inativos com all=true)
 * GET  /api/pessoas?resource=cargos              → lista todos os cargos (inclui inativos com all=true)
 * POST /api/pessoas                              → criar pessoa
 * POST /api/pessoas { action: '...' }            → sub-recursos e config (ver abaixo)
 * PATCH /api/pessoas                             → atualizar dados da pessoa (body.id obrigatório)
 * DELETE /api/pessoas?id=xxx                     → soft delete (ativo=false)
 *
 * Sub-recursos via POST body.action:
 *   'add-perfil'           → { pessoaId, perfilId, cargoFuncaoId? }
 *   'remove-perfil'        → { pessoaPerfilId }
 *   'add-fazenda'          → { pessoaId, farmId }
 *   'set-primary-fazenda'  → { pessoaId, pessoaFazendaId }
 *   'remove-fazenda'       → { pessoaFazendaId }
 *   'upsert-permissao'     → { pessoaId, farmId, assume_tarefas_fazenda?, pode_alterar_semana_fechada?, pode_apagar_semana? }
 *   'create-perfil'        → { nome, descricao?, sortOrder? }        (admin only)
 *   'update-perfil'        → { id, nome?, descricao?, ativo?, sortOrder? } (admin only)
 *   'create-cargo'         → { nome, sortOrder? }                    (admin only)
 *   'update-cargo'         → { id, nome?, ativo?, sortOrder? }       (admin only)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, inArray } from 'drizzle-orm';
import { getAuthUserIdFromRequest } from './_lib/betterAuthAdapter.js';
import { jsonError, jsonSuccess, setCorsHeaders } from './_lib/apiResponse.js';
import { checkCrudRateLimit } from './_lib/crudRateLimit.js';
import { db } from '../src/DB/index.js';
import { userProfiles, people, farms as farmsTable, personProfiles, perfils, cargoFuncao } from '../src/DB/schema.js';
import {
  getPessoa,
  listPessoas,
  listPessoasByFarm,
  getPermsByEmail,
  createPessoa,
  updatePessoa,
  deactivatePessoa,
  listPerfis,
  listPerfisAll,
  createPerfil,
  updatePerfil,
  listCargosFuncoes,
  listCargosFuncoesAll,
  createCargoFuncao,
  updateCargoFuncao,
  getPessoaPerfis,
  addPessoaPerfil,
  removePessoaPerfil,
  getPessoaFazendas,
  addPessoaFazenda,
  setPrimaryFazenda,
  removePessoaFazenda,
  getPessoaPermissoes,
  upsertPessoaPermissao,
  analystCanAccessOrg,
  analystCanAccessPessoa,
  validateCPF,
  validatePhotoUrl,
  perfilExists,
  cargoFuncaoExists,
  farmExists,
  type CreatePessoaInput,
  type UpdatePessoaInput,
} from '../src/DB/repositories/pessoas.js';

async function getUserRole(userId: string): Promise<string | null> {
  const [p] = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  return p?.role ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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

  const role = await getUserRole(userId);
  if (!role) {
    jsonError(res, 'Perfil não encontrado', { code: 'AUTH_PROFILE_NOT_FOUND', status: 401 });
    return;
  }

  const isAdmin = role === 'administrador';
  const isAnalyst = role === 'analista' || isAdmin;
  if (!isAnalyst) {
    jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
    return;
  }

  // ─── Rate limiting ───────────────────────────────────────────────────────────
  if (req.method !== 'GET') {
    const rl = await checkCrudRateLimit({ userId });
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)));
      jsonError(res, 'Muitas requisições. Tente novamente em instantes.', { status: 429 });
      return;
    }
  }

  // ─── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const idParam = typeof req.query?.id === 'string' ? req.query.id : null;
    const orgIdParam = typeof req.query?.organizationId === 'string' ? req.query.organizationId : null;
    const resource = typeof req.query?.resource === 'string' ? req.query.resource : null;
    const farmIdParam = typeof req.query?.farmId === 'string' ? req.query.farmId : null;

    // checkPerms: verificar permissões de semana por email (compat GestaoSemanal)
    if (req.query?.checkPerms === 'true') {
      const email = typeof req.query?.email === 'string' ? req.query.email.trim().toLowerCase() : '';
      if (!email) { jsonError(res, 'email obrigatório', { status: 400 }); return; }
      const rows = await getPermsByEmail(email);
      jsonSuccess(res, rows);
      return;
    }

    // GET por farmId sem organizationId (compat lib/people.ts)
    if (farmIdParam && !orgIdParam && !idParam && !resource) {
      if (!isAdmin) {
        // Resolver a organização da fazenda e checar acesso
        const [farm] = await db.select({ organizationId: farmsTable.organizationId }).from(farmsTable).where(eq(farmsTable.id, farmIdParam)).limit(1);
        if (!farm?.organizationId || !(await analystCanAccessOrg(userId, farm.organizationId))) {
          jsonError(res, 'Acesso negado a esta fazenda', { code: 'FORBIDDEN', status: 403 });
          return;
        }
      }
      const assumeTarefas = req.query?.assumeTarefas === 'true';
      const rows = await listPessoasByFarm(farmIdParam, { assumeTarefas });

      // Fetch primary profile (person_type) and job role for each person
      const personIds = rows.map(r => r.id);
      const profileMap = new Map<string, { perfilNome: string; cargoNome: string | null }>();
      if (personIds.length > 0) {
        const profileRows = await db
          .select({
            pessoaId: personProfiles.pessoaId,
            perfilNome: perfils.nome,
            cargoNome: cargoFuncao.nome,
          })
          .from(personProfiles)
          .innerJoin(perfils, eq(personProfiles.perfilId, perfils.id))
          .leftJoin(cargoFuncao, eq(personProfiles.cargoFuncaoId, cargoFuncao.id))
          .where(inArray(personProfiles.pessoaId, personIds as [string, ...string[]]));
        for (const pr of profileRows) {
          if (!profileMap.has(pr.pessoaId)) {
            profileMap.set(pr.pessoaId, { perfilNome: pr.perfilNome, cargoNome: pr.cargoNome ?? null });
          }
        }
      }

      const formatted = rows.map(r => {
        const profile = profileMap.get(r.id);
        return {
          id: r.id,
          full_name: r.fullName,
          preferred_name: r.preferredName ?? null,
          email: r.email ?? null,
          phone_whatsapp: r.phoneWhatsapp ?? null,
          photo_url: r.photoUrl ?? null,
          location_city_uf: r.locationCityUf ?? null,
          person_type: profile?.perfilNome ?? '',
          job_role: profile?.cargoNome ?? null,
          farm_id: farmIdParam,
          assume_tarefas_fazenda: assumeTarefas,
          pode_alterar_semana_fechada: r.podeAlterarSemanaFechada ?? false,
          pode_apagar_semana: r.podeApagarSemana ?? false,
        };
      });
      jsonSuccess(res, formatted);
      return;
    }

    // Recursos estáticos
    if (resource === 'perfis') {
      const all = req.query?.all === 'true';
      const rows = all ? await listPerfisAll() : await listPerfis();
      jsonSuccess(res, rows);
      return;
    }
    if (resource === 'cargos') {
      const all = req.query?.all === 'true';
      const rows = all ? await listCargosFuncoesAll() : await listCargosFuncoes();
      jsonSuccess(res, rows);
      return;
    }

    // GET por ID (com sub-recursos)
    if (idParam) {
      if (!isAdmin && !(await analystCanAccessPessoa(userId, idParam))) {
        jsonError(res, 'Acesso negado a esta pessoa', { code: 'FORBIDDEN', status: 403 });
        return;
      }
      const pessoa = await getPessoa(idParam);
      if (!pessoa) {
        jsonError(res, 'Pessoa não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }
      const [pessoaPerfisRows, pessoaFazendasRows, pessoaPermissoesRows] = await Promise.all([
        getPessoaPerfis(idParam),
        getPessoaFazendas(idParam),
        getPessoaPermissoes(idParam),
      ]);
      const perfis = pessoaPerfisRows.map(pp => ({
        id: pp.id,
        pessoaId: pp.pessoaId,
        perfilId: pp.perfilId,
        cargoFuncaoId: pp.cargoFuncaoId ?? null,
        ativo: true,
        createdAt: pp.createdAt,
        perfilNome: pp.perfilNome ?? undefined,
        cargoFuncaoNome: pp.cargoFuncaoNome ?? null,
      }));
      const fazendas = pessoaFazendasRows.map(pf => ({
        id: pf.id,
        pessoaId: pf.pessoaId,
        farmId: pf.farmId,
        farmName: pf.farmName ?? pf.farmId,
        isPrimary: pf.primaryFarm ?? false,
        createdAt: pf.createdAt,
      }));
      const permissoes = pessoaPermissoesRows.map(pp => ({
        id: pp.id,
        pessoaId: pp.pessoaId,
        farmId: pp.farmId,
        assumeTarefasFazenda: pp.assumeTarefasFazenda ?? false,
        podeAlterarSemanaFechada: pp.podeAlterarSemanaFechada ?? false,
        podeApagarSemana: pp.podeApagarSemana ?? false,
        createdAt: pp.createdAt,
        updatedAt: pp.updatedAt,
      }));
      jsonSuccess(res, { ...pessoa, perfis, fazendas, permissoes });
      return;
    }

    // GET lista por organização
    if (orgIdParam) {
      if (!isAdmin && !(await analystCanAccessOrg(userId, orgIdParam))) {
        jsonError(res, 'Acesso negado a esta organização', { code: 'FORBIDDEN', status: 403 });
        return;
      }
      const offset = Math.max(0, Number(req.query?.offset) || 0);
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
      const search = typeof req.query?.search === 'string' ? req.query.search.trim() : undefined;
      const ativoParam = req.query?.ativo;
      const ativo = ativoParam === 'false' ? false : true;
      const perfilId = typeof req.query?.perfilId === 'string' ? req.query.perfilId : undefined;
      const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId : undefined;

      const { rows, hasMore } = await listPessoas(orgIdParam, { search, ativo, offset, limit, perfilId, farmId });
      jsonSuccess(res, rows, { offset, limit, hasMore });
      return;
    }

    jsonError(res, 'Parâmetro id, organizationId ou resource obrigatório', { status: 400 });
    return;
  }

  // ─── POST (criar ou sub-recursos) ─────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Record<string, unknown>;
    const action = typeof body?.action === 'string' ? body.action : null;

    // Sub-recursos via action
    if (action) {
      switch (action) {
        case 'add-perfil': {
          const pessoaId = typeof body.pessoaId === 'string' ? body.pessoaId : null;
          const perfilId = typeof body.perfilId === 'string' ? body.perfilId : typeof body.perfilId === 'number' ? String(body.perfilId) : null;
          const cargoFuncaoId = typeof body.cargoFuncaoId === 'string' ? body.cargoFuncaoId : typeof body.cargoFuncaoId === 'number' ? String(body.cargoFuncaoId) : null;
          if (!pessoaId || !perfilId) {
            jsonError(res, 'pessoaId e perfilId são obrigatórios', { code: 'VALIDATION', status: 400 });
            return;
          }
          if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
            jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          if (!(await perfilExists(perfilId))) {
            jsonError(res, 'Perfil não encontrado ou inativo', { code: 'NOT_FOUND', status: 404 });
            return;
          }
          if (cargoFuncaoId && !(await cargoFuncaoExists(cargoFuncaoId))) {
            jsonError(res, 'Cargo/função não encontrado ou inativo', { code: 'NOT_FOUND', status: 404 });
            return;
          }
          await addPessoaPerfil({ pessoaId, perfilId, cargoFuncaoId: cargoFuncaoId ?? undefined });
          jsonSuccess(res, { ok: true });
          return;
        }

        case 'remove-perfil': {
          const pessoaPerfilId = typeof body.pessoaPerfilId === 'string' ? body.pessoaPerfilId : null;
          const pessoaId = typeof body.pessoaId === 'string' ? body.pessoaId : null;
          if (!pessoaPerfilId || !pessoaId) {
            jsonError(res, 'pessoaPerfilId e pessoaId são obrigatórios', { code: 'VALIDATION', status: 400 });
            return;
          }
          if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
            jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          await removePessoaPerfil(pessoaPerfilId);
          jsonSuccess(res, { ok: true });
          return;
        }

        case 'add-fazenda': {
          const pessoaId = typeof body.pessoaId === 'string' ? body.pessoaId : null;
          const farmId = typeof body.farmId === 'string' ? body.farmId : null;
          if (!pessoaId || !farmId) {
            jsonError(res, 'pessoaId e farmId são obrigatórios', { code: 'VALIDATION', status: 400 });
            return;
          }
          if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
            jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          if (!(await farmExists(farmId))) {
            jsonError(res, 'Fazenda não encontrada ou inativa', { code: 'NOT_FOUND', status: 404 });
            return;
          }
          await addPessoaFazenda({ pessoaId, farmId });
          jsonSuccess(res, { ok: true });
          return;
        }

        case 'set-primary-fazenda': {
          const pessoaId = typeof body.pessoaId === 'string' ? body.pessoaId : null;
          const pessoaFazendaId = typeof body.pessoaFazendaId === 'string' ? body.pessoaFazendaId : null;
          if (!pessoaId || !pessoaFazendaId) {
            jsonError(res, 'pessoaId e pessoaFazendaId são obrigatórios', { code: 'VALIDATION', status: 400 });
            return;
          }
          if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
            jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          await setPrimaryFazenda(pessoaId, pessoaFazendaId);
          jsonSuccess(res, { ok: true });
          return;
        }

        case 'remove-fazenda': {
          const pessoaFazendaId = typeof body.pessoaFazendaId === 'string' ? body.pessoaFazendaId : null;
          const pessoaId = typeof body.pessoaId === 'string' ? body.pessoaId : null;
          if (!pessoaFazendaId || !pessoaId) {
            jsonError(res, 'pessoaFazendaId e pessoaId são obrigatórios', { code: 'VALIDATION', status: 400 });
            return;
          }
          if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
            jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          await removePessoaFazenda(pessoaFazendaId);
          jsonSuccess(res, { ok: true });
          return;
        }

        case 'upsert-permissao': {
          const pessoaId = typeof body.pessoaId === 'string' ? body.pessoaId : null;
          const farmId = typeof body.farmId === 'string' ? body.farmId : null;
          if (!pessoaId || !farmId) {
            jsonError(res, 'pessoaId e farmId são obrigatórios', { code: 'VALIDATION', status: 400 });
            return;
          }
          if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
            jsonError(res, 'Acesso negado', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          await upsertPessoaPermissao({
            pessoaId,
            farmId,
            assume_tarefas_fazenda: typeof body.assume_tarefas_fazenda === 'boolean' ? body.assume_tarefas_fazenda : undefined,
            pode_alterar_semana_fechada: typeof body.pode_alterar_semana_fechada === 'boolean' ? body.pode_alterar_semana_fechada : undefined,
            pode_apagar_semana: typeof body.pode_apagar_semana === 'boolean' ? body.pode_apagar_semana : undefined,
          });
          jsonSuccess(res, { ok: true });
          return;
        }

        case 'create-perfil': {
          if (!isAdmin) {
            jsonError(res, 'Apenas administradores podem criar perfis', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
          if (!nome) { jsonError(res, 'nome é obrigatório', { code: 'VALIDATION', status: 400 }); return; }
          const perfil = await createPerfil({
            nome,
            descricao: typeof body.descricao === 'string' ? body.descricao : null,
            sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
          });
          jsonSuccess(res, perfil);
          return;
        }

        case 'update-perfil': {
          if (!isAdmin) {
            jsonError(res, 'Apenas administradores podem editar perfis', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          const id = body.id != null ? String(body.id) : null;
          if (!id) { jsonError(res, 'id é obrigatório', { code: 'VALIDATION', status: 400 }); return; }
          const updated = await updatePerfil(id, {
            nome: typeof body.nome === 'string' ? body.nome : undefined,
            descricao: body.descricao !== undefined ? (typeof body.descricao === 'string' ? body.descricao : null) : undefined,
            ativo: typeof body.ativo === 'boolean' ? body.ativo : undefined,
            sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
          });
          if (!updated) { jsonError(res, 'Perfil não encontrado', { code: 'NOT_FOUND', status: 404 }); return; }
          jsonSuccess(res, updated);
          return;
        }

        case 'create-cargo': {
          if (!isAdmin) {
            jsonError(res, 'Apenas administradores podem criar cargos', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
          if (!nome) { jsonError(res, 'nome é obrigatório', { code: 'VALIDATION', status: 400 }); return; }
          const cargo = await createCargoFuncao({
            nome,
            sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
          });
          jsonSuccess(res, cargo);
          return;
        }

        case 'update-cargo': {
          if (!isAdmin) {
            jsonError(res, 'Apenas administradores podem editar cargos', { code: 'FORBIDDEN', status: 403 });
            return;
          }
          const id = body.id != null ? String(body.id) : null;
          if (!id) { jsonError(res, 'id é obrigatório', { code: 'VALIDATION', status: 400 }); return; }
          const updated = await updateCargoFuncao(id, {
            nome: typeof body.nome === 'string' ? body.nome : undefined,
            ativo: typeof body.ativo === 'boolean' ? body.ativo : undefined,
            sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
          });
          if (!updated) { jsonError(res, 'Cargo não encontrado', { code: 'NOT_FOUND', status: 404 }); return; }
          jsonSuccess(res, updated);
          return;
        }

        default:
          jsonError(res, `Action desconhecida: ${action}`, { code: 'VALIDATION', status: 400 });
          return;
      }
    }

    // Criação de pessoa
    const data = body as Partial<CreatePessoaInput> & { organizationId?: string };
    const fullName = typeof data.full_name === 'string' ? data.full_name.trim() : '';
    if (!fullName) {
      jsonError(res, 'Campo full_name é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    const orgId = data.organization_id || (typeof data.organizationId === 'string' ? data.organizationId : null);
    if (!orgId) {
      jsonError(res, 'Campo organization_id é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!isAdmin && !(await analystCanAccessOrg(userId, orgId))) {
      jsonError(res, 'Acesso negado a esta organização', { code: 'FORBIDDEN', status: 403 });
      return;
    }

    // Validate phone_whatsapp (required)
    const phoneRaw = typeof data.phone_whatsapp === 'string' ? data.phone_whatsapp.replace(/\D/g, '') : '';
    if (!phoneRaw) {
      jsonError(res, 'Campo phone_whatsapp é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (phoneRaw.length < 10 || phoneRaw.length > 11) {
      jsonError(res, 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos)', { code: 'VALIDATION', status: 400 });
      return;
    }

    // Validate CPF if provided
    const cpfRaw = typeof data.cpf === 'string' ? data.cpf.replace(/\D/g, '') : null;
    if (cpfRaw && !validateCPF(cpfRaw)) {
      jsonError(res, 'CPF inválido', { code: 'VALIDATION', status: 400 });
      return;
    }

    // Validate photo_url if provided
    const photoUrl = typeof data.photo_url === 'string' ? data.photo_url.trim() : null;
    if (photoUrl && !validatePhotoUrl(photoUrl)) {
      jsonError(res, 'photo_url deve ser uma URL válida (http/https)', { code: 'VALIDATION', status: 400 });
      return;
    }

    // Normalize email
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : null;

    // Validate full_name length
    if (fullName.length > 255) {
      jsonError(res, 'full_name deve ter no máximo 255 caracteres', { code: 'VALIDATION', status: 400 });
      return;
    }

    try {
      const input: CreatePessoaInput = {
        created_by: userId,
        full_name: fullName,
        preferred_name: data.preferred_name ?? null,
        phone_whatsapp: phoneRaw,
        email,
        location_city_uf: data.location_city_uf ?? null,
        photo_url: photoUrl,
        organization_id: orgId,
        user_id: data.user_id ?? null,
        cpf: cpfRaw || null,
        rg: data.rg ?? null,
        data_nascimento: data.data_nascimento ?? null,
        data_contratacao: data.data_contratacao ?? null,
        endereco: data.endereco ?? null,
        observacoes: data.observacoes ?? null,
      };
      const pessoa = await createPessoa(input);
      jsonSuccess(res, pessoa);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : '') + String((err as Record<string, unknown>)?.detail ?? '');
      if (msg.toLowerCase().includes('idx_people_phone_org') || (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('phone'))) {
        jsonError(res, 'Telefone já cadastrado nesta organização', { code: 'VALIDATION', status: 400 });
        return;
      }
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
        jsonError(res, 'CPF já cadastrado nesta organização', { code: 'VALIDATION', status: 400 });
        return;
      }
      console.error('[pessoas POST] erro ao criar pessoa');
      jsonError(res, 'Erro ao criar pessoa', { status: 500 });
    }
    return;
  }

  // ─── PATCH (atualizar) ────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body as { id?: string } & UpdatePessoaInput;
    const pessoaId = typeof body?.id === 'string' ? body.id : null;
    if (!pessoaId) {
      jsonError(res, 'Campo id é obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
      jsonError(res, 'Acesso negado a esta pessoa', { code: 'FORBIDDEN', status: 403 });
      return;
    }

    const { id: _id, ...updates } = body as { id: string } & UpdatePessoaInput;

    // Validate phone_whatsapp if being updated
    if (updates.phone_whatsapp !== undefined && updates.phone_whatsapp !== null) {
      const phoneRaw = updates.phone_whatsapp.replace(/\D/g, '');
      if (phoneRaw && (phoneRaw.length < 10 || phoneRaw.length > 11)) {
        jsonError(res, 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos)', { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.phone_whatsapp = phoneRaw || null;
    }

    // Validate CPF if being updated
    if (updates.cpf !== undefined && updates.cpf !== null) {
      const cpfRaw = updates.cpf.replace(/\D/g, '');
      if (!validateCPF(cpfRaw)) {
        jsonError(res, 'CPF inválido', { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.cpf = cpfRaw;
    }

    // Validate photo_url if being updated
    if (updates.photo_url !== undefined && updates.photo_url !== null) {
      const photoUrl = updates.photo_url.trim();
      if (photoUrl && !validatePhotoUrl(photoUrl)) {
        jsonError(res, 'photo_url deve ser uma URL válida (http/https)', { code: 'VALIDATION', status: 400 });
        return;
      }
      updates.photo_url = photoUrl;
    }

    // Normalize email
    if (updates.email !== undefined && updates.email !== null) {
      updates.email = updates.email.trim().toLowerCase();
    }

    // Resetar convite pendente se o email foi alterado
    let inviteWasReset = false;
    if (updates.email !== undefined) {
      const [current] = await db
        .select({ email: people.email, inviteStatus: people.inviteStatus })
        .from(people)
        .where(eq(people.id, pessoaId as any))
        .limit(1);
      if (current?.inviteStatus === 'pending' && current.email !== updates.email) {
        updates.inviteToken = null;
        updates.inviteStatus = 'none';
        updates.inviteExpiresAt = null;
        updates.inviteSentAt = null;
        inviteWasReset = true;
      }
    }

    try {
      const updated = await updatePessoa(pessoaId, updates);
      if (!updated) {
        jsonError(res, 'Pessoa não encontrada', { code: 'NOT_FOUND', status: 404 });
        return;
      }

      // Propagar name/phone/foto para user_profiles vinculado (se existir)
      if (updated.userId) {
        const profileSyncFields: Record<string, unknown> = { updatedAt: new Date() };
        if (updates.full_name !== undefined) profileSyncFields.name = updates.full_name;
        if (updates.phone_whatsapp !== undefined) profileSyncFields.phone = updates.phone_whatsapp;
        if (updates.photo_url !== undefined) { profileSyncFields.imageUrl = updates.photo_url; profileSyncFields.avatar = updates.photo_url; }
        if (Object.keys(profileSyncFields).length > 1) {
          await db.update(userProfiles).set(profileSyncFields).where(eq(userProfiles.id, updated.userId)).catch(() => {});
        }
      }

      jsonSuccess(res, { ...updated, inviteWasReset });
    } catch (err) {
      const msg = (err instanceof Error ? err.message : '') + String((err as Record<string, unknown>)?.detail ?? '');
      if (msg.toLowerCase().includes('idx_people_phone_org') || (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('phone'))) {
        jsonError(res, 'Telefone já cadastrado nesta organização', { code: 'VALIDATION', status: 400 });
        return;
      }
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
        jsonError(res, 'CPF já cadastrado nesta organização', { code: 'VALIDATION', status: 400 });
        return;
      }
      console.error('[pessoas PATCH] erro ao atualizar pessoa');
      jsonError(res, 'Erro ao atualizar pessoa', { status: 500 });
    }
    return;
  }

  // ─── DELETE (soft delete) ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const pessoaId = typeof req.query?.id === 'string' ? req.query.id : null;
    if (!pessoaId) {
      jsonError(res, 'Parâmetro id obrigatório', { code: 'VALIDATION', status: 400 });
      return;
    }
    if (!isAdmin && !(await analystCanAccessPessoa(userId, pessoaId))) {
      jsonError(res, 'Acesso negado a esta pessoa', { code: 'FORBIDDEN', status: 403 });
      return;
    }

    try {
      await deactivatePessoa(pessoaId);
      jsonSuccess(res, { id: pessoaId, ativo: false });
    } catch {
      console.error('[pessoas DELETE] erro ao desativar pessoa');
      jsonError(res, 'Erro ao desativar pessoa', { status: 500 });
    }
    return;
  }

  jsonError(res, 'Método não permitido', { status: 405 });
  } catch (err) {
    console.error('[pessoas] erro não tratado:', err);
    if (!res.headersSent) {
      jsonError(res, 'Erro interno do servidor', { status: 500 });
    }
  }
}
