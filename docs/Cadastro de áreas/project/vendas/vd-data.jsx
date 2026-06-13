/* ===== Vendas — dados de exemplo + helpers (escopo global) ===== */
const VD_ICON = {
  money:'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  cow:'M3 5s1 3 4 3 4-3 4-3M13 5s1 3 4 3 4-3 4-3M5 11c0 3 3 7 7 7s7-4 7-7M9 14h.01M15 14h.01',
  chev:'M6 9l6 6 6-6',
  plus:'M12 5v14M5 12h14',
  trash:'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  calc:'M9 7h6M9 11h6M9 15h2M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  tag:'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z',
};
function VdIcon({d, s=16, color, style}){
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color||'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split('M').filter(Boolean).map((seg,i)=><path key={i} d={'M'+seg}/>)}
    </svg>
  );
}

const ARROBA = 15; // kg por @
const fmtN = (n,dec=0)=> (n==null||isNaN(n))?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
const fmtBRL = (n)=> (n==null||isNaN(n))?'—':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0,maximumFractionDigits:0});
const fmtBRL2 = (n)=> (n==null||isNaN(n))?'—':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});

function vdCalc(r){
  const qtd=+r.qtd||0, pv=+r.pesoVivo||0, va=+r.valorArroba||0, pm=+r.pesoMortoTotal||0;
  const pesoVivoTot = qtd*pv;
  const arrobaMorta = pm/ARROBA;
  const rend = pesoVivoTot? (pm/pesoVivoTot*100):0;
  const valorTot = arrobaMorta*va;
  const valorCab = qtd? valorTot/qtd:0;
  const pmCab = qtd? pm/qtd:0;
  return {qtd,pv,va,pm,pesoVivoTot,arrobaMorta,rend,valorTot,valorCab,pmCab};
}
function vdTotals(rows){
  return rows.reduce((a,r)=>{
    const c=vdCalc(r);
    a.qtd+=c.qtd; a.pesoVivoTot+=c.pesoVivoTot; a.pm+=c.pm; a.arroba+=c.arrobaMorta; a.valor+=c.valorTot;
    return a;
  },{qtd:0,pesoVivoTot:0,pm:0,arroba:0,valor:0});
}
const vdRendMedia = (t)=> t.pesoVivoTot? (t.pm/t.pesoVivoTot*100):0;

const VD_CATS = ['Boi gordo','Novilha','Vaca descarte','Garrote','Bezerro(a)','Vaca','Touro'];

const VD_SAMPLE = [
  {id:1, cat:'Boi gordo',     qtd:80, idade:36, pesoVivo:520, valorArroba:320, pesoMortoTotal:21632},
  {id:2, cat:'Novilha',       qtd:25, idade:30, pesoVivo:420, valorArroba:315, pesoMortoTotal:5512},
  {id:3, cat:'Vaca descarte', qtd:15, idade:64, pesoVivo:480, valorArroba:298, pesoMortoTotal:3564},
];

window.VdIcon=VdIcon; window.VD_ICON=VD_ICON; window.vdCalc=vdCalc; window.vdTotals=vdTotals;
window.vdRendMedia=vdRendMedia; window.fmtN=fmtN; window.fmtBRL=fmtBRL; window.fmtBRL2=fmtBRL2;
window.VD_CATS=VD_CATS; window.VD_SAMPLE=VD_SAMPLE; window.ARROBA=ARROBA;
