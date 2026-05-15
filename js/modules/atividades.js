/* ==========================================
   ATIVIDADES — Tarefas, ligações, follow-ups
   ========================================== */
const Atividades = (() => {

  let _filter = { status: '', tipo: '', responsavel: '' };
  let _selected = new Set();

  function render() {
    const atividades = DB.getAll('atividades');
    const config = DB.getConfig();
    let list = [...atividades].sort((a, b) => {
      if (!a.data) return 1; if (!b.data) return -1;
      return a.data.localeCompare(b.data);
    });
    if (_filter.status) list = list.filter(a => a.status === _filter.status);
    if (_filter.tipo) list = list.filter(a => a.tipo === _filter.tipo);
    if (_filter.responsavel) list = list.filter(a => a.responsavel === _filter.responsavel);

    const pendentes = atividades.filter(a => a.status === 'pendente').length;
    const atrasadas = atividades.filter(a => a.status === 'pendente' && Utils.isOverdue(a.data)).length;
    const hoje = atividades.filter(a => a.status === 'pendente' && Utils.isToday(a.data)).length;
    const concluidas = atividades.filter(a => a.status === 'concluida').length;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Atividades</h2>
        <div class="sec-actions">
          <button class="btn btn-primary" onclick="Atividades.openForm()">+ Nova Atividade</button>
        </div>
      </div>

      <div class="stats-row mb-4">
        <div class="stat-box"><div class="stat-val">${pendentes}</div><div class="stat-lbl">Pendentes</div></div>
        <div class="stat-box" style="border-left:3px solid var(--danger)"><div class="stat-val text-danger">${atrasadas}</div><div class="stat-lbl">Atrasadas</div></div>
        <div class="stat-box" style="border-left:3px solid var(--warning)"><div class="stat-val">${hoje}</div><div class="stat-lbl">Para Hoje</div></div>
        <div class="stat-box"><div class="stat-val text-success">${concluidas}</div><div class="stat-lbl">Concluídas</div></div>
      </div>

      ${_selected.size > 0 ? `
      <div class="bulk-bar">
        <span class="text-sm font-bold">${_selected.size} selecionada(s)</span>
        <button class="btn btn-sm btn-success" onclick="Atividades.bulkConcluir()">✓ Concluir selecionadas</button>
        <button class="btn btn-sm btn-danger" onclick="Atividades.bulkExcluir()">🗑 Excluir selecionadas</button>
        <button class="btn btn-sm btn-ghost" onclick="Atividades.clearSelection()">✕ Cancelar</button>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Atividades.setFilter('status',this.value)">
              <option value="">Todos os status</option>
              ${Object.entries(Utils.ATIV_STATUS).map(([k,v]) => `<option value="${k}" ${_filter.status===k?'selected':''}>${v.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Atividades.setFilter('tipo',this.value)">
              <option value="">Todos os tipos</option>
              ${Object.entries(Utils.ATIV_TIPO).map(([k,v]) => `<option value="${k}" ${_filter.tipo===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Atividades.setFilter('responsavel',this.value)">
              <option value="">Todos os responsáveis</option>
              ${config.responsaveis.map(r => `<option value="${r}" ${_filter.responsavel===r?'selected':''}>${r}</option>`).join('')}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} atividade(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? emptyState() : `
          <table class="tbl">
            <thead><tr>
              <th><input type="checkbox" id="chkAll" onchange="Atividades.toggleAll(this.checked)" title="Selecionar todos"></th>
              <th>Tipo</th><th>Atividade</th><th>Cliente</th><th>Data/Hora</th><th>Responsável</th><th>Prioridade</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${list.map(a => {
                const tipo = Utils.ATIV_TIPO[a.tipo] || { icon:'📌', bg:'#f1f5f9', label: a.tipo };
                const client = Utils.getClientName(a.clienteId);
                const alert = Utils.dateAlert(a.data, a.status);
                const prioColors = { alta: 'badge-red', media: 'badge-yellow', baixa: 'badge-gray' };
                const isSel = _selected.has(a.id);
                return `<tr class="${isSel?'row-selected':''}">
                  <td><input type="checkbox" class="chk-item" ${isSel?'checked':''} onchange="Atividades.toggleSelect('${a.id}',this.checked)"></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:6px">
                      <span style="width:28px;height:28px;border-radius:50%;background:${tipo.bg};display:flex;align-items:center;justify-content:center;font-size:14px">${tipo.icon}</span>
                      <span class="text-xs text-muted">${tipo.label}</span>
                    </div>
                  </td>
                  <td><div class="font-bold" style="max-width:200px">${Utils.escHtml(a.titulo)}</div>${a.descricao ? `<div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(a.descricao,60))}</div>` : ''}</td>
                  <td class="text-sm">${Utils.escHtml(client)}</td>
                  <td class="text-sm">${Utils.formatDate(a.data)} ${a.hora||''}<br>${alert}</td>
                  <td class="text-sm">${Utils.escHtml(a.responsavel||'—')}</td>
                  <td>${a.prioridade ? `<span class="badge ${prioColors[a.prioridade]||'badge-gray'}">${a.prioridade}</span>` : '—'}</td>
                  <td>${Utils.activBadge(a.status)}</td>
                  <td>
                    <div class="tbl-actions">
                      ${a.status === 'pendente' ? `<button class="btn btn-xs btn-success" onclick="Atividades.concluir('${a.id}')">✓</button>` : ''}
                      <button class="btn btn-xs btn-secondary" onclick="Atividades.openForm('${a.id}')">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Atividades.deleteAtividade('${a.id}')">🗑</button>
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
    return `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Nenhuma atividade</div><button class="btn btn-primary mt-4" onclick="Atividades.openForm()">+ Criar Atividade</button></div>`;
  }

  function setFilter(k, v) { _filter[k] = v; render(); }

  function openForm(id = null) {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const leads = DB.getAll('leads').filter(l => !['fechado_perdido'].includes(l.status));
    const a = id ? DB.get('atividades', id) : null;

    const clientOpts = clientes.map(c => `<option value="${c.id}" ${a?.clienteId===c.id?'selected':''}>${Utils.escHtml(c.nome)}</option>`).join('');
    const leadOpts = leads.map(l => `<option value="${l.id}" ${a?.leadId===l.id?'selected':''}>${Utils.escHtml(l.titulo)}</option>`).join('');
    const tipoOpts = Object.entries(Utils.ATIV_TIPO).map(([k,v]) => `<option value="${k}" ${a?.tipo===k?'selected':''}>${v.icon} ${v.label}</option>`).join('');
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${a?.responsavel===r?'selected':''}>${r}</option>`).join('');
    const statusOpts = Object.entries(Utils.ATIV_STATUS).map(([k,v]) => `<option value="${k}" ${(a?.status||'pendente')===k?'selected':''}>${v.label}</option>`).join('');

    Modal.open({
      title: id ? 'Editar Atividade' : 'Nova Atividade',
      body: `
        <div class="form-group">
          <label class="form-label">Título *</label>
          <input class="form-control" id="faTitulo" value="${Utils.escHtml(a?.titulo||'')}" placeholder="Descrição rápida da atividade">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-control" id="faTipo">${tipoOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Prioridade</label>
            <select class="form-control" id="faPrioridade">
              <option value="baixa" ${a?.prioridade==='baixa'?'selected':''}>🟢 Baixa</option>
              <option value="media" ${(a?.prioridade||'media')==='media'?'selected':''}>🟡 Média</option>
              <option value="alta" ${a?.prioridade==='alta'?'selected':''}>🔴 Alta</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="faStatus">${statusOpts}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data</label>
            <input class="form-control" id="faData" type="date" value="${a?.data||Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Hora</label>
            <input class="form-control" id="faHora" type="time" value="${a?.hora||'09:00'}">
          </div>
          <div class="form-group">
            <label class="form-label">Responsável</label>
            <select class="form-control" id="faResp"><option value="">—</option>${respOpts}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cliente (opcional)</label>
            <select class="form-control" id="faCliente"><option value="">—</option>${clientOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Lead (opcional)</label>
            <select class="form-control" id="faLead"><option value="">—</option>${leadOpts}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição / Detalhes</label>
          <textarea class="form-control" id="faDescricao" rows="3">${Utils.escHtml(a?.descricao||'')}</textarea>
        </div>
      `,
      saveCb: () => saveAtividade(id),
    });
  }

  function saveAtividade(id) {
    const titulo = document.getElementById('faTitulo').value.trim();
    if (!titulo) { Toast.error('Título obrigatório'); return; }
    const data = {
      titulo,
      tipo: document.getElementById('faTipo').value,
      prioridade: document.getElementById('faPrioridade').value,
      status: document.getElementById('faStatus').value,
      data: document.getElementById('faData').value,
      hora: document.getElementById('faHora').value,
      responsavel: document.getElementById('faResp').value,
      clienteId: document.getElementById('faCliente').value,
      leadId: document.getElementById('faLead').value,
      descricao: document.getElementById('faDescricao').value,
    };
    if (id) { DB.update('atividades', id, data); Toast.success('Atividade atualizada'); }
    else { DB.create('atividades', data); Toast.success('Atividade criada'); }
    Modal.close();
    render();
    App.updateNotifBadge();
  }

  function concluir(id) {
    DB.update('atividades', id, { status: 'concluida' });
    Toast.success('Atividade concluída!');
    render();
    App.updateNotifBadge();
  }

  function deleteAtividade(id) {
    const a = DB.get('atividades', id);
    Utils.confirmDelete(a?.titulo || 'esta atividade', () => {
      DB.remove('atividades', id);
      Toast.success('Atividade removida');
      _selected.delete(id);
      render();
      App.updateNotifBadge();
    });
  }

  function toggleSelect(id, checked) {
    if (checked) _selected.add(id); else _selected.delete(id);
    render();
  }

  function toggleAll(checked) {
    const atividades = DB.getAll('atividades');
    let list = [...atividades];
    if (_filter.status) list = list.filter(a => a.status === _filter.status);
    if (_filter.tipo) list = list.filter(a => a.tipo === _filter.tipo);
    if (_filter.responsavel) list = list.filter(a => a.responsavel === _filter.responsavel);
    if (checked) list.forEach(a => _selected.add(a.id));
    else _selected.clear();
    render();
  }

  function clearSelection() { _selected.clear(); render(); }

  function bulkConcluir() {
    if (_selected.size === 0) return;
    Confirm.show(`Concluir ${_selected.size} atividade(s)?`, 'Todas serão marcadas como concluídas.', () => {
      _selected.forEach(id => DB.update('atividades', id, { status: 'concluida' }));
      Toast.success(`${_selected.size} atividade(s) concluída(s)!`);
      _selected.clear();
      render();
      App.updateNotifBadge();
    });
  }

  function bulkExcluir() {
    if (_selected.size === 0) return;
    Confirm.show(`Excluir ${_selected.size} atividade(s)?`, 'Esta ação não pode ser desfeita.', () => {
      _selected.forEach(id => DB.remove('atividades', id));
      Toast.success(`${_selected.size} atividade(s) removida(s)!`);
      _selected.clear();
      render();
      App.updateNotifBadge();
    });
  }

  function addNew() { openForm(); }

  return { render, openForm, saveAtividade, concluir, deleteAtividade, setFilter, addNew, toggleSelect, toggleAll, clearSelection, bulkConcluir, bulkExcluir };
})();
