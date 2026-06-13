/* ============================================================
   EDITOR DE CAMPOS DA FICHA
   Define quais campos aparecem em cada aba da Ficha Animal.
   Estado persistido em localStorage (inttegra-ficha-campos).
   ============================================================ */

/* Registro: abas → grupos (cards) → campos.
   req     = obrigatório, sempre ligado (não pode desativar)
   calc    = valor derivado/calculado (informativo no editor)
   section = bloco estrutural (tabela, gráfico, linha do tempo) */
const FICHA_CAMPOS = [
  { tab:'ident', label:'Identificação', grupos:[
    { titulo:'Identificação de rastreabilidade', campos:[
      { key:'id',         label:'ID interno (chave)', req:true },
      { key:'origemTipo', label:'Origem' },
      { key:'brinco',     label:'Brinco de manejo' },
      { key:'rfid',       label:'Brinco eletrônico (RFID)' },
      { key:'sisbov',     label:'Nº SISBOV' },
      { key:'ferro',      label:'Marcação a ferro' },
      { key:'nome',       label:'Nome do animal' },
    ]},
    { titulo:'Registro genealógico', campos:[
      { key:'rgn',  label:'RGN (nascimento)' },
      { key:'rgd',  label:'RGD (definitivo)' },
      { key:'grau', label:'Grau de sangue' },
    ]},
    { titulo:'Foto', campos:[
      { key:'foto', label:'Foto do animal' },
    ]},
    { titulo:'Classificação', campos:[
      { key:'sexo',      label:'Sexo / Gênero' },
      { key:'categoria', label:'Categoria animal' },
      { key:'raca',      label:'Raça' },
      { key:'status',    label:'Status do animal', calc:true },
    ]},
    { titulo:'Fisiologia', campos:[
      { key:'nascimento', label:'Data de nascimento' },
      { key:'idade',      label:'Idade', calc:true },
      { key:'pelagem',    label:'Pelagem' },
      { key:'chifre',     label:'Tipo de chifre' },
    ]},
  ]},
  { tab:'geneal', label:'Genealogia', grupos:[
    { titulo:'Filiação', campos:[
      { key:'pai', label:'Pai' },
      { key:'mae', label:'Mãe (matriz)' },
    ]},
    { titulo:'Concepção & parto', campos:[
      { key:'concepcao', label:'Tipo de concepção' },
      { key:'parto',     label:'Condições do parto' },
    ]},
  ]},
  { tab:'progenie', label:'Progênies', grupos:[
    { titulo:'Blocos da aba', campos:[
      { key:'iep',        label:'Intervalo entre partos (IEP)', section:true },
      { key:'progTabela', label:'Tabela de progênies',          section:true },
    ]},
  ]},
  { tab:'origem', label:'Origem & local', grupos:[
    { titulo:'Entrada', campos:[
      { key:'entrada',     label:'Tipo de entrada' },
      { key:'dataEntrada', label:'Data de entrada' },
      { key:'origem',      label:'Produtor / fazenda de origem' },
    ]},
    { titulo:'Localização atual', campos:[
      { key:'proprietario', label:'Proprietário' },
      { key:'fazenda',      label:'Fazenda' },
      { key:'lote',         label:'Lote / grupo de manejo', calc:true },
    ]},
  ]},
  { tab:'biometria', label:'Biometria & saúde', grupos:[
    { titulo:'Pesos & marcos', campos:[
      { key:'pesoNascer',      label:'Peso ao nascer (P.N.)' },
      { key:'primeiraPesagem', label:'1ª pesagem', calc:true },
      { key:'desmama',         label:'Data de desmama' },
      { key:'pesoAtual',       label:'Peso atual', calc:true },
      { key:'gmd',             label:'GMD', calc:true },
    ]},
    { titulo:'Testes clínicos & saúde', campos:[
      { key:'ppt',         label:'Proteína Plasmática Total (PPT)' },
      { key:'hematocrito', label:'Hematócrito' },
    ]},
    { titulo:'Blocos da aba', campos:[
      { key:'curva', label:'Curva de peso', section:true },
    ]},
  ]},
  { tab:'hist', label:'Histórico', grupos:[
    { titulo:'Blocos da aba', campos:[
      { key:'timeline', label:'Linha do tempo de movimentos', section:true },
    ]},
  ]},
];

/* índice key → def, para consulta rápida */
const FICHA_CAMPO_DEF = (()=>{ const m={}; FICHA_CAMPOS.forEach(t=>t.grupos.forEach(g=>g.campos.forEach(c=>{ m[c.key]={...c, tab:t.tab}; }))); return m; })();
function fichaCamposTab(tab){ const t = FICHA_CAMPOS.find(x=>x.tab===tab); return t? t.grupos.flatMap(g=>g.campos):[]; }

/* ===== estado ===== */
let FIELD_CFG = {};
try { FIELD_CFG = JSON.parse(localStorage.getItem('inttegra-ficha-campos')||'{}') || {}; } catch(e){ FIELD_CFG = {}; }
function saveFieldCfg(){ try{ localStorage.setItem('inttegra-ficha-campos', JSON.stringify(FIELD_CFG)); }catch(e){} }

