/* ===== GESTÃO DE LOTES 2 — lote como identidade + 3 controles (evento → estado → histórico) ===== */
const LT = {
  locais: ['Retiro Sede','Retiro Brejo','Pasto Cabeceira','Pasto Baixão','Confinamento','Curral de Manejo'],
  lotes: [
    { id:'L1', codigo:'RC-01', nome:'Recria Machos 24', finalidade:'Recria', sistema:'Pasto + suplemento', status:'ativo', abertura:'2025-11-10' },
    { id:'L2', codigo:'TM-02', nome:'Terminação Confinamento', finalidade:'Terminação', sistema:'Confinamento', status:'ativo', abertura:'2026-01-15' },
    { id:'L3', codigo:'CR-03', nome:'Matrizes IATF', finalidade:'Cria', sistema:'Pasto', status:'ativo', abertura:'2025-09-01', obs:'Lote núcleo de matrizes Nelore PO — prioridade para IATF na próxima estação.' },
    { id:'L4', codigo:'TM-04', nome:'Terminação Safra 24/25', finalidade:'Terminação', sistema:'Pasto', status:'encerrado', abertura:'2025-08-01', encerramento:'2026-02-20' },
  ],
  // eventos — cada controle tem seu tipo
  transferencias: [
    { id:'t1', lote:'L1', de:'Curral de Manejo', para:'Retiro Sede', tipoLocal:'Retiro', data:'2025-11-10', resp:'Antonio C.' },
    { id:'t2', lote:'L1', de:'Retiro Sede', para:'Pasto Cabeceira', tipoLocal:'Pasto', data:'2026-02-05', resp:'Equipe Campo' },
    { id:'t3', lote:'L2', de:'Curral de Manejo', para:'Confinamento', tipoLocal:'Confinamento', data:'2026-01-15', resp:'Antonio C.' },
    { id:'t4', lote:'L3', de:'Curral de Manejo', para:'Retiro Brejo', tipoLocal:'Retiro', data:'2025-09-01', resp:'Antonio C.' },
  ],
  manejos: [
    { id:'m1', lote:'L1', dim:'nutricional', plano:'Adaptação — volumoso + 0,5% PV', data:'2025-11-10', resp:'Nutricionista' },
    { id:'m2', lote:'L1', dim:'nutricional', plano:'Crescimento — pasto + proteinado', data:'2026-02-05', resp:'Nutricionista' },
    { id:'m3', lote:'L2', dim:'nutricional', plano:'Adaptação confinamento', data:'2026-01-15', resp:'Nutricionista' },
    { id:'m4', lote:'L2', dim:'nutricional', plano:'Terminação — alto grão 88% NDT', data:'2026-03-20', resp:'Nutricionista' },
    { id:'m5', lote:'L3', dim:'reprodutivo', plano:'Estação de monta aberta — IATF D0', data:'2026-01-10', resp:'Veterinário' },
    { id:'m6', lote:'L3', dim:'nutricional', plano:'Mineral reprodução', data:'2025-09-01', resp:'Nutricionista' },
  ],
  alocacoes: [
    { id:'a1', lote:'L1', de:null, qtd:84, categoria:'Garrote', data:'2025-11-10', resp:'Antonio C.', naoIdent:0 },
    { id:'a2', lote:'L1', de:'L1', qtd:0, categoria:'', data:'', resp:'', naoIdent:0 },
    { id:'a3', lote:'L2', de:null, qtd:120, categoria:'Boi gordo', data:'2026-01-15', resp:'Antonio C.', naoIdent:6 },
    { id:'a4', lote:'L2', de:'L1', qtd:30, categoria:'Garrote', data:'2026-03-18', resp:'Antonio C.', naoIdent:0 },
    { id:'a5', lote:'L3', de:null, qtd:140, categoria:'Vaca matriz', data:'2025-09-01', resp:'Antonio C.', naoIdent:0 },
  ],
  // eventos reprodutivos por lote (fase do processo de cria)
  repro: [
    { id:'r1', lote:'L3', fase:'Estação de monta', detalhe:'IATF D0 — 140 matrizes protocoladas', data:'2026-01-10', resp:'Veterinário' },
    { id:'r2', lote:'L3', fase:'Diagnóstico de gestação', detalhe:'112 prenhes (80%) · 28 vazias', data:'2026-02-20', resp:'Veterinário' },
  ],
};
let LT_SEL = 'L1';

