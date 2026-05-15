/* ==========================================
   PIPELINE — Kanban CRM com drag & drop
   ========================================== */
const Pipeline = (() => {

  const STAGES = [
    { key: 'lead_identificado',   label: '🔵 Lead Identificado',      color: '#64748b' },
    { key: 'primeiro_contato',    label: '📞 Primeiro Contato',       color: '#3b82f6' },
    { key: 'qualificacao',        label: '🔍 Qualificação',           color: '#8b5cf6' },
    { key: 'proposta_elaboracao', label: '📋 Proposta em Elaboração', color: '#f59e0b' },
    { key: 'proposta_enviada',    label: '📤 Proposta Enviada',       color: '#f97316' },
    { key: 'negociacao',          label: '🤝 Negociação',             color: '#eab308' },
    { key: 'fechado_ganho',       label: '✅ Fechado / Ganho',        color: '#10b981' },
    { key: 'fechado_perdido',     label: '❌ Fechado / Perdido',      color: '#ef4444' },
  ];

  let dragId = null;

  function render() {
    const leads = DB.getAll('leads');
    const config = DB.getConfig();

    const totalPipeline = Utils.sum(leads.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status)), 'valorEstimado');
    const ganhos = leads.filter(l => l.status === 'fechado_ganho');
    const taxa = leads.length ? ((ganhos.length / leads.length)*100).toFixed(0) : 0;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Pipeline CRM</h2>
        <div class="sec-actions">
          <select class="filter-select" id="filterResp" onchange="Pipeline.render()">
            <option value="">Todos os responsáveis</option>
            ${config.responsaveis.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="Pipeline.openForm()">+ Novo Lead</button>
        </div>
      </div>

      <div class="pipeline-summary mb-4">
        <div class="pipeline-stage">
          <div class="ps-label">Total em Pipeline</div>
          <div class="ps-value">${Utils.formatCurrency(totalPipeline)}</div>
          <div class="ps-count">${leads.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status)).length} oportunidades</div>
        </div>
        <div class="pipeline-stage">
          <div class="ps-label">Fechado / Ganho</div>
          <div class="ps-value">${Utils.formatCurrency(Utils.sum(ganhos,'valorFechado'))}</div>
          <div class="ps-count">${ganhos.length} negócios</div>
        </div>
        <div class="pipeline-stage">
          <div class="ps-label">Taxa de Conversão</div>
          <div class="ps-value">${taxa}%</div>
          <div class="ps-count">${leads.filter(l=>l.status==='fechado_perdido').length} perdidos</div>
        </div>
        <div class="pipeline-stage">
          <div class="ps-label">Total de Leads</div>
          <div class="ps-value">${leads.length}</div>
          <div class="ps-count">no funil</div>
        </div>
      </div>

      <div class="kanban-wrap">
        <div class="kanban-board" id="kanbanBoard">
          ${STAGES.map(s => renderColumn(s, leads)).join('')}
        </div>
      </div>
    `;

    initDragDrop();
  }

  function renderColumn(stage, allLeads) {
    const filterResp = document.getElementById('filterResp')?.value || '';
    let leads = allLeads.filter(l => l.status === stage.key);
    if (filterResp) leads = leads.filter(l => l.responsavel === filterResp);
    const total = Utils.sum(leads, 'valorEstimado');

    return `<div class="kanban-col" data-stage="${stage.key}">
      <div class="kanban-col-header">
        <div class="kanban-col-title" style="color:${stage.color}">${stage.label}</div>
        <div class="kanban-col-count">${leads.length}</div>
      </div>
      ${total > 0 ? `<div class="text-xs text-muted mb-2 text-center">${Utils.formatCurrency(total)}</div>` : ''}
      <div class="kanban-cards" id="col-${stage.key}"
        ondragover="Pipeline.dragOver(event)"
        ondrop="Pipeline.drop(event,'${stage.key}')"
        ondragleave="Pipeline.dragLeave(event)">
        ${leads.map(l => renderCard(l, stage.color)).join('')}
      </div>
      <button class="kanban-add" onclick="Pipeline.openForm(null,'${stage.key}')">+ Adicionar lead</button>
    </div>`;
  }

  function renderCard(lead, color) {
    const client = DB.get('clientes', lead.clienteId);
    const empresa = client ? client.nome : '—';
    const alert = Utils.dateAlert(lead.dataProximaAcao, '');
    const dias = Utils.daysUntil(lead.dataProximaAcao);
    const dateClass = dias != null && dias < 0 ? 'text-danger' : 'text-muted';

    return `<div class="kanban-card" draggable="true" data-id="${lead.id}"
      style="--card-color:${color}"
      ondragstart="Pipeline.dragStart(event,'${lead.id}')"
      ondragend="Pipeline.dragEnd(event)">
      <div class="kc-name">${Utils.escHtml(lead.titulo)}</div>
      <div class="kc-empresa">🏢 ${Utils.escHtml(empresa)}</div>
      <div class="kc-valor">${Utils.formatCurrency(lead.valorEstimado)}</div>
      <div class="kc-footer">
        <span class="text-xs ${dateClass}">
          ${lead.dataProximaAcao ? '📅 ' + Utils.formatDate(lead.dataProximaAcao) : ''}
          ${alert}
        </span>
        <span class="text-xs text-muted">${lead.responsavel || ''}</span>
      </div>
      <div class="kc-actions">
        <button class="btn btn-xs btn-secondary" onclick="Pipeline.viewLead('${lead.id}')">Ver</button>
        ${lead.contato ? `<button class="btn btn-xs btn-success" style="background:#25D366;border-color:#25D366" onclick="Utils.openWhatsApp('${Utils.escHtml(lead.contato)}')" title="WhatsApp">💬</button>` : ''}
        <button class="btn btn-xs btn-secondary" onclick="Pipeline.openForm('${lead.id}')">✏</button>
        <button class="btn btn-xs btn-danger" onclick="Pipeline.deleteLead('${lead.id}')">🗑</button>
      </div>
    </div>`;
  }

  function initDragDrop() {
    // Handled via inline handlers
  }

  function dragStart(e, id) {
    dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('dragging'), 0);
  }

  function dragEnd(e) {
    e.target.classList.remove('dragging');
    dragId = null;
  }

  function dragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  function dragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function drop(e, newStatus) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!dragId) return;
    DB.update('leads', dragId, { status: newStatus });
    Toast.success('Lead movido para ' + Utils.LEAD_STATUS[newStatus]?.label);
    render();
    App.updateNotifBadge();
  }

  function viewLead(id) {
    const lead = DB.get('leads', id);
    if (!lead) return;
    const client = DB.get('clientes', lead.clienteId);
    const servicos = (lead.servicoInteresse || []).join(', ');
    const dias = Utils.daysUntil(lead.dataProximaAcao);
    const diasLabel = dias == null ? '—' : dias < 0 ? `⚠ Atrasado ${Math.abs(dias)}d` : dias === 0 ? 'Hoje' : `Em ${dias} dias`;

    Modal.open({
      title: lead.titulo,
      size: 'modal-lg',
      body: `
        <div class="detail-grid mb-4">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(client?.nome || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Status</div><div class="detail-value">${Utils.leadBadge(lead.status)}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Estimado</div><div class="detail-value font-bold text-primary">${Utils.formatCurrency(lead.valorEstimado)}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Fechado</div><div class="detail-value">${Utils.formatCurrency(lead.valorFechado)}</div></div>
          <div class="detail-field"><div class="detail-label">Origem</div><div class="detail-value">${Utils.escHtml(lead.origemLead || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Responsável</div><div class="detail-value">${Utils.escHtml(lead.responsavel || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Decisor</div><div class="detail-value">${Utils.escHtml(lead.decisor || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Segmento</div><div class="detail-value">${Utils.escHtml(lead.segmento || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Serviços</div><div class="detail-value">${Utils.escHtml(servicos || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Proposta Nº</div><div class="detail-value">${Utils.escHtml(lead.propostaNum || '—')}</div></div>
        </div>
        <div class="detail-field mb-3" style="background:var(--warning-bg);padding:12px;border-radius:var(--radius);border-left:3px solid var(--warning)">
          <div class="detail-label">Próxima Ação</div>
          <div class="detail-value">${Utils.escHtml(lead.proximaAcao || '—')}</div>
          <div class="text-xs text-muted mt-1">${Utils.formatDate(lead.dataProximaAcao)} · ${diasLabel}</div>
        </div>
        ${lead.observacoes ? `<div class="detail-field"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(lead.observacoes)}</div></div>` : ''}
        ${lead.motivoPerda ? `<div class="detail-field mt-2"><div class="detail-label">Motivo de Perda</div><div class="detail-value text-danger">${Utils.escHtml(lead.motivoPerda)}</div></div>` : ''}
        <div class="mt-4 flex gap-2" style="flex-wrap:wrap">
          ${lead.status === 'fechado_ganho' ? `<button class="btn btn-success btn-sm" onclick="Modal.close();Pipeline.criarProjeto('${id}')">📋 Criar Projeto</button>` : ''}
          ${['proposta_enviada','negociacao','fechado_ganho'].includes(lead.status) ? `<button class="btn btn-secondary btn-sm" onclick="Modal.close();Pipeline.criarRecebivel('${id}')">💰 Criar Recebível</button>` : ''}
          ${lead.contato ? `<button class="btn btn-sm" style="background:#25D366;border-color:#25D366;color:#fff" onclick="Utils.openWhatsApp('${Utils.escHtml(lead.contato)}','Olá ${Utils.escHtml(lead.decisor||'')}! Sou da Bikows Engenharia. Gostaria de falar sobre ${Utils.escHtml(lead.titulo)}.')">💬 WhatsApp</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Pipeline.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  function criarProjeto(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const cfg = DB.getConfig();
    const seq = String(DB.getAll('projetos').length + 1).padStart(3, '0');
    const codigo = `BIK-${new Date().getFullYear()}-PRJ-${seq}`;
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${lead.responsavel===r?'selected':''}>${r}</option>`).join('');
    Modal.open({
      title: '📋 Criar Projeto a partir do Lead',
      size: 'modal-lg',
      body: `
        <div style="background:var(--primary-light);padding:12px;border-radius:var(--radius);margin-bottom:16px;border-left:3px solid var(--primary)">
          <div class="text-xs text-muted">Lead de origem</div>
          <div class="font-bold">${Utils.escHtml(lead.titulo)}</div>
          <div class="text-sm text-muted">${Utils.escHtml(Utils.getClientName(lead.clienteId))} · ${Utils.formatCurrency(lead.valorFechado||lead.valorEstimado)}</div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Título do Projeto *</label>
            <input class="form-control" id="cpTitulo" value="${Utils.escHtml(lead.titulo)}">
          </div>
          <div class="form-group">
            <label class="form-label">Código</label>
            <input class="form-control" id="cpCodigo" value="${codigo}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor (R$) *</label>
            <input class="form-control" id="cpValor" type="number" value="${lead.valorFechado||lead.valorEstimado||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input class="form-control" id="cpInicio" type="date" value="${Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo</label>
            <input class="form-control" id="cpPrazo" type="date">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Responsável</label>
          <select class="form-control" id="cpResp"><option value="">—</option>${respOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="cpObs" rows="2">${Utils.escHtml(lead.observacoes||'')}</textarea>
        </div>`,
      saveCb: () => {
        const titulo = document.getElementById('cpTitulo').value.trim();
        const valor = Number(document.getElementById('cpValor').value);
        if (!titulo) { Toast.error('Título obrigatório'); return; }
        DB.create('projetos', {
          titulo, valor,
          codigo: document.getElementById('cpCodigo').value,
          clienteId: lead.clienteId,
          responsavel: document.getElementById('cpResp').value,
          dataInicio: document.getElementById('cpInicio').value,
          prazo: document.getElementById('cpPrazo').value,
          status: 'planejado',
          nfEmitida: false, pagamentoRecebido: false,
          etapas: [],
          observacoes: document.getElementById('cpObs').value,
          leadOrigemId: leadId,
        });
        Toast.success('Projeto criado com sucesso!');
        Modal.close();
        App.navigate('projetos');
      },
    });
  }

  function criarRecebivel(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const valor = lead.valorFechado || lead.valorEstimado || 0;
    const hoje = Utils.todayStr();
    DB.create('recebiveis', {
      clienteId: lead.clienteId,
      descricao: lead.titulo,
      valorTotal: valor,
      parcelas: [{ id: Date.now().toString(36), vencimento: hoje, valor, status: 'a_vencer', dataPagamento: null, nfNumero: '' }],
    });
    Toast.success('Recebível criado! Acesse Financeiro → Contas a Receber para ajustar as parcelas.');
  }

  function openForm(id = null, defaultStatus = 'lead_identificado') {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const lead = id ? DB.get('leads', id) : null;
    const st = lead ? lead.status : defaultStatus;

    const clientOptions = clientes.map(c => `<option value="${c.id}" ${lead?.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('');
    const stageOptions = STAGES.map(s => `<option value="${s.key}" ${st === s.key ? 'selected' : ''}>${s.label}</option>`).join('');
    const respOptions = cfg.responsaveis.map(r => `<option value="${r}" ${lead?.responsavel === r ? 'selected' : ''}>${r}</option>`).join('');
    const servicosOptions = cfg.servicos.map(s => {
      const sel = (lead?.servicoInteresse || []).includes(s) ? 'selected' : '';
      return `<option value="${s}" ${sel}>${s}</option>`;
    }).join('');
    const origens = ['Prospecção','Indicação','Site','LinkedIn','Evento','Retorno','Outro'];
    const motivos = ['Preço','Concorrência','Sem orçamento','Sem urgência','Sem resposta','Outro'];

    Modal.open({
      title: id ? 'Editar Lead' : 'Novo Lead',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Título / Oportunidade *</label>
            <input class="form-control" id="fTitulo" value="${Utils.escHtml(lead?.titulo||'')}" placeholder="Ex: Adequação NR-12 Linha de Produção">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="fStatus">${stageOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cliente</label>
            <select class="form-control" id="fCliente"><option value="">Selecionar cliente</option>${clientOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Segmento</label>
            <select class="form-control" id="fSegmento">
              ${cfg.segmentos.map(s => `<option value="${s}" ${lead?.segmento === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor Estimado (R$)</label>
            <input class="form-control" id="fValor" type="number" value="${lead?.valorEstimado||''}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Valor Fechado (R$)</label>
            <input class="form-control" id="fValorFechado" type="number" value="${lead?.valorFechado||''}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Responsável</label>
            <select class="form-control" id="fResponsavel"><option value="">—</option>${respOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Origem do Lead</label>
            <select class="form-control" id="fOrigem">
              ${origens.map(o => `<option value="${o}" ${lead?.origemLead===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Decisor</label>
            <input class="form-control" id="fDecisor" value="${Utils.escHtml(lead?.decisor||'')}" placeholder="Nome e cargo do decisor">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Próxima Ação</label>
            <input class="form-control" id="fProximaAcao" value="${Utils.escHtml(lead?.proximaAcao||'')}" placeholder="O que fazer?">
          </div>
          <div class="form-group">
            <label class="form-label">Data da Próxima Ação</label>
            <input class="form-control" id="fDataAcao" type="date" value="${lead?.dataProximaAcao||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Telefone / WhatsApp do Contato 💬</label>
          <input class="form-control" id="fContato" value="${Utils.escHtml(lead?.contato||'')}" placeholder="(XX) XXXXX-XXXX" oninput="Utils.autoFormatPhone(this)">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Proposta Nº</label>
            <input class="form-control" id="fPropostaNum" value="${Utils.escHtml(lead?.propostaNum||'')}" placeholder="BIK-2026-CTR-XXX">
          </div>
          <div class="form-group">
            <label class="form-label">Motivo de Perda</label>
            <select class="form-control" id="fMotivo">
              <option value="">—</option>
              ${motivos.map(m => `<option value="${m}" ${lead?.motivoPerda===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Serviços de Interesse</label>
          <select class="form-control" id="fServicos" multiple style="height:80px">${servicosOptions}</select>
          <div class="text-xs text-muted mt-1">Segure Ctrl para selecionar múltiplos</div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fObs" rows="3">${Utils.escHtml(lead?.observacoes||'')}</textarea>
        </div>
      `,
      saveCb: () => saveLead(id),
    });
  }

  function saveLead(id) {
    const titulo = document.getElementById('fTitulo').value.trim();
    if (!titulo) { Toast.error('Título obrigatório'); return; }

    const servicos = [...document.getElementById('fServicos').selectedOptions].map(o => o.value);
    const data = {
      titulo,
      status: document.getElementById('fStatus').value,
      clienteId: document.getElementById('fCliente').value,
      segmento: document.getElementById('fSegmento').value,
      valorEstimado: Number(document.getElementById('fValor').value) || 0,
      valorFechado: Number(document.getElementById('fValorFechado').value) || 0,
      responsavel: document.getElementById('fResponsavel').value,
      origemLead: document.getElementById('fOrigem').value,
      decisor: document.getElementById('fDecisor').value,
      proximaAcao: document.getElementById('fProximaAcao').value,
      dataProximaAcao: document.getElementById('fDataAcao').value,
      propostaNum: document.getElementById('fPropostaNum').value,
      motivoPerda: document.getElementById('fMotivo').value,
      contato: document.getElementById('fContato').value,
      servicoInteresse: servicos,
      observacoes: document.getElementById('fObs').value,
    };

    if (id) {
      DB.update('leads', id, data);
      Toast.success('Lead atualizado');
    } else {
      DB.create('leads', data);
      Toast.success('Lead criado');
    }
    Modal.close();
    render();
    App.updateNotifBadge();
  }

  function deleteLead(id) {
    const lead = DB.get('leads', id);
    Utils.confirmDelete(lead?.titulo || 'este lead', () => {
      DB.remove('leads', id);
      Toast.success('Lead removido');
      render();
      App.updateNotifBadge();
    });
  }

  function addNew() { openForm(); }

  return { render, openForm, saveLead, deleteLead, viewLead, addNew, dragStart, dragEnd, dragOver, dragLeave, drop, criarProjeto, criarRecebivel };
})();
