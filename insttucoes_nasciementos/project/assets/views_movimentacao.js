/* ===== Lançamentos de movimento (entradas/saídas) ===== */
const MOV_META = {
  nascimento:{ titulo:'Nascimento', verbo:'entrada', sub:'Bezerros nascidos. Soma ao estoque da categoria. Identificação individual pode vir depois.', icon:'nascimento', loteLabel:'Lote de destino', dirField:'loteDestino', identMode:'brinco' },
  compra:    { titulo:'Compra',     verbo:'entrada', sub:'Animais comprados. Soma ao estoque. Lançamento rápido primeiro; brincos depois.', icon:'compra', loteLabel:'Lote de destino', dirField:'loteDestino', extra:'origem' },
  venda:     { titulo:'Venda',      verbo:'saida',   sub:'Baixa o estoque. Conclui mesmo sem todos os brincos — o que faltar vira pendência na Mesa.', icon:'venda', loteLabel:'Lote de origem', dirField:'loteOrigem', extra:'destino' },
  morte:     { titulo:'Morte',      verbo:'saida',   sub:'Baixa o estoque. Conclui mesmo sem identificação. Bloqueia apenas se a baixa exceder o saldo.', icon:'morte', loteLabel:'Lote de origem', dirField:'loteOrigem', extra:'causa' },
};

function viewMovimento(tipo){
  if(tipo==='nascimento') return viewNascimento();
  const M = MOV_META[tipo];
  const recent = DB.movimentos.filter(m=>m.tipo===tipo).sort((a,b)=>b.data.localeCompare(a.data));
  const loteOpts = DB.lotes.map(l=>`<option value="${l.id}">${l.codigo} · ${l.nome}</option>`).join('');
  const catOpts = DB.categorias.map(c=>`<option value="${c.id}">${c.nome} (saldo ${saldoCategoria(c.id)})</option>`).join('');
  const extraField = M.extra==='origem' ? `<div class="field full"><label>Origem <span class="opt">(fornecedor)</span></label><input id="mv-extra" placeholder="Fazenda / vendedor"></div>`
    : M.extra==='destino' ? `<div class="field full"><label>Destino <span class="opt">(comprador)</span></label><input id="mv-extra" placeholder="Frigorífico / leilão"></div>`
    : M.extra==='causa' ? `<div class="field full"><label>Causa</label><select id="mv-extra"><option>Sanitária</option><option>Acidente</option><option>Predador</option><option>Não definida</option></select></div>` : '';
  const identField = M.identMode==='brinco'
    ? `<div class="field full"><label>Brinco do bezerro <span class="opt">(opcional)</span></label><input id="mv-brinco" placeholder="ID, brinco ou RFID do bezerro" oninput="updMovPreview('${tipo}')"><div class="hint">Deixe vazio se o bezerro ainda não foi identificado — ele recebe um ID interno automático e pode ser brincado depois.</div></div>`
    : `<div class="field"><label>Identificados agora <span class="opt">(opcional)</span></label><input id="mv-ident" type="number" min="0" value="0" oninput="updMovPreview('${tipo}')"><div class="hint">Quantos animais já têm brinco vinculado.</div></div>`;

  return pageHead({
    title:`Lançar ${M.titulo}`,
    layer:'estoque',
    sub:M.sub,
  }) + `
  <div class="quick-launch">
    <div class="panel" style="margin-bottom:0">
      <div class="panel-head"><h3>Lançamento rápido</h3><span class="layer ${M.verbo==='entrada'?'estoque':'estoque'}" style="margin-left:auto"><span class="dot"></span>${M.verbo==='entrada'?'Entrada':'Saída'} de estoque</span></div>
      ${panelNote('Poucos campos para mover o estoque agora. A identificação individual é <b>opcional</b> e pode ser completada depois — o que faltar vai para a Mesa.')}
      <div style="padding:18px">
        <div class="form-grid">
          <div class="field"><label>Data</label><input id="mv-data" type="date" value="${hojeISO()}"></div>
          <div class="field"><label>Responsável</label><input id="mv-resp" value="Antonio Chaker"></div>
          <div class="field"><label>Categoria</label><select id="mv-cat" onchange="updMovPreview('${tipo}')">${catOpts}</select></div>
          <div class="field"><label>Quantidade <span class="opt">(cabeças)</span></label><input id="mv-qtd" type="number" min="1" value="1" oninput="updMovPreview('${tipo}')"></div>
          <div class="field"><label>${M.loteLabel}</label><select id="mv-lote">${loteOpts}</select></div>
          ${identField}
          ${extraField}
        </div>
        <div class="form-foot" style="margin-top:18px">
          <button class="btn outline" onclick="render()" title="Limpar para um novo lançamento">${icon('plus')} Novo</button>
          <button class="btn primary" onclick="salvarMovimento('${tipo}')">${icon('save')} Salvar</button>
          <span class="spacer"></span>
          <span class="sub-cell" id="mv-block"></span>
        </div>
      </div>
    </div>
    <div class="aside-card">
      <h4>Prévia da conciliação</h4>
      <p class="small">Atualiza ao preencher. O estoque move sempre; a camada individual mostra o que ficará pendente.</p>
      <div id="mv-preview" style="margin-top:8px"></div>
    </div>
  </div>

  <div class="panel" style="margin-top:22px">
    <div class="panel-head"><h3>Lançamentos recentes — ${M.titulo}</h3></div>
    <table class="tbl">
      <thead><tr><th>Data</th><th>Categoria</th><th>Qtd</th><th>${M.verbo==='entrada'?'Destino':'Origem'}</th><th>Identificação</th><th>Status</th></tr></thead>
      <tbody>${recent.length?recent.map(m=>movRow(m,M)).join(''):`<tr><td colspan="6" class="empty">${icon(M.icon)}<div>Nenhum lançamento ainda.</div></td></tr>`}</tbody>
    </table>
  </div>`;
}
/* ===== NASCIMENTO — campos na ordem do formulário legado ===== */
let NASC_PANEL = 'recent';   // 'recent' | 'atribuir'
let NASC_TARGET = null;       // id do lançamento de nascimento sendo individualizado
let ATRIB_SHARED = { data:null, raca:null, lote:null }; // parâmetros que repetem em todos os lançamentos
let NASC_CATS = [];           // categorias declaradas manualmente: {catId, catNome, qtd}
let NASC_FROMID = false;      // distribuição vem do detalhamento de ID
let NASC_DETALHE = [];        // animais identificados inline (modo "vem do ID"): {apelido,catId,raca,peso}
let NASC_SHARED = { data:null, raca:null, lote:null }; // parâmetros que repetem no detalhamento inline
let DADOS_OPEN = false;       // seção "Dados Adicionais" recolhível

/* ===== Registro de campos do Lançamento Rápido (configurável pelo lápis) ===== */
const LR_RACAS = ['Nelore','Anelorado','Brangus','Angus','Senepol','Cruzado'];
const LR_GRAUS = ['PO','PC','1/2 sangue','3/4 sangue','5/8 sangue','Cruzado'];
const LR_PELAGENS = ['Branca','Vermelha','Preta','Baia','Castanha','Malhada'];
const LR_CHIFRES = ['Aspado','Mocho','Mocho genético','Descornado'];

// place: 'top' (repete) | 'bottom' (lançamento) | 'dados'
const LR_REGISTRY = [
  { id:'apelido',   el:'di-apelido',label:'Apelido/ID',        req:true, type:'text',   ph:'504A', w:'1 1 100px', def:'bottom', locked:true },
  { id:'categoria', el:'di-cat',    label:'Categoria',         req:true, type:'cat',    w:'1 1 110px', def:'bottom' },
  { id:'data',      el:'di-data',   label:'Data',              req:true, type:'date',   w:'0 0 150px', def:'top' },
  { id:'raca',      el:'di-rraca',  label:'Raça',              req:true, type:'select', opts:LR_RACAS, w:'1 1 130px', def:'top' },
  { id:'lote',      el:'di-lote',   label:'Lote',                        type:'lote',   w:'1 1 160px', def:'top' },
  { id:'rfid',      el:'di-rfid',   label:'ID Eletrônica',               type:'text',   ph:'RFID', w:'1 1 100px', def:'bottom' },
  { id:'sisbov',    el:'di-sisbov', label:'Nº SISBOV',                   type:'text',   ph:'SISBOV', w:'1 1 90px', def:'bottom' },
  { id:'sexo',      el:'di-sexo',   label:'Sexo',              req:true, type:'sexo',   w:'0 0 78px', def:'bottom' },
  { id:'porte',     el:'di-tam',    label:'Porte',             req:true, type:'select', opts:['P','M','G'], w:'0 0 78px', def:'bottom' },
  { id:'colostro',  el:'di-col',    label:'Colostro?',                   type:'select', opts:['Sim','Não'], w:'0 0 90px', def:'bottom' },
  { id:'peso',      el:'di-peso',   label:'Peso nasc.',                  type:'weight', w:'0 0 80px', def:'bottom' },
  { id:'pesagem',   el:'di-pes',    label:'Pesagem',                     type:'select', opts:['Manual','Balança'], w:'0 0 100px', def:'bottom' },
  { id:'sanitario', el:'__san',     label:'Sanitário',                   type:'sanitario', w:'0 0 auto', def:'top', enableOnly:true },
  { id:'nome',      el:'da-nome',   label:'Nome Completo',               type:'text',   ph:'Nome Completo', w:'1 1 200px', def:'dados' },
  { id:'pesoNascer',el:'da-peso',   label:'Peso ao Nascer',              type:'weight', w:'0 0 120px', def:'dados' },
  { id:'grau',      el:'da-grau',   label:'Grau de Sangue',              type:'select', opts:LR_GRAUS, placeholder:'Grau de Sangue', w:'1 1 150px', def:'dados' },
  { id:'rgn',       el:'da-rgn',    label:'RGN/Tatuagem',                type:'text',   ph:'RGN/Tatuagem', w:'1 1 150px', def:'dados' },
  { id:'pelagem',   el:'da-pelagem',label:'Pelagem',                     type:'select', opts:LR_PELAGENS, placeholder:'Pelagem', w:'1 1 150px', def:'dados' },
  { id:'chifre',    el:'da-chifre', label:'Tipo de Chifre',              type:'select', opts:LR_CHIFRES, placeholder:'Tipo de Chifre', w:'1 1 150px', def:'dados' },
  { id:'rgd',       el:'da-rgd',    label:'RGD',                         type:'text',   ph:'RGD', w:'1 1 150px', def:'dados' },
  { id:'serie',     el:'da-serie',  label:'Série Alfa',                  type:'text',   ph:'Série Alfa', w:'1 1 150px', def:'dados' },
  { id:'pai',       el:'da-pai',    label:'Pai - ID Usual',              type:'pai',    w:'1 1 150px', def:'dados' },
  { id:'mae',       el:'da-mae',    label:'Mãe - ID Usual',              type:'mae',    w:'1 1 150px', def:'dados' },
  { id:'obs',       el:'da-obs',    label:'Observação',                  type:'textarea', ph:'Observação', w:'1 1 100%', def:'dados' },
];
let LR_PLACE = {}; LR_REGISTRY.forEach(f=>LR_PLACE[f.id]=f.def);
let LR_AUTONUM = false;        // numeração automática do Apelido/ID
let SAN_ENABLED = true;        // Sanitário ativado/desativado (fica fixo na linha superior)
function lrFieldsBy(place){ return LR_REGISTRY.filter(f=>LR_PLACE[f.id]===place); }

