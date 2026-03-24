Revisão: Tela de Rotina Semanal (Gestão Semanal)
Arquivos revisados
agents/GestaoSemanal.tsx — componente principal
api/semanas.ts — endpoint de semanas
api/atividades.ts — endpoint de atividades
api/historico-semanas.ts — endpoint de histórico
src/DB/repositories/semanas.ts — repositório
lib/api/semanasClient.ts — cliente HTTP
src/DB/schema.ts — tabelas work_weeks, activities, week_history
api/_lib/orgAccess.ts — helpers de autorização (referência)
FASE 2 — Diagnóstico
A) Segurança e Autorização
A1 — CRÍTICO | Nenhum dos 3 endpoints verifica role ou org access
Arquivos: api/semanas.ts, api/atividades.ts, api/historico-semanas.ts

Os três endpoints extraem userId via getAuthUserIdFromRequest, mas param aí. Não chamam getUserRole(userId) nem assertOrgAccess(). Isso significa que qualquer usuário autenticado — incluindo clientes de outras organizações — pode operar livremente em semanas, atividades e histórico de qualquer fazenda.

Padrão correto usado em outros endpoints:


const userId = await getAuthUserIdFromRequest(req);
const role = await getUserRole(userId);
// ... then assertOrgAccess(orgId, userId, role) quando aplicável
A2 — CRÍTICO | IDOR em GET /api/semanas?id=
Arquivo: api/semanas.ts linha 32-36

getSemanaById(id) retorna qualquer semana sem verificar se pertence à fazenda/org do usuário. Um cliente da organização A pode buscar semana da organização B passando o UUID da semana.


// Atual (vulnerável):
const row = await getSemanaById(id);
jsonSuccess(res, row);
A3 — CRÍTICO | IDOR em PATCH e DELETE de atividades
Arquivo: api/atividades.ts linhas 88-115

PATCH e DELETE aceitam id da atividade sem verificar ownership. Qualquer usuário autenticado pode editar ou deletar atividade de outra organização.

A4 — CRÍTICO | IDOR em DELETE de histórico
Arquivo: api/historico-semanas.ts linhas 47-53

deleteHistorico(id) sem verificação de ownership.

A5 — CRÍTICO | GET /api/historico-semanas?farmId= sem verificação de acesso à farm
Arquivo: api/historico-semanas.ts linha 24-28

Passa farmId diretamente para listHistoricoByFarm(farmId) sem verificar se o usuário tem acesso a essa fazenda. Qualquer usuário autenticado pode ver histórico de qualquer fazenda.

A6 — CRÍTICO | PATCH/DELETE de semanas sem verificação de ownership
Arquivo: api/semanas.ts linhas 75-94

updateSemana(id, ...) e deleteSemana(id) por ID sem verificar se a semana pertence à organização do usuário.

A7 — IMPORTANTE | status aceito como string livre (sem validação de enum)
Arquivos: api/atividades.ts linhas 77, 98

O campo status é inserido/atualizado sem validar que está entre os valores permitidos ('a fazer', 'em andamento', 'pausada', 'concluída'). Um valor inválido pode ser gravado no banco.


// Vulnerável:
if (body.status !== undefined) partial.status = String(body.status);
B) Integridade de Dados
B1 — IMPORTANTE | Tabela semanas não tem organizationId
Arquivo: src/DB/schema.ts linhas 285-297

A tabela work_weeks tem apenas farmId (nullable). A segurança depende 100% do controle no endpoint, que atualmente não existe. Semanas sem farmId são "globais" — sem dono claro, podendo conflitar entre usuários.

B2 — IMPORTANTE | getSemanaByNumero e getCurrentSemana sem farmId retornam resultado de qualquer fazenda
Arquivo: src/DB/repositories/semanas.ts linhas 7-12 e 20-26

Quando farmId é null, a query não filtra por farmId IS NULL explicitamente em getCurrentSemana (usa apenas aberta = true AND modo = X). Pode retornar semana de outra fazenda se farmId vier como undefined.


// Atual: sem farmId, busca TODAS as semanas abertas do modo
const conditions = farmId
  ? and(eq(semanas.aberta, true), eq(semanas.modo, modo), eq(semanas.farmId, farmId))
  : and(eq(semanas.aberta, true), eq(semanas.modo, modo));
// Retorna semana sem farm_id OU com qualquer farm_id
B3 — MELHORIA | Auto-criação de semana sem farm_id cria registro global
Arquivo: agents/GestaoSemanal.tsx linhas 250-266

