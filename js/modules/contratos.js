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
    const inicioStr = Utils.localDateStr(inicio);
    return lista.filter(item => (item[campo] || item.createdAt || '') >= inicioStr);
  }

  function setPeriodo(p) {
    _periodo = p;
    render();
  }

  let _filter = { status: '', clienteId: '' };

  function _nextNumeroContrato() {
    const ano = new Date().getFullYear();
    const todos = DB.getAll('contratos');
    let max = 0;
    todos.forEach(c => {
      if (!c.numero) return;
      const m = c.numero.match(/^CONTR-\d{4}-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `CONTR-${ano}-${String(max + 1).padStart(5, '0')}`;
  }

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
    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const contratosFiltrados = _filtrarPorPeriodo(contratos, 'dataInicio');

    let list = contratos;
    if (_filter.status) list = list.filter(c => _autoStatus(c) === _filter.status);
    if (_filter.clienteId) list = list.filter(c => c.clienteId === _filter.clienteId);

    const ativos    = contratosFiltrados.filter(c => _autoStatus(c) === 'ativo').length;
    const renovando = contratosFiltrados.filter(c => _autoStatus(c) === 'renovando').length;
    const vencidos  = contratosFiltrados.filter(c => _autoStatus(c) === 'vencido').length;
    const valorTotal = contratosFiltrados.filter(c => ['ativo','renovando'].includes(_autoStatus(c))).reduce((s,c)=>s+(c.valor||0),0);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Contratos</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Contratos.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <button class="btn btn-primary" onclick="Contratos.openForm()">+ Novo Contrato</button>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" onclick="Contratos.drillDown('ativos')"><div class="kpi-label">Ativos</div><div class="kpi-value">${ativos}</div><div class="kpi-icon">📋</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b;cursor:pointer" onclick="Contratos.drillDown('vencendo')"><div class="kpi-label">Renovando em 30d</div><div class="kpi-value">${renovando}</div><div class="kpi-icon">🔄</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444;cursor:pointer" onclick="Contratos.drillDown('vencidos')"><div class="kpi-label">Vencidos</div><div class="kpi-value">${vencidos}</div><div class="kpi-icon">⚠</div></div>
        <div class="kpi-card" style="--kpi-color:#1a56db;cursor:pointer" onclick="Contratos.drillDown('encerrados')"><div class="kpi-label">Valor em Vigência</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(valorTotal)}</div><div class="kpi-icon">💰</div></div>
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
            <thead><tr><th>Nº</th><th>Objeto</th><th>Cliente</th><th>Valor</th><th>Vigência</th><th>Vencimento</th><th>Laudo</th><th>Renovação</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${list.map(c => {
                const status = _autoStatus(c);
                const dias = Utils.daysUntil(c.dataFim);
                const vencLabel = dias == null ? '—' : dias < 0 ? `⚠ ${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`;
                const vencClass = dias != null && dias < 0 ? 'text-danger' : dias != null && dias <= 30 ? 'text-warning' : 'text-muted';
                const laudoBadge = (() => {
                  if (!c.validadeLaudo) return '<span class="text-xs text-muted">—</span>';
                  const dl = Utils.daysUntil(c.validadeLaudo);
                  if (dl == null) return '<span class="text-xs text-muted">—</span>';
                  if (dl < 0) return `<span class="badge badge-red text-xs" title="Laudo vencido">⚠ Vencido</span>`;
                  if (dl <= 30) return `<span class="badge badge-red text-xs" title="Vence em ${dl}d">🔴 ${dl}d</span>`;
                  if (dl <= 60) return `<span class="badge badge-yellow text-xs" title="Vence em ${dl}d">⚠ ${dl}d</span>`;
                  return `<span class="badge badge-green text-xs">${dl}d</span>`;
                })();
                return `<tr>
                  <td class="text-xs font-bold text-muted">${Utils.escHtml(c.numero||'—')}</td>
                  <td><div class="font-bold" style="max-width:180px">${Utils.escHtml(c.objeto||'—')}</div></td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(c.clienteId))}</td>
                  <td class="font-bold text-primary">${Utils.formatCurrency(c.valor)}</td>
                  <td class="text-sm text-muted">${Utils.formatDate(c.dataInicio)} → ${Utils.formatDate(c.dataFim)}</td>
                  <td class="text-sm ${vencClass}">${Utils.formatDate(c.dataFim)} <span class="text-xs">${vencLabel}</span></td>
                  <td>${laudoBadge}</td>
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
        ${(() => {
          if (!c.validadeLaudo) return '';
          const dl = Utils.daysUntil(c.validadeLaudo);
          const cor = dl == null ? '#94a3b8' : dl < 0 ? '#ef4444' : dl <= 30 ? '#ef4444' : dl <= 60 ? '#f59e0b' : '#10b981';
          const msg = dl == null ? '—' : dl < 0 ? `⚠ Vencido há ${Math.abs(dl)} dias` : dl === 0 ? '⚠ Vence HOJE' : `Vence em ${dl} dias`;
          return `<div style="background:${cor}15;border:1px solid ${cor}44;border-radius:var(--radius);padding:12px;margin-bottom:12px">
            <div class="font-bold text-sm mb-1" style="color:${cor}">📋 Laudo / Certificado${c.tipoLaudo ? ' — ' + Utils.escHtml(c.tipoLaudo) : ''}</div>
            <div class="text-sm">Validade: <strong>${Utils.formatDate(c.validadeLaudo)}</strong> · <span style="color:${cor};font-weight:700">${msg}</span></div>
            ${(dl != null && dl <= 60) ? `<button class="btn btn-xs btn-warning mt-2" onclick="Contratos.criarLeadRenovacaoLaudo('${id}')">📋 Criar lead de renovação</button>` : ''}
          </div>`;
        })()}
        ${(() => {
          if (!c.projetoId) return '';
          const pj = DB.get('projetos', c.projetoId);
          if (!pj) return '';
          return `<div class="detail-field mb-3">
            <div class="detail-label">Projeto Vinculado</div>
            <div class="detail-value">
              <span style="cursor:pointer;color:var(--primary);font-weight:600;text-decoration:underline"
                onclick="Modal.close();App.navigate('projetos');setTimeout(()=>Projetos.view('${c.projetoId}'),300)">
                ${pj.ordemServico ? Utils.escHtml(pj.ordemServico) + ' — ' : ''}${Utils.escHtml(pj.titulo||'')}
              </span>
            </div>
          </div>`;
        })()}
        <!-- ASSINATURA DIGITAL -->
        ${c.assinatura ? `<div style="background:#f0fdf4;border:1px solid #10b981;border-radius:var(--radius);padding:12px;margin-top:12px">
          <div class="font-bold text-sm mb-1" style="color:#10b981">✅ Contrato Assinado Digitalmente</div>
          <div class="text-sm"><strong>${Utils.escHtml(c.assinatura.nome)}</strong> · CPF: ${Utils.escHtml(c.assinatura.cpf)} · ${Utils.escHtml(c.assinatura.cargo)}</div>
          <div class="text-xs text-muted">Em ${Utils.formatDate(c.assinatura.data)}</div>
          ${c.assinatura.imagem ? `<img src="${c.assinatura.imagem}" style="max-width:200px;margin-top:8px;border:1px solid var(--border);border-radius:4px" alt="Assinatura">` : ''}
        </div>` : ''}

        <!-- HISTÓRICO DE ALTERAÇÕES (Melhoria 15) -->
        ${(() => {
          const logs = DB.getAuditLog ? DB.getAuditLog().filter(l => l.recordId === id).slice(0, 20) : [];
          if (!logs.length) return '';
          const actionLabel = { create: '➕ Contrato criado', update: '✏ Atualizado', delete: '🗑 Removido' };
          return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-top:12px">
            <div class="font-bold text-sm mb-2">📜 Histórico de Alterações</div>
            <div style="max-height:180px;overflow-y:auto">
              ${logs.map(l => `
                <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);align-items:flex-start;font-size:12px">
                  <div style="flex:1">
                    <span class="font-bold">${actionLabel[l.action]||l.action}</span>
                    ${l.user ? `<span class="text-muted"> · ${Utils.escHtml(l.user)}</span>` : ''}
                    <span class="text-muted"> · ${l.timestamp ? Utils.formatDate(l.timestamp.split('T')[0]) + ' ' + (l.timestamp.split('T')[1]||'').substring(0,5) : '—'}</span>
                    ${l.changes && Object.keys(l.changes).length ? `<div class="text-xs text-muted mt-1">${Object.entries(l.changes).slice(0,3).map(([k,v]) => `${k}: ${String(v||'').substring(0,40)}`).join(' · ')}</div>` : ''}
                  </div>
                </div>`).join('')}
            </div>
          </div>`;
        })()}

        <div class="mt-4 flex gap-2" style="flex-wrap:wrap">
          ${status === 'vencido' || status === 'renovando' ? `<button class="btn btn-success btn-sm" onclick="Contratos.renovar('${id}')">🔄 Renovar Contrato</button>` : ''}
          ${!c.assinatura ? `<button class="btn btn-secondary btn-sm" onclick="Contratos.abrirAssinatura('${id}')">✍️ Assinar Contrato</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="Modal.close();Contratos.exportarPDF('${id}')">📄 Exportar PDF</button>
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Contratos.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  /* ================================================
     MELHORIA 16: ASSINATURA DIGITAL
  ================================================ */
  function abrirAssinatura(contratoId) {
    const c = DB.get('contratos', contratoId);
    if (!c) return;

    Modal.open({
      title: '✍️ Assinar Contrato Digitalmente',
      size: 'modal-lg',
      body: `
        <div style="background:var(--primary-light);border-radius:var(--radius);padding:12px;margin-bottom:16px">
          <div class="font-bold text-sm">${Utils.escHtml(c.objeto || c.numero || '')}</div>
          <div class="text-xs text-muted">${Utils.escHtml(Utils.getClientName(c.clienteId))} · ${Utils.formatCurrency(c.valor)}</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nome Completo *</label>
            <input class="form-control" id="asNome" placeholder="Nome do signatário">
          </div>
          <div class="form-group">
            <label class="form-label">CPF *</label>
            <input class="form-control" id="asCpf" placeholder="000.000.000-00">
          </div>
          <div class="form-group">
            <label class="form-label">Cargo / Função</label>
            <input class="form-control" id="asCargo" placeholder="Ex: Gerente de Manutenção">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Assinatura (desenhe abaixo)</label>
          <div style="border:2px solid var(--border);border-radius:var(--radius);background:#fff;position:relative">
            <canvas id="assinaturaCanvas" width="660" height="160" style="display:block;cursor:crosshair;touch-action:none"></canvas>
            <button type="button" class="btn btn-xs btn-ghost" onclick="Contratos._limparCanvas()" style="position:absolute;top:4px;right:4px">Limpar</button>
          </div>
          <div class="text-xs text-muted mt-1">Use o mouse ou toque para desenhar a assinatura</div>
        </div>
      `,
      saveLabel: '✅ Confirmar Assinatura',
      saveCb: () => _confirmarAssinatura(contratoId),
    });

    // Inicializar canvas após render
    setTimeout(() => _initCanvas(), 100);
  }

  let _drawing = false;

  function _initCanvas() {
    const canvas = document.getElementById('assinaturaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    canvas.addEventListener('mousedown', (e) => { _drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => { if (!_drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup', () => { _drawing = false; });
    canvas.addEventListener('mouseleave', () => { _drawing = false; });
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); _drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!_drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
    canvas.addEventListener('touchend', () => { _drawing = false; });
  }

  function _limparCanvas() {
    const canvas = document.getElementById('assinaturaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function _confirmarAssinatura(contratoId) {
    const nome = document.getElementById('asNome')?.value.trim();
    const cpf = document.getElementById('asCpf')?.value.trim();
    const cargo = document.getElementById('asCargo')?.value.trim();
    if (!nome || !cpf) { Toast.error('Nome e CPF são obrigatórios'); return; }

    const canvas = document.getElementById('assinaturaCanvas');
    const imagem = canvas ? canvas.toDataURL('image/png') : '';

    // Verifica se o canvas tem algum traço
    const ctx = canvas?.getContext('2d');
    const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawing = imageData ? imageData.data.some((v, i) => i % 4 === 3 && v > 0) : false;
    if (!hasDrawing) { Toast.error('Por favor, desenhe a assinatura no campo acima'); return; }

    DB.update('contratos', contratoId, {
      assinatura: {
        nome,
        cpf,
        cargo: cargo || '',
        data: Utils.todayStr(),
        imagem,
      },
    });
    Toast.success('Contrato assinado digitalmente!');
    Modal.close();
    render();
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
      novoFim = Utils.localDateStr(novaFimDate);
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
          <input class="form-control" id="rnValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(c.valor)}">
        </div>
      `,
      saveCb: () => {
        DB.update('contratos', id, {
          dataInicio: document.getElementById('rnInicio').value,
          dataFim: document.getElementById('rnFim').value,
          valor: Utils.parseMoney(document.getElementById('rnValor').value) || c.valor,
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

    const clientOpts = clientes.map(cl => `<option value="${cl.id}" ${c?.clienteId===cl.id?'selected':''}>${Utils.escHtml(cl.nome)}</option>`).join('');
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${c?.responsavel===r?'selected':''}>${r}</option>`).join('');
    const statusOpts = Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${(c?.status||'ativo')===k?'selected':''}>${v.label}</option>`).join('');

    Modal.open({
      title: id ? 'Editar Contrato' : 'Novo Contrato',
      size: 'modal-lg',
      body: `
        <div class="form-group">
          <label class="form-label">Número do Contrato</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="form-control" id="fContratoNumero" value="${Utils.escHtml(c?.numero || _nextNumeroContrato())}" style="font-family:var(--font-mono);font-weight:700;font-size:15px;letter-spacing:.5px">
            <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">Auto-gerado</span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
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
            <input class="form-control" id="fcValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(c?.valor)}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input class="form-control" id="fcInicio" type="date" value="${c?.dataInicio||''}" oninput="Contratos._calcDataFimFromPrazo()">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo (meses)</label>
            <input class="form-control" id="fcPrazoMeses" type="number" min="1" max="120" value="${c?.prazoMeses||''}" placeholder="Ex: 12" oninput="Contratos._calcDataFimFromPrazo()">
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
          <label class="form-label">Proposta Vinculada</label>
          <select class="form-control" id="fcPropostaId">
            <option value="">— Nenhuma —</option>
            ${DB.getAll('propostas').filter(p => p.status === 'aprovada' || p.id === c?.propostaId).map(p => `<option value="${p.id}" ${c?.propostaId===p.id?'selected':''}>${Utils.escHtml(p.numero||'—')} · ${Utils.escHtml(p.titulo||'')} (${Utils.formatCurrency(p.valor)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Projeto Vinculado</label>
          <select class="form-control" id="fContratoProjetoId">
            <option value="">— Nenhum —</option>
            ${DB.getAll('projetos').map(pj => `<option value="${pj.id}" ${c?.projetoId===pj.id?'selected':''}>${pj.ordemServico?pj.ordemServico+' — ':''}${Utils.escHtml(pj.titulo||'')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fcObs" rows="2">${Utils.escHtml(c?.observacoes||'')}</textarea>
        </div>

        <!-- VALIDADE DE LAUDO -->
        <div style="background:#fef9c3;border:1px solid #f59e0b44;border-radius:var(--radius);padding:12px;margin-top:8px">
          <div class="font-bold text-sm mb-2">📋 Validade do Laudo / Certificado</div>
          <div class="form-row" style="margin:0">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Data de Validade do Laudo</label>
              <input class="form-control" id="fcValidadeLaudo" type="date" value="${c?.validadeLaudo||''}">
              <div class="text-xs text-muted mt-1">Gera alerta automático 60 dias antes do vencimento</div>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Tipo de Laudo</label>
              <input class="form-control" id="fcTipoLaudo" value="${Utils.escHtml(c?.tipoLaudo||'')}" placeholder="Ex: PPRA, PCMSO, NR-12, Linha de Vida...">
            </div>
          </div>
        </div>
      `,
      saveCb: () => saveContrato(id),
    });
  }

  function saveContrato(id) {
    const objeto = document.getElementById('fcObjeto').value.trim();
    if (!objeto) { Toast.error('Objeto do contrato obrigatório'); return; }
    const valor = Utils.parseMoney(document.getElementById('fcValor').value);
    if (!valor) { Toast.error('Valor obrigatório'); return; }

    const data = {
      numero:             document.getElementById('fContratoNumero').value.trim(),
      objeto,
      clienteId:          document.getElementById('fcCliente').value,
      responsavel:        document.getElementById('fcResp').value,
      tipoServico:        document.getElementById('fcServico').value,
      valor,
      dataInicio:         document.getElementById('fcInicio').value,
      dataFim:            document.getElementById('fcFim').value,
      prazoMeses:         Number(document.getElementById('fcPrazoMeses').value) || null,
      alertaVencimento:   Number(document.getElementById('fcAlerta').value) || 30,
      renovacaoAutomatica: document.getElementById('fcRenovacao').checked,
      status:             document.getElementById('fcStatus').value,
      descricao:          document.getElementById('fcDescricao').value,
      observacoes:        document.getElementById('fcObs').value,
      projetoId:          document.getElementById('fContratoProjetoId').value || null,
      propostaId:         document.getElementById('fcPropostaId')?.value || null,
    };

    data.validadeLaudo = document.getElementById('fcValidadeLaudo')?.value || null;
    data.tipoLaudo = document.getElementById('fcTipoLaudo')?.value.trim() || null;

    if (id) {
      DB.update('contratos', id, data);
      Toast.success('Contrato atualizado');
    } else {
      const novoContrato = DB.create('contratos', data);
      Toast.success('Contrato criado');

      // Criar recebível automático quando o contrato tem valor definido
      if (data.valor > 0 && data.clienteId) {
        const hoje = new Date();
        // Calcular número de parcelas: contratos mensais → parcelas = prazoMeses; senão 3 parcelas padrão
        const numParcelas = data.prazoMeses > 0 ? Math.min(data.prazoMeses, 24) : 3;
        const valorParc = Math.round((data.valor / numParcelas) * 100) / 100;
        const parcelas = Array.from({ length: numParcelas }, (_, i) => {
          const venc = new Date(data.dataInicio || hoje);
          venc.setMonth(venc.getMonth() + i + 1);
          const isLast = i === numParcelas - 1;
          const valor = isLast
            ? Math.round((data.valor - valorParc * (numParcelas - 1)) * 100) / 100
            : valorParc;
          return {
            id: Date.now().toString(36) + i.toString(36),
            vencimento: Utils.localDateStr(venc),
            valor,
            status: 'a_vencer',
            dataPagamento: null,
            nfNumero: '',
          };
        });
        DB.create('recebiveis', {
          clienteId: data.clienteId,
          contratoId: novoContrato.id,
          descricao: `${data.objeto} (${data.numero || novoContrato.id.substring(0,8)})`,
          valorTotal: data.valor,
          parcelas,
          origem: 'contrato_criado',
        });
        Toast.show(`💰 Recebível criado automaticamente em ${numParcelas} parcela(s). Ajuste em Financeiro › Contas a Receber se necessário.`, 'default', 7000);
      }
    }
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

  function drillDown(tipo) {
    const hoje = Utils.localDateStr(new Date());
    const contratos = DB.getAll('contratos');
    const contratosFiltrados = _filtrarPorPeriodo(contratos, 'dataInicio');
    let title = '', items = [], cols = [], rowFn = () => [];

    if (tipo === 'ativos') {
      title = 'Ativos';
      items = contratosFiltrados.filter(c => _autoStatus(c) === 'ativo');
      cols = ['Contrato', 'Cliente', 'Valor', 'Vencimento'];
      rowFn = c => [
        Utils.escHtml(c.objeto || c.numero || '—'),
        Utils.escHtml(DB.get('clientes', c.clienteId)?.nome || '—'),
        Utils.formatCurrency(c.valor),
        Utils.formatDate(c.dataFim || c.vencimento),
      ];
    } else if (tipo === 'vencendo') {
      title = 'Vencidos e vencendo em 30 dias';
      items = contratos.filter(c => {
        const dias = Utils.daysUntil(c.dataFim || c.vencimento);
        return dias !== null && dias <= 30 && _autoStatus(c) !== 'encerrado';
      });
      cols = ['Contrato', 'Cliente', 'Vencimento', 'Dias Restantes'];
      rowFn = c => {
        const dias = Utils.daysUntil(c.dataFim || c.vencimento);
        const diasStr = dias === null ? '—'
          : dias < 0 ? `<span style="color:#C42B2B;font-weight:700">Vencido há ${Math.abs(dias)}d</span>`
          : `<span style="color:#f59e0b;font-weight:600">${dias}d</span>`;
        return [
          Utils.escHtml(c.objeto || c.numero || '—'),
          Utils.escHtml(DB.get('clientes', c.clienteId)?.nome || '—'),
          Utils.formatDate(c.dataFim || c.vencimento),
          diasStr,
        ];
      };
    } else if (tipo === 'vencidos') {
      title = 'Vencidos';
      items = contratos.filter(c => {
        const dias = Utils.daysUntil(c.dataFim || c.vencimento);
        return dias !== null && dias < 0 && c.status !== 'encerrado' && c.status !== 'cancelado';
      });
      cols = ['Contrato', 'Cliente', 'Vencimento', 'Dias Vencido'];
      rowFn = c => {
        const dias = Utils.daysUntil(c.dataFim || c.vencimento);
        const diasStr = dias !== null ? `<span style="color:#ef4444;font-weight:600">${Math.abs(dias)}d</span>` : '—';
        return [
          Utils.escHtml(c.objeto || c.numero || '—'),
          Utils.escHtml(DB.get('clientes', c.clienteId)?.nome || '—'),
          Utils.formatDate(c.dataFim || c.vencimento),
          diasStr,
        ];
      };
    } else if (tipo === 'encerrados') {
      title = 'Encerrados';
      items = contratosFiltrados.filter(c => c.status === 'encerrado' || c.status === 'cancelado');
      cols = ['Contrato', 'Cliente', 'Valor', 'Data Encerramento'];
      rowFn = c => [
        Utils.escHtml(c.objeto || c.numero || '—'),
        Utils.escHtml(DB.get('clientes', c.clienteId)?.nome || '—'),
        Utils.formatCurrency(c.valor),
        Utils.formatDate(c.dataFim || c.vencimento),
      ];
    }

    if (!items) return;
    Modal.open({
      title: `${title} — ${items.length} registro(s)`,
      body: `
        <div style="max-height:55vh;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:var(--surface-2,#f8fafc);position:sticky;top:0">
              ${cols.map(c=>`<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border)">${c}</th>`).join('')}
            </tr></thead>
            <tbody>${items.length ? items.map(item => {
              const cells = rowFn(item);
              return `<tr style="border-bottom:1px solid var(--border);cursor:pointer"
                onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
                ${cells.map(v=>`<td style="padding:8px 12px">${v}</td>`).join('')}</tr>`;
            }).join('') : `<tr><td colspan="${cols.length}" style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`}
            </tbody>
          </table>
        </div>`,
      saveCb: null,
    });
    setTimeout(() => { const f=document.getElementById('modalFoot'); if(f) f.style.display='none'; }, 0);
  }

  function addNew() { openForm(); }

  /* ================================================
     CRIAR CONTRATO A PARTIR DE PROPOSTA APROVADA
  ================================================ */
  function criarDePropostal(propostaId) {
    const p = DB.get('propostas', propostaId);
    if (!p) { Toast.error('Proposta não encontrada'); return; }
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const clientOpts = clientes.map(cl => `<option value="${cl.id}" ${p.clienteId===cl.id?'selected':''}>${Utils.escHtml(cl.nome)}</option>`).join('');
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${p.responsavel===r?'selected':''}>${r}</option>`).join('');
    const statusOpts = Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${k==='ativo'?'selected':''}>${v.label}</option>`).join('');
    const hoje = Utils.todayStr();

    Modal.open({
      title: `📝 Criar Contrato — ${Utils.escHtml(p.numero||p.titulo||'')}`,
      size: 'modal-lg',
      body: `
        <div style="background:var(--success-light);border:1px solid var(--success-border);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;font-size:13px">
          ✅ Criando contrato vinculado à proposta <strong>${Utils.escHtml(p.numero||p.titulo||'')}</strong> · ${Utils.formatCurrency(p.valor)}
        </div>
        <div class="form-group">
          <label class="form-label">Número do Contrato</label>
          <input class="form-control" id="fContratoNumero" value="${Utils.escHtml(_nextNumeroContrato())}" style="font-family:var(--font-mono);font-weight:700">
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label class="form-label">Status</label>
            <select class="form-control" id="fcStatus">${statusOpts}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Objeto do Contrato *</label>
          <input class="form-control" id="fcObjeto" value="${Utils.escHtml(p.titulo||'')}" placeholder="Objeto do contrato">
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
              ${cfg.servicos.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Valor Total (R$) *</label>
            <input class="form-control" id="fcValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(p.valor)}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input class="form-control" id="fcInicio" type="date" value="${hoje}" oninput="Contratos._calcDataFimFromPrazo()">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo (meses)</label>
            <input class="form-control" id="fcPrazoMeses" type="number" min="1" max="120" placeholder="Ex: 12" oninput="Contratos._calcDataFimFromPrazo()">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Vencimento</label>
            <input class="form-control" id="fcFim" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">Alerta antes (dias)</label>
            <input class="form-control" id="fcAlerta" type="number" value="30" min="0" max="180">
          </div>
        </div>
        <div class="form-group">
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
            <input type="checkbox" id="fcRenovacao">
            <span class="form-label" style="margin:0">🔄 Renovação automática</span>
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição / Escopo</label>
          <textarea class="form-control" id="fcDescricao" rows="3">${Utils.escHtml(p.descricao||p.observacoes||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fcObs" rows="2"></textarea>
        </div>
        <input type="hidden" id="fcPropostaId" value="${propostaId}">
      `,
      saveCb: () => {
        const objeto = document.getElementById('fcObjeto').value.trim();
        if (!objeto) { Toast.error('Objeto obrigatório'); return; }
        const valor = Utils.parseMoney(document.getElementById('fcValor').value);
        if (!valor) { Toast.error('Valor obrigatório'); return; }
        const data = {
          numero:             document.getElementById('fContratoNumero').value.trim(),
          objeto,
          clienteId:          document.getElementById('fcCliente').value,
          responsavel:        document.getElementById('fcResp').value,
          tipoServico:        document.getElementById('fcServico').value,
          valor,
          dataInicio:         document.getElementById('fcInicio').value,
          dataFim:            document.getElementById('fcFim').value,
          prazoMeses:         Number(document.getElementById('fcPrazoMeses').value) || null,
          alertaVencimento:   Number(document.getElementById('fcAlerta').value) || 30,
          renovacaoAutomatica: document.getElementById('fcRenovacao').checked,
          status:             document.getElementById('fcStatus').value,
          descricao:          document.getElementById('fcDescricao').value,
          observacoes:        document.getElementById('fcObs').value,
          propostaId:         document.getElementById('fcPropostaId').value || null,
        };
        const novoContratoP = DB.create('contratos', data);
        Toast.success('Contrato criado a partir da proposta!');

        // Criar recebível automático com valor da proposta
        if (data.valor > 0 && data.clienteId) {
          const hoje = new Date();
          const numParcelas = data.prazoMeses > 0 ? Math.min(data.prazoMeses, 24) : 3;
          const valorParc = Math.round((data.valor / numParcelas) * 100) / 100;
          const parcelas = Array.from({ length: numParcelas }, (_, i) => {
            const venc = new Date(data.dataInicio || hoje);
            venc.setMonth(venc.getMonth() + i + 1);
            const isLast = i === numParcelas - 1;
            const valorP = isLast
              ? Math.round((data.valor - valorParc * (numParcelas - 1)) * 100) / 100
              : valorParc;
            return {
              id: Date.now().toString(36) + i.toString(36),
              vencimento: Utils.localDateStr(venc),
              valor: valorP,
              status: 'a_vencer',
              dataPagamento: null,
              nfNumero: '',
            };
          });
          DB.create('recebiveis', {
            clienteId: data.clienteId,
            contratoId: novoContratoP.id,
            propostaId: data.propostaId || null,
            descricao: `${data.objeto} (${data.numero || novoContratoP.id.substring(0,8)})`,
            valorTotal: data.valor,
            parcelas,
            origem: 'contrato_proposta',
          });
          Toast.show(`💰 Recebível criado em ${numParcelas} parcela(s). Ajuste em Financeiro › Contas a Receber.`, 'default', 7000);
        }

        Modal.close();
        App.navigate('contratos');
      },
    });
  }

  function _calcDataFimFromPrazo() {
    const inicio = document.getElementById('fcInicio')?.value;
    const meses = Number(document.getElementById('fcPrazoMeses')?.value);
    if (!inicio || !meses) return;
    const d = new Date(inicio);
    d.setMonth(d.getMonth() + meses);
    const fimEl = document.getElementById('fcFim');
    if (fimEl) fimEl.value = Utils.localDateStr(d);
  }

  /* ================================================
     PDF DE CONTRATO
  ================================================ */
  function exportarPDF(id) {
    const c = DB.get('contratos', id);
    if (!c) return;
    const cfg = DB.getConfig();
    const cliente = Utils.getClientName(c.clienteId);
    const status = _autoStatus(c);

    // Criar área de impressão temporária
    let area = document.getElementById('contratoImpressao');
    if (!area) {
      area = document.createElement('div');
      area.id = 'contratoImpressao';
      document.body.appendChild(area);
    }

    area.innerHTML = `
      <div style="font-family:'Inter',sans-serif;max-width:780px;margin:0 auto;padding:40px;color:#1e293b">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid #1d4ed8">
          <div>
            <div style="font-size:24px;font-weight:800;color:#1d4ed8">${Utils.escHtml(cfg.empresa||'Empresa')}</div>
            ${cfg.cnpj ? `<div style="font-size:12px;color:#64748b">CNPJ: ${Utils.escHtml(cfg.cnpj)}</div>` : ''}
            ${cfg.cidade ? `<div style="font-size:12px;color:#64748b">${Utils.escHtml(cfg.cidade)}${cfg.estado?'/'+cfg.estado:''}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b">Contrato de Prestação de Serviços</div>
            <div style="font-size:18px;font-weight:800;color:#1d4ed8;font-family:monospace">${Utils.escHtml(c.numero||'—')}</div>
            <div style="font-size:11px;color:#64748b">Status: ${STATUS[status]?.label||status}</div>
          </div>
        </div>

        <h2 style="font-size:16px;font-weight:700;margin:0 0 16px;color:#1e293b">OBJETO DO CONTRATO</h2>
        <p style="font-size:14px;line-height:1.7;color:#334155;margin-bottom:24px">${Utils.escHtml(c.objeto||'')}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
          <div style="background:#f8fafc;border-radius:8px;padding:14px;border-left:3px solid #1d4ed8">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">CONTRATANTE</div>
            <div style="font-size:14px;font-weight:600">${Utils.escHtml(cliente)}</div>
          </div>
          <div style="background:#f8fafc;border-radius:8px;padding:14px;border-left:3px solid #1d4ed8">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">CONTRATADA</div>
            <div style="font-size:14px;font-weight:600">${Utils.escHtml(cfg.empresa||'—')}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
          <div style="background:#f8fafc;border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:2px">VALOR TOTAL</div>
            <div style="font-size:16px;font-weight:800;color:#1d4ed8">${Utils.formatCurrency(c.valor||0)}</div>
          </div>
          <div style="background:#f8fafc;border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:2px">VIGÊNCIA</div>
            <div style="font-size:13px;font-weight:600">${Utils.formatDate(c.dataInicio)} a ${Utils.formatDate(c.dataFim)}</div>
          </div>
          <div style="background:#f8fafc;border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:2px">RESPONSÁVEL</div>
            <div style="font-size:13px;font-weight:600">${Utils.escHtml(c.responsavel||'—')}</div>
          </div>
        </div>

        ${c.descricao ? `
        <h3 style="font-size:14px;font-weight:700;margin:0 0 10px;color:#1e293b">ESCOPO / DESCRIÇÃO</h3>
        <p style="font-size:13px;line-height:1.7;color:#334155;margin-bottom:24px;white-space:pre-wrap">${Utils.escHtml(c.descricao)}</p>
        ` : ''}

        ${c.observacoes ? `
        <h3 style="font-size:14px;font-weight:700;margin:0 0 10px;color:#1e293b">OBSERVAÇÕES</h3>
        <p style="font-size:13px;line-height:1.7;color:#334155;margin-bottom:24px;white-space:pre-wrap">${Utils.escHtml(c.observacoes)}</p>
        ` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px">
          <div style="border-top:1px solid #cbd5e1;padding-top:10px;text-align:center;font-size:12px;color:#64748b">
            <div style="margin-bottom:30px"></div>
            Assinatura do Contratante<br>${Utils.escHtml(cliente)}
          </div>
          <div style="border-top:1px solid #cbd5e1;padding-top:10px;text-align:center;font-size:12px;color:#64748b">
            <div style="margin-bottom:30px"></div>
            Assinatura da Contratada<br>${Utils.escHtml(cfg.empresa||'')}
          </div>
        </div>

        <div style="text-align:center;font-size:10px;color:#94a3b8;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px">
          Gerado em ${new Date().toLocaleDateString('pt-BR')} · ${Utils.escHtml(cfg.empresa||'')} — Bikows CRM
        </div>
      </div>
    `;

    // Mostrar área de impressão — o @media print oculta o appLayout automaticamente
    area.style.display = 'block';
    requestAnimationFrame(() => {
      window.print();
      area.style.display = 'none';
    });
  }

  /* ================================================
     MELHORIAS: Validade de Laudo + Alertas de Vencimento
  ================================================ */

  // Cria lead de renovação quando laudo/certificado está vencendo
  function criarLeadRenovacaoLaudo(contratoId) {
    const c = DB.get('contratos', contratoId);
    if (!c) return;
    const clienteNome = Utils.getClientName(c.clienteId);
    const titulo = `Renovação de ${c.tipoLaudo || 'Laudo'} — ${clienteNome}`;
    const novo = DB.create('leads', {
      titulo,
      clienteId: c.clienteId,
      status: 'lead_identificado',
      valorEstimado: c.valor || 0,
      responsavel: c.responsavel || '',
      origemLead: 'Recorrência',
      observacoes: `Renovação originada do contrato ${c.numero || ''} — laudo vence em ${Utils.formatDate(c.validadeLaudo)}`,
      dataEntrada: Utils.todayStr(),
    });
    Toast.success(`Lead de renovação criado: "${titulo}"`);
    Modal.close();
    App.navigate('pipeline');
  }

  // Retorna contratos a vencer em N dias (para o dashboard)
  // Contratos vencendo em N dias — INCLUI os já vencidos.
  // Antes exigia d >= 0, então contrato vencido sumia do painel de
  // Pendências: vencia e ninguém era avisado (crítico para renovação
  // de laudos, que é a base da receita recorrente).
  function getContratosVencendo(dias = 60) {
    return DB.getAll('contratos').filter(c => {
      if (['encerrado','cancelado'].includes(c.status)) return false;
      const d = Utils.daysUntil(c.dataFim);
      return d != null && d <= dias;
    }).sort((a, b) => (a.dataFim || '').localeCompare(b.dataFim || ''));
  }

  // Retorna contratos com laudo vencendo em N dias
  function getLaudosVencendo(dias = 60) {
    return DB.getAll('contratos').filter(c => {
      if (!c.validadeLaudo) return false;
      const d = Utils.daysUntil(c.validadeLaudo);
      return d != null && d <= dias;
    });
  }

  // Cria lead de renovação de contrato
  function criarLeadRenovacaoContrato(contratoId) {
    const c = DB.get('contratos', contratoId);
    if (!c) return;
    const clienteNome = Utils.getClientName(c.clienteId);
    const titulo = `Renovação de Contrato — ${clienteNome}`;
    DB.create('leads', {
      titulo,
      clienteId: c.clienteId,
      status: 'lead_identificado',
      valorEstimado: c.valor || 0,
      responsavel: c.responsavel || '',
      origemLead: 'Recorrência',
      observacoes: `Renovação do contrato ${c.numero || ''} que vence em ${Utils.formatDate(c.dataFim)}`,
      dataEntrada: Utils.todayStr(),
    });
    Toast.success(`Lead de renovação criado para "${clienteNome}"`);
  }

  return { render, openForm, saveContrato, deleteContrato, view, setFilter, renovar, addNew, setPeriodo, drillDown, criarDePropostal, _calcDataFimFromPrazo, exportarPDF, criarLeadRenovacaoLaudo, criarLeadRenovacaoContrato, getContratosVencendo, getLaudosVencendo, abrirAssinatura, _limparCanvas, _confirmarAssinatura };
})();
