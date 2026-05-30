/* ==========================================
   PROPOSTAS — Orçamentos e propostas comerciais
   ========================================== */
const Propostas = (() => {

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

  let _filter = { status: '' };
  let _formItems = []; // itens da proposta em edição

  /* ------------------------------------------------
     Gerador de número de proposta — PROP-YYYY-NNNNN
     Busca o maior sequencial existente e incrementa,
     nunca depende do .length (quebra com exclusões)
  ------------------------------------------------ */
  // Piso histórico — última proposta emitida antes do sistema
  const _PISO_SEQUENCIA = 1100;

  function _nextNumeroProposta() {
    const ano = new Date().getFullYear();
    const prefix = `PROP-${ano}-`;
    const todas = DB.getAll('propostas');
    let max = _PISO_SEQUENCIA; // começa do piso, nunca abaixo
    todas.forEach(p => {
      if (p.numero && p.numero.startsWith(prefix)) {
        const seq = parseInt(p.numero.replace(prefix, ''), 10);
        if (!isNaN(seq) && seq > max) max = seq;
      }
    });
    // Também considera números no formato legado BIK-YYYY-CTR-NNN
    const prefixLegado = `BIK-${ano}-CTR-`;
    todas.forEach(p => {
      if (p.numero && p.numero.startsWith(prefixLegado)) {
        const seq = parseInt(p.numero.replace(prefixLegado, ''), 10);
        if (!isNaN(seq) && seq > max) max = seq;
      }
    });
    return `${prefix}${String(max + 1).padStart(5, '0')}`;
  }

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
    const propostasAll = DB.getAll('propostas');
    const config = DB.getConfig();
    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const propostas = _filtrarPorPeriodo(propostasAll, 'createdAt');

    let list = propostasAll;
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
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Propostas.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <button class="btn btn-primary" onclick="Propostas.openForm()">+ Nova Proposta</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card" style="--kpi-color:#f97316;cursor:pointer" title="Clique para ver propostas em aberto" onclick="Propostas.drillDown('em_aberto')"><div class="kpi-label">Em Aberto <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div><div class="kpi-value">${totalEnviadas}</div><div class="kpi-sub">${Utils.formatCurrency(valorEmAberto)}</div><div class="kpi-icon">📤</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" title="Clique para ver propostas aprovadas" onclick="Propostas.drillDown('aprovadas')"><div class="kpi-label">Aprovadas <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div><div class="kpi-value">${totalAprovadas}</div><div class="kpi-sub">${Utils.formatCurrency(valorAprovado)}</div><div class="kpi-icon">✅</div></div>
        <div class="kpi-card" style="--kpi-color:#1a56db;cursor:pointer" title="Clique para ver propostas vencendo em 7 dias" onclick="Propostas.drillDown('vencendo')"><div class="kpi-label">Taxa de Aprovação <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div><div class="kpi-value">${taxa}%</div><div class="kpi-sub">${propostas.length} no período</div><div class="kpi-icon">📊</div></div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6;cursor:pointer" title="Clique para ver propostas reprovadas" onclick="Propostas.drillDown('reprovadas')"><div class="kpi-label">Total das Propostas <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(Utils.sum(propostas,'valor'))}</div><div class="kpi-icon">💼</div></div>
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
                  <td>
                    <div style="font-weight:700;font-size:12px;color:var(--primary);white-space:nowrap">${Utils.escHtml(p.numero||'—')}</div>
                    <button class="btn btn-xs" style="margin-top:3px;padding:1px 6px;font-size:10px;color:var(--text-muted);border:1px solid var(--border);background:transparent"
                      onclick="navigator.clipboard.writeText('${Utils.escHtml(p.numero||'')}').then(()=>Toast.show('Número copiado!'))"
                      title="Copiar número">📋</button>
                  </td>
                  <td><div class="font-bold" style="max-width:200px">${Utils.escHtml(p.titulo)}</div>${p.descricao ? `<div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(p.descricao,50))}</div>` : ''}</td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(p.clienteId) !== '—' ? Utils.getClientName(p.clienteId) : (p.clienteNome || '—'))}</td>
                  <td class="font-bold text-primary">${Utils.formatCurrency(p.valor)}</td>
                  <td class="text-sm ${expirado ? 'text-danger' : 'text-muted'}">${Utils.formatDate(p.validade)}<br><span class="text-xs">${validadeLabel}</span></td>
                  <td class="text-sm">${Utils.escHtml(p.responsavel||'—')}</td>
                  <td>${Utils.propBadge(p.status)}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Propostas.view('${p.id}')">Ver</button>
                      <button class="btn btn-xs btn-success" onclick="PropostaGenerator.open('${p.id}')" title="Gerar proposta PDF">🖨 Gerar</button>
                      <button class="btn btn-xs btn-secondary" onclick="Propostas.imprimirProposta('${p.id}')" title="Imprimir PDF">🖨</button>
                      <button class="btn btn-xs btn-secondary" onclick="Propostas.duplicar('${p.id}')" title="Duplicar proposta">📋 Dupl.</button>
                      ${p.canvaLink ? `<a href="${Utils.escHtml(p.canvaLink)}" target="_blank" rel="noopener" class="btn btn-xs btn-secondary" title="Abrir no Canva">🎨</a>` : ''}
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
        <div style="background:linear-gradient(135deg,var(--primary),#1e40af);color:#fff;padding:16px 20px;border-radius:var(--radius);margin-bottom:20px">
          <div class="flex items-center justify-between mb-1">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:22px;font-weight:800;letter-spacing:.02em">${Utils.escHtml(p.numero||'—')}</span>
              <button onclick="navigator.clipboard.writeText('${Utils.escHtml(p.numero||'')}').then(()=>Toast.show('Número copiado!'))"
                style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px"
                title="Copiar número">📋 Copiar</button>
            </div>
            <div>${Utils.propBadge(p.status)}</div>
          </div>
          <div style="font-size:17px;font-weight:600;opacity:.95;margin-top:4px">${Utils.escHtml(p.titulo)}</div>
          ${p.descricao ? `<div style="font-size:13px;opacity:.75;margin-top:3px">${Utils.escHtml(p.descricao)}</div>` : ''}
        </div>

        <div class="detail-grid mb-4">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(cliente?.nome || p.clienteNome || '—')}</div></div>
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

        ${(p.prazoEntrega || p.formaPagamento) ? `
        <div class="detail-grid mb-3">
          ${p.prazoEntrega ? `<div class="detail-field"><div class="detail-label">Prazo de Entrega</div><div class="detail-value">${Utils.escHtml(p.prazoEntrega)}</div></div>` : ''}
          ${p.formaPagamento ? `<div class="detail-field"><div class="detail-label">Forma de Pagamento</div><div class="detail-value">${Utils.escHtml(p.formaPagamento)}</div></div>` : ''}
        </div>` : ''}

        ${p.canvaLink ? `
        <div class="detail-field mb-3" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px">
          <div class="detail-label mb-2">🎨 Proposta no Canva</div>
          <div style="display:flex;align-items:center;gap:10px">
            <a href="${Utils.escHtml(p.canvaLink)}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;background:var(--primary);color:#fff;padding:8px 14px;border-radius:var(--radius);text-decoration:none;font-size:13px;font-weight:600">
              🔗 Abrir no Canva
            </a>
            <button onclick="navigator.clipboard.writeText('${Utils.escHtml(p.canvaLink)}').then(()=>Toast.show('Link copiado!'))"
              class="btn btn-sm btn-secondary">📋 Copiar link</button>
          </div>
        </div>` : ''}

        ${(p.origem === 'gerador-pdf' || p.origem === 'gerador-canva') ? `
        <div class="text-xs text-muted mb-3">Origem: ${p.origem === 'gerador-canva' ? '🎨 Gerado via Canva' : '📄 Gerado via PDF/HTML'}</div>` : ''}

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
          ${p.canvaLink ? `<a href="${Utils.escHtml(p.canvaLink)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🎨 Abrir no Canva</a>` : ''}
          ${p.status === 'aprovada' ? `<button class="btn btn-primary btn-sm" onclick="Modal.close();Propostas.criarRecebivel('${id}')">💰 Criar Recebível</button>` : ''}
          ${p.status === 'aprovada' ? `<button class="btn btn-primary btn-sm" onclick="Modal.close();Contratos.criarDePropostal('${id}')">📝 Criar Contrato</button>` : ''}
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

    // Notificar equipe em eventos importantes
    const p = DB.get('propostas', id);
    const cliente = p?.clienteId ? DB.get('clientes', p.clienteId) : null;
    if (status === 'recusada' || status === 'reprovada') {
      _notificarEventoProp('proposta_reprovada', { cliente: cliente?.nome || p?.clienteNome || '', numero: p?.numero || '', valor: p?.valor || 0, motivo: p?.motivoPerda || '' });
    }
  }

  async function _notificarEventoProp(evento, dados) {
    try {
      await fetch('https://mxvwccyopzfewhvscrzj.supabase.co/functions/v1/crm-notificacoes-eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dndjY3lvcHpmZXdodnNjcnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDI2OTYsImV4cCI6MjA5NDM3ODY5Nn0.zDPXwxt5UjY2NN1HMc1cVtPlKvAcOOlhh032Ls7MSMg' },
        body: JSON.stringify({ evento, dados }),
      });
    } catch {}
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

    const nextNum = id ? (p?.numero || _nextNumeroProposta()) : _nextNumeroProposta();

    // Templates de proposta salvos na config
    const templates = cfg.templatesPropostas || [];

    Modal.open({
      title: id ? 'Editar Proposta' : 'Nova Proposta',
      size: 'modal-lg',
      body: `
        ${!id && templates.length > 0 ? `
        <div style="background:var(--surface-2,#f8fafc);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
          <span style="font-size:13px;font-weight:600;color:var(--text-muted)">📋 Usar template:</span>
          <select class="form-control" style="flex:1" onchange="Propostas._aplicarTemplate(this.value)">
            <option value="">— Selecionar template —</option>
            ${templates.map((t,i)=>`<option value="${i}">${Utils.escHtml(t.nome)}</option>`).join('')}
          </select>
        </div>` : ''}
        <!-- Número em destaque -->
        <div style="background:var(--primary);color:#fff;border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em">Número da Proposta</div>
            <input id="fpNum" value="${Utils.escHtml(nextNum)}"
              style="background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.4);color:#fff;font-size:20px;font-weight:700;width:100%;outline:none;padding:2px 0"
              placeholder="PROP-2026-00001"
              title="Editável se necessário">
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;opacity:.75">Status</div>
            <select class="form-control" id="fpStatus" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;font-size:13px;padding:4px 8px;border-radius:6px">${statusOpts}</select>
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

  function imprimirProposta(id) {
    const p = DB.get('propostas', id);
    if (!p) return;
    const cliente = DB.get('clientes', p.clienteId);
    const cfg = DB.getConfig();
    const w = window.open('', '_blank');
    if (!w) { Toast.error('Bloqueador de pop-up ativo — permita pop-ups para este site'); return; }
    const itensHtml = (p.itens && p.itens.length) ? `
      <h3 style="color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:6px;margin-top:24px">Itens / Serviços</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <thead><tr style="background:#1e40af;color:#fff">
          <th style="padding:8px;text-align:left">Descrição</th>
          <th style="padding:8px;text-align:center;width:60px">Qtd</th>
          <th style="padding:8px;text-align:center;width:50px">Un.</th>
          <th style="padding:8px;text-align:right;width:110px">Val. Unit.</th>
          <th style="padding:8px;text-align:right;width:110px">Total</th>
        </tr></thead>
        <tbody>${p.itens.map((it,i)=>`<tr style="background:${i%2===0?'#f8fafc':'#fff'}"><td style="padding:7px 8px;border-bottom:1px solid #e2e8f0">${it.desc||''}</td><td style="padding:7px 8px;text-align:center;border-bottom:1px solid #e2e8f0">${it.qtd}</td><td style="padding:7px 8px;text-align:center;border-bottom:1px solid #e2e8f0;color:#64748b">${it.un||''}</td><td style="padding:7px 8px;text-align:right;border-bottom:1px solid #e2e8f0">R$ ${(it.unit||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td style="padding:7px 8px;text-align:right;font-weight:700;border-bottom:1px solid #e2e8f0">R$ ${(it.total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`).join('')}</tbody>
      </table>` : '';
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Proposta ${p.numero||''}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:32px;font-size:14px;line-height:1.5}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1e40af}
        .empresa-info{font-size:13px;color:#475569}.empresa-nome{font-size:20px;font-weight:800;color:#1e40af}
        .prop-info{text-align:right;font-size:12px;color:#475569}.prop-num{font-size:18px;font-weight:700;color:#1e40af}
        .section{margin:20px 0}.section h3{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:6px}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;padding:16px;border-radius:8px}
        .field label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
        .field p{margin:2px 0;font-size:14px}
        .valor-box{background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:20px 24px;border-radius:12px;text-align:center;margin:24px 0}
        .valor-box .val{font-size:32px;font-weight:800}.valor-box .lbl{font-size:12px;opacity:.8}
        .obs{background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;font-size:13px}
        .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px}
        @media print { @page { margin: 15mm; } body { padding: 0; } }
      </style></head><body>
      <div class="header">
        <div><div class="empresa-nome">${cfg.empresa||'Bikows Engenharia'}</div>
          <div class="empresa-info">${cfg.cnpj?'CNPJ: '+cfg.cnpj+' · ':''} ${cfg.cidade||''}${cfg.estado?' / '+cfg.estado:''}</div>
        </div>
        <div class="prop-info"><div class="prop-num">${p.numero||'—'}</div><div>Data: ${new Date().toLocaleDateString('pt-BR')}</div></div>
      </div>
      <div class="section">
        <h3 style="color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:6px">Cliente</h3>
        <div class="grid2">
          <div class="field"><label>Empresa</label><p><strong>${cliente?.nome||p.clienteNome||'—'}</strong></p></div>
          <div class="field"><label>CNPJ</label><p>${cliente?.cnpj||'—'}</p></div>
          <div class="field"><label>Cidade / UF</label><p>${[cliente?.cidade,cliente?.estado].filter(Boolean).join(' / ')||'—'}</p></div>
          <div class="field"><label>Responsável</label><p>${p.responsavel||'—'}</p></div>
        </div>
      </div>
      <div class="section">
        <h3 style="color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:6px">Objeto da Proposta</h3>
        <p><strong>${p.titulo}</strong></p>
        ${p.descricao?`<p style="color:#475569;font-size:13px">${p.descricao}</p>`:''}
      </div>
      ${itensHtml}
      <div class="valor-box">
        <div class="lbl">VALOR TOTAL DA PROPOSTA</div>
        <div class="val">R$ ${(p.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      </div>
      <div class="section">
        <h3 style="color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:6px">Condições Comerciais</h3>
        <div class="grid2">
          <div class="field"><label>Validade da Proposta</label><p>${p.validade?new Date(p.validade+'T00:00:00').toLocaleDateString('pt-BR'):'—'}</p></div>
          ${p.formaPagamento?`<div class="field"><label>Forma de Pagamento</label><p>${p.formaPagamento}</p></div>`:''}
          ${p.prazoEntrega?`<div class="field"><label>Prazo de Execução</label><p>${p.prazoEntrega}</p></div>`:''}
          <div class="field"><label>Responsável Técnico</label><p>${p.responsavel||'—'}</p></div>
        </div>
      </div>
      ${p.observacoes?`<div class="section"><h3 style="color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:6px">Observações</h3><div class="obs">${p.observacoes}</div></div>`:''}
      <div class="footer">
        <strong>${cfg.empresa||'Bikows Engenharia'}</strong>${cfg.cnpj?' · CNPJ: '+cfg.cnpj:''}<br>
        Documento gerado pelo CRM Bikows em ${new Date().toLocaleString('pt-BR')}
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 800);
  }

  function addNew() { openForm(); }

  /* ---- Drill-down dos KPI cards ---- */
  function drillDown(tipo) {
    const hoje = new Date().toISOString().split('T')[0];
    const em7dias = new Date(); em7dias.setDate(em7dias.getDate() + 7);
    const em7diasStr = em7dias.toISOString().split('T')[0];

    let title = '', items = [], cols = [], rowFn = () => [];
    const todasPropostas = DB.getAll('propostas');

    const getCliente = p => DB.get('clientes', p.clienteId)?.nome || p.clienteNome || '—';

    if (tipo === 'em_aberto') {
      title = 'Propostas em Aberto';
      items = todasPropostas.filter(p => ['enviada','negociacao'].includes(p.status));
      cols = ['Proposta', 'Cliente', 'Valor', 'Validade'];
      rowFn = p => [
        Utils.escHtml(p.numero || p.titulo),
        Utils.escHtml(getCliente(p)),
        `<strong>${Utils.formatCurrency(p.valor)}</strong>`,
        Utils.formatDate(p.validade),
      ];
    } else if (tipo === 'aprovadas') {
      title = 'Propostas Aprovadas';
      items = todasPropostas.filter(p => p.status === 'aprovada');
      cols = ['Proposta', 'Cliente', 'Valor', 'Data'];
      rowFn = p => [
        Utils.escHtml(p.numero || p.titulo),
        Utils.escHtml(getCliente(p)),
        `<strong style="color:var(--success)">${Utils.formatCurrency(p.valor)}</strong>`,
        Utils.formatDate(p.updatedAt ? p.updatedAt.split('T')[0] : p.createdAt?.split('T')[0]),
      ];
    } else if (tipo === 'reprovadas') {
      title = 'Propostas Reprovadas / Recusadas';
      items = todasPropostas.filter(p => p.status === 'reprovada' || p.status === 'recusada');
      cols = ['Proposta', 'Cliente', 'Valor', 'Motivo Perda'];
      rowFn = p => [
        Utils.escHtml(p.numero || p.titulo),
        Utils.escHtml(getCliente(p)),
        Utils.formatCurrency(p.valor),
        Utils.escHtml(p.motivoPerda || '—'),
      ];
    } else if (tipo === 'vencendo') {
      title = 'Propostas Vencendo em 7 dias';
      items = todasPropostas.filter(p =>
        p.validade && p.validade >= hoje && p.validade <= em7diasStr &&
        ['enviada','negociacao','elaboracao'].includes(p.status)
      );
      cols = ['Proposta', 'Cliente', 'Valor', 'Validade'];
      rowFn = p => [
        Utils.escHtml(p.numero || p.titulo),
        Utils.escHtml(getCliente(p)),
        `<strong>${Utils.formatCurrency(p.valor)}</strong>`,
        `<span style="color:#f97316;font-weight:700">${Utils.formatDate(p.validade)}</span>`,
      ];
    } else if (tipo === 'vencidas') {
      title = 'Propostas Vencidas';
      items = todasPropostas.filter(p =>
        p.validade && p.validade < hoje &&
        ['enviada','negociacao'].includes(p.status)
      );
      cols = ['Proposta', 'Cliente', 'Valor', 'Validade'];
      rowFn = p => [
        Utils.escHtml(p.numero || p.titulo),
        Utils.escHtml(getCliente(p)),
        Utils.formatCurrency(p.valor),
        `<span style="color:var(--danger);font-weight:700">${Utils.formatDate(p.validade)}</span>`,
      ];
    }

    Modal.open({
      title: `${title} — ${items.length} registro(s)`,
      body: `<div style="max-height:55vh;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--surface-2,#f8fafc);position:sticky;top:0">
            ${cols.map(c=>`<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border)">${c}</th>`).join('')}
          </tr></thead>
          <tbody>${items.length ? items.map(item=>{
            const cells = rowFn(item);
            return `<tr style="border-bottom:1px solid var(--border);cursor:pointer"
              onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
              ${cells.map(v=>`<td style="padding:8px 12px">${v}</td>`).join('')}</tr>`;
          }).join('') : `<tr><td colspan="${cols.length}" style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`}
          </tbody>
        </table></div>`,
      saveCb: null,
    });
    setTimeout(()=>{ const f=document.getElementById('modalFoot'); if(f) f.style.display='none'; },0);
  }

  /* ================================================
     MELHORIA 5: DUPLICAR PROPOSTA
     ================================================ */
  function duplicar(id) {
    const original = DB.get('propostas', id);
    if (!original) return;
    const novoNumero = _nextNumeroProposta();
    const copia = DB.create('propostas', {
      numero: novoNumero,
      titulo: original.titulo,
      clienteId: original.clienteId,
      clienteNome: original.clienteNome,
      responsavel: original.responsavel,
      valor: original.valor,
      status: 'elaboracao',
      validade: '',
      descricao: original.descricao,
      observacoes: original.observacoes,
      itens: JSON.parse(JSON.stringify(original.itens || [])),
      versoes: [],
      leadId: original.leadId || null,
    });
    Toast.success(`Proposta ${novoNumero} duplicada! Edite os detalhes.`);
    setTimeout(() => openForm(copia.id), 300);
  }

  return {
    render, openForm, saveProposta, deleteProposta, view, setFilter, changeStatus,
    criarRecebivel, addNew, addItemRow, removeItemRow, _setItemField,
    abrirFluxoContratacao, _ctab, _toggleCondicao, _previewParcelas,
    _addEtapaContrato, _renderEtapasContrato, _setEtapaCampo, _removeEtapaContrato,
    nextNumeroProposta: _nextNumeroProposta, // exposto para uso no pipeline
    setPeriodo,
    drillDown,
    duplicar,
    imprimirProposta,
    _aplicarTemplate,
  };
})();

/* Aplica um template salvo na Config ao formulário de proposta aberto */
Propostas._aplicarTemplate = function(idx) {
  if (idx === '') return;
  const cfg = DB.getConfig();
  const t = (cfg.templatesPropostas || [])[parseInt(idx)];
  if (!t) return;
  const fpTitulo = document.getElementById('fpTitulo');
  const fpDesc   = document.getElementById('fpDescricao');
  const fpPgto   = document.getElementById('fpFormaPgto');
  const fpPrazo  = document.getElementById('fpPrazoExec');
  const fpObs    = document.getElementById('fpObs');
  if (fpTitulo && !fpTitulo.value && t.titulo)  fpTitulo.value  = t.titulo;
  if (fpDesc   && !fpDesc.value   && t.descricao) fpDesc.value  = t.descricao;
  if (fpPgto   && t.formaPagamento) fpPgto.value = t.formaPagamento;
  if (fpPrazo  && t.prazoExecucao)  fpPrazo.value = t.prazoExecucao;
  if (fpObs    && t.observacoes)    fpObs.value   = t.observacoes;
  Toast.success(`Template "${t.nome}" aplicado`);
};
