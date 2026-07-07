import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/DB/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: [
    'ba_user', 'ba_session', 'ba_account', 'ba_verification', 'ba_rate_limit',
    'organization_owners', 'organization_documents', 'organizations', 'organization_analysts',
    'user_profiles', 'farms', 'people', 'profiles', 'job_roles', 'person_profiles',
    'person_farms', 'person_permissions', 'assignees', 'work_weeks', 'activities',
    'week_meeting_participants', 'week_history', 'projects', 'deliveries', 'initiatives',
    'initiative_milestones', 'initiative_tasks', 'initiative_team', 'initiative_participants',
    'delivery_ai_summaries', 'evidence', 'evidence_files', 'farm_maps', 'agent_registry',
    'agent_training_documents', 'agent_training_images', 'agent_runs', 'plan_limits',
    'token_budgets', 'token_ledger', 'rate_limits', 'ai_token_usage', 'cattle_scenarios',
    'saved_questionnaires', 'questionnaire_questions', 'saved_feedbacks', 'support_tickets',
    'support_ticket_messages', 'support_ticket_reads', 'support_ticket_attachments',
    'consulting_firms', 'app_settings', 'animal_categories',
    // Fazenda: hierarquia de localização (Retiro › Setor › Local) + config de níveis
    'farm_setores', 'farm_location_levels',
    // Movimentação de Áreas: ledger + versões (linha do tempo)
    'area_movimentos', 'area_versoes',
    // Gestão Orçamentária
    'plano_contas', 'orcamentos', 'orcamento_farms', 'orcamento_colaboradores',
    'orcamento_versoes', 'premissas', 'log_auditoria_orcamento',
    'farm_plano_contas_inativas', 'itens_orcamento',
    // Mapa de Rebanho (Estoque de Partida)
    'mapa_rebanho_headers', 'mapa_rebanho_lancamentos',
    // Mapa Rebanho - Mapão (lançamento periódico)
    'mapao_headers', 'mapao_lancamentos',
    // Movimentação › Nascimento
    'nascimento_movimentos', 'nascimento_fichas',
    // Movimentação › Vendas
    'venda_movimentos', 'venda_itens', 'venda_fichas',
    // Movimentação › Compras
    'compra_movimentos', 'compra_itens', 'compra_fichas',
    // Movimentação › Desmame
    'desmame_movimentos', 'desmame_fichas',
    // Movimentação › Mudança de Categoria
    'mudanca_categoria_movimentos', 'mudanca_categoria_fichas',
    // Configuração de campos genérica (Compra/Venda/Morte)
    'movimento_field_configs',
    // Zootechnical registers
    'regimes_alimentares', 'regimes_alimentares_historico', 'regimes_alimentares_gmd', 'tipos_chifre', 'motivos_morte', 'especies_forrageiras', 'pelagens', 'reprodutores', 'lotes', 'estacao_monta', 'tipos_local',
  ],
});
