# Instrucao de Revisao Profunda: Sistema de Autenticacao e Acesso

---

## Objetivo

Realizar uma auditoria completa e profunda de todo o sistema de autenticacao, cadastro de usuarios, login, logout, recuperacao de senha, gerenciamento de sessao, convites e vinculacao de pessoas a contas de usuario na aplicacao Gesttor.

---

## Arquivos no Escopo desta Revisao

### Autenticacao e Sessao (Backend)
- `api/_lib/auth.ts` — Configuracao do Better Auth (hash, email, rate limit, hooks)
- `api/_lib/betterAuthAdapter.ts` — Extracao e validacao de token/sessao
- `api/auth/catchAll.ts` — Catch-all handler de rotas Better Auth
- `api/auth.ts` — Endpoint de perfil do usuario (GET/POST/DELETE)

### Autenticacao e Sessao (Frontend)
- `contexts/AuthContext.tsx` — Provider de autenticacao React (login, signup, logout, timeout)
- `lib/auth/betterAuthClient.ts` — Cliente Better Auth (token em sessionStorage)
- `lib/auth/mapUserProfile.ts` — Mapeamento de roles do banco para a aplicacao
- `lib/auth/permissions.ts` — Funcoes de checagem de permissao e limites de plano
- `components/LoginPage.tsx` — Tela de login e cadastro

### Banco de Dados
- `src/DB/schema.ts` — Tabelas: ba_user, ba_session, ba_account, ba_verification, ba_rate_limit, user_profiles
- Tabelas relacionadas: organizations, organizationAnalysts, people

### Templates de Email
- `lib/email-templates/reset-password.html` — Template de email de reset de senha

### Controle de Acesso
- `api/_lib/orgAccess.ts` — Funcoes de autorizacao (getUserRole, assertOrgAccess, assertFarmAccess)
- `api/_lib/crudRateLimit.ts` — Rate limiting de operacoes CRUD

---

## Regras de Negocio Inviolaveis

1. **Hierarquia**: ba_user → user_profiles (role) → organizations → farms → people
2. **Roles do sistema**: `administrador`, `analista`, `cliente`, `visitante`
3. **Signup padrao**: Todo usuario novo recebe role = `visitante` automaticamente
4. **Organizacao requer analista**: organizations.analystId NOT NULL, onDelete: restrict
5. **Pessoa ≠ Usuario**: A tabela `people` e separada de `user_profiles`. O campo `people.userId` e NULLABLE — uma pessoa pode existir sem conta de usuario
6. **Token**: Armazenado em `sessionStorage` com chave `ba_session_token`, enviado via header `Authorization: Bearer`
7. **Inatividade**: Sessao expira apos 30 minutos sem interacao (mouse/teclado/touch)
8. **Senha**: Minimo 8 caracteres, hash bcrypt via Better Auth
9. **Reset de senha**: Token com validade de 1 hora, revoga todas as sessoes existentes
10. **Rate limit de login**: 5 tentativas/minuto por IP
11. **Rate limit de reset**: 3 solicitacoes a cada 15 minutos por IP

---

## FASE 1 — Leitura Completa (NAO altere nada)

Leia TODOS os arquivos listados no escopo INTEGRALMENTE. Nao pule nenhuma secao. Construa um mapa mental de:

### 1.1 Fluxo de Cadastro (Signup)
- [ ] Como o formulario de cadastro coleta os dados (campos, validacoes frontend)
- [ ] Como os dados sao enviados ao Better Auth (`authClient.signUp()`)
- [ ] O que acontece no servidor: criacao de ba_user + ba_session + ba_account
- [ ] Hook pos-signup: criacao automatica de user_profiles com role='visitante'
- [ ] Como o token de sessao e retornado e armazenado no cliente
- [ ] Como o perfil e carregado apos signup (`GET /api/auth`)

### 1.2 Fluxo de Login
- [ ] Como o formulario de login valida e envia credenciais
- [ ] Como o Better Auth valida email/senha e retorna o token
- [ ] Como o token e persistido em sessionStorage
- [ ] Como o AuthContext carrega o perfil com retry logic
- [ ] Como o timer de inatividade e iniciado
- [ ] Tratamento de erros: credenciais invalidas, usuario inativo, conta inexistente

