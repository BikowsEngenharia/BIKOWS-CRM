/* ==========================================
   CLIENTES — Gestão de empresas
   ========================================== */
const Clientes = (() => {

  let _filter = { search: '', segmento: '', porte: '', ativo: '' };

  function render() {
    const config = DB.getConfig();
    const clientes = DB.getAll('clientes');
    const leads = DB.getAll('leads');
    const projetos = DB.getAll('projetos');

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
              return `<tr>
                <td class="text-xs font-bold text-muted">${Utils.escHtml(c.codigoCliente||'—')}</td>
                <td><div class="font-bold">${Utils.escHtml(c.nome)}</div><div class="text-xs text-muted">${npsStars} ${Utils.escHtml(c.email||'')}</div></td>
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
          <div style="width:52px;height:52px;border-radius:var(--radius-full);background:var(--primary);color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${Utils.escHtml((c.nome||'?')[0].toUpperCase())}</div>
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

        ${c.observacoes ? `<div class="detail-field mt-4"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(c.observacoes)}</div></div>` : ''}

        <div class="mt-4 flex gap-2">
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Clientes.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
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
            <input class="form-control" id="fCnpj" value="${Utils.escHtml(c?.cnpj||'')}" placeholder="XX.XXX.XXX/XXXX-XX" maxlength="18" oninput="Utils.autoFormatCNPJ(this)">
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

  return { render, openForm, saveCliente, deleteCliente, view, setFilter, addNew, importCSV, downloadCSVTemplate };
})();

// Tab switcher helper
function switchTab(btn, tabId) {
  btn.closest('.tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const parent = btn.closest('.modal-body') || document.getElementById('pageContent');
  parent.querySelectorAll('[id^="tab"]').forEach(t => t.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');
}
