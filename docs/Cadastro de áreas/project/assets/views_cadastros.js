/* ===== HOME / Overview ===== */
function viewHome(){
  const est = estoqueTotal();
  const cob = coberturaGlobal();
  const cobC = classifCobertura(cob);
  const pend = pendenciasMesa();
  const ni = naoIdentificadosPendentes();
  const cobColor = cobC.cls==='ok'?'var(--ok)':cobC.cls==='alerta'?'var(--alerta)':'var(--crit)';

  const groups = NAV.filter(g=>g.items);
  const cards = groups.map(g=>`
    <div class="sb-group-label" style="padding-left:0;color:#9ca3af">${g.label}</div>
    <div class="card-grid" style="margin-bottom:8px">
      ${g.items.map(it=>moduleCard(it)).join('')}
    </div>`).join('');

  return pageHead({
    title:'Sistema Individual',
    sub:'Dupla camada de controle: o estoque é a soma dos movimentos; o individual enriquece, nunca trava. Selecione um módulo para lançar ou analisar.',
  }) + `
  <div class="metrics">
    <div class="metric">
      <div class="m-label">${icon('layers')} Estoque total <span class="layer estoque" style="padding:2px 7px"><span class="dot"></span></span></div>
      <div class="m-value">${brl(est)} <small>cab.</small></div>
      <div class="m-sub">Soma de partida + entradas − saídas</div>
    </div>
    <div class="metric">
      <div class="m-label">${icon('ficha')} Cobertura individual</div>
      <div class="m-value" style="color:${cobColor}">${cob.toFixed(1)}<small>%</small></div>
      <div class="m-sub">${cobC.label} · ${ni} sem identificação</div>
    </div>
    <div class="metric">
      <div class="m-label">${icon('mesa')} Pendências na Mesa</div>
      <div class="m-value" style="color:var(--orange)">${pend.length}</div>
      <div class="m-sub">${pend.length?'Cartões aguardando conciliação':'Tudo conciliado'}</div>
    </div>
    <div class="metric">
      <div class="m-label">${icon('lotes')} Lotes ativos</div>
      <div class="m-value">${DB.lotes.filter(l=>l.status==='Ativo').length}</div>
      <div class="m-sub">${DB.categorias.length} categorias · ${DB.locais.length} locais</div>
    </div>
  </div>
  ${cards}`;
}

function moduleCard(it){
  const fav = DB.favoritos.has(it.title);
  const badge = it.title==='Mesa de Conciliação' ? pendenciasMesa().length : 0;
  return `<button class="mod-card" onclick="go('${it.id}')">
    <div class="mc-top">
      <span class="mc-icon">${icon(it.icon)}</span>
      <span class="mc-star ${fav?'on':''}" onclick="event.stopPropagation();toggleFav('${it.title}',this)">${fav?icon('starFill'):icon('star')}</span>
    </div>
    <div class="mc-title">${it.title}</div>
    <div class="mc-desc">${it.desc||''}</div>
    <div class="mc-foot">
      ${it.layer?layerBadge(it.layer):''}
      ${badge?`<span class="mc-badge-count">${badge} pendência${badge>1?'s':''}</span>`:''}
    </div>
  </button>`;
}
function toggleFav(name, el){
  if(DB.favoritos.has(name)) DB.favoritos.delete(name); else DB.favoritos.add(name);
  el.classList.toggle('on'); el.innerHTML = DB.favoritos.has(name)?icon('starFill'):icon('star');
}