### 1.3 Fluxo de Logout
- [ ] Como o logout e disparado (manual e por inatividade)
- [ ] Se a sessao e invalidada no servidor (ba_session deletada)
- [ ] Se o token e removido do sessionStorage
- [ ] Se o estado do AuthContext e limpo completamente
- [ ] Redirecionamento pos-logout

### 1.4 Fluxo de Recuperacao de Senha
- [ ] Como o usuario solicita o reset (tela, validacao de email)
- [ ] Como o servidor processa a solicitacao (`/api/auth/request-password-reset`)
- [ ] Como o email e enviado via Resend (template HTML, dados incluidos)
- [ ] Seguranca do link de reset: token, expiracao, unicidade
- [ ] Como o usuario define a nova senha (`/api/auth/reset-password`)
- [ ] Se todas as sessoes existentes sao revogadas apos troca de senha
- [ ] Rate limiting do endpoint de reset

### 1.5 Gerenciamento de Sessao
- [ ] Ciclo de vida do token: criacao, validacao, expiracao, renovacao
- [ ] Como `getAuthUserIdFromRequest()` extrai e valida o token (Bearer + Cookie)
- [ ] Campos registrados na sessao (IP, user agent, expiracao)
- [ ] Comportamento ao receber 401 no cliente (limpeza de token, redirect)
- [ ] Consistencia entre sessao ativa e user_profiles.status

### 1.6 Gerenciamento de Perfil
- [ ] Como o endpoint `GET /api/auth` retorna dados do usuario
- [ ] Como `POST /api/auth` atualiza nome, avatar, telefone, plano
- [ ] Como `DELETE /api/auth` desativa a conta (soft delete)
- [ ] Mapeamento de roles via `mapUserProfile.ts`
- [ ] Campos expostos na resposta e se ha vazamento de dados sensiveis

### 1.7 Vinculacao Pessoa ↔ Usuario
- [ ] Como o campo `people.userId` e populado (se e populado)
- [ ] Se existe mecanismo para vincular uma pessoa existente a um usuario que faz signup
- [ ] Se o signup com email ja cadastrado em `people` gera vinculo automatico
- [ ] Gaps: pessoa sem usuario, usuario sem pessoa

---

## FASE 2 — Diagnostico Detalhado (NAO corrija nada)

Para cada categoria abaixo, analise e liste TODOS os problemas encontrados com evidencia no codigo (arquivo + linha).

### A) Seguranca de Autenticacao

- [ ] A senha e hashada com algoritmo seguro (bcrypt) e salt unico?
- [ ] Ha protecao contra timing attacks na validacao de senha?
- [ ] O token de sessao tem entropia suficiente (minimo 128 bits)?
- [ ] O token e transmitido apenas via HTTPS? (verificar CORS, secure flags)
- [ ] Ha protecao contra session fixation (novo token apos login)?
- [ ] Ha protecao contra session hijacking (validacao de IP/user-agent)?
- [ ] O logout invalida a sessao no servidor, nao apenas no cliente?
- [ ] Sessoes expiradas sao limpas do banco periodicamente?
- [ ] Ha protecao contra brute force alem do rate limit (lockout de conta)?
- [ ] O endpoint de signup previne enumeracao de emails (mesmo erro para email existente/inexistente)?
- [ ] O endpoint de reset de senha previne enumeracao de emails?
- [ ] O link de reset e single-use (invalidado apos uso)?
- [ ] Ha validacao de forca de senha alem do minimo de 8 caracteres?
- [ ] O sessionStorage e seguro o suficiente? (vs httpOnly cookies)
- [ ] Ha protecao contra CSRF para operacoes de estado?
- [ ] Headers de seguranca estao configurados? (X-Content-Type-Options, X-Frame-Options, etc.)

### B) Autorizacao e Controle de Acesso

- [ ] Todo endpoint protegido verifica autenticacao via `getAuthUserIdFromRequest()`?
- [ ] Todo endpoint protegido verifica a role via `getUserRole()`?
- [ ] A role armazenada em `user_profiles` e a fonte de verdade (nao o frontend)?
- [ ] Ha separacao clara entre autenticacao (quem e) e autorizacao (o que pode)?
- [ ] O mapeamento de roles em `mapUserProfile.ts` e consistente com as verificacoes do backend?
- [ ] A funcao `checkPermission()` no frontend e apenas UX, nao seguranca?
- [ ] Ha risco de privilege escalation (usuario trocando role no request)?
- [ ] O endpoint `POST /api/auth` (update perfil) permite alterar a propria role?
- [ ] O endpoint `DELETE /api/auth` permite deletar contas de outros usuarios?
- [ ] Ha verificacao de que operacoes criticas (delete, change role) sao restritas a admins?

