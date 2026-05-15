/* ==========================================
   CONTATOS — Gestão de pessoas / decisores
   ========================================== */
const Contatos = (() => {

  let _search = '';

  function render() {
    const contatos = DB.getAll('contatos');
    const clientes = DB.getAll('clientes');
    let list = contatos;
    if (_search) {
      const s = _search.toLowerCase();
      list = list.filter(c => c.nome?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.cargo?.toLowerCase().includes(s));
    }

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Contatos</h2>
        <div class="sec-actions">
          <button class="btn btn-primary" onclick="Contatos.openForm()">+ Novo Contato</button>
        </div>
      </div>

      <div class="stats-row mb-4">
        <div class="stat-box"><div class="stat-val">${contatos.length}</div><div class="stat-lbl">Total de Contatos</div></div>
        <div class="stat-box"><div class="stat-val">${contatos.filter(c=>c.principal).length}</div><div class="stat-lbl">Contatos Principais</div></div>
        <div class="stat-box"><div class="stat-val">${[...new Set(contatos.map(c=>c.clienteId))].length}</div><div class="stat-lbl">Empresas</div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <input class="form-control" style="max-width:260px" placeholder="Buscar contato..." value="${Utils.escHtml(_search)}"
            oninput="Contatos.setSearch(this.value)">
          <span class="text-sm text-muted">${list.length} contato(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? `<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">Nenhum contato encontrado</div><button class="btn btn-primary mt-4" onclick="Contatos.openForm()">+ Cadastrar Contato</button></div>` : `
          <table class="tbl">
            <thead><tr><th>Nome</th><th>Empresa</th><th>Cargo</th><th>E-mail</th><th>Telefone</th><th>LinkedIn</th><th>Principal</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.map(c => {
                const empresa = clientes.find(cl => cl.id === c.clienteId);
                return `<tr>
                  <td><div class="font-bold">${Utils.escHtml(c.nome)}</div></td>
                  <td class="text-sm">${Utils.escHtml(empresa?.nome || '—')}</td>
                  <td class="text-sm text-muted">${Utils.escHtml(c.cargo || '—')}</td>
                  <td class="text-sm">${c.email ? `<a href="mailto:${Utils.escHtml(c.email)}" style="color:var(--primary)">${Utils.escHtml(c.email)}</a>` : '—'}</td>
                  <td class="text-sm">
                    ${c.telefone ? `<span style="display:flex;align-items:center;gap:4px">${Utils.escHtml(c.telefone)} ${Utils.waBtn(c.telefone)}</span>` : '—'}
                  </td>
                  <td class="text-sm">${c.linkedin ? `<a href="${Utils.escHtml(c.linkedin)}" target="_blank" style="color:var(--primary)">LinkedIn</a>` : '—'}</td>
                  <td>${c.principal ? '<span class="badge badge-green">Principal</span>' : ''}</td>
                  <td>
                    <div class="tbl-actions">
                      ${Utils.waBtn(c.telefone, 'me-1')}
                      <button class="btn btn-xs btn-secondary" onclick="Contatos.openForm('${c.id}')">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Contatos.deleteContato('${c.id}')">🗑</button>
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

  function setSearch(v) { _search = v; render(); }

  function openForm(id = null) {
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const c = id ? DB.get('contatos', id) : null;
    const clientOptions = clientes.map(cl => `<option value="${cl.id}" ${c?.clienteId===cl.id?'selected':''}>${Utils.escHtml(cl.nome)}</option>`).join('');

    Modal.open({
      title: id ? 'Editar Contato' : 'Novo Contato',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Nome Completo *</label>
            <input class="form-control" id="fcNome" value="${Utils.escHtml(c?.nome||'')}" placeholder="Nome do contato">
          </div>
          <div class="form-group">
            <label class="form-label">Cargo</label>
            <input class="form-control" id="fcCargo" value="${Utils.escHtml(c?.cargo||'')}" placeholder="Gerente de Segurança">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Empresa</label>
          <select class="form-control" id="fcCliente">
            <option value="">Selecionar empresa</option>
            ${clientOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <input class="form-control" id="fcEmail" type="email" value="${Utils.escHtml(c?.email||'')}" placeholder="contato@empresa.com.br">
          </div>
          <div class="form-group">
            <label class="form-label">Telefone / WhatsApp</label>
            <input class="form-control" id="fcTelefone" value="${Utils.escHtml(c?.telefone||'')}" placeholder="(XX) XXXXX-XXXX">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">LinkedIn</label>
          <input class="form-control" id="fcLinkedin" value="${Utils.escHtml(c?.linkedin||'')}" placeholder="linkedin.com/in/perfil">
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fcObs" rows="2">${Utils.escHtml(c?.observacoes||'')}</textarea>
        </div>
        <div class="form-group">
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
            <input type="checkbox" id="fcPrincipal" ${c?.principal?'checked':''}>
            <span class="form-label" style="margin:0">Contato principal desta empresa</span>
          </label>
        </div>
      `,
      saveCb: () => saveContato(id),
    });
  }

  function saveContato(id) {
    const nome = document.getElementById('fcNome').value.trim();
    if (!nome) { Toast.error('Nome obrigatório'); return; }
    const data = {
      nome,
      cargo: document.getElementById('fcCargo').value,
      clienteId: document.getElementById('fcCliente').value,
      email: document.getElementById('fcEmail').value,
      telefone: document.getElementById('fcTelefone').value,
      linkedin: document.getElementById('fcLinkedin').value,
      observacoes: document.getElementById('fcObs').value,
      principal: document.getElementById('fcPrincipal').checked,
    };
    if (id) { DB.update('contatos', id, data); Toast.success('Contato atualizado'); }
    else { DB.create('contatos', data); Toast.success('Contato cadastrado'); }
    Modal.close();
    render();
  }

  function deleteContato(id) {
    const c = DB.get('contatos', id);
    Utils.confirmDelete(c?.nome || 'este contato', () => {
      DB.remove('contatos', id);
      Toast.success('Contato removido');
      render();
    });
  }

  function addNew() { openForm(); }

  return { render, openForm, saveContato, deleteContato, setSearch, addNew };
})();