function ltLote(id){ return LT.lotes.find(l=>l.id===id); }
function ltLast(arr, loteId, pred){ return arr.filter(e=>e.lote===loteId && (!pred||pred(e))).sort((a,b)=>(b.data||'').localeCompare(a.data||''))[0]; }
function ltLocalAtual(id){ const t=ltLast(LT.transferencias,id); return t?t.para:'—'; }
function ltPlanoNutri(id){ const m=ltLast(LT.manejos,id,e=>e.dim==='nutricional'); return m?m.plano:'—'; }
function ltProtocolo(id){ const m=ltLast(LT.manejos,id,e=>e.dim==='reprodutivo'); return m?m.plano:null; }
function ltFaseRepro(id){ const r=ltLast(LT.repro,id); return r?r.fase:'Sem evento reprodutivo'; }
function ltReproResumo(id){ const r=ltLast(LT.repro,id); return r?`<span class="sub-cell">${r.detalhe} · ${fmtData(r.data)}</span>`:'<span class="sub-cell">Registre a estação de monta para começar</span>'; }
function ltSaldo(id){ return LT.alocacoes.filter(a=>a.lote===id).reduce((s,a)=>s+a.qtd,0) - LT.alocacoes.filter(a=>a.de===id&&a.lote!==id).reduce((s,a)=>s+a.qtd,0); }
function ltComposicao(id){
  const map={};
  LT.alocacoes.filter(a=>a.lote===id && a.qtd>0).forEach(a=>{ map[a.categoria]=(map[a.categoria]||0)+a.qtd; });
  LT.alocacoes.filter(a=>a.de===id && a.lote!==id).forEach(a=>{ map[a.categoria]=(map[a.categoria]||0)-a.qtd; });
  return Object.entries(map).filter(([,q])=>q>0);
}
function ltPendencias(id){ return LT.alocacoes.filter(a=>a.lote===id).reduce((s,a)=>s+(a.naoIdent||0),0); }
function ltTimeline(id){
  const ev=[];
  LT.transferencias.filter(t=>t.lote===id).forEach(t=>ev.push({data:t.data,tipo:'transf',icon:'transferir',cls:'azul',titulo:`Transferência de lote → ${t.para}`,meta:`${t.de} → ${t.para} · ${t.tipoLocal}`,resp:t.resp}));
  LT.manejos.filter(m=>m.lote===id).forEach(m=>ev.push({data:m.data,tipo:'manejo',icon:m.dim==='reprodutivo'?'reproducao':'regime',cls:m.dim==='reprodutivo'?'roxo':'verde',titulo:m.dim==='reprodutivo'?'Evento reprodutivo':'Mudança de regime',meta:m.plano,resp:m.resp}));
  LT.alocacoes.filter(a=>a.lote===id && a.qtd>0 && a.data).forEach(a=>ev.push({data:a.data,tipo:'aloc',icon:'gestaoLotes',cls:'laranja',titulo:`Alocação — +${a.qtd} ${a.categoria}`,meta:a.de?`de outro lote`:'entrada no lote'+(a.naoIdent?` · ${a.naoIdent} sem id.`:''),resp:a.resp}));
  LT.alocacoes.filter(a=>a.de===id && a.lote!==id && a.qtd>0).forEach(a=>ev.push({data:a.data,tipo:'aloc',icon:'gestaoLotes',cls:'laranja',titulo:`Alocação — −${a.qtd} ${a.categoria}`,meta:`saída para ${ltLote(a.lote)?.codigo||'outro lote'}`,resp:a.resp}));
  LT.repro.filter(r=>r.lote===id).forEach(r=>ev.push({data:r.data,tipo:'repro',icon:'reproducao',cls:'verde',titulo:`Reprodução — ${r.fase}`,meta:r.detalhe,resp:r.resp}));
  return ev.sort((a,b)=>(b.data||'').localeCompare(a.data||''));
}
const FIN_CLS = { Cria:'', Recria:'', Terminação:'', 'Outra Finalidade':'' };

