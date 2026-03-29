import { z } from 'zod';
import type { AgentManifest } from '../../ai/types.js';

export const transcricaoProcInputSchema = z.object({
  transcricaoTexto: z.string().min(10, 'A transcrição deve ter pelo menos 10 caracteres.'),
});

export const transcricaoProcOutputSchema = z.object({
  presentesConfirmados: z.array(z.string()),
  citados: z.array(z.string()),
  summary: z.string().min(10),
  decisions: z.array(z.object({
    decision: z.string(),
    rationale: z.string().optional(),
    descartado: z.string().optional(),
    assignee: z.string().optional(),
    impact: z.string().optional(),
  })),
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    contexto: z.string().optional(),
    assignee: z.string().optional(),
    priority: z.enum(['alta', 'media', 'baixa']).optional(),
    dueDate: z.string().optional(),
  })),
  minutes: z.string().min(10),
  riscosBlockers: z.array(z.string()),
  estacionamento: z.array(z.string()),
  incertezas: z.array(z.string()),
});

export type TranscricaoProcInput = z.infer<typeof transcricaoProcInputSchema>;
export type TranscricaoProcOutput = z.infer<typeof transcricaoProcOutputSchema>;

export const transcricaoProcManifest: AgentManifest = {
  id: 'transcricao-proc',
  version: '1.0.0',
  name: 'Processador de Transcrição',
  description: 'Processa transcrições de reuniões operacionais do agronegócio e gera ata estruturada com decisões, tarefas e métricas.',
  inputSchema: transcricaoProcInputSchema,
  outputSchema: transcricaoProcOutputSchema,
  modelPolicy: {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    fallback: [
      { provider: 'gemini', model: 'gemini-2.0-flash' },
      { provider: 'openai', model: 'gpt-4o-mini' },
    ],
  },
  estimatedTokensPerCall: 6000,
};
