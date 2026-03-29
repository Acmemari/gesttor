import { z } from 'zod';
import type { AgentManifest } from '../../ai/types.js';

export const ataGenInputSchema = z.object({
  transcricaoTexto: z.string().min(10, 'A transcrição deve ter pelo menos 10 caracteres.'),
  atividadesConcluidas: z.array(z.string()),
  atividadesPendentes: z.array(z.string()),
  atividadesPlanejadas: z.array(z.string()),
  participantes: z.array(z.string()),
});

export const ataGenOutputSchema = z.object({
  sumario: z.string().min(10),
  decisoes: z.array(z.string()),
  acoes: z.array(z.object({
    descricao: z.string(),
    responsavel: z.string(),
    prazo: z.string(),
  })),
  estacionamento: z.array(z.string()),
  riscosBlockers: z.array(z.string()),
});

export type AtaGenInput = z.infer<typeof ataGenInputSchema>;
export type AtaGenOutput = z.infer<typeof ataGenOutputSchema>;

export const ataGenManifest: AgentManifest = {
  id: 'ata-gen',
  version: '1.0.0',
  name: 'Gerador de Ata de Reunião',
  description: 'Analisa transcrições de reuniões semanais e extrai decisões, ações, riscos e resumo executivo.',
  inputSchema: ataGenInputSchema,
  outputSchema: ataGenOutputSchema,
  modelPolicy: {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    fallback: [
      { provider: 'gemini', model: 'gemini-2.0-flash' },
      { provider: 'openai', model: 'gpt-4o-mini' },
    ],
  },
  estimatedTokensPerCall: 3000,
};