function ltAnimaisVinculados(id){
  const ins=[]; const outs=new Set();
  LT.alocacoes.filter(a=>a.lote===id && a.animais).forEach(a=>a.animais.forEach(x=>ins.push(x)));
  LT.alocacoes.filter(a=>a.de===id && a.lote!==id && a.animais).forEach(a=>a.animais.forEach(x=>outs.add(x)));
  return [...new Set(ins)].filter(x=>!outs.has(x));
}
/* lote atual de um animal (por ID) — null = ainda sem lote */
function ltLoteDoAnimal(aid){
  for(const l of LT.lotes){ if(ltAnimaisVinculados(l.id).includes(aid)) return l; }
  return null;
}
function viewGestaoLotes2(){
  const lote = ltLote(LT_SEL) || LT.lotes[0];
  return pageHead({
    title:'Gestão de Lotes',
  }) + `
  <div class="lt-layout">
    <aside class="lt-list">
      <div class="lt-list-head">
        <span>Lotes</span>
        <button class="btn sm primary" onclick="ltNovoLote()">${icon('plus')} Novo lote</button>
      </div>
      ${LT.lotes.map(ltCard).join('')}
    </aside>
    <section class="lt-detail">${ltDetail(lote)}</section>
  </div>`;
}

function ltCard(l){
  const sel = l.id===LT_SEL;
  const saldo = ltSaldo(l.id);
  const pend = ltPendencias(l.id);
  return `<button class="lt-item ${sel?'sel':''} ${l.status==='encerrado'?'enc':''}" onclick="ltSelect('${l.id}')">
    <div class="lt-item-top">
      <span class="mono lt-cod">${l.codigo}</span>
      <span class="tag ${FIN_CLS[l.finalidade]||''}">${l.finalidade}</span>
      ${l.status==='encerrado'?`<span class="pill neutral" style="margin-left:auto"><span class="d"></span>Encerrado</span>`:''}
    </div>
    <div class="lt-item-nome">${l.nome}</div>
    <div class="lt-item-meta">
      <span>${icon('layers')} ${saldo} cab.</span>
      <span>${icon('local')} ${ltLocalAtual(l.id)}</span>
      ${pend?`<span class="lt-pend">${icon('alert')} ${pend}</span>`:''}
    </div>
  </button>`;
}
function ltSelect(id){ LT_SEL=id; render(); }

