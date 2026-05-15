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
    financeiro: { title: 'Financeiro',      module: Financeiro,  addLabel: '+ Novo Recebível' },
    rh:         { title: 'RH / Folha',      module: Folha,       addLabel: '+ Novo Funcionário' },
    calendario:  { title: 'Calendário',      module: Calendario,   addLabel: '+ Nova Atividade' },
    licitacoes:  { title: 'Licitações',      module: Licitacoes,   addLabel: '+ Nova Licitação' },
    relatorios:  { title: 'Relatórios',      module: Relatorios,   addLabel: null },
    config:     { title: 'Configurações',   module: Config,      addLabel: null },
  };

  let _currentPage = 'dashboard';
  let _sidebarCollapsed = false;

  // Mapa de entidade → página para refresh por Realtime
  const _ENTITY_PAGE = {
    clientes: 'clientes', contatos: 'contatos', leads: 'pipeline',
    projetos: 'projetos', atividades: 'atividades', propostas: 'propostas',
    recebiveis: 'financeiro', funcionarios: 'rh', lancamentos: 'financeiro',
    contaspagar: 'financeiro', folha: 'rh', licitacoes: 'licitacoes',
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
    _currentPage = page;

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(l => {
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
    if (window.innerWidth <= 900) {
      sidebar.classList.toggle('mobile-open');
    } else {
      _sidebarCollapsed = !_sidebarCollapsed;
      sidebar.classList.toggle('collapsed', _sidebarCollapsed);
    }
  }

  function updateBrand() {
    const cfg = DB.getConfig();
    document.getElementById('brandName').textContent = cfg.empresa || 'CRM';
    document.title = (cfg.empresa || 'CRM') + ' — CRM';
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

    const total = followupsVencidos + vencidos + licsUrgentes;
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
          ${followups.map(l => `<div class="followup-item urgent mb-2">
            <div style="flex:1"><div class="font-bold text-sm">${Utils.escHtml(Utils.getClientName(l.clienteId))}</div>
            <div class="text-xs">${Utils.escHtml(l.titulo)} · ${Utils.escHtml(l.proximaAcao||'')}</div></div>
            <span class="badge badge-red">${Math.abs(Utils.daysUntil(l.dataProximaAcao))}d atraso</span>
          </div>`).join('')}
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

        ${followups.length === 0 && atrasadas.length === 0 && parcelasVencidas.length === 0 && licitacoes.length === 0 ?
          '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Tudo em dia!</div><div class="empty-sub">Nenhuma pendência no momento.</div></div>' : ''}
      `,
    });
  }

  function search(term) {
    const panel = document.getElementById('searchPanel');
    if (!term || term.length < 2) { if (panel) panel.style.display = 'none'; return; }

    const results = [];
    const t = term.toLowerCase();
    DB.getAll('clientes').filter(c => c.nome?.toLowerCase().includes(t)||c.cnpj?.includes(t)).slice(0,4).forEach(c =>
      results.push({ icon:'🏢', title: c.nome, sub: c.segmento||c.cidade||'', page: 'clientes' }));
    DB.getAll('leads').filter(l => l.titulo?.toLowerCase().includes(t)||l.decisor?.toLowerCase().includes(t)).slice(0,4).forEach(l =>
      results.push({ icon:'💼', title: l.titulo, sub: Utils.getClientName(l.clienteId), page: 'pipeline' }));
    DB.getAll('projetos').filter(p => p.titulo?.toLowerCase().includes(t)||p.codigo?.toLowerCase().includes(t)).slice(0,3).forEach(p =>
      results.push({ icon:'📋', title: p.titulo, sub: Utils.getClientName(p.clienteId)+' · '+Utils.formatDate(p.prazo), page: 'projetos' }));
    DB.getAll('contatos').filter(c => c.nome?.toLowerCase().includes(t)||c.email?.toLowerCase().includes(t)).slice(0,3).forEach(c =>
      results.push({ icon:'👤', title: c.nome, sub: c.cargo||'', page: 'contatos' }));
    DB.getAll('propostas').filter(p => p.titulo?.toLowerCase().includes(t)||p.numero?.toLowerCase().includes(t)).slice(0,3).forEach(p =>
      results.push({ icon:'📄', title: p.numero+' · '+p.titulo, sub: Utils.getClientName(p.clienteId), page: 'propostas' }));
    DB.getAll('atividades').filter(a => a.titulo?.toLowerCase().includes(t)).slice(0,2).forEach(a =>
      results.push({ icon:'✅', title: a.titulo, sub: Utils.getClientName(a.clienteId)+' · '+Utils.formatDate(a.data), page: 'atividades' }));

    if (!panel) return;
    if (!results.length) {
      panel.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum resultado para "'+Utils.escHtml(term)+'"</div>';
    } else {
      panel.innerHTML = results.map(r => `
        <div class="search-result-item" onclick="App.navigate('${r.page}');App.closeSearch()">
          <span class="search-result-icon">${r.icon}</span>
          <div><div class="search-result-title">${Utils.escHtml(r.title)}</div><div class="search-result-sub">${Utils.escHtml(r.sub)}</div></div>
          <span class="search-result-page">${r.page}</span>
        </div>`).join('');
    }
    panel.style.display = 'block';
  }

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

  function _applyDark() {
    const isDark = localStorage.getItem('crm_dark') === '1';
    if (isDark) {
      document.body.classList.add('dark-mode');
      const btn = document.getElementById('darkToggle');
      if (btn) btn.textContent = '☀️';
    }
  }

  return { init, navigate, addNew, toggleSidebar, updateBrand, updateUserInfo, updateNotifBadge, showPendencias, search, closeSearch, toggleDark, refreshIfNeeded };
})();

// Inicialização — Auth verifica sessão e chama App.init() após loadAll()
document.addEventListener('DOMContentLoaded', () => Auth.init());
