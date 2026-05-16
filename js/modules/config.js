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

        <!-- Dados do sistema -->
        <div class="card">
          <div class="card-header"><div class="card-title">💾 Backup e Dados</div></div>
          <div class="card-body">
            <div class="flex gap-2 mb-3">
              <button class="btn btn-success" onclick="Config.exportData()">📤 Exportar Backup</button>
              <label class="btn btn-secondary" style="cursor:pointer">
                📥 Importar Backup
                <input type="file" accept=".json" style="display:none" onchange="Config.importData(event)">
              </label>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-danger" onclick="Config.resetData()">🗑 Limpar Todos os Dados</button>
            </div>
            <div class="text-xs text-muted mt-3">
              ⚠ Dados armazenados no navegador. <strong>Exporte regularmente!</strong><br>
              Limpar o cache do browser apaga todos os dados sem recuperação.
            </div>
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
            </div>
          </div>
        </div>

        <!-- Google Calendar -->
        <div class="card">
          <div class="card-header"><div class="card-title">📅 Google Calendar</div></div>
          <div class="card-body" id="gcalStatusCard">
            <div class="text-sm text-muted">Verificando integração...</div>
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
      if (typeof GoogleCal !== 'undefined') GoogleCal.renderStatus('#gcalStatusCard');
    }, 50);
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

  function exportData() {
    const data = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      empresa: DB.getConfig().empresa || 'CRM',
      clientes:      DB.getAll('clientes'),
      contatos:      DB.getAll('contatos'),
      leads:         DB.getAll('leads'),
      projetos:      DB.getAll('projetos'),
      atividades:    DB.getAll('atividades'),
      propostas:     DB.getAll('propostas'),
      recebiveis:    DB.getAll('recebiveis'),
      funcionarios:  DB.getAll('funcionarios'),
      lancamentos:   DB.getAll('lancamentos'),
      contaspagar:   DB.getAll('contaspagar'),
      folha:         DB.getAll('folha'),
      licitacoes:    DB.getAll('licitacoes'),
      config:        DB.getConfig(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const total = Object.values(data).filter(Array.isArray).reduce((s,a)=>s+a.length,0);
    Toast.success(`Backup exportado! ${total} registros salvos.`);
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const entities = ['clientes','contatos','leads','projetos','atividades','propostas','recebiveis','funcionarios','lancamentos','contaspagar','folha','licitacoes'];
        const total = entities.reduce((s,k)=>s+(data[k]?.length||0),0);
        Confirm.show('Importar dados?', `Isso substituirá TODOS os dados atuais. O backup contém ${total} registros. Confirmar?`, () => {
          entities.forEach(k => { if (data[k]) localStorage.setItem('crm_'+k, JSON.stringify(data[k])); });
          if (data.config) localStorage.setItem('crm_config', JSON.stringify(data.config));
          localStorage.setItem('crm__init', '1');
          Toast.success('Dados importados com sucesso! Recarregando...');
          setTimeout(() => window.location.reload(), 1500);
        });
      } catch { Toast.error('Arquivo inválido ou corrompido'); }
    };
    reader.readAsText(file);
  }

  function resetData() {
    Confirm.show('Limpar todos os dados?', 'ATENÇÃO: Esta ação apagará TODOS os dados do CRM. Esta ação não pode ser desfeita!', () => {
      Object.keys(localStorage).filter(k => k.startsWith('crm_')).forEach(k => localStorage.removeItem(k));
      Toast.success('Dados removidos. Recarregando...');
      setTimeout(() => window.location.reload(), 1500);
    });
    document.getElementById('btnConfirm').style.background = '#dc2626';
    document.getElementById('btnConfirm').textContent = 'SIM, LIMPAR TUDO';
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

  return { render, saveEmpresa, saveUsuario, saveFinanceiro, addResponsavel, removeResponsavel, addSegmento, removeSegmento, addServico, removeServico, exportData, importData, resetData, saveNotificacoes, toggleEmailDest };
})();
