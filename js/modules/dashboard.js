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
    const contasPagar = DB.getAll('contaspagar');

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
        </div>
      </div>

      <!-- FAÇA ISSO HOJE -->
      ${_renderFacaIssoHoje(atividades, leads, contasPagar, recebiveis)}

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

      <!-- KPIs SECUNDÁRIOS -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <!-- Licitações em andamento -->
        <div class="kpi-card" style="--kpi-color:#0f766e">
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

    // Gráfico de origem dos leads
    const origemData = Object.entries(origemCount).map(([k,v]) => ({ label: k, value: v }));
    if (origemData.length > 0) {
      Charts.donut({ containerId: 'chartOrigem', data: origemData, size: 160 });
    } else {
      const el = document.getElementById('chartOrigem');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-sub">Nenhum lead com origem cadastrada</div></div>';
    }

    _renderMetasKpi();
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

  return { render };
})();
