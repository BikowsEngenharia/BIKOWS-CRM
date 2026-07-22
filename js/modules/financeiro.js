/* ==========================================
   FINANCEIRO — Hub Financeiro Completo
   ========================================== */
const Financeiro = (() => {
  let _tab = 'visao_geral';
  let _filtLanc = { tipo:'', categoria:'', status:'', busca:'', mesInicio:'', mesFim:'' };
  let _filtPagar = { status:'', categoria:'' };
  let _dremes = new Date().toISOString().substring(0, 7);

  const CATS_R = ['Serviços de Engenharia','NR-12 / Segurança','Projetos Estruturais','Treinamentos','Consultorias','Atlas / Produtos','Outros'];
  const CATS_D = ['Folha de Pagamento','Encargos/FGTS','Materiais','Aluguel/Estrutura','Combustível','Marketing','TI/Softwares','Contabilidade','Subcontratados','Outros'];

  function render() {
    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Financeiro</h2>
        <div class="sec-actions">
          <button class="btn btn-success btn-sm" onclick="Financeiro.novoLancamento()">+ Receita</button>
          <button class="btn btn-danger btn-sm" onclick="Financeiro.novaDespesa()">+ Despesa</button>
          <button class="btn btn-secondary btn-sm" onclick="Financeiro.novaContaPagar()">+ Conta a Pagar</button>
        </div>
      </div>
      <div class="tabs mb-4">
        ${[['visao_geral','📊 Visão Geral'],['lancamentos','📋 Lançamentos'],['receber','💰 Contas a Receber'],['pagar','📤 Contas a Pagar'],['dre','📈 DRE'],['fluxo','🔄 Fluxo de Caixa'],['despesas_fixas','📌 Despesas Fixas'],['dividas','💳 Dívidas'],['ativos','🏭 Ativos']].map(([id,lb])=>`<button class="tab-btn ${_tab===id?'active':''}" onclick="Financeiro.setTab('${id}')">${lb}</button>`).join('')}
      </div>
      <div id="finContent"></div>`;
    renderTab();
  }

  function setTab(t) { _tab=t; render(); }

  function renderTab() {
    const el = document.getElementById('finContent'); if (!el) return;
    switch (_tab) {
      case 'visao_geral': el.innerHTML=buildVisaoGeral(); setTimeout(renderCharts,50); break;
      case 'lancamentos': el.innerHTML=buildLancamentos(); break;
      case 'receber':     el.innerHTML=buildReceber(); break;
      case 'pagar':       el.innerHTML=buildPagar(); break;
      case 'dre':         el.innerHTML=buildDRE(); setTimeout(renderDREChart,50); break;
      case 'fluxo':          el.innerHTML=buildFluxo(); setTimeout(renderFluxoChart,50); break;
      case 'despesas_fixas': el.innerHTML=buildDespesasFixas(); break;
      case 'dividas':        el.innerHTML=buildDividas(); break;
      case 'ativos':         el.innerHTML=buildAtivos(); break;
    }
  }

  /* ---- VISÃO GERAL ---- */
  function buildVisaoGeral() {
    const lanc=DB.getAll('lancamentos'), rec=DB.getAll('recebiveis'), pag=DB.getAll('contaspagar');
    const mes=Utils.todayStr().substring(0,7);
    const recMes=lanc.filter(l=>l.tipo==='receita'&&l.data?.startsWith(mes)&&l.status==='recebido').reduce((s,l)=>s+l.valor,0);
    const dspMes=lanc.filter(l=>l.tipo==='despesa'&&l.data?.startsWith(mes)&&l.status==='pago').reduce((s,l)=>s+l.valor,0);
    const res=recMes-dspMes;
    // A Receber = parcelas de recebíveis em aberto (não vencidas) + lançamentos "a receber"
    // Antes contava só lançamentos e não batia com o detalhamento (que lista parcelas)
    const aRecParcelas=rec.reduce((s,r)=>s+(r.parcelas||[]).filter(p=>p.status!=='recebido'&&!Utils.isOverdue(p.vencimento)).reduce((a,p)=>a+p.valor,0),0);
    const aRecLanc=lanc.filter(l=>l.tipo==='receita'&&l.status==='a_receber').reduce((s,l)=>s+l.valor,0);
    const aRec=aRecParcelas+aRecLanc;
    const aPag=pag.filter(p=>p.status==='pendente').reduce((s,p)=>s+p.valor,0);
    const venc=rec.reduce((s,r)=>s+(r.parcelas||[]).filter(p=>p.status!=='recebido'&&Utils.isOverdue(p.vencimento)).reduce((a,p)=>a+p.valor,0),0);

    return `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" title="Clique para ver recebimentos do período" onclick="Financeiro.drillDown('recebido_periodo')"><div class="kpi-label">Receita do Mês</div><div class="kpi-value" style="font-size:20px">${Utils.formatCurrency(recMes)}</div><div class="kpi-sub">Valores recebidos</div><div class="kpi-icon">📥</div></div>
        <div class="kpi-card" style="--kpi-color:#dc2626;cursor:pointer" title="Clique para ver lançamentos do período" onclick="Financeiro.drillDown('lancamentos')"><div class="kpi-label">Despesas do Mês</div><div class="kpi-value" style="font-size:20px">${Utils.formatCurrency(dspMes)}</div><div class="kpi-sub">Valores pagos</div><div class="kpi-icon">📤</div></div>
        <div class="kpi-card" style="--kpi-color:${res>=0?'#10b981':'#dc2626'}"><div class="kpi-label">Resultado</div><div class="kpi-value" style="font-size:20px;color:${res>=0?'var(--success)':'var(--danger)'}">${Utils.formatCurrency(res)}</div><div class="kpi-sub">${res>=0?'Superávit':'Déficit'} no mês</div><div class="kpi-icon">📊</div></div>
        <div class="kpi-card" style="--kpi-color:#d97706;cursor:pointer" title="Clique para ver parcelas a vencer" onclick="Financeiro.drillDown('receber_avencer')"><div class="kpi-label">A Receber</div><div class="kpi-value" style="font-size:20px">${Utils.formatCurrency(aRec)}</div><div class="kpi-sub">Parcelas + lançamentos em aberto</div><div class="kpi-icon">💳</div></div>
        <div class="kpi-card" style="--kpi-color:#7c3aed;cursor:pointer" title="Clique para ver contas a pagar" onclick="Financeiro.drillDown('pagar_avencer')"><div class="kpi-label">A Pagar</div><div class="kpi-value" style="font-size:20px">${Utils.formatCurrency(aPag)}</div><div class="kpi-sub">Contas em aberto</div><div class="kpi-icon">📋</div></div>
        <div class="kpi-card" style="--kpi-color:#dc2626;cursor:pointer" title="Clique para ver parcelas vencidas" onclick="Financeiro.drillDown('receber_vencido')"><div class="kpi-label">Vencidos</div><div class="kpi-value" style="font-size:20px;color:var(--danger)">${Utils.formatCurrency(venc)}</div><div class="kpi-sub">Parcelas em atraso</div><div class="kpi-icon">⚠️</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-header"><div class="card-title">📊 Receitas — 6 meses</div></div><div class="card-body"><div id="chartRecDesp" style="height:190px"></div></div></div>
        <div class="card"><div class="card-header"><div class="card-title">🍩 Despesas por Categoria (mês atual)</div></div><div class="card-body"><div id="chartCatDesp"></div></div></div>
      </div>
      <div class="grid-2 mt-4">
        <div class="card"><div class="card-header"><div class="card-title">💰 Últimos Recebimentos</div></div><div class="card-body" style="padding:0"><table class="tbl"><thead><tr><th>Descrição</th><th>Data</th><th>Valor</th></tr></thead><tbody>
          ${lanc.filter(l=>l.tipo==='receita'&&l.status==='recebido').sort((a,b)=>(b.data||'').localeCompare(a.data||'')).slice(0,6).map(l=>`<tr><td><div class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(l.descricao,35))}</div><div class="text-xs text-muted">${Utils.escHtml(l.categoria)}</div></td><td class="text-sm">${Utils.formatDate(l.data)}</td><td class="font-bold text-success">${Utils.formatCurrency(l.valor)}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="card-header"><div class="card-title">📤 Próximas Contas a Pagar</div></div><div class="card-body" style="padding:0"><table class="tbl"><thead><tr><th>Fornecedor</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>
          ${pag.filter(p=>p.status==='pendente').sort((a,b)=>(a.vencimento||'').localeCompare(b.vencimento||'')).slice(0,6).map(p=>`<tr><td><div class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(p.fornecedor,28))}</div><div class="text-xs text-muted">${Utils.escHtml(p.categoria)}</div></td><td class="${Utils.isOverdue(p.vencimento)?'text-danger font-bold':'text-sm'}">${Utils.formatDate(p.vencimento)}</td><td class="font-bold">${Utils.formatCurrency(p.valor)}</td></tr>`).join('')}
        </tbody></table></div></div>
      </div>`;
  }

  /* ---- LANÇAMENTOS ---- */
  function buildLancamentos() {
    let list=DB.getAll('lancamentos');
    if(_filtLanc.tipo) list=list.filter(l=>l.tipo===_filtLanc.tipo);
    if(_filtLanc.status) list=list.filter(l=>l.status===_filtLanc.status);
    if(_filtLanc.categoria) list=list.filter(l=>l.categoria===_filtLanc.categoria);
    if(_filtLanc.mesInicio) list=list.filter(l=>(l.data||'')>=_filtLanc.mesInicio+'-01');
    if(_filtLanc.mesFim) list=list.filter(l=>(l.data||'')<=_filtLanc.mesFim+'-31');
    if(_filtLanc.busca){const t=_filtLanc.busca.toLowerCase();list=list.filter(l=>l.descricao?.toLowerCase().includes(t)||l.categoria?.toLowerCase().includes(t));}
    list.sort((a,b)=>(b.data||'').localeCompare(a.data||''));
    const tR=list.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const tD=list.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
    const cats=[...new Set(DB.getAll('lancamentos').map(l=>l.categoria))].sort();
    return `
      <div class="fin-kpi">
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Total Receitas</div><div class="fin-kpi-val text-success">${Utils.formatCurrency(tR)}</div><div style="font-size:11px;color:var(--text-muted)">${list.filter(l=>l.tipo==='receita').length} lançamentos</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Total Despesas</div><div class="fin-kpi-val text-danger">${Utils.formatCurrency(tD)}</div><div style="font-size:11px;color:var(--text-muted)">${list.filter(l=>l.tipo==='despesa').length} lançamentos</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Resultado</div><div class="fin-kpi-val ${tR-tD>=0?'text-success':'text-danger'}">${Utils.formatCurrency(tR-tD)}</div><div style="font-size:11px;color:var(--text-muted)">${list.length} no filtro</div></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div class="filters">
            <select class="filter-select" onchange="Financeiro.setFiltLanc('tipo',this.value)"><option value="">Todos tipos</option><option value="receita" ${_filtLanc.tipo==='receita'?'selected':''}>Receitas</option><option value="despesa" ${_filtLanc.tipo==='despesa'?'selected':''}>Despesas</option></select>
            <select class="filter-select" onchange="Financeiro.setFiltLanc('status',this.value)"><option value="">Todos status</option><option value="recebido">Recebido</option><option value="a_receber">A Receber</option><option value="pago">Pago</option><option value="a_pagar">A Pagar</option></select>
            <select class="filter-select" onchange="Financeiro.setFiltLanc('categoria',this.value)"><option value="">Todas categorias</option>${cats.map(c=>`<option value="${Utils.escHtml(c)}" ${_filtLanc.categoria===c?'selected':''}>${Utils.escHtml(c)}</option>`).join('')}</select>
            <input type="month" class="form-control" style="max-width:140px;padding:5px 8px;font-size:12px" title="De:" value="${_filtLanc.mesInicio}" onchange="Financeiro.setFiltLanc('mesInicio',this.value)">
            <input type="month" class="form-control" style="max-width:140px;padding:5px 8px;font-size:12px" title="Até:" value="${_filtLanc.mesFim}" onchange="Financeiro.setFiltLanc('mesFim',this.value)">
            <input class="form-control" id="flBuscaInput" style="max-width:140px;padding:5px 10px;font-size:12px" placeholder="Buscar..." value="${Utils.escHtml(_filtLanc.busca)}" oninput="Financeiro.setFiltLanc('busca',this.value)">
            ${(_filtLanc.tipo||_filtLanc.status||_filtLanc.categoria||_filtLanc.mesInicio||_filtLanc.mesFim||_filtLanc.busca)?`<button class="btn btn-xs btn-ghost" onclick="Financeiro.limparFiltros()">✕ Limpar</button>`:''}
          </div>
          <span class="text-sm text-muted">${list.length} lançamento(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length===0?'<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum lançamento</div></div>':`
          <table class="tbl"><thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${list.map(l=>{
            const iR=l.tipo==='receita';
            const stCls={recebido:'badge-green',a_receber:'badge-blue',pago:'badge-green',a_pagar:'badge-yellow',vencido:'badge-red'}[l.status]||'badge-gray';
            const stLb={recebido:'Recebido',a_receber:'A Receber',pago:'Pago',a_pagar:'A Pagar',vencido:'Vencido'}[l.status]||l.status;
            return `<tr>
              <td><span class="badge ${iR?'badge-green':'badge-red'}">${iR?'⬆ Receita':'⬇ Despesa'}</span></td>
              <td class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(l.descricao,38))}</td>
              <td class="text-xs text-muted">${Utils.escHtml(l.categoria||'—')}</td>
              <td class="text-sm">${Utils.formatDate(l.data)}</td>
              <td class="font-bold ${iR?'text-success':'text-danger'}">${Utils.formatCurrency(l.valor)}</td>
              <td><span class="badge ${stCls}">${stLb}</span></td>
              <td><div class="tbl-actions">
                <button class="btn btn-xs btn-secondary" onclick="Financeiro.editLanc('${l.id}')">✏</button>
                <button class="btn btn-xs btn-success" onclick="Financeiro.marcarPago('${l.id}')" title="Marcar como pago/recebido">✓</button>
                <button class="btn btn-xs btn-danger" onclick="Financeiro.deleteLanc('${l.id}')">🗑</button>
              </div></td>
            </tr>`;
          }).join('')}</tbody></table>`}
        </div>
      </div>`;
  }

  /* ---- CONTAS A RECEBER ---- */
  function buildReceber() {
    const recs=DB.getAll('recebiveis');
    let tG=0,tR=0,tP=0,tV=0;
    recs.forEach(r=>(r.parcelas||[]).forEach(p=>{tG+=p.valor;p.status==='recebido'?tR+=p.valor:Utils.isOverdue(p.vencimento)?tV+=p.valor:tP+=p.valor;}));
    return `
      <div class="fin-kpi">
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Total Contratos</div><div class="fin-kpi-val">${Utils.formatCurrency(tG)}</div><div class="fk-sub">${recs.length} contrato(s)</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Recebido</div><div class="fin-kpi-val text-success">${Utils.formatCurrency(tR)}</div><div class="fk-sub">${tG>0?((tR/tG)*100).toFixed(0):0}% do total</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Em Aberto</div><div class="fin-kpi-val text-warning">${Utils.formatCurrency(tP)}</div><div class="fk-sub"><span class="text-danger font-bold">${Utils.formatCurrency(tV)}</span> vencido</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${recs.length===0?`<div class="card"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">Nenhum recebível</div></div></div>`:''}
        ${recs.map(r=>renderRecebivel(r)).join('')}
        <button class="btn btn-secondary" onclick="Financeiro.novoRecebivel()">+ Novo Recebível</button>
      </div>`;
  }

  function renderRecebivel(r) {
    const c=DB.get('clientes',r.clienteId);
    const tot=(r.parcelas||[]).reduce((s,p)=>s+p.valor,0);
    const rcb=(r.parcelas||[]).filter(p=>p.status==='recebido').reduce((s,p)=>s+p.valor,0);
    const pct=tot>0?(rcb/tot*100).toFixed(0):0;
    return `<div class="recebivel-card">
      <div class="recebivel-header">
        <div><div class="font-bold">${Utils.escHtml(r.descricao||'—')}</div><div class="text-xs text-muted">${Utils.escHtml(c?.nome||'—')}</div></div>
        <div style="text-align:right"><div class="font-extrabold text-primary" style="font-size:16px">${Utils.formatCurrency(r.valorTotal||tot)}</div><div class="text-xs text-muted">${pct}% recebido</div></div>
      </div>
      <div class="recebivel-body">
        <div class="progress-bar mb-3" style="height:5px"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--success),#34d399)"></div></div>
        ${(r.parcelas||[]).map((p,i)=>{
          const ov=p.status!=='recebido'&&Utils.isOverdue(p.vencimento);
          return `<div class="parcela-row">
            <div style="flex:1"><div class="text-sm font-semibold">Parcela ${i+1}</div>
            <div class="text-xs text-muted">${Utils.formatDate(p.vencimento)}${ov?' · <span style="color:var(--danger);font-weight:700">VENCIDA</span>':''}</div></div>
            <div class="font-bold">${Utils.formatCurrency(p.valor)}</div>
            ${p.status==='recebido'?`<span class="badge badge-green">✓ Recebido</span>`:`<button class="btn btn-xs btn-success" onclick="Financeiro.marcarRecebido('${r.id}','${p.id}')">✓ Receber</button>`}
          </div>`;
        }).join('')}
        <div class="flex gap-2 mt-2">
          <button class="btn btn-xs btn-secondary" onclick="Financeiro.editRecebivel('${r.id}')">✏ Editar</button>
          <button class="btn btn-xs btn-danger" onclick="Financeiro.deleteRecebivel('${r.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }

  /* ---- CONTAS A PAGAR ---- */
  function buildPagar() {
    let list=DB.getAll('contaspagar');
    if(_filtPagar.status) list=list.filter(p=>p.status===_filtPagar.status);
    if(_filtPagar.categoria) list=list.filter(p=>p.categoria===_filtPagar.categoria);
    list.sort((a,b)=>(a.vencimento||'').localeCompare(b.vencimento||''));
    const pend=list.filter(p=>p.status==='pendente').reduce((s,p)=>s+p.valor,0);
    const pago=list.filter(p=>p.status==='pago').reduce((s,p)=>s+p.valor,0);
    const venc=list.filter(p=>p.status==='pendente'&&Utils.isOverdue(p.vencimento)).reduce((s,p)=>s+p.valor,0);
    const cats=[...new Set(DB.getAll('contaspagar').map(p=>p.categoria))].sort();
    return `
      <div class="fin-kpi">
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Pendente</div><div class="fin-kpi-val text-warning">${Utils.formatCurrency(pend)}</div><div class="fk-sub">${list.filter(p=>p.status==='pendente').length} contas</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Vencido</div><div class="fin-kpi-val text-danger">${Utils.formatCurrency(venc)}</div><div class="fk-sub">Em atraso</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Pago</div><div class="fin-kpi-val text-success">${Utils.formatCurrency(pago)}</div><div class="fk-sub">${list.filter(p=>p.status==='pago').length} contas</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Financeiro.setFiltPagar('status',this.value)"><option value="">Todos status</option><option value="pendente" ${_filtPagar.status==='pendente'?'selected':''}>Pendente</option><option value="pago" ${_filtPagar.status==='pago'?'selected':''}>Pago</option></select>
            <select class="filter-select" onchange="Financeiro.setFiltPagar('categoria',this.value)"><option value="">Todas categorias</option>${cats.map(c=>`<option value="${Utils.escHtml(c)}" ${_filtPagar.categoria===c?'selected':''}>${Utils.escHtml(c)}</option>`).join('')}</select>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="Financeiro.novaContaPagar()">+ Conta a Pagar</button>
        </div>
        <div class="table-wrap">
          ${list.length===0?'<div class="empty-state"><div class="empty-icon">📤</div><div class="empty-title">Nenhuma conta</div></div>':`
          <table class="tbl"><thead><tr><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${list.map(p=>{
            const ov=p.status==='pendente'&&Utils.isOverdue(p.vencimento);
            const sc=p.status==='pago'?'badge-green':ov?'badge-red':'badge-yellow';
            const sl=p.status==='pago'?'✓ Pago':ov?'Vencida':'Pendente';
            return `<tr>
              <td class="font-semibold text-sm">${Utils.escHtml(p.fornecedor||'—')}</td>
              <td class="text-xs text-muted">${Utils.escHtml(Utils.truncate(p.descricao,35))}</td>
              <td><span class="badge badge-gray">${Utils.escHtml(p.categoria||'—')}</span></td>
              <td class="${ov?'text-danger font-bold':'text-sm'}">${Utils.formatDate(p.vencimento)}</td>
              <td class="font-bold">${Utils.formatCurrency(p.valor)}</td>
              <td><span class="badge ${sc}">${sl}</span></td>
              <td><div class="tbl-actions">
                ${p.status==='pendente'?`<button class="btn btn-xs btn-success" onclick="Financeiro.pagarConta('${p.id}')">✓ Pagar</button>`:''}
                <button class="btn btn-xs btn-secondary" onclick="Financeiro.editContaPagar('${p.id}')">✏</button>
                <button class="btn btn-xs btn-danger" onclick="Financeiro.deleteContaPagar('${p.id}')">🗑</button>
              </div></td>
            </tr>`;
          }).join('')}</tbody></table>`}
        </div>
      </div>`;
  }

  /* ---- DRE ---- */
  // Calcula o custo mensal proporcional de uma despesa fixa
  function _despFixaMensal(d) {
    if (!d.ativo && d.ativo !== undefined) return 0;
    const mult = { Mensal:1, Bimestral:1/2, Trimestral:1/3, Semestral:1/6, Anual:1/12 };
    return (d.valor||0) * (mult[d.periodicidade] || 1);
  }

  function buildDRE() {
    const lanc=DB.getAll('lancamentos');
    const despFixas=DB.getAll('despesas_fixas').filter(d=>d.ativo!==false);
    const totalDespFixaMensal=despFixas.reduce((s,d)=>s+_despFixaMensal(d),0);

    const d=(mes)=>{
      const r=lanc.filter(l=>l.tipo==='receita'&&l.data?.startsWith(mes)&&l.status==='recebido').reduce((s,l)=>s+l.valor,0);
      const all=lanc.filter(l=>l.tipo==='despesa'&&l.data?.startsWith(mes)&&l.status==='pago');
      const mat=all.filter(l=>l.categoria==='Materiais').reduce((s,l)=>s+l.valor,0);
      const fl=all.filter(l=>l.categoria==='Folha de Pagamento').reduce((s,l)=>s+l.valor,0);
      const out=all.filter(l=>!['Materiais','Folha de Pagamento'].includes(l.categoria)).reduce((s,l)=>s+l.valor,0);
      return {r,mat,fl,out,desp:mat+fl+out};
    };
    const v=d(_dremes);
    const aliq=(DB.getConfig().aliquotaImpostos||6)/100;
    const imp=v.r*aliq, rl=v.r-imp, lb=rl-v.mat, ebitda=lb-v.fl-v.out-totalDespFixaMensal;
    const mg=(x)=>v.r>0?((x/v.r)*100).toFixed(1)+'%':'—';
    return `
      <div class="card mb-4">
        <div class="card-header">
          <div class="card-title">📈 DRE — Demonstração do Resultado</div>
          <input type="month" class="form-control" style="max-width:155px;padding:5px 10px;font-size:12.5px" value="${_dremes}" onchange="Financeiro.setDreMes(this.value)">
        </div>
        <div class="card-body">
          <div class="dre-table">
            <div class="dre-row dre-section"><div class="dre-label">RECEITA BRUTA</div></div>
            <div class="dre-row"><div class="dre-label">Serviços e Receitas</div><div class="dre-value pos">+ ${Utils.formatCurrency(v.r)}</div></div>
            <div class="dre-row dre-subtotal"><div class="dre-label">Receita Bruta</div><div class="dre-value">${Utils.formatCurrency(v.r)}</div></div>
            <div class="dre-row dre-section"><div class="dre-label">(-) DEDUÇÕES</div></div>
            <div class="dre-row"><div class="dre-label">Impostos sobre receita (${(DB.getConfig().regimeTributario||'Simples')} · ${((DB.getConfig().aliquotaImpostos||6)).toFixed(1)}%)</div><div class="dre-value neg">- ${Utils.formatCurrency(imp)}</div></div>
            <div class="dre-row dre-total"><div class="dre-label">= RECEITA LÍQUIDA</div><div class="dre-value">${Utils.formatCurrency(rl)}</div></div>
            <div class="dre-row dre-section"><div class="dre-label">(-) CUSTO DOS SERVIÇOS (CSP)</div></div>
            <div class="dre-row"><div class="dre-label">Materiais e Insumos</div><div class="dre-value neg">- ${Utils.formatCurrency(v.mat)}</div></div>
            <div class="dre-row dre-total"><div class="dre-label">= LUCRO BRUTO <span style="font-size:11px;font-weight:400;color:var(--text-muted)">— Margem ${mg(lb)}</span></div><div class="dre-value ${lb>=0?'pos':'neg'}">${Utils.formatCurrency(lb)}</div></div>
            <div class="dre-row dre-section"><div class="dre-label">(-) DESPESAS OPERACIONAIS</div></div>
            <div class="dre-row"><div class="dre-label">Folha de Pagamento</div><div class="dre-value neg">- ${Utils.formatCurrency(v.fl)}</div></div>
            <div class="dre-row"><div class="dre-label">Outras Despesas (lançamentos)</div><div class="dre-value neg">- ${Utils.formatCurrency(v.out)}</div></div>
            ${totalDespFixaMensal > 0 ? `<div class="dre-row"><div class="dre-label">Despesas Fixas (${despFixas.length} item${despFixas.length>1?'s':''})</div><div class="dre-value neg">- ${Utils.formatCurrency(totalDespFixaMensal)}</div></div>` : ''}
            <div class="dre-row dre-total" style="font-size:15px"><div class="dre-label">= EBITDA <span style="font-size:11px;font-weight:400;color:var(--text-muted)">— Margem ${mg(ebitda)}</span></div><div class="dre-value ${ebitda>=0?'pos':'neg'}">${Utils.formatCurrency(ebitda)}</div></div>
          </div>
        </div>
      </div>
      <div class="card"><div class="card-header"><div class="card-title">📊 Resultado Mensal — 6 meses</div></div><div class="card-body"><div id="chartDRE" style="height:190px"></div></div></div>`;
  }

  /* ---- FLUXO DE CAIXA ---- */
  /* Projeção do mês (só meses atuais/futuros): parcelas de recebíveis em
     aberto = entradas previstas; contas a pagar pendentes = saídas previstas */
  function _projecaoMes(m,hojeM){
    if(m<hojeM)return{e:0,s:0};
    let e=0;
    DB.getAll('recebiveis').forEach(r=>(r.parcelas||[]).forEach(p=>{if(p.status!=='recebido'&&(p.vencimento||'').startsWith(m))e+=p.valor;}));
    let s=0;
    DB.getAll('contaspagar').forEach(c=>{if(c.status==='pendente'&&(c.vencimento||'').startsWith(m))s+=c.valor;});
    return{e,s};
  }

  function buildFluxo() {
    const meses=getLast3Next3(), lanc=DB.getAll('lancamentos');
    const despFixas=DB.getAll('despesas_fixas').filter(d=>d.ativo!==false);
    const saídaFixaMensal=despFixas.reduce((s,d)=>s+_despFixaMensal(d),0);
    let saldo=0;
    const hoje=Utils.todayStr().substring(0,7);
    const rows=meses.map(m=>{
      const [,mo]=m.split('-');
      const lb=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];
      const proj=_projecaoMes(m,hoje);
      const e=lanc.filter(l=>l.tipo==='receita'&&l.data?.startsWith(m)).reduce((s,l)=>s+l.valor,0)+proj.e;
      const sLanc=lanc.filter(l=>l.tipo==='despesa'&&l.data?.startsWith(m)).reduce((s,l)=>s+l.valor,0);
      // Saídas: lançamentos + contas pendentes do mês + despesas fixas
      const s=sLanc+proj.s+(saídaFixaMensal>0?saídaFixaMensal:0);
      return {m,lb,e,s,r:e-s};
    });
    return `
      <div class="card mb-4"><div class="card-header"><div class="card-title">🔄 Fluxo de Caixa — 6 Meses</div><span class="text-xs text-muted">Meses futuros incluem parcelas a receber e contas a pagar em aberto</span></div><div class="card-body"><div id="chartFluxo" style="height:190px"></div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">📋 Detalhamento Mensal</div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Saldo Acumulado</th></tr></thead>
        <tbody>${rows.map(r=>{saldo+=r.r;const fut=r.m>hoje;return `<tr style="${fut?'opacity:.65;font-style:italic':''}">
          <td class="font-bold">${r.lb}${fut?' <span class="badge badge-blue" style="font-size:9px;padding:1px 5px">Proj.</span>':''}</td>
          <td class="text-success font-bold">${Utils.formatCurrency(r.e)}</td>
          <td class="text-danger font-bold">${Utils.formatCurrency(r.s)}</td>
          <td class="font-extrabold ${r.r>=0?'text-success':'text-danger'}">${Utils.formatCurrency(r.r)}</td>
          <td class="font-extrabold ${saldo>=0?'text-success':'text-danger'}">${Utils.formatCurrency(saldo)}</td>
        </tr>`;}).join('')}</tbody></table></div>
      </div>`;
  }

  /* ---- CHARTS ---- */
  function renderCharts() {
    const meses=getLast6(), lanc=DB.getAll('lancamentos');
    const lbs=meses.map(m=>{const[,mo]=m.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];});
    Charts.bar({containerId:'chartRecDesp',data:lbs.map((l,i)=>({label:l,value:lanc.filter(x=>x.tipo==='receita'&&x.data?.startsWith(meses[i])&&x.status==='recebido').reduce((s,x)=>s+x.valor,0),color:'#10b981'})),height:190,showValues:false});
    const mes=Utils.todayStr().substring(0,7),cats={};
    lanc.filter(l=>l.tipo==='despesa'&&l.data?.startsWith(mes)).forEach(l=>{cats[l.categoria]=(cats[l.categoria]||0)+l.valor;});
    const cd=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>({label:k,value:v}));
    if(cd.length>0) Charts.donut({containerId:'chartCatDesp',data:cd,size:130,showLegend:true});
    else {const el=document.getElementById('chartCatDesp');if(el)el.innerHTML='<div class="empty-state" style="padding:20px"><div class="empty-icon">🍩</div><div class="empty-sub">Sem despesas no mês</div></div>';}
  }
  function renderDREChart() {
    const meses=getLast6(),lanc=DB.getAll('lancamentos');
    const lbs=meses.map(m=>{const[,mo]=m.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];});
    Charts.bar({containerId:'chartDRE',data:lbs.map((l,i)=>{const r=lanc.filter(x=>x.tipo==='receita'&&x.data?.startsWith(meses[i])&&x.status==='recebido').reduce((s,x)=>s+x.valor,0);const d=lanc.filter(x=>x.tipo==='despesa'&&x.data?.startsWith(meses[i])&&x.status==='pago').reduce((s,x)=>s+x.valor,0);return{label:l,value:r-d,color:r-d>=0?'#10b981':'#dc2626'};}),height:190,showValues:false});
  }
  function renderFluxoChart() {
    const meses=getLast3Next3(),lanc=DB.getAll('lancamentos');
    const hoje=Utils.todayStr().substring(0,7);
    const lbs=meses.map(m=>{const[,mo]=m.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];});
    Charts.bar({containerId:'chartFluxo',data:lbs.map((l,i)=>{const proj=_projecaoMes(meses[i],hoje);const e=lanc.filter(x=>x.tipo==='receita'&&x.data?.startsWith(meses[i])).reduce((s,x)=>s+x.valor,0)+proj.e;const s=lanc.filter(x=>x.tipo==='despesa'&&x.data?.startsWith(meses[i])).reduce((s,x)=>s+x.valor,0)+proj.s;return{label:l,value:e-s,color:e-s>=0?'#10b981':'#dc2626'};}),height:190,showValues:false});
  }

  function getLast6(){const r=[],d=new Date();for(let i=5;i>=0;i--){const dt=new Date(d.getFullYear(),d.getMonth()-i,1);r.push(dt.toISOString().substring(0,7));}return r;}
  function getLast3Next3(){const r=[],d=new Date();for(let i=-3;i<=2;i++){const dt=new Date(d.getFullYear(),d.getMonth()+i,1);r.push(dt.toISOString().substring(0,7));}return r;}

  /* ---- FILTROS ---- */
  let _buscaTimer = null;
  function setFiltLanc(k,v){
    _filtLanc[k]=v;
    if(k==='busca'){
      // Debounce: sem isso, cada tecla re-renderizava a tela e o campo perdia o foco
      clearTimeout(_buscaTimer);
      _buscaTimer=setTimeout(()=>{
        renderTab();
        const el=document.getElementById('flBuscaInput');
        if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}
      },350);
      return;
    }
    renderTab();
  }
  function limparFiltros(){_filtLanc={tipo:'',categoria:'',status:'',busca:'',mesInicio:'',mesFim:''};renderTab();}
  function setFiltPagar(k,v){_filtPagar[k]=v;renderTab();}
  function setDreMes(v){_dremes=v;renderTab();}

  /* ---- CRUD LANÇAMENTOS ---- */
  function novoLancamento(){openFormLanc(null,'receita');}
  function novaDespesa(){openFormLanc(null,'despesa');}
  function editLanc(id){openFormLanc(id);}

  function openFormLanc(id,tipoDefault='receita'){
    const l=id?DB.get('lancamentos',id):null;
    const tipo=l?.tipo||tipoDefault;
    const cats=tipo==='receita'?CATS_R:CATS_D;
    const clientes=DB.getAll('clientes');
    Modal.open({
      title:id?'Editar Lançamento':(tipo==='receita'?'+ Nova Receita':'+ Nova Despesa'),
      body:`<div class="form-row">
        <div class="form-group"><label class="form-label">Tipo</label><select class="form-control" id="flTipo" onchange="Financeiro._trocarTipo(this.value)"><option value="receita" ${tipo==='receita'?'selected':''}>⬆ Receita</option><option value="despesa" ${tipo==='despesa'?'selected':''}>⬇ Despesa</option></select></div>
        <div class="form-group" style="flex:2"><label class="form-label">Categoria</label><select class="form-control" id="flCat">${cats.map(c=>`<option value="${c}" ${l?.categoria===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label">Descrição *</label><input class="form-control" id="flDesc" value="${Utils.escHtml(l?.descricao||'')}" placeholder="Descrição do lançamento"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Valor (R$) *</label><input class="form-control" id="flValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(l?.valor)}" placeholder="0,00"></div>
        <div class="form-group"><label class="form-label">Data</label><input class="form-control" id="flData" type="date" value="${l?.data||Utils.todayStr()}"></div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-control" id="flStatus">${tipo==='receita'?`<option value="a_receber" ${l?.status==='a_receber'?'selected':''}>A Receber</option><option value="recebido" ${l?.status==='recebido'?'selected':''}>Recebido</option>`:`<option value="a_pagar" ${l?.status==='a_pagar'?'selected':''}>A Pagar</option><option value="pago" ${l?.status==='pago'?'selected':''}>Pago</option>`}</select></div>
      </div>
      <div class="form-group" id="flCliG" ${tipo==='despesa'?'style="display:none"':''}>
        <label class="form-label">Cliente (opcional)</label>
        <select class="form-control" id="flCliente"><option value="">— Nenhum —</option>${clientes.map(c=>`<option value="${c.id}" ${l?.clienteId===c.id?'selected':''}>${Utils.escHtml(c.nome)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" id="flObs" rows="2">${Utils.escHtml(l?.observacoes||'')}</textarea></div>`,
      saveCb:()=>saveLanc(id),
    });
  }

  function _trocarTipo(t){
    const sel=document.getElementById('flCat');if(sel)sel.innerHTML=(t==='receita'?CATS_R:CATS_D).map(c=>`<option value="${c}">${c}</option>`).join('');
    const cg=document.getElementById('flCliG');if(cg)cg.style.display=t==='despesa'?'none':'';
    const st=document.getElementById('flStatus');if(st)st.innerHTML=t==='receita'?'<option value="a_receber">A Receber</option><option value="recebido">Recebido</option>':'<option value="a_pagar">A Pagar</option><option value="pago">Pago</option>';
  }

  function saveLanc(id){
    const desc=document.getElementById('flDesc').value.trim();if(!desc){Toast.error('Descrição obrigatória');return;}
    const valor=Utils.parseMoney(document.getElementById('flValor').value);if(!valor){Toast.error('Valor inválido — use o formato 1500,00');return;}
    const data={tipo:document.getElementById('flTipo').value,categoria:document.getElementById('flCat').value,descricao:desc,valor,data:document.getElementById('flData').value,status:document.getElementById('flStatus').value,clienteId:document.getElementById('flCliente')?.value||'',observacoes:document.getElementById('flObs').value};
    if(id){DB.update('lancamentos',id,data);Toast.success('Atualizado');}else{DB.create('lancamentos',data);Toast.success('Lançamento criado');}
    Modal.close();renderTab();
  }
  function marcarPago(id){const l=DB.get('lancamentos',id);if(!l)return;DB.update('lancamentos',id,{status:l.tipo==='receita'?'recebido':'pago'});Toast.success('Marcado');renderTab();}
  function deleteLanc(id){Utils.confirmDelete('este lançamento',()=>{DB.remove('lancamentos',id);Toast.success('Removido');renderTab();});}

  /* ---- CRUD CONTAS A PAGAR ---- */
  function novaContaPagar(){openFormPagar(null);}
  function editContaPagar(id){openFormPagar(id);}
  function openFormPagar(id){
    const p=id?DB.get('contaspagar',id):null;
    Modal.open({title:id?'Editar Conta a Pagar':'+ Nova Conta a Pagar',body:`
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">Fornecedor *</label><input class="form-control" id="fpForn" value="${Utils.escHtml(p?.fornecedor||'')}" placeholder="Nome do fornecedor"></div>
        <div class="form-group"><label class="form-label">Categoria</label><select class="form-control" id="fpCat">${CATS_D.map(c=>`<option value="${c}" ${p?.categoria===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label">Descrição</label><input class="form-control" id="fpDesc" value="${Utils.escHtml(p?.descricao||'')}" placeholder="Ex: Honorários maio/2026"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Valor (R$) *</label><input class="form-control" id="fpValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(p?.valor)}" placeholder="0,00"></div>
        <div class="form-group"><label class="form-label">Vencimento</label><input class="form-control" id="fpVenc" type="date" value="${p?.vencimento||''}"></div>
        <div class="form-group"><label class="form-label">Recorrente</label><select class="form-control" id="fpRec"><option value="false" ${!p?.recorrente?'selected':''}>Não</option><option value="true" ${p?.recorrente?'selected':''}>Sim</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" id="fpObs" rows="2">${Utils.escHtml(p?.observacoes||'')}</textarea></div>`,
      saveCb:()=>saveContaPagar(id),
    });
  }
  function saveContaPagar(id){
    const forn=document.getElementById('fpForn').value.trim();if(!forn){Toast.error('Fornecedor obrigatório');return;}
    const valor=Utils.parseMoney(document.getElementById('fpValor').value);if(!valor){Toast.error('Valor inválido — use o formato 1500,00');return;}
    const data={fornecedor:forn,categoria:document.getElementById('fpCat').value,descricao:document.getElementById('fpDesc').value,valor,vencimento:document.getElementById('fpVenc').value,status:id?(DB.get('contaspagar',id)?.status||'pendente'):'pendente',recorrente:document.getElementById('fpRec').value==='true',observacoes:document.getElementById('fpObs').value};
    if(id){DB.update('contaspagar',id,data);Toast.success('Atualizado');}else{DB.create('contaspagar',data);Toast.success('Conta criada');}
    Modal.close();renderTab();
  }
  function pagarConta(id){
    const p=DB.get('contaspagar',id);if(!p||p.status==='pago')return;
    DB.update('contaspagar',id,{status:'pago',dataPagamento:Utils.todayStr()});
    // Cria lançamento de despesa para alimentar KPIs, DRE e relatórios
    DB.create('lancamentos',{
      tipo:'despesa',categoria:p.categoria||'Outros',
      descricao:p.descricao||p.fornecedor||'Pagamento',
      valor:p.valor,data:Utils.todayStr(),status:'pago',
      clienteId:'',contaId:id,observacoes:'Criado automaticamente ao pagar conta: '+(p.fornecedor||''),
    });
    // Conta recorrente: gera automaticamente a do próximo mês
    if(p.recorrente){
      const dt=new Date((p.vencimento||Utils.todayStr())+'T00:00:00');
      dt.setMonth(dt.getMonth()+1);
      const proxVenc=Utils.localDateStr(dt);
      const jaExiste=DB.getAll('contaspagar').some(c=>c.id!==id&&c.fornecedor===p.fornecedor&&c.vencimento===proxVenc&&c.status==='pendente');
      if(!jaExiste){
        DB.create('contaspagar',{
          fornecedor:p.fornecedor,categoria:p.categoria,descricao:p.descricao,
          valor:p.valor,vencimento:proxVenc,status:'pendente',recorrente:true,
          observacoes:'Gerada automaticamente (conta recorrente).',
        });
        Toast.success(`🔁 Conta recorrente: próxima gerada para ${Utils.formatDate(proxVenc)}`);
      }
    }
    Toast.success('Conta paga e lançamento registrado');renderTab();
  }
  function deleteContaPagar(id){Utils.confirmDelete('esta conta a pagar',()=>{DB.remove('contaspagar',id);Toast.success('Removida');renderTab();});}

  /* ---- CRUD RECEBÍVEIS ---- */
  function novoRecebivel(){openFormRecebivel(null);}
  function editRecebivel(id){openFormRecebivel(id);}
  function openFormRecebivel(id){
    const r=id?DB.get('recebiveis',id):null;
    const clientes=DB.getAll('clientes');
    Modal.open({title:id?'Editar Recebível':'+ Novo Recebível',size:'modal-lg',body:`
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">Descrição / Contrato *</label><input class="form-control" id="frDesc" value="${Utils.escHtml(r?.descricao||'')}" placeholder="Ex: NR-12 — Bela Vista — BIK-2026-PRJ-001"></div>
        <div class="form-group"><label class="form-label">Valor Total (R$)</label><input class="form-control" id="frTotal" type="text" inputmode="decimal" value="${Utils.moneyToInput(r?.valorTotal)}" placeholder="0,00"></div>
      </div>
      <div class="form-group"><label class="form-label">Cliente</label><select class="form-control" id="frCliente"><option value="">— Selecione —</option>${clientes.map(c=>`<option value="${c.id}" ${r?.clienteId===c.id?'selected':''}>${Utils.escHtml(c.nome)}</option>`).join('')}</select></div>
      <div class="divider"></div>
      <div class="flex items-center justify-between mb-3"><div class="form-label">Parcelas</div><button class="btn btn-xs btn-secondary" type="button" onclick="Financeiro._addPF()">+ Parcela</button></div>
      <div id="frParcelas">${(r?.parcelas||[{valor:'',vencimento:'',status:'a_vencer'}]).map((p,i)=>pfRow(p,i)).join('')}</div>`,
      saveCb:()=>saveRecebivel(id),
    });
  }
  function pfRow(p,i){return`<div class="parcela-row parc-form-row" data-i="${i}">
    <div class="form-group" style="flex:1;margin:0"><input class="form-control parc-val" type="text" inputmode="decimal" placeholder="Valor (0,00)" value="${Utils.moneyToInput(p.valor)}"></div>
    <div class="form-group" style="flex:1;margin:0"><input class="form-control parc-venc" type="date" value="${p.vencimento||''}"></div>
    <select class="form-control parc-status" style="min-width:110px"><option value="a_vencer" ${(p.status||'a_vencer')==='a_vencer'?'selected':''}>A Vencer</option><option value="recebido" ${p.status==='recebido'?'selected':''}>Recebido</option></select>
    <button class="btn btn-xs btn-danger" type="button" onclick="this.closest('.parc-form-row').remove()">✕</button>
  </div>`;}
  function _addPF(){const c=document.getElementById('frParcelas');if(!c)return;const d=document.createElement('div');d.innerHTML=pfRow({},c.querySelectorAll('.parc-form-row').length);c.appendChild(d.firstElementChild);}
  function saveRecebivel(id){
    const desc=document.getElementById('frDesc').value.trim();if(!desc){Toast.error('Descrição obrigatória');return;}
    const base=id?DB.get('recebiveis',id):null;
    const parcelas=[...document.querySelectorAll('.parc-form-row')].map((row,i)=>({id:(base?.parcelas?.[i]?.id)||(Date.now().toString(36)+Math.random().toString(36).substr(2,4)),valor:Utils.parseMoney(row.querySelector('.parc-val').value),vencimento:row.querySelector('.parc-venc').value,status:row.querySelector('.parc-status').value,dataPagamento:null,nfNumero:''}));
    const data={descricao:desc,clienteId:document.getElementById('frCliente').value,valorTotal:Utils.parseMoney(document.getElementById('frTotal').value)||parcelas.reduce((s,p)=>s+p.valor,0),parcelas};
    if(id){DB.update('recebiveis',id,data);Toast.success('Atualizado');}else{DB.create('recebiveis',data);Toast.success('Recebível criado');}
    Modal.close();renderTab();
  }
  function marcarRecebido(rId,pId){
    const r=DB.get('recebiveis',rId);if(!r)return;
    const parcela=(r.parcelas||[]).find(p=>p.id===pId);
    if(!parcela||parcela.status==='recebido')return;
    const valorParcela=Number(parcela.valor)||0;
    // Sem valor não há o que lançar — antes criava lançamento de R$ 0,00
    // poluindo o Financeiro e os relatórios.
    if(valorParcela<=0){
      Toast.error('Esta parcela está sem valor. Edite o recebível e informe o valor antes de marcar como recebida.');
      return;
    }
    DB.update('recebiveis',rId,{parcelas:(r.parcelas||[]).map(p=>p.id===pId?{...p,status:'recebido',dataPagamento:Utils.todayStr()}:p)});
    // Cria lançamento de receita para alimentar KPIs, DRE e relatórios
    DB.create('lancamentos',{
      tipo:'receita',categoria:'Serviços de Engenharia',
      descricao:(r.descricao||'Recebimento')+' — Parcela',
      valor:valorParcela,data:Utils.todayStr(),status:'recebido',
      clienteId:r.clienteId||'',recebivelId:rId,parcelaId:pId,
      observacoes:'Criado automaticamente ao receber parcela do recebível.',
    });
    Toast.success('Parcela recebida e lançamento registrado');renderTab();
  }
  function addParcela(rId){editRecebivel(rId);}
  function deleteRecebivel(id){Utils.confirmDelete('este recebível',()=>{DB.remove('recebiveis',id);Toast.success('Removido');renderTab();});}
  function addNew(){novoLancamento();}

  /* ---- Drill-down dos KPI cards ---- */
  function drillDown(tipo) {
    const hoje = Utils.localDateStr(new Date());
    const mes = hoje.substring(0, 7);
    let title = '', items = [], cols = [], rowFn = () => [];

    if (tipo === 'receber_avencer') {
      title = 'A Receber — Parcelas a Vencer';
      items = [];
      DB.getAll('recebiveis').forEach(r => {
        const clienteNome = DB.get('clientes', r.clienteId)?.nome || r.cliente || r.titulo || r.descricao || '—';
        (r.parcelas || []).forEach(p => {
          if (p.status !== 'recebido' && p.vencimento >= hoje) {
            items.push({ _clienteNome: clienteNome, _desc: r.descricao, ...p });
          }
        });
      });
      // Incluir também lançamentos manuais "a receber" (mesma base do KPI)
      DB.getAll('lancamentos').filter(l => l.tipo === 'receita' && l.status === 'a_receber').forEach(l => {
        items.push({ _clienteNome: DB.get('clientes', l.clienteId)?.nome || '—', _desc: (l.descricao || '—') + ' (lançamento)', valor: l.valor, vencimento: l.data });
      });
      cols = ['Cliente', 'Descrição', 'Valor', 'Vencimento'];
      rowFn = p => [
        Utils.escHtml(p._clienteNome),
        Utils.escHtml(p._desc || '—'),
        `<strong>${Utils.formatCurrency(p.valor)}</strong>`,
        Utils.formatDate(p.vencimento),
      ];
    } else if (tipo === 'receber_vencido') {
      title = 'Parcelas Vencidas';
      items = [];
      DB.getAll('recebiveis').forEach(r => {
        const clienteNome = DB.get('clientes', r.clienteId)?.nome || r.cliente || r.titulo || r.descricao || '—';
        (r.parcelas || []).forEach(p => {
          if (p.status !== 'recebido' && p.vencimento < hoje) {
            const dias = Math.round((new Date(hoje) - new Date(p.vencimento)) / 86400000);
            items.push({ _clienteNome: clienteNome, _desc: r.descricao, _dias: dias, ...p });
          }
        });
      });
      cols = ['Cliente', 'Descrição', 'Valor', 'Vencimento', 'Dias Atraso'];
      rowFn = p => [
        Utils.escHtml(p._clienteNome),
        Utils.escHtml(p._desc || '—'),
        Utils.formatCurrency(p.valor),
        `<span style="color:var(--danger)">${Utils.formatDate(p.vencimento)}</span>`,
        `<span style="color:var(--danger);font-weight:700">${p._dias}d</span>`,
      ];
    } else if (tipo === 'recebido_periodo') {
      title = 'Recebimentos do Período';
      items = [];
      DB.getAll('recebiveis').forEach(r => {
        const clienteNome = DB.get('clientes', r.clienteId)?.nome || r.cliente || r.descricao || '—';
        (r.parcelas || []).forEach(p => {
          if (p.status === 'recebido' && (p.dataPagamento || '').startsWith(mes)) {
            items.push({ _clienteNome: clienteNome, ...p });
          }
        });
      });
      cols = ['Cliente', 'Valor', 'Data Recebimento'];
      rowFn = p => [
        Utils.escHtml(p._clienteNome),
        `<strong style="color:var(--success)">${Utils.formatCurrency(p.valor)}</strong>`,
        Utils.formatDate(p.dataPagamento),
      ];
    } else if (tipo === 'pagar_avencer') {
      title = 'Contas a Pagar — A Vencer';
      items = DB.getAll('contaspagar').filter(p => p.status === 'pendente' && (p.vencimento || '') >= hoje);
      cols = ['Descrição', 'Valor', 'Vencimento', 'Categoria'];
      rowFn = p => [
        Utils.escHtml(p.fornecedor || p.descricao || '—'),
        `<strong>${Utils.formatCurrency(p.valor)}</strong>`,
        Utils.formatDate(p.vencimento),
        Utils.escHtml(p.categoria || '—'),
      ];
    } else if (tipo === 'pagar_vencido') {
      title = 'Contas a Pagar — Vencidas';
      items = DB.getAll('contaspagar').filter(p => p.status === 'pendente' && p.vencimento && p.vencimento < hoje);
      cols = ['Descrição', 'Valor', 'Vencimento', 'Dias Atraso'];
      rowFn = p => {
        const dias = Math.round((new Date(hoje) - new Date(p.vencimento)) / 86400000);
        return [
          Utils.escHtml(p.fornecedor || p.descricao || '—'),
          Utils.formatCurrency(p.valor),
          `<span style="color:var(--danger)">${Utils.formatDate(p.vencimento)}</span>`,
          `<span style="color:var(--danger);font-weight:700">${dias}d</span>`,
        ];
      };
    } else if (tipo === 'lancamentos') {
      title = 'Lançamentos do Período';
      items = DB.getAll('lancamentos').filter(l => (l.data || '').startsWith(mes));
      cols = ['Descrição', 'Tipo', 'Valor', 'Data'];
      rowFn = l => [
        Utils.escHtml(l.descricao || '—'),
        l.tipo === 'receita'
          ? '<span class="badge badge-green">Receita</span>'
          : '<span class="badge badge-red">Despesa</span>',
        `<strong class="${l.tipo==='receita'?'text-success':'text-danger'}">${Utils.formatCurrency(l.valor)}</strong>`,
        Utils.formatDate(l.data),
      ];
    }

    Modal.open({
      title: `${title} — ${items.length} registro(s)`,
      body: `<div style="max-height:55vh;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--surface-2,#f8fafc);position:sticky;top:0">
            ${cols.map(c=>`<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border)">${c}</th>`).join('')}
          </tr></thead>
          <tbody>${items.length ? items.map(item=>{
            const cells = rowFn(item);
            return `<tr style="border-bottom:1px solid var(--border);cursor:pointer"
              onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
              ${cells.map(v=>`<td style="padding:8px 12px">${v}</td>`).join('')}</tr>`;
          }).join('') : `<tr><td colspan="${cols.length}" style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`}
          </tbody>
        </table></div>`,
      saveCb: null,
    });
    setTimeout(()=>{ const f=document.getElementById('modalFoot'); if(f) f.style.display='none'; },0);
  }

  /* ---- DESPESAS FIXAS ---- */
  function buildDespesasFixas() {
    const list = DB.getAll('despesas_fixas');
    const MULT = { Mensal:1, Bimestral:0.5, Trimestral:1/3, Semestral:1/6, Anual:1/12 };
    const totalMensal = list.filter(d=>d.ativo!==false).reduce((s,d)=>s+(d.valor||0)*(MULT[d.periodicidade]||1),0);
    const totalAnual = totalMensal * 12;
    const CATS_DF = ['Infraestrutura','Comunicação','Pessoal','Tecnologia','Administrativo','Outros'];
    const CAT_COLORS = { Infraestrutura:'badge-blue', Comunicação:'badge-purple', Pessoal:'badge-green', Tecnologia:'badge-gray', Administrativo:'badge-yellow', Outros:'badge-gray' };
    return `
      <div class="fin-kpi">
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Total Mensal Fixo</div><div class="fin-kpi-val text-danger">${Utils.formatCurrency(totalMensal)}</div><div class="fk-sub">${list.filter(d=>d.ativo!==false).length} ativas</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Total Anual Estimado</div><div class="fin-kpi-val text-warning">${Utils.formatCurrency(totalAnual)}</div><div class="fk-sub">Projeção 12 meses</div></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div class="card-title">📌 Despesas Fixas Recorrentes</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-success" onclick="Financeiro.gerarContasDoMes()" title="Cria as contas a pagar deste mês a partir das despesas fixas mensais ativas">⚡ Gerar Contas do Mês</button>
            <button class="btn btn-sm btn-primary" onclick="Financeiro.openFormDespFixa(null)">+ Despesa Fixa</button>
          </div>
        </div>
        ${list.length===0?'<div class="card-body"><div class="empty-state"><div class="empty-icon">📌</div><div class="empty-title">Nenhuma despesa fixa cadastrada</div></div></div>':`
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Categoria</th><th>Valor</th><th>Periodicidade</th><th>Dia Venc.</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${list.map(d=>`<tr>
          <td class="font-semibold text-sm">${Utils.escHtml(d.nome||'—')}</td>
          <td><span class="badge ${CAT_COLORS[d.categoria]||'badge-gray'}">${Utils.escHtml(d.categoria||'—')}</span></td>
          <td class="font-bold">${Utils.formatCurrency(d.valor||0)}</td>
          <td class="text-sm text-muted">${Utils.escHtml(d.periodicidade||'Mensal')}</td>
          <td class="text-sm">${d.vencimento_dia||'—'}</td>
          <td><span class="badge ${d.ativo!==false?'badge-green':'badge-gray'}">${d.ativo!==false?'Ativa':'Inativa'}</span></td>
          <td><div class="tbl-actions">
            <button class="btn btn-xs btn-secondary" onclick="Financeiro.openFormDespFixa('${d.id}')">✏</button>
            <button class="btn btn-xs ${d.ativo!==false?'btn-ghost':'btn-success'}" onclick="Financeiro.toggleDespFixa('${d.id}')">${d.ativo!==false?'Desativar':'Ativar'}</button>
            <button class="btn btn-xs btn-danger" onclick="Financeiro.deleteDespFixa('${d.id}')">🗑</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`}
      </div>`;
  }

  function openFormDespFixa(id) {
    const d = id ? DB.get('despesas_fixas', id) : null;
    const CATS_DF = ['Infraestrutura','Comunicação','Pessoal','Tecnologia','Administrativo','Outros'];
    Modal.open({ title: id ? 'Editar Despesa Fixa' : '+ Nova Despesa Fixa', body: `
      <div class="form-group"><label class="form-label">Nome *</label><input class="form-control" id="dfNome" value="${Utils.escHtml(d?.nome||'')}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Categoria</label><select class="form-control" id="dfCat">${CATS_DF.map(c=>`<option value="${c}" ${d?.categoria===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Valor (R$) *</label><input class="form-control" id="dfValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(d?.valor)}" placeholder="0,00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Periodicidade</label><select class="form-control" id="dfPer"><option value="Mensal" ${d?.periodicidade==='Mensal'?'selected':''}>Mensal</option><option value="Bimestral" ${d?.periodicidade==='Bimestral'?'selected':''}>Bimestral</option><option value="Trimestral" ${d?.periodicidade==='Trimestral'?'selected':''}>Trimestral</option><option value="Semestral" ${d?.periodicidade==='Semestral'?'selected':''}>Semestral</option><option value="Anual" ${d?.periodicidade==='Anual'?'selected':''}>Anual</option></select></div>
        <div class="form-group"><label class="form-label">Dia Vencimento</label><input class="form-control" id="dfDia" type="number" min="1" max="31" value="${d?.vencimento_dia||''}"></div>
      </div>
      <div class="form-group"><label class="form-label"><input type="checkbox" id="dfAtivo" ${d?.ativo!==false?'checked':''}> Ativa</label></div>
      <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" id="dfObs" rows="2">${Utils.escHtml(d?.obs||'')}</textarea></div>`,
      saveCb: () => {
        const nome = document.getElementById('dfNome').value.trim(); if(!nome){Toast.error('Nome obrigatório');return;}
        const valor = Utils.parseMoney(document.getElementById('dfValor').value); if(!valor){Toast.error('Valor inválido — use o formato 1500,00');return;}
        const data = { nome, categoria:document.getElementById('dfCat').value, valor, periodicidade:document.getElementById('dfPer').value, vencimento_dia:Number(document.getElementById('dfDia').value)||null, ativo:document.getElementById('dfAtivo').checked, obs:document.getElementById('dfObs').value };
        if(id){DB.update('despesas_fixas',id,data);Toast.success('Atualizado');}else{DB.create('despesas_fixas',data);Toast.success('Despesa fixa criada');}
        Modal.close(); renderTab();
      }
    });
  }
  /* Gera as contas a pagar do mês atual a partir das despesas fixas mensais
     ativas. Idempotente: não duplica se já foi gerada (marca despesaFixaId). */
  function gerarContasDoMes(){
    const mes=Utils.todayStr().substring(0,7);
    const fixas=DB.getAll('despesas_fixas').filter(d=>d.ativo!==false&&(d.periodicidade||'Mensal')==='Mensal');
    if(fixas.length===0){Toast.warning('Nenhuma despesa fixa mensal ativa cadastrada.');return;}
    const existentes=DB.getAll('contaspagar');
    let criadas=0;
    fixas.forEach(d=>{
      const ja=existentes.some(c=>c.despesaFixaId===d.id&&(c.vencimento||'').startsWith(mes));
      if(ja)return;
      const dia=Math.min(Math.max(d.vencimento_dia||10,1),28);
      DB.create('contaspagar',{
        fornecedor:d.nome,categoria:d.categoria||'Outros',
        descricao:`${d.nome} — ${mes}`,valor:d.valor,
        vencimento:`${mes}-${String(dia).padStart(2,'0')}`,
        status:'pendente',recorrente:false,despesaFixaId:d.id,
        observacoes:'Gerada automaticamente da despesa fixa.',
      });
      criadas++;
    });
    if(criadas>0)Toast.success(`⚡ ${criadas} conta(s) do mês gerada(s) em Contas a Pagar`);
    else Toast.warning('Todas as despesas fixas deste mês já foram geradas.');
    renderTab();
  }

  function toggleDespFixa(id){const d=DB.get('despesas_fixas',id);if(!d)return;DB.update('despesas_fixas',id,{ativo:d.ativo===false});Toast.success('Status alterado');renderTab();}
  function deleteDespFixa(id){Utils.confirmDelete('esta despesa fixa',()=>{DB.remove('despesas_fixas',id);Toast.success('Removida');renderTab();});}

  /* ---- DÍVIDAS ---- */
  function buildDividas() {
    const list = DB.getAll('dividas');
    const totalAberto = list.reduce((s,d)=>s+(d.valor_restante||0),0);
    const proxVenc = list.filter(d=>d.vencimento).sort((a,b)=>(a.vencimento).localeCompare(b.vencimento))[0];
    const TIPOS_DIV = ['Financiamento','Empréstimo','Parcelamento','Cartão Corporativo','Outro'];
    const COR_TIPO = { Financiamento:'badge-blue', Empréstimo:'badge-purple', Parcelamento:'badge-yellow', 'Cartão Corporativo':'badge-red', Outro:'badge-gray' };
    return `
      <div class="fin-kpi">
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Total em Aberto</div><div class="fin-kpi-val text-danger">${Utils.formatCurrency(totalAberto)}</div><div class="fk-sub">${list.length} dívida(s)</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Próximo Vencimento</div><div class="fin-kpi-val text-warning">${proxVenc?Utils.formatDate(proxVenc.vencimento):'—'}</div><div class="fk-sub">${proxVenc?Utils.escHtml(Utils.truncate(proxVenc.credor||'',20)):'Sem vencimentos'}</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Total Credores</div><div class="fin-kpi-val">${list.length}</div><div class="fk-sub">dívidas ativas</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">💳 Dívidas e Financiamentos</div>
          <button class="btn btn-sm btn-primary" onclick="Financeiro.openFormDivida(null)">+ Dívida</button>
        </div>
        ${list.length===0?'<div class="card-body"><div class="empty-state"><div class="empty-icon">💳</div><div class="empty-title">Nenhuma dívida cadastrada</div></div></div>':`
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Credor</th><th>Tipo</th><th>Valor Restante</th><th>Próx. Parcela</th><th>Juros %</th><th>Progresso</th><th>Ações</th></tr></thead>
        <tbody>${list.map(d=>{
          const total = d.parcelas_total||1;
          const pagas = d.parcelas_pagas||0;
          const pct = Math.round((pagas/total)*100);
          return `<tr>
            <td class="font-semibold text-sm">${Utils.escHtml(d.credor||'—')}</td>
            <td><span class="badge ${COR_TIPO[d.tipo]||'badge-gray'}">${Utils.escHtml(d.tipo||'—')}</span></td>
            <td class="font-bold text-danger">${Utils.formatCurrency(d.valor_restante||0)}</td>
            <td class="${Utils.isOverdue(d.vencimento)?'text-danger font-bold':'text-sm'}">${Utils.formatDate(d.vencimento)}</td>
            <td class="text-sm">${d.taxa_juros?d.taxa_juros+'%':'—'}</td>
            <td style="min-width:100px"><div style="display:flex;align-items:center;gap:4px"><div style="flex:1;height:6px;background:var(--border);border-radius:4px"><div style="width:${pct}%;height:100%;background:${pct===100?'#10b981':'#2563eb'};border-radius:4px"></div></div><span class="text-xs">${pagas}/${total}</span></div></td>
            <td><div class="tbl-actions">
              ${(d.valor_restante||0)>0?`<button class="btn btn-xs btn-success" onclick="Financeiro.pagarParcelaDivida('${d.id}')" title="Registrar pagamento de 1 parcela">✓ Pagar</button>`:''}
              <button class="btn btn-xs btn-secondary" onclick="Financeiro.openFormDivida('${d.id}')">✏</button>
              <button class="btn btn-xs btn-danger" onclick="Financeiro.deleteDivida('${d.id}')">🗑</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody></table></div>`}
      </div>`;
  }

  function openFormDivida(id) {
    const d = id ? DB.get('dividas', id) : null;
    Modal.open({ title: id ? 'Editar Dívida' : '+ Nova Dívida', body: `
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">Credor *</label><input class="form-control" id="dvCred" value="${Utils.escHtml(d?.credor||'')}"></div>
        <div class="form-group"><label class="form-label">Tipo</label><select class="form-control" id="dvTipo"><option value="Financiamento" ${d?.tipo==='Financiamento'?'selected':''}>Financiamento</option><option value="Empréstimo" ${d?.tipo==='Empréstimo'?'selected':''}>Empréstimo</option><option value="Parcelamento" ${d?.tipo==='Parcelamento'?'selected':''}>Parcelamento</option><option value="Cartão Corporativo" ${d?.tipo==='Cartão Corporativo'?'selected':''}>Cartão Corporativo</option><option value="Outro" ${d?.tipo==='Outro'?'selected':''}>Outro</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Valor Total (R$) *</label><input class="form-control" id="dvTotal" type="text" inputmode="decimal" value="${Utils.moneyToInput(d?.valor_total)}" placeholder="0,00"></div>
        <div class="form-group"><label class="form-label">Valor Restante (R$) *</label><input class="form-control" id="dvRest" type="text" inputmode="decimal" value="${Utils.moneyToInput(d?.valor_restante)}" placeholder="0,00"></div>
        <div class="form-group"><label class="form-label">Valor Parcela (R$)</label><input class="form-control" id="dvParc" type="text" inputmode="decimal" value="${Utils.moneyToInput(d?.valor_parcela)}" placeholder="0,00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Parcelas Total</label><input class="form-control" id="dvPtotal" type="number" value="${d?.parcelas_total||''}"></div>
        <div class="form-group"><label class="form-label">Parcelas Pagas</label><input class="form-control" id="dvPpagas" type="number" value="${d?.parcelas_pagas||''}"></div>
        <div class="form-group"><label class="form-label">Próx. Parcela</label><input class="form-control" id="dvVenc" type="date" value="${d?.vencimento||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Taxa Juros (%)</label><input class="form-control" id="dvJuros" type="number" step="0.01" value="${d?.taxa_juros||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" id="dvObs" rows="2">${Utils.escHtml(d?.obs||'')}</textarea></div>`,
      saveCb: () => {
        const credor = document.getElementById('dvCred').value.trim(); if(!credor){Toast.error('Credor obrigatório');return;}
        const valor_total = Utils.parseMoney(document.getElementById('dvTotal').value); if(!valor_total){Toast.error('Valor total inválido — use o formato 1500,00');return;}
        const valor_restante = Utils.parseMoney(document.getElementById('dvRest').value); if(!valor_restante){Toast.error('Valor restante inválido — use o formato 1500,00');return;}
        const data = { credor, tipo:document.getElementById('dvTipo').value, valor_total, valor_restante, valor_parcela:Utils.parseMoney(document.getElementById('dvParc').value), parcelas_total:Number(document.getElementById('dvPtotal').value)||0, parcelas_pagas:Number(document.getElementById('dvPpagas').value)||0, vencimento:document.getElementById('dvVenc').value, taxa_juros:Number(document.getElementById('dvJuros').value)||0, obs:document.getElementById('dvObs').value };
        if(id){DB.update('dividas',id,data);Toast.success('Atualizado');}else{DB.create('dividas',data);Toast.success('Dívida criada');}
        Modal.close(); renderTab();
      }
    });
  }
  function deleteDivida(id){Utils.confirmDelete('esta dívida',()=>{DB.remove('dividas',id);Toast.success('Removida');renderTab();});}

  /* Registra o pagamento de uma parcela da dívida: atualiza saldo/contador,
     avança o vencimento em 1 mês e cria o lançamento de despesa. */
  function pagarParcelaDivida(id){
    const d=DB.get('dividas',id);if(!d)return;
    const vParc=d.valor_parcela||0;
    if(!vParc){Toast.warning('Cadastre o "Valor Parcela" na dívida para registrar pagamentos.');openFormDivida(id);return;}
    Confirm.show('Pagar parcela?',`${d.credor} — ${Utils.formatCurrency(vParc)}. Será criado um lançamento de despesa.`,()=>{
      const pagas=(d.parcelas_pagas||0)+1;
      const rest=Math.max(0,Math.round(((d.valor_restante||0)-vParc)*100)/100);
      let venc=d.vencimento||'';
      if(venc){const dt=new Date(venc+'T00:00:00');dt.setMonth(dt.getMonth()+1);venc=Utils.localDateStr(dt);}
      DB.update('dividas',id,{parcelas_pagas:pagas,valor_restante:rest,vencimento:rest>0?venc:''});
      DB.create('lancamentos',{
        tipo:'despesa',categoria:'Outros',
        descricao:`Parcela ${pagas}${d.parcelas_total?'/'+d.parcelas_total:''} — ${d.credor}`,
        valor:vParc,data:Utils.todayStr(),status:'pago',
        clienteId:'',dividaId:id,observacoes:'Criado automaticamente ao pagar parcela de dívida.',
      });
      Toast.success(rest>0?`Parcela paga — restam ${Utils.formatCurrency(rest)}`:'🎉 Dívida quitada!');
      renderTab();
    });
  }

  /* ---- ATIVOS ---- */
  function buildAtivos() {
    const list = DB.getAll('ativos_empresa');
    const patrimonio = list.reduce((s,a)=>s+(a.valor_atual||0),0);
    const deprAnual = list.reduce((s,a)=>s+((a.valor_atual||0)*(a.depreciacao_anual||0)/100),0);
    const TIPOS_AT = ['Veículo','Equipamento','Imóvel','Software','Ferramentas','Outro'];
    const COR_AT = { Veículo:'badge-blue', Equipamento:'badge-purple', Imóvel:'badge-green', Software:'badge-gray', Ferramentas:'badge-yellow', Outro:'badge-gray' };
    return `
      <div class="fin-kpi">
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Patrimônio Total</div><div class="fin-kpi-val text-success">${Utils.formatCurrency(patrimonio)}</div><div class="fk-sub">${list.length} ativo(s)</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Depreciação Anual</div><div class="fin-kpi-val text-warning">${Utils.formatCurrency(deprAnual)}</div><div class="fk-sub">Total estimado</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">🏭 Ativos da Empresa</div>
          <button class="btn btn-sm btn-primary" onclick="Financeiro.openFormAtivo(null)">+ Ativo</button>
        </div>
        ${list.length===0?'<div class="card-body"><div class="empty-state"><div class="empty-icon">🏭</div><div class="empty-title">Nenhum ativo cadastrado</div></div></div>':`
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Tipo</th><th>Valor Aquisição</th><th>Valor Atual</th><th>Data Aquisição</th><th>Depr. Anual</th><th>Ações</th></tr></thead>
        <tbody>${list.map(a=>`<tr>
          <td class="font-semibold text-sm">${Utils.escHtml(a.nome||'—')}</td>
          <td><span class="badge ${COR_AT[a.tipo]||'badge-gray'}">${Utils.escHtml(a.tipo||'—')}</span></td>
          <td class="text-sm">${Utils.formatCurrency(a.valor_aquisicao||0)}</td>
          <td class="font-bold text-primary">${Utils.formatCurrency(a.valor_atual||0)}</td>
          <td class="text-sm text-muted">${Utils.formatDate(a.data_aquisicao)}</td>
          <td class="text-sm">${a.depreciacao_anual?a.depreciacao_anual+'%':'—'}</td>
          <td><div class="tbl-actions">
            <button class="btn btn-xs btn-secondary" onclick="Financeiro.openFormAtivo('${a.id}')">✏</button>
            <button class="btn btn-xs btn-danger" onclick="Financeiro.deleteAtivo('${a.id}')">🗑</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`}
      </div>`;
  }

  function openFormAtivo(id) {
    const a = id ? DB.get('ativos_empresa', id) : null;
    const TIPOS_AT = ['Veículo','Equipamento','Imóvel','Software','Ferramentas','Outro'];
    Modal.open({ title: id ? 'Editar Ativo' : '+ Novo Ativo', body: `
      <div class="form-row">
        <div class="form-group" style="flex:2"><label class="form-label">Nome *</label><input class="form-control" id="atNome" value="${Utils.escHtml(a?.nome||'')}"></div>
        <div class="form-group"><label class="form-label">Tipo</label><select class="form-control" id="atTipo">${TIPOS_AT.map(t=>`<option value="${t}" ${a?.tipo===t?'selected':''}>${t}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Valor Aquisição (R$) *</label><input class="form-control" id="atAquisicao" type="text" inputmode="decimal" value="${Utils.moneyToInput(a?.valor_aquisicao)}" placeholder="0,00"></div>
        <div class="form-group"><label class="form-label">Valor Atual (R$) *</label><input class="form-control" id="atAtual" type="text" inputmode="decimal" value="${Utils.moneyToInput(a?.valor_atual)}" placeholder="0,00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Data Aquisição</label><input class="form-control" id="atData" type="date" value="${a?.data_aquisicao||''}"></div>
        <div class="form-group"><label class="form-label">Depreciação Anual (%)</label><input class="form-control" id="atDepr" type="number" step="0.1" value="${a?.depreciacao_anual||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" id="atObs" rows="2">${Utils.escHtml(a?.obs||'')}</textarea></div>`,
      saveCb: () => {
        const nome = document.getElementById('atNome').value.trim(); if(!nome){Toast.error('Nome obrigatório');return;}
        const valor_aquisicao = Utils.parseMoney(document.getElementById('atAquisicao').value); if(!valor_aquisicao){Toast.error('Valor de aquisição inválido — use o formato 1500,00');return;}
        const valor_atual = Utils.parseMoney(document.getElementById('atAtual').value); if(!valor_atual){Toast.error('Valor atual inválido — use o formato 1500,00');return;}
        const data = { nome, tipo:document.getElementById('atTipo').value, valor_aquisicao, valor_atual, data_aquisicao:document.getElementById('atData').value, depreciacao_anual:Number(document.getElementById('atDepr').value)||0, obs:document.getElementById('atObs').value };
        if(id){DB.update('ativos_empresa',id,data);Toast.success('Atualizado');}else{DB.create('ativos_empresa',data);Toast.success('Ativo criado');}
        Modal.close(); renderTab();
      }
    });
  }
  function deleteAtivo(id){Utils.confirmDelete('este ativo',()=>{DB.remove('ativos_empresa',id);Toast.success('Removido');renderTab();});}

  return {render,setTab,setFiltLanc,limparFiltros,setFiltPagar,setDreMes,novoLancamento,novaDespesa,editLanc,marcarPago,deleteLanc,novoRecebivel,editRecebivel,marcarRecebido,addParcela,deleteRecebivel,novaContaPagar,editContaPagar,pagarConta,deleteContaPagar,_trocarTipo,_addPF,addNew,drillDown,openFormDespFixa,toggleDespFixa,deleteDespFixa,gerarContasDoMes,openFormDivida,deleteDivida,pagarParcelaDivida,openFormAtivo,deleteAtivo};
})();