/* próximo Apelido/ID com base no último adicionado (preserva prefixo/sufixo e zeros) */
function proximoApelido(prev){
  if(!prev) return '';
  const m = String(prev).match(/^(.*?)(\d+)(\D*)$/);
  if(!m) return prev;
  const [,pre,num,suf] = m;
  const inc = (parseInt(num,10)+1).toString().padStart(num.length,'0');
  return pre+inc+suf;
}

function lrDefaultVal(f){
  if(f.id==='data') return NASC_SHARED.data || hojeISO();
  if(f.id==='raca') return NASC_SHARED.raca || 'Nelore';
  if(f.id==='porte') return 'M';
  if(f.id==='colostro') return 'Sim';
  if(f.id==='pesagem') return 'Manual';
  return '';
}
function lrControl(f){
  const v = lrDefaultVal(f);
  switch(f.type){
    case 'date': return `<input id="${f.el}" type="date" value="${v}">`;
    case 'text': return `<input id="${f.el}" placeholder="${f.ph||''}">`;
    case 'textarea': return `<textarea id="${f.el}" rows="2" placeholder="${f.ph||''}"></textarea>`;
    case 'weight': return `<div class="weight-box" style="min-width:auto;padding:6px 8px"><input id="${f.el}" type="text" inputmode="decimal" placeholder="0,0" style="font-size:13px"><span class="unit" style="font-size:11px">Kg</span></div>`;
    case 'sexo': return `<select id="${f.el}"><option value="Macho">♂ M</option><option value="Fêmea">♀ F</option></select>`;
    case 'cat': return `<select id="${f.el}">${DB.categorias.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select>`;
    case 'lote': return `<select id="${f.el}"><option value="">—</option>${DB.lotes.map(l=>`<option value="${l.id}" ${l.id===(NASC_SHARED.lote||'')?'selected':''}>${l.codigo} · ${l.nome}</option>`).join('')}</select>`;
    case 'pai': return `<select id="${f.el}"><option value="">Selecione Pai</option>${DB.animais.filter(a=>a.sexo==='Macho').map(a=>`<option value="${a.id}">${a.brinco||a.id}</option>`).join('')}</select>`;
    case 'mae': return `<select id="${f.el}"><option value="">Selecione Mãe</option>${DB.animais.filter(a=>a.sexo==='Fêmea').map(a=>`<option value="${a.id}">${a.brinco||a.id}</option>`).join('')}</select>`;
    case 'select': {
      const opts = typeof f.opts==='function'?f.opts():f.opts;
      const ph = f.placeholder?`<option value="">${f.placeholder}</option>`:'';
      return `<select id="${f.el}">${ph}${opts.map(o=>`<option ${o===v?'selected':''}>${o}</option>`).join('')}</select>`;
    }
  }
  return '';
}
function renderLrField(f, inGrid){
  const lbl = `<label>${f.label}${f.req?' <span class="req">*</span>':''}</label>`;
  if(inGrid){
    const cls = f.type==='textarea' ? 'field full3' : (f.type==='text'&&f.id==='nome' ? 'field full2' : 'field');
    return `<div class="${cls}">${lbl}${lrControl(f)}</div>`;
  }
  return `<div class="field" style="flex:${f.w||'1 1 110px'};min-width:0">${lbl}${lrControl(f)}</div>`;
}

function toggleDadosAdd(){
  DADOS_OPEN = !DADOS_OPEN;
  rerenderInline();
}
function dadosAdicionaisFields(){
  const fields = lrFieldsBy('dados');
  if(!fields.length) return `<div class="da-body"><div class="small" style="color:var(--muted)">Todos os campos foram movidos para o lançamento rápido.</div></div>`;
  return `<div class="da-body"><div class="da-grid">${fields.map(f=>renderLrField(f,true)).join('')}</div></div>`;
}

