/* ===== Shared UI helpers ===== */
function layerBadge(kind){
  const map = {
    estoque:    ['estoque','Camada de Estoque'],
    individual: ['individual','Camada Individual'],
    mesa:       ['mesa','Mesa de Conciliação'],
  };
  const [cls,label] = map[kind] || map.estoque;
  return `<span class="layer ${cls}"><span class="dot"></span>${label}</span>`;
}

function coberturaBadge(pct){
  const c = classifCobertura(pct);
  const color = c.cls==='ok' ? 'var(--ok)' : c.cls==='alerta' ? 'var(--alerta)' : 'var(--crit)';
  return `<div class="cob">
    <div class="cob-row">
      <span class="cob-val" style="color:${color}">${pct.toFixed(1)}%</span>
      <span class="cob-tag" style="color:${color}">${c.label}</span>
    </div>
    <div class="cob-bar"><i style="width:${Math.max(2,pct).toFixed(1)}%;background:${color}"></i></div>
  </div>`;
}

/* ===== Toasts ===== */
function toast({title, msg, kind='ok', timeout=5200}){
  let wrap = document.querySelector('.toast-wrap');
  if(!wrap){ wrap = document.createElement('div'); wrap.className='toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = `toast ${kind==='ok'?'':kind}`;
  const ic = kind==='ok' ? 'checkCircle' : kind==='crit' ? 'alert' : 'info';
  el.innerHTML = `<span class="t-icon">${icon(ic)}</span>
    <div><div class="t-title">${title}</div>${msg?`<div class="t-msg">${msg}</div>`:''}</div>`;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .3s,transform .3s'; el.style.opacity='0'; el.style.transform='translateX(12px)'; setTimeout(()=>el.remove(),300); }, timeout);
}

/* ===== Modal ===== */
function openModal({title, sub, body, foot}){
  closeModal();
  const back = document.createElement('div');
  back.className='modal-back';
  back.innerHTML = `<div class="modal" role="dialog">
    <div class="modal-head">
      <div><h3>${title}</h3>${sub?`<div class="m-sub">${sub}</div>`:''}</div>
      <button class="x" data-close>${icon('x')}</button>
    </div>
    <div class="modal-body">${body||''}</div>
    ${foot?`<div class="modal-foot">${foot}</div>`:''}
  </div>`;
  back.addEventListener('click', e=>{ if(e.target===back || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(back);
  return back;
}
function closeModal(){ document.querySelector('.modal-back')?.remove(); }

/* page header builder */
function pageHead({title, sub, layer, actions}){
  return `<div class="page-head">
    <div class="ph-text">
      ${layer?`<div style="margin-bottom:9px">${layerBadge(layer)}</div>`:''}
      <h1 class="page-title">${title}</h1>
      ${sub?`<div class="page-sub">${sub}</div>`:''}
    </div>
    ${actions?`<div class="ph-actions">${actions}</div>`:''}
  </div>`;
}

function panelNote(text){
  return `<div class="panel-note">${icon('info')}<span>${text}</span></div>`;
}

function searchBox(ph='Buscar…'){
  return `<div class="search">${icon('search')}<input placeholder="${ph}" oninput="this.value=this.value"></div>`;
}

/* ===== Campo de busca: código + lupa + descrição (padrão legado) ===== */
function lookupField({key, label, src, refId, onPick, cls, defCod='', defNome='', defRef='', noCod=false}){
  const codInput = noCod ? `<input type="hidden" id="${key}-cod" value="${defCod}">`
    : `<input class="lk-cod" id="${key}-cod" value="${defCod}" placeholder="Cód." autocomplete="off"
        oninput="lkResolve('${key}','${src}','${refId||''}','${onPick||''}')">`;
  return `<div class="field ${cls||''}">
    <label>${label}</label>
    <div class="lookup">
      ${codInput}
      <input class="lk-name" id="${key}-name" value="${defNome}" readonly placeholder="—"
        ${noCod?`onclick="lkOpen('${key}','${src}','${label}','${refId||''}','${onPick||''}')" style="cursor:pointer"`:''}>
      <button type="button" class="lk-btn" title="Buscar ${label}"
        onclick="lkOpen('${key}','${src}','${label}','${refId||''}','${onPick||''}')">${icon('search')}</button>
      ${refId?`<input type="hidden" id="${refId}" value="${defRef}">`:''}
    </div>
  </div>`;
}
function lkResolve(key, src, refId, onPick){
  const cod = (document.getElementById(key+'-cod').value||'').trim();
  const item = lkData(src).find(x=>x.cod===cod);
  document.getElementById(key+'-name').value = item ? item.nome : '';
  if(refId) document.getElementById(refId).value = item ? (item.ref||item.cod) : '';
  if(onPick && window[onPick]) window[onPick]();
}
function lkOpen(key, src, label, refId, onPick){
  const items = lkData(src);
  openModal({
    title:`Selecionar ${label}`,
    sub:'Clique para escolher.',
    body:`<div class="lk-list">${items.map(x=>`
      <button class="lk-row" data-nome="${x.nome}"
        onclick="lkPick('${key}','${refId||''}','${onPick||''}','${x.cod}','${x.ref||x.cod}',this)">
        <span class="mono">${x.cod}</span><span>${x.nome}</span></button>`).join('')}</div>`,
  });
}
function lkPick(key, refId, onPick, cod, ref, el){
  document.getElementById(key+'-cod').value = cod;
  document.getElementById(key+'-name').value = el.dataset.nome;
  if(refId) document.getElementById(refId).value = ref;
  closeModal();
  if(onPick && window[onPick]) window[onPick]();
}
function updNascPreview(){ updMovPreview('nascimento'); }
