import type { VercelRequest, VercelResponse } from '@vercel/node';
import { completeWithFallback } from './_lib/ai/providers/index.js';

const PREFERRED_MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `Você é um assistente de suporte técnico proativo do sistema Gesttor.
Seu papel é ajudar o usuário a detalhar melhor o problema ou sugestão antes de abrir o chamado.

REGRAS:
- Responda SEMPRE em português do Brasil.
- Seja empático e breve (2-3 frases no máximo).
- Reconheça o problema descrito.
- Faça uma pergunta de acompanhamento para ajudar o usuário a fornecer mais contexto.
- NÃO resolva o problema — apenas ajude a descrevê-lo melhor.
- NÃO use markdown, apenas texto simples.`;

function buildUserPrompt(body: {
  subject: string;
  ticketType: string;
  locationArea?: string;
  specificScreen?: string;
}): string {
  const parts = [
    `Assunto do chamado: "${body.subject}"`,
    `Tipo: ${body.ticketType === 'erro_tecnico' ? 'Erro Técnico' : 'Sugestão/Solicitação'}`,
  ];
  if (body.locationArea) parts.push(`Localização: ${body.locationArea}`);
  if (body.specificScreen) parts.push(`Tela: ${body.specificScreen}`);
  return parts.join('\n');
}

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { subject, ticketType, locationArea, specificScreen } = req.body || {};

    if (!subject || typeof subject !== 'string' || subject.trim().length < 5) {
      return res.status(400).json({ error: 'O campo subject deve ter pelo menos 5 caracteres.' });
    }

    const response = await completeWithFallback({
      preferredProvider: 'gemini',
      model: PREFERRED_MODEL,
      request: {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt({ subject: subject.trim(), ticketType, locationArea, specificScreen }),
        maxTokens: 200,
        temperature: 0.7,
        timeoutMs: 15_000,
      },
    });

    return res.status(200).json({ suggestion: response.content });
  } catch (err: any) {
    console.error('[support-suggest] Error:', err.message);

    if (err.message?.includes('AI_NO_PROVIDERS')) {
      return res.status(500).json({ error: 'Serviço de IA não configurado no servidor.' });
    }

    return res.status(500).json({ error: 'Erro ao gerar sugestão. Tente novamente.' });
  }
}
