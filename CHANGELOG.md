# Changelog

## [Unreleased]

### Adicionado

- **Integração n8n Webhook:**
  - Substituída integração direta OpenAI/Gemini por webhook n8n
  - Atualizado `api/ask-assistant.ts` - Serverless function que chama webhook n8n
  - Webhook URL: `https://pecuaria-n8n.tcvxzi.easypanel.host/webhook/fala-antonio`
  - Processamento de mensagens agora gerenciado pelo n8n
  - Timeout de 60 segundos para chamadas ao webhook
  - Tratamento robusto de erros e diferentes formatos de resposta
- **Configuração de ambiente:**
  - Alternativa `WEBHOOK_URL` para desenvolvimento local
  - Removida dependência de `OPENAI_API_KEY` e `GEMINI_API_KEY` do servidor
- Arquivo `index.css` para corrigir erro 404 de carregamento
- Testes unitários para verificação de carregamento de recursos:
  - `src/test/loading.test.tsx` - Testes de carregamento HTML, CSS e JS
  - `src/test/index.test.tsx` - Testes de inicialização do React
  - `src/test/resources.test.ts` - Testes de validação de recursos estáticos
- **Migração do Tailwind CSS para build local:**
  - Instalado `tailwindcss`, `postcss`, `autoprefixer`, `@tailwindcss/postcss`
  - Criado `tailwind.config.js` com configuração completa (cores, fontes customizadas)
  - Criado `postcss.config.js` para integração com Vite
  - Migrado estilos customizados do `index.html` para `index.css`
- **Testes E2E com Playwright:**
  - Instalado `@playwright/test`
  - Criado `playwright.config.ts` com configuração para Chromium
  - Criado `src/test/e2e/loading.spec.ts` - Testes E2E de carregamento
  - Criado `src/test/e2e/app.spec.ts` - Testes E2E de funcionalidade básica
  - Adicionados scripts `test:e2e`, `test:e2e:ui`, `test:e2e:headed` no `package.json`
- **Service Worker para cache:**
  - Criado `public/sw.js` com estratégia cache-first para recursos estáticos
  - Criado `src/lib/sw-register.ts` - Utilitário de registro do SW
  - Integrado registro automático do SW em produção no `index.tsx`

### Corrigido

- Erro 404 ao carregar `/index.css` - arquivo criado na raiz do projeto
- Validação de estrutura HTML e recursos críticos através de testes
- **Aviso do console sobre Tailwind CDN** - Migrado para build local
- **Performance:** CSS agora é gerado e otimizado durante o build
- **Chat bloqueado incorretamente:** Corrigida verificação de limite de mensagens no ChatAgent
  - Implementado sistema de contagem de mensagens diárias
  - Plano Básico: limite de 10 mensagens por dia
  - Planos Pro e Enterprise: chat ilimitado
  - Admins têm acesso ilimitado
- **Erro HTTP 500 no chat OpenAI Assistant:**
  - Adicionado tratamento robusto de erros com logs detalhados
  - Implementado timeout de 60 segundos e limite de tentativas
  - Melhorado parsing da resposta para suportar diferentes formatos da API
  - Adicionadas validações antes de acessar propriedades da resposta
  - Melhorado tratamento de status diferentes (failed, cancelled, etc)
  - Adicionada ordenação desc na busca de mensagens
  - Mensagens de erro mais descritivas para facilitar debug
- **Loading infinito em produção:**
  - Adicionado timeout de segurança no AuthContext (10s) para garantir que isLoading sempre se torne false
  - Adicionado timeout de segurança no App.tsx (5s) para evitar loading infinito quando agents não carregam
  - Adicionado tratamento de erro no useMemo dos agents para evitar falhas silenciosas
  - Melhorado tratamento de erros no carregamento de perfil do usuário
