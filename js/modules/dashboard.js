/* ==========================================
   DASHBOARD — Visão geral com KPIs e gráficos
   ========================================== */
const Dashboard = (() => {

  let _periodo = 'mes'; // 'mes' | 'trimestre' | 'semestre' | 'ano' | 'tudo'

  function _filtrarPorPeriodo(lista, campo) {
    if (_periodo === 'tudo') return lista;
    const hoje = new Date();
    let inicio;
    if (_periodo === 'mes') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    } else if (_periodo === 'trimestre') {
      const q = Math.floor(hoje.getMonth() / 3);
      inicio = new Date(hoje.getFullYear(), q * 3, 1);
    } else if (_periodo === 'semestre') {
      const s = hoje.getMonth() < 6 ? 0 : 6;
      inicio = new Date(hoje.getFullYear(), s, 1);
    } else if (_periodo === 'ano') {
      inicio = new Date(hoje.getFullYear(), 0, 1);
    }
    const inicioStr = inicio.toISOString().split('T')[0];
    return lista.filter(item => (item[campo] || item.createdAt || '') >= inicioStr);
  }

  function _filtrarPeriodoAnterior(lista, campo) {
    if (_periodo === 'tudo') return [];
    const hoje = new Date();
    let inicioAtual, fimAnterior, inicioAnterior;
    if (_periodo === 'mes') {
      inicioAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fimAnterior = new Date(inicioAtual.getTime() - 1);
      inicioAnterior = new Date(fimAnterior.getFullYear(), fimAnterior.getMonth(), 1);
    } else if (_periodo === 'trimestre') {
      const q = Math.floor(hoje.getMonth() / 3);
      inicioAtual = new Date(hoje.getFullYear(), q * 3, 1);
      fimAnterior = new Date(inicioAtual.getTime() - 1);
      inicioAnterior = new Date(fimAnterior.getFullYear(), Math.floor(fimAnterior.getMonth() / 3) * 3, 1);
    } else if (_periodo === 'semestre') {
      const s = hoje.getMonth() < 6 ? 0 : 6;
      inicioAtual = new Date(hoje.getFullYear(), s, 1);
      fimAnterior = new Date(inicioAtual.getTime() - 1);
      inicioAnterior = new Date(fimAnterior.getFullYear(), fimAnterior.getMonth() < 6 ? 0 : 6, 1);
    } else if (_periodo === 'ano') {
      inicioAtual = new Date(hoje.getFullYear(), 0, 1);
      fimAnterior = new Date(inicioAtual.getTime() - 1);
      inicioAnterior = new Date(fimAnterior.getFullYear(), 0, 1);
    }
    const inicioStr = inicioAnterior.toISOString().split('T')[0];
    const fimStr = fimAnterior.toISOString().split('T')[0];
    return lista.filter(item => {
      const d = (item[campo] || item.createdAt || '').slice(0, 10);
      return d >= inicioStr && d <= fimStr;
    });
  }

  function _trendHtml(atual, anterior, isPercent = false) {
    if (_periodo === 'tudo' || anterior === 0 && atual === 0) return '';
    let diff, label;
    if (isPercent) {
      diff = atual - anterior;
      label = diff >= 0 ? `↑ +${diff.toFixed(0)}pp` : `↓ ${diff.toFixed(0)}pp`;
    } else if (anterior === 0) {
      label = atual > 0 ? '↑ novo' : '—';
      diff = atual;
    } else {
      diff = ((atual - anterior) / anterior) * 100;
      label = diff >= 0 ? `↑ +${diff.toFixed(0)}%` : `↓ ${diff.toFixed(0)}%`;
    }
    const color = diff >= 0 ? '#10b981' : '#ef4444';
    return `<div class="kpi-trend" style="color:${color}">
      ${label} <span style="color:var(--text-muted);font-weight:400">vs período anterior</span>
    </div>`;
  }

  function setPeriodo(p) {
    _periodo = p;
    render();
  }

  function render() {
    const leads = DB.getAll('leads');
    const projetos = DB.getAll('projetos');
    const atividades = DB.getAll('atividades');
    const clientes = DB.getAll('clientes');
    const recebiveis = DB.getAll('recebiveis');
    const contasPagar = DB.getAll('contaspagar');

    // Dados filtrados por período
    const leadsFiltrados = _filtrarPorPeriodo(leads, 'dataEntrada');
    const projetosFiltrados = _filtrarPorPeriodo(projetos, 'dataInicio');
    const atividadesFiltradas = _filtrarPorPeriodo(atividades, 'data');

    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const periodoLabel = periodoLabels[_periodo] || '';

    const ativos = leadsFiltrados.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
    const ganhos = leadsFiltrados.filter(l => l.status === 'fechado_ganho');
    const perdidos = leadsFiltrados.filter(l => l.status === 'fechado_perdido');
    const totalPipeline = Utils.sum(ativos, 'valorEstimado');
    const receitaFechada = Utils.sum(ganhos, 'valorFechado');
    const taxaConversao = (leadsFiltrados.length > 0) ? ((ganhos.length / leadsFiltrados.length) * 100).toFixed(0) : 0;

    // Período anterior para comparativo
    const leadsAnt = _filtrarPeriodoAnterior(leads, 'dataEntrada');
    const ativosAnt = leadsAnt.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
    const ganhosAnt = leadsAnt.filter(l => l.status === 'fechado_ganho');
    const totalPipelineAnt = Utils.sum(ativosAnt, 'valorEstimado');
    const receitaFechadaAnt = Utils.sum(ganhosAnt, 'valorFechado');
    const taxaConversaoAnt = leadsAnt.length > 0 ? (ganhosAnt.length / leadsAnt.length) * 100 : 0;

    const pendentes = atividadesFiltradas.filter(a => a.status === 'pendente');
    const atrasadas = pendentes.filter(a => Utils.isOverdue(a.data));
    const projetosAtivos = projetosFiltrados.filter(p => p.status === 'em_andamento');

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
    const totalReceberAtual = totalReceberAVencer + totalReceberVencido;
    // A receber do período anterior — baseado em recebiveis criados naquele período
    const recebiveisAnt = _filtrarPeriodoAnterior(recebiveis, 'createdAt');
    let totalReceberAnt = 0;
    recebiveisAnt.forEach(r => {
      (r.parcelas || []).forEach(p => {
        if (p.status !== 'recebido') totalReceberAnt += (p.valor || 0);
      });
    });

    // Licitações
    const licitacoes = DB.getAll('licitacoes');
    const licsAtivas = licitacoes.filter(l => !['ganhou','perdeu','deserta','cancelada'].includes(l.status));
    const licsUrgentes = licsAtivas.filter(l => { const d = Utils.daysUntil(l.dataAbertura); return d != null && d >= 0 && d <= 7; }).length;
    const valorLics = licsAtivas.reduce((s,l) => s + (l.valorEstimado||0), 0);

    // ARTs pendentes
    const artSemNumero = projetos.filter(p => p.status === 'em_andamento' && !p.art?.numero).length;

    // Canal principal de leads
    const origemCount = {};
    leads.filter(l => l.origemLead).forEach(l => { origemCount[l.origemLead] = (origemCount[l.origemLead]||0) + 1; });
    const origemEntries = Object.entries(origemCount).sort((a,b) => b[1]-a[1]);
    const canalPrincipal = origemEntries[0]?.[0] || '—';
    const canalPrincipalQtd = origemEntries[0]?.[1] || 0;
    const canalPrincipalPct = leads.length > 0 ? Math.round(canalPrincipalQtd/leads.length*100) : 0;

    // NPS médio dos projetos
    const projsComNps = projetos.filter(p => p.npsCliente);
    const npsMedia = projsComNps.length > 0 ? (projsComNps.reduce((s,p) => s + p.npsCliente, 0) / projsComNps.length).toFixed(1) : null;
    const npsDisplay = npsMedia ? '⭐ ' + npsMedia : '—';
    const npsCount = projsComNps.length;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Dashboard</h2>
        <div class="sec-actions">
          <span class="text-muted text-sm">${new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</span>
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${[
              { k:'mes',       l:'Este Mês' },
              { k:'trimestre', l:'Trimestre' },
              { k:'semestre',  l:'Semestre' },
              { k:'ano',       l:'Este Ano' },
              { k:'tudo',      l:'Tudo' },
            ].map(p => `<button onclick="Dashboard.setPeriodo('${p.k}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p.k?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${p.l}</button>`).join('')}
          </div>
        </div>
      </div>

      <!-- FAÇA ISSO HOJE -->
      ${_renderFacaIssoHoje(atividades, leads, contasPagar, recebiveis)}

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card" style="--kpi-color:#1a56db;cursor:pointer" onclick="Dashboard.drillDown('leads_ativos')">
          <div class="kpi-label">Pipeline Ativo <span style="font-size:10px;font-weight:400;opacity:.7">(${periodoLabel})</span></div>
          <div class="kpi-value">${Utils.formatCurrency(totalPipeline)}</div>
          <div class="kpi-sub">${ativos.length} oportunidades abertas</div>
          ${_trendHtml(totalPipeline, totalPipelineAnt)}
          <div class="kpi-icon">💼</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" onclick="Dashboard.drillDown('leads_ganhos')">
          <div class="kpi-label">Receita Fechada <span style="font-size:10px;font-weight:400;opacity:.7">(${periodoLabel})</span></div>
          <div class="kpi-value">${Utils.formatCurrency(receitaFechada)}</div>
          <div class="kpi-sub">${ganhos.length} negócios ganhos</div>
          ${_trendHtml(receitaFechada, receitaFechadaAnt)}
          <div class="kpi-icon">🏆</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f59e0b;cursor:pointer" onclick="Dashboard.drillDown('receber_avencer')">
          <div class="kpi-label">A Receber</div>
          <div class="kpi-value">${Utils.formatCurrency(totalReceberAtual)}</div>
          <div class="kpi-sub ${totalReceberVencido > 0 ? 'text-danger' : ''}">${totalReceberVencido > 0 ? `⚠ ${Utils.formatCurrency(totalReceberVencido)} vencido` : 'Em dia'}</div>
          ${_trendHtml(totalReceberAtual, totalReceberAnt)}
          <div class="kpi-icon">💰</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6;cursor:pointer" onclick="Dashboard.drillDown('leads_novos')">
          <div class="kpi-label">Taxa de Conversão <span style="font-size:10px;font-weight:400;opacity:.7">(${periodoLabel})</span></div>
          <div class="kpi-value">${taxaConversao}%</div>
          <div class="kpi-sub">${ganhos.length} ganhos / ${perdidos.length} perdidos</div>
          ${_trendHtml(Number(taxaConversao), taxaConversaoAnt, true)}
          <div class="kpi-icon">📈</div>
        </div>
      </div>

      <!-- KPIs SECUNDÁRIOS -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <!-- Licitações em andamento -->
        <div class="kpi-card" style="--kpi-color:#0f766e;cursor:pointer" onclick="Dashboard.drillDown('licitacoes_urgentes')">
          <div class="kpi-label">Licitações em Disputa</div>
          <div class="kpi-value">${licsAtivas.length}</div>
          <div class="kpi-sub ${licsUrgentes > 0 ? 'text-danger' : ''}">${licsUrgentes > 0 ? `⚠ ${licsUrgentes} abrindo em ≤7 dias` : Utils.formatCurrency(valorLics) + ' em disputa'}</div>
          <div class="kpi-icon">🏛</div>
        </div>
        <!-- ARTs pendentes -->
        <div class="kpi-card" style="--kpi-color:${artSemNumero > 0 ? '#ef4444' : '#10b981'}">
          <div class="kpi-label">ARTs Pendentes</div>
          <div class="kpi-value">${artSemNumero}</div>
          <div class="kpi-sub">${artSemNumero > 0 ? 'Projetos em andamento sem ART' : '✅ Todos os projetos com ART'}</div>
          <div class="kpi-icon">📜</div>
        </div>
        <!-- Canal principal de leads -->
        <div class="kpi-card" style="--kpi-color:#6366f1">
          <div class="kpi-label">Principal Canal</div>
          <div class="kpi-value" style="font-size:16px">${canalPrincipal}</div>
          <div class="kpi-sub">${canalPrincipalQtd} leads · ${canalPrincipalPct}% do total</div>
          <div class="kpi-icon">📡</div>
        </div>
        <!-- NPS médio -->
        <div class="kpi-card" style="--kpi-color:#f59e0b">
          <div class="kpi-label">NPS Médio (serviços)</div>
          <div class="kpi-value">${npsDisplay}</div>
          <div class="kpi-sub">${npsCount} avaliações recebidas</div>
          <div class="kpi-icon">⭐</div>
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

      <!-- ROW 3: Origem dos Leads -->
      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Leads por Canal de Origem</div></div>
          <div class="card-body"><div id="chartOrigem"></div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">ARTs — Status</div>
          </div>
          <div class="card-body">
            ${(() => {
              const artStatus = { 'Sem ART': artSemNumero };
              projetos.forEach(p => {
                if (p.art?.numero) {
                  const s = p.art.status || 'pendente';
                  artStatus[s] = (artStatus[s]||0) + 1;
                }
              });
              const colors = { 'registrada':'#10b981','baixada':'#3b82f6','pendente':'#f59e0b','cancelada':'#94a3b8','Sem ART':'#ef4444' };
              const total = Object.values(artStatus).reduce((s,n) => s+n, 0);
              if (total === 0) return '<div class="empty-state"><div class="empty-sub">Nenhum projeto cadastrado</div></div>';
              return Object.entries(artStatus).filter(([,n]) => n > 0).map(([k,n]) => {
                const pct = Math.round(n/total*100);
                const cor = colors[k]||'#94a3b8';
                return `<div style="margin-bottom:10px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                    <span class="text-sm">${k}</span>
                    <span class="text-sm font-bold">${n} (${pct}%)</span>
                  </div>
                  <div style="height:8px;background:var(--border);border-radius:99px">
                    <div style="width:${pct}%;height:100%;background:${cor};border-radius:99px"></div>
                  </div>
                </div>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>

      <!-- Licitações Urgentes -->
      ${_renderLicitacoesUrgentes(licsAtivas)}

      <!-- Alertas de Contratos e Laudos Vencendo -->
      ${_renderAlertasContratos()}

      ${_renderTrafegoWidget()}

      <!-- Alertas Follow-up -->
      ${renderFollowupAlerts(ativos)}

      <div id="dashMetasKpi"></div>
    `;

    // Renderizar gráficos
    const statusOrder = ['lead_identificado','primeiro_contato','qualificacao','proposta_elaboracao','proposta_enviada','negociacao'];
    Charts.funnel({
      containerId: 'chartFunnel',
      data: statusOrder.map(s => ({
        label: Utils.LEAD_STATUS[s].label,
        value: leadsFiltrados.filter(l => l.status === s).length,
        color: Utils.LEAD_STATUS[s].color,
      })).filter(d => d.value > 0),
    });

    const bySegmento = Utils.groupBy(leadsFiltrados, 'segmento');
    Charts.donut({
      containerId: 'chartSegmento',
      data: Object.entries(bySegmento).map(([k,v], i) => ({ label: k, value: v.length })),
      size: 160,
    });

    // Receita últimos 6 meses — usa lançamentos reais (receitas recebidas)
    const lancamentos = DB.getAll('lancamentos');
    const lancamentosFiltrados = _filtrarPorPeriodo(lancamentos, 'data');
    const monthData = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - i);
      const mesStr = dt.toISOString().substring(0, 7);
      const val = lancamentosFiltrados
        .filter(l => l.tipo === 'receita' && l.status === 'recebido' && l.data?.startsWith(mesStr))
        .reduce((s, l) => s + (l.valor || 0), 0);
      monthData.push({ value: val, label: Utils.monthLabel(-i), color: '#1a56db' });
    }
    Charts.bar({ containerId: 'chartReceita', data: monthData, height: 180, showValues: false });

    const projStatus = Utils.groupBy(projetosFiltrados, 'status');
    Charts.donut({
      containerId: 'chartProjetos',
      data: Object.entries(projStatus).map(([k,v]) => ({ label: Utils.PROJ_STATUS[k]?.label || k, value: v.length })),
      size: 160,
    });

    // Gráfico de origem dos leads (filtrado)
    const origemCountFiltrado = {};
    leadsFiltrados.filter(l => l.origemLead).forEach(l => { origemCountFiltrado[l.origemLead] = (origemCountFiltrado[l.origemLead]||0) + 1; });
    const origemData = Object.entries(origemCountFiltrado).map(([k,v]) => ({ label: k, value: v }));
    if (origemData.length > 0) {
      Charts.donut({ containerId: 'chartOrigem', data: origemData, size: 160 });
    } else {
      const el = document.getElementById('chartOrigem');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-sub">Nenhum lead com origem cadastrada</div></div>';
    }

    _renderMetasKpi();
  }

  /* ================================================
     WIDGET: ALERTAS DE CONTRATOS E LAUDOS VENCENDO
     ================================================ */
  function _renderAlertasContratos() {
    try {
      const contratos = DB.getAll('contratos').filter(c => c.status !== 'encerrado');

      const vencendo = contratos.filter(c => {
        if (!c.dataFim) return false;
        const d = Utils.daysUntil(c.dataFim);
        return d != null && d >= 0 && d <= 90;
      });

      const laudos = contratos.filter(c => {
        if (!c.validadeLaudo) return false;
        const d = Utils.daysUntil(c.validadeLaudo);
        return d != null && d <= 60;
      });

      if (vencendo.length === 0 && laudos.length === 0) return '';

      return `<div class="card mb-4" style="border-left:4px solid #f59e0b">
        <div class="card-header">
          <div class="card-title" style="color:#f59e0b">⚠ Alertas de Contratos e Laudos</div>
          <button class="btn btn-xs btn-secondary" onclick="App.navigate('contratos')">Ver contratos →</button>
        </div>
        <div class="card-body" style="padding:0 16px 16px">
          <div id="dashAlertasContratos">
            ${_renderAlertasContratosFiltrado(_alertaContratosDias)}
          </div>
        </div>
      </div>`;
    } catch(e) { return ''; }
  }

  let _alertaContratosDias = 90;

  function _filtrarAlertasContratos(dias) {
    _alertaContratosDias = dias;
    // Re-renderiza só o widget de alertas
    const container = document.getElementById('dashAlertasContratos');
    if (!container) { Toast.show(`Filtro: contratos que vencem em até ${dias} dias`); return; }
    container.innerHTML = _renderAlertasContratosFiltrado(dias);
  }

  function _renderAlertasContratosFiltrado(dias) {
    try {
      const contratos = DB.getAll('contratos').filter(c => c.status !== 'encerrado');

      const vencendo = contratos.filter(c => {
        if (!c.dataFim) return false;
        const d = Utils.daysUntil(c.dataFim);
        return d != null && d >= 0 && d <= dias;
      }).sort((a, b) => (a.dataFim||'').localeCompare(b.dataFim||''));

      const laudos = contratos.filter(c => {
        if (!c.validadeLaudo) return false;
        const d = Utils.daysUntil(c.validadeLaudo);
        return d != null && d <= Math.min(dias, 60);
      }).sort((a, b) => (a.validadeLaudo||'').localeCompare(b.validadeLaudo||''));

      let html = `<div style="display:flex;gap:8px;margin:0 0 12px;flex-wrap:wrap;align-items:center">
        <span class="text-xs font-bold text-muted">Filtrar:</span>
        ${[30,60,90].map(d => `<button onclick="Dashboard._filtrarAlertasContratos(${d})" class="btn btn-xs ${dias===d?'btn-primary':'btn-secondary'}">${d} dias</button>`).join('')}
        <span class="text-xs text-muted">(${vencendo.length + laudos.length} alertas)</span>
      </div>`;

      if (laudos.length === 0 && vencendo.length === 0) {
        return html + `<div class="text-sm text-muted" style="text-align:center;padding:16px">Nenhum alerta para os próximos ${dias} dias.</div>`;
      }

      if (laudos.length > 0) {
        html += `<div class="font-bold text-sm mb-2" style="color:#ef4444">📋 Laudos / Certificados Vencendo (${laudos.length})</div>`;
        html += laudos.map(c => {
          const d = Utils.daysUntil(c.validadeLaudo);
          const cor = d == null ? '#94a3b8' : d < 0 ? '#ef4444' : d <= 30 ? '#ef4444' : '#f59e0b';
          const label = d == null ? '—' : d < 0 ? `Vencido há ${Math.abs(d)}d` : d === 0 ? 'Vence HOJE' : `${d} dias`;
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div class="font-bold text-sm">${Utils.escHtml(Utils.getClientName(c.clienteId))}</div>
              <div class="text-xs text-muted">${Utils.escHtml(c.tipoLaudo || c.objeto || '—')} · ${Utils.escHtml(c.numero||'')}</div>
            </div>
            <span style="font-size:12px;font-weight:700;color:${cor}">${label}</span>
            <button class="btn btn-xs btn-warning" onclick="Contratos.criarLeadRenovacaoLaudo('${c.id}')">📋 Lead</button>
          </div>`;
        }).join('');
      }

      if (vencendo.length > 0) {
        html += `<div class="font-bold text-sm mb-2 mt-3" style="color:#f59e0b">📄 Contratos Vencendo em ${dias} Dias (${vencendo.length})</div>`;
        html += vencendo.map(c => {
          const d = Utils.daysUntil(c.dataFim);
          const cor = d == null ? '#94a3b8' : d < 0 ? '#ef4444' : d <= 30 ? '#ef4444' : d <= 60 ? '#f59e0b' : '#10b981';
          const label = d == null ? '—' : d < 0 ? `Vencido há ${Math.abs(d)}d` : d === 0 ? 'Vence HOJE' : `${d} dias`;
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div class="font-bold text-sm">${Utils.escHtml(Utils.getClientName(c.clienteId))}</div>
              <div class="text-xs text-muted">${Utils.escHtml(c.objeto||'—')} · ${Utils.formatCurrency(c.valor)}</div>
            </div>
            <span style="font-size:12px;font-weight:700;color:${cor}">${label}</span>
            <button class="btn btn-xs btn-secondary" onclick="Contratos.criarLeadRenovacaoContrato('${c.id}');this.disabled=true;this.textContent='✓'">🔄 Renovar</button>
          </div>`;
        }).join('');
      }
      return html;
    } catch(e) { return '<div class="text-sm text-muted">Erro ao carregar alertas.</div>'; }
  }

  /* ================================================
     WIDGET: TRÁFEGO PAGO (Google Ads)
     ================================================ */
  function _renderTrafegoWidget() {
    try {
      const mesAtual = new Date().toISOString().slice(0, 7);

      // Leads de tráfego pago do mês
      const leadsTrafico = DB.getAll('leads').filter(l => {
        if (l.origemLead !== 'Tráfego Pago') return false;
        const d = l.dataEntrada || (l.createdAt||'').split('T')[0];
        return d && d.startsWith(mesAtual);
      });

      if (leadsTrafico.length === 0 && DB.getAll('trafego_campanhas').length === 0) return '';

      // Investimento do mês
      const campanhas = DB.getAll('trafego_campanhas');
      const investido = campanhas.filter(c => {
        const ini = (c.dataInicio||'').slice(0,7);
        const fim = (c.dataFim||'').slice(0,7) || '9999-12';
        return ini <= mesAtual && fim >= mesAtual;
      }).reduce((s,c) => s + (c.investidoReal || c.orcamentoMensal || 0), 0);

      const cpl = leadsTrafico.length > 0 && investido > 0 ? investido / leadsTrafico.length : null;
      const ganhos = leadsTrafico.filter(l => l.status === 'fechado_ganho');
      const receita = Utils.sum(ganhos, 'valorFechado');
      const roi = investido > 0 && receita > 0 ? ((receita - investido) / investido * 100).toFixed(0) : null;

      // Meta do mês
      const meta = DB.getAll('trafego_metas').find(m => m.mes === mesAtual);
      const metaCPL = meta?.metaCPL || null;
      const cplOk = cpl && metaCPL ? cpl <= metaCPL : true;

      const mesLabel = new Date(mesAtual + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      return `
        <div class="card mb-4" style="border-left:4px solid #ef4444">
          <div class="card-header">
            <div class="card-title" style="color:#ef4444">🎯 Google Ads — ${mesLabel}</div>
            <button class="btn btn-xs btn-secondary" onclick="App.navigate('trafego')">Ver detalhes →</button>
          </div>
          <div class="card-body" style="padding:14px 18px">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
              <div style="text-align:center">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Investido</div>
                <div style="font-size:20px;font-weight:800;color:var(--text)">${investido > 0 ? Utils.formatCurrency(investido) : '—'}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Leads</div>
                <div style="font-size:20px;font-weight:800;color:#3b82f6">${leadsTrafico.length}</div>
                ${meta?.metaLeads ? `<div style="font-size:10px;color:var(--text-muted)">meta: ${meta.metaLeads}</div>` : ''}
              </div>
              <div style="text-align:center">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">CPL</div>
                <div style="font-size:20px;font-weight:800;color:${cplOk ? '#10b981' : '#ef4444'}">${cpl ? Utils.formatCurrency(cpl) : '—'}</div>
                ${metaCPL ? `<div style="font-size:10px;color:var(--text-muted)">meta: ${Utils.formatCurrency(metaCPL)}</div>` : ''}
              </div>
              <div style="text-align:center">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">ROI</div>
                <div style="font-size:20px;font-weight:800;color:${roi > 0 ? '#10b981' : roi < 0 ? '#ef4444' : 'var(--text)'}">${roi !== null ? roi + '%' : '—'}</div>
                ${receita > 0 ? `<div style="font-size:10px;color:var(--text-muted)">${Utils.formatCurrency(receita)} receita</div>` : ''}
              </div>
            </div>
          </div>
        </div>`;
    } catch(e) { return ''; }
  }

  /* ================================================
     WIDGET: LICITAÇÕES COM ABERTURA PRÓXIMA
     ================================================ */
  function _renderLicitacoesUrgentes(licsAtivas) {
    const urgentes = licsAtivas
      .filter(l => { const d = Utils.daysUntil(l.dataAbertura); return d != null && d <= 10; })
      .sort((a,b) => (a.dataAbertura||'').localeCompare(b.dataAbertura||''));
    if (urgentes.length === 0) return '';
    return `
      <div class="card mb-4" style="border-left:4px solid #0f766e">
        <div class="card-header">
          <div class="card-title" style="color:#0f766e">🏛 Licitações com Abertura Próxima</div>
          <button class="btn btn-xs btn-secondary" onclick="App.navigate('licitacoes')">Ver todas →</button>
        </div>
        <div class="card-body" style="padding:0">
          <table class="tbl">
            <thead><tr><th>Processo</th><th>Órgão</th><th>Modalidade</th><th>Abertura</th><th>Valor Est.</th><th>Status</th></tr></thead>
            <tbody>
              ${urgentes.map(l => {
                const dias = Utils.daysUntil(l.dataAbertura);
                const cor = dias < 0 ? '#ef4444' : dias <= 3 ? '#f97316' : dias <= 7 ? '#f59e0b' : '#0f766e';
                const label = dias < 0 ? `Encerrado ${Math.abs(dias)}d` : dias === 0 ? '⚠ HOJE' : `${dias}d restantes`;
                return `<tr>
                  <td class="font-bold text-sm" style="color:var(--primary)">${Utils.escHtml(l.numero||'—')}</td>
                  <td class="text-sm">${Utils.escHtml(l.orgao||'—')}</td>
                  <td class="text-xs">${Utils.escHtml(l.modalidade||'—')}</td>
                  <td><div class="font-bold" style="font-size:12px;color:${cor}">${Utils.formatDate(l.dataAbertura)}</div><div style="font-size:11px;color:${cor}">${label}</div></td>
                  <td class="text-sm">${l.valorEstimado ? Utils.formatCurrency(l.valorEstimado) : '—'}</td>
                  <td class="text-xs">${l.status||'—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ================================================
     WIDGET: FAÇA ISSO HOJE
     ================================================ */
  function _renderFacaIssoHoje(atividades, leads, contasPagar, recebiveis) {
    const hoje = Utils.todayStr();
    const items = [];

    // 1. Atividades do dia (status pendente, data = hoje)
    atividades
      .filter(a => a.status === 'pendente' && a.data === hoje)
      .forEach(a => items.push({
        prioridade: 1,
        icone: Utils.ATIV_TIPO[a.tipo]?.icon || '📌',
        cor: '#1a56db',
        titulo: a.titulo,
        subtitulo: Utils.getClientName(a.clienteId) || '',
        hora: a.hora || '',
        tipo: 'atividade',
        id: a.id,
        acao: `App.navigate('atividades')`,
      }));

    // 2. Atividades atrasadas (ordenadas por atraso)
    atividades
      .filter(a => a.status === 'pendente' && a.data && a.data < hoje)
      .sort((a,b) => a.data.localeCompare(b.data))
      .slice(0,2)
      .forEach(a => {
        const diasAtraso = Math.round((new Date(hoje) - new Date(a.data)) / 86400000);
        items.push({
          prioridade: 0,
          icone: '⚠',
          cor: '#ef4444',
          titulo: a.titulo,
          subtitulo: `Atrasada ${diasAtraso}d — ${Utils.getClientName(a.clienteId)||''}`,
          hora: '',
          tipo: 'atraso',
          id: a.id,
          acao: `App.navigate('atividades')`,
        });
      });

    // 3. Leads com follow-up atrasado
    leads
      .filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status) && l.dataProximaAcao && l.dataProximaAcao <= hoje)
      .sort((a,b) => a.dataProximaAcao.localeCompare(b.dataProximaAcao))
      .slice(0,2)
      .forEach(l => {
        const diasAtraso = Math.round((new Date(hoje) - new Date(l.dataProximaAcao)) / 86400000);
        items.push({
          prioridade: l.dataProximaAcao < hoje ? 0 : 1,
          icone: '💼',
          cor: diasAtraso > 0 ? '#f59e0b' : '#8b5cf6',
          titulo: `Follow-up: ${l.titulo}`,
          subtitulo: diasAtraso > 0 ? `Atrasado ${diasAtraso}d` : 'Para hoje',
          hora: '',
          tipo: 'lead',
          id: l.id,
          acao: `App.navigate('pipeline')`,
        });
      });

    // 4. Contas a pagar vencendo hoje ou vencidas
    contasPagar
      .filter(c => c.status === 'pendente' && c.vencimento && c.vencimento <= hoje)
      .sort((a,b) => a.vencimento.localeCompare(b.vencimento))
      .slice(0,2)
      .forEach(c => {
        const vencida = c.vencimento < hoje;
        items.push({
          prioridade: vencida ? 0 : 1,
          icone: '💸',
          cor: vencida ? '#ef4444' : '#f59e0b',
          titulo: `${c.fornecedor} — ${Utils.formatCurrency(c.valor)}`,
          subtitulo: vencida ? `Vencida em ${Utils.formatDate(c.vencimento)}` : 'Vence hoje',
          hora: '',
          tipo: 'conta',
          id: c.id,
          acao: `App.navigate('financeiro')`,
        });
      });

    // 5. Parcelas vencendo hoje
    recebiveis.forEach(r => {
      (r.parcelas||[]).filter(p => p.status !== 'recebido' && p.vencimento === hoje).forEach(p => {
        const cli = DB.get('clientes', r.clienteId);
        items.push({
          prioridade: 1,
          icone: '💰',
          cor: '#10b981',
          titulo: `Receber: ${cli?.nome || 'Cliente'} — ${Utils.formatCurrency(p.valor)}`,
          subtitulo: 'Parcela vence hoje',
          hora: '',
          tipo: 'recebivel',
          id: p.id,
          acao: `App.navigate('financeiro')`,
        });
      });
    });

    // Ordenar: atrasados primeiro (prioridade 0), depois por hora
    items.sort((a, b) => a.prioridade - b.prioridade || (a.hora || '').localeCompare(b.hora || ''));

    const top5 = items.slice(0, 5);

    if (top5.length === 0) {
      return `<div class="card mb-4" style="border-left:4px solid var(--success)">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:16px">
          <span style="font-size:28px">🎉</span>
          <div>
            <div class="font-bold">Dia limpo!</div>
            <div class="text-sm text-muted">Nenhuma tarefa urgente para hoje. Bom momento para trabalhar no pipeline.</div>
          </div>
        </div>
      </div>`;
    }

    return `<div class="card mb-4" style="border-left:4px solid var(--primary)">
      <div class="card-header">
        <div class="card-title">⚡ Faça isso hoje</div>
        <span class="badge badge-blue">${top5.length} item${top5.length > 1 ? 's' : ''}</span>
      </div>
      <div class="card-body" style="padding:0">
        ${top5.map((item, idx) => `
          <div class="hoje-item" onclick="${item.acao}" style="cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
            <div style="width:8px;height:8px;border-radius:50%;background:${item.cor};flex-shrink:0"></div>
            <div style="width:32px;height:32px;border-radius:8px;background:${item.cor}20;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${item.icone}</div>
            <div style="flex:1;min-width:0">
              <div class="font-bold text-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escHtml(item.titulo)}</div>
              <div class="text-xs text-muted">${Utils.escHtml(item.subtitulo)}</div>
            </div>
            ${item.hora ? `<span class="text-xs text-muted">${item.hora}</span>` : ''}
            <span style="font-size:11px;color:${item.cor};font-weight:600;text-transform:uppercase">${item.tipo === 'atraso' ? 'ATRASADO' : item.tipo === 'conta' && item.prioridade === 0 ? 'VENCIDO' : 'HOJE'}</span>
          </div>`).join('')}
      </div>
    </div>`;
  }

  function _renderMetasKpi() {
    const el = document.getElementById('dashMetasKpi');
    if (!el) return;
    if (typeof Metas === 'undefined') return;

    const ano = new Date().getFullYear();
    const qi = Math.floor(new Date().getMonth() / 3);
    const TRIMESTRES = ['Q1 (Jan–Mar)', 'Q2 (Abr–Jun)', 'Q3 (Jul–Set)', 'Q4 (Out–Dez)'];
    const meta = DB.getAll('metas').find(m => m.ano === ano && m.trimestre === qi);
    if (!meta || !meta.receita) { el.innerHTML = ''; return; }

    const lancamentos = DB.getAll('lancamentos');
    const meses = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]][qi];
    const inicio = new Date(ano, meses[0], 1).toISOString().split('T')[0];
    const fim = new Date(ano, meses[2] + 1, 0).toISOString().split('T')[0];
    const receitaReal = lancamentos
      .filter(l => l.tipo==='receita' && l.status==='recebido' && l.data >= inicio && l.data <= fim)
      .reduce((s,l) => s + (l.valor||0), 0);
    const pct = Math.min(Math.round((receitaReal / meta.receita) * 100), 100);
    const color = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--primary)';

    el.innerHTML = `
      <div style="margin-top:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="font-size:14px;font-weight:700;color:var(--text);margin:0;">🎯 Metas do Trimestre — ${TRIMESTRES[qi]}</h3>
          <button class="btn btn-xs btn-ghost" onclick="App.navigate('metas')">Ver tudo →</button>
        </div>
        <div class="card" style="padding:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:13px;font-weight:600;color:var(--text);">💰 Faturamento</span>
            <span style="font-size:13px;font-weight:700;color:${color};">${pct}%</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:6px;">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;transition:width .5s;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);">
            <span>Realizado: ${Utils.formatCurrency(receitaReal)}</span>
            <span>Meta: ${Utils.formatCurrency(meta.receita)}</span>
          </div>
        </div>
      </div>`;
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

  /* ================================================
     DRILL-DOWN — Modal com lista de itens do KPI
     ================================================ */
  function drillDown(tipo) {
    const hoje = new Date().toISOString().split('T')[0];
    const configs = {
      'leads_ativos': {
        title: '💼 Leads Ativos',
        get items() { return DB.getAll('leads').filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status)); },
        cols: ['Lead','Etapa','Valor','Responsável'],
        row: l => [Utils.escHtml(l.titulo||'—'), Utils.escHtml(l.status||'—'), Utils.formatCurrency(l.valorEstimado||0), Utils.escHtml(l.responsavel||'—')],
        action: l => `onclick="App.navigate('pipeline');Modal.close()"`,
      },
      'leads_ganhos': {
        title: '🏆 Leads Ganhos',
        get items() { return DB.getAll('leads').filter(l => l.status === 'fechado_ganho'); },
        cols: ['Lead','Valor Fechado','Responsável'],
        row: l => [Utils.escHtml(l.titulo||'—'), Utils.formatCurrency(l.valorFechado||0), Utils.escHtml(l.responsavel||'—')],
        action: l => `onclick="App.navigate('pipeline');Modal.close()"`,
      },
      'leads_novos': {
        title: '🔵 Leads do Período',
        get items() {
          return _filtrarPorPeriodo(DB.getAll('leads'), 'dataEntrada');
        },
        cols: ['Lead','Origem','Data','Responsável'],
        row: l => [Utils.escHtml(l.titulo||'—'), Utils.escHtml(l.origemLead||'—'), Utils.formatDate(l.dataEntrada||''), Utils.escHtml(l.responsavel||'—')],
        action: l => `onclick="App.navigate('pipeline');Modal.close()"`,
      },
      'atividades_atrasadas': {
        title: '⚠ Atividades Atrasadas',
        get items() { return DB.getAll('atividades').filter(a => a.status === 'pendente' && a.data && a.data < hoje); },
        cols: ['Atividade','Tipo','Data','Responsável'],
        row: a => [Utils.escHtml(a.titulo||'—'), Utils.escHtml(a.tipo||'—'), Utils.formatDate(a.data||''), Utils.escHtml(a.responsavel||'—')],
        action: a => `onclick="App.navigate('atividades');Modal.close()"`,
      },
      'projetos_ativos': {
        title: '📋 Projetos em Andamento',
        get items() { return DB.getAll('projetos').filter(p => p.status === 'em_andamento'); },
        cols: ['Projeto','Cliente','Prazo','Responsável'],
        row: p => [Utils.escHtml(p.titulo||'—'), Utils.escHtml(Utils.getClientName(p.clienteId)||'—'), Utils.formatDate(p.prazo||''), Utils.escHtml(p.responsavel||'—')],
        action: p => `onclick="App.navigate('projetos');Modal.close()"`,
      },
      'receber_avencer': {
        title: '💰 Recebíveis a Vencer',
        get items() {
          const list = [];
          DB.getAll('recebiveis').forEach(r => {
            (r.parcelas||[]).forEach(p => {
              if (p.status === 'a_vencer' && !Utils.isOverdue(p.vencimento)) {
                list.push({ ...p, _clienteId: r.clienteId });
              }
            });
          });
          return list;
        },
        cols: ['Cliente','Valor','Vencimento'],
        row: p => [Utils.escHtml(Utils.getClientName(p._clienteId)||'—'), Utils.formatCurrency(p.valor||0), Utils.formatDate(p.vencimento||'')],
        action: p => `onclick="App.navigate('financeiro');Modal.close()"`,
      },
      'receber_vencido': {
        title: '🔴 Recebíveis Vencidos',
        get items() {
          const list = [];
          DB.getAll('recebiveis').forEach(r => {
            (r.parcelas||[]).forEach(p => {
              if (p.status === 'a_vencer' && Utils.isOverdue(p.vencimento)) {
                list.push({ ...p, _clienteId: r.clienteId });
              }
            });
          });
          return list;
        },
        cols: ['Cliente','Valor','Vencimento'],
        row: p => [Utils.escHtml(Utils.getClientName(p._clienteId)||'—'), `<span style="color:#ef4444;font-weight:700">${Utils.formatCurrency(p.valor||0)}</span>`, `<span style="color:#ef4444">${Utils.formatDate(p.vencimento||'')}</span>`],
        action: p => `onclick="App.navigate('financeiro');Modal.close()"`,
      },
      'licitacoes_urgentes': {
        title: '🏛 Licitações — Abertura em ≤7 dias',
        get items() {
          return DB.getAll('licitacoes').filter(l => {
            if (['ganhou','perdeu','deserta','cancelada'].includes(l.status)) return false;
            const d = Utils.daysUntil(l.dataAbertura);
            return d != null && d >= 0 && d <= 7;
          });
        },
        cols: ['Objeto','Órgão','Data Abertura','Valor'],
        row: l => [Utils.escHtml(l.objeto||l.numero||'—'), Utils.escHtml(l.orgao||'—'), Utils.formatDate(l.dataAbertura||''), Utils.formatCurrency(l.valorEstimado||0)],
        action: l => `onclick="App.navigate('licitacoes');Modal.close()"`,
      },
      'contas_pagar': {
        title: '💸 Contas a Pagar',
        get items() { return DB.getAll('contaspagar').filter(c => c.status === 'pendente'); },
        cols: ['Descrição','Valor','Vencimento'],
        row: c => [Utils.escHtml(c.fornecedor||c.descricao||'—'), Utils.formatCurrency(c.valor||0), Utils.formatDate(c.vencimento||'')],
        action: c => `onclick="App.navigate('financeiro');Modal.close()"`,
      },
    };
    const cfg = configs[tipo]; if (!cfg) return;
    const items = cfg.items;
    Modal.open({
      title: `${cfg.title} — ${items.length} registro(s)`,
      body: `
        <div style="max-height:55vh;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:var(--surface-2,#f8fafc);position:sticky;top:0">
              ${cfg.cols.map(c => `<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border)">${c}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${items.length ? items.map(item => `
                <tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s"
                    onmouseover="this.style.background='var(--surface-2,#f8fafc)'"
                    onmouseout="this.style.background=''" ${cfg.action(item)}>
                  ${cfg.row(item).map(v => `<td style="padding:8px 12px">${v}</td>`).join('')}
                </tr>`).join('')
              : `<tr><td colspan="${cfg.cols.length}" style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`}
            </tbody>
          </table>
        </div>`,
      saveCb: null,
    });
    setTimeout(() => { const f = document.getElementById('modalFoot'); if(f) f.style.display='none'; }, 0);
  }

  return { render, setPeriodo, drillDown, _filtrarAlertasContratos };
})();
