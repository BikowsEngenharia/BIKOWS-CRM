/* ==========================================
   PROJETOS — Gestão de execução + Rentabilidade
   ========================================== */
const Projetos = (() => {

  let _periodo = 'tudo'; // 'mes' | 'trimestre' | 'semestre' | 'ano' | 'tudo'
  let _tabProjetos = 'andamento'; // 'andamento' | 'concluidos' | 'todos'

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

  function setTabProjetos(t) {
    _tabProjetos = t;
    _filter.status = ''; // limpar filtro de status ao trocar de aba
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

    // Filtrar por aba principal
    let list = projetos;
    if (_tabProjetos === 'andamento') list = list.filter(p => !['concluido','cancelado'].includes(p.status));
    else if (_tabProjetos === 'concluidos') list = list.filter(p => p.status === 'concluido');
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

      <!-- Tabs principais -->
      <div class="fin-tabs" style="margin-bottom:16px">
        <button class="fin-tab ${_tabProjetos==='andamento'?'active':''}" onclick="Projetos.setTabProjetos('andamento')">🔧 Em Andamento <span style="font-size:11px;opacity:.7">(${projetos.filter(p=>!['concluido','cancelado'].includes(p.status)).length})</span></button>
        <button class="fin-tab ${_tabProjetos==='concluidos'?'active':''}" onclick="Projetos.setTabProjetos('concluidos')">✅ Concluídos <span style="font-size:11px;opacity:.7">(${projetos.filter(p=>p.status==='concluido').length})</span></button>
        <button class="fin-tab ${_tabProjetos==='todos'?'active':''}" onclick="Projetos.setTabProjetos('todos')">📋 Todos <span style="font-size:11px;opacity:.7">(${projetos.length})</span></button>
        <button class="fin-tab ${_tabProjetos==='arts'?'active':''}" onclick="Projetos.setTabProjetos('arts')">📜 ARTs <span style="font-size:11px;opacity:.7">(${DB.getAll('arts').length})</span></button>
        <button class="fin-tab ${_tabProjetos==='gantt'?'active':''}" onclick="Projetos.setTabProjetos('gantt')">📊 Gantt</button>
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

      ${_tabProjetos === 'arts' ? _renderArtsGlobal() : _tabProjetos === 'gantt' ? _renderGantt() : `
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
      </div>`}
    `;
  }

  /* ====================================================
     ARTs VISÃO GLOBAL — todas as ARTs de todos os projetos
     ==================================================== */
  function _renderArtsGlobal() {
    const arts = DB.getAll('arts');
    const projetos = DB.getAll('projetos');
    const artStatusLabel = { pendente:'⏳ Pendente', registrada:'✅ Registrada', baixada:'🏁 Baixada', cancelada:'❌ Cancelada' };
    const artStatusColor = { pendente:'#f59e0b', registrada:'#10b981', baixada:'#3b82f6', cancelada:'#ef4444' };

    const porStatus = { pendente: 0, registrada: 0, baixada: 0, cancelada: 0 };
    arts.forEach(a => { if (porStatus[a.status] !== undefined) porStatus[a.status]++; });

    // Projetos em andamento sem ART
    const projSemArt = projetos.filter(p => p.status === 'em_andamento' && !DB.getAll('arts').some(a => a.projetoId === p.id) && !p.art?.numero);

    return `
      <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:16px">
        <div class="kpi-card" style="--kpi-color:#64748b"><div class="kpi-label">Total ARTs</div><div class="kpi-value">${arts.length}</div><div class="kpi-icon">📜</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Registradas</div><div class="kpi-value">${porStatus.registrada}</div><div class="kpi-icon">✅</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b"><div class="kpi-label">Pendentes</div><div class="kpi-value">${porStatus.pendente}</div><div class="kpi-icon">⏳</div></div>
        <div class="kpi-card" style="--kpi-color:#3b82f6"><div class="kpi-label">Baixadas</div><div class="kpi-value">${porStatus.baixada}</div><div class="kpi-icon">🏁</div></div>
        <div class="kpi-card" style="--kpi-color:${projSemArt.length > 0 ? '#ef4444' : '#10b981'}"><div class="kpi-label">Proj. sem ART</div><div class="kpi-value">${projSemArt.length}</div><div class="kpi-icon">⚠</div></div>
      </div>

      ${projSemArt.length > 0 ? `
      <div class="card mb-4" style="border-left:4px solid #ef4444">
        <div class="card-header"><div class="card-title" style="color:#ef4444">⚠ Projetos em Andamento sem ART (${projSemArt.length})</div></div>
        <div class="card-body" style="padding:0 16px 16px">
          ${projSemArt.map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <div>
                <div class="font-bold text-sm">${Utils.escHtml(p.titulo)}</div>
                <div class="text-xs text-muted">${Utils.escHtml(Utils.getClientName(p.clienteId))} · Prazo: ${Utils.formatDate(p.prazo)}</div>
              </div>
              <button class="btn btn-xs btn-primary" onclick="Projetos.view('${p.id}','arts')">+ Registrar ART</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <div class="card-title">📜 Todas as ARTs</div>
          <span class="text-sm text-muted">${arts.length} registros</span>
        </div>
        ${arts.length === 0 ? `
          <div class="card-body"><div class="empty-state"><div class="empty-icon">📜</div><div class="empty-title">Nenhuma ART cadastrada</div><div class="empty-sub">Abra um projeto e registre as ARTs na aba "ARTs"</div></div></div>` : `
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Número ART</th><th>Tipo</th><th>Projeto</th><th>Cliente</th><th>Responsável</th><th>Emissão</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${arts.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(a => {
                const proj = projetos.find(p => p.id === a.projetoId);
                const cor = artStatusColor[a.status] || '#94a3b8';
                return `<tr>
                  <td class="font-bold text-sm" style="color:var(--primary)">${Utils.escHtml(a.numero||'—')}</td>
                  <td class="text-sm">${Utils.escHtml(a.tipo||'—')}</td>
                  <td class="text-sm">${proj ? Utils.escHtml(Utils.truncate(proj.titulo, 30)) : '—'}</td>
                  <td class="text-sm">${proj ? Utils.escHtml(Utils.getClientName(proj.clienteId)||'—') : '—'}</td>
                  <td class="text-sm">${Utils.escHtml(a.responsavel||'—')}</td>
                  <td class="text-sm text-muted">${Utils.formatDate(a.dataEmissao)}</td>
                  <td class="text-sm">${a.valor ? Utils.formatCurrency(a.valor) : '—'}</td>
                  <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:${cor}20;color:${cor};border:1px solid ${cor}44">${artStatusLabel[a.status]||a.status}</span></td>
                  <td>
                    <div class="tbl-actions">
                      ${a.link ? `<a href="${Utils.escHtml(a.link)}" target="_blank" class="btn btn-xs btn-secondary">🔗</a>` : ''}
                      ${proj ? `<button class="btn btn-xs btn-secondary" onclick="Projetos.view('${proj.id}','arts')">Ver Projeto</button>` : ''}
                      <button class="btn btn-xs btn-secondary" onclick="Projetos.abrirFormART('${a.projetoId}','${a.id}')">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Projetos.removerART('${a.projetoId}','${a.id}');Projetos.setTabProjetos('arts')">🗑</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
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

  /* ====================================================
     CHECKLIST TEMPLATES (Melhoria 3)
     ==================================================== */
  const _CHECKLIST_TEMPLATES = {
    'NR-12': [
      'Inventário de máquinas e equipamentos',
      'Análise de risco das máquinas',
      'Laudo técnico NR-12',
      'Relatório fotográfico antes/depois',
      'Memorial descritivo das adequações',
      'Planilha de conformidades/não-conformidades',
      'ART registrada no CREA',
      'Treinamento dos operadores documentado',
      'Assinatura do responsável técnico',
    ],
    'NR-35': [
      'Análise de risco para trabalho em altura',
      'Plano de resgate documentado',
      'Inspeção dos EPIs (cadeirinha, trava-quedas, capacete)',
      'Laudo técnico NR-35',
      'Relatório fotográfico do local',
      'ART registrada no CREA',
      'Lista de presença do treinamento',
      'Certificados de treinamento dos trabalhadores',
    ],
    'NR-33': [
      'Identificação e classificação dos espaços confinados',
      'Análise de risco e PTE (Permissão de Trabalho em Espaço Confinado)',
      'Procedimento de entrada e saída',
      'Inspeção dos equipamentos de medição de gases',
      'Laudo técnico NR-33',
      'Relatório fotográfico',
      'ART registrada no CREA',
      'Treinamento da equipe documentado',
      'Plano de resgate aprovado',
    ],
    'Linha de Vida': [
      'Projeto executivo da linha de vida',
      'Memória de cálculo estrutural',
      'Especificação dos materiais (cabo, conectores, ancoragem)',
      'Laudo de resistência estrutural',
      'Relatório fotográfico da instalação',
      'Teste de carga documentado',
      'Manual de uso e manutenção',
      'ART registrada no CREA',
      'Certificado do fabricante do sistema',
    ],
    'Laudo Técnico Padrão': [
      'Vistoria técnica realizada',
      'Coleta de dados e medições',
      'Relatório fotográfico',
      'Análise e conclusão técnica',
      'Laudo técnico redigido e revisado',
      'ART registrada no CREA',
      'Assinatura digital do responsável técnico',
      'Entrega ao cliente com protocolo',
    ],
  };

  function aplicarTemplateChecklist(tipo) {
    const container = document.getElementById('fpChecklist');
    if (!container) return;
    const itens = _CHECKLIST_TEMPLATES[tipo];
    if (!itens) return;
    container.innerHTML = itens.map(texto => `
      <div class="checklist-item" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
        <input type="checkbox" style="flex-shrink:0">
        <input class="form-control" style="flex:1;padding:4px 8px;height:auto" value="${Utils.escHtml(texto)}" placeholder="Item do checklist">
        <button type="button" class="btn btn-xs btn-danger" onclick="this.closest('.checklist-item').remove()">✕</button>
      </div>`).join('');
    Toast.success(`Template "${tipo}" aplicado — ${itens.length} itens carregados.`);
  }

  /* ====================================================
     TIMESHEET — Banco de Horas (Melhoria 2)
     ==================================================== */
  function _renderTimesheetTab(projetoId) {
    const p = DB.get('projetos', projetoId);
    if (!p) return;
    const cfg = DB.getConfig();
    const funcionarios = DB.getAll('funcionarios');
    const lancamentos = DB.getAll('timesheet').filter(t => t.projetoId === projetoId);
    const totalHoras = lancamentos.reduce((s, t) => s + (t.horas || 0), 0);
    const totalCusto = lancamentos.reduce((s, t) => s + ((t.horas || 0) * (t.custoHora || 0)), 0);
    const custoVsValor = p.valor > 0 ? Math.round((totalCusto / p.valor) * 100) : 0;

    const respOpts = [...cfg.responsaveis, ...funcionarios.map(f => f.nome)].filter(Boolean)
      .map(r => `<option value="${Utils.escHtml(r)}">${Utils.escHtml(r)}</option>`).join('');

    const el = document.getElementById('viewProjetoTabContent');
    if (!el) return;
    el.innerHTML = `
      <!-- KPIs Timesheet -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center;border-left:3px solid var(--primary)">
          <div class="text-xs text-muted">Total de Horas</div>
          <div class="font-bold" style="font-size:22px;color:var(--primary)">${totalHoras.toFixed(1)}h</div>
        </div>
        <div style="background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center;border-left:3px solid #ef4444">
          <div class="text-xs text-muted">Custo Total Mão de Obra</div>
          <div class="font-bold" style="font-size:18px;color:#ef4444">${Utils.formatCurrency(totalCusto)}</div>
        </div>
        <div style="background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center;border-left:3px solid ${custoVsValor > 60 ? '#ef4444' : custoVsValor > 30 ? '#f59e0b' : '#10b981'}">
          <div class="text-xs text-muted">Custo MO / Valor Projeto</div>
          <div class="font-bold" style="font-size:18px;color:${custoVsValor > 60 ? '#ef4444' : custoVsValor > 30 ? '#f59e0b' : '#10b981'}">${custoVsValor}%</div>
        </div>
      </div>

      <!-- Formulário Lançar Horas -->
      <div style="background:var(--bg);border-radius:var(--radius);padding:14px;margin-bottom:16px;border:1px solid var(--border)">
        <div class="font-bold text-sm mb-3">+ Lançar Horas</div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 2fr auto;gap:8px;align-items:end">
          <div>
            <div class="text-xs text-muted mb-1">Funcionário / Responsável</div>
            <select class="form-control" id="tsFunc" style="height:34px;padding:4px 8px">
              <option value="">—</option>${respOpts}
            </select>
          </div>
          <div>
            <div class="text-xs text-muted mb-1">Data</div>
            <input class="form-control" id="tsData" type="date" value="${Utils.todayStr()}" style="height:34px;padding:4px 8px">
          </div>
          <div>
            <div class="text-xs text-muted mb-1">Horas</div>
            <input class="form-control" id="tsHoras" type="number" min="0.5" step="0.5" placeholder="Ex: 4" style="height:34px;padding:4px 8px">
          </div>
          <div>
            <div class="text-xs text-muted mb-1">Custo/h (R$)</div>
            <input class="form-control" id="tsCusto" type="number" step="0.01" placeholder="Ex: 120" style="height:34px;padding:4px 8px">
          </div>
          <div>
            <div class="text-xs text-muted mb-1">Descrição</div>
            <input class="form-control" id="tsDesc" placeholder="Ex: Levantamento de campo" style="height:34px;padding:4px 8px">
          </div>
          <button class="btn btn-primary" onclick="Projetos.salvarTimesheet('${projetoId}')" style="height:34px;white-space:nowrap">+ Lançar</button>
        </div>
      </div>

      <!-- Listagem de lançamentos -->
      ${lancamentos.length === 0 ? `<div class="text-muted text-sm" style="text-align:center;padding:32px">Nenhuma hora lançada. Use o formulário acima para registrar as horas trabalhadas.</div>` : `
      <table class="tbl">
        <thead><tr><th>Data</th><th>Funcionário</th><th>Horas</th><th>Custo/h</th><th>Custo Total</th><th>Descrição</th><th></th></tr></thead>
        <tbody>
          ${lancamentos.sort((a,b) => (b.data||'').localeCompare(a.data||'')).map(t => `
            <tr>
              <td class="text-sm">${Utils.formatDate(t.data)}</td>
              <td class="text-sm">${Utils.escHtml(t.funcionarioNome||'—')}</td>
              <td class="font-bold">${(t.horas||0).toFixed(1)}h</td>
              <td class="text-sm text-muted">${t.custoHora ? Utils.formatCurrency(t.custoHora) : '—'}</td>
              <td class="font-bold" style="color:#ef4444">${t.custoHora ? Utils.formatCurrency((t.horas||0)*(t.custoHora||0)) : '—'}</td>
              <td class="text-sm text-muted">${Utils.escHtml(t.descricao||'')}</td>
              <td><button class="btn btn-xs btn-danger" onclick="Projetos.removerTimesheet('${projetoId}','${t.id}')">🗑</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    `;
  }

  function salvarTimesheet(projetoId) {
    const funcionarioNome = document.getElementById('tsFunc')?.value.trim();
    const data = document.getElementById('tsData')?.value;
    const horas = Number(document.getElementById('tsHoras')?.value) || 0;
    const custoHora = Number(document.getElementById('tsCusto')?.value) || 0;
    const descricao = document.getElementById('tsDesc')?.value.trim() || '';
    if (!data || horas <= 0) { Toast.error('Data e horas são obrigatórios'); return; }
    DB.create('timesheet', { projetoId, funcionarioNome, data, horas, custoHora, descricao });
    Toast.success(`${horas}h lançada(s) com sucesso!`);
    _renderTimesheetTab(projetoId);
  }

  function removerTimesheet(projetoId, tsId) {
    Confirm.show('Remover lançamento', 'Tem certeza que deseja remover este lançamento de horas?', () => {
      DB.remove('timesheet', tsId);
      Toast.success('Lançamento removido');
      _renderTimesheetTab(projetoId);
    });
  }

  /* ====================================================
     ARTs — Aba dedicada (Melhoria 4)
     ==================================================== */
  function _renderArtsTab(projetoId) {
    const p = DB.get('projetos', projetoId);
    if (!p) return;
    const arts = DB.getAll('arts').filter(a => a.projetoId === projetoId);
    const artStatusLabel = { pendente:'⏳ Pendente', registrada:'✅ Registrada', baixada:'🏁 Baixada', cancelada:'❌ Cancelada' };
    const artStatusColor = { pendente:'#f59e0b', registrada:'#10b981', baixada:'#3b82f6', cancelada:'#ef4444' };

    const el = document.getElementById('viewProjetoTabContent');
    if (!el) return;
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="font-bold text-sm">📜 ARTs — Anotações de Responsabilidade Técnica</div>
        <button class="btn btn-primary btn-sm" onclick="Projetos.abrirFormART('${projetoId}')">+ Nova ART</button>
      </div>
      ${arts.length === 0 ? `
        <div style="text-align:center;padding:32px;color:var(--text-muted)">
          ${p.status === 'em_andamento' ? '<div style="color:#ef4444;font-weight:600;margin-bottom:8px">⚠ Projeto em andamento sem ART registrada!</div>' : ''}
          <div class="text-sm">Nenhuma ART cadastrada. Clique em "+ Nova ART" para adicionar.</div>
        </div>` : `
      <table class="tbl">
        <thead><tr><th>Número</th><th>Tipo</th><th>Data Emissão</th><th>Responsável</th><th>Valor</th><th>Status</th><th>Obs</th><th>Ações</th></tr></thead>
        <tbody>
          ${arts.map(a => `
            <tr>
              <td class="font-bold text-sm" style="color:var(--primary)">${Utils.escHtml(a.numero||'—')}</td>
              <td class="text-sm">${Utils.escHtml(a.tipo||'—')}</td>
              <td class="text-sm">${Utils.formatDate(a.dataEmissao)}</td>
              <td class="text-sm">${Utils.escHtml(a.responsavel||'—')}</td>
              <td class="text-sm">${a.valor ? Utils.formatCurrency(a.valor) : '—'}</td>
              <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:${artStatusColor[a.status]||'#94a3b8'}20;color:${artStatusColor[a.status]||'#94a3b8'};border:1px solid ${artStatusColor[a.status]||'#94a3b8'}44">${artStatusLabel[a.status]||a.status}</span></td>
              <td class="text-xs text-muted" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.escHtml(a.observacao||'')}">${Utils.escHtml(a.observacao||'—')}</td>
              <td>
                <div class="tbl-actions">
                  ${a.link ? `<a href="${Utils.escHtml(a.link)}" target="_blank" class="btn btn-xs btn-secondary" title="Abrir link">🔗</a>` : ''}
                  <button class="btn btn-xs btn-secondary" onclick="Projetos.abrirFormART('${projetoId}','${a.id}')">✏</button>
                  <button class="btn btn-xs btn-danger" onclick="Projetos.removerART('${projetoId}','${a.id}')">🗑</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    `;
  }

  function abrirFormART(projetoId, artId = null) {
    const art = artId ? DB.get('arts', artId) : null;
    const cfg = DB.getConfig();
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${art?.responsavel===r?'selected':''}>${r}</option>`).join('');

    Modal.open({
      title: artId ? 'Editar ART' : 'Nova ART',
      size: 'modal-md',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Número da ART *</label>
            <input class="form-control" id="artNumero" value="${Utils.escHtml(art?.numero||'')}" placeholder="Ex: 2026000123456">
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Serviço</label>
            <input class="form-control" id="artTipo" value="${Utils.escHtml(art?.tipo||'')}" placeholder="Ex: NR-12, Projeto Elétrico...">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de Emissão</label>
            <input class="form-control" id="artDataEmissao" type="date" value="${art?.dataEmissao||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Engenheiro Responsável</label>
            <select class="form-control" id="artResponsavel">
              <option value="">—</option>${respOpts}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="artStatus">
              ${[['pendente','⏳ Pendente'],['registrada','✅ Registrada'],['baixada','🏁 Baixada'],['cancelada','❌ Cancelada']]
                .map(([v,l]) => `<option value="${v}" ${(art?.status||'pendente')===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor da ART (R$)</label>
            <input class="form-control" id="artValor" type="number" step="0.01" value="${art?.valor||''}" placeholder="0,00">
          </div>
          <div class="form-group" style="flex:3">
            <label class="form-label">Link / Arquivo (URL)</label>
            <input class="form-control" id="artLink" value="${Utils.escHtml(art?.link||'')}" placeholder="https://...">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="artObs" rows="2">${Utils.escHtml(art?.observacao||'')}</textarea>
        </div>
      `,
      saveCb: () => {
        const numero = document.getElementById('artNumero').value.trim();
        if (!numero) { Toast.error('Número da ART é obrigatório'); return; }
        const data = {
          projetoId,
          numero,
          tipo: document.getElementById('artTipo').value.trim(),
          dataEmissao: document.getElementById('artDataEmissao').value,
          responsavel: document.getElementById('artResponsavel').value,
          status: document.getElementById('artStatus').value,
          valor: Number(document.getElementById('artValor').value) || 0,
          link: document.getElementById('artLink').value.trim(),
          observacao: document.getElementById('artObs').value.trim(),
        };
        if (artId) {
          DB.update('arts', artId, data);
          Toast.success('ART atualizada!');
        } else {
          DB.create('arts', data);
          Toast.success('ART cadastrada!');
        }
        // Reabrir view do projeto na aba ARTs
        setTimeout(() => { view(projetoId, 'arts'); }, 300);
      },
    });
  }

  function removerART(projetoId, artId) {
    const a = DB.get('arts', artId);
    Confirm.show('Remover ART', `Remover ART ${a?.numero || ''}?`, () => {
      DB.remove('arts', artId);
      Toast.success('ART removida');
      _renderArtsTab(projetoId);
    });
  }

  /* ====================================================
     VIEW COM ABAS (Melhoria 2, 3, 4)
     ==================================================== */
  function view(id, abaInicial = 'overview') {
    const p = DB.get('projetos', id);
    if (!p) return;
    const etapas = p.etapas || [];
    const pct = etapas.length ? Math.round(etapas.reduce((s,e)=>s+(e.pct||0),0)/etapas.length) : 0;
    const rent = _calcRentabilidade(p);
    const margemColor = rent.margemPct >= 40 ? 'var(--success)' : rent.margemPct >= 20 ? 'var(--warning)' : rent.custoTotal > 0 ? 'var(--danger)' : 'var(--text-muted)';

    // ART display (inline, aba overview)
    const artInline = p.art || {};
    const artStatusLabel = { pendente:'⏳ Pendente', registrada:'✅ Registrada', baixada:'🏁 Baixada', cancelada:'❌ Cancelada' };
    const artsEntity = DB.getAll('arts').filter(a => a.projetoId === id);
    const artColor = artsEntity.length > 0 ? '#10b981' : (artInline.numero ? '#f59e0b' : (p.status === 'em_andamento' ? '#ef4444' : '#94a3b8'));

    // Checklist
    const checklist = p.checklist || [];
    const checkDone = checklist.filter(c => c.concluido).length;
    const checkPct = checklist.length ? Math.round(checkDone / checklist.length * 100) : null;

    // NPS stars
    const npsStars = p.npsCliente ? '⭐'.repeat(p.npsCliente) + ` (${p.npsCliente}/5)` : '—';

    // Timesheet summary
    const tsLancamentos = DB.getAll('timesheet').filter(t => t.projetoId === id);
    const tsHoras = tsLancamentos.reduce((s, t) => s + (t.horas || 0), 0);

    function tabStyle(key) {
      const active = key === abaInicial;
      return `style="padding:8px 16px;border:none;border-bottom:2px solid ${active ? 'var(--primary)' : 'transparent'};background:transparent;font-weight:${active ? '700' : '400'};color:${active ? 'var(--primary)' : 'var(--text-muted)'};cursor:pointer;font-size:13px"`;
    }

    Modal.open({
      title: p.titulo,
      size: 'modal-lg',
      saveLabel: null,
      body: `
        <!-- CABEÇALHO: OS + badges principais -->
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
          ${p.ordemServico ? `<span style="background:var(--primary);color:#fff;font-weight:700;font-size:13px;padding:4px 12px;border-radius:99px">${Utils.escHtml(p.ordemServico)}</span>` : ''}
          ${p.codigo ? `<span style="background:var(--bg);color:var(--text-muted);font-size:12px;padding:3px 10px;border-radius:99px;border:1px solid var(--border)">${Utils.escHtml(p.codigo)}</span>` : ''}
          ${Utils.projBadge(p.status)}
          ${p.nfEmitida ? '<span class="badge badge-green text-xs">NF Emitida</span>' : '<span class="badge badge-gray text-xs">Sem NF</span>'}
          ${p.npsCliente ? `<span title="NPS do Cliente" style="font-size:13px">${npsStars}</span>` : ''}
          ${artsEntity.length === 0 && !artInline.numero && p.status === 'em_andamento' ? '<span style="background:#fef2f2;color:#ef4444;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #ef444440">⚠ SEM ART</span>' : ''}
        </div>

        <!-- TABS -->
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px">
          <button ${tabStyle('overview')} onclick="Projetos._switchViewTab('${id}','overview')">📋 Overview</button>
          <button ${tabStyle('horas')} onclick="Projetos._switchViewTab('${id}','horas')">⏱ Horas ${tsHoras > 0 ? `<span style="background:var(--primary);color:#fff;font-size:10px;padding:1px 6px;border-radius:99px;margin-left:4px">${tsHoras.toFixed(0)}h</span>` : ''}</button>
          <button ${tabStyle('arts')} onclick="Projetos._switchViewTab('${id}','arts')">📜 ARTs ${artsEntity.length > 0 ? `<span style="background:#10b981;color:#fff;font-size:10px;padding:1px 6px;border-radius:99px;margin-left:4px">${artsEntity.length}</span>` : ''}</button>
          <button ${tabStyle('docs')} onclick="Projetos._switchViewTab('${id}','docs')">📎 Documentos ${(() => { const nd = DB.getAll('documentos').filter(d => d.projetoId === id).length; return nd > 0 ? `<span style="background:#8b5cf6;color:#fff;font-size:10px;padding:1px 6px;border-radius:99px;margin-left:4px">${nd}</span>` : ''; })()}</button>
        </div>

        <div id="viewProjetoTabContent">
          ${_buildOverviewTab(id, p, etapas, pct, rent, margemColor, artInline, artColor, artStatusLabel, checklist, checkDone, checkPct)}
        </div>

        <div class="mt-4 flex gap-2" style="border-top:1px solid var(--border);padding-top:12px">
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Projetos.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-secondary btn-sm" onclick="Modal.close();ProjetoFinanceiro.open('${id}')">💰 Financeiro</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });

    // Se abaInicial não é 'overview', renderiza a aba correta
    if (abaInicial === 'horas') setTimeout(() => _renderTimesheetTab(id), 50);
    if (abaInicial === 'arts') setTimeout(() => _renderArtsTab(id), 50);
    if (abaInicial === 'docs') setTimeout(() => _renderDocsTab(id), 50);
  }

  function _switchViewTab(projetoId, aba) {
    // Atualiza estilos dos botões de aba
    const tabContainer = document.querySelector('#viewProjetoTabContent')?.previousElementSibling;
    if (tabContainer) {
      tabContainer.querySelectorAll('button').forEach(btn => {
        const isActive = btn.getAttribute('onclick')?.includes(`'${aba}'`);
        btn.style.borderBottom = isActive ? '2px solid var(--primary)' : '2px solid transparent';
        btn.style.fontWeight = isActive ? '700' : '400';
        btn.style.color = isActive ? 'var(--primary)' : 'var(--text-muted)';
      });
    }
    if (aba === 'overview') {
      const p = DB.get('projetos', projetoId);
      const etapas = p?.etapas || [];
      const pct = etapas.length ? Math.round(etapas.reduce((s,e)=>s+(e.pct||0),0)/etapas.length) : 0;
      const rent = _calcRentabilidade(p);
      const margemColor = rent.margemPct >= 40 ? 'var(--success)' : rent.margemPct >= 20 ? 'var(--warning)' : rent.custoTotal > 0 ? 'var(--danger)' : 'var(--text-muted)';
      const artInline = p?.art || {};
      const artStatusLabel = { pendente:'⏳ Pendente', registrada:'✅ Registrada', baixada:'🏁 Baixada', cancelada:'❌ Cancelada' };
      const artsEntity = DB.getAll('arts').filter(a => a.projetoId === projetoId);
      const artColor = artsEntity.length > 0 ? '#10b981' : (artInline.numero ? '#f59e0b' : (p?.status === 'em_andamento' ? '#ef4444' : '#94a3b8'));
      const checklist = p?.checklist || [];
      const checkDone = checklist.filter(c => c.concluido).length;
      const checkPct = checklist.length ? Math.round(checkDone / checklist.length * 100) : null;
      const el = document.getElementById('viewProjetoTabContent');
      if (el) el.innerHTML = _buildOverviewTab(projetoId, p, etapas, pct, rent, margemColor, artInline, artColor, artStatusLabel, checklist, checkDone, checkPct);
    } else if (aba === 'horas') {
      _renderTimesheetTab(projetoId);
    } else if (aba === 'arts') {
      _renderArtsTab(projetoId);
    } else if (aba === 'docs') {
      _renderDocsTab(projetoId);
    }
  }

  function _renderDocsTab(projetoId) {
    const el = document.getElementById('viewProjetoTabContent');
    if (!el) return;
    el.innerHTML = '<div id="docsProjeto" style="min-height:80px;padding:4px 0"></div>';
    if (typeof Documentos !== 'undefined') {
      Documentos.renderLista('docsProjeto', { projetoId });
    }
  }

  function _buildOverviewTab(id, p, etapas, pct, rent, margemColor, artInline, artColor, artStatusLabel, checklist, checkDone, checkPct) {
    return `
        <!-- GRID INFO PRINCIPAL -->
        <div class="detail-grid mb-3">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(Utils.getClientName(p.clienteId))}</div></div>
          <div class="detail-field"><div class="detail-label">Responsável</div><div class="detail-value">${Utils.escHtml(p.responsavel||'—')}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Contrato</div><div class="detail-value font-bold text-primary">${Utils.formatCurrency(p.valor)}</div></div>
          <div class="detail-field"><div class="detail-label">Início</div><div class="detail-value">${Utils.formatDate(p.dataInicio)}</div></div>
          <div class="detail-field"><div class="detail-label">Prazo</div><div class="detail-value">${Utils.formatDate(p.prazo)}</div></div>
          <div class="detail-field"><div class="detail-label">Pagamento</div><div class="detail-value">${p.pagamentoRecebido?'<span class="badge badge-green">Recebido</span>':'<span class="badge badge-gray">Pendente</span>'}</div></div>
        </div>

        <!-- ART (inline resumo) -->
        <div style="background:var(--bg);border-radius:var(--radius);padding:14px;margin-bottom:14px;border-left:4px solid ${artColor}">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div class="font-bold text-sm" style="color:${artColor}">📜 ART — Anotação de Responsabilidade Técnica</div>
            <button class="btn btn-xs btn-secondary" onclick="Projetos._switchViewTab('${id}','arts')">Ver ARTs →</button>
          </div>
          ${artInline.numero ? `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px">
              <div><div class="text-xs text-muted">Número</div><div class="font-bold text-sm">${Utils.escHtml(artInline.numero)}</div></div>
              <div><div class="text-xs text-muted">Status</div><div class="font-bold text-sm">${artStatusLabel[artInline.status]||artInline.status}</div></div>
              <div><div class="text-xs text-muted">Engenheiro</div><div class="text-sm">${Utils.escHtml(artInline.engResponsavel||'—')}</div></div>
            </div>
          ` : `<div class="text-sm mt-2" style="color:${artColor}">${p.status === 'em_andamento' ? '⚠ Nenhuma ART registrada. Clique em "Ver ARTs" para adicionar.' : 'Nenhuma ART registrada.'}</div>`}
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
          ${rent.custoTotal === 0 ? `<div class="text-xs text-muted mt-2">ℹ Registre horas e custos para ver a margem real. Use a aba ⏱ Horas.</div>` : ''}
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
    `;
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
            <div style="display:flex;gap:6px;align-items:center">
              <select class="form-control" style="height:28px;padding:2px 8px;font-size:12px" onchange="if(this.value){Projetos.aplicarTemplateChecklist(this.value);this.value=''}">
                <option value="">📋 Usar template...</option>
                ${Object.keys(_CHECKLIST_TEMPLATES).map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-xs btn-secondary" onclick="Projetos.addChecklistItem()">+ Item</button>
            </div>
          </div>
          <div id="fpChecklist">
            ${(p?.checklist||[]).map((item,i) => `
              <div class="checklist-item" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
                <input type="checkbox" ${item.concluido?'checked':''} onchange="Projetos.toggleChecklistItem(${i},this.checked)" style="flex-shrink:0">
                <input class="form-control" style="flex:1;padding:4px 8px;height:auto" value="${Utils.escHtml(item.texto)}" placeholder="Ex: Laudo técnico, Relatório fotográfico...">
                <button type="button" class="btn btn-xs btn-danger" onclick="this.closest('.checklist-item').remove()">✕</button>
              </div>`).join('')}
            ${(p?.checklist||[]).length===0 ? `<div class="text-xs text-muted">Selecione um template acima ou adicione itens manualmente.</div>` : ''}
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
      const novoProjeto = DB.create('projetos', data);
      Toast.success('Projeto criado');

      // Criar recebível automático quando o projeto tem valor definido
      if (data.valor > 0 && data.clienteId) {
        const hoje = new Date();
        const venc1 = new Date(hoje); venc1.setDate(venc1.getDate() + 30);
        const venc2 = new Date(hoje); venc2.setDate(venc2.getDate() + 60);
        const venc3 = new Date(hoje); venc3.setDate(venc3.getDate() + 90);
        const parc = Math.round((data.valor / 3) * 100) / 100;
        const parc3 = Math.round((data.valor - parc * 2) * 100) / 100; // ajusta arredondamento
        DB.create('recebiveis', {
          clienteId: data.clienteId,
          projetoId: novoProjeto.id,
          descricao: `${data.titulo} (${data.codigo || novoProjeto.id.substring(0,8)})`,
          valorTotal: data.valor,
          parcelas: [
            { id: Date.now().toString(36) + '1', vencimento: venc1.toISOString().split('T')[0], valor: parc,  status: 'a_vencer', dataPagamento: null, nfNumero: '' },
            { id: Date.now().toString(36) + '2', vencimento: venc2.toISOString().split('T')[0], valor: parc,  status: 'a_vencer', dataPagamento: null, nfNumero: '' },
            { id: Date.now().toString(36) + '3', vencimento: venc3.toISOString().split('T')[0], valor: parc3, status: 'a_vencer', dataPagamento: null, nfNumero: '' },
          ],
          origem: 'projeto_criado',
        });
        Toast.show('💰 Recebível criado automaticamente em 3 parcelas. Ajuste em Financeiro › Contas a Receber se necessário.', 'default', 7000);
      }
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

  /* ---- Gantt ---- */
  function _renderGantt() {
    const projetos = DB.getAll('projetos').filter(function(p){return p.dataInicio||p.prazo;});
    if (!projetos.length) return '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Nenhum projeto com datas</div><div class="empty-sub">Adicione data de início e prazo nos projetos para visualizar o Gantt</div></div>';
    const hoje = new Date();
    const inicioRange = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
    const fimRange = new Date(hoje.getFullYear(), hoje.getMonth() + 3, 0);
    const totalMs = fimRange - inicioRange;
    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const mesesHeader = [];
    let cur = new Date(inicioRange);
    while (cur <= fimRange) {
      const diasNoMes = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
      const diasVisiveis = Math.min(diasNoMes, Math.round((fimRange - cur) / 86400000) + 1);
      const pct = (diasVisiveis * 86400000 / totalMs * 100).toFixed(1);
      mesesHeader.push('<div style="width:'+pct+'%;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);padding:4px 0;border-right:1px solid var(--border)">'+MESES[cur.getMonth()]+' '+cur.getFullYear()+'</div>');
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    const hojePct = ((hoje - inicioRange) / totalMs * 100).toFixed(1);
    const COR_STATUS = { em_andamento:'#2563eb', concluido:'#10b981', cancelado:'#94a3b8', planejado:'#f59e0b' };
    const linhas = projetos.map(function(p){
      const ini = p.dataInicio ? new Date(p.dataInicio + 'T00:00:00') : null;
      const fim = p.prazo ? new Date(p.prazo + 'T00:00:00') : null;
      if (!ini && !fim) return '';
      const iniEf = ini || fim;
      const fimEf = fim || ini;
      const left = Math.max(0, Math.min(100, ((iniEf - inicioRange) / totalMs * 100)));
      const right = Math.max(0, Math.min(100, ((fimRange - fimEf) / totalMs * 100)));
      const width = Math.max(1, 100 - left - right);
      const cor = Utils.isOverdue(p.prazo) && p.status === 'em_andamento' ? '#dc2626' : (COR_STATUS[p.status] || '#7c3aed');
      const clienteNome = Utils.getClientName(p.clienteId);
      const etapas = p.etapas || [];
      const pctEtapas = etapas.length ? Math.round(etapas.filter(function(e){return e.status==='concluida'||e.concluida;}).length / etapas.length * 100) : null;
      return '<div style="display:flex;align-items:center;gap:0;border-bottom:1px solid var(--border);min-height:40px" onmouseover="this.style.background=\'var(--surface-2)\'" onmouseout="this.style.background=\'\'"><div style="width:220px;flex-shrink:0;padding:8px 12px;font-size:12px;border-right:1px solid var(--border)"><div class="font-bold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" title="'+Utils.escHtml(p.titulo)+'">'+Utils.escHtml(Utils.truncate(p.titulo, 28))+'</div><div style="font-size:10px;color:var(--text-muted)">'+Utils.escHtml(Utils.truncate(clienteNome, 28))+'</div>'+(pctEtapas!==null?'<div style="font-size:10px;color:var(--text-muted)">'+pctEtapas+'% etapas</div>':'')+'</div><div style="flex:1;position:relative;height:40px;cursor:pointer" onclick="Projetos.view(\''+p.id+'\')"><div style="position:absolute;left:'+left.toFixed(1)+'%;width:'+width.toFixed(1)+'%;height:24px;top:50%;transform:translateY(-50%);background:'+cor+';border-radius:4px;display:flex;align-items:center;padding:0 6px;min-width:4px;opacity:'+(p.status==='cancelado'?'0.5':'1')+'" title="'+Utils.escHtml(p.titulo)+' — '+Utils.formatDate(p.dataInicio)+' → '+Utils.formatDate(p.prazo)+'"><span style="font-size:10px;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(width > 8 ? Utils.escHtml(Utils.truncate(p.titulo, 20)) : '')+'</span></div><div style="position:absolute;left:'+hojePct+'%;top:0;bottom:0;width:2px;background:#dc2626;opacity:.5;pointer-events:none"></div></div></div>';
    }).filter(Boolean).join('');
    return '<div class="card" style="overflow:hidden"><div class="card-header" style="border-bottom:1px solid var(--border)"><div class="card-title">📊 Gantt — Linha do Tempo dos Projetos</div><div class="text-xs text-muted">Linha vermelha = hoje · Clique na barra para abrir o projeto</div></div><div style="overflow-x:auto"><div style="min-width:700px"><div style="display:flex;border-bottom:2px solid var(--border)"><div style="width:220px;flex-shrink:0;background:var(--surface-2);padding:6px 12px;font-size:11px;font-weight:700;color:var(--text-muted);border-right:1px solid var(--border)">PROJETO</div><div style="flex:1;display:flex;background:var(--surface-2)">'+mesesHeader.join('')+'</div></div>'+(linhas || '<div style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum projeto com datas definidas</div>')+'</div></div><div style="padding:8px 12px;display:flex;gap:16px;flex-wrap:wrap;border-top:1px solid var(--border)"><span style="font-size:11px;display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#2563eb;border-radius:2px;display:inline-block"></span>Em andamento</span><span style="font-size:11px;display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#dc2626;border-radius:2px;display:inline-block"></span>Atrasado</span><span style="font-size:11px;display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#10b981;border-radius:2px;display:inline-block"></span>Concluído</span><span style="font-size:11px;display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#f59e0b;border-radius:2px;display:inline-block"></span>Planejado</span><span style="font-size:11px;display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#94a3b8;border-radius:2px;display:inline-block"></span>Cancelado</span></div></div>';
  }

  function _etapaRowHtml(e, i) {
    return '<div class="etapa-row" data-i="'+i+'" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px;background:var(--surface-2,#f8fafc);border-radius:6px"><input type="checkbox" class="etapa-concluida" '+(e.concluida?'checked':'')+' style="width:16px;height:16px;accent-color:var(--success)"><input class="form-control etapa-nome" value="'+Utils.escHtml(e.nome||'')+'" placeholder="Nome da etapa" style="flex:2;margin:0"><input class="form-control etapa-prazo" type="date" value="'+(e.prazo||'')+'" style="flex:1;margin:0"><button type="button" class="btn btn-xs btn-danger" onclick="this.closest(\'.etapa-row\').remove()">✕</button></div>';
  }

  function _addEtapaRow() {
    const container = document.getElementById('etapasContainer');
    if (!container) return;
    const vazio = document.getElementById('etapasVazio');
    if (vazio) vazio.remove();
    const div = document.createElement('div');
    div.innerHTML = _etapaRowHtml({}, container.querySelectorAll('.etapa-row').length);
    container.appendChild(div.firstElementChild);
  }

  function _renderProgressoEtapas(proj) {
    const etapas = proj.etapas || [];
    if (!etapas.length) return '';
    const total = etapas.length;
    const concluidas = etapas.filter(function(e){return e.concluida || e.status==='concluida';}).length;
    const pct = Math.round((concluidas / total) * 100);
    return '<div style="margin:8px 0 4px"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px"><span>📋 Etapas: '+concluidas+'/'+total+' concluídas</span><span>'+pct+'%</span></div><div style="height:6px;background:var(--border);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(pct===100?'#10b981':'#2563eb')+';border-radius:4px;transition:width .3s"></div></div></div>';
  }

  function addNew() { openForm(); }

  return {
    render, openForm, saveProjeto, deleteProjeto, view, setFilter, addEtapa, addNew,
    verRentabilidade, addChecklistItem, toggleChecklistItem, aplicarTemplateChecklist,
    _nextOS, setPeriodo, setTabProjetos, drillDown,
    // Timesheet (Melhoria 2)
    salvarTimesheet, removerTimesheet,
    // ARTs (Melhoria 4)
    abrirFormART, removerART,
    // Tab switching
    _switchViewTab,
    // Gantt + progresso
    _renderGantt, _etapaRowHtml, _addEtapaRow, _renderProgressoEtapas,
  };
})();