- **Verificação de limite de mensagens bloqueando incorretamente:**
  - Implementado fallback permissivo: em caso de erro de conexão, permite envio ao invés de bloquear
  - Adicionado cache de 30 segundos para evitar múltiplas verificações desnecessárias
  - Implementado retry logic (até 2 tentativas) para erros de conexão temporários
  - Adicionada verificação para evitar mensagens duplicadas de limite
  - Mensagens diferentes para limite real vs erro de conexão
  - Melhorado tratamento de erros de rede (ERR_CONNECTION_CLOSED, ERR_HTTP2_PROTOCOL_ERROR)
- **Segurança e configuração:**
  - Adicionado `.env` e `.env.local` ao `.gitignore` para proteger chaves de API
  - Removido arquivo `.env` do tracking do git (mantido localmente)
  - Melhorada validação da OPENAI_API_KEY com mensagens de erro mais claras
  - Adicionada verificação prévia da API key na API antes de processar requisições
  - Melhorado tratamento de erros HTTP com códigos específicos (401, 500, 504)
  - Mensagens de erro mais descritivas quando API key não está configurada no Vercel

### Modificado

- `package.json` - Faixa de engines ajustada para `>=20 <25`, evitando aviso EBADENGINE em ambientes com Node 24.
- **Documentação atualizada:**
  - `README.md` - Atualizado com informações sobre integração n8n webhook
  - Adicionadas instruções de configuração no Vercel
- `index.html` - Removido CDN do Tailwind e scripts inline de configuração
- `index.tsx` - Adicionado import do CSS e registro do Service Worker
- `index.css` - Atualizado com diretivas Tailwind e estilos customizados migrados
- **`api/ask-assistant.ts` - Refatorado para integração com webhook n8n:**
  - Removida lógica de chamada direta ao OpenAI/Gemini
  - Implementada chamada HTTP POST ao webhook n8n
  - Suporte para múltiplos formatos de resposta do webhook
  - Timeout configurável (60s)
  - Tratamento de erros específicos (timeout, rede, webhook)
- `agents/ChatAgent.tsx` - Mantida chamada à API `/api/ask-assistant`
  - Endpoint continua o mesmo (`/api/ask-assistant`)
  - Frontend não sofre alterações (compatibilidade mantida)
  - Mantida funcionalidade de histórico e salvamento no Supabase
  - Mantida UI de anexos (funcionalidade em desenvolvimento)
  - Implementado sistema de verificação de limite de mensagens com contagem diária
  - Criada função `checkChatLimit()` para verificar limites por plano
- `App.tsx` - Chat "Pergunte p/ Antonio" desbloqueado
  - Status alterado de 'locked' para 'active'
  - Removido bloqueio de acesso no useEffect
  - Gestão de Usuários (AdminDashboard) permanece disponível para usuários admin

### Documentação

- Atualizado README.md com:
  - Instruções de build e preview
  - Informações sobre testes E2E
  - Configuração do Tailwind CSS
  - Informações sobre Service Worker
  - Scripts disponíveis
  - Configuração de variáveis de ambiente (incluindo `OPENAI_API_KEY`)
  - Informações sobre integração do OpenAI Assistant

## Notas Técnicas

### Migração Tailwind CSS

- Tailwind CSS agora é processado via PostCSS durante o build
- CSS gerado é otimizado e minificado automaticamente
- Configuração mantém todas as cores e fontes customizadas (ai.\*)
- Build de produção gera CSS de ~11KB (gzip: ~2.5KB)

### Testes E2E

- Playwright configurado para rodar servidor de dev automaticamente
- Testes verificam carregamento completo, ausência de erros 404, e renderização do React
- Suporte para execução em modo UI e headed para debugging

### Service Worker

- Estratégia cache-first para recursos estáticos
- Versionamento de cache para atualizações
- Registro automático apenas em produção
- Melhora performance e permite funcionamento offline básico

### Próximos Passos Sugeridos

- Expandir testes E2E para cobrir mais funcionalidades
- Adicionar suporte para mais navegadores nos testes E2E (Firefox, WebKit)
- Implementar estratégias de cache mais sofisticadas no Service Worker
- Adicionar notificações push (se necessário)
