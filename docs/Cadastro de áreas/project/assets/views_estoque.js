/* ===== ESTOQUE DE PARTIDA — mapa Local × Categoria (QTD/Peso) ===== */
const EP = {
  retiro: 'Natura 1',
  data: '2026-05-31',
  status: 'rascunho',
  colunas: [
    { id:'vaca',    nome:'Vaca Nelore' },
    { id:'nov14',   nome:'Novilha Rep. 14 meses' },
    { id:'bezerra', nome:'Bezerra Mamando' },
    { id:'bezerro', nome:'Bezerro Mamando' },
  ],
  locais: [
    { id:'p1',  nome:'Pasto 1',     area:50, cells:{ vaca:{qtd:88, peso:500} } },
    { id:'p2',  nome:'Pasto 2',     area:40, cells:{} },
    { id:'p3',  nome:'Pasto 3',     area:45, cells:{} },
    { id:'p4',  nome:'Pasto 4',     area:38, cells:{} },
    { id:'p5',  nome:'Pasto 5',     area:30, cells:{} },
    { id:'p6',  nome:'Pasto 6',     area:35, cells:{} },
    { id:'p7',  nome:'Pasto 7',     area:35, cells:{} },
    { id:'mat', nome:'Maternidade', area:30, cells:{} },
  ],
};
let EP_COLLAPSED = false;
let EP_MODO = 'pasto';  // 'pasto' (Local × Categoria) | 'categoria' (categorias nas linhas)
EP.catDist = null;       // distribuição agregada por categoria {colId:{qtd,peso}}

function epEnsureCatDist(){
  if(EP.catDist) return;
  EP.catDist = {};
  EP.colunas.forEach(c=>{ EP.catDist[c.id] = { qtd: epColQtd(c.id), peso: epColPesoMedio(c.id) }; });
}
function epCatRowWeight(colId){ const d=EP.catDist[colId]||{}; return (d.qtd||0)*(d.peso||0); }
function epCatGrandQtd(){ return EP.colunas.reduce((a,c)=>a+(EP.catDist[c.id]?.qtd||0),0); }
function epCatGrandWeight(){ return EP.colunas.reduce((a,c)=>a+epCatRowWeight(c.id),0); }
function epCatGrandPesoMedio(){ const q=epCatGrandQtd(); return q>0?epCatGrandWeight()/q:0; }
function epCatGrandLotacao(){ const a=epGrandArea(); const q=epCatGrandQtd(); return a>0&&q>0?q/a:0; }

function epCell(locId, colId){
  const loc = EP.locais.find(l=>l.id===locId);
  return (loc.cells[colId] ||= { qtd:0, peso:0 });
}
function epNum(n, dec=1){
  if(!n || !isFinite(n)) return '—';
  return n.toLocaleString('pt-BR',{minimumFractionDigits:dec, maximumFractionDigits:dec});
}
function epRowQtd(loc){ return EP.colunas.reduce((a,c)=>a + (loc.cells[c.id]?.qtd||0), 0); }
function epRowWeight(loc){ return EP.colunas.reduce((a,c)=>{ const x=loc.cells[c.id]; return a + (x?(x.qtd||0)*(x.peso||0):0); }, 0); }
function epRowPesoMedio(loc){ const q=epRowQtd(loc); return q>0 ? epRowWeight(loc)/q : 0; }
function epRowLotacao(loc){ const q=epRowQtd(loc); return loc.area>0 && q>0 ? q/loc.area : 0; }

function epColQtd(colId){ return EP.locais.reduce((a,l)=>a+(l.cells[colId]?.qtd||0),0); }
function epColWeightTot(colId){ return EP.locais.reduce((a,l)=>{ const x=l.cells[colId]; return a+(x?(x.qtd||0)*(x.peso||0):0); },0); }
function epColPesoMedio(colId){ const q=epColQtd(colId); return q>0 ? epColWeightTot(colId)/q : 0; }
function epGrandQtd(){ return EP.locais.reduce((a,l)=>a+epRowQtd(l),0); }
function epGrandWeight(){ return EP.locais.reduce((a,l)=>a+epRowWeight(l),0); }
function epGrandArea(){ return EP.locais.reduce((a,l)=>a+(l.area||0),0); }
function epGrandPesoMedio(){ const q=epGrandQtd(); return q>0 ? epGrandWeight()/q : 0; }
function epGrandLotacao(){ const a=epGrandArea(); return a>0 ? epGrandQtd()/a : 0; }