function ltDetail(l){
  if(!l) return '<div class="empty">Selecione um lote.</div>';
  const saldo = ltSaldo(l.id);
  const comp = ltComposicao(l.id);
  const pend = ltPendencias(l.id);
  const protocolo = ltProtocolo(l.id);
  const vinc = ltAnimaisVinculados(l.id);
  const enc = l.status==='encerrado';
  const vincHtml = vinc.length
    ? `<div class="lt-cc-ids"><div class="lt-cc-ids-head">${icon('brinco')} ${vinc.length} por ID:</div>${vinc.slice(0,8).map(x=>`<span class="tag" style="cursor:pointer" onclick="openFicha&&openFicha('${x}')">${x}</span>`).join('')}${vinc.length>8?`<span class="sub-cell">+${vinc.length-8}</span>`:''}</div>`
    : `<div class="lt-cc-ids"><span class="sub-cell">Nenhum animal vinculado por ID ainda.</span></div>`;
  return `
  <div class="lt-ficha-head">
    <div class="lt-fh-id">
      <span class="lt-fh-cod mono">${l.codigo}</span>
      <div>
        <div class="lt-fh-nome">${l.nome}</div>
        <div class="lt-fh-sub">${icon('alvo')} Finalidade: <b>${l.finalidade}</b> · aberto em ${fmtData(l.abertura)}</div>
        ${l.obs?`<div class="lt-fh-obs">${icon('info')} ${l.obs}</div>`:''}
      </div>
    </div>
    <div class="lt-fh-actions">
      ${enc?`<span class="pill neutral"><span class="d"></span>Encerrado em ${fmtData(l.encerramento)}</span>`
           :`<button class="btn sm" onclick="ltEditarNome('${l.id}')">${icon('edit')} Editar</button>
             <button class="btn sm danger" onclick="ltEncerrar('${l.id}')">${icon('encerrar')} Encerrar</button>`}
    </div>
  </div>

  <div class="lt-id-note">${icon('info')} <span><b>Finalidade</b> é a identidade do lote — não muda enquanto ele viver. Os três estados abaixo são <b>derivados</b> dos eventos: você não edita, você lança o evento.</span></div>

  <div class="lt-controls ${l.finalidade==='Cria'?'lt-controls-4':''}">
    ${ltControlCard({
      icon:'gestaoLotes', cls:'laranja', titulo:'Composição', pergunta:'Quais animais estão nele?',
      estado:`<div class="lt-cc-main">${saldo} <small>cab.</small></div>
        <div class="lt-cc-tags">${comp.length?comp.map(([c,q])=>`<span class="tag">${c}: ${q}</span>`).join(''):'<span class="sub-cell">Sem animais</span>'}</div>
        ${vincHtml}
        ${pend?`<div class="lt-cc-pend">${icon('alert')} ${pend} sem identificação · pendência na Mesa</div>`:''}`,
      btn:enc?'':`<button class="btn sm primary" onclick="ltRemanejar('${l.id}')">${icon('gestaoLotes')} Remanejar animais</button>
        <button class="btn sm" onclick="ltIncluirPorId('${l.id}')">${icon('brinco')} Incluir por ID</button>`,
      evento:'Movimento de Alocação'
    })}
    ${ltControlCard({
      icon:'local', cls:'azul', titulo:'Localização', pergunta:'Onde ele está?',
      estado:`<div class="lt-cc-main lt-cc-text">${ltLocalAtual(l.id)}</div>
        <div class="lt-cc-tags"><span class="sub-cell">Local atual derivado da última transferência</span></div>`,
      btn:enc?'':`<button class="btn sm primary" onclick="ltTransferir('${l.id}')">${icon('transferir')} Transferir lote</button>`,
      evento:'Transferência de Lote'
    })}
    ${ltControlCard({
      icon:'regime', cls:'verde', titulo:'Regime nutricional', pergunta:'Como é alimentado?',
      estado:`<div class="lt-cc-main lt-cc-text">${ltPlanoNutri(l.id)}</div>
        ${protocolo?`<div class="lt-cc-tags"><span class="tag">${icon('reproducao')} ${protocolo}</span></div>`:'<div class="lt-cc-tags"><span class="sub-cell">Sem protocolo reprodutivo ativo</span></div>'}`,
      btn:enc?'':`<button class="btn sm primary" onclick="ltMudarRegime('${l.id}')">${icon('regime')} Mudar regime</button>`,
      evento:'Evento de Manejo'
    })}
    ${l.finalidade==='Cria' ? ltControlCard({
      icon:'reproducao', cls:'verde', titulo:'Processo Reprodutivo', pergunta:'Em que fase reprodutiva está?',
      estado:`<div class="lt-cc-main lt-cc-text">${ltFaseRepro(l.id)}</div>
        <div class="lt-cc-tags">${ltReproResumo(l.id)}</div>`,
      btn:enc?'':`<button class="btn sm primary" onclick="ltEventoRepro('${l.id}')">${icon('reproducao')} Registrar evento</button>`,
      evento:'Evento Reprodutivo'
    }) : ''}
  </div>

  <div class="panel" style="margin-top:4px">
    <div class="panel-head"><h3>${icon('historico')} Linha do tempo do lote</h3><span class="sub-cell" style="margin-left:auto">A biografia do lote — base de toda análise de desempenho</span></div>
    <div class="lt-timeline">${ltTimelineHtml(l.id)}</div>
  </div>`;
}

function ltControlCard({icon:ic, cls, titulo, pergunta, estado, btn, evento}){
  return `<div class="lt-cc ${cls}">
    <div class="lt-cc-head"><span class="lt-cc-ic">${icon(ic)}</span><div><div class="lt-cc-title">${titulo}</div><div class="lt-cc-q">${pergunta}</div></div></div>
    <div class="lt-cc-body">${estado}</div>
    <div class="lt-cc-foot">
      <span class="lt-cc-evento">${icon('relogio')} muda por: <b>${evento}</b></span>
      ${btn}
    </div>
  </div>`;
}

function ltTimelineHtml(id){
  const ev = ltTimeline(id);
  if(!ev.length) return '<div class="empty" style="padding:24px">Sem eventos.</div>';
  return `<div class="lt-tl">${ev.map((e,i)=>`
    <div class="lt-tl-item">
      <div class="lt-tl-rail"><span class="lt-tl-dot ${e.cls}">${icon(e.icon)}</span>${i<ev.length-1?'<span class="lt-tl-line"></span>':''}</div>
      <div class="lt-tl-body">
        <div class="lt-tl-top"><span class="lt-tl-titulo">${e.titulo}</span><span class="lt-tl-data">${fmtData(e.data)}</span></div>
        <div class="lt-tl-meta">${e.meta}</div>
        <div class="lt-tl-resp">${icon('user')} ${e.resp}</div>
      </div>
    </div>`).join('')}</div>`;
}