/* ===== CATEGORIA ANIMAL ===== */
function viewCategoria(){
  const rows = DB.categorias.map(c=>{
    const saldo = saldoCategoria(c.id);
    const entr = DB.movimentos.filter(m=>ENTRADAS.includes(m.tipo)).reduce((a,m)=>a+entradaContribCat(m,c.id),0);
    const said = DB.movimentos.filter(m=>m.categoria===c.id&&SAIDAS.includes(m.tipo)).reduce((a,m)=>a+m.qtd,0);
    return `<tr>
      <td class="strong">${c.nome}</td>
      <td>${c.sexo}</td>
      <td>${c.faixa}</td>
      <td class="num">${brl(c.estoquePartida)}</td>
      <td class="num" style="color:var(--ok)">+${entr}</td>
      <td class="num" style="color:var(--crit)">−${said}</td>
      <td class="num"><span class="derived">${icon('layers')} ${brl(saldo)}</span></td>
      <td class="row-actions"><button class="icon-btn" onclick="openNovaCategoria('${c.id}')">${icon('edit')}</button></td>
    </tr>`;
  }).join('');
  const semCat = semCategoriaTotal();
  const semCatRow = semCat>0 ? `<tr style="background:#fffdf7">
      <td class="strong" style="color:var(--pend)">Sem categoria <span class="sub-cell">(a detalhar)</span></td>
      <td>—</td><td>—</td><td class="num">—</td>
      <td class="num" style="color:var(--ok)">+${semCat}</td><td class="num">—</td>
      <td class="num"><span class="pill pend"><span class="d"></span>${semCat}</span></td><td></td>
    </tr>` : '';

  return pageHead({
    title:'Categoria animal',
    layer:'estoque',
    sub:'Define a relação inicial do rebanho (estoque de partida). O saldo é sempre recalculado a partir dos movimentos — não é editável.',
    actions:`<button class="btn primary" onclick="openNovaCategoria()">${icon('plus')} Nova categoria</button>`,
  }) + `
  <div class="panel">
    <div class="panel-head"><h3>Categorias do rebanho</h3><div class="ph-r">${searchBox('Buscar categoria…')}</div></div>
    ${panelNote('<b>Estoque de partida</b> é o ponto zero. O <b>saldo atual</b> = partida + entradas − saídas. Esse número nunca vem da contagem da tabela de animais.')}
    <table class="tbl">
      <thead><tr><th>Categoria</th><th>Sexo</th><th>Faixa de idade</th><th>Estoque de partida</th><th>Entradas</th><th>Saídas</th><th>Saldo atual (derivado)</th><th></th></tr></thead>
      <tbody>${rows}${semCatRow}</tbody>
    </table>
  </div>`;
}
function openNovaCategoria(id){
  const c = id?DB.categorias.find(x=>x.id===id):null;
  openModal({
    title: c?'Editar categoria':'Nova categoria',
    sub:'O estoque de partida só vale na criação. Depois, o saldo é movido por lançamentos.',
    body:`<div class="form-grid">
      <div class="field full"><label>Nome da categoria</label><input id="f-nome" value="${c?c.nome:''}" placeholder="Ex.: Garrote"></div>
      <div class="field"><label>Sexo</label><select id="f-sexo"><option ${c&&c.sexo==='Macho'?'selected':''}>Macho</option><option ${c&&c.sexo==='Fêmea'?'selected':''}>Fêmea</option><option ${c&&c.sexo==='Misto'?'selected':''}>Misto</option></select></div>
      <div class="field"><label>Faixa de idade</label><input id="f-faixa" value="${c?c.faixa:''}" placeholder="12–24 meses"></div>
      <div class="field full"><label>Estoque de partida <span class="opt">(cabeças)</span></label><input id="f-part" type="number" value="${c?c.estoquePartida:''}" placeholder="0"><div class="hint">Relação inicial do rebanho nesta categoria.</div></div>
    </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="salvarCategoria('${id||''}')">${icon('save')} Salvar</button>`,
  });
}
function salvarCategoria(id){
  const nome=val('f-nome'), sexo=val('f-sexo'), faixa=val('f-faixa'), part=+val('f-part')||0;
  if(!nome){ toast({title:'Informe o nome',kind:'crit'}); return; }
  if(id){ const c=DB.categorias.find(x=>x.id===id); Object.assign(c,{nome,sexo,faixa,estoquePartida:part}); }
  else DB.categorias.push({id:'cat-'+Date.now(),nome,sexo,faixa,estoquePartida:part});
  closeModal(); render(); toast({title:'Categoria salva',msg:`${nome} · estoque de partida ${part} cab.`});
}

