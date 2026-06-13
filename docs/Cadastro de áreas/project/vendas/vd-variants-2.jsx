/* ===== Vendas — variações B e C ===== */
const { useState: useStateBC } = React;

/* ========================================================================
   OPÇÃO B — Lançamento familiar (linha) + tabela full-width + totais fixos
   ===================================================================== */
function VendasEmpilhado(){
  const rows = VD_SAMPLE;
  const T = vdTotals(rows); const rendM = vdRendMedia(T);
  return (
    <div className="vd-screen">
      <div className="vd-top">
        <div className="vd-title"><VdIcon d={VD_ICON.money} s={20} color="#16a34a"/>Vendas</div>
        <div className="vd-actions"><div className="vd-seg"><button className="on"><VdIcon d={VD_ICON.plus} s={14}/>Lançamentos</button><button>Registros <span className="cnt">1</span></button></div></div>
      </div>
      <div className="vd-body">
        <CtxBar cols="cols6"/>
        <div className="vd-safra">Safra 2025/2026</div>

        <div className="vd-section-label"><VdIcon d={VD_ICON.cow} s={16} color="#16a34a"/>Adicionar categoria</div>
        <div className="vd-entry">
          <div className="vd-f"><label>Categoria <span className="rq">*</span></label><div className="ctl sel"><span>Selecione…</span><VdIcon d={VD_ICON.chev} s={14}/></div></div>
          <div className="vd-f"><label>Qtd <span className="rq">*</span></label><div className="ctl ph">50</div></div>
          <div className="vd-f"><label>Idade</label><div className="ctl ph">36</div></div>
          <div className="vd-f"><label>Peso vivo</label><div className="ctl ph">480</div></div>
          <div className="vd-f"><label>Valor/@ <span className="rq">*</span></label><div className="ctl ph">320,00</div></div>
          <div className="vd-f"><label>Peso morto total <span className="rq">*</span></label><div className="ctl ph">7200</div></div>
          <button className="vd-add-cat"><VdIcon d={VD_ICON.plus} s={17}/>Adicionar</button>
        </div>

        <div className="vd-section-label" style={{marginTop:22}}><VdIcon d={VD_ICON.tag} s={16} color="#16a34a"/>Categorias do lote <span className="cnt">{rows.length}</span></div>
        <div className="panel" style={{margin:0}}>
          <table className="vd-out">
            <thead>
              <tr>
                <th className="l">Categoria</th><th>Qtd</th><th>Idade</th><th>Peso vivo</th><th>Valor/@</th>
                <th>Peso morto</th><th>Rend.</th><th>@ morto</th><th>Valor/cab</th><th>Valor total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>{const c=vdCalc(r);return(
                <tr key={r.id}>
                  <td className="l">{r.cat}</td>
                  <td>{fmtN(c.qtd)}</td>
                  <td>{r.idade}m</td>
                  <td>{fmtN(c.pv)} kg</td>
                  <td>{fmtBRL2(c.va)}</td>
                  <td>{fmtN(c.pm)} kg</td>
                  <td className="rend">{fmtN(c.rend,1)}%</td>
                  <td className="calc">{fmtN(c.arrobaMorta)} @</td>
                  <td className="calc">{fmtBRL(c.valorCab)}</td>
                  <td style={{fontWeight:700}}>{fmtBRL(c.valorTot)}</td>
                  <td style={{textAlign:'center'}}><button className="vd-del"><VdIcon d={VD_ICON.trash} s={15}/></button></td>
                </tr>
              );})}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">Total · {rows.length} categorias</td>
                <td>{fmtN(T.qtd)}</td><td></td><td></td><td></td>
                <td>{fmtN(T.pm)} kg</td>
                <td className="rend">{fmtN(rendM,1)}%</td>
                <td>{fmtN(T.arroba)} @</td>
                <td></td>
                <td style={{color:'#16a34a'}}>{fmtBRL(T.valor)}</td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="vd-obs"><label>Observação <span style={{color:'#9ca3af',fontWeight:400}}>(opcional)</span></label><textarea placeholder="Detalhes da venda…"/></div>
      </div>
      <div className="vd-totalbar">
        <div className="vd-tb-metric"><div className="vd-tb-label">Cabeças</div><div className="vd-tb-value">{fmtN(T.qtd)} <small>cab</small></div></div>
        <div className="vd-tb-metric"><div className="vd-tb-label">Peso morto</div><div className="vd-tb-value">{fmtN(T.pm)} <small>kg</small></div></div>
        <div className="vd-tb-metric"><div className="vd-tb-label">@ morto</div><div className="vd-tb-value">{fmtN(T.arroba)} <small>@</small></div></div>
        <div className="vd-tb-metric"><div className="vd-tb-label">Rendimento</div><div className="vd-tb-value green">{fmtN(rendM,1)}%</div></div>
        <div className="vd-tb-metric big"><div className="vd-tb-label">Valor total</div><div className="vd-tb-value green">{fmtBRL(T.valor)}</div></div>
        <div className="vd-tb-actions"><button className="btn">Cancelar</button><button className="btn green"><VdIcon d={VD_ICON.save} s={16}/>Salvar</button></div>
      </div>
    </div>
  );
}

