/* ==========================================
   CONFIG — Configurações do sistema
   ========================================== */
const Config = (() => {

  function render() {
    const cfg = DB.getConfig();

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Configurações</h2>
      </div>

      <div class="grid-2">
        <!-- Dados da Empresa -->
        <div class="card">
          <div class="card-header"><div class="card-title">🏢 Dados da Empresa</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Nome da Empresa</label>
              <input class="form-control" id="cfgEmpresa" value="${Utils.escHtml(cfg.empresa||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">CNPJ</label>
              <input class="form-control" id="cfgCnpj" value="${Utils.escHtml(cfg.cnpj||'')}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Cidade</label>
                <input class="form-control" id="cfgCidade" value="${Utils.escHtml(cfg.cidade||'')}">
              </div>
              <div class="form-group">
                <label class="form-label">Estado</label>
                <input class="form-control" id="cfgEstado" value="${Utils.escHtml(cfg.estado||'')}">
              </div>
            </div>
            <button class="btn btn-primary w-full" onclick="Config.saveEmpresa()">Salvar Dados da Empresa</button>
          </div>
        </div>

        <!-- Usuário -->
        <div class="card">
          <div class="card-header"><div class="card-title">👤 Meu Perfil</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Nome</label>
              <input class="form-control" id="cfgUserNome" value="${Utils.escHtml(cfg.usuario?.nome||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Cargo</label>
              <input class="form-control" id="cfgUserCargo" value="${Utils.escHtml(cfg.usuario?.cargo||'')}">
            </div>
            <button class="btn btn-primary w-full" onclick="Config.saveUsuario()">Salvar Perfil</button>
          </div>
        </div>

        <!-- Responsáveis -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">👥 Responsáveis / Equipe</div>
            <button class="btn btn-sm btn-secondary" onclick="Config.addResponsavel()">+ Adicionar</button>
          </div>
          <div class="card-body">
            <div id="listResponsaveis">
              ${(cfg.responsaveis||[]).map((r,i) => `
                <div class="parcela-row" data-idx="${i}">
                  <span class="flex-1 font-bold text-sm">${Utils.escHtml(r)}</span>
                  <button class="btn btn-xs btn-danger" onclick="Config.removeResponsavel(${i})">✕</button>
                </div>
              `).join('')}
            </div>
            ${(cfg.responsaveis||[]).length === 0 ? '<div class="text-sm text-muted">Nenhum responsável cadastrado</div>' : ''}
          </div>
        </div>

        <!-- Segmentos -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🏭 Segmentos de Mercado</div>
            <button class="btn btn-sm btn-secondary" onclick="Config.addSegmento()">+ Adicionar</button>
          </div>
          <div class="card-body">
            <div id="listSegmentos">
              ${(cfg.segmentos||[]).map((s,i) => `
                <div class="parcela-row" data-idx="${i}">
                  <span class="flex-1 font-bold text-sm">${Utils.escHtml(s)}</span>
                  <button class="btn btn-xs btn-danger" onclick="Config.removeSegmento(${i})">✕</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Serviços -->
        <div class="card col-span-2">
          <div class="card-header">
            <div class="card-title">🔧 Serviços Oferecidos</div>
            <button class="btn btn-sm btn-secondary" onclick="Config.addServico()">+ Adicionar</button>
          </div>
          <div class="card-body">
            <div style="display:flex;flex-wrap:wrap;gap:8px" id="listServicos">
              ${(cfg.servicos||[]).map((s,i) => `
                <div style="display:flex;align-items:center;gap:6px;background:var(--bg);padding:6px 10px;border-radius:100px;border:1px solid var(--border)">
                  <span class="text-sm font-bold">${Utils.escHtml(s)}</span>
                  <button class="btn btn-xs btn-danger" style="padding:1px 5px;border-radius:100px" onclick="Config.removeServico(${i})">✕</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Regime Tributário -->
        <div class="card">
          <div class="card-header"><div class="card-title">📊 Configurações Financeiras</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Regime Tributário</label>
              <select class="form-control" id="cfgRegime">
                ${['Simples Nacional','Lucro Presumido','Lucro Real'].map(r=>`<option value="${r}" ${(cfg.regimeTributario||'Simples Nacional')===r?'selected':''}>${r}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Alíquota Efetiva de Impostos (%)</label>
              <input class="form-control" id="cfgAliquota" type="number" step="0.1" min="0" max="100" value="${(cfg.aliquotaImpostos||6).toFixed(1)}" placeholder="Ex: 6.0">
              <div class="text-xs text-muted mt-1">Usada no cálculo da DRE. Simples Nacional: 4–15% · Lucro Presumido: ~14–16%</div>
            </div>
            <button class="btn btn-primary w-full" onclick="Config.saveFinanceiro()">Salvar Configurações Financeiras</button>
          </div>
        </div>

        <!-- Backup e Restauração (consolidado) -->
        <div class="card">
          <div class="card-header"><div class="card-title">💾 Backup e Restauração</div></div>
          <div class="card-body">
            <p class="text-sm text-muted mb-3">Exporte um backup completo de todos os dados do CRM ou restaure a partir de um arquivo anterior. Dados são sincronizados com o Supabase.</p>
            <div class="flex gap-2 mb-3" style="flex-wrap:wrap">
              <button class="btn btn-primary" onclick="Config.exportBackup()">📥 Baixar Backup Completo</button>
              <label class="btn btn-secondary" style="cursor:pointer">
                📤 Restaurar Backup
                <input type="file" accept=".json" style="display:none" onchange="Config.importBackup(event)">
              </label>
              <button class="btn btn-danger" onclick="Config.resetData()">🗑 Limpar Todos os Dados</button>
            </div>
            <div class="text-xs text-muted">
              Último backup: <span id="lastBackupDate">—</span><br>
              ⚠ <strong>Exporte regularmente!</strong> O reset apaga dados sem recuperação.
            </div>
          </div>
        </div>

        <!-- Log de Auditoria -->
        <div class="card" style="grid-column:1/-1">
          <div class="card-header">
            <div class="card-title">🔍 Log de Auditoria</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input class="form-control" style="max-width:200px;font-size:12px"
                placeholder="Filtrar por entidade ou resumo..."
                id="auditSearch" oninput="Config.filterAudit(this.value)">
              <button class="btn btn-xs btn-secondary" onclick="Config.clearAudit()">🗑 Limpar</button>
            </div>
          </div>
          <div class="card-body" style="padding:0;max-height:320px;overflow-y:auto" id="auditLogContainer">
            ${_renderAuditLog('')}
          </div>
        </div>

        <!-- Notificações -->
        <div class="card" style="grid-column:1/-1;">
          <div class="card-header"><div class="card-title">🔔 Notificações e Lembretes</div></div>
          <div class="card-body">
            <div class="grid-2" style="gap:16px;">
              <div>
                <div class="detail-label mb-2">Canais de notificação</div>
                <div style="display:flex;flex-direction:column;gap:10px;">
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input type="checkbox" id="cfgNotifBrowser" ${(cfg.notificacoes?.browser!==false)?'checked':''}>
                    <span class="text-sm"><strong>🖥 Navegador (push)</strong> — notifica mesmo com app em background</span>
                  </label>
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input type="checkbox" id="cfgNotifInApp" ${(cfg.notificacoes?.inApp!==false)?'checked':''}>
                    <span class="text-sm"><strong>🔔 In-app</strong> — toast visual ao usar o CRM</span>
                  </label>
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input type="checkbox" id="cfgNotifEmail" ${cfg.notificacoes?.email?'checked':''} onchange="Config.toggleEmailDest()">
                    <span class="text-sm"><strong>📧 E-mail</strong> — resumo diário (requer configuração)</span>
                  </label>
                  <div class="form-group" id="emailDestGrp" style="${cfg.notificacoes?.email?'':'display:none'}">
                    <label class="form-label">E-mail de destino</label>
                    <input class="form-control" id="cfgEmailDest" value="${Utils.escHtml(cfg.notificacoes?.emailDest||'')}" placeholder="seu@email.com.br">
                  </div>
                </div>
              </div>
              <div>
                <div class="detail-label mb-2">Antecedência por tipo (dias)</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${[
                    ['atividades','📋 Atividades',1],
                    ['reunioes','🤝 Reuniões',1],
                    ['leads','💼 Follow-ups',0],
                    ['parcelas','💰 Parcelas',3],
                    ['licitacoes','🏛 Licitações',3],
                    ['marketing','📢 Posts marketing',1],
                    ['contasPagar','💸 Contas a pagar',3],
                  ].map(([key,label,def]) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                      <span class="text-sm">${label}</span>
                      <div style="display:flex;align-items:center;gap:6px;">
                        <input type="number" class="form-control form-control-sm" id="cfgAnt_${key}"
                          value="${cfg.notificacoes?.antecedencia?.[key]??def}" min="0" max="30" style="width:60px;text-align:center;">
                        <span class="text-xs text-muted">dias antes</span>
                      </div>
                    </div>`).join('')}
                </div>
              </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
              <button class="btn btn-primary" onclick="Config.saveNotificacoes()">💾 Salvar configurações</button>
              <button class="btn btn-ghost" onclick="Notifications.requestPermission()">🖥 Ativar push no navegador</button>
              <button class="btn btn-ghost" onclick="Notifications.checkAll()">🔄 Verificar lembretes agora</button>
              <button class="btn btn-secondary" onclick="Notifications.sendTestEmail()" title="Dispara o e-mail diário agora para testar">📧 Testar e-mail</button>
            </div>
            <div style="margin-top:14px;padding:12px 16px;background:var(--surface-2);border-radius:var(--radius);border:1px solid var(--border);font-size:12px;color:var(--text-muted)">
              📅 <strong>Agendamentos automáticos:</strong>
              Resumo diário <strong>08h</strong> (seg–dom) · Relatório semanal <strong>segunda às 08h</strong> · Alertas urgentes <strong>07h</strong> (seg–sex, somente se houver itens críticos).<br>
              ⚙️ Requer a <strong>RESEND_API_KEY</strong> configurada nos segredos do Supabase para funcionar.
            </div>
          </div>
        </div>

        <!-- Google Calendar -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📅 Google Calendar</div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;font-weight:500">
              <input type="checkbox" id="gcalEnabledToggle" ${DB.getConfig()?.gcalEnabled ? 'checked' : ''}
                onchange="Config.toggleGcal(this.checked)"
                style="width:16px;height:16px;cursor:pointer">
              Ativar integração
            </label>
          </div>
          <div class="card-body" id="gcalStatusCard">
            ${!DB.getConfig()?.gcalEnabled
              ? `<div class="text-sm text-muted">Integração desativada. Ative o toggle acima para conectar o Google Calendar.</div>`
              : `<div class="text-sm text-muted">Verificando integração...</div>`
            }
          </div>
        </div>

        <!-- Atalhos de teclado -->
        <div class="card">
          <div class="card-header"><div class="card-title">⌨ Atalhos de Teclado</div></div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail-field"><div class="detail-label"><kbd class="shortcut-hint">N</kbd></div><div class="detail-value text-sm">Novo item na tela atual</div></div>
              <div class="detail-field"><div class="detail-label"><kbd class="shortcut-hint">/</kbd></div><div class="detail-value text-sm">Focar busca global</div></div>
              <div class="detail-field"><div class="detail-label"><kbd class="shortcut-hint">ESC</kbd></div><div class="detail-value text-sm">Fechar modal / busca</div></div>
              <div class="detail-field"><div class="detail-label"><kbd class="shortcut-hint">1</kbd>–<kbd class="shortcut-hint">9</kbd></div><div class="detail-value text-sm">Navegar entre módulos</div></div>
              <div class="detail-field"><div class="detail-label"><kbd class="shortcut-hint">C</kbd></div><div class="detail-value text-sm">Abrir Calendário</div></div>
              <div class="detail-field"><div class="detail-label"><kbd class="shortcut-hint">L</kbd></div><div class="detail-value text-sm">Abrir Licitações</div></div>
              <div class="detail-field"><div class="detail-label"><kbd class="shortcut-hint">R</kbd></div><div class="detail-value text-sm">Abrir Relatórios</div></div>
            </div>
            <div class="text-xs text-muted mt-3">Atalhos desativados quando um campo de texto está focado ou modal está aberto.</div>
          </div>
        </div>

        <!-- Info sistema -->
        <div class="card">
          <div class="card-header"><div class="card-title">ℹ Sistema</div></div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail-field"><div class="detail-label">Clientes</div><div class="detail-value">${DB.getAll('clientes').length}</div></div>
              <div class="detail-field"><div class="detail-label">Leads</div><div class="detail-value">${DB.getAll('leads').length}</div></div>
              <div class="detail-field"><div class="detail-label">Projetos</div><div class="detail-value">${DB.getAll('projetos').length}</div></div>
              <div class="detail-field"><div class="detail-label">Contatos</div><div class="detail-value">${DB.getAll('contatos').length}</div></div>
              <div class="detail-field"><div class="detail-label">Propostas</div><div class="detail-value">${DB.getAll('propostas').length}</div></div>
              <div class="detail-field"><div class="detail-label">Atividades</div><div class="detail-value">${DB.getAll('atividades').length}</div></div>
              <div class="detail-field"><div class="detail-label">Licitações</div><div class="detail-value">${DB.getAll('licitacoes').length}</div></div>
            </div>
          </div>
        </div>
      </div>
    `;
    // Render Google Calendar status after DOM is ready
    setTimeout(() => {
      if (typeof GoogleCal !== 'undefined' && DB.getConfig()?.gcalEnabled) {
        GoogleCal.renderStatus('#gcalStatusCard');
      }
      // Show last backup date
      const lb = localStorage.getItem('crm_last_backup');
      const el = document.getElementById('lastBackupDate');
      if (el && lb) el.textContent = Utils.formatDate(lb.split('T')[0]) + ' às ' + lb.split('T')[1].substring(0, 5);
    }, 50);
  }

  function toggleGcal(enabled) {
    DB.saveConfig({ gcalEnabled: enabled });
    const card = document.getElementById('gcalStatusCard');
    if (!card) return;
    if (enabled) {
      card.innerHTML = '<div class="text-sm text-muted">Verificando integração...</div>';
      if (typeof GoogleCal !== 'undefined') {
        GoogleCal.init();
        setTimeout(() => GoogleCal.renderStatus('#gcalStatusCard'), 500);
      }
      Toast.success('Integração com Google Calendar ativada.');
    } else {
      if (typeof GoogleCal !== 'undefined') GoogleCal.disconnect();
      card.innerHTML = '<div class="text-sm text-muted">Integração desativada. Ative o toggle acima para conectar o Google Calendar.</div>';
      Toast.show('Integração com Google Calendar desativada.');
    }
  }

  function saveEmpresa() {
    const empresa = document.getElementById('cfgEmpresa').value.trim();
    if (!empresa) { Toast.error('Nome da empresa obrigatório'); return; }
    DB.saveConfig({
      empresa,
      cnpj: document.getElementById('cfgCnpj').value,
      cidade: document.getElementById('cfgCidade').value,
      estado: document.getElementById('cfgEstado').value,
    });
    Toast.success('Dados da empresa salvos');
    App.updateBrand();
  }

  function saveFinanceiro() {
    const aliquota = Number(document.getElementById('cfgAliquota').value);
    if (isNaN(aliquota) || aliquota < 0 || aliquota > 100) { Toast.error('Alíquota inválida (0–100%)'); return; }
    DB.saveConfig({ regimeTributario: document.getElementById('cfgRegime').value, aliquotaImpostos: aliquota });
    Toast.success('Configurações financeiras salvas');
  }

  function saveUsuario() {
    const nome = document.getElementById('cfgUserNome').value.trim();
    if (!nome) { Toast.error('Nome obrigatório'); return; }
    DB.saveConfig({
      usuario: {
        nome,
        cargo: document.getElementById('cfgUserCargo').value,
      }
    });
    Toast.success('Perfil atualizado');
    App.updateUserInfo();
  }

  function addResponsavel() {
    Modal.open({
      title: 'Adicionar Responsável',
      body: `<div class="form-group"><label class="form-label">Nome do Responsável</label><input class="form-control" id="newResp" placeholder="Ex: Maria Santos"></div>`,
      saveCb: () => {
        const nome = document.getElementById('newResp').value.trim();
        if (!nome) { Toast.error('Nome obrigatório'); return; }
        const cfg = DB.getConfig();
        const responsaveis = [...(cfg.responsaveis||[]), nome];
        DB.saveConfig({ responsaveis });
        Toast.success('Responsável adicionado');
        Modal.close();
        render();
      },
    });
  }

  function removeResponsavel(idx) {
    const cfg = DB.getConfig();
    const responsaveis = (cfg.responsaveis||[]).filter((_,i) => i !== idx);
    DB.saveConfig({ responsaveis });
    Toast.success('Responsável removido');
    render();
  }

  function addSegmento() {
    Modal.open({
      title: 'Adicionar Segmento',
      body: `<div class="form-group"><label class="form-label">Nome do Segmento</label><input class="form-control" id="newSeg" placeholder="Ex: Papel e Celulose"></div>`,
      saveCb: () => {
        const nome = document.getElementById('newSeg').value.trim();
        if (!nome) { Toast.error('Nome obrigatório'); return; }
        const cfg = DB.getConfig();
        const segmentos = [...(cfg.segmentos||[]), nome];
        DB.saveConfig({ segmentos });
        Toast.success('Segmento adicionado');
        Modal.close();
        render();
      },
    });
  }

  function removeSegmento(idx) {
    const cfg = DB.getConfig();
    const segmentos = (cfg.segmentos||[]).filter((_,i) => i !== idx);
    DB.saveConfig({ segmentos });
    render();
  }

  function addServico() {
    Modal.open({
      title: 'Adicionar Serviço',
      body: `<div class="form-group"><label class="form-label">Nome do Serviço</label><input class="form-control" id="newServ" placeholder="Ex: NR-12, Laudo de Caldeira..."></div>`,
      saveCb: () => {
        const nome = document.getElementById('newServ').value.trim();
        if (!nome) { Toast.error('Nome obrigatório'); return; }
        const cfg = DB.getConfig();
        const servicos = [...(cfg.servicos||[]), nome];
        DB.saveConfig({ servicos });
        Toast.success('Serviço adicionado');
        Modal.close();
        render();
      },
    });
  }

  function removeServico(idx) {
    const cfg = DB.getConfig();
    const servicos = (cfg.servicos||[]).filter((_,i) => i !== idx);
    DB.saveConfig({ servicos });
    render();
  }

  // exportData/importData legados removidos — usar exportBackup/importBackup (consolidado).

  function resetData() {
    Confirm.show('Limpar todos os dados?', 'ATENÇÃO: Esta ação apagará TODOS os dados do CRM. Esta ação não pode ser desfeita!', () => {
      Object.keys(localStorage).filter(k => k.startsWith('crm_')).forEach(k => localStorage.removeItem(k));
      Toast.success('Dados removidos. Recarregando...');
      setTimeout(() => window.location.reload(), 1500);
    });
    // Aguarda o modal renderizar antes de alterar o botão
    setTimeout(() => {
      const btn = document.getElementById('btnConfirm');
      if (btn) {
        btn.style.background = '#dc2626';
        btn.textContent = 'SIM, LIMPAR TUDO';
      }
    }, 50);
  }

  function saveNotificacoes() {
    const prefs = {
      browser:  document.getElementById('cfgNotifBrowser')?.checked ?? true,
      inApp:    document.getElementById('cfgNotifInApp')?.checked ?? true,
      email:    document.getElementById('cfgNotifEmail')?.checked ?? false,
      emailDest: (document.getElementById('cfgEmailDest')?.value || '').trim(),
      antecedencia: {
        atividades:  parseInt(document.getElementById('cfgAnt_atividades')?.value  ?? 1),
        reunioes:    parseInt(document.getElementById('cfgAnt_reunioes')?.value    ?? 1),
        leads:       parseInt(document.getElementById('cfgAnt_leads')?.value       ?? 0),
        parcelas:    parseInt(document.getElementById('cfgAnt_parcelas')?.value    ?? 3),
        licitacoes:  parseInt(document.getElementById('cfgAnt_licitacoes')?.value  ?? 3),
        marketing:   parseInt(document.getElementById('cfgAnt_marketing')?.value   ?? 1),
        contasPagar: parseInt(document.getElementById('cfgAnt_contasPagar')?.value ?? 3),
      },
    };
    Notifications.savePrefs(prefs);
    Toast.success('Configurações de notificação salvas!');
    if (prefs.browser) Notifications.requestPermission();
  }

  function toggleEmailDest() {
    const show = document.getElementById('cfgNotifEmail')?.checked;
    const grp  = document.getElementById('emailDestGrp');
    if (grp) grp.style.display = show ? '' : 'none';
  }

  function exportBackup() {
    const backup = {
      versao: '1.0',
      data: new Date().toISOString(),
      empresa: DB.getConfig()?.empresa || 'CRM',
      dados: {}
    };
    const colecoes = ['leads','clientes','projetos','propostas','contratos','atividades',
      'recebiveis','lancamentos','contaspagar','licitacoes','marketing_posts','metas',
      'contatos','folha','config'];
    colecoes.forEach(c => {
      try { backup.dados[c] = DB.getAll(c); } catch(e) {}
    });
    backup.dados.config = DB.getConfig();

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-crm-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    localStorage.setItem('crm_last_backup', new Date().toISOString());
    Toast.success('Backup realizado com sucesso!');
    // Update displayed date
    const el = document.getElementById('lastBackupDate');
    const lb = localStorage.getItem('crm_last_backup');
    if (el && lb) el.textContent = Utils.formatDate(lb.split('T')[0]) + ' às ' + lb.split('T')[1].substring(0, 5);
  }

  function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const backup = JSON.parse(e.target.result);

        // Validação de campos obrigatórios
        if (!backup || typeof backup !== 'object') {
          Toast.error('Arquivo não é um JSON de backup válido.'); return;
        }
        // Aceita formato v1 (`dados`) E v2 (`clientes`/`leads` no root)
        const v2 = !backup.dados && (backup.clientes || backup.leads || backup.projetos);
        const dados = backup.dados || (v2 ? backup : null);
        if (!dados) {
          Toast.error('Backup sem campo "dados". Verifique o arquivo.'); return;
        }

        const dataLabel = (backup.data || backup.exportedAt) ?
          Utils.formatDate((backup.data || backup.exportedAt).split('T')[0]) : 'data desconhecida';

        // Conta registros para mostrar ao usuário
        const totalRegistros = Object.values(dados)
          .filter(Array.isArray)
          .reduce((s, arr) => s + arr.length, 0);

        if (!confirm(`Restaurar backup de ${dataLabel}?\n\n${totalRegistros} registros serão importados (MERGE).\n\nObs: itens com IDs iguais aos do backup serão sobrescritos no Supabase. Itens novos adicionados após o backup serão mantidos. Para substituição total, use "Limpar Todos os Dados" antes.\n\nDeseja continuar?`)) {
          event.target.value = '';
          return;
        }

        Toast.success('Restaurando backup... Aguarde.');

        // Restaura via DB.create — internamente faz upsert no Supabase + atualiza cache
        Object.entries(dados).forEach(([col, items]) => {
          if (col === 'config') {
            DB.saveConfig(items);
            return;
          }
          if (!Array.isArray(items)) return;

          // Mapa de chaves legadas v2 → v3
          const colName = ({ marketing: 'marketing_posts' }[col]) || col;

          items.forEach(item => {
            try {
              if (item && typeof item === 'object' && item.id) {
                DB.create(colName, item);
              }
            } catch (e) {
              console.warn('[Backup] falha ao importar item em', col, e);
            }
          });
        });

        Toast.success(`Backup restaurado: ${totalRegistros} registros! Recarregando...`);
        setTimeout(() => location.reload(), 2000);
      } catch (err) {
        Toast.error('Erro ao ler arquivo: ' + (err.message || 'JSON inválido'));
        console.error('[importBackup]', err);
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  function _renderAuditLog(filtro) {
    const logs = DB.getAuditLog();
    const f = (filtro || '').toLowerCase();
    const filtered = f ? logs.filter(l =>
      l.entidade?.toLowerCase().includes(f) ||
      l.resumo?.toLowerCase().includes(f) ||
      l.op?.toLowerCase().includes(f)
    ) : logs;

    if (filtered.length === 0) {
      return '<div class="empty-state" style="padding:24px"><div class="empty-sub">Nenhum registro de auditoria ainda.</div></div>';
    }

    const opIcon  = { create: '✅', update: '✏️', delete: '🗑' };
    const opColor = { create: '#10b981', update: '#3b82f6', delete: '#ef4444' };
    const entIcon = { leads:'💼', clientes:'🏢', projetos:'🔧', propostas:'📄', contratos:'📋', licitacoes:'🏛', atividades:'📌' };

    return `
      <table class="tbl">
        <thead><tr><th style="width:160px">Data/Hora</th><th style="width:80px">Operação</th><th style="width:100px">Módulo</th><th>Registro</th></tr></thead>
        <tbody>
          ${filtered.slice(0, 200).map(l => {
            const dt = new Date(l.ts);
            const dataHora = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
            const cor   = opColor[l.op] || '#94a3b8';
            const icone = opIcon[l.op]  || '•';
            const entIcn = entIcon[l.entidade] || '📦';
            return `<tr>
              <td class="text-xs text-muted" style="font-family:var(--font-mono)">${dataHora}</td>
              <td><span style="font-size:11px;font-weight:700;color:${cor};background:${cor}18;padding:2px 6px;border-radius:99px">${icone} ${l.op}</span></td>
              <td class="text-xs">${entIcn} ${l.entidade}</td>
              <td class="text-sm" style="color:var(--text-secondary)">${Utils.escHtml(l.resumo||'—')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="text-xs text-muted" style="padding:8px 16px">${filtered.length} registro(s) — exibindo até 200</div>
    `;
  }

  function filterAudit(val) {
    const el = document.getElementById('auditLogContainer');
    if (el) el.innerHTML = _renderAuditLog(val);
  }

  function clearAudit() {
    if (!confirm('Limpar todo o log de auditoria?')) return;
    DB.clearAuditLog();
    const el = document.getElementById('auditLogContainer');
    if (el) el.innerHTML = _renderAuditLog('');
    Toast.success('Log de auditoria limpo.');
  }

  return { render, saveEmpresa, saveUsuario, saveFinanceiro, addResponsavel, removeResponsavel, addSegmento, removeSegmento, addServico, removeServico, resetData, saveNotificacoes, toggleEmailDest, exportBackup, importBackup, filterAudit, clearAudit, toggleGcal };
})();