/* ===== LOCAL ===== */
function viewLocal(){
  const rows = DB.locais.map(l=>`<tr>
    <td class="strong">${l.nome}</td>
    <td><span class="tag ${l.tipo==='Manejo'?'':'green'}">${l.tipo}</span></td>
    <td>${l.area}</td>
    <td class="row-actions"><button class="icon-btn" onclick="openNovoLocal('${l.id}')">${icon('edit')}</button></td>
  </tr>`).join('');
  return pageHead({
    title:'Local',
    layer:'estoque',
    sub:'Pastos e retiros da fazenda. O local é estrutura física — a posição do animal nele é estado derivado dos movimentos, nunca editada solta.',
    actions:`<button class="btn primary" onclick="openNovoLocal()">${icon('plus')} Novo local</button>`,
  }) + `
  <div class="panel">
    <div class="panel-head"><h3>Pastos e retiros</h3></div>
    <table class="tbl">
      <thead><tr><th>Local</th><th>Tipo</th><th>Área</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
function openNovoLocal(id){
  const l = id?DB.locais.find(x=>x.id===id):null;
  openModal({title:l?'Editar local':'Novo local',body:`<div class="form-grid">
    <div class="field full"><label>Nome</label><input id="l-nome" value="${l?l.nome:''}" placeholder="Ex.: Pasto Baixão"></div>
    <div class="field"><label>Tipo</label><select id="l-tipo"><option ${l&&l.tipo==='Pasto'?'selected':''}>Pasto</option><option ${l&&l.tipo==='Manejo'?'selected':''}>Manejo</option><option ${l&&l.tipo==='Retiro'?'selected':''}>Retiro</option></select></div>
    <div class="field"><label>Área</label><input id="l-area" value="${l?l.area:''}" placeholder="50 ha"></div>
  </div>`,foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="salvarLocal('${id||''}')">${icon('save')} Salvar</button>`});
}
function salvarLocal(id){
  const nome=val('l-nome'),tipo=val('l-tipo'),area=val('l-area');
  if(!nome){toast({title:'Informe o nome',kind:'crit'});return;}
  if(id){Object.assign(DB.locais.find(x=>x.id===id),{nome,tipo,area});}
  else DB.locais.push({id:'loc-'+Date.now(),nome,tipo,area});
  closeModal();render();toast({title:'Local salvo',msg:nome});
}

/* ===== LOTES ===== */
function viewLotes(){
  const finCls = {Cria:'',Recria:'',Terminação:'','Outra Finalidade':''};
  const rows = DB.lotes.map(l=>{
    const saldo = saldoLote(l.id);
    return `<tr>
      <td><span class="mono">${l.codigo}</span></td>
      <td class="strong">${l.nome}</td>
      <td><span class="tag ${finCls[l.finalidade]||''}">${l.finalidade}</span></td>
      <td><span class="pill ${l.status==='Ativo'?'ok':'neutral'}"><span class="d"></span>${l.status}</span></td>
      <td class="num"><span class="derived">${icon('layers')} ${brl(saldo)}</span></td>
      <td class="row-actions"><button class="icon-btn" onclick="openNovoLote('${l.id}')">${icon('edit')}</button></td>
    </tr>`;
  }).join('');
  return pageHead({
    title:'Lotes',
    layer:'estoque',
    sub:'Agrupamento lógico de animais por finalidade. O lote é identidade — não tem campo de local nem de animais. Quantos estão nele é derivado dos movimentos de alocação.',
    actions:`<button class="btn primary" onclick="openNovoLote()">${icon('plus')} Novo lote</button>`,
  }) + `
  <div class="panel">
    <div class="panel-head"><h3>Lotes da fazenda</h3></div>
    ${panelNote('O lote guarda apenas <b>código, finalidade e status</b>. A população do lote é o saldo derivado das alocações — não se digita animal no cadastro do lote.')}
    <table class="tbl">
      <thead><tr><th>Código</th><th>Lote</th><th>Finalidade</th><th>Status</th><th>População (derivada)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
function openNovoLote(id){
  const l=id?DB.lotes.find(x=>x.id===id):null;
  openModal({title:l?'Editar lote':'Novo lote',sub:'Identidade do lote. Sem local, sem lista de animais — isso é derivado.',body:`<div class="form-grid">
    <div class="field"><label>Código</label><input id="lo-cod" value="${l?l.codigo:''}" placeholder="RC-01"></div>
    <div class="field"><label>Nome</label><input id="lo-nome" value="${l?l.nome:''}" placeholder="Recria Machos"></div>
    <div class="field"><label>Finalidade</label><select id="lo-fin">${['Cria','Recria','Terminação','Outra Finalidade'].map(f=>`<option ${l&&l.finalidade===f?'selected':''}>${f}</option>`).join('')}</select></div>
    <div class="field"><label>Status</label><select id="lo-st"><option ${l&&l.status==='Ativo'?'selected':''}>Ativo</option><option ${l&&l.status==='Encerrado'?'selected':''}>Encerrado</option></select></div>
  </div>`,foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="salvarLote('${id||''}')">${icon('save')} Salvar</button>`});
}
function salvarLote(id){
  const codigo=val('lo-cod'),nome=val('lo-nome'),finalidade=val('lo-fin'),status=val('lo-st');
  if(!codigo){toast({title:'Informe o código',kind:'crit'});return;}
  if(id){Object.assign(DB.lotes.find(x=>x.id===id),{codigo,nome,finalidade,status});}
  else DB.lotes.push({id:'lote-'+Date.now(),codigo,nome,finalidade,status});
  closeModal();render();toast({title:'Lote salvo',msg:`${codigo} · ${finalidade}`});
}

