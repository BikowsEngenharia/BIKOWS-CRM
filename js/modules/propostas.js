/* ==========================================
   PROPOSTAS — Orçamentos e propostas comerciais
   ========================================== */
const Propostas = (() => {

  let _filter = { status: '' };
  let _formItems = []; // itens da proposta em edição

  function _emptyItem() {
    return { desc: '', qtd: 1, un: 'Serv.', unit: 0, disc: 0, total: 0 };
  }

  function _calcItem(item) {
    const sub = item.qtd * item.unit;
    item.total = sub * (1 - item.disc / 100);
    return item;
  }

  function _sumItems() {
    return _formItems.reduce((s, it) => s + it.total, 0);
  }

  function _renderItemsSection() {
    const body = document.getElementById('itemsBody');
    if (!body) return;
    body.innerHTML = _formItems.map((it, i) => `
      <tr>
        <td><input class="form-control" style="min-width:160px" value="${Utils.escHtml(it.desc)}" oninput="Propostas._setItemField(${i},'desc',this.value)" placeholder="Descrição do serviço"></td>
        <td><input class="form-control" style="width:60px;text-align:center" type="number" min="0.01" step="0.01" value="${it.qtd}" oninput="Propostas._setItemField(${i},'qtd',+this.value)"></td>
        <td><input class="form-control" style="width:60px;text-align:center" value="${Utils.escHtml(it.un)}" oninput="Propostas._setItemField(${i},'un',this.value)"></td>
        <td><input class="form-control" style="width:110px;text-align:right" type="number" min="0" step="0.01" value="${it.unit}" oninput="Propostas._setItemField(${i},'unit',+this.value)"></td>
        <td><input class="form-control" style="width:60px;text-align:center" type="number" min="0" max="100" step="0.5" value="${it.disc}" oninput="Propostas._setItemField(${i},'disc',+this.value)"></td>
        <td class="font-bold text-primary text-sm" style="text-align:right;white-space:nowrap">${Utils.formatCurrency(it.total)}</td>
        <td><button class="btn btn-xs btn-danger" onclick="Propostas.removeItemRow(${i})">✕</button></td>
      </tr>`).join('');
    _updateItemsTotal();
  }

  function _updateItemsTotal() {
    const total = _sumItems();
    const el = document.getElementById('fpItemsTotal');
    if (el) el.textContent = Utils.formatCurrency(total);
    const fpValor = document.getElementById('fpValor');
    if (fpValor && _formItems.length > 0) fpValor.value = total.toFixed(2);
  }

  function _setItemField(i, field, val) {
    if (!_formItems[i]) return;
    _formItems[i][field] = val;
    _calcItem(_formItems[i]);
    _renderItemsSection();
  }

  function addItemRow() {
    _formItems.push(_emptyItem());
    _renderItemsSection();
  }

  function removeItemRow(i) {
    _formItems.splice(i, 1);
    _renderItemsSection();
  }

  function render() {
    const propostas = DB.getAll('propostas');
    const config = DB.getConfig();
    let list = propostas;
    if (_filter.status) list = list.filter(p => p.status === _filter.status);

    const totalEnviadas = propostas.filter(p => ['enviada','negociacao'].includes(p.status)).length;
    const totalAprovadas = propostas.filter(p => p.status === 'aprovada').length;
    const valorEmAberto = Utils.sum(propostas.filter(p => ['enviada','negociacao'].includes(p.status)), 'valor');
    const valorAprovado = Utils.sum(propostas.filter(p => p.status === 'aprovada'), 'valor');
    const taxa = propostas.length > 0 ? ((totalAprovadas / propostas.length) * 100).toFixed(0) : 0;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Propostas</h2>
        <div class="sec-actions">
          <button class="btn btn-primary" onclick="Propostas.openForm()">+ Nova Proposta</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card" style="--kpi-color:#f97316"><div class="kpi-label">Em Aberto</div><div class="kpi-value">${totalEnviadas}</div><div class="kpi-sub">${Utils.formatCurrency(valorEmAberto)}</div><div class="kpi-icon">📤</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Aprovadas</div><div class="kpi-value">${totalAprovadas}</div><div class="kpi-sub">${Utils.formatCurrency(valorAprovado)}</div><div class="kpi-icon">✅</div></div>
        <div class="kpi-card" style="--kpi-color:#1a56db"><div class="kpi-label">Taxa de Aprovação</div><div class="kpi-value">${taxa}%</div><div class="kpi-sub">${propostas.length} propostas total</div><div class="kpi-icon">📊</div></div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6"><div class="kpi-label">Total das Propostas</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(Utils.sum(propostas,'valor'))}</div><div class="kpi-icon">💼</div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Propostas.setFilter('status',this.value)">
              <option value="">Todos os status</option>
              ${Object.entries(Utils.PROP_STATUS).map(([k,v]) => `<option value="${k}" ${_filter.status===k?'selected':''}>${v.label}</option>`).join('')}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} proposta(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? emptyState() : `
          <table class="tbl">
            <thead><tr><th>Nº</th><th>Proposta</th><th>Cliente</th><th>Valor</th><th>Validade</th><th>Responsável</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.map(p => {
                const dias = Utils.daysUntil(p.validade);
                const expirado = dias != null && dias < 0 && !['aprovada','recusada'].includes(p.status);
                const validadeLabel = dias == null ? '—' : dias < 0 ? `Expirada ${Math.abs(dias)}d` : dias === 0 ? 'Expira hoje' : `${dias}d restantes`;
                return `<tr>
                  <td class="text-xs font-bold text-muted">${Utils.escHtml(p.numero||'—')}</td>
                  <td><div class="font-bold" style="max-width:200px">${Utils.escHtml(p.titulo)}</div>${p.descricao ? `<div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(p.descricao,50))}</div>` : ''}</td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(p.clienteId))}</td>
                  <td class="font-bold text-primary">${Utils.formatCurrency(p.valor)}</td>
                  <td class="text-sm ${expirado ? 'text-danger' : 'text-muted'}">${Utils.formatDate(p.validade)}<br><span class="text-xs">${validadeLabel}</span></td>
                  <td class="text-sm">${Utils.escHtml(p.responsavel||'—')}</td>
                  <td>${Utils.propBadge(p.status)}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Propostas.view('${p.id}')">Ver</button>
                      <button class="btn btn-xs btn-success" onclick="PropostaGenerator.open('${p.id}')" title="Gerar proposta PDF">🖨 Gerar</button>
                      <button class="btn btn-xs btn-secondary" onclick="Propostas.openForm('${p.id}')">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Propostas.deleteProposta('${p.id}')">🗑</button>
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
    return `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">Nenhuma proposta</div><button class="btn btn-primary mt-4" onclick="Propostas.openForm()">+ Criar Proposta</button></div>`;
  }

  function setFilter(k, v) { _filter[k] = v; render(); }

  function view(id) {
    const p = DB.get('propostas', id);
    if (!p) return;
    const cliente = DB.get('clientes', p.clienteId);
    Modal.open({
      title: `Proposta ${p.numero || ''}`,
      size: 'modal-lg',
      body: `
        <div style="background:var(--bg);padding:16px;border-radius:var(--radius);margin-bottom:20px">
          <div class="flex items-center justify-between mb-2">
            <div>
              <div class="text-xs text-muted">Proposta Nº</div>
              <div class="font-bold text-lg">${Utils.escHtml(p.numero||'—')}</div>
            </div>
            <div>${Utils.propBadge(p.status)}</div>
          </div>
          <div class="font-bold" style="font-size:18px;color:var(--text)">${Utils.escHtml(p.titulo)}</div>
          ${p.descricao ? `<div class="text-sm text-muted mt-1">${Utils.escHtml(p.descricao)}</div>` : ''}
        </div>

        <div class="detail-grid mb-4">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(cliente?.nome||'—')}</div></div>
          <div class="detail-field"><div class="detail-label">Responsável</div><div class="detail-value">${Utils.escHtml(p.responsavel||'—')}</div></div>
          <div class="detail-field"><div class="detail-label">Valor da Proposta</div><div class="detail-value font-bold text-primary" style="font-size:18px">${Utils.formatCurrency(p.valor)}</div></div>
          <div class="detail-field"><div class="detail-label">Validade</div><div class="detail-value">${Utils.formatDate(p.validade)}</div></div>
        </div>

        ${(p.itens && p.itens.length > 0) ? `
        <div class="detail-field mb-3">
          <div class="detail-label mb-2">Itens da Proposta</div>
          <div style="overflow-x:auto">
            <table class="tbl">
              <thead><tr><th>Descrição</th><th>Qtd</th><th>Un.</th><th>Val. Unit.</th><th>Desc%</th><th>Total</th></tr></thead>
              <tbody>
                ${p.itens.map(it => `<tr>
                  <td class="text-sm">${Utils.escHtml(it.desc||'')}</td>
                  <td class="text-sm text-center">${it.qtd}</td>
                  <td class="text-sm text-center text-muted">${Utils.escHtml(it.un||'')}</td>
                  <td class="text-sm text-right">${Utils.formatCurrency(it.unit)}</td>
                  <td class="text-sm text-center">${it.disc ? it.disc+'%' : '—'}</td>
                  <td class="font-bold text-primary text-right">${Utils.formatCurrency(it.total)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

        ${p.observacoes ? `<div class="detail-field mb-3"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(p.observacoes)}</div></div>` : ''}

        <div class="form-group">
          <label class="form-label">Alterar Status</label>
          <div class="flex gap-2">
            ${Object.entries(Utils.PROP_STATUS).map(([k,v]) => `<button class="btn btn-sm ${p.status===k?'btn-primary':'btn-secondary'}" onclick="Propostas.changeStatus('${id}','${k}')">${v.label}</button>`).join('')}
          </div>
        </div>

        <div class="mt-4 flex gap-2" style="flex-wrap:wrap">
          <button class="btn btn-success btn-sm" onclick="Modal.close();PropostaGenerator.open('${id}')">🖨 Gerar PDF</button>
          ${p.status === 'aprovada' ? `<button class="btn btn-primary btn-sm" onclick="Modal.close();Propostas.criarRecebivel('${id}')">💰 Criar Recebível</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="Modal.close();Propostas.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  function changeStatus(id, status) {
    DB.update('propostas', id, { status });
    Toast.success('Status atualizado');
    Modal.close();
    render();
  }

  function openForm(id = null) {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const p = id ? DB.get('propostas', id) : null;

    // Init form items from existing proposta or empty
    _formItems = (p?.itens || []).map(it => _calcItem({ ...it }));

    const clientOpts = clientes.map(c => `<option value="${c.id}" ${p?.clienteId===c.id?'selected':''}>${Utils.escHtml(c.nome)}</option>`).join('');
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${p?.responsavel===r?'selected':''}>${r}</option>`).join('');
    const statusOpts = Object.entries(Utils.PROP_STATUS).map(([k,v]) => `<option value="${k}" ${(p?.status||'elaboracao')===k?'selected':''}>${v.label}</option>`).join('');

    const nextNum = 'BIK-' + new Date().getFullYear() + '-CTR-' + String(DB.getAll('propostas').length + 1).padStart(3, '0');

    Modal.open({
      title: id ? 'Editar Proposta' : 'Nova Proposta',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Número da Proposta</label>
            <input class="form-control" id="fpNum" value="${Utils.escHtml(p?.numero||nextNum)}">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="fpStatus">${statusOpts}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Título da Proposta *</label>
          <input class="form-control" id="fpTitulo" value="${Utils.escHtml(p?.titulo||'')}" placeholder="Ex: Adequação NR-12 — Frigorífico Bela Vista">
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cliente</label>
            <select class="form-control" id="fpCliente"><option value="">Selecionar cliente</option>${clientOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Responsável</label>
            <select class="form-control" id="fpResp"><option value="">—</option>${respOpts}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Validade</label>
            <input class="form-control" id="fpValidade" type="date" value="${p?.validade||''}">
          </div>
        </div>

        <!-- ITENS DA PROPOSTA -->
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label class="form-label" style="margin:0">📋 Itens da Proposta</label>
            <button type="button" class="btn btn-sm btn-secondary" onclick="Propostas.addItemRow()">+ Adicionar Item</button>
          </div>
          <div style="overflow-x:auto">
            <table class="tbl" style="min-width:620px">
              <thead><tr><th style="min-width:160px">Descrição</th><th>Qtd</th><th>Un.</th><th>Val. Unitário</th><th>Desc%</th><th>Total</th><th></th></tr></thead>
              <tbody id="itemsBody"></tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;gap:16px;align-items:center">
            <span class="text-sm text-muted">Total dos itens:</span>
            <span class="font-bold text-primary" style="font-size:18px" id="fpItemsTotal">${Utils.formatCurrency(_sumItems())}</span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor Total (R$) *</label>
            <input class="form-control" id="fpValor" type="number" step="0.01" value="${p?.valor||''}" placeholder="Preenchido automaticamente pelos itens">
            <div class="text-xs text-muted mt-1">Preenchido automaticamente ao adicionar itens, ou informe manualmente</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Descrição do Escopo</label>
          <textarea class="form-control" id="fpDesc" rows="3">${Utils.escHtml(p?.descricao||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Observações / Condições de Pagamento</label>
          <textarea class="form-control" id="fpObs" rows="3">${Utils.escHtml(p?.observacoes||'')}</textarea>
        </div>
      `,
      saveCb: () => saveProposta(id),
    });
    // Render items after modal is shown
    setTimeout(() => _renderItemsSection(), 50);
  }

  function saveProposta(id) {
    const titulo = document.getElementById('fpTitulo').value.trim();
    if (!titulo) { Toast.error('Título obrigatório'); return; }
    // Use items total if items exist, else manual valor
    const autoValor = _formItems.length > 0 ? _sumItems() : 0;
    const manualValor = Number(document.getElementById('fpValor').value);
    const valor = autoValor > 0 ? autoValor : manualValor;
    if (!valor) { Toast.error('Informe o valor da proposta ou adicione itens'); return; }
    const data = {
      numero: document.getElementById('fpNum').value,
      titulo,
      status: document.getElementById('fpStatus').value,
      clienteId: document.getElementById('fpCliente').value,
      responsavel: document.getElementById('fpResp').value,
      valor,
      validade: document.getElementById('fpValidade').value,
      descricao: document.getElementById('fpDesc').value,
      observacoes: document.getElementById('fpObs').value,
      itens: _formItems.map(it => ({ ...it })),
    };
    if (id) { DB.update('propostas', id, data); Toast.success('Proposta atualizada'); }
    else { DB.create('propostas', data); Toast.success('Proposta criada'); }
    Modal.close();
    render();
  }

  function deleteProposta(id) {
    const p = DB.get('propostas', id);
    Utils.confirmDelete(p?.titulo || 'esta proposta', () => {
      DB.remove('propostas', id);
      Toast.success('Proposta removida');
      render();
    });
  }

  function criarRecebivel(id) {
    const p = DB.get('propostas', id);
    if (!p) return;
    if (DB.getAll('recebiveis').some(r => r.propostaOrigemId === id)) {
      Toast.error('Já existe um recebível para esta proposta'); return;
    }
    DB.create('recebiveis', {
      clienteId: p.clienteId,
      descricao: `${p.numero || 'Proposta'} — ${p.titulo}`,
      valorTotal: p.valor,
      propostaOrigemId: id,
      parcelas: [{ id: Date.now().toString(36), vencimento: p.validade || Utils.todayStr(), valor: p.valor, status: 'a_vencer', dataPagamento: null, nfNumero: '' }],
    });
    Toast.success('Recebível criado! Acesse Financeiro → Contas a Receber para configurar as parcelas.');
    render();
  }

  function addNew() { openForm(); }

  return { render, openForm, saveProposta, deleteProposta, view, setFilter, changeStatus, criarRecebivel, addNew, addItemRow, removeItemRow, _setItemField };
})();
