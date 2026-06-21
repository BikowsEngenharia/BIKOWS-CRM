/* ==========================================
   GOOGLE-CAL — Integração Google Calendar API v3
   ==========================================
   CONFIGURAÇÃO NECESSÁRIA no Google Cloud Console:
   1. Acesse console.cloud.google.com
   2. Crie um projeto e ative a Google Calendar API
   3. Em "Credenciais", crie um OAuth 2.0 Client ID (tipo: Aplicativo da Web)
   4. Em "Origens JavaScript autorizadas", adicione:
        https://bikowsengenharia.github.io
   5. Em "URIs de redirecionamento autorizados", adicione:
        https://bikowsengenharia.github.io
   6. Cole o Client ID abaixo
   ========================================== */

const GCAL_CLIENT_ID = '1067520616871-i0tpqsgkafn59u4icads3uqc9994irpf.apps.googleusercontent.com';
const GCAL_API_KEY   = '';
const GCAL_SCOPES    = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
const GCAL_DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const LS_KEY_CONNECTED = 'gcal_was_connected';

const GoogleCal = (() => {

  // ── Estado interno ──────────────────────────────────────────────────────────
  let _connected       = false;
  let _lastSync        = null;
  let _tokenClient     = null;
  let _accessToken     = null;
  let _silentConnecting = false;
  let _importedEvents  = [];       // eventos importados do Google Calendar (cache em memória)
  let _importCacheKey  = null;     // 'YYYY-MM' do último import

  // ── Mapeamento de colorId por tipo de atividade ─────────────────────────────
  const COLOR_MAP = {
    ligacao:  '1',
    email:    '2',
    reuniao:  '3',
    followup: '6',
    tarefa:   '8',
  };

  // ── Helpers internos ────────────────────────────────────────────────────────

  function _isConfigured() {
    return GCAL_CLIENT_ID && GCAL_CLIENT_ID.trim() !== '';
  }

  function _showNotConfiguredModal() {
    Modal.open({
      title: '🔗 Configurar Google Calendar',
      body: `
        <div style="line-height:1.7;font-size:0.95rem">
          <p class="mb-3">Para conectar o Google Calendar:</p>
          <ol style="padding-left:1.4rem;margin:0 0 1rem">
            <li>Acesse <strong>console.cloud.google.com</strong></li>
            <li>Crie um projeto e ative a <strong>Google Calendar API</strong></li>
            <li>Em <em>"Credenciais"</em>, crie um <strong>OAuth 2.0 Client ID</strong> (tipo: Aplicativo da Web)</li>
            <li>Em <strong>"Origens JavaScript autorizadas"</strong>, adicione:<br>
              <code style="background:var(--bg-secondary,#f1f5f9);padding:2px 8px;border-radius:4px;font-size:0.9rem">https://bikowsengenharia.github.io</code>
            </li>
            <li>Cole o Client ID no arquivo <code style="background:var(--bg-secondary,#f1f5f9);padding:1px 5px;border-radius:4px">js/modules/google-cal.js</code></li>
          </ol>
          <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px;font-size:0.85rem;color:#92400e">
            ⚠ <strong>Atenção:</strong> A origem <code>https://bikowsengenharia.github.io</code> precisa estar cadastrada no Google Cloud Console, caso contrário o login será bloqueado.
          </div>
        </div>
      `,
      saveCb: null,
    });
    const foot = document.getElementById('modalFoot');
    if (foot) foot.style.display = 'none';
  }

  function _gapiReady() {
    return typeof gapi !== 'undefined' && gapi.client && gapi.client.calendar;
  }

  function _gisReady() {
    return typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;
  }

  function _getClientName(clienteId) {
    if (!clienteId) return '';
    const c = DB.get('clientes', clienteId);
    return c ? (c.nome || '') : '';
  }

  function _buildDateTime(dateStr, timeStr) {
    const time = timeStr || '09:00';
    return dateStr + 'T' + time + ':00';
  }

  function _formatLastSync() {
    if (!_lastSync) return 'Nunca sincronizado';
    const d = new Date(_lastSync);
    return 'Última sinc: ' + d.toLocaleString('pt-BR');
  }

  // Extrai data 'YYYY-MM-DD' de um evento do Google Calendar
  function _extractDate(ev) {
    if (ev.start.date) return ev.start.date; // all-day
    const dt = new Date(ev.start.dateTime);
    const y  = dt.getFullYear();
    const m  = String(dt.getMonth() + 1).padStart(2, '0');
    const d  = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ── Inicialização ────────────────────────────────────────────────────────────

  function init() {
    if (!_isConfigured()) return;

    _ensureGapi(() => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            apiKey:        GCAL_API_KEY || undefined,
            discoveryDocs: [GCAL_DISCOVERY],
          });
          _initTokenClient();
        } catch (err) {
          console.warn('[GoogleCal] Erro ao inicializar gapi.client:', err);
        }
      });
    });
  }

  function _ensureGapi(cb) {
    if (typeof gapi !== 'undefined') { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload  = cb;
    s.onerror = () => console.warn('[GoogleCal] Falha ao carregar gapi.');
    document.head.appendChild(s);
  }

  function _initTokenClient() {
    if (!_gisReady()) {
      setTimeout(_initTokenClient, 1000);
      return;
    }
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope:     GCAL_SCOPES,
      callback:  (tokenResponse) => {
        const wasSilent = _silentConnecting;
        _silentConnecting = false;

        if (tokenResponse.error) {
          if (wasSilent) {
            // Reconexão silenciosa falhou — limpar flag sem mostrar erro
            if (tokenResponse.error === 'access_denied' || tokenResponse.error === 'interaction_required') {
              localStorage.removeItem(LS_KEY_CONNECTED);
            }
          } else {
            Toast.error('Erro ao conectar Google Calendar: ' + tokenResponse.error);
          }
          console.warn('[GoogleCal] Erro no token:', tokenResponse.error);
          return;
        }

        _accessToken = tokenResponse.access_token;
        _connected   = true;
        localStorage.setItem(LS_KEY_CONNECTED, '1');
        gapi.client.setToken({ access_token: _accessToken });
        _refreshAllStatuses();
        if (!wasSilent) Toast.success('Google Calendar conectado!');
      },
    });

    // Auto-reconectar silenciosamente se o usuário já havia conectado antes
    if (localStorage.getItem(LS_KEY_CONNECTED) === '1') {
      setTimeout(_silentConnect, 800);
    }
  }

  function _silentConnect() {
    if (!_tokenClient) { setTimeout(_silentConnect, 1000); return; }
    _silentConnecting = true;
    try {
      _tokenClient.requestAccessToken({ prompt: '' });
    } catch(e) {
      _silentConnecting = false;
      console.warn('[GoogleCal] Erro na reconexão silenciosa:', e);
    }
  }

  function _refreshAllStatuses() {
    document.querySelectorAll('[data-gcal-status]').forEach(el => {
      renderStatus(el);
    });
  }

  // ── Conexão / desconexão ────────────────────────────────────────────────────

  function connect() {
    if (!_isConfigured()) {
      _showNotConfiguredModal();
      return;
    }
    if (!_tokenClient) {
      Toast.warning('Carregando bibliotecas do Google… tente novamente em alguns segundos.');
      init();
      return;
    }
    _tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  function disconnect() {
    if (_accessToken && _gisReady()) {
      google.accounts.oauth2.revoke(_accessToken, () => {
        console.log('[GoogleCal] Token revogado.');
      });
    }
    _accessToken = null;
    _connected   = false;
    _importedEvents = [];
    _importCacheKey = null;
    localStorage.removeItem(LS_KEY_CONNECTED);
    if (typeof gapi !== 'undefined' && gapi.client) {
      gapi.client.setToken(null);
    }
    _refreshAllStatuses();
    Toast.success('Google Calendar desconectado.');
  }

  function isConnected() {
    return _connected;
  }

  // ── Importar eventos DO Google Calendar ────────────────────────────────────

  /**
   * importFromGoogle(year, month) — Busca eventos DO Google Calendar para o
   * mês informado e os armazena em cache (_importedEvents).
   * Eventos criados pelo próprio CRM são filtrados para evitar duplicação.
   * Retorna array de { dateStr, summary, isAllDay, timeLabel, htmlLink }.
   */
  async function importFromGoogle(year, month) {
    if (!_isConfigured() || !_connected || !_gapiReady()) return [];

    const cacheKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    // Retornar cache se for o mesmo mês (evita re-requisição ao navegar)
    if (_importCacheKey === cacheKey) return _importedEvents;

    try {
      const firstDay = new Date(year, month, 1);
      const lastDay  = new Date(year, month + 1, 0);
      const timeMin  = firstDay.toISOString();
      const timeMax  = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const resp = await gapi.client.calendar.events.list({
        calendarId:   'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy:      'startTime',
        maxResults:   200,
      });

      const items = resp.result.items || [];

      _importedEvents = items
        .filter(ev => {
          // Excluir eventos que o CRM criou (para não duplicar)
          const priv = ev.extendedProperties?.private || {};
          return !priv.crmAtividadeId && !priv.crmLeadId;
        })
        .map(ev => {
          const dateStr   = _extractDate(ev);
          const isAllDay  = !!ev.start.date;
          let timeLabel   = '';
          if (!isAllDay && ev.start.dateTime) {
            const dt = new Date(ev.start.dateTime);
            timeLabel = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          }
          return {
            gcalId:   ev.id,
            dateStr,
            summary:  ev.summary || '(sem título)',
            isAllDay,
            timeLabel,
            htmlLink: ev.htmlLink || '',
          };
        });

      _importCacheKey = cacheKey;
      return _importedEvents;

    } catch (err) {
      console.warn('[GoogleCal] Erro ao importar eventos:', err);
      // Token pode ter expirado — tentar reconectar
      if (err.status === 401) {
        _connected = false;
        _refreshAllStatuses();
      }
      return [];
    }
  }

  /**
   * getImportedEvents() — Retorna os eventos importados em cache (síncrono).
   */
  function getImportedEvents() {
    return _importedEvents;
  }

  /**
   * clearImportCache() — Força re-importação no próximo render.
   */
  function clearImportCache() {
    _importCacheKey = null;
    _importedEvents = [];
  }

  // ── Criar / atualizar evento no Google Calendar ─────────────────────────────

  async function _upsertEvent(resource, existingEventId) {
    const calendarId = 'primary';
    if (existingEventId) {
      try {
        const resp = await gapi.client.calendar.events.update({ calendarId, eventId: existingEventId, resource });
        return resp.result.id;
      } catch (updateErr) {
        if (updateErr.status === 404 || updateErr.status === 410) {
          const resp = await gapi.client.calendar.events.insert({ calendarId, resource });
          return resp.result.id;
        }
        throw updateErr;
      }
    } else {
      const resp = await gapi.client.calendar.events.insert({ calendarId, resource });
      return resp.result.id;
    }
  }

  // ── Sincronizar atividades → Google Calendar ────────────────────────────────

  async function syncAtividades() {
    if (!_isConfigured()) { _showNotConfiguredModal(); return 0; }
    if (!_connected)      { Toast.warning('Conecte o Google Calendar antes de sincronizar.'); return 0; }
    if (!_gapiReady())    { Toast.error('API do Google não está pronta. Recarregue a página.'); return 0; }

    const today      = Utils.todayStr();
    const atividades = DB.getAll('atividades').filter(a =>
      a.status === 'pendente' && a.data && a.data >= today
    );

    let count = 0;
    const errors = [];

    for (const a of atividades) {
      try {
        const clientName = _getClientName(a.clienteId);
        const startDT    = _buildDateTime(a.data, a.hora);
        const endDT      = _buildDateTime(a.data, _addOneHour(a.hora || '09:00'));

        const descLines = [];
        if (a.descricao)   descLines.push(a.descricao);
        if (clientName)    descLines.push('Cliente: ' + clientName);
        if (a.responsavel) descLines.push('Responsável: ' + a.responsavel);

        const resource = {
          summary:     '[CRM] ' + a.titulo,
          description: descLines.join('\n'),
          colorId:     COLOR_MAP[a.tipo] || '8',
          start: { dateTime: startDT, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end:   { dateTime: endDT,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 30 }],
          },
          extendedProperties: {
            private: { crmAtividadeId: a.id },
          },
        };

        const eventId = await _upsertEvent(resource, a.gcalEventId || null);
        DB.update('atividades', a.id, { gcalEventId: eventId });
        count++;
      } catch (err) {
        errors.push(a.titulo);
        console.error('[GoogleCal] Erro ao sincronizar atividade', a.id, err);
      }
    }

    _lastSync = Date.now();
    clearImportCache(); // forçar re-importação para refletir novos eventos
    _refreshAllStatuses();

    if (errors.length) {
      Toast.warning(`${count} atividade(s) sincronizada(s). Erros em: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '…' : ''}`);
    } else if (count === 0) {
      Toast.success('Nenhuma atividade pendente futura para sincronizar.');
    } else {
      Toast.success(`${count} atividade(s) sincronizada(s) no Google Calendar!`);
    }
    return count;
  }

  // ── Sincronizar leads → Google Calendar ─────────────────────────────────────

  async function syncLeads() {
    if (!_isConfigured()) { _showNotConfiguredModal(); return 0; }
    if (!_connected)      { Toast.warning('Conecte o Google Calendar antes de sincronizar.'); return 0; }
    if (!_gapiReady())    { Toast.error('API do Google não está pronta. Recarregue a página.'); return 0; }

    const today          = Utils.todayStr();
    const closedStatuses = ['fechado_ganho', 'executado', 'fechado_perdido'];
    const leads          = DB.getAll('leads').filter(l =>
      !closedStatuses.includes(l.status) &&
      l.dataProximaAcao &&
      l.dataProximaAcao >= today
    );

    let count = 0;
    const errors = [];

    for (const lead of leads) {
      try {
        const startDT = _buildDateTime(lead.dataProximaAcao, '09:00');
        const endDT   = _buildDateTime(lead.dataProximaAcao, '10:00');

        const descLines = ['Follow-up de lead no CRM Engenharia'];
        if (lead.responsavel)    descLines.push('Responsável: ' + lead.responsavel);
        if (lead.valorEstimado)  descLines.push('Valor estimado: ' + lead.valorEstimado);

        const resource = {
          summary:     '[CRM] Follow-up: ' + lead.titulo,
          description: descLines.join('\n'),
          colorId:     '6',
          start: { dateTime: startDT, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end:   { dateTime: endDT,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 60 },
              { method: 'email', minutes: 60 },
            ],
          },
          extendedProperties: {
            private: { crmLeadId: lead.id },
          },
        };

        const eventId = await _upsertEvent(resource, lead.gcalEventId || null);
        DB.update('leads', lead.id, { gcalEventId: eventId });
        count++;
      } catch (err) {
        errors.push(lead.titulo);
        console.error('[GoogleCal] Erro ao sincronizar lead', lead.id, err);
      }
    }

    _lastSync = Date.now();
    clearImportCache();
    _refreshAllStatuses();

    if (errors.length) {
      Toast.warning(`${count} follow-up(s) sincronizado(s). Erros em: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '…' : ''}`);
    } else if (count === 0) {
      Toast.success('Nenhum lead com próxima ação futura para sincronizar.');
    } else {
      Toast.success(`${count} follow-up(s) de leads sincronizado(s) no Google Calendar!`);
    }
    return count;
  }

  // ── Utilitário de horário ────────────────────────────────────────────────────

  function _addOneHour(timeStr) {
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr, 10) + 1;
    const m = mStr || '00';
    if (h >= 24) h = 23;
    return String(h).padStart(2, '0') + ':' + m;
  }

  // ── Renderização de status ───────────────────────────────────────────────────

  function renderStatus(container) {
    const el = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    if (!el) return;

    el.setAttribute('data-gcal-status', '1');

    const cfg = (typeof DB !== 'undefined') ? DB.getConfig() : null;
    if (!cfg?.gcalEnabled && !_connected) {
      el.innerHTML = '';
      return;
    }

    if (!_isConfigured()) {
      el.innerHTML = `
        <div class="card" style="border-left:4px solid #f59e0b">
          <div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="font-size:2rem">📅</div>
            <div style="flex:1;min-width:200px">
              <div class="font-bold" style="margin-bottom:4px">Google Calendar</div>
              <div class="text-sm text-muted">Integração não configurada. Configure o Client ID para ativar.</div>
            </div>
            <button class="btn btn-secondary" onclick="GoogleCal.connect()">⚙ Configurar</button>
          </div>
        </div>`;
      return;
    }

    if (!_connected) {
      el.innerHTML = `
        <div class="card" style="border-left:4px solid #64748b">
          <div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="font-size:2rem">📅</div>
            <div style="flex:1;min-width:200px">
              <div class="font-bold" style="margin-bottom:4px">Google Calendar</div>
              <div class="text-sm text-muted">Não conectado · Sincronize atividades e veja seus eventos do Google</div>
            </div>
            <button class="btn btn-primary" onclick="GoogleCal.connect()">⚡ Conectar Google Calendar</button>
          </div>
        </div>`;
      return;
    }

    const importedCount = _importedEvents.length;

    el.innerHTML = `
      <div class="card" style="border-left:4px solid #10b981">
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">
            <div style="font-size:2rem">📅</div>
            <div style="flex:1;min-width:200px">
              <div class="font-bold" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="color:#10b981;font-size:1.1rem">✔</span> Google Calendar conectado
              </div>
              <div class="text-sm text-muted">${Utils.escHtml(_formatLastSync())}${importedCount > 0 ? ` · ${importedCount} evento(s) importado(s)` : ''}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="GoogleCal.disconnect()" title="Desconectar">Desconectar</button>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-secondary" onclick="GoogleCal.syncAtividades()">
              🔄 Exportar Atividades
            </button>
            <button class="btn btn-secondary" onclick="GoogleCal.syncLeads()">
              🎯 Exportar Follow-ups
            </button>
            <button class="btn btn-secondary" onclick="GoogleCal._manualImport()">
              📥 Importar do Google
            </button>
            <button class="btn btn-primary" onclick="GoogleCal.showSyncModal()">
              ⚙ Opções
            </button>
          </div>
        </div>
      </div>`;
  }

  // Importação manual (limpa cache e dispara re-importação)
  async function _manualImport() {
    if (!_connected) { Toast.warning('Conecte o Google Calendar antes de importar.'); return; }
    clearImportCache();
    Toast.success('Atualizando eventos do Google Calendar…');
    // Disparar re-render do calendário se estiver aberto
    const calEl = document.getElementById('gcalStatusContainer');
    if (calEl) {
      // Tentar re-renderizar o calendário para mostrar os novos eventos
      if (typeof Calendario !== 'undefined') setTimeout(() => Calendario.render(), 100);
    }
  }

  // ── Modal de sincronização ───────────────────────────────────────────────────

  function showSyncModal() {
    if (!_isConfigured()) { _showNotConfiguredModal(); return; }

    const today     = Utils.todayStr();
    const closedSt  = ['fechado_ganho', 'executado', 'fechado_perdido'];
    const pendAtiv  = DB.getAll('atividades').filter(a => a.status === 'pendente' && a.data && a.data >= today);
    const pendLeads = DB.getAll('leads').filter(l => !closedSt.includes(l.status) && l.dataProximaAcao && l.dataProximaAcao >= today);

    const connStatus = _connected
      ? `<span style="color:#10b981;font-weight:600">✔ Conectado</span>`
      : `<span style="color:#ef4444;font-weight:600">✘ Desconectado</span>`;

    Modal.open({
      title: '📅 Google Calendar — Sincronização',
      body: `
        <div id="gcalSyncBody">
          <div class="card mb-4" style="background:var(--bg-secondary,#f8fafc)">
            <div class="card-body" style="padding:12px 16px">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <span class="text-sm font-bold">Status da conexão: ${connStatus}</span>
                <span class="text-sm text-muted">${Utils.escHtml(_formatLastSync())}</span>
              </div>
            </div>
          </div>

          <div class="stats-row mb-4">
            <div class="stat-box">
              <div class="stat-val">${pendAtiv.length}</div>
              <div class="stat-lbl">Atividades a exportar</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${pendLeads.length}</div>
              <div class="stat-lbl">Follow-ups a exportar</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${_importedEvents.length}</div>
              <div class="stat-lbl">Importados do Google</div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.95rem">
              <input type="checkbox" id="gcalOptAtiv" checked style="width:16px;height:16px">
              <div>
                <strong>Exportar Atividades → Google</strong>
                <div class="text-xs text-muted">Cria/atualiza eventos no Google Calendar para atividades pendentes futuras</div>
              </div>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.95rem">
              <input type="checkbox" id="gcalOptLeads" checked style="width:16px;height:16px">
              <div>
                <strong>Exportar Follow-ups → Google</strong>
                <div class="text-xs text-muted">Cria/atualiza lembretes no Google Calendar para leads com próxima ação futura</div>
              </div>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.95rem">
              <input type="checkbox" id="gcalOptImport" checked style="width:16px;height:16px">
              <div>
                <strong>Importar Google → Calendário CRM</strong>
                <div class="text-xs text-muted">Exibe seus eventos pessoais do Google Calendar no calendário do CRM</div>
              </div>
            </label>
          </div>

          <div id="gcalProgress" style="display:none">
            <div style="background:var(--bg-secondary,#f1f5f9);border-radius:8px;padding:12px 16px;margin-bottom:12px">
              <div id="gcalProgressMsg" class="text-sm" style="margin-bottom:8px">Aguardando…</div>
              <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
                <div id="gcalProgressBar" style="background:#3b82f6;height:8px;width:0%;transition:width 0.3s ease;border-radius:4px"></div>
              </div>
            </div>
          </div>

          <div id="gcalResult" style="display:none"></div>

          ${!_connected ? `
          <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 16px;font-size:0.9rem;margin-top:8px">
            ⚠ Conecte o Google Calendar antes de sincronizar.
            <button class="btn btn-sm btn-primary" style="margin-left:12px" onclick="Modal.close();GoogleCal.connect()">Conectar agora</button>
          </div>` : ''}
        </div>
      `,
      saveCb: () => _runSyncFromModal(),
    });

    const btn = document.getElementById('btnModalSave');
    if (btn) {
      btn.textContent = '🔄 Sincronizar agora';
      if (!_connected) btn.disabled = true;
    }
  }

  async function _runSyncFromModal() {
    const optAtiv   = document.getElementById('gcalOptAtiv');
    const optLeads  = document.getElementById('gcalOptLeads');
    const optImport = document.getElementById('gcalOptImport');
    const progress  = document.getElementById('gcalProgress');
    const bar       = document.getElementById('gcalProgressBar');
    const msg       = document.getElementById('gcalProgressMsg');
    const result    = document.getElementById('gcalResult');
    const saveBtn   = document.getElementById('btnModalSave');

    if (!_connected) { Toast.warning('Conecte o Google Calendar antes de sincronizar.'); return; }

    const doAtiv   = optAtiv   ? optAtiv.checked   : false;
    const doLeads  = optLeads  ? optLeads.checked  : false;
    const doImport = optImport ? optImport.checked : false;

    if (!doAtiv && !doLeads && !doImport) { Toast.warning('Selecione ao menos uma opção.'); return; }

    if (saveBtn) saveBtn.disabled = true;
    if (progress) progress.style.display = 'block';
    if (result)   result.style.display   = 'none';

    let totalSynced = 0;
    const summary   = [];

    try {
      if (doAtiv) {
        if (msg) msg.textContent = 'Exportando atividades…';
        if (bar) bar.style.width = '15%';
        const n = await syncAtividades();
        totalSynced += n;
        summary.push(`<strong>${n}</strong> atividade(s) exportada(s) para o Google`);
        if (bar) bar.style.width = '40%';
      }

      if (doLeads) {
        if (msg) msg.textContent = 'Exportando follow-ups de leads…';
        if (bar) bar.style.width = '55%';
        const n = await syncLeads();
        totalSynced += n;
        summary.push(`<strong>${n}</strong> follow-up(s) exportado(s) para o Google`);
        if (bar) bar.style.width = '75%';
      }

      if (doImport) {
        if (msg) msg.textContent = 'Importando eventos do Google Calendar…';
        clearImportCache();
        // Descobrir mês atual do calendário
        const now = new Date();
        const events = await importFromGoogle(now.getFullYear(), now.getMonth());
        summary.push(`<strong>${events.length}</strong> evento(s) importado(s) do Google`);
        if (bar) bar.style.width = '100%';
      }

      if (msg) msg.textContent = 'Sincronização concluída!';
      if (bar) bar.style.width = '100%';

      if (result) {
        result.style.display = 'block';
        result.innerHTML = `
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px;font-size:0.95rem">
            <div style="font-weight:600;color:#15803d;margin-bottom:6px">✔ Sincronização concluída</div>
            <ul style="margin:0;padding-left:1.2rem">
              ${summary.map(s => `<li>${s}</li>`).join('')}
            </ul>
            <div class="text-xs text-muted mt-2">${Utils.escHtml(_formatLastSync())}</div>
          </div>`;
      }

    } catch (err) {
      if (msg) msg.textContent = 'Erro durante a sincronização.';
      if (bar) { bar.style.background = '#ef4444'; bar.style.width = '100%'; }
      Toast.error('Erro na sincronização: ' + (err.message || JSON.stringify(err)));
      console.error('[GoogleCal] Erro na sincronização via modal:', err);
    } finally {
      if (saveBtn) {
        saveBtn.disabled    = false;
        saveBtn.textContent = '🔄 Sincronizar novamente';
      }
    }
  }

  // ── Exportação pública ───────────────────────────────────────────────────────
  return {
    init,
    connect,
    disconnect,
    isConnected,
    syncAtividades,
    syncLeads,
    importFromGoogle,
    getImportedEvents,
    clearImportCache,
    renderStatus,
    showSyncModal,
    _manualImport,
  };

})();
