/* ==========================================
   notifications.js â€” Gerenciador de lembretes e alertas
   ========================================== */
const Notifications = (() => {

  const NOTIF_KEY = 'crm_notif_sent'; // sessionStorage key para evitar duplicatas

  /* ---- PreferÃªncias padrÃ£o ---- */
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

  /* ---- InicializaÃ§Ã£o ---- */
  async function init() {
    _registerSW();
    await _requestPermission();
    _startPeriodicCheck();
    _checkAll(); // verifica imediatamente ao carregar
    _checkWeeklySummary(); // verifica se deve mostrar resumo semanal
  }

  /* ---- Service Worker ---- */
  function _registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/BIKOWS-CRM/sw.js', { scope: '/BIKOWS-CRM/' })
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Erro:', err));
  }

  /* ---- PermissÃ£o de notificaÃ§Ã£o ---- */
  async function _requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  async function requestPermission() {
    const granted = await _requestPermission();
    if (granted) Toast.success('NotificaÃ§Ãµes do navegador ativadas!');
    else Toast.error('PermissÃ£o de notificaÃ§Ã£o negada pelo navegador.');
    return granted;
  }

  /* ---- VerificaÃ§Ã£o periÃ³dica ---- */
  function _startPeriodicCheck() {
    // Verifica a cada 30 minutos
    setInterval(() => _checkAll(), 30 * 60 * 1000);
  }

  /* ====================================================
     VERIFICAÃ‡Ã•ES
     ==================================================== */
  function _checkAll() {
    const prefs = getPrefs();
    const items = [];

    items.push(..._checkAtividades(prefs));
    items.push(..._checkLeads(prefs));
    items.push(..._checkParcelas(prefs));
    items.push(..._checkLicitacoes(prefs));
    items.push(..._checkContasPagar(prefs));
    items.push(..._checkARTPendente(prefs));
    items.push(..._checkMarketing(prefs));
    items.push(..._checkCPLTrafico(prefs));

    if (items.length === 0) return;

    // Evita re-notificar os mesmos itens na mesma sessÃ£o
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
          : `${novos.length} lembretes pendentes â€” clique em ðŸ”” para ver`;
        Toast.warning('ðŸ”” ' + msg, 6000);
      }, 1500);
    }

    // Marca como enviados na sessÃ£o
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
          title: 'ðŸ“‹ Atividade â€” ' + label,
          body: a.titulo + (a.responsavel ? ' Â· ' + a.responsavel : ''),
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
          title: 'ðŸ’¼ Follow-up â€” ' + label,
          body: l.titulo + ' Â· ' + (l.proximaAcao || 'Verificar pipeline'),
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
            title: 'ðŸ’° Parcela â€” ' + label,
            body: (cli?.nome || 'Cliente') + ' Â· ' + Utils.formatCurrency(p.valor),
          });
        }
      });
    });
    return items;
  }

  /* ---- LicitaÃ§Ãµes ---- */
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
          title: 'ðŸ› LicitaÃ§Ã£o abre ' + label,
          body: (l.numero || 'â€”') + ' Â· ' + Utils.truncate(l.orgao || '', 40),
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
          title: 'ðŸ’¸ Conta a pagar â€” ' + label,
          body: c.fornecedor + ' Â· ' + Utils.formatCurrency(c.valor),
        };
      });
  }

  /* ---- Projetos sem ART (em andamento) ---- */
  function _checkARTPendente(prefs) {
    return DB.getAll('projetos')
      .filter(p => p.status === 'em_andamento' && (!p.art?.numero))
      .map(p => ({
        tag: 'art_' + p.id,
        title: 'ðŸ“œ Projeto sem ART registrada',
        body: (p.ordemServico ? p.ordemServico + ' â€” ' : '') + p.titulo + ' Â· ' + (Utils.getClientName(p.clienteId) || ''),
      }));
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
          title: 'ðŸ“¢ Post agendado â€” ' + label,
          body: (p.canal || '') + ' Â· ' + Utils.truncate(p.titulo || '', 50),
        };
      });
  }

  /* ---- CPL de TrÃ¡fego Pago acima da meta ---- */
  function _checkCPLTrafico(prefs) {
    try {
      const mesAtual = new Date().toISOString().slice(0, 7);

      // Buscar meta do mÃªs
      const metas = DB.getAll('trafego_metas');
      const meta = metas.find(m => m.mes === mesAtual);
      if (!meta?.metaCPL) return []; // sem meta definida, sem alerta

      // Calcular CPL atual
      const leads = DB.getAll('leads').filter(l => {
        if (l.origemLead !== 'TrÃ¡fego Pago') return false;
        const d = l.dataEntrada || (l.createdAt || '').split('T')[0];
        return d && d.startsWith(mesAtual);
      });
      if (leads.length === 0) return [];

      const campanhas = DB.getAll('trafego_campanhas');
      const investido = campanhas.filter(c => {
        const ini = (c.dataInicio || '').slice(0, 7);
        const fim = (c.dataFim || '').slice(0, 7) || '9999-12';
        return ini <= mesAtual && fim >= mesAtual;
      }).reduce((s, c) => s + (c.investidoReal || c.orcamentoMensal || 0), 0);

      if (investido === 0) return [];

      const cplAtual = investido / leads.length;
      const metaCPL = meta.metaCPL;

      if (cplAtual <= metaCPL) return []; // dentro da meta

      const pct = Math.round((cplAtual / metaCPL - 1) * 100);
      return [{
        tag: 'cpl_' + mesAtual,
        title: 'âš  CPL acima da meta â€” Google Ads',
        body: `CPL atual: ${Utils.formatCurrency(cplAtual)} Â· Meta: ${Utils.formatCurrency(metaCPL)} Â· ${pct}% acima`,
      }];
    } catch (e) { return []; }
  }

  /* ---- NotificaÃ§Ã£o no navegador ---- */
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

  /* ---- Resumo semanal (toda segunda-feira) ---- */
  function _checkWeeklySummary() {
    const hoje = new Date();
    if (hoje.getDay() !== 1) return; // 1 = segunda-feira

    const WEEKLY_KEY = 'crm_weekly_' + hoje.toISOString().split('T')[0];
    if (sessionStorage.getItem(WEEKLY_KEY)) return; // jÃ¡ mostrou hoje

    sessionStorage.setItem(WEEKLY_KEY, '1');

    // Gerar resumo
    setTimeout(() => _showWeeklySummary(), 3000); // aguarda app carregar
  }

  function _showWeeklySummary() {
    const leads = DB.getAll('leads');
    const atividades = DB.getAll('atividades');
    const projetos = DB.getAll('projetos');
    const recebiveis = DB.getAll('recebiveis');
    const contasPagar = DB.getAll('contaspagar');

    const ativos = leads.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
    const hoje = new Date();
    const semanaFim = new Date(hoje); semanaFim.setDate(hoje.getDate() + 7);
    const semanaFimStr = semanaFim.toISOString().split('T')[0];
    const hojeStr = hoje.toISOString().split('T')[0];

    const ativsHojeOuMais = atividades.filter(a => a.status === 'pendente' && a.data && a.data >= hojeStr && a.data <= semanaFimStr);
    const ativsAtrasadas = atividades.filter(a => a.status === 'pendente' && a.data && a.data < hojeStr);
    const followupsSemana = ativos.filter(l => l.dataProximaAcao && l.dataProximaAcao >= hojeStr && l.dataProximaAcao <= semanaFimStr);
    const followupsAtrasados = ativos.filter(l => l.dataProximaAcao && l.dataProximaAcao < hojeStr);
    const projetosAtrasados = projetos.filter(p => p.status === 'em_andamento' && p.prazo && p.prazo < hojeStr);

    let parcelasVencendoSemana = 0, parcelasVencidas = 0;
    recebiveis.forEach(r => {
      (r.parcelas||[]).forEach(p => {
        if (p.status === 'recebido') return;
        if (p.vencimento >= hojeStr && p.vencimento <= semanaFimStr) parcelasVencendoSemana++;
        else if (p.vencimento < hojeStr) parcelasVencidas++;
      });
    });

    let contasVencendoSemana = 0;
    contasPagar.filter(c => c.status === 'pendente').forEach(c => {
      if (c.vencimento >= hojeStr && c.vencimento <= semanaFimStr) contasVencendoSemana++;
    });

    // Resumo do pipeline
    const totalPipeline = Utils.sum(ativos, 'valorEstimado');

    const linhas = [
      ativsAtrasadas.length > 0 ? `âš  **${ativsAtrasadas.length}** atividade(s) atrasada(s)` : null,
      followupsAtrasados.length > 0 ? `âš  **${followupsAtrasados.length}** follow-up(s) em atraso` : null,
      parcelasVencidas > 0 ? `ðŸ’¸ **${parcelasVencidas}** parcela(s) vencida(s) a receber` : null,
      ativsHojeOuMais.length > 0 ? `ðŸ“‹ **${ativsHojeOuMais.length}** atividade(s) para essa semana` : null,
      followupsSemana.length > 0 ? `ðŸ’¼ **${followupsSemana.length}** follow-up(s) essa semana` : null,
      parcelasVencendoSemana > 0 ? `ðŸ’° **${parcelasVencendoSemana}** parcela(s) vencendo essa semana` : null,
      contasVencendoSemana > 0 ? `ðŸ’¸ **${contasVencendoSemana}** conta(s) a pagar essa semana` : null,
      projetosAtrasados.length > 0 ? `ðŸ”´ **${projetosAtrasados.length}** projeto(s) atrasado(s)` : null,
      `ðŸ’¼ Pipeline total: **${Utils.formatCurrency(totalPipeline)}** (${ativos.length} leads)`,
    ].filter(Boolean);

    if (linhas.length === 0) return;

    Toast.show(`ðŸ“… <strong>Bom comeÃ§o de semana!</strong><br>${linhas.slice(0,4).map(l => l.replace(/\*\*/g, '')).join(' Â· ')}`, 10000);

    // Browser notification
    const prefs = getPrefs();
    if (prefs.browser) {
      _notifyBrowser({
        tag: 'weekly_summary',
        title: 'ðŸ“… Resumo da Semana â€” Bikows CRM',
        body: linhas.slice(0,3).map(l => l.replace(/\*\*/g, '')).join(' | '),
      });
    }

    // E-mail
    if (prefs.email && prefs.emailDest) {
      _sendEmailDigest(linhas.map((l, i) => ({
        tag: 'weekly_' + i,
        title: 'ðŸ“… Resumo Semanal',
        body: l.replace(/\*\*/g, ''),
      })), prefs);
    }
  }

  /* ---- Digest por e-mail (via Edge Function crm-notifications) ---- */
  async function _sendEmailDigest(items, prefs) {
    if (!prefs.emailDest) return;
    try {
      // Dispara o digest urgente â€” a edge function re-consulta o banco e envia
      await _supabase.functions.invoke('crm-notifications', {
        body: { tipo: 'urgent' },
      });
    } catch (e) {
      console.warn('[Notif] Email falhou:', e);
    }
  }

  /* ---- Enviar e-mail de teste (chamada manual da Config) ---- */
  async function sendTestEmail() {
    try {
      const { data, error } = await _supabase.functions.invoke('crm-notifications', {
        body: { tipo: 'daily' },
      });
      if (error) throw error;
      if (data?.ok === false && data?.reason === 'sem_alertas') {
        Toast.success('âœ… E-mail de teste enviado! (sem alertas hoje, chegarÃ¡ vazio)');
      } else if (data?.ok) {
        Toast.success('âœ… E-mail enviado com sucesso para ' + (data.to || 'destinatÃ¡rio'));
      } else {
        Toast.error('âŒ Erro ao enviar: ' + (data?.resend?.message || 'verifique a API key'));
      }
    } catch (e) {
      Toast.error('âŒ Erro: ' + e.message);
    }
  }

  /* ====================================================
     API PÃšBLICA
     ==================================================== */
  return {
    init,
    requestPermission,
    getPrefs,
    savePrefs,
    checkAll: _checkAll,
    sendTestEmail,
  };
})();
