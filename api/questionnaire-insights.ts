/**
 * API: Gerar insights com IA a partir dos resultados do questionário.
 * POST /api/questionnaire-insights
 * Body: { summary: string, farmName?: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { completeWithFallback } from './_lib/ai/providers/index.js';

/* ─── Regras do especialista ─── */
const EXPERT_RULES = `
DIRETRIZES DE CONSULTORIA (MÉTODO ANTONIO CHAKER):

PERSONALIDADE:
- Seja direto, pragmático e focado em lucro (R$/ha).
- Use frases curtas. Evite "corporativês".
- Se a nota for baixa, seja "duro" na análise (ex: "Sem medição, não há gestão").
- Se a nota for alta, parabenize mas alerte sobre a "zona de conforto".
- VOCABULÁRIO PROIBIDO: Nunca use a palavra "chão". Use sempre "Solo" ou "Terra".

REGRAS DE GATILHO POR PILAR:

1. GENTE (Equipe e Liderança):
   - Se Score < 70% (Regular/Ruim/Crítico):
     * OBRIGATÓRIO recomendar: "Definição clara de funções e metas individuais".
     * OBRIGATÓRIO recomendar: "Reunião matinal de alinhamento".
     * Frase chave: "Equipe sem meta não sabe para onde vai".
   - Se Score >= 70% (Bom/Excelente):
     * Recomendar: "Bônus por resultado atrelado a metas claras".

2. GESTÃO (Processos e Financeiro):
   - Se Score < 70% (Regular/Ruim/Crítico):
     * OBRIGATÓRIO recomendar: "Implantar Fluxo de Caixa Projetado 12 meses".
     * OBRIGATÓRIO recomendar: "Controle de estoque de insumos".
     * Frase chave: "Fazenda é empresa a céu aberto, mas o caixa não aceita desaforo".
   - Se Score >= 70% (Bom/Excelente):
     * Recomendar: "Análise de Sensibilidade (Cenários de estresse)".

3. PRODUÇÃO (Zootecnia e Campo):
   - Se Score < 70% (Regular/Ruim/Crítico):
     * OBRIGATÓRIO recomendar: "Ajuste de carga animal (Lotação) x Capacidade de suporte".
     * OBRIGATÓRIO recomendar: "Manejo de pastagem por altura de entrada e saída".
     * Frase chave: "Pasto rapado é dinheiro jogado fora".
   - Se Score >= 70% (Bom/Excelente):
     * Recomendar: "ILPF ou Adubação intensiva de pastagens".

FORMATO DA RESPOSTA:
1. ANÁLISE EXECUTIVA (Max 3 linhas por parágrafo):
   - Vá direto ao ponto onde a fazenda está perdendo dinheiro.
   - Cite os números do diagnóstico.

2. PLANO DE AÇÃO (3 Passos):
   - Ação 1 (Imediata - Dói menos e dá resultado rápido)
   - Ação 2 (Estruturante - Resolve a causa raiz)
   - Ação 3 (Estratégica - Prepara para o futuro)

3. O "PULO DO GATO" (Conclusão):
   - Uma frase impactante resumindo o diagnóstico.
`;

/* ─── Rate limiting in-memory (por IP) ─── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

/* ─── Constants ─── */
const PREFERRED_MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `Você é um consultor especializado em gestão pecuária.

INSTRUÇÕES:
- Seja direto, pragmático e focado em resultados financeiros
- Use termos técnicos do setor quando apropriado (GMD, Lotação, Desembolso Cabeça/Mês, etc.)
- Baseie suas recomendações nos dados fornecidos
- IMPORTANTE: Sempre inicie sua resposta com "Analisando seus resultados, pudemos observar que..."
- Não use expressões informais como "companheiro" ou similares
- Mantenha um tom profissional e consultivo`;

/* ─── Handler ─── */
function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Limite de requisições excedido. Aguarde um minuto e tente novamente.',
    });
  }

  try {
    const { summary, farmName } = req.body || {};

    if (!summary || typeof summary !== 'string') {
      return res.status(400).json({
        error: "O campo 'summary' é obrigatório e deve ser uma string.",
      });
    }

    if (summary.length > 50000) {
      return res.status(400).json({
        error: 'O resumo é muito longo (máximo 50.000 caracteres).',
      });
    }

    if (summary.trim().length < 10) {
      return res.status(400).json({
        error: 'O resumo é muito curto (mínimo 10 caracteres).',
      });
    }

    if (farmName && typeof farmName !== 'string') {
      return res.status(400).json({
        error: "O campo 'farmName' deve ser uma string.",
      });
    }

    if (farmName && farmName.length > 200) {
      return res.status(400).json({
        error: 'O nome da fazenda é muito longo (máximo 200 caracteres).',
      });
    }

    const userPrompt = `Você é um consultor sênior de gestão pecuária (Método Instituto Inttegra). Analise os resultados do diagnóstico abaixo.

CONTEXTO E REGRAS DO ESPECIALISTA:
${EXPERT_RULES}

DADOS DO DIAGNÓSTICO DA FAZENDA:
${farmName ? `Fazenda: ${farmName}` : ''}
${summary}

Sua tarefa é cruzar os "DADOS DO DIAGNÓSTICO" com as "DIRETRIZES DE CONSULTORIA" acima e gerar um relatório.
Siga estritamente o "FORMATO DA RESPOSTA" definido nas regras.`;

    const response = await completeWithFallback({
      preferredProvider: 'gemini',
      model: PREFERRED_MODEL,
      request: {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 4096,
        temperature: 0.7,
        timeoutMs: 60_000,
      },
    });

    return res.status(200).json({ answer: response.content });
  } catch (err: any) {
    console.error('[questionnaire-insights] Erro:', err.message);

    let statusCode = 500;
    let errorMessage = 'Erro ao gerar insights com IA.';

    if (err.message?.includes('AI_NO_PROVIDERS')) {
      statusCode = 500;
      errorMessage = 'Serviço de IA não configurado no servidor. Contate o suporte.';
    } else if (err.message?.includes('API key') || err.message?.includes('not configured')) {
      statusCode = 500;
      errorMessage = 'Erro de configuração do servidor. Contate o suporte.';
    } else if (err.message?.includes('timeout') || err.message?.includes('ETIMEDOUT')) {
      statusCode = 504;
      errorMessage = 'Tempo limite excedido. Tente novamente.';
    } else if (err.message?.includes('rate limit') || err.message?.includes('quota')) {
      statusCode = 429;
      errorMessage = 'Limite de requisições excedido. Aguarde alguns momentos.';
    } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
      statusCode = 503;
      errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
    }

    return res.status(statusCode).json({
      error: errorMessage,
      code: err.code || 'AI_ERROR',
    });
  }
}