Quando selectedFarm é null (situação possível no carregamento), o componente autocria uma semana com farm_id: null. Isso cria semanas globais sem owner definido.

C) Frontend
C1 — IMPORTANTE | Botão "Fechar Semana" não verifica role no frontend
Arquivo: agents/GestaoSemanal.tsx linhas 458-486, 799+

A lógica canEditClosedWeek e canDeleteWeek controla edição de semanas fechadas, mas o botão "Fechar Semana" (handleFecharSemana) fica visível e ativo para qualquer usuário autenticado com semana aberta. Não há verificação de role para a ação de fechar.

C2 — IMPORTANTE | handleSave usa pessoas[0]?.id como fallback silencioso
Arquivo: agents/GestaoSemanal.tsx linha 388


const pessoaId = newForm.pessoaId || pessoas[0]?.id;
if (!pessoaId) return;  // retorna silenciosamente, sem feedback ao usuário
Se pessoas estiver vazio e pessoaId não estiver preenchido, a função retorna sem notificar o usuário por que a atividade não foi criada.

C3 — MELHORIA | useEffect vazio na linha 286
Arquivo: agents/GestaoSemanal.tsx linhas 286-288


useEffect(() => {
  // pessoaId inicia vazio — usuário seleciona manualmente
}, [pessoas]);
Este useEffect não executa nenhuma lógica e pode ser removido.

C4 — MELHORIA | Interface Atividade.pessoa_id tipada como string mas pode ser null
Arquivo: agents/GestaoSemanal.tsx linha 30


interface Atividade {
  pessoa_id: string;  // DB retorna string | null
O schema e o repositório permitem pessoaId: null. Isso pode causar erros em runtime quando pessoaMap.get(a.pessoa_id) recebe null.

D) Performance e Qualidade
D1 — MELHORIA | SELECT * em listAtividadesBySemana
Arquivo: src/DB/repositories/semanas.ts linha 65-67


return db.select().from(atividades).where(eq(atividades.semanaId, semanaId));
Retorna todos os campos. Para tabelas com muitas linhas, selecionar apenas os campos usados no frontend seria mais eficiente.

D2 — MELHORIA | getCurrentSemana pode retornar mais de uma semana inesperadamente
Arquivo: src/DB/repositories/semanas.ts linha 11

Usa .limit(1) mas sem índice explícito na query sem farmId. O índice existente idx_work_weeks_numero_modo_farm inclui farmId, mas quando farmId é null a query pode não usar o índice de forma eficiente.

FASE 3 — Proposta de Correções
#	Problema	Arquivo	Severidade	Pode quebrar algo?
A1	Adicionar getUserRole + assertFarmAccess (novo helper) nos 3 endpoints	api/semanas.ts, api/atividades.ts, api/historico-semanas.ts	CRÍTICO	Não — apenas restringe acesso
A2	Verificar que semana.farmId pertence à organização do usuário após getSemanaById	api/semanas.ts	CRÍTICO	Não
A3	Antes de PATCH/DELETE atividade, buscar a semana da atividade e verificar acesso	api/atividades.ts	CRÍTICO	Não
A4	Antes de DELETE histórico, buscar e verificar farmId do registro	api/historico-semanas.ts	CRÍTICO	Não
A5	Verificar que o farmId recebido pertence à org do usuário no GET histórico	api/historico-semanas.ts	CRÍTICO	Não
A6	Antes de PATCH/DELETE semana, verificar ownership via farmId da semana	api/semanas.ts	CRÍTICO	Não
A7	Validar status contra enum permitido no POST e PATCH	api/atividades.ts	IMPORTANTE	Não
B2	Usar isNull(semanas.farmId) explicitamente quando farmId for null	src/DB/repositories/semanas.ts	IMPORTANTE	Potencial — corrige comportamento de busca
C1	Ocultar/desabilitar botão "Fechar Semana" para roles sem permissão	agents/GestaoSemanal.tsx	IMPORTANTE	Não
C2	Exibir feedback (onToast) quando pessoaId não está disponível	agents/GestaoSemanal.tsx	IMPORTANTE	Não
C3	Remover useEffect vazio	agents/GestaoSemanal.tsx	MELHORIA	Não
C4	Corrigir tipo `pessoa_id: string	nullna interfaceAtividade`	agents/GestaoSemanal.tsx	MELHORIA
Nota sobre helper necessário
Para A1/A2/A5/A6, será necessário um helper assertFarmAccess(farmId, userId, role) em api/_lib/orgAccess.ts que:

Busca a fazenda pelo farmId
Obtém o organizationId da fazenda
Chama assertOrgAccess(orgId, userId, role)
