/* ===== FICHA ANIMAL — modal com abas (Identificação · Dados · Genealogia · Origem · Biometria · Histórico) ===== */
let FICHA_ID = null;
let FICHA_TAB = 'id';

const FICHA_TABS = [
  { id:'ident',     label:'Identificação', icon:'brinco' },
  { id:'geneal',    label:'Genealogia',    icon:'reproducao' },
  { id:'progenie',  label:'Progênies',     icon:'cow' },
  { id:'origem',    label:'Origem & local',icon:'local' },
  { id:'biometria', label:'Biometria & saúde', icon:'scale' },
  { id:'hist',      label:'Histórico',     icon:'layers' },
];

/* opções do campo Origem (procedência do animal) */
const ORIGEM_OPCOES = [
  { val:'Nascido na fazenda',     desc:'bezerro próprio' },
  { val:'Comprado',               desc:'entrada por compra' },
  { val:'Transferido',            desc:'veio de outra fazenda sua' },
  { val:'Recebido de terceiros',  desc:'entrou mas não é seu (consignação, arrendamento)' },
  { val:'Referência externa',     desc:'touro / sêmen' },
];
function origemLabel(v){
  const o = ORIGEM_OPCOES.find(x=>x.val===v);
  return o ? `${o.val} <span class="sub-cell">— ${o.desc}</span>` : null;
}

/* valor ou “Não informado” discreto */
function fvVal(v){
  if(v===0) return '0';
  return (v===null || v===undefined || v==='' || v==='—') ? '<span class="fv-empty">Não informado</span>' : v;
}
function kvRow(k, v){
  return `<div class="kv"><span class="k">${k}</span><span class="v">${fvVal(v)}</span></div>`;
}
function fichaCard(titulo, rows){
  return `<div class="aside-card fv-card"><h4>${titulo}</h4>${rows}</div>`;
}

function openFicha(id){
  FICHA_ID = id; FICHA_TAB = 'ident'; FICHA_PROG_ADD = false;
  const a = DB.animais.find(x=>x.id===id);
  if(!a) return;
  const idadeTxt = idadeLabel(a.nascimento);
  openModal({
    title:`Ficha Animal · ${a.id}`,
    sub:`${a.nome ? a.nome+' · ' : ''}${a.sexo} · ${a.raca} · ${nomeCategoria(a.categoria)}${idadeTxt?` · ${idadeTxt}`:''}`,
    body:`<div class="ficha-modal">
      <div class="tabs ficha-tabs" id="ficha-tabwrap">${fichaTabsHtml()}</div>
      <div id="ficha-body">${fichaTabBody(a)}</div>
    </div>`,
    foot:`<button class="btn" onclick="openFichaCampos(()=>openFicha('${a.id}'))">${icon('sliders')} Configurar campos</button><div class="spacer"></div><button class="btn" data-close>Fechar</button>`,
  });
}
function fichaTabsHtml(){
  return FICHA_TABS.map(t=>`<button class="tab ${t.id===FICHA_TAB?'active':''}" onclick="fichaSetTab('${t.id}')">${t.label}</button>`).join('');
}
function fichaSetTab(t){
  FICHA_TAB = t; FICHA_PROG_ADD = false;
  const a = DB.animais.find(x=>x.id===FICHA_ID);
  const tw = document.getElementById('ficha-tabwrap'); if(tw) tw.innerHTML = fichaTabsHtml();
  const b = document.getElementById('ficha-body'); if(b) b.innerHTML = fichaTabBody(a);
}

function fichaTabBody(a){
  switch(FICHA_TAB){
    case 'ident':     return fichaTabId(a) + `<div style="margin-top:14px"></div>` + fichaTabBasico(a);
    case 'geneal':    return fichaTabGeneal(a);
    case 'progenie':  return fichaTabProgenie(a);
    case 'origem':    return fichaTabOrigem(a);
    case 'biometria': return fichaTabBiometria(a);
    case 'hist':      return fichaTabHist(a);
  }
  return '';
}

