<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1DqXzbKOjJ6Jc2P_jAFLhwUrwhjhDop8O

## Run Locally

**Prerequisitos:** Node.js 20 (LTS) ou superior. Testado com Node 24. Se precisar alternar versões no Windows, use [nvm-windows](https://github.com/coreybutler/nvm-windows).

1. Install dependencies:
   `npm install`
2. Configure as variáveis de ambiente em `.env.local` (veja `docs/ENVIRONMENT.md` para um exemplo completo):
   - `VITE_SUPABASE_URL` - URL do projeto Supabase (obrigatória)
   - `VITE_SUPABASE_ANON_KEY` - Chave anônima do Supabase (obrigatória)
   - `OPENAI_API_KEY` - Chave da API OpenAI (usada no servidor via Vercel Serverless Functions)
   - `GEMINI_API_KEY` - Opcional, mantida para compatibilidade
3. Run the app:
   `npm run dev`

## Build

### Build de Produção

```bash
npm run build
```

O build gera os arquivos otimizados na pasta `dist/`, incluindo:

- CSS do Tailwind processado e otimizado
- JavaScript minificado e code-splitted
- Service Worker para cache de recursos

### Preview do Build

```bash
npm run preview
```

## Testes

O projeto possui testes unitários e E2E para verificar o carregamento de recursos e a inicialização da aplicação.

### Executar Testes Unitários

```bash
# Executar todos os testes
npm test

# Executar testes em modo watch
npm run test:watch

# Executar testes com cobertura
npm run test:coverage
```

### Executar Testes E2E

```bash
# Executar testes E2E (requer navegadores instalados)
npm run test:e2e

# Executar testes E2E com interface gráfica
npm run test:e2e:ui

# Executar testes E2E em modo headed (com navegador visível)
npm run test:e2e:headed
```

**Nota:** Na primeira execução, é necessário instalar os navegadores do Playwright:

```bash
npx playwright install --with-deps chromium
```

### Testes de Carregamento

Foram criados testes específicos para verificar:

- Carregamento de recursos CSS e JS
- Inicialização do React
- Estrutura HTML correta
- Detecção de erros 404

Arquivos de teste:

- `src/test/loading.test.tsx` - Testes de carregamento de recursos
- `src/test/index.test.tsx` - Testes de inicialização do React
- `src/test/resources.test.ts` - Testes de validação de recursos estáticos
- `src/test/e2e/loading.spec.ts` - Testes E2E de carregamento
- `src/test/e2e/app.spec.ts` - Testes E2E de funcionalidade básica

## Configuração

### Variáveis de Ambiente

O projeto utiliza as seguintes variáveis de ambiente:

- **Frontend (Vite):**
  - `VITE_SUPABASE_URL` - URL do projeto Supabase (obrigatória)
  - `VITE_SUPABASE_ANON_KEY` - Chave anônima do Supabase (obrigatória)

- **Backend (Vercel Serverless Functions):**

### Integração n8n Webhook

O chat utiliza uma automação n8n através de um webhook:

- **Webhook URL:** `https://pecuaria-n8n.tcvxzi.easypanel.host/webhook/fala-antonio`
- `api/ask-assistant.ts` - Endpoint serverless do Vercel que chama o webhook
- `agents/ChatAgent.tsx` - Componente React que consome a API

**Fluxo de processamento:**

1. Usuário envia mensagem no chat
2. Frontend chama `/api/ask-assistant`
3. Serverless function envia pergunta para webhook n8n
4. n8n processa a mensagem (IA, regras de negócio, etc.)
5. n8n retorna resposta
6. Resposta é exibida no chat

### Tailwind CSS

O projeto usa Tailwind CSS com build local via PostCSS. A configuração está em:

- `tailwind.config.js` - Configuração do Tailwind (cores customizadas, fontes)
- `postcss.config.js` - Configuração do PostCSS
- `index.css` - Arquivo principal com diretivas Tailwind e estilos customizados

### Service Worker

O projeto inclui um Service Worker para cache de recursos estáticos:

- `public/sw.js` - Service Worker com estratégia cache-first
- `src/lib/sw-register.ts` - Utilitário de registro do SW

O Service Worker é registrado automaticamente em produção.

## Correções de Erros

### Erro 404 - index.css

**Problema:** O arquivo `index.css` estava sendo referenciado no `index.html` mas não existia.

**Solução:** Criado o arquivo `index.css` na raiz do projeto com estilos básicos e reset CSS.

### Aviso Tailwind CDN

**Problema:** Uso do CDN do Tailwind CSS em produção (não recomendado).

**Solução:** Migrado para build local do Tailwind CSS usando PostCSS. O CSS é gerado durante o build e otimizado automaticamente.
