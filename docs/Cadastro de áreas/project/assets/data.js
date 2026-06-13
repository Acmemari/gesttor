/* ===== Estado em memória — tudo derivado de `movimentos` ===== */
const DB = {
  categorias: [
    { id:'cat-bez', nome:'Bezerro(a)',  sexo:'Misto',  faixa:'0–12 meses',  estoquePartida:120 },
    { id:'cat-gar', nome:'Garrote',     sexo:'Macho',  faixa:'12–24 meses', estoquePartida:84  },
    { id:'cat-nov', nome:'Novilha',     sexo:'Fêmea',  faixa:'12–24 meses', estoquePartida:96  },
    { id:'cat-boi', nome:'Boi gordo',   sexo:'Macho',  faixa:'+24 meses',   estoquePartida:60  },
    { id:'cat-vaca',nome:'Vaca matriz', sexo:'Fêmea',  faixa:'+24 meses',   estoquePartida:140 },
  ],
  locais: [
    { id:'loc-1', nome:'Retiro Sede',      area:'48 ha', tipo:'Pasto' },
    { id:'loc-2', nome:'Pasto Baixão',     area:'72 ha', tipo:'Pasto' },
    { id:'loc-3', nome:'Pasto Cabeceira',  area:'55 ha', tipo:'Pasto' },
    { id:'loc-4', nome:'Curral de Manejo', area:'2 ha',  tipo:'Manejo' },
  ],
  lotes: [
    { id:'lote-1', codigo:'RC-01', nome:'Recria Machos 24', finalidade:'Recria',      sistema:'Pasto + suplemento', status:'Ativo' },
    { id:'lote-2', codigo:'TM-02', nome:'Terminação Confinamento', finalidade:'Terminação', sistema:'Confinamento',       status:'Ativo' },
    { id:'lote-3', codigo:'CR-03', nome:'Matrizes IATF',     finalidade:'Cria',  sistema:'Pasto',             status:'Ativo' },
  ],
  animais: [
    { id:'A-0001', brinco:'7421', statusBrinco:'ok',        sexo:'Macho', raca:'Nelore',      categoria:'cat-gar', vivo:true },
    { id:'A-0002', brinco:'7422', statusBrinco:'ok',        sexo:'Macho', raca:'Nelore',      categoria:'cat-gar', vivo:true },
    { id:'A-0003', brinco:null,   statusBrinco:'sem',       sexo:'Macho', raca:'Anelorado',   categoria:'cat-gar', vivo:true },
    { id:'A-0004', brinco:'5510', statusBrinco:'ok',        sexo:'Macho', raca:'Nelore',      categoria:'cat-boi', vivo:true },
    { id:'A-0005', brinco:'5511', statusBrinco:'ok',        sexo:'Macho', raca:'Brangus',     categoria:'cat-boi', vivo:true },
    { id:'A-0006', brinco:'5511', statusBrinco:'duplicado', sexo:'Macho', raca:'Brangus',     categoria:'cat-boi', vivo:true },
    { id:'A-0007', brinco:'3088', statusBrinco:'ok',        sexo:'Fêmea', raca:'Nelore',      categoria:'cat-vaca',vivo:true },
    { id:'A-0008', brinco:'3090', statusBrinco:'ok',        sexo:'Fêmea', raca:'Nelore',      categoria:'cat-vaca',vivo:true },
    { id:'A-0009', brinco:null,   statusBrinco:'sem',       sexo:'Fêmea', raca:'Anelorada',   categoria:'cat-nov', vivo:true },
    { id:'A-0010', brinco:'9120', statusBrinco:'ok',        sexo:'Fêmea', raca:'Nelore',      categoria:'cat-vaca',vivo:false },
  ],
  // tipo: nascimento|compra (entrada) · venda|morte (saída) · alocacao (gestão de lotes)
  movimentos: [
    { id:'mv-01', tipo:'compra',    data:'2026-03-04', responsavel:'Antonio C.', qtd:40, categoria:'cat-gar', loteDestino:'lote-1', vinculados:['A-0001','A-0002'], naoIdentificados:2, status:'pendente',   origem:'Fazenda São João' },
    { id:'mv-02', tipo:'nascimento',data:'2026-03-12', responsavel:'Equipe Campo',qtd:18, categoria:null, catDecl:[], loteDestino:'lote-3', vinculados:[], naoIdentificados:18, status:'pendente' },
    { id:'mv-03', tipo:'alocacao',  data:'2026-03-20', responsavel:'Antonio C.', qtd:30, categoria:'cat-gar', loteOrigem:'lote-1', loteDestino:'lote-2', vinculados:['A-0001'], naoIdentificados:0, status:'conciliado' },
    { id:'mv-04', tipo:'venda',     data:'2026-04-02', responsavel:'Antonio C.', qtd:22, categoria:'cat-boi', loteOrigem:'lote-2', vinculados:['A-0004','A-0005'], naoIdentificados:0, status:'conciliado', destino:'Frigorífico Vale' },
    { id:'mv-05', tipo:'venda',     data:'2026-04-18', responsavel:'Antonio C.', qtd:15, categoria:'cat-vaca',loteOrigem:'lote-3', vinculados:['A-0007','A-0008'], naoIdentificados:2, status:'pendente',  destino:'Leilão Reunidas' },
    { id:'mv-06', tipo:'morte',     data:'2026-04-25', responsavel:'Equipe Campo',qtd:1,  categoria:'cat-vaca',loteOrigem:'lote-3', vinculados:['A-0010'], naoIdentificados:0, status:'conciliado', causa:'Sanitária' },
  ],
  pesagens: [
    { id:'pe-01', animal:'A-0001', data:'2026-02-01', peso:268 },
    { id:'pe-02', animal:'A-0001', data:'2026-03-15', peso:312 },
    { id:'pe-03', animal:'A-0001', data:'2026-05-01', peso:368 },
    { id:'pe-04', animal:'A-0002', data:'2026-02-01', peso:255 },
    { id:'pe-05', animal:'A-0002', data:'2026-05-01', peso:340 },
    { id:'pe-06', animal:'A-0004', data:'2026-02-01', peso:412 },
    { id:'pe-07', animal:'A-0004', data:'2026-05-01', peso:505 },
    { id:'pe-08', animal:'A-0005', data:'2026-02-01', peso:430 },
    { id:'pe-09', animal:'A-0005', data:'2026-05-01', peso:498 },
    { id:'pe-10', animal:'A-0007', data:'2026-02-01', peso:445 },
    { id:'pe-11', animal:'A-0007', data:'2026-05-01', peso:470 },
  ],
  reproducao: [
    { id:'rp-01', matriz:'A-0007', tipo:'IATF',       data:'2026-01-10', resultado:'Inseminada' },
    { id:'rp-02', matriz:'A-0007', tipo:'Diagnóstico',data:'2026-02-20', resultado:'Prenhe' },
    { id:'rp-03', matriz:'A-0008', tipo:'IATF',       data:'2026-01-10', resultado:'Inseminada' },
    { id:'rp-04', matriz:'A-0008', tipo:'Diagnóstico',data:'2026-02-20', resultado:'Vazia' },
    { id:'rp-05', matriz:'A-0008', tipo:'Cobertura',  data:'2026-03-05', resultado:'Repasse touro' },
    { id:'rp-06', matriz:'A-0010', tipo:'Parto',      data:'2026-03-12', resultado:'Bezerro vivo' },
  ],
  favoritos: new Set(['Mesa de Conciliação','Pesagens']),
  fazendas: [
    { cod:'01', nome:'Natura 1' },
    { cod:'02', nome:'Reunidas Floresta' },
    { cod:'03', nome:'Fazenda São João' },
  ],
  proprietarios: [
    { cod:'01', nome:'Antonio Chaker' },
    { cod:'02', nome:'Reunidas Floresta Agro' },
    { cod:'03', nome:'Espólio Chaker' },
  ],
};

