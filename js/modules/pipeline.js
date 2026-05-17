/* ==========================================
   PIPELINE — Kanban CRM com drag & drop
   ========================================== */
const Pipeline = (() => {

  const STAGES = [
    { key: 'lead_identificado',   label: '🔵 Lead Identificado',      color: '#64748b', prob: 5  },
    { key: 'primeiro_contato',    label: '📞 Primeiro Contato',       color: '#3b82f6', prob: 10 },
    { key: 'qualificacao',        label: '🔍 Qualificação',           color: '#8b5cf6', prob: 25 },
    { key: 'proposta_elaboracao', label: '📋 Proposta em Elaboração', color: '#f59e0b', prob: 40 },
    { key: 'proposta_enviada',    label: '📤 Proposta Enviada',       color: '#f97316', prob: 55 },
    { key: 'negociacao',          label: '🤝 Negociação',             color: '#eab308', prob: 75 },
    { key: 'fechado_ganho',       label: '✅ Fechado / Ganho',        color: '#10b981', prob: 100 },
    { key: 'fechado_perdido',     label: '❌ Fechado / Perdido',      color: '#ef4444', prob: 0  },
  ];

  // Dias sem atualização para considerar lead frio
  const DIAS_FRIO = 7;

  let dragId = null;

  /* ---- Detecção de lead frio ---- */
  function _diasSemAtualizacao(lead) {
    const ref = lead.updatedAt || lead.createdAt;
    if (!ref) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const d = new Date(ref); d.setHours(0,0,0,0);
    return Math.round((hoje - d) / 86400000);
  }

  function _isLeadFrio(lead) {
    if (['fechado_ganho','fechado_perdido'].includes(lead.status)) return false;
    const diasSemAtualizar = _diasSemAtualizacao(lead);
    if (diasSemAtualizar !== null && diasSemAtualizar >= DIAS_FRIO) return true;
    // Também considera frio se dataProximaAcao passou há mais de 3 dias sem update
    if (lead.dataProximaAcao) {
      const diasAcao = Utils.daysUntil(lead.dataProximaAcao);
      if (diasAcao !== null && diasAcao < -3) return true;
    }
    return false;
  }

  /* ---- Receita ponderada (valor × probabilidade por etapa) ---- */
  function _receitaPonderada(leads) {
    return leads
      .filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status))
      .reduce((sum, l) => {
        const stage = STAGES.find(s => s.key === l.status);
        const prob = (stage?.prob || 0) / 100;
        return sum + (l.valorEstimado || 0) * prob;
      }, 0);
  }

  /* ---- Criação automática de atividade de follow-up ---- */
  function criarFollowupAutomatico(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    // Verificar se já existe atividade pendente de follow-up para este lead
    const jaExiste = DB.getAll('atividades').some(a =>
      a.leadId === leadId &&
      a.status === 'pendente' &&
      a.tipo === 'call' &&
      a.titulo?.includes('Follow-up automático')
    );
    if (jaExiste) return;
    // Criar atividade de follow-up para amanhã
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const amanhaStr = amanha.toISOString().split('T')[0];
    DB.create('atividades', {
      titulo: `🧊 Follow-up automático — ${lead.titulo}`,
      tipo: 'call',
      prioridade: 'alta',
      status: 'pendente',
      data: amanhaStr,
      hora: '09:00',
      responsavel: lead.responsavel || '',
      clienteId: lead.clienteId || '',
      leadId: leadId,
      descricao: `Lead frio: sem atualização há ${DIAS_FRIO}+ dias. Retomar contato.`,
    });
    Toast.warning(`🧊 Lead frio detectado! Atividade de follow-up criada para "${lead.titulo}".`, 5000);
  }

  /* ---- Verificar leads frios e criar atividades ---- */
  function _checkLeadsFrios() {
    const leads = DB.getAll('leads').filter(l => _isLeadFrio(l));
    leads.forEach(l => criarFollowupAutomatico(l.id));
  }

  function render() {
    const leads = DB.getAll('leads');
    const config = DB.getConfig();

    const ativos = leads.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
    const ganhos = leads.filter(l => l.status === 'fechado_ganho');
    const totalPipeline = Utils.sum(ativos, 'valorEstimado');
    const receitaPond = _receitaPonderada(leads);
    const taxa = leads.length ? ((ganhos.length / leads.length)*100).toFixed(0) : 0;
    const frios = ativos.filter(l => _isLeadFrio(l)).length;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Pipeline CRM</h2>
        <div class="sec-actions">
          <select class="filter-select" id="filterResp" onchange="Pipeline.render()">
            <option value="">Todos os responsáveis</option>
            ${config.responsaveis.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <button class="btn btn-secondary" onclick="Pipeline.listaLeadsFrios()" title="Ver leads frios">🧊 ${frios} Frios</button>
          <button class="btn btn-primary" onclick="Pipeline.openForm()">+ Novo Lead</button>
        </div>
      </div>

      <div class="pipeline-summary mb-4">
        <div class="pipeline-stage">
          <div class="ps-label">Total em Pipeline</div>
          <div class="ps-value">${Utils.formatCurrency(totalPipeline)}</div>
          <div class="ps-count">${ativos.length} oportunidades abertas</div>
        </div>
        <div class="pipeline-stage" title="Receita esperada = valor × probabilidade por etapa">
          <div class="ps-label">Receita Esperada 🎯</div>
          <div class="ps-value" style="color:var(--success)">${Utils.formatCurrency(receitaPond)}</div>
          <div class="ps-count">previsão realista ponderada</div>
        </div>
        <div class="pipeline-stage">
          <div class="ps-label">Fechado / Ganho</div>
          <div class="ps-value">${Utils.formatCurrency(Utils.sum(ganhos,'valorFechado'))}</div>
          <div class="ps-count">${ganhos.length} negócios</div>
        </div>
        <div class="pipeline-stage">
          <div class="ps-label">Taxa de Conversão</div>
          <div class="ps-value">${taxa}%</div>
          <div class="ps-count">${leads.filter(l=>l.status==='fechado_perdido').length} perdidos ${frios > 0 ? `· <span style="color:#f59e0b">🧊 ${frios} frios</span>` : ''}</div>
        </div>
      </div>

      ${_renderProbabilidadeLegend()}

      <div class="kanban-wrap">
        <div class="kanban-board" id="kanbanBoard">
          ${STAGES.map(s => renderColumn(s, leads)).join('')}
        </div>
      </div>
    `;

    initDragDrop();
    // Verificar leads frios ao abrir o pipeline
    setTimeout(() => _checkLeadsFrios(), 300);
  }

  function _renderProbabilidadeLegend() {
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <span class="text-xs text-muted">Probabilidade por etapa:</span>
      ${STAGES.filter(s => !['fechado_ganho','fechado_perdido'].includes(s.key)).map(s =>
        `<span style="font-size:11px;background:${s.color}22;color:${s.color};padding:2px 8px;border-radius:99px;border:1px solid ${s.color}44">${s.label.split(' ')[1]||s.label.split(' ')[0]} ${s.prob}%</span>`
      ).join('')}
    </div>`;
  }

  function renderColumn(stage, allLeads) {
    const filterResp = document.getElementById('filterResp')?.value || '';
    let leads = allLeads.filter(l => l.status === stage.key);
    if (filterResp) leads = leads.filter(l => l.responsavel === filterResp);
    const total = Utils.sum(leads, 'valorEstimado');
    const ponderado = leads.reduce((s,l) => s + (l.valorEstimado||0) * (stage.prob/100), 0);

    return `<div class="kanban-col" data-stage="${stage.key}">
      <div class="kanban-col-header">
        <div class="kanban-col-title" style="color:${stage.color}">${stage.label}</div>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="text-xs text-muted">${stage.prob}%</span>
          <div class="kanban-col-count">${leads.length}</div>
        </div>
      </div>
      ${total > 0 ? `<div class="text-xs text-muted mb-1 text-center">${Utils.formatCurrency(total)}</div>` : ''}
      ${ponderado > 0 && stage.prob < 100 && stage.prob > 0 ? `<div class="text-xs mb-2 text-center" style="color:var(--success)">↳ ${Utils.formatCurrency(ponderado)} esperado</div>` : ''}
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
    const frio = _isLeadFrio(lead);
    const diasSemAtualizar = _diasSemAtualizacao(lead);
    const proposta = _getPropostaLead(lead.id);
    const propBadge = proposta
      ? `<div style="margin:3px 0;display:flex;align-items:center;gap:4px">
           <span style="font-size:10px;background:${Utils.PROP_STATUS[proposta.status]?.badge==='badge-green'?'#dcfce7':'#eff6ff'};color:${proposta.status==='aprovada'?'#16a34a':'#1d4ed8'};padding:1px 6px;border-radius:99px;font-weight:600">
             📄 ${Utils.escHtml(proposta.numero||'Proposta')} · ${Utils.PROP_STATUS[proposta.status]?.label||proposta.status}
           </span>
         </div>`
      : (['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status)
          ? `<div style="font-size:10px;color:var(--text-muted);margin:3px 0">📄 Sem proposta vinculada</div>`
          : '');

    return `<div class="kanban-card ${frio ? 'lead-frio' : ''}" draggable="true" data-id="${lead.id}"
      style="--card-color:${color}"
      ondragstart="Pipeline.dragStart(event,'${lead.id}')"
      ondragend="Pipeline.dragEnd(event)">
      <div class="kc-name">
        ${frio ? `<span title="Lead frio: ${diasSemAtualizar}d sem atualização" style="cursor:help">🧊</span> ` : ''}${Utils.escHtml(lead.titulo)}
      </div>
      <div class="kc-empresa">🏢 ${Utils.escHtml(empresa)}</div>
      <div class="kc-valor">${Utils.formatCurrency(lead.valorEstimado)}</div>
      ${propBadge}
      ${frio ? `<div style="font-size:10px;color:#f59e0b;margin-bottom:4px">⚠ ${diasSemAtualizar}d sem atualização</div>` : ''}
      <div class="kc-footer">
        <span class="text-xs ${dateClass}">
          ${lead.dataProximaAcao ? '📅 ' + Utils.formatDate(lead.dataProximaAcao) : ''}
          ${alert}
        </span>
        <span class="text-xs text-muted">${lead.responsavel || ''}</span>
      </div>
      <div class="kc-actions">
        <button class="btn btn-xs btn-secondary" onclick="Pipeline.viewLead('${lead.id}')">Ver</button>
        ${proposta
          ? `<button class="btn btn-xs btn-secondary" onclick="Modal.close();Propostas.view('${proposta.id}')" title="Ver proposta">📄</button>`
          : (['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status)
              ? `<button class="btn btn-xs btn-secondary" onclick="Pipeline.criarPropostaLead('${lead.id}')" title="Criar proposta">📄+</button>`
              : '')}
        ${lead.status === 'fechado_ganho' ? `<button class="btn btn-xs btn-primary" onclick="Pipeline.abrirContratoLead('${lead.id}')" title="Fechar contrato">🤝</button>` : ''}
        ${lead.contato ? `<button class="btn btn-xs btn-success" style="background:#25D366;border-color:#25D366" onclick="Utils.openWhatsApp('${Utils.escHtml(lead.contato)}')" title="WhatsApp">💬</button>` : ''}
        ${frio ? `<button class="btn btn-xs btn-warning" onclick="Pipeline.criarFollowupAutomatico('${lead.id}')" title="Criar follow-up">🔔</button>` : ''}
        <button class="btn btn-xs btn-secondary" onclick="Pipeline.openForm('${lead.id}')">✏</button>
        <button class="btn btn-xs btn-danger" onclick="Pipeline.deleteLead('${lead.id}')">🗑</button>
      </div>
    </div>`;
  }

  function listaLeadsFrios() {
    const frios = DB.getAll('leads').filter(l => _isLeadFrio(l));
    if (!frios.length) { Toast.success('Nenhum lead frio no momento! 🎉'); return; }

    Modal.open({
      title: `🧊 Leads Frios — ${frios.length} leads`,
      size: 'modal-lg',
      body: `
        <div style="margin-bottom:12px;padding:10px;background:#fef3c7;border-radius:var(--radius);border-left:3px solid #f59e0b">
          <div class="text-sm">Leads sem atualização há <strong>${DIAS_FRIO}+ dias</strong>. Reative o contato para não perder o negócio.</div>
        </div>
        <table class="tbl">
          <thead><tr><th>Lead</th><th>Cliente</th><th>Valor</th><th>Etapa</th><th>Sem atualizar</th><th>Ações</th></tr></thead>
          <tbody>
            ${frios.map(l => {
              const stage = STAGES.find(s => s.key === l.status);
              const dias = _diasSemAtualizacao(l);
              return `<tr>
                <td class="font-bold text-sm">${Utils.escHtml(l.titulo)}</td>
                <td class="text-sm">${Utils.escHtml(Utils.getClientName(l.clienteId))}</td>
                <td class="text-sm font-bold">${Utils.formatCurrency(l.valorEstimado)}</td>
                <td><span style="font-size:11px;color:${stage?.color}">${stage?.label||l.status}</span></td>
                <td><span class="badge badge-yellow">${dias}d</span></td>
                <td>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-xs btn-primary" onclick="Modal.close();Pipeline.openForm('${l.id}')">Atualizar</button>
                    <button class="btn btn-xs btn-warning" onclick="Pipeline.criarFollowupAutomatico('${l.id}');this.disabled=true;this.textContent='✓ Criado'">🔔 Follow-up</button>
                    ${l.contato ? `<button class="btn btn-xs btn-success" style="background:#25D366;border-color:#25D366" onclick="Utils.openWhatsApp('${Utils.escHtml(l.contato)}')">💬</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `,
      saveLabel: null,
    });
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
    const leadId = dragId;
    DB.update('leads', leadId, { status: newStatus });
    Toast.success('Lead movido para ' + Utils.LEAD_STATUS[newStatus]?.label);
    render();
    App.updateNotifBadge();

    // Hook: ao mover para Fechado/Ganho → inicia fluxo de contratação
    if (newStatus === 'fechado_ganho') {
      setTimeout(() => _promptContratacao(leadId), 350);
    }
    // Hook: ao entrar em Proposta em Elaboração → sugere criar proposta
    if (newStatus === 'proposta_elaboracao') {
      setTimeout(() => _sugerirCriarProposta(leadId), 350);
    }
  }

  function viewLead(id) {
    const lead = DB.get('leads', id);
    if (!lead) return;
    const client = DB.get('clientes', lead.clienteId);
    const stage = STAGES.find(s => s.key === lead.status);
    const servicos = (lead.servicoInteresse || []).join(', ');
    const dias = Utils.daysUntil(lead.dataProximaAcao);
    const diasLabel = dias == null ? '—' : dias < 0 ? `⚠ Atrasado ${Math.abs(dias)}d` : dias === 0 ? 'Hoje' : `Em ${dias} dias`;
    const frio = _isLeadFrio(lead);
    const prob = stage?.prob || 0;
    const receitaEsperada = (lead.valorEstimado || 0) * (prob / 100);

    Modal.open({
      title: lead.titulo,
      size: 'modal-lg',
      body: `
        ${frio ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:var(--radius);padding:10px;margin-bottom:16px">
          🧊 <strong>Lead frio!</strong> Sem atualização há ${_diasSemAtualizacao(lead)} dias. Reative o contato.
        </div>` : ''}
        <div class="detail-grid mb-4">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(client?.nome || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Status</div><div class="detail-value">${Utils.leadBadge(lead.status)}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Estimado</div><div class="detail-value font-bold text-primary">${Utils.formatCurrency(lead.valorEstimado)}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Fechado</div><div class="detail-value">${Utils.formatCurrency(lead.valorFechado)}</div></div>
          <div class="detail-field"><div class="detail-label">Probabilidade</div><div class="detail-value"><span style="color:${stage?.color};font-weight:700">${prob}%</span> → <strong>${Utils.formatCurrency(receitaEsperada)}</strong> esperado</div></div>
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
        <!-- PROPOSTA VINCULADA -->
        ${(() => {
          const prop = _getPropostaLead(lead.id);
          if (prop) {
            return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin:12px 0;border-left:3px solid var(--primary)">
              <div class="text-xs text-muted mb-1">📄 Proposta Vinculada</div>
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-bold text-sm">${Utils.escHtml(prop.numero||'—')} · ${Utils.escHtml(prop.titulo)}</div>
                  <div class="text-xs text-muted">${Utils.formatCurrency(prop.valor)} · ${Utils.PROP_STATUS[prop.status]?.label||prop.status}</div>
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-xs btn-secondary" onclick="Modal.close();Propostas.view('${prop.id}')">📄 Ver</button>
                  <button class="btn btn-xs btn-secondary" onclick="Modal.close();Propostas.openForm('${prop.id}')">✏ Editar</button>
                  ${prop.status !== 'aprovada' ? `<button class="btn btn-xs btn-primary" onclick="Modal.close();Propostas.changeStatus('${prop.id}','aprovada')">🤝 Fechar</button>` : ''}
                </div>
              </div>
            </div>`;
          } else if (['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status)) {
            return `<div style="background:#fef9c3;border-radius:var(--radius);padding:10px 14px;margin:12px 0;font-size:13px;color:#854d0e">
              📄 Nenhuma proposta vinculada a este lead.
              <button class="btn btn-xs btn-secondary" style="margin-left:8px" onclick="Modal.close();Pipeline.criarPropostaLead('${lead.id}')">+ Criar Proposta</button>
            </div>`;
          }
          return '';
        })()}

        <div class="mt-4 flex gap-2" style="flex-wrap:wrap">
          ${lead.status === 'fechado_ganho' ? `<button class="btn btn-success btn-sm" onclick="Modal.close();Pipeline.abrirContratoLead('${id}')">🤝 Fechar Contrato</button>` : ''}
          ${['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status) && !_getPropostaLead(lead.id) ? `<button class="btn btn-secondary btn-sm" onclick="Modal.close();Pipeline.criarPropostaLead('${id}')">📄 Criar Proposta</button>` : ''}
          ${frio ? `<button class="btn btn-warning btn-sm" onclick="Pipeline.criarFollowupAutomatico('${lead.id}');Modal.close()">🔔 Criar Follow-up</button>` : ''}
          ${lead.contato ? `<button class="btn btn-sm" style="background:#25D366;border-color:#25D366;color:#fff" onclick="Utils.openWhatsApp('${Utils.escHtml(lead.contato)}','Olá ${Utils.escHtml(lead.decisor||'')}! Sou da Bikows Engenharia. Gostaria de falar sobre ${Utils.escHtml(lead.titulo)}.')">💬 WhatsApp</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Pipeline.openForm('${id}')">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  /* ====================================================
     INTEGRAÇÃO PROPOSTA ↔ PIPELINE
     ==================================================== */

  // Encontra proposta vinculada ao lead (por leadId na proposta ou propostaId no lead)
  function _getPropostaLead(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return null;
    return DB.getAll('propostas').find(p =>
      p.leadId === leadId || (lead.propostaId && p.id === lead.propostaId)
    ) || null;
  }

  // Cria proposta a partir do lead e vincula os dois
  function criarPropostaLead(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const nextNum = 'BIK-' + new Date().getFullYear() + '-CTR-' + String(DB.getAll('propostas').length + 1).padStart(3,'0');
    const proposta = DB.create('propostas', {
      numero: nextNum,
      titulo: lead.titulo,
      clienteId: lead.clienteId,
      responsavel: lead.responsavel,
      valor: lead.valorEstimado || 0,
      status: 'elaboracao',
      leadId,
      itens: [],
      versoes: [],
    });
    // Vincula no lead
    DB.update('leads', leadId, { propostaId: proposta.id, propostaNum: proposta.numero });
    Toast.success(`Proposta ${proposta.numero} criada e vinculada ao lead!`);
    render();
    // Abre o form da proposta para preencher detalhes
    setTimeout(() => Propostas.openForm(proposta.id), 300);
  }

  // Abre o fluxo completo de fechamento de contrato para um lead
  function abrirContratoLead(leadId) {
    const proposta = _getPropostaLead(leadId);
    if (proposta) {
      // Já tem proposta → usa o fluxo de fechamento dela
      Propostas.abrirFluxoContratacao(proposta.id);
    } else {
      // Sem proposta → cria uma rascunho e já abre o fechamento
      const lead = DB.get('leads', leadId);
      if (!lead) return;
      Modal.open({
        title: '🤝 Fechar Contrato',
        size: 'modal-sm',
        body: `
          <p class="text-sm mb-3">Este lead não tem proposta vinculada.</p>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn btn-primary" onclick="Modal.close();Pipeline.criarPropostaLead('${leadId}')">
              📄 Criar proposta primeiro e depois fechar
            </button>
            <button class="btn btn-secondary" onclick="Modal.close();Pipeline._fecharSemProposta('${leadId}')">
              ⚡ Fechar contrato diretamente (sem proposta)
            </button>
          </div>
        `,
        saveLabel: null,
        cancelLabel: 'Cancelar',
      });
    }
  }

  // Fecha contrato direto (sem proposta prévia) — cria uma rascunho internamente
  function _fecharSemProposta(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const nextNum = 'BIK-' + new Date().getFullYear() + '-CTR-' + String(DB.getAll('propostas').length + 1).padStart(3,'0');
    const proposta = DB.create('propostas', {
      numero: nextNum,
      titulo: lead.titulo,
      clienteId: lead.clienteId,
      responsavel: lead.responsavel,
      valor: lead.valorFechado || lead.valorEstimado || 0,
      status: 'elaboracao',
      leadId,
      itens: [],
      versoes: [],
    });
    DB.update('leads', leadId, { propostaId: proposta.id, propostaNum: proposta.numero });
    Propostas.abrirFluxoContratacao(proposta.id);
  }

  // Prompt ao arrastar lead para "Fechado/Ganho"
  function _promptContratacao(leadId) {
    const lead = DB.get('leads', leadId);
    const proposta = _getPropostaLead(leadId);
    const propInfo = proposta
      ? `Proposta vinculada: <strong>${Utils.escHtml(proposta.numero)} · ${Utils.formatCurrency(proposta.valor)}</strong>`
      : 'Nenhuma proposta vinculada ainda.';

    Modal.open({
      title: '🎉 Negócio Ganho! Iniciar Contratação?',
      size: 'modal-sm',
      body: `
        <div style="text-align:center;padding:10px 0 16px">
          <div style="font-size:40px;margin-bottom:8px">🎉</div>
          <div class="font-bold" style="font-size:16px">${Utils.escHtml(lead?.titulo||'')}</div>
          <div class="text-sm text-muted mt-1">${propInfo}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary" onclick="Modal.close();Pipeline.abrirContratoLead('${leadId}')">
            🤝 Abrir fluxo de contratação
          </button>
          <button class="btn btn-secondary" onclick="Modal.close()">
            Fazer depois
          </button>
        </div>
      `,
      saveLabel: null,
      cancelLabel: null,
    });
  }

  // Sugere criar proposta ao entrar em "Proposta em Elaboração"
  function _sugerirCriarProposta(leadId) {
    const proposta = _getPropostaLead(leadId);
    if (proposta) return; // já tem proposta
    const lead = DB.get('leads', leadId);
    Toast.info(
      `📄 Lead "<strong>${Utils.escHtml(lead?.titulo||'')}</strong>" entrou em elaboração de proposta. ` +
      `<a href="#" onclick="Pipeline.criarPropostaLead('${leadId}');return false;" style="color:var(--primary);font-weight:600">` +
      `Criar proposta agora →</a>`,
      8000
    );
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
    const stageOptions = STAGES.map(s => `<option value="${s.key}" ${st === s.key ? 'selected' : ''}>${s.label} (${s.prob}%)</option>`).join('');
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
            <label class="form-label">Status / Etapa</label>
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
            <label class="form-label">Próxima Ação *</label>
            <input class="form-control" id="fProximaAcao" value="${Utils.escHtml(lead?.proximaAcao||'')}" placeholder="O que fazer?">
          </div>
          <div class="form-group">
            <label class="form-label">Data da Próxima Ação *</label>
            <input class="form-control" id="fDataAcao" type="date" value="${lead?.dataProximaAcao||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Telefone / WhatsApp do Contato 💬</label>
          <input class="form-control" id="fContato" value="${Utils.escHtml(lead?.contato||'')}" placeholder="(XX) XXXXX-XXXX" oninput="Utils.autoFormatPhone(this)">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Proposta Vinculada</label>
            ${(() => {
              const props = DB.getAll('propostas').filter(p => !p.clienteId || p.clienteId === (lead?.clienteId||''));
              const opts = props.map(p => `<option value="${p.id}" ${(lead?.propostaId===p.id)?'selected':''}>${Utils.escHtml(p.numero||'—')} · ${Utils.escHtml(p.titulo)} (${Utils.PROP_STATUS[p.status]?.label||p.status})</option>`).join('');
              return `<select class="form-control" id="fPropostaId">
                <option value="">— Nenhuma / Criar depois</option>
                ${opts}
              </select>
              <input type="hidden" id="fPropostaNum" value="${Utils.escHtml(lead?.propostaNum||'')}">`;
            })()}
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
      propostaId: document.getElementById('fPropostaId')?.value || lead?.propostaId || null,
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

  return {
    render, openForm, saveLead, deleteLead, viewLead, addNew,
    dragStart, dragEnd, dragOver, dragLeave, drop,
    criarProjeto, criarRecebivel, criarFollowupAutomatico, listaLeadsFrios,
    criarPropostaLead, abrirContratoLead, _fecharSemProposta,
  };
})();
