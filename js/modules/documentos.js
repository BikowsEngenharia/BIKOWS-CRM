/* ==========================================
   DOCUMENTOS — Gestão de arquivos e links
   Embeddable em Clientes, Projetos e standalone
   ========================================== */
const Documentos = (() => {

  const TIPOS = [
    { val: 'contrato',     label: '📋 Contrato',          cor: '#3b82f6' },
    { val: 'proposta',     label: '📄 Proposta',           cor: '#8b5cf6' },
    { val: 'laudo',        label: '📑 Laudo Técnico',      cor: '#10b981' },
    { val: 'art',          label: '📜 ART',                cor: '#f59e0b' },
    { val: 'nf',           label: '🧾 Nota Fiscal',        cor: '#ef4444' },
    { val: 'projeto',      label: '📐 Projeto / Planta',   cor: '#0ea5e9' },
    { val: 'foto',         label: '📷 Foto / Relatório',   cor: '#ec4899' },
    { val: 'certificado',  label: '🏅 Certificado',        cor: '#84cc16' },
    { val: 'checklist',    label: '✅ Checklist',          cor: '#14b8a6' },
    { val: 'email',        label: '📧 E-mail / Comunicado',cor: '#6366f1' },
    { val: 'outro',        label: '📎 Outro',              cor: '#94a3b8' },
  ];

  function getTipo(val) {
    return TIPOS.find(t => t.val === val) || TIPOS[TIPOS.length - 1];
  }

  /* ====================================================
     RENDER LISTA (para embed em clientes/projetos)
     ==================================================== */
  function renderLista(containerId, filtro) {
    // filtro: { clienteId? } ou { projetoId? }
    const el = document.getElementById(containerId);
    if (!el) return;

    let docs = DB.getAll('documentos');
    if (filtro.clienteId) docs = docs.filter(d => d.clienteId === filtro.clienteId || d._clienteId === filtro.clienteId);
    if (filtro.projetoId) docs = docs.filter(d => d.projetoId === filtro.projetoId);
    docs = docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const filtroExtra = JSON.stringify(filtro).replace(/"/g, '&quot;');

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="font-bold text-sm">📎 Documentos e Arquivos (${docs.length})</div>
        <button class="btn btn-primary btn-sm" onclick="Documentos.abrirForm(${filtroExtra})">+ Novo Documento</button>
      </div>
      ${docs.length === 0 ? `
        <div style="text-align:center;padding:32px;color:var(--text-muted)">
          <div style="font-size:32px;margin-bottom:8px">📎</div>
          <div class="text-sm">Nenhum documento cadastrado.</div>
          <div class="text-xs text-muted mt-1">Adicione links de contratos, laudos, ARTs, fotos e outros arquivos.</div>
        </div>` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
        ${docs.map(d => {
          const tipo = getTipo(d.tipo);
          return `
          <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--surface);transition:var(--t);position:relative" onmouseover="this.style.borderColor='${tipo.cor}'" onmouseout="this.style.borderColor='var(--border)'">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <div style="width:36px;height:36px;border-radius:8px;background:${tipo.cor}20;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${tipo.label.split(' ')[0]}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escHtml(d.nome)}</div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
                  <span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:99px;background:${tipo.cor}20;color:${tipo.cor};border:1px solid ${tipo.cor}40">${tipo.label.replace(/^[^ ]+ /, '')}</span>
                  <span style="font-size:10px;color:var(--text-muted)">${Utils.formatDate(d.data || d.createdAt?.split('T')[0])}</span>
                </div>
                ${d.descricao ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escHtml(d.descricao)}</div>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
              ${d.url ? `<a href="${Utils.escHtml(d.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-primary" style="flex:1;text-align:center">🔗 Abrir</a>` : `<span class="btn btn-xs btn-secondary" style="flex:1;text-align:center;opacity:.5;cursor:default">Sem link</span>`}
              <button class="btn btn-xs btn-secondary" onclick="Documentos.abrirForm(${filtroExtra},'${d.id}')" title="Editar">✏</button>
              <button class="btn btn-xs btn-danger" onclick="Documentos.remover('${d.id}','${containerId}',${filtroExtra})" title="Excluir">🗑</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
    `;
  }

  /* ====================================================
     FORM — Criar/Editar documento
     ==================================================== */
  function abrirForm(filtro, docId = null) {
    const doc = docId ? DB.get('documentos', docId) : null;

    // Se filtro tem projetoId, buscar clienteId do projeto
    let clienteIdAuto = filtro.clienteId || '';
    if (filtro.projetoId && !clienteIdAuto) {
      const proj = DB.get('projetos', filtro.projetoId);
      clienteIdAuto = proj?.clienteId || '';
    }

    // Opções de cliente
    const clientes = DB.getAll('clientes');
    const clienteOpts = '<option value="">— Sem cliente vinculado —</option>' +
      clientes.map(c => `<option value="${c.id}" ${(doc?.clienteId || clienteIdAuto) === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('');

    // Opções de projeto
    const projetos = DB.getAll('projetos');
    const projetoOpts = '<option value="">— Sem projeto vinculado —</option>' +
      projetos.map(p => `<option value="${p.id}" ${(doc?.projetoId || filtro.projetoId) === p.id ? 'selected' : ''}>${Utils.escHtml(p.titulo)}</option>`).join('');

    const tiposOpts = TIPOS.map(t => `<option value="${t.val}" ${(doc?.tipo || 'outro') === t.val ? 'selected' : ''}>${t.label}</option>`).join('');

    Modal.open({
      title: docId ? 'Editar Documento' : 'Novo Documento',
      size: 'modal-md',
      body: `
        <div class="form-group">
          <label class="form-label">Nome / Título do Documento *</label>
          <input class="form-control" id="docNome" value="${Utils.escHtml(doc?.nome || '')}" placeholder="Ex: Contrato BIK-2026-CTR-001, Laudo NR-12 Prensas..." autofocus>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-control" id="docTipo">${tiposOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Data do Documento</label>
            <input class="form-control" id="docData" type="date" value="${doc?.data || Utils.todayStr()}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">URL / Link do Arquivo</label>
          <input class="form-control" id="docUrl" value="${Utils.escHtml(doc?.url || '')}" placeholder="https://drive.google.com/... ou https://dropbox.com/...">
          <div class="text-xs text-muted mt-1">Cole o link do Google Drive, Dropbox, OneDrive, SharePoint ou qualquer URL pública.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição / Observações</label>
          <textarea class="form-control" id="docDescricao" rows="2" placeholder="Notas sobre este documento...">${Utils.escHtml(doc?.descricao || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cliente Vinculado</label>
            <select class="form-control" id="docCliente">${clienteOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Projeto Vinculado</label>
            <select class="form-control" id="docProjeto">${projetoOpts}</select>
          </div>
        </div>
      `,
      saveCb: () => {
        const nome = document.getElementById('docNome').value.trim();
        if (!nome) { Toast.error('Nome do documento é obrigatório'); return; }

        const data = {
          nome,
          tipo: document.getElementById('docTipo').value,
          data: document.getElementById('docData').value,
          url: document.getElementById('docUrl').value.trim(),
          descricao: document.getElementById('docDescricao').value.trim(),
          clienteId: document.getElementById('docCliente').value || filtro.clienteId || clienteIdAuto || '',
          projetoId: document.getElementById('docProjeto').value || filtro.projetoId || '',
        };

        if (docId) {
          DB.update('documentos', docId, data);
          Toast.success('Documento atualizado!');
        } else {
          DB.create('documentos', data);
          Toast.success('Documento cadastrado!');
        }

        // Re-renderizar a lista onde estava
        const containerId = filtro.projetoId ? 'docsProjeto' : filtro.clienteId ? 'docsCliente' : 'docsGlobal';
        setTimeout(() => renderLista(containerId, filtro), 200);
      },
    });
  }

  function remover(docId, containerId, filtro) {
    const doc = DB.get('documentos', docId);
    Confirm.show('Remover Documento', `Remover "${doc?.nome || 'documento'}"?`, () => {
      DB.remove('documentos', docId);
      Toast.success('Documento removido');
      renderLista(containerId, filtro);
    });
  }

  /* ====================================================
     PÁGINA STANDALONE — Todos os documentos
     ==================================================== */
  let _filter = { busca: '', tipo: '', clienteId: '' };

  function render() {
    const docs = DB.getAll('documentos');
    const clientes = DB.getAll('clientes');

    let list = docs;
    if (_filter.busca) {
      const t = _filter.busca.toLowerCase();
      list = list.filter(d => d.nome?.toLowerCase().includes(t) || d.descricao?.toLowerCase().includes(t) || Utils.getClientName(d.clienteId)?.toLowerCase().includes(t));
    }
    if (_filter.tipo) list = list.filter(d => d.tipo === _filter.tipo);
    if (_filter.clienteId) list = list.filter(d => d.clienteId === _filter.clienteId);
    list = list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Resumo por tipo
    const byTipo = {};
    docs.forEach(d => { byTipo[d.tipo] = (byTipo[d.tipo] || 0) + 1; });

    const clienteOpts = '<option value="">Todos os clientes</option>' +
      clientes.map(c => `<option value="${c.id}" ${_filter.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('');

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Documentos</h2>
        <div class="sec-actions">
          <button class="btn btn-primary" onclick="Documentos.abrirFormGlobal()">+ Novo Documento</button>
        </div>
      </div>

      <!-- KPIs rápidos -->
      <div class="stats-row mb-4">
        <div class="stat-box"><div class="stat-val">${docs.length}</div><div class="stat-lbl">Total</div></div>
        ${Object.entries(byTipo).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([tipo, qtd]) => {
          const t = getTipo(tipo);
          return `<div class="stat-box" style="border-left:3px solid ${t.cor}"><div class="stat-val" style="color:${t.cor}">${qtd}</div><div class="stat-lbl">${t.label.replace(/^[^ ]+ /, '')}</div></div>`;
        }).join('')}
      </div>

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <input class="form-control" style="max-width:220px" placeholder="Buscar documento..." id="docSearch"
              value="${Utils.escHtml(_filter.busca)}" oninput="Documentos.setFilter('busca',this.value)">
            <select class="filter-select" onchange="Documentos.setFilter('tipo',this.value)">
              <option value="">Todos os tipos</option>
              ${TIPOS.map(t => `<option value="${t.val}" ${_filter.tipo === t.val ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Documentos.setFilter('clienteId',this.value)">
              ${clienteOpts}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} resultado(s)</span>
        </div>

        ${list.length === 0 ?
          `<div class="card-body"><div class="empty-state"><div class="empty-icon">📎</div><div class="empty-title">Nenhum documento encontrado</div><div class="empty-sub">Cadastre contratos, laudos, ARTs, fotos e outros arquivos</div><button class="btn btn-primary mt-4" onclick="Documentos.abrirFormGlobal()">+ Cadastrar Documento</button></div></div>` :
          `<div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Documento</th><th>Tipo</th><th>Cliente</th><th>Projeto</th><th>Data</th><th>Ações</th></tr></thead>
              <tbody>
                ${list.map(d => {
                  const tipo = getTipo(d.tipo);
                  const proj = d.projetoId ? DB.get('projetos', d.projetoId) : null;
                  return `<tr>
                    <td>
                      <div class="font-bold text-sm">${Utils.escHtml(d.nome)}</div>
                      ${d.descricao ? `<div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(d.descricao, 60))}</div>` : ''}
                    </td>
                    <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:${tipo.cor}20;color:${tipo.cor};border:1px solid ${tipo.cor}40">${tipo.label.replace(/^[^ ]+ /, '')}</span></td>
                    <td class="text-sm">${Utils.escHtml(Utils.getClientName(d.clienteId) || '—')}</td>
                    <td class="text-sm">${proj ? Utils.escHtml(Utils.truncate(proj.titulo, 30)) : '—'}</td>
                    <td class="text-sm text-muted">${Utils.formatDate(d.data || d.createdAt?.split('T')[0])}</td>
                    <td>
                      <div class="tbl-actions">
                        ${d.url ? `<a href="${Utils.escHtml(d.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-primary">🔗 Abrir</a>` : ''}
                        <button class="btn btn-xs btn-secondary" onclick="Documentos.abrirFormGlobal('${d.id}')">✏</button>
                        <button class="btn btn-xs btn-danger" onclick="Documentos.removerGlobal('${d.id}')">🗑</button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>
    `;
  }

  function setFilter(k, v) { _filter[k] = v; render(); }

  function addNew() { abrirFormGlobal(); }

  function abrirFormGlobal(docId = null) {
    const doc = docId ? DB.get('documentos', docId) : null;
    const clientes = DB.getAll('clientes');
    const projetos = DB.getAll('projetos');

    const clienteOpts = '<option value="">— Sem cliente —</option>' +
      clientes.map(c => `<option value="${c.id}" ${doc?.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('');
    const projetoOpts = '<option value="">— Sem projeto —</option>' +
      projetos.map(p => `<option value="${p.id}" ${doc?.projetoId === p.id ? 'selected' : ''}>${Utils.escHtml(p.titulo)}</option>`).join('');
    const tiposOpts = TIPOS.map(t => `<option value="${t.val}" ${(doc?.tipo || 'outro') === t.val ? 'selected' : ''}>${t.label}</option>`).join('');

    Modal.open({
      title: docId ? 'Editar Documento' : 'Novo Documento',
      size: 'modal-md',
      body: `
        <div class="form-group">
          <label class="form-label">Nome / Título *</label>
          <input class="form-control" id="docNome" value="${Utils.escHtml(doc?.nome || '')}" placeholder="Ex: Contrato NR-12 — Bela Vista" autofocus>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-control" id="docTipo">${tiposOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Data</label>
            <input class="form-control" id="docData" type="date" value="${doc?.data || Utils.todayStr()}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">URL / Link</label>
          <input class="form-control" id="docUrl" value="${Utils.escHtml(doc?.url || '')}" placeholder="https://drive.google.com/...">
          <div class="text-xs text-muted mt-1">Google Drive, Dropbox, OneDrive, SharePoint ou qualquer URL.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição</label>
          <textarea class="form-control" id="docDescricao" rows="2">${Utils.escHtml(doc?.descricao || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cliente</label>
            <select class="form-control" id="docCliente">${clienteOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Projeto</label>
            <select class="form-control" id="docProjeto">${projetoOpts}</select>
          </div>
        </div>
      `,
      saveCb: () => {
        const nome = document.getElementById('docNome').value.trim();
        if (!nome) { Toast.error('Nome obrigatório'); return; }
        const data = {
          nome,
          tipo: document.getElementById('docTipo').value,
          data: document.getElementById('docData').value,
          url: document.getElementById('docUrl').value.trim(),
          descricao: document.getElementById('docDescricao').value.trim(),
          clienteId: document.getElementById('docCliente').value,
          projetoId: document.getElementById('docProjeto').value,
        };
        if (docId) { DB.update('documentos', docId, data); Toast.success('Documento atualizado!'); }
        else { DB.create('documentos', data); Toast.success('Documento cadastrado!'); }
        render();
      },
    });
  }

  function removerGlobal(docId) {
    const doc = DB.get('documentos', docId);
    Confirm.show('Remover Documento', `Remover "${doc?.nome || 'documento'}"?`, () => {
      DB.remove('documentos', docId);
      Toast.success('Documento removido');
      render();
    });
  }

  return {
    render, addNew, setFilter,
    renderLista, abrirForm, remover,
    abrirFormGlobal, removerGlobal,
    getTipo,
  };
})();