/* ===== Detalhes da Ficha Animal (campos opcionais por animal) ===== */
const FICHA_EXTRA = {
  'A-0001': {
    nome:'Trovão da Sede', rfid:'982 000123456789', sisbov:'076 000 123 456 789', ferro:'BV-04', rgn:null, rgd:null, grau:'PC', foto:null,
    nascimento:'2024-09-15', pelagem:'Branca', chifre:'Aspado',
    pai:'REM Estoril (RGD NL 4412)', mae:'A-0007', concepcao:'Monta Natural', parto:'Normal',
    entrada:'Nascimento', dataEntrada:'2024-09-15', origem:'Nascido na propriedade', proprietario:'Antonio Chaker', fazenda:'Natura 1',
    pesoNascer:32, primeiraPesagem:{ data:'2024-09-16', peso:33 }, desmama:'2025-04-10', ppt:6.4, hematocrito:34,
  },
  'A-0002': {
    rfid:'982 000123456790', sisbov:'076 000 123 456 790', ferro:'BV-04',
    nascimento:'2024-09-20', pelagem:'Branca', concepcao:'Monta Natural', parto:'Normal',
    entrada:'Nascimento', dataEntrada:'2024-09-20', origem:'Nascido na propriedade', proprietario:'Antonio Chaker', fazenda:'Natura 1',
    pesoNascer:30, desmama:'2025-04-10', ppt:5.9, hematocrito:31,
  },
  'A-0004': {
    rfid:'982 000987654321', sisbov:'076 000 987 654 321', ferro:'SJ-11', grau:'PC',
    nascimento:'2022-05-01', pelagem:'Branca', concepcao:'—', parto:'—',
    entrada:'Compra', dataEntrada:'2023-08-12', origem:'Fazenda São João', proprietario:'Antonio Chaker', fazenda:'Natura 1',
  },
  'A-0005': {
    rfid:'982 000987654322', ferro:'SJ-11', grau:'1/2 sangue',
    nascimento:'2022-06-10', pelagem:'Preta', entrada:'Compra', dataEntrada:'2023-08-12', origem:'Fazenda São João', proprietario:'Antonio Chaker', fazenda:'Natura 1',
  },
  'A-0007': {
    nome:'Estrela FIV da Boa Vista', rfid:'982 000345678901', sisbov:'076 000 345 678 901', ferro:'BV-01', rgn:'NLOR 12345 BV', rgd:'NLOR 67890 BV', grau:'PO', foto:null,
    nascimento:'2020-03-22', pelagem:'Branca', chifre:'Mocho genético',
    pai:'Naviraí FIV (RGD NL 1188)', mae:'Jandaia da Boa Vista (RGD NL 0921)', concepcao:'FIV', parto:'Normal',
    entrada:'Nascimento', dataEntrada:'2020-03-22', origem:'Nascido na propriedade', proprietario:'Antonio Chaker', fazenda:'Natura 1',
    pesoNascer:29, primeiraPesagem:{ data:'2020-03-23', peso:30 }, desmama:'2020-10-15', ppt:6.8, hematocrito:36,
  },
  'A-0008': {
    rfid:'982 000345678902', sisbov:'076 000 345 678 902', ferro:'BV-01', grau:'PC',
    nascimento:'2020-04-02', pelagem:'Branca', concepcao:'IATF', parto:'Normal',
    entrada:'Nascimento', dataEntrada:'2020-04-02', origem:'Nascido na propriedade', proprietario:'Antonio Chaker', fazenda:'Natura 1',
  },
};
DB.animais.forEach(a => { if (FICHA_EXTRA[a.id]) Object.assign(a, FICHA_EXTRA[a.id]); });