### C) Validacao de Dados

- [ ] Email e validado no formato correto (frontend E backend)?
- [ ] Email e normalizado (lowercase, trim) antes de salvar?
- [ ] Telefone e validado no formato brasileiro (10-11 digitos)?
- [ ] Senha e validada no backend (nao apenas frontend)?
- [ ] Nome e sanitizado contra XSS?
- [ ] CPF e validado com algoritmo modulo 11 (se aplicavel no signup)?
- [ ] Ha protecao contra SQL injection (Drizzle ORM parametriza queries)?
- [ ] Ha protecao contra NoSQL injection em campos JSONB?
- [ ] Inputs com tamanho maximo sao limitados no backend?
- [ ] URLs de avatar sao validadas (protocolo http/https)?

### D) Gestao de Sessao e Tokens

- [ ] O token tem tempo de expiracao adequado (nao perpetuo)?
- [ ] O mecanismo de refresh/renovacao de sessao funciona corretamente?
- [ ] Sessoes anteriores sao revogadas ao trocar senha?
- [ ] Sessoes sao revogadas ao desativar uma conta?
- [ ] O timer de inatividade (30min) funciona consistentemente?
- [ ] Ha race condition entre multiplas abas/janelas com o mesmo token?
- [ ] O token e removido de sessionStorage em TODOS os cenarios de logout?
- [ ] Ha tratamento para token expirado durante uma operacao longa?
- [ ] O comportamento ao receber 401 e gracioso (nao perde dados do formulario)?

### E) Email e Comunicacao

- [ ] O servico de email (Resend) esta configurado corretamente?
- [ ] O template de reset de senha contem todas as informacoes necessarias?
- [ ] Ha fallback se o envio de email falhar (log, retry, notificacao)?
- [ ] O remetente e verificado e profissional (`gesttor@gesttor.app`)?
- [ ] Links no email usam HTTPS e apontam para o dominio correto?
- [ ] Ha protecao contra email bombing (rate limit por email, nao so por IP)?
- [ ] O conteudo do email e seguro contra HTML injection?
- [ ] Ha versao plain-text do email para clientes que nao suportam HTML?

### F) Fluxo de Cadastro → Vinculacao → Acesso

- [ ] Ao fazer signup, o sistema verifica se o email ja existe em `people`?
- [ ] Se o email ja existe em `people`, o campo `userId` e atualizado automaticamente?
- [ ] Se o usuario ja existe como `visitante` e e convidado para uma org, a role muda para `cliente`?
- [ ] Ha conflito se um email existe em multiplas organizacoes como `people`?
- [ ] O fluxo de convite (se existir) e seguro contra token forgery?
- [ ] O fluxo de convite valida que o convidador tem permissao na organizacao?

### G) Resiliencia e Tratamento de Erros

- [ ] Erros de autenticacao retornam mensagens genericas (sem vazar detalhes internos)?
- [ ] Erros de banco de dados sao logados mas nao expostos ao usuario?
- [ ] Ha try/catch em todas as operacoes async de autenticacao?
- [ ] O frontend trata erros de rede (timeout, conexao perdida) no login/signup?
- [ ] Ha retry logic para operacoes criticas (validacao de sessao, carregamento de perfil)?
- [ ] O estado do AuthContext e consistente apos erros?
- [ ] Ha tratamento para migracao de schema (campos novos no user_profiles)?

### H) Performance e Escalabilidade

- [ ] Validacao de sessao e feita in-process (sem HTTP round-trip)?
- [ ] Queries de perfil usam indices adequados?
- [ ] Ha cache de sessao/perfil para evitar queries repetidas?
- [ ] O rate limiting funciona em ambiente serverless (multiplas instancias)?
- [ ] Ha limpeza periodica de sessoes expiradas e tokens de verificacao?
- [ ] O hook pos-signup pode causar timeout na criacao de user_profiles?

---

## FASE 3 — Proposta de Correcoes

Para CADA problema encontrado na Fase 2, forneca:

