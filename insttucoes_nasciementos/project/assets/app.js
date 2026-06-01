/* ===== Navegação ===== */
const NAV = [
  { group:'CADASTROS', label:'CADASTROS', items:[
    { id:'categoria', title:'Categoria animal', icon:'categoria', layer:'estoque',    desc:'Sexo, faixa de idade e estoque de partida do rebanho.', view:viewCategoria },
    { id:'local',     title:'Local',           icon:'local',     layer:'estoque',    desc:'Pastos e retiros da fazenda.', view:viewLocal },
    { id:'lotes',     title:'Lotes',           icon:'lotes',     layer:'estoque',    desc:'Agrupamento por finalidade. Sem local nem lista de animais.', view:viewLotes },
    { id:'ficha',     title:'Ficha individual',icon:'ficha',     layer:'individual', desc:'ID interno como chave; brinco e RFID versionados.', view:viewFicha },
  ]},
  { group:'MOVIMENTAÇÃO', label:'MOVIMENTAÇÃO', items:[
    { id:'nascimento',title:'Nascimento',      icon:'nascimento',layer:'estoque',    desc:'Entrada — soma ao estoque da categoria.', view:()=>viewMovimento('nascimento') },
    { id:'compra',    title:'Compra',          icon:'compra',    layer:'estoque',    desc:'Entrada — animais comprados somam ao estoque.', view:()=>viewMovimento('compra') },
    { id:'venda',     title:'Venda',           icon:'venda',     layer:'estoque',    desc:'Saída — baixa o estoque; conclui sem brinco.', view:()=>viewMovimento('venda') },
    { id:'morte',     title:'Morte',           icon:'morte',     layer:'estoque',    desc:'Saída — baixa o estoque; conclui sem identificação.', view:()=>viewMovimento('morte') },
    { id:'gestao',    title:'Gestão de lotes', icon:'gestaoLotes',layer:'estoque',   desc:'Mover animais entre lotes — não altera o estoque.', view:viewGestaoLotes },
    { id:'pesagens',  title:'Pesagens',        icon:'pesagens',  layer:'individual', desc:'Evento individual; alimenta GMD e curva de peso.', view:viewPesagens },
    { id:'reproducao',title:'Reprodução',      icon:'reproducao',layer:'individual', desc:'Cobertura/IATF, diagnóstico e parto.', view:viewReproducao },
    { id:'mesa',      title:'Mesa de Conciliação',icon:'mesa',   layer:'mesa',       desc:'Cartões de divergência da camada individual.', view:viewMesa, badge:()=>pendenciasMesa().length },
  ]},
  { group:'RELATÓRIOS', label:'RELATÓRIOS', items:[
    { id:'rel-mov',   title:'Relatório por movimento',icon:'relMov',layer:'mesa',    desc:'Um por tipo, com status de conciliação.', view:viewRelMov },
    { id:'rel-peso',  title:'Ganho de peso',   icon:'relPeso',   layer:'individual', desc:'GMD, ranking e desvio da média do grupo.', view:viewRelPeso },
    { id:'rel-rep',   title:'Reprodutivo',     icon:'relReprod', layer:'individual', desc:'Taxa de prenhez, coberturas e partos por matriz.', view:viewRelReprod },
  ]},
];
function findItem(id){ for(const g of NAV) for(const it of (g.items||[])) if(it.id===id) return it; return null; }

let CURRENT = 'home';
function go(id){ if(typeof NASC_PANEL!=='undefined'){ NASC_PANEL='recent'; NASC_CATS=[]; if(typeof NASC_DETALHE!=='undefined'){ NASC_DETALHE=[]; NASC_FROMID=false; } if(typeof SAN_ITEMS!=='undefined'){ SAN_ITEMS=[]; SAN_APLIC='unica'; } } CURRENT = id; localStorage.setItem('inttegra-view', id); render(); document.querySelector('.content').scrollTop=0; }

/* ===== Sidebar ===== */
function renderSidebar(){
  const groups = NAV.map(g=>`
    <div class="sb-group-label">${g.label}</div>
    ${g.items.map(it=>{
      const badge = it.badge ? it.badge() : 0;
      return `<button class="sb-item ${CURRENT===it.id?'active':''}" onclick="go('${it.id}')">
        ${icon(it.icon)}<span class="label">${it.title}</span>
        ${badge?`<span class="badge-count">${badge}</span>`:''}
      </button>`;
    }).join('')}
  `).join('');
  return `
    <div class="sb-brand">
      <span class="sb-logo">${icon('cow')}</span>
      <span class="name" onclick="go('home')" style="cursor:pointer">Gesttor</span>
      <button class="sb-collapse" onclick="document.querySelector('.app').classList.toggle('collapsed')" title="Recolher">${icon('collapse')}</button>
    </div>
    <nav class="sb-nav">${groups}</nav>
    <div class="sb-user">
      <span class="sb-avatar">A</span>
      <div class="u-meta">
        <div class="u-name">Antonio C Admin</div>
        <div class="u-role">Administrador</div>
        <div class="u-ver">V1.5.89 SAAS</div>
      </div>
    </div>`;
}

/* ===== Topbar ===== */
function renderTopbar(){
  return `
    <div class="tb-context">
      <button class="tb-drop"><span class="sub">Analista</span> Antonio Chaker ${icon('chevDown')}</button>
      <span class="tb-sep">/</span>
      <button class="tb-drop"><span class="sub">Cliente</span> Reunidas Floresta ${icon('chevDown')}</button>
      <span class="tb-sep">/</span>
      <button class="tb-drop"><span class="sub">Fazenda</span> Natura 1 ${icon('chevDown')}</button>
    </div>
    <div class="tb-right">
      <button class="tb-support">${icon('help')} Suporte<span class="dot"></span></button>
    </div>`;
}

/* ===== Router ===== */
function render(){
  document.querySelector('.sidebar').innerHTML = renderSidebar();
  document.querySelector('.topbar').innerHTML = renderTopbar();
  const content = document.querySelector('.content');
  if(CURRENT==='home'){ content.innerHTML = viewHome(); return; }
  const it = findItem(CURRENT);
  content.innerHTML = it ? it.view() : viewHome();
  if(CURRENT==='compra'||CURRENT==='venda'||CURRENT==='morte'){ updMovPreview(CURRENT); }
  if(CURRENT==='nascimento'){ updSalvarState(); }
}

/* ===== Init ===== */
function init(){
  CURRENT = localStorage.getItem('inttegra-view') || 'home';
  if(CURRENT!=='home' && !findItem(CURRENT)) CURRENT='home';
  render();
}
document.addEventListener('DOMContentLoaded', init);
