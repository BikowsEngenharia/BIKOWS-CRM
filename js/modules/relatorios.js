/* ==========================================
   RELATÓRIOS — Análise e indicadores
   ========================================== */
const Relatorios = (() => {

  let _tab = 'comercial';

  function render() {
    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Relatórios</h2>
        <div class="sec-actions">
          <button class="btn btn-secondary" onclick="window.print()">🖨 Imprimir</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${_tab==='comercial'?'active':''}" onclick="Relatorios.setTab('comercial')">📊 Comercial</button>
        <button class="tab-btn ${_tab==='financeiro'?'active':''}" onclick="Relatorios.setTab('financeiro')">💰 Financeiro</button>
        <button class="tab-btn ${_tab==='operacional'?'active':''}" onclick="Relatorios.setTab('operacional')">🔧 Operacional</button>
        <button class="tab-btn ${_tab==='clientes'?'active':''}" onclick="Relatorios.setTab('clientes')">🏢 Clientes</button>
      </div>
      <div id="relContent">${renderTab()}</div>
    `;

    renderCharts();
  }

  function setTab(tab) {
    _tab = tab;
    render();
  }

  function renderTab() {
    if (_tab === 'comercial') return renderComercial();
    if (_tab === 'financeiro') return renderFinanceiro();
    if (_tab === 'operacional') return renderOperacional();
    if (_tab === 'clientes') return renderClientesTab();
    return '';
  }

  function renderComercial() {
    const leads = DB.getAll('leads');
    const ganhos = leads.filter(l => l.status === 'fechado_ganho');
    const perdidos = leads.filter(l => l.status === 'fechado_perdido');
    const ativos = leads.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
    const taxa = leads.length ? ((ganhos.length/leads.length)*100).toFixed(1) : 0;
    const ticketMedio = ganhos.length ? Utils.sum(ganhos,'valorFechado') / ganhos.length : 0;
    const byStatus = Utils.groupBy(leads, 'status');
    const byOrigem = Utils.groupBy(leads, 'origemLead');
    const bySegmento = Utils.groupBy(leads, 'segmento');
    const byResp = Utils.groupBy(leads, 'responsavel');
    const byMotivo = Utils.groupBy(perdidos, 'motivoPerda');

    return `
      <div class="kpi-grid mb-4">
        <div class="kpi-card" style="--kpi-color:#1a56db"><div class="kpi-label">Total de Leads</div><div class="kpi-value">${leads.length}</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Taxa de Conversão</div><div class="kpi-value">${taxa}%</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b"><div class="kpi-label">Ticket Médio</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(ticketMedio)}</div></div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6"><div class="kpi-label">Pipeline Ativo</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(Utils.sum(ativos,'valorEstimado'))}</div></div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Leads por Status</div></div>
          <div class="card-body"><div id="rChartStatus"></div></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Origem dos Leads</div></div>
          <div class="card-body"><div id="rChartOrigem"></div></div>
        </div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Performance por Responsável</div></div>
          <div class="card-body">
            <table class="tbl">
              <thead><tr><th>Responsável</th><th>Total Leads</th><th>Ganhos</th><th>Tx. Conversão</th><th>Valor Fechado</th></tr></thead>
              <tbody>
                ${Object.entries(byResp).map(([resp, rLeads]) => {
                  const rGanhos = rLeads.filter(l=>l.status==='fechado_ganho');
                  const tx = ((rGanhos.length/rLeads.length)*100).toFixed(0);
                  return `<tr>
                    <td class="font-bold">${Utils.escHtml(resp||'N/D')}</td>
                    <td>${rLeads.length}</td>
                    <td><span class="badge badge-green">${rGanhos.length}</span></td>
                    <td>${tx}%</td>
                    <td class="font-bold text-primary">${Utils.formatCurrency(Utils.sum(rGanhos,'valorFechado'))}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Motivos de Perda</div></div>
          <div class="card-body">
            ${perdidos.length === 0 ? '<div class="empty-state"><div class="empty-sub">Nenhum lead perdido</div></div>' :
            `<table class="tbl">
              <thead><tr><th>Motivo</th><th>Qtd</th><th>% do Total Perdido</th></tr></thead>
              <tbody>
                ${Object.entries(byMotivo).sort((a,b)=>b[1].length-a[1].length).map(([motivo, list]) => `<tr>
                  <td>${Utils.escHtml(motivo||'N/D')}</td>
                  <td>${list.length}</td>
                  <td><div class="progress" style="min-width:80px"><div class="progress-fill" style="width:${(list.length/perdidos.length*100).toFixed(0)}%;background:var(--danger)"></div></div></td>
                </tr>`).join('')}
              </tbody>
            </table>`}
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><div class="card-title">Leads por Segmento</div></div>
        <div class="card-body">
          <table class="tbl">
            <thead><tr><th>Segmento</th><th>Total</th><th>Ativos</th><th>Ganhos</th><th>Valor Estimado</th><th>Valor Fechado</th></tr></thead>
            <tbody>
              ${Object.entries(bySegmento).sort((a,b)=>b[1].length-a[1].length).map(([seg, sLeads]) => {
                const sAtivos = sLeads.filter(l=>!['fechado_ganho','fechado_perdido'].includes(l.status));
                const sGanhos = sLeads.filter(l=>l.status==='fechado_ganho');
                return `<tr>
                  <td><span class="badge badge-blue">${Utils.escHtml(seg)}</span></td>
                  <td>${sLeads.length}</td>
                  <td>${sAtivos.length}</td>
                  <td>${sGanhos.length}</td>
                  <td>${Utils.formatCurrency(Utils.sum(sAtivos,'valorEstimado'))}</td>
                  <td class="font-bold text-success">${Utils.formatCurrency(Utils.sum(sGanhos,'valorFechado'))}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderFinanceiro() {
    const recebiveis = DB.getAll('recebiveis');
    let totalRecebido = 0, totalPendente = 0, totalVencido = 0;
    recebiveis.forEach(r => {
      (r.parcelas||[]).forEach(p => {
        if (p.status==='recebido') totalRecebido += p.valor;
        else if (Utils.isOverdue(p.vencimento)) totalVencido += p.valor;
        else totalPendente += p.valor;
      });
    });
    const totalGeral = totalRecebido + totalPendente + totalVencido;
    const txRecebimento = totalGeral > 0 ? ((totalRecebido/totalGeral)*100).toFixed(1) : 0;

    const leads = DB.getAll('leads');
    const ganhos = leads.filter(l => l.status === 'fechado_ganho');
    const perdidos = leads.filter(l => l.status === 'fechado_perdido');
    const receitaFechada = Utils.sum(ganhos, 'valorFechado');

    return `
      <div class="kpi-grid mb-4">
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Recebido</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalRecebido)}</div><div class="kpi-sub">${txRecebimento}% do total</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444"><div class="kpi-label">Inadimplente</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalVencido)}</div><div class="kpi-icon">⚠</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b"><div class="kpi-label">A Vencer</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalPendente)}</div></div>
        <div class="kpi-card" style="--kpi-color:#1a56db"><div class="kpi-label">Receita Negócios Ganhos</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(receitaFechada)}</div></div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><div class="card-title">Situação dos Recebíveis</div></div>
        <div class="card-body"><div id="rChartReceb"></div></div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><div class="card-title">Recebíveis por Cliente</div></div>
        <div class="card-body">
          <table class="tbl">
            <thead><tr><th>Cliente</th><th>Total Contrato</th><th>Recebido</th><th>Pendente</th><th>Vencido</th><th>% Recebido</th></tr></thead>
            <tbody>
              ${recebiveis.map(r => {
                const cliente = DB.get('clientes', r.clienteId);
                let rec = 0, pend = 0, venc = 0;
                (r.parcelas||[]).forEach(p => {
                  if (p.status==='recebido') rec += p.valor;
                  else if (Utils.isOverdue(p.vencimento)) venc += p.valor;
                  else pend += p.valor;
                });
                const total = rec + pend + venc;
                const pct = total > 0 ? Math.round(rec/total*100) : 0;
                return `<tr>
                  <td><div class="font-bold">${Utils.escHtml(cliente?.nome||'—')}</div><div class="text-xs text-muted">${Utils.escHtml(r.descricao||'')}</div></td>
                  <td>${Utils.formatCurrency(total)}</td>
                  <td class="text-success font-bold">${Utils.formatCurrency(rec)}</td>
                  <td class="text-warning">${Utils.formatCurrency(pend)}</td>
                  <td class="text-danger">${venc > 0 ? Utils.formatCurrency(venc) : '—'}</td>
                  <td><div class="progress" style="min-width:80px"><div class="progress-fill" style="width:${pct}%"></div></div> ${pct}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderOperacional() {
    const projetos = DB.getAll('projetos');
    const atividades = DB.getAll('atividades');

    const statusGroups = Utils.groupBy(projetos, 'status');
    const atrasados = projetos.filter(p => p.status==='em_andamento' && Utils.isOverdue(p.prazo));

    return `
      <div class="kpi-grid mb-4">
        <div class="kpi-card" style="--kpi-color:#3b82f6"><div class="kpi-label">Em Andamento</div><div class="kpi-value">${projetos.filter(p=>p.status==='em_andamento').length}</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444"><div class="kpi-label">Atrasados</div><div class="kpi-value">${atrasados.length}</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Concluídos</div><div class="kpi-value">${projetos.filter(p=>p.status==='concluido').length}</div></div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6"><div class="kpi-label">Valor Ativo</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(Utils.sum(projetos.filter(p=>p.status==='em_andamento'),'valor'))}</div></div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Status dos Projetos</div></div>
          <div class="card-body"><div id="rChartProjStatus"></div></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Atividades por Status</div></div>
          <div class="card-body"><div id="rChartAtivStatus"></div></div>
        </div>
      </div>

      ${atrasados.length > 0 ? `<div class="card mb-4">
        <div class="card-header"><div class="card-title" style="color:var(--danger)">⚠ Projetos Atrasados</div></div>
        <div class="card-body">
          <table class="tbl">
            <thead><tr><th>Projeto</th><th>Cliente</th><th>Responsável</th><th>Prazo</th><th>Atraso</th><th>Valor</th></tr></thead>
            <tbody>
              ${atrasados.map(p => {
                const dias = Math.abs(Utils.daysUntil(p.prazo));
                return `<tr>
                  <td class="font-bold">${Utils.escHtml(p.titulo)}</td>
                  <td>${Utils.escHtml(Utils.getClientName(p.clienteId))}</td>
                  <td>${Utils.escHtml(p.responsavel||'—')}</td>
                  <td class="text-danger">${Utils.formatDate(p.prazo)}</td>
                  <td><span class="badge badge-red">${dias} dias</span></td>
                  <td>${Utils.formatCurrency(p.valor)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  }

  function renderClientesTab() {
    const clientes = DB.getAll('clientes');
    const leads = DB.getAll('leads');
    const projetos = DB.getAll('projetos');

    const bySegmento = Utils.groupBy(clientes, 'segmento');
    const byEstado = Utils.groupBy(clientes.filter(c=>c.estado), 'estado');

    return `
      <div class="stats-row mb-4">
        <div class="stat-box"><div class="stat-val">${clientes.length}</div><div class="stat-lbl">Total de Clientes</div></div>
        <div class="stat-box"><div class="stat-val">${clientes.filter(c=>c.ativo!==false).length}</div><div class="stat-lbl">Ativos</div></div>
        <div class="stat-box"><div class="stat-val">${Object.keys(bySegmento).length}</div><div class="stat-lbl">Segmentos</div></div>
        <div class="stat-box"><div class="stat-val">${Object.keys(byEstado).length}</div><div class="stat-lbl">Estados</div></div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Clientes por Segmento</div></div>
          <div class="card-body"><div id="rChartCliSeg"></div></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Clientes por Estado</div></div>
          <div class="card-body">
            <table class="tbl">
              <thead><tr><th>Estado</th><th>Clientes</th><th>%</th></tr></thead>
              <tbody>
                ${Object.entries(byEstado).sort((a,b)=>b[1].length-a[1].length).slice(0,10).map(([estado, list]) =>
                  `<tr><td class="font-bold">${estado}</td><td>${list.length}</td><td><div class="progress"><div class="progress-fill" style="width:${(list.length/clientes.length*100).toFixed(0)}%"></div></div></td></tr>`
                ).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Top Clientes por Receita</div></div>
        <div class="card-body">
          <table class="tbl">
            <thead><tr><th>Cliente</th><th>Segmento</th><th>Leads</th><th>Projetos</th><th>Receita Fechada</th></tr></thead>
            <tbody>
              ${clientes.map(c => {
                const cLeads = leads.filter(l=>l.clienteId===c.id);
                const cGanhos = cLeads.filter(l=>l.status==='fechado_ganho');
                const cProj = projetos.filter(p=>p.clienteId===c.id).length;
                return { c, receita: Utils.sum(cGanhos,'valorFechado'), leads: cLeads.length, proj: cProj };
              }).sort((a,b)=>b.receita-a.receita).slice(0,10).map(({c,receita,leads:lc,proj}) =>
                `<tr>
                  <td class="font-bold">${Utils.escHtml(c.nome)}</td>
                  <td>${c.segmento?`<span class="badge badge-blue">${c.segmento}</span>`:'—'}</td>
                  <td>${lc}</td>
                  <td>${proj}</td>
                  <td class="font-bold text-success">${receita > 0 ? Utils.formatCurrency(receita) : '—'}</td>
                </tr>`
              ).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderCharts() {
    const leads = DB.getAll('leads');
    const projetos = DB.getAll('projetos');
    const atividades = DB.getAll('atividades');
    const recebiveis = DB.getAll('recebiveis');

    if (_tab === 'comercial') {
      const byStatus = Utils.groupBy(leads, 'status');
      Charts.bar({
        containerId: 'rChartStatus',
        data: Object.entries(Utils.LEAD_STATUS).map(([k,v]) => ({
          label: v.label.replace(/[^a-zA-Záéíóúãõ ]/g,'').trim().slice(0,10),
          value: (byStatus[k]||[]).length,
          color: v.color,
        })).filter(d => d.value > 0),
        height: 200,
      });

      const byOrigem = Utils.groupBy(leads, 'origemLead');
      Charts.donut({
        containerId: 'rChartOrigem',
        data: Object.entries(byOrigem).map(([k,v]) => ({ label: k||'N/D', value: v.length })),
        size: 160,
      });
    }

    if (_tab === 'financeiro') {
      let r = 0, p = 0, v = 0;
      recebiveis.forEach(rec => (rec.parcelas||[]).forEach(parc => {
        if (parc.status==='recebido') r+=parc.valor;
        else if (Utils.isOverdue(parc.vencimento)) v+=parc.valor;
        else p+=parc.valor;
      }));
      Charts.donut({
        containerId: 'rChartReceb',
        data: [{ label:'Recebido',value:r,color:'#10b981'},{label:'A Vencer',value:p,color:'#f59e0b'},{label:'Vencido',value:v,color:'#ef4444'}].filter(d=>d.value>0),
        size: 160,
      });
    }

    if (_tab === 'operacional') {
      const byProj = Utils.groupBy(projetos, 'status');
      Charts.donut({
        containerId: 'rChartProjStatus',
        data: Object.entries(Utils.PROJ_STATUS).map(([k,v]) => ({ label: v.label, value: (byProj[k]||[]).length })).filter(d=>d.value>0),
        size: 160,
      });

      const byAtiv = Utils.groupBy(atividades, 'status');
      Charts.donut({
        containerId: 'rChartAtivStatus',
        data: Object.entries(Utils.ATIV_STATUS).map(([k,v]) => ({ label: v.label, value: (byAtiv[k]||[]).length })).filter(d=>d.value>0),
        size: 160,
      });
    }

    if (_tab === 'clientes') {
      const clientes = DB.getAll('clientes');
      const bySegmento = Utils.groupBy(clientes, 'segmento');
      Charts.donut({
        containerId: 'rChartCliSeg',
        data: Object.entries(bySegmento).map(([k,v]) => ({ label: k||'N/D', value: v.length })),
        size: 160,
      });
    }
  }

  return { render, setTab };
})();
