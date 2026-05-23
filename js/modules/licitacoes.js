/* ==========================================
   LICITAÇÕES — Controle de processos licitatórios
   ========================================== */
const Licitacoes = (() => {

  /* ── Domínios ──────────────────────────────────────────────────────────── */

  const MODALIDADES = [
    'Pregão Eletrônico', 'Pregão Presencial', 'Concorrência', 'Tomada de Preços',
    'Convite', 'Dispensa de Licitação', 'Inexigibilidade', 'RDC', 'Chamamento Público', 'Outro',
  ];

  const PORTAIS = [
    'Comprasnet (PNCP)', 'BLL', 'BEC-SP', 'Licitanet', 'Portal Transparência PR',
    'Portal Transparência SC', 'Portal Transparência SP', 'Portal Transparência MG',
    'ComprasRS', 'Outro',
  ];

  const STATUS = {
    identificada:        { label: '🔍 Identificada',          badge: 'badge-gray',   color: '#64748b', desc: 'Edital encontrado, em análise inicial' },
    em_analise:          { label: '📋 Em Análise',            badge: 'badge-blue',   color: '#3b82f6', desc: 'Avaliando viabilidade técnica e financeira' },
    habilitacao:         { label: '📁 Habilitação',           badge: 'badge-purple', color: '#7c3aed', desc: 'Preparando documentação de habilitação' },
    proposta_preparando: { label: '📝 Preparando Proposta',   badge: 'badge-yellow', color: '#d97706', desc: 'Elaborando proposta técnica e de preços' },
    proposta_enviada:    { label: '📤 Proposta Enviada',      badge: 'badge-orange', color: '#ea580c', desc: 'Proposta submetida, aguardando sessão' },
    sessao_realizada:    { label: '🏛 Sessão Realizada',      badge: 'badge-blue',   color: '#0891b2', desc: 'Sessão pública realizada, aguardando resultado' },
    recurso:             { label: '⚖ Em Recurso',            badge: 'badge-yellow', color: '#ca8a04', desc: 'Recurso interposto ou prazo recursal aberto' },
    ganhou:              { label: '✅ Ganhou',                badge: 'badge-green',  color: '#059669', desc: 'Adjudicada e homologada' },
    perdeu:              { label: '❌ Perdeu',                badge: 'badge-red',    color: '#dc2626', desc: 'Outro licitante foi adjudicado' },
    deserta:             { label: '🚫 Deserta/Fracassada',    badge: 'badge-gray',   color: '#94a3b8', desc: 'Sem proposta válida ou revogada' },
    cancelada:           { label: '🗑 Cancelada',             badge: 'badge-gray',   color: '#94a3b8', desc: 'Licitação cancelada ou revogada' },
  };

  const CHECKLIST_GRUPOS = {
    juridica: {
      label: '📜 Habilitação Jurídica',
      itens: [
        'Contrato Social / Estatuto + alterações',
        'Ata de eleição da diretoria atual',
        'Documento de identidade dos sócios',
        'Certidão Simplificada da Junta Comercial',
      ],
    },
    fiscal: {
      label: '💰 Regularidade Fiscal e Trabalhista',
      itens: [
        'CNPJ — Cartão CNPJ atualizado',
        'CND Federal (Receita + Dívida Ativa)',
        'CND Estadual',
        'CND Municipal (ISS)',
        'CRF — Certidão FGTS (CEF)',
        'CNDT — Débitos Trabalhistas',
        'Simples Nacional (se aplicável)',
      ],
    },
    tecnica: {
      label: '🔧 Qualificação Técnica',
      itens: [
        'Registro no CREA / CFT',
        'Certidão de Acervo Técnico (CAT / CREA)',
        'Atestado de Capacidade Técnica',
        'ART de Responsabilidade Técnica',
        'Registro no CADASTRO SICAF / FORNECEDORES',
        'Alvará de Funcionamento / Licenças',
      ],
    },
    economica: {
      label: '📊 Qualificação Econômico-Financeira',
      itens: [
        'Balanço Patrimonial + DRE último exercício',
        'Certidão Negativa de Falência / Concordata',
        'Capital Social mínimo exigido',
      ],
    },
    proposta: {
      label: '📄 Documentos da Proposta',
      itens: [
        'Proposta de preços assinada',
        'Planilha de composição de custos',
        'BDI e encargos sociais (se exigido)',
        'Declarações obrigatórias do edital',
        'Amostras / Laudos técnicos (se exigido)',
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

  /* ── Render principal ─────────────────────────────────────────────────── */

  function render() {
    const lics = DB.getAll('licitacoes');
    const cfg  = DB.getConfig();
    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const licsFiltradas = _filtrarPorPeriodo(lics, 'dataAbertura');

    const emAndamento = licsFiltradas.filter(l => !['ganhou','perdeu','deserta','cancelada'].includes(l.status));
    const ganhou      = licsFiltradas.filter(l => l.status === 'ganhou');
    const perdeu      = licsFiltradas.filter(l => l.status === 'perdeu');
    const valorDisputa = emAndamento.reduce((s, l) => s + (l.valorEstimado || 0), 0);
    const valorGanho   = ganhou.reduce((s, l) => s + (l.valorAdjudicado || l.valorProposta || 0), 0);
    const taxa = licsFiltradas.length > 0 ? ((ganhou.length / licsFiltradas.length) * 100).toFixed(0) : 0;

    // abertura próxima (7 dias)
    const urgentes = emAndamento.filter(l => {
      const d = Utils.daysUntil(l.dataAbertura);
      return d != null && d >= 0 && d <= 7;
    }).length;

    let list = [...lics].sort((a, b) => (a.dataAbertura || '').localeCompare(b.dataAbertura || ''));
    if (_filter.status) list = list.filter(l => l.status === _filter.status);
    if (_filter.modalidade) list = list.filter(l => l.modalidade === _filter.modalidade);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Licitações</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Licitacoes.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <button class="btn btn-secondary" onclick="Licitacoes.setTab('lista')" id="btnTabLista">📋 Lista</button>
          <button class="btn btn-secondary" onclick="Licitacoes.setTab('kanban')" id="btnTabKanban">🏛 Kanban</button>
          <button class="btn btn-secondary" onclick="Licitacoes.setTab('pncp')" id="btnTabPncp" style="position:relative">🔍 PNCP Monitor<span id="pncpBadge" style="display:none;position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:1px 5px;min-width:16px;text-align:center"></span></button>
          <label class="btn btn-secondary" style="cursor:pointer" title="Importar licitações via CSV">
            📥 Importar CSV
            <input type="file" accept=".csv,.txt" style="display:none" onchange="Licitacoes.importCSV(event)">
          </label>
          <button class="btn btn-secondary" onclick="Licitacoes.downloadCSVTemplate()">📋 Modelo CSV</button>
          <button class="btn btn-primary" onclick="Licitacoes.openForm()">+ Nova Licitação</button>
        </div>
      </div>

      <div class="kpi-grid" style="--kpi-cols:5">
        <div class="kpi-card" style="--kpi-color:#3b82f6;cursor:pointer" title="Clique para filtrar em andamento" onclick="Licitacoes.setFilter('status','');Licitacoes.setTab('lista')">
          <div class="kpi-label">Em Andamento</div>
          <div class="kpi-value">${emAndamento.length}</div>
          <div class="kpi-sub">${Utils.formatCurrency(valorDisputa)} em disputa</div>
          <div class="kpi-icon">🏛</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f97316;cursor:pointer" title="Clique para ver abertura em ≤7 dias" onclick="Licitacoes.setFilter('status','proposta_enviada');Licitacoes.setTab('lista')">
          <div class="kpi-label">Abertura em ≤7 dias</div>
          <div class="kpi-value">${urgentes}</div>
          <div class="kpi-sub">${urgentes > 0 ? '⚠ Atenção necessária' : 'Sem urgências'}</div>
          <div class="kpi-icon">⏰</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" title="Clique para ver ganhas" onclick="Licitacoes.setFilter('status','ganhou');Licitacoes.setTab('lista')">
          <div class="kpi-label">Ganhas</div>
          <div class="kpi-value">${ganhou.length}</div>
          <div class="kpi-sub">${Utils.formatCurrency(valorGanho)}</div>
          <div class="kpi-icon">✅</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#ef4444;cursor:pointer" title="Clique para ver perdidas" onclick="Licitacoes.setFilter('status','perdeu');Licitacoes.setTab('lista')">
          <div class="kpi-label">Perdidas</div>
          <div class="kpi-value">${perdeu.length}</div>
          <div class="kpi-sub">${lics.length} total no período</div>
          <div class="kpi-icon">❌</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#7c3aed">
          <div class="kpi-label">Taxa de Vitória</div>
          <div class="kpi-value">${taxa}%</div>
          <div class="kpi-sub">${ganhou.length} de ${lics.length} disputadas</div>
          <div class="kpi-icon">🎯</div>
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

    // Auto-lançar no pipeline (10 dias antes da abertura)
    setTimeout(() => _autoLancarNoPipeline(), 200);
  }

  /* ── PNCP Monitor ─────────────────────────────────────────────────────── */

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
    // Dispara carga assíncrona e retorna skeleton
    if (!_pncpLoading) { _pncpLoading = true; _fetchPncp(); }

    const kanbanCols = [
      { key: 'nova',       label: '🔍 Novas',           color: '#3b82f6' },
      { key: 'analisando', label: '📋 Analisando',      color: '#f59e0b' },
      { key: 'proposta',   label: '📝 Elaborando Prop.', color: '#7c3aed' },
      { key: 'participar', label: '✅ Vamos Participar', color: '#10b981' },
      { key: 'descartada', label: '❌ Descartada',       color: '#ef4444' },
    ];

    if (_pncpData.length === 0) {
      return `
        <div class="card">
          <div style="padding:24px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">🏛</div>
            <div class="font-bold" style="margin-bottom:6px">Carregando licitações do PNCP...</div>
            <div class="text-sm text-muted">Buscando licitações encontradas automaticamente pelo monitor</div>
          </div>
        </div>`;
    }

    return `
      <div class="card mb-3">
        <div style="padding:14px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1">
            <div class="font-bold">🔍 PNCP Monitor — Licitações Descobertas Automaticamente</div>
            <div class="text-xs text-muted">${_pncpData.length} licitação(ões) capturadas · Arraste entre colunas ou clique para gerenciar</div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="Licitacoes.recarregarPncp()">🔄 Atualizar</button>
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
                  <div style="font-size:11px;color:var(--text-muted)">${cards.length} licitação(ões)</div>
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
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:3px">${Utils.escHtml(d.numero||d.numeroControlePNCP||'—')} · ${Utils.escHtml(d.uf||'')} · ${Utils.escHtml(d.municipio||'')}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.4;margin-bottom:6px">${Utils.escHtml(Utils.truncate(d.titulo||'',80))}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">🏛 ${Utils.escHtml(Utils.truncate(d.orgao||'',35))}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
          <div style="font-size:12px;font-weight:700;color:var(--primary)">${valor}</div>
          ${diasEnc != null && diasEnc >= 0 ? `<span style="font-size:10px;color:${encAlert?'#ef4444':'#94a3b8'};font-weight:600">📅 ${diasEnc}d restantes</span>` : ''}
        </div>
        <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
          ${d.linkPNCP ? `<a href="${Utils.escHtml(d.linkPNCP)}" target="_blank" class="btn btn-xs btn-secondary" style="font-size:10px">🔗 Edital</a>` : ''}
          <button class="btn btn-xs btn-primary" style="font-size:10px" onclick="Licitacoes.importarPncp('${l.id}')">↗ Criar Licitação</button>
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
      'Pregão - Eletrônico': 'Pregão Eletrônico',
      'Pregão - Presencial': 'Pregão Presencial',
      'Concorrência - Eletrônica': 'Concorrência',
      'Concorrência - Presencial': 'Concorrência',
      'Dispensa': 'Dispensa de Licitação',
      'Inexigibilidade': 'Inexigibilidade',
    };
    const modalidade = modalMap[d.modalidade] || d.modalidade || 'Pregão Eletrônico';

    // Criar licitação manual com dados do PNCP
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
      observacoes:     `Capturado automaticamente pelo monitor PNCP.\nUF: ${d.uf} · ${d.municipio}\nID PNCP: ${d.numeroControlePNCP||id}`,
    });

    // Marcar como importada no banco PNCP
    moverKanbanPncp(id, 'participar');

    Toast.success('✅ Licitação criada no CRM! Configure os detalhes e adicione ao pipeline.');
    _tab = 'lista';
    render();
  }

  /* ── Auto-lançamento no pipeline ──────────────────────────────────────── */

  const _DIAS_ANTECEDENCIA = 10;
  const _TERMINAL = ['ganhou', 'perdeu', 'deserta', 'cancelada'];

  function _autoLancarNoPipeline() {
    const lics = DB.getAll('licitacoes');
    let lancadas = 0;

    lics.forEach(l => {
      // Ignorar terminais e as que já têm lead vinculado
      if (_TERMINAL.includes(l.status)) return;
      if (l.leadId) return; // já está no pipeline

      const dias = Utils.daysUntil(l.dataAbertura);
      if (dias == null) return;                    // sem data de abertura
      if (dias > _DIAS_ANTECEDENCIA) return;       // ainda não é hora
      if (dias < -30) return;                      // abertura muito no passado, ignora

      // Chegou a hora — criar lead no pipeline
      _criarLeadNoPipeline(l);
      lancadas++;
    });

    if (lancadas > 0) {
      Toast.show(
        `🏛 ${lancadas} licitação(ões) lançada(s) automaticamente no pipeline ` +
        `(abertura em ≤${_DIAS_ANTECEDENCIA} dias).`,
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
    // Calcular próxima ação: 3 dias antes da abertura (ou amanhã se < 3 dias)
    let dataAcao = lic.dataAbertura;
    if (dataAcao) {
      const d = new Date(dataAcao);
      d.setDate(d.getDate() - 3);
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      if (d < hoje) d.setDate(hoje.getDate() + 1);
      dataAcao = d.toISOString().split('T')[0];
    }

    const lead = DB.create('leads', {
      titulo: `${lic.numero} — ${Utils.truncate(lic.objeto || '', 70)}`,
      origemLead: 'Licitação Pública',
      status: 'proposta_elaboracao', // já está em elaboração de proposta
      clienteId: null,
      segmento: 'Governo / Órgão Público',
      valorEstimado: lic.valorEstimado || 0,
      responsavel: lic.responsavel || '',
      proximaAcao: 'Preparar proposta técnica e comercial para licitação',
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
      observacoes: `Auto-lançado pelo módulo de Licitações ${_DIAS_ANTECEDENCIA} dias antes da abertura.`,
    });

    // Gravar leadId de volta na licitação para rastreamento
    DB.update('licitacoes', lic.id, {
      leadId: lead.id,
      dataLancamentoPipeline: Utils.todayStr(),
    });
  }

  /* Lançamento manual (botão na tabela ou no view) */
  function lancarNoPipeline(id) {
    const l = DB.get('licitacoes', id);
    if (!l) return;
    if (l.leadId) {
      // Já lançado — navega para o lead
      Toast.show('Esta licitação já está no pipeline. Abrindo...');
      setTimeout(() => { App.navigate('pipeline'); }, 500);
      return;
    }
    if (_TERMINAL.includes(l.status)) {
      Toast.warning('Licitações finalizadas não são lançadas no pipeline.'); return;
    }
    _criarLeadNoPipeline(l);
    Toast.success(`🏛 Licitação "${l.numero}" lançada no pipeline!`);
    Modal.close();
    render();
  }

  /* ── Lista ────────────────────────────────────────────────────────────── */

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
          <span class="text-sm text-muted">${list.length} licitação(ões)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? emptyState() : `
          <table class="tbl">
            <thead><tr>
              <th>Processo</th><th>Objeto</th><th>Órgão</th><th>Modalidade</th>
              <th>Abertura</th><th>Val. Estimado</th><th>Val. Proposta</th>
              <th>Status</th><th>Pipeline</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${list.map(l => {
                const dias = Utils.daysUntil(l.dataAbertura);
                const terminal = _TERMINAL.includes(l.status);

                // Coluna Pipeline
                let pipelineCell;
                if (l.leadId) {
                  pipelineCell = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#0f766e;background:#f0fdfa;padding:2px 8px;border-radius:99px;border:1px solid #0f766e33">✅ No pipeline</span>
                    <div class="text-xs text-muted" style="margin-top:2px">${Utils.formatDate(l.dataLancamentoPipeline)}</div>`;
                } else if (terminal) {
                  pipelineCell = `<span class="text-xs text-muted">—</span>`;
                } else if (dias != null && dias <= _DIAS_ANTECEDENCIA) {
                  pipelineCell = `<span style="font-size:11px;color:#f97316;font-weight:600">⏳ Lançando...</span>`;
                } else {
                  const faltam = dias != null ? `em ${dias}d` : 'data indefinida';
                  pipelineCell = `<span class="text-xs text-muted">Automático ${faltam}</span>
                    <br><button class="btn btn-xs btn-secondary" style="margin-top:3px" onclick="Licitacoes.lancarNoPipeline('${l.id}')" title="Lançar agora manualmente">↗ Agora</button>`;
                }

                // Alerta de abertura próxima
                const aberturaColor = dias == null ? '' : dias < 0 ? '#ef4444' : dias <= 3 ? '#f97316' : dias <= 10 ? '#f59e0b' : '';
                const aberturaLabel = dias == null ? '—' : dias < 0 ? `Encerrado ${Math.abs(dias)}d` : dias === 0 ? '⚠ HOJE' : `${dias}d restantes`;

                const lic_status = STATUS[l.status] || { label: l.status, badge: 'badge-gray' };
                return `<tr>
                  <td>
                    <div class="font-bold text-sm" style="color:var(--primary)">${Utils.escHtml(l.numero || '—')}</div>
                    <div class="text-xs text-muted">${Utils.escHtml(l.portal || '')}</div>
                  </td>
                  <td><div style="max-width:200px;font-size:13px">${Utils.escHtml(Utils.truncate(l.objeto || '', 70))}</div></td>
                  <td class="text-sm">${Utils.escHtml(l.orgao || '—')}<br><span class="text-xs text-muted">${Utils.escHtml(l.uasg ? 'UASG '+l.uasg : '')}</span></td>
                  <td class="text-xs">${Utils.escHtml(l.modalidade || '—')}</td>
                  <td class="text-sm">
                    <div>${Utils.formatDate(l.dataAbertura)}</div>
                    ${aberturaColor ? `<div style="font-size:11px;font-weight:700;color:${aberturaColor}">${aberturaLabel}</div>` : `<div class="text-xs text-muted">${aberturaLabel}</div>`}
                  </td>
                  <td class="font-bold text-sm">${l.valorEstimado ? Utils.formatCurrency(l.valorEstimado) : '—'}</td>
                  <td class="text-sm ${l.valorProposta && l.valorEstimado && l.valorProposta < l.valorEstimado ? 'text-success' : ''}">${l.valorProposta ? Utils.formatCurrency(l.valorProposta) : '—'}</td>
                  <td><span class="badge ${lic_status.badge}" style="font-size:11px">${lic_status.label}</span></td>
                  <td>${pipelineCell}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Licitacoes.view('${l.id}')">Ver</button>
                      <button class="btn btn-xs btn-secondary" onclick="Licitacoes.openForm('${l.id}')">✏</button>
                      <button class="btn btn-xs btn-danger" onclick="Licitacoes.deleteLic('${l.id}')">🗑</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>`;
  }

  /* ── Kanban ───────────────────────────────────────────────────────────── */

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
                  <div style="font-size:11px;color:var(--text-muted)">${cards.length} · ${Utils.formatCurrency(total)}</div>
                  <div style="font-size:10px;color:var(--text-muted);margin-top:2px;opacity:.7">🔍 Ver lista filtrada</div>
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
              <div style="font-size:12px;font-weight:700;color:#10b981">✅ Ganhas</div>
              <div style="font-size:11px;color:var(--text-muted)">${lics.filter(l=>l.status==='ganhou').length} · ${Utils.formatCurrency(lics.filter(l=>l.status==='ganhou').reduce((s,l)=>s+(l.valorAdjudicado||l.valorProposta||0),0))}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;opacity:.7">🔍 Ver lista filtrada</div>
            </div>
            ${lics.filter(l=>l.status==='ganhou').map(l => renderKanbanCard(l)).join('')}
          </div>
          <div style="width:200px;flex-shrink:0">
            <div style="padding:10px 12px;border-radius:var(--radius);background:var(--surface);border-top:3px solid #ef4444;margin-bottom:8px;cursor:pointer;transition:box-shadow .15s"
                 title="Clique para ver perdidas/canceladas"
                 onclick="Licitacoes.filtrarKanban('perdeu')"
                 onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'"
                 onmouseout="this.style.boxShadow='none'">
              <div style="font-size:12px;font-weight:700;color:#ef4444">❌ Perdidas / Canceladas</div>
              <div style="font-size:11px;color:var(--text-muted)">${lics.filter(l=>['perdeu','deserta','cancelada'].includes(l.status)).length}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;opacity:.7">🔍 Ver lista filtrada</div>
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
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:3px">${Utils.escHtml(l.numero||'—')}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.4;margin-bottom:6px">${Utils.escHtml(Utils.truncate(l.objeto||'',60))}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">🏛 ${Utils.escHtml(Utils.truncate(l.orgao||'',30))}</div>
        ${l.valorEstimado ? `<div style="font-size:12px;font-weight:700;color:var(--primary)">${Utils.formatCurrency(l.valorEstimado)}</div>` : ''}
        ${dias != null && dias >= 0 ? `<div style="font-size:10px;color:${dias<=3?'#ef4444':dias<=7?'#d97706':'#94a3b8'};margin-top:4px">📅 Abertura em ${dias}d</div>` : ''}
      </div>`;
  }

  function emptyState() {
    return `<div class="empty-state"><div class="empty-icon">🏛</div><div class="empty-title">Nenhuma licitação cadastrada</div><div class="empty-sub">Cadastre processos licitatórios para acompanhar os prazos e a documentação</div><button class="btn btn-primary mt-4" onclick="Licitacoes.openForm()">+ Nova Licitação</button></div>`;
  }

  function setFilter(k, v) { _filter[k] = v; render(); }
  function setTab(t) { _tab = t; render(); }

  /* ── View detalhado ───────────────────────────────────────────────────── */

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
      title: `🏛 ${l.numero || 'Licitação'}`,
      size: 'modal-lg',
      body: `
        <!-- Header -->
        <div style="background:var(--bg);padding:16px;border-radius:var(--radius);margin-bottom:20px;border-left:4px solid ${lic_status.color}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div style="flex:1">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${Utils.escHtml(l.modalidade||'')} · ${Utils.escHtml(l.portal||'')}</div>
              <div style="font-size:16px;font-weight:700;color:var(--text);line-height:1.4">${Utils.escHtml(l.objeto||'—')}</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">🏛 ${Utils.escHtml(l.orgao||'—')}${l.uasg ? ` <span class="text-muted" style="font-size:11px">UASG: ${l.uasg}</span>` : ''}</div>
            </div>
            <div style="text-align:right">
              <span class="badge ${lic_status.badge}" style="font-size:12px;padding:4px 10px">${lic_status.label}</span>
              ${l.linkPortal ? `<br><a href="${Utils.escHtml(l.linkPortal)}" target="_blank" class="btn btn-xs btn-secondary mt-2">🔗 Portal</a>` : ''}
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tabs mb-3">
          <button class="tab-btn active" onclick="switchTab(this,'licTabInfo')">📋 Informações</button>
          <button class="tab-btn" onclick="switchTab(this,'licTabChecklist')">✅ Checklist <span class="badge ${pctChecklist===100?'badge-green':pctChecklist>0?'badge-yellow':'badge-gray'}" style="margin-left:4px">${pctChecklist}%</span></button>
          <button class="tab-btn" onclick="switchTab(this,'licTabProposta')">💰 Proposta</button>
          <button class="tab-btn" onclick="switchTab(this,'licTabHistorico')">📝 Notas</button>
        </div>

        <!-- TAB: Informações -->
        <div id="licTabInfo">
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-label">Nº do Processo</div><div class="detail-value font-bold">${Utils.escHtml(l.numero||'—')}</div></div>
            <div class="detail-field"><div class="detail-label">Modalidade</div><div class="detail-value">${Utils.escHtml(l.modalidade||'—')}</div></div>
            <div class="detail-field"><div class="detail-label">Responsável</div><div class="detail-value">${Utils.escHtml(l.responsavel||'—')}</div></div>
            <div class="detail-field"><div class="detail-label">Portal / Plataforma</div><div class="detail-value">${Utils.escHtml(l.portal||'—')}</div></div>
            <div class="detail-field"><div class="detail-label">Publicação do Edital</div><div class="detail-value">${Utils.formatDate(l.dataPublicacao)}</div></div>
            <div class="detail-field"><div class="detail-label">Abertura das Propostas</div>
              <div class="detail-value ${diasAbertura != null && diasAbertura >= 0 && diasAbertura <= 7 ? 'text-danger' : ''}">
                ${Utils.formatDate(l.dataAbertura)}
                ${diasAbertura != null && diasAbertura >= 0 ? `<span class="badge ${diasAbertura<=3?'badge-red':diasAbertura<=7?'badge-yellow':'badge-gray'}" style="font-size:10px">em ${diasAbertura}d</span>` : ''}
                ${diasAbertura != null && diasAbertura < 0 ? `<span class="badge badge-gray" style="font-size:10px">há ${Math.abs(diasAbertura)}d</span>` : ''}
              </div>
            </div>
            <div class="detail-field"><div class="detail-label">Previsão de Resultado</div><div class="detail-value">${Utils.formatDate(l.dataResultado)}</div></div>
            <div class="detail-field"><div class="detail-label">Prazo de Execução</div><div class="detail-value">${l.prazoExecucao ? l.prazoExecucao + ' dias' : '—'}</div></div>
          </div>
          ${l.linkEdital ? `<div class="mt-2"><a href="${Utils.escHtml(l.linkEdital)}" target="_blank" class="btn btn-sm btn-secondary">📄 Baixar Edital</a></div>` : ''}
          ${l.servicos?.length ? `<div class="detail-field mt-3"><div class="detail-label">Serviços Envolvidos</div><div class="detail-value" style="display:flex;flex-wrap:wrap;gap:6px">${l.servicos.map(s => `<span class="badge badge-blue">${Utils.escHtml(s)}</span>`).join('')}</div></div>` : ''}
          ${l.observacoes ? `<div class="detail-field mt-3"><div class="detail-label">Observações</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(l.observacoes)}</div></div>` : ''}
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
            <div class="detail-field"><div class="detail-label">Valor Estimado (Edital)</div><div class="detail-value font-bold" style="font-size:18px;color:var(--text-secondary)">${l.valorEstimado ? Utils.formatCurrency(l.valorEstimado) : '—'}</div></div>
            <div class="detail-field"><div class="detail-label">Nossa Proposta</div><div class="detail-value font-bold" style="font-size:18px;color:var(--primary)">${l.valorProposta ? Utils.formatCurrency(l.valorProposta) : '—'}</div></div>
            <div class="detail-field"><div class="detail-label">Valor Adjudicado</div><div class="detail-value font-bold" style="font-size:18px;color:var(--success)">${l.valorAdjudicado ? Utils.formatCurrency(l.valorAdjudicado) : '—'}</div></div>
            <div class="detail-field"><div class="detail-label">Desconto s/ Estimado</div><div class="detail-value">${l.valorProposta && l.valorEstimado ? (((l.valorEstimado - l.valorProposta) / l.valorEstimado) * 100).toFixed(1) + '%' : '—'}</div></div>
            ${l.status === 'perdeu' ? `<div class="detail-field"><div class="detail-label">Colocação Final</div><div class="detail-value">${Utils.escHtml(l.colocacao||'—')}</div></div>` : ''}
            ${l.motivoPerda ? `<div class="detail-field"><div class="detail-label">Motivo da Perda</div><div class="detail-value text-danger">${Utils.escHtml(l.motivoPerda)}</div></div>` : ''}
          </div>
          ${l.status === 'ganhou' ? `
            <div style="background:var(--success-light);border:1px solid var(--success-border);padding:14px;border-radius:var(--radius);margin-top:8px">
              <div class="font-bold text-sm" style="color:var(--success)">🎉 Licitação Ganha!</div>
              <div class="text-sm mt-1">Crie um projeto para iniciar a execução do contrato.</div>
              <button class="btn btn-success btn-sm mt-2" onclick="Modal.close();Licitacoes.criarProjeto('${id}')">📋 Criar Projeto</button>
              <button class="btn btn-primary btn-sm mt-2" onclick="Modal.close();Licitacoes.criarRecebivel('${id}')">💰 Criar Recebível</button>
            </div>` : ''}
        </div>

        <!-- TAB: Notas -->
        <div id="licTabHistorico" class="hidden">
          <div class="form-group">
            <label class="form-label">Notas e Andamento do Processo</label>
            <textarea class="form-control" id="licNota" rows="6" placeholder="Registre aqui informações do processo: impugnações, esclarecimentos, habilitação, recursos...">${Utils.escHtml(l.notas||'')}</textarea>
          </div>
          <button class="btn btn-primary btn-sm" onclick="Licitacoes.saveNotas('${id}')">💾 Salvar Notas</button>
        </div>

        <!-- Pipeline status no view -->
        ${(() => {
          if (l.leadId) {
            return `<div style="background:#f0fdfa;border:1px solid #0f766e44;border-radius:var(--radius);padding:12px;margin-top:12px;display:flex;align-items:center;gap:12px">
              <span style="font-size:22px">🏛</span>
              <div style="flex:1">
                <div class="font-bold text-sm" style="color:#0f766e">No pipeline desde ${Utils.formatDate(l.dataLancamentoPipeline)}</div>
                <div class="text-xs text-muted">Acompanhe o andamento na tela Pipeline → filtro "Licitação Pública"</div>
              </div>
              <button class="btn btn-sm btn-secondary" onclick="Modal.close();App.navigate('pipeline')">Ir ao Pipeline →</button>
            </div>`;
          }
          if (_TERMINAL.includes(l.status)) return '';
          const diasAbertura = Utils.daysUntil(l.dataAbertura);
          const faltam = diasAbertura != null ? `${diasAbertura} dias` : 'data indefinida';
          return `<div style="background:#fffbeb;border:1px solid #f59e0b44;border-radius:var(--radius);padding:12px;margin-top:12px;display:flex;align-items:center;gap:12px">
            <span style="font-size:22px">⏳</span>
            <div style="flex:1">
              <div class="font-bold text-sm">Lançamento automático no pipeline</div>
              <div class="text-xs text-muted">Faltam <strong>${faltam}</strong> para a abertura · será lançada automaticamente ${diasAbertura != null && diasAbertura <= _DIAS_ANTECEDENCIA ? '<strong style="color:#f97316">agora (≤10 dias)</strong>' : `quando restar ${_DIAS_ANTECEDENCIA} dias`}</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="Licitacoes.lancarNoPipeline('${id}')">↗ Lançar agora</button>
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
            <button class="btn btn-secondary btn-sm" onclick="Modal.close();Licitacoes.openForm('${id}')">✏ Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
          </div>
        </div>
      `,
    });
  }

  /* ── Checklist inline ──────────────────────────────────────────────────── */

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
          motivoPerda: leadStatus === 'fechado_perdido' ? (licAtualizada.motivoPerda || 'Licitação perdida') : undefined,
          'licitacao.resultado': status === 'ganhou' ? 'Ganhou' : 'Perdeu',
        });
        Toast.show(`Pipeline atualizado: lead movido para "${leadStatus === 'fechado_ganho' ? 'Fechado/Ganho' : 'Fechado/Perdido'}".`);
      }
    }

    Modal.close();
    render();
  }

  /* ── Form ──────────────────────────────────────────────────────────────── */

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
    const motivosPerda = ['Menor preço (perdemos)', 'Desclassificação técnica', 'Inabilitação documental', 'Recurso de concorrente', 'Preço acima do estimado', 'Outro'];

    Modal.open({
      title: id ? 'Editar Licitação' : 'Nova Licitação',
      size: 'modal-lg',
      body: `
        <div class="tabs mb-3">
          <button class="tab-btn active" onclick="switchTab(this,'fLicGeral')">Geral</button>
          <button class="tab-btn" onclick="switchTab(this,'fLicDatas')">Datas e Prazos</button>
          <button class="tab-btn" onclick="switchTab(this,'fLicFinanceiro')">Financeiro</button>
          <button class="tab-btn" onclick="switchTab(this,'fLicLinks')">Links e Serviços</button>
        </div>

        <!-- TAB GERAL -->
        <div id="fLicGeral">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Número do Processo *</label>
              <input class="form-control" id="flNum" value="${Utils.escHtml(l?.numero||'')}" placeholder="Ex: Pregão 001/2026 — UASG 123456">
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-control" id="flStatus">${statusOpts}</select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Objeto da Licitação *</label>
            <textarea class="form-control" id="flObjeto" rows="3" placeholder="Descreva o objeto exato conforme o edital...">${Utils.escHtml(l?.objeto||'')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Órgão Contratante *</label>
              <input class="form-control" id="flOrgao" value="${Utils.escHtml(l?.orgao||'')}" placeholder="Ex: Prefeitura Municipal de Londrina">
            </div>
            <div class="form-group">
              <label class="form-label">UASG / Código</label>
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
              <label class="form-label">Responsável</label>
              <select class="form-control" id="flResp"><option value="">—</option>${respOpts}</select>
            </div>
          </div>
        </div>

        <!-- TAB DATAS -->
        <div id="fLicDatas" class="hidden">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Publicação do Edital</label>
              <input class="form-control" id="flDataPub" type="date" value="${l?.dataPublicacao||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Abertura das Propostas *</label>
              <input class="form-control" id="flDataAbertura" type="date" value="${l?.dataAbertura||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Previsão de Resultado</label>
              <input class="form-control" id="flDataResult" type="date" value="${l?.dataResultado||''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Prazo de Execução do Contrato (dias)</label>
              <input class="form-control" id="flPrazoExec" type="number" min="1" value="${l?.prazoExecucao||''}" placeholder="Ex: 180">
            </div>
          </div>
          <div style="background:var(--warning-light);border:1px solid var(--warning-border);padding:12px;border-radius:var(--radius);margin-top:8px">
            <div class="text-sm font-bold" style="color:var(--warning)">⏰ Atenção com Prazos</div>
            <div class="text-xs text-muted mt-1">Confira no edital os prazos para: impugnações, pedidos de esclarecimento, envio de proposta e habilitação. Registre nas Notas (aba no detalhamento da licitação).</div>
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
              <label class="form-label">Colocação Final</label>
              <input class="form-control" id="flColocacao" value="${Utils.escHtml(l?.colocacao||'')}" placeholder="Ex: 1º lugar, 3º lugar">
            </div>
            <div class="form-group">
              <label class="form-label">Motivo da Perda</label>
              <select class="form-control" id="flMotivoPerda">
                <option value="">—</option>
                ${motivosPerda.map(m => `<option value="${m}" ${l?.motivoPerda===m?'selected':''}>${m}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- TAB LINKS E SERVIÇOS -->
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
            <label class="form-label">Serviços Envolvidos</label>
            <select class="form-control" id="flServicos" multiple style="height:90px">${servicosOpts}</select>
            <div class="text-xs text-muted mt-1">Segure Ctrl para selecionar múltiplos</div>
          </div>
          <div class="form-group">
            <label class="form-label">Observações Gerais</label>
            <textarea class="form-control" id="flObs" rows="3">${Utils.escHtml(l?.observacoes||'')}</textarea>
          </div>
        </div>
      `,
      saveCb: () => saveLic(id),
    });
  }

  /* ── Save ──────────────────────────────────────────────────────────────── */

  function saveLic(id) {
    const numero = document.getElementById('flNum').value.trim();
    const objeto = document.getElementById('flObjeto').value.trim();
    const orgao  = document.getElementById('flOrgao').value.trim();
    if (!numero) { Toast.error('Número do processo obrigatório'); return; }
    if (!objeto) { Toast.error('Objeto da licitação obrigatório'); return; }
    if (!orgao)  { Toast.error('Órgão contratante obrigatório'); return; }

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

    if (id) { DB.update('licitacoes', id, data); Toast.success('Licitação atualizada'); }
    else { DB.create('licitacoes', data); Toast.success('Licitação cadastrada'); }
    Modal.close();
    render();
    App.updateNotifBadge();
  }

  /* ── Delete ───────────────────────────────────────────────────────────── */

  function deleteLic(id) {
    const l = DB.get('licitacoes', id);
    Utils.confirmDelete(l?.numero || 'esta licitação', () => {
      DB.remove('licitacoes', id);
      Toast.success('Licitação removida');
      render();
    });
  }

  /* ── Integrações ──────────────────────────────────────────────────────── */

  function criarProjeto(id) {
    const l = DB.get('licitacoes', id);
    if (!l) return;
    const cfg = DB.getConfig();
    const seq = String(DB.getAll('projetos').length + 1).padStart(3, '0');
    const codigo = `BIK-${new Date().getFullYear()}-PRJ-${seq}`;
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${l.responsavel===r?'selected':''}>${r}</option>`).join('');

    Modal.open({
      title: '📋 Criar Projeto — ' + l.numero,
      size: 'modal-lg',
      body: `
        <div style="background:var(--success-light);border:1px solid var(--success-border);padding:12px;border-radius:var(--radius);margin-bottom:16px;border-left:3px solid var(--success)">
          <div class="text-xs font-bold" style="color:var(--success)">Licitação Ganhou 🎉</div>
          <div class="font-bold text-sm mt-1">${Utils.escHtml(l.numero)}</div>
          <div class="text-sm text-muted">${Utils.escHtml(l.orgao)} · ${Utils.formatCurrency(l.valorAdjudicado||l.valorProposta||0)}</div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Título do Projeto *</label>
            <input class="form-control" id="lpTitulo" value="${Utils.escHtml(Utils.truncate(l.objeto||'',80))}">
          </div>
          <div class="form-group">
            <label class="form-label">Código</label>
            <input class="form-control" id="lpCodigo" value="${codigo}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor Contratado (R$)</label>
            <input class="form-control" id="lpValor" type="number" value="${l.valorAdjudicado||l.valorProposta||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input class="form-control" id="lpInicio" type="date" value="${Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo de Entrega</label>
            <input class="form-control" id="lpPrazo" type="date">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Responsável</label>
          <select class="form-control" id="lpResp"><option value="">—</option>${respOpts}</select>
        </div>`,
      saveCb: () => {
        const titulo = document.getElementById('lpTitulo').value.trim();
        if (!titulo) { Toast.error('Título obrigatório'); return; }

        // Gerar OS automático
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
          observacoes: `Originado da licitação ${l.numero} — ${l.orgao}`,
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
      Toast.error('Já existe um recebível para esta licitação'); return;
    }
    const valor = l.valorAdjudicado || l.valorProposta || 0;
    DB.create('recebiveis', {
      clienteId: null,
      orgaoPublico: l.orgao,
      descricao: `${l.numero} — ${Utils.truncate(l.objeto, 60)}`,
      valorTotal: valor,
      licitacaoOrigemId: id,
      parcelas: [{ id: Date.now().toString(36), vencimento: Utils.todayStr(), valor, status: 'a_vencer', dataPagamento: null, nfNumero: '' }],
    });
    Toast.success('Recebível criado! Configure as parcelas em Financeiro → Contas a Receber.');
  }

  function addNew() { openForm(); }

  /* ── Filtrar kanban — troca para lista com status aplicado ──────────── */
  function filtrarKanban(status) {
    _filter.status = status;
    _tab = 'lista';
    render();
  }

  /* ── CSV Import / Export ─────────────────────────────────────────────── */

  function downloadCSVTemplate() {
    const bom = '﻿';
    const header = 'numero;orgao;modalidade;portal;objeto;dataAbertura;valorEstimado;status';
    const example = '2025/001;Prefeitura de Exemplo;Pregão Eletrônico;Comprasnet (PNCP);Serviços de engenharia;2025-12-01;150000;identificada';
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
          'orgao': 'orgao', 'órgão': 'orgao',
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

        Toast.success(`${imported} licitação(ões) importada(s)!`);
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