function viewEstoquePartida(){
  return `
  <div class="ep-head">
    <button class="ep-back" onclick="go('home')" title="Voltar">${icon('back')}</button>
    <div class="ep-head-text">
      <div class="ep-eyebrow">DETALHE DO ESTOQUE <span class="ep-rascunho">RASCUNHO</span></div>
      <h1 class="ep-title">${EP.retiro} · ${fmtData(EP.data)}</h1>
    </div>
    <div class="ep-head-actions">
      <button class="btn" onclick="epToggleCollapse()"><span class="ep-chev ${EP_COLLAPSED?'down':''}">${icon('collapseUp')}</span> ${EP_COLLAPSED?'Expandir':'Recolher'}</button>
      <button class="btn ep-save" onclick="epSalvar()">${icon('save')} Salvar mapa</button>
    </div>
  </div>

  <div class="ep-metrics">
    <div class="ep-metric"><span class="ep-m-label">Cabeças</span><span class="ep-m-value" id="ep-m-cabecas">${epGrandQtd()}</span></div>
    <div class="ep-metric"><span class="ep-m-label">Peso médio</span><span class="ep-m-value" id="ep-m-pm">${epNum(epGrandPesoMedio())}<small>kg</small></span></div>
    <div class="ep-metric"><span class="ep-m-label">Lotação</span><span class="ep-m-value" id="ep-m-lot">${epNum(epGrandLotacao(),2)}<small>cab/ha</small></span></div>
    <div class="ep-modo-wrap">
      <span class="ep-modo-q">Distribuição</span>
      <div class="ep-modo">
        <button class="${EP_MODO==='pasto'?'on':''}" onclick="epSetModo('pasto')">${icon('mapa')} Mapa de Pasto</button>
        <button class="${EP_MODO==='categoria'?'on':''}" onclick="epSetModo('categoria')">${icon('categoria')} Distribuição por Categoria</button>
      </div>
    </div>
  </div>

  <div class="panel" style="margin-bottom:24px;overflow-x:auto">
    ${EP_MODO==='pasto'?epTable():epCatTable()}
  </div>`;
}

function epSetModo(m){
  EP_MODO = m;
  if(m==='categoria') epEnsureCatDist();
  render();
}