/* um campo está ligado? (default = ligado; obrigatórios sempre ligados) */
function fieldOn(key){
  const def = FICHA_CAMPO_DEF[key];
  if(def && def.req) return true;
  return FIELD_CFG[key] !== false;
}
function fieldSet(key, on){
  const def = FICHA_CAMPO_DEF[key];
  if(def && def.req) return;            // obrigatório não muda
  if(on) delete FIELD_CFG[key]; else FIELD_CFG[key] = false;
  saveFieldCfg();
}

/* helpers de render usados pelas views da ficha */
function fRow(key, k, v){ return fieldOn(key) ? kvRow(k, v) : ''; }
function fSec(key){ return fieldOn(key); }
/* card que se oculta sozinho quando não sobra nenhuma linha */
function fichaCardF(titulo, rows){ return (rows && rows.trim()) ? fichaCard(titulo, rows) : ''; }
/* nº de campos ligados / total numa aba (exclui derivados da contagem? não — conta todos) */
function fichaTabCount(tab){
  const cs = fichaCamposTab(tab);
  return { on: cs.filter(c=>fieldOn(c.key)).length, total: cs.length };
}

/* ============================================================
   EDITOR (modal)
   ============================================================ */
let FC_TAB = 'ident';
let FC_BACK = null;   // callback ao concluir (reabre a ficha)

function openFichaCampos(back){
  FC_TAB = 'ident';
  FC_BACK = back || null;
  openModal({
    title:'Configurar campos da ficha',
    sub:'Ative ou desative os campos exibidos em cada aba da Ficha Animal. Vale para a visualização e para o formulário de nova ficha. O ID interno é obrigatório.',
    body:`<div class="ficha-modal fc-editor">
      <div class="tabs ficha-tabs" id="fc-tabwrap">${fcTabsHtml()}</div>
      <div id="fc-body">${fcBody()}</div>
    </div>`,
    foot:`<button class="btn ghost" onclick="fcReset()">${icon('historico')} Restaurar padrão</button><div class="spacer"></div><button class="btn primary" onclick="fcConcluir()">${icon('check')} Concluir</button>`,
  });
}
function fcTabsHtml(){
  return FICHA_CAMPOS.map(t=>{
    const c = fichaTabCount(t.tab);
    const dim = c.on < c.total;
    return `<button class="tab ${t.tab===FC_TAB?'active':''}" onclick="fcSetTab('${t.tab}')">${t.label}
      <span class="fc-tabpill ${dim?'dim':''}">${c.on}/${c.total}</span></button>`;
  }).join('');
}
function fcSetTab(t){ FC_TAB=t; document.getElementById('fc-tabwrap').innerHTML=fcTabsHtml(); document.getElementById('fc-body').innerHTML=fcBody(); }

function fcBody(){
  const t = FICHA_CAMPOS.find(x=>x.tab===FC_TAB);
  const c = fichaTabCount(FC_TAB);
  const toolbar = `<div class="fc-toolbar">
    <div class="fc-count"><b>${c.on}</b> de ${c.total} campos ativos nesta aba</div>
    <div class="fc-bulk">
      <button onclick="fcBulk(true)">Ativar todos</button>
      <button onclick="fcBulk(false)">Desativar todos</button>
    </div>
  </div>`;
  const grupos = t.grupos.map(g=>{
    const rows = g.campos.map(c=>fcRow(c)).join('');
    return `<div class="fc-group"><div class="fc-group-h">${g.titulo}</div><div class="fc-rows">${rows}</div></div>`;
  }).join('');
  return toolbar + grupos;
}
function fcRow(c){
  const on = fieldOn(c.key);
  const tag = c.req ? `<span class="fc-tag req">obrigatório</span>`
    : c.calc ? `<span class="fc-tag calc">calculado</span>`
    : c.section ? `<span class="fc-tag sec">bloco</span>` : '';
  const dis = c.req ? 'disabled' : '';
  const onch = c.req ? '' : `onchange="fcToggle('${c.key}', this.checked)"`;
  return `<label class="fc-row ${on?'':'off'}">
    <span class="fc-label">${c.label}</span>
    ${tag}
    <span class="fc-spacer"></span>
    <span class="fc-sw"><input type="checkbox" ${on?'checked':''} ${dis} ${onch}><span class="fc-track"></span></span>
  </label>`;
}
function fcToggle(key, on){
  fieldSet(key, on);
  document.getElementById('fc-body').innerHTML = fcBody();
  document.getElementById('fc-tabwrap').innerHTML = fcTabsHtml();
}
function fcBulk(on){
  fichaCamposTab(FC_TAB).forEach(c=>{ if(!c.req) fieldSet(c.key, on); });
  document.getElementById('fc-body').innerHTML = fcBody();
  document.getElementById('fc-tabwrap').innerHTML = fcTabsHtml();
}
function fcReset(){
  FIELD_CFG = {}; saveFieldCfg();
  document.getElementById('fc-body').innerHTML = fcBody();
  document.getElementById('fc-tabwrap').innerHTML = fcTabsHtml();
  toast({title:'Campos restaurados', msg:'Todos os campos voltaram a ficar visíveis.'});
}
function fcConcluir(){
  const back = FC_BACK; FC_BACK = null;
  closeModal();
  if(typeof back === 'function') back();
}