[
  { id:'A-0001', origemTipo:'Nascido na fazenda' },
  { id:'A-0004', origemTipo:'Comprado' },
  { id:'A-0005', origemTipo:'Comprado' },
  { id:'A-0007', origemTipo:'Nascido na fazenda' },
].forEach(s => { const a=DB.animais.find(x=>x.id===s.id); if(a) a.origemTipo=s.origemTipo; });

/* Progênies adicionais da matriz A-0007 (Estrela) — para demonstrar a aba Progênies e o IEP */
[
  { id:'A-0020', brinco:'5012', statusBrinco:'ok', sexo:'Fêmea', raca:'Nelore', categoria:'cat-nov', vivo:true,
    mae:'A-0007', pai:'Naviraí FIV (RGD NL 1188)', nascimento:'2022-08-04', pesoNascer:31, concepcao:'IATF', parto:'Normal' },
  { id:'A-0021', brinco:'5188', statusBrinco:'ok', sexo:'Macho', raca:'Nelore', categoria:'cat-gar', vivo:true,
    mae:'A-0007', pai:'REM Estoril (RGD NL 4412)', nascimento:'2023-09-12', pesoNascer:34, concepcao:'Monta Natural', parto:'Normal' },
].forEach(p => { if(!DB.animais.some(a=>a.id===p.id)) DB.animais.push(p); });

/* idade em meses a partir da data de nascimento */
function idadeMeses(iso){
  if(!iso) return null;
  const d = new Date(iso), now = new Date();
  return Math.max(0, (now.getFullYear()-d.getFullYear())*12 + (now.getMonth()-d.getMonth()));
}
function idadeLabel(iso){
  const m = idadeMeses(iso);
  if(m==null) return null;
  const anos = Math.floor(m/12), meses = m%12;
  if(anos<=0) return `${meses} meses`;
  return meses ? `${anos}a ${meses}m` : `${anos} anos`;
}

