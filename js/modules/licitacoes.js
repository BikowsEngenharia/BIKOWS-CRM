/* ==========================================
   LICITAÃ‡Ã•ES â€” Controle de processos licitatÃ³rios
   ========================================== */
const Licitacoes = (() => {

  /* â”€â”€ DomÃ­nios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  const MODALIDADES = [
    'PregÃ£o EletrÃ´nico', 'PregÃ£o Presencial', 'ConcorrÃªncia', 'Tomada de PreÃ§os',
    'Convite', 'Dispensa de LicitaÃ§Ã£o', 'Inexigibilidade', 'RDC', 'Chamamento PÃºblico', 'Outro',
  ];

  const PORTAIS = [
    'Comprasnet (PNCP)', 'BLL', 'BEC-SP', 'Licitanet', 'Portal TransparÃªncia PR',
    'Portal TransparÃªncia SC', 'Portal TransparÃªncia SP', 'Portal TransparÃªncia MG',
    'ComprasRS', 'Outro',
  ];

  const STATUS = {
    identificada:        { label: 'ðŸ” Identificada',          badge: 'badge-gray',   color: '#64748b', desc: 'Edital encontrado, em anÃ¡lise inicial' },
    em_analise:          { label: 'ðŸ“‹ Em AnÃ¡lise',            badge: 'badge-blue',   color: '#3b82f6', desc: 'Avaliando viabilidade tÃ©cnica e financeira' },
    habilitacao:         { label: 'ðŸ“ HabilitaÃ§Ã£o',           badge: 'badge-purple', color: '#7c3aed', desc: 'Preparando documentaÃ§Ã£o de habilitaÃ§Ã£o' },
    proposta_preparando: { label: 'ðŸ“ Preparando Proposta',   badge: 'badge-yellow', color: '#d97706', desc: 'Elaborando proposta tÃ©cnica e de preÃ§os' },
    proposta_enviada:    { label: 'ðŸ“¤ Proposta Enviada',      badge: 'badge-orange', color: '#ea580c', desc: 'Proposta submetida, aguardando sessÃ£o' },
    sessao_realizada:    { label: 'ðŸ› SessÃ£o Realizada',      badge: 'badge-blue',   color: '#0891b2', desc: 'SessÃ£o pÃºblica realizada, aguardando resultado' },
    recurso:             { label: 'âš– Em Recurso',            badge: 'badge-yellow', color: '#ca8a04', desc: 'Recurso interposto ou prazo recursal aberto' },
    ganhou:              { label: 'âœ… Ganhou',                badge: 'badge-green',  color: '#059669', desc: 'Adjudicada e homologada' },
    perdeu:              { label: 'âŒ Perdeu',                badge: 'badge-red',    color: '#dc2626', desc: 'Outro licitante foi adjudicado' },
    deserta:             { label: 'ðŸš« Deserta/Fracassada',    badge: 'badge-gray',   color: '#94a3b8', desc: 'Sem proposta vÃ¡lida ou revogada' },
    cancelada:           { label: 'ðŸ—‘ Cancelada',             badge: 'badge-gray',   color: '#94a3b8', desc: 'LicitaÃ§Ã£o cancelada ou revogada' },
  };

  const CHECKLIST_GRUPOS = {
    juridica: {
      label: 'ðŸ“œ HabilitaÃ§Ã£o JurÃ­dica',
      itens: [
        'Contrato Social / Estatuto + alteraÃ§Ãµes',
        'Ata de eleiÃ§Ã£o da diretoria atual',
        'Documento de identidade dos sÃ³cios',
        'CertidÃ£o Simplificada da Junta Comercial',
      ],
    },
    fiscal: {
      label: 'ðŸ’° Regularidade Fiscal e Trabalhista',
      itens: [
        'CNPJ â€” CartÃ£o CNPJ atualizado',
        'CND Federal (Receita + DÃ­vida Ativa)',
        'CND Estadual',
        'CND Municipal (ISS)',
        'CRF â€” CertidÃ£o FGTS (CEF)',
        'CNDT â€” DÃ©bitos Trabalhistas',
        'Simples Nacional (se aplicÃ¡vel)',
      ],
    },
    tecnica: {
      label: 'ðŸ”§ QualificaÃ§Ã£o TÃ©cnica',
      itens: [
        'Registro no CREA / CFT',
        'CertidÃ£o de Acervo TÃ©cnico (CAT / CREA)',
        'Atestado de Capacidade TÃ©cnica',
        'ART de Responsabilidade TÃ©cnica',
        'Registro no CADASTRO SICAF / FORNECEDORES',
        'AlvarÃ¡ de Funcionamento / LicenÃ§as',
      ],
    },
    economica: {
      label: 'ðŸ“Š QualificaÃ§Ã£o EconÃ´mico-Financeira',
      itens: [
        'BalanÃ§o Patrimonial + DRE Ãºltimo exercÃ­cio',
        'CertidÃ£o Negativa de FalÃªncia / Concordata',
        'Capital Social mÃ­nimo exigido',
      ],
    },
    proposta: {
      label: 'ðŸ“„ Documentos da Proposta',
      itens: [
        'Proposta de preÃ§os assinada',
        'Planilha de composiÃ§Ã£o de custos',
        'BDI e encargos sociais (se exigido)',
        'DeclaraÃ§Ãµes obrigatÃ³rias do edital',
        'Amostras / Laudos tÃ©cnicos (se exigido)',
      ],
    },
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
    const inicioStr = inicio.toISOString().split('T')[0];
    return lista.filter(item => (item[campo] || item.createdAt || '') >= inicioStr);
  }

  function setPeriodo(p) {
    _periodo = p;
    render();
  }

  let _filter = { status: '', modalidade: '' };
  let _tab = 'lista'; // 'lista' | 'kanban' | 'pncp'
  let _pncpData = [];   // cache dos dados PNCP
  let _pncpLoading = false;

  /* â”€â”€ Render principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function render() {
    const lics = DB.getAll('licitacoes');
    const cfg  = DB.getConfig();
    const periodoLabels = { mes: 'Este MÃªs', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const licsFiltradas = _filtrarPorPeriodo(lics, 'dataAbertura');

    const emAndamento = licsFiltradas.filter(l => !['ganhou','perdeu','deserta','cancelada'].includes(l.status));
    const ganhou      = licsFiltradas.filter(l => l.status === 'ganhou');
    const perdeu      = licsFiltradas.filter(l => l.status === 'perdeu');
    const valorDisputa = emAndamento.reduce((s, l) => s + (l.valorEstimado || 0), 0);
    const valorGanho   = ganhou.reduce((s, l) => s + (l.valorAdjudicado || l.valorProposta || 0), 0);
    const taxa = licsFiltradas.length > 0 ? ((ganhou.length / licsFiltradas.length) * 100).toFixed(0) : 0;

    // abertura prÃ³xima (7 dias)
    const urgentes = emAndamento.filter(l => {
      const d = Utils.daysUntil(l.dataAbertura);
      return d != null && d >= 0 && d <= 7;
    }).length;

    let list = [...lics].sort((a, b) => (a.dataAbertura || '').localeCompare(b.dataAbertura || ''));
    if (_filter.status) list = list.filter(l => l.status === _filter.status);
    if (_filter.modalidade) list = list.filter(l => l.modalidade === _filter.modalidade);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">LicitaÃ§Ãµes</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Licitacoes.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <button class="btn btn-secondary" onclick="Licitacoes.setTab('lista')" id="btnTabLista">ðŸ“‹ Lista</button>
          <button class="btn btn-secondary" onclick="Licitacoes.setTab('kanban')" id="btnTabKanban">ðŸ› Kanban</button>
          <button class="btn btn-secondary" onclick="Licitacoes.setTab('pncp')" id="btnTabPncp" style="position:relative">ðŸ” PNCP Monitor<span id="pncpBadge" style="display:none;position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:1px 5px;min-width:16px;text-align:center"></span></button>
          <label class="btn btn-secondary" style="cursor:pointer" title="Importar licitaÃ§Ãµes via CSV">
            ðŸ“¥ Importar CSV
            <input type="file" accept=".csv,.txt" style="display:none" onchange="Licitacoes.importCSV(event)">
          </label>
          <button class="btn btn-secondary" onclick="Licitacoes.downloadCSVTemplate()">ðŸ“‹ Modelo CSV</button>
          <button class="btn btn-primary" onclick="Licitacoes.openForm()">+ Nova LicitaÃ§Ã£o</button>
        </div>
      </div>

      <div class="kpi-grid" style="--kpi-cols:5">
        <div class="kpi-card" style="--kpi-color:#3b82f6;cursor:pointer" title="Clique para filtrar em andamento" onclick="Licitacoes.setFilter('status','');Licitacoes.setTab('lista')">
          <div class="kpi-label">Em Andamento</div>
          <div class="kpi-value">${emAndamento.length}</div>
          <div class="kpi-sub">${Utils.formatCurrency(valorDisputa)} em disputa</div>
          <div class="kpi-icon">ðŸ›</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f97316;cursor:pointer" title="Clique para ver abertura em â‰¤7 dias" onclick="Licitacoes.setFilter('status','proposta_enviada');Licitacoes.setTab('lista')">
          <div class="kpi-label">Abertura em â‰¤7 dias</div>
          <div class="kpi-value">${urgentes}</div>
          <div class="kpi-sub">${urgentes > 0 ? 'âš  AtenÃ§Ã£o necessÃ¡ria' : 'Sem urgÃªncias'}</div>
          <div class="kpi-icon">â°</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" title="Clique para ver ganhas" onclick="Licitacoes.setFilter('status','ganhou');Licitacoes.setTab('lista')">
          <div class="kpi-label">Ganhas</div>
          <div class="kpi-value">${ganhou.length}</div>
          <div class="kpi-sub">${Utils.formatCurrency(valorGanho)}</div>
          <div class="kpi-icon">âœ…</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#ef4444;cursor:pointer" title="Clique para ver perdidas" onclick="Licitacoes.setFilter('status','perdeu');Licitacoes.setTab('lista')">
          <div class="kpi-label">Perdidas</div>
          <div class="kpi-value">${perdeu.length}</div>
          <div class="kpi-sub">${lics.length} total no perÃ­odo</div>
          <div class="kpi-icon">âŒ</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#7c3aed">
          <div class="kpi-label">Taxa de VitÃ³ria</div>
          <div class="kpi-value">${taxa}%</div>
          <div class="kpi-sub">${ganhou.length} de ${lics.length} disputadas</div>
          <div class="kpi-icon">ðŸŽ¯</div>
        </div>
      </div>

      <div id="licTabContent">
        ${_tab === 'kanban' ? renderKanban(lics) : _tab === 'pncp' ? renderPNCPTab() : renderLista(list, lics, cfg)}
      </div>
    `;

    // highlight active tab button
    setTimeout(() => {
      document.getElementById('btnTabLista')?.classList.toggle('btn-primary', _tab === 'lista');
      document.getElementById('btnTabLista')?.classList.toggle('btn-secondary', _tab !== 'lista');
      document.getElementById('btnTabKanban')?.classList.toggle('btn-primary', _tab === 'kanban');
      document.getElementById('btnTabKanban')?.classList.toggle('btn-secondary', _tab !== 'kanban');
      document.getElementById('btnTabPncp')?.classList.toggle('btn-primary', _tab === 'pncp');
      document.getElementById('btnTabPncp')?.classList.toggle('btn-secondary', _tab !== 'pncp');
    }, 0);

    // Carregar badge PNCP em background
    _loadPncpBadge();

    // Auto-lanÃ§ar no pipeline (10 dias antes da abertura)
    setTimeout(() => _autoLancarNoPipeline(), 200);
  }

  /* â”€â”€ PNCP Monitor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  async function _loadPncpBadge() {
    try {
      const { count } = await _supabase
        .from('crm_licitacoes')
        .select('*', { count: 'exact', head: true })
        .eq('data->>kanban', 'nova');
      const badge = document.getElementById('pncpBadge');
      if (badge) {
        if (count > 0) { badge.textContent = count; badge.style.display = ''; }
        else badge.style.display = 'none';
      }
    } catch {}
  }

  function renderPNCPTab() {
    // Dispara carga assÃ­ncrona e retorna skeleton
    if (!_pncpLoading) { _pncpLoading = true; _fetchPncp(); }

    const kanbanCols = [
      { key: 'nova',       label: 'ðŸ” Novas',           color: '#3b82f6' },
      { key: 'analisando', label: 'ðŸ“‹ Analisando',      color: '#f59e0b' },
      { key: 'proposta',   label: 'ðŸ“ Elaborando Prop.', color: '#7c3aed' },
      { key: 'participar', label: 'âœ… Vamos Participar', color: '#10b981' },
      { key: 'descartada', label: 'âŒ Descartada',       color: '#ef4444' },
    ];

    if (_pncpData.length === 0) {
      return `
        <div class="card">
          <div style="padding:24px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">ðŸ›</div>
            <div class="font-bold" style="margin-bottom:6px">Carregando licitaÃ§Ãµes do PNCP...</div>
            <div class="text-sm text-muted">Buscando licitaÃ§Ãµes encontradas automaticamente pelo monitor</div>
          </div>
        </div>`;
    }

    return `
      <div class="card mb-3">
        <div style="padding:14px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1">
            <div class="font-bold">ðŸ” PNCP Monitor â€” LicitaÃ§Ãµes Descobertas Automaticamente</div>
            <div class="text-xs text-muted">${_pncpData.length} licitaÃ§Ã£o(Ãµes) capturadas Â· Arraste entre colunas ou clique para gerenciar</div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="Licitacoes.recarregarPncp()">ðŸ”„ Atualizar</button>
        </div>
      </div>
      <div style="overflow-x:auto;padding-bottom:8px">
        <div style="display:flex;gap:12px;min-width:${kanbanCols.length * 220}px;align-items:flex-start">
          ${kanbanCols.map(col => {
            const cards = _pncpData.filter(l => (l.data?.kanban || 'nova') === col.key);
            return `
              <div style="width:220px;flex-shrink:0">
                <div style="padding:10px 12px;border-radius:var(--radius);background:var(--surface);border-top:3px solid ${col.color};margin-bottom:8px">
                  <div style="font-size:12px;font-weight:700;color:${col.color}">${col.label}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${cards.length} licitaÃ§Ã£o(Ãµes)</div>
                </div>
                ${cards.map(l => _renderPncpCard(l, kanbanCols)).join('')}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function _renderPncpCard(l, kanbanCols) {
    const d = l.data || {};
    const valor = d.valor ? Utils.formatCurrency(d.valor) : 'Valor N/I';
    const dataEnc = d.dataEncerramento ? new Date(d.dataEncerramento) : null;
    const diasEnc = dataEnc ? Math.ceil((dataEnc - new Date()) / 86400000) : null;
    const encAlert = diasEnc != null && diasEnc >= 0 && diasEnc <= 7;

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:8px;${encAlert ? 'border-left:3px solid #ef4444' : ''}">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:3px">${Utils.escHtml(d.numero||d.numeroControlePNCP||'â€”')} Â· ${Utils.escHtml(d.uf||'')} Â· ${Utils.escHtml(d.municipio||'')}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.4;margin-bottom:6px">${Utils.escHtml(Utils.truncate(d.titulo||'',80))}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">ðŸ› ${Utils.escHtml(Utils.truncate(d.orgao||'',35))}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
          <div style="font-size:12px;font-weight:700;color:var(--primary)">${valor}</div>
          ${diasEnc != null && diasEnc >= 0 ? `<span style="font-size:10px;color:${encAlert?'#ef4444':'#94a3b8'};font-weight:600">ðŸ“… ${diasEnc}d restantes</span>` : ''}
        </div>
        <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
          ${d.linkPNCP ? `<a href="${Utils.escHtml(d.linkPNCP)}" target="_blank" class="btn btn-xs btn-secondary" style="font-size:10px">ðŸ”— Edital</a>` : ''}
          <button class="btn btn-xs btn-primary" style="font-size:10px" onclick="Licitacoes.importarPncp('${l.id}')">â†— Criar LicitaÃ§Ã£o</button>
          <select class="form-control" style="font-size:10px;padding:2px 4px;height:auto;flex:1;min-width:80px" onchange="Licitacoes.moverKanbanPncp('${l.id}',this.value)">
            ${kanbanCols.map(c => `<option value="${c.key}" ${(d.kanban||'nova')===c.key?'selected':''}>${c.label}</option>`).join('')}
          </select>
        </div>
      </div>`;
  }

  async function _fetchPncp() {
    try {
      const { data, error } = await _supabase
        .from('crm_licitacoes')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        _pncpData = data;
        // Re-render aba se estiver ativa
        const el = document.getElementById('licTabContent');
        if (el && _tab === 'pncp') el.innerHTML = renderPNCPTab();
        _loadPncpBadge();
      }
    } catch {}
    _pncpLoading = false;
  }

  function recarregarPncp() {
    _pncpData = [];
    _pncpLoading = true;
    const el = document.getElementById('licTabContent');
    if (el) el.innerHTML = renderPNCPTab();
    _fetchPncp();
  }

  async function moverKanbanPncp(id, kanban) {
    _pncpData = _pncpData.map(l => l.id === id ? { ...l, data: { ...l.data, kanban } } : l);
    await _supabase.from('crm_licitacoes').update({ data: _pncpData.find(l => l.id === id)?.data }).eq('id', id);
    _loadPncpBadge();
    const el = document.getElementById('licTabContent');
    if (el && _tab === 'pncp') el.innerHTML = renderPNCPTab();
  }

  function importarPncp(id) {
    const lic = _pncpData.find(l => l.id === id);
    if (!lic) return;
    const d = lic.data || {};

    // Converter data de encerramento para data de abertura (dd/mm para yyyy-mm-dd)
    let dataAbertura = '';
    if (d.dataEncerramento) {
      try { dataAbertura = new Date(d.dataEncerramento).toISOString().split('T')[0]; } catch {}
    }

    // Mapear modalidade PNCP para local
    const modalMap = {
      'PregÃ£o - EletrÃ´nico': 'PregÃ£o EletrÃ´nico',
      'PregÃ£o - Presencial': 'PregÃ£o Presencial',
      'ConcorrÃªncia - EletrÃ´nica': 'ConcorrÃªncia',
      'ConcorrÃªncia - Presencial': 'ConcorrÃªncia',
      'Dispensa': 'Dispensa de LicitaÃ§Ã£o',
      'Inexigibilidade': 'Inexigibilidade',
    };
    const modalidade = modalMap[d.modalidade] || d.modalidade || 'PregÃ£o EletrÃ´nico';

    // Criar licitaÃ§Ã£o manual com dados do PNCP
    const criada = DB.create('licitacoes', {
      numero:          d.numero || d.numeroControlePNCP || '',
      objeto:          d.titulo || '',
      orgao:           d.orgao || '',
      uasg:            '',
      modalidade,
      portal:          'Comprasnet (PNCP)',
      status:          'identificada',
      dataPublicacao:  d.dataPublicacao ? d.dataPublicacao.split('T')[0] : '',
      dataAbertura,
      valorEstimado:   d.valor || null,
      linkPortal:      d.linkPNCP || '',
      linkEdital:      d.linkPNCP || '',
      observacoes:     `Capturado automaticamente pelo monitor PNCP.\nUF: ${d.uf} Â· ${d.municipio}\nID PNCP: ${d.numeroControlePNCP||id}`,
    });

    // Marcar como importada no banco PNCP
    moverKanbanPncp(id, 'participar');

    Toast.success('âœ… LicitaÃ§Ã£o criada no CRM! Configure os detalhes e adicione ao pipeline.');
    _tab = 'lista';
    render();
  }

  /* â”€â”€ Auto-lanÃ§amento no pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  const _DIAS_ANTECEDENCIA = 10;
  const _TERMINAL = ['ganhou', 'perdeu', 'deserta', 'cancelada'];

  function _autoLancarNoPipeline() {
    const lics = DB.getAll('licitacoes');
    let lancadas = 0;

    lics.forEach(l => {
      // Ignorar terminais e as que jÃ¡ tÃªm lead vinculado
      if (_TERMINAL.includes(l.status)) return;
      if (l.leadId) return; // jÃ¡ estÃ¡ no pipeline

      const dias = Utils.daysUntil(l.dataAbertura);
      if (dias == null) return;                    // sem data de abertura
      if (dias > _DIAS_ANTECEDENCIA) return;       // ainda nÃ£o Ã© hora
      if (dias < -30) return;                      // abertura muito no passado, ignora

      // Chegou a hora â€” criar lead no pipeline
      _criarLeadNoPipeline(l);
      lancadas++;
    });

    if (lancadas > 0) {
      Toast.show(
        `ðŸ› ${lancadas} licitaÃ§Ã£o(Ãµes) lanÃ§ada(s) automaticamente no pipeline ` +
        `(abertura em â‰¤${_DIAS_ANTECEDENCIA} dias).`,
        6000
      );
      // Re-render silencioso para mostrar badge
      const licsAtt = DB.getAll('licitacoes');
      let list = [...licsAtt].sort((a, b) => (a.dataAbertura||'').localeCompare(b.dataAbertura||''));
      if (_filter.status) list = list.filter(l => l.status === _filter.status);
      if (_filter.modalidade) list = list.filter(l => l.modalidade === _filter.modalidade);
      const el = document.getElementById('licTabContent');
      if (el && _tab === 'lista') {
        el.innerHTML = renderLista(list, licsAtt, DB.getConfig());
      }
    }
  }

  function _criarLeadNoPipeline(lic) {
    // Calcular prÃ³xima aÃ§Ã£o: 3 dias antes da abertura (ou amanhÃ£ se < 3 dias)
    let dataAcao = lic.dataAbertura;
    if (dataAcao) {
      const d = new Date(dataAcao);
      d.setDate(d.getDate() - 3);
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      if (d < hoje) d.setDate(hoje.getDate() + 1);
      dataAcao = d.toISOString().split('T')[0];
    }

    const lead = DB.create('leads', {
      titulo: `${lic.numero} â€” ${Utils.truncate(lic.objeto || '', 70)}`,
      origemLead: 'LicitaÃ§Ã£o PÃºblica',
      status: 'proposta_elaboracao', // jÃ¡ estÃ¡ em elaboraÃ§Ã£o de proposta
      clienteId: null,
      segmento: 'Governo / Ã“rgÃ£o PÃºblico',
      valorEstimado: lic.valorEstimado || 0,
      responsavel: lic.responsavel || '',
      proximaAcao: 'Preparar proposta tÃ©cnica e comercial para licitaÃ§Ã£o',
      dataProximaAcao: dataAcao || '',
      licitacaoId: lic.id,
      licitacao: {
        edital:      lic.numero,
        orgao:       lic.orgao,
        modalidade:  lic.modalidade,
        uasg:        lic.uasg || '',
        dataEntrega: lic.dataAbertura,
        valorOrgao:  lic.valorEstimado || 0,
        lance:       lic.valorProposta || 0,
        link:        lic.linkEdital || lic.linkPortal || '',
        resultado:   'Em disputa',
      },
      observacoes: `Auto-lanÃ§ado pelo mÃ³dulo de LicitaÃ§Ãµes ${_DIAS_ANTECEDENCIA} dias antes da abertura.`,
    });

    // Gravar leadId de volta na licitaÃ§Ã£o para rastreamento
    DB.update('licitacoes', lic.id, {
      leadId: lead.id,
      dataLancamentoPipeline: Utils.todayStr(),
    });
  }

  /* LanÃ§amento manual (botÃ£o na tabela ou no view) */
  function lancarNoPipeline(id) {
    const l = DB.get('licitacoes', id);
    if (!l) return;
    if (l.leadId) {
      // JÃ¡ lanÃ§ado â€” navega para o lead
      Toast.show('Esta licitaÃ§Ã£o jÃ¡ estÃ¡ no pipeline. Abrindo...');
      setTimeout(() => { App.navigate('pipeline'); }, 500);
      return;
    }
    if (_TERMINAL.includes(l.status)) {
      Toast.warning('LicitaÃ§Ãµes finalizadas nÃ£o sÃ£o lanÃ§adas no pipeline.'); return;
    }
    _criarLeadNoPipeline(l);
    Toast.success(`ðŸ› LicitaÃ§Ã£o "${l.numero}" lanÃ§ada no pipeline!`);
    Modal.close();
    render();
  }

  /* â”€â”€ Lista â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function renderLista(list, allLics, cfg) {
    const modalidades = [...new Set(allLics.map(l => l.modalidade).filter(Boolean))];
    return `
      <div class="card">
        <div class="card-header">
          <div class="filters">
            <select class="filter-select" onchange="Licitacoes.setFilter('status',this.value)">
              <option value="">Todos os status</option>
              ${Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${_filter.status===k?'selected':''}>${v.label}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Licitacoes.setFilter('modalidade',this.value)">
              <option value="">Todas as modalidades</option>
              ${MODALIDADES.map(m => `<option value="${m}" ${_filter.modalidade===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} licitaÃ§Ã£o(Ãµes)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? emptyState() : `
          <table class="tbl">
            <thead><tr>
              <th>Processo</th><th>Objeto</th><th>Ã“rgÃ£o</th><th>Modalidade</th>
              <th>Abertura</th><th>Val. Estimado</th><th>Val. Proposta</th>
              <th>Status</th><th>Pipeline</th><th>AÃ§Ãµes</th>
            </tr></thead>
            <tbody>
              ${list.map(l => {
                const dias = Utils.daysUntil(l.dataAbertura);
                const terminal = _TERMINAL.includes(l.status);

                // Coluna Pipeline
                let pipelineCell;
                if (l.leadId) {
                  pipelineCell = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#0f766e;background:#f0fdfa;padding:2px 8px;border-radius:99px;border:1px solid #0f766e33">âœ… No pipeline</span>
                    <div class="text-xs text-muted" style="margin-top:2px">${Utils.formatDate(l.dataLancamentoPipeline)}</div>`;
                } else if (terminal) {
                  pipelineCell = `<span class="text-xs text-muted">â€”</span>`;
                } else if (dias != null && dias <= _DIAS_ANTECEDENCIA) {
                  pipelineCell = `<span style="font-size:11px;color:#f97316;font-weight:600">â³ LanÃ§ando...</span>`;
                } else {
                  const faltam = dias != null ? `em ${dias}d` : 'data indefinida';
                  pipelineCell = `<span class="text-xs text-muted">AutomÃ¡tico ${faltam}</span>
                    <br><button class="btn btn-xs btn-secondary" style="margin-top:3px" onclick="Licitacoes.lancarNoPipeline('${l.id}')" title="LanÃ§ar agora manualmente">â†— Agora</button>`;
                }

                // Alerta de abertura prÃ³xima
                const aberturaColor = dias == null ? '' : dias < 0 ? '#ef4444' : dias <= 3 ? '#f97316' : dias <= 10 ? '#f59e0b' : '';
                const aberturaLabel = dias == null ? 'â€”' : dias < 0 ? `Encerrado ${Math.abs(dias)}d` : dias === 0 ? 'âš  HOJE' : `${dias}d restantes`;

                const lic_status = STATUS[l.status] || { label: l.status, badge: 'badge-gray' };
                return `<tr>
                  <td>
                    <div class="font-bold text-sm" style="color:var(--primary)">${Utils.escHtml(l.numero || 'â€”')}</div>
                    <div class="text-xs text-muted">${Utils.escHtml(l.portal || '')}</div>
                  </td>
                  <td><div style="max-width:200px;font-size:13px">${Utils.escHtml(Utils.truncate(l.objeto || '', 70))}</div></td>
                  <td class="text-sm">${Utils.escHtml(l.orgao || 'â€”')}<br><span class="text-xs text-muted">${Utils.escHtml(l.uasg ? 'UASG '+l.uasg : '')}</span></td>
                  <td class="text-xs">${Utils.escHtml(l.modalidade || 'â€”')}</td>
                  <td class="text-sm">
                    <div>${Utils.formatDate(l.dataAbertura)}</div>
                    ${aberturaColor ? `<div style="font-size:11px;font-weight:700;color:${aberturaColor}">${aberturaLabel}</div>` : `<div class="text-xs text-muted">${aberturaLabel}</div>`}
                  </td>
                  <td class="font-bold text-sm">${l.valorEstimado ? Utils.formatCurrency(l.valorEstimado) : 'â€”'}</td>
                  <td class="text-sm ${l.valorProposta && l.valorEstimado && l.valorProposta < l.valorEstimado ? 'text-success' : ''}">${l.valorProposta ? Utils.formatCurrency(l.valorProposta) : 'â€”'}</td>
                  <td><span class="badge ${lic_status.badge}" style="font-size:11px">${lic_status.label}</span></td>
                  <td>${pipelineCell}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Licitacoes.view('${l.id}')">Ver</button>
                      <button class="btn btn-xs btn-secondary" onclick="Licitacoes.openForm('${l.id}')">âœ</button>
                      <button class="btn btn-xs btn-danger" onclick="Licitacoes.deleteLic('${l.id}')">ðŸ—‘</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>`;
  }

  /* â”€â”€ Kanban â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function renderKanban(lics) {
    const stages = [
      'identificada','em_analise','habilitacao','proposta_preparando',
      'proposta_enviada','sessao_realizada','recurso',
    ];
    const won = ['ganhou','perdeu','deserta','cancelada'];

    return `
      <div style="overflow-x:auto;padding-bottom:8px">
        <div style="display:flex;gap:12px;min-width:${stages.length * 200 + 400}px;align-items:flex-start">
          ${stages.map(sk => {
            const s = STATUS[sk];
            const cards = lics.filter(l => l.status === sk);
            const total = cards.reduce((s,l) => s + (l.valorEstimado||0), 0);
            return `
              <div style="width:200px;flex-shrink:0">
                <div style="padding:10px 12px;border-radius:var(--radius);background:var(--surface);border-top:3px solid ${s.color};margin-bottom:8px;cursor:pointer;transition:box-shadow .15s"
                     title="Clique para filtrar por este status"
                     onclick="Licitacoes.filtrarKanban('${sk}')"
                     onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'"
                     onmouseout="this.style.boxShadow='none'">
                  <div style="font-size:12px;font-weight:700;color:${s.color}">${s.label}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${cards.length} Â· ${Utils.formatCurrency(total)}</div>
                  <div style="font-size:10px;color:var(--text-muted);margin-top:2px;opacity:.7">ðŸ” Ver lista filtrada</div>
                </div>
                ${cards.map(l => renderKanbanCard(l)).join('')}
              </div>`;
          }).join('')}

          <!-- Resultados -->
          <div style="width:200px;flex-shrink:0">
            <div style="padding:10px 12px;border-radius:var(--radius);background:var(--surface);border-top:3px solid #10b981;margin-bottom:8px;cursor:pointer;transition:box-shadow .15s"
                 title="Clique para ver todas as ganhas"
                 onclick="Licitacoes.filtrarKanban('ganhou')"
                 onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'"
                 onmouseout="this.style.boxShadow='none'">
              <div style="font-size:12px;font-weight:700;color:#10b981">âœ… Ganhas</div>
              <div style="font-size:11px;color:var(--text-muted)">${lics.filter(l=>l.status==='ganhou').length} Â· ${Utils.formatCurrency(lics.filter(l=>l.status==='ganhou').reduce((s,l)=>s+(l.valorAdjudicado||l.valorProposta||0),0))}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;opacity:.7">ðŸ” Ver lista filtrada</div>
            </div>
            ${lics.filter(l=>l.status==='ganhou').map(l => renderKanbanCard(l)).join('')}
          </div>
          <div style="width:200px;flex-shrink:0">
            <div style="padding:10px 12px;border-radius:var(--radius);background:var(--surface);border-top:3px solid #ef4444;margin-bottom:8px;cursor:pointer;transition:box-shadow .15s"
                 title="Clique para ver perdidas/canceladas"
                 onclick="Licitacoes.filtrarKanban('perdeu')"
                 onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'"
                 onmouseout="this.style.boxShadow='none'">
              <div style="font-size:12px;font-weight:700;color:#ef4444">âŒ Perdidas / Canceladas</div>
              <div style="font-size:11px;color:var(--text-muted)">${lics.filter(l=>['perdeu','deserta','cancelada'].includes(l.status)).length}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;opacity:.7">ðŸ” Ver lista filtrada</div>
            </div>
            ${lics.filter(l=>['perdeu','deserta','cancelada'].includes(l.status)).map(l => renderKanbanCard(l)).join('')}
          </div>
        </div>
      </div>`;
  }

  function renderKanbanCard(l) {
    const s = STATUS[l.status] || { label: l.status, badge: 'badge-gray', color: '#94a3b8' };
    const dias = Utils.daysUntil(l.dataAbertura);
    const alertStyle = dias != null && dias >= 0 && dias <= 7 ? 'border-left:3px solid #ef4444' : '';
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:8px;cursor:pointer;${alertStyle}" onclick="Licitacoes.view('${l.id}')">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:3px">${Utils.escHtml(l.numero||'â€”')}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.4;margin-bottom:6px">${Utils.escHtml(Utils.truncate(l.objeto||'',60))}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">ðŸ› ${Utils.escHtml(Utils.truncate(l.orgao||'',30))}</div>
        ${l.valorEstimado ? `<div style="font-size:12px;font-weight:700;color:var(--primary)">${Utils.formatCurrency(l.valorEstimado)}</div>` : ''}
        ${dias != null && dias >= 0 ? `<div style="font-size:10px;color:${dias<=3?'#ef4444':dias<=7?'#d97706':'#94a3b8'};margin-top:4px">ðŸ“… Abertura em ${dias}d</div>` : ''}
      </div>`;
  }

  function emptyState() {
    return `<div class="empty-state"><div class="empty-icon">ðŸ›</div><div class="empty-title">Nenhuma licitaÃ§Ã£o cadastrada</div><div class="empty-sub">Cadastre processos licitatÃ³rios para acompanhar os prazos e a documentaÃ§Ã£o</div><button class="btn btn-primary mt-4" onclick="Licitacoes.openForm()">+ Nova LicitaÃ§Ã£o</button></div>`;
  }

  function setFilter(k, v) { _filter[k] = v; render(); }
  function setTab(t) { _tab = t; render(); }

  /* â”€â”€ View detalhado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function view(id) {
    const l = DB.get('licitacoes', id);
    if (!l) return;
    const lic_status = STATUS[l.status] || { label: l.status, badge: 'badge-gray', color: '#94a3b8' };
    const checklist = l.checklist || {};
    const diasAbertura = Utils.daysUntil(l.dataAbertura);
    const diasResultado = Utils.daysUntil(l.dataResultado);

    // Calc checklist completion
    let totalItens = 0, marcados = 0;
    Object.entries(CHECKLIST_GRUPOS).forEach(([gk, g]) => {
      g.itens.forEach((item, idx) => {
        totalItens++;
        if (checklist[`${gk}_${idx}`]) marcados++;
      });
    });
    const pctChecklist = totalItens > 0 ? Math.round((marcados / totalItens) * 100) : 0;

    Modal.open({
      title: `ðŸ› ${l.numero || 'LicitaÃ§Ã£o'}`,
      size: 'modal-lg',
      body: `
        <!-- Header -->
        <div style="background:var(--bg);padding:16px;border-radius:var(--radius);margin-bottom:20px;border-left:4px solid ${lic_status.color}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div style="flex:1">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${Utils.escHtml(l.modalidade||'')} Â· ${Utils.escHtml(l.portal||'')}</div>
              <div style="font-size:16px;font-weight:700;color:var(--text);line-height:1.4">${Utils.escHtml(l.objeto||'â€”')}</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">ðŸ› ${Utils.escHtml(l.orgao||'â€”')}${l.uasg ? ` <span class="text-muted" style="font-size:11px">UASG: ${l.uasg}</span>` : ''}</div>
            </div>
            <div style="text-align:right">
              <span class="badge ${lic_status.badge}" style="font-size:12px;padding:4px 10px">${lic_status.label}</span>
              ${l.linkPortal ? `<br><a href="${Utils.escHtml(l.linkPortal)}" target="_blank" class="btn btn-xs btn-secondary mt-2">ðŸ”— Portal</a>` : ''}
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tabs mb-3">
          <button class="tab-btn active" onclick="switchTab(this,'licTabInfo')">ðŸ“‹ InformaÃ§Ãµes</button>
          <button class="tab-btn" onclick="switchTab(this,'licTabChecklist')">âœ… Checklist <span class="badge ${pctChecklist===100?'badge-green':pctChecklist>0?'badge-yellow':'badge-gray'}" style="margin-left:4px">${pctChecklist}%</span></button>
          <button class="tab-btn" onclick="switchTab(this,'licTabProposta')">ðŸ’° Proposta</button>
          <button class="tab-btn" onclick="switchTab(this,'licTabHistorico')">ðŸ“ Notas</button>
        </div>

        <!-- TAB: InformaÃ§Ãµes -->
        <div id="licTabInfo">
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-label">NÂº do Processo</div><div class="detail-value font-bold">${Utils.escHtml(l.numero||'â€”')}</div></div>
            <div class="detail-field"><div class="detail-label">Modalidade</div><div class="detail-value">${Utils.escHtml(l.modalidade||'â€”')}</div></div>
            <div class="detail-field"><div class="detail-label">ResponsÃ¡vel</div><div class="detail-value">${Utils.escHtml(l.responsavel||'â€”')}</div></div>
            <div class="detail-field"><div class="detail-label">Portal / Plataforma</div><div class="detail-value">${Utils.escHtml(l.portal||'â€”')}</div></div>
            <div class="detail-field"><div class="detail-label">PublicaÃ§Ã£o do Edital</div><div class="detail-value">${Utils.formatDate(l.dataPublicacao)}</div></div>
            <div class="detail-field"><div class="detail-label">Abertura das Propostas</div>
              <div class="detail-value ${diasAbertura != null && diasAbertura >= 0 && diasAbertura <= 7 ? 'text-danger' : ''}">
                ${Utils.formatDate(l.dataAbertura)}
                ${diasAbertura != null && diasAbertura >= 0 ? `<span class="badge ${diasAbertura<=3?'badge-red':diasAbertura<=7?'badge-yellow':'badge-gray'}" style="font-size:10px">em ${diasAbertura}d</span>` : ''}
                ${diasAbertura != null && diasAbertura < 0 ? `<span class="badge badge-gray" style="font-size:10px">hÃ¡ ${Math.abs(diasAbertura)}d</span>` : ''}
              </div>
            </div>
            <div class="detail-field"><div class="detail-label">PrevisÃ£o de Resultado</div><div class="detail-value">${Utils.formatDate(l.dataResultado)}</div></div>
            <div class="detail-field"><div class="detail-label">Prazo de ExecuÃ§Ã£o</div><div class="detail-value">${l.prazoExecucao ? l.prazoExecucao + ' dias' : 'â€”'}</div></div>
          </div>
          ${l.linkEdital ? `<div class="mt-2"><a href="${Utils.escHtml(l.linkEdital)}" target="_blank" class="btn btn-sm btn-secondary">ðŸ“„ Baixar Edital</a></div>` : ''}
          ${l.servicos?.length ? `<div class="detail-field mt-3"><div class="detail-label">ServiÃ§os Envolvidos</div><div class="detail-value" style="display:flex;flex-wrap:wrap;gap:6px">${l.servicos.map(s => `<span class="badge badge-blue">${Utils.escHtml(s)}</span>`).join('')}</div></div>` : ''}
          ${l.observacoes ? `<div class="detail-field mt-3"><div class="detail-label">ObservaÃ§Ãµes</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(l.observacoes)}</div></div>` : ''}
        </div>

        <!-- TAB: Checklist -->
        <div id="licTabChecklist" class="hidden">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="flex:1;background:var(--border);border-radius:100px;height:8px;overflow:hidden">
              <div class="progress-bar-inner" style="width:${pctChecklist}%;height:100%;background:${pctChecklist===100?'#10b981':pctChecklist>50?'#f59e0b':'#3b82f6'};border-radius:100px;transition:width .3s"></div>
            </div>
            <span class="font-bold text-sm">${marcados}/${totalItens} itens (${pctChecklist}%)</span>
          </div>
          ${Object.entries(CHECKLIST_GRUPOS).map(([gk, g]) => `
            <div style="margin-bottom:16px">
              <div class="detail-label mb-2">${g.label}</div>
              ${g.itens.map((item, idx) => {
                const ck = `${gk}_${idx}`;
                const checked = checklist[ck] ? 'checked' : '';
                return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:4px;background:var(--bg);transition:background .15s" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='var(--bg)'">
                  <input type="checkbox" ${checked} onchange="Licitacoes.toggleChecklist('${id}','${ck}',this.checked)" style="width:15px;height:15px;accent-color:var(--primary);cursor:pointer;flex-shrink:0">
                  <span class="text-sm ${checked ? 'text-muted' : ''}" style="${checked ? 'text-decoration:line-through' : ''}">${Utils.escHtml(item)}</span>
                </label>`;
              }).join('')}
            </div>`).join('')}
        </div>

        <!-- TAB: Proposta / Financeiro -->
        <div id="licTabProposta" class="hidden">
          <div class="detail-grid mb-4">
            <div class="detail-field"><div class="detail-label">Valor Estimado (Edital)</div><div class="detail-value font-bold" style="font-size:18px;color:var(--text-secondary)">${l.valorEstimado ? Utils.formatCurrency(l.valorEstimado) : 'â€”'}</div></div>
            <div class="detail-field"><div class="detail-label">Nossa Proposta</div><div class="detail-value font-bold" style="font-size:18px;color:var(--primary)">${l.valorProposta ? Utils.formatCurrency(l.valorProposta) : 'â€”'}</div></div>
            <div class="detail-field"><div class="detail-label">Valor Adjudicado</div><div class="detail-value font-bold" style="font-size:18px;color:var(--success)">${l.valorAdjudicado ? Utils.formatCurrency(l.valorAdjudicado) : 'â€”'}</div></div>
            <div class="detail-field"><div class="detail-label">Desconto s/ Estimado</div><div class="detail-value">${l.valorProposta && l.valorEstimado ? (((l.valorEstimado - l.valorProposta) / l.valorEstimado) * 100).toFixed(1) + '%' : 'â€”'}</div></div>
            ${l.status === 'perdeu' ? `<div class="detail-field"><div class="detail-label">ColocaÃ§Ã£o Final</div><div class="detail-value">${Utils.escHtml(l.colocacao||'â€”')}</div></div>` : ''}
            ${l.motivoPerda ? `<div class="detail-field"><div class="detail-label">Motivo da Perda</div><div class="detail-value text-danger">${Utils.escHtml(l.motivoPerda)}</div></div>` : ''}
          </div>
          ${l.status === 'ganhou' ? `
            <div style="background:var(--success-light);border:1px solid var(--success-border);padding:14px;border-radius:var(--radius);margin-top:8px">
              <div class="font-bold text-sm" style="color:var(--success)">ðŸŽ‰ LicitaÃ§Ã£o Ganha!</div>
              <div class="text-sm mt-1">Crie um projeto para iniciar a execuÃ§Ã£o do contrato.</div>
              <button class="btn btn-success btn-sm mt-2" onclick="Modal.close();Licitacoes.criarProjeto('${id}')">ðŸ“‹ Criar Projeto</button>
              <button class="btn btn-primary btn-sm mt-2" onclick="Modal.close();Licitacoes.criarRecebivel('${id}')">ðŸ’° Criar RecebÃ­vel</button>
            </div>` : ''}
        </div>

        <!-- TAB: Notas -->
        <div id="licTabHistorico" class="hidden">
          <div class="form-group">
            <label class="form-label">Notas e Andamento do Processo</label>
            <textarea class="form-control" id="licNota" rows="6" placeholder="Registre aqui informaÃ§Ãµes do processo: impugnaÃ§Ãµes, esclarecimentos, habilitaÃ§Ã£o, recursos...">${Utils.escHtml(l.notas||'')}</textarea>
          </div>
          <button class="btn btn-primary btn-sm" onclick="Licitacoes.saveNotas('${id}')">ðŸ’¾ Salvar Notas</button>
        </div>

        <!-- Pipeline status no view -->
        ${(() => {
          if (l.leadId) {
            return `<div style="background:#f0fdfa;border:1px solid #0f766e44;border-radius:var(--radius);padding:12px;margin-top:12px;display:flex;align-items:center;gap:12px">
              <span style="font-size:22px">ðŸ›</span>
              <div style="flex:1">
                <div class="font-bold text-sm" style="color:#0f766e">No pipeline desde ${Utils.formatDate(l.dataLancamentoPipeline)}</div>
                <div class="text-xs text-muted">Acompanhe o andamento na tela Pipeline â†’ filtro "LicitaÃ§Ã£o PÃºblica"</div>
              </div>
              <button class="btn btn-sm btn-secondary" onclick="Modal.close();App.navigate('pipeline')">Ir ao Pipeline â†’</button>
            </div>`;
          }
          if (_TERMINAL.includes(l.status)) return '';
          const diasAbertura = Utils.daysUntil(l.dataAbertura);
          const faltam = diasAbertura != null ? `${diasAbertura} dias` : 'data indefinida';
          return `<div style="background:#fffbeb;border:1px solid #f59e0b44;border-radius:var(--radius);padding:12px;margin-top:12px;display:flex;align-items:center;gap:12px">
            <span style="font-size:22px">â³</span>
            <div style="flex:1">
              <div class="font-bold text-sm">LanÃ§amento automÃ¡tico no pipeline</div>
              <div class="text-xs text-muted">Faltam <strong>${faltam}</strong> para a abertura Â· serÃ¡ lanÃ§ada automaticamente ${diasAbertura != null && diasAbertura <= _DIAS_ANTECEDENCIA ? '<strong style="color:#f97316">agora (â‰¤10 dias)</strong>' : `quando restar ${_DIAS_ANTECEDENCIA} dias`}</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="Licitacoes.lancarNoPipeline('${id}')">â†— LanÃ§ar agora</button>
          </div>`;
        })()}

        <!-- Footer actions -->
        <div class="mt-4 flex gap-2" style="flex-wrap:wrap;border-top:1px solid var(--border);padding-top:16px">
          <div class="flex gap-2" style="flex:1;flex-wrap:wrap">
            ${Object.entries(STATUS).map(([k,v]) =>
              `<button class="btn btn-xs ${l.status===k?'btn-primary':'btn-ghost'}" onclick="Licitacoes.changeStatus('${id}','${k}')" style="font-size:11px">${v.label}</button>`
            ).join('')}
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" onclick="Modal.close();Licitacoes.openForm('${id}')">âœ Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
          </div>
        </div>
      `,
    });
  }

  /* â”€â”€ Checklist inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function toggleChecklist(id, key, val) {
    const l = DB.get('licitacoes', id);
    if (!l) return;
    const checklist = { ...(l.checklist || {}), [key]: val };
    DB.update('licitacoes', id, { checklist });
    // Update progress bar without re-rendering everything
    let total = 0, marcados = 0;
    Object.entries(CHECKLIST_GRUPOS).forEach(([gk, g]) => {
      g.itens.forEach((_, idx) => { total++; if (checklist[`${gk}_${idx}`]) marcados++; });
    });
    const pct = Math.round((marcados / total) * 100);
    const bar = document.querySelector('#licTabChecklist .progress-bar-inner');
    if (bar) bar.style.width = pct + '%';
  }

  function saveNotas(id) {
    const notas = document.getElementById('licNota')?.value;
    DB.update('licitacoes', id, { notas });
    Toast.success('Notas salvas');
  }

  function changeStatus(id, status) {
    DB.update('licitacoes', id, { status });
    Toast.success('Status atualizado: ' + STATUS[status]?.label);

    // Sincroniza lead vinculado no pipeline
    const licAtualizada = DB.get('licitacoes', id);
    if (licAtualizada?.leadId) {
      const leadStatus = status === 'ganhou' ? 'fechado_ganho' : status === 'perdeu' ? 'fechado_perdido' : null;
      if (leadStatus) {
        DB.update('leads', licAtualizada.leadId, {
          status: leadStatus,
          valorFechado: leadStatus === 'fechado_ganho' ? (licAtualizada.valorAdjudicado || licAtualizada.valorProposta || 0) : 0,
          motivoPerda: leadStatus === 'fechado_perdido' ? (licAtualizada.motivoPerda || 'LicitaÃ§Ã£o perdida') : undefined,
          'licitacao.resultado': status === 'ganhou' ? 'Ganhou' : 'Perdeu',
        });
        Toast.show(`Pipeline atualizado: lead movido para "${leadStatus === 'fechado_ganho' ? 'Fechado/Ganho' : 'Fechado/Perdido'}".`);
      }
    }

    Modal.close();
    render();
  }

  /* â”€â”€ Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function openForm(id = null) {
    const cfg = DB.getConfig();
    const l = id ? DB.get('licitacoes', id) : null;

    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${l?.responsavel===r?'selected':''}>${r}</option>`).join('');
    const modalOpts = MODALIDADES.map(m => `<option value="${m}" ${l?.modalidade===m?'selected':''}>${m}</option>`).join('');
    const portalOpts = PORTAIS.map(p => `<option value="${p}" ${l?.portal===p?'selected':''}>${p}</option>`).join('');
    const statusOpts = Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${(l?.status||'identificada')===k?'selected':''}>${v.label}</option>`).join('');
    const servicosOpts = cfg.servicos.map(s => {
      const sel = (l?.servicos||[]).includes(s) ? 'selected' : '';
      return `<option value="${s}" ${sel}>${s}</option>`;
    }).join('');
    const motivosPerda = ['Menor preÃ§o (perdemos)', 'DesclassificaÃ§Ã£o tÃ©cnica', 'InabilitaÃ§Ã£o documental', 'Recurso de concorrente', 'PreÃ§o acima do estimado', 'Outro'];

    Modal.open({
      title: id ? 'Editar LicitaÃ§Ã£o' : 'Nova LicitaÃ§Ã£o',
      size: 'modal-lg',
      body: `
        <div class="tabs mb-3">
          <button class="tab-btn active" onclick="switchTab(this,'fLicGeral')">Geral</button>
          <button class="tab-btn" onclick="switchTab(this,'fLicDatas')">Datas e Prazos</button>
          <button class="tab-btn" onclick="switchTab(this,'fLicFinanceiro')">Financeiro</button>
          <button class="tab-btn" onclick="switchTab(this,'fLicLinks')">Links e ServiÃ§os</button>
        </div>

        <!-- TAB GERAL -->
        <div id="fLicGeral">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">NÃºmero do Processo *</label>
              <input class="form-control" id="flNum" value="${Utils.escHtml(l?.numero||'')}" placeholder="Ex: PregÃ£o 001/2026 â€” UASG 123456">
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-control" id="flStatus">${statusOpts}</select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Objeto da LicitaÃ§Ã£o *</label>
            <textarea class="form-control" id="flObjeto" rows="3" placeholder="Descreva o objeto exato conforme o edital...">${Utils.escHtml(l?.objeto||'')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Ã“rgÃ£o Contratante *</label>
              <input class="form-control" id="flOrgao" value="${Utils.escHtml(l?.orgao||'')}" placeholder="Ex: Prefeitura Municipal de Londrina">
            </div>
            <div class="form-group">
              <label class="form-label">UASG / CÃ³digo</label>
              <input class="form-control" id="flUasg" value="${Utils.escHtml(l?.uasg||'')}" placeholder="123456">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Modalidade</label>
              <select class="form-control" id="flModalidade">${modalOpts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Portal / Plataforma</label>
              <select class="form-control" id="flPortal">${portalOpts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">ResponsÃ¡vel</label>
              <select class="form-control" id="flResp"><option value="">â€”</option>${respOpts}</select>
            </div>
          </div>
        </div>

        <!-- TAB DATAS -->
        <div id="fLicDatas" class="hidden">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">PublicaÃ§Ã£o do Edital</label>
              <input class="form-control" id="flDataPub" type="date" value="${l?.dataPublicacao||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Abertura das Propostas *</label>
              <input class="form-control" id="flDataAbertura" type="date" value="${l?.dataAbertura||''}">
            </div>
            <div class="form-group">
              <label class="form-label">PrevisÃ£o de Resultado</label>
              <input class="form-control" id="flDataResult" type="date" value="${l?.dataResultado||''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Prazo de ExecuÃ§Ã£o do Contrato (dias)</label>
              <input class="form-control" id="flPrazoExec" type="number" min="1" value="${l?.prazoExecucao||''}" placeholder="Ex: 180">
            </div>
          </div>
          <div style="background:var(--warning-light);border:1px solid var(--warning-border);padding:12px;border-radius:var(--radius);margin-top:8px">
            <div class="text-sm font-bold" style="color:var(--warning)">â° AtenÃ§Ã£o com Prazos</div>
            <div class="text-xs text-muted mt-1">Confira no edital os prazos para: impugnaÃ§Ãµes, pedidos de esclarecimento, envio de proposta e habilitaÃ§Ã£o. Registre nas Notas (aba no detalhamento da licitaÃ§Ã£o).</div>
          </div>
        </div>

        <!-- TAB FINANCEIRO -->
        <div id="fLicFinanceiro" class="hidden">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Valor Estimado (Edital)</label>
              <input class="form-control" id="flValorEst" type="number" step="0.01" value="${l?.valorEstimado||''}" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label">Nossa Proposta (R$)</label>
              <input class="form-control" id="flValorProp" type="number" step="0.01" value="${l?.valorProposta||''}" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label">Valor Adjudicado (R$)</label>
              <input class="form-control" id="flValorAdj" type="number" step="0.01" value="${l?.valorAdjudicado||''}" placeholder="Se ganhou">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">ColocaÃ§Ã£o Final</label>
              <input class="form-control" id="flColocacao" value="${Utils.escHtml(l?.colocacao||'')}" placeholder="Ex: 1Âº lugar, 3Âº lugar">
            </div>
            <div class="form-group">
              <label class="form-label">Motivo da Perda</label>
              <select class="form-control" id="flMotivoPerda">
                <option value="">â€”</option>
                ${motivosPerda.map(m => `<option value="${m}" ${l?.motivoPerda===m?'selected':''}>${m}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- TAB LINKS E SERVIÃ‡OS -->
        <div id="fLicLinks" class="hidden">
          <div class="form-group">
            <label class="form-label">Link do Edital</label>
            <input class="form-control" id="flLinkEdital" type="url" value="${Utils.escHtml(l?.linkEdital||'')}" placeholder="https://...">
          </div>
          <div class="form-group">
            <label class="form-label">Link do Portal</label>
            <input class="form-control" id="flLinkPortal" type="url" value="${Utils.escHtml(l?.linkPortal||'')}" placeholder="https://...">
          </div>
          <div class="form-group">
            <label class="form-label">ServiÃ§os Envolvidos</label>
            <select class="form-control" id="flServicos" multiple style="height:90px">${servicosOpts}</select>
            <div class="text-xs text-muted mt-1">Segure Ctrl para selecionar mÃºltiplos</div>
          </div>
          <div class="form-group">
            <label class="form-label">ObservaÃ§Ãµes Gerais</label>
            <textarea class="form-control" id="flObs" rows="3">${Utils.escHtml(l?.observacoes||'')}</textarea>
          </div>
        </div>
      `,
      saveCb: () => saveLic(id),
    });
  }

  /* â”€â”€ Save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function saveLic(id) {
    const numero = document.getElementById('flNum').value.trim();
    const objeto = document.getElementById('flObjeto').value.trim();
    const orgao  = document.getElementById('flOrgao').value.trim();
    if (!numero) { Toast.error('NÃºmero do processo obrigatÃ³rio'); return; }
    if (!objeto) { Toast.error('Objeto da licitaÃ§Ã£o obrigatÃ³rio'); return; }
    if (!orgao)  { Toast.error('Ã“rgÃ£o contratante obrigatÃ³rio'); return; }

    const servicos = [...(document.getElementById('flServicos')?.selectedOptions || [])].map(o => o.value);
    const data = {
      numero, objeto, orgao,
      uasg:            document.getElementById('flUasg').value,
      modalidade:      document.getElementById('flModalidade').value,
      portal:          document.getElementById('flPortal').value,
      responsavel:     document.getElementById('flResp').value,
      status:          document.getElementById('flStatus').value,
      dataPublicacao:  document.getElementById('flDataPub').value,
      dataAbertura:    document.getElementById('flDataAbertura').value,
      dataResultado:   document.getElementById('flDataResult').value,
      prazoExecucao:   Number(document.getElementById('flPrazoExec').value) || null,
      valorEstimado:   Number(document.getElementById('flValorEst').value) || null,
      valorProposta:   Number(document.getElementById('flValorProp').value) || null,
      valorAdjudicado: Number(document.getElementById('flValorAdj').value) || null,
      colocacao:       document.getElementById('flColocacao').value,
      motivoPerda:     document.getElementById('flMotivoPerda').value,
      linkEdital:      document.getElementById('flLinkEdital').value,
      linkPortal:      document.getElementById('flLinkPortal').value,
      servicos,
      observacoes:     document.getElementById('flObs').value,
    };

    if (id) { DB.update('licitacoes', id, data); Toast.success('LicitaÃ§Ã£o atualizada'); }
    else { DB.create('licitacoes', data); Toast.success('LicitaÃ§Ã£o cadastrada'); }
    Modal.close();
    render();
    App.updateNotifBadge();
  }

  /* â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function deleteLic(id) {
    const l = DB.get('licitacoes', id);
    Utils.confirmDelete(l?.numero || 'esta licitaÃ§Ã£o', () => {
      DB.remove('licitacoes', id);
      Toast.success('LicitaÃ§Ã£o removida');
      render();
    });
  }

  /* â”€â”€ IntegraÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function criarProjeto(id) {
    const l = DB.get('licitacoes', id);
    if (!l) return;
    const cfg = DB.getConfig();
    const seq = String(DB.getAll('projetos').length + 1).padStart(3, '0');
    const codigo = `BIK-${new Date().getFullYear()}-PRJ-${seq}`;
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${l.responsavel===r?'selected':''}>${r}</option>`).join('');

    Modal.open({
      title: 'ðŸ“‹ Criar Projeto â€” ' + l.numero,
      size: 'modal-lg',
      body: `
        <div style="background:var(--success-light);border:1px solid var(--success-border);padding:12px;border-radius:var(--radius);margin-bottom:16px;border-left:3px solid var(--success)">
          <div class="text-xs font-bold" style="color:var(--success)">LicitaÃ§Ã£o Ganhou ðŸŽ‰</div>
          <div class="font-bold text-sm mt-1">${Utils.escHtml(l.numero)}</div>
          <div class="text-sm text-muted">${Utils.escHtml(l.orgao)} Â· ${Utils.formatCurrency(l.valorAdjudicado||l.valorProposta||0)}</div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">TÃ­tulo do Projeto *</label>
            <input class="form-control" id="lpTitulo" value="${Utils.escHtml(Utils.truncate(l.objeto||'',80))}">
          </div>
          <div class="form-group">
            <label class="form-label">CÃ³digo</label>
            <input class="form-control" id="lpCodigo" value="${codigo}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor Contratado (R$)</label>
            <input class="form-control" id="lpValor" type="number" value="${l.valorAdjudicado||l.valorProposta||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de InÃ­cio</label>
            <input class="form-control" id="lpInicio" type="date" value="${Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo de Entrega</label>
            <input class="form-control" id="lpPrazo" type="date">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">ResponsÃ¡vel</label>
          <select class="form-control" id="lpResp"><option value="">â€”</option>${respOpts}</select>
        </div>`,
      saveCb: () => {
        const titulo = document.getElementById('lpTitulo').value.trim();
        if (!titulo) { Toast.error('TÃ­tulo obrigatÃ³rio'); return; }

        // Gerar OS automÃ¡tico
        const anoAtual = new Date().getFullYear();
        const osPrefix = `OS-${anoAtual}-`;
        const todosProj = DB.getAll('projetos');
        let maxOs = 0;
        todosProj.forEach(proj => {
          if (proj.ordemServico?.startsWith(osPrefix)) {
            const seq = parseInt(proj.ordemServico.replace(osPrefix, ''), 10);
            if (!isNaN(seq) && seq > maxOs) maxOs = seq;
          }
        });
        const osGerado = `${osPrefix}${String(maxOs + 1).padStart(5, '0')}`;

        DB.create('projetos', {
          titulo,
          codigo: document.getElementById('lpCodigo').value,
          clienteId: null,
          orgaoPublico: l.orgao,
          responsavel: document.getElementById('lpResp').value,
          dataInicio: document.getElementById('lpInicio').value,
          prazo: document.getElementById('lpPrazo').value,
          valor: Number(document.getElementById('lpValor').value) || 0,
          status: 'planejado',
          nfEmitida: false,
          pagamentoRecebido: false,
          etapas: [],
          ordemServico: osGerado,
          licitacaoOrigemId: id,
          leadId: l.leadId || null,
          observacoes: `Originado da licitaÃ§Ã£o ${l.numero} â€” ${l.orgao}`,
        });
        Toast.success('Projeto criado com sucesso!');
        Modal.close();
        App.navigate('projetos');
      },
    });
  }

  function criarRecebivel(id) {
    const l = DB.get('licitacoes', id);
    if (!l) return;
    if (DB.getAll('recebiveis').some(r => r.licitacaoOrigemId === id)) {
      Toast.error('JÃ¡ existe um recebÃ­vel para esta licitaÃ§Ã£o'); return;
    }
    const valor = l.valorAdjudicado || l.valorProposta || 0;
    DB.create('recebiveis', {
      clienteId: null,
      orgaoPublico: l.orgao,
      descricao: `${l.numero} â€” ${Utils.truncate(l.objeto, 60)}`,
      valorTotal: valor,
      licitacaoOrigemId: id,
      parcelas: [{ id: Date.now().toString(36), vencimento: Utils.todayStr(), valor, status: 'a_vencer', dataPagamento: null, nfNumero: '' }],
    });
    Toast.success('RecebÃ­vel criado! Configure as parcelas em Financeiro â†’ Contas a Receber.');
  }

  function addNew() { openForm(); }

  /* â”€â”€ Filtrar kanban â€” troca para lista com status aplicado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function filtrarKanban(status) {
    _filter.status = status;
    _tab = 'lista';
    render();
  }

  /* â”€â”€ CSV Import / Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function downloadCSVTemplate() {
    const bom = 'ï»¿';
    const header = 'numero;orgao;modalidade;portal;objeto;dataAbertura;valorEstimado;status';
    const example = '2025/001;Prefeitura de Exemplo;PregÃ£o EletrÃ´nico;Comprasnet (PNCP);ServiÃ§os de engenharia;2025-12-01;150000;identificada';
    const csv = bom + header + '\n' + example;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-licitacoes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let text = e.target.result;
        // Remove BOM if present
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) { Toast.error('CSV vazio ou sem dados.'); return; }

        // Detect separator
        const headerLine = lines[0];
        const sep = headerLine.includes(';') ? ';' : ',';

        // Parse header columns
        const cols = headerLine.split(sep).map(c => c.trim().toLowerCase());

        // Column name mapping
        const colMap = {
          'numero': 'numero',
          'orgao': 'orgao', 'Ã³rgÃ£o': 'orgao',
          'modalidade': 'modalidade',
          'portal': 'portal',
          'objeto': 'objeto',
          'dataabertura': 'dataAbertura', 'data abertura': 'dataAbertura', 'data_abertura': 'dataAbertura',
          'valorestimado': 'valorEstimado', 'valor estimado': 'valorEstimado', 'valor_estimado': 'valorEstimado',
          'status': 'status',
        };

        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(sep).map(v => v.trim());
          const row = {};
          cols.forEach((col, idx) => {
            const mapped = colMap[col];
            if (mapped) row[mapped] = values[idx] || '';
          });

          // Skip lines without orgao or numero
          if (!row.orgao && !row.numero) continue;

          // Parse valorEstimado
          if (row.valorEstimado) {
            row.valorEstimado = parseFloat(row.valorEstimado.replace(',', '.')) || null;
          } else {
            row.valorEstimado = null;
          }

          // Validate status
          if (!row.status || !STATUS[row.status]) row.status = 'identificada';

          DB.create('licitacoes', {
            ...row,
            id: Utils.uuid(),
            createdAt: new Date().toISOString(),
          });
          imported++;
        }

        Toast.success(`${imported} licitaÃ§Ã£o(Ãµes) importada(s)!`);
        render();
      } catch (err) {
        Toast.error('Erro ao processar CSV: ' + err.message);
      }
      // Reset input so same file can be re-imported
      event.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  return {
    render, openForm, saveLic, deleteLic, view, setFilter, setTab,
    changeStatus, toggleChecklist, saveNotas, criarProjeto, criarRecebivel, addNew,
    lancarNoPipeline, importCSV, downloadCSVTemplate, setPeriodo,
    filtrarKanban, recarregarPncp, moverKanbanPncp, importarPncp,
  };
})();
