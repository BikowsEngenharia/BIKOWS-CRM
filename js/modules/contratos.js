/* ==========================================
   CONTRATOS — Vigência, renovação e alertas
   ========================================== */
const Contratos = (() => {

  const STATUS = {
    ativo:     { label: 'Ativo',     color: '#10b981' },
    renovando: { label: 'Renovando', color: '#f59e0b' },
    vencido:   { label: 'Vencido',   color: '#ef4444' },
    encerrado: { label: 'Encerrado', color: '#94a3b8' },
    rascunho:  { label: 'Rascunho',  color: '#8b5cf6' },
  };

  let _filter = { status: '', clienteId: '' };

  function _statusBadge(status) {
    const s = STATUS[status] || { label: status, color: '#94a3b8' };
    return `<span style="font-size:11px;font-weight:600;background:${s.color}20;color:${s.color};padding:2px 8px;border-radius:99px;border:1px solid ${s.color}44">${s.label}</span>`;
  }

  function _autoStatus(contrato) {
    if (contrato.status === 'encerrado' || contrato.status === 'rascunho') return contrato.status;
    if (!contrato.dataFim) return contrato.status || 'ativo';
    const dias = Utils.daysUntil(contrato.dataFim);
    if (dias !== null && dias < 0) return 'vencido';
    if (dias !== null && dias <= 30) return 'renovando';
    return 'ativo';
  }

  function render() {
    const contratos = DB.getAll('contratos');
    const clientes = DB.getAll('clientes');
    let list = contratos;
    if (_filter.status) list = list.filter(c => _autoStatus(c) === _filter.status);
    if (_filter.clienteId) list = list.filter(c => c.clienteId === _filter.clienteId);

    const ativos    = contratos.filter(c => _autoStatus(c) === 'ativo').length;
    const renovando = contratos.filter(c => _autoStatus(c) === 'renovando').length;
    const vencidos  = contratos.filter(c => _autoStatus(c) === 'vencido').length;
    const valorTotal = contratos.filter(c => ['ativo','renovando'].includes(_autoStatus(c))).reduce((s,c)=>s+(c.valor||0),0);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Contratos</h2>
        <div class="sec-actions">
          <button class="btn btn-primary" onclick="Contratos.openForm()">+ Novo Contrato</button>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-label">Ativos</div><div class="kpi-value">${ativos}</div><div class="kpi-icon">📋</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b"><div class="kpi-label">Renovando em 30d</div><div class="kpi-value">${renovando}</div><div class="kpi-icon">🔄</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444"><div class="kpi-label">Vencidos</div><div class="kpi-value">${vencidos}</div><div class="kpi-icon">⚠</div></div>
        <div class="kpi-card" style="--kpi-color:#1a56db"><div class="kpi-label">Valor em Vigência</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(valorTotal)}</div><div class="kpi-icon">💰</div></div>
      </div>

      ${renovando > 0 || vencidos > 0 ? `
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;gap:12px;align-items:center">
        <span>⚠</span>
        <div class="text-sm">
          ${vencidos > 0 ? `<strong>${vencidos} contrato(s) vencido(s)</strong> — renove ou encerre. ` : ''}
          ${renovando > 0 ? `<strong>${renovando} contrato(s) vencendo em 30 dias</strong> — inicie a renovação.` : ''}
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Contratos.setFilter('status',this.value)">
              <option value="">Todos os status</option>
              ${Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${_filter.status===k?'selected':''}>${v.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Contratos.setFilter('clienteId',this.value)">
              <option value="">Todos os clientes</option>
              ${clientes.map(c => `<option value="${c.id}" ${_filter.clienteId===c.id?'selected':''}>${Utils.escHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} contrato(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? _emptyState() : `
          <table class="tbl">
            <thead><tr><th>Nº</th><th>Objeto</th><th>Cliente</th><th>Valor</th><th>Vigência</th><th>Vencimento</th><th>Renovação</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.map(c => {
                const status = _autoStatus(c);
                const dias = Utils.daysUntil(c.dataFim);
                const vencLabel = dias == null ? '—' : dias < 0 ? `⚠ ${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`;
                const vencClass = dias != null && dias < 0 ? 'text-danger' : dias != null && dias <= 30 ? 'text-warning' : 'text-muted';
                return `<tr>
                  <td class="text-xs font-bold text-muted">${Utils.escHtml(c.numero||'—')}</td>
                  <td><div class="font-bold" style="max-width:180px">${Utils.escHtml(c.objeto||'—')}</div></td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(c.clienteId))}</td>
                  <td class="font-bold text-primary">${Utils.formatCurrency(c.valor)}</td>
                  <td class="text-sm text-muted">${Utils.formatDate(c.dataInicio)} → ${Utils.formatDate(c.dataFim)}</td>
                  <td class="text-sm ${vencClass}">${Utils.formatDate(c.dataFim)} <span class="text-xs">${vencLabel}</span></td>
                  <td class="text-xs">${c.renovacaoAutomatica ? '<span class="badge badge-green">Auto</span>' : '<span class="badge badge-gray">Manual</span>'}</td>
                  <td>${_statusBadge(status)}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Contratos.view('${c.id}')">Ver</button>
                      <button class="btn btn-xs btn-secondary" onclick="Contratos.openForm('${c.id}')">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Contratos.deleteContrato('${c.id}')">🗑</button>
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

  function _emptyState() {
    return `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum contrato cadastrado</div><button class="btn btn-primary mt-4" onclick="Contratos.openForm()">+ Novo Contrato</button></div>`;
  }

  function setFilter(k, v) { _filter[k] = v; render(); }

  function view(id) {
    const c = DB.get('contratos', id);
    if (!c) return;
    const status = _autoStatus(c);
    const dias = Utils.daysUntil(c.dataFim);
    const diasLabel = dias == null ? '—' : dias < 0 ? `Vencido há ${Math.abs(dias)} dias` : dias === 0 ? 'Vence hoje!' : `Vence em ${dias} dias`;

    Modal.open({
      title: c.objeto || 'Contrato',
      size: 'modal-lg',
      body: `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div class="text-xs text-muted">Nº ${Utils.escHtml(c.numero||'—')}</div>
          ${_statusBadge(status)}
        </div>
        <div class="detail-grid mb-4">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(Utils.getClientName(c.clienteId))}</div></div>
          <div class="detail-field"><div class="detail-label">Responsável</div><div class="detail-value">${Utils.escHtml(c.responsavel||'—')}</div></div>
          <div class="detail-field"><div class="detail-label">Valor</div><div class="detail-value font-bold text-primary" style="font-size:20px">${Utils.formatCurrency(c.valor)}</div></div>
          <div class="detail-field"><div class="detail-label">Início</div><div class="detail-value">${Utils.formatDate(c.dataInicio)}</div></div>
          <div class="detail-field"><div class="detail-label">Vencimento</div><div class="detail-value"><span class="${dias!=null&&dias<0?'text-danger':dias!=null&&dias<=30?'text-warning':''}">${Utils.formatDate(c.dataFim)}</span></div></div>
          <div class="detail-field"><div class="detail-label">Prazo</div><div class="detail-value">${diasLabel}</div></div>
          <div class="detail-field"><div class="detail-label">Renovação</div><div class="detail-value">${c.renovacaoAutomatica ? '🔄 Automática' : '📋 Manual'}</div></div>
          <div class="detail-field"><div class="detail-label">Tipo de Serviço</div><div class="detail-value">${Utils.escHtml(c.tipoServico||'—')}</div></div>
        </div>
        ${c.descricao ? `<div class="detail-field mb-3"><div class="detail-label">Descrição / Escopo</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(c.descricao)}</div></div>` : ''}
        ${c.observacoes ? `<div class="detail-field mb-3"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(c.observacoes)}</div></div>` : ''}
        <div class="mt-4 flex gap-2" style="flex-wrap:wrap">
          ${status === 'vencido' || status === 'renovando' ? `<button class="btn btn-success btn-sm" onclick="Contratos.renovar('${id}')">🔄 Renovar Contrato</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Contratos.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  function renovar(id) {
    const c = DB.get('contratos', id);
    if (!c) return;
    const novoInicio = c.dataFim || Utils.todayStr();
    // Calcular nova data fim baseada na duração do contrato atual
    let novoFim = '';
    if (c.dataInicio && c.dataFim) {
      const duracao = new Date(c.dataFim) - new Date(c.dataInicio);
      const novaFimDate = new Date(new Date(novoInicio).getTime() + duracao);
      novoFim = novaFimDate.toISOString().split('T')[0];
    }
    Modal.open({
      title: '🔄 Renovar Contrato',
      body: `
        <div style="background:var(--primary-light);padding:12px;border-radius:var(--radius);margin-bottom:16px">
          <div class="font-bold">${Utils.escHtml(c.objeto||'')}</div>
          <div class="text-sm text-muted">${Utils.escHtml(Utils.getClientName(c.clienteId))} · ${Utils.formatCurrency(c.valor)}</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Novo Início</label>
            <input class="form-control" id="rnInicio" type="date" value="${novoInicio}">
          </div>
          <div class="form-group">
            <label class="form-label">Novo Vencimento</label>
            <input class="form-control" id="rnFim" type="date" value="${novoFim}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Novo Valor (R$)</label>
          <input class="form-control" id="rnValor" type="number" value="${c.valor||''}">
        </div>
      `,
      saveCb: () => {
        DB.update('contratos', id, {
          dataInicio: document.getElementById('rnInicio').value,
          dataFim: document.getElementById('rnFim').value,
          valor: Number(document.getElementById('rnValor').value) || c.valor,
          status: 'ativo',
        });
        Toast.success('Contrato renovado com sucesso!');
        Modal.close();
        render();
      },
    });
  }

  function openForm(id = null) {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const c = id ? DB.get('contratos', id) : null;
    const nextNum = 'CTR-' + new Date().getFullYear() + '-' + String(DB.getAll('contratos').length + 1).padStart(3,'0');

    const clientOpts = clientes.map(cl => `<option value="${cl.id}" ${c?.clienteId===cl.id?'selected':''}>${Utils.escHtml(cl.nome)}</option>`).join('');
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${c?.responsavel===r?'selected':''}>${r}</option>`).join('');
    const statusOpts = Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${(c?.status||'ativo')===k?'selected':''}>${v.label}</option>`).join('');

    Modal.open({
      title: id ? 'Editar Contrato' : 'Novo Contrato',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nº do Contrato</label>
            <input class="form-control" id="fcNum" value="${Utils.escHtml(c?.numero||nextNum)}">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="fcStatus">${statusOpts}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Objeto do Contrato *</label>
          <input class="form-control" id="fcObjeto" value="${Utils.escHtml(c?.objeto||'')}" placeholder="Ex: Adequação NR-12 e NR-35 — Manutenção Anual">
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cliente *</label>
            <select class="form-control" id="fcCliente"><option value="">Selecionar</option>${clientOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Responsável</label>
            <select class="form-control" id="fcResp"><option value="">—</option>${respOpts}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo de Serviço</label>
            <select class="form-control" id="fcServico">
              <option value="">—</option>
              ${cfg.servicos.map(s => `<option value="${s}" ${c?.tipoServico===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Valor Anual / Total (R$) *</label>
            <input class="form-control" id="fcValor" type="number" step="0.01" value="${c?.valor||''}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input class="form-control" id="fcInicio" type="date" value="${c?.dataInicio||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Vencimento</label>
            <input class="form-control" id="fcFim" type="date" value="${c?.dataFim||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Alerta antes (dias)</label>
            <input class="form-control" id="fcAlerta" type="number" value="${c?.alertaVencimento||30}" min="0" max="180">
          </div>
        </div>
        <div class="form-group">
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
            <input type="checkbox" id="fcRenovacao" ${c?.renovacaoAutomatica?'checked':''}>
            <span class="form-label" style="margin:0">🔄 Renovação automática — renovar ao vencer</span>
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição / Escopo</label>
          <textarea class="form-control" id="fcDescricao" rows="3">${Utils.escHtml(c?.descricao||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fcObs" rows="2">${Utils.escHtml(c?.observacoes||'')}</textarea>
        </div>
      `,
      saveCb: () => saveContrato(id),
    });
  }

  function saveContrato(id) {
    const objeto = document.getElementById('fcObjeto').value.trim();
    if (!objeto) { Toast.error('Objeto do contrato obrigatório'); return; }
    const valor = Number(document.getElementById('fcValor').value);
    if (!valor) { Toast.error('Valor obrigatório'); return; }

    const data = {
      numero:             document.getElementById('fcNum').value,
      objeto,
      clienteId:          document.getElementById('fcCliente').value,
      responsavel:        document.getElementById('fcResp').value,
      tipoServico:        document.getElementById('fcServico').value,
      valor,
      dataInicio:         document.getElementById('fcInicio').value,
      dataFim:            document.getElementById('fcFim').value,
      alertaVencimento:   Number(document.getElementById('fcAlerta').value) || 30,
      renovacaoAutomatica: document.getElementById('fcRenovacao').checked,
      status:             document.getElementById('fcStatus').value,
      descricao:          document.getElementById('fcDescricao').value,
      observacoes:        document.getElementById('fcObs').value,
    };

    if (id) { DB.update('contratos', id, data); Toast.success('Contrato atualizado'); }
    else { DB.create('contratos', data); Toast.success('Contrato criado'); }
    Modal.close();
    render();
  }

  function deleteContrato(id) {
    const c = DB.get('contratos', id);
    Utils.confirmDelete(c?.objeto || 'este contrato', () => {
      DB.remove('contratos', id);
      Toast.success('Contrato removido');
      render();
    });
  }

  function addNew() { openForm(); }

  return { render, openForm, saveContrato, deleteContrato, view, setFilter, renovar, addNew };
})();
