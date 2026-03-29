import type { AIProvider } from '../../ai/types.js';
import { safeJsonParseWithRepair } from '../../ai/json-repair.js';
import { ataGenOutputSchema, type AtaGenInput, type AtaGenOutput } from './manifest.js';

const BASE_SYSTEM_PROMPT = [
  'Você é um analista especializado em atas de reunião para o agronegócio.',
  'Sua função é analisar a transcrição de uma reunião semanal de gestão e extrair informações estruturadas.',
  '',
  'Regras obrigatórias:',
  '- Responda sempre em português do Brasil.',
  '- NUNCA alucine: mencione APENAS fatos, decisões e compromissos explícitos na transcrição.',
  '- Não invente nomes, datas ou decisões que não estejam na transcrição.',
  '- Foque em fatos observáveis e decisões concretas.',
  '- Se uma informação não está clara na transcrição, NÃO inclua.',
  '- Para ações, tente identificar o responsável e prazo mencionados. Se não mencionados, use "A definir".',
  '- O resumo deve ser conciso (2-4 frases) capturando o objetivo e resultado principal da reunião.',
  '- Decisões devem ser declarações claras e objetivas.',
  '- Itens de estacionamento são assuntos mencionados mas não resolvidos na reunião.',
  '- Riscos e bloqueios são problemas que podem atrasar ou impedir o progresso.',
  '- Entregue saída APENAS em JSON válido.',
].join('\n');

const JSON_FORMAT_INSTRUCTIONS = `
Formato JSON obrigatório:
{
  "sumario": "Resumo executivo da reunião em 2-4 frases.",
  "decisoes": ["Decisão 1", "Decisão 2"],
  "acoes": [
    { "descricao": "Descrição da ação", "responsavel": "Nome da pessoa", "prazo": "Data ou prazo" }
  ],
  "estacionamento": ["Item pendente 1", "Item pendente 2"],
  "riscosBlockers": ["Risco ou bloqueio 1"]
}

Regras do JSON:
- "sumario": obrigatório, mínimo 10 caracteres
- "decisoes": array de strings, pode ser vazio se nenhuma decisão foi tomada
- "acoes": array de objetos, cada um com descricao, responsavel e prazo
- "estacionamento": array de strings, itens não resolvidos
- "riscosBlockers": array de strings, riscos ou impedimentos`;

const SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}\n${JSON_FORMAT_INSTRUCTIONS}`;

function buildUserPrompt(input: AtaGenInput): string {
  const lines = [
    'Analise a transcrição da reunião semanal abaixo e extraia as informações estruturadas.',
    '',
    '== CONTEXTO ==',
    `Participantes da reunião: ${input.participantes.join(', ') || 'Não informados'}`,
    '',
  ];

  if (input.atividadesConcluidas.length > 0) {
    lines.push('== ATIVIDADES CONCLUÍDAS NA SEMANA ANTERIOR ==');
    input.atividadesConcluidas.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
  }

  if (input.atividadesPendentes.length > 0) {
    lines.push('== ATIVIDADES PENDENTES DA SEMANA ANTERIOR ==');
    input.atividadesPendentes.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
  }

  if (input.atividadesPlanejadas.length > 0) {
    lines.push('== ATIVIDADES PLANEJADAS PARA A PRÓXIMA SEMANA ==');
    input.atividadesPlanejadas.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
  }

  lines.push('== TRANSCRIÇÃO DA REUNIÃO ==');
  lines.push(input.transcricaoTexto);
  lines.push('');
  lines.push('Com base na transcrição e contexto acima, gere o JSON estruturado com sumário, decisões, ações, itens de estacionamento e riscos/bloqueios.');

  return lines.join('\n');
}

export async function runAtaGenAgent(args: {
  input: AtaGenInput;
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
}): Promise<{
  data: AtaGenOutput;
  rawContent: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
}> {
  const finalSystemPrompt = args.systemPrompt
    ? `${args.systemPrompt}\n\nIMPORTANTE: Você deve obrigatoriamente retornar a resposta no formato JSON abaixo:\n${JSON_FORMAT_INSTRUCTIONS}`
    : SYSTEM_PROMPT;

  const response = await args.provider.complete({
    model: args.model,
    systemPrompt: finalSystemPrompt,
    userPrompt: buildUserPrompt(args.input),
    responseFormat: 'json',
    temperature: 0.3,
    maxTokens: 4000,
    timeoutMs: 55_000,
  });

  const parsed = safeJsonParseWithRepair<AtaGenOutput>(response.content, ataGenOutputSchema);
  if (!parsed.success) {
    const parseError = 'error' in parsed ? parsed.error : 'unknown parse error';
    throw new Error(`ATA_GEN_AGENT_OUTPUT_INVALID: ${parseError}`);
  }

  return {
    data: parsed.data,
    rawContent: response.content,
    usage: response.usage,
    latencyMs: response.latencyMs,
  };
}