/* ===== Datasets de busca (código → descrição) ===== */
const LOOKUPS = {
  fazendas:      () => DB.fazendas,
  proprietarios: () => DB.proprietarios,
  retiros:       () => DB.locais.map((l,i)=>({ cod:String(i+1).padStart(2,'0'), nome:l.nome, ref:l.id })),
  locais:        () => DB.locais.map((l,i)=>({ cod:String(i+1).padStart(2,'0'), nome:l.nome, ref:l.id })),
  categorias:    () => DB.categorias.map((c,i)=>({ cod:String(i+1).padStart(2,'0'), nome:`${c.nome} (saldo ${saldoCategoria(c.id)})`, nomeCurto:c.nome, ref:c.id })),
};
function lkData(name){ return (LOOKUPS[name]||(()=>[]))(); }
function nextControle(){ return String(DB.movimentos.filter(m=>m.tipo==='nascimento').length+1).padStart(4,'0'); }

/* ===== Sanitário — vacinas/medicamentos e protocolos ===== */
DB.medicamentos = [
  { id:'med-1', nome:'Vacina Aftosa',            unidade:'DOSE',    custoUnit:2.40 },
  { id:'med-2', nome:'Vacina Brucelose B19',     unidade:'DOSE',    custoUnit:3.10 },
  { id:'med-3', nome:'Vacina Clostridiose',      unidade:'DOSE',    custoUnit:1.80 },
  { id:'med-4', nome:'Vermífugo Ivermectina 1%', unidade:'ML',      custoUnit:0.65 },
  { id:'med-5', nome:'Agulha Descartável 40x12', unidade:'UNIDADE', custoUnit:0.01 },
  { id:'med-6', nome:'Mineral Injetável ADE',    unidade:'ML',      custoUnit:0.90 },
];
DB.protocolos = [
  { id:'pr-1', nome:'Protocolo Cria — 1ª dose' },
  { id:'pr-2', nome:'Protocolo Sanitário Anual' },
  { id:'pr-3', nome:'Protocolo Pré-desmame' },
];
function safraAtual(){ const y=new Date().getFullYear(); const m=new Date().getMonth(); const ini = m>=6?y:y-1; return `${ini}/${ini+1}`; }

/* ===== Derivações — NUNCA campos fixos ===== */
const ENTRADAS = ['nascimento','compra'];
const SAIDAS = ['venda','morte'];

function saldoCategoria(catId){
  const c = DB.categorias.find(c=>c.id===catId);
  let s = c ? c.estoquePartida : 0;
  for(const m of DB.movimentos){
    if(ENTRADAS.includes(m.tipo)) s += entradaContribCat(m, catId);
    else if(SAIDAS.includes(m.tipo) && m.categoria===catId) s -= m.qtd;
  }
  return s;
}

/* categoria de um animal pelo seu cadastro */
function animalCat(id){ const a=DB.animais.find(a=>a.id===id); return a?a.categoria:null; }

/* quanto um movimento de entrada contribui para uma categoria:
   - detalhe (animais com ID) sempre conta na categoria REAL do animal
   - o restante declarado (catDecl) ainda não detalhado conta na categoria declarada
   - movimento "total" (categoria null, sem declaração) só conta o que foi detalhado */
function entradaContribCat(m, catId){
  if(m.catDecl && m.catDecl.length){
    const declared = m.catDecl.filter(d=>d.catId===catId).reduce((a,d)=>a+d.qtd,0);
    const detailed = m.vinculados.filter(id=>animalCat(id)===catId).length;
    return detailed + Math.max(0, declared - detailed);
  }
  if(m.categoria===catId) return m.qtd;
  if(m.categoria==null && m.tipo==='nascimento')
    return m.vinculados.filter(id=>animalCat(id)===catId).length;
  return 0;
}

/* parte de um movimento que ainda não pertence a nenhuma categoria (a detalhar) */
function semCategoriaContrib(m){
  let cats = 0;
  for(const c of DB.categorias) cats += entradaContribCat(m, c.id);
  return Math.max(0, m.qtd - cats);
}
function semCategoriaTotal(){
  let s = 0;
  for(const m of DB.movimentos) if(ENTRADAS.includes(m.tipo)) s += semCategoriaContrib(m);
  return s;
}