/* ===== Eventos (modais) ===== */
function ltRemanejar(id, modoInicial){
  const l=ltLote(id);
  LT_MODO_REMANEJO = modoInicial==='id'?'id':'grupo'; LT_REMANEJO_SEL=new Set();
  const outros = LT.lotes.filter(x=>x.id!==id && x.status!=='ativo'?false:x.id!==id);
  openModal({
    title:'Remanejar animais', sub:`Movimento de Alocação · ${l.codigo} · ${l.nome}`,
    body:`<div class="lt-decide">${icon('info')} <span><b>Mudou o jeito de fazer? Evento.</b> Mudou o que se quer fazer? Lote novo. Remanejo move animais entre lotes de finalidades diferentes.</span></div>
      <div class="lt-modo">
        <button class="lt-modo-btn on" onclick="ltSetModoRemanejo('grupo')" id="lt-modo-grupo">${icon('layers')} Por quantidade (grupo)</button>
        <button class="lt-modo-btn" onclick="ltSetModoRemanejo('id')" id="lt-modo-id">${icon('brinco')} Por ID do animal</button>
      </div>
      <div class="form-grid" style="margin-bottom:14px">
        <div class="field"><label>Sentido</label><select id="lt-sent"><option value="in">Entrar no lote ${l.codigo}</option><option value="out">Sair para outro lote</option></select></div>
        <div class="field"><label>Outro lote / origem</label><select id="lt-outro"><option value="__none">Sem lote (entrada nova)</option>${LT.lotes.filter(x=>x.id!==id).map(x=>`<option value="${x.id}">${x.codigo} · ${x.finalidade}</option>`).join('')}</select></div>
      </div>
      <div id="lt-modo-grupo-body">
        <div class="form-grid">
          <div class="field"><label>Categoria</label><select id="lt-cat">${['Garrote','Boi gordo','Novilha','Vaca matriz','Bezerro(a)'].map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="field"><label>Quantidade</label><input id="lt-qtd" type="number" min="1" value="10"></div>
          <div class="field"><label>Identificados agora <span class="opt">(opcional)</span></label><input id="lt-ident" type="number" min="0" value="0"><div class="hint">O que faltar vira pendência na Mesa — nunca bloqueia.</div></div>
        </div>
      </div>
      <div id="lt-modo-id-body" style="display:none">
        <div class="field full" style="margin-bottom:10px"><label>Buscar animal <span class="opt">(ID, brinco ou raça)</span></label>
          <div class="search"><span>${icon('search')}</span><input id="lt-an-busca" placeholder="Ex.: A-0001, 7421…" oninput="ltFiltrarAnimais()"></div>
        </div>
        <label class="lt-an-filtro"><input type="checkbox" id="lt-an-semlote" onchange="ltFiltrarAnimais()"> Mostrar somente animais sem lote</label>
        <div class="lt-an-list" id="lt-an-list">${ltAnimalPickerRows('')}</div>
        <div class="lt-an-sel" id="lt-an-sel"><span class="sub-cell">Nenhum animal selecionado.</span></div>
      </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="ltSalvarRemanejo('${id}')">${icon('save')} Lançar alocação</button>`,
  });
  LT_REMANEJO_SEL = new Set();
  if(LT_MODO_REMANEJO==='id') ltSetModoRemanejo('id');
}
function ltIncluirPorId(id){ ltRemanejar(id, 'id'); }
let LT_MODO_REMANEJO = 'grupo';
let LT_REMANEJO_SEL = new Set();
function ltSetModoRemanejo(m){
  LT_MODO_REMANEJO = m;
  document.getElementById('lt-modo-grupo').classList.toggle('on', m==='grupo');
  document.getElementById('lt-modo-id').classList.toggle('on', m==='id');
  document.getElementById('lt-modo-grupo-body').style.display = m==='grupo'?'':'none';
  document.getElementById('lt-modo-id-body').style.display = m==='id'?'':'none';
}
function ltAnimalPickerRows(q){
  const term = (q||'').toLowerCase();
  const soSemLote = document.getElementById('lt-an-semlote')?.checked;
  const animais = DB.animais.filter(a=>a.vivo).filter(a=>{
    if(!term) return true;
    return a.id.toLowerCase().includes(term) || (a.brinco||'').toLowerCase().includes(term) || (a.raca||'').toLowerCase().includes(term);
  }).filter(a=> soSemLote ? !ltLoteDoAnimal(a.id) : true);
  if(!animais.length) return `<div class="empty" style="padding:18px">Nenhum animal encontrado.</div>`;
  return animais.map(a=>{
    const sel = LT_REMANEJO_SEL && LT_REMANEJO_SEL.has(a.id);
    const brinco = a.brinco?`<span class="mono">${a.brinco}</span>`:'<span class="pill pend" style="padding:1px 7px"><span class="d"></span>sem id.</span>';
    const loteAtual = ltLoteDoAnimal(a.id);
    const loteTag = loteAtual
      ? `<span class="tag">${loteAtual.codigo}</span>`
      : `<span class="pill neutral" style="padding:1px 7px"><span class="d"></span>sem lote</span>`;
    return `<label class="lt-an-row ${sel?'on':''}">
      <input type="checkbox" ${sel?'checked':''} onchange="ltToggleAnimal('${a.id}')">
      <span class="mono lt-an-id">${a.id}</span>
      <span class="lt-an-br">${brinco}</span>
      <span class="lt-an-meta">${a.sexo} · ${a.raca} · ${nomeCategoria(a.categoria)}</span>
      ${loteTag}
    </label>`;
  }).join('');
}
function ltFiltrarAnimais(){
  const q=document.getElementById('lt-an-busca')?.value||'';
  document.getElementById('lt-an-list').innerHTML = ltAnimalPickerRows(q);
}
function ltToggleAnimal(aid){
  if(LT_REMANEJO_SEL.has(aid)) LT_REMANEJO_SEL.delete(aid); else LT_REMANEJO_SEL.add(aid);
  const sel=document.getElementById('lt-an-sel');
  const ids=[...LT_REMANEJO_SEL];
  sel.innerHTML = ids.length
    ? `<div class="lt-an-sel-head">${ids.length} animal(is) selecionado(s)</div>` + ids.map(i=>`<span class="tag">${i}</span>`).join('')
    : '<span class="sub-cell">Nenhum animal selecionado.</span>';
  // reflete o check na lista sem re-renderizar
  document.querySelectorAll('.lt-an-row').forEach(r=>{
    const cb=r.querySelector('input'); const rid=r.querySelector('.lt-an-id')?.textContent;
    if(rid===aid) r.classList.toggle('on', cb.checked);
  });
}
function ltSalvarRemanejo(id){
  const sent=val('lt-sent'), outro=val('lt-outro');
  if(sent==='out' && outro==='__none'){ toast({title:'Escolha o lote de destino',msg:'“Sem lote” só vale como origem de entrada.',kind:'crit'}); return; }
  if(LT_MODO_REMANEJO==='id'){
    const ids=[...LT_REMANEJO_SEL];
    if(!ids.length){ toast({title:'Selecione ao menos um animal',kind:'crit'}); return; }
    // agrupa por categoria real dos animais escolhidos
    const porCat={};
    ids.forEach(aid=>{ const a=DB.animais.find(x=>x.id===aid); const c=a?nomeCategoria(a.categoria):'—'; (porCat[c]=porCat[c]||[]).push(aid); });
    Object.entries(porCat).forEach(([cat,arr])=>{
      const rec={id:'a'+Date.now()+Math.random().toString(36).slice(2,5),qtd:arr.length,categoria:cat,data:hojeISO(),resp:'Antonio Chaker',naoIdent:0,animais:arr};
      if(sent==='in'){ rec.lote=id; rec.de=outro; } else { rec.lote=outro; rec.de=id; }
      LT.alocacoes.push(rec);
    });
    closeModal(); render();
    toast({title:'Animais vinculados ao lote', msg:`${ids.length} animal(is) por ID movimentados — 0 pendências, vínculo individual completo.`});
    return;
  }
  const cat=val('lt-cat'), qtd=+val('lt-qtd')||0, ident=Math.min(+val('lt-ident')||0,qtd);
  if(qtd<1){ toast({title:'Quantidade inválida',kind:'crit'}); return; }
  const ni=Math.max(0,qtd-ident);
  if(sent==='in') LT.alocacoes.push({id:'a'+Date.now(),lote:id,de:outro,qtd,categoria:cat,data:hojeISO(),resp:'Antonio Chaker',naoIdent:ni});
  else LT.alocacoes.push({id:'a'+Date.now(),lote:outro,de:id,qtd,categoria:cat,data:hojeISO(),resp:'Antonio Chaker',naoIdent:ni});
  closeModal(); render();
  toast({title:'Alocação lançada', msg:ni>0?`Estoque movido. ${ni} sem identificação enviados à Mesa.`:`${qtd} ${cat} movimentados. Saldo derivado atualizado.`, kind:ni>0?'warn':'ok'});
}
function ltTransferir(id){
  const l=ltLote(id), atual=ltLocalAtual(id);
  openModal({
    title:'Transferir lote', sub:`O lote inteiro muda de local · ${l.codigo}`,
    body:`<div class="lt-decide">${icon('info')} <span>Isto move <b>o lote todo</b> de uma vez — não é animal trocando de grupo. Cada animal herda o novo local do lote.</span></div>
      <div class="form-grid">
        <div class="field"><label>Local de origem</label><input value="${atual}" disabled></div>
        <div class="field"><label>Tipo de local</label><select id="lt-tipo"><option>Retiro</option><option>Pasto</option><option>Setor</option><option>Confinamento</option><option>Curral</option></select></div>
        <div class="field full"><label>Local de destino</label><select id="lt-dest">${LT.locais.filter(x=>x!==atual).map(x=>`<option>${x}</option>`).join('')}</select></div>
      </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="ltSalvarTransf('${id}')">${icon('save')} Transferir</button>`,
  });
}
function ltSalvarTransf(id){
  const atual=ltLocalAtual(id), para=val('lt-dest'), tipo=val('lt-tipo');
  LT.transferencias.push({id:'t'+Date.now(),lote:id,de:atual,para,tipoLocal:tipo,data:hojeISO(),resp:'Antonio Chaker'});
  closeModal(); render();
  toast({title:'Lote transferido', msg:`${atual} → ${para}. Local atual de todos os animais do lote atualizado (derivado).`});
}
function ltMudarRegime(id){
  const l=ltLote(id);
  openModal({
    title:'Mudar regime de manejo', sub:`Evento de Manejo · ${l.codigo}`,
    body:`<div class="lt-decide">${icon('info')} <span>O plano anterior não é apagado — vira passado na linha do tempo. Dá para cruzar dieta × ganho de peso depois.</span></div>
      <div class="form-grid">
        <div class="field"><label>Dimensão</label><select id="lt-dim"><option value="nutricional">Nutricional (dieta/suplemento)</option><option value="reprodutivo">Reprodutivo (protocolo)</option></select></div>
        <div class="field"><label>Início</label><input id="lt-ini" type="date" value="${hojeISO()}"></div>
        <div class="field full"><label>Descrição do plano</label><input id="lt-plano" placeholder="Ex.: Terminação — alto grão 88% NDT"></div>
      </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="ltSalvarRegime('${id}')">${icon('save')} Aplicar regime</button>`,
  });
}
function ltSalvarRegime(id){
  const dim=val('lt-dim'), plano=val('lt-plano'), data=val('lt-ini')||hojeISO();
  if(!plano){ toast({title:'Descreva o plano',kind:'crit'}); return; }
  LT.manejos.push({id:'m'+Date.now(),lote:id,dim,plano,data,resp:'Antonio Chaker'});
  closeModal(); render();
  toast({title:'Regime atualizado', msg:`${dim==='reprodutivo'?'Protocolo':'Plano nutricional'} em vigor: ${plano}. Anterior preservado no histórico.`});
}
function ltEditarNome(id){
  const l=ltLote(id);
  openModal({title:'Editar lote',sub:'Nome, código e observação são atributos — não mexem na identidade nem no histórico.',
    body:`<div class="form-grid">
      <div class="field"><label>Código</label><input id="lt-cod" value="${l.codigo}"></div>
      <div class="field"><label>Nome</label><input id="lt-nome" value="${l.nome}"></div>
      <div class="field"><label>Finalidade</label><select id="lt-fin">${['Cria','Recria','Terminação','Outra Finalidade'].map(f=>`<option ${l.finalidade===f?'selected':''}>${f}</option>`).join('')}</select></div>
      <div class="field full"><label>Observação <span class="opt">(opcional)</span></label><textarea id="lt-obs" rows="3" placeholder="Anotações sobre o lote…">${l.obs||''}</textarea></div>
    </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="ltSalvarNome('${id}')">${icon('save')} Salvar</button>`});
}
function ltSalvarNome(id){ const l=ltLote(id); l.codigo=val('lt-cod')||l.codigo; l.nome=val('lt-nome')||l.nome; l.finalidade=val('lt-fin')||l.finalidade; l.obs=document.getElementById('lt-obs')?.value||''; closeModal(); render(); toast({title:'Lote atualizado',msg:'Identidade e histórico preservados.'}); }