/* ---------- 1. Identificação ---------- */
function fichaTabId(a){
  const brinco = a.brinco
    ? (a.statusBrinco==='duplicado'
        ? `<span class="mono">${a.brinco}</span> <span class="pill alerta"><span class="d"></span>Duplicado</span>`
        : `<span class="mono">${a.brinco}</span>`)
    : '<span class="pill pend"><span class="d"></span>Sem identificação</span>';
  const fotoBox = a.foto
    ? `<div class="fv-foto" style="background-image:url('${a.foto}')"></div>`
    : `<div class="fv-foto fv-foto-empty">${icon('cow')}<span>Sem foto</span></div>`;
  const left = fichaCardF('Identificação de rastreabilidade',
    fRow('id','ID interno (chave)', `<span class="mono" style="color:var(--blue)">${a.id}</span>`) +
    fRow('origemTipo','Origem', origemLabel(a.origemTipo)) +
    fRow('brinco','Brinco de manejo', brinco) +
    fRow('rfid','Brinco eletrônico (RFID)', a.rfid ? `<span class="mono">${a.rfid}</span>` : null) +
    fRow('sisbov','Nº SISBOV', a.sisbov ? `<span class="mono">${a.sisbov}</span>` : null) +
    fRow('ferro','Marcação a ferro', a.ferro) +
    fRow('nome','Nome do animal', a.nome)
  );
  const right = fichaCardF('Registro genealógico',
    fRow('rgn','RGN (nascimento)', a.rgn ? `<span class="mono">${a.rgn}</span>` : null) +
    fRow('rgd','RGD (definitivo)', a.rgd ? `<span class="mono">${a.rgd}</span>` : null) +
    fRow('grau','Grau de sangue', a.grau)
  ) + (fSec('foto') ? `<div class="aside-card fv-card fv-fotocard"><h4>Foto do animal</h4>${fotoBox}</div>` : '');
  return `<div class="fv-grid"><div>${left}</div><div>${right}</div></div>`;
}

/* ---------- 2. Dados básicos e fisiológicos ---------- */
function fichaTabBasico(a){
  const status = a.vivo
    ? '<span class="pill ok"><span class="d"></span>Ativo</span>'
    : '<span class="pill neutral"><span class="d"></span>Baixado</span>';
  const left = fichaCardF('Classificação',
    fRow('sexo','Sexo / Gênero', a.sexo) +
    fRow('categoria','Categoria animal', nomeCategoria(a.categoria)) +
    fRow('raca','Raça', a.raca) +
    fRow('status','Status do animal', status)
  );
  const right = fichaCardF('Fisiologia',
    fRow('nascimento','Data de nascimento', a.nascimento ? fmtData(a.nascimento) : null) +
    fRow('idade','Idade', idadeLabel(a.nascimento)) +
    fRow('pelagem','Pelagem', a.pelagem) +
    fRow('chifre','Tipo de chifre', a.chifre)
  );
  return `<div class="fv-grid"><div>${left}</div><div>${right}</div></div>`;
}

/* ---------- 3. Genealogia e nascimento ---------- */
function fichaTabGeneal(a){
  const refAnimal = v => {
    if(!v) return null;
    const found = DB.animais.find(x=>x.id===v);
    return found ? `<a class="fv-link" onclick="openFicha('${found.id}')">${found.brinco||found.id}</a> <span class="sub-cell">(${found.id})</span>` : v;
  };
  const left = fichaCardF('Filiação',
    fRow('pai','Pai', refAnimal(a.pai)) +
    fRow('mae','Mãe (matriz)', refAnimal(a.mae))
  );
  const right = fichaCardF('Concepção & parto',
    fRow('concepcao','Tipo de concepção', a.concepcao) +
    fRow('parto','Condições do parto', a.parto)
  );
  return `<div class="fv-grid"><div>${left}</div><div>${right}</div></div>
    <div class="fv-note">${icon('info')}<span>Concepção: Monta Natural · IA · Transferência de Embrião (TE) · Fertilização In Vitro (FIV). Parto registra situações atípicas — gêmeo, prematuro, natimorto.</span></div>`;
}

/* ---------- Progênies (filhos desta matriz/reprodutor) ---------- */
let FICHA_PROG_ADD = false;

