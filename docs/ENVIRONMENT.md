# Variáveis de ambiente necessárias

Crie um arquivo `.env.local` (ou `.env`) na raiz do projeto com os valores abaixo:

```
# Frontend (Vite) - Obrigatórias
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Backend (Vercel Serverless Functions) - Obrigatórias
# N8N_WEBHOOK_URL=... (Removido)
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# IA - Providers (obtenha as chaves nos respectivos painéis)
# GEMINI: https://aistudio.google.com/apikey (obrigatória para o provider padrão)
GEMINI_API_KEY=sua-chave-gemini-aqui
# OPENAI: necessário para fallback dos agentes (ex.: Assistente de Feedback)
OPENAI_API_KEY=sua-chave-openai-aqui
# ANTHROPIC: necessário para fallback dos agentes
ANTHROPIC_API_KEY=sua-chave-anthropic-aqui

# Opcional - Para desenvolvimento local do servidor de API
WEBHOOK_URL=https://pecuaria-n8n.tcvxzi.easypanel.host/webhook/fala-antonio

# Storage API CORS - obrigatório em produção (upload/delete de arquivos)
# Adicione a URL do frontend; default: localhost em dev
STORAGE_ALLOWED_ORIGINS=https://seu-app.vercel.app,https://seu-dominio.com
```

## Tabela de variáveis

| Variável                    | Obrigatória | Lado                 | Usado por                                             |
| --------------------------- | ----------- | -------------------- | ----------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Sim         | Frontend + Backend\* | Supabase client (frontend), `supabaseAdmin` (backend) |
| `SUPABASE_URL`              | Alias       | Backend              | Alias canônico de `VITE_SUPABASE_URL` no backend      |
| `VITE_SUPABASE_ANON_KEY`    | Sim         | Frontend             | Supabase client (autenticação do usuário)             |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim         | Backend              | `/api/agents-run` (auth, rate limit, token budgets)   |
| `GEMINI_API_KEY`            | Sim\*\*     | Backend              | Todos os endpoints de IA (provider principal)         |
| `OPENAI_API_KEY`            | Recomendada | Backend              | Fallback quando Gemini falha                          |
| `ANTHROPIC_API_KEY`         | Recomendada | Backend              | Fallback quando Gemini e OpenAI falham                |

| `STORAGE_ALLOWED_ORIGINS`   | Produção    | Backend              | `/api/storage` (CORS; upload/delete de arquivos)      |

> \* O backend aceita tanto `SUPABASE_URL` quanto `VITE_SUPABASE_URL` (prioridade para `SUPABASE_URL`). Isso permite configurar sem o prefixo `VITE_` no Vercel.

> \*\* Pelo menos uma chave de IA (`GEMINI`, `OPENAI` ou `ANTHROPIC`) é obrigatória para que os endpoints de IA funcionem.

## Descrição das Variáveis

### Frontend (prefixo `VITE_`)

- `VITE_SUPABASE_URL` - URL do projeto Supabase (obrigatória)
- `VITE_SUPABASE_ANON_KEY` - Chave anônima do Supabase (obrigatória)

### Backend (Vercel)

  - **Produção:** https://pecuaria-n8n.tcvxzi.easypanel.host/webhook/fala-antonio
  - Esta URL aponta para a automação n8n que processa as mensagens do chat

### IA (Providers)

Todos os endpoints de IA usam o **sistema unificado de providers** (`api/_lib/ai/providers/`) com fallback automático. Se o provider preferido falhar, o sistema tenta automaticamente os demais providers configurados.

