// api/sentimento-mercado.ts
// Analisa o sentimento do mercado pecuário usando IA (Gemini)
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface NewsInput {
  title: string;
  source: string;
  description: string;
  publishedAt?: string;
  category?: string;
}

interface SentimentResult {
  signal: 'bullish' | 'neutral' | 'bearish';
  score: number; // 0-100 (0 = muito pessimista, 100 = muito otimista)
  summary: string;
  keyFactors: string[];
  trend: 'up' | 'stable' | 'down';
  trendLabel: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `Você é um analista sênior de inteligência de mercado especializado em agronegócio brasileiro, com profundo conhecimento da cadeia produtiva de pecuária (bovinos de corte) e grãos (soja, milho). Seu papel é transformar notícias dispersas em inteligência acionável, conectando pontos entre setores.

Analise as notícias fornecidas e retorne um JSON com a seguinte estrutura EXATA:
{
  "signal": "bullish" | "neutral" | "bearish",
  "score": <número de 0 a 100>,
  "summary": "<resumo executivo de 2-3 frases destacando o sentimento geral e a principal conexão entre setores>",
  "keyFactors": ["<fator 1 com dado concreto quando possível>", "<fator 2>", "<fator 3>", "<fator 4 opcional>"],
  "trend": "up" | "stable" | "down",
  "trendLabel": "<texto curto, ex: 'Alta moderada', 'Estável com viés de alta', 'Queda leve'>"
}

Metodologia (frame agro-intel):
- Avalie o sentimento do BOI GORDO como foco principal, mas considere o contexto completo.
- CONECTE PONTOS ENTRE SETORES — essas conexões são o que transforma dados em inteligência:
  • Preço do milho/soja impacta custo de confinamento (milho caro = pressão de baixa no abate, boi magro mais vendido, efeito defasado nos preços).
  • Relação de troca boi/bezerro e disponibilidade de bezerros sinalizam ciclo pecuário (reposição cara = pressão de alta futura).
  • Embargos ou restrições sanitárias em concorrentes (Uruguai, Paraguai, Argentina) tipicamente beneficiam o Brasil.
  • Demanda chinesa (principal comprador) é o driver #1 das exportações brasileiras de carne.
  • Clima (El Niño/La Niña) afeta pastagem, disponibilidade de água e safra de grãos simultaneamente.
  • Tarifas, acordos comerciais e regulamentações (ex: lei antidesmatamento da UE) alteram destinos de exportação.
  • Resultados/movimentos de JBS, Marfrig, Minerva e BRF sinalizam expectativas do setor frigorífico.
- Priorize notícias de fontes oficiais (Cepea/Esalq, USDA, Conab, B3) e portais especializados (Canal Rural, Beef Point) sobre fontes genéricas.
- Cada afirmação em "keyFactors" deve, quando possível, trazer um número ou fonte concreta (ex: "Indicador Cepea do boi gordo a R$ 312/@, alta de 2,3% na semana").
- IMPARCIALIDADE: se as notícias mostrarem visões divergentes (ex: analistas otimistas vs pessimistas, dados altistas vs baixistas), reflita a divergência no summary em vez de escolher um lado arbitrariamente — isso é melhor modelado como "neutral" com explicação da tensão.
- RECÊNCIA: dê mais peso a notícias recentes. Se uma notícia importante for de meses atrás (verifique a data fornecida), trate-a como contexto histórico, não como sinal atual de mercado.

Regras de saída:
- "signal": "bullish" = otimista (score >= 60), "neutral" = neutro (40-59), "bearish" = pessimista (score < 40)
- "score": 0 (extremamente pessimista) a 100 (extremamente otimista)
- "summary": português brasileiro, tom profissional e direto. SEMPRE mencione pelo menos uma conexão entre setores (ex: "custo do milho pressiona confinamento", "demanda chinesa sustenta exportação").
- "keyFactors": 3 a 4 fatores-chave com dados concretos quando disponíveis nas notícias.
- "trend": tendência de curto prazo (semanas), não longo prazo.
- Se notícias forem insuficientes ou contraditórias, retorne score 50, signal "neutral" e explique a ambiguidade no summary.
- Retorne APENAS o JSON, sem texto adicional, sem markdown, sem comentários.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY não configurada.' });
  }

  try {
    const { news } = req.body as { news: NewsInput[] };

    if (!news || !Array.isArray(news) || news.length === 0) {
      return res.status(400).json({ ok: false, error: 'Nenhuma notícia fornecida para análise.' });
    }

    // Build the news digest for the AI, grouped by category when available
    // so the model can reason across sectors as the agro-intel frame expects.
    const limited = news.slice(0, 25);

    const digest = limited
      .map((n, i) => {
        const cat = n.category ? ` {${n.category}}` : '';
        const date = n.publishedAt ? ` (${new Date(n.publishedAt).toLocaleDateString('pt-BR')})` : '';
        const desc = n.description ? ` — ${n.description.substring(0, 180)}` : '';
        return `${i + 1}. [${n.source}]${cat} ${n.title}${desc}${date}`;
      })
      .join('\n');

    const userPrompt = `Analise as seguintes ${news.length} notícias recentes sobre o agronegócio e determine o sentimento atual do mercado do BOI GORDO brasileiro, lembrando de conectar pontos entre setores (pecuária, grãos, clima, exportação, geopolítica):\n\n${digest}`;

    const url = `${GEMINI_BASE}/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    let fetchRes: Response;
    try {
      fetchRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const rawData: any = await fetchRes.json();

    if (!fetchRes.ok) {
      const errMsg = rawData?.error?.message ?? `Gemini HTTP ${fetchRes.status}`;
      throw new Error(errMsg);
    }

    const content = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error('Gemini retornou resposta vazia.');
    }

    // Parse JSON response
    let sentiment: SentimentResult;
    try {
      sentiment = JSON.parse(content);
    } catch {
      // Try extracting JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sentiment = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Resposta da IA não é um JSON válido.');
      }
    }

    // Validate and sanitize
    sentiment.score = Math.max(0, Math.min(100, Math.round(sentiment.score)));
    if (!['bullish', 'neutral', 'bearish'].includes(sentiment.signal)) {
      sentiment.signal = sentiment.score >= 60 ? 'bullish' : sentiment.score < 40 ? 'bearish' : 'neutral';
    }
    if (!['up', 'stable', 'down'].includes(sentiment.trend)) {
      sentiment.trend = 'stable';
    }
    if (!sentiment.trendLabel) {
      sentiment.trendLabel = sentiment.trend === 'up' ? 'Alta' : sentiment.trend === 'down' ? 'Queda' : 'Estável';
    }
    if (!Array.isArray(sentiment.keyFactors)) {
      sentiment.keyFactors = [];
    }

    return res.status(200).json({
      ok: true,
      data: {
        ...sentiment,
        analyzedAt: new Date().toISOString(),
        newsCount: news.length,
      },
    });
  } catch (err: any) {
    console.error('[sentimento-mercado] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Erro ao analisar sentimento.' });
  }
}