/* progênies vinculadas a animais reais (afetam estoque) */
function progeniesReais(a){
  const chaves = [a.id, a.brinco, a.nome].filter(Boolean);
  return DB.animais
    .filter(x => x.id!==a.id && (chaves.includes(x.mae) || chaves.includes(x.pai)))
    .map(x => ({ id:x.id, nascimento:x.nascimento, categoria:x.categoria, pesoNascer:x.pesoNascer, _hist:false }));
}
/* progênies históricas — fatos registrados só na ficha, NÃO afetam estoque */
function progeniesHistoricas(a){
  return (a.progHistorico||[]).map((h,i) => ({ ...h, _hist:true, _hi:i }));
}
/* lista completa, ordenada por nascimento */
function progeniesDe(a){
  return [...progeniesReais(a), ...progeniesHistoricas(a)]
    .sort((x,y)=>(x.nascimento||'').localeCompare(y.nascimento||''));
}
/* Intervalo entre partos (IEP): média de dias entre nascimentos consecutivos das crias */
function intervaloEntrePartos(progenies){
  const datas = progenies.map(p=>p.nascimento).filter(Boolean).sort();
  if(datas.length<2) return null;
  const gaps = [];
  for(let i=1;i<datas.length;i++){
    const d0=new Date(datas[i-1]).getTime(), d1=new Date(datas[i]).getTime();
    gaps.push(Math.round((d1-d0)/86400000));
  }
  const media = Math.round(gaps.reduce((s,g)=>s+g,0)/gaps.length);
  return { media, gaps, datas };
}
function fichaTabProgenie(a){
  const filhos = progeniesDe(a);
  const iep = intervaloEntrePartos(filhos);
  /* card: Intervalo entre partos */
  const iepValor = iep
    ? `<div class="fv-iep-num">${iep.media} <span>dias</span></div>
       <div class="fv-iep-sub">≈ ${(iep.media/30.4).toFixed(1)} meses · média de ${iep.gaps.length} intervalo(s)</div>
       <div class="fv-iep-gaps">${iep.gaps.map((g,i)=>`<span class="fv-iep-chip">${fmtData(iep.datas[i])} → ${fmtData(iep.datas[i+1])}<b>${g} d</b></span>`).join('')}</div>`
    : `<div class="fv-iep-num fv-iep-na">—</div><div class="fv-iep-sub">São necessários pelo menos 2 partos registrados para calcular o intervalo.</div>`;
  const iepCard = `<div class="aside-card fv-card fv-iep"><h4>${icon('reproducao')} Intervalo entre partos (IEP)</h4>${iepValor}</div>`;
  /* tabela de progênies */
  let tabela;
  if(!filhos.length){
    tabela = '<div class="small" style="color:var(--muted);padding:4px 0 10px">Nenhuma progênie vinculada a este animal ainda.</div>';
  } else {
    const rows = filhos.map((p,i)=>{
      const histBadge = p._hist ? ' <span class="fv-hist-badge">histórico</span>' : '';
      const idCell = p.id
        ? (p._hist ? `<span class="mono">${p.id}</span>` : `<span class="mono" style="color:var(--blue);font-weight:600">${p.id}</span>`)
        : '<span class="fv-empty">sem ID</span>';
      const click = (!p._hist && p.id) ? ` style="cursor:pointer" onclick="openFicha('${p.id}')"` : '';
      const acao = p._hist ? `<td class="num"><button class="icon-btn danger-ic" title="Remover registro histórico" onclick="event.stopPropagation();fichaRemoverHist(${p._hi})">${icon('trash')}</button></td>` : '<td></td>';
      return `<tr${click}>
        <td>${idCell}${histBadge}</td>
        <td>${p.nascimento?fmtData(p.nascimento):'<span class="fv-empty">—</span>'}</td>
        <td>${nomeCategoria(p.categoria)||'<span class="fv-empty">—</span>'}</td>
        <td class="num">${p.pesoNascer!=null&&p.pesoNascer!==''?`${p.pesoNascer} kg`:'<span class="fv-empty">—</span>'}</td>
        ${acao}
      </tr>`;
    }).join('');
    tabela = `<table class="tbl fv-prog-tbl">
        <thead><tr><th>ID</th><th>Data de nascimento</th><th>Categoria</th><th class="num">Peso ao nascer</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
  /* form inline de parto histórico */
  const form = FICHA_PROG_ADD ? `
    <div class="fv-histform">
      <div class="fv-histform-head">${icon('historico')} Parto histórico <span class="fv-hist-badge">não afeta estoque</span></div>
      <div class="form-grid">
        <div class="field"><label>ID da cria <span class="opt">(opcional)</span></label><input id="ph-id" placeholder="ex.: histórico-01"></div>
        <div class="field"><label>Data de nascimento</label><input id="ph-data" type="date"></div>
        <div class="field"><label>Categoria</label><select id="ph-cat"><option value="">—</option>${DB.categorias.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Peso ao nascer (kg) <span class="opt">(opcional)</span></label><input id="ph-peso" type="number" placeholder="—"></div>
      </div>
      <div class="fv-histform-foot">
        <button class="btn ghost" onclick="fichaToggleHist(false)">Cancelar</button>
        <button class="btn primary" onclick="fichaSalvarHist()">${icon('save')} Adicionar</button>
      </div>
    </div>` : `<button class="btn" onclick="fichaToggleHist(true)">${icon('plus')} Adicionar parto histórico</button>`;
  const card = `<div class="aside-card fv-card">
    <div class="fv-card-head"><h4>Progênies <span class="sub-cell">(${filhos.length})</span></h4></div>
    ${tabela}
    <div class="fv-hist-note">${icon('info')}<span>Dados <b>históricos</b> são fatos passados (partos de antes do sistema). Ficam registrados aqui e alimentam o IEP, mas <b>não geram movimento nem entram no estoque</b>. Crias atuais devem ser cadastradas via Nascimento.</span></div>
    <div style="margin-top:12px">${form}</div>
  </div>`;
  const iepBlock = fSec('iep') ? iepCard : '';
  const progBlock = fSec('progTabela') ? `${iepBlock?'<div style="margin-top:14px">':'<div>'}${card}</div>` : '';
  const vazio = (!iepBlock && !progBlock)
    ? '<div class="aside-card fv-card"><div class="small" style="color:var(--muted)">Nenhum bloco ativo nesta aba. Ative em “Configurar campos”.</div></div>' : '';
  return iepBlock + progBlock + vazio;
}
function fichaToggleHist(on){ FICHA_PROG_ADD = on; document.getElementById('ficha-body').innerHTML = fichaTabBody(DB.animais.find(x=>x.id===FICHA_ID)); }
function fichaSalvarHist(){
  const a = DB.animais.find(x=>x.id===FICHA_ID);
  const data = val('ph-data');
  if(!data){ toast({title:'Informe a data de nascimento',kind:'crit'}); return; }
  const peso = val('ph-peso');
  a.progHistorico = a.progHistorico || [];
  a.progHistorico.push({ id: val('ph-id')||null, nascimento:data, categoria: val('ph-cat')||null, pesoNascer: peso!==''?parseFloat(peso):null });
  FICHA_PROG_ADD = false;
  document.getElementById('ficha-body').innerHTML = fichaTabBody(a);
  toast({title:'Parto histórico registrado',msg:'Registro informativo — não alterou o estoque.'});
}
function fichaRemoverHist(i){
  const a = DB.animais.find(x=>x.id===FICHA_ID);
  if(a.progHistorico) a.progHistorico.splice(i,1);
  document.getElementById('ficha-body').innerHTML = fichaTabBody(a);
  toast({title:'Registro removido'});
}

/* ---------- 4. Origem, entrada e localização ---------- */
function fichaTabOrigem(a){
  const lote = loteAtualAnimal(a.id);
  const left = fichaCard('Entrada',
    kvRow('Tipo de entrada', a.entrada) +
    kvRow('Data de entrada', a.dataEntrada ? fmtData(a.dataEntrada) : null) +
    kvRow('Produtor / fazenda de origem', a.origem)
  );
  const right = fichaCard('Localização atual',
    kvRow('Proprietário', a.proprietario) +
    kvRow('Fazenda', a.fazenda) +
    kvRow('Lote / grupo de manejo (derivado)', lote ? `<span class="derived">${icon('layers')} ${nomeLote(lote)}</span>` : null)
  );
  return `<div class="fv-grid"><div>${left}</div><div>${right}</div></div>`;
}

/* ---------- 5. Biometria e indicadores zootécnicos ---------- */
function fichaTabBiometria(a){
  const gmd = gmdAnimal(a.id);
  const pes = DB.pesagens.filter(p=>p.animal===a.id).sort((x,y)=>x.data.localeCompare(y.data));
  const pp = a.primeiraPesagem;
  const left = fichaCardF('Pesos & marcos',
    fRow('pesoNascer','Peso ao nascer (P.N.)', a.pesoNascer!=null ? `${a.pesoNascer} kg` : null) +
    fRow('primeiraPesagem','1ª pesagem', pp ? `${pp.peso} kg <span class="sub-cell">· ${fmtData(pp.data)}</span>` : null) +
    fRow('desmama','Data de desmama', a.desmama ? fmtData(a.desmama) : null) +
    fRow('pesoAtual','Peso atual', gmd ? `${gmd.pesoFim} kg` : null) +
    fRow('gmd','GMD', gmd ? `<span style="color:var(--ok)">${gmd.gmd.toFixed(3)} kg/dia</span>` : null)
  );
  const right = fichaCardF('Testes clínicos & saúde (fase de cria)',
    fRow('ppt','Proteína Plasmática Total (PPT)', a.ppt!=null ? `${a.ppt.toFixed(1)} g/dL` : null) +
    fRow('hematocrito','Hematócrito', a.hematocrito!=null ? `${a.hematocrito} %` : null)
  );
  const curva = pes.length
    ? `<div class="fv-curva">${fichaSparkline(pes)}<div class="fv-curva-rows">${pes.map(p=>`<div class="kv"><span class="k">${fmtData(p.data)}</span><span class="v">${p.peso} kg</span></div>`).join('')}</div></div>`
    : '<div class="small" style="color:var(--muted)">Sem pesagens registradas.</div>';
  const curvaCard = fSec('curva') ? `<div class="aside-card fv-card" style="margin-top:14px"><h4>Curva de peso</h4>${curva}</div>` : '';
  return `<div class="fv-grid"><div>${left}</div><div>${right}</div></div>${curvaCard}`;
}

/* mini-gráfico de linha (SVG) das pesagens */
function fichaSparkline(pes){
  const W=520, H=120, pad=14;
  const ps = pes.map(p=>p.peso);
  const min = Math.min(...ps), max = Math.max(...ps);
  const span = (max-min)||1;
  const t0 = new Date(pes[0].data).getTime();
  const t1 = new Date(pes[pes.length-1].data).getTime();
  const tspan = (t1-t0)||1;
  const pts = pes.map(p=>{
    const x = pad + (W-2*pad) * ((new Date(p.data).getTime()-t0)/tspan);
    const y = H-pad - (H-2*pad) * ((p.peso-min)/span);
    return [x,y];
  });
  const path = pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const dots = pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" fill="var(--blue)"/>`).join('');
  return `<svg class="fv-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="var(--blue)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

/* ---------- 6. Histórico (biografia do animal) ---------- */
function fichaTabHist(a){
  if(!fSec('timeline')) return '<div class="aside-card fv-card"><div class="small" style="color:var(--muted)">Linha do tempo desativada em “Configurar campos”.</div></div>';
  const hist = DB.movimentos.filter(m=>m.vinculados.includes(a.id)).sort((x,y)=>y.data.localeCompare(x.data));
  if(!hist.length) return '<div class="aside-card fv-card"><h4>Linha do tempo</h4><div class="small" style="color:var(--muted)">Sem movimentos vinculados a este animal.</div></div>';
  const rows = hist.map(m=>{
    const dest = m.loteDestino?nomeLote(m.loteDestino):null;
    const detalhe = m.origem || m.destino || m.causa || (dest?`→ ${dest}`:'');
    return `<div class="fv-tl-item">
      <div class="fv-tl-dot ${m.tipo}">${icon(m.tipo==='alocacao'?'gestaoLotes':m.tipo)}</div>
      <div class="fv-tl-body">
        <div class="fv-tl-top"><span class="fv-tl-titulo">${tipoLabel(m.tipo)}</span><span class="fv-tl-data">${fmtData(m.data)}</span></div>
        <div class="fv-tl-meta">${detalhe||'—'}${m.responsavel?` · <span class="sub-cell">${m.responsavel}</span>`:''}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="aside-card fv-card"><h4>Linha do tempo de movimentos</h4><div class="fv-tl">${rows}</div></div>`;
}

/* ============================================================
   NOVA FICHA — formulário editável com as mesmas abas
   ============================================================ */
let NF = {};
let NF_TAB = 'id';
let NF_PROG_ADD = false;
const NF_TABS = [
  { id:'ident',     label:'Identificação' },
  { id:'geneal',    label:'Genealogia' },
  { id:'progenie',  label:'Progênies' },
  { id:'origem',    label:'Origem & local' },
  { id:'biometria', label:'Biometria & saúde' },
];

function proxAnimalId(){
  const nums = DB.animais.map(a=>parseInt((a.id.match(/(\d+)/)||[])[1]||0,10));
  const n = (Math.max(0,...nums)+1);
  return 'A-'+String(n).padStart(4,'0');
}

function openFichaNova(){
  NF_TAB = 'ident';
  NF = {
    id: proxAnimalId(), brinco:'', rfid:'', sisbov:'', ferro:'', nome:'', rgn:'', rgd:'', grau:'',
    sexo:'Macho', categoria:DB.categorias[0]?.id||'', raca:'', nascimento:'', pelagem:'', chifre:'', origemTipo:'',
    pai:'', mae:'', concepcao:'', parto:'',
    entrada:'Nascimento', dataEntrada:'', origem:'', proprietario:'', fazenda:'',
    pesoNascer:'', desmama:'', ppt:'', hematocrito:'', progHistorico:[],
  };
  openModal({
    title:'Nova ficha animal',
    sub:'Só o ID interno é obrigatório — todo o resto pode ser preenchido depois. Sem brinco, o animal entra como “não identificado”.',
    body:`<div class="ficha-modal">
      <div class="tabs ficha-tabs" id="nf-tabwrap">${nfTabsHtml()}</div>
      <div id="nf-body">${nfTabBody()}</div>
    </div>`,
    foot:`<div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" onclick="salvarFichaNova()">${icon('save')} Salvar ficha</button>`,
  });
}
function nfTabsHtml(){
  return NF_TABS.map(t=>`<button class="tab ${t.id===NF_TAB?'active':''}" onclick="nfSetTab('${t.id}')">${t.label}</button>`).join('');
}
function nfSetTab(t){
  NF_TAB = t; NF_PROG_ADD = false;
  document.getElementById('nf-tabwrap').innerHTML = nfTabsHtml();
  document.getElementById('nf-body').innerHTML = nfTabBody();
}
function nfToggleHist(on){ NF_PROG_ADD = on; document.getElementById('nf-body').innerHTML = nfTabBody(); }
function nfSalvarHist(){
  const data = val('nph-data');
  if(!data){ toast({title:'Informe a data de nascimento',kind:'crit'}); return; }
  const peso = val('nph-peso');
  NF.progHistorico = NF.progHistorico || [];
  NF.progHistorico.push({ id: val('nph-id')||null, nascimento:data, categoria: val('nph-cat')||null, pesoNascer: peso!==''?parseFloat(peso):null });
  NF_PROG_ADD = false;
  document.getElementById('nf-body').innerHTML = nfTabBody();
  toast({title:'Parto histórico adicionado',msg:'Será anexado à ficha ao salvar — não afeta o estoque.'});
}
function nfRemoverHist(i){ NF.progHistorico.splice(i,1); document.getElementById('nf-body').innerHTML = nfTabBody(); }
/* input que persiste no rascunho NF */
function nfField(label, key, opts={}){
  if(FICHA_CAMPO_DEF[key] && !fieldOn(key)) return '';
  const v = NF[key] ?? '';
  const ph = opts.ph ? ` placeholder="${opts.ph}"` : '';
  const type = opts.type || 'text';
  const full = opts.full ? ' full' : '';
  const optTag = opts.opt ? ' <span class="opt">(opcional)</span>' : '';
  return `<div class="field${full}"><label>${label}${optTag}</label><input type="${type}" value="${String(v).replace(/"/g,'&quot;')}"${ph} oninput="NF['${key}']=this.value"></div>`;
}
function nfSelect(label, key, options, opts={}){
  if(FICHA_CAMPO_DEF[key] && !fieldOn(key)) return '';
  const v = NF[key];
  const full = opts.full ? ' full' : '';
  const body = options.map(o=>{
    const val = o.val!==undefined ? o.val : o;
    const lab = o.lab!==undefined ? o.lab : o;
    return `<option value="${val}" ${v==val?'selected':''}>${lab}</option>`;
  }).join('');
  return `<div class="field${full}"><label>${label}</label><select onchange="NF['${key}']=this.value">${body}</select></div>`;
}