/* ===== Modal de configuração de campos (lápis) — modelo em tabela ===== */
const LR_TYPEBADGE = {date:'DATE', select:'SELECT', text:'TEXT', weight:'KG', sexo:'SELECT', cat:'SELECT', lote:'TEXT', pai:'SELECT', mae:'SELECT', textarea:'TEXT', sanitario:'AÇÃO'};
function camposConfigTable(){
  const curPlace = f => f.id==='sanitario' ? (LR_PLACE.sanitario||'top') : LR_PLACE[f.id];
  const pill = (f, val, label, cls, allowed) => {
    if(!allowed) return `<td></td>`;
    const on = curPlace(f)===val;
    return `<td><button class="cfg-pill ${cls} ${on?'on':''}" onclick="setCampoPlace('${f.id}','${val}')">${label}</button></td>`;
  };
  const rows = LR_REGISTRY.map(f=>{
    // Apelido/ID travado na Tabela; Sanitário só Superior ou Desativado
    const isApelido = f.locked;
    const isSan = f.enableOnly;
    const allowTop    = isApelido ? false : true;
    const allowBottom = isSan ? false : true;
    const allowDados  = (isApelido||isSan) ? false : true;
    const allowOff    = true;
    const autonumChip = isApelido ? `<label class="cfg-autonum-chip" title="Numeração automática: ao Adicionar sugere o próximo número (001 → 002)"><input type="checkbox" id="cfg-autonum" ${LR_AUTONUM?'checked':''} onchange="LR_AUTONUM=this.checked">Nº auto</label>` : '';
    return `<tr>
      <td class="cfg-fname">${f.label}${f.req?' <span class="req">*</span>':''}${autonumChip}</td>
      ${pill(f,'top','Superior','superior',allowTop)}
      ${pill(f,'bottom','Tabela','tabela',allowBottom)}
      ${pill(f,'dados','Adicionais','adicionais',allowDados)}
      ${pill(f,'off','Desativar','off',allowOff)}
    </tr>`;
  }).join('');
  return `<table class="cfg-table">
    <thead><tr>
      <th>Nome do campo do sistema</th>
      <th class="c-sup">Linha Superior</th>
      <th class="c-tab">Linha Tabela Lançamento</th>
      <th class="c-add">Dados Adicionais</th>
      <th class="c-off">Desativado</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
function openCamposConfig(){
  openModal({
    title:'Configurar campos do Lançamento Rápido',
    sub:'Defina onde cada campo aparece: Linha Superior (repete em todos), Linha Tabela Lançamento (por animal), Dados Adicionais (recolhido) ou Desativado (não aparece).',
    body:`<div id="cfg-table-wrap">${camposConfigTable()}</div>`,
    foot:`<button class="btn ghost" onclick="resetCamposConfig()">Restaurar padrão</button><div class="spacer"></div><button class="btn primary" data-close>${icon('check')} Concluir</button>`,
  });
}
function setCampoPlace(id, val){
  if(id==='sanitario'){ LR_PLACE.sanitario = (val==='top'||val==='off') ? val : 'top'; SAN_ENABLED = LR_PLACE.sanitario==='top'; }
  else if(id==='apelido'){ if(val==='off') LR_PLACE.apelido='off'; else LR_PLACE.apelido='bottom'; }
  else { LR_PLACE[id] = val; }
  // re-render tabela do modal e o formulário
  const w=document.getElementById('cfg-table-wrap'); if(w) w.innerHTML=camposConfigTable();
  const el=document.getElementById('nasc-dist'); if(el) el.innerHTML=renderNascDist();
  updNascResumo(); updSalvarState();
}
function resetCamposConfig(){
  LR_REGISTRY.forEach(f=>LR_PLACE[f.id]=f.def);
  LR_AUTONUM=false; SAN_ENABLED=true;
  const w=document.getElementById('cfg-table-wrap'); if(w) w.innerHTML=camposConfigTable();
  const el=document.getElementById('nasc-dist'); if(el) el.innerHTML=renderNascDist();
  updNascResumo(); updSalvarState();
}


/* bloco de distribuição (quantidade + toggle + categoria/grid ou detalhamento inline) */
function renderNascDist(){
  const qtdVal = (typeof window!=='undefined' && document.getElementById('mv-qtd-total'))?document.getElementById('mv-qtd-total').value:'';
  const catField = NASC_FROMID
    ? `<div class="field" style="min-width:220px;flex:1"><label>Categoria</label><input disabled value="" placeholder="Vem do detalhamento de ID"></div>`
    : lookupField({key:'mv-catlk', label:'Categoria', src:'categorias', refId:'mv-cat', cls:'', defCod:'', defNome:'', noCod:true});
  return `
    <div class="nf-row" style="align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="flex:0 0 150px;max-width:150px"><label>Quantidade <span class="req">*</span> <span class="opt">(cab.)</span></label><input id="mv-qtd-total" type="number" min="1" placeholder="Ex.: 18" value="${qtdVal}" oninput="updNascResumo();updSalvarState()"></div>
      <button class="toggle-btn icon-only ${NASC_FROMID?'on':''}" onclick="toggleFromId()" title="Distribuição vem do ID">
        ${icon('brinco')}
      </button>
      <div style="flex:1;min-width:180px;${NASC_FROMID?'opacity:.55;pointer-events:none':''}">${catField}</div>
      <button class="btn outline" style="height:40px" onclick="addNascCat()" ${NASC_FROMID?'disabled':''} title="Adicionar esta categoria à lista">${icon('plus')} mais</button>
    </div>
    <div class="nasc-resumo" id="nasc-resumo"></div>
    <div id="nasc-cats">${renderNascCats()}</div>
    ${NASC_FROMID?inlineDetalheForm():''}
  `;
}

function toggleFromId(){
  // preserva a quantidade digitada
  const q = document.getElementById('mv-qtd-total')?.value || '';
  NASC_FROMID = !NASC_FROMID;
  NASC_CATS = []; NASC_DETALHE = []; NASC_SHARED = { data:null, raca:null, lote:null }; DADOS_OPEN = false;
  const el = document.getElementById('nasc-dist');
  if(el){ el.innerHTML = renderNascDist(); }
  const panel = el?.closest('.panel'); if(panel) panel.style.maxWidth = NASC_FROMID?'100%':'760px';
  const qEl = document.getElementById('mv-qtd-total'); if(qEl) qEl.value = q;
  updNascResumo(); updSalvarState();
}

function inlineDetalheForm(){
  const topFields = lrFieldsBy('top').filter(f=>f.id!=='sanitario');
  const bottomFields = lrFieldsBy('bottom').filter(f=>f.id!=='sanitario');
  const sanBtn = SAN_ENABLED ? `<button class="toggle-btn ${SAN_OPEN?'on':''}" onclick="toggleSanitario()" style="height:40px;margin-left:auto">
        <span class="san-chev ${SAN_OPEN?'open':''}" style="display:inline-grid">${icon('chevDown')}</span><span>Sanitário</span>${SAN_ITEMS.length?` <span class="tag blue">${SAN_ITEMS.length}</span>`:''}
      </button>` : '';
  const sanBody = (SAN_ENABLED && SAN_OPEN) ? `<div class="san-body" id="san-block" style="padding-top:2px">${sanitarioBodyInner()}</div>` : '';
  return `<div class="nasc-inline">
    <div class="li-head">
      <button class="li-edit" onclick="openCamposConfig()" title="Configurar campos">${icon('edit')}</button>
      Lançamento Rápido <span class="opt">— a linha de cima repete em todos; a de baixo lança em modo rápido</span>
    </div>
    <div class="inline-top">
      ${topFields.map(f=>renderLrField(f,false)).join('')}
      ${sanBtn}
    </div>
    ${sanBody}
    <div class="li-divider"></div>
    <div class="inline-entry">
      ${bottomFields.map(f=>renderLrField(f,false)).join('')}
      <button class="btn primary" onclick="addNascDetalhe()" style="height:38px">${icon('plus')} Adicionar</button>
    </div>
    <div class="dados-add">
      <button class="dados-toggle ${DADOS_OPEN?'on':''}" onclick="toggleDadosAdd()">
        <span class="da-chev ${DADOS_OPEN?'open':''}">${icon('chevDown')}</span>
        <span>Dados Adicionais</span>
      </button>
      ${DADOS_OPEN?dadosAdicionaisFields():''}
    </div>
    <table class="tbl compact-tbl" style="margin-top:4px">
      <thead><tr><th>Apelido / ID</th><th>ID Eletrônica</th><th>SISBOV</th><th>Sexo</th><th>Categoria</th><th>Porte</th><th>Colostro</th><th>Peso</th><th>Ações</th></tr></thead>
      <tbody>${NASC_DETALHE.length?NASC_DETALHE.map((d,i)=>`<tr>
        <td class="strong">${d.apelido}</td>
        <td class="mono sub-cell">${d.rfid||'—'}</td>
        <td class="mono sub-cell">${d.sisbov||'—'}</td>
        <td>${d.sexo||'—'}</td>
        <td>${nomeCategoria(d.catId)}</td>
        <td>${d.tam||'—'}</td>
        <td>${d.colostro||'—'}</td>
        <td class="num">${d.peso>0?d.peso+' kg':'—'}</td>
        <td class="row-actions"><button class="icon-btn danger-ic" title="Remover" onclick="removeNascDetalhe(${i})">${icon('trash')}</button></td>
      </tr>`).join(''):`<tr><td colspan="9" class="empty" style="padding:20px">${icon('ficha')}<div>Nenhum animal identificado ainda.</div></td></tr>`}</tbody>
    </table>
  </div>`;
}
function addNascDetalhe(){
  const total = +(document.getElementById('mv-qtd-total')?.value)||0;
  const apelido = (document.getElementById('di-apelido')?.value||'').trim();
  const rfid = (document.getElementById('di-rfid')?.value||'').trim();
  const sisbov = (document.getElementById('di-sisbov')?.value||'').trim();
  const catId = document.getElementById('di-cat')?.value||'';
  const sexo = document.getElementById('di-sexo')?.value||'Macho';
  const tam = document.getElementById('di-tam')?.value||'M';
  const colostro = document.getElementById('di-col')?.value||'Sim';
  const pesagem = document.getElementById('di-pes')?.value||'Manual';
  const raca = document.getElementById('di-rraca')?.value||'Nelore';
  const data = document.getElementById('di-data')?.value||hojeISO();
  const lote = document.getElementById('di-lote')?.value||'';
  const peso = parseFloat((document.getElementById('di-peso')?.value||'').replace(',','.'))||0;
  if(total<1){ toast({title:'Informe a quantidade primeiro',kind:'crit'}); return; }
  if(!apelido){ toast({title:'Informe o Apelido/ID',kind:'crit'}); return; }
  if(NASC_DETALHE.length>=total){ toast({title:'Limite atingido',msg:`Você já identificou ${total} de ${total}. Remova um item ou aumente a quantidade.`,kind:'warn'}); return; }
  // parâmetros que se repetem
  NASC_SHARED = { data, raca, lote };
  const gv = id => document.getElementById(id)?.value || '';
  const dados = {
    nome:gv('da-nome'), grau:gv('da-grau'), rgn:gv('da-rgn'), pelagem:gv('da-pelagem'),
    chifre:gv('da-chifre'), rgd:gv('da-rgd'), serie:gv('da-serie'), pai:gv('da-pai'),
    mae:gv('da-mae'), obs:gv('da-obs'), pesoNascer:gv('da-peso'),
  };
  NASC_DETALHE.push({apelido, rfid:rfid||null, sisbov:sisbov||null, catId, sexo, tam, colostro, pesagem, raca, peso, data, lote, dados});
  const nextAp = LR_AUTONUM ? proximoApelido(apelido) : '';
  document.getElementById('nasc-dist').innerHTML = renderNascDist();
  if(LR_AUTONUM && nextAp){ const ae=document.getElementById('di-apelido'); if(ae){ ae.value=nextAp; ae.focus(); } }
  updNascResumo(); updSalvarState();
}
function removeNascDetalhe(i){
  NASC_DETALHE.splice(i,1);
  document.getElementById('nasc-dist').innerHTML = renderNascDist();
  updNascResumo(); updSalvarState();
}

function novoNascimento(){ NASC_CATS=[]; NASC_DETALHE=[]; NASC_FROMID=false; render(); }

function updSalvarState(){
  const btn = document.getElementById('mv-salvar'); if(!btn) return;
  const blk = document.getElementById('mv-block');
  const total = +(document.getElementById('mv-qtd-total')?.value)||0;
  if(NASC_FROMID){
    const done = NASC_DETALHE.length;
    const ok = total>0 && done===total;
    btn.disabled = !ok;
    btn.style.opacity = ok?'1':'.5';
    btn.style.cursor = ok?'pointer':'not-allowed';
    if(blk) blk.innerHTML = ok
      ? `<span style="color:var(--ok)">${icon('check')} ${done} de ${total} identificados</span>`
      : `<span>Identifique ${total||'os'} animais para salvar (${done}/${total||0})</span>`;
  } else {
    btn.disabled = false; btn.style.opacity='1'; btn.style.cursor='pointer';
    if(blk) blk.innerHTML='';
  }
}

/* ===== Sanitário (dentro da Atribuição de ID) ===== */
let SAN_OPEN = false;
let SAN_APLIC = 'unica';       // 'unica' | 'protocolo'
let SAN_ITEMS = [];            // {medId, nome, tipoDose, dose, porKg, unidade, custo}

function toggleSanitario(){ SAN_OPEN=!SAN_OPEN; refreshSanitario(); }
function setSanAplic(v){ SAN_APLIC=v; refreshSanitario(); }
function refreshSanitario(){
  // contexto inline (modo "vem do ID" no formulário de lançamento)
  if(NASC_FROMID && document.getElementById('nasc-dist') && document.getElementById('di-cat')){
    rerenderInline(); return;
  }
  const el=document.getElementById('san-block'); if(el) el.outerHTML=sanitarioSection();
}
function rerenderInline(){
  const keep={};
  ['mv-qtd-total','di-apelido','di-rfid','di-sisbov','di-peso','di-data',
   'da-nome','da-peso','da-rgn','da-rgd','da-serie','da-obs','da-grau','da-pelagem','da-chifre','da-pai','da-mae'].forEach(id=>{const e=document.getElementById(id); if(e) keep[id]=e.value;});
  const catv=document.getElementById('di-cat')?.value, rracav=document.getElementById('di-rraca')?.value, lotev=document.getElementById('di-lote')?.value;
  document.getElementById('nasc-dist').innerHTML = renderNascDist();
  Object.keys(keep).forEach(id=>{const e=document.getElementById(id); if(e) e.value=keep[id];});
  const cat=document.getElementById('di-cat'); if(cat&&catv) cat.value=catv;
  const rr=document.getElementById('di-rraca'); if(rr&&rracav) rr.value=rracav;
  const lo=document.getElementById('di-lote'); if(lo&&lotev) lo.value=lotev;
  updNascResumo(); updSalvarState();
}

function sanitarioBodyInner(){
  const medOpts = `<option value="">Selecione um item</option>`+DB.medicamentos.map(m=>`<option value="${m.id}">${m.nome}</option>`).join('');
  const prOpts = `<option value="">Selecione um item</option>`+DB.protocolos.map(p=>`<option value="${p.id}">${p.nome}</option>`).join('');
  const totalCusto = SAN_ITEMS.reduce((a,i)=>a+i.custo,0);
  return `
      <div class="field" style="max-width:380px"><label>Tipo de Aplicação</label>
        <div class="radio-row">
          <label class="radio-opt"><input type="radio" name="san-aplic" value="unica" ${SAN_APLIC==='unica'?'checked':''} onchange="setSanAplic('unica')">Aplicação Única</label>
          <label class="radio-opt"><input type="radio" name="san-aplic" value="protocolo" ${SAN_APLIC==='protocolo'?'checked':''} onchange="setSanAplic('protocolo')">Protocolo</label>
        </div>
      </div>
      <div class="field" style="max-width:520px"><label>Protocolo Sanitário</label>
        <select id="san-prot" ${SAN_APLIC==='unica'?'disabled':''}>${prOpts}</select>
      </div>
      <div class="atrib-foot" style="align-items:flex-end">
        <div class="field" style="min-width:230px;flex:1"><label>Vacina/Medicamento</label><select id="san-med" onchange="sanMedChange()">${medOpts}</select></div>
        <div class="field" style="max-width:130px"><label>Unidade de Medida</label><input id="san-un" disabled placeholder="—"></div>
        <div class="field" style="max-width:130px"><label>Tipo de Dose</label><select id="san-tipo"><option value="">Selecione</option><option>Fixa</option><option>Por Peso</option></select></div>
        <div class="field" style="max-width:110px"><label>Dose <span class="req">*</span></label><input id="san-dose" type="text" inputmode="decimal" placeholder="0,00"></div>
        <div class="field" style="max-width:140px"><label>Por Cada (X) Kg</label><div class="weight-box" style="min-width:auto;padding:8px 12px"><input id="san-porkg" type="text" inputmode="decimal" placeholder="0,00" style="font-size:18px"><span class="unit" style="font-size:15px">Kg</span></div></div>
        <button class="btn primary add-big" onclick="addSanItem()">${icon('plus')} Adicionar</button>
      </div>
      <table class="tbl" style="margin-top:6px">
        <thead><tr><th>Vacina/Medicamento</th><th>Tipo de Dose</th><th>Qtde/Por Cada (X) Kg</th><th>Dose</th><th>Unidade de Medida</th><th>Custo da Aplicação</th><th>Ações</th></tr></thead>
        <tbody>${SAN_ITEMS.length?SAN_ITEMS.map((it,i)=>`<tr>
          <td class="strong">${it.nome}</td>
          <td>${it.tipoDose||'—'}</td>
          <td class="num">${it.porKg?it.porKg+' Kg':'—'}</td>
          <td class="num">${it.dose.toFixed(2).replace('.',',')}</td>
          <td>${it.unidade}</td>
          <td class="num">R$ ${it.custo.toFixed(2).replace('.',',')}</td>
          <td class="row-actions"><button class="icon-btn" title="Editar" onclick="editSanItem(${i})">${icon('edit')}</button><button class="icon-btn danger-ic" title="Remover" onclick="removeSanItem(${i})">${icon('trash')}</button></td>
        </tr>`).join(''):`<tr><td colspan="7" class="empty" style="padding:22px">${icon('reproducao')}<div>Nenhuma aplicação adicionada.</div></td></tr>`}</tbody>
        ${SAN_ITEMS.length?`<tfoot><tr><td colspan="5" class="strong">Custo total da aplicação</td><td class="num strong" style="color:var(--blue)">R$ ${totalCusto.toFixed(2).replace('.',',')}</td><td></td></tr></tfoot>`:''}
      </table>`;
}

function sanitarioSection(){
  const body = !SAN_OPEN ? '' : `<div class="san-body">${sanitarioBodyInner()}</div>`;
  return `<div id="san-block" class="san-section">
    <button class="san-toggle" onclick="toggleSanitario()">
      <span class="san-chev ${SAN_OPEN?'open':''}">${icon('chevDown')}</span>
      <span class="san-title">Sanitário</span>
      ${SAN_ITEMS.length?`<span class="tag blue" style="margin-left:8px">${SAN_ITEMS.length} aplicação(ões)</span>`:''}
    </button>
    ${body}
  </div>`;
}
function sanMedChange(){
  const id = document.getElementById('san-med').value;
  const m = DB.medicamentos.find(x=>x.id===id);
  document.getElementById('san-un').value = m?m.unidade:'';
}
function addSanItem(){
  const id = document.getElementById('san-med').value;
  const m = DB.medicamentos.find(x=>x.id===id);
  if(!m){ toast({title:'Selecione a vacina/medicamento',kind:'crit'}); return; }
  const dose = parseFloat((document.getElementById('san-dose').value||'').replace(',','.'))||0;
  if(dose<=0){ toast({title:'Informe a dose',kind:'crit'}); return; }
  const porKg = parseFloat((document.getElementById('san-porkg').value||'').replace(',','.'))||0;
  const tipoDose = document.getElementById('san-tipo').value;
  SAN_ITEMS.push({ medId:m.id, nome:m.nome, unidade:m.unidade, tipoDose, dose, porKg, custo:+(m.custoUnit*dose).toFixed(2) });
  refreshSanitario();
  toast({title:'Aplicação adicionada',msg:`${m.nome} · dose ${dose}`});
}
function editSanItem(i){
  const it=SAN_ITEMS[i]; if(!it) return;
  SAN_ITEMS.splice(i,1); refreshSanitario();
  document.getElementById('san-med').value=it.medId; sanMedChange();
  document.getElementById('san-dose').value=String(it.dose).replace('.',',');
  if(it.porKg) document.getElementById('san-porkg').value=String(it.porKg).replace('.',',');
  if(it.tipoDose) document.getElementById('san-tipo').value=it.tipoDose;
}
function removeSanItem(i){ SAN_ITEMS.splice(i,1); refreshSanitario(); }

function renderNascCats(){
  // modo "vem do ID": grid derivado do detalhamento individual (somente leitura)
  if(NASC_FROMID){
    if(!NASC_DETALHE.length) return '';
    const tally = {};
    NASC_DETALHE.forEach(d=>{ tally[d.catId]=(tally[d.catId]||0)+1; });
    const total = Object.values(tally).reduce((a,n)=>a+n,0);
    return `<div class="panel" style="margin:6px 0 0;box-shadow:none">
      <table class="tbl">
        <thead><tr><th>Categoria</th><th style="width:160px">Quantidade (do ID)</th></tr></thead>
        <tbody>${Object.keys(tally).map(cid=>`<tr><td class="strong">${nomeCategoria(cid)}</td><td class="num"><span class="derived">${icon('layers')} ${tally[cid]} cab.</span></td></tr>`).join('')}</tbody>
        <tfoot><tr><td class="strong">Total identificado</td><td class="num strong" style="color:var(--blue)">${total} cab.</td></tr></tfoot>
      </table>
    </div>`;
  }
  if(!NASC_CATS.length) return '';
  const total = NASC_CATS.reduce((a,c)=>a+c.qtd,0);
  return `<div class="panel" style="margin:6px 0 0;box-shadow:none">
    <table class="tbl">
      <thead><tr><th>Categoria</th><th style="width:120px">Quantidade</th><th style="width:110px"></th></tr></thead>
      <tbody>
        ${NASC_CATS.map((c,i)=>`<tr>
          <td class="strong">${c.catNome}</td>
          <td class="num">${c.qtd} cab.</td>
          <td class="row-actions">
            <button class="icon-btn" title="Editar" onclick="editNascCat(${i})">${icon('edit')}</button>
            <button class="icon-btn" title="Remover" onclick="removeNascCat(${i})">${icon('trash')}</button>
          </td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr><td class="strong">Total</td><td class="num strong" style="color:var(--blue)">${total} cab.</td><td></td></tr></tfoot>
    </table>
  </div>`;
}
function refreshNascCats(){ const el=document.getElementById('nasc-cats'); if(el) el.innerHTML=renderNascCats(); updNascResumo(); }

function updNascResumo(){
  const el = document.getElementById('nasc-resumo'); if(!el) return;
  const total = +(document.getElementById('mv-qtd-total')?.value)||0;
  if(NASC_FROMID){
    const done = NASC_DETALHE.length;
    if(!total){ el.innerHTML = `<span class="nasc-tag muted">${icon('info')} Informe a quantidade</span>`; return; }
    el.innerHTML = done===total
      ? `<span class="nasc-tag ok">${icon('check')} ${done} de ${total} identificados</span>`
      : `<span class="nasc-tag muted">${done} de ${total} identificados</span>`;
    return;
  }
  const declared = NASC_CATS.reduce((a,c)=>a+c.qtd,0);
  if(!declared){ el.innerHTML=''; return; }
  el.innerHTML = `<span class="nasc-tag ok">${icon('check')} Total ${declared} cab. em ${NASC_CATS.length} categoria(s)</span>`;
}

function addNascCat(){
  const catId = document.getElementById('mv-cat')?.value || '';
  const catNome = document.getElementById('mv-catlk-name')?.value || '';
  const qtd = +(document.getElementById('mv-qtd-total')?.value) || 0;
  if(!catId){ toast({title:'Selecione a categoria',msg:'Use a lupa para escolher a categoria antes de adicionar.',kind:'crit'}); return; }
  if(qtd<1){ toast({title:'Informe a quantidade',msg:'Digite a quantidade desta categoria no campo Quantidade.',kind:'crit'}); return; }
  const existing = NASC_CATS.find(c=>c.catId===catId);
  if(existing){ existing.qtd += qtd; }
  else NASC_CATS.push({catId, catNome, qtd});
  // limpa para a próxima linha
  document.getElementById('mv-cat').value='';
  document.getElementById('mv-catlk-name').value='';
  const cod=document.getElementById('mv-catlk-cod'); if(cod) cod.value='';
  document.getElementById('mv-qtd-total').value='';
  refreshNascCats();
  toast({title:'Categoria adicionada',msg:`${catNome} · ${qtd} cab.`});
}
function editNascCat(i){
  const c = NASC_CATS[i]; if(!c) return;
  document.getElementById('mv-cat').value=c.catId;
  document.getElementById('mv-catlk-name').value=c.catNome;
  document.getElementById('mv-qtd-total').value=c.qtd;
  NASC_CATS.splice(i,1);
  refreshNascCats();
}
function editNascCat(i){
  const c = NASC_CATS[i]; if(!c) return;
  document.getElementById('mv-cat').value=c.catId;
  document.getElementById('mv-catlk-name').value=c.catNome;
  document.getElementById('mv-qtd').value=c.qtd;
  NASC_CATS.splice(i,1);
  refreshNascCats();
}
function removeNascCat(i){ NASC_CATS.splice(i,1); refreshNascCats(); }

function abrirAtribuicao(){
  // alvo = nascimento mais recente com pendência; senão o mais recente
  const nasc = DB.movimentos.filter(m=>m.tipo==='nascimento').sort((a,b)=>b.data.localeCompare(a.data));
  if(!nasc.length){ toast({title:'Nenhum nascimento lançado',msg:'Salve um lançamento de nascimento antes de atribuir IDs.',kind:'warn'}); return; }
  NASC_TARGET = (nasc.find(m=>m.naoIdentificados>0) || nasc[0]).id;
  ATRIB_SHARED = { data:null, raca:null, lote:null };
  SAN_OPEN = false;
  NASC_PANEL = 'atribuir';
  document.getElementById('nasc-bottom').innerHTML = atribuicaoPanel();
}
function fecharAtribuicao(){
  NASC_PANEL = 'recent';
  render();
}

function computeMeses(dataISO){
  if(!dataISO) return 0;
  const d = new Date(dataISO), now = new Date();
  return Math.max(0, Math.round((now-d)/(86400000*30.44)));
}

function atribuicaoPanel(){
  const m = DB.movimentos.find(x=>x.id===NASC_TARGET);
  const restantes = m ? m.naoIdentificados : 0;
  const total = m ? m.qtd : 0;
  const detalhados = m ? m.vinculados.length : 0;
  const identificados = m ? DB.animais.filter(a=>m.vinculados.includes(a.id)) : [];
  const racaSel = ATRIB_SHARED.raca || 'Nelore';
  const racaOpts = ['Nelore','Anelorado','Brangus','Angus','Senepol','Cruzado'].map(r=>`<option ${r===racaSel?'selected':''}>${r}</option>`).join('');
  const dataDef = ATRIB_SHARED.data || (m?m.data:hojeISO());
  const loteSel = ATRIB_SHARED.lote || '';
  const loteOpts = `<option value="">—</option>`+DB.lotes.map(l=>`<option value="${l.id}" ${l.id===loteSel?'selected':''}>${l.codigo} · ${l.nome}</option>`).join('');
  // catálogo de categorias: declaradas primeiro
  const declCats = m && m.catDecl ? m.catDecl.map(d=>d.catId) : [];
  const catOpts = DB.categorias.map(c=>`<option value="${c.id}" ${declCats[0]===c.id?'selected':''}>${c.nome}</option>`).join('');
  // tally por categoria a partir dos detalhados
  const tally = {};
  identificados.forEach(a=>{ tally[a.categoria]=(tally[a.categoria]||0)+1; });
  const tallyChips = Object.keys(tally).map(cid=>`<span class="nasc-tag ok">${nomeCategoria(cid)}: ${tally[cid]}</span>`).join('')
    + (restantes>0?`<span class="nasc-tag muted">${restantes} a detalhar</span>`:'');
  const declChips = (m&&m.catDecl&&m.catDecl.length)
    ? `<div class="atrib-decl">Declarado no lançamento: ${m.catDecl.map(d=>`<span class="nasc-tag">${nomeCategoria(d.catId)}: ${d.qtd}</span>`).join('')}</div>` : '';
  return `<div class="panel" style="margin:0">
    <div class="panel-head">
      <h3>Atribuição de ID</h3>
      <div class="ph-r">
        <span class="pill ${restantes>0?'pend':'ok'}"><span class="d"></span>${detalhados} de ${total} detalhados</span>
        <button class="btn sm" onclick="fecharAtribuicao()">${icon('x')} Fechar</button>
      </div>
    </div>
    ${panelNote(`Individualizando o nascimento de <b>${m?fmtData(m.data):''}</b> — total <b>${total} cab.</b> (a quantidade é a base de conciliação). A categoria de cada bezerro é definida aqui, no detalhamento.`)}
    <div class="atrib-tally">${tallyChips}${declChips}</div>
    <div class="atrib-shared">
      <div class="ash-head">${icon('info')} Parâmetros que repetem em todos os lançamentos</div>
      <div class="nf-row" style="align-items:flex-end">
        <div class="field" style="max-width:180px"><label>Data Nasc <span class="req">*</span></label><input id="at-data" type="date" value="${dataDef}"></div>
        <div class="field" style="max-width:180px"><label>Raça <span class="req">*</span></label><select id="at-raca">${racaOpts}</select></div>
        <div class="field" style="max-width:240px"><label>Lote</label><select id="at-lote">${loteOpts}</select></div>
      </div>
    </div>
    ${sanitarioSection()}
    <div class="atrib-wrap">
      <div class="atrib-foot atrib-entry" style="flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="max-width:160px"><label>Categoria <span class="req">*</span></label><select id="at-cat">${catOpts}</select></div>
        <div class="field" style="max-width:140px"><label>ID Usual <span class="req">*</span></label><input id="at-apelido" placeholder="Apelido/ID"></div>
        <div class="field" style="max-width:130px"><label>ID Eletrônica</label><input id="at-rfid" placeholder="RFID"></div>
        <div class="field" style="max-width:120px"><label>Nº SISBOV</label><input id="at-sisbov" placeholder="SISBOV"></div>
        <div class="field"><label>Tamanho</label>
          <div class="radio-row">
            <label class="radio-opt"><input type="radio" name="at-tam" value="P">P</label>
            <label class="radio-opt"><input type="radio" name="at-tam" value="M" checked>M</label>
            <label class="radio-opt"><input type="radio" name="at-tam" value="G">G</label>
          </div>
        </div>
        <div class="field"><label>Mamou Colostro?</label>
          <div class="radio-row">
            <label class="radio-opt"><input type="radio" name="at-col" value="Não">N</label>
            <label class="radio-opt"><input type="radio" name="at-col" value="Sim" checked>S</label>
          </div>
        </div>
        <div class="field"><label>Pesagem</label>
          <div class="radio-row">
            <label class="radio-opt"><input type="radio" name="at-pes" value="Manual" checked>Manual</label>
            <label class="radio-opt"><input type="radio" name="at-pes" value="Automática">Auto</label>
          </div>
        </div>
        <div class="field" style="max-width:140px"><label>Peso</label>
          <div class="weight-box" style="min-width:auto;padding:8px 12px"><input id="at-peso" type="text" inputmode="decimal" placeholder="0,00" style="font-size:18px"><span class="unit" style="font-size:15px">Kg</span></div>
        </div>
        <button class="btn primary add-big" onclick="adicionarAtribuicao()">${icon('plus')} Adicionar</button>
      </div>
    </div>
    <table class="tbl">
      <thead><tr><th>ID interno</th><th>Apelido / ID</th><th>Categoria</th><th>ID Eletrônica</th><th>SISBOV</th><th>Raça</th><th>Peso</th><th>Tam.</th></tr></thead>
      <tbody>${identificados.length?identificados.map(a=>`<tr>
        <td><span class="mono" style="color:var(--blue);font-weight:600">${a.id}</span></td>
        <td class="strong">${a.brinco||'—'}</td>
        <td>${nomeCategoria(a.categoria)}</td>
        <td class="mono sub-cell">${a.rfid||'—'}</td>
        <td class="mono sub-cell">${a.sisbov||'—'}</td>
        <td>${a.raca}</td>
        <td class="num">${a.pesoNasc!=null?a.pesoNasc+' kg':'—'}</td>
        <td>${a.tamanho||'—'}</td>
      </tr>`).join(''):`<tr><td colspan="8" class="empty">${icon('ficha')}<div>Nenhum bezerro individualizado neste lançamento ainda.</div></td></tr>`}</tbody>
    </table>
  </div>`;
}

function adicionarAtribuicao(){
  const m = DB.movimentos.find(x=>x.id===NASC_TARGET);
  if(!m){ toast({title:'Lançamento não encontrado',kind:'crit'}); return; }
  const apelido = val('at-apelido');
  const peso = parseFloat(val('at-peso').replace(',','.'))||0;
  const catId = document.getElementById('at-cat')?.value || null;
  if(!apelido){ toast({title:'Informe o Apelido/ID Usual',kind:'crit'}); return; }
  if(!catId){ toast({title:'Selecione a categoria',kind:'crit'}); return; }
  if(m.naoIdentificados<=0){ toast({title:'Lançamento já totalmente identificado',msg:'Todos os bezerros deste nascimento já têm ficha.',kind:'warn'}); return; }
  const tam = document.querySelector('input[name="at-tam"]:checked')?.value || 'M';
  const c = DB.categorias.find(c=>c.id===catId);
  // preserva os parâmetros compartilhados para os próximos lançamentos
  ATRIB_SHARED = { data: val('at-data')||m.data, raca: val('at-raca'), lote: document.getElementById('at-lote')?.value||'' };
  const newId = nextAnimalId();
  DB.animais.push({
    id:newId, brinco:apelido, statusBrinco:'ok',
    rfid:val('at-rfid')||null, sisbov:val('at-sisbov')||null,
    sexo: c&&c.sexo!=='Misto'?c.sexo:'Macho',
    raca:ATRIB_SHARED.raca, categoria:catId, vivo:true,
    pesoNasc:peso>0?peso:null, tamanho:tam,
  });
  if(peso>0) DB.pesagens.push({ id:'pe-'+Date.now(), animal:newId, data:ATRIB_SHARED.data, peso });
  m.vinculados.push(newId);
  m.naoIdentificados = Math.max(0, m.naoIdentificados-1);
  if(m.naoIdentificados<=0) m.status='conciliado';
  document.getElementById('nasc-bottom').innerHTML = atribuicaoPanel();
  toast({title:'Bezerro identificado',msg:`${newId} · ${apelido} · ${nomeCategoria(catId)} · ${peso} kg. ${m.naoIdentificados} ainda a detalhar.`, kind:m.naoIdentificados<=0?'ok':'warn'});
}

/* ===== NASCIMENTO — campos na ordem do formulário legado ===== */
function viewNascimento(){
  const tipo = 'nascimento';
  const recent = DB.movimentos.filter(m=>m.tipo===tipo).sort((a,b)=>b.data.localeCompare(a.data));
  const loteOpts = DB.lotes.map(l=>`<option value="${l.id}">${l.codigo} · ${l.nome}</option>`).join('');
  return pageHead({
    title:'Lançar Nascimento',
  }) + `
  <div class="panel" style="max-width:${NASC_FROMID?'100%':'760px'}">
      <div style="padding:18px">
        <div class="nasc-form">
          <div class="nf-row">
            <div class="field" style="max-width:200px"><label>Safra</label><input id="mv-safra" value="${safraAtual()}"></div>
            <div class="field" style="max-width:200px"><label>Data</label><input id="mv-data" type="date" value="${hojeISO()}"></div>
            ${lookupField({key:'mv-prop', label:'Proprietário', src:'proprietarios', defCod:'01', defNome:'Antonio Chaker', noCod:true})}
          </div>
          <div class="nf-row">
            ${lookupField({key:'mv-fazenda', label:'Fazenda', src:'fazendas', defCod:'01', defNome:'Natura 1', noCod:true})}
            ${lookupField({key:'mv-retiro', label:'Retiro', src:'retiros', noCod:true})}
            ${lookupField({key:'mv-local', label:'Local', src:'locais', noCod:true})}
          </div>
          <div id="nasc-dist">${renderNascDist()}</div>
        </div>
        <div class="form-foot" style="margin-top:20px">
          <button class="btn outline" onclick="novoNascimento()" title="Limpar para um novo lançamento">${icon('plus')} Novo</button>
          <button class="btn primary" id="mv-salvar" onclick="salvarMovimento('nascimento')">${icon('save')} Salvar</button>
          <button class="btn" onclick="abrirAtribuicao()">${icon('ficha')} Atribuir ID</button>
          <span class="spacer"></span>
          <span class="sub-cell" id="mv-block"></span>
        </div>
      </div>
  </div>

  <div id="nasc-bottom" style="margin-top:22px">${NASC_PANEL==='atribuir'?atribuicaoPanel():recentesPanel(recent)}</div>`;
}

function recentesPanel(recent){
  return `<div class="panel" style="margin:0">
    <div class="panel-head"><h3>Lançamentos recentes — Nascimento</h3></div>
    <table class="tbl">
      <thead><tr><th>Data</th><th>Categoria</th><th>Qtd</th><th>Destino</th><th>Identificação</th><th>Status</th></tr></thead>
      <tbody>${recent.length?recent.map(m=>movRow(m,MOV_META.nascimento)).join(''):`<tr><td colspan="6" class="empty">${icon('nascimento')}<div>Nenhum lançamento ainda.</div></td></tr>`}</tbody>
    </table>
  </div>`;
}

function movRow(m,M){
  const id = m.vinculados.length, ni = m.naoIdentificados;
  const cob = (id+ni)>0 ? (id/(id+ni)*100) : 100;
  const catCell = m.tipo==='nascimento'
    ? (m.catDecl && m.catDecl.length
        ? m.catDecl.map(d=>nomeCategoria(d.catId)).join(', ') + (m.qtd> m.catDecl.reduce((a,d)=>a+d.qtd,0)?' + a detalhar':'')
        : '<span class="sub-cell">A detalhar</span>')
    : nomeCategoria(m.categoria);
  return `<tr>
    <td>${fmtData(m.data)}</td>
    <td class="strong">${catCell}</td>
    <td class="num">${M.verbo==='entrada'?'+':'−'}${m.qtd}</td>
    <td class="sub-cell">${nomeLote(m[M.dirField])}${m.destino?' · '+m.destino:''}${m.origem?' · '+m.origem:''}</td>
    <td>${ni>0?`<span class="pill pend"><span class="d"></span>${ni} a detalhar</span>`:`<span class="pill ok"><span class="d"></span>${id} detalhados</span>`}</td>
    <td>${statusPill(m.status)}</td>
  </tr>`;
}
function updMovPreview(tipo){
  const M = MOV_META[tipo];
  const cat = val('mv-cat'), qtd = +val('mv-qtd')||0;
  const ident = M.identMode==='brinco' ? (val('mv-brinco')?1:0) : Math.min(+val('mv-ident')||0, qtd);
  const saldo = saldoCategoria(cat);
  const ni = Math.max(0, qtd-ident);
  const cob = qtd>0 ? (ident/qtd*100) : 100;
  let blockMsg = '';
  const novoSaldo = M.verbo==='entrada' ? saldo+qtd : saldo-qtd;
  if(M.verbo==='saida' && qtd>saldo){
    blockMsg = `<div class="pill crit" style="margin-top:6px"><span class="d"></span>Baixa (${qtd}) maior que o saldo (${saldo}) — erro crítico, bloqueia.</div>`;
    document.getElementById('mv-block').innerHTML = `<span style="color:var(--crit)">${icon('alert')} Baixa excede saldo</span>`;
  } else { document.getElementById('mv-block').innerHTML = ''; }
  const cobC = classifCobertura(cob);
  const cobColor = cobC.cls==='ok'?'var(--ok)':cobC.cls==='alerta'?'var(--alerta)':'var(--crit)';
  document.getElementById('mv-preview').innerHTML = `
    <div class="kv"><span class="k">Saldo da categoria</span><span class="v">${saldo} cab.</span></div>
    <div class="kv"><span class="k">Após o lançamento</span><span class="v" style="color:${M.verbo==='entrada'?'var(--ok)':'var(--crit)'}">${novoSaldo} cab.</span></div>
    <div class="kv"><span class="k">Identificados agora</span><span class="v">${ident} de ${qtd}</span></div>
    <div class="kv"><span class="k">Irão à Mesa</span><span class="v" style="color:${ni>0?'var(--orange)':'var(--ok)'}">${ni} sem id.</span></div>
    <div style="margin-top:12px">${coberturaBadge(cob)}</div>
    ${blockMsg}`;
}
function salvarMovimento(tipo){
  const M = MOV_META[tipo];
  // Nascimento: quantidade é a âncora; no modo manual o total vem das categorias
  if(tipo==='nascimento'){
    const data=val('mv-data'), resp='Equipe Campo', safra=val('mv-safra');
    const faz=document.getElementById('mv-fazenda-name')?.value||'';
    const ret=document.getElementById('mv-retiro-name')?.value||'';
    const loc=document.getElementById('mv-local-name')?.value||'';
    const prop=document.getElementById('mv-prop-name')?.value||'';

    // Modo "distribuição vem do ID": só salva com todos identificados
    if(NASC_FROMID){
      const total = +val('mv-qtd-total')||0;
      if(total<1){ toast({title:'Informe a quantidade',msg:'A quantidade de nascidos é a base de verificação.',kind:'crit'}); return; }
      if(NASC_DETALHE.length!==total){
        toast({title:'Identificação incompleta',msg:`Salvar exige ${total} animais identificados; você tem ${NASC_DETALHE.length}. O total atribuído precisa bater com a quantidade.`,kind:'crit',timeout:6000});
        return;
      }
      const movId='mv-'+Date.now();
      const tally={};
      const vinculados=[];
      NASC_DETALHE.forEach(d=>{
        const nid=nextAnimalId();
        const c=DB.categorias.find(c=>c.id===d.catId);
        DB.animais.push({ id:nid, brinco:d.apelido, statusBrinco:'ok', rfid:d.rfid||null, sisbov:d.sisbov||null,
          sexo:d.sexo||(c&&c.sexo!=='Misto'?c.sexo:'Macho'), raca:d.raca||'A definir', categoria:d.catId, vivo:true, pesoNasc:d.peso>0?d.peso:null, tamanho:d.tam, colostro:d.colostro });
        if(d.peso>0) DB.pesagens.push({ id:'pe-'+nid, animal:nid, data, peso:d.peso });
        vinculados.push(nid);
        tally[d.catId]=(tally[d.catId]||0)+1;
      });
      const catDecl=Object.keys(tally).map(cid=>({catId:cid, qtd:tally[cid]}));
      DB.movimentos.push({ id:movId, tipo:'nascimento', data, responsavel:resp, qtd:total, categoria:null,
        catDecl, vinculados, naoIdentificados:0, status:'conciliado', sanitario:SAN_ITEMS.slice(), safra, fazenda:faz, retiro:ret, local:loc, proprietario:prop });
      NASC_DETALHE=[]; NASC_FROMID=false; SAN_ITEMS=[];
      render();
      toast({title:'Nascimento salvo e conciliado', msg:`${total} cab. identificadas. Distribuição por categoria veio do ID — total atribuído bate com a quantidade.`});
      return;
    }

    // Modo manual: total = soma das categorias declaradas (a distribuição é normal)
    if(!NASC_CATS.length){
      const cid=val('mv-cat'); const cq=+val('mv-qtd-total')||0;
      if(cid && cq>0) NASC_CATS.push({catId:cid, catNome:document.getElementById('mv-catlk-name')?.value||'', qtd:cq});
    }
    const total = NASC_CATS.reduce((a,c)=>a+c.qtd,0);
    if(total<1){ toast({title:'Informe ao menos uma categoria',msg:'Selecione a categoria, digite a quantidade e use + mais.',kind:'crit'}); return; }
    const k = NASC_CATS.length;
    DB.movimentos.push({ id:'mv-'+Date.now(), tipo:'nascimento', data, responsavel:resp,
      qtd:total, categoria:null, catDecl:NASC_CATS.map(c=>({catId:c.catId, qtd:c.qtd})),
      vinculados:[], naoIdentificados:total, status:'pendente',
      safra, fazenda:faz, retiro:ret, local:loc, proprietario:prop });
    NASC_CATS = [];
    render();
    toast({title:'Nascimento salvo no estoque', msg:`${total} cab. em ${k} categoria(s) somadas ao saldo. Identificação pendente na Mesa (Atribuir ID).`, kind:'warn', timeout:7000});
    return;
  }
  const cat=val('mv-cat'), qtd=+val('mv-qtd')||0, lote=val('mv-lote'), data=val('mv-data'), resp=val('mv-resp');
  const brincoBezerro = M.identMode==='brinco' ? val('mv-brinco') : '';
  const ident = M.identMode==='brinco' ? (brincoBezerro?Math.min(1,qtd):0) : Math.min(+val('mv-ident')||0,qtd);
  const extra = document.getElementById('mv-extra')?.value || '';
  const saldo = saldoCategoria(cat);
  if(!cat){ toast({title:'Selecione a categoria',msg:'Use o código ou a lupa para escolher a categoria.',kind:'crit'}); return; }
  if(qtd<1){ toast({title:'Quantidade inválida',kind:'crit'}); return; }
  if(M.verbo==='saida' && qtd>saldo){
    toast({title:'Bloqueado — erro crítico',msg:`A baixa de ${qtd} excede o saldo de ${saldo} cab. da categoria. Único caso em que o sistema trava.`,kind:'crit',timeout:7000});
    return;
  }
  const ni = Math.max(0, qtd-ident);
  const mov = { id:'mv-'+Date.now(), tipo, data, responsavel:resp, qtd, categoria:cat, vinculados:[], naoIdentificados:ni, status: ni>0?'pendente':'conciliado' };
  mov[M.dirField] = lote;
  if(M.extra==='origem') mov.origem=extra; if(M.extra==='destino') mov.destino=extra; if(M.extra==='causa') mov.causa=extra;
  // campos do formulário de Nascimento (padrão legado), se presentes
  if(document.getElementById('mv-ctrl')) mov.controle = val('mv-ctrl');
  if(document.getElementById('mv-safra')) mov.safra = val('mv-safra');
  if(document.getElementById('mv-fazenda-name')) mov.fazenda = document.getElementById('mv-fazenda-name').value;
  if(document.getElementById('mv-retiro-name')) mov.retiro = document.getElementById('mv-retiro-name').value;
  if(document.getElementById('mv-prop-name')) mov.proprietario = document.getElementById('mv-prop-name').value;
  if(M.identMode==='brinco' && brincoBezerro){
    // cria a ficha individual do bezerro já vinculada ao nascimento
    const c = DB.categorias.find(x=>x.id===cat);
    const newId = nextAnimalId();
    DB.animais.push({ id:newId, brinco:brincoBezerro, statusBrinco:'ok', sexo:c&&c.sexo!=='Misto'?c.sexo:'Macho', raca:'A definir', categoria:cat, vivo:true });
    mov.vinculados = [newId];
  } else {
    // vincula IDs existentes identificados da categoria
    mov.vinculados = DB.animais.filter(a=>a.categoria===cat && a.statusBrinco==='ok').slice(0,ident).map(a=>a.id);
  }
  DB.movimentos.push(mov);
  render();
  const cob = coberturaGlobal();
  if(ni>0){
    toast({title:`${M.titulo} salva no estoque`, msg:`Conciliação individual ${cob.toFixed(0)}%. ${ni} animal(is) sem identificação enviados à Mesa.`, kind:'warn', timeout:7000});
  } else {
    const extraMsg = M.identMode==='brinco'&&brincoBezerro?` Ficha ${mov.vinculados[0]} criada e vinculada.`:'';
    toast({title:`${M.titulo} salva no estoque`, msg:`Movimento conciliado — ${qtd} cab. ${M.verbo==='entrada'?'somadas ao':'baixadas do'} saldo.${extraMsg}`});
  }
}

/* ===== GESTÃO DE LOTES (alocação) ===== */
function viewGestaoLotes(){
  const loteOpts = DB.lotes.map(l=>`<option value="${l.id}">${l.codigo} · ${l.nome} (${saldoLote(l.id)} cab.)</option>`).join('');
  const moves = DB.movimentos.filter(m=>m.tipo==='alocacao').sort((a,b)=>b.data.localeCompare(a.data));
  const popCards = DB.lotes.map(l=>`<div class="metric"><div class="m-label">${icon('lotes')} ${l.codigo} · ${l.nome}</div><div class="m-value">${saldoLote(l.id)} <small>cab.</small></div><div class="m-sub">${l.finalidade} · derivado de alocações</div></div>`).join('');
  return pageHead({
    title:'Gestão de lotes',
    layer:'estoque',
    sub:'Movimento de alocação — mover animais entre lotes. Não altera o estoque da categoria, só a posição derivada. Lote e local são identidade; a posição é estado.',
  }) + `
  <div class="metrics">${popCards}</div>
  <div class="quick-launch">
    <div class="panel" style="margin-bottom:0">
      <div class="panel-head"><h3>Mover animais</h3></div>
      <div style="padding:18px"><div class="form-grid">
        <div class="field"><label>Data</label><input id="al-data" type="date" value="${hojeISO()}"></div>
        <div class="field"><label>Responsável</label><input id="al-resp" value="Antonio Chaker"></div>
        <div class="field"><label>Lote de origem</label><select id="al-orig">${loteOpts}</select></div>
        <div class="field"><label>Lote de destino</label><select id="al-dest">${loteOpts}</select></div>
        <div class="field"><label>Categoria</label><select id="al-cat">${DB.categorias.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Quantidade</label><input id="al-qtd" type="number" min="1" value="1"></div>
      </div>
      <div class="form-foot" style="margin-top:18px"><button class="btn outline" onclick="render()" title="Limpar para um novo lançamento">${icon('plus')} Novo</button><button class="btn primary" onclick="salvarAlocacao()">${icon('save')} Salvar</button></div>
      </div>
    </div>
    <div class="aside-card"><h4>Regra de alocação</h4><p class="small">A alocação <b>não</b> soma nem baixa o estoque da categoria — ele permanece intacto. Só atualiza a população derivada de cada lote e o "lote atual" dos animais identificados.</p></div>
  </div>
  <div class="panel" style="margin-top:22px">
    <div class="panel-head"><h3>Alocações recentes</h3></div>
    <table class="tbl"><thead><tr><th>Data</th><th>Categoria</th><th>Qtd</th><th>Origem</th><th>Destino</th><th>Responsável</th></tr></thead>
    <tbody>${moves.length?moves.map(m=>`<tr><td>${fmtData(m.data)}</td><td class="strong">${nomeCategoria(m.categoria)}</td><td class="num">${m.qtd}</td><td class="sub-cell">${nomeLote(m.loteOrigem)}</td><td class="sub-cell">${nomeLote(m.loteDestino)}</td><td>${m.responsavel}</td></tr>`).join(''):`<tr><td colspan="6" class="empty">${icon('gestaoLotes')}<div>Sem alocações.</div></td></tr>`}</tbody></table>
  </div>`;
}
function salvarAlocacao(){
  const orig=val('al-orig'),dest=val('al-dest'),cat=val('al-cat'),qtd=+val('al-qtd')||0,data=val('al-data'),resp=val('al-resp');
  if(orig===dest){toast({title:'Origem e destino iguais',kind:'crit'});return;}
  if(qtd<1){toast({title:'Quantidade inválida',kind:'crit'});return;}
  if(qtd>saldoLote(orig)){toast({title:'Bloqueado',msg:`Mover ${qtd} excede a população do lote de origem (${saldoLote(orig)}).`,kind:'crit'});return;}
  DB.movimentos.push({id:'mv-'+Date.now(),tipo:'alocacao',data,responsavel:resp,qtd,categoria:cat,loteOrigem:orig,loteDestino:dest,vinculados:[],naoIdentificados:0,status:'conciliado'});
  render();toast({title:'Animais movidos',msg:`${qtd} cab. de ${nomeLote(orig)} → ${nomeLote(dest)}. Estoque da categoria intacto.`});
}

/* ===== PESAGENS ===== */
function viewPesagens(){
  const animais = animaisComPesagem();
  const rows = animais.map(id=>{
    const g = gmdAnimal(id);
    const a = DB.animais.find(x=>x.id===id);
    return `<tr>
      <td><span class="mono" style="color:var(--blue);font-weight:600">${id}</span></td>
      <td>${a?a.brinco?`<span class="mono">${a.brinco}</span>`:'<span class="pill pend"><span class="d"></span>sem id.</span>':'—'}</td>
      <td class="num">${g?g.pesoIni:'—'} kg</td>
      <td class="num">${g?g.pesoFim:'—'} kg</td>
      <td class="num"><span class="derived">${icon('trend')} ${g?g.gmd.toFixed(3):'—'}</span></td>
      <td class="sub-cell">${g?Math.round(g.dias)+' dias · '+g.n+' eventos':'—'}</td>
    </tr>`;
  }).join('');
  return pageHead({
    title:'Pesagens',
    layer:'individual',
    sub:'Evento individual que alimenta o GMD (ganho médio diário) e a curva de peso. Cada pesagem é um ponto; o ganho é sempre calculado, nunca digitado.',
    actions:`<button class="btn primary" onclick="openNovaPesagem()">${icon('plus')} Nova pesagem</button>`,
  }) + `
  <div class="panel">
    <div class="panel-head"><h3>GMD por animal</h3><div class="ph-r">${searchBox('Buscar animal…')}</div></div>
    ${panelNote('GMD = (peso final − peso inicial) ÷ dias entre pesagens. Recalculado a cada novo evento.')}
    <table class="tbl"><thead><tr><th>Animal</th><th>Brinco</th><th>Peso inicial</th><th>Peso atual</th><th>GMD (kg/dia)</th><th>Período</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}
function openNovaPesagem(){
  openModal({title:'Nova pesagem',body:`<div class="form-grid">
    <div class="field full"><label>Animal (ID interno)</label><select id="pe-an">${DB.animais.filter(a=>a.vivo).map(a=>`<option value="${a.id}">${a.id}${a.brinco?' · '+a.brinco:' · sem id.'}</option>`).join('')}</select></div>
    <div class="field"><label>Data</label><input id="pe-data" type="date" value="${hojeISO()}"></div>
    <div class="field"><label>Peso <span class="opt">(kg)</span></label><input id="pe-peso" type="number" min="1" placeholder="0"></div>
  </div>`,foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="salvarPesagem()">${icon('save')} Registrar</button>`});
}
function salvarPesagem(){
  const animal=val('pe-an'),data=val('pe-data'),peso=+val('pe-peso')||0;
  if(peso<1){toast({title:'Peso inválido',kind:'crit'});return;}
  DB.pesagens.push({id:'pe-'+Date.now(),animal,data,peso});
  closeModal();render();
  const g=gmdAnimal(animal);
  toast({title:'Pesagem registrada',msg:g?`${animal} · ${peso} kg · GMD recalculado: ${g.gmd.toFixed(3)} kg/dia`:`${animal} · ${peso} kg`});
}

