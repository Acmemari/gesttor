/* ===== Vendas — variações de layout ===== */
const { useState } = React;

/* ---------- Faixa de contexto compacta (compartilhada A e B) ---------- */
function CtxBar({cols='cols6'}){
  return (
    <div>
      <div className={'vd-ctx '+cols}>
        <div className="vd-f"><label>Data</label><div className="ctl"><b>08/06/2026</b></div></div>
        <div className="vd-f"><label>Tipo de venda</label><div className="ctl sel"><span>Venda Abate</span><VdIcon d={VD_ICON.chev} s={14}/></div></div>
        <div className="vd-f"><label>Tipo de peso</label><div className="ctl sel"><span>Arroba (@)</span><VdIcon d={VD_ICON.chev} s={14}/></div></div>
        <div className="vd-f"><label>Proprietário <span className="rq">*</span></label><div className="ctl sel"><span>Antonio Chaker</span><VdIcon d={VD_ICON.chev} s={14}/></div></div>
        <div className="vd-f"><label>Cliente <span className="rq">*</span></label><div className="ctl sel"><span>Frigorífico Mineiro</span><VdIcon d={VD_ICON.chev} s={14}/></div></div>
        <div className="vd-f"><label>Fazenda · Retiro</label><div className="ctl sel"><span>Natura 1 · Natura 1</span><VdIcon d={VD_ICON.chev} s={14}/></div></div>
      </div>
    </div>
  );
}

/* ========================================================================
   REFERÊNCIA — recriação da tela atual (com anotações de problema)
   ===================================================================== */
function VendasAtual(){
  return (
    <div className="vd-screen">
      <div className="vd-top">
        <div className="vd-title"><VdIcon d={VD_ICON.money} s={20} color="#16a34a"/>Vendas</div>
        <div className="vd-actions">
          <div className="vd-seg"><button className="on"><VdIcon d={VD_ICON.plus} s={14}/>Lançamentos</button><button>Registros <span className="cnt">1</span></button></div>
        </div>
      </div>
      <div className="vd-body" style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20,position:'relative'}}>
        {/* coluna form */}
        <div>
          <div className="form-grid" style={{gridTemplateColumns:'repeat(5,1fr)',gap:'12px'}}>
            <div className="field"><label>Data</label><input defaultValue="08/06/2026" readOnly/></div>
            <div className="field"><label>Tipo de venda</label><select><option>Venda Abate</option></select></div>
            <div className="field"><label>Tipo de peso</label><select><option>Arroba (@)</option></select></div>
            <div className="field"><label>Proprietário</label><select><option>Selecionar…</option></select></div>
            <div className="field"><label>Cliente *</label><select><option>Selecionar…</option></select></div>
          </div>
          <div className="vd-safra" style={{margin:'8px 0 14px'}}>Safra 2025/2026</div>
          <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:16}}>
            <div className="field"><label>Fazenda</label><select><option>Natura 1</option></select></div>
            <div className="field"><label>Retiro</label><select><option>Natura 1</option></select></div>
          </div>
          <div className="vd-section-label"><VdIcon d={VD_ICON.cow} s={16} color="#16a34a"/>Animais por categoria</div>
          <div className="form-grid" style={{gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:12}}>
            <div className="field"><label>Quantidade *</label><input placeholder="Ex.: 50"/></div>
            <div className="field"><label>Categoria *</label><select><option>Selecione…</option></select></div>
            <div className="field"><label>Idade média</label><input placeholder="Ex.: 36"/></div>
            <div className="field"><label>Peso vivo</label><input placeholder="Ex.: 480"/></div>
          </div>
          <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr auto',gap:'12px',alignItems:'end',marginBottom:16}}>
            <div className="field"><label>Valor/@ *</label><input placeholder="Ex.: 320,00"/></div>
            <div className="field"><label>Peso morto total *</label><input placeholder="Ex.: 7200"/></div>
            <button className="btn outline" style={{height:38}}><VdIcon d={VD_ICON.plus} s={15}/>mais</button>
          </div>
          <div className="panel" style={{background:'#fafbfc',marginBottom:14}}>
            <div style={{padding:'12px 16px'}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>💲 Valores da venda</div>
              <div style={{fontSize:11.5,color:'#9ca3af',marginBottom:12}}>Valor/@ e peso morto informados por categoria.</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:8}}>
                {['Peso morto total','Peso morto/cab','Peso morto @','Rendimento','Valor/@ médio','Valor/cabeça','Valor total'].map((l,i)=>(
                  <div key={i}><div style={{fontSize:9.5,color:'#9ca3af',fontWeight:700,textTransform:'uppercase'}}>{l}</div><div style={{fontSize:16,color:'#c2c7d0',marginTop:4}}>—</div></div>
                ))}
              </div>
            </div>
          </div>
          <div className="vd-obs"><label>Observação</label><textarea placeholder="Detalhes da venda…"/></div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:14}}>
            <button className="btn">Cancelar</button><button className="btn green" disabled>Salvar</button>
          </div>
        </div>
        {/* coluna tabela */}
        <div>
          <div className="panel" style={{margin:0}}>
            <div className="panel-head" style={{padding:'13px 14px'}}><VdIcon d={VD_ICON.tag} s={15} color="#16a34a"/><h3 style={{fontSize:13.5}}>Categorias do lote</h3></div>
            <div style={{overflowX:'auto'}}>
              <table className="tbl" style={{minWidth:560,fontSize:11.5}}>
                <thead><tr><th>Cat.</th><th>Qtd</th><th>Idade</th><th>P.vivo</th><th>Valor/@</th><th>P.morto</th><th>Ação</th></tr></thead>
                <tbody><tr><td colSpan={7} className="empty" style={{padding:24,fontSize:12}}>Nenhuma categoria adicionada — o total começa em 0.</td></tr></tbody>
              </table>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:14,padding:'0 4px'}}><span style={{color:'#9ca3af',fontWeight:600}}>TOTAL</span><span style={{color:'#16a34a',fontWeight:700,fontSize:16}}>0 cab.</span></div>
        </div>
        {/* anotações */}
        <div className="vd-flag" style={{top:230,left:'46%'}}><b>Entrada e saída separadas:</b> você digita aqui e o resultado aparece na tabela do outro lado da tela.</div>
        <div className="vd-flag" style={{top:470,right:24}}><b>Tabela espremida</b> em ~40% da largura → scroll horizontal, colunas cortadas.</div>
        <div className="vd-flag" style={{top:560,left:'2%'}}><b>Tira de 7 métricas</b> com "—": muita altura, difícil de ler.</div>
      </div>
    </div>
  );
}