function epCatTable(){
  epEnsureCatDist();
  const rows = EP.colunas.map(c=>{
    const d = EP.catDist[c.id] || {qtd:0,peso:0};
    const lot = epGrandArea()>0 && d.qtd>0 ? d.qtd/epGrandArea() : 0;
    return `<tr class="ep-loc-row">
      <td class="ep-local">${icon('categoria')}<span>${c.nome}</span></td>
      <td class="ep-input-cell">
        <input class="ep-in" type="text" inputmode="numeric" value="${d.qtd||''}" placeholder="—" oninput="epCatSet('${c.id}','qtd',this.value)">
      </td>
      <td class="ep-input-cell ep-r">
        <input class="ep-in ep-peso" type="text" inputmode="decimal" value="${d.peso?epNum(d.peso):''}" placeholder="—" oninput="epCatSet('${c.id}','peso',this.value)">
      </td>
      <td class="ep-tot num ep-r" id="ep-cat-${c.id}-ptot">${epNum(epCatRowWeight(c.id))}</td>
      <td class="ep-tot num ep-r" id="ep-cat-${c.id}-lot">${epNum(lot,2)}</td>
    </tr>`;
  }).join('');
  return `<table class="tbl ep-tbl ep-cat-tbl">
    <thead>
      <tr>
        <th class="ep-local-h">Categoria</th>
        <th>QTD</th>
        <th class="ep-r">Peso médio (kg)</th>
        <th class="ep-r">Peso total (kg)</th>
        <th class="ep-r">Lotação (cab/ha)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr class="ep-total-row">
        <td class="strong">Total</td>
        <td class="num strong" id="ep-cg-qtd">${epCatGrandQtd()}</td>
        <td class="num strong ep-r" id="ep-cg-pm">${epNum(epCatGrandPesoMedio())}</td>
        <td class="num strong ep-r" id="ep-cg-ptot">${epNum(epCatGrandWeight())}</td>
        <td class="num strong ep-r" id="ep-cg-lot">${epNum(epCatGrandLotacao(),2)}</td>
      </tr>
    </tfoot>
  </table>`;
}
function epCatSet(colId, field, raw){
  epEnsureCatDist();
  const d = (EP.catDist[colId] ||= {qtd:0,peso:0});
  d[field] = field==='qtd' ? (parseInt(String(raw).replace(/\D/g,''),10)||0) : epParseNum(raw);
  epCatRecalc();
}
function epCatRecalc(){
  EP.colunas.forEach(c=>{
    const d = EP.catDist[c.id]||{qtd:0,peso:0};
    const lot = epGrandArea()>0 && d.qtd>0 ? d.qtd/epGrandArea() : 0;
    const pt=document.getElementById(`ep-cat-${c.id}-ptot`); if(pt) pt.textContent = epNum(epCatRowWeight(c.id));
    const lo=document.getElementById(`ep-cat-${c.id}-lot`); if(lo) lo.textContent = epNum(lot,2);
  });
  const gq=document.getElementById('ep-cg-qtd'); if(gq) gq.textContent = epCatGrandQtd();
  const gp=document.getElementById('ep-cg-pm'); if(gp) gp.textContent = epNum(epCatGrandPesoMedio());
  const gpt=document.getElementById('ep-cg-ptot'); if(gpt) gpt.textContent = epNum(epCatGrandWeight());
  const gl=document.getElementById('ep-cg-lot'); if(gl) gl.textContent = epNum(epCatGrandLotacao(),2);
  const mc=document.getElementById('ep-m-cabecas'); if(mc) mc.textContent = epCatGrandQtd();
  const mp=document.getElementById('ep-m-pm'); if(mp) mp.innerHTML = `${epNum(epCatGrandPesoMedio())}<small>kg</small>`;
  const ml=document.getElementById('ep-m-lot'); if(ml) ml.innerHTML = `${epNum(epCatGrandLotacao(),2)}<small>cab/ha</small>`;
}

function epTable(){
  const colHead = EP.colunas.map(c=>`<th class="ep-cat" colspan="2">${c.nome}</th>`).join('');
  const subHead = EP.colunas.map(()=>`<th class="ep-sub">QTD</th><th class="ep-sub ep-r">Peso (kg)</th>`).join('');
  const rows = EP.locais.map(loc=>{
    const cells = EP.colunas.map(c=>{
      const v = loc.cells[c.id] || {qtd:0,peso:0};
      return `<td class="ep-input-cell">
          <input class="ep-in" type="text" inputmode="numeric" value="${v.qtd||''}" placeholder="—"
            oninput="epSet('${loc.id}','${c.id}','qtd',this.value)">
        </td>
        <td class="ep-input-cell ep-r">
          <input class="ep-in ep-peso" type="text" inputmode="decimal" value="${v.peso?epNum(v.peso):''}" placeholder="—"
            oninput="epSet('${loc.id}','${c.id}','peso',this.value)">
        </td>`;
    }).join('');
    return `<tr class="ep-loc-row">
      <td class="ep-local">${icon('local')}<span>${loc.nome}</span></td>
      ${cells}
      <td class="ep-tot num" id="ep-${loc.id}-total">${epRowQtd(loc)||'—'}</td>
      <td class="ep-tot num" id="ep-${loc.id}-pm">${epNum(epRowPesoMedio(loc))}</td>
      <td class="ep-tot num ep-r" id="ep-${loc.id}-lot">${epNum(epRowLotacao(loc),2)}</td>
    </tr>`;
  }).join('');
  const colTotals = EP.colunas.map(c=>`<td class="num strong" id="ep-col-${c.id}-q">${epColQtd(c.id)||'—'}</td><td class="num strong ep-r" id="ep-col-${c.id}-p">${epNum(epColPesoMedio(c.id))}</td>`).join('');
  return `<table class="tbl ep-tbl">
    <thead>
      <tr><th class="ep-local-h" rowspan="2">Local</th>${colHead}<th class="ep-tot-h" rowspan="2">Total</th><th class="ep-tot-h" rowspan="2">Peso médio</th><th class="ep-tot-h ep-r" rowspan="2">Lotação</th></tr>
      <tr>${subHead}</tr>
    </thead>
    <tbody>
      ${EP_COLLAPSED?'':rows}
    </tbody>
    <tfoot>
      <tr class="ep-total-row">
        <td class="strong">Total</td>
        ${colTotals}
        <td class="num strong" id="ep-g-qtd">${epGrandQtd()}</td>
        <td class="num strong" id="ep-g-pm">${epNum(epGrandPesoMedio())}</td>
        <td class="num strong ep-r" id="ep-g-lot">${epNum(epGrandLotacao(),2)}</td>
      </tr>
    </tfoot>
  </table>`;
}

