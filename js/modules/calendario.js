/* ==========================================
   CALENDÁRIO — Visão mensal de eventos do CRM
   ========================================== */
const Calendario = (() => {

  const now = new Date();
  let _year  = now.getFullYear();
  let _month = now.getMonth(); // 0-indexed

  // ── Helpers de localização ─────────────────────────────────────────────────

  const MESES_PT = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  function labelMesAno(year, month) {
    return `${MESES_PT[month]} ${year}`;
  }

  // Returns "YYYY-MM-DD" for a given Date object
  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Event collection ───────────────────────────────────────────────────────

  /*
   * Returns an object keyed by "YYYY-MM-DD" where each value is an array of
   * event descriptors:
   *   { type, label, color, bg, entityId, entityType }
   */
  function buildEventMap(year, month) {
    const map = {};

    function addEvent(dateStr, event) {
      if (!dateStr) return;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(event);
    }

    // ── Atividades ────────────────────────────────────────────────────────
    DB.getAll('atividades').forEach(a => {
      if (!a.data) return;
      const tipo = (Utils.ATIV_TIPO && Utils.ATIV_TIPO[a.tipo]) || { icon: '📌', label: a.tipo || 'Atividade' };
      addEvent(a.data, {
        type: 'atividade',
        label: `${tipo.icon} ${Utils.escHtml(a.titulo || 'Atividade')}`,
        color: '#fff',
        bg: '#7c3aed',
        entityId: a.id,
        entityType: 'atividades',
        raw: a,
      });
    });

    // ── Leads — próxima ação (follow-up) ──────────────────────────────────
    DB.getAll('leads').forEach(l => {
      if (!l.dataProximaAcao) return;
      if (['fechado_ganho','fechado_perdido'].includes(l.status)) return;
      addEvent(l.dataProximaAcao, {
        type: 'followup',
        label: `🔵 ${Utils.escHtml(l.titulo || 'Lead')}`,
        color: '#fff',
        bg: '#2563eb',
        entityId: l.id,
        entityType: 'leads',
        raw: l,
      });
    });

    // ── Propostas — vencimento ────────────────────────────────────────────
    DB.getAll('propostas').forEach(p => {
      if (!p.validade) return;
      if (['aprovada','reprovada','cancelada'].includes(p.status)) return;
      addEvent(p.validade, {
        type: 'proposta',
        label: `📄 ${Utils.escHtml(p.titulo || p.numero || 'Proposta')}`,
        color: '#fff',
        bg: '#ea580c',
        entityId: p.id,
        entityType: 'propostas',
        raw: p,
      });
    });

    // ── Recebíveis — parcelas ─────────────────────────────────────────────
    DB.getAll('recebiveis').forEach(r => {
      (r.parcelas || []).forEach(parc => {
        if (!parc.vencimento) return;
        if (parc.status === 'recebido') return;
        const overdue = Utils.isOverdue(parc.vencimento);
        const nearDue = !overdue && Utils.daysUntil(parc.vencimento) <= 3;
        addEvent(parc.vencimento, {
          type: 'parcela',
          label: `💰 ${Utils.escHtml(r.descricao || 'Parcela')} — ${Utils.formatCurrency(parc.valor)}`,
          color: '#fff',
          bg: overdue ? '#dc2626' : nearDue ? '#d97706' : '#f59e0b',
          entityId: r.id,
          entityType: 'recebiveis',
          raw: { ...parc, descricao: r.descricao, clienteId: r.clienteId },
        });
      });
    });

    // ── Projetos — prazo ──────────────────────────────────────────────────
    DB.getAll('projetos').forEach(p => {
      if (!p.prazo) return;
      if (['concluido','cancelado'].includes(p.status)) return;
      addEvent(p.prazo, {
        type: 'projeto',
        label: `🏗 ${Utils.escHtml(p.titulo || p.codigo || 'Projeto')}`,
        color: '#fff',
        bg: '#059669',
        entityId: p.id,
        entityType: 'projetos',
        raw: p,
      });
    });

    return map;
  }

  // ── KPI calculations ───────────────────────────────────────────────────────

  function calcKpis(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const firstStr = toDateStr(firstDay);
    const lastStr  = toDateStr(lastDay);

    function inMonth(dateStr) {
      return dateStr && dateStr >= firstStr && dateStr <= lastStr;
    }

    let totalEventos = 0;
    let pendentes = 0;
    let vencidos = 0;

    // atividades
    DB.getAll('atividades').forEach(a => {
      if (inMonth(a.data)) totalEventos++;
      if (a.status === 'pendente' && inMonth(a.data)) pendentes++;
      if (a.status === 'pendente' && Utils.isOverdue(a.data) && inMonth(a.data)) vencidos++;
    });

    // follow-ups
    DB.getAll('leads').forEach(l => {
      if (!['fechado_ganho','fechado_perdido'].includes(l.status) && inMonth(l.dataProximaAcao)) totalEventos++;
    });

    // propostas
    DB.getAll('propostas').forEach(p => {
      if (!['aprovada','reprovada','cancelada'].includes(p.status) && inMonth(p.validade)) totalEventos++;
      if (!['aprovada','reprovada','cancelada'].includes(p.status) && Utils.isOverdue(p.validade)) vencidos++;
    });

    // parcelas
    DB.getAll('recebiveis').forEach(r => {
      (r.parcelas || []).forEach(parc => {
        if (parc.status !== 'recebido' && inMonth(parc.vencimento)) {
          totalEventos++;
          if (Utils.isOverdue(parc.vencimento)) vencidos++;
        }
      });
    });

    // projetos
    DB.getAll('projetos').forEach(p => {
      if (!['concluido','cancelado'].includes(p.status) && inMonth(p.prazo)) totalEventos++;
    });

    return { totalEventos, pendentes, vencidos };
  }

  // ── Day detail modal ───────────────────────────────────────────────────────

  function openDayDetail(dateStr, events) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateLabel = new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const rows = events.map(ev => {
      const clienteNome = ev.raw && ev.raw.clienteId
        ? Utils.escHtml(Utils.getClientName ? Utils.getClientName(ev.raw.clienteId) : ev.raw.clienteId)
        : '';
      const typeLabels = {
        atividade: 'Atividade',
        followup:  'Follow-up',
        proposta:  'Venc. Proposta',
        parcela:   'Parcela',
        projeto:   'Prazo Projeto',
      };
      const typeBadge = typeLabels[ev.type] || ev.type;

      let actionBtn = '';
      if (ev.type === 'atividade') {
        actionBtn = `<button class="btn btn-sm btn-secondary" onclick="Atividades.openForm('${ev.entityId}');Modal.close()">✏ Editar</button>`;
      } else if (ev.type === 'followup') {
        actionBtn = `<button class="btn btn-sm btn-secondary" onclick="App.navigate('pipeline');Modal.close()">→ Pipeline</button>`;
      } else if (ev.type === 'proposta') {
        actionBtn = `<button class="btn btn-sm btn-secondary" onclick="App.navigate('propostas');Modal.close()">→ Propostas</button>`;
      } else if (ev.type === 'parcela') {
        actionBtn = `<button class="btn btn-sm btn-secondary" onclick="App.navigate('financeiro');Modal.close()">→ Financeiro</button>`;
      } else if (ev.type === 'projeto') {
        actionBtn = `<button class="btn btn-sm btn-secondary" onclick="App.navigate('projetos');Modal.close()">→ Projetos</button>`;
      }

      return `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="width:10px;height:10px;border-radius:50%;background:${ev.bg};margin-top:5px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="text-sm font-bold" style="word-break:break-word">${ev.label}</span>
              <span class="badge badge-gray text-xs">${typeBadge}</span>
            </div>
            ${clienteNome ? `<div class="text-xs text-muted mt-1">Cliente: ${clienteNome}</div>` : ''}
            ${ev.raw && ev.raw.hora ? `<div class="text-xs text-muted">Horário: ${ev.raw.hora}</div>` : ''}
            ${ev.raw && ev.raw.status ? `<div class="text-xs text-muted">Status: ${Utils.escHtml(ev.raw.status)}</div>` : ''}
            ${ev.raw && ev.raw.valor !== undefined && ev.type !== 'parcela' ? `<div class="text-xs text-muted">Valor: ${Utils.formatCurrency(ev.raw.valor)}</div>` : ''}
          </div>
          <div style="flex-shrink:0">${actionBtn}</div>
        </div>`;
    }).join('');

    Modal.open({
      title: `📅 ${dateLabel}`,
      size: 'md',
      body: `
        <div style="max-height:60vh;overflow-y:auto">
          ${events.length === 0
            ? `<div style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum evento neste dia.</div>`
            : rows}
        </div>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="Atividades.openForm();Modal.close()">+ Nova Atividade</button>
        </div>
      `,
    });
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderChip(ev) {
    return `<div
      style="font-size:11px;padding:1px 5px;border-radius:4px;margin-bottom:2px;cursor:pointer;
             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
             background:${ev.bg};color:${ev.color};max-width:100%"
      title="${ev.label}"
    >${ev.label}</div>`;
  }

  function renderDayCell(dateStr, events, isCurrentMonth, isToday) {
    const dayNum = parseInt(dateStr.split('-')[2], 10);
    const borderStyle = isToday
      ? 'border:2px solid var(--primary)'
      : 'border:1px solid var(--border)';
    const opacityStyle = isCurrentMonth ? '' : 'opacity:0.4';
    const bgStyle = isToday ? 'background:var(--primary-light, #eff6ff)' : 'background:var(--surface)';
    const MAX_VISIBLE = 3;
    const visible = events.slice(0, MAX_VISIBLE);
    const overflow = events.length - MAX_VISIBLE;

    const chipsHtml = visible.map(ev => renderChip(ev)).join('');
    const overflowHtml = overflow > 0
      ? `<div style="font-size:10px;color:var(--text-muted);cursor:pointer;padding:1px 4px"
           onclick="Calendario._openDay('${dateStr}')">+${overflow} mais</div>`
      : '';

    const clickHandler = events.length > 0
      ? `onclick="Calendario._openDay('${dateStr}')"`
      : `onclick="Calendario._openDay('${dateStr}')"`;

    return `
      <div ${clickHandler}
        style="min-height:100px;padding:6px;border-radius:8px;${bgStyle};${borderStyle};${opacityStyle};
               cursor:pointer;transition:box-shadow 0.15s"
        onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'"
        onmouseout="this.style.boxShadow='none'"
      >
        <div style="font-size:12px;font-weight:${isToday ? '700' : '500'};
                    color:${isToday ? 'var(--primary)' : 'var(--text)'};
                    margin-bottom:4px">${dayNum}</div>
        ${chipsHtml}
        ${overflowHtml}
      </div>`;
  }

  function renderCalendarGrid(year, month, eventMap) {
    const todayStr = Utils.todayStr();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth  = new Date(year, month + 1, 0);
    const startDow = firstOfMonth.getDay(); // 0=Sun
    const totalDays = lastOfMonth.getDate();

    // Header row: day-of-week labels
    const headerCells = DIAS_PT.map(d =>
      `<div style="text-align:center;font-size:12px;font-weight:600;color:var(--text-muted);padding:4px 0">${d}</div>`
    ).join('');

    // Leading empty cells from previous month
    const prevMonthDate = new Date(year, month, 0); // last day of previous month
    const prevMonthTotal = prevMonthDate.getDate();
    const leadingCells = [];
    for (let i = startDow - 1; i >= 0; i--) {
      const dayNum = prevMonthTotal - i;
      const d = new Date(year, month - 1, dayNum);
      const dateStr = toDateStr(d);
      leadingCells.push(renderDayCell(dateStr, eventMap[dateStr] || [], false, false));
    }

    // Current month cells
    const currentCells = [];
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const dateStr = toDateStr(d);
      const isToday = dateStr === todayStr;
      currentCells.push(renderDayCell(dateStr, eventMap[dateStr] || [], true, isToday));
    }

    // Trailing cells from next month
    const totalCells = leadingCells.length + currentCells.length;
    const trailingCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const trailingCells = [];
    for (let day = 1; day <= trailingCount; day++) {
      const d = new Date(year, month + 1, day);
      const dateStr = toDateStr(d);
      trailingCells.push(renderDayCell(dateStr, eventMap[dateStr] || [], false, false));
    }

    const allCells = [...leadingCells, ...currentCells, ...trailingCells].join('');

    return `
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px">
        ${headerCells}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
        ${allCells}
      </div>`;
  }

  function renderLegend() {
    const items = [
      { bg: '#7c3aed', label: 'Atividade' },
      { bg: '#2563eb', label: 'Follow-up' },
      { bg: '#ea580c', label: 'Venc. Proposta' },
      { bg: '#dc2626', label: 'Parcela Vencida' },
      { bg: '#d97706', label: 'Parcela ≤3 dias' },
      { bg: '#f59e0b', label: 'Parcela a vencer' },
      { bg: '#059669', label: 'Prazo Projeto' },
    ];
    const chips = items.map(it =>
      `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:12px;color:var(--text)">
        <span style="width:10px;height:10px;border-radius:50%;background:${it.bg};display:inline-block"></span>
        ${it.label}
      </span>`
    ).join('');
    return `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;
                  padding:10px 14px;background:var(--surface);border:1px solid var(--border);
                  border-radius:8px;margin-bottom:16px">
        <span class="text-xs text-muted font-bold" style="margin-right:8px">Legenda:</span>
        ${chips}
      </div>`;
  }

  function renderKpis(year, month) {
    const { totalEventos, pendentes, vencidos } = calcKpis(year, month);
    return `
      <div class="kpi-grid" style="margin-bottom:16px">
        <div class="kpi-card" style="--kpi-color:#2563eb">
          <div class="kpi-label">Eventos no Mês</div>
          <div class="kpi-value">${totalEventos}</div>
          <div class="kpi-sub">${labelMesAno(year, month)}</div>
          <div class="kpi-icon">📅</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f59e0b">
          <div class="kpi-label">Atividades Pendentes</div>
          <div class="kpi-value">${pendentes}</div>
          <div class="kpi-sub">no mês atual</div>
          <div class="kpi-icon">⏳</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#dc2626">
          <div class="kpi-label">Itens Vencidos</div>
          <div class="kpi-value">${vencidos}</div>
          <div class="kpi-sub">requerem atenção</div>
          <div class="kpi-icon">🚨</div>
        </div>
      </div>`;
  }

  // ── Public: render ─────────────────────────────────────────────────────────

  function render() {
    const eventMap = buildEventMap(_year, _month);
    const kpisHtml = renderKpis(_year, _month);
    const legendHtml = renderLegend();
    const gridHtml = renderCalendarGrid(_year, _month, eventMap);
    const mesAno = labelMesAno(_year, _month);
    const todayStr = Utils.todayStr();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const isCurrentMonth = _year === ty && _month === (tm - 1);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Calendário</h2>
        <div class="sec-actions">
          <button class="btn btn-primary btn-sm" onclick="Calendario.addNew()">+ Nova Atividade</button>
        </div>
      </div>

      ${kpisHtml}
      ${legendHtml}

      <!-- Navigation bar -->
      <div class="card mb-4">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="Calendario.prevMonth()" title="Mês anterior">&#8592;</button>
            <span class="font-bold" style="font-size:16px;min-width:160px;text-align:center">${mesAno}</span>
            <button class="btn btn-ghost btn-sm" onclick="Calendario.nextMonth()" title="Próximo mês">&#8594;</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${!isCurrentMonth
              ? `<button class="btn btn-secondary btn-sm" onclick="Calendario.goToday()">Hoje</button>`
              : `<span class="badge badge-blue text-xs">Mês atual</span>`
            }
            <span class="text-xs text-muted">${Object.values(eventMap).reduce((s, arr) => s + arr.length, 0)} eventos</span>
          </div>
        </div>
        <div class="card-body" style="padding:12px">
          ${gridHtml}
        </div>
      </div>
    `;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prevMonth() {
    _month--;
    if (_month < 0) { _month = 11; _year--; }
    render();
  }

  function nextMonth() {
    _month++;
    if (_month > 11) { _month = 0; _year++; }
    render();
  }

  function goToday() {
    const n = new Date();
    _year  = n.getFullYear();
    _month = n.getMonth();
    render();
  }

  // ── Day click (exposed globally for inline onclick) ────────────────────────

  function _openDay(dateStr) {
    const eventMap = buildEventMap(_year, _month);
    // also include events from adjacent months that are visible in the grid
    const events = eventMap[dateStr] || [];
    openDayDetail(dateStr, events);
  }

  // ── addNew ─────────────────────────────────────────────────────────────────

  function addNew() {
    Atividades.openForm();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { render, prevMonth, nextMonth, goToday, addNew, _openDay };
})();