function nfTabBody(){
  switch(NF_TAB){
    case 'ident': return `<div class="form-grid">
      ${nfField('ID interno (chave)','id',{ph:'A-0011'})}
      ${nfSelect('Origem','origemTipo',[{val:'',lab:'— selecione —'},...ORIGEM_OPCOES.map(o=>({val:o.val,lab:`${o.val} — ${o.desc}`}))])}
      ${nfField('Brinco de manejo','brinco',{opt:true,ph:'—'})}
      ${nfField('Brinco eletrônico (RFID)','rfid',{opt:true,ph:'982 000…'})}
      ${nfField('Nº SISBOV','sisbov',{opt:true,ph:'076 000…'})}
      ${nfField('Marcação a ferro','ferro',{opt:true})}
      ${nfField('Nome do animal','nome',{opt:true})}
      ${nfField('RGN (nascimento)','rgn',{opt:true})}
      ${nfField('RGD (definitivo)','rgd',{opt:true})}
      ${nfField('Grau de sangue','grau',{opt:true,ph:'PO, PC, 1/2…'})}
      ${nfSelect('Sexo / Gênero','sexo',['Macho','Fêmea'])}
      ${nfSelect('Categoria animal','categoria',DB.categorias.map(c=>({val:c.id,lab:c.nome})))}
      ${nfField('Raça','raca',{ph:'Nelore'})}
      ${nfField('Data de nascimento','nascimento',{type:'date'})}
      ${nfField('Pelagem','pelagem',{opt:true})}
      ${nfField('Tipo de chifre','chifre',{opt:true,ph:'Aspado, Mocho…'})}
    </div>`;
    case 'geneal': return `<div class="form-grid">
      ${nfField('Pai','pai',{opt:true})}
      ${nfField('Mãe (matriz)','mae',{opt:true,ph:'ID ou nome'})}
      ${nfSelect('Tipo de concepção','concepcao',['','Monta Natural','IA','IATF','Transferência de Embrião (TE)','FIV'])}
      ${nfField('Condições do parto','parto',{opt:true,ph:'Normal, gêmeo…'})}
    </div>`;
    case 'progenie': {
      const hist = NF.progHistorico||[];
      const lista = hist.length ? `<table class="tbl fv-prog-tbl" style="margin-bottom:12px">
        <thead><tr><th>ID</th><th>Data de nascimento</th><th>Categoria</th><th class="num">Peso ao nascer</th><th></th></tr></thead>
        <tbody>${hist.map((h,i)=>`<tr>
          <td>${h.id?`<span class="mono">${h.id}</span>`:'<span class="fv-empty">sem ID</span>'} <span class="fv-hist-badge">histórico</span></td>
          <td>${fmtData(h.nascimento)}</td>
          <td>${nomeCategoria(h.categoria)||'<span class="fv-empty">—</span>'}</td>
          <td class="num">${h.pesoNascer!=null&&h.pesoNascer!==''?`${h.pesoNascer} kg`:'<span class="fv-empty">—</span>'}</td>
          <td class="num"><button class="icon-btn danger-ic" onclick="nfRemoverHist(${i})">${icon('trash')}</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="small" style="color:var(--muted);margin-bottom:12px">Nenhum parto histórico adicionado.</div>';
      const form = NF_PROG_ADD ? `
        <div class="fv-histform">
          <div class="fv-histform-head">${icon('historico')} Parto histórico <span class="fv-hist-badge">não afeta estoque</span></div>
          <div class="form-grid">
            <div class="field"><label>ID da cria <span class="opt">(opcional)</span></label><input id="nph-id" placeholder="ex.: histórico-01"></div>
            <div class="field"><label>Data de nascimento</label><input id="nph-data" type="date"></div>
            <div class="field"><label>Categoria</label><select id="nph-cat"><option value="">—</option>${DB.categorias.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
            <div class="field"><label>Peso ao nascer (kg) <span class="opt">(opcional)</span></label><input id="nph-peso" type="number" placeholder="—"></div>
          </div>
          <div class="fv-histform-foot">
            <button class="btn ghost" onclick="nfToggleHist(false)">Cancelar</button>
            <button class="btn primary" onclick="nfSalvarHist()">${icon('save')} Adicionar</button>
          </div>
        </div>` : `<button class="btn" onclick="nfToggleHist(true)">${icon('plus')} Adicionar parto histórico</button>`;
      return `<div class="aside-card fv-card">
        <div class="fv-card-head"><h4>Progênies <span class="sub-cell">(${hist.length})</span></h4></div>
        ${lista}
        <div class="fv-hist-note">${icon('info')}<span>Aqui você registra <b>partos históricos</b> (anteriores ao sistema). Eles ficam na ficha e alimentam o IEP, mas <b>não geram movimento nem entram no estoque</b>. Crias atuais devem ser lançadas via Nascimento.</span></div>
        <div style="margin-top:12px">${form}</div>
      </div>`;
    }
    case 'origem': return `<div class="form-grid">
      ${nfSelect('Tipo de entrada','entrada',['Nascimento','Compra','Transferência','Doação'])}
      ${nfField('Data de entrada','dataEntrada',{type:'date'})}
      ${nfField('Produtor / fazenda de origem','origem',{opt:true,full:true})}
      ${nfField('Proprietário','proprietario',{opt:true})}
      ${nfField('Fazenda','fazenda',{opt:true})}
    </div>`;
    case 'biometria': return `<div class="form-grid">
      ${nfField('Peso ao nascer (kg)','pesoNascer',{type:'number',opt:true})}
      ${nfField('Data de desmama','desmama',{type:'date',opt:true})}
      ${nfField('PPT (g/dL)','ppt',{type:'number',opt:true})}
      ${nfField('Hematócrito (%)','hematocrito',{type:'number',opt:true})}
    </div>
    <div class="fv-note">${icon('info')}<span>As pesagens e a curva de peso são alimentadas pela tela de Pesagens ao longo da vida do animal — aqui registra-se apenas o ponto de partida.</span></div>`;
  }
  return '';
}