| # | Categoria | Severidade | Arquivo:Linha | Descricao do Problema | Correcao Proposta | Risco de Quebra |
|---|-----------|-----------|---------------|----------------------|-------------------|-----------------|
| 1 | A/B/C/... | CRITICO/IMPORTANTE/MELHORIA | arquivo.ts:123 | Descricao clara | Correcao minima | Sim/Nao + detalhes |

### Classificacao de Severidade:
- **CRITICO**: Vulnerabilidade de seguranca exploravel, perda de dados, bypass de autenticacao
- **IMPORTANTE**: Inconsistencia de autorizacao, vazamento de informacoes, falha silenciosa
- **MELHORIA**: Performance, UX, boas praticas, hardening adicional

### Ordem de Correcao Recomendada:
1. Todos os CRITICOS primeiro
2. IMPORTANTES que afetam seguranca
3. IMPORTANTES que afetam integridade de dados
4. MELHORIAS

**APRESENTE A TABELA COMPLETA E AGUARDE MINHA APROVACAO ANTES DE APLICAR QUALQUER MUDANCA.**

---

## FASE 4 — Revisao Especifica do Sistema de Convites (se existir)

Se ja existir um sistema de convites, revise adicionalmente:

### 4.1 Seguranca do Convite
- [ ] O token de convite tem entropia suficiente e expiracao?
- [ ] O convite e single-use (invalidado apos aceite)?
- [ ] Apenas analistas/admins podem enviar convites?
- [ ] O convite e vinculado a uma organizacao especifica?
- [ ] Ha protecao contra convites para emails ja cadastrados na mesma org?
- [ ] O email de convite e seguro contra phishing (dominio correto, SSL)?

### 4.2 Fluxo de Aceite
- [ ] Usuario novo: e direcionado para criar senha (nao signup completo)?
- [ ] Usuario existente (visitante): e vinculado a org sem recriar conta?
- [ ] Usuario existente (ja em outra org): como e tratado?
- [ ] O perfil configurado em `people` (farms, permissoes) e preservado apos aceite?
- [ ] A role e atualizada adequadamente (visitante → cliente)?
- [ ] Ha feedback visual claro durante todo o fluxo?

### 4.3 Integridade
- [ ] Convites expirados sao limpos do banco?
- [ ] Ha limite de convites pendentes por organizacao?
- [ ] O reenvio de convite invalida o anterior?
- [ ] Ha log de auditoria de convites enviados/aceitos/expirados?

---

## O que voce NAO deve fazer

- NAO altere NENHUM arquivo sem minha aprovacao explicita
- NAO adicione funcionalidades novas (esta e uma REVISAO, nao implementacao)
- NAO refatore codigo funcional por questoes esteticas
- NAO mude a estrutura do banco de dados sem discussao previa
- NAO adicione bibliotecas ou dependencias novas
- NAO altere arquivos fora do escopo listado
- NAO assuma como o codigo funciona — LEIA o codigo real
- NAO invente problemas que nao existem — seja factual e cite evidencias
- NAO aplique correcoes em cascata (corrigir A que quebra B que quebra C)
- NAO remova tratamentos de erro existentes
- NAO altere a configuracao do Better Auth sem entender todas as implicacoes
- NAO modifique o fluxo de autenticacao sem plano de rollback

---

## Exemplo de Uso desta Instrucao

```
Realize a revisao profunda do sistema de autenticacao da aplicacao Gesttor
seguindo a instrucao em .skills/REVISAO_AUTENTICACAO.md

Foco principal: [escolha um ou mais]
- Seguranca geral
- Fluxo de cadastro e vinculacao
- Sistema de convites
- Recuperacao de senha
- Gerenciamento de sessao
- Todos os fluxos

Contexto adicional: [descreva situacao especifica se houver]
```

## Variacao: Auditoria Rapida (apenas seguranca critica)

```
Siga .skills/REVISAO_AUTENTICACAO.md mas execute apenas:
- Fase 1: itens 1.1, 1.2, 1.5
- Fase 2: categorias A e B apenas
- Fase 3: apenas itens CRITICOS
```

## Variacao: Revisao Pre-Deploy

```
Siga .skills/REVISAO_AUTENTICACAO.md com foco em:
- Fase 2 categorias A, B, D (seguranca, autorizacao, sessao)
- Verificar se BETTER_AUTH_SECRET esta seguro em producao
- Verificar se CORS esta restrito aos dominios corretos
- Verificar se rate limiting funciona em ambiente Vercel serverless
- Verificar se sessionStorage e adequado para o ambiente de producao
```