/* estoque total é agnóstico de categoria: partida + entradas − saídas (a quantidade é a âncora) */
function estoqueTotal(){
  let s = DB.categorias.reduce((a,c)=>a+c.estoquePartida,0);
  for(const m of DB.movimentos){
    if(ENTRADAS.includes(m.tipo)) s += m.qtd;
    else if(SAIDAS.includes(m.tipo)) s -= m.qtd;
  }
  return s;
}
function saldoLote(loteId){
  let s = 0;
  for(const m of DB.movimentos){
    if(m.loteDestino===loteId && (ENTRADAS.includes(m.tipo)||m.tipo==='alocacao')) s += m.qtd;
    if(m.loteOrigem===loteId && (SAIDAS.includes(m.tipo)||m.tipo==='alocacao')) s -= m.qtd;
  }
  return s;
}

/* lote atual do animal = último movimento que o vinculou */
function loteAtualAnimal(animalId){
  let lote = null, last = '';
  for(const m of DB.movimentos){
    if(!m.vinculados.includes(animalId)) continue;
    if(m.data >= last){ last = m.data; if(m.loteDestino) lote = m.loteDestino; else if(m.loteOrigem && SAIDAS.includes(m.tipo)) lote = '—'; }
  }
  return lote;
}
function nomeLote(id){ const l=DB.lotes.find(l=>l.id===id); return l?`${l.codigo} · ${l.nome}`:'—'; }
function nomeCategoria(id){ const c=DB.categorias.find(c=>c.id===id); return c?c.nome:'—'; }

/* não identificados pendentes (vão à Mesa) */
function naoIdentificadosPendentes(){
  return DB.movimentos.filter(m=>m.status==='pendente').reduce((a,m)=>a+m.naoIdentificados,0);
}
function pendenciasMesa(){ return DB.movimentos.filter(m=>m.status==='pendente'); }

/* cobertura individual = (estoque − não identificados) ÷ estoque */
function coberturaGlobal(){
  const est = estoqueTotal();
  const ni = naoIdentificadosPendentes();
  return est>0 ? ((est-ni)/est)*100 : 100;
}
function classifCobertura(pct){
  if(pct>98) return {label:'Excelente', cls:'ok'};
  if(pct>=95) return {label:'Bom', cls:'ok'};
  if(pct>=90) return {label:'Atenção', cls:'alerta'};
  return {label:'Crítico', cls:'crit'};
}

/* GMD a partir de pesagens */
function gmdAnimal(animalId){
  const ps = DB.pesagens.filter(p=>p.animal===animalId).sort((a,b)=>a.data.localeCompare(b.data));
  if(ps.length<2) return null;
  const a=ps[0], b=ps[ps.length-1];
  const dias = (new Date(b.data)-new Date(a.data))/86400000;
  if(dias<=0) return null;
  return { gmd:(b.peso-a.peso)/dias, dias, pesoIni:a.peso, pesoFim:b.peso, n:ps.length, serie:ps };
}
function animaisComPesagem(){
  return [...new Set(DB.pesagens.map(p=>p.animal))];
}

/* reprodução */
function repMatrizes(){
  return [...new Set(DB.reproducao.map(r=>r.matriz))];
}
function taxaPrenhez(){
  const diag = DB.reproducao.filter(r=>r.tipo==='Diagnóstico');
  if(!diag.length) return 0;
  return diag.filter(r=>r.resultado==='Prenhe').length / diag.length * 100;
}

function brl(n){ return n.toLocaleString('pt-BR'); }
function hojeISO(){ return new Date().toISOString().slice(0,10); }
function nextAnimalId(){
  const nums = DB.animais.map(a=>parseInt((a.id.match(/\d+/)||[0])[0])||0);
  return 'A-'+String(Math.max(0,...nums)+1).padStart(4,'0');
}
function fmtData(d){ const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; }
function tipoLabel(t){ return ({nascimento:'Nascimento',compra:'Compra',venda:'Venda',morte:'Morte',alocacao:'Alocação'})[t]||t; }
function statusPill(s){
  if(s==='conciliado') return `<span class="pill ok"><span class="d"></span>Conciliado</span>`;
  if(s==='pendente')   return `<span class="pill pend"><span class="d"></span>Pendente</span>`;
  if(s==='critico')    return `<span class="pill crit"><span class="d"></span>Crítico</span>`;
  return `<span class="pill neutral"><span class="d"></span>${s}</span>`;
}
