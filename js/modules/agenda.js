/* ==========================================
   AGENDA PESSOAL — rotina semanal (Marcos)
   Cronograma recorrente por dia da semana: trabalho,
   treino, alimentação, descanso, deslocamento etc.
   Uso individual — não confundir com Calendário (eventos
   pontuais do CRM) nem Meu Financeiro (dinheiro pessoal).
   ========================================== */
const Agenda = (() => {

  const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const DIAS_CURTO = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  // Ordem de exibição: Segunda → Domingo (semana de trabalho primeiro)
  const ORDEM_EXIBICAO = [1,2,3,4,5,6,0];

  const CATEGORIAS = {
    trabalho:     { label: 'Trabalho',        icon: '💼', cor: '#1D4F8C' },
    treino:       { label: 'Treino',          icon: '🏋️', cor: '#10b981' },
    alimentacao:  { label: 'Alimentação',     icon: '🍽️', cor: '#f97316' },
    descanso:     { label: 'Descanso/Sono',   icon: '😴', cor: '#7c3aed' },
    deslocamento: { label: 'Deslocamento',    icon: '🚗', cor: '#C42B2B' },
    externo:      { label: 'Dia Externo',     icon: '📍', cor: '#8B2222' },
    estudo:       { label: 'Estudo/Skill',    icon: '📚', cor: '#d97706' },
    pessoal:      { label: 'Pessoal/Família', icon: '👨‍👩‍👧', cor: '#0891b2' },
    outro:        { label: 'Outro',           icon: '📌', cor: '#64748b' },
  };

  let _diaFiltro = null; // null = semana toda; 0-6 = filtra um dia (mobile)

  /* ---- Helpers ---- */
  function _minutos(hhmm) {
    if (!hhmm) return 0;
    const [h,m] = hhmm.split(':').map(Number);
    return h*60 + (m||0);
  }
  function _duracaoLabel(ini, fim) {
    let mi = _minutos(ini), mf = _minutos(fim);
    if (mf < mi) mf += 24*60; // atravessa a meia-noite (ex: 23:00–06:00)
    const total = mf - mi;
    const h = Math.floor(total/60), m = total%60;
    return h > 0 && m > 0 ? `${h}h${m}min` : h > 0 ? `${h}h` : `${m}min`;
  }

  function _blocosDoDia(dia) {
    return DB.getAll('agenda_pessoal')
      .filter(b => (b.diasSemana||[]).includes(dia))
      .sort((a,b) => _minutos(a.horaInicio) - _minutos(b.horaInicio));
  }

  /* ---- Render principal ---- */
  function render() {
    const todos = DB.getAll('agenda_pessoal');
    const diasParaExibir = _diaFiltro != null ? [_diaFiltro] : ORDEM_EXIBICAO;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Agenda Pessoal</h2>
        <div class="sec-actions">
          <button class="btn btn-primary btn-sm" onclick="Agenda.novoBloco()">+ Novo Bloco</button>
        </div>
      </div>

      ${_renderResumo(todos)}

      <!-- Seletor de dia (mobile) -->
      <div class="sec-actions mb-3" style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px">
        <button class="tab-btn ${_diaFiltro===null?'active':''}" onclick="Agenda.setDiaFiltro(null)">Semana</button>
        ${ORDEM_EXIBICAO.map(d => `<button class="tab-btn ${_diaFiltro===d?'active':''}" onclick="Agenda.setDiaFiltro(${d})">${DIAS_CURTO[d]}</button>`).join('')}
      </div>

      <div class="agenda-grid" style="display:grid;grid-template-columns:repeat(${diasParaExibir.length},1fr);gap:10px">
        ${diasParaExibir.map(dia => _renderColunaDia(dia)).join('')}
      </div>

      <div class="card mt-4">
        <div class="card-header"><div class="card-title">🎨 Categorias</div></div>
        <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap">
          ${Object.entries(CATEGORIAS).map(([k,c]) => `
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text)">
              <span style="width:10px;height:10px;border-radius:50%;background:${c.cor};display:inline-block"></span>
              ${c.icon} ${c.label}
            </span>`).join('')}
        </div>
      </div>
    `;
  }

  function setDiaFiltro(d) { _diaFiltro = d; render(); }

  /* ---- Resumo semanal (horas por categoria) ---- */
  function _renderResumo(todos) {
    const totais = {};
    Object.keys(CATEGORIAS).forEach(k => totais[k] = 0);
    todos.forEach(b => {
      const qtdDias = (b.diasSemana||[]).length;
      let mi = _minutos(b.horaInicio), mf = _minutos(b.horaFim);
      if (mf < mi) mf += 24*60;
      const horas = (mf - mi) / 60;
      totais[b.categoria] = (totais[b.categoria]||0) + horas * qtdDias;
    });
    const principais = ['trabalho','treino','descanso','alimentacao'];
    return `
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
        ${principais.map(k => {
          const c = CATEGORIAS[k];
          return `<div class="kpi-card" style="--kpi-color:${c.cor}">
            <div class="kpi-label">${c.icon} ${c.label}/semana</div>
            <div class="kpi-value" style="font-size:20px">${totais[k].toFixed(1)}h</div>
            <div class="kpi-icon">${c.icon}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  /* ---- Coluna de um dia ---- */
  function _renderColunaDia(dia) {
    const blocos = _blocosDoDia(dia);
    const hoje = new Date().getDay() === dia;
    const diaExterno = blocos.some(b => b.categoria === 'externo');

    return `
      <div class="card" style="min-width:0;${hoje?'border-color:var(--primary);box-shadow:0 0 0 2px rgba(29,79,140,.12)':''}">
        <div class="card-header" style="flex-direction:column;align-items:flex-start;gap:2px;padding:10px 12px;${hoje?'background:var(--primary-light)':''}">
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
            <span class="font-bold text-sm">${DIAS[dia]}${hoje?' <span class="badge badge-blue" style="font-size:9px">Hoje</span>':''}</span>
            <button class="btn btn-xs btn-ghost" onclick="Agenda.novoBloco(${dia})" title="Adicionar bloco neste dia">+</button>
          </div>
          ${diaExterno ? `<span class="badge" style="background:${CATEGORIAS.externo.cor}20;color:${CATEGORIAS.externo.cor};font-size:9px">📍 Dia Externo</span>` : ''}
        </div>
        <div class="card-body" style="padding:8px;display:flex;flex-direction:column;gap:6px;min-height:80px">
          ${blocos.length === 0
            ? `<div class="text-xs text-muted" style="text-align:center;padding:16px 4px">Sem blocos</div>`
            : blocos.map(b => _renderBloco(b, dia)).join('')}
        </div>
      </div>`;
  }

  function _renderBloco(b, diaContexto) {
    const cat = CATEGORIAS[b.categoria] || CATEGORIAS.outro;
    return `
      <div onclick="Agenda.editarBloco('${b.id}')"
        style="cursor:pointer;border-left:3px solid ${cat.cor};background:${cat.cor}12;border-radius:6px;padding:6px 8px;transition:var(--t)"
        onmouseover="this.style.background='${cat.cor}22'" onmouseout="this.style.background='${cat.cor}12'">
        <div style="font-size:11px;font-weight:700;color:${cat.cor}">${b.horaInicio}–${b.horaFim}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.3">${cat.icon} ${Utils.escHtml(b.titulo)}</div>
        <div style="font-size:10px;color:var(--text-muted)">${_duracaoLabel(b.horaInicio,b.horaFim)}${(b.diasSemana||[]).length>1?` · ${b.diasSemana.length}x/sem`:''}</div>
      </div>`;
  }

  /* ---- CRUD ---- */
  function novoBloco(diaPreSelecionado) { _openForm(null, diaPreSelecionado); }
  function editarBloco(id) { _openForm(id); }

  function _openForm(id, diaPreSelecionado) {
    const b = id ? DB.get('agenda_pessoal', id) : null;
    const diasSel = b?.diasSemana || (diaPreSelecionado != null ? [diaPreSelecionado] : []);

    Modal.open({
      title: id ? 'Editar Bloco' : '+ Novo Bloco da Rotina',
      body: `
        <div class="form-group"><label class="form-label">Título *</label>
          <input class="form-control" id="agTitulo" value="${Utils.escHtml(b?.titulo||'')}" placeholder="Ex: Academia, Almoço, Atendimento clientes"></div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Categoria</label>
            <select class="form-control" id="agCategoria">
              ${Object.entries(CATEGORIAS).map(([k,c]) => `<option value="${k}" ${(b?.categoria||'trabalho')===k?'selected':''}>${c.icon} ${c.label}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Início</label>
            <input class="form-control" id="agInicio" type="time" value="${b?.horaInicio||'08:00'}"></div>
          <div class="form-group"><label class="form-label">Fim</label>
            <input class="form-control" id="agFim" type="time" value="${b?.horaFim||'09:00'}"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Dias da semana</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${ORDEM_EXIBICAO.map(d => `
              <label style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer">
                <input type="checkbox" class="ag-dia-chk" value="${d}" ${diasSel.includes(d)?'checked':''} style="width:16px;height:16px;accent-color:var(--primary)">
                <span style="font-size:10px;color:var(--text-muted)">${DIAS_CURTO[d]}</span>
              </label>`).join('')}
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button type="button" class="btn btn-xs btn-secondary" onclick="Agenda._marcarDias([1,2,3,4,5])">Seg–Sex</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="Agenda._marcarDias([0,6])">Fim de semana</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="Agenda._marcarDias([0,1,2,3,4,5,6])">Todos os dias</button>
          </div>
        </div>

        <div class="form-group"><label class="form-label">Notas</label>
          <textarea class="form-control" id="agNotas" rows="2" placeholder="Detalhes, local, observações...">${Utils.escHtml(b?.notas||'')}</textarea></div>
        ${id ? `<button type="button" class="btn btn-sm btn-danger" style="width:100%" onclick="Agenda.excluirBloco('${id}')">🗑 Excluir bloco</button>` : ''}
      `,
      saveCb: () => _salvar(id),
    });
  }

  function _marcarDias(dias) {
    document.querySelectorAll('.ag-dia-chk').forEach(chk => {
      chk.checked = dias.includes(Number(chk.value));
    });
  }

  function _salvar(id) {
    const titulo = document.getElementById('agTitulo').value.trim();
    if (!titulo) { Toast.error('Título obrigatório'); return; }
    const horaInicio = document.getElementById('agInicio').value;
    const horaFim = document.getElementById('agFim').value;
    if (!horaInicio || !horaFim) { Toast.error('Informe início e fim'); return; }
    const diasSemana = [...document.querySelectorAll('.ag-dia-chk:checked')].map(c => Number(c.value));
    if (diasSemana.length === 0) { Toast.error('Selecione ao menos um dia da semana'); return; }

    const dados = {
      titulo,
      categoria: document.getElementById('agCategoria').value,
      horaInicio, horaFim,
      diasSemana,
      notas: document.getElementById('agNotas').value,
    };
    if (id) { DB.update('agenda_pessoal', id, dados); Toast.success('Bloco atualizado'); }
    else    { DB.create('agenda_pessoal', dados); Toast.success('Bloco criado'); }
    Modal.close();
    render();
  }

  function excluirBloco(id) {
    const b = DB.get('agenda_pessoal', id);
    Modal.close();
    Utils.confirmDelete(b?.titulo || 'este bloco', () => {
      DB.remove('agenda_pessoal', id);
      Toast.success('Removido');
      render();
    });
  }

  function addNew() { novoBloco(); }

  return { render, setDiaFiltro, novoBloco, editarBloco, excluirBloco, _marcarDias, addNew };
})();