/* ===== FICHA INDIVIDUAL ===== */
function viewFicha(){
  const brincoCell = a => {
    if(a.statusBrinco==='ok') return `<span class="mono">${a.brinco}</span>`;
    if(a.statusBrinco==='sem') return `<span class="pill pend"><span class="d"></span>Sem identificação</span>`;
    if(a.statusBrinco==='duplicado') return `<span class="mono">${a.brinco}</span> <span class="pill alerta"><span class="d"></span>Duplicado</span>`;
  };
  const rows = DB.animais.map(a=>{
    const lote = loteAtualAnimal(a.id);
    return `<tr style="cursor:pointer" onclick="openFicha('${a.id}')">
      <td><span class="mono" style="color:var(--blue);font-weight:600">${a.id}</span></td>
      <td>${brincoCell(a)}</td>
      <td>${a.sexo}</td>
      <td>${a.raca}</td>
      <td>${nomeCategoria(a.categoria)}</td>
      <td>${lote?`<span class="derived">${icon('layers')} ${nomeLote(lote)}</span>`:'<span class="sub-cell">—</span>'}</td>
      <td>${a.vivo?'<span class="pill ok"><span class="d"></span>Ativo</span>':'<span class="pill neutral"><span class="d"></span>Baixado</span>'}</td>
    </tr>`;
  }).join('');
  const semId = DB.animais.filter(a=>a.statusBrinco==='sem').length;
  return pageHead({
    title:'Ficha Animal',
    layer:'individual',
    sub:'O ID interno é a chave permanente. Brinco e RFID são atributos versionados — podem faltar ou duplicar sem travar o animal. O lote atual é derivado do último movimento.',
    actions:`<button class="btn" onclick="openFichaCampos()">${icon('sliders')} Configurar campos</button><button class="btn primary" onclick="openNovoAnimal()">${icon('plus')} Nova ficha</button>`,
  }) + `
  ${semId?`<div class="legend"><span style="color:var(--pend)">${icon('info')} ${semId} animal(is) sem identificação — estado normal, vira pendência na Mesa, nunca erro.</span></div>`:''}
  <div class="panel">
    <div class="panel-head"><h3>Animais identificados</h3><div class="ph-r">${searchBox('ID, brinco, raça…')}</div></div>
    <table class="tbl">
      <thead><tr><th>ID interno</th><th>Brinco</th><th>Sexo</th><th>Raça</th><th>Categoria</th><th>Lote atual (derivado)</th><th>Situação</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
function openNovoAnimal(){
  openFichaNova();
}

function val(id){ return document.getElementById(id)?.value?.trim() ?? ''; }