- `GEMINI_API_KEY` - Chave da API Google Gemini. Provider padrão para todos os endpoints de IA. Obtenha em [Google AI Studio](https://aistudio.google.com/apikey).
- `OPENAI_API_KEY` - Chave da API OpenAI. Usada como fallback quando o Gemini falhar.
- `ANTHROPIC_API_KEY` - Chave da API Anthropic. Usada como fallback quando Gemini e OpenAI falharem.

**Importante:** Configure ao menos 2 providers para garantir disponibilidade em caso de falha do provider principal.

### Supabase (Backend)

- `SUPABASE_SERVICE_ROLE_KEY` - Chave de serviço do Supabase. Obrigatória para `/api/agents-run` (autenticação, rate limit, orçamento de tokens). **Nunca exponha no frontend.**

O pipeline de agentes (`/api/agents-run`) usa as tabelas: `plan_limits`, `rate_limits`, `token_budgets`, `token_ledger`. Consulte a migration [supabase/migrations/20260218100000_ai_agent_infrastructure.sql](../supabase/migrations/20260218100000_ai_agent_infrastructure.sql).

### Opcional


### Storage API (upload de arquivos B2)

- `STORAGE_ALLOWED_ORIGINS` - Origens permitidas para CORS na API `/api/storage`. **Obrigatório em produção.** O padrão inclui `localhost`/`127.0.0.1` (portas 3000 e 5173) e também `https://pecuaria.ai` + `https://www.pecuaria.ai`. Se o frontend rodar em outra URL (ex.: Vercel, domínio customizado adicional, IP da LAN), configure com as origens separadas por vírgula:
  - Produção: `https://seu-app.vercel.app,https://seu-dominio.com`
  - Local (porta diferente ou IP): `http://192.168.1.100:3000`
  - Erro "Origin not allowed"? Verifique o header Origin na requisição falha (DevTools > Network) e adicione essa URL à variável.

## Configuração no Vercel

Para configurar as variáveis no Vercel:

1. Acesse o painel do projeto no Vercel
2. Vá em **Settings** > **Environment Variables**
3. Adicione as variáveis necessárias:
   - `VITE_SUPABASE_URL` = (URL do projeto Supabase)
   - `SUPABASE_SERVICE_ROLE_KEY` = (chave do projeto Supabase)
   - `GEMINI_API_KEY` = (obrigatória)
   - `OPENAI_API_KEY` = (recomendada para fallback)
   - `ANTHROPIC_API_KEY` = (recomendada para fallback)
   - `N8N_WEBHOOK_URL` = `https://pecuaria-n8n.tcvxzi.easypanel.host/webhook/fala-antonio`
   - `STORAGE_ALLOWED_ORIGINS` = URL(s) do frontend, ex.: `https://seu-app.vercel.app` (obrigatório para upload de arquivos funcionar em produção)
4. Marque todas as variáveis para os ambientes **Production**, **Preview** e **Development**
5. Faça um novo deploy para aplicar as mudanças

**Importante:** Configure as variáveis para os ambientes Production, Preview e Development conforme necessário.

## Verificação pós-deploy

Após configurar as variáveis e fazer deploy, verifique se tudo está funcionando:

### 1. Health Check automático

```bash
# Produção
curl https://seu-dominio.vercel.app/api/agents-health | jq .

# Desenvolvimento local
curl http://localhost:3001/api/agents-health | jq .
```

Resposta esperada (tudo ok):

```json
{
  "status": "ok",
  "checks": {
    "supabase_url": { "ok": true, "message": "ok" },
    "supabase_service_role": { "ok": true, "message": "ok" },
    "n8n_webhook": { "ok": true, "message": "ok" },
    "ai_providers": { "ok": true, "message": "ok (gemini:true, openai:true, anthropic:true)" },
    "ai_fallback": { "ok": true, "message": "ok (3 providers available for fallback)" },
    "plan_limits": { "ok": true, "message": "ok" }
  }
}
```

Se `status` retornar `"degraded"`, verifique cada check individualmente.

### 2. Checklist manual

- [ ] `ai_providers.ok === true` — Pelo menos uma chave de IA configurada
- [ ] `ai_fallback.ok === true` — Pelo menos 2 providers para fallback
- [ ] `plan_limits.ok === true` — Tabelas do Supabase acessíveis
- [ ] `n8n_webhook.ok === true` — Chat do assistente funcionará

### Documentação de agentes

Para implantar novos agentes, siga o checklist em [docs/AGENT_DEPLOYMENT_CHECKLIST.md](AGENT_DEPLOYMENT_CHECKLIST.md).