function ltEventoRepro(id){
  const l=ltLote(id);
  openModal({
    title:'Registrar evento reprodutivo', sub:`Processo Reprodutivo · ${l.codigo} · ${l.nome}`,
    body:`<div class="lt-decide">${icon('info')} <span>Cada fase do ciclo de cria é um evento na linha do tempo — estação de monta, diagnóstico, parição, desmama. O estado atual do lote é sempre a última fase registrada.</span></div>
      <div class="form-grid">
        <div class="field"><label>Fase <span class="req">*</span></label><select id="lt-fase">${['Estação de monta','Diagnóstico de gestação','Parição','Desmama','Repasse com touro','Descarte de vazias'].map(f=>`<option>${f}</option>`).join('')}</select></div>
        <div class="field"><label>Data</label><input id="lt-rdata" type="date" value="${hojeISO()}"></div>
        <div class="field full"><label>Detalhe <span class="opt">(resultado, nº de animais, protocolo…)</span></label><input id="lt-rdet" placeholder="Ex.: 112 prenhes (80%) · 28 vazias"></div>
      </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="ltSalvarRepro('${id}')">${icon('save')} Registrar evento</button>`,
  });
}
function ltSalvarRepro(id){
  const fase=val('lt-fase'), detalhe=val('lt-rdet'), data=val('lt-rdata')||hojeISO();
  LT.repro.push({id:'r'+Date.now(),lote:id,fase,detalhe:detalhe||'—',data,resp:'Antonio Chaker'});
  closeModal(); render();
  toast({title:'Evento reprodutivo registrado', msg:`${fase} em vigor. Fases anteriores preservadas no histórico do lote.`});
}
function ltEncerrar(id){
  const l=ltLote(id);
  openModal({title:'Encerrar lote',sub:`${l.codigo} · ${l.nome}`,
    body:`<p class="small" style="margin-top:0">Encerrar não deleta — o lote sai das listas operacionais e permanece na consulta histórica. Use quando o ciclo terminou (todos vendidos/abatidos) ou ao juntar lotes.</p>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" onclick="ltConfirmEncerrar('${id}')">${icon('encerrar')} Encerrar lote</button>`});
}
function ltConfirmEncerrar(id){ const l=ltLote(id); l.status='encerrado'; l.encerramento=hojeISO(); closeModal(); render(); toast({title:'Lote encerrado',msg:`${l.codigo} arquivado. Histórico segue consultável.`}); }
function ltNovoLote(){
  openModal({title:'Novo lote',sub:'A identidade do lote é a finalidade.',
    body:`<div class="form-grid">
      <div class="field"><label>Código</label><input id="nl-cod" placeholder="RC-05"></div>
      <div class="field"><label>Nome</label><input id="nl-nome" placeholder="Recria Fêmeas"></div>
      <div class="field"><label>Finalidade <span class="req">*</span></label><select id="nl-fin">${['Cria','Recria','Terminação','Outra Finalidade'].map(f=>`<option>${f}</option>`).join('')}</select></div>
      <div class="field full"><label>Observação <span class="opt">(opcional)</span></label><textarea id="nl-obs" rows="2" placeholder="Anotações sobre o lote…"></textarea></div>
    </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="ltSalvarNovoLote()">${icon('save')} Criar lote</button>`});
}
function ltSalvarNovoLote(){
  const cod=val('nl-cod'),nome=val('nl-nome'),fin=val('nl-fin');
  if(!cod){ toast({title:'Informe o código',kind:'crit'}); return; }
  const id='L'+Date.now();
  LT.lotes.push({id,codigo:cod,nome:nome||cod,finalidade:fin,status:'ativo',abertura:hojeISO(),obs:val('nl-obs')});
  LT_SEL=id; closeModal(); render();
  toast({title:'Lote criado',msg:`${cod} · finalidade ${fin}. Agora lance os eventos de composição, local e regime.`});
}
