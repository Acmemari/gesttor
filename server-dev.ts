// server-dev.ts
// Servidor de desenvolvimento para processar API routes localmente
// Execute: tsx server-dev.ts (em paralelo com npm run dev)
// OU use: npm run dev:all (para rodar ambos juntos)

import dotenv from 'dotenv';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
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
        setTimeout(() => reject(new Error('auth.handler() timeout após 20s')), 20000)
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

// ── Upload de áudio (multipart) — ANTES do json parser ────────────────────────
// Este route usa multer diretamente porque o createVercelAdapter só passa
// req.body (JSON); req.file ficaria invisível para o handler Vercel.
// A lógica de transcrição é compartilhada via api/_lib/transcription.ts.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB — chunking automático acima de 25 MB
});

app.post('/api/transcrever-reuniao', audioUpload.single('audio'), async (req, res) => {
  try {
    const { getAuthUserIdFromRequest } = await import('./api/_lib/betterAuthAdapter.js');
    const { transcribeAudioWithChunking, validateAudioFile, TRANSCRIPTION_MODEL } = await import('./api/_lib/transcription.js');

    // Adapta o Request do Express para VercelRequest (headers são suficientes para auth)
    const fakeVercelReq = { headers: req.headers } as VercelRequest;
    const userId = await getAuthUserIdFromRequest(fakeVercelReq);
    if (!userId) {
      res.status(401).json({ ok: false, error: 'Não autenticado.' });
      return;
    }

    interface UploadedFile {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    }
    const file = req.file as unknown as UploadedFile | undefined;

    if (!file) {
      res.status(400).json({ ok: false, error: 'Arquivo de áudio não enviado. Use o campo "audio".' });
      return;
    }

    const validationError = validateAudioFile(file.mimetype, file.size);
    if (validationError) {
      res.status(400).json({ ok: false, error: validationError });
      return;
    }

    const { texto, chunks } = await transcribeAudioWithChunking(file.buffer, file.originalname, file.mimetype);
    res.json({
      ok: true,
      data: {
        texto,
        modelo: TRANSCRIPTION_MODEL,
        chunks,
        reuniao_id: null,
        resumo: null,
        decisoes: null,
        tarefas: null,
        ata: null,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno.';
    console.error('[server-dev] transcrever-reuniao:', msg);
    if (!res.headersSent) res.status(500).json({ ok: false, error: msg });
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
    const stack = error instanceof Error ? error.stack : '';
    console.error(`[server-dev] Erro ${req.path}:`, message);
    if (stack) console.error(`[server-dev] Stack:`, stack);
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
app.all('/api/project', (req, res) => handleApiRoute('./api/project.ts', req, res));
app.all('/api/deliveries', (req, res) => handleApiRoute('./api/deliveries.ts', req, res));
app.all('/api/delivery-summaries', (req, res) => handleApiRoute('./api/delivery-summaries.ts', req, res));
app.all('/api/initiatives', (req, res) => handleApiRoute('./api/initiatives.ts', req, res));
app.all('/api/milestones', (req, res) => handleApiRoute('./api/milestones.ts', req, res));
app.all('/api/tasks', (req, res) => handleApiRoute('./api/tasks.ts', req, res));

// Semanas / Atividades
app.all('/api/semanas', (req, res) => handleApiRoute('./api/semanas.ts', req, res));
app.all('/api/atividades', (req, res) => handleApiRoute('./api/atividades.ts', req, res));
app.all('/api/historico-semanas', (req, res) => handleApiRoute('./api/historico-semanas.ts', req, res));
app.all('/api/semana-participantes', (req, res) => handleApiRoute('./api/semana-participantes.ts', req, res));
app.all('/api/semana-transcricoes', (req, res) => handleApiRoute('./api/semana-transcricoes.ts', req, res));
app.all('/api/atas', (req, res) => handleApiRoute('./api/atas.ts', req, res));
app.all('/api/desempenho', (req, res) => handleApiRoute('./api/desempenho.ts', req, res));

// Evidências / Mapas de fazenda
app.all('/api/evidence', (req, res) => handleApiRoute('./api/evidence.ts', req, res));
app.all('/api/farm-maps', (req, res) => handleApiRoute('./api/farm-maps.ts', req, res));

// IA / Agentes
app.all('/api/ask-assistant', (req, res) => handleApiRoute('./api/ask-assistant.ts', req, res));
app.all('/api/ai-usage', (req, res) => handleApiRoute('./api/ai-usage.ts', req, res));

app.all('/api/knowledge', (req, res) => handleApiRoute('./api/knowledge.ts', req, res));
app.all('/api/support-tickets', (req, res) => handleApiRoute('./api/support-tickets.ts', req, res));
app.all('/api/questions', (req, res) => handleApiRoute('./api/questions.ts', req, res));
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

// Admin / Auxiliares
app.all('/api/admin', (req, res) => handleApiRoute('./api/admin.ts', req, res));
app.all('/api/permissions', (req, res) => handleApiRoute('./api/permissions.ts', req, res));
app.all('/api/diag', (req, res) => handleApiRoute('./api/diag.ts', req, res));

// Hierarquia (analistas / clientes / fazendas)
app.all('/api/hierarchy', (req, res) => handleApiRoute('./api/hierarchy.ts', req, res));

// Convites
app.all('/api/invite', (req, res) => handleApiRoute('./api/invite.ts', req, res));

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
