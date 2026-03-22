require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL + '?sslmode=verify-full',
  ssl: { rejectUnauthorized: false },
});

const schema = {
  ba_user: ['id','name','email','email_verified','image','created_at','updated_at'],
  ba_session: ['id','expires_at','token','created_at','updated_at','ip_address','user_agent','user_id'],
  ba_account: ['id','account_id','provider_id','user_id','access_token','refresh_token','id_token','access_token_expires_at','refresh_token_expires_at','scope','password','created_at','updated_at'],
  ba_verification: ['id','identifier','value','expires_at','created_at','updated_at'],
  clients: ['id','name','phone','email','cnpj','address','city','state','plan','status','ativo','analyst_id','created_at','updated_at'],
  client_owners: ['id','client_id','name','email','phone','cpf','sort_order','created_at','updated_at'],
  client_documents: ['id','client_id','uploaded_by','file_name','original_name','file_type','file_size','storage_path','category','description','created_at','updated_at'],
  organizations: ['id','name','cnpj','email','phone','address','city','state','status','plan','ativo','owner_id','analyst_id','created_at','updated_at'],
  organization_analysts: ['id','organization_id','analyst_id','permissions','created_at','updated_at'],
  user_profiles: ['id','email','name','role','status','ativo','avatar','image_url','last_login','phone','plan','organization_id','client_id','created_at','updated_at'],
  farms: ['id','name','country','state','city','organization_id','client_id','total_area','pasture_area','agriculture_area','forage_production_area','agriculture_area_owned','agriculture_area_leased','other_crops','infrastructure','reserve_and_app','other_area','property_value','operation_pecuary','operation_agricultural','other_operations','agriculture_variation','property_type','weight_metric','average_herd','herd_value','commercializes_genetics','production_system','ativo','created_at','updated_at'],
  analyst_farms: ['id','analyst_id','farm_id','is_responsible','permissions','created_at'],
  people: ['id','full_name','preferred_name','phone_whatsapp','email','location_city_uf','photo_url','organization_id','user_id','cpf','rg','data_nascimento','data_contratacao','endereco','observacoes','ativo','created_by','farm_id','pode_alterar_semana_fechada','pode_apagar_semana','created_at','updated_at'],
  perfils: ['id','nome','descricao','ativo','sort_order','created_at','updated_at'],
  cargo_funcao: ['id','nome','ativo','sort_order','created_at','updated_at'],
  person_perfils: ['id','pessoa_id','perfil_id','cargo_funcao_id','created_at'],
  person_fazendas: ['id','pessoa_id','farm_id','primary_farm','created_at'],
  person_permissoes: ['id','pessoa_id','farm_id','assume_tarefas_fazenda','pode_alterar_semana_fechada','pode_apagar_semana','created_at','updated_at'],
  pessoas: ['id','nome'],
  semanas: ['id','numero','modo','aberta','data_inicio','data_fim','farm_id','created_at'],
  atividades: ['id','semana_id','titulo','descricao','pessoa_id','data_termino','tag','status','created_at'],
  historico_semanas: ['id','semana_numero','total','concluidas','pendentes','closed_at','semana_id','farm_id'],
  projects: ['id','created_by','client_id','organization_id','name','description','transformations_achievements','success_evidence','start_date','end_date','stakeholder_matrix','sort_order','percent','created_at','updated_at'],
  deliveries: ['id','created_by','project_id','client_id','organization_id','name','description','transformations_achievements','due_date','start_date','end_date','sort_order','stakeholder_matrix','created_at','updated_at'],
  initiatives: ['id','created_by','delivery_id','organization_id','farm_id','name','description','start_date','end_date','leader','internal_leader','weight','status','tags','sort_order','percent','created_at','updated_at'],
  initiative_milestones: ['id','initiative_id','title','due_date','sort_order','percent','completed','completed_at','created_at','updated_at'],
  initiative_tasks: ['id','milestone_id','title','description','completed','completed_at','due_date','sort_order','kanban_status','kanban_order','responsible_person_id','activity_date','duration_days','created_at','updated_at'],
  initiative_team: ['id','initiative_id','person_id','name','role','created_at'],
  initiative_participants: ['id','initiative_id','person_id'],
  delivery_ai_summaries: ['delivery_id','summary','source_hash','created_at','updated_at'],
  evidence: ['id','milestone_id','notes','created_at','updated_at'],
  evidence_files: ['id','evidence_id','file_name','storage_path','file_type','file_size','created_at'],
  farm_maps: ['id','farm_id','file_name','original_name','file_type','file_size','storage_path','geojson','created_at','updated_at'],
  agent_registry: ['id','version','name','description','input_schema','output_schema','default_provider','default_model','estimated_tokens_per_call','system_prompt','status','created_at','updated_at'],
  agent_training_documents: ['id','agent_id','title','content','file_type','file_url','metadata','created_at','updated_at'],
  agent_training_images: ['id','agent_id','title','image_url','description','metadata','created_at','updated_at'],
  agent_runs: ['id','org_id','user_id','agent_id','agent_version','provider','model','input_tokens','output_tokens','total_tokens','estimated_cost_usd','latency_ms','status','error_code','metadata','created_at'],
  plan_limits: ['plan_id','monthly_token_limit','monthly_cost_limit_usd','max_requests_per_minute_org','max_requests_per_minute_user','created_at','updated_at'],
  token_budgets: ['id','org_id','period','tokens_used','tokens_reserved','cost_used_usd','created_at','updated_at'],
  token_ledger: ['id','org_id','user_id','agent_run_id','action','tokens','cost_usd','metadata','created_at'],
  rate_limits: ['id','key','window_start','request_count','created_at','updated_at'],
  ai_token_usage: ['id','user_id','tokens_input','tokens_output','total_tokens','created_at'],
  cattle_scenarios: ['id','user_id','organization_id','farm_id','farm_name','name','inputs','results','created_at','updated_at'],
  saved_questionnaires: ['id','user_id','name','organization_id','farm_id','farm_name','production_system','questionnaire_id','answers','created_at','updated_at'],
  questionnaire_questions: ['id','perg_number','category','group','question','positive_answer','applicable_types','created_at','updated_at'],
  saved_feedbacks: ['id','created_by','recipient_person_id','recipient_name','recipient_email','context','feedback_type','objective','what_happened','event_date','event_moment','damages','tone','format','structure','length_preference','generated_feedback','generated_structure','tips','farm_id','created_at','updated_at'],
  emp_ass: ['id','nome','analistas','ativo','created_at','updated_at'],
  app_settings: ['key','value','updated_at','updated_by'],
};

pool.query(`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, column_name;
`).then(r => {
  const db = {};
  for (const row of r.rows) {
    if (!db[row.table_name]) db[row.table_name] = new Set();
    db[row.table_name].add(row.column_name);
  }

  const missing = {};
  const tablesMissingInDB = [];

  for (const [table, cols] of Object.entries(schema)) {
    if (!db[table]) { tablesMissingInDB.push(table); continue; }
    for (const col of cols) {
      if (!db[table].has(col)) {
        if (!missing[table]) missing[table] = [];
        missing[table].push(col);
      }
    }
  }

  console.log('=== TABELAS AUSENTES NO BANCO ===');
  if (tablesMissingInDB.length === 0) console.log('  (nenhuma)');
  tablesMissingInDB.forEach(t => console.log(' - ' + t));
  console.log('');
  console.log('=== COLUNAS AUSENTES POR TABELA ===');
  const entries = Object.entries(missing);
  if (entries.length === 0) console.log('  (nenhuma)');
  for (const [t, cols] of entries) {
    console.log(t + ':');
    cols.forEach(c => console.log('  - ' + c));
  }
  pool.end();
}).catch(e => { console.error('ERRO:', e.message); pool.end(); });