function salvarFichaNova(){
  const id = (NF.id||'').trim();
  if(!id){ toast({title:'Informe o ID interno',kind:'crit'}); nfSetTab('ident'); return; }
  if(DB.animais.some(a=>a.id===id)){ toast({title:'ID já existe',msg:`${id} já está cadastrado.`,kind:'crit'}); nfSetTab('ident'); return; }
  const num = s => { const n=parseFloat(s); return isNaN(n)?null:n; };
  const clean = s => (s&&String(s).trim()) ? String(s).trim() : null;
  const br = clean(NF.brinco);
  const animal = {
    id, brinco:br, statusBrinco:br?'ok':'sem',
    sexo:NF.sexo, categoria:NF.categoria, raca:clean(NF.raca)||'—', vivo:true,
    rfid:clean(NF.rfid), sisbov:clean(NF.sisbov), ferro:clean(NF.ferro), nome:clean(NF.nome),
    rgn:clean(NF.rgn), rgd:clean(NF.rgd), grau:clean(NF.grau),
    nascimento:clean(NF.nascimento), pelagem:clean(NF.pelagem), chifre:clean(NF.chifre), origemTipo:clean(NF.origemTipo),
    pai:clean(NF.pai), mae:clean(NF.mae), concepcao:clean(NF.concepcao), parto:clean(NF.parto),
    entrada:clean(NF.entrada), dataEntrada:clean(NF.dataEntrada), origem:clean(NF.origem),
    proprietario:clean(NF.proprietario), fazenda:clean(NF.fazenda),
    pesoNascer:num(NF.pesoNascer), desmama:clean(NF.desmama), ppt:num(NF.ppt), hematocrito:num(NF.hematocrito),
    progHistorico: (NF.progHistorico||[]).slice(),
  };
  DB.animais.push(animal);
  closeModal(); render();
  toast({title:'Ficha criada',msg:br?`${id} · brinco ${br}`:`${id} entrou sem identificação — normal.`,kind:br?'ok':'warn'});
  openFicha(id);
}

