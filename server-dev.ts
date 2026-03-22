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

// /api/auth EXATO → endpoint de perfil (api/auth.ts) — com json parser próprio
// DEVE ser registrado ANTES do catch-all para ter prioridade
app.all('/api/auth', express.json(), (req, res) => handleApiRoute('./api/auth.ts', req, res));

// /api/auth/* → Better Auth — chama auth.handler() diretamente (evita bugs do toNodeHandler + Express)
app.all('/api/auth/{*path}', async (req, res) => {
  console.log('[auth] →', req.method, req.url);
  try {
    console.log('[auth] importando auth...');
    const { auth } = await import('./api/_lib/auth.js');
    console.log('[auth] auth importado');

    // Reconstrói URL completa
    const host = req.headers.host || `localhost:${PORT}`;
    const url = `http://${host}${req.url}`;

    // Coleta body do stream do Express
    console.log('[auth] coletando body...');
    const bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
    console.log('[auth] body coletado:', bodyBuffer.length, 'bytes');

    // Constrói headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    // Chama o handler do Better Auth via fetch API
    console.log('[auth] chamando auth.handler()...');
    const fetchRes = await Promise.race([
      auth.handler(new Request(url, {
        method: req.method,
        headers,
        body: bodyBuffer.length > 0 ? bodyBuffer : null,
      })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('auth.handler() timeout após 8s')), 8000)
      ),
    ]);
    console.log('[auth] resposta recebida, status:', fetchRes.status);

    // Envia resposta de volta
    res.status(fetchRes.status);
    fetchRes.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });
    const responseBody = Buffer.from(await fetchRes.arrayBuffer());
    if (responseBody.length > 0) {
      res.send(responseBody);
    } else {
      res.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[server-dev] Auth error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

// ── Body parser para o restante das rotas ─────────────────────────────────────
app.use(express.json());

// ── Adaptador Vercel → Express ─────────────────────────────────────────────────
function createVercelAdapter(req: Request, res: Response) {
  const vercelReq = {
    method: req.method,
    body: req.body,
    headers: req.headers,
    query: req.query,
    url: req.url,
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
    const cause = error instanceof Error && (error as NodeJS.ErrnoException).cause;
    console.error(`[server-dev] Erro ${req.path}:`, message);
    if (cause) console.error(`[server-dev] Causa:`, cause);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}

// ── Rotas de API ───────────────────────────────────────────────────────────────

// Health
app.all('/api/health', (req, res) => handleApiRoute('./api/health.ts', req, res));

// Fazendas
app.all('/api/farms', (req, res) => handleApiRoute('./api/farms.ts', req, res));

// Organizações
app.all('/api/organizations', (req, res) => handleApiRoute('./api/organizations.ts', req, res));

// Pessoas / People
app.all('/api/pessoas', (req, res) => handleApiRoute('./api/pessoas.ts', req, res));

// Projetos / Deliveries / Iniciativas / Milestones / Tarefas
app.all('/api/projects', (req, res) => handleApiRoute('./api/projects.ts', req, res));
app.all('/api/deliveries', (req, res) => handleApiRoute('./api/deliveries.ts', req, res));
app.all('/api/initiatives', (req, res) => handleApiRoute('./api/initiatives.ts', req, res));
app.all('/api/milestones', (req, res) => handleApiRoute('./api/milestones.ts', req, res));
app.all('/api/tasks', (req, res) => handleApiRoute('./api/tasks.ts', req, res));

// Semanas / Atividades
app.all('/api/semanas', (req, res) => handleApiRoute('./api/semanas.ts', req, res));

// Evidências / Mapas de fazenda
app.all('/api/evidence', (req, res) => handleApiRoute('./api/evidence.ts', req, res));
app.all('/api/farm-maps', (req, res) => handleApiRoute('./api/farm-maps.ts', req, res));

// IA / Agentes
app.all('/api/ask-assistant', (req, res) => handleApiRoute('./api/ask-assistant.ts', req, res));
app.all('/api/questionnaire-insights', (req, res) => handleApiRoute('./api/questionnaire-insights.ts', req, res));
app.all('/api/delivery-summary', (req, res) => handleApiRoute('./api/delivery-summary.ts', req, res));
app.all('/api/feedback-assist', (req, res) => handleApiRoute('./api/feedback-assist.ts', req, res));
app.all('/api/support-suggest', (req, res) => handleApiRoute('./api/support-suggest.ts', req, res));
app.all('/api/agents-health', (req, res) => handleApiRoute('./api/agents-health.ts', req, res));
app.all('/api/agents-run', (req, res) => handleApiRoute('./api/agents-run.ts', req, res));
app.all('/api/agent-registry', (req, res) => handleApiRoute('./api/agent-registry.ts', req, res));
app.all('/api/agent-training', (req, res) => handleApiRoute('./api/agent-training.ts', req, res));

// Storage / Arquivos
app.all('/api/storage', (req, res) => handleApiRoute('./api/storage.ts', req, res));

// Cenários / Questionários / Feedbacks
app.all('/api/cattle-scenarios', (req, res) => handleApiRoute('./api/cattle-scenarios.ts', req, res));
app.all('/api/saved-questionnaires', (req, res) => handleApiRoute('./api/saved-questionnaires.ts', req, res));
app.all('/api/saved-feedbacks', (req, res) => handleApiRoute('./api/saved-feedbacks.ts', req, res));

// Empresas assessoras
app.all('/api/emp-ass', (req, res) => handleApiRoute('./api/emp-ass.ts', req, res));

// Admin
app.all('/api/admin', (req, res) => handleApiRoute('./api/admin.ts', req, res));

// Hierarquia (analistas / clientes / fazendas)
app.all('/api/hierarchy', (req, res) => handleApiRoute('./api/hierarchy.ts', req, res));

// ── Index ──────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.type('html');
  res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>API Dev — Gesttor</title></head>
<body style="font-family: sans-serif; padding: 2rem; max-width: 480px;">
  <h1>Servidor de Dev da API</h1>
  <p>Rotas <code>/api/*</code> disponíveis neste servidor. O frontend (Vite) está em <a href="http://localhost:3000">http://localhost:3000</a>.</p>
</body></html>
  `);
});

app.listen(PORT, () => {
  console.log(`\n🚀 API dev rodando em http://localhost:${PORT}`);
  console.log(`📝 Vite faz proxy de /api/* para este servidor\n`);
});
