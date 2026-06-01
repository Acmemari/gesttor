/* ===== RELATÓRIO POR MOVIMENTO ===== */
function viewRelMov(){
  const tipos = ['nascimento','compra','venda','morte','alocacao'];
  const rows = tipos.map(t=>{
    const ms = DB.movimentos.filter(m=>m.tipo===t);
    const total = ms.reduce((a,m)=>a+m.qtd,0);
    const pend = ms.filter(m=>m.status==='pendente').length;
    const concil = ms.filter(m=>m.status==='conciliado').length;
    const ni = ms.reduce((a,m)=>a+m.naoIdentificados,0);
    return `<tr>
      <td class="strong">${tipoLabel(t)}</td>
      <td class="num">${ms.length}</td>
      <td class="num">${total}</td>
      <td>${concil?`<span class="pill ok"><span class="d"></span>${concil} conciliado(s)</span>`:'<span class="sub-cell">—</span>'} ${pend?`<span class="pill pend"><span class="d"></span>${pend} pendente(s)</span>`:''}</td>
      <td class="num" style="color:${ni>0?'var(--orange)':'var(--ok)'}">${ni}</td>
    </tr>`;
  }).join('');
  const cob = coberturaGlobal();
  return pageHead({
    title:'Relatório por movimento',
    layer:'mesa',
    sub:'Um resumo por tipo de movimento, com o status de conciliação de cada um. A análise honra a dupla camada: estoque fechado, individual transparente.',
    actions:`<button class="btn" onclick="toast({title:'Exportação simulada',msg:'CSV gerado neste protótipo.'})">${icon('save')} Exportar</button>`,
  }) + `
  <div class="metrics">
    <div class="metric"><div class="m-label">${icon('layers')} Estoque total</div><div class="m-value">${brl(estoqueTotal())} <small>cab.</small></div></div>
    <div class="metric"><div class="m-label">${icon('relMov')} Movimentos lançados</div><div class="m-value">${DB.movimentos.length}</div></div>
    <div class="metric"><div class="m-label">${icon('ficha')} Cobertura individual</div><div class="m-value" style="color:${classifCobertura(cob).cls==='ok'?'var(--ok)':classifCobertura(cob).cls==='alerta'?'var(--alerta)':'var(--crit)'}">${cob.toFixed(1)}<small>%</small></div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>Resumo por tipo de movimento</h3></div>
    <table class="tbl"><thead><tr><th>Movimento</th><th>Lançamentos</th><th>Cabeças</th><th>Conciliação</th><th>Sem identificação</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>Saldo por categoria (derivado)</h3></div>
    ${panelNote('Saldo = estoque de partida + entradas − saídas. Nunca é a contagem da tabela de animais.')}
    <table class="tbl"><thead><tr><th>Categoria</th><th>Partida</th><th>Entradas</th><th>Saídas</th><th>Saldo atual</th></tr></thead>
    <tbody>${DB.categorias.map(c=>{
      const e=DB.movimentos.filter(m=>ENTRADAS.includes(m.tipo)).reduce((a,m)=>a+entradaContribCat(m,c.id),0);
      const s=DB.movimentos.filter(m=>m.categoria===c.id&&SAIDAS.includes(m.tipo)).reduce((a,m)=>a+m.qtd,0);
      return `<tr><td class="strong">${c.nome}</td><td class="num">${c.estoquePartida}</td><td class="num" style="color:var(--ok)">+${e}</td><td class="num" style="color:var(--crit)">−${s}</td><td class="num"><span class="derived">${icon('layers')} ${saldoCategoria(c.id)}</span></td></tr>`;
    }).join('')}${semCategoriaTotal()>0?`<tr style="background:#fffdf7"><td class="strong" style="color:var(--pend)">Sem categoria <span class="sub-cell">(a detalhar)</span></td><td class="num">—</td><td class="num" style="color:var(--ok)">+${semCategoriaTotal()}</td><td class="num">—</td><td class="num"><span class="pill pend"><span class="d"></span>${semCategoriaTotal()}</span></td></tr>`:''}</tbody></table>
  </div>`;
}

