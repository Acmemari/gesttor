// server-dev.ts
// Servidor de desenvolvimento para processar API routes localmente
// Execute: tsx server-dev.ts (em paralelo com npm run dev)
// OU use: npm run dev:all (para rodar ambos juntos)

import dotenv from 'dotenv';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Carrega .env padrão
dotenv.config();

// Carrega .env.local se existir (para segredos locais)
if (fs.existsSync('.env.local')) {
  console.log('📄 Carregando variáveis de .env.local');
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const app = express();
const PORT = Number(process.env.API_PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.type('html');
  res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>API - PecuariA</title></head>
<body style="font-family: sans-serif; padding: 2rem; max-width: 480px;">
  <h1>Servidor da API</h1>
  <p>Este é o servidor de desenvolvimento das rotas <code>/api/*</code>. A aplicação (frontend) é servida pelo Vite.</p>
  <p><strong>Para abrir o app:</strong> execute <code>npm run dev</code> e acesse o endereço que o Vite mostrar (ex.: <a href="http://localhost:3000">http://localhost:3000</a>).</p>
  <p>Se estiver usando <code>npm run dev:all</code>, o app estará na porta do Vite (geralmente 3000).</p>
</body></html>
  `);
});

function createVercelAdapter(req: Request, res: Response) {
  const vercelReq = {
    method: req.method,
    body: req.body,
    headers: req.headers,
    query: req.query,
  } as VercelRequest;

  let statusCode = 200;
  const headers = new Map<string, string>();

  const vercelRes = {
    status(code: number) {
      statusCode = code;
      return vercelRes;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return vercelRes;
    },
    json(data: unknown) {
      headers.forEach((v, k) => res.setHeader(k, v));
      res.status(statusCode).json(data);
    },
    end() {
      headers.forEach((v, k) => res.setHeader(k, v));
      res.status(statusCode).end();
    },
  } as unknown as VercelResponse;

  return { vercelReq, vercelRes };
}

async function handleApiRoute(routePath: string, req: Request, res: Response) {
  try {
    const module = await import(routePath);
    const handler = module.default;
    const { vercelReq, vercelRes } = createVercelAdapter(req, res);
    await handler(vercelReq, vercelRes);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno no servidor de desenvolvimento';
    console.error(`[server-dev] Erro ${req.path}:`, message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}

app.post('/api/ask-assistant', (req, res) => {
  handleApiRoute('./api/ask-assistant.ts', req, res);
});

app.post('/api/questionnaire-insights', (req, res) => {
  handleApiRoute('./api/questionnaire-insights.ts', req, res);
});

app.post('/api/delivery-summary', (req, res) => {
  handleApiRoute('./api/delivery-summary.ts', req, res);
});

app.post('/api/feedback-assist', (req, res) => {
  handleApiRoute('./api/feedback-assist.ts', req, res);
});

app.post('/api/support-suggest', (req, res) => {
  handleApiRoute('./api/support-suggest.ts', req, res);
});

app.get('/api/agents-health', (req, res) => {
  handleApiRoute('./api/agents-health.ts', req, res);
});

app.post('/api/agents-run', (req, res) => {
  handleApiRoute('./api/agents-run.ts', req, res);
});

app.post('/api/storage', (req, res) => {
  handleApiRoute('./api/storage.ts', req, res);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor de desenvolvimento da API rodando em http://localhost:${PORT}`);
  console.log(`📝 O Vite está configurado para fazer proxy de /api/* para este servidor\n`);
});
