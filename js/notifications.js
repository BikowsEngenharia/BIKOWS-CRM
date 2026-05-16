/* ==========================================
   notifications.js — Gerenciador de lembretes e alertas
   ========================================== */
const Notifications = (() => {

  const NOTIF_KEY = 'crm_notif_sent'; // sessionStorage key para evitar duplicatas

  /* ---- Preferências padrão ---- */
  function _defaultPrefs() {
    return {
      browser:  true,
      inApp:    true,
      email:    false,
      emailDest: '',
      horaChecagem: '08:00',
      antecedencia: {
        atividades:  1,
        reunioes:    1,
        leads:       0,
        parcelas:    3,
        licitacoes:  3,
        marketing:   1,
        contasPagar: 3,
      },
    };
  }

  function getPrefs() {
    const cfg = DB.getConfig();
    return { ..._defaultPrefs(), ...(cfg.notificacoes || {}) };
  }

  function savePrefs(prefs) {
    const cfg = DB.getConfig();
    DB.saveConfig({ ...cfg, notificacoes: prefs });
  }

  /* ---- Inicialização ---- */
  async function init() {
    _registerSW();
    await _requestPermission();
    _startPeriodicCheck();
    _checkAll(); // verifica imediatamente ao carregar
  }

  /* ---- Service Worker ---- */
  function _registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/BIKOWS-CRM/sw.js', { scope: '/BIKOWS-CRM/' })
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Erro:', err));
  }

  /* ---- Permissão de notificação ---- */
  async function _requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  async function requestPermission() {
    const granted = await _requestPermission();
    if (granted) Toast.success('Notificações do navegador ativadas!');
    else Toast.error('Permissão de notificação negada pelo navegador.');
    return granted;
  }

  /* ---- Verificação periódica ---- */
  function _startPeriodicCheck() {
    // Verifica a cada 30 minutos
    setInterval(() => _checkAll(), 30 * 60 * 1000);
  }

  /* ====================================================
     VERIFICAÇÕES
     ==================================================== */
  function _checkAll() {
    const prefs = getPrefs();
    const items = [];

    items.push(..._checkAtividades(prefs));
    items.push(..._checkLeads(prefs));
    items.push(..._checkParcelas(prefs));
    items.push(..._checkLicitacoes(prefs));
    items.push(..._checkContasPagar(prefs));
    items.push(..._checkMarketing(prefs));

    if (items.length === 0) return;

    // Evita re-notificar os mesmos itens na mesma sessão
    const sent = JSON.parse(sessionStorage.getItem(NOTIF_KEY) || '[]');
    const novos = items.filter(i => !sent.includes(i.tag));

    if (novos.length === 0) return;

    novos.forEach(item => {
      if (prefs.browser) _notifyBrowser(item);
    });

    // In-app: mostra toast resumido
    if (prefs.inApp && novos.length > 0) {
      setTimeout(() => {
        const msg = novos.length === 1
          ? novos[0].body
          : `${novos.length} lembretes pendentes — clique em 🔔 para ver`;
        Toast.warning('🔔 ' + msg, 6000);
      }, 1500);
    }

    // Marca como enviados na sessão
    sessionStorage.setItem(NOTIF_KEY, JSON.stringify([...sent, ...novos.map(i => i.tag)]));

    // Email (se configurado)
    if (prefs.email && prefs.emailDest) _sendEmailDigest(novos, prefs);
  }

  function _daysUntil(dateStr) {
    if (!dateStr) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
    return Math.round((d - hoje) / 86400000);
  }

  /* ---- Atividades ---- */
  function _checkAtividades(prefs) {
    const ant = prefs.antecedencia?.atividades ?? 1;
    return DB.getAll('atividades')
      .filter(a => a.status === 'pendente' && a.data)
      .filter(a => {
        const d = _daysUntil(a.data);
        return d !== null && d <= ant && d >= -7;
      })
      .map(a => {
        const d = _daysUntil(a.data);
        const label = d < 0 ? `${Math.abs(d)}d atrasada` : d === 0 ? 'hoje' : `em ${d}d`;
        return {
          tag: 'atv_' + a.id,
          title: '📋 Atividade — ' + label,
          body: a.titulo + (a.responsavel ? ' · ' + a.responsavel : ''),
        };
      });
  }

  /* ---- Leads / Follow-ups ---- */
  function _checkLeads(prefs) {
    const ant = prefs.antecedencia?.leads ?? 0;
    return DB.getAll('leads')
      .filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status) && l.dataProximaAcao)
      .filter(l => {
        const d = _daysUntil(l.dataProximaAcao);
        return d !== null && d <= ant && d >= -30;
      })
      .map(l => {
        const d = _daysUntil(l.dataProximaAcao);
        const label = d < 0 ? `${Math.abs(d)}d atrasado` : d === 0 ? 'hoje' : `em ${d}d`;
        return {
          tag: 'lead_' + l.id,
          title: '💼 Follow-up — ' + label,
          body: l.titulo + ' · ' + (l.proximaAcao || 'Verificar pipeline'),
        };
      });
  }

  /* ---- Parcelas a receber ---- */
  function _checkParcelas(prefs) {
    const ant = prefs.antecedencia?.parcelas ?? 3;
    const items = [];
    DB.getAll('recebiveis').forEach(r => {
      (r.parcelas || []).forEach(p => {
        if (p.status === 'recebido') return;
        const d = _daysUntil(p.vencimento);
        if (d !== null && d <= ant && d >= -30) {
          const label = d < 0 ? `${Math.abs(d)}d vencida` : d === 0 ? 'vence hoje' : `vence em ${d}d`;
          const cli = DB.get('clientes', r.clienteId);
          items.push({
            tag: 'parc_' + p.id,
            title: '💰 Parcela — ' + label,
            body: (cli?.nome || 'Cliente') + ' · ' + Utils.formatCurrency(p.valor),
          });
        }
      });
    });
    return items;
  }

  /* ---- Licitações ---- */
  function _checkLicitacoes(prefs) {
    const ant = prefs.antecedencia?.licitacoes ?? 3;
    return DB.getAll('licitacoes')
      .filter(l => !['ganhou','perdeu','deserta','cancelada'].includes(l.status) && l.dataAbertura)
      .filter(l => {
        const d = _daysUntil(l.dataAbertura);
        return d !== null && d <= ant && d >= 0;
      })
      .map(l => {
        const d = _daysUntil(l.dataAbertura);
        const label = d === 0 ? 'HOJE' : `em ${d}d`;
        return {
          tag: 'lic_' + l.id,
          title: '🏛 Licitação abre ' + label,
          body: (l.numero || '—') + ' · ' + Utils.truncate(l.orgao || '', 40),
        };
      });
  }

  /* ---- Contas a pagar ---- */
  function _checkContasPagar(prefs) {
    const ant = prefs.antecedencia?.contasPagar ?? 3;
    return DB.getAll('contaspagar')
      .filter(c => c.status === 'pendente' && c.vencimento)
      .filter(c => {
        const d = _daysUntil(c.vencimento);
        return d !== null && d <= ant && d >= -7;
      })
      .map(c => {
        const d = _daysUntil(c.vencimento);
        const label = d < 0 ? `${Math.abs(d)}d vencida` : d === 0 ? 'vence hoje' : `vence em ${d}d`;
        return {
          tag: 'cp_' + c.id,
          title: '💸 Conta a pagar — ' + label,
          body: c.fornecedor + ' · ' + Utils.formatCurrency(c.valor),
        };
      });
  }

  /* ---- Marketing (posts agendados) ---- */
  function _checkMarketing(prefs) {
    const ant = prefs.antecedencia?.marketing ?? 1;
    return DB.getAll('marketing_posts')
      .filter(p => p.status === 'agendado' && p.dataPublicacao)
      .filter(p => {
        const d = _daysUntil(p.dataPublicacao);
        return d !== null && d <= ant && d >= 0;
      })
      .map(p => {
        const d = _daysUntil(p.dataPublicacao);
        const label = d === 0 ? 'hoje' : `em ${d}d`;
        return {
          tag: 'mkt_' + p.id,
          title: '📢 Post agendado — ' + label,
          body: (p.canal || '') + ' · ' + Utils.truncate(p.titulo || '', 50),
        };
      });
  }

  /* ---- Notificação no navegador ---- */
  function _notifyBrowser(item) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notif = new Notification(item.title, {
        body: item.body,
        icon: '/BIKOWS-CRM/img/logo-bikows.png',
        tag: item.tag,
        renotify: false,
      });
      notif.onclick = () => { window.focus(); notif.close(); };
      setTimeout(() => notif.close(), 8000);
    } catch (e) {
      console.warn('[Notif] Erro ao exibir:', e);
    }
  }

  /* ---- Digest por e-mail (via Supabase Edge Function) ---- */
  async function _sendEmailDigest(items, prefs) {
    if (!prefs.emailDest) return;
    try {
      await _supabase.functions.invoke('send-notif-email', {
        body: { to: prefs.emailDest, items },
      });
    } catch (e) {
      console.warn('[Notif] Email falhou:', e);
    }
  }

  /* ====================================================
     API PÚBLICA
     ==================================================== */
  return {
    init,
    requestPermission,
    getPrefs,
    savePrefs,
    checkAll: _checkAll,
  };
})();
