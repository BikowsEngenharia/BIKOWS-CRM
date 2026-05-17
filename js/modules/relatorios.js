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
          <button class="btn btn-secondary" onclick="Relatorios.exportarCSV()">📥 Exportar CSV</button>
          <button class="btn btn-secondary" onclick="window.print()">🖨 Imprimir</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${_tab==='comercial'?'active':''}" onclick="Relatorios.setTab('comercial')">📊 Comercial</button>
        <button class="tab-btn ${_tab==='financeiro'?'active':''}" onclick="Relatorios.setTab('financeiro')">💰 Financeiro</button>
        <button class="tab-btn ${_tab==='operacional'?'active':''}" onclick="Relatorios.setTab('operacional')">🔧 Operacional</button>
        <button class="tab-btn ${_tab==='clientes'?'active':''}" onclick="Relatorios.setTab('clientes')">🏢 Clientes</button>
        <button class="tab-btn ${_tab==='licitacoes'?'active':''}" onclick="Relatorios.setTab('licitacoes')">🏛 Licitações</button>
        <button class="tab-btn ${_tab==='margem'?'active':''}" onclick="Relatorios.setTab('margem')">📊 Margem</button>
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
    if (_tab === 'licitacoes') return renderLicitacoesTab();
    if (_tab === 'margem') return renderMargemTab();
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

      <div class="card mb-4">
        <div class="card-header"><div class="card-title">📜 Status das ARTs por Projeto</div></div>
        <div class="card-body">
          <table class="tbl">
            <thead><tr><th>OS</th><th>Projeto</th><th>Cliente</th><th>ART Nº</th><th>Status ART</th><th>Engenheiro</th></tr></thead>
            <tbody>
              ${projetos.filter(p => p.status === 'em_andamento').map(p => {
                const artOk = p.art?.numero && p.art?.status === 'registrada';
                return `<tr>
                  <td class="text-xs font-bold" style="color:var(--primary)">${Utils.escHtml(p.ordemServico||'—')}</td>
                  <td class="font-bold text-sm">${Utils.escHtml(p.titulo)}</td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(p.clienteId))}</td>
                  <td class="text-sm">${p.art?.numero ? Utils.escHtml(p.art.numero) : '<span style="color:#ef4444">Sem ART</span>'}</td>
                  <td>${p.art?.status ? `<span class="badge ${artOk?'badge-green':'badge-yellow'}">${p.art.status}</span>` : '<span class="badge badge-red">pendente</span>'}</td>
                  <td class="text-sm">${Utils.escHtml(p.art?.engResponsavel||'—')}</td>
                </tr>`;
              }).join('') || '<tr><td colspan="6" class="text-muted text-center">Nenhum projeto em andamento</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
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

  function renderLicitacoesTab() {
    const lics = DB.getAll('licitacoes');
    const ganhou = lics.filter(l => l.status === 'ganhou');
    const perdeu = lics.filter(l => l.status === 'perdeu');
    const emAndamento = lics.filter(l => !['ganhou','perdeu','deserta','cancelada'].includes(l.status));
    const taxa = lics.length > 0 ? ((ganhou.length / lics.length)*100).toFixed(1) : 0;
    const valorGanho = ganhou.reduce((s,l) => s + (l.valorAdjudicado||l.valorProposta||0), 0);
    const valorDisputa = emAndamento.reduce((s,l) => s + (l.valorEstimado||0), 0);
    const valorPerdido = perdeu.reduce((s,l) => s + (l.valorEstimado||0), 0);

    // Agrupar por modalidade
    const byModalidade = {};
    lics.forEach(l => {
      const m = l.modalidade || 'Não informada';
      if (!byModalidade[m]) byModalidade[m] = { total:0, ganhou:0, perdeu:0, valor:0 };
      byModalidade[m].total++;
      if (l.status === 'ganhou') { byModalidade[m].ganhou++; byModalidade[m].valor += l.valorAdjudicado||l.valorProposta||0; }
      if (l.status === 'perdeu') byModalidade[m].perdeu++;
    });

    // Agrupar por status
    const byStatus = {};
    lics.forEach(l => { byStatus[l.status] = (byStatus[l.status]||0) + 1; });

    // Por mês (últimos 12 meses)
    const meses = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      meses[d.toISOString().substring(0,7)] = { label: Utils.monthLabel(-i), ganhou: 0, perdeu: 0, valor: 0 };
    }
    lics.forEach(l => {
      const m = l.dataAbertura?.substring(0,7);
      if (m && meses[m]) {
        if (l.status === 'ganhou') { meses[m].ganhou++; meses[m].valor += l.valorAdjudicado||l.valorProposta||0; }
        if (l.status === 'perdeu') meses[m].perdeu++;
      }
    });

    return `
      <div class="kpi-grid mb-4">
        <div class="kpi-card" style="--kpi-color:#0f766e"><div class="kpi-label">Em Disputa</div><div class="kpi-value">${emAndamento.length}</div><div class="kpi-sub">${Utils.formatCurrency(valorDisputa)}</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Ganhas</div><div class="kpi-value">${ganhou.length}</div><div class="kpi-sub">${Utils.formatCurrency(valorGanho)} adjudicado</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444"><div class="kpi-label">Perdidas</div><div class="kpi-value">${perdeu.length}</div><div class="kpi-sub">${Utils.formatCurrency(valorPerdido)} perdido</div></div>
        <div class="kpi-card" style="--kpi-color:#7c3aed"><div class="kpi-label">Taxa de Vitória</div><div class="kpi-value">${taxa}%</div><div class="kpi-sub">${lics.length} disputadas total</div></div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Por Modalidade</div></div>
          <div class="card-body">
            <table class="tbl">
              <thead><tr><th>Modalidade</th><th>Total</th><th>Ganhas</th><th>Perdidas</th><th>Taxa</th><th>Valor Ganho</th></tr></thead>
              <tbody>
                ${Object.entries(byModalidade).sort((a,b)=>b[1].total-a[1].total).map(([mod, d]) => {
                  const tx = d.total > 0 ? Math.round(d.ganhou/d.total*100) : 0;
                  const cor = tx >= 40 ? '#10b981' : tx >= 20 ? '#f59e0b' : '#ef4444';
                  return `<tr>
                    <td class="font-bold text-sm">${Utils.escHtml(mod)}</td>
                    <td style="text-align:center">${d.total}</td>
                    <td style="text-align:center;color:#10b981;font-weight:700">${d.ganhou}</td>
                    <td style="text-align:center;color:#ef4444">${d.perdeu}</td>
                    <td style="text-align:center;font-weight:700;color:${cor}">${tx}%</td>
                    <td class="text-primary font-bold">${d.valor > 0 ? Utils.formatCurrency(d.valor) : '—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Por Status</div></div>
          <div class="card-body">
            ${Object.entries(byStatus).map(([st, n]) => {
              const pct = Math.round(n/lics.length*100);
              const colors = { ganhou:'#10b981', perdeu:'#ef4444', deserta:'#94a3b8', cancelada:'#94a3b8', em_analise:'#3b82f6', identificada:'#64748b', habilitacao:'#7c3aed', proposta_preparando:'#d97706', proposta_enviada:'#ea580c', sessao_realizada:'#0891b2', recurso:'#ca8a04' };
              const cor = colors[st] || '#64748b';
              return `<div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                  <span class="text-sm">${st}</span>
                  <span class="text-sm font-bold">${n} (${pct}%)</span>
                </div>
                <div style="height:8px;background:var(--border);border-radius:99px">
                  <div style="width:${pct}%;height:100%;background:${cor};border-radius:99px"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><div class="card-title">Histórico por Mês (últimos 12 meses)</div></div>
        <div class="card-body">
          <table class="tbl">
            <thead><tr><th>Mês</th><th>Ganhas</th><th>Perdidas</th><th>Valor Adjudicado</th></tr></thead>
            <tbody>
              ${Object.entries(meses).reverse().filter(([,d]) => d.ganhou+d.perdeu > 0).map(([,d]) => `<tr>
                <td class="text-sm">${d.label}</td>
                <td style="text-align:center;color:#10b981;font-weight:700">${d.ganhou}</td>
                <td style="text-align:center;color:#ef4444">${d.perdeu}</td>
                <td class="font-bold text-primary">${d.valor > 0 ? Utils.formatCurrency(d.valor) : '—'}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="text-muted text-center">Nenhuma licitação encerrada nos últimos 12 meses</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      ${lics.length === 0 ? '<div class="empty-state"><div class="empty-icon">🏛</div><div class="empty-title">Nenhuma licitação cadastrada</div><button class="btn btn-primary mt-4" onclick="App.navigate(\'licitacoes\')">Ir para Licitações</button></div>' : ''}
    `;
  }

  function renderMargemTab() {
    const projetos = DB.getAll('projetos');
    const recebiveis = DB.getAll('recebiveis');

    // Helper: soma recebimentos de um projeto
    const receitaProjeto = (projetoId) => {
      let total = 0;
      recebiveis.filter(r => r.projetoId === projetoId).forEach(r => {
        (r.parcelas||[]).forEach(p => { if (p.status === 'recebido') total += p.valor||0; });
      });
      return total;
    };

    // Calcular margem por projeto
    const projetosComMargem = projetos.map(p => {
      const receita = receitaProjeto(p.id) || p.valor || 0;
      const custo = p.custoEstimado || p.custoReal || 0;
      const margem = receita - custo;
      const margemPct = receita > 0 ? (margem / receita) * 100 : null;
      const tipoServico = p.tipoServico || p.segmento || 'Não classificado';
      return { ...p, receita, custo, margem, margemPct, tipoServico };
    }).filter(p => p.receita > 0 || p.custo > 0);

    // Verificar se há dados suficientes
    if (projetosComMargem.length === 0) {
      return `
        <div class="card" style="text-align:center;padding:48px 32px">
          <div style="font-size:48px;margin-bottom:16px">📊</div>
          <div class="font-bold" style="font-size:18px;margin-bottom:8px">Sem dados financeiros suficientes</div>
          <div class="text-muted" style="max-width:480px;margin:0 auto">
            Para visualizar a margem por serviço, cadastre os custos nos projetos e registre os recebimentos no módulo Financeiro.
          </div>
        </div>`;
    }

    // Agrupar por tipo de serviço
    const byTipo = {};
    projetosComMargem.forEach(p => {
      if (!byTipo[p.tipoServico]) byTipo[p.tipoServico] = [];
      byTipo[p.tipoServico].push(p);
    });

    // Calcular KPIs por grupo
    const grupos = Object.entries(byTipo).map(([tipo, pList]) => {
      const receitaTotal = pList.reduce((s, p) => s + p.receita, 0);
      const custoTotal = pList.reduce((s, p) => s + p.custo, 0);
      const margemTotal = receitaTotal - custoTotal;
      const margemPct = receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : null;
      return { tipo, pList, receitaTotal, custoTotal, margemTotal, margemPct };
    }).sort((a, b) => (b.margemPct||0) - (a.margemPct||0));

    // KPIs gerais
    const totalReceita = projetosComMargem.reduce((s, p) => s + p.receita, 0);
    const totalCusto = projetosComMargem.reduce((s, p) => s + p.custo, 0);
    const margemMedia = totalReceita > 0 ? ((totalReceita - totalCusto) / totalReceita * 100) : 0;
    const maiorMargem = grupos[0];
    const menorMargem = grupos[grupos.length - 1];

    // Status de margem
    const statusMargem = (pct) => {
      if (pct === null) return '<span class="text-muted">—</span>';
      if (pct >= 50) return '<span style="color:#10b981;font-weight:700">✅ Ótima</span>';
      if (pct >= 30) return '<span style="color:#f59e0b;font-weight:700">⚠ Regular</span>';
      return '<span style="color:#ef4444;font-weight:700">❌ Baixa</span>';
    };

    // Top 5 maior e menor margem (projetos individuais com receita > 0)
    const ordenados = [...projetosComMargem].filter(p => p.margemPct !== null).sort((a, b) => b.margemPct - a.margemPct);
    const top5maior = ordenados.slice(0, 5);
    const top5menor = [...ordenados].reverse().slice(0, 5);

    return `
      <div class="kpi-grid mb-4">
        <div class="kpi-card" style="--kpi-color:#1a56db">
          <div class="kpi-label">Margem Média Geral</div>
          <div class="kpi-value">${margemMedia.toFixed(1)}%</div>
          <div class="kpi-sub">${Utils.formatCurrency(totalReceita - totalCusto)} de margem</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#10b981">
          <div class="kpi-label">Maior Margem</div>
          <div class="kpi-value" style="font-size:16px">${maiorMargem ? Utils.escHtml(maiorMargem.tipo) : '—'}</div>
          <div class="kpi-sub">${maiorMargem?.margemPct !== null ? maiorMargem.margemPct.toFixed(1)+'%' : ''}</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#ef4444">
          <div class="kpi-label">Menor Margem</div>
          <div class="kpi-value" style="font-size:16px">${menorMargem && menorMargem !== maiorMargem ? Utils.escHtml(menorMargem.tipo) : '—'}</div>
          <div class="kpi-sub">${menorMargem && menorMargem !== maiorMargem && menorMargem.margemPct !== null ? menorMargem.margemPct.toFixed(1)+'%' : ''}</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6">
          <div class="kpi-label">Total Analisado</div>
          <div class="kpi-value">${projetosComMargem.length}</div>
          <div class="kpi-sub">${grupos.length} tipos de serviço</div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><div class="card-title">Margem por Tipo de Serviço</div></div>
        <div class="card-body">
          <table class="tbl">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Projetos</th>
                <th>Receita Total</th>
                <th>Custo Total</th>
                <th>Margem R$</th>
                <th>Margem %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${grupos.map(g => `<tr>
                <td class="font-bold">${Utils.escHtml(g.tipo)}</td>
                <td style="text-align:center">${g.pList.length}</td>
                <td class="text-success">${Utils.formatCurrency(g.receitaTotal)}</td>
                <td class="text-danger">${Utils.formatCurrency(g.custoTotal)}</td>
                <td class="font-bold ${g.margemTotal >= 0 ? 'text-success' : 'text-danger'}">${Utils.formatCurrency(g.margemTotal)}</td>
                <td class="font-bold">${g.margemPct !== null ? g.margemPct.toFixed(1)+'%' : '—'}</td>
                <td>${statusMargem(g.margemPct)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Top 5 — Maior Margem</div></div>
          <div class="card-body">
            <table class="tbl">
              <thead><tr><th>Projeto</th><th>Tipo</th><th>Receita</th><th>Margem %</th></tr></thead>
              <tbody>
                ${top5maior.length === 0 ? '<tr><td colspan="4" class="text-muted text-center">Sem dados</td></tr>' :
                top5maior.map(p => `<tr>
                  <td class="font-bold text-sm">${Utils.escHtml(p.titulo||p.ordemServico||'—')}</td>
                  <td><span class="badge badge-blue">${Utils.escHtml(p.tipoServico)}</span></td>
                  <td class="text-success">${Utils.formatCurrency(p.receita)}</td>
                  <td class="font-bold text-success">${p.margemPct.toFixed(1)}%</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Top 5 — Menor Margem</div></div>
          <div class="card-body">
            <table class="tbl">
              <thead><tr><th>Projeto</th><th>Tipo</th><th>Receita</th><th>Margem %</th></tr></thead>
              <tbody>
                ${top5menor.length === 0 ? '<tr><td colspan="4" class="text-muted text-center">Sem dados</td></tr>' :
                top5menor.map(p => `<tr>
                  <td class="font-bold text-sm">${Utils.escHtml(p.titulo||p.ordemServico||'—')}</td>
                  <td><span class="badge badge-blue">${Utils.escHtml(p.tipoServico)}</span></td>
                  <td class="text-success">${Utils.formatCurrency(p.receita)}</td>
                  <td class="font-bold ${p.margemPct < 30 ? 'text-danger' : 'text-warning'}">${p.margemPct.toFixed(1)}%</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function exportarCSV() {
    let rows = [], filename = '';

    if (_tab === 'comercial') {
      filename = 'relatorio_comercial';
      const leads = DB.getAll('leads');
      rows.push(['numero', 'cliente', 'status', 'valor_estimado', 'valor_fechado', 'origem', 'responsavel', 'data_entrada']);
      leads.forEach(l => {
        const cliente = DB.get('clientes', l.clienteId);
        rows.push([
          l.numero||'', cliente?.nome||l.clienteId||'', l.status||'',
          l.valorEstimado||0, l.valorFechado||0,
          l.origemLead||'', l.responsavel||'', l.dataEntrada||''
        ]);
      });
    } else if (_tab === 'financeiro') {
      filename = 'relatorio_financeiro';
      const recebiveis = DB.getAll('recebiveis');
      rows.push(['cliente', 'descricao', 'parcela', 'vencimento', 'valor', 'status']);
      recebiveis.forEach(r => {
        const cliente = DB.get('clientes', r.clienteId);
        (r.parcelas||[]).forEach((p, i) => {
          rows.push([
            cliente?.nome||r.clienteId||'', r.descricao||'',
            i+1, p.vencimento||'', p.valor||0, p.status||''
          ]);
        });
      });
    } else if (_tab === 'operacional') {
      filename = 'relatorio_operacional';
      const projetos = DB.getAll('projetos');
      rows.push(['os', 'titulo', 'cliente', 'status', 'prazo', 'art_numero', 'art_status', 'responsavel']);
      projetos.forEach(p => {
        rows.push([
          p.ordemServico||'', p.titulo||'',
          Utils.getClientName(p.clienteId)||'', p.status||'',
          p.prazo||'', p.art?.numero||'', p.art?.status||'', p.responsavel||''
        ]);
      });
    } else if (_tab === 'clientes') {
      filename = 'relatorio_clientes';
      const clientes = DB.getAll('clientes');
      rows.push(['codigo', 'nome', 'cnpj', 'segmento', 'porte', 'cidade', 'estado', 'nps', 'eng_responsavel']);
      clientes.forEach(c => {
        rows.push([
          c.codigo||'', c.nome||'', c.cnpj||'',
          c.segmento||'', c.porte||'', c.cidade||'', c.estado||'',
          c.nps||'', c.engResponsavel||''
        ]);
      });
    } else if (_tab === 'licitacoes') {
      filename = 'relatorio_licitacoes';
      const lics = DB.getAll('licitacoes');
      rows.push(['numero', 'orgao', 'modalidade', 'status', 'data_abertura', 'valor_estimado', 'resultado']);
      lics.forEach(l => {
        rows.push([
          l.numero||'', l.orgao||'', l.modalidade||'',
          l.status||'', l.dataAbertura||'',
          l.valorEstimado||0, l.resultado||''
        ]);
      });
    } else if (_tab === 'margem') {
      filename = 'relatorio_margem';
      const projetos = DB.getAll('projetos');
      const recebiveis = DB.getAll('recebiveis');
      const receitaProjeto = (projetoId) => {
        let total = 0;
        recebiveis.filter(r => r.projetoId === projetoId).forEach(r => {
          (r.parcelas||[]).forEach(p => { if (p.status === 'recebido') total += p.valor||0; });
        });
        return total;
      };
      rows.push(['projeto', 'tipo_servico', 'cliente', 'receita', 'custo', 'margem_rs', 'margem_pct']);
      projetos.forEach(p => {
        const receita = receitaProjeto(p.id) || p.valor || 0;
        const custo = p.custoEstimado || p.custoReal || 0;
        if (receita === 0 && custo === 0) return;
        const margem = receita - custo;
        const margemPct = receita > 0 ? (margem / receita * 100).toFixed(2) : '';
        rows.push([
          p.titulo||p.ordemServico||'', p.tipoServico||p.segmento||'',
          Utils.getClientName(p.clienteId)||'',
          receita, custo, margem, margemPct
        ]);
      });
    }

    if (rows.length <= 1) {
      alert('Nenhum dado para exportar nesta aba.');
      return;
    }

    const csv = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename + '_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
  }

  return { render, setTab, exportarCSV };
})();