/* ========================================================================
   OPÇÃO A — Grade editável full-width + barra de totais sticky
   ===================================================================== */
function VendasGrade(){
  const [rows,setRows]=useState(VD_SAMPLE.map(r=>({...r})));
  const upd=(id,k,v)=>setRows(rs=>rs.map(r=>r.id===id?{...r,[k]:v}:r));
  const del=(id)=>setRows(rs=>rs.filter(r=>r.id!==id));
  const add=()=>setRows(rs=>[...rs,{id:Date.now(),cat:'',qtd:'',idade:'',pesoVivo:'',valorArroba:'',pesoMortoTotal:''}]);
  const T=vdTotals(rows); const rendM=vdRendMedia(T);
  return (
    <div className="vd-screen">
      <div className="vd-top">
        <div className="vd-title"><VdIcon d={VD_ICON.money} s={20} color="#16a34a"/>Vendas</div>
        <div className="vd-actions"><div className="vd-seg"><button className="on"><VdIcon d={VD_ICON.plus} s={14}/>Lançamentos</button><button>Registros <span className="cnt">1</span></button></div></div>
      </div>
      <div className="vd-body">
        <CtxBar cols="cols6"/>
        <div className="vd-safra">Safra 2025/2026</div>
        <div className="vd-grid-wrap">
          <div className="vd-grid-head">
            <div className="gh-title"><VdIcon d={VD_ICON.cow} s={16} color="#16a34a"/>Categorias do lote</div>
            <div className="gh-hint">Edite direto nas células · colunas em azul são calculadas</div>
          </div>
          <div className="vd-grid-scroll">
            <table className="vd-grid">
              <thead>
                <tr>
                  <th className="l">Categoria</th><th>Qtd</th><th>Idade</th><th>Peso vivo<br/>(kg/cab)</th>
                  <th>Valor/@</th><th>Peso morto<br/>total (kg)</th>
                  <th className="calc-h">Rend.</th><th className="calc-h">@ morto</th>
                  <th className="calc-h">Valor/cab</th><th className="calc-h">Valor total</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r=>{const c=vdCalc(r);return(
                  <tr key={r.id}>
                    <td><select className="vd-cell l cat sel" value={r.cat} onChange={e=>upd(r.id,'cat',e.target.value)}><option value="">Selecione…</option>{VD_CATS.map(x=><option key={x} value={x}>{x}</option>)}</select></td>
                    <td><input className="vd-cell" value={r.qtd} placeholder="0" onChange={e=>upd(r.id,'qtd',e.target.value)}/></td>
                    <td><input className="vd-cell" value={r.idade} placeholder="—" onChange={e=>upd(r.id,'idade',e.target.value)}/></td>
                    <td><input className="vd-cell" value={r.pesoVivo} placeholder="0" onChange={e=>upd(r.id,'pesoVivo',e.target.value)}/></td>
                    <td><input className="vd-cell" value={r.valorArroba} placeholder="0" onChange={e=>upd(r.id,'valorArroba',e.target.value)}/></td>
                    <td><input className="vd-cell" value={r.pesoMortoTotal} placeholder="0" onChange={e=>upd(r.id,'pesoMortoTotal',e.target.value)}/></td>
                    <td className="calc"><div className="vd-calc-val rend">{c.rend?fmtN(c.rend,1)+'%':'—'}</div></td>
                    <td className="calc"><div className="vd-calc-val">{c.arrobaMorta?fmtN(c.arrobaMorta,0):'—'}<span className="u">@</span></div></td>
                    <td className="calc"><div className="vd-calc-val">{c.valorCab?fmtBRL(c.valorCab):'—'}</div></td>
                    <td className="calc"><div className="vd-calc-val total">{c.valorTot?fmtBRL(c.valorTot):'—'}</div></td>
                    <td className="act"><button className="vd-del" onClick={()=>del(r.id)}><VdIcon d={VD_ICON.trash} s={15}/></button></td>
                  </tr>
                );})}
                <tr className="vd-addrow"><td colSpan={11}><button onClick={add}><VdIcon d={VD_ICON.plus} s={16}/>Adicionar categoria</button></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="vd-obs"><label>Observação <span style={{color:'#9ca3af',fontWeight:400}}>(opcional)</span></label><textarea placeholder="Detalhes da venda…"/></div>
      </div>
      <div className="vd-totalbar">
        <div className="vd-tb-metric"><div className="vd-tb-label">Cabeças</div><div className="vd-tb-value">{fmtN(T.qtd)} <small>cab</small></div></div>
        <div className="vd-tb-metric"><div className="vd-tb-label">Peso vivo</div><div className="vd-tb-value">{fmtN(T.pesoVivoTot)} <small>kg</small></div></div>
        <div className="vd-tb-metric"><div className="vd-tb-label">Peso morto</div><div className="vd-tb-value">{fmtN(T.pm)} <small>kg</small></div></div>
        <div className="vd-tb-metric"><div className="vd-tb-label">@ morto</div><div className="vd-tb-value">{fmtN(T.arroba)} <small>@</small></div></div>
        <div className="vd-tb-metric"><div className="vd-tb-label">Rendimento</div><div className="vd-tb-value green">{fmtN(rendM,1)}%</div></div>
        <div className="vd-tb-metric big"><div className="vd-tb-label">Valor total</div><div className="vd-tb-value green">{fmtBRL(T.valor)}</div></div>
        <div className="vd-tb-actions"><button className="btn">Cancelar</button><button className="btn green"><VdIcon d={VD_ICON.save} s={16}/>Salvar</button></div>
      </div>
    </div>
  );
}

window.VendasAtual=VendasAtual; window.VendasGrade=VendasGrade; window.CtxBar=CtxBar;
