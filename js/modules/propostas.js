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
    const versoes = p.versoes || [];

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

        <!-- HISTÓRICO DE VERSÕES -->
        ${versoes.length > 0 ? `
        <div class="detail-field mb-3">
          <div class="detail-label mb-2">📋 Histórico de Versões</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${[...versoes].reverse().map((v, i) => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:var(--radius);border-left:3px solid ${i===0?'var(--primary)':'var(--border)'}">
                <span style="font-size:11px;font-weight:700;color:${i===0?'var(--primary)':'var(--text-muted)'}">v${versoes.length - i}</span>
                <div style="flex:1">
                  <div class="font-bold text-sm">${Utils.formatCurrency(v.valor)}</div>
                  <div class="text-xs text-muted">${v.motivo || 'Revisão'}</div>
                </div>
                <div class="text-xs text-muted">${new Date(v.data).toLocaleDateString('pt-BR')}</div>
              </div>`).join('')}
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--border);opacity:0.6">
              <span style="font-size:11px;font-weight:700;color:var(--text-muted)">v1</span>
              <div style="flex:1"><div class="font-bold text-sm">Versão original</div></div>
            </div>
          </div>
        </div>` : ''}

        <div class="form-group">
          <label class="form-label">Alterar Status</label>
          <div class="flex gap-2" style="flex-wrap:wrap">
            ${Object.entries(Utils.PROP_STATUS).map(([k,v]) => `<button class="btn btn-sm ${p.status===k?'btn-primary':'btn-secondary'}" onclick="Propostas.changeStatus('${id}','${k}')">${v.label}</button>`).join('')}
          </div>
        </div>

        <div class="mt-4 flex gap-2" style="flex-wrap:wrap">
          <button class="btn btn-success btn-sm" onclick="Modal.close();PropostaGenerator.open('${id}')">🖨 Gerar PDF</button>
          ${p.status === 'aprovada' ? `<button class="btn btn-primary btn-sm" onclick="Modal.close();Propostas.criarRecebivel('${id}')">💰 Criar Recebível</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="Modal.close();Propostas.openForm('${id}')">✏ Editar / Nova Versão</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  function changeStatus(id, status) {
    if (status === 'aprovada') {
      // Fluxo especial de fechamento
      Modal.close();
      setTimeout(() => abrirFluxoContratacao(id), 150);
      return;
    }
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
        ${id ? `<div class="form-group" style="background:var(--bg);padding:10px;border-radius:var(--radius)">
          <label class="form-label">Motivo da revisão (se alterar o valor)</label>
          <input class="form-control" id="fpMotivoRevisao" placeholder="Ex: Ajuste de escopo, negociação de desconto...">
        </div>` : ''}
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

    // Registrar versão anterior se o valor mudou
    let versoes = [];
    if (id) {
      const existing = DB.get('propostas', id);
      if (existing) {
        versoes = existing.versoes || [];
        if (existing.valor && existing.valor !== valor) {
          versoes = [...versoes, {
            data: new Date().toISOString(),
            valor: existing.valor,
            motivo: document.getElementById('fpMotivoRevisao')?.value || 'Revisão de valor',
            status: existing.status,
          }];
        }
      }
    }

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
      versoes,
    };
    if (id) { DB.update('propostas', id, data); Toast.success('Proposta atualizada — nova versão registrada'); }
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

  /* ====================================================
     FLUXO DE FECHAMENTO DE CONTRATO
     ==================================================== */
  let _etapasContrato = []; // etapas em edição no modal de fechamento

  function abrirFluxoContratacao(propostaId) {
    const prop = DB.get('propostas', propostaId);
    if (!prop) return;
    _etapasContrato = [];

    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes');
    const cli = clientes.find(c => c.id === prop.clienteId);
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}">${r}</option>`).join('');
    const projCount = String(DB.getAll('projetos').length + 1).padStart(3, '0');
    const codSuggest = `BIK-${new Date().getFullYear()}-PRJ-${projCount}`;

    Modal.open({
      title: `🤝 Fechar Contrato — ${Utils.escHtml(prop.titulo)}`,
      size: 'modal-xl',
      body: _buildContratoBody(prop, cli, respOpts, codSuggest),
      saveLabel: '✅ Confirmar e Criar Projeto',
      saveCb: () => _confirmarContrato(propostaId),
    });

    // Renderiza etapas iniciais após o modal abrir
    setTimeout(() => _renderEtapasContrato(), 60);
  }

  function _buildContratoBody(prop, cli, respOpts, codSuggest) {
    return `
      <!-- Banner da proposta -->
      <div style="background:linear-gradient(135deg,#1a56db15,#7c3aed10);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div class="text-xs text-muted">Proposta</div>
          <div class="font-bold">${Utils.escHtml(prop.numero||'—')} · ${Utils.escHtml(prop.titulo)}</div>
          <div class="text-sm text-muted">${Utils.escHtml(cli?.nome||'—')}</div>
        </div>
        <div style="text-align:right">
          <div class="text-xs text-muted">Valor da proposta</div>
          <div class="font-bold text-primary" style="font-size:20px">${Utils.formatCurrency(prop.valor)}</div>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:2px solid var(--border);margin-bottom:20px">
        <button id="ctab-fin" onclick="Propostas._ctab('fin')"
          style="padding:8px 20px;border:none;background:none;font-weight:700;color:var(--primary);border-bottom:2px solid var(--primary);margin-bottom:-2px;cursor:pointer">
          💰 Financeiro
        </button>
        <button id="ctab-proj" onclick="Propostas._ctab('proj')"
          style="padding:8px 20px;border:none;background:none;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer">
          📋 Projeto & Escopo
        </button>
      </div>

      <!-- PAINEL FINANCEIRO -->
      <div id="cpanel-fin">
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Valor Fechado (R$) *</label>
            <input class="form-control" id="cValorFechado" type="number" step="0.01" value="${prop.valor||''}">
          </div>
          <div class="form-group" style="flex:3">
            <label class="form-label">Condição de Pagamento *</label>
            <select class="form-control" id="cCondicao" onchange="Propostas._toggleCondicao()">
              <option value="avista">💵 À Vista</option>
              <option value="parcelas">📅 Parcelas Fixas</option>
              <option value="medicoes">📐 Medições / Vinculado a Etapas</option>
            </select>
          </div>
        </div>

        <!-- À vista -->
        <div id="cGrpAvista" style="background:var(--bg);border-radius:var(--radius);padding:14px;margin-bottom:12px">
          <div class="form-row" style="margin:0">
            <div class="form-group" style="margin-bottom:0;flex:1">
              <label class="form-label">Data Prevista de Recebimento</label>
              <input class="form-control" id="cAvistaData" type="date">
            </div>
            <div class="form-group" style="margin-bottom:0;flex:1">
              <label class="form-label">Forma de Pagamento</label>
              <select class="form-control" id="cAvistaForma">
                <option value="PIX">PIX</option>
                <option value="Transferência">Transferência</option>
                <option value="Boleto">Boleto</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Parcelas Fixas -->
        <div id="cGrpParcelas" style="display:none;background:var(--bg);border-radius:var(--radius);padding:14px;margin-bottom:12px">
          <div class="form-row" style="margin:0">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Nº de Parcelas</label>
              <input class="form-control" id="cNParcelas" type="number" min="1" max="60" value="3" oninput="Propostas._previewParcelas()">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Vencimento da 1ª Parcela</label>
              <input class="form-control" id="cParc1Data" type="date" oninput="Propostas._previewParcelas()">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Intervalo</label>
              <select class="form-control" id="cParcIntervalo" onchange="Propostas._previewParcelas()">
                <option value="30">30 dias</option>
                <option value="15">15 dias</option>
                <option value="7">7 dias</option>
                <option value="60">60 dias</option>
                <option value="90">90 dias</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Forma de Pagamento</label>
              <select class="form-control" id="cParcForma">
                <option value="PIX">PIX</option>
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
              </select>
            </div>
          </div>
          <div id="cParcelasPreview" style="margin-top:12px"></div>
        </div>

        <!-- Medições (aviso) -->
        <div id="cGrpMedicoes" style="display:none;background:#f0fdf4;border:1px solid #86efac;border-radius:var(--radius);padding:12px;margin-bottom:12px;font-size:13px">
          📐 <strong>Vinculado a Etapas:</strong> configure as etapas na aba "Projeto & Escopo" e marque
          quais geram recebimento. O valor e data de vencimento de cada recebível serão definidos lá.
        </div>

        <div class="form-group">
          <label class="form-label">Prazo de Vigência do Contrato</label>
          <div class="form-row" style="margin:0">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label text-xs">Data de Início</label>
              <input class="form-control" id="cContratoInicio" type="date" value="${Utils.todayStr()}">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label text-xs">Data de Término</label>
              <input class="form-control" id="cContratoFim" type="date">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Observações do Contrato</label>
          <textarea class="form-control" id="cContratoObs" rows="2" placeholder="Condições especiais, garantias, SLAs...">${Utils.escHtml(prop.observacoes||'')}</textarea>
        </div>

        <div style="text-align:right;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="Propostas._ctab('proj')">Próximo: Projeto & Escopo →</button>
        </div>
      </div>

      <!-- PAINEL PROJETO -->
      <div id="cpanel-proj" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Ordem de Serviço (OS)</label>
            <input class="form-control" id="cProjOS" value="${typeof Projetos!=='undefined'?Projetos._nextOS():''}" placeholder="OS-2026-00001">
            <div class="text-xs text-muted mt-1">Gerado automaticamente</div>
          </div>
          <div class="form-group">
            <label class="form-label">Código do Projeto</label>
            <input class="form-control" id="cProjCodigo" value="${codSuggest}">
          </div>
          <div class="form-group" style="flex:3">
            <label class="form-label">Título do Projeto *</label>
            <input class="form-control" id="cProjTitulo" value="${Utils.escHtml(prop.titulo||'')}" placeholder="Nome interno do projeto">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Responsável</label>
            <select class="form-control" id="cProjResp"><option value="">—</option>${respOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input class="form-control" id="cProjInicio" type="date" value="${Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo Final de Entrega</label>
            <input class="form-control" id="cProjPrazo" type="date">
          </div>
        </div>

        <!-- Etapas -->
        <div class="flex items-center justify-between mb-2 mt-2">
          <div class="font-bold text-sm">📌 Etapas do Projeto</div>
          <button class="btn btn-sm btn-secondary" type="button" onclick="Propostas._addEtapaContrato()">+ Etapa</button>
        </div>
        <div id="cEtapasContainer"></div>

        <div style="background:#fef9c3;border-radius:var(--radius);padding:10px 14px;font-size:13px;margin-top:8px;color:#854d0e">
          ✅ <strong>Criar atividade:</strong> lança a etapa no módulo de Atividades/Agenda com as datas definidas.<br>
          💰 <strong>Vinc. Pagamento:</strong> cria um recebível no financeiro do projeto com a data fim da etapa como vencimento.
        </div>
      </div>
    `;
  }

  function _ctab(tab) {
    ['fin','proj'].forEach(t => {
      const p = document.getElementById('cpanel-' + t);
      const b = document.getElementById('ctab-' + t);
      if (!p || !b) return;
      const active = t === tab;
      p.style.display = active ? '' : 'none';
      b.style.color        = active ? 'var(--primary)' : 'var(--text-muted)';
      b.style.fontWeight   = active ? '700' : '400';
      b.style.borderBottom = active ? '2px solid var(--primary)' : '2px solid transparent';
    });
  }

  function _toggleCondicao() {
    const v = document.getElementById('cCondicao').value;
    document.getElementById('cGrpAvista').style.display    = v === 'avista'    ? '' : 'none';
    document.getElementById('cGrpParcelas').style.display  = v === 'parcelas'  ? '' : 'none';
    document.getElementById('cGrpMedicoes').style.display  = v === 'medicoes'  ? '' : 'none';
    _renderEtapasContrato(); // rebuildtoggle "vinc pagamento" visibility
  }

  function _previewParcelas() {
    const n     = parseInt(document.getElementById('cNParcelas')?.value) || 3;
    const data1 = document.getElementById('cParc1Data')?.value;
    const intv  = parseInt(document.getElementById('cParcIntervalo')?.value) || 30;
    const valor = Number(document.getElementById('cValorFechado')?.value) || 0;
    const prev  = document.getElementById('cParcelasPreview');
    if (!prev || !data1 || !valor) return;

    const parcVal = valor / n;
    let rows = '';
    for (let i = 0; i < n; i++) {
      const d = new Date(data1 + 'T00:00:00');
      d.setDate(d.getDate() + i * intv);
      const ds = d.toISOString().split('T')[0];
      rows += `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span class="text-muted">Parcela ${i+1}</span>
        <span>${Utils.formatDate(ds)}</span>
        <span class="font-bold">${Utils.formatCurrency(parcVal)}</span>
      </div>`;
    }
    prev.innerHTML = `<div style="border-top:1px solid var(--border);padding-top:8px">
      <div class="text-xs text-muted mb-2">Preview das parcelas</div>${rows}
    </div>`;
  }

  function _addEtapaContrato() {
    _etapasContrato.push({
      nome: '', inicio: '', fim: '', responsavel: '',
      criarAtividade: true, vincPagamento: false, valor: 0,
    });
    _renderEtapasContrato();
  }

  function _renderEtapasContrato() {
    const container = document.getElementById('cEtapasContainer');
    if (!container) return;
    const cfg = DB.getConfig();
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}">${r}</option>`).join('');
    const condicao = document.getElementById('cCondicao')?.value || 'avista';
    const showPgto = condicao === 'medicoes';
    const valorTotal = Number(document.getElementById('cValorFechado')?.value) || 0;

    if (_etapasContrato.length === 0) {
      container.innerHTML = `<div class="text-sm text-muted" style="padding:12px;text-align:center">
        Clique em "+ Etapa" para adicionar etapas do projeto.</div>`;
      return;
    }

    container.innerHTML = _etapasContrato.map((e, i) => `
      <div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-bottom:10px;border-left:3px solid var(--primary)">
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-sm" style="color:var(--primary)">Etapa ${i+1}</span>
          <button class="btn btn-xs btn-danger" type="button" onclick="Propostas._removeEtapaContrato(${i})">✕</button>
        </div>
        <div class="form-row" style="margin:0 0 8px 0">
          <div class="form-group" style="flex:3;margin-bottom:0">
            <label class="form-label">Nome da Etapa *</label>
            <input class="form-control ec-nome" data-idx="${i}" value="${Utils.escHtml(e.nome)}"
              placeholder="Ex: Levantamento de campo, Elaboração do laudo..."
              oninput="Propostas._setEtapaCampo(${i},'nome',this.value)">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Responsável</label>
            <select class="form-control" onchange="Propostas._setEtapaCampo(${i},'responsavel',this.value)">
              <option value="">—</option>${respOpts}
            </select>
          </div>
        </div>
        <div class="form-row" style="margin:0 0 8px 0">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Data de Início</label>
            <input class="form-control" type="date" value="${e.inicio}"
              onchange="Propostas._setEtapaCampo(${i},'inicio',this.value)">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Data de Entrega / Fim</label>
            <input class="form-control" type="date" value="${e.fim}"
              onchange="Propostas._setEtapaCampo(${i},'fim',this.value)">
          </div>
          ${showPgto ? `
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Valor do Recebimento (R$)</label>
            <input class="form-control" type="number" step="0.01" value="${e.valor||''}"
              placeholder="${Utils.formatCurrency(valorTotal)}"
              oninput="Propostas._setEtapaCampo(${i},'valor',+this.value)">
          </div>` : ''}
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" ${e.criarAtividade?'checked':''}
              onchange="Propostas._setEtapaCampo(${i},'criarAtividade',this.checked)">
            <span>📅 Criar atividade/agenda</span>
          </label>
          ${showPgto ? `
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" ${e.vincPagamento?'checked':''}
              onchange="Propostas._setEtapaCampo(${i},'vincPagamento',this.checked)">
            <span>💰 Vinculada a recebimento</span>
          </label>` : ''}
        </div>
      </div>
    `).join('');
  }

  function _setEtapaCampo(i, campo, valor) {
    if (!_etapasContrato[i]) return;
    _etapasContrato[i][campo] = valor;
  }

  function _removeEtapaContrato(i) {
    _etapasContrato.splice(i, 1);
    _renderEtapasContrato();
  }

  function _confirmarContrato(propostaId) {
    const prop = DB.get('propostas', propostaId);
    if (!prop) return;

    // Coletar dados financeiros
    const valorFechado = Number(document.getElementById('cValorFechado').value);
    if (!valorFechado) { Toast.error('Informe o valor fechado'); _ctab('fin'); return; }
    const condicao = document.getElementById('cCondicao').value;
    const contratoInicio = document.getElementById('cContratoInicio').value;
    const contratoFim    = document.getElementById('cContratoFim').value;
    const contratoObs    = document.getElementById('cContratoObs').value;

    // Coletar dados do projeto
    const projTitulo = document.getElementById('cProjTitulo').value.trim();
    if (!projTitulo) { Toast.error('Informe o título do projeto'); _ctab('proj'); return; }
    const projCodigo  = document.getElementById('cProjCodigo').value;
    const projResp    = document.getElementById('cProjResp').value;
    const projInicio  = document.getElementById('cProjInicio').value;
    const projPrazo   = document.getElementById('cProjPrazo').value;

    // Sincronizar etapas com o DOM (nomes podem ter sido editados sem blur)
    document.querySelectorAll('.ec-nome').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      if (_etapasContrato[idx]) _etapasContrato[idx].nome = el.value;
    });

    const etapasValidas = _etapasContrato.filter(e => e.nome.trim());

    // ---- 1. Criar Projeto ----
    const etapasProjeto = etapasValidas.map(e => ({
      nome: e.nome.trim(),
      inicio: e.inicio,
      fim: e.fim,
      pct: 0,
      status: 'pendente',
      responsavel: e.responsavel,
      vincPagamento: e.vincPagamento,
      valorPagamento: e.valor || 0,
    }));

    const projOS = document.getElementById('cProjOS')?.value?.trim() || '';

    const projeto = DB.create('projetos', {
      titulo: projTitulo,
      ordemServico: projOS,
      codigo: projCodigo,
      clienteId: prop.clienteId,
      responsavel: projResp,
      status: 'em_andamento',
      valor: valorFechado,
      dataInicio: projInicio || contratoInicio,
      prazo: projPrazo || contratoFim,
      propostaId: propostaId,
      etapas: etapasProjeto,
      financeiro: { recebimentos: [], custos: [], parceiros: [] },
    });

    // ---- 2. Lançar recebimentos no financeiro do projeto ----
    const fin = { recebimentos: [], custos: [], parceiros: [] };

    if (condicao === 'avista') {
      const data = document.getElementById('cAvistaData').value;
      const forma = document.getElementById('cAvistaForma').value;
      const rec = { id: _uid(), descricao: 'Pagamento único', valor: valorFechado,
                    vencimento: data, formaPagamento: forma, status: 'pendente',
                    lancadoFinanceiro: false, recebiveisId: null };
      // Auto-lança em recebiveis geral
      const rv = DB.create('recebiveis', {
        descricao: `${projTitulo} — Pagamento único`,
        clienteId: prop.clienteId, valor: valorFechado, vencimento: data,
        status: 'pendente', formaPagamento: forma, projetoId: projeto.id,
        propostaId, origem: 'contrato',
      });
      rec.recebiveisId = rv.id;
      rec.lancadoFinanceiro = true;
      fin.recebimentos.push(rec);

    } else if (condicao === 'parcelas') {
      const n     = parseInt(document.getElementById('cNParcelas').value) || 3;
      const data1 = document.getElementById('cParc1Data').value;
      const intv  = parseInt(document.getElementById('cParcIntervalo').value) || 30;
      const forma = document.getElementById('cParcForma').value;
      const parcVal = valorFechado / n;

      for (let i = 0; i < n; i++) {
        const d = new Date((data1 || Utils.todayStr()) + 'T00:00:00');
        d.setDate(d.getDate() + i * intv);
        const venc = d.toISOString().split('T')[0];
        const descParcela = `Parcela ${i+1}/${n}`;
        const rec = { id: _uid(), descricao: descParcela, valor: parcVal,
                      vencimento: venc, formaPagamento: forma, status: 'pendente',
                      lancadoFinanceiro: false, recebiveisId: null };
        const rv = DB.create('recebiveis', {
          descricao: `${projTitulo} — ${descParcela}`,
          clienteId: prop.clienteId, valor: parcVal, vencimento: venc,
          status: 'pendente', formaPagamento: forma, projetoId: projeto.id,
          propostaId, origem: 'contrato',
        });
        rec.recebiveisId = rv.id;
        rec.lancadoFinanceiro = true;
        fin.recebimentos.push(rec);
      }

    } else if (condicao === 'medicoes') {
      // Vinculado a etapas — cria recebível para cada etapa com vincPagamento = true
      etapasValidas.filter(e => e.vincPagamento && e.valor > 0).forEach((e, i) => {
        const descRec = `Medição — ${e.nome.trim()}`;
        const rec = { id: _uid(), descricao: descRec, valor: e.valor,
                      vencimento: e.fim, formaPagamento: 'A definir', status: 'pendente',
                      lancadoFinanceiro: false, recebiveisId: null, etapaNome: e.nome };
        const rv = DB.create('recebiveis', {
          descricao: `${projTitulo} — ${descRec}`,
          clienteId: prop.clienteId, valor: e.valor, vencimento: e.fim,
          status: 'pendente', projetoId: projeto.id, propostaId, origem: 'contrato',
        });
        rec.recebiveisId = rv.id;
        rec.lancadoFinanceiro = true;
        fin.recebimentos.push(rec);
      });
    }

    // Salva financeiro no projeto
    DB.update('projetos', projeto.id, { financeiro: fin });

    // ---- 3. Criar atividades para etapas marcadas ----
    const cfg = DB.getConfig();
    let atividadesCriadas = 0;
    etapasValidas.filter(e => e.criarAtividade).forEach(e => {
      DB.create('atividades', {
        titulo: `[${projCodigo || projTitulo}] ${e.nome.trim()}`,
        tipo: 'tarefa',
        status: 'pendente',
        data: e.fim || projPrazo,
        dataInicio: e.inicio || projInicio,
        responsavel: e.responsavel || projResp,
        clienteId: prop.clienteId,
        projetoId: projeto.id,
        descricao: `Etapa do projeto ${projTitulo} — ${e.nome.trim()}`,
        origem: 'contrato',
      });
      atividadesCriadas++;
    });

    // ---- 4. Criar contrato ----
    DB.create('contratos', {
      numero: prop.numero || '',
      objeto: projTitulo,
      clienteId: prop.clienteId,
      responsavel: projResp,
      valor: valorFechado,
      dataInicio: contratoInicio,
      dataFim: contratoFim,
      status: 'ativo',
      projetoId: projeto.id,
      propostaId,
      descricao: prop.descricao || '',
      observacoes: contratoObs,
    });

    // ---- 5. Atualizar proposta ----
    DB.update('propostas', propostaId, {
      status: 'aprovada',
      valorFechado,
      projetoId: projeto.id,
    });

    Modal.close();

    // Resumo do que foi criado
    const recCount = fin.recebimentos.length;
    Toast.success(
      `🎉 Contrato fechado! Projeto criado, ` +
      `${recCount} recebível(is) lançado(s) e ` +
      `${atividadesCriadas} atividade(s) criada(s) na agenda.`,
      7000
    );

    render();

    // Navega para o projeto criado
    setTimeout(() => {
      if (typeof App !== 'undefined') App.navigate('projetos');
    }, 400);
  }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  }

  function addNew() { openForm(); }

  return {
    render, openForm, saveProposta, deleteProposta, view, setFilter, changeStatus,
    criarRecebivel, addNew, addItemRow, removeItemRow, _setItemField,
    abrirFluxoContratacao, _ctab, _toggleCondicao, _previewParcelas,
    _addEtapaContrato, _renderEtapasContrato, _setEtapaCampo, _removeEtapaContrato,
  };
})();