/* ===== GANHO DE PESO ===== */
function viewRelPeso(){
  const animais = animaisComPesagem().map(id=>({id, g:gmdAnimal(id)})).filter(x=>x.g).sort((a,b)=>b.g.gmd-a.g.gmd);
  const media = animais.reduce((a,x)=>a+x.g.gmd,0)/(animais.length||1);
  const maxGmd = Math.max(...animais.map(x=>x.g.gmd),0.001);
  const rows = animais.map((x,i)=>{
    const a=DB.animais.find(z=>z.id===x.id);
    const desvio = x.g.gmd-media;
    return `<tr>
      <td class="num">${i+1}º</td>
      <td><span class="mono" style="color:var(--blue);font-weight:600">${x.id}</span> ${a&&a.brinco?`<span class="sub-cell mono">${a.brinco}</span>`:''}</td>
      <td>${a?nomeCategoria(a.categoria):'—'}</td>
      <td class="num">${x.g.pesoFim} kg</td>
      <td class="num"><span class="derived">${icon('trend')} ${x.g.gmd.toFixed(3)}</span></td>
      <td><div class="cob-bar" style="width:120px"><i style="width:${(x.g.gmd/maxGmd*100).toFixed(0)}%;background:${x.g.gmd>=media?'var(--ok)':'var(--alerta)'}"></i></div></td>
      <td class="num" style="color:${desvio>=0?'var(--ok)':'var(--crit)'}">${desvio>=0?'+':''}${desvio.toFixed(3)}</td>
    </tr>`;
  }).join('');
  return pageHead({
    title:'Ganho de peso',
    layer:'individual',
    sub:'GMD, ranking e desvio em relação à média do grupo. Tudo calculado a partir das pesagens — a camada individual rica em análise.',
  }) + `
  <div class="metrics">
    <div class="metric"><div class="m-label">${icon('trend')} GMD médio do grupo</div><div class="m-value" style="color:var(--ok)">${media.toFixed(3)} <small>kg/dia</small></div></div>
    <div class="metric"><div class="m-label">${icon('scale')} Animais com curva</div><div class="m-value">${animais.length}</div><div class="m-sub">com ≥ 2 pesagens</div></div>
    <div class="metric"><div class="m-label">${icon('relPeso')} Melhor desempenho</div><div class="m-value">${animais[0]?animais[0].g.gmd.toFixed(3):'—'}</div><div class="m-sub">${animais[0]?animais[0].id:''}</div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>Ranking de GMD</h3></div>
    <table class="tbl"><thead><tr><th>#</th><th>Animal</th><th>Categoria</th><th>Peso atual</th><th>GMD</th><th>vs. melhor</th><th>Desvio da média</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

/* ===== REPRODUTIVO ===== */
function viewRelReprod(){
  const matrizes = repMatrizes();
  const rows = matrizes.map(id=>{
    const evs = DB.reproducao.filter(r=>r.matriz===id).sort((a,b)=>a.data.localeCompare(b.data));
    const a=DB.animais.find(x=>x.id===id);
    const diag = evs.find(e=>e.tipo==='Diagnóstico');
    const partos = evs.filter(e=>e.tipo==='Parto').length;
    const cobs = evs.filter(e=>e.tipo==='IATF'||e.tipo==='Cobertura').length;
    const st = diag ? (diag.resultado==='Prenhe'?'ok':'alerta') : 'neutral';
    const stLabel = diag ? diag.resultado : 'Sem diagnóstico';
    return `<tr>
      <td><span class="mono" style="color:var(--blue);font-weight:600">${id}</span> ${a&&a.brinco?`<span class="sub-cell mono">${a.brinco}</span>`:''}</td>
      <td class="num">${cobs}</td>
      <td><span class="pill ${st}"><span class="d"></span>${stLabel}</span></td>
      <td class="num">${partos}</td>
      <td class="sub-cell">${evs.map(e=>e.tipo).join(' → ')}</td>
    </tr>`;
  }).join('');
  const prenhez = taxaPrenhez();
  return pageHead({
    title:'Reprodutivo',
    layer:'individual',
    sub:'Taxa de prenhez, coberturas e partos por matriz. Visão de eficiência reprodutiva do rebanho.',
  }) + `
  <div class="metrics">
    <div class="metric"><div class="m-label">${icon('reproducao')} Taxa de prenhez</div><div class="m-value" style="color:${prenhez>=50?'var(--ok)':'var(--alerta)'}">${prenhez.toFixed(0)}<small>%</small></div></div>
    <div class="metric"><div class="m-label">${icon('user')} Matrizes</div><div class="m-value">${matrizes.length}</div></div>
    <div class="metric"><div class="m-label">${icon('relReprod')} Coberturas/IATF</div><div class="m-value">${DB.reproducao.filter(r=>r.tipo==='IATF'||r.tipo==='Cobertura').length}</div></div>
    <div class="metric"><div class="m-label">${icon('nascimento')} Partos</div><div class="m-value">${DB.reproducao.filter(r=>r.tipo==='Parto').length}</div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>Por matriz</h3></div>
    <table class="tbl"><thead><tr><th>Matriz</th><th>Coberturas</th><th>Diagnóstico</th><th>Partos</th><th>Linha do tempo</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}