function epParseNum(s){ return parseFloat(String(s).replace(/\./g,'').replace(',','.'))||0; }
function epSet(locId, colId, field, raw){
  const cell = epCell(locId, colId);
  cell[field] = field==='qtd' ? (parseInt(String(raw).replace(/\D/g,''),10)||0) : epParseNum(raw);
  epRecalc();
}
function epRecalc(){
  EP.locais.forEach(loc=>{
    const t=document.getElementById(`ep-${loc.id}-total`); if(t) t.textContent = epRowQtd(loc)||'—';
    const pm=document.getElementById(`ep-${loc.id}-pm`); if(pm) pm.textContent = epNum(epRowPesoMedio(loc));
    const lo=document.getElementById(`ep-${loc.id}-lot`); if(lo) lo.textContent = epNum(epRowLotacao(loc),2);
  });
  EP.colunas.forEach(c=>{
    const q=document.getElementById(`ep-col-${c.id}-q`); if(q) q.textContent = epColQtd(c.id)||'—';
    const p=document.getElementById(`ep-col-${c.id}-p`); if(p) p.textContent = epNum(epColPesoMedio(c.id));
  });
  const gq=document.getElementById('ep-g-qtd'); if(gq) gq.textContent = epGrandQtd();
  const gp=document.getElementById('ep-g-pm'); if(gp) gp.textContent = epNum(epGrandPesoMedio());
  const gl=document.getElementById('ep-g-lot'); if(gl) gl.textContent = epNum(epGrandLotacao(),2);
  const mc=document.getElementById('ep-m-cabecas'); if(mc) mc.textContent = epGrandQtd();
  const mp=document.getElementById('ep-m-pm'); if(mp) mp.innerHTML = `${epNum(epGrandPesoMedio())}<small>kg</small>`;
  const ml=document.getElementById('ep-m-lot'); if(ml) ml.innerHTML = `${epNum(epGrandLotacao(),2)}<small>cab/ha</small>`;
}
function epToggleCollapse(){ EP_COLLAPSED=!EP_COLLAPSED; render(); }
function epSalvar(){
  EP.status='salvo';
  const q = EP_MODO==='pasto' ? epGrandQtd() : epCatGrandQtd();
  const pm = EP_MODO==='pasto' ? epGrandPesoMedio() : epCatGrandPesoMedio();
  const modoLabel = EP_MODO==='pasto' ? 'Mapa de pasto' : 'Distribuição por categoria';
  toast({title:'Mapa de estoque salvo', msg:`${modoLabel} · ${EP.retiro} · ${q} cab. · peso médio ${epNum(pm)} kg. Definido como estoque de partida.`});
}
