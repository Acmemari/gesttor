/* ===== Cadastro de Fazenda — app do mapa ===== */

const NIVEIS = {
  fazenda: { idx:0, label:'Fazenda', plural:'Fazenda',  cor:'#16a34a', fill:0.10 },
  retiro:  { idx:1, label:'Retiro',  plural:'Retiros',  cor:'#2563eb', fill:0.10 },
  setor:   { idx:2, label:'Setor',   plural:'Setores',  cor:'#d97706', fill:0.12 },
  local:   { idx:3, label:'Local',   plural:'Locais',   cor:'#0d9488', fill:0.16 },
};
const ORDEM = ['fazenda','retiro','setor','local'];
const TIPOS_LOCAL = ['Pasto','Curral','Confinamento','Aguada','Sede','Reserva','Outro'];

let AREAS = [];
const LAYERS = {};          // id -> L.polygon
let SEL = null;             // id selecionado
let ACTIVE = 'local';       // nível ativo: filtra o mapa (mostra até este nível) e define onde desenhar
let drawHandler = null;
let editingId = null;
let map, baseSat, baseOSM;

/* ---------- utilitários geográficos ---------- */
function llArr(coords){ return coords.map(c=>L.latLng(c[0], c[1])); }
function areaM2(coords){ return L.GeometryUtil.geodesicArea(llArr(coords)); }
function fmtArea(m2){
  const ha = m2/10000;
  const dec = ha>=100?0:ha>=10?1:2;
  return ha.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec})+' ha';
}
function centroid(coords){
  let la=0, ln=0; coords.forEach(c=>{la+=c[0];ln+=c[1];}); return [la/coords.length, ln/coords.length];
}
function pointInPoly(pt, coords){
  let inside=false; const x=pt[1], y=pt[0];
  for(let i=0,j=coords.length-1;i<coords.length;j=i++){
    const xi=coords[i][1], yi=coords[i][0], xj=coords[j][1], yj=coords[j][0];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
// menor área de nível superior que contém o centroide
function sugerirParent(coords, nivel){
  const ni = NIVEIS[nivel].idx, ct = centroid(coords);
  const cand = AREAS.filter(a=>NIVEIS[a.nivel].idx<ni && pointInPoly(ct, a.coords))
    .sort((a,b)=>NIVEIS[b.nivel].idx-NIVEIS[a.nivel].idx);
  return cand[0]?cand[0].id:null;
}
function areaById(id){ return AREAS.find(a=>a.id===id); }
function nomeParent(id){ const a=areaById(id); return a?a.nome:'—'; }

/* ---------- desenho de polígonos no mapa ---------- */
function styleFor(a, selected){
  const n = NIVEIS[a.nivel];
  return {
    color:n.cor, weight: a.nivel==='fazenda'?3.5:selected?3.5:2,
    opacity: a.visivel===false?0:1,
    fillColor:n.cor, fillOpacity: a.visivel===false?0:(selected?n.fill+0.14:n.fill),
    dashArray: a.nivel==='fazenda'?'7 5':null,
  };
}
function drawArea(a){
  const poly = L.polygon(a.coords, styleFor(a, a.id===SEL));
  poly.on('click', (e)=>{ L.DomEvent.stop(e); selectArea(a.id); });
  poly.bindTooltip(a.nome, {permanent:true, direction:'center',
    className:'fz-poly-label lvl-'+a.nivel, opacity:1});
  if(a.visivel!==false) poly.addTo(map);
  LAYERS[a.id] = poly;
}
function refreshStyle(id){ const a=areaById(id); if(LAYERS[id]) LAYERS[id].setStyle(styleFor(a, id===SEL)); }
function setVisible(a){
  const poly=LAYERS[a.id]; if(!poly) return;
  if(a.visivel===false){ if(map.hasLayer(poly)) map.removeLayer(poly); }
  else { if(!map.hasLayer(poly)) poly.addTo(map); poly.setStyle(styleFor(a, a.id===SEL)); }
}

/* ---------- seleção / foco ---------- */
function selectArea(id){
  const prev=SEL; SEL=id;
  if(prev) refreshStyle(prev);
  refreshStyle(id);
  if(LAYERS[id]) LAYERS[id].bringToFront();
  renderPanel();
}
function focusArea(id){
  const poly=LAYERS[id]; if(!poly) return;
  selectArea(id);
  map.fitBounds(poly.getBounds(), {padding:[40,40], maxZoom:16});
}

/* ---------- painel: colunas drill-down (Fazenda › Retiro › Setor › Local) ---------- */
let COL = { fazenda:null, retiro:null, setor:null };
function childrenOf(nivel, parentId){ return AREAS.filter(a=>a.nivel===nivel && a.parent===parentId); }
function nomeOrNull(id){ const a=areaById(id); return a?a.nome:null; }
function colResolve(){
  const fz=AREAS.filter(a=>a.nivel==='fazenda');
  if(!areaById(COL.fazenda)) COL.fazenda = fz[0]?fz[0].id:null;
  const rets=childrenOf('retiro', COL.fazenda);
  if(!rets.some(r=>r.id===COL.retiro)) COL.retiro = rets[0]?rets[0].id:null;
  const sets=childrenOf('setor', COL.retiro);
  if(!sets.some(s=>s.id===COL.setor)) COL.setor = sets[0]?sets[0].id:null;
}
function renderPanel(){
  colResolve();
  const cols=[
    { nivel:'fazenda', items:AREAS.filter(a=>a.nivel==='fazenda'), sel:COL.fazenda, parent:'__root__' },
    { nivel:'retiro',  items:childrenOf('retiro', COL.fazenda),    sel:COL.retiro,  parent:COL.fazenda },
    { nivel:'setor',   items:childrenOf('setor', COL.retiro),      sel:COL.setor,   parent:COL.retiro },
    { nivel:'local',   items:childrenOf('local', COL.setor),       sel:SEL,         parent:COL.setor },
  ];
  document.getElementById('fz-panel-scroll').innerHTML = cols.map(colHtml).join('');
}
function colHtml(col){
  const n=NIVEIS[col.nivel];
  const tot=col.items.reduce((s,a)=>s+areaM2(a.coords),0);
  const algumVisivel=col.items.some(a=>a.visivel!==false);
  let body;
  if(col.items.length){
    body=col.items.map(a=>colRow(a, a.id===col.sel, col.nivel!=='local')).join('');
  } else if(col.parent===null){
    const prevLbl=NIVEIS[ORDEM[n.idx-1]].label.toLowerCase();
    body=`<div class="fz-empty-lyr">Selecione ${prevLbl==='fazenda'?'uma fazenda':'um '+prevLbl} à esquerda.</div>`;
  } else {
    body=`<div class="fz-empty-lyr">Nenhum ${n.label.toLowerCase()} aqui. Selecione esta camada e desenhe ou importe.</div>`;
  }
  return `<div class="fz-col" data-lvl="${col.nivel}">
    <div class="fz-col-head">
      <span class="fz-swatch" style="background:${n.cor}"></span>
      <div class="fz-col-h-text">
        <div class="fz-col-name">${n.plural}</div>
        <div class="fz-col-meta">${col.items.length} · ${fmtArea(tot)}</div>
      </div>
      ${col.items.length?`<button class="fz-eye ${algumVisivel?'':'off'}" title="Mostrar/ocultar camada" onclick="event.stopPropagation();fzToggleLayer('${col.nivel}')">${algumVisivel?icon('mapa'):eyeOff()}</button>`:''}
    </div>
    <div class="fz-col-body">${body}</div>
  </div>`;
}
function colRow(a, isSel, drillable){
  const ha=fmtArea(areaM2(a.coords));
  return `<div class="fz-citem ${isSel?'sel':''} ${a.visivel===false?'off':''}" data-id="${a.id}" style="--accent:${NIVEIS[a.nivel].cor}" onclick="fzPick('${a.id}')" title="${a.nome}">
    <div class="fz-ci-top">
      <button class="fz-eye sm ${a.visivel===false?'off':''}" onclick="event.stopPropagation();fzToggleArea('${a.id}')" title="Mostrar/ocultar">${a.visivel===false?eyeOff():icon('mapa')}</button>
      <span class="fz-ci-name">${a.nome}</span>
      ${a.fonte==='kml'?'<span class="fz-kml-dot" title="Importado de KML/KMZ"></span>':''}
      ${drillable?'<svg class="fz-ci-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>':''}
    </div>
    <div class="fz-ci-bot">
      <span class="fz-ci-ha">${ha}${a.tipo?' · '+a.tipo:''}</span>
      <span class="fz-ci-acts">
        <button class="fz-mini" title="Centralizar" onclick="event.stopPropagation();fzFocus('${a.id}')">${icon('alvo')}</button>
        <button class="fz-mini" title="Editar" onclick="event.stopPropagation();fzEditProps('${a.id}')">${icon('edit')}</button>
        <button class="fz-mini del" title="Excluir" onclick="event.stopPropagation();fzDelete('${a.id}')">${icon('trash')}</button>
      </span>
    </div>
  </div>`;
}
function eyeOff(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8M9.4 5.3A9 9 0 0 1 12 5c5 0 9 5 9 7a12 12 0 0 1-2.2 2.7M6.3 6.4A12 12 0 0 0 3 12c0 2 4 7 9 7a9 9 0 0 0 3.6-.8"/></svg>'; }

function fzPick(id){
  const a=areaById(id); if(!a) return;
  if(a.nivel==='fazenda'){ COL.fazenda=id; COL.retiro=null; COL.setor=null; }
  else if(a.nivel==='retiro'){ COL.retiro=id; COL.setor=null; }
  else if(a.nivel==='setor'){ COL.setor=id; }
  applyLevel(a.nivel);          // mapa mostra do perímetro até este nível
  selectArea(id);              // destaca + renderiza o painel (sem dar zoom — use o botão Centralizar)
}
function fzSelect(id){ fzPick(id); }
function fzFocus(id){ focusArea(id); }
function fzToggleArea(id){ const a=areaById(id); a.visivel=a.visivel===false?true:false; setVisible(a); renderPanel(); }
function fzToggleLayer(nivel){
  const items=AREAS.filter(a=>a.nivel===nivel);
  const algum=items.some(a=>a.visivel!==false);
  items.forEach(a=>{ a.visivel=!algum; setVisible(a); });
  renderPanel();
}
function fzDelete(id){
  const a=areaById(id);
  const filhos=AREAS.filter(x=>x.parent===id);
  openModal({
    title:'Excluir área', sub:`${a.nome} · ${NIVEIS[a.nivel].label}`,
    body:`<p style="margin:0 0 6px;font-size:13.5px;color:var(--muted)">Esta área será removida do mapa e do cadastro.</p>
      ${filhos.length?`<div class="fz-breadcrumb" style="margin:8px 0 0;color:var(--pend);border-color:#f3d9a8;background:#fff8ec">${icon('alert')} <span><b>${filhos.length}</b> área(s) filha(s) ficarão sem vínculo (não serão excluídas).</span></div>`:''}`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" onclick="fzConfirmDelete('${id}')">${icon('trash')} Excluir</button>`,
  });
}
function fzConfirmDelete(id){
  const a=areaById(id);
  AREAS.filter(x=>x.parent===id).forEach(x=>x.parent=null);
  if(LAYERS[id]){ map.removeLayer(LAYERS[id]); delete LAYERS[id]; }
  AREAS=AREAS.filter(x=>x.id!==id);
  if(SEL===id) SEL=null;
  closeModal(); renderPanel();
  toast({title:'Área excluída', msg:`${a.nome} removida do cadastro.`, kind:'warn'});
}

/* ---------- nível ativo + desenho ---------- */
function applyLevel(nivel){
  ACTIVE=nivel;
  const maxIdx=NIVEIS[nivel].idx;
  document.querySelectorAll('.fz-seg button').forEach(b=>{
    const bi=NIVEIS[b.dataset.lvl].idx, on=b.dataset.lvl===nivel;
    b.classList.toggle('on', on);
    b.classList.toggle('incl', bi<=maxIdx && !on);   // níveis incluídos no filtro cumulativo
    b.style.background = on?NIVEIS[nivel].cor:'';
  });
  AREAS.forEach(a=>{ a.visivel = NIVEIS[a.nivel].idx<=maxIdx; setVisible(a); });
}
function setActive(nivel){ applyLevel(nivel); renderPanel(); }
function startDraw(){
  if(drawHandler){ drawHandler.disable(); drawHandler=null; setDrawHint(false); return; }
  const n=NIVEIS[ACTIVE];
  drawHandler = new L.Draw.Polygon(map, {
    allowIntersection:false, showArea:false,
    shapeOptions:{ color:n.cor, weight:3, fillColor:n.cor, fillOpacity:n.fill, dashArray: ACTIVE==='fazenda'?'7 5':null },
  });
  drawHandler.enable();
  setDrawHint(true);
}
function setDrawHint(on){
  const btn=document.getElementById('fz-draw-btn');
  btn.classList.toggle('on', on);
  btn.innerHTML = on ? icon('x')+'Cancelar desenho' : icon('edit')+'Desenhar';
  document.getElementById('fz-hint').innerHTML = on
    ? `${icon('info')} Clique no mapa para marcar os vértices da <b>${NIVEIS[ACTIVE].label.toLowerCase()}</b>. Clique no primeiro ponto para fechar.`
    : `${icon('info')} A <b>camada</b> filtra o mapa — mostra do nível Fazenda até o escolhido. Depois <b>Desenhe</b> ou <b>Importe</b> KMZ/KML.`;
  document.getElementById('fz-hint').className = 'fz-hintbar'+(on?' draw':'');
}

/* ---------- propriedades (criar / editar) ---------- */
function openProps(coords, nivel, editId){
  const editing = !!editId;
  const a = editing ? areaById(editId) : null;
  const nome = a?a.nome:'';
  const tipo = a?a.tipo:'Pasto';
  const lvl = a?a.nivel:nivel;
  const parentSug = a?a.parent:sugerirParent(coords, lvl);
  const m2 = areaM2(coords);

  const parentOpts = (selLvl, selParent)=>{
    const li=NIVEIS[selLvl].idx;
    const cand=AREAS.filter(x=>NIVEIS[x.nivel].idx<li && x.id!==editId);
    return `<option value="">— sem vínculo —</option>`+ORDEM.filter(nv=>NIVEIS[nv].idx<li).map(nv=>{
      const its=cand.filter(x=>x.nivel===nv); if(!its.length) return '';
      return `<optgroup label="${NIVEIS[nv].plural}">`+its.map(x=>`<option value="${x.id}" ${x.id===selParent?'selected':''}>${x.nome}</option>`).join('')+`</optgroup>`;
    }).join('');
  };
  const lvlOpts = ORDEM.map(nv=>`<option value="${nv}" ${nv===lvl?'selected':''}>${NIVEIS[nv].label}</option>`).join('');

  openModal({
    title: editing?'Editar área':'Nova área no mapa',
    sub: editing?`${a.nome}`:'Defina nome, camada e vínculo hierárquico do polígono desenhado.',
    body:`
      <div class="fz-area-readout">${icon('layers')} Área desenhada: ${fmtArea(m2)} <small>(${(m2/10000).toLocaleString('pt-BR',{maximumFractionDigits:2})} hectares)</small></div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field full"><label>Nome <span class="opt">*</span></label><input id="fz-nome" value="${nome}" placeholder="Ex.: Pasto Cabeceira 1"></div>
        <div class="field"><label>Camada</label><select id="fz-lvl" onchange="fzLvlChange()">${lvlOpts}</select></div>
        <div class="field" id="fz-tipo-wrap" style="${lvl==='local'?'':'display:none'}"><label>Tipo de local</label><select id="fz-tipo">${TIPOS_LOCAL.map(t=>`<option ${t===tipo?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="field full"><label>Vínculo <span class="opt">(área de nível superior)</span></label><select id="fz-parent">${parentOpts(lvl, parentSug)}</select><div class="hint">Sugerido automaticamente pela posição no mapa — ajuste se necessário.</div></div>
      </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close onclick="${editing?'':'fzCancelNew()'}">Cancelar</button><button class="btn primary" onclick="fzSaveProps('${editId||''}')">${icon('save')} ${editing?'Salvar':'Adicionar ao mapa'}</button>`,
    onClose: editing?null:fzCancelNew,
  });
  PENDING_COORDS = coords;
}
let PENDING_COORDS = null;
function fzLvlChange(){
  const lvl=document.getElementById('fz-lvl').value;
  document.getElementById('fz-tipo-wrap').style.display = lvl==='local'?'':'none';
  // recalcula opções de vínculo
  const li=NIVEIS[lvl].idx;
  const cand=AREAS.filter(x=>NIVEIS[x.nivel].idx<li);
  const sug=PENDING_COORDS?sugerirParent(PENDING_COORDS, lvl):null;
  document.getElementById('fz-parent').innerHTML =
    `<option value="">— sem vínculo —</option>`+ORDEM.filter(nv=>NIVEIS[nv].idx<li).map(nv=>{
      const its=cand.filter(x=>x.nivel===nv); if(!its.length) return '';
      return `<optgroup label="${NIVEIS[nv].plural}">`+its.map(x=>`<option value="${x.id}" ${x.id===sug?'selected':''}>${x.nome}</option>`).join('')+`</optgroup>`;
    }).join('');
}
function fzSaveProps(editId){
  const nome=val('fz-nome'), lvl=val('fz-lvl'), parent=val('fz-parent')||null;
  const tipo=lvl==='local'?val('fz-tipo'):null;
  if(!nome){ toast({title:'Informe o nome',kind:'crit'}); return; }
  if(editId){
    const a=areaById(editId);
    const lvlChanged = a.nivel!==lvl;
    Object.assign(a,{nome,nivel:lvl,parent,tipo});
    if(LAYERS[editId]){
      if(lvlChanged){ map.removeLayer(LAYERS[editId]); delete LAYERS[editId]; drawArea(a); }
      else { LAYERS[editId].setStyle(styleFor(a,a.id===SEL)); LAYERS[editId].setTooltipContent(a.nome); LAYERS[editId]._tooltip.options.className='fz-poly-label lvl-'+a.nivel; }
    }
    closeModal(); selectArea(editId);
    toast({title:'Área atualizada', msg:`${nome} · ${NIVEIS[lvl].label}.`});
  } else {
    const id='ar-'+Date.now();
    const a={id, nivel:lvl, nome, parent, tipo, coords:PENDING_COORDS, fonte:'desenho', visivel:true};
    AREAS.push(a); drawArea(a); SEL=id; renderPanel();
    closeModal(); PENDING_COORDS=null;
    toast({title:'Área adicionada', msg:`${nome} (${NIVEIS[lvl].label}) · ${fmtArea(areaM2(a.coords))}.`});
  }
}
function fzCancelNew(){ PENDING_COORDS=null; }
function fzEditProps(id){ const a=areaById(id); openProps(a.coords, a.nivel, id); }

/* ---------- editar forma (vértices) ---------- */
function toggleEditShape(){
  if(!SEL){ toast({title:'Selecione uma área', msg:'Escolha no painel a área cuja forma deseja ajustar.', kind:'warn'}); return; }
  const poly=LAYERS[SEL];
  const btn=document.getElementById('fz-editshape-btn');
  if(editingId){
    poly.editing.disable();
    const a=areaById(editingId);
    a.coords = poly.getLatLngs()[0].map(p=>[p.lat,p.lng]);
    editingId=null; btn.classList.remove('on'); btn.innerHTML=icon('alvo')+'Editar forma';
    renderPanel();
    toast({title:'Forma atualizada', msg:`${a.nome} · ${fmtArea(areaM2(a.coords))}.`});
  } else {
    poly.editing.enable(); editingId=SEL;
    btn.classList.add('on'); btn.innerHTML=icon('save')+'Concluir forma';
    toast({title:'Edição de forma', msg:'Arraste os vértices no mapa. Clique em “Concluir forma” ao terminar.'});
  }
}

/* ---------- importar KMZ / KML ---------- */
function pickFile(){ document.getElementById('fz-file').click(); }
async function onFile(input){
  const file=input.files[0]; if(!file) return;
  input.value='';
  try{
    let kmlText;
    if(/\.kmz$/i.test(file.name)){
      const zip=await JSZip.loadAsync(await file.arrayBuffer());
      const name=Object.keys(zip.files).find(f=>/\.kml$/i.test(f));
      if(!name){ toast({title:'KMZ sem KML',msg:'Não encontrei um arquivo .kml dentro do KMZ.',kind:'crit'}); return; }
      kmlText=await zip.files[name].async('text');
    } else if(/\.kml$/i.test(file.name)){
      kmlText=await file.text();
    } else { toast({title:'Formato não suportado',msg:'Envie um arquivo .kml ou .kmz.',kind:'crit'}); return; }

    const xml=new DOMParser().parseFromString(kmlText,'text/xml');
    const geo=toGeoJSON.kml(xml);
    const polys=[];
    geo.features.forEach(f=>{
      const g=f.geometry; if(!g) return;
      const nm=f.properties&&f.properties.name;
      if(g.type==='Polygon') polys.push({nome:nm, ring:g.coordinates[0]});
      else if(g.type==='MultiPolygon') g.coordinates.forEach((p,i)=>polys.push({nome:nm?(polys.length?`${nm} ${i+1}`:nm):null, ring:p[0]}));
    });
    if(!polys.length){ toast({title:'Nenhum polígono',msg:'O arquivo não contém áreas (polígonos) para importar.',kind:'warn'}); return; }

    const bounds=L.latLngBounds([]);
    polys.forEach((p,i)=>{
      const coords=p.ring.map(c=>[c[1],c[0]]);                 // GeoJSON é [lng,lat]
      if(coords.length>1 && coords[0][0]===coords[coords.length-1][0] && coords[0][1]===coords[coords.length-1][1]) coords.pop();
      const id='ar-'+Date.now()+'-'+i;
      const a={id, nivel:ACTIVE, nome:p.nome||`${NIVEIS[ACTIVE].label} importado ${i+1}`,
        parent:sugerirParent(coords,ACTIVE), tipo:ACTIVE==='local'?'Pasto':null,
        coords, fonte:'kml', visivel:true};
      AREAS.push(a); drawArea(a); coords.forEach(c=>bounds.extend(c));
    });
    renderPanel();
    if(bounds.isValid()) map.fitBounds(bounds,{padding:[40,40]});
    toast({title:'Importação concluída', msg:`${polys.length} área(s) adicionada(s) à camada ${NIVEIS[ACTIVE].plural}. Renomeie ou ajuste o vínculo no painel.`});
  }catch(err){
    toast({title:'Falha ao importar', msg:'Não consegui ler o arquivo. Verifique se é um KML/KMZ válido.', kind:'crit'});
    console.error(err);
  }
}

/* ---------- modal + toast (próprios desta página) ---------- */
let MODAL_ONCLOSE=null;
function openModal({title, sub, body, foot, onClose}){
  closeModal();
  MODAL_ONCLOSE=onClose||null;
  const back=document.createElement('div'); back.className='modal-back'; back.id='fz-modal';
  back.innerHTML=`<div class="modal"><div class="modal-head"><div><h3>${title}</h3>${sub?`<div class="m-sub">${sub}</div>`:''}</div><button class="x" data-close>${icon('x')}</button></div><div class="modal-body">${body}</div><div class="modal-foot form-foot" style="padding:14px 22px 20px">${foot||''}</div></div>`;
  document.body.appendChild(back);
  back.addEventListener('click',e=>{ if(e.target===back||e.target.closest('[data-close]')) closeModal(); });
}
function closeModal(){
  const m=document.getElementById('fz-modal');
  if(m){ if(MODAL_ONCLOSE){ const f=MODAL_ONCLOSE; MODAL_ONCLOSE=null; f(); } m.remove(); }
}
function toast({title,msg,kind}){
  let w=document.querySelector('.toast-wrap'); if(!w){ w=document.createElement('div'); w.className='toast-wrap'; document.body.appendChild(w); }
  const t=document.createElement('div'); t.className='toast'+(kind?(' '+kind):'');
  const ic = kind==='crit'?icon('alert'):kind==='warn'?icon('alert'):icon('check');
  t.innerHTML=`<span class="t-icon">${ic}</span><div><div class="t-title">${title}</div>${msg?`<div class="t-msg">${msg}</div>`:''}</div>`;
  w.appendChild(t); setTimeout(()=>{ t.style.transition='opacity .3s'; t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3600);
}
function val(id){ return document.getElementById(id)?.value?.trim() ?? ''; }

/* ---------- inicialização ---------- */
function initFazenda(){
  AREAS = (window.FZ_SEED||[]).map(a=>({...a, visivel:true}));
  map = L.map('fz-map', {zoomControl:false, attributionControl:true, center:window.FZ_CENTER, zoom:13});
  L.control.zoom({position:'bottomright'}).addTo(map);
  baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19, attribution:'Imagery © Esri'});
  baseOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {maxZoom:19, attribution:'© OpenStreetMap'});
  baseSat.addTo(map);
  L.control.scale({imperial:false, position:'bottomleft'}).addTo(map);

  AREAS.forEach(drawArea);
  const faz=LAYERS['faz-1']; if(faz) map.fitBounds(faz.getBounds(),{padding:[50,50]});

  map.on(L.Draw.Event.CREATED, (e)=>{
    const coords=e.layer.getLatLngs()[0].map(p=>[p.lat,p.lng]);
    drawHandler=null; setDrawHint(false);
    openProps(coords, ACTIVE, null);
  });
  map.on(L.Draw.Event.DRAWSTOP, ()=>{ if(drawHandler){ drawHandler=null; setDrawHint(false); } });

  setActive(ACTIVE);
  renderPanel();
  setTimeout(()=>map.invalidateSize(), 80);
  window.addEventListener('resize', ()=>map.invalidateSize());
}
function setBasemap(which){
  document.querySelectorAll('.fz-basemap button').forEach(b=>b.classList.toggle('on', b.dataset.bm===which));
  if(which==='sat'){ map.removeLayer(baseOSM); baseSat.addTo(map); }
  else { map.removeLayer(baseSat); baseOSM.addTo(map); }
}

Object.assign(window, {
  initFazenda, fzPick, fzSelect, fzFocus, fzToggleArea, fzToggleLayer, applyLevel,
  fzDelete, fzConfirmDelete, fzEditProps, fzSaveProps, fzLvlChange, fzCancelNew,
  setActive, startDraw, toggleEditShape, pickFile, onFile, setBasemap, closeModal,
});
document.addEventListener('DOMContentLoaded', initFazenda);