/* ========================================================================
   OPÇÃO C — Cards de categoria + painel de resumo lateral fixo
   ===================================================================== */
function VendasCards(){
  const rows = VD_SAMPLE;
  const T = vdTotals(rows); const rendM = vdRendMedia(T);
  return (
    <div className="vd-screen">
      <div className="vd-top">
        <div className="vd-title"><VdIcon d={VD_ICON.money} s={20} color="#16a34a"/>Vendas</div>
        <div className="vd-actions"><div className="vd-seg"><button className="on"><VdIcon d={VD_ICON.plus} s={14}/>Lançamentos</button><button>Registros <span className="cnt">1</span></button></div></div>
      </div>
      <div className="vd-body">
        <CtxBar cols="cols6"/>
        <div className="vd-safra">Safra 2025/2026</div>
        <div className="vd-split">
          <div>
            <div className="vd-section-label"><VdIcon d={VD_ICON.cow} s={16} color="#16a34a"/>Animais por categoria <span className="cnt">{rows.length}</span></div>
            <div className="vd-cat-cards">
              {rows.map(r=>{const c=vdCalc(r);return(
                <div className="vd-cat-card" key={r.id}>
                  <div className="vd-cc-icon"><VdIcon d={VD_ICON.cow} s={21}/></div>
                  <div className="vd-cc-main">
                    <div className="vd-cc-name">{r.cat}</div>
                    <div className="vd-cc-meta">
                      <span><b>{fmtN(c.qtd)}</b> cab</span>
                      <span>{r.idade}m</span>
                      <span><b>{fmtN(c.pv)}</b> kg/cab</span>
                      <span>{fmtBRL2(c.va)}/@</span>
                      <span className="vd-pill-rend">{fmtN(c.rend,1)}% rend.</span>
                    </div>
                  </div>
                  <div className="vd-cc-nums">
                    <div className="vd-cc-num"><div className="n-l">@ morto</div><div className="n-v">{fmtN(c.arrobaMorta)}</div></div>
                    <div className="vd-cc-num"><div className="n-l">Valor/cab</div><div className="n-v">{fmtBRL(c.valorCab)}</div></div>
                    <div className="vd-cc-num"><div className="n-l">Valor total</div><div className="n-v green">{fmtBRL(c.valorTot)}</div></div>
                  </div>
                  <button className="vd-cc-del"><VdIcon d={VD_ICON.trash} s={15}/></button>
                </div>
              );})}
              <button className="vd-cat-add"><VdIcon d={VD_ICON.plus} s={18}/>Adicionar categoria</button>
            </div>
            <div className="vd-obs" style={{marginTop:18}}><label>Observação <span style={{color:'#9ca3af',fontWeight:400}}>(opcional)</span></label><textarea placeholder="Detalhes da venda…"/></div>
          </div>
          {/* resumo lateral */}
          <div className="vd-summary">
            <div className="vd-sum-head">
              <div className="s-l">Valor total da venda</div>
              <div className="s-v">{fmtBRL(T.valor)}</div>
            </div>
            <div className="vd-sum-body">
              <div className="vd-sum-row"><span className="k">Cabeças</span><span className="v">{fmtN(T.qtd)} cab</span></div>
              <div className="vd-sum-row"><span className="k">Peso vivo total</span><span className="v">{fmtN(T.pesoVivoTot)} kg</span></div>
              <div className="vd-sum-row"><span className="k">Peso morto total</span><span className="v">{fmtN(T.pm)} kg</span></div>
              <div className="vd-sum-row"><span className="k">@ morto</span><span className="v">{fmtN(T.arroba)} @</span></div>
              <div className="vd-sum-row"><span className="k">Rendimento médio</span><span className="v green">{fmtN(rendM,1)}%</span></div>
              <div className="vd-sum-row"><span className="k">Valor/@ médio</span><span className="v">{fmtBRL2(T.arroba?T.valor/T.arroba:0)}</span></div>
              <div className="vd-sum-row"><span className="k">Valor/cabeça médio</span><span className="v">{fmtBRL(T.qtd?T.valor/T.qtd:0)}</span></div>
            </div>
            <div className="vd-sum-foot"><button className="btn green"><VdIcon d={VD_ICON.save} s={16}/>Salvar venda</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.VendasEmpilhado=VendasEmpilhado; window.VendasCards=VendasCards;
