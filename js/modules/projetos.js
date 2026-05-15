/* ==========================================
   PROJETOS — Gestão de execução
   ========================================== */
const Projetos = (() => {

  let _filter = { status: '', responsavel: '' };

  function render() {
    const projetos = DB.getAll('projetos');
    const config = DB.getConfig();
    let list = projetos;
    if (_filter.status) list = list.filter(p => p.status === _filter.status);
    if (_filter.responsavel) list = list.filter(p => p.responsavel === _filter.responsavel);

    const emAnd = projetos.filter(p => p.status === 'em_andamento').length;
    const atrasados = projetos.filter(p => p.status === 'em_andamento' && Utils.isOverdue(p.prazo)).length;
    const concluidos = projetos.filter(p => p.status === 'concluido').length;
    const totalValor = Utils.sum(projetos, 'valor');

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Projetos em Execução</h2>
        <div class="sec-actions">
          <button class="btn btn-primary" onclick="Projetos.openForm()">+ Novo Projeto</button>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi-card" style="--kpi-color:#3b82f6"><div class="kpi-label">Em Andamento</div><div class="kpi-value">${emAnd}</div><div class="kpi-icon">🔧</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444"><div class="kpi-label">Atrasados</div><div class="kpi-value">${atrasados}</div><div class="kpi-icon">⚠</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Concluídos</div><div class="kpi-value">${concluidos}</div><div class="kpi-icon">✅</div></div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6"><div class="kpi-label">Valor Total</div><div class="kpi-value" style="font-size:20px">${Utils.formatCurrency(totalValor)}</div><div class="kpi-icon">💰</div></div>
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
            <thead><tr><th>Código</th><th>Projeto</th><th>Cliente</th><th>Responsável</th><th>Valor</th><th>Prazo</th><th>Progresso</th><th>Status</th><th>NF</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.map(p => {
                const etapas = p.etapas || [];
                const pct = etapas.length ? Math.round(etapas.reduce((s,e)=>s+(e.pct||0),0)/etapas.length) : 0;
                const dias = Utils.daysUntil(p.prazo);
                const prazoClass = (p.status !== 'concluido' && dias != null && dias < 0) ? 'text-danger' : 'text-muted';
                const prazoLabel = dias == null ? '—' : dias < 0 ? `⚠ ${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`;
                return `<tr>
                  <td class="text-xs text-muted font-bold">${Utils.escHtml(p.codigo||'—')}</td>
                  <td><div class="font-bold" style="max-width:180px">${Utils.escHtml(p.titulo)}</div></td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(p.clienteId))}</td>
                  <td class="text-sm">${Utils.escHtml(p.responsavel||'—')}</td>
                  <td class="text-sm font-bold">${Utils.formatCurrency(p.valor)}</td>
                  <td class="text-sm ${prazoClass}">${Utils.formatDate(p.prazo)} <span class="text-xs">${prazoLabel}</span></td>
                  <td style="min-width:100px">
                    <div class="flex items-center gap-2">
                      <div class="progress" style="flex:1"><div class="progress-fill" style="width:${pct}%"></div></div>
                      <span class="text-xs font-bold">${pct}%</span>
                    </div>
                  </td>
                  <td>${Utils.projBadge(p.status)}</td>
                  <td>${p.nfEmitida ? '<span class="badge badge-green">Emitida</span>' : '<span class="badge badge-gray">Pendente</span>'}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Projetos.view('${p.id}')">Ver</button>
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

  function view(id) {
    const p = DB.get('projetos', id);
    if (!p) return;
    const etapas = p.etapas || [];
    const pct = etapas.length ? Math.round(etapas.reduce((s,e)=>s+(e.pct||0),0)/etapas.length) : 0;

    Modal.open({
      title: p.titulo,
      size: 'modal-lg',
      body: `
        <div class="detail-grid mb-3">
          <div class="detail-field"><div class="detail-label">Código</div><div class="detail-value">${Utils.escHtml(p.codigo||'—')}</div></div>
          <div class="detail-field"><div class="detail-label">Status</div><div class="detail-value">${Utils.projBadge(p.status)}</div></div>
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(Utils.getClientName(p.clienteId))}</div></div>
          <div class="detail-field"><div class="detail-label">Responsável</div><div class="detail-value">${Utils.escHtml(p.responsavel||'—')}</div></div>
          <div class="detail-field"><div class="detail-label">Valor</div><div class="detail-value font-bold text-primary">${Utils.formatCurrency(p.valor)}</div></div>
          <div class="detail-field"><div class="detail-label">Prazo</div><div class="detail-value">${Utils.formatDate(p.prazo)}</div></div>
          <div class="detail-field"><div class="detail-label">Início</div><div class="detail-value">${Utils.formatDate(p.dataInicio)}</div></div>
          <div class="detail-field"><div class="detail-label">NF Emitida</div><div class="detail-value">${p.nfEmitida?'<span class="badge badge-green">Sim</span>':'<span class="badge badge-gray">Não</span>'}</div></div>
        </div>
        <div class="mb-3">
          <div class="flex items-center justify-between mb-2">
            <div class="detail-label">Progresso Geral</div>
            <span class="font-bold">${pct}%</span>
          </div>
          <div class="progress" style="height:12px"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="detail-label mb-2">Etapas</div>
        <div class="etapas-list">
          ${etapas.map((e, i) => {
            const statColors = { concluida: '#10b981', em_andamento: '#3b82f6', pendente: '#94a3b8' };
            return `<div class="etapa-item">
              <div class="etapa-num" style="background:${statColors[e.status]||'#94a3b8'}">${i+1}</div>
              <div class="etapa-info">
                <div class="etapa-name">${Utils.escHtml(e.nome)}</div>
                <div class="etapa-dates">${Utils.formatDate(e.inicio)} → ${Utils.formatDate(e.fim)}</div>
              </div>
              <div class="etapa-pct-bar"><div class="etapa-pct-fill" style="width:${e.pct||0}%;background:${statColors[e.status]||'#94a3b8'}"></div></div>
              <div class="etapa-pct">${e.pct||0}%</div>
            </div>`;
          }).join('')}
        </div>
        ${p.observacoes ? `<div class="mt-3 detail-field"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(p.observacoes)}</div></div>` : ''}
        <div class="mt-4 flex gap-2">
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Projetos.openForm('${id}')">✏ Editar</button>
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
            <label class="form-label">Título do Projeto *</label>
            <input class="form-control" id="fpTitulo" value="${Utils.escHtml(p?.titulo||'')}" placeholder="Ex: Adequação NR-12 Linha de Produção">
          </div>
          <div class="form-group">
            <label class="form-label">Código</label>
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
            <label class="form-label">Valor (R$)</label>
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

  function collectEtapas() {
    const rows = document.querySelectorAll('.etapa-row');
    return [...rows].map(row => ({
      nome: row.querySelector('.etapa-nome')?.value || '',
      inicio: row.querySelector('.etapa-inicio')?.value || '',
      fim: row.querySelector('.etapa-fim')?.value || '',
      pct: Number(row.querySelector('.etapa-pct')?.value) || 0,
      status: row.querySelector('.etapa-status')?.value || 'pendente',
    })).filter(e => e.nome.trim());
  }

  function saveProjeto(id) {
    const titulo = document.getElementById('fpTitulo').value.trim();
    if (!titulo) { Toast.error('Título obrigatório'); return; }
    const data = {
      titulo,
      codigo: document.getElementById('fpCodigo').value,
      clienteId: document.getElementById('fpCliente').value,
      responsavel: document.getElementById('fpResponsavel').value,
      status: document.getElementById('fpStatus').value,
      valor: Number(document.getElementById('fpValor').value) || 0,
      dataInicio: document.getElementById('fpInicio').value,
      prazo: document.getElementById('fpPrazo').value,
      nfEmitida: document.getElementById('fpNf').checked,
      pagamentoRecebido: document.getElementById('fpPgto').checked,
      etapas: collectEtapas(),
      observacoes: document.getElementById('fpObs').value,
    };
    if (id) { DB.update('projetos', id, data); Toast.success('Projeto atualizado'); }
    else { DB.create('projetos', data); Toast.success('Projeto criado'); }
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

  function addNew() { openForm(); }

  return { render, openForm, saveProjeto, deleteProjeto, view, setFilter, addEtapa, addNew };
})();
