/* ==========================================
   VISITAS TÉCNICAS — registro de campo + RVT
   Cada ida a cliente (visita técnica, levantamento, inspeção, treinamento,
   comissionamento, reunião) vira um registro com hora, km, checklist,
   ocorrências e pendências, e gera o Relatório de Visita Técnica (RVT)
   para imprimir/enviar ao cliente.
   ========================================== */
const Visitas = (() => {

  const TIPOS = {
    visita:        { label: 'Visita técnica',            icon: '🏭' },
    levantamento:  { label: 'Levantamento de campo',     icon: '📐' },
    inspecao:      { label: 'Inspeção / Vistoria',       icon: '🔍' },
    treinamento:   { label: 'Treinamento',               icon: '🎓' },
    comissionamento:{ label: 'Instalação / Comissionamento', icon: '🔧' },
    reuniao:       { label: 'Reunião presencial',        icon: '🤝' },
    entrega:       { label: 'Entrega de documentação',   icon: '📦' },
  };
  const STATUS = {
    agendada:  { label: 'Agendada',  badge: 'badge-blue' },
    realizada: { label: 'Realizada', badge: 'badge-green' },
    cancelada: { label: 'Cancelada', badge: 'badge-gray' },
  };
  // Checklist padrão (o usuário pode apagar/adicionar linhas no formulário)
  const CHECKLIST_PADRAO = [
    'EPIs utilizados (capacete, óculos, botina, protetor auricular)',
    'Registro fotográfico realizado',
    'Responsável do cliente acompanhou a visita',
    'Equipamentos/áreas inspecionados conforme escopo',
    'Não conformidades registradas e comunicadas',
    'Próximos passos alinhados com o cliente',
  ];

  let _filter = { status: '', clienteId: '', tipo: '' };
  let _periodo = 'mes';

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function _ativas() { return DB.getAll('visitas'); }

  function _nextNumero() {
    const ano = new Date().getFullYear();
    const prefix = `VT-${ano}-`;
    const maior = _ativas().reduce((max, v) => {
      const m = String(v.numero || '').startsWith(prefix) ? parseInt(String(v.numero).slice(prefix.length), 10) : 0;
      return isNaN(m) ? max : Math.max(max, m);
    }, 0);
    return prefix + String(maior + 1).padStart(3, '0');
  }

  function _horas(v) {
    if (!v.horaInicio || !v.horaFim) return 0;
    const [h1, m1] = v.horaInicio.split(':').map(Number);
    const [h2, m2] = v.horaFim.split(':').map(Number);
    const min = (h2 * 60 + m2) - (h1 * 60 + m1);
    return min > 0 ? Math.round(min / 6) / 10 : 0;
  }

  function _noPeriodo(v) {
    if (_periodo === 'tudo' || !v.data) return true;
    const hoje = new Date();
    const d = Utils.parseDate(v.data);
    if (!d) return false;
    if (_periodo === 'mes') return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
    if (_periodo === 'trimestre') { const q = Math.floor(hoje.getMonth() / 3); return d.getFullYear() === hoje.getFullYear() && Math.floor(d.getMonth() / 3) === q; }
    if (_periodo === 'ano') return d.getFullYear() === hoje.getFullYear();
    return true;
  }

  /* ── render ──────────────────────────────────────────────────────────── */
  function render() {
    const todas = _ativas();
    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', ano: 'Este Ano', tudo: 'Tudo' };
    const doPeriodo = todas.filter(_noPeriodo);
    const realizadas = doPeriodo.filter(v => v.status === 'realizada');
    const agendadas = todas.filter(v => v.status === 'agendada');
    const proximas = agendadas.filter(v => { const d = Utils.daysUntil(v.data); return d != null && d >= 0; }).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const horas = realizadas.reduce((s, v) => s + _horas(v), 0);
    const km = realizadas.reduce((s, v) => s + (Number(v.km) || 0), 0);
    const comPendencia = todas.filter(v => v.status === 'realizada' && v.pendencias && !v.pendenciasResolvidas);

    let list = [...todas].sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.horaInicio || '').localeCompare(a.horaInicio || ''));
    if (_periodo !== 'tudo') list = list.filter(v => _noPeriodo(v) || v.status === 'agendada');
    if (_filter.status) list = list.filter(v => v.status === _filter.status);
    if (_filter.clienteId) list = list.filter(v => v.clienteId === _filter.clienteId);
    if (_filter.tipo) list = list.filter(v => v.tipo === _filter.tipo);

    const clientes = DB.getAll('clientes');

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Visitas Técnicas</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${Object.entries(periodoLabels).map(([p, l]) => `<button onclick="Visitas.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo === p ? 'background:var(--primary);color:#fff;' : 'background:transparent;color:var(--text-muted);'}">${l}</button>`).join('')}
          </div>
          <button class="btn btn-secondary" onclick="Visitas.exportCSV()">📥 CSV</button>
          <button class="btn btn-primary" onclick="Visitas.openForm()">+ Nova Visita</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card" style="--kpi-color:#1D4F8C">
          <div class="kpi-label">Visitas realizadas <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div>
          <div class="kpi-value">${realizadas.length}</div>
          <div class="kpi-sub">${doPeriodo.length} no período · ${todas.length} no total</div>
          <div class="kpi-icon">🏭</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#0891b2">
          <div class="kpi-label">Horas em campo</div>
          <div class="kpi-value">${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h</div>
          <div class="kpi-sub">${km.toLocaleString('pt-BR')} km rodados</div>
          <div class="kpi-icon">⏱</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f97316;cursor:pointer" onclick="Visitas.setFilter('status','agendada')" title="Ver agendadas">
          <div class="kpi-label">Próximas agendadas</div>
          <div class="kpi-value">${proximas.length}</div>
          <div class="kpi-sub">${proximas[0] ? 'Próxima: ' + Utils.formatDate(proximas[0].data) + ' · ' + Utils.escHtml(Utils.truncate(Utils.getClientName(proximas[0].clienteId), 24)) : 'Nenhuma agendada'}</div>
          <div class="kpi-icon">📅</div>
        </div>
        <div class="kpi-card" style="--kpi-color:${comPendencia.length ? '#C42B2B' : '#059669'}">
          <div class="kpi-label">Pendências em aberto</div>
          <div class="kpi-value">${comPendencia.length}</div>
          <div class="kpi-sub">${comPendencia.length ? 'visitas com pendência não resolvida' : 'Tudo resolvido'}</div>
          <div class="kpi-icon">${comPendencia.length ? '⚠️' : '✅'}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Visitas.setFilter('status',this.value)">
              <option value="">Todos os status</option>
              ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${_filter.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Visitas.setFilter('tipo',this.value)">
              <option value="">Todos os tipos</option>
              ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${_filter.tipo === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Visitas.setFilter('clienteId',this.value)">
              <option value="">Todos os clientes</option>
              ${clientes.map(c => `<option value="${c.id}" ${_filter.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} visita(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon">🏭</div>
              <div class="empty-title">Nenhuma visita ${todas.length ? 'neste filtro' : 'registrada ainda'}</div>
              <div class="empty-sub">Registre cada ida ao cliente: horas, deslocamento, checklist, ocorrências e pendências. No fim, gere o Relatório de Visita Técnica (RVT) em um clique.</div>
              <button class="btn btn-primary mt-4" onclick="Visitas.openForm()">+ Registrar Visita</button>
            </div>` : `
          <table class="tbl">
            <thead><tr>
              <th>Visita</th><th>Cliente</th><th>Tipo</th><th>Data</th><th>Horário</th><th>Técnico</th><th>Km</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${list.map(v => {
                const tipo = TIPOS[v.tipo] || { label: v.tipo || '—', icon: '📌' };
                const st = STATUS[v.status] || STATUS.agendada;
                const dias = Utils.daysUntil(v.data);
                const alerta = v.status === 'agendada' && dias != null ? (dias < 0 ? '<span class="badge badge-red">Atrasada</span>' : dias === 0 ? '<span class="badge badge-yellow">Hoje</span>' : dias <= 3 ? `<span class="badge badge-orange">Em ${dias}d</span>` : '') : '';
                return `<tr>
                  <td><div class="font-bold">${Utils.escHtml(v.numero || '—')}</div><div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(v.objetivo || '', 60))}</div></td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(v.clienteId))}${v.projetoId ? `<div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(DB.get('projetos', v.projetoId)?.titulo || '', 40))}</div>` : ''}</td>
                  <td class="text-sm">${tipo.icon} ${Utils.escHtml(tipo.label)}</td>
                  <td class="text-sm">${Utils.formatDate(v.data)} ${alerta}</td>
                  <td class="text-sm">${v.horaInicio ? Utils.escHtml(v.horaInicio) + (v.horaFim ? '–' + Utils.escHtml(v.horaFim) : '') : '—'}${_horas(v) ? `<div class="text-xs text-muted">${_horas(v)}h</div>` : ''}</td>
                  <td class="text-sm">${Utils.escHtml(v.tecnico || '—')}</td>
                  <td class="text-sm">${v.km ? Number(v.km).toLocaleString('pt-BR') : '—'}</td>
                  <td>${Utils.badge(st.label, st.badge)}${v.pendencias && !v.pendenciasResolvidas && v.status === 'realizada' ? ' <span class="badge badge-red" title="Pendência em aberto">⚠</span>' : ''}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Visitas.view('${v.id}')" title="Ver detalhes">Ver</button>
                      ${v.status === 'agendada' ? `<button class="btn btn-xs btn-success" onclick="Visitas.concluir('${v.id}')" title="Marcar como realizada">✓</button>` : ''}
                      <button class="btn btn-xs btn-secondary" onclick="Visitas.imprimirRVT('${v.id}')" title="Relatório de Visita Técnica">🖨</button>
                      <button class="btn btn-xs btn-secondary" onclick="Visitas.openForm('${v.id}')" title="Editar">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Visitas.deleteVisita('${v.id}')" title="Excluir">🗑</button>
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

  function setFilter(k, v) { _filter[k] = v; render(); }
  function setPeriodo(p) { _periodo = p; render(); }

  /* ── formulário ──────────────────────────────────────────────────────── */
  function openForm(id = null, prefill = {}) {
    const v = id ? DB.get('visitas', id) : null;
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const projetos = DB.getAll('projetos').filter(p => !['concluido', 'cancelado'].includes(p.status));
    const cli = v?.clienteId || prefill.clienteId || '';
    const checklist = v?.checklist?.length ? v.checklist : CHECKLIST_PADRAO.map(t => ({ texto: t, ok: false }));
    const respOpts = (cfg.responsaveis || []).map(r => `<option value="${Utils.escHtml(r)}" ${(v?.tecnico || prefill.tecnico || cfg.usuario?.nome) === r ? 'selected' : ''}>${Utils.escHtml(r)}</option>`).join('');

    Modal.open({
      title: id ? `Editar ${v.numero || 'Visita'}` : 'Nova Visita Técnica',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:0 0 140px">
            <label class="form-label">Nº</label>
            <input class="form-control" id="vtNumero" value="${Utils.escHtml(v?.numero || _nextNumero())}">
          </div>
          <div class="form-group">
            <label class="form-label">Tipo *</label>
            <select class="form-control" id="vtTipo">
              ${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${(v?.tipo || prefill.tipo || 'visita') === k ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="vtStatus">
              ${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${(v?.status || 'agendada') === k ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cliente *</label>
            <select class="form-control" id="vtCliente" onchange="Visitas._filtrarProjetos(this.value)">
              <option value="">Selecionar cliente</option>
              ${clientes.map(c => `<option value="${c.id}" ${cli === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Projeto (opcional)</label>
            <select class="form-control" id="vtProjeto">
              <option value="">— Sem projeto —</option>
              ${projetos.map(p => `<option value="${p.id}" data-cliente="${p.clienteId || ''}" ${(v?.projetoId || prefill.projetoId) === p.id ? 'selected' : ''}>${Utils.escHtml(p.codigo ? p.codigo + ' · ' : '')}${Utils.escHtml(Utils.truncate(p.titulo, 50))}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Data *</label><input class="form-control" id="vtData" type="date" value="${v?.data || prefill.data || Utils.todayStr()}"></div>
          <div class="form-group"><label class="form-label">Início</label><input class="form-control" id="vtHoraIni" type="time" value="${v?.horaInicio || '08:00'}"></div>
          <div class="form-group"><label class="form-label">Fim</label><input class="form-control" id="vtHoraFim" type="time" value="${v?.horaFim || ''}"></div>
          <div class="form-group"><label class="form-label">Km (ida e volta)</label><input class="form-control" id="vtKm" type="text" inputmode="decimal" value="${v?.km ?? ''}" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Técnico responsável</label>
            <select class="form-control" id="vtTecnico">${respOpts}</select>
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Local / Unidade</label>
            <input class="form-control" id="vtLocal" value="${Utils.escHtml(v?.local || '')}" placeholder="Ex.: Planta 2 — Setor de prensas, Londrina/PR">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Objetivo da visita *</label>
          <input class="form-control" id="vtObjetivo" value="${Utils.escHtml(v?.objetivo || prefill.objetivo || '')}" placeholder="Ex.: Levantamento para apreciação de risco NR-12 nas prensas hidráulicas">
        </div>
        <div class="form-group">
          <label class="form-label">Participantes (cliente)</label>
          <input class="form-control" id="vtParticipantes" value="${Utils.escHtml(v?.participantes || '')}" placeholder="Nome e cargo de quem acompanhou">
        </div>

        <div class="form-group">
          <label class="form-label">Checklist de campo</label>
          <div id="vtChecklist">
            ${checklist.map((it, i) => _checklistRow(it, i)).join('')}
          </div>
          <button type="button" class="btn btn-xs btn-secondary mt-2" onclick="Visitas._addChecklistRow()">+ Item</button>
        </div>

        <div class="form-group">
          <label class="form-label">Ocorrências / O que foi constatado</label>
          <textarea class="form-control" id="vtOcorrencias" rows="4" placeholder="Registre o que foi observado, não conformidades, medições, decisões tomadas em campo...">${Utils.escHtml(v?.ocorrencias || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:3">
            <label class="form-label">Pendências / Próximos passos</label>
            <textarea class="form-control" id="vtPendencias" rows="3" placeholder="O que ficou pendente para a Bikows ou para o cliente">${Utils.escHtml(v?.pendencias || '')}</textarea>
          </div>
          <div class="form-group" style="flex:1;justify-content:flex-end">
            <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:22px">
              <input type="checkbox" id="vtPendResolvidas" ${v?.pendenciasResolvidas ? 'checked' : ''}>
              <span class="form-label" style="margin:0">Pendências resolvidas</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Fotos / Evidências (links, um por linha)</label>
          <textarea class="form-control" id="vtFotos" rows="2" placeholder="https://drive.google.com/... (fotos, vídeos, medições)">${Utils.escHtml((v?.fotos || []).join('\n'))}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Aceite do cliente (nome)</label>
            <input class="form-control" id="vtAceite" value="${Utils.escHtml(v?.aceiteNome || '')}" placeholder="Quem validou o relatório no cliente">
          </div>
          <div class="form-group" style="justify-content:flex-end">
            <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:22px">
              <input type="checkbox" id="vtCriarAtividade" ${!id ? 'checked' : ''}>
              <span class="form-label" style="margin:0">Colocar no Calendário (cria atividade)</span>
            </label>
          </div>
        </div>
      `,
      saveCb: () => save(id),
    });
    setTimeout(() => _filtrarProjetos(document.getElementById('vtCliente')?.value), 30);
  }

  function _checklistRow(it, i) {
    return `<div class="parcela-row" style="gap:8px;padding:6px 10px" data-idx="${i}">
      <input type="checkbox" class="vt-chk-ok" ${it.ok ? 'checked' : ''} title="Conforme / feito">
      <input class="form-control vt-chk-txt" style="flex:1;padding:6px 10px" value="${Utils.escHtml(it.texto || '')}" placeholder="Item do checklist">
      <button type="button" class="btn btn-xs btn-ghost" onclick="this.parentElement.remove()" title="Remover">✕</button>
    </div>`;
  }
  function _addChecklistRow() {
    const box = document.getElementById('vtChecklist');
    if (!box) return;
    box.insertAdjacentHTML('beforeend', _checklistRow({ texto: '', ok: false }, box.children.length));
    box.lastElementChild.querySelector('.vt-chk-txt')?.focus();
  }
  function _filtrarProjetos(clienteId) {
    const sel = document.getElementById('vtProjeto');
    if (!sel) return;
    [...sel.options].forEach(o => {
      if (!o.value) return;
      const pertence = !clienteId || o.dataset.cliente === clienteId || !o.dataset.cliente;
      o.hidden = !pertence;
      if (!pertence && o.selected) sel.value = '';
    });
  }

  function _lerChecklist() {
    return [...document.querySelectorAll('#vtChecklist [data-idx], #vtChecklist .parcela-row')].map(row => ({
      texto: row.querySelector('.vt-chk-txt')?.value.trim() || '',
      ok: !!row.querySelector('.vt-chk-ok')?.checked,
    })).filter(it => it.texto);
  }

  function save(id) {
    const clienteId = document.getElementById('vtCliente').value;
    const objetivo = document.getElementById('vtObjetivo').value.trim();
    const data = document.getElementById('vtData').value;
    if (!clienteId) { Toast.error('Selecione o cliente'); return; }
    if (!objetivo) { Toast.error('Informe o objetivo da visita'); return; }
    if (!data) { Toast.error('Informe a data'); return; }
    const horaInicio = document.getElementById('vtHoraIni').value;
    const horaFim = document.getElementById('vtHoraFim').value;
    if (horaInicio && horaFim && horaFim <= horaInicio) { Toast.error('Hora fim deve ser posterior à hora início'); return; }

    const registro = {
      numero: document.getElementById('vtNumero').value.trim() || _nextNumero(),
      tipo: document.getElementById('vtTipo').value,
      status: document.getElementById('vtStatus').value,
      clienteId,
      projetoId: document.getElementById('vtProjeto').value || '',
      data, horaInicio, horaFim,
      km: Utils.parseMoney(document.getElementById('vtKm').value) || 0,
      tecnico: document.getElementById('vtTecnico').value,
      local: document.getElementById('vtLocal').value.trim(),
      objetivo,
      participantes: document.getElementById('vtParticipantes').value.trim(),
      checklist: _lerChecklist(),
      ocorrencias: document.getElementById('vtOcorrencias').value.trim(),
      pendencias: document.getElementById('vtPendencias').value.trim(),
      pendenciasResolvidas: document.getElementById('vtPendResolvidas').checked,
      fotos: document.getElementById('vtFotos').value.split('\n').map(s => s.trim()).filter(Boolean),
      aceiteNome: document.getElementById('vtAceite').value.trim(),
    };
    const criarAtv = document.getElementById('vtCriarAtividade')?.checked;

    let rec;
    if (id) { rec = DB.update('visitas', id, registro); Toast.success('Visita atualizada'); }
    else { rec = DB.create('visitas', registro); Toast.success(`Visita ${registro.numero} registrada`); }

    // Coloca no Calendário como atividade do tipo "visita" (uma vez só)
    if (criarAtv && rec && !rec.atividadeId && registro.status === 'agendada') {
      const atv = DB.create('atividades', {
        tipo: 'visita', titulo: `${registro.numero} — ${Utils.truncate(objetivo, 60)}`,
        descricao: `Visita técnica em ${Utils.getClientName(clienteId)}${registro.local ? ' · ' + registro.local : ''}`,
        data, hora: horaInicio, horaFim, clienteId, projetoId: registro.projetoId,
        responsavel: registro.tecnico, status: 'pendente', prioridade: 'alta', visitaId: rec.id,
      });
      DB.update('visitas', rec.id, { atividadeId: atv.id });
    }
    Modal.close();
    render();
    if (typeof App !== 'undefined') App.updateNotifBadge();
  }

  /* ── ações rápidas ───────────────────────────────────────────────────── */
  function concluir(id) {
    const v = DB.get('visitas', id);
    if (!v) return;
    DB.update('visitas', id, { status: 'realizada', realizadaEm: Utils.todayStr() });
    if (v.atividadeId) { const a = DB.get('atividades', v.atividadeId); if (a && a.status === 'pendente') DB.update('atividades', v.atividadeId, { status: 'concluida', concluidaEm: Utils.todayStr() }); }
    Toast.success('Visita marcada como realizada. Preencha as ocorrências no relatório.');
    render();
    openForm(id);
  }

  function deleteVisita(id) {
    const v = DB.get('visitas', id);
    Utils.confirmDelete(v?.numero || 'esta visita', () => {
      DB.remove('visitas', id);
      render();
    });
  }

  /* ── visualização ────────────────────────────────────────────────────── */
  function view(id) {
    const v = DB.get('visitas', id);
    if (!v) return;
    const tipo = TIPOS[v.tipo] || { label: v.tipo || '—', icon: '📌' };
    const st = STATUS[v.status] || STATUS.agendada;
    const proj = v.projetoId ? DB.get('projetos', v.projetoId) : null;
    const chk = v.checklist || [];
    const feitos = chk.filter(c => c.ok).length;
    Modal.open({
      title: `${tipo.icon} ${v.numero || 'Visita'} — ${Utils.getClientName(v.clienteId)}`,
      size: 'modal-lg',
      body: `
        <div class="flex items-center gap-2 mb-3" style="flex-wrap:wrap">
          ${Utils.badge(st.label, st.badge)}
          <span class="badge badge-gray">${tipo.icon} ${Utils.escHtml(tipo.label)}</span>
          ${v.pendencias && !v.pendenciasResolvidas && v.status === 'realizada' ? '<span class="badge badge-red">⚠ Pendência em aberto</span>' : ''}
          <span style="flex:1"></span>
          <button class="btn btn-sm btn-secondary" onclick="Visitas.imprimirRVT('${v.id}')">🖨 Relatório (RVT)</button>
          <button class="btn btn-sm btn-secondary" onclick="Modal.close();Visitas.openForm('${v.id}')">✏ Editar</button>
        </div>
        <div class="detail-grid">
          <div class="detail-field"><div class="detail-label">Data / Horário</div><div class="detail-value">${Utils.formatDate(v.data)} ${v.horaInicio ? Utils.escHtml(v.horaInicio) + (v.horaFim ? ' – ' + Utils.escHtml(v.horaFim) : '') : ''} ${_horas(v) ? `<span class="text-muted">(${_horas(v)}h)</span>` : ''}</div></div>
          <div class="detail-field"><div class="detail-label">Técnico</div><div class="detail-value">${Utils.escHtml(v.tecnico || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Local</div><div class="detail-value">${Utils.escHtml(v.local || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Deslocamento</div><div class="detail-value">${v.km ? Number(v.km).toLocaleString('pt-BR') + ' km' : '—'}</div></div>
          <div class="detail-field"><div class="detail-label">Projeto</div><div class="detail-value">${proj ? `<a href="#" onclick="event.preventDefault();Modal.close();App.navigate('projetos');setTimeout(()=>Projetos.view('${proj.id}'),200)" style="color:var(--primary)">${Utils.escHtml(proj.titulo)}</a>` : '—'}</div></div>
          <div class="detail-field"><div class="detail-label">Participantes</div><div class="detail-value">${Utils.escHtml(v.participantes || '—')}</div></div>
        </div>
        <div class="divider"></div>
        <div class="detail-label mb-1">Objetivo</div>
        <div class="text-sm mb-3">${Utils.escHtml(v.objetivo || '—')}</div>
        ${chk.length ? `<div class="detail-label mb-1">Checklist (${feitos}/${chk.length})</div>
          <div class="mb-3">${chk.map(c => `<div class="text-sm" style="padding:3px 0">${c.ok ? '✅' : '⬜'} ${Utils.escHtml(c.texto)}</div>`).join('')}</div>` : ''}
        ${v.ocorrencias ? `<div class="detail-label mb-1">Ocorrências</div><div class="text-sm mb-3" style="white-space:pre-wrap">${Utils.escHtml(v.ocorrencias)}</div>` : ''}
        ${v.pendencias ? `<div class="detail-label mb-1">Pendências ${v.pendenciasResolvidas ? '<span class="badge badge-green">resolvidas</span>' : ''}</div><div class="text-sm mb-3" style="white-space:pre-wrap">${Utils.escHtml(v.pendencias)}</div>` : ''}
        ${(v.fotos || []).length ? `<div class="detail-label mb-1">Evidências</div><div class="mb-3">${v.fotos.map(f => `<div class="text-sm"><a href="${Utils.escHtml(f)}" target="_blank" rel="noopener" style="color:var(--primary)">${Utils.escHtml(Utils.truncate(f, 70))}</a></div>`).join('')}</div>` : ''}
        ${v.aceiteNome ? `<div class="text-xs text-muted">Aceite do cliente: <strong>${Utils.escHtml(v.aceiteNome)}</strong></div>` : ''}
        <div class="divider"></div>
        <div class="flex gap-2" style="flex-wrap:wrap">
          ${v.status === 'agendada' ? `<button class="btn btn-sm btn-success" onclick="Modal.close();Visitas.concluir('${v.id}')">✓ Marcar realizada</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="Modal.close();Visitas.criarFollowup('${v.id}')">📋 Criar atividade de follow-up</button>
          ${v.pendencias && !v.pendenciasResolvidas ? `<button class="btn btn-sm btn-secondary" onclick="Visitas.resolverPendencias('${v.id}')">✅ Pendências resolvidas</button>` : ''}
        </div>
      `,
    });
  }

  function resolverPendencias(id) {
    DB.update('visitas', id, { pendenciasResolvidas: true });
    Toast.success('Pendências marcadas como resolvidas');
    Modal.close(); render();
  }

  function criarFollowup(id) {
    const v = DB.get('visitas', id);
    if (!v) return;
    const d = new Date(); d.setDate(d.getDate() + 3);
    DB.create('atividades', {
      tipo: 'followup', titulo: `Follow-up da visita ${v.numero} — ${Utils.getClientName(v.clienteId)}`,
      descricao: v.pendencias || v.objetivo || '', data: Utils.localDateStr(d), hora: '09:00',
      clienteId: v.clienteId, projetoId: v.projetoId || '', responsavel: v.tecnico || '', status: 'pendente', prioridade: 'media', visitaId: v.id,
    });
    Toast.success('Atividade de follow-up criada para daqui a 3 dias');
    if (typeof App !== 'undefined') App.updateNotifBadge();
  }

  /* ── RVT — Relatório de Visita Técnica (impressão) ───────────────────── */
  function imprimirRVT(id) {
    const v = DB.get('visitas', id);
    if (!v) return;
    const cfg = DB.getConfig();
    const cli = DB.get('clientes', v.clienteId);
    const proj = v.projetoId ? DB.get('projetos', v.projetoId) : null;
    const tipo = TIPOS[v.tipo] || { label: v.tipo || '—', icon: '' };
    const E = Utils.escHtml;
    const w = window.open('', '_blank');
    if (!w) { Toast.error('Bloqueador de pop-up impediu abrir o relatório'); return; }
    const chk = (v.checklist || []).map(c => `<tr><td style="width:28px;text-align:center">${c.ok ? '☑' : '☐'}</td><td>${E(c.texto)}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>RVT ${E(v.numero || '')}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0B1B33;margin:0;padding:28px;font-size:13px;line-height:1.5}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1D4F8C;padding-bottom:12px;margin-bottom:18px}
        .empresa{font-size:19px;font-weight:800;color:#1D4F8C}.sub{font-size:12px;color:#4B5563}
        .rvt{text-align:right}.rvt .num{font-size:18px;font-weight:800;color:#1D4F8C}.rvt .lbl{font-size:10px;letter-spacing:1px;color:#6B7280;text-transform:uppercase}
        h3{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:#1D4F8C;border-bottom:1px solid #DCE6F2;padding-bottom:4px;margin:18px 0 8px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px}.f label{display:block;font-size:10px;text-transform:uppercase;color:#6B7280;letter-spacing:.5px}.f div{font-weight:600}
        table{width:100%;border-collapse:collapse}td{padding:4px 6px;border-bottom:1px solid #E5E7EB;vertical-align:top}
        .box{background:#F7F9FB;border:1px solid #E5E7EB;border-radius:6px;padding:10px 12px;white-space:pre-wrap}
        .assin{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}.assin div{border-top:1px solid #0B1B33;padding-top:6px;text-align:center;font-size:12px}
        .footer{margin-top:28px;font-size:10px;color:#9CA3AF;text-align:center}
        @media print{@page{margin:14mm}body{padding:0}}
      </style></head><body>
      <div class="header">
        <div><div class="empresa">${E(cfg.empresa || 'Bikows Engenharia')}</div><div class="sub">${cfg.cnpj ? 'CNPJ ' + E(cfg.cnpj) + ' · ' : ''}${E([cfg.cidade, cfg.estado].filter(Boolean).join('/'))}</div></div>
        <div class="rvt"><div class="lbl">Relatório de Visita Técnica</div><div class="num">${E(v.numero || '—')}</div><div class="sub">${Utils.formatDate(v.data)}</div></div>
      </div>
      <h3>Identificação</h3>
      <div class="grid">
        <div class="f"><label>Cliente</label><div>${E(cli?.nome || '—')}</div></div>
        <div class="f"><label>CNPJ</label><div>${E(cli?.cnpj || '—')}</div></div>
        <div class="f"><label>Local</label><div>${E(v.local || [cli?.cidade, cli?.estado].filter(Boolean).join('/') || '—')}</div></div>
        <div class="f"><label>Projeto / OS</label><div>${E(proj ? (proj.codigo ? proj.codigo + ' · ' : '') + proj.titulo : '—')}</div></div>
        <div class="f"><label>Tipo</label><div>${E(tipo.label)}</div></div>
        <div class="f"><label>Técnico responsável</label><div>${E(v.tecnico || cfg.usuario?.nome || '—')}</div></div>
        <div class="f"><label>Horário</label><div>${E(v.horaInicio || '—')}${v.horaFim ? ' às ' + E(v.horaFim) : ''}${_horas(v) ? ' (' + _horas(v) + 'h)' : ''}</div></div>
        <div class="f"><label>Participantes (cliente)</label><div>${E(v.participantes || '—')}</div></div>
      </div>
      <h3>Objetivo</h3><div class="box">${E(v.objetivo || '—')}</div>
      ${chk ? `<h3>Checklist de campo</h3><table>${chk}</table>` : ''}
      <h3>Ocorrências / Constatações</h3><div class="box">${E(v.ocorrencias || 'Sem ocorrências registradas.')}</div>
      <h3>Pendências e próximos passos</h3><div class="box">${E(v.pendencias || 'Nenhuma pendência.')}${v.pendenciasResolvidas ? '\n\n✔ Pendências resolvidas.' : ''}</div>
      ${(v.fotos || []).length ? `<h3>Evidências</h3><div class="box">${v.fotos.map(f => E(f)).join('\n')}</div>` : ''}
      <div class="assin">
        <div>${E(v.tecnico || cfg.usuario?.nome || '')}<br><span style="color:#6B7280">${E(cfg.empresa || 'Bikows Engenharia')}</span></div>
        <div>${E(v.aceiteNome || '')}<br><span style="color:#6B7280">${E(cli?.nome || 'Cliente')}</span></div>
      </div>
      <div class="footer">Documento gerado pelo CRM Bikows em ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>`);
    w.document.close();
  }

  /* ── exportação ──────────────────────────────────────────────────────── */
  function exportCSV() {
    const rows = [['numero', 'data', 'tipo', 'status', 'cliente', 'projeto', 'tecnico', 'horaInicio', 'horaFim', 'horas', 'km', 'local', 'objetivo', 'pendencias']];
    _ativas().forEach(v => rows.push([v.numero, v.data, TIPOS[v.tipo]?.label || v.tipo, STATUS[v.status]?.label || v.status, Utils.getClientName(v.clienteId), DB.get('projetos', v.projetoId)?.titulo || '', v.tecnico, v.horaInicio, v.horaFim, _horas(v), v.km, v.local, v.objetivo, v.pendencias].map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"')));
    const blob = new Blob(['﻿' + rows.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `visitas-tecnicas-${Utils.todayStr()}.csv`; a.click();
  }

  function addNew() { openForm(); }

  // Usado pelo módulo Equipamentos ("Agendar visita") e outros
  function novaPara(prefill) { openForm(null, prefill || {}); }

  return { render, openForm, save, view, concluir, deleteVisita, setFilter, setPeriodo, imprimirRVT, exportCSV, addNew, novaPara, criarFollowup, resolverPendencias, _addChecklistRow, _filtrarProjetos, TIPOS, STATUS };
})();
