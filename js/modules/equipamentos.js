/* ==========================================
   EQUIPAMENTOS & INSPEÇÕES — controle de recorrência
   Cadastro dos equipamentos de cada cliente (caldeiras, vasos de pressão,
   prensas, linhas de vida...) com a data da última inspeção/laudo e a
   periodicidade legal. O CRM calcula a próxima data, avisa quando está
   vencendo e gera a oportunidade de renovação no Pipeline — é o motor da
   receita recorrente (NR-13 / NR-12) do plano de negócios.
   ========================================== */
const Equipamentos = (() => {

  const TIPOS = {
    caldeira:      { label: 'Caldeira',                   icon: '🔥', norma: 'NR-13', meses: 12 },
    vaso:          { label: 'Vaso de pressão',            icon: '🛢', norma: 'NR-13', meses: 12 },
    tubulacao:     { label: 'Tubulação',                  icon: '🔩', norma: 'NR-13', meses: 12 },
    tanque:        { label: 'Tanque de armazenamento',    icon: '🛢', norma: 'NR-13', meses: 12 },
    maquina:       { label: 'Máquina / Equipamento',      icon: '⚙️', norma: 'NR-12', meses: 12 },
    prensa:        { label: 'Prensa',                     icon: '🏗', norma: 'NR-12', meses: 12 },
    linha_vida:    { label: 'Linha de vida / Ancoragem',  icon: '🧗', norma: 'NR-35', meses: 12 },
    spda:          { label: 'SPDA (para-raios)',          icon: '⚡', norma: 'NBR 5419', meses: 12 },
    eletrica:      { label: 'Instalação elétrica',        icon: '🔌', norma: 'NR-10', meses: 24 },
    outro:         { label: 'Outro',                      icon: '📦', norma: '', meses: 12 },
  };
  const NORMAS = ['NR-13', 'NR-12', 'NR-35', 'NR-10', 'NR-33', 'NBR 5419', 'NBR 16636', 'Outra'];
  const CATEGORIAS_NR13 = ['', 'A', 'B', 'C', 'D', 'E', 'I', 'II', 'III', 'IV', 'V'];

  let _filter = { clienteId: '', norma: '', situacao: '' };

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function _proxima(eq) {
    if (eq.proximaInspecao) return eq.proximaInspecao;
    if (!eq.ultimaInspecao || !eq.periodicidadeMeses) return '';
    const d = Utils.parseDate(eq.ultimaInspecao);
    if (!d) return '';
    d.setMonth(d.getMonth() + Number(eq.periodicidadeMeses));
    return Utils.localDateStr(d);
  }
  // situacao: 'vencida' | 'critica' (≤30d) | 'atencao' (≤90d) | 'em_dia' | 'sem_data'
  function situacao(eq) {
    if (eq.status === 'inativo') return 'inativo';
    const prox = _proxima(eq);
    if (!prox) return 'sem_data';
    const d = Utils.daysUntil(prox);
    if (d < 0) return 'vencida';
    if (d <= 30) return 'critica';
    if (d <= 90) return 'atencao';
    return 'em_dia';
  }
  const SIT = {
    vencida:  { label: 'Vencida',        badge: 'badge-red',    cor: '#C42B2B' },
    critica:  { label: 'Vence ≤ 30d',    badge: 'badge-orange', cor: '#ea580c' },
    atencao:  { label: 'Vence ≤ 90d',    badge: 'badge-yellow', cor: '#d97706' },
    em_dia:   { label: 'Em dia',         badge: 'badge-green',  cor: '#059669' },
    sem_data: { label: 'Sem inspeção',   badge: 'badge-gray',   cor: '#94a3b8' },
    inativo:  { label: 'Inativo',        badge: 'badge-gray',   cor: '#94a3b8' },
  };

  // Usado pelo sino de pendências / Dashboard: vencidas ou vencendo em ≤ N dias
  function getVencendo(dias = 60) {
    return DB.getAll('equipamentos').filter(eq => {
      if (eq.status === 'inativo') return false;
      const prox = _proxima(eq); if (!prox) return false;
      const d = Utils.daysUntil(prox);
      return d != null && d <= dias;
    }).map(eq => ({ ...eq, proximaInspecao: _proxima(eq) }))
      .sort((a, b) => a.proximaInspecao.localeCompare(b.proximaInspecao));
  }

  /* ── render ──────────────────────────────────────────────────────────── */
  function render() {
    const todos = DB.getAll('equipamentos');
    const ativos = todos.filter(e => e.status !== 'inativo');
    const porSit = k => ativos.filter(e => situacao(e) === k);
    const vencidas = porSit('vencida'), criticas = porSit('critica'), atencao = porSit('atencao'), emDia = porSit('em_dia');
    const clientes = DB.getAll('clientes');
    const clientesComEq = new Set(ativos.map(e => e.clienteId)).size;
    const receitaPrevista = ativos.reduce((s, e) => s + (Number(e.valorInspecao) || 0), 0);

    let list = [...todos].sort((a, b) => {
      const pa = _proxima(a) || '9999', pb = _proxima(b) || '9999';
      return pa.localeCompare(pb);
    });
    if (_filter.clienteId) list = list.filter(e => e.clienteId === _filter.clienteId);
    if (_filter.norma) list = list.filter(e => (e.norma || TIPOS[e.tipo]?.norma) === _filter.norma);
    if (_filter.situacao) list = list.filter(e => situacao(e) === _filter.situacao);
    else list = list.filter(e => e.status !== 'inativo');

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Equipamentos & Inspeções</h2>
        <div class="sec-actions">
          <button class="btn btn-secondary" onclick="Equipamentos.gerarOportunidades()" title="Cria no Pipeline uma oportunidade de renovação para cada inspeção vencida ou vencendo em 90 dias que ainda não tenha lead">♻️ Gerar renovações</button>
          <button class="btn btn-secondary" onclick="Equipamentos.exportCSV()">📥 CSV</button>
          <button class="btn btn-primary" onclick="Equipamentos.openForm()">+ Novo Equipamento</button>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">
        <div class="kpi-card" style="--kpi-color:#1D4F8C">
          <div class="kpi-label">Equipamentos ativos</div>
          <div class="kpi-value">${ativos.length}</div>
          <div class="kpi-sub">${clientesComEq} cliente(s) · ${todos.length - ativos.length} inativo(s)</div>
          <div class="kpi-icon">⚙️</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#C42B2B;cursor:pointer" onclick="Equipamentos.setFilter('situacao','vencida')" title="Ver vencidas">
          <div class="kpi-label">Inspeções vencidas</div>
          <div class="kpi-value" style="color:${vencidas.length ? 'var(--danger)' : 'inherit'}">${vencidas.length}</div>
          <div class="kpi-sub">${vencidas.length ? 'cliente em não conformidade' : 'nenhuma vencida'}</div>
          <div class="kpi-icon">🚨</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#ea580c;cursor:pointer" onclick="Equipamentos.setFilter('situacao','critica')" title="Ver ≤30 dias">
          <div class="kpi-label">Vencem em 30 dias</div>
          <div class="kpi-value">${criticas.length}</div>
          <div class="kpi-sub">${atencao.length} em até 90 dias</div>
          <div class="kpi-icon">⏰</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#059669;cursor:pointer" onclick="Equipamentos.setFilter('situacao','em_dia')" title="Ver em dia">
          <div class="kpi-label">Em dia</div>
          <div class="kpi-value">${emDia.length}</div>
          <div class="kpi-sub">${porSit('sem_data').length} sem data de inspeção</div>
          <div class="kpi-icon">✅</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#7c3aed">
          <div class="kpi-label">Receita recorrente/ano</div>
          <div class="kpi-value" style="font-size:19px">${Utils.formatCurrency(receitaPrevista)}</div>
          <div class="kpi-sub">soma do valor de inspeção cadastrado</div>
          <div class="kpi-icon">💰</div>
        </div>
      </div>

      ${(vencidas.length || criticas.length) ? `
      <div class="card mb-4" style="border-left:4px solid var(--danger)">
        <div class="card-body" style="padding:12px 16px">
          <div class="font-bold text-sm mb-2">🚨 Ação comercial: ${vencidas.length + criticas.length} inspeção(ões) vencida(s) ou vencendo em 30 dias</div>
          <div class="text-xs text-muted">Cada uma é uma renovação de contrato. Use <strong>♻️ Gerar renovações</strong> para criar as oportunidades no Pipeline de uma vez, ou clique em ↗ na linha do equipamento.</div>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Equipamentos.setFilter('situacao',this.value)">
              <option value="">Ativos (todas as situações)</option>
              ${Object.entries(SIT).map(([k, s]) => `<option value="${k}" ${_filter.situacao === k ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Equipamentos.setFilter('norma',this.value)">
              <option value="">Todas as normas</option>
              ${NORMAS.map(n => `<option value="${n}" ${_filter.norma === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Equipamentos.setFilter('clienteId',this.value)">
              <option value="">Todos os clientes</option>
              ${clientes.map(c => `<option value="${c.id}" ${_filter.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} equipamento(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon">⚙️</div>
              <div class="empty-title">Nenhum equipamento ${todos.length ? 'neste filtro' : 'cadastrado ainda'}</div>
              <div class="empty-sub">Cadastre caldeiras, vasos de pressão, prensas e linhas de vida dos seus clientes com a data do último laudo. O CRM avisa quando a próxima inspeção estiver chegando e cria a oportunidade de renovação.</div>
              <button class="btn btn-primary mt-4" onclick="Equipamentos.openForm()">+ Cadastrar Equipamento</button>
            </div>` : `
          <table class="tbl">
            <thead><tr>
              <th>Equipamento</th><th>Cliente</th><th>Norma</th><th>Última inspeção</th><th>Periodicidade</th><th>Próxima</th><th>Situação</th><th>Pipeline</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${list.map(eq => {
                const t = TIPOS[eq.tipo] || TIPOS.outro;
                const sit = situacao(eq); const s = SIT[sit];
                const prox = _proxima(eq); const dias = prox ? Utils.daysUntil(prox) : null;
                const lead = eq.leadRenovacaoId ? DB.get('leads', eq.leadRenovacaoId) : null;
                const leadAberto = lead && !['fechado_ganho', 'executado', 'fechado_perdido'].includes(lead.status);
                return `<tr>
                  <td><div class="font-bold">${t.icon} ${Utils.escHtml(eq.tag || eq.descricao || '—')}</div><div class="text-xs text-muted">${Utils.escHtml(t.label)}${eq.categoria ? ' · Cat. ' + Utils.escHtml(eq.categoria) : ''}${eq.local ? ' · ' + Utils.escHtml(Utils.truncate(eq.local, 30)) : ''}</div></td>
                  <td class="text-sm">${Utils.escHtml(Utils.getClientName(eq.clienteId))}</td>
                  <td class="text-sm"><span class="badge badge-blue">${Utils.escHtml(eq.norma || t.norma || '—')}</span></td>
                  <td class="text-sm">${eq.ultimaInspecao ? Utils.formatDate(eq.ultimaInspecao) : '—'}${eq.artNumero ? `<div class="text-xs text-muted">ART ${Utils.escHtml(eq.artNumero)}</div>` : ''}</td>
                  <td class="text-sm">${eq.periodicidadeMeses ? eq.periodicidadeMeses + ' meses' : '—'}</td>
                  <td class="text-sm ${sit === 'vencida' ? 'text-danger font-bold' : ''}">${prox ? Utils.formatDate(prox) : '—'}${dias != null ? `<div class="text-xs" style="color:${s.cor}">${dias < 0 ? Math.abs(dias) + 'd vencida' : dias === 0 ? 'hoje' : 'em ' + dias + 'd'}</div>` : ''}</td>
                  <td>${Utils.badge(s.label, s.badge)}</td>
                  <td>${leadAberto ? `<span class="badge badge-teal" title="Oportunidade de renovação aberta">↗ No pipeline</span>` : (['vencida', 'critica', 'atencao'].includes(sit) ? `<button class="btn btn-xs btn-secondary" onclick="Equipamentos.gerarOportunidade('${eq.id}')" title="Criar oportunidade de renovação no Pipeline">↗ Gerar</button>` : '<span class="text-xs text-muted">—</span>')}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-success" onclick="Equipamentos.registrarInspecao('${eq.id}')" title="Registrar inspeção realizada">📋</button>
                      <button class="btn btn-xs btn-secondary" onclick="Equipamentos.agendarVisita('${eq.id}')" title="Agendar visita técnica">🏭</button>
                      <button class="btn btn-xs btn-secondary" onclick="Equipamentos.openForm('${eq.id}')" title="Editar">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Equipamentos.deleteEq('${eq.id}')" title="Excluir">🗑</button>
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

  /* ── formulário ──────────────────────────────────────────────────────── */
  function openForm(id = null) {
    const eq = id ? DB.get('equipamentos', id) : null;
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const tipoSel = eq?.tipo || 'vaso';
    Modal.open({
      title: id ? 'Editar Equipamento' : 'Novo Equipamento',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cliente *</label>
            <select class="form-control" id="eqCliente">
              <option value="">Selecionar cliente</option>
              ${clientes.map(c => `<option value="${c.id}" ${eq?.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo *</label>
            <select class="form-control" id="eqTipo" onchange="Equipamentos._onTipo(this.value)">
              ${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${tipoSel === k ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">TAG / Identificação *</label>
            <input class="form-control" id="eqTag" value="${Utils.escHtml(eq?.tag || '')}" placeholder="Ex.: CALD-01, VP-102, PRENSA-03">
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Descrição</label>
            <input class="form-control" id="eqDescricao" value="${Utils.escHtml(eq?.descricao || '')}" placeholder="Ex.: Caldeira flamotubular 2 t/h — fabricante, ano">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Norma</label>
            <select class="form-control" id="eqNorma">
              ${NORMAS.map(n => `<option value="${n}" ${(eq?.norma || TIPOS[tipoSel].norma) === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Categoria (NR-13)</label>
            <select class="form-control" id="eqCategoria">
              ${CATEGORIAS_NR13.map(c => `<option value="${c}" ${(eq?.categoria || '') === c ? 'selected' : ''}>${c || '—'}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Local / Setor</label>
            <input class="form-control" id="eqLocal" value="${Utils.escHtml(eq?.local || '')}" placeholder="Casa de caldeiras, Linha 2...">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Última inspeção / laudo</label><input class="form-control" id="eqUltima" type="date" value="${eq?.ultimaInspecao || ''}"></div>
          <div class="form-group"><label class="form-label">Periodicidade (meses) *</label><input class="form-control" id="eqPeriod" type="number" min="1" max="120" value="${eq?.periodicidadeMeses || TIPOS[tipoSel].meses}"></div>
          <div class="form-group"><label class="form-label">Próxima (calculada)</label><input class="form-control" id="eqProxima" type="date" value="${eq?.proximaInspecao || ''}" title="Deixe em branco para calcular pela periodicidade"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">ART do último laudo</label><input class="form-control" id="eqArt" value="${Utils.escHtml(eq?.artNumero || '')}" placeholder="Nº da ART"></div>
          <div class="form-group"><label class="form-label">Valor da inspeção (R$)</label><input class="form-control" id="eqValor" type="text" inputmode="decimal" value="${eq?.valorInspecao ? Utils.moneyToInput(eq.valorInspecao) : ''}" placeholder="Para estimar a renovação"></div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="eqStatus"><option value="ativo" ${(eq?.status || 'ativo') === 'ativo' ? 'selected' : ''}>Ativo</option><option value="inativo" ${eq?.status === 'inativo' ? 'selected' : ''}>Inativo / desativado</option></select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Link do laudo / documentação</label>
          <input class="form-control" id="eqLaudoUrl" value="${Utils.escHtml(eq?.laudoUrl || '')}" placeholder="https://drive.google.com/...">
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="eqObs" rows="2">${Utils.escHtml(eq?.observacoes || '')}</textarea>
        </div>
      `,
      saveCb: () => save(id),
    });
  }

  function _onTipo(tipo) {
    const t = TIPOS[tipo]; if (!t) return;
    const n = document.getElementById('eqNorma'); if (n && t.norma) n.value = t.norma;
    const p = document.getElementById('eqPeriod'); if (p && !p.dataset.touched) p.value = t.meses;
  }

  function save(id) {
    const clienteId = document.getElementById('eqCliente').value;
    const tag = document.getElementById('eqTag').value.trim();
    const periodicidadeMeses = Number(document.getElementById('eqPeriod').value) || 0;
    if (!clienteId) { Toast.error('Selecione o cliente'); return; }
    if (!tag) { Toast.error('Informe a TAG / identificação'); return; }
    if (!periodicidadeMeses) { Toast.error('Informe a periodicidade em meses'); return; }
    const data = {
      clienteId, tag,
      tipo: document.getElementById('eqTipo').value,
      descricao: document.getElementById('eqDescricao').value.trim(),
      norma: document.getElementById('eqNorma').value,
      categoria: document.getElementById('eqCategoria').value,
      local: document.getElementById('eqLocal').value.trim(),
      ultimaInspecao: document.getElementById('eqUltima').value || '',
      periodicidadeMeses,
      proximaInspecao: document.getElementById('eqProxima').value || '',
      artNumero: document.getElementById('eqArt').value.trim(),
      valorInspecao: Utils.parseMoney(document.getElementById('eqValor').value) || 0,
      status: document.getElementById('eqStatus').value,
      laudoUrl: document.getElementById('eqLaudoUrl').value.trim(),
      observacoes: document.getElementById('eqObs').value.trim(),
    };
    if (!data.proximaInspecao) data.proximaInspecao = _proxima(data);
    if (id) { DB.update('equipamentos', id, data); Toast.success('Equipamento atualizado'); }
    else { DB.create('equipamentos', data); Toast.success('Equipamento cadastrado'); }
    Modal.close(); render();
    if (typeof App !== 'undefined') App.updateNotifBadge();
  }

  function deleteEq(id) {
    const eq = DB.get('equipamentos', id);
    Utils.confirmDelete(eq?.tag || 'este equipamento', () => { DB.remove('equipamentos', id); render(); });
  }

  /* ── registrar inspeção realizada ────────────────────────────────────── */
  function registrarInspecao(id) {
    const eq = DB.get('equipamentos', id); if (!eq) return;
    Modal.open({
      title: `📋 Registrar inspeção — ${eq.tag}`,
      body: `
        <div class="text-sm text-muted mb-3">Atualiza a data da última inspeção e recalcula a próxima pela periodicidade (${eq.periodicidadeMeses} meses). O histórico anterior fica guardado.</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Data da inspeção *</label><input class="form-control" id="riData" type="date" value="${Utils.todayStr()}"></div>
          <div class="form-group"><label class="form-label">ART</label><input class="form-control" id="riArt" placeholder="Nº da ART"></div>
        </div>
        <div class="form-group"><label class="form-label">Resultado</label>
          <select class="form-control" id="riResultado"><option value="aprovado">Aprovado / Conforme</option><option value="ressalvas">Aprovado com ressalvas</option><option value="reprovado">Reprovado / Não conforme</option></select>
        </div>
        <div class="form-group"><label class="form-label">Link do laudo</label><input class="form-control" id="riUrl" placeholder="https://..."></div>
        <div class="form-group"><label class="form-label">Observações</label><textarea class="form-control" id="riObs" rows="2"></textarea></div>
      `,
      saveLabel: 'Registrar',
      saveCb: () => {
        const dataInsp = document.getElementById('riData').value;
        if (!dataInsp) { Toast.error('Informe a data'); return; }
        const hist = [...(eq.historico || [])];
        if (eq.ultimaInspecao) hist.unshift({ data: eq.ultimaInspecao, art: eq.artNumero || '', url: eq.laudoUrl || '', resultado: eq.ultimoResultado || '' });
        const novo = {
          ultimaInspecao: dataInsp, artNumero: document.getElementById('riArt').value.trim() || '',
          laudoUrl: document.getElementById('riUrl').value.trim() || '', ultimoResultado: document.getElementById('riResultado').value,
          historico: hist.slice(0, 20), proximaInspecao: '',
        };
        novo.proximaInspecao = _proxima({ ...eq, ...novo });
        // Fecha o lead de renovação vinculado como ganho, se estiver aberto
        if (eq.leadRenovacaoId) {
          const l = DB.get('leads', eq.leadRenovacaoId);
          if (l && !['fechado_ganho', 'executado', 'fechado_perdido'].includes(l.status)) {
            DB.update('leads', l.id, { status: 'fechado_ganho', dataMudancaStatus: Utils.todayStr(), valorFechado: Number(l.valorFechado) || Number(l.valorEstimado) || 0 });
          }
          novo.leadRenovacaoId = '';
        }
        const obs = document.getElementById('riObs').value.trim();
        if (obs) novo.observacoes = ((eq.observacoes ? eq.observacoes + '\n' : '') + Utils.formatDate(dataInsp) + ': ' + obs);
        DB.update('equipamentos', id, novo);
        Toast.success(`Inspeção registrada. Próxima: ${Utils.formatDate(novo.proximaInspecao)}`);
        Modal.close(); render();
        if (typeof App !== 'undefined') { App.updateNotifBadge(); App.refreshIfNeeded('leads'); }
      },
    });
  }

  /* ── oportunidade de renovação no Pipeline ───────────────────────────── */
  function _criarLead(eq) {
    const t = TIPOS[eq.tipo] || TIPOS.outro;
    const prox = _proxima(eq);
    let dataAcao = Utils.todayStr();
    if (prox) { const d = Utils.parseDate(prox); d.setDate(d.getDate() - 45); if (d > new Date()) dataAcao = Utils.localDateStr(d); }
    const lead = DB.create('leads', {
      titulo: `Inspeção ${eq.norma || t.norma || ''} — ${eq.tag} — ${Utils.getClientName(eq.clienteId)}`.replace(/\s+/g, ' '),
      clienteId: eq.clienteId, status: 'lead_identificado', origemLead: 'Recorrência',
      dataEntrada: Utils.todayStr(), valorEstimado: Number(eq.valorInspecao) || 0,
      servicoInteresse: [eq.norma || t.norma].filter(Boolean),
      proximaAcao: `Oferecer renovação da inspeção (vence em ${Utils.formatDate(prox)})`, dataProximaAcao: dataAcao,
      observacoes: `Gerado automaticamente pelo controle de Equipamentos & Inspeções.\nEquipamento: ${t.label} ${eq.tag}${eq.descricao ? ' — ' + eq.descricao : ''}\nÚltima inspeção: ${eq.ultimaInspecao ? Utils.formatDate(eq.ultimaInspecao) : '—'} · Próxima: ${Utils.formatDate(prox)}`,
      equipamentoId: eq.id,
    });
    DB.update('equipamentos', eq.id, { leadRenovacaoId: lead.id });
    return lead;
  }
  function gerarOportunidade(id) {
    const eq = DB.get('equipamentos', id); if (!eq) return;
    const existente = eq.leadRenovacaoId ? DB.get('leads', eq.leadRenovacaoId) : null;
    if (existente && !['fechado_ganho', 'executado', 'fechado_perdido'].includes(existente.status)) { Toast.warning('Já existe uma oportunidade aberta para este equipamento'); return; }
    const lead = _criarLead(eq);
    Toast.success(`Oportunidade criada no Pipeline: ${Utils.truncate(lead.titulo, 50)}`);
    render();
    if (typeof App !== 'undefined') { App.updateNotifBadge(); App.refreshIfNeeded('leads'); }
  }
  function gerarOportunidades() {
    const alvo = DB.getAll('equipamentos').filter(eq => ['vencida', 'critica', 'atencao'].includes(situacao(eq))).filter(eq => {
      const l = eq.leadRenovacaoId ? DB.get('leads', eq.leadRenovacaoId) : null;
      return !(l && !['fechado_ganho', 'executado', 'fechado_perdido'].includes(l.status));
    });
    if (!alvo.length) { Toast.success('Nenhuma renovação pendente — todas já estão no Pipeline ou em dia.'); return; }
    Confirm.show('Gerar renovações', `Criar ${alvo.length} oportunidade(s) de renovação no Pipeline comercial (origem Recorrência)?`, () => {
      alvo.forEach(_criarLead);
      Toast.success(`${alvo.length} oportunidade(s) criada(s) no Pipeline`);
      render();
      if (typeof App !== 'undefined') { App.updateNotifBadge(); App.refreshIfNeeded('leads'); }
    });
  }

  function agendarVisita(id) {
    const eq = DB.get('equipamentos', id); if (!eq) return;
    if (typeof Visitas === 'undefined') return;
    const t = TIPOS[eq.tipo] || TIPOS.outro;
    Visitas.novaPara({ clienteId: eq.clienteId, tipo: 'inspecao', objetivo: `Inspeção ${eq.norma || t.norma || ''} — ${t.label} ${eq.tag}`.replace(/\s+/g, ' ') });
  }

  function exportCSV() {
    const rows = [['tag', 'tipo', 'descricao', 'cliente', 'norma', 'categoria', 'local', 'ultimaInspecao', 'periodicidadeMeses', 'proximaInspecao', 'situacao', 'art', 'valorInspecao', 'status']];
    DB.getAll('equipamentos').forEach(e => rows.push([e.tag, TIPOS[e.tipo]?.label || e.tipo, e.descricao, Utils.getClientName(e.clienteId), e.norma, e.categoria, e.local, e.ultimaInspecao, e.periodicidadeMeses, _proxima(e), SIT[situacao(e)]?.label, e.artNumero, e.valorInspecao, e.status].map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"')));
    const blob = new Blob(['﻿' + rows.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `equipamentos-inspecoes-${Utils.todayStr()}.csv`; a.click();
  }

  function addNew() { openForm(); }

  return { render, openForm, save, deleteEq, setFilter, registrarInspecao, gerarOportunidade, gerarOportunidades, agendarVisita, exportCSV, addNew, getVencendo, situacao, _onTipo, TIPOS, SIT };
})();
