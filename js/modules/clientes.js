/* ==========================================
   CLIENTES — Gestão de empresas
   ========================================== */
const Clientes = (() => {

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

  let _filter = { search: '', segmento: '', porte: '', ativo: '' };

  function render() {
    const config = DB.getConfig();
    const clientes = DB.getAll('clientes');
    const leads = DB.getAll('leads');
    const projetos = DB.getAll('projetos');
    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const novosPeriodo = _filtrarPorPeriodo(clientes, 'createdAt').length;

    let list = clientes;
    if (_filter.search) {
      const s = _filter.search.toLowerCase();
      list = list.filter(c => c.nome?.toLowerCase().includes(s) || c.cnpj?.includes(s) || c.cidade?.toLowerCase().includes(s));
    }
    if (_filter.segmento) list = list.filter(c => c.segmento === _filter.segmento);
    if (_filter.porte) list = list.filter(c => c.porte === _filter.porte);
    if (_filter.ativo !== '') list = list.filter(c => String(c.ativo !== false) === _filter.ativo);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Clientes</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Clientes.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <label class="btn btn-secondary" style="cursor:pointer" title="Importar CSV com colunas: nome, cnpj, segmento, porte, cidade, estado, email, telefone">
            📥 Importar CSV
            <input type="file" accept=".csv,.txt" style="display:none" onchange="Clientes.importCSV(event)">
          </label>
          <button class="btn btn-secondary" onclick="Clientes.downloadCSVTemplate()">📋 Modelo CSV</button>
          <button class="btn btn-primary" onclick="Clientes.openForm()">+ Novo Cliente</button>
        </div>
      </div>

      <div class="stats-row mb-4">
        <div class="stat-box"><div class="stat-val">${clientes.length}</div><div class="stat-lbl">Total</div></div>
        <div class="stat-box"><div class="stat-val">${clientes.filter(c=>c.ativo!==false).length}</div><div class="stat-lbl">Ativos</div></div>
        <div class="stat-box" style="border-left:3px solid var(--primary)"><div class="stat-val" style="color:var(--primary)">${novosPeriodo}</div><div class="stat-lbl">Novos (${periodoLabels[_periodo]})</div></div>
        <div class="stat-box"><div class="stat-val">${[...new Set(clientes.map(c=>c.segmento).filter(Boolean))].length}</div><div class="stat-lbl">Segmentos</div></div>
        <div class="stat-box"><div class="stat-val">${[...new Set(clientes.map(c=>c.estado).filter(Boolean))].length}</div><div class="stat-lbl">Estados</div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <input class="form-control" style="max-width:220px" placeholder="Buscar empresa..." id="clientSearch"
              value="${Utils.escHtml(_filter.search)}" oninput="Clientes.setFilter('search',this.value)">
            <select class="filter-select" onchange="Clientes.setFilter('segmento',this.value)">
              <option value="">Todos os segmentos</option>
              ${config.segmentos.map(s => `<option value="${s}" ${_filter.segmento===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Clientes.setFilter('porte',this.value)">
              <option value="">Todos os portes</option>
              ${['Pequeno','Médio','Grande'].map(p => `<option value="${p}" ${_filter.porte===p?'selected':''}>${p}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Clientes.setFilter('ativo',this.value)">
              <option value="">Todos</option>
              <option value="true" ${_filter.ativo==='true'?'selected':''}>Ativos</option>
              <option value="false" ${_filter.ativo==='false'?'selected':''}>Inativos</option>
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} resultado(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? emptyState() : `
          <table class="tbl">
            <thead><tr>
              <th>Código</th><th>Empresa</th><th>CNPJ</th><th>Segmento</th><th>Porte</th>
              <th>Cidade/UF</th><th>Leads</th><th>OS</th><th>Faturado</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
            ${list.map(c => {
              const cLeads = leads.filter(l => l.clienteId === c.id).length;
              const cProj = projetos.filter(p => p.clienteId === c.id);
              const faturado = Utils.sum(cProj.filter(p => ['concluido','em_andamento'].includes(p.status)), 'valor');
              const npsStars = c.nps ? '⭐'.repeat(c.nps) : '';
              const avatarHtml = c.avatar
                ? `<img src="${c.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;border:1px solid var(--border)">`
                : `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;font-size:13px;font-weight:800;vertical-align:middle;margin-right:6px">${Utils.escHtml((c.nome||'?')[0].toUpperCase())}</span>`;
              return `<tr>
                <td class="text-xs font-bold text-muted">${Utils.escHtml(c.codigoCliente||'—')}</td>
                <td><div class="font-bold" style="display:flex;align-items:center">${avatarHtml}${Utils.escHtml(c.nome)}</div><div class="text-xs text-muted">${npsStars} ${Utils.escHtml(c.email||'')}</div></td>
                <td class="text-sm text-muted">${Utils.escHtml(c.cnpj||'—')}</td>
                <td>${c.segmento ? `<span class="badge badge-blue">${Utils.escHtml(c.segmento)}</span>` : '—'}</td>
                <td>${c.porte ? `<span class="badge badge-gray">${Utils.escHtml(c.porte)}</span>` : '—'}</td>
                <td class="text-sm">${Utils.escHtml([c.cidade, c.estado].filter(Boolean).join('/'))||'—'}</td>
                <td><span class="badge badge-purple">${cLeads}</span></td>
                <td><span class="badge badge-blue">${cProj.length}</span></td>
                <td class="text-sm font-bold ${faturado>0?'text-primary':''}">${faturado>0?Utils.formatCurrency(faturado):'—'}</td>
                <td>${c.ativo !== false ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
                <td>
                  <div class="tbl-actions">
                    <button class="btn btn-xs btn-secondary" onclick="Clientes.view('${c.id}')">Ver</button>
                    <button class="btn btn-xs btn-secondary" onclick="Clientes.openForm('${c.id}')">✏</button>
                    <button class="btn btn-xs btn-secondary" id="btnPortal_${c.id}" onclick="Clientes.gerarLinkPortal('${c.id}')" title="Gerar link do portal do cliente">🔗 Portal</button>
                    <button class="btn btn-xs btn-danger" onclick="Clientes.deleteCliente('${c.id}')">🗑</button>
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
    return `<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">Nenhum cliente encontrado</div><div class="empty-sub">Cadastre seu primeiro cliente para começar</div><button class="btn btn-primary mt-4" onclick="Clientes.openForm()">+ Cadastrar Cliente</button></div>`;
  }

  function setFilter(key, val) {
    _filter[key] = val;
    render();
  }

  function view(id) {
    const c = DB.get('clientes', id);
    if (!c) return;
    const leads     = DB.getAll('leads').filter(l => l.clienteId === id);
    const projetos  = DB.getAll('projetos').filter(p => p.clienteId === id);
    const contatos  = DB.getAll('contatos').filter(ct => ct.clienteId === id);
    const propostas = DB.getAll('propostas').filter(p => p.clienteId === id);
    const atividades= DB.getAll('atividades').filter(a => a.clienteId === id).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
    const recebiveis= DB.getAll('recebiveis').filter(r => r.clienteId === id);
    const receitaFechada = Utils.sum(leads.filter(l=>l.status==='fechado_ganho'),'valorFechado');
    let totalRecebido=0, totalPendente=0;
    recebiveis.forEach(r=>(r.parcelas||[]).forEach(p=>{ p.status==='recebido'?totalRecebido+=p.valor:totalPendente+=p.valor; }));

    Modal.open({
      title: c.nome,
      size: 'modal-lg',
      body: `
        <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px;padding:16px;background:var(--bg);border-radius:var(--radius)">
          ${c.avatar
            ? `<img src="${c.avatar}" style="width:52px;height:52px;border-radius:var(--radius-full);object-fit:cover;flex-shrink:0;border:2px solid var(--primary)">`
            : `<div style="width:52px;height:52px;border-radius:var(--radius-full);background:var(--primary);color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${Utils.escHtml((c.nome||'?')[0].toUpperCase())}</div>`
          }
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="font-size:19px;font-weight:700">${Utils.escHtml(c.nome)}</div>
              ${c.codigoCliente ? `<span style="font-size:11px;background:var(--primary);color:#fff;padding:2px 8px;border-radius:99px;font-weight:700">${Utils.escHtml(c.codigoCliente)}</span>` : ''}
            </div>
            <div class="text-sm text-muted">${c.segmento?`<span class="badge badge-blue">${c.segmento}</span> · `:''} ${Utils.escHtml(c.porte||'')} ${c.cidade?'· '+c.cidade+'/'+c.estado:''}${c.nps ? ` · ${'⭐'.repeat(c.nps)}` : ''}</div>
            <div class="text-xs text-muted mt-1">CNPJ: ${Utils.escHtml(c.cnpj||'—')} · ${Utils.escHtml(c.email||'—')} · ${Utils.escHtml(c.telefone||'—')}${c.engResponsavel?` · Resp: ${Utils.escHtml(c.engResponsavel)}`:''}</div>
          </div>
          <div>${c.ativo!==false?'<span class="badge badge-green">Ativo</span>':'<span class="badge badge-gray">Inativo</span>'}</div>
        </div>

        <div class="stats-row mb-4">
          <div class="stat-box"><div class="stat-val">${leads.length}</div><div class="stat-lbl">Leads</div></div>
          <div class="stat-box"><div class="stat-val">${projetos.length}</div><div class="stat-lbl">Projetos</div></div>
          <div class="stat-box"><div class="stat-val">${propostas.length}</div><div class="stat-lbl">Propostas</div></div>
          <div class="stat-box"><div class="stat-val" style="font-size:14px">${Utils.formatCurrency(receitaFechada)}</div><div class="stat-lbl">Receita Fechada</div></div>
          <div class="stat-box"><div class="stat-val" style="font-size:14px;color:var(--success)">${Utils.formatCurrency(totalRecebido)}</div><div class="stat-lbl">Recebido</div></div>
          <div class="stat-box"><div class="stat-val" style="font-size:14px;color:var(--warning)">${Utils.formatCurrency(totalPendente)}</div><div class="stat-lbl">A Receber</div></div>
        </div>

        <div class="tabs mb-3">
          <button class="tab-btn active" onclick="switchTab(this,'tabHistorico360')">📋 Histórico de Serviços (${projetos.length})</button>
          <button class="tab-btn" onclick="switchTab(this,'tabLeads360')">💼 Pipeline (${leads.length})</button>
          <button class="tab-btn" onclick="switchTab(this,'tabPropostas360')">📄 Propostas (${propostas.length})</button>
          <button class="tab-btn" onclick="switchTab(this,'tabReceber360')">💰 Financeiro (${recebiveis.length})</button>
          <button class="tab-btn" onclick="switchTab(this,'tabAtiv360')">✅ Atividades (${atividades.length})</button>
          <button class="tab-btn" onclick="switchTab(this,'tabContatos360')">👤 Contatos (${contatos.length})</button>
          <button class="tab-btn" onclick="switchTab(this,'tabTimeline360')">🕐 Interações</button>
        </div>

        <!-- HISTÓRICO DE SERVIÇOS -->
        <div id="tabHistorico360">
          ${(() => {
            if (!projetos.length) return '<div class="text-sm text-muted p-3">Nenhum serviço realizado ainda.</div>';
            const concluidos = projetos.filter(p => p.status === 'concluido');
            const emAndamento = projetos.filter(p => p.status === 'em_andamento');
            const totalFaturado = Utils.sum(projetos, 'valor');
            const totalRecebidoProj = Utils.sum(concluidos, 'valor');
            return `
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
                <div style="background:var(--bg);padding:10px;border-radius:var(--radius);text-align:center;border-left:3px solid var(--primary)">
                  <div class="text-xs text-muted">Total Serviços</div>
                  <div class="font-bold" style="font-size:18px">${projetos.length}</div>
                </div>
                <div style="background:var(--bg);padding:10px;border-radius:var(--radius);text-align:center;border-left:3px solid #10b981">
                  <div class="text-xs text-muted">Concluídos</div>
                  <div class="font-bold" style="color:#10b981;font-size:18px">${concluidos.length}</div>
                </div>
                <div style="background:var(--bg);padding:10px;border-radius:var(--radius);text-align:center;border-left:3px solid #3b82f6">
                  <div class="text-xs text-muted">Em Andamento</div>
                  <div class="font-bold" style="color:#3b82f6;font-size:18px">${emAndamento.length}</div>
                </div>
                <div style="background:var(--bg);padding:10px;border-radius:var(--radius);text-align:center;border-left:3px solid var(--primary)">
                  <div class="text-xs text-muted">Total Faturado</div>
                  <div class="font-bold" style="color:var(--primary);font-size:14px">${Utils.formatCurrency(totalFaturado)}</div>
                </div>
              </div>
              <table class="tbl">
                <thead><tr>
                  <th>OS</th><th>Código</th><th>Serviço</th><th>Valor</th>
                  <th>ART</th><th>Início</th><th>Conclusão</th><th>NPS</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  ${[...projetos].sort((a,b)=>(b.dataInicio||'').localeCompare(a.dataInicio||'')).map(p => {
                    const artOk = p.art?.numero;
                    const artBadge = artOk
                      ? `<span class="badge badge-green text-xs" title="ART ${p.art.numero}">✅ ${Utils.escHtml(p.art.numero)}</span>`
                      : (p.status === 'em_andamento'
                          ? `<span class="badge badge-red text-xs">⚠ Pendente</span>`
                          : `<span class="badge badge-gray text-xs">—</span>`);
                    const npsProj = p.npsCliente ? '⭐'.repeat(p.npsCliente) : '—';
                    return `<tr>
                      <td class="text-xs font-bold text-muted">${Utils.escHtml(p.ordemServico||'—')}</td>
                      <td class="text-xs text-muted">${Utils.escHtml(p.codigo||'—')}</td>
                      <td class="font-bold text-sm">${Utils.escHtml(p.titulo)}</td>
                      <td class="font-bold text-primary">${Utils.formatCurrency(p.valor)}</td>
                      <td>${artBadge}</td>
                      <td class="text-xs text-muted">${Utils.formatDate(p.dataInicio)}</td>
                      <td class="text-xs text-muted">${p.status==='concluido'?Utils.formatDate(p.prazo):'—'}</td>
                      <td class="text-xs">${npsProj}</td>
                      <td>${Utils.projBadge(p.status)}</td>
                      <td><button class="btn btn-xs btn-secondary" onclick="Modal.close();Projetos.view('${p.id}')">Ver</button></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`;
          })()}
        </div>

        <div id="tabLeads360" class="hidden">
          ${leads.length ? `<table class="tbl"><thead><tr><th>Título</th><th>Status</th><th>Valor</th><th>Responsável</th><th>Próxima Ação</th></tr></thead><tbody>
            ${leads.map(l=>`<tr><td class="font-bold text-sm">${Utils.escHtml(l.titulo)}</td><td>${Utils.leadBadge(l.status)}</td><td class="font-bold text-primary">${Utils.formatCurrency(l.valorEstimado)}</td><td class="text-sm">${Utils.escHtml(l.responsavel||'—')}</td><td class="text-xs ${Utils.isOverdue(l.dataProximaAcao)?'text-danger':''}">${Utils.formatDate(l.dataProximaAcao)}</td></tr>`).join('')}
          </tbody></table>` : '<div class="text-sm text-muted p-3">Nenhum lead</div>'}
        </div>
        <div id="tabPropostas360" class="hidden">
          ${propostas.length ? `<table class="tbl"><thead><tr><th>Nº</th><th>Título</th><th>Valor</th><th>Validade</th><th>Status</th></tr></thead><tbody>
            ${propostas.map(p=>`<tr><td class="text-xs font-bold text-muted">${Utils.escHtml(p.numero||'—')}</td><td class="font-bold text-sm">${Utils.escHtml(p.titulo)}</td><td class="font-bold text-primary">${Utils.formatCurrency(p.valor)}</td><td class="text-sm">${Utils.formatDate(p.validade)}</td><td>${Utils.propBadge(p.status)}</td></tr>`).join('')}
          </tbody></table>` : '<div class="text-sm text-muted p-3">Nenhuma proposta</div>'}
        </div>
        <div id="tabReceber360" class="hidden">
          ${recebiveis.length ? recebiveis.map(r=>{
            const tot=(r.parcelas||[]).reduce((s,p)=>s+p.valor,0);
            const rcb=(r.parcelas||[]).filter(p=>p.status==='recebido').reduce((s,p)=>s+p.valor,0);
            return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
              <div class="flex items-center justify-between"><span class="font-bold text-sm">${Utils.escHtml(r.descricao||'—')}</span><span class="font-bold text-primary">${Utils.formatCurrency(r.valorTotal||tot)}</span></div>
              <div class="progress mt-1" style="height:4px"><div class="progress-fill" style="width:${tot>0?(rcb/tot*100).toFixed(0):0}%;background:var(--success)"></div></div>
              <div class="text-xs text-muted mt-1">${(r.parcelas||[]).length} parcela(s) · Recebido: ${Utils.formatCurrency(rcb)}</div>
            </div>`;
          }).join('') : '<div class="text-sm text-muted p-3">Nenhum recebível</div>'}
        </div>
        <div id="tabAtiv360" class="hidden">
          ${atividades.length ? atividades.slice(0,10).map(a=>{
            const tipo=Utils.ATIV_TIPO[a.tipo]||{icon:'📌',bg:'#f1f5f9'};
            return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:center">
              <div style="width:28px;height:28px;border-radius:50%;background:${tipo.bg};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">${tipo.icon}</div>
              <div style="flex:1"><div class="font-bold text-sm">${Utils.escHtml(a.titulo)}</div><div class="text-xs text-muted">${Utils.formatDate(a.data)} ${a.hora?'· '+a.hora:''} · ${Utils.escHtml(a.responsavel||'—')}</div></div>
              ${Utils.activBadge(a.status)}
            </div>`;
          }).join('') : '<div class="text-sm text-muted p-3">Nenhuma atividade</div>'}
        </div>
        <div id="tabContatos360" class="hidden">
          ${contatos.length ? contatos.map(ct=>`<div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div class="font-bold text-sm">${Utils.escHtml(ct.nome)}${ct.principal?' <span class="badge badge-blue">Principal</span>':''}</div>
            <div class="text-xs text-muted">${Utils.escHtml(ct.cargo||'')}${ct.email?' · '+Utils.escHtml(ct.email):''}${ct.telefone?' · '+Utils.escHtml(ct.telefone):''}</div>
          </div>`).join('') : '<div class="text-sm text-muted p-3">Nenhum contato</div>'}
        </div>

        <!-- TIMELINE DE INTERAÇÕES -->
        <div id="tabTimeline360" class="hidden">
          ${(() => {
            const contratos360 = DB.getAll('contratos').filter(ct => ct.clienteId === id);
            const eventos = [];
            leads.forEach(l => eventos.push({ data: l.criadoEm || l.dataProximaAcao || '', tipo: 'Lead', icone: '💼', cor: '#3b82f6', titulo: l.titulo || 'Lead sem título', detalhe: l.status || '' }));
            projetos.forEach(p => eventos.push({ data: p.criadoEm || p.dataInicio || '', tipo: 'Projeto', icone: '🔧', cor: '#10b981', titulo: p.titulo || 'Projeto sem título', detalhe: [p.status, p.ordemServico ? 'OS: ' + p.ordemServico : ''].filter(Boolean).join(' · ') }));
            contratos360.forEach(ct => eventos.push({ data: ct.criadoEm || ct.dataInicio || '', tipo: 'Contrato', icone: '📋', cor: '#8b5cf6', titulo: ct.numero || 'Contrato', detalhe: [ct.status, ct.valor ? Utils.formatCurrency(ct.valor) : ''].filter(Boolean).join(' · ') }));
            propostas.forEach(p => eventos.push({ data: p.criadoEm || p.data || '', tipo: 'Proposta', icone: '📄', cor: '#f59e0b', titulo: p.numero || p.titulo || 'Proposta', detalhe: [p.status, p.valor ? Utils.formatCurrency(p.valor) : ''].filter(Boolean).join(' · ') }));
            atividades.forEach(a => eventos.push({ data: a.data || a.criadoEm || '', tipo: 'Atividade', icone: '📌', cor: '#64748b', titulo: a.titulo || 'Atividade', detalhe: [a.tipo, a.status].filter(Boolean).join(' · ') }));
            eventos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
            if (!eventos.length) return '<div class="text-sm text-muted p-3">Nenhuma interação registrada ainda.</div>';
            return `<div style="position:relative;padding-left:24px;border-left:2px solid var(--border);margin:8px 0">
              ${eventos.map(ev => `
              <div style="position:relative;margin-bottom:16px">
                <div style="position:absolute;left:-29px;width:14px;height:14px;border-radius:50%;background:${ev.cor};border:2px solid var(--surface)"></div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">${ev.data ? Utils.formatDate(ev.data) : '—'} · ${Utils.escHtml(ev.tipo)}</div>
                <div style="font-weight:600;font-size:13px">${ev.icone} ${Utils.escHtml(ev.titulo)}</div>
                ${ev.detalhe ? `<div style="font-size:12px;color:var(--text-secondary)">${Utils.escHtml(ev.detalhe)}</div>` : ''}
              </div>`).join('')}
            </div>`;
          })()}
        </div>

        ${c.observacoes ? `<div class="detail-field mt-4"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(c.observacoes)}</div></div>` : ''}

        <div class="mt-4 flex gap-2">
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Clientes.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  function _previewAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { Toast.error('Arquivo muito grande (máx 5MB)'); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        const scale = Math.min(MAX / img.width, MAX / img.height);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        const preview = document.getElementById('avatarPreview');
        if (preview) preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover">`;
        // Store in hidden input
        let hidden = document.getElementById('fAvatarData');
        if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = 'fAvatarData'; document.getElementById('avatarPreview').parentNode.appendChild(hidden); }
        hidden.value = base64;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function _nextCodigoCliente() {
    const total = DB.getAll('clientes').length + 1;
    return 'CLI-' + String(total).padStart(4, '0');
  }

  function openForm(id = null) {
    const config = DB.getConfig();
    const c = id ? DB.get('clientes', id) : null;
    const estados = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
    const codSuggest = c?.codigoCliente || _nextCodigoCliente();

    Modal.open({
      title: id ? 'Editar Cliente' : 'Novo Cliente',
      size: 'modal-lg',
      body: `
        <!-- AVATAR UPLOAD -->
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
          <div id="avatarPreview" style="width:64px;height:64px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            ${c?.avatar ? `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover">` : `<span style="color:#fff;font-size:24px;font-weight:800">${Utils.escHtml((c?.nome||'?')[0].toUpperCase())}</span>`}
          </div>
          <div>
            <label class="btn btn-xs btn-secondary" style="cursor:pointer">
              📷 Foto/Logo
              <input type="file" id="fAvatar" accept="image/*" style="display:none" onchange="Clientes._previewAvatar(event)">
            </label>
            ${c?.avatar ? `<button type="button" class="btn btn-xs btn-danger ml-2" onclick="document.getElementById('avatarPreview').innerHTML='<span style=\\'color:#fff;font-size:24px;font-weight:800\\'>${Utils.escHtml((c?.nome||'?')[0].toUpperCase())}</span>';document.getElementById('fAvatarData').value='__remove__'">Remover</button>` : ''}
          </div>
          <input type="hidden" id="fAvatarData" value="">
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:3">
            <label class="form-label">Razão Social / Nome *</label>
            <input class="form-control" id="fNome" value="${Utils.escHtml(c?.nome||'')}" placeholder="Nome da empresa">
          </div>
          <div class="form-group">
            <label class="form-label">Código Interno</label>
            <input class="form-control" id="fCodigoCliente" value="${Utils.escHtml(codSuggest)}" placeholder="CLI-0001">
            <div class="text-xs text-muted mt-1">Código único do cliente no sistema</div>
          </div>
          <div class="form-group">
            <label class="form-label">CNPJ / CPF</label>
            <div style="display:flex;gap:8px;align-items:flex-end;">
              <div style="flex:1">
                <input class="form-control" id="fCnpj" value="${Utils.escHtml(c?.cnpj||'')}" placeholder="XX.XXX.XXX/XXXX-XX" maxlength="18" oninput="Utils.autoFormatCNPJ(this)">
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="btnBuscarCnpj" onclick="Clientes.buscarCNPJ()" style="white-space:nowrap;flex-shrink:0">🔍 Buscar CNPJ</button>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Segmento</label>
            <select class="form-control" id="fSegmento">
              ${config.segmentos.map(s => `<option value="${s}" ${c?.segmento===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Porte</label>
            <select class="form-control" id="fPorte">
              ${['Pequeno','Médio','Grande'].map(p => `<option value="${p}" ${c?.porte===p?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="fAtivo">
              <option value="true" ${c?.ativo!==false?'selected':''}>Ativo</option>
              <option value="false" ${c?.ativo===false?'selected':''}>Inativo</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cidade</label>
            <input class="form-control" id="fCidade" value="${Utils.escHtml(c?.cidade||'')}" placeholder="Cidade">
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select class="form-control" id="fEstado">
              <option value="">UF</option>
              ${estados.map(e => `<option value="${e}" ${c?.estado===e?'selected':''}>${e}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <input class="form-control" id="fEmail" type="email" value="${Utils.escHtml(c?.email||'')}" placeholder="email@empresa.com.br">
          </div>
          <div class="form-group">
            <label class="form-label">Telefone</label>
            <input class="form-control" id="fTelefone" value="${Utils.escHtml(c?.telefone||'')}" placeholder="(XX) XXXXX-XXXX">
          </div>
          <div class="form-group">
            <label class="form-label">Site</label>
            <input class="form-control" id="fSite" value="${Utils.escHtml(c?.site||'')}" placeholder="www.empresa.com.br">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Engenheiro de Conta / Responsável</label>
            <input class="form-control" id="fEngResponsavel" value="${Utils.escHtml(c?.engResponsavel||'')}" placeholder="Responsável pelo relacionamento">
          </div>
          <div class="form-group">
            <label class="form-label">NPS / Satisfação Geral</label>
            <select class="form-control" id="fNps">
              <option value="">Não avaliado</option>
              ${[5,4,3,2,1].map(n => `<option value="${n}" ${c?.nps==n?'selected':''}>${'⭐'.repeat(n)} — ${['','Muito insatisfeito','Insatisfeito','Neutro','Satisfeito','Muito satisfeito'][n]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fObs" rows="3">${Utils.escHtml(c?.observacoes||'')}</textarea>
        </div>
      `,
      saveCb: () => saveCliente(id),
    });
  }

  function saveCliente(id) {
    const nome = document.getElementById('fNome').value.trim();
    if (!nome) { Toast.error('Nome obrigatório'); return; }
    const cnpj = document.getElementById('fCnpj').value.trim();
    const codigoCliente = document.getElementById('fCodigoCliente').value.trim();

    // Verifica duplicidade do código
    if (codigoCliente) {
      const duplicado = DB.getAll('clientes').find(c => c.codigoCliente === codigoCliente && c.id !== id);
      if (duplicado) { Toast.error(`Código ${codigoCliente} já está em uso por "${duplicado.nome}"`); return; }
    }

    const avatarRaw = document.getElementById('fAvatarData')?.value || '';
    const existingCliente = id ? DB.get('clientes', id) : null;
    let avatar = existingCliente?.avatar || null;
    if (avatarRaw === '__remove__') avatar = null;
    else if (avatarRaw && avatarRaw.startsWith('data:')) avatar = avatarRaw;

    const data = {
      nome,
      codigoCliente,
      cnpj,
      segmento: document.getElementById('fSegmento').value,
      porte: document.getElementById('fPorte').value,
      ativo: document.getElementById('fAtivo').value === 'true',
      cidade: document.getElementById('fCidade').value,
      estado: document.getElementById('fEstado').value,
      email: document.getElementById('fEmail').value,
      telefone: document.getElementById('fTelefone').value,
      site: document.getElementById('fSite').value,
      engResponsavel: document.getElementById('fEngResponsavel').value,
      nps: Number(document.getElementById('fNps').value) || null,
      observacoes: document.getElementById('fObs').value,
      avatar,
    };
    if (id) { DB.update('clientes', id, data); Toast.success('Cliente atualizado'); }
    else { DB.create('clientes', data); Toast.success('Cliente cadastrado'); }
    Modal.close();
    render();
  }

  function deleteCliente(id) {
    const c = DB.get('clientes', id);
    Utils.confirmDelete(c?.nome || 'este cliente', () => {
      DB.remove('clientes', id);
      Toast.success('Cliente removido');
      render();
    });
  }

  function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { Toast.error('CSV vazio ou sem dados'); return; }
        const headers = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"]/g,''));
        const idx = (col) => headers.indexOf(col);

        const rows = lines.slice(1);
        let created = 0, skipped = 0;
        rows.forEach(line => {
          const cols = line.split(';').map(c => c.trim().replace(/^["']|["']$/g,''));
          const nome = cols[idx('nome')] || '';
          if (!nome) { skipped++; return; }
          const npsRaw = cols[idx('nps')] || cols[idx('nps / satisfação geral')] || '';
          DB.create('clientes', {
            nome,
            cnpj:           cols[idx('cnpj')] || '',
            segmento:       cols[idx('segmento')] || '',
            porte:          cols[idx('porte')] || 'Médio',
            cidade:         cols[idx('cidade')] || '',
            estado:         cols[idx('estado')] || '',
            email:          cols[idx('email')] || '',
            telefone:       cols[idx('telefone')] || '',
            site:           cols[idx('site')] || '',
            observacoes:    cols[idx('observacoes')] || '',
            codigoCliente:  cols[idx('codigo cliente')] || cols[idx('codigocliente')] || '',
            engResponsavel: cols[idx('eng responsavel')] || cols[idx('engresponsavel')] || cols[idx('eng_responsavel')] || '',
            nps:            npsRaw ? (Number(npsRaw) || null) : null,
            ativo: true,
          });
          created++;
        });
        Toast.success(`${created} cliente(s) importado(s)!${skipped ? ` (${skipped} linha(s) ignorada(s))` : ''}`);
        render();
      } catch(err) {
        Toast.error('Erro ao processar CSV: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function downloadCSVTemplate() {
    const header = 'nome;cnpj;segmento;porte;cidade;estado;email;telefone;site;observacoes;codigo cliente;eng responsavel;nps';
    const example = 'Empresa Exemplo Ltda;12.345.678/0001-90;Alimentos;Médio;Londrina;PR;contato@empresa.com;(43) 99999-1234;www.empresa.com;Observação opcional;CLI-0001;João da Silva;5';
    const blob = new Blob([header + '\n' + example], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-clientes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    Toast.success('Modelo CSV baixado! Edite e reimporte.');
  }

  function addNew() { openForm(); }

  async function buscarCNPJ() {
    const input = document.getElementById('fCnpj');
    const btn   = document.getElementById('btnBuscarCnpj');
    if (!input || !btn) return;

    const raw  = input.value.replace(/\D/g, '');
    if (raw.length !== 14) { Toast.error('CNPJ deve ter 14 dígitos'); return; }

    const original = btn.textContent;
    btn.textContent = 'Buscando...';
    btn.disabled = true;

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'CNPJ não encontrado' : `Erro ${res.status} na consulta`);
      const d = await res.json();

      // Nome / Razão Social
      const fNome = document.getElementById('fNome');
      if (fNome && d.razao_social) fNome.value = d.razao_social;

      // Nome Fantasia
      const fNomeFantasia = document.getElementById('fNomeFantasia');
      if (fNomeFantasia && d.nome_fantasia) fNomeFantasia.value = d.nome_fantasia;

      // Segmento — tenta mapear CNAE para os segmentos disponíveis
      const fSegmento = document.getElementById('fSegmento');
      if (fSegmento && d.cnae_fiscal_descricao) {
        const cnae = d.cnae_fiscal_descricao.toLowerCase();
        const opts = [...fSegmento.options].map(o => ({ val: o.value, lbl: o.value.toLowerCase() }));
        const mapa = [
          { kws: ['aliment','bebid','agric','pecuár'], seg: 'Alimentos' },
          { kws: ['metal','ferrament','caldeiraria','estrutura metál','soldagem','usinag'], seg: 'Metalurgia' },
          { kws: ['automação','automação industrial','eletr','instrumentação'], seg: 'Automação' },
          { kws: ['construção','obra','engenharia civil','arquitet'], seg: 'Construção Civil' },
          { kws: ['quím','petroqu','petrol','gás'], seg: 'Química' },
          { kws: ['papel','celulos'], seg: 'Papel e Celulose' },
          { kws: ['plástic','borracha'], seg: 'Plásticos e Borracha' },
          { kws: ['têxtil','confecção','vestuário'], seg: 'Têxtil' },
          { kws: ['logístic','transport','armazenagem'], seg: 'Logística' },
          { kws: ['saúde','hospital','farmac','médic'], seg: 'Saúde' },
          { kws: ['tecnologia','software','inform'], seg: 'Tecnologia' },
          { kws: ['serviços','assessoria','consultoria'], seg: 'Serviços' },
        ];
        let found = '';
        for (const { kws, seg } of mapa) {
          if (kws.some(k => cnae.includes(k))) { found = seg; break; }
        }
        if (found) {
          const opt = opts.find(o => o.lbl === found.toLowerCase());
          if (opt) fSegmento.value = opt.val;
        }
      }

      // Endereço
      const fEndereco = document.getElementById('fEndereco');
      if (fEndereco) {
        const partes = [
          d.logradouro,
          d.numero ? d.numero : null,
          d.bairro ? '- ' + d.bairro : null,
          (d.municipio && d.uf) ? d.municipio + '/' + d.uf : (d.municipio || null),
          d.cep ? 'CEP ' + d.cep : null,
        ].filter(Boolean);
        if (partes.length) fEndereco.value = partes.join(', ');
      }

      // Cidade e Estado (campos separados)
      const fCidade = document.getElementById('fCidade');
      if (fCidade && d.municipio) fCidade.value = d.municipio;
      const fEstado = document.getElementById('fEstado');
      if (fEstado && d.uf) fEstado.value = d.uf;

      // Telefone
      const fTelefone = document.getElementById('fTelefone');
      if (fTelefone && d.ddd_telefone_1) {
        const t = d.ddd_telefone_1.replace(/\D/g,'');
        if (t.length === 10) fTelefone.value = `(${t.slice(0,2)}) ${t.slice(2,6)}-${t.slice(6)}`;
        else if (t.length === 11) fTelefone.value = `(${t.slice(0,2)}) ${t.slice(2,7)}-${t.slice(7)}`;
        else fTelefone.value = d.ddd_telefone_1;
      }

      // E-mail
      const fEmail = document.getElementById('fEmail');
      if (fEmail && d.email) fEmail.value = d.email;

      Toast.success(`Dados preenchidos: ${d.razao_social}`);
    } catch (err) {
      Toast.error('Erro ao buscar CNPJ: ' + (err.message || 'Tente novamente'));
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  /* ── Portal do Cliente ─────────────────────────────────────────────────── */

  async function gerarLinkPortal(clienteId) {
    const c = DB.get('clientes', clienteId);
    if (!c) return;

    const btn = document.getElementById(`btnPortal_${clienteId}`);
    if (btn) { btn.textContent = '⏳ Gerando...'; btn.disabled = true; }

    try {
      // Criar token via Supabase
      const { data, error } = await _supabase
        .from('crm_portal_tokens')
        .insert({
          cliente_id: clienteId,
          nome_cliente: c.nome,
          email_cliente: c.email || '',
          ativo: true,
          expira_em: new Date(Date.now() + 365 * 86400000).toISOString(), // 1 ano
        })
        .select('token')
        .single();

      if (error || !data?.token) throw new Error(error?.message || 'Erro ao gerar token');

      const link = `https://portal.bikows.com.br/?token=${data.token}`;

      Modal.open({
        title: '🔗 Link do Portal — ' + c.nome,
        body: `
          <div style="background:var(--success-light);border:1px solid var(--success-border);padding:16px;border-radius:var(--radius);margin-bottom:16px">
            <div class="font-bold text-sm" style="color:var(--success);margin-bottom:8px">✅ Link gerado com sucesso!</div>
            <div class="text-xs text-muted mb-2">Envie este link para ${Utils.escHtml(c.nome)}. Válido por 1 ano.</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" value="${Utils.escHtml(link)}" id="portalLink" readonly
                style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;background:white">
              <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${Utils.escHtml(link)}').then(()=>Toast.success('Link copiado!'))">📋 Copiar</button>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value font-bold">${Utils.escHtml(c.nome)}</div></div>
            <div class="detail-field"><div class="detail-label">Expira em</div><div class="detail-value">1 ano</div></div>
          </div>
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);margin-top:12px">
            <div class="text-xs font-bold text-muted mb-1">📧 Sugestão de mensagem WhatsApp/e-mail:</div>
            <div style="font-size:12px;line-height:1.6;color:var(--text)">
              "Olá ${Utils.escHtml(c.nome)}! Criamos seu portal exclusivo Bikows onde você pode acompanhar projetos e aprovar propostas em tempo real. Acesse: ${Utils.escHtml(link)}"
            </div>
          </div>
        `,
      });
    } catch (err) {
      Toast.error('Erro ao gerar link: ' + err.message);
    } finally {
      if (btn) { btn.textContent = '🔗 Gerar Portal'; btn.disabled = false; }
    }
  }

  async function verTokensPortal(clienteId) {
    const c = DB.get('clientes', clienteId);
    const { data: tokens } = await _supabase
      .from('crm_portal_tokens')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('criado_em', { ascending: false });

    if (!tokens?.length) { Toast.info('Nenhum link gerado ainda para este cliente.'); return; }

    Modal.open({
      title: `🔗 Links do Portal — ${c?.nome || ''}`,
      body: `
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Token</th><th>Criado em</th><th>Último acesso</th><th>Expira</th><th>Ativo</th><th>Ações</th></tr></thead>
            <tbody>
              ${tokens.map(t => `<tr>
                <td style="font-family:monospace;font-size:11px">${t.token.substring(0,20)}...</td>
                <td class="text-xs">${Utils.formatDate(t.criado_em?.split('T')[0])}</td>
                <td class="text-xs">${t.ultimo_acesso ? Utils.formatDate(t.ultimo_acesso.split('T')[0]) : '—'}</td>
                <td class="text-xs">${t.expira_em ? Utils.formatDate(t.expira_em.split('T')[0]) : '∞'}</td>
                <td>${t.ativo ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
                <td>
                  <button class="btn btn-xs btn-secondary" onclick="navigator.clipboard.writeText('https://portal.bikows.com.br/?token=${t.token}').then(()=>Toast.success('Copiado!'))">📋</button>
                  ${t.ativo ? `<button class="btn btn-xs btn-danger" onclick="Clientes.revogarToken('${t.id}')">Revogar</button>` : ''}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `,
    });
  }

  async function revogarToken(tokenId) {
    await _supabase.from('crm_portal_tokens').update({ ativo: false }).eq('id', tokenId);
    Toast.success('Token revogado');
    Modal.close();
  }

  return { render, openForm, saveCliente, deleteCliente, view, setFilter, addNew, importCSV, downloadCSVTemplate, buscarCNPJ, setPeriodo, gerarLinkPortal, verTokensPortal, revogarToken, _previewAvatar };
})();

// Tab switcher helper
function switchTab(btn, tabId) {
  btn.closest('.tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const parent = btn.closest('.modal-body') || document.getElementById('pageContent');
  parent.querySelectorAll('[id^="tab"]').forEach(t => t.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');
}
