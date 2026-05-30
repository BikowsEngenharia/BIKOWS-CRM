/* ==========================================
   APP.js — Roteador e controlador principal
   ========================================== */
const App = (() => {

  const PAGES = {
    dashboard:  { title: 'Dashboard',       module: Dashboard,   addLabel: null },
    pipeline:   { title: 'Pipeline CRM',    module: Pipeline,    addLabel: '+ Novo Lead' },
    clientes:   { title: 'Clientes',        module: Clientes,    addLabel: '+ Novo Cliente' },
    contatos:   { title: 'Contatos',        module: Contatos,    addLabel: '+ Novo Contato' },
    projetos:   { title: 'Projetos',        module: Projetos,    addLabel: '+ Novo Projeto' },
    atividades: { title: 'Atividades',      module: Atividades,  addLabel: '+ Nova Atividade' },
    propostas:  { title: 'Propostas',       module: Propostas,   addLabel: '+ Nova Proposta' },
    contratos:  { title: 'Contratos',       module: Contratos,   addLabel: '+ Novo Contrato' },
    financeiro: { title: 'Financeiro',      module: Financeiro,  addLabel: '+ Novo Recebível' },
    rh:         { title: 'RH / Folha',      module: Folha,       addLabel: '+ Novo Funcionário' },
    calendario:  { title: 'Calendário',      module: Calendario,   addLabel: '+ Nova Atividade' },
    licitacoes:  { title: 'Licitações',      module: Licitacoes,   addLabel: '+ Nova Licitação' },
    relatorios:  { title: 'Relatórios',      module: Relatorios,   addLabel: null },
    documentos:  { title: 'Documentos',      module: Documentos,   addLabel: '+ Novo Documento' },
    metas:      { title: 'Metas & KPIs',    module: Metas,       addLabel: '+ Nova Meta' },
    marketing:  { title: 'Marketing',       module: Marketing,   addLabel: '+ Novo Conteúdo' },
    trafego:    { title: 'Tráfego Pago',    module: Trafego,     addLabel: '+ Nova Campanha' },
    config:     { title: 'Configurações',   module: Config,      addLabel: null },
    prospeccao: { title: 'Prospecção',      module: Prospeccao,  addLabel: null },
  };

  let _currentPage = 'dashboard';
  let _sidebarCollapsed = false;
  let _searchResultActions = [];
  let _searchSelectedIdx = -1;

  // Mapa de entidade → página para refresh por Realtime
  const _ENTITY_PAGE = {
    clientes: 'clientes', contatos: 'contatos', leads: 'pipeline',
    projetos: 'projetos', atividades: 'atividades', propostas: 'propostas',
    contratos: 'contratos',
    recebiveis: 'financeiro', funcionarios: 'rh', lancamentos: 'financeiro',
    contaspagar: 'financeiro', folha: 'rh', licitacoes: 'licitacoes',
    metas: 'metas',
    marketing_posts: 'marketing', marketing_campanhas: 'marketing',
    marketing_ideias: 'marketing', marketing_kpis: 'marketing',
    trafego_campanhas: 'trafego', trafego_metas: 'trafego',
    documentos: 'documentos',
  };

  function refreshIfNeeded(entity) {
    const page = _ENTITY_PAGE[entity];
    if (page && page === _currentPage) {
      try { PAGES[page]?.module?.render?.(); } catch (e) { /* silencioso */ }
    }
    updateNotifBadge();
  }

  function init() {
    _applyDark();
    updateBrand();
    updateUserInfo();
    // Init Google Calendar integration if configured
    if (typeof GoogleCal !== 'undefined') GoogleCal.init();

    // Navigation
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(link.dataset.page);
      });
    });

    navigate('dashboard');
    updateNotifBadge();
    // Aplicar restrições de navegação após carregamento inicial
    setTimeout(() => aplicarPermissoesNavegacao(), 200);

    // Restaurar estado collapsed da sidebar (desktop)
    const savedCollapsed = localStorage.getItem('crm_sidebar_collapsed') === '1';
    if (savedCollapsed && window.innerWidth > 900) {
      _sidebarCollapsed = true;
      document.getElementById('sidebar')?.classList.add('collapsed');
    }

    // Fechar sidebar ao navegar (mobile)
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          document.getElementById('sidebar')?.classList.remove('mobile-open');
          document.getElementById('sidebarOverlay')?.classList.remove('active');
        }
      });
    });

    // Fechar sidebar overlay ao redimensionar para desktop
    window.addEventListener('resize', () => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      if (window.innerWidth > 900) {
        sidebar.classList.remove('mobile-open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
      }
    });

    // Keyboard navigation for global search
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
      searchInput.addEventListener('keydown', _handleSearchKeydown);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const inInput = ['input','textarea','select'].includes(tag);
      const modalOpen = document.getElementById('modalBackdrop').classList.contains('open');
      const confirmOpen = document.getElementById('confirmBackdrop').classList.contains('open');

      if (e.key === 'Escape') {
        if (modalOpen) Modal.close();
        else if (confirmOpen) Confirm.close();
        else closeSearch();
        return;
      }

      // Don't fire shortcuts when typing in inputs or modal open
      if (inInput || modalOpen || confirmOpen) return;

      const pageKeys = { '1':'dashboard','2':'pipeline','3':'clientes','4':'contatos','5':'projetos','6':'atividades','7':'propostas','8':'financeiro','9':'rh' };

      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); addNew(); return; }
      if (e.key === '/' || e.key === 'k' && e.metaKey) {
        e.preventDefault();
        document.getElementById('globalSearch')?.focus();
        return;
      }
      if (pageKeys[e.key]) { e.preventDefault(); navigate(pageKeys[e.key]); return; }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); navigate('calendario'); return; }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); navigate('licitacoes'); return; }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); navigate('relatorios'); return; }
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); navigate('metas'); return; }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); navigate('marketing'); return; }
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); navigate('contratos'); return; }
      // Q = Captura Rápida
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); quickCapture(); return; }
    });

    // Clique fora fecha search
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box') && !e.target.closest('#searchPanel')) closeSearch();
      const sidebar = document.getElementById('sidebar');
      if (window.innerWidth <= 900 && sidebar.classList.contains('mobile-open')) {
        if (!sidebar.contains(e.target) && !e.target.closest('.toggle-btn')) {
          sidebar.classList.remove('mobile-open');
        }
      }
    });
  }

  function navigate(page) {
    if (!PAGES[page]) page = 'dashboard';
    // Verificar permissão para a página
    try {
      const emailLogado = typeof Auth !== 'undefined' ? (Auth.getCurrentEmail?.() || '') : '';
      const cfg = DB.getConfig();
      const perfil = (cfg.usuariosPerfis || []).find(u => u.email?.toLowerCase() === emailLogado);
      const role = perfil?.role || 'admin';
      const rolePages = typeof Config !== 'undefined' ? Config.getRolePages?.() : null;
      const paginasPermitidas = rolePages?.[role];
      if (paginasPermitidas && !paginasPermitidas.includes(page)) {
        Toast.error('Você não tem permissão para acessar esta seção.');
        page = 'dashboard';
      }
    } catch(e) { /* silencioso */ }
    _currentPage = page;

    // Update active nav link (sidebar + bottom-nav mobile)
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => {
      l.classList.toggle('active', l.dataset.page === page);
    });

    const cfg = PAGES[page];
    document.getElementById('pageTitle').textContent = cfg.title;

    // Add button
    const btnAdd = document.getElementById('btnAddNew');
    if (cfg.addLabel) {
      btnAdd.style.display = '';
      btnAdd.textContent = cfg.addLabel;
      btnAdd.onclick = () => cfg.module.addNew?.();
    } else {
      btnAdd.style.display = 'none';
    }

    // Close mobile sidebar
    if (window.innerWidth <= 900) {
      document.getElementById('sidebar').classList.remove('mobile-open');
    }

    cfg.module.render();

    // Scroll to top
    document.getElementById('pageContent').scrollTop = 0;
  }

  function addNew() {
    const cfg = PAGES[_currentPage];
    if (cfg?.module?.addNew) cfg.module.addNew();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 900;

    if (isMobile) {
      const isOpen = sidebar.classList.contains('mobile-open');
      sidebar.classList.toggle('mobile-open', !isOpen);
      // Overlay
      let overlay = document.getElementById('sidebarOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.className = 'sidebar-overlay';
        overlay.onclick = () => toggleSidebar();
        document.body.appendChild(overlay);
      }
      overlay.classList.toggle('active', !isOpen);
    } else {
      _sidebarCollapsed = !_sidebarCollapsed;
      sidebar.classList.toggle('collapsed', _sidebarCollapsed);
      localStorage.setItem('crm_sidebar_collapsed', _sidebarCollapsed ? '1' : '0');
      const btn = document.getElementById('sidebarCollapseBtn');
      if (btn) btn.style.transform = _sidebarCollapsed ? 'rotate(180deg)' : '';
    }
  }

  function updateBrand() {
    const cfg = DB.getConfig();
    document.getElementById('brandName').textContent = cfg.empresa || 'Bikows CRM';
    document.title = (cfg.empresa || 'Bikows CRM') + ' — CRM';
  }

  function updateUserInfo() {
    const cfg = DB.getConfig();
    const user = cfg.usuario || {};
    const nome = user.nome || 'Usuário';
    const initial = nome.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent = initial;
    document.getElementById('sidebarName').textContent = nome;
    document.getElementById('sidebarRole').textContent = user.cargo || 'Admin';
  }

  function updateNotifBadge() {
    const atividades = DB.getAll('atividades');
    const pendentes = atividades.filter(a => a.status === 'pendente').length;
    const leads = DB.getAll('leads');
    const followupsVencidos = leads.filter(l =>
      !['fechado_ganho','fechado_perdido'].includes(l.status) &&
      l.dataProximaAcao && Utils.isOverdue(l.dataProximaAcao)
    ).length;

    const recebiveis = DB.getAll('recebiveis');
    let vencidos = 0;
    recebiveis.forEach(r => {
      (r.parcelas||[]).forEach(p => {
        if (p.status !== 'recebido' && Utils.isOverdue(p.vencimento)) vencidos++;
      });
    });

    // Licitações com abertura em ≤3 dias
    const licitacoes = DB.getAll('licitacoes');
    const licsUrgentes = licitacoes.filter(l => {
      if (['ganhou','perdeu','deserta','cancelada'].includes(l.status)) return false;
      const d = Utils.daysUntil(l.dataAbertura);
      return d != null && d >= 0 && d <= 3;
    }).length;

    // Projetos atrasados
    const projetos = DB.getAll('projetos');
    const projetosAtrasados = projetos.filter(p =>
      p.status === 'em_andamento' && Utils.isOverdue(p.prazo)
    ).length;

    // ARTs pendentes em projetos em andamento
    const artsPendentes = projetos.filter(p =>
      p.status === 'em_andamento' &&
      !DB.getAll('arts').some(a => a.projetoId === p.id && a.status === 'registrada') &&
      !p.art?.numero
    ).length;

    var contratosVencendo = (typeof Contratos !== 'undefined' && Contratos.getContratosVencendo) ? Contratos.getContratosVencendo(30).length : 0;
    const total = followupsVencidos + vencidos + licsUrgentes + projetosAtrasados + artsPendentes + contratosVencendo;
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = total;
      badge.style.display = total > 0 ? '' : 'none';
    }
  }

  function showPendencias() {
    const leads = DB.getAll('leads');
    const atividades = DB.getAll('atividades');
    const recebiveis = DB.getAll('recebiveis');
    const licitacoes = DB.getAll('licitacoes').filter(l => {
      if (['ganhou','perdeu','deserta','cancelada'].includes(l.status)) return false;
      const d = Utils.daysUntil(l.dataAbertura);
      return d != null && d >= 0 && d <= 7;
    });

    const followups = leads.filter(l =>
      !['fechado_ganho','fechado_perdido'].includes(l.status) &&
      l.dataProximaAcao && Utils.isOverdue(l.dataProximaAcao)
    );
    const atrasadas = atividades.filter(a => a.status === 'pendente' && Utils.isOverdue(a.data));
    const parcelasVencidas = [];
    recebiveis.forEach(r => {
      const c = DB.get('clientes', r.clienteId);
      (r.parcelas||[]).forEach(p => {
        if (p.status !== 'recebido' && Utils.isOverdue(p.vencimento)) {
          parcelasVencidas.push({ ...p, clienteNome: c?.nome||'—', descricao: r.descricao });
        }
      });
    });

    Modal.open({
      title: '⚠ Pendências',
      size: 'modal-lg',
      body: `
        ${followups.length > 0 ? `
          <div class="detail-label mb-2">Follow-ups Vencidos (${followups.length})</div>
          ${followups.map(l => {
            const telefone = l.contato || (() => {
              const contatos = DB.getAll('contatos').filter(ct => ct.clienteId === l.clienteId);
              const principal = contatos.find(ct => ct.principal) || contatos[0];
              return principal?.telefone || '';
            })();
            const clienteNome = Utils.getClientName(l.clienteId) || l.clienteNome || '';
            const msgWpp = `Olá ${clienteNome}, tudo bem? Passando para verificar o andamento da proposta de ${l.titulo}. Podemos conversar?`.replace(/['"]/g, '');
            const wppBtn = telefone
              ? `<button class="btn btn-xs btn-success ml-2" onclick="Utils.openWhatsApp('${Utils.escHtml(telefone)}', '${Utils.escHtml(msgWpp)}')" title="WhatsApp">📱 WhatsApp</button>`
              : '';
            return `<div class="followup-item urgent mb-2" style="flex-wrap:wrap;gap:6px">
              <div style="flex:1"><div class="font-bold text-sm">${Utils.escHtml(clienteNome)}</div>
              <div class="text-xs">${Utils.escHtml(l.titulo)} · ${Utils.escHtml(l.proximaAcao||'')}</div></div>
              <span class="badge badge-red">${Math.abs(Utils.daysUntil(l.dataProximaAcao))}d atraso</span>
              ${wppBtn}
            </div>`;
          }).join('')}
        ` : ''}

        ${atrasadas.length > 0 ? `
          <div class="detail-label mb-2 mt-3">Atividades Atrasadas (${atrasadas.length})</div>
          ${atrasadas.map(a => {
            const tipo = Utils.ATIV_TIPO[a.tipo] || { icon:'📌', bg:'#f1f5f9' };
            return `<div class="followup-item urgent mb-2">
              <div class="activity-icon" style="background:${tipo.bg};width:28px;height:28px;font-size:13px">${tipo.icon}</div>
              <div style="flex:1"><div class="font-bold text-sm">${Utils.escHtml(a.titulo)}</div>
              <div class="text-xs">${Utils.escHtml(Utils.getClientName(a.clienteId))} · ${Utils.formatDate(a.data)}</div></div>
              <span class="badge badge-red">${Math.abs(Utils.daysUntil(a.data))}d</span>
            </div>`;
          }).join('')}
        ` : ''}

        ${parcelasVencidas.length > 0 ? `
          <div class="detail-label mb-2 mt-3">Parcelas Vencidas (${parcelasVencidas.length})</div>
          ${parcelasVencidas.map(p => `<div class="followup-item urgent mb-2">
            <div style="flex:1"><div class="font-bold text-sm">${Utils.escHtml(p.clienteNome)}</div>
            <div class="text-xs">${Utils.escHtml(p.descricao||'')} · Venc: ${Utils.formatDate(p.vencimento)}</div></div>
            <span class="font-bold text-danger">${Utils.formatCurrency(p.valor)}</span>
          </div>`).join('')}
        ` : ''}

        ${licitacoes.length > 0 ? `
          <div class="detail-label mb-2 mt-3">Licitações com Abertura Próxima (${licitacoes.length})</div>
          ${licitacoes.map(l => {
            const dias = Utils.daysUntil(l.dataAbertura);
            return `<div class="followup-item urgent mb-2">
              <div style="flex:1"><div class="font-bold text-sm">🏛 ${Utils.escHtml(l.numero||'—')}</div>
              <div class="text-xs">${Utils.escHtml(Utils.truncate(l.orgao||'',40))}</div></div>
              <span class="badge ${dias===0?'badge-red':dias<=3?'badge-red':'badge-yellow'}">Abertura em ${dias}d</span>
            </div>`;
          }).join('')}
        ` : ''}

        ${(() => {
          // Projetos atrasados
          const projetosAtrasados = DB.getAll('projetos').filter(p =>
            p.status === 'em_andamento' && Utils.isOverdue(p.prazo)
          );
          if (!projetosAtrasados.length) return '';
          return `
            <div class="detail-label mb-2 mt-3">Projetos Atrasados (${projetosAtrasados.length})</div>
            ${projetosAtrasados.map(p => `<div class="followup-item urgent mb-2">
              <div style="flex:1">
                <div class="font-bold text-sm">🔧 ${Utils.escHtml(p.titulo)}</div>
                <div class="text-xs">${Utils.escHtml(Utils.getClientName(p.clienteId))} · Prazo: ${Utils.formatDate(p.prazo)}</div>
              </div>
              <span class="badge badge-red">${Math.abs(Utils.daysUntil(p.prazo))}d atraso</span>
              <button class="btn btn-xs btn-secondary" onclick="App.navigate('projetos');Modal.close()">Ver</button>
            </div>`).join('')}`;
        })()}

        ${(() => {
          // ARTs sem número em projetos em andamento
          const artsAll = DB.getAll('arts');
          const projSemArt = DB.getAll('projetos').filter(p =>
            p.status === 'em_andamento' &&
            !artsAll.some(a => a.projetoId === p.id && a.status === 'registrada') &&
            !p.art?.numero
          );
          if (!projSemArt.length) return '';
          return `
            <div class="detail-label mb-2 mt-3">Projetos sem ART Registrada (${projSemArt.length})</div>
            ${projSemArt.map(p => `<div class="followup-item urgent mb-2">
              <div style="flex:1">
                <div class="font-bold text-sm">📜 ${Utils.escHtml(p.titulo)}</div>
                <div class="text-xs">${Utils.escHtml(Utils.getClientName(p.clienteId))}</div>
              </div>
              <span class="badge badge-yellow">Sem ART</span>
              <button class="btn btn-xs btn-primary" onclick="Projetos.view('${p.id}','arts')">+ ART</button>
            </div>`).join('')}`;
        })()}

        ${(() => {
          if (typeof Contratos === 'undefined' || !Contratos.getContratosVencendo) return '';
          const cv = Contratos.getContratosVencendo(30);
          if (!cv.length) return '';
          return '<div class="detail-label mb-2 mt-3">Contratos Vencendo em 30 dias (' + cv.length + ')</div>' +
            cv.map(function(c) {
              const dias = Utils.daysUntil(c.dataFim);
              return '<div class="followup-item urgent mb-2"><div style="flex:1"><div class="font-bold text-sm">📋 ' + Utils.escHtml(c.objeto||c.numero||'—') + '</div><div class="text-xs">' + Utils.escHtml(Utils.getClientName(c.clienteId)) + ' · Vence: ' + Utils.formatDate(c.dataFim) + '</div></div><span class="badge badge-yellow">' + (dias === 0 ? 'Hoje' : dias + 'd') + '</span><button class="btn btn-xs btn-secondary" onclick="App.navigate(\'contratos\');Modal.close()">Ver</button></div>';
            }).join('');
        })()}

        ${followups.length === 0 && atrasadas.length === 0 && parcelasVencidas.length === 0 && licitacoes.length === 0 &&
          DB.getAll('projetos').filter(p => p.status === 'em_andamento' && Utils.isOverdue(p.prazo)).length === 0 &&
          DB.getAll('projetos').filter(p => p.status === 'em_andamento' && !DB.getAll('arts').some(a => a.projetoId === p.id && a.status === 'registrada') && !p.art?.numero).length === 0 ?
          '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Tudo em dia!</div><div class="empty-sub">Nenhuma pendência no momento.</div></div>' : ''}
      `,
    });
  }

  function _highlight(text, term) {
    if (!text || !term) return Utils.escHtml(text || '');
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Utils.escHtml(String(text)).replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>');
  }

  function _handleSearchKeydown(e) {
    const panel = document.getElementById('searchPanel');
    if (!panel || panel.style.display === 'none') return;
    const items = panel.querySelectorAll('.search-result-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _searchSelectedIdx = Math.min(_searchSelectedIdx + 1, items.length - 1);
      _updateSearchSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _searchSelectedIdx = Math.max(_searchSelectedIdx - 1, -1);
      _updateSearchSelection(items);
    } else if (e.key === 'Enter' && _searchSelectedIdx >= 0) {
      e.preventDefault();
      if (_searchResultActions[_searchSelectedIdx]) {
        _searchResultActions[_searchSelectedIdx]();
        closeSearch();
      }
    }
  }

  function _updateSearchSelection(items) {
    items.forEach((item, i) => {
      item.style.background = i === _searchSelectedIdx ? 'var(--primary-light, #eff6ff)' : '';
    });
  }

  function search(term) {
    const panel = document.getElementById('searchPanel');
    if (!term || term.length < 2) { if (panel) panel.style.display = 'none'; return; }

    _searchSelectedIdx = -1;
    _searchResultActions = [];

    const t = term.toLowerCase();

    // Estrutura: { category, icon, items: [{title, sub, action}] }
    const groups = [];

    // Clientes (max 4)
    const clientes = DB.getAll('clientes').filter(c =>
      c.nome?.toLowerCase().includes(t) ||
      c.cnpj?.includes(t) ||
      c.segmento?.toLowerCase().includes(t) ||
      c.cidade?.toLowerCase().includes(t)
    ).slice(0, 4);
    if (clientes.length) {
      groups.push({
        icon: '🏢', category: 'Clientes', items: clientes.map(c => ({
          title: c.nome,
          sub: (c.segmento || '') + (c.cidade ? ' · ' + c.cidade : ''),
          action: () => { try { App.navigate('clientes'); setTimeout(() => Clientes.view(c.id), 300); } catch(e) { App.navigate('clientes'); } }
        }))
      });
    }

    // Leads (max 4)
    const leads = DB.getAll('leads').filter(l =>
      l.titulo?.toLowerCase().includes(t) ||
      l.decisor?.toLowerCase().includes(t) ||
      Utils.getClientName(l.clienteId)?.toLowerCase().includes(t)
    ).slice(0, 4);
    if (leads.length) {
      groups.push({
        icon: '💼', category: 'Leads', items: leads.map(l => ({
          title: l.titulo,
          sub: Utils.getClientName(l.clienteId),
          action: () => { try { App.navigate('pipeline'); setTimeout(() => Pipeline.viewLead(l.id), 300); } catch(e) { App.navigate('pipeline'); } }
        }))
      });
    }

    // Projetos (max 3)
    const projetos = DB.getAll('projetos').filter(p =>
      p.titulo?.toLowerCase().includes(t) ||
      p.codigo?.toLowerCase().includes(t) ||
      Utils.getClientName(p.clienteId)?.toLowerCase().includes(t)
    ).slice(0, 3);
    if (projetos.length) {
      groups.push({
        icon: '📋', category: 'Projetos', items: projetos.map(p => ({
          title: p.titulo,
          sub: Utils.getClientName(p.clienteId) + (p.prazo ? ' · ' + Utils.formatDate(p.prazo) : ''),
          action: () => { try { App.navigate('projetos'); setTimeout(() => Projetos.view(p.id), 300); } catch(e) { App.navigate('projetos'); } }
        }))
      });
    }

    // Propostas (max 3)
    const propostas = DB.getAll('propostas').filter(p =>
      p.titulo?.toLowerCase().includes(t) ||
      p.numero?.toLowerCase().includes(t) ||
      Utils.getClientName(p.clienteId)?.toLowerCase().includes(t)
    ).slice(0, 3);
    if (propostas.length) {
      groups.push({
        icon: '📄', category: 'Propostas', items: propostas.map(p => ({
          title: (p.numero ? p.numero + ' · ' : '') + p.titulo,
          sub: Utils.getClientName(p.clienteId),
          action: () => { try { App.navigate('propostas'); setTimeout(() => Propostas.view(p.id), 300); } catch(e) { App.navigate('propostas'); } }
        }))
      });
    }

    // Contratos (max 2)
    const contratos = DB.getAll('contratos').filter(ct =>
      ct.numero?.toLowerCase().includes(t) ||
      ct.titulo?.toLowerCase().includes(t) ||
      Utils.getClientName(ct.clienteId)?.toLowerCase().includes(t)
    ).slice(0, 2);
    if (contratos.length) {
      groups.push({
        icon: '📝', category: 'Contratos', items: contratos.map(ct => ({
          title: (ct.numero ? ct.numero + ' · ' : '') + (ct.titulo || ''),
          sub: Utils.getClientName(ct.clienteId),
          action: () => { try { App.navigate('contratos'); setTimeout(() => Contratos.view(ct.id), 300); } catch(e) { App.navigate('contratos'); } }
        }))
      });
    }

    // Licitações (max 2)
    const licitacoes = DB.getAll('licitacoes').filter(l =>
      l.numero?.toLowerCase().includes(t) ||
      l.orgao?.toLowerCase().includes(t) ||
      l.objeto?.toLowerCase().includes(t)
    ).slice(0, 2);
    if (licitacoes.length) {
      groups.push({
        icon: '🏛', category: 'Licitações', items: licitacoes.map(l => ({
          title: (l.numero ? l.numero + ' · ' : '') + (l.orgao || ''),
          sub: l.objeto ? Utils.truncate(l.objeto, 60) : '',
          action: () => { try { App.navigate('licitacoes'); setTimeout(() => Licitacoes.view(l.id), 300); } catch(e) { App.navigate('licitacoes'); } }
        }))
      });
    }

    // Contatos (max 2)
    const contatos = DB.getAll('contatos').filter(c =>
      c.nome?.toLowerCase().includes(t) ||
      c.email?.toLowerCase().includes(t) ||
      c.empresa?.toLowerCase().includes(t)
    ).slice(0, 2);
    if (contatos.length) {
      groups.push({
        icon: '👤', category: 'Contatos', items: contatos.map(c => ({
          title: c.nome,
          sub: (c.cargo || '') + (c.empresa ? ' · ' + c.empresa : ''),
          action: () => { App.navigate('contatos'); }
        }))
      });
    }

    // Recebíveis (max 2)
    const recebiveis = DB.getAll('recebiveis').filter(r =>
      r.descricao?.toLowerCase().includes(t) ||
      Utils.getClientName(r.clienteId)?.toLowerCase().includes(t)
    ).slice(0, 2);
    if (recebiveis.length) {
      groups.push({
        icon: '💰', category: 'Recebíveis', items: recebiveis.map(r => ({
          title: r.descricao || '(sem descrição)',
          sub: Utils.getClientName(r.clienteId),
          action: () => { App.navigate('financeiro'); }
        }))
      });
    }

    if (!panel) return;

    const totalItems = groups.reduce((s, g) => s + g.items.length, 0);

    if (!totalItems) {
      panel.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum resultado para "${Utils.escHtml(term)}"</div>`;
      panel.style.display = 'block';
      return;
    }

    // Construir HTML agrupado e preencher _searchResultActions
    let globalIdx = 0;
    let html = `<div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-muted)">${totalItems} resultado${totalItems !== 1 ? 's' : ''} para "<strong>${Utils.escHtml(term)}</strong>"</div>`;

    groups.forEach(group => {
      html += `<div style="padding:6px 12px 2px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px">${group.icon} ${Utils.escHtml(group.category)} (${group.items.length})</div>`;
      group.items.forEach(item => {
        const idx = globalIdx++;
        _searchResultActions.push(item.action);
        html += `
          <div class="search-result-item" data-result-index="${idx}" onclick="_searchResultActions_call(${idx})" style="cursor:pointer">
            <span class="search-result-icon">${group.icon}</span>
            <div style="flex:1;min-width:0">
              <div class="search-result-title">${_highlight(item.title, term)}</div>
              ${item.sub ? `<div class="search-result-sub">${_highlight(item.sub, term)}</div>` : ''}
            </div>
            <span style="font-size:10px;color:var(--text-muted);flex-shrink:0">↵</span>
          </div>`;
      });
    });

    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // Exposed helper so inline onclick can call result actions
  window._searchResultActions_call = function(idx) {
    if (_searchResultActions[idx]) {
      _searchResultActions[idx]();
      App.closeSearch();
    }
  };

  function closeSearch() {
    const panel = document.getElementById('searchPanel');
    if (panel) panel.style.display = 'none';
    const input = document.getElementById('globalSearch');
    if (input) input.value = '';
  }

  function toggleDark() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('crm_dark', isDark ? '1' : '0');
    const btn = document.getElementById('darkToggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  }

  function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('crm_theme', newTheme);
    const icon = document.getElementById('darkModeIcon');
    if (icon) icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
  }

  /* ================================================
     CAPTURA RÁPIDA — adicionar item em 2 cliques
     ================================================ */
  function quickCapture() {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const clientOpts = clientes.map(c => `<option value="${c.id}">${Utils.escHtml(c.nome)}</option>`).join('');
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}">${r}</option>`).join('');
    const hoje = Utils.todayStr();

    Modal.open({
      title: '⚡ Captura Rápida',
      body: `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
          ${[
            { id:'qc-lead',   icon:'💼', label:'Lead',       color:'#1a56db' },
            { id:'qc-atv',    icon:'📋', label:'Atividade',  color:'#10b981' },
            { id:'qc-nota',   icon:'📝', label:'Nota',       color:'#8b5cf6' },
            { id:'qc-conta',  icon:'💸', label:'Conta a Pagar', color:'#ef4444' },
          ].map(t => `
            <div class="qc-tipo ${t.id === 'qc-lead' ? 'active' : ''}" data-tipo="${t.id}"
              style="cursor:pointer;text-align:center;padding:12px 8px;border-radius:var(--radius);border:2px solid ${t.id==='qc-lead'?t.color:'var(--border)'};background:${t.id==='qc-lead'?t.color+'15':'var(--bg)'};transition:all .15s"
              onclick="document.querySelectorAll('.qc-tipo').forEach(el=>{el.style.borderColor='var(--border)';el.style.background='var(--bg)';el.classList.remove('active')});this.style.borderColor='${t.color}';this.style.background='${t.color}15';this.classList.add('active');App._renderQcForm('${t.id}')">
              <div style="font-size:22px;margin-bottom:4px">${t.icon}</div>
              <div style="font-size:11px;font-weight:600;color:${t.color}">${t.label}</div>
            </div>`).join('')}
        </div>
        <div id="qcFormArea"></div>
      `,
      saveLabel: '⚡ Salvar rápido',
      saveCb: () => _saveQuickCapture(),
    });
    setTimeout(() => _renderQcForm('qc-lead'), 50);
  }

  function _renderQcForm(tipo) {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const clientOpts = '<option value="">— Cliente —</option>' + clientes.map(c => `<option value="${c.id}">${Utils.escHtml(c.nome)}</option>`).join('');
    const respOpts = '<option value="">— Responsável —</option>' + cfg.responsaveis.map(r => `<option value="${r}">${r}</option>`).join('');
    const hoje = Utils.todayStr();
    const el = document.getElementById('qcFormArea');
    if (!el) return;

    const forms = {
      'qc-lead': `
        <div class="form-group"><label class="form-label">Oportunidade *</label><input class="form-control" id="qcTitulo" placeholder="Ex: Adequação NR-12 — Nome da Empresa" autofocus></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Cliente</label><select class="form-control" id="qcCliente">${clientOpts}</select></div>
          <div class="form-group"><label class="form-label">Valor Est. (R$)</label><input class="form-control" id="qcValor" type="number" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Responsável</label><select class="form-control" id="qcResp">${respOpts}</select></div>
          <div class="form-group"><label class="form-label">Próxima ação em</label><input class="form-control" id="qcDataAcao" type="date" value="${hoje}"></div>
        </div>`,
      'qc-atv': `
        <div class="form-group"><label class="form-label">Atividade *</label><input class="form-control" id="qcTitulo" placeholder="Ex: Ligar para decisor da empresa X" autofocus></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Data</label><input class="form-control" id="qcData" type="date" value="${hoje}"></div>
          <div class="form-group"><label class="form-label">Hora</label><input class="form-control" id="qcHora" type="time" value="09:00"></div>
          <div class="form-group"><label class="form-label">Prioridade</label>
            <select class="form-control" id="qcPrioridade"><option value="media">Média</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Cliente</label><select class="form-control" id="qcCliente">${clientOpts}</select></div>
          <div class="form-group"><label class="form-label">Responsável</label><select class="form-control" id="qcResp">${respOpts}</select></div>
        </div>`,
      'qc-nota': `
        <div class="form-group"><label class="form-label">Título da Nota *</label><input class="form-control" id="qcTitulo" placeholder="Ex: Retorno do cliente sobre proposta" autofocus></div>
        <div class="form-group"><label class="form-label">Conteúdo da nota</label><textarea class="form-control" id="qcNota" rows="4" placeholder="Escreva aqui..."></textarea></div>
        <div class="form-group"><label class="form-label">Cliente</label><select class="form-control" id="qcCliente">${clientOpts}</select></div>`,
      'qc-conta': `
        <div class="form-group"><label class="form-label">Fornecedor / Descrição *</label><input class="form-control" id="qcTitulo" placeholder="Ex: Combustível campo — maio" autofocus></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Valor (R$) *</label><input class="form-control" id="qcValor" type="number" step="0.01" placeholder="0"></div>
          <div class="form-group"><label class="form-label">Vencimento</label><input class="form-control" id="qcVencimento" type="date" value="${hoje}"></div>
        </div>
        <div class="form-group"><label class="form-label">Categoria</label>
          <select class="form-control" id="qcCategoria">
            <option>Combustível</option><option>Materiais</option><option>Aluguel</option><option>TI</option><option>Contabilidade</option><option>Marketing</option><option>Subcontratados</option><option>Outros</option>
          </select>
        </div>`,
    };
    el.innerHTML = forms[tipo] || '';
  }

  function _saveQuickCapture() {
    const tipo = document.querySelector('.qc-tipo.active')?.dataset?.tipo || 'qc-lead';
    const titulo = document.getElementById('qcTitulo')?.value?.trim();
    if (!titulo) { Toast.error('Título obrigatório'); return; }

    if (tipo === 'qc-lead') {
      DB.create('leads', {
        titulo,
        status: 'lead_identificado',
        clienteId: document.getElementById('qcCliente')?.value || '',
        valorEstimado: Number(document.getElementById('qcValor')?.value) || 0,
        responsavel: document.getElementById('qcResp')?.value || '',
        dataProximaAcao: document.getElementById('qcDataAcao')?.value || '',
        proximaAcao: 'Primeiro contato',
        origemLead: 'Prospecção',
      });
      Toast.success('Lead criado!');
    } else if (tipo === 'qc-atv') {
      DB.create('atividades', {
        titulo,
        tipo: 'task',
        status: 'pendente',
        prioridade: document.getElementById('qcPrioridade')?.value || 'media',
        data: document.getElementById('qcData')?.value || Utils.todayStr(),
        hora: document.getElementById('qcHora')?.value || '',
        clienteId: document.getElementById('qcCliente')?.value || '',
        responsavel: document.getElementById('qcResp')?.value || '',
      });
      Toast.success('Atividade criada!');
    } else if (tipo === 'qc-nota') {
      DB.create('atividades', {
        titulo,
        tipo: 'note',
        status: 'concluido',
        prioridade: 'baixa',
        data: Utils.todayStr(),
        clienteId: document.getElementById('qcCliente')?.value || '',
        descricao: document.getElementById('qcNota')?.value || '',
      });
      Toast.success('Nota registrada!');
    } else if (tipo === 'qc-conta') {
      const valor = Number(document.getElementById('qcValor')?.value);
      if (!valor) { Toast.error('Valor obrigatório'); return; }
      DB.create('contaspagar', {
        fornecedor: titulo,
        descricao: titulo,
        categoria: document.getElementById('qcCategoria')?.value || 'Outros',
        valor,
        vencimento: document.getElementById('qcVencimento')?.value || Utils.todayStr(),
        status: 'pendente',
        recorrente: false,
      });
      Toast.success('Conta a pagar criada!');
    }

    Modal.close();
    // Refresh a página atual se afetada
    if (_currentPage === 'pipeline' && tipo === 'qc-lead') PAGES.pipeline.module.render();
    if (_currentPage === 'atividades' && ['qc-atv','qc-nota'].includes(tipo)) PAGES.atividades.module.render();
    if (_currentPage === 'financeiro' && tipo === 'qc-conta') PAGES.financeiro.module.render();
    App.updateNotifBadge();
  }

  function _applyDark() {
    const isDark = localStorage.getItem('crm_dark') === '1';
    if (isDark) {
      document.body.classList.add('dark-mode');
      const btn = document.getElementById('darkToggle');
      if (btn) btn.textContent = '☀️';
    }
    // Restore data-theme dark mode (sidebar toggle)
    const savedTheme = localStorage.getItem('crm_theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      const icon = document.getElementById('darkModeIcon');
      if (icon) icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
  }

  /* ================================================
     PERMISSÕES DE NAVEGAÇÃO (sistema de perfis)
     ================================================ */
  function aplicarPermissoesNavegacao() {
    try {
      // Obter e-mail do usuário logado
      const emailLogado = typeof Auth !== 'undefined' ? (Auth.getCurrentEmail?.() || '') : '';

      const cfg = DB.getConfig();
      const usuariosPerfis = cfg.usuariosPerfis || [];

      // Encontrar perfil do usuário atual
      const perfil = usuariosPerfis.find(u => u.email?.toLowerCase() === emailLogado);
      const role = perfil?.role || 'admin'; // padrão: admin (caso não configurado)

      const rolePages = typeof Config !== 'undefined' ? Config.getRolePages?.() : null;
      if (!rolePages) return; // Config não carregado ainda

      const paginasPermitidas = rolePages[role]; // null = tudo

      // Aplicar visibilidade nos links do sidebar
      document.querySelectorAll('.nav-link[data-page]').forEach(link => {
        const page = link.dataset.page;
        if (!paginasPermitidas || paginasPermitidas.includes(page)) {
          link.style.display = '';
        } else {
          link.style.display = 'none';
        }
      });

      // Atualizar role visível no sidebar
      const roleEl = document.getElementById('sidebarRole');
      if (roleEl && perfil) {
        const roles = Config.getRoles?.() || {};
        roleEl.textContent = roles[role]?.label || role;
      }
    } catch(e) {
      // silencioso — não bloqueia o sistema
      console.warn('[App] aplicarPermissoesNavegacao:', e);
    }
  }

  return { init, navigate, addNew, toggleSidebar, updateBrand, updateUserInfo, updateNotifBadge, showPendencias, search, closeSearch, toggleDark, toggleDarkMode, refreshIfNeeded, quickCapture, _renderQcForm, _saveQuickCapture, aplicarPermissoesNavegacao };
})();

// Inicialização — Auth verifica sessão e chama App.init() após loadAll()
document.addEventListener('DOMContentLoaded', () => Auth.init());
