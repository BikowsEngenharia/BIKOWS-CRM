/* ==========================================
   PROJETOS — Gestão de execução + Rentabilidade
   ========================================== */
const Projetos = (() => {

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

  function setPeriodo(p) {
    _periodo = p;
    render();
  }

  let _filter = { status: '', responsavel: '' };

  function _calcRentabilidade(p) {
    const receita = p.valor || 0;
    const custoHoras = (p.horasTrabalhadas || 0) * (p.valorHora || 0);
    const custosDirectos = p.custosDirectos || 0;
    const custoTotal = custoHoras + custosDirectos;
    const margem = receita - custoTotal;
    const margemPct = receita > 0 ? Math.round((margem / receita) * 100) : 0;
    return { receita, custoHoras, custosDirectos, custoTotal, margem, margemPct };
  }

  function render() {
    const projetos = DB.getAll('projetos');
    const config = DB.getConfig();
    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const projetosFiltrados = _filtrarPorPeriodo(projetos, 'dataInicio');

    let list = projetos;
    if (_filter.status) list = list.filter(p => p.status === _filter.status);
    if (_filter.responsavel) list = list.filter(p => p.responsavel === _filter.responsavel);

    // Em andamento sempre mostra todos (estado atual)
    const emAnd = projetos.filter(p => p.status === 'em_andamento').length;
    const atrasados = projetos.filter(p => p.status === 'em_andamento' && Utils.isOverdue(p.prazo)).length;
    // Iniciados e concluídos no período
    const iniciadosPeriodo = projetosFiltrados.length;
    const concluidosPeriodo = projetosFiltrados.filter(p => p.status === 'concluido').length;
    const totalValor = Utils.sum(projetosFiltrados, 'valor');

    // Rentabilidade consolidada (todos os projetos)
    const totalCustos = projetos.reduce((s, p) => {
      const r = _calcRentabilidade(p);
      return s + r.custoTotal;
    }, 0);
    const totalValorGeral = Utils.sum(projetos, 'valor');
    const margemGeral = totalValorGeral > 0 ? Math.round(((totalValorGeral - totalCustos) / totalValorGeral) * 100) : 0;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Projetos em Execução</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Projetos.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <button class="btn btn-secondary" onclick="Projetos.verRentabilidade()">📊 Rentabilidade</button>
          <button class="btn btn-primary" onclick="Projetos.openForm()">+ Novo Projeto</button>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">
        <div class="kpi-card" style="--kpi-color:#3b82f6;cursor:pointer" onclick="Projetos.drillDown('em_andamento')"><div class="kpi-label">Em Andamento</div><div class="kpi-value">${emAnd}</div><div class="kpi-sub">todos</div><div class="kpi-icon">🔧</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444;cursor:pointer" onclick="Projetos.drillDown('atrasados')"><div class="kpi-label">Atrasados</div><div class="kpi-value">${atrasados}</div><div class="kpi-icon">⚠</div></div>
        <div class="kpi-card" style="--kpi-color:#1a56db;cursor:pointer" onclick="Projetos.drillDown('concluidos')"><div class="kpi-label">Iniciados <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div><div class="kpi-value">${iniciadosPeriodo}</div><div class="kpi-icon">🚀</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" onclick="Projetos.drillDown('concluidos')"><div class="kpi-label">Concluídos <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div><div class="kpi-value">${concluidosPeriodo}</div><div class="kpi-icon">✅</div></div>
        <div class="kpi-card" style="--kpi-color:${margemGeral >= 40 ? '#10b981' : margemGeral >= 20 ? '#f59e0b' : '#ef4444'};cursor:pointer" onclick="Projetos.drillDown('sem_art')">
          <div class="kpi-label">Margem Média</div>
          <div class="kpi-value">${margemGeral}%</div>
          <div class="kpi-icon">📈</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Projetos.setFilter('status',this.value)">
              <option value="">Todos os status</option>
              ${Object.entries(Utils.PROJ_STATUS).map(([k,v]) => `<option value="${k}" ${_filter.status===k?'selected':''}>${v.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Projetos.setFilter('responsavel',this.value)">
              <option value="">Todos os responsáveis</option>
              ${config.responsaveis.map(r => `<option value="${r}" ${_filter.responsavel===r?'selected':''}>${r}</option>`).join('')}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} projeto(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? emptyState() : `
          <table class="tbl">
            <thead><tr><th>OS</th><th>Código</th><th>Projeto</th><th>Cliente</th><th>Valor</th><th>Margem</th><th>Prazo</th><th>ART</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.map(p => {
                const etapas = p.etapas || [];
                const pct = etapas.length ? Math.round(etapas.reduce((s,e)=>s+(e.pct||0),0)/etapas.length) : 0;
                const dias = Utils.daysUntil(p.prazo);
                const prazoClass = (p.status !== 'concluido' && dias != null && dias < 0) ? 'text-danger' : 'text-muted';
                const prazoLabel = dias == null ? '—' : dias < 0 ? `⚠ ${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`;
                const rent = _calcRentabilidade(p);
                const margemColor = rent.margemPct >= 40 ? '#10b981' : rent.margemPct >= 20 ? '#f59e0b' : rent.custoTotal > 0 ? '#ef4444' : '#94a3b8';
                const artStatus = p.art?.numero
                  ? (p.art.status === 'registrada' ? `<span class="badge badge-green text-xs" title="${p.art.numero}">✅ ART</span>` : `<span class="badge badge-yellow text-xs">${p.art.numero}</span>`)
                  : (p.status === 'em_andamento' ? `<span class="badge badge-red text-xs">⚠ Sem ART</span>` : `<span class="text-muted text-xs">—</span>`);
                const checkPct = p.checklist?.length
                  ? Math.round(p.checklist.filter(c=>c.concluido).length / p.checklist.length * 100)
                  : null;
                return `<tr>
                  <td class="text-xs font-bold" style="color:var(--primary)">${Utils.escHtml(p.ordemServico||'—')}</td>
                  <td class="text-xs text-muted">${Utils.escHtml(p.codigo||'—')}</td>
                  <td><div class="font-bold" style="max-width:150px">${Utils.escHtml(p.titulo)}</div>
                    ${checkPct !== null ? `<div style="display:flex;align-items:center;gap:4px;margin-top:2px"><div style="flex:1;height:3px;background:var(--border);border-radius:99px"><div style="width:${checkPct}%;height:100%;background:${checkPct===100?'#10b981':'#3b82f6'};border-radius:99px"></div></div><span class="text-xs" style="color:var(--text-muted)">${checkPct}%</span></div>` : ''}
                  </td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(p.clienteId))}</td>
                  <td class="text-sm font-bold">${Utils.formatCurrency(p.valor)}</td>
                  <td class="text-sm font-bold" style="color:${margemColor}">${rent.custoTotal > 0 ? rent.margemPct + '%' : '—'}</td>
                  <td class="text-sm ${prazoClass}">${Utils.formatDate(p.prazo)} <span class="text-xs">${prazoLabel}</span></td>
                  <td>${artStatus}</td>
                  <td>${Utils.projBadge(p.status)}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Projetos.view('${p.id}')">Ver</button>
                      <button class="btn btn-xs btn-primary" onclick="ProjetoFinanceiro.open('${p.id}')" title="Controle Financeiro">💰</button>
                      <button class="btn btn-xs btn-secondary" onclick="Projetos.openForm('${p.id}')">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Projetos.deleteProjeto('${p.id}')">🗑</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  }

  function emptyState() {
    return `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum projeto encontrado</div><button class="btn btn-primary mt-4" onclick="Projetos.openForm()">+ Criar Projeto</button></div>`;
  }

  function setFilter(k, v) { _filter[k] = v; render(); }

  function verRentabilidade() {
    const projetos = DB.getAll('projetos').filter(p => p.valor > 0);
    const rows = projetos.map(p => {
      const r = _calcRentabilidade(p);
      const cor = r.margemPct >= 40 ? '#10b981' : r.margemPct >= 20 ? '#f59e0b' : r.custoTotal > 0 ? '#ef4444' : '#94a3b8';
      return { p, r, cor };
    }).sort((a,b) => b.r.margemPct - a.r.margemPct);

    Modal.open({
      title: '📊 Rentabilidade por Projeto',
      size: 'modal-lg',
      body: `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
            <div class="text-xs text-muted">Receita Total</div>
            <div class="font-bold" style="color:var(--primary)">${Utils.formatCurrency(rows.reduce((s,r)=>s+r.r.receita,0))}</div>
          </div>
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
            <div class="text-xs text-muted">Custo Total</div>
            <div class="font-bold" style="color:var(--danger)">${Utils.formatCurrency(rows.reduce((s,r)=>s+r.r.custoTotal,0))}</div>
          </div>
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
            <div class="text-xs text-muted">Margem Geral</div>
            <div class="font-bold" style="color:var(--success)">${Utils.formatCurrency(rows.reduce((s,r)=>s+r.r.margem,0))}</div>
          </div>
        </div>
        <table class="tbl">
          <thead><tr><th>Projeto</th><th>Receita</th><th>Custo Horas</th><th>Custos Diretos</th><th>Margem R$</th><th>Margem %</th></tr></thead>
          <tbody>
            ${rows.map(({p,r,cor}) => `<tr>
              <td class="font-bold text-sm">${Utils.escHtml(p.titulo)}<div class="text-xs text-muted">${Utils.escHtml(Utils.getClientName(p.clienteId))}</div></td>
              <td class="font-bold">${Utils.formatCurrency(r.receita)}</td>
              <td class="text-sm text-muted">${Utils.formatCurrency(r.custoHoras)}${p.horasTrabalhadas ? `<div class="text-xs">${p.horasTrabalhadas}h × ${Utils.formatCurrency(p.valorHora||0)}</div>` : ''}</td>
              <td class="text-sm text-muted">${Utils.formatCurrency(r.custosDirectos)}</td>
              <td class="font-bold" style="color:${cor}">${Utils.formatCurrency(r.margem)}</td>
              <td><span style="font-weight:700;color:${cor}">${r.margemPct}%</span>
                <div style="width:60px;height:6px;background:var(--border);border-radius:99px;margin-top:4px"><div style="width:${Math.max(0,Math.min(100,r.margemPct))}%;height:100%;background:${cor};border-radius:99px"></div></div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="text-xs text-muted mt-3">
          ⚠ Projetos sem horas ou custos lançados mostram margem zerada. Edite o projeto para registrar os custos reais.
        </div>
      `,
      saveLabel: null,
    });
  }

  function view(id) {
    const p = DB.get('projetos', id);
    if (!p) return;
    const etapas = p.etapas || [];
    const pct = etapas.length ? Math.round(etapas.reduce((s,e)=>s+(e.pct||0),0)/etapas.length) : 0;
    const rent = _calcRentabilidade(p);
    const margemColor = rent.margemPct >= 40 ? 'var(--success)' : rent.margemPct >= 20 ? 'var(--warning)' : rent.custoTotal > 0 ? 'var(--danger)' : 'var(--text-muted)';

    // ART display
    const art = p.art || {};
    const artStatusLabel = { pendente:'⏳ Pendente', registrada:'✅ Registrada', baixada:'🏁 Baixada', cancelada:'❌ Cancelada' };
    const artColor = art.numero ? (art.status === 'registrada' || art.status === 'baixada' ? '#10b981' : '#f59e0b') : (p.status === 'em_andamento' ? '#ef4444' : '#94a3b8');

    // Checklist
    const checklist = p.checklist || [];
    const checkDone = checklist.filter(c => c.concluido).length;
    const checkPct = checklist.length ? Math.round(checkDone / checklist.length * 100) : null;

    // NPS stars
    const npsStars = p.npsCliente ? '⭐'.repeat(p.npsCliente) + ` (${p.npsCliente}/5)` : '—';

    Modal.open({
      title: p.titulo,
      size: 'modal-lg',
      body: `
        <!-- CABEÇALHO: OS + badges principais -->
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border)">
          ${p.ordemServico ? `<span style="background:var(--primary);color:#fff;font-weight:700;font-size:13px;padding:4px 12px;border-radius:99px">${Utils.escHtml(p.ordemServico)}</span>` : ''}
          ${p.codigo ? `<span style="background:var(--bg);color:var(--text-muted);font-size:12px;padding:3px 10px;border-radius:99px;border:1px solid var(--border)">${Utils.escHtml(p.codigo)}</span>` : ''}
          ${Utils.projBadge(p.status)}
          ${p.nfEmitida ? '<span class="badge badge-green text-xs">NF Emitida</span>' : '<span class="badge badge-gray text-xs">Sem NF</span>'}
          ${p.npsCliente ? `<span title="NPS do Cliente" style="font-size:13px">${npsStars}</span>` : ''}
        </div>

        <!-- GRID INFO PRINCIPAL -->
        <div class="detail-grid mb-3">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(Utils.getClientName(p.clienteId))}</div></div>
          <div class="detail-field"><div class="detail-label">Responsável</div><div class="detail-value">${Utils.escHtml(p.responsavel||'—')}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Contrato</div><div class="detail-value font-bold text-primary">${Utils.formatCurrency(p.valor)}</div></div>
          <div class="detail-field"><div class="detail-label">Início</div><div class="detail-value">${Utils.formatDate(p.dataInicio)}</div></div>
          <div class="detail-field"><div class="detail-label">Prazo</div><div class="detail-value">${Utils.formatDate(p.prazo)}</div></div>
          <div class="detail-field"><div class="detail-label">Pagamento</div><div class="detail-value">${p.pagamentoRecebido?'<span class="badge badge-green">Recebido</span>':'<span class="badge badge-gray">Pendente</span>'}</div></div>
        </div>

        <!-- ART -->
        <div style="background:var(--bg);border-radius:var(--radius);padding:14px;margin-bottom:14px;border-left:4px solid ${artColor}">
          <div class="font-bold text-sm mb-2" style="color:${artColor}">📜 ART — Anotação de Responsabilidade Técnica</div>
          ${art.numero ? `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
              <div><div class="text-xs text-muted">Número</div><div class="font-bold text-sm">${Utils.escHtml(art.numero)}</div></div>
              <div><div class="text-xs text-muted">Status</div><div class="font-bold text-sm">${artStatusLabel[art.status]||art.status}</div></div>
              <div><div class="text-xs text-muted">Engenheiro</div><div class="text-sm">${Utils.escHtml(art.engResponsavel||'—')}</div></div>
              <div><div class="text-xs text-muted">Data de Registro</div><div class="text-sm">${Utils.formatDate(art.data)}</div></div>
              <div><div class="text-xs text-muted">Valor da ART</div><div class="text-sm">${art.valor ? Utils.formatCurrency(art.valor) : '—'}</div></div>
              <div><div class="text-xs text-muted">Link / Arquivo</div><div class="text-sm">${art.link ? `<a href="${Utils.escHtml(art.link)}" target="_blank" style="color:var(--primary)">🔗 Abrir</a>` : '—'}</div></div>
            </div>
          ` : `<div class="text-sm" style="color:${artColor}">${p.status === 'em_andamento' ? '⚠ Nenhuma ART registrada. Projeto em andamento sem ART!' : 'Nenhuma ART registrada.'}</div>`}
        </div>

        <!-- RENTABILIDADE -->
        <div style="background:var(--bg);border-radius:var(--radius);padding:14px;margin-bottom:14px;border-left:4px solid ${margemColor}">
          <div class="font-bold text-sm mb-2">📊 Rentabilidade</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            <div style="text-align:center"><div class="text-xs text-muted">Receita</div><div class="font-bold" style="color:var(--primary)">${Utils.formatCurrency(rent.receita)}</div></div>
            <div style="text-align:center">
              <div class="text-xs text-muted">Custo Horas</div>
              <div class="font-bold text-sm">${Utils.formatCurrency(rent.custoHoras)}</div>
              ${p.horasTrabalhadas ? `<div class="text-xs text-muted">${p.horasTrabalhadas}h × ${Utils.formatCurrency(p.valorHora||0)}</div>` : ''}
            </div>
            <div style="text-align:center"><div class="text-xs text-muted">Custos Diretos</div><div class="font-bold text-sm">${Utils.formatCurrency(rent.custosDirectos)}</div></div>
            <div style="text-align:center">
              <div class="text-xs text-muted">Margem</div>
              <div class="font-bold" style="color:${margemColor};font-size:20px">${rent.margemPct}%</div>
              <div class="text-xs" style="color:${margemColor}">${Utils.formatCurrency(rent.margem)}</div>
            </div>
          </div>
          ${rent.custoTotal === 0 ? `<div class="text-xs text-muted mt-2">ℹ Registre horas e custos para ver a margem real.</div>` : ''}
        </div>

        <!-- PROGRESSO ETAPAS -->
        <div class="mb-3">
          <div class="flex items-center justify-between mb-2">
            <div class="detail-label">Progresso Geral das Etapas</div>
            <span class="font-bold">${pct}%</span>
          </div>
          <div class="progress" style="height:10px"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        ${etapas.length ? `
        <div class="detail-label mb-2">Etapas</div>
        <div class="etapas-list">
          ${etapas.map((e, i) => {
            const statColors = { concluida: '#10b981', em_andamento: '#3b82f6', pendente: '#94a3b8' };
            const vincBadge = e.vincPagamento ? `<span class="badge badge-yellow text-xs" title="Vinculado a pagamento">💳</span>` : '';
            return `<div class="etapa-item">
              <div class="etapa-num" style="background:${statColors[e.status]||'#94a3b8'}">${i+1}</div>
              <div class="etapa-info">
                <div class="etapa-name">${Utils.escHtml(e.nome)} ${vincBadge}</div>
                <div class="etapa-dates">${Utils.formatDate(e.inicio)} → ${Utils.formatDate(e.fim)}</div>
              </div>
              <div class="etapa-pct-bar"><div class="etapa-pct-fill" style="width:${e.pct||0}%;background:${statColors[e.status]||'#94a3b8'}"></div></div>
              <div class="etapa-pct">${e.pct||0}%</div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <!-- CHECKLIST DE ENTREGA -->
        ${checklist.length ? `
        <div style="background:var(--bg);border-radius:var(--radius);padding:14px;margin-top:14px">
          <div class="flex items-center justify-between mb-2">
            <div class="font-bold text-sm">📦 Checklist de Entrega</div>
            <span class="text-sm font-bold" style="color:${checkPct===100?'#10b981':'var(--primary)'}">${checkDone}/${checklist.length} (${checkPct}%)</span>
          </div>
          <div style="height:6px;background:var(--border);border-radius:99px;margin-bottom:10px">
            <div style="width:${checkPct}%;height:100%;background:${checkPct===100?'#10b981':'#3b82f6'};border-radius:99px;transition:width .3s"></div>
          </div>
          ${checklist.map(item => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:16px">${item.concluido ? '✅' : '⬜'}</span>
              <span class="text-sm" style="${item.concluido ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${Utils.escHtml(item.texto)}</span>
            </div>`).join('')}
        </div>` : ''}

        ${p.observacoes ? `<div class="mt-3 detail-field"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(p.observacoes)}</div></div>` : ''}

        ${(() => {
          const contratoVinculado = DB.getAll('contratos').find(ct => ct.projetoId === p.id);
          if (!contratoVinculado) return '';
          const cvStatus = contratoVinculado.status || 'ativo';
          const cvStatusMap = { ativo: { label: 'Ativo', color: '#10b981' }, renovando: { label: 'Renovando', color: '#f59e0b' }, vencido: { label: 'Vencido', color: '#ef4444' }, encerrado: { label: 'Encerrado', color: '#94a3b8' }, rascunho: { label: 'Rascunho', color: '#8b5cf6' } };
          const cvS = cvStatusMap[cvStatus] || { label: cvStatus, color: '#94a3b8' };
          const cvBadge = `<span style="font-size:11px;font-weight:600;background:${cvS.color}20;color:${cvS.color};padding:2px 8px;border-radius:99px;border:1px solid ${cvS.color}44">${cvS.label}</span>`;
          return `<div style="background:#f5f3ff;border:1px solid #8b5cf6;border-radius:8px;padding:12px;margin-top:8px">
            <div style="font-size:11px;color:#8b5cf6;font-weight:700;margin-bottom:4px">📋 CONTRATO VINCULADO</div>
            <div style="font-weight:600">${Utils.escHtml(contratoVinculado.numero || 'Sem número')}</div>
            <div style="font-size:12px">${cvBadge} · ${Utils.formatCurrency(contratoVinculado.valor)}</div>
            <button onclick="Modal.close();App.navigate('contratos');setTimeout(()=>Contratos.view('${contratoVinculado.id}'),300)" class="btn btn-xs btn-secondary" style="margin-top:8px">Ver contrato →</button>
          </div>`;
        })()}

        <div class="mt-4 flex gap-2">
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Projetos.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-secondary btn-sm" onclick="Modal.close();ProjetoFinanceiro.open('${id}')">💰 Financeiro</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  function openForm(id = null) {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const p = id ? DB.get('projetos', id) : null;
    const etapas = p?.etapas || [{ nome: '', inicio: '', fim: '', pct: 0, status: 'pendente' }];

    const clientOpts = clientes.map(c => `<option value="${c.id}" ${p?.clienteId===c.id?'selected':''}>${Utils.escHtml(c.nome)}</option>`).join('');
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${p?.responsavel===r?'selected':''}>${r}</option>`).join('');
    const statusOpts = Object.entries(Utils.PROJ_STATUS).map(([k,v]) => `<option value="${k}" ${p?.status===k?'selected':''}>${v.label}</option>`).join('');

    const etapasHtml = etapas.map((e, i) => renderEtapaRow(e, i)).join('');

    Modal.open({
      title: id ? 'Editar Projeto' : 'Novo Projeto',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:3">
            <label class="form-label">Título do Projeto / OS *</label>
            <input class="form-control" id="fpTitulo" value="${Utils.escHtml(p?.titulo||'')}" placeholder="Ex: Adequação NR-12 Linha de Produção">
          </div>
          <div class="form-group">
            <label class="form-label">Ordem de Serviço (OS)</label>
            <input class="form-control" id="fpOrdemServico" value="${Utils.escHtml(p?.ordemServico||'')}" placeholder="OS-2026-00001">
            <div class="text-xs text-muted mt-1">Número único de OS</div>
          </div>
          <div class="form-group">
            <label class="form-label">Código Interno</label>
            <input class="form-control" id="fpCodigo" value="${Utils.escHtml(p?.codigo||'')}" placeholder="BIK-2026-PRJ-001">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cliente</label>
            <select class="form-control" id="fpCliente"><option value="">—</option>${clientOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Responsável</label>
            <select class="form-control" id="fpResponsavel"><option value="">—</option>${respOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="fpStatus">${statusOpts}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor do Contrato (R$)</label>
            <input class="form-control" id="fpValor" type="number" value="${p?.valor||''}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input class="form-control" id="fpInicio" type="date" value="${p?.dataInicio||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo de Entrega</label>
            <input class="form-control" id="fpPrazo" type="date" value="${p?.prazo||''}">
          </div>
        </div>

        <!-- CUSTOS PARA RENTABILIDADE -->
        <div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-bottom:16px">
          <div class="font-bold text-sm mb-2">📊 Custos para Rentabilidade</div>
          <div class="form-row" style="margin:0">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Horas Trabalhadas</label>
              <input class="form-control" id="fpHoras" type="number" step="0.5" value="${p?.horasTrabalhadas||''}" placeholder="0">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Custo/Hora (R$)</label>
              <input class="form-control" id="fpValorHora" type="number" step="0.01" value="${p?.valorHora||''}" placeholder="Ex: 120">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Custos Diretos (R$)</label>
              <input class="form-control" id="fpCustosDiretos" type="number" step="0.01" value="${p?.custosDirectos||''}" placeholder="Deslocamento, materiais...">
            </div>
          </div>
        </div>

        <!-- ART -->
        <div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-bottom:16px;border-left:3px solid ${p?.art?.numero ? '#10b981' : '#ef4444'}">
          <div class="font-bold text-sm mb-2">📜 ART — Anotação de Responsabilidade Técnica</div>
          <div class="form-row" style="margin:0">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Número da ART</label>
              <input class="form-control" id="fpArtNumero" value="${Utils.escHtml(p?.art?.numero||'')}" placeholder="Ex: 2026000123456">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Data de Registro</label>
              <input class="form-control" id="fpArtData" type="date" value="${p?.art?.data||''}">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Engenheiro Responsável</label>
              <input class="form-control" id="fpArtEng" value="${Utils.escHtml(p?.art?.engResponsavel||'')}" placeholder="Nome do engenheiro">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Status da ART</label>
              <select class="form-control" id="fpArtStatus">
                ${[['pendente','⏳ Pendente'],['registrada','✅ Registrada'],['baixada','🏁 Baixada'],['cancelada','❌ Cancelada']]
                  .map(([v,l]) => `<option value="${v}" ${(p?.art?.status||'pendente')===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row" style="margin:8px 0 0">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Valor da ART (R$)</label>
              <input class="form-control" id="fpArtValor" type="number" step="0.01" value="${p?.art?.valor||''}" placeholder="0,00">
            </div>
            <div class="form-group" style="flex:3;margin-bottom:0">
              <label class="form-label">Link / Arquivo (URL ou caminho)</label>
              <input class="form-control" id="fpArtLink" value="${Utils.escHtml(p?.art?.link||'')}" placeholder="https://... ou caminho do arquivo">
            </div>
          </div>
        </div>

        <!-- Checklist de Entrega -->
        <div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-bottom:16px">
          <div class="flex items-center justify-between mb-2">
            <div class="font-bold text-sm">📦 Checklist de Entrega</div>
            <button type="button" class="btn btn-xs btn-secondary" onclick="Projetos.addChecklistItem()">+ Item</button>
          </div>
          <div id="fpChecklist">
            ${(p?.checklist||[]).map((item,i) => `
              <div class="checklist-item" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
                <input type="checkbox" ${item.concluido?'checked':''} onchange="Projetos.toggleChecklistItem(${i},this.checked)" style="flex-shrink:0">
                <input class="form-control" style="flex:1;padding:4px 8px;height:auto" value="${Utils.escHtml(item.texto)}" placeholder="Ex: Laudo técnico, Relatório fotográfico...">
                <button type="button" class="btn btn-xs btn-danger" onclick="this.closest('.checklist-item').remove()">✕</button>
              </div>`).join('')}
            ${(p?.checklist||[]).length===0 ? `<div class="text-xs text-muted">Ex: Laudo, Relatório, Desenho técnico, Certificado, ART baixada...</div>` : ''}
          </div>
        </div>

        <div class="form-row mb-2">
          <div class="form-group">
            <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
              <input type="checkbox" id="fpNf" ${p?.nfEmitida?'checked':''}>
              <span class="form-label" style="margin:0">NF Emitida</span>
            </label>
          </div>
          <div class="form-group">
            <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
              <input type="checkbox" id="fpPgto" ${p?.pagamentoRecebido?'checked':''}>
              <span class="form-label" style="margin:0">Pagamento Recebido</span>
            </label>
          </div>
          <div class="form-group">
            <label class="form-label">NPS do Cliente (pós-serviço)</label>
            <select class="form-control" id="fpNpsCliente">
              <option value="">Não avaliado</option>
              ${[5,4,3,2,1].map(n => `<option value="${n}" ${p?.npsCliente==n?'selected':''}>${'⭐'.repeat(n)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <div class="flex items-center justify-between mb-2">
            <label class="form-label">Etapas do Projeto</label>
            <button class="btn btn-xs btn-secondary" type="button" onclick="Projetos.addEtapa()">+ Etapa</button>
          </div>
          <div id="etapasContainer">${etapasHtml}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fpObs" rows="2">${Utils.escHtml(p?.observacoes||'')}</textarea>
        </div>
      `,
      saveCb: () => saveProjeto(id),
    });
  }

  function renderEtapaRow(e, i) {
    const statOpts = [['pendente','Pendente'],['em_andamento','Em Andamento'],['concluida','Concluída']].map(([k,l]) => `<option value="${k}" ${e.status===k?'selected':''}>${l}</option>`).join('');
    return `<div class="form-row etapa-row" data-idx="${i}" style="align-items:flex-end;background:var(--bg);padding:8px;border-radius:var(--radius);margin-bottom:8px">
      <div class="form-group" style="flex:3;margin:0">
        <label class="form-label">Nome da Etapa</label>
        <input class="form-control etapa-nome" value="${Utils.escHtml(e.nome||'')}" placeholder="Ex: Levantamento de campo">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Início</label>
        <input class="form-control etapa-inicio" type="date" value="${e.inicio||''}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Fim</label>
        <input class="form-control etapa-fim" type="date" value="${e.fim||''}">
      </div>
      <div class="form-group" style="width:60px;margin:0">
        <label class="form-label">%</label>
        <input class="form-control etapa-pct" type="number" min="0" max="100" value="${e.pct||0}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Status</label>
        <select class="form-control etapa-status">${statOpts}</select>
      </div>
      <button type="button" class="btn btn-xs btn-danger" onclick="this.closest('.etapa-row').remove()" style="margin-bottom:1px">✕</button>
    </div>`;
  }

  function addEtapa() {
    const container = document.getElementById('etapasContainer');
    if (!container) return;
    const i = container.querySelectorAll('.etapa-row').length;
    const div = document.createElement('div');
    div.innerHTML = renderEtapaRow({ nome:'', inicio:'', fim:'', pct:0, status:'pendente' }, i);
    container.appendChild(div.firstElementChild);
  }

  function collectEtapas(projetoId) {
    // Carrega etapas originais para preservar campos extras (vincPagamento, recebiveisId, etc.)
    const original = projetoId ? (DB.get('projetos', projetoId)?.etapas || []) : [];
    const rows = document.querySelectorAll('.etapa-row');
    return [...rows].map((row, i) => {
      const nome = row.querySelector('.etapa-nome')?.value || '';
      const orig = original.find(e => e.nome === nome) || original[i] || {};
      return {
        ...orig, // preserva vincPagamento, valorPagamento, etapaNome, etc.
        nome,
        inicio: row.querySelector('.etapa-inicio')?.value || '',
        fim: row.querySelector('.etapa-fim')?.value || '',
        pct: Number(row.querySelector('.etapa-pct')?.value) || 0,
        status: row.querySelector('.etapa-status')?.value || 'pendente',
      };
    }).filter(e => e.nome.trim());
  }

  function saveProjeto(id) {
    const titulo = document.getElementById('fpTitulo').value.trim();
    if (!titulo) { Toast.error('Título obrigatório'); return; }
    // Coleta checklist do DOM
    const checklistItems = [...document.querySelectorAll('#fpChecklist .checklist-item')].map(row => ({
      texto: row.querySelector('input[type=text], input:not([type=checkbox])') ?
        (row.querySelector('input:not([type=checkbox])')?.value || '') : '',
      concluido: row.querySelector('input[type=checkbox]')?.checked || false,
    })).filter(i => i.texto.trim());

    const data = {
      titulo,
      ordemServico: document.getElementById('fpOrdemServico').value.trim(),
      codigo: document.getElementById('fpCodigo').value,
      clienteId: document.getElementById('fpCliente').value,
      responsavel: document.getElementById('fpResponsavel').value,
      status: document.getElementById('fpStatus').value,
      valor: Number(document.getElementById('fpValor').value) || 0,
      dataInicio: document.getElementById('fpInicio').value,
      prazo: document.getElementById('fpPrazo').value,
      horasTrabalhadas: Number(document.getElementById('fpHoras').value) || 0,
      valorHora: Number(document.getElementById('fpValorHora').value) || 0,
      custosDirectos: Number(document.getElementById('fpCustosDiretos').value) || 0,
      nfEmitida: document.getElementById('fpNf').checked,
      pagamentoRecebido: document.getElementById('fpPgto').checked,
      npsCliente: Number(document.getElementById('fpNpsCliente').value) || null,
      art: {
        numero:        document.getElementById('fpArtNumero').value.trim(),
        data:          document.getElementById('fpArtData').value,
        engResponsavel:document.getElementById('fpArtEng').value.trim(),
        status:        document.getElementById('fpArtStatus').value,
        valor:         Number(document.getElementById('fpArtValor').value) || 0,
        link:          document.getElementById('fpArtLink').value.trim(),
      },
      checklist: checklistItems,
      etapas: collectEtapas(id),
      observacoes: document.getElementById('fpObs').value,
    };

    // Alerta: projeto em andamento sem ART
    if (data.status === 'em_andamento' && !data.art.numero) {
      Toast.warning('⚠ Projeto em andamento sem ART registrada! Lembre-se de registrar a ART.', 6000);
    }
    if (id) {
      const anterior = DB.get('projetos', id);
      const statusAnterior = anterior?.status;
      const etapasAntes = anterior?.etapas || [];
      DB.update('projetos', id, data);
      Toast.success('Projeto atualizado');

      // Hook: ao entrar em andamento, sugere configurar recebimentos
      if (statusAnterior !== 'em_andamento' && data.status === 'em_andamento') {
        if (typeof ProjetoFinanceiro !== 'undefined') {
          ProjetoFinanceiro.sugerirConfiguracaoPagamentos(id);
        }
      }

      // Hook: etapa concluída com pagamento vinculado → solicita confirmação
      const novasConcluidas = (data.etapas || []).filter(e => {
        const antes = etapasAntes.find(a => a.nome === e.nome);
        return e.status === 'concluida' && antes?.status !== 'concluida' && e.vincPagamento;
      });
      if (novasConcluidas.length > 0) {
        _checarPagamentosEtapa(id, novasConcluidas);
      }

      // Hook: projeto inteiro concluído → checa todos os recebíveis pendentes
      if (statusAnterior !== 'concluido' && data.status === 'concluido') {
        _checarTodosPagamentos(id);
      }

    } else {
      DB.create('projetos', data);
      Toast.success('Projeto criado');
    }
    Modal.close();
    render();
  }

  function deleteProjeto(id) {
    const p = DB.get('projetos', id);
    Utils.confirmDelete(p?.titulo || 'este projeto', () => {
      DB.remove('projetos', id);
      Toast.success('Projeto removido');
      render();
    });
  }

  /* ====================================================
     HOOKS DE PAGAMENTO POR ETAPA / CONCLUSÃO
     ==================================================== */
  function _checarPagamentosEtapa(projetoId, etapasConcluidas) {
    const p = DB.get('projetos', projetoId);
    if (!p) return;
    const fin = p.financeiro || {};
    const recs = fin.recebimentos || [];

    // Para cada etapa recém-concluída, busca o recebimento vinculado pelo nome
    etapasConcluidas.forEach(etapa => {
      const rec = recs.find(r =>
        r.status !== 'recebido' &&
        (r.etapaNome === etapa.nome || r.descricao?.includes(etapa.nome))
      );
      if (!rec) return;

      setTimeout(() => {
        Modal.open({
          title: '💰 Etapa Concluída — Confirmar Recebimento',
          size: 'modal-sm',
          body: `
            <div style="background:#f0fdf4;border-radius:var(--radius);padding:12px;margin-bottom:14px">
              <div class="font-bold">✅ Etapa concluída: ${Utils.escHtml(etapa.nome)}</div>
              <div class="text-sm text-muted">Projeto: ${Utils.escHtml(p.titulo)}</div>
            </div>
            <p class="text-sm mb-3">
              Esta etapa tem um recebimento vinculado de <strong>${Utils.formatCurrency(rec.valor)}</strong>.
              O pagamento já foi recebido?
            </p>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data de Recebimento</label>
                <input class="form-control" id="phkData" type="date" value="${Utils.todayStr()}">
              </div>
              <div class="form-group">
                <label class="form-label">Forma de Pagamento</label>
                <select class="form-control" id="phkForma">
                  <option value="PIX">PIX</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>
          `,
          saveLabel: '✅ Sim, confirmar recebimento',
          cancelLabel: 'Ainda não recebi',
          saveCb: () => {
            if (typeof ProjetoFinanceiro !== 'undefined') {
              // Simula o marcarRecebido sem abrir outro modal
              rec.status = 'recebido';
              rec.dataRecebimento = document.getElementById('phkData').value;
              rec.formaPagamento  = document.getElementById('phkForma').value;
              if (rec.recebiveisId) {
                DB.update('recebiveis', rec.recebiveisId, {
                  status: 'recebido',
                  dataRecebimento: rec.dataRecebimento,
                });
              }
              DB.create('lancamentos', {
                descricao: `${p.titulo} — ${rec.descricao}`,
                valor: rec.valor,
                tipo: 'receita',
                data: rec.dataRecebimento,
                categoria: 'Serviços de Engenharia',
                formaPagamento: rec.formaPagamento,
                projetoId,
                origem: 'projeto_financeiro',
              });
              rec.lancadoFinanceiro = true;
              DB.update('projetos', projetoId, { financeiro: fin });
              Modal.close();
              Toast.success('Recebimento confirmado e lançado no financeiro!');
            }
          },
        });
      }, 500);
    });
  }

  function _checarTodosPagamentos(projetoId) {
    const p = DB.get('projetos', projetoId);
    if (!p) return;
    const recs = (p.financeiro?.recebimentos || []).filter(r => r.status !== 'recebido');
    if (recs.length === 0) return;

    setTimeout(() => {
      Toast.warning(
        `📋 Projeto <strong>${Utils.escHtml(p.titulo)}</strong> concluído com ` +
        `<strong>${recs.length}</strong> recebimento(s) pendente(s). ` +
        `<a href="#" onclick="ProjetoFinanceiro.open('${projetoId}');return false;" style="color:var(--primary);font-weight:600">` +
        `Acesse o Financeiro do Projeto →</a>`,
        10000
      );
    }, 600);
  }

  /* ---- Checklist helpers ---- */
  function addChecklistItem() {
    const container = document.getElementById('fpChecklist');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)';
    div.innerHTML = `
      <input type="checkbox" style="flex-shrink:0">
      <input class="form-control" style="flex:1;padding:4px 8px;height:auto" placeholder="Ex: Laudo técnico, Relatório...">
      <button type="button" class="btn btn-xs btn-danger" onclick="this.closest('.checklist-item').remove()">✕</button>`;
    container.appendChild(div);
  }

  function toggleChecklistItem(i, val) {
    // Apenas atualiza visualmente — salvo no saveProjeto via DOM scan
  }

  /* ---- OS auto-gerador ---- */
  function _nextOS() {
    const total = DB.getAll('projetos').filter(p => p.ordemServico).length + 1;
    return `OS-${new Date().getFullYear()}-${String(total).padStart(5,'0')}`;
  }

  function drillDown(tipo) {
    const hoje = new Date().toISOString().split('T')[0];
    const projetos = DB.getAll('projetos');
    const projetosFiltrados = _filtrarPorPeriodo(projetos, 'dataInicio');
    let title = '', items = [], cols = [], rowFn = () => [];

    if (tipo === 'em_andamento') {
      title = 'Em Andamento';
      items = projetos.filter(p => p.status === 'em_andamento');
      cols = ['Projeto', 'Cliente', 'Responsável', 'Prazo'];
      rowFn = p => {
        const c = DB.get('clientes', p.clienteId);
        const nomeCliente = c?.nome || '—';
        return [
          Utils.escHtml(p.titulo),
          Utils.escHtml(nomeCliente),
          Utils.escHtml(p.responsavel || '—'),
          Utils.formatDate(p.prazo),
        ];
      };
    } else if (tipo === 'atrasados') {
      title = 'Atrasados';
      items = projetos.filter(p => p.status === 'em_andamento' && Utils.isOverdue(p.prazo));
      cols = ['Projeto', 'Prazo', 'Dias Atraso', 'Responsável'];
      rowFn = p => {
        const dias = Utils.daysUntil(p.prazo);
        const diasStr = dias !== null ? `<span style="color:#ef4444;font-weight:600">${Math.abs(dias)}d</span>` : '—';
        return [
          Utils.escHtml(p.titulo),
          Utils.formatDate(p.prazo),
          diasStr,
          Utils.escHtml(p.responsavel || '—'),
        ];
      };
    } else if (tipo === 'concluidos') {
      title = 'Concluídos';
      items = projetosFiltrados.filter(p => p.status === 'concluido');
      cols = ['Projeto', 'Cliente', 'Prazo', 'Responsável'];
      rowFn = p => {
        const c = DB.get('clientes', p.clienteId);
        const nomeCliente = c?.nome || '—';
        return [
          Utils.escHtml(p.titulo),
          Utils.escHtml(nomeCliente),
          Utils.formatDate(p.prazo),
          Utils.escHtml(p.responsavel || '—'),
        ];
      };
    } else if (tipo === 'sem_art') {
      title = 'Sem ART';
      items = projetos.filter(p => p.status === 'em_andamento' && !p.art?.numero);
      cols = ['Projeto', 'Cliente', 'Responsável'];
      rowFn = p => {
        const c = DB.get('clientes', p.clienteId);
        const nomeCliente = c?.nome || '—';
        return [
          Utils.escHtml(p.titulo),
          Utils.escHtml(nomeCliente),
          Utils.escHtml(p.responsavel || '—'),
        ];
      };
    }

    if (!items) return;
    Modal.open({
      title: `${title} — ${items.length} registro(s)`,
      body: `
        <div style="max-height:55vh;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:var(--surface-2,#f8fafc);position:sticky;top:0">
              ${cols.map(c=>`<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border)">${c}</th>`).join('')}
            </tr></thead>
            <tbody>${items.length ? items.map(item => {
              const cells = rowFn(item);
              return `<tr style="border-bottom:1px solid var(--border);cursor:pointer"
                onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
                ${cells.map(v=>`<td style="padding:8px 12px">${v}</td>`).join('')}</tr>`;
            }).join('') : `<tr><td colspan="${cols.length}" style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`}
            </tbody>
          </table>
        </div>`,
      saveCb: null,
    });
    setTimeout(() => { const f=document.getElementById('modalFoot'); if(f) f.style.display='none'; }, 0);
  }

  function addNew() { openForm(); }

  return { render, openForm, saveProjeto, deleteProjeto, view, setFilter, addEtapa, addNew, verRentabilidade, addChecklistItem, toggleChecklistItem, _nextOS, setPeriodo, drillDown };
})();
