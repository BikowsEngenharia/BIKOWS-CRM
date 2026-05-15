/* ==========================================
   DASHBOARD — Visão geral com KPIs e gráficos
   ========================================== */
const Dashboard = (() => {

  function render() {
    const leads = DB.getAll('leads');
    const projetos = DB.getAll('projetos');
    const atividades = DB.getAll('atividades');
    const clientes = DB.getAll('clientes');
    const recebiveis = DB.getAll('recebiveis');

    const ativos = leads.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
    const ganhos = leads.filter(l => l.status === 'fechado_ganho');
    const perdidos = leads.filter(l => l.status === 'fechado_perdido');
    const totalPipeline = Utils.sum(ativos, 'valorEstimado');
    const receitaFechada = Utils.sum(ganhos, 'valorFechado');
    const taxaConversao = (leads.length > 0) ? ((ganhos.length / leads.length) * 100).toFixed(0) : 0;

    const pendentes = atividades.filter(a => a.status === 'pendente');
    const atrasadas = pendentes.filter(a => Utils.isOverdue(a.data));
    const projetosAtivos = projetos.filter(p => p.status === 'em_andamento');

    // Calcular recebíveis: a vencer e vencidos
    let totalReceberAVencer = 0, totalReceberVencido = 0, totalRecebido = 0;
    recebiveis.forEach(r => {
      (r.parcelas || []).forEach(p => {
        if (p.status === 'recebido') totalRecebido += p.valor;
        else if (p.status === 'a_vencer') {
          if (Utils.isOverdue(p.vencimento)) totalReceberVencido += p.valor;
          else totalReceberAVencer += p.valor;
        }
      });
    });

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Dashboard</h2>
        <div class="sec-actions">
          <span class="text-muted text-sm">${new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</span>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card" style="--kpi-color:#1a56db">
          <div class="kpi-label">Pipeline Ativo</div>
          <div class="kpi-value">${Utils.formatCurrency(totalPipeline)}</div>
          <div class="kpi-sub">${ativos.length} oportunidades abertas</div>
          <div class="kpi-icon">💼</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#10b981">
          <div class="kpi-label">Receita Fechada</div>
          <div class="kpi-value">${Utils.formatCurrency(receitaFechada)}</div>
          <div class="kpi-sub">${ganhos.length} negócios ganhos</div>
          <div class="kpi-icon">🏆</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f59e0b">
          <div class="kpi-label">A Receber</div>
          <div class="kpi-value">${Utils.formatCurrency(totalReceberAVencer + totalReceberVencido)}</div>
          <div class="kpi-sub ${totalReceberVencido > 0 ? 'text-danger' : ''}">${totalReceberVencido > 0 ? `⚠ ${Utils.formatCurrency(totalReceberVencido)} vencido` : 'Em dia'}</div>
          <div class="kpi-icon">💰</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6">
          <div class="kpi-label">Taxa de Conversão</div>
          <div class="kpi-value">${taxaConversao}%</div>
          <div class="kpi-sub">${ganhos.length} ganhos / ${perdidos.length} perdidos</div>
          <div class="kpi-icon">📈</div>
        </div>
      </div>

      <!-- ROW 1 -->
      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Pipeline por Estágio</div>
          </div>
          <div class="card-body">
            <div id="chartFunnel"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Leads por Segmento</div>
          </div>
          <div class="card-body">
            <div id="chartSegmento"></div>
          </div>
        </div>
      </div>

      <!-- ROW 2 -->
      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Receita por Mês</div>
          </div>
          <div class="card-body">
            <div id="chartReceita"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Status dos Projetos</div>
          </div>
          <div class="card-body">
            <div id="chartProjetos"></div>
          </div>
        </div>
      </div>

      <!-- ROW 3 -->
      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Atividades Pendentes</div>
            <span class="badge ${atrasadas.length > 0 ? 'badge-red' : 'badge-blue'}">${pendentes.length} pendentes</span>
          </div>
          <div class="card-body" style="padding:0">
            <div class="activity-feed" style="padding:0 20px">
              ${renderAtividades(pendentes.slice(0, 6))}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Projetos em Andamento</div>
            <span class="badge badge-blue">${projetosAtivos.length}</span>
          </div>
          <div class="card-body" style="padding:0">
            <div style="padding:0 20px">
              ${renderProjetos(projetosAtivos)}
            </div>
          </div>
        </div>
      </div>

      <!-- Alertas Follow-up -->
      ${renderFollowupAlerts(ativos)}
    `;

    // Renderizar gráficos
    const statusOrder = ['lead_identificado','primeiro_contato','qualificacao','proposta_elaboracao','proposta_enviada','negociacao'];
    Charts.funnel({
      containerId: 'chartFunnel',
      data: statusOrder.map(s => ({
        label: Utils.LEAD_STATUS[s].label,
        value: leads.filter(l => l.status === s).length,
        color: Utils.LEAD_STATUS[s].color,
      })).filter(d => d.value > 0),
    });

    const bySegmento = Utils.groupBy(leads, 'segmento');
    Charts.donut({
      containerId: 'chartSegmento',
      data: Object.entries(bySegmento).map(([k,v], i) => ({ label: k, value: v.length })),
      size: 160,
    });

    // Receita últimos 6 meses — usa lançamentos reais (receitas recebidas)
    const lancamentos = DB.getAll('lancamentos');
    const monthData = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - i);
      const mesStr = dt.toISOString().substring(0, 7);
      const val = lancamentos
        .filter(l => l.tipo === 'receita' && l.status === 'recebido' && l.data?.startsWith(mesStr))
        .reduce((s, l) => s + (l.valor || 0), 0);
      monthData.push({ value: val, label: Utils.monthLabel(-i), color: '#1a56db' });
    }
    Charts.bar({ containerId: 'chartReceita', data: monthData, height: 180, showValues: false });

    const projStatus = Utils.groupBy(projetos, 'status');
    Charts.donut({
      containerId: 'chartProjetos',
      data: Object.entries(projStatus).map(([k,v]) => ({ label: Utils.PROJ_STATUS[k]?.label || k, value: v.length })),
      size: 160,
    });
  }

  function renderAtividades(list) {
    if (!list.length) return '<div class="empty-state" style="padding:30px"><div class="empty-icon">✅</div><div class="empty-sub">Nenhuma atividade pendente</div></div>';
    return list.map(a => {
      const tipo = Utils.ATIV_TIPO[a.tipo] || { icon: '📌', bg: '#f1f5f9' };
      const client = Utils.getClientName(a.clienteId);
      const alert = Utils.dateAlert(a.data, a.status);
      return `<div class="activity-item">
        <div class="activity-icon" style="background:${tipo.bg}">${tipo.icon}</div>
        <div class="activity-content">
          <div class="activity-title">${Utils.escHtml(a.titulo)}</div>
          <div class="activity-sub">${Utils.escHtml(client)} · ${Utils.formatDate(a.data)} ${a.hora || ''} ${alert}</div>
        </div>
        <div class="activity-time text-xs text-muted">${a.responsavel || ''}</div>
      </div>`;
    }).join('');
  }

  function renderProjetos(list) {
    if (!list.length) return '<div class="empty-state" style="padding:30px"><div class="empty-icon">📋</div><div class="empty-sub">Nenhum projeto em andamento</div></div>';
    return list.map(p => {
      const etapas = p.etapas || [];
      const totalPct = etapas.length ? Math.round(etapas.reduce((s,e) => s + (e.pct||0), 0) / etapas.length) : 0;
      const dias = Utils.daysUntil(p.prazo);
      const diasStr = dias == null ? '' : dias < 0 ? `<span class="text-danger">Atrasado ${Math.abs(dias)}d</span>` : dias === 0 ? '<span class="text-warning">Vence hoje</span>' : `${dias}d restantes`;
      return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-sm">${Utils.escHtml(p.titulo)}</span>
          <span class="text-xs text-muted">${totalPct}%</span>
        </div>
        <div class="progress mb-1"><div class="progress-fill" style="width:${totalPct}%"></div></div>
        <div class="text-xs text-muted">${Utils.escHtml(Utils.getClientName(p.clienteId))} · ${diasStr}</div>
      </div>`;
    }).join('');
  }

  function renderFollowupAlerts(leads) {
    const vencidos = leads.filter(l => l.dataProximaAcao && Utils.isOverdue(l.dataProximaAcao));
    const hoje = leads.filter(l => l.dataProximaAcao && Utils.isToday(l.dataProximaAcao));
    if (!vencidos.length && !hoje.length) return '';

    const items = [...vencidos.map(l => ({ ...l, urgente: true })), ...hoje].slice(0, 5);
    return `<div class="card mb-4">
      <div class="card-header">
        <div class="card-title">⚠ Ações de Follow-up Necessárias</div>
        <span class="badge badge-red">${vencidos.length + hoje.length}</span>
      </div>
      <div class="card-body">
        ${items.map(l => {
          const dias = Utils.daysUntil(l.dataProximaAcao);
          const label = dias < 0 ? `Atrasado ${Math.abs(dias)} dia(s)` : 'Hoje';
          return `<div class="followup-item ${l.urgente ? 'urgent' : ''}">
            <div style="flex:1">
              <div class="font-bold text-sm">${Utils.escHtml(Utils.getClientName(l.clienteId))}</div>
              <div class="text-xs text-muted">${Utils.escHtml(l.titulo)} · ${Utils.escHtml(l.proximaAcao || '')}</div>
            </div>
            <span class="badge ${l.urgente ? 'badge-red' : 'badge-yellow'}">${label}</span>
            <button class="btn btn-xs btn-primary" onclick="App.navigate('pipeline')">Ver Pipeline</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  return { render };
})();