/* ===== REPRODUÇÃO ===== */
function viewReproducao(){
  const tipoCls = {IATF:'blue',Cobertura:'',Diagnóstico:'green',Parto:'green'};
  const rows = DB.reproducao.slice().sort((a,b)=>b.data.localeCompare(a.data)).map(r=>{
    const a=DB.animais.find(x=>x.id===r.matriz);
    const resCls = r.resultado==='Prenhe'?'ok':r.resultado==='Vazia'?'alerta':r.resultado.includes('Bezerro')?'ok':'neutral';
    return `<tr>
      <td>${fmtData(r.data)}</td>
      <td><span class="mono" style="color:var(--blue);font-weight:600">${r.matriz}</span> ${a&&a.brinco?`<span class="sub-cell mono">${a.brinco}</span>`:''}</td>
      <td><span class="tag ${tipoCls[r.tipo]||''}">${r.tipo}</span></td>
      <td><span class="pill ${resCls}"><span class="d"></span>${r.resultado}</span></td>
    </tr>`;
  }).join('');
  return pageHead({
    title:'Reprodução',
    layer:'individual',
    sub:'Cobertura / IATF, diagnóstico de gestação e parto. Eventos por matriz que alimentam o relatório reprodutivo.',
    actions:`<button class="btn primary" onclick="openNovoRepro()">${icon('plus')} Novo evento</button>`,
  }) + `
  <div class="metrics">
    <div class="metric"><div class="m-label">${icon('reproducao')} Taxa de prenhez</div><div class="m-value" style="color:var(--ok)">${taxaPrenhez().toFixed(0)}<small>%</small></div><div class="m-sub">Sobre diagnósticos realizados</div></div>
    <div class="metric"><div class="m-label">${icon('user')} Matrizes em manejo</div><div class="m-value">${repMatrizes().length}</div><div class="m-sub">Com evento reprodutivo</div></div>
    <div class="metric"><div class="m-label">${icon('nascimento')} Partos no período</div><div class="m-value">${DB.reproducao.filter(r=>r.tipo==='Parto').length}</div><div class="m-sub">Bezerros registrados</div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>Eventos reprodutivos</h3></div>
    <table class="tbl"><thead><tr><th>Data</th><th>Matriz</th><th>Evento</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}
function openNovoRepro(){
  openModal({title:'Novo evento reprodutivo',body:`<div class="form-grid">
    <div class="field full"><label>Matriz</label><select id="rp-mat">${DB.animais.filter(a=>a.sexo==='Fêmea').map(a=>`<option value="${a.id}">${a.id}${a.brinco?' · '+a.brinco:''}</option>`).join('')}</select></div>
    <div class="field"><label>Tipo</label><select id="rp-tipo"><option>IATF</option><option>Cobertura</option><option>Diagnóstico</option><option>Parto</option></select></div>
    <div class="field"><label>Data</label><input id="rp-data" type="date" value="${hojeISO()}"></div>
    <div class="field full"><label>Resultado</label><input id="rp-res" placeholder="Inseminada / Prenhe / Vazia / Bezerro vivo"></div>
  </div>`,foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="salvarRepro()">${icon('save')} Salvar</button>`});
}
function salvarRepro(){
  const matriz=val('rp-mat'),tipo=val('rp-tipo'),data=val('rp-data'),resultado=val('rp-res')||'Registrado';
  DB.reproducao.push({id:'rp-'+Date.now(),matriz,tipo,data,resultado});
  closeModal();render();toast({title:'Evento registrado',msg:`${tipo} · ${matriz} · ${resultado}`});
}

