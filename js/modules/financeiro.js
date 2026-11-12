/* ==========================================
   FINANCEIRO — Hub Financeiro Completo
   ========================================== */
const Financeiro = (() => {
  let _tab = 'visao_geral';
  let _filtLanc = { tipo:'', categoria:'', status:'', busca:'', mesInicio:'', mesFim:'', origem:'' };
  let _filtPagar = { status:'', categoria:'' };
  let _dremes = Utils.todayStr().substring(0, 7);
  let _regime = 'caixa';          // 'caixa' | 'competencia'
  let _filtServ = { status:'', busca:'', semCusto:false };
  const _consAberto = {};         // quais achados da consistencia estao expandidos
  const _dreAberto = { serv:false, custo:false, pessoal:false };

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
        ${[['visao_geral','📊 Visão Geral'],['servicos','🔧 Serviços'],['lancamentos','📋 Lançamentos'],['receber','💰 Contas a Receber'],['pagar','📤 Contas a Pagar'],['dre','📈 DRE'],['fluxo','🔄 Fluxo de Caixa'],['despesas_fixas','📌 Despesas Fixas'],['dividas','💳 Dívidas'],['ativos','🏭 Ativos'],['consistencia','🧭 Consistência']].map(([id,lb])=>`<button class="tab-btn ${_tab===id?'active':''}" onclick="Financeiro.setTab('${id}')">${lb}</button>`).join('')}
      </div>
      <div id="finContent"></div>`;
    renderTab();
  }

  function setTab(t) { _tab=t; render(); }

  function renderTab() {
    const el = document.getElementById('finContent'); if (!el) return;
    switch (_tab) {
      case 'visao_geral': el.innerHTML=buildVisaoGeral(); setTimeout(renderCharts,50); break;
      case 'servicos':    el.innerHTML=buildServicos(); break;
      case 'consistencia':el.innerHTML=buildConsistencia(); break;
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

  /* ---- VISÃO GERAL ----
     Reescrita para ler do núcleo, não de somas soltas. Antes a receita do mês
     vinha só dos lançamentos, e por isso parcela recebida pelo financeiro do
     serviço aparecia num lugar e não no outro. */
  function buildVisaoGeral() {
    if (typeof FinNucleo === 'undefined') {
      return '<div class="card"><div class="card-body text-muted">Núcleo financeiro não carregado.</div></div>';
    }
    const mes = Utils.todayStr().substring(0, 7);
    const c = FinNucleo.consolidado({ de: mes + '-01', ate: mes + '-31', regime: 'caixa' });
    const pe = FinNucleo.pontoEquilibrio(mes);
    const linhas = FinNucleo.servicos();
    const carteira = FinNucleo.somarParcelas(DB.getAll('recebiveis').filter(r => Utils.recebivelAtivo(r)));
    const aPagar = DB.getAll('contaspagar')
      .filter(x => x.status === 'pendente')
      .reduce((s, x) => s + (Number(x.valor) || 0), 0);
    const emAndamento = linhas.filter(l => l.status === 'em_andamento');
    const faltaReceber = emAndamento.reduce((s, l) => s + (l.contratada - l.recebido), 0);

    const k = (cor, lb, val, sub, click, titulo) => `
      <div class="kpi-card" style="--kpi-color:${cor}${click ? ';cursor:pointer' : ''}" ${click ? `onclick="${click}"` : ''} ${titulo ? `title="${titulo}"` : ''}>
        <div class="kpi-label">${lb}</div>
        <div class="kpi-value" style="font-size:19px">${val}</div>
        <div class="kpi-sub">${sub}</div>
      </div>`;

    const peTxt = pe.faturamentoNecessario != null
      ? Utils.formatCurrency(pe.faturamentoNecessario)
      : '—';

    return `
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        ${k('#10b981', 'Entrou no mês', Utils.formatCurrency(c.receitaBruta), 'parcelas recebidas + receitas avulsas', "Financeiro.drillDown('recebido_periodo')")}
        ${k('#dc2626', 'Saiu no mês', Utils.formatCurrency(c.custoDiretoTotal + c.estrutura), 'custo de serviço + pessoal + estrutura', "Financeiro.setTab('dre')")}
        ${k(c.resultado >= 0 ? '#10b981' : '#dc2626', 'Resultado do mês', `<span style="color:${c.resultado >= 0 ? 'var(--ok-txt)' : 'var(--ruim-txt)'}">${Utils.formatCurrency(c.resultado)}</span>`, c.resultadoPct != null ? c.resultadoPct + '% da receita' : (c.resultado >= 0 ? 'superávit' : 'déficit'), "Financeiro.setTab('dre')")}
        ${k('#1D4F8C', 'Margem de contribuição', c.margemContribuicaoPct != null ? c.margemContribuicaoPct + '%' : '—', `${Utils.formatCurrency(c.margemContribuicao)} depois de imposto e custo direto`, "Financeiro.setTab('dre')")}
        ${k('#7c3aed', 'Preciso faturar', peTxt, pe.faturamentoNecessario != null ? 'por mês para o resultado dar zero' : (pe.motivo ? 'sem base: ' + Utils.escHtml(pe.motivo.substring(0, 42)) : '—'), "Financeiro.setTab('dre')", pe.motivo ? Utils.escHtml(pe.motivo) : '')}
        ${k('#d97706', 'A receber', Utils.formatCurrency(carteira.aReceber), `${Utils.formatCurrency(faltaReceber)} em serviços em andamento`, "Financeiro.drillDown('receber_avencer')")}
        ${k('#8B2222', 'Vencido', `<span style="color:${carteira.vencido ? 'var(--ruim-txt)' : 'inherit'}">${Utils.formatCurrency(carteira.vencido)}</span>`, carteira.nVencidas ? carteira.nVencidas + ' parcela(s) em atraso' : 'nada em atraso', "Financeiro.drillDown('receber_vencido')")}
        ${k('#64748b', 'A pagar', Utils.formatCurrency(aPagar), 'contas em aberto', "Financeiro.drillDown('pagar_avencer')")}
      </div>

      <div class="grid-2 mt-4">
        <div class="card">
          <div class="card-header">
            <div class="card-title">🔧 Resultado por serviço</div>
            <button class="btn btn-xs btn-ghost" onclick="Financeiro.setTab('servicos')">ver todos</button>
          </div>
          <div class="card-body" style="padding:0">
            <table class="tbl">
              <thead><tr><th>Serviço</th><th>Receita</th><th>Custo</th><th>Margem</th></tr></thead>
              <tbody>${linhas.slice(0, 7).map(l => `<tr>
                <td><div class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(l.titulo, 26))}</div></td>
                <td class="text-sm">${Utils.formatCurrency(l.contratada)}</td>
                <td class="text-sm ${l.custoTotal ? 'text-danger' : 'text-muted'}">${l.custoTotal ? Utils.formatCurrency(l.custoTotal) : '—'}</td>
                <td class="font-bold text-sm" style="color:${l.temCusto ? FinNucleo.corDaMargem(l.margemPct) : 'var(--text-muted)'}">${l.temCusto ? l.margemPct + '%' : 'sem custo'}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="text-muted p-3">Nenhum serviço cadastrado.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">🍩 Para onde foi o dinheiro no mês</div></div>
          <div class="card-body">
            ${Object.keys(c.porCategoria).length === 0
              ? '<div class="text-sm text-muted p-2">Nenhuma saída registrada neste mês.</div>'
              : Object.entries(c.porCategoria).sort((a, b) => b[1] - a[1]).map(([cat, v]) => {
                  const totalSaidas = Object.values(c.porCategoria).reduce((s, x) => s + x, 0);
                  const pct = totalSaidas > 0 ? Math.round((v / totalSaidas) * 100) : 0;
                  return `<div class="cat-linha">
                    <div class="cat-nome">${Utils.escHtml(cat)}</div>
                    <div class="cat-barra"><span style="width:${pct}%"></span></div>
                    <div class="cat-valor">${Utils.formatCurrency(v)}<span class="text-xs text-muted"> ${pct}%</span></div>
                  </div>`;
                }).join('')}
          </div>
        </div>
      </div>

      <div class="grid-2 mt-4">
        <div class="card"><div class="card-header"><div class="card-title">📊 Receitas — 6 meses</div></div><div class="card-body"><div id="chartRecDesp" style="height:190px"></div></div></div>
        <div class="card">
          <div class="card-header"><div class="card-title">👥 Custo de pessoal do mês</div><button class="btn btn-xs btn-ghost" onclick="App.navigate('rh')">RH</button></div>
          <div class="card-body" style="padding:0">
            ${c.pessoal.estimado ? `<div class="ficha-aviso" style="margin:10px">A folha de ${c.mes} ainda não foi gerada. Os valores abaixo são a estimativa do cadastro.</div>` : ''}
            <table class="tbl"><thead><tr><th>Pessoa</th><th>Folha</th><th>Lançamentos</th><th>Total</th></tr></thead>
            <tbody>${c.pessoal.porFuncionario.map(x => `<tr>
              <td><a href="javascript:void(0)" onclick="FuncionarioFicha.abrir('${x.funcionarioId}')" class="font-semibold text-sm">${Utils.escHtml(x.nome)}</a></td>
              <td class="text-sm">${Utils.formatCurrency(x.folha)}</td>
              <td class="text-sm ${x.lancamentos ? 'text-danger' : 'text-muted'}">${x.lancamentos ? Utils.formatCurrency(x.lancamentos) : '—'}</td>
              <td class="font-semibold text-sm">${Utils.formatCurrency(x.total)}</td>
            </tr>`).join('') || '<tr><td colspan="4" class="text-muted p-3">Nenhuma pessoa ativa.</td></tr>'}</tbody>
            <tfoot><tr style="border-top:2px solid var(--border);font-weight:700">
              <td>Total</td><td>${Utils.formatCurrency(c.pessoal.folha)}</td>
              <td>${Utils.formatCurrency(c.pessoal.lancamentos)}</td>
              <td>${Utils.formatCurrency(c.pessoal.total)}</td>
            </tr></tfoot></table>
          </div>
        </div>
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
    /* Origem separa o que e dinheiro proprio da empresa do que e espelho de um
       servico. Sem isso a lista mistura as duas coisas e ninguem sabe por que o
       total dela nao bate com o DRE. */
    if(_filtLanc.origem==='geral')   list=list.filter(l=>typeof FinNucleo==='undefined'||!FinNucleo.ehEspelho(l));
    if(_filtLanc.origem==='servico') list=list.filter(l=>typeof FinNucleo!=='undefined'&&FinNucleo.ehEspelho(l));
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
            <select class="filter-select" onchange="Financeiro.setFiltLanc('origem',this.value)" title="De onde vem o dinheiro">
              <option value="">Todas as origens</option>
              <option value="geral" ${_filtLanc.origem==='geral'?'selected':''}>Só da empresa</option>
              <option value="servico" ${_filtLanc.origem==='servico'?'selected':''}>Só de serviço</option>
            </select>
            <input type="month" class="form-control" style="max-width:140px;padding:5px 8px;font-size:12px" title="De:" value="${_filtLanc.mesInicio}" onchange="Financeiro.setFiltLanc('mesInicio',this.value)">
            <input type="month" class="form-control" style="max-width:140px;padding:5px 8px;font-size:12px" title="Até:" value="${_filtLanc.mesFim}" onchange="Financeiro.setFiltLanc('mesFim',this.value)">
            <input class="form-control" id="flBuscaInput" style="max-width:140px;padding:5px 10px;font-size:12px" placeholder="Buscar..." value="${Utils.escHtml(_filtLanc.busca)}" oninput="Financeiro.setFiltLanc('busca',this.value)">
            ${(_filtLanc.tipo||_filtLanc.status||_filtLanc.categoria||_filtLanc.mesInicio||_filtLanc.mesFim||_filtLanc.busca||_filtLanc.origem)?`<button class="btn btn-xs btn-ghost" onclick="Financeiro.limparFiltros()">✕ Limpar</button>`:''}
          </div>
          <span class="text-sm text-muted">${list.length} lançamento(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length===0?'<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum lançamento</div></div>':`
          <table class="tbl"><thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Origem</th><th>Data</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${list.map(l=>{
            const iR=l.tipo==='receita';
            const stCls={recebido:'badge-green',a_receber:'badge-blue',pago:'badge-green',a_pagar:'badge-yellow',vencido:'badge-red'}[l.status]||'badge-gray';
            const stLb={recebido:'Recebido',a_receber:'A Receber',pago:'Pago',a_pagar:'A Pagar',vencido:'Vencido'}[l.status]||l.status;
            const esp=(typeof FinNucleo!=='undefined')?FinNucleo.espelhoLanc(l):null;
            const projId=esp&&esp.fonte!=='recebivel'?esp.id:null;
            const projEsp=projId?DB.get('projetos',projId):null;
            const origemCel=!esp
              ? '<span class="badge badge-gray" title="Dinheiro proprio da empresa: entra inteiro no DRE">Empresa</span>'
              : `<span class="badge badge-blue" title="Espelho de ${Utils.escHtml(esp.motivo)}. O valor e contado na origem, nao aqui, para o mesmo dinheiro nao entrar duas vezes.">Serviço</span>${projEsp?`<div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(projEsp.titulo,18))}</div>`:''}`;
            return `<tr>
              <td><span class="badge ${iR?'badge-green':'badge-red'}">${iR?'⬆ Receita':'⬇ Despesa'}</span></td>
              <td class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(l.descricao,38))}</td>
              <td class="text-xs text-muted">${Utils.escHtml(l.categoria||'—')}</td>
              <td>${origemCel}</td>
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
    // Parcela cancelada fica fora de tudo: antes caia no 'else' e era somada
    // como pendente ou vencida, inflando o total a receber.
    recs.filter(Utils.recebivelAtivo).forEach(r=>(r.parcelas||[]).forEach(p=>{
      if(p.status==='cancelado')return;
      tG+=p.valor;
      p.status==='recebido'?tR+=p.valor:Utils.isOverdue(p.vencimento)?tV+=p.valor:tP+=p.valor;
    }));
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
          const ov=Utils.parcelaAberta(p)&&Utils.isOverdue(p.vencimento);
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
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-ghost" onclick="Financeiro.openQuitarAteModal()" title="Marca em massa como pagas as contas pendentes até um mês de corte">🧹 Quitar até...</button>
            <button class="btn btn-sm btn-secondary" onclick="Financeiro.novaContaPagar()">+ Conta a Pagar</button>
          </div>
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
  /* Projeção de despesas fixas de UM mês específico, sem contar em dobro:
     uma fixa Mensal que já foi gerada (⚡ Gerar Contas do Mês) pra esse mês
     já aparece como lançamento/conta real — não soma a estimativa de novo.
     Periodicidades não-mensais (Bimestral, Trimestral...) não têm rastreio
     de geração automática, então mantém a estimativa proporcional sempre. */
  function _despFixaProjMes(mes) {
    const fixas = DB.getAll('despesas_fixas').filter(d=>d.ativo!==false);
    const contas = DB.getAll('contaspagar');
    let total=0, count=0;
    fixas.forEach(d=>{
      if ((d.periodicidade||'Mensal')==='Mensal') {
        const jaGerada = contas.some(c=>c.despesaFixaId===d.id&&(c.vencimento||'').startsWith(mes));
        if (jaGerada) return;
      }
      total += _despFixaMensal(d); count++;
    });
    return { total, count };
  }

  /* ---- DRE ----
     Agora em quatro blocos, para separar o que é resultado do trabalho do que
     é peso da estrutura:
       receita → imposto → custo direto dos serviços → margem de contribuição
       → estrutura (pessoal, fixas, gerais) → resultado

     O custo dos serviços entra como UMA linha, expansível. É a regra pedida:
     o detalhe fica no serviço, o geral recebe o total. */
  function buildDRE() {
    if (typeof FinNucleo === 'undefined') {
      return '<div class="card"><div class="card-body text-muted">Núcleo financeiro não carregado.</div></div>';
    }
    const c = FinNucleo.consolidado({ de: _dremes + '-01', ate: _dremes + '-31', regime: _regime });
    const pe = FinNucleo.pontoEquilibrio(_dremes);
    const cfg = DB.getConfig();
    const pct = (x) => c.receitaBruta > 0 ? ((x / c.receitaBruta) * 100).toFixed(1) + '%' : '—';

    const linha = (lb, val, cls, sub) => `
      <div class="dre-row">
        <div class="dre-label">${lb}${sub ? `<div class="text-xs text-muted">${sub}</div>` : ''}</div>
        <div class="dre-value ${cls || ''}">${val}</div>
      </div>`;
    const total = (lb, val, cls, margem) => `
      <div class="dre-row dre-total">
        <div class="dre-label">${lb}${margem ? ` <span style="font-size:11px;font-weight:400;color:var(--text-muted)">— ${margem}</span>` : ''}</div>
        <div class="dre-value ${cls || ''}">${val}</div>
      </div>`;
    const secao = (lb) => `<div class="dre-row dre-section"><div class="dre-label">${lb}</div></div>`;

    return `
      <div class="card mb-4">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div class="card-title">📈 DRE — ${_regime === 'caixa' ? 'regime de caixa' : 'competência'}</div>
          <div class="filters">
            <div class="dre-toggle">
              <button class="btn btn-xs ${_regime === 'caixa' ? 'btn-primary' : 'btn-ghost'}" onclick="Financeiro.setRegime('caixa')" title="O que entrou e saiu de fato no mês">Caixa</button>
              <button class="btn btn-xs ${_regime === 'competencia' ? 'btn-primary' : 'btn-ghost'}" onclick="Financeiro.setRegime('competencia')" title="O resultado dos serviços iniciados no mês, pagos ou não">Competência</button>
            </div>
            <input type="month" class="form-control" style="max-width:155px;padding:5px 10px;font-size:12.5px" value="${_dremes}" onchange="Financeiro.setDreMes(this.value)">
          </div>
        </div>
        <div class="card-body">
          <p class="text-xs text-muted mb-3">
            ${_regime === 'caixa'
              ? 'Caixa responde "tenho dinheiro?". Entram as parcelas recebidas e os custos com data no mês.'
              : 'Competência responde "o trabalho deu lucro?". Entra o valor cheio dos serviços iniciados no mês, com todo o custo deles, pago ou não.'}
          </p>
          <div class="dre-table">
            ${secao('RECEITA')}
            ${linha(`Serviços <button class="btn btn-xs btn-ghost" onclick="Financeiro.toggleDre('serv')">${_dreAberto.serv ? '▾' : '▸'} ${c.porServico.length}</button>`,
                    '+ ' + Utils.formatCurrency(c.receitaServicos), 'pos')}
            ${_dreAberto.serv ? c.porServico.map(s => `
              <div class="dre-row dre-sub">
                <div class="dre-label">${Utils.escHtml(Utils.truncate(s.titulo, 44))}</div>
                <div class="dre-value">${Utils.formatCurrency(s.receitaPeriodo)}</div>
              </div>`).join('') : ''}
            ${c.receitaOutras ? linha('Outras receitas <span class="text-xs text-muted">(fora de serviço)</span>', '+ ' + Utils.formatCurrency(c.receitaOutras), 'pos') : ''}
            ${total('= RECEITA BRUTA', Utils.formatCurrency(c.receitaBruta))}

            ${secao('(−) IMPOSTOS')}
            ${linha(`Impostos sobre receita <span class="text-xs text-muted">${Utils.escHtml(cfg.regimeTributario || 'Simples')} · ${c.aliquota.toFixed(1)}%</span>`,
                    '− ' + Utils.formatCurrency(c.impostos), 'neg')}
            ${total('= RECEITA LÍQUIDA', Utils.formatCurrency(c.receitaLiquida))}

            ${secao('(−) CUSTO DIRETO DOS SERVIÇOS')}
            ${linha(`Custo dos serviços <button class="btn btn-xs btn-ghost" onclick="Financeiro.toggleDre('custo')">${_dreAberto.custo ? '▾' : '▸'} detalhar</button>`,
                    '− ' + Utils.formatCurrency(c.custoServicos), 'neg',
                    'material, deslocamento, subcontratação e horas — lançados dentro de cada serviço')}
            ${_dreAberto.custo ? c.porServico.filter(s => s.custoPeriodo > 0).map(s => `
              <div class="dre-row dre-sub">
                <div class="dre-label">${Utils.escHtml(Utils.truncate(s.titulo, 38))}
                  <a href="javascript:void(0)" onclick="Financeiro.detalheServico('${s.id}')" class="text-xs" style="margin-left:6px">ver itens</a></div>
                <div class="dre-value">${Utils.formatCurrency(s.custoPeriodo)}</div>
              </div>`).join('') || '<div class="dre-row dre-sub"><div class="dre-label text-muted">Nenhum custo de serviço no período</div><div class="dre-value">—</div></div>' : ''}
            ${linha('Comissões e parcerias', '− ' + Utils.formatCurrency(c.comissoesServicos), 'neg')}
            ${total('= MARGEM DE CONTRIBUIÇÃO', Utils.formatCurrency(c.margemContribuicao),
                    c.margemContribuicao >= 0 ? 'pos' : 'neg',
                    'margem ' + pct(c.margemContribuicao))}

            ${secao('(−) ESTRUTURA')}
            ${linha(`Pessoal <button class="btn btn-xs btn-ghost" onclick="Financeiro.toggleDre('pessoal')">${_dreAberto.pessoal ? '▾' : '▸'} ${c.pessoal.porFuncionario.length}</button>`,
                    '− ' + Utils.formatCurrency(c.pessoal.total), 'neg',
                    c.pessoal.estimado ? 'folha do mês não gerada: estimativa do cadastro' : 'folha gerada + lançamentos da equipe')}
            ${_dreAberto.pessoal ? c.pessoal.porFuncionario.map(x => `
              <div class="dre-row dre-sub">
                <div class="dre-label">${Utils.escHtml(x.nome)}</div>
                <div class="dre-value">${Utils.formatCurrency(x.total)}</div>
              </div>`).join('') : ''}
            ${linha(`Despesas fixas <span class="text-xs text-muted">${c.fixas.n} item(ns)</span>`,
                    '− ' + Utils.formatCurrency(c.fixas.total), 'neg',
                    c.fixas.jaLancado ? Utils.formatCurrency(c.fixas.jaLancado) + ' já viraram conta real e saíram daqui' : '')}
            ${linha(`Outras despesas gerais <span class="text-xs text-muted">${c.lancamentosGerais.length} lançamento(s)</span>`,
                    '− ' + Utils.formatCurrency(c.despGerais), 'neg',
                    'o que não é de serviço nem de pessoal')}
            ${total('= RESULTADO OPERACIONAL', Utils.formatCurrency(c.resultado),
                    c.resultado >= 0 ? 'pos' : 'neg',
                    'margem ' + pct(c.resultado))}
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><div class="card-title">⚖ Ponto de equilíbrio</div></div>
          <div class="card-body">
            ${pe.faturamentoNecessario != null ? `
              <div class="pe-val">${Utils.formatCurrency(pe.faturamentoNecessario)}</div>
              <div class="text-sm text-muted mb-3">é o que precisa entrar por mês para o resultado dar zero.</div>
              <table class="tbl"><tbody>
                <tr><td>Pessoal</td><td class="text-right">${Utils.formatCurrency(pe.pessoal)}</td></tr>
                <tr><td>Despesas fixas</td><td class="text-right">${Utils.formatCurrency(pe.fixas)}</td></tr>
                <tr><td>Outras despesas</td><td class="text-right">${Utils.formatCurrency(pe.gerais)}</td></tr>
                <tr style="border-top:1px solid var(--border)"><td class="font-bold">Estrutura a cobrir</td><td class="text-right font-bold">${Utils.formatCurrency(pe.estrutura)}</td></tr>
                <tr><td class="text-sm text-muted">÷ margem de contribuição de ${pe.mcPct}%<div class="text-xs text-muted">margem real da carteira menos o imposto</div></td>
                    <td class="text-right font-bold" style="color:var(--info-txt)">${Utils.formatCurrency(pe.faturamentoNecessario)}</td></tr>
              </tbody></table>
              ${c.receitaBruta > 0 ? `<div class="mt-3 text-sm">
                Este mês entrou ${Utils.formatCurrency(c.receitaBruta)}:
                <strong style="color:${c.receitaBruta >= pe.faturamentoNecessario ? 'var(--ok-txt)' : 'var(--ruim-txt)'}">
                  ${c.receitaBruta >= pe.faturamentoNecessario ? 'acima' : 'abaixo'} do equilíbrio
                  em ${Utils.formatCurrency(Math.abs(c.receitaBruta - pe.faturamentoNecessario))}</strong>.
              </div>` : ''}
            ` : `<div class="ficha-aviso">${Utils.escHtml(pe.motivo || 'Sem base para calcular.')}</div>
              <table class="tbl"><tbody>
                <tr><td>Pessoal</td><td class="text-right">${Utils.formatCurrency(pe.pessoal)}</td></tr>
                <tr><td>Despesas fixas</td><td class="text-right">${Utils.formatCurrency(pe.fixas)}</td></tr>
                <tr><td>Outras despesas</td><td class="text-right">${Utils.formatCurrency(pe.gerais)}</td></tr>
                <tr style="border-top:1px solid var(--border)"><td class="font-bold">Estrutura a cobrir por mês</td><td class="text-right font-bold">${Utils.formatCurrency(pe.estrutura)}</td></tr>
              </tbody></table>`}
          </div>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">📊 Resultado mensal — 6 meses</div></div><div class="card-body"><div id="chartDRE" style="height:190px"></div></div></div>
      </div>`;
  }

  /* ---- FLUXO DE CAIXA ---- */
  /* Projeção do mês (só meses atuais/futuros): parcelas de recebíveis em
     aberto = entradas previstas; contas a pagar pendentes = saídas previstas */
  function _projecaoMes(m,hojeM){
    if(m<hojeM)return{e:0,s:0};
    let e=0;
    DB.getAll('recebiveis').forEach(r=>(r.parcelas||[]).forEach(p=>{if(Utils.parcelaAberta(p)&&(p.vencimento||'').startsWith(m))e+=p.valor;}));
    let s=0;
    DB.getAll('contaspagar').forEach(c=>{if(c.status==='pendente'&&(c.vencimento||'').startsWith(m))s+=c.valor;});
    return{e,s};
  }

  function _getSaldoInicial(){
    const cfg=DB.getConfig();
    return cfg.saldoInicialCaixa || { valor:0, mesReferencia:'' };
  }
  function _mesLabel(m){
    if(!m)return '';
    const [ano,mo]=m.split('-');
    return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1]+'/'+ano;
  }
  function openSaldoInicial(){
    const si=_getSaldoInicial();
    Modal.open({
      title: '💼 Saldo Inicial de Caixa (Capital de Giro)',
      body: `
        <p class="text-sm text-muted mb-3">Define o saldo com que a empresa inicia o mês de referência. A partir daí, o Fluxo de Caixa passa a mostrar <b>só esse mês em diante</b> — os meses anteriores saem da tela, evitando contar o resultado antigo e o saldo inicial ao mesmo tempo. Use para começar um novo ciclo (ex.: Agosto/2026) com o valor que sobrou depois de quitar as pendências antigas.</p>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Mês de Referência</label><input type="month" class="form-control" id="siMes" value="${si.mesReferencia||''}"></div>
          <div class="form-group"><label class="form-label">Saldo Inicial (R$)</label><input class="form-control" id="siValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(si.valor)}" placeholder="0,00"></div>
        </div>`,
      saveCb: () => {
        const mesReferencia=document.getElementById('siMes').value;
        const valor=Utils.parseMoney(document.getElementById('siValor').value)||0;
        if(!mesReferencia){Toast.error('Selecione o mês de referência');return;}
        const cfg=DB.getConfig();
        DB.saveConfig({...cfg,saldoInicialCaixa:{valor,mesReferencia}});
        Toast.success('Saldo inicial definido');
        Modal.close(); renderTab();
      }
    });
  }
  // Quando há Saldo Inicial configurado, o Fluxo de Caixa passa a começar
  // exatamente no mês de referência (ex.: Agosto/2026) — os meses anteriores
  // não entram mais na tabela nem no acumulado, pra não contar ao mesmo
  // tempo o resultado histórico E o saldo inicial (double count).
  function _addMesStr(m,n){const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function _mesesFluxo(){
    const si=_getSaldoInicial();
    if(si.mesReferencia){const r=[];for(let i=0;i<=5;i++)r.push(_addMesStr(si.mesReferencia,i));return r;}
    return getLast3Next3();
  }
  function buildFluxo() {
    const meses=_mesesFluxo(), lanc=DB.getAll('lancamentos');
    const saldoInicial=_getSaldoInicial();
    let saldo=saldoInicial.mesReferencia?(saldoInicial.valor||0):0;
    const hoje=Utils.todayStr().substring(0,7);
    const rows=meses.map(m=>{
      const [,mo]=m.split('-');
      const lb=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];
      const proj=_projecaoMes(m,hoje);
      const e=lanc.filter(l=>l.tipo==='receita'&&l.data?.startsWith(m)).reduce((s,l)=>s+l.valor,0)+proj.e;
      const sLanc=lanc.filter(l=>l.tipo==='despesa'&&l.data?.startsWith(m)).reduce((s,l)=>s+l.valor,0);
      // Saídas: lançamentos + contas pendentes do mês + despesas fixas AINDA NÃO lançadas nesse mês
      // (evita contar 2x quando a fixa já foi gerada/paga — ela já está em sLanc/proj.s)
      const s=sLanc+proj.s+_despFixaProjMes(m).total;
      return {m,lb,e,s,r:e-s};
    });
    return `
      <div class="card mb-3" style="border-left:3px solid var(--primary,#1D4F8C)"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        ${saldoInicial.mesReferencia ? `
          <div><div class="text-xs text-muted">💼 Saldo Inicial (Capital de Giro) — ponto de partida em ${_mesLabel(saldoInicial.mesReferencia)}, meses anteriores não entram mais nesta tela</div><div class="font-extrabold" style="font-size:18px">${Utils.formatCurrency(saldoInicial.valor)}</div></div>
        ` : `<div class="text-sm text-muted">Nenhum saldo inicial configurado — o Saldo Acumulado abaixo considera só os lançamentos já registrados.</div>`}
        <button class="btn btn-xs btn-secondary" onclick="Financeiro.openSaldoInicial()">${saldoInicial.mesReferencia?'✏ Ajustar':'+ Definir Saldo Inicial'}</button>
      </div></div>
      <div class="card mb-4"><div class="card-header"><div class="card-title">🔄 Fluxo de Caixa — 6 Meses</div><span class="text-xs text-muted">Meses futuros incluem parcelas a receber e contas a pagar em aberto</span></div><div class="card-body"><div id="chartFluxo" style="height:190px"></div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">📋 Detalhamento Mensal</div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Saldo Acumulado</th></tr></thead>
        <tbody>${rows.map(r=>{
          saldo+=r.r;const fut=r.m>hoje;return `<tr style="${fut?'opacity:.65;font-style:italic':''}">
          <td class="font-bold">${r.lb}${fut?' <span class="badge badge-blue" style="font-size:9px;padding:1px 5px">Proj.</span>':''}${saldoInicial.mesReferencia===r.m?' <span class="badge badge-blue" style="font-size:9px;padding:1px 5px">Início (+ Saldo Inicial)</span>':''}</td>
          <td class="text-success font-bold">${Utils.formatCurrency(r.e)}</td>
          <td class="text-danger font-bold">${Utils.formatCurrency(r.s)}</td>
          <td class="font-extrabold ${r.r>=0?'text-success':'text-danger'}">${Utils.formatCurrency(r.r)}</td>
          <td class="font-extrabold ${saldo>=0?'text-success':'text-danger'}">${Utils.formatCurrency(saldo)}</td>
        </tr>`;}).join('')}</tbody></table></div>
      </div>`;
  }

  /* ---- CHARTS ---- */
  /* =========================================================
     SERVIÇOS — o total de cada serviço, com o detalhe a um clique

     É esta tela que resolve o "sem ficar lançando em planilha geral".
     Cada serviço aparece em UMA linha com o total. O item a item fica
     dentro do serviço e abre aqui pelo botão de detalhe.
  ========================================================= */
  function buildServicos() {
    if (typeof FinNucleo === 'undefined') {
      return '<div class="card"><div class="card-body text-muted">Núcleo financeiro não carregado.</div></div>';
    }
    let linhas = FinNucleo.servicos();
    if (_filtServ.status) linhas = linhas.filter(l => l.status === _filtServ.status);
    if (_filtServ.busca) {
      const t = _filtServ.busca.toLowerCase();
      linhas = linhas.filter(l => (l.titulo || '').toLowerCase().includes(t));
    }
    if (_filtServ.semCusto) linhas = linhas.filter(l => !l.temCusto);

    const tot = linhas.reduce((a, l) => ({
      contratada: a.contratada + l.contratada,
      custo: a.custo + l.custoDireto,
      comissao: a.comissao + l.comissoes,
      lucro: a.lucro + l.lucro,
      recebido: a.recebido + l.recebido,
      aReceber: a.aReceber + l.aReceber,
      vencido: a.vencido + l.vencido,
    }), { contratada: 0, custo: 0, comissao: 0, lucro: 0, recebido: 0, aReceber: 0, vencido: 0 });

    /* Lucro e margem só dos serviços que têm custo lançado. Somar os sem
       custo mostraria o valor inteiro deles como lucro, e a margem da empresa
       apareceria muito maior do que é. */
    const comCusto = linhas.filter(l => l.temCusto);
    const receitaComCusto = comCusto.reduce((a, l) => a + l.contratada, 0);
    const lucroReal = comCusto.reduce((a, l) => a + l.lucro, 0);
    const margemTot = receitaComCusto > 0 ? Math.round((lucroReal / receitaComCusto) * 100) : null;
    const semCusto = linhas.filter(l => !l.temCusto && l.contratada > 0);
    const media = FinNucleo.margemMediaCarteira();

    return `
      ${semCusto.length ? `<div class="ficha-aviso">
        ${semCusto.length} de ${linhas.length} serviços estão sem custo lançado, somando
        ${Utils.formatCurrency(semCusto.reduce((s, l) => s + l.contratada, 0))} de receita.
        Enquanto o custo não entrar, a margem deles lê 100% e a média da empresa fica maior do que é.
      </div>` : ''}

      <div class="funil-kpis">
        <div class="kpi"><div class="kpi-rot">Receita contratada</div><div class="kpi-val">${Utils.formatCurrency(tot.contratada)}</div><div class="kpi-sub">${linhas.length} serviço(s)</div></div>
        <div class="kpi"><div class="kpi-rot">Custo direto</div><div class="kpi-val">${Utils.formatCurrency(tot.custo)}</div><div class="kpi-sub">material, horas, deslocamento</div></div>
        <div class="kpi"><div class="kpi-rot">Comissões</div><div class="kpi-val">${Utils.formatCurrency(tot.comissao)}</div><div class="kpi-sub">parceiros e indicações</div></div>
        <div class="kpi" style="--kc:${margemTot != null ? FinNucleo.corDaMargem(margemTot) : 'var(--text)'}" title="Só entram os serviços com custo lançado. Sem custo, o valor inteiro do serviço apareceria como lucro."><div class="kpi-rot">Lucro apurado</div><div class="kpi-val">${margemTot != null ? Utils.formatCurrency(lucroReal) : '—'}</div><div class="kpi-sub">${margemTot != null ? `margem ${margemTot}% · ${comCusto.length} de ${linhas.length} serviço(s)` : 'nenhum serviço tem custo'}</div></div>
        <div class="kpi" style="--kc:var(--ok-txt)"><div class="kpi-rot">Recebido</div><div class="kpi-val">${Utils.formatCurrency(tot.recebido)}</div><div class="kpi-sub">já em caixa</div></div>
        <div class="kpi"><div class="kpi-rot">A receber</div><div class="kpi-val">${Utils.formatCurrency(tot.aReceber)}</div><div class="kpi-sub">parcelas em aberto</div></div>
        <div class="kpi" style="--kc:${tot.vencido ? 'var(--ruim-txt)' : 'var(--text)'}"><div class="kpi-rot">Vencido</div><div class="kpi-val">${Utils.formatCurrency(tot.vencido)}</div><div class="kpi-sub">${tot.vencido ? 'cobrar' : 'nada em atraso'}</div></div>
      </div>

      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div class="filters">
            <select class="filter-select" onchange="Financeiro.setFiltServ('status',this.value)">
              <option value="">Todos os status</option>
              ${['em_andamento','concluido','pausado','planejado'].map(st => `<option value="${st}" ${_filtServ.status === st ? 'selected' : ''}>${st.replace('_', ' ')}</option>`).join('')}
            </select>
            <input class="form-control" style="max-width:170px;padding:5px 10px;font-size:12px" placeholder="Buscar serviço..." value="${Utils.escHtml(_filtServ.busca)}" oninput="Financeiro.setFiltServ('busca',this.value)">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
              <input type="checkbox" ${_filtServ.semCusto ? 'checked' : ''} onchange="Financeiro.setFiltServ('semCusto',this.checked)">
              só sem custo
            </label>
            ${(_filtServ.status || _filtServ.busca || _filtServ.semCusto) ? `<button class="btn btn-xs btn-ghost" onclick="Financeiro.limparFiltServ()">✕ Limpar</button>` : ''}
          </div>
          <span class="text-sm text-muted">${media != null ? 'margem média da carteira: ' + media + '%' : 'sem margem de referência'}</span>
        </div>
        <div class="table-wrap">
          ${linhas.length === 0 ? '<div class="empty-state"><div class="empty-icon">🔧</div><div class="empty-title">Nenhum serviço no filtro</div></div>' : `
          <table class="tbl">
            <thead><tr>
              <th>Serviço</th><th>Cliente</th><th>Receita</th><th>Custo</th><th>Comissão</th>
              <th>Lucro</th><th>Margem</th><th>Recebido</th><th>Vencido</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>${linhas.map(l => {
              const cli = l.clienteId ? DB.get('clientes', l.clienteId) : null;
              const pagoPct = l.contratada > 0 ? Math.min(100, Math.round((l.recebido / l.contratada) * 100)) : 0;
              const margemCel = !l.temCusto
                ? `<span class="text-xs text-muted" title="Nenhum custo lançado neste serviço">sem custo</span>`
                : `<span class="font-bold" style="color:${FinNucleo.corDaMargem(l.margemPct)}">${l.margemPct}%</span>`;
              return `<tr>
                <td><div class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(l.titulo, 34))}</div>
                    <div class="text-xs text-muted">${Utils.escHtml(l.projeto.ordemServico || l.projeto.codigo || '')}</div></td>
                <td class="text-xs">${cli ? Utils.escHtml(Utils.truncate(cli.empresa || cli.nome || '', 20)) : '<span class="text-muted">—</span>'}</td>
                <td class="font-semibold">${Utils.formatCurrency(l.contratada)}</td>
                <td class="${l.custoDireto ? 'text-danger' : 'text-muted'}">${l.custoDireto ? Utils.formatCurrency(l.custoDireto) : '—'}</td>
                <td class="${l.comissoes ? 'text-danger' : 'text-muted'}">${l.comissoes ? Utils.formatCurrency(l.comissoes) : '—'}</td>
                <td class="font-bold">${l.temCusto ? Utils.formatCurrency(l.lucro) : '—'}</td>
                <td>${margemCel}</td>
                <td><div class="font-semibold text-sm">${Utils.formatCurrency(l.recebido)}</div>
                    <div class="barrinha"><span style="width:${pagoPct}%"></span></div></td>
                <td class="${l.vencido ? 'text-danger font-bold' : 'text-muted'}">${l.vencido ? Utils.formatCurrency(l.vencido) : '—'}</td>
                <td><span class="badge ${l.status === 'concluido' ? 'badge-green' : l.status === 'em_andamento' ? 'badge-blue' : 'badge-gray'}">${Utils.escHtml((l.status || '').replace('_', ' '))}</span></td>
                <td><div class="tbl-actions">
                  <button class="btn btn-xs btn-secondary" onclick="Financeiro.detalheServico('${l.id}')" title="Ver o detalhado deste total">🔍</button>
                  <button class="btn btn-xs btn-primary" onclick="Projetos.view('${l.id}','financeiro')" title="Abrir o financeiro do serviço">💰</button>
                </div></td>
              </tr>`;
            }).join('')}</tbody>
            <tfoot><tr style="border-top:2px solid var(--border);font-weight:700">
              <td colspan="2">Total de ${linhas.length} serviço(s)</td>
              <td>${Utils.formatCurrency(tot.contratada)}</td>
              <td class="text-danger">${Utils.formatCurrency(tot.custo)}</td>
              <td class="text-danger">${Utils.formatCurrency(tot.comissao)}</td>
              <td>${margemTot != null ? Utils.formatCurrency(lucroReal) : '—'}</td>
              <td>${margemTot != null ? margemTot + '%' : '—'}</td>
              <td>${Utils.formatCurrency(tot.recebido)}</td>
              <td class="${tot.vencido ? 'text-danger' : ''}">${Utils.formatCurrency(tot.vencido)}</td>
              <td colspan="2"></td>
            </tr></tfoot>
          </table>`}
        </div>
      </div>`;
  }

  /* O detalhado por trás do total: de onde saiu cada real do custo. */
  function detalheServico(projetoId) {
    const p = DB.get('projetos', projetoId);
    if (!p) return;
    const l = FinNucleo.linhaServico(p);
    const itens = l.custo.itens;
    const grupos = { direto: 'Custos diretos', horas: 'Mão de obra', comissao: 'Comissões e parcerias' };
    Modal.open({
      title: '🔍 Detalhado — ' + Utils.escHtml(Utils.truncate(p.titulo, 40)),
      size: 'modal-lg',
      saveLabel: null,
      cancelLabel: 'Fechar',
      body: `
        <div class="detail-grid mb-4">
          <div class="detail-field"><div class="detail-label">Receita contratada</div><div class="detail-value font-bold">${Utils.formatCurrency(l.contratada)}</div></div>
          <div class="detail-field"><div class="detail-label">Custo total</div><div class="detail-value font-bold text-danger">${Utils.formatCurrency(l.custoTotal)}</div></div>
          <div class="detail-field"><div class="detail-label">Lucro</div><div class="detail-value font-bold">${l.temCusto ? Utils.formatCurrency(l.lucro) : '—'}</div></div>
          <div class="detail-field"><div class="detail-label">Margem</div><div class="detail-value font-bold" style="color:${FinNucleo.corDaMargem(l.margemPct)}">${l.temCusto ? l.margemPct + '%' : 'sem custo'}</div></div>
        </div>
        ${itens.length === 0 ? `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Nenhum custo lançado</div>
          <div class="empty-sub">Enquanto não houver custo, este serviço aparece com 100% de margem — o que não é verdade.</div></div>` : `
        <table class="tbl">
          <thead><tr><th>Grupo</th><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>Data</th><th>Valor</th><th>Pagamento</th></tr></thead>
          <tbody>${['direto', 'horas', 'comissao'].map(g => {
            const doGrupo = itens.filter(i => i.grupo === g);
            if (!doGrupo.length) return '';
            const soma = doGrupo.reduce((s, i) => s + i.valor, 0);
            return doGrupo.map((i, idx) => `<tr>
              ${idx === 0 ? `<td rowspan="${doGrupo.length}" class="font-semibold text-xs" style="vertical-align:top">${grupos[g]}<div class="text-xs text-muted">${Utils.formatCurrency(soma)}</div></td>` : ''}
              <td class="text-sm">${Utils.escHtml(i.descricao)}</td>
              <td class="text-xs text-muted">${Utils.escHtml(i.categoria || '—')}</td>
              <td class="text-xs">${Utils.escHtml(i.fornecedor || '—')}</td>
              <td class="text-xs">${i.data ? Utils.formatDate(i.data) : '—'}</td>
              <td class="font-semibold">${Utils.formatCurrency(i.valor)}</td>
              <td class="text-xs">${i.espelhado ? '<span class="badge badge-blue" title="Existe uma conta a pagar com este valor, só para controlar quando e a quem pagar. O valor não é somado duas vezes.">em contas a pagar</span>' : '<span class="text-muted">só no serviço</span>'}</td>
            </tr>`).join('');
          }).join('')}</tbody>
          <tfoot><tr style="border-top:2px solid var(--border);font-weight:700">
            <td colspan="5">Total</td><td>${Utils.formatCurrency(l.custoTotal)}</td><td></td>
          </tr></tfoot>
        </table>`}
        <div class="text-xs text-muted mt-3">
          Os itens acima vivem dentro do serviço. No financeiro geral entra apenas o total,
          para a visão da empresa não virar uma lista de centenas de despesas.
        </div>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-sm btn-primary" onclick="Modal.close();Projetos.view('${projetoId}','financeiro')">Abrir o financeiro do serviço</button>
        </div>`,
    });
  }

  /* =========================================================
     CONSISTÊNCIA — o que não fecha
  ========================================================= */
  function buildConsistencia() {
    if (typeof FinNucleo === 'undefined') {
      return '<div class="card"><div class="card-body text-muted">Núcleo financeiro não carregado.</div></div>';
    }
    const achados = FinNucleo.consistencia();
    if (!achados.length) {
      return `<div class="card"><div class="card-body">
        <div class="empty-state">
          <div class="empty-icon">✅</div>
          <div class="empty-title">Nada fora de lugar</div>
          <div class="empty-sub">Não encontrei receita em duplicidade, serviço sem custo, conta de serviço vencida
            nem valor com cara de erro de digitação.</div>
        </div></div></div>`;
    }
    const cor = { alta: 'var(--ruim-txt)', media: '#d97706', baixa: 'var(--info-txt)' };
    const rotulo = { alta: 'Resolver primeiro', media: 'Vale olhar', baixa: 'Quando der' };
    const nAlta = achados.filter(a => a.gravidade === 'alta').length;

    return `
      <div class="ficha-aviso">
        Esta varredura compara o dinheiro que está em mais de um lugar e procura o que não fecha.
        Nada é corrigido automaticamente: cada item diz o que fazer e você decide.
        ${nAlta ? `<strong>${nAlta} ponto(s) pedem atenção agora.</strong>` : ''}
      </div>
      ${achados.map((a, i) => `
      <div class="card mb-4 cons-card" style="--cc:${cor[a.gravidade]}">
        <div class="card-header">
          <div>
            <span class="cons-tag" style="background:${cor[a.gravidade]}">${rotulo[a.gravidade]}</span>
            <span class="card-title" style="margin-left:8px">${Utils.escHtml(a.titulo)}</span>
          </div>
          ${a.itens.length > 6 ? `<button class="btn btn-xs btn-ghost" onclick="Financeiro.toggleCons(${i})">${_consAberto[i] ? 'Ocultar' : 'Ver os ' + a.itens.length}</button>` : ''}
        </div>
        <div class="card-body">
          <p class="text-sm mb-2">${Utils.escHtml(a.detalhe)}</p>
          <p class="text-sm" style="color:var(--info-txt)"><strong>O que fazer:</strong> ${Utils.escHtml(a.acao)}</p>
          ${a.itens.length ? `<div class="cons-itens">
            ${(a.itens.length > 6 && !_consAberto[i] ? a.itens.slice(0, 6) : a.itens).map(it => `
              <div class="cons-item">
                <div>
                  <div class="text-sm font-semibold">${Utils.escHtml(it.texto)}</div>
                  ${it.sub ? `<div class="text-xs text-muted">${Utils.escHtml(it.sub)}</div>` : ''}
                </div>
                ${_botaoIr(it)}
              </div>`).join('')}
            ${a.itens.length > 6 && !_consAberto[i] ? `<div class="text-xs text-muted mt-1">e mais ${a.itens.length - 6}…</div>` : ''}
          </div>` : ''}
        </div>
      </div>`).join('')}`;
  }

  function _botaoIr(it) {
    const destinos = {
      servico:     `Projetos.view('${it.id}','financeiro')`,
      lancamento:  `Financeiro.editLanc('${it.id}')`,
      receber:     `Financeiro.editRecebivel('${it.id}')`,
      pagar:       `Financeiro.setTab('pagar')`,
      funcionario: `FuncionarioFicha.abrir('${it.id}')`,
    };
    const acao = destinos[it.ir];
    if (!acao) return '';
    return `<button class="btn btn-xs btn-secondary" onclick="${acao}">Abrir</button>`;
  }

  function toggleCons(i) { _consAberto[i] = !_consAberto[i]; renderTab(); }

  /* Graficos pela mesma fonte do DRE. Antes somavam `lancamentos` direto, o
     que mostrava um numero na Visao Geral e outro no DRE para o mesmo mes. */
  function _ultimos6(){
    const r=[],d=new Date();
    for(let i=5;i>=0;i--){const dt=new Date(d.getFullYear(),d.getMonth()-i,1);r.push(Utils.localDateStr(dt).substring(0,7));}
    return r;
  }
  function _rotulos(meses){
    return meses.map(m=>{const[,mo]=m.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo,10)-1];});
  }
  function renderCharts() {
    if (typeof FinNucleo === 'undefined') return;
    const meses=_ultimos6(), lbs=_rotulos(meses);
    Charts.bar({containerId:'chartRecDesp',height:190,showValues:false,
      data:lbs.map((l,i)=>{
        const c=FinNucleo.consolidado({de:meses[i]+'-01',ate:meses[i]+'-31',regime:'caixa'});
        return {label:l,value:c.receitaBruta,color:'#10b981'};
      })});
  }
  function renderDREChart() {
    if (typeof FinNucleo === 'undefined') return;
    const meses=_ultimos6(), lbs=_rotulos(meses);
    Charts.bar({containerId:'chartDRE',height:190,showValues:false,
      data:lbs.map((l,i)=>{
        const c=FinNucleo.consolidado({de:meses[i]+'-01',ate:meses[i]+'-31',regime:_regime});
        return {label:l,value:c.resultado,color:c.resultado>=0?'#10b981':'#dc2626'};
      })});
  }
  function renderFluxoChart() {
    const meses=_mesesFluxo(),lanc=DB.getAll('lancamentos');
    const hoje=Utils.todayStr().substring(0,7);
    const lbs=meses.map(m=>{const[,mo]=m.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo)-1];});
    Charts.bar({containerId:'chartFluxo',data:lbs.map((l,i)=>{const proj=_projecaoMes(meses[i],hoje);const e=lanc.filter(x=>x.tipo==='receita'&&x.data?.startsWith(meses[i])).reduce((s,x)=>s+x.valor,0)+proj.e;const s=lanc.filter(x=>x.tipo==='despesa'&&x.data?.startsWith(meses[i])).reduce((s,x)=>s+x.valor,0)+proj.s+_despFixaProjMes(meses[i]).total;return{label:l,value:e-s,color:e-s>=0?'#10b981':'#dc2626'};}),height:190,showValues:false});
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
  function limparFiltros(){_filtLanc={tipo:'',categoria:'',status:'',busca:'',mesInicio:'',mesFim:'',origem:''};renderTab();}
  function setFiltPagar(k,v){_filtPagar[k]=v;renderTab();}
  function setDreMes(v){_dremes=v;renderTab();}
  function setRegime(r){_regime=r;renderTab();}
  function toggleDre(k){_dreAberto[k]=!_dreAberto[k];renderTab();}
  function setFiltServ(k,v){_filtServ[k]=v;renderTab();if(k==='busca'){const i=document.querySelector('#finContent input[placeholder^="Buscar servi"]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}}
  function limparFiltServ(){_filtServ={status:'',busca:'',semCusto:false};renderTab();}

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
  /* Pergunta a data em que o dinheiro realmente entrou ou saiu.
     Antes o lançamento nascia sempre com a data de hoje, sem perguntar: uma
     parcela vencida em 15/09 marcada como recebida em 07/11 ia para a receita
     de novembro. Isso inflava o mês corrente e esvaziava os anteriores, e era
     a causa do "resultado do mês não bate". */
  function _pedirData(titulo, cb){
    const hoje = Utils.todayStr();
    Modal.open({
      title: titulo,
      body: `
        <div class="form-group">
          <label class="form-label">Data em que o dinheiro entrou ou saiu</label>
          <input class="form-control" type="date" id="finDataReal" value="${hoje}" max="${hoje}">
          <div class="text-xs text-muted" style="margin-top:4px">
            É esta data que vai para o DRE e para o resultado do mês. Vem com hoje;
            mude se o pagamento aconteceu em outro dia.
          </div>
        </div>`,
      saveLabel: 'Confirmar',
      saveCb: () => {
        const d = document.getElementById('finDataReal')?.value || hoje;
        Modal.close();
        cb(d);
      },
    });
  }

  /* Avisa quando já existe lançamento igual por perto. Não bloqueia: parcela
     mensal de mesmo valor é legítima. Existe porque dois caminhos diferentes
     (recebível e financeiro do projeto) gravavam o mesmo dinheiro duas vezes. */
  function _pareceDuplicata(tipo, valor, data){
    const alvo = new Date(data + 'T00:00:00');
    return DB.getAll('lancamentos').filter(l => {
      if (l.tipo !== tipo) return false;
      if (Math.abs((Number(l.valor) || 0) - valor) > 0.009) return false;
      if (!l.data) return false;
      const d = new Date(l.data + 'T00:00:00');
      return Math.abs((d - alvo) / 86400000) <= 7;
    });
  }

  function _confirmarSeDuplicata(tipo, valor, data, seguir){
    const iguais = _pareceDuplicata(tipo, valor, data);
    if (!iguais.length) { seguir(); return; }
    const l = iguais[0];
    Confirm.show(
      'Já existe lançamento igual',
      `Encontrei ${iguais.length === 1 ? 'um lançamento' : iguais.length + ' lançamentos'} de `
        + `${Utils.formatCurrency(valor)} por volta de ${Utils.formatDate(l.data)} `
        + `("${Utils.truncate(l.descricao || '', 40)}"). Se for o mesmo dinheiro, cancele. Lançar assim mesmo?`,
      seguir
    );
  }

  /* Núcleo de "pagar 1 conta": usado tanto pelo pagamento individual quanto
     pela quitação em massa (openQuitarAteModal), pra manter sempre o mesmo
     efeito colateral (lançamento de despesa + geração da recorrência).
     dataReal: dia em que o dinheiro saiu. Na quitação em massa é perguntado
     uma vez e vale para todas. */
  function _quitarContaCore(id, obsExtra, dataReal){
    const p=DB.get('contaspagar',id);if(!p||p.status==='pago')return false;
    const dtPag=dataReal||Utils.todayStr();
    DB.update('contaspagar',id,{status:'pago',dataPagamento:dtPag,observacoes:obsExtra?(p.observacoes?p.observacoes+' · ':'')+obsExtra:p.observacoes});
    // Cria lançamento de despesa para alimentar KPIs, DRE e relatórios
    DB.create('lancamentos',{
      tipo:'despesa',categoria:p.categoria||'Outros',
      descricao:p.descricao||p.fornecedor||'Pagamento',
      valor:p.valor,data:dtPag,status:'pago',
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
      }
    }
    return true;
  }
  function pagarConta(id){
    const p=DB.get('contaspagar',id);
    if(!p||p.status==='pago')return;
    _pedirData('💸 Pagar: '+Utils.truncate(p.fornecedor||p.descricao||'conta',35), (dt)=>{
      _confirmarSeDuplicata('despesa', Number(p.valor)||0, dt, ()=>{
        if(!_quitarContaCore(id,'',dt))return;
        Toast.success('Conta paga e lançamento registrado em '+Utils.formatDate(dt));
        renderTab();
      });
    });
  }
  function deleteContaPagar(id){Utils.confirmDelete('esta conta a pagar',()=>{DB.remove('contaspagar',id);Toast.success('Removida');renderTab();});}

  /* ---- Quitação em massa (reorganização do início de ciclo, ex.: fechar tudo até Julho/2026) ---- */
  function _pendentesAte(mes){
    return DB.getAll('contaspagar').filter(c=>c.status==='pendente'&&(c.vencimento||'')<=(mes+'-31'));
  }
  function openQuitarAteModal(){
    const mesDefault=Utils.todayStr().substring(0,7);
    Modal.open({
      title: '🧹 Quitar Pendências Até um Mês de Corte',
      body: `
        <p class="text-sm text-muted mb-3">Marca como <b>pago</b> todas as contas a pagar pendentes com vencimento até o mês selecionado (gera o lançamento de despesa correspondente para cada uma) — use para fechar de uma vez as pendências antigas ao iniciar um novo ciclo financeiro.</p>
        <div class="form-group"><label class="form-label">Quitar tudo até (mês/ano)</label><input type="month" class="form-control" id="qtMes" value="${mesDefault}" onchange="Financeiro._atualizarPreviaQuitar()"></div>
        <div class="form-group"><label class="form-label">Data do acerto</label>
          <input type="date" class="form-control" id="qtData" value="${Utils.todayStr()}" max="${Utils.todayStr()}">
          <div class="text-xs text-muted" style="margin-top:4px">Data que vai para o DRE em todos os lançamentos gerados aqui.</div>
        </div>
        <div id="qtPreview" class="text-sm text-muted mt-2"></div>`,
      saveCb: () => {
        const mes=document.getElementById('qtMes').value;
        if(!mes){Toast.error('Selecione o mês');return;}
        const pend=_pendentesAte(mes);
        if(pend.length===0){Toast.warning('Nenhuma conta pendente até esse mês.');Modal.close();return;}
        // Data do acerto perguntada uma vez e aplicada a todas: antes cada
        // lançamento nascia com a data de hoje, jogando pagamento antigo no mês corrente
        const dtAcerto=document.getElementById('qtData')?.value||Utils.todayStr();
        let count=0;
        pend.forEach(c=>{ if(_quitarContaCore(c.id,'Quitado no acerto de saldo até '+mes, dtAcerto)) count++; });
        Toast.success(`✅ ${count} conta(s) marcada(s) como paga(s) e lançada(s)`);
        Modal.close(); renderTab(); if(typeof App!=='undefined')App.updateNotifBadge();
      }
    });
    setTimeout(_atualizarPreviaQuitar,50);
  }
  function _atualizarPreviaQuitar(){
    const mes=document.getElementById('qtMes')?.value; if(!mes)return;
    const pend=_pendentesAte(mes);
    const tot=pend.reduce((s,c)=>s+c.valor,0);
    const el=document.getElementById('qtPreview');
    if(el)el.innerHTML = pend.length ? `<b>${pend.length}</b> conta(s) pendente(s), totalizando <b>${Utils.formatCurrency(tot)}</b>, serão marcadas como pagas.` : 'Nenhuma conta pendente até esse mês.';
  }

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
    const totalInformado=Utils.parseMoney(document.getElementById('frTotal').value)||0;
    const somaParcelas=parcelas.reduce((s,p)=>s+(Number(p.valor)||0),0);
    /* Antes: dava para salvar "Valor Total = 13.000" com as parcelas em branco.
       O recebível parecia certo na lista (que mostra o total), mas TODO o resto
       do sistema — "A Receber", Dashboard, Fluxo de Caixa — soma as PARCELAS,
       então o dinheiro simplesmente sumia. Agora o total se distribui nas
       parcelas quando elas vierem zeradas, e avisamos se não bater. */
    if(totalInformado>0 && somaParcelas===0 && parcelas.length>0){
      const base=Math.floor((totalInformado/parcelas.length)*100)/100;
      let acum=0;
      parcelas.forEach((p,i)=>{
        p.valor = (i===parcelas.length-1) ? Math.round((totalInformado-acum)*100)/100 : base;
        acum += p.valor;
      });
      Toast.warning(`Parcelas estavam sem valor — distribuí ${Utils.formatCurrency(totalInformado)} em ${parcelas.length}x.`);
    } else if(totalInformado>0 && somaParcelas>0 && Math.abs(totalInformado-somaParcelas)>0.01){
      Toast.warning(`Atenção: soma das parcelas (${Utils.formatCurrency(somaParcelas)}) difere do valor total (${Utils.formatCurrency(totalInformado)}).`);
    }
    const data={descricao:desc,clienteId:document.getElementById('frCliente').value,valorTotal:totalInformado||parcelas.reduce((s,p)=>s+(Number(p.valor)||0),0),parcelas};
    if(id){DB.update('recebiveis',id,data);Toast.success('Atualizado');}else{DB.create('recebiveis',data);Toast.success('Recebível criado');}
    Modal.close();renderTab();
  }
  function marcarRecebido(rId,pId){
    const r=DB.get('recebiveis',rId);if(!r)return;
    const parcela=(r.parcelas||[]).find(p=>p.id===pId);
    if(!parcela||!Utils.parcelaAberta(parcela))return;   // recebida ou cancelada: nada a fazer
    const valorParcela=Number(parcela.valor)||0;
    // Sem valor não há o que lançar — antes criava lançamento de R$ 0,00
    // poluindo o Financeiro e os relatórios.
    if(valorParcela<=0){
      Toast.error('Esta parcela está sem valor. Edite o recebível e informe o valor antes de marcar como recebida.');
      return;
    }
    // Guarda contra o mesmo dinheiro entrar duas vezes: se já existe lançamento
    // amarrado a esta parcela, não cria outro. Era por aqui que o recebível e o
    // financeiro do projeto lançavam a mesma entrada em duplicidade.
    const jaLancada=DB.getAll('lancamentos').some(l=>l.parcelaId===pId&&l.recebivelId===rId);
    if(jaLancada){
      Toast.warning('Esta parcela já tem lançamento no financeiro. Nada foi duplicado.');
      return;
    }

    _pedirData('💰 Receber: '+Utils.truncate(r.descricao||'parcela',35), (dt)=>{
      _confirmarSeDuplicata('receita', valorParcela, dt, ()=>{
        DB.update('recebiveis',rId,{parcelas:(r.parcelas||[]).map(p=>p.id===pId?{...p,status:'recebido',dataPagamento:dt}:p)});
        // Cria lançamento de receita para alimentar KPIs, DRE e relatórios
        DB.create('lancamentos',{
          tipo:'receita',categoria:'Serviços de Engenharia',
          descricao:(r.descricao||'Recebimento')+' — Parcela',
          valor:valorParcela,data:dt,status:'recebido',
          clienteId:r.clienteId||'',recebivelId:rId,parcelaId:pId,
          observacoes:'Criado automaticamente ao receber parcela do recebível.',
        });
        Toast.success('Parcela recebida e lançamento registrado em '+Utils.formatDate(dt));
        renderTab();
      });
    });
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
          if (Utils.parcelaAberta(p) && p.vencimento >= hoje) {
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
          if (Utils.parcelaAberta(p) && p.vencimento < hoje) {
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
        <table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px">
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

  return {render,setTab,setFiltLanc,setRegime,setFiltServ,limparFiltServ,toggleDre,toggleCons,detalheServico,limparFiltros,setFiltPagar,setDreMes,novoLancamento,novaDespesa,editLanc,marcarPago,deleteLanc,novoRecebivel,editRecebivel,marcarRecebido,addParcela,deleteRecebivel,novaContaPagar,editContaPagar,pagarConta,deleteContaPagar,_trocarTipo,_addPF,addNew,drillDown,openFormDespFixa,toggleDespFixa,deleteDespFixa,gerarContasDoMes,openFormDivida,deleteDivida,pagarParcelaDivida,openFormAtivo,deleteAtivo,openQuitarAteModal,_atualizarPreviaQuitar,openSaldoInicial};
})();
