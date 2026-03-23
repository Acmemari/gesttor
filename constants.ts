import { Plan } from './types';

export const PLANS: Plan[] = [
  {
    id: 'essencial',
    name: 'Essencial',
    price: 0,
    features: ['Acesso Limitado ao Chat', 'Histórico de 7 dias'],
    limits: { agents: 1, historyDays: 7, users: 1 },
  },
  {
    id: 'gestor',
    name: 'Gestor',
    price: 97,
    features: ['Todos os Agentes', 'Chat Ilimitado', 'Histórico de 1 ano', 'Análise de Tendências'],
    limits: { agents: 5, historyDays: 365, users: 3 },
  },
  {
    id: 'pro',
    name: 'Pró',
    price: 299,
    features: ['Múltiplos Usuários', 'API Dedicada', 'Suporte Prioritário', 'Gestão de Rebanho Completa'],
    limits: { agents: 99, historyDays: 9999, users: 10 },
  },
];