/* ===== MESA DE CONCILIAÇÃO ===== */
function viewMesa(){
  const pend = pendenciasMesa();
  const cards = pend.map(m=>{
    const M = MOV_META[m.tipo] || {titulo:tipoLabel(m.tipo)};
    const catLabel = m.tipo==='nascimento'
      ? (m.catDecl&&m.catDecl.length?m.catDecl.map(d=>nomeCategoria(d.catId)).join(', '):'a detalhar')
      : nomeCategoria(m.categoria);
    return `<div class="recon">
      <div class="recon-top">
        <span class="r-icon">${icon('mesa')}</span>
        <div><h4>${M.titulo} · ${catLabel}</h4><div class="r-meta">${fmtData(m.data)} · ${m.responsavel} · ${m.qtd} cab.</div></div>
      </div>
      <div class="r-body"><b>${m.naoIdentificados} de ${m.qtd} ainda sem identificação</b> neste lançamento. O estoque já foi movido pelo total — falta detalhar os IDs na camada individual.</div>
      <div style="display:flex;gap:14px;font-size:12px;color:var(--muted)"><span>${icon('check')} ${m.vinculados.length} vinculados</span><span style="color:var(--orange)">${icon('alert')} ${m.naoIdentificados} pendentes</span></div>
      <div class="r-foot"><button class="btn primary sm" onclick="resolverMesa('${m.id}')">${icon('checkCircle')} Resolver</button><button class="btn sm" onclick="adiarMesa('${m.id}')">Adiar</button></div>
    </div>`;
  }).join('');
  const concil = DB.movimentos.filter(m=>m.status==='conciliado' && (m.naoIdentificados===0) && ['venda','compra','morte','nascimento'].includes(m.tipo));
  return pageHead({
    title:'Mesa de Conciliação',
    layer:'mesa',
    sub:'Cada divergência da camada individual vira um cartão — resolvido depois, com responsável, data e auditoria. A divergência nunca bloqueia o estoque.',
  }) + `
  <div class="metrics">
    <div class="metric"><div class="m-label">${icon('mesa')} Cartões abertos</div><div class="m-value" style="color:var(--orange)">${pend.length}</div></div>
    <div class="metric"><div class="m-label">${icon('alert')} Animais sem id.</div><div class="m-value">${naoIdentificadosPendentes()}</div></div>
    <div class="metric"><div class="m-label">${icon('ficha')} Cobertura individual</div><div class="m-value">${coberturaGlobal().toFixed(1)}<small>%</small></div></div>
  </div>
  ${pend.length?`<div class="recon-grid">${cards}</div>`:`<div class="panel"><div class="empty">${icon('checkCircle')}<div><b>Nenhuma pendência.</b><br>Toda a camada individual está conciliada com o estoque.</div></div></div>`}
  `;
}
function resolverMesa(id){
  const m = DB.movimentos.find(x=>x.id===id);
  openModal({
    title:'Resolver divergência',
    sub:`${MOV_META[m.tipo]?.titulo||tipoLabel(m.tipo)} · ${m.tipo==='nascimento'?(m.catDecl&&m.catDecl.length?m.catDecl.map(d=>nomeCategoria(d.catId)).join(', '):'a detalhar'):nomeCategoria(m.categoria)} · ${fmtData(m.data)}`,
    body:`<p class="small" style="margin-top:0">${m.naoIdentificados} animal(is) ficaram sem identificação. Vincule os brincos ou registre como baixa não identificada auditada. O estoque não muda.</p>
      <div class="form-grid" style="margin-top:6px">
        <div class="field"><label>Brincos vinculados agora</label><input id="rs-vinc" type="number" min="0" max="${m.naoIdentificados}" value="${m.naoIdentificados}"></div>
        <div class="field"><label>Responsável pela conciliação</label><input id="rs-resp" value="Antonio Chaker"></div>
        <div class="field full"><label>Observação de auditoria <span class="opt">(opcional)</span></label><textarea id="rs-obs" rows="2" placeholder="Ex.: brincos relidos no embarque."></textarea></div>
      </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="confirmResolver('${id}')">${icon('checkCircle')} Conciliar</button>`,
  });
}
function confirmResolver(id){
  const m=DB.movimentos.find(x=>x.id===id);
  const vinc=Math.min(+val('rs-vinc')||0, m.naoIdentificados);
  const defCat = (m.catDecl&&m.catDecl[0]?m.catDecl[0].catId:m.categoria)||null;
  const novos = [];
  for(let i=0;i<vinc;i++){
    const nid = nextAnimalId();
    const c = DB.categorias.find(c=>c.id===defCat);
    DB.animais.push({ id:nid, brinco:null, statusBrinco:'sem', sexo:c&&c.sexo!=='Misto'?c.sexo:'Macho', raca:'A definir', categoria:defCat, vivo:true });
    novos.push(nid);
  }
  m.vinculados.push(...novos);
  m.naoIdentificados = Math.max(0, m.naoIdentificados - vinc);
  if(m.naoIdentificados<=0){ m.status='conciliado'; m.conciliadoPor=val('rs-resp'); }
  closeModal();render();
  toast({title:m.naoIdentificados<=0?'Divergência conciliada':'Pendência reduzida',msg:m.naoIdentificados<=0?`Cartão fechado por ${val('rs-resp')}. Auditoria registrada.`:`${m.naoIdentificados} ainda na Mesa.`,kind:m.naoIdentificados<=0?'ok':'warn'});
}
function adiarMesa(id){ toast({title:'Cartão adiado',msg:'Permanece na Mesa. O estoque segue intacto.',kind:'warn'}); }
