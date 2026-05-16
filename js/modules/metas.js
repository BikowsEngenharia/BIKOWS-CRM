/* ==========================================
   Metas & KPIs — Planejamento e Acompanhamento
   ========================================== */
const Metas = (() => {
  let _ano = new Date().getFullYear();
  let _tab = 'painel'; // painel | trimestres | servicos | anual

  const TRIMESTRES = ['Q1 (Jan–Mar)', 'Q2 (Abr–Jun)', 'Q3 (Jul–Set)', 'Q4 (Out–Dez)'];
  const TRIMESTRE_MESES = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]];

  /* ---- Helpers de data ---- */
  function _trimestreAtual() { return Math.floor(new Date().getMonth() / 3); } // 0-3

  function _getMeta(ano, trimestre) {
    return DB.getAll('metas').find(m => m.ano === ano && m.trimestre === trimestre) || _metaVazia(ano, trimestre);
  }

  function _metaVazia(ano, trimestre) {
    return {
      ano, trimestre,
      receita: 0, novosClientes: 0, novosLeads: 0,
      propostas: 0, taxaConversao: 30,
      projetosConcluidos: 0, licitacoesGanhas: 0,
      servicosMetas: [],
      observacoes: '',
    };
  }

  /* ---- Cálculo de realizados ---- */
  function _realizados(ano, trimestre) {
    const meses = TRIMESTRE_MESES[trimestre];
    const inicio = new Date(ano, meses[0], 1).toISOString().split('T')[0];
    const fim = new Date(ano, meses[2] + 1, 0).toISOString().split('T')[0];

    const inPeriod = (dateStr) => dateStr && dateStr >= inicio && dateStr <= fim;

    // Receita — lançamentos recebidos no período
    const receita = DB.getAll('lancamentos')
      .filter(l => l.tipo === 'receita' && l.status === 'recebido' && inPeriod(l.data))
      .reduce((s, l) => s + (l.valor || 0), 0);

    // Novos clientes cadastrados no período
    const novosClientes = DB.getAll('clientes')
      .filter(c => inPeriod((c.createdAt || '').split('T')[0])).length;

    // Novos leads no período
    const novosLeads = DB.getAll('leads')
      .filter(l => inPeriod((l.createdAt || '').split('T')[0])).length;

    // Propostas enviadas no período
    const propostas = DB.getAll('propostas')
      .filter(p => ['enviada','negociacao','aprovada'].includes(p.status) && inPeriod((p.createdAt || '').split('T')[0])).length;

    // Taxa de conversão — leads fechados ganhos / total leads do período
    const leadsTotal = DB.getAll('leads').filter(l => inPeriod((l.createdAt || '').split('T')[0])).length;
    const leadsGanhos = DB.getAll('leads').filter(l => l.status === 'fechado_ganho' && inPeriod((l.createdAt || '').split('T')[0])).length;
    const taxaConversao = leadsTotal > 0 ? Math.round((leadsGanhos / leadsTotal) * 100) : 0;

    // Projetos concluídos
    const projetosConcluidos = DB.getAll('projetos')
      .filter(p => p.status === 'concluido' && inPeriod(p.prazo)).length;

    // Licitações ganhas
    const licitacoesGanhas = DB.getAll('licitacoes')
      .filter(l => l.status === 'ganhou' && inPeriod(l.dataResultado)).length;

    return { receita, novosClientes, novosLeads, propostas, taxaConversao, projetosConcluidos, licitacoesGanhas };
  }

  /* ---- Progress bar ---- */
  function _progress(real, meta, currency = false) {
    const pct = meta > 0 ? Math.min(Math.round((real / meta) * 100), 100) : 0;
    const over = meta > 0 && real >= meta;
    const color = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)';
    const label = currency ? Utils.formatCurrency(real) + ' / ' + Utils.formatCurrency(meta)
                           : real + ' / ' + meta;
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <div style="flex:1;height:6px;background:var(--border);border-radius:99px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;transition:width .4s ease;"></div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${label}</span>
        ${over ? '<span style="font-size:10px;color:var(--success);font-weight:700;">✓</span>' : ''}
      </div>`;
  }

  /* ---- KPI card ---- */
  function _kpiCard(icon, label, real, meta, currency = false) {
    const pct = meta > 0 ? Math.min(Math.round((real / meta) * 100), 100) : (real > 0 ? 100 : 0);
    const color = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : pct > 0 ? 'var(--primary)' : 'var(--text-muted)';
    const valueDisplay = currency ? Utils.formatCurrency(real) : real;
    const metaDisplay = currency ? Utils.formatCurrency(meta) : meta;
    return `
      <div class="kpi-meta-card">
        <div class="kpi-meta-icon">${icon}</div>
        <div class="kpi-meta-body">
          <div class="kpi-meta-label">${label}</div>
          <div class="kpi-meta-value" style="color:${color}">${valueDisplay}</div>
          <div class="kpi-meta-progress">
            <div class="kpi-meta-bar-bg">
              <div class="kpi-meta-bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
            <span class="kpi-meta-pct">${pct}% ${meta > 0 ? '· meta: ' + metaDisplay : '· sem meta'}</span>
          </div>
        </div>
      </div>`;
  }

  /* ====================================================
     RENDER PRINCIPAL
     ==================================================== */
  function render() {
    const tabs = [
      { id: 'painel',     label: '📊 Painel' },
      { id: 'trimestres', label: '🎯 Metas por Trimestre' },
      { id: 'servicos',   label: '🔧 Metas de Serviços' },
      { id: 'anual',      label: '📅 Visão Anual' },
    ];

    document.getElementById('pageContent').innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:18px;font-weight:700;color:var(--text);margin:0;">Metas & KPIs</h2>
          <p style="color:var(--text-muted);font-size:13px;margin:4px 0 0;">Plano de negócios e acompanhamento de resultados</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="Metas.setAno(${_ano-1})">‹</button>
          <span style="font-weight:700;font-size:15px;min-width:50px;text-align:center;">${_ano}</span>
          <button class="btn btn-ghost btn-sm" onclick="Metas.setAno(${_ano+1})">›</button>
        </div>
      </div>

      <div class="tab-bar" style="margin-bottom:20px;">
        ${tabs.map(t => `<button class="tab-btn ${_tab===t.id?'active':''}" onclick="Metas.setTab('${t.id}')">${t.label}</button>`).join('')}
      </div>

      <div id="metasContent"></div>
    `;

    _renderTab();
  }

  function _renderTab() {
    const el = document.getElementById('metasContent');
    if (!el) return;
    if (_tab === 'painel')     el.innerHTML = _renderPainel();
    if (_tab === 'trimestres') el.innerHTML = _renderTrimestres();
    if (_tab === 'servicos')   el.innerHTML = _renderServicos();
    if (_tab === 'anual')      el.innerHTML = _renderAnual();
  }

  /* ---- PAINEL (trimestre atual) ---- */
  function _renderPainel() {
    const qi = _trimestreAtual();
    const meta = _getMeta(_ano, qi);
    const real = _realizados(_ano, qi);
    const anoAtual = new Date().getFullYear() === _ano;

    return `
      <div class="detail-label mb-3" style="font-size:13px;">
        📍 ${anoAtual ? 'Trimestre atual' : 'Ano ' + _ano} — <strong>${TRIMESTRES[qi]}</strong>
        <button class="btn btn-xs btn-primary" style="margin-left:8px;" onclick="Metas.editMeta(${_ano},${qi})">✏ Editar metas</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-bottom:24px;">
        ${_kpiCard('💰', 'Faturamento', real.receita, meta.receita, true)}
        ${_kpiCard('🏢', 'Novos Clientes', real.novosClientes, meta.novosClientes)}
        ${_kpiCard('💼', 'Novos Leads', real.novosLeads, meta.novosLeads)}
        ${_kpiCard('📄', 'Propostas Enviadas', real.propostas, meta.propostas)}
        ${_kpiCard('📈', 'Taxa de Conversão', real.taxaConversao, meta.taxaConversao ? meta.taxaConversao : 0)}
        ${_kpiCard('📋', 'Projetos Concluídos', real.projetosConcluidos, meta.projetosConcluidos)}
        ${_kpiCard('🏛', 'Licitações Ganhas', real.licitacoesGanhas, meta.licitacoesGanhas)}
      </div>

      ${meta.observacoes ? `
        <div class="card" style="padding:16px;margin-bottom:20px;">
          <div class="detail-label mb-1">📝 Observações / Estratégia</div>
          <p style="font-size:13px;color:var(--text-secondary);white-space:pre-wrap;">${Utils.escHtml(meta.observacoes)}</p>
        </div>` : ''}

      ${_renderResumoTrimestres()}
    `;
  }

  function _renderResumoTrimestres() {
    return `
      <div class="detail-label mb-3 mt-4">Resumo do Ano — Todos os Trimestres</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
        ${TRIMESTRES.map((label, qi) => {
          const meta = _getMeta(_ano, qi);
          const real = _realizados(_ano, qi);
          const pct = meta.receita > 0 ? Math.min(Math.round((real.receita / meta.receita) * 100), 999) : 0;
          const color = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--text-muted)';
          const isAtual = qi === _trimestreAtual() && new Date().getFullYear() === _ano;
          return `
            <div class="card" style="padding:14px;${isAtual?'border:2px solid var(--primary);':''}">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">${label}${isAtual?' <span style="color:var(--primary)">● ATUAL</span>':''}</div>
              <div style="font-size:16px;font-weight:700;color:${color};">${Utils.formatCurrency(real.receita)}</div>
              <div style="font-size:11px;color:var(--text-muted);">meta: ${Utils.formatCurrency(meta.receita)}</div>
              ${_progress(real.receita, meta.receita, true)}
              <div style="margin-top:10px;font-size:11px;color:var(--text-secondary);display:flex;gap:10px;">
                <span>👥 ${real.novosClientes}/${meta.novosClientes || '—'}</span>
                <span>💼 ${real.novosLeads}/${meta.novosLeads || '—'}</span>
              </div>
              <button class="btn btn-xs btn-ghost" style="margin-top:8px;width:100%;" onclick="Metas.editMeta(${_ano},${qi})">Editar Q${qi+1}</button>
            </div>`;
        }).join('')}
      </div>`;
  }

  /* ---- METAS POR TRIMESTRE ---- */
  function _renderTrimestres() {
    return `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${TRIMESTRES.map((label, qi) => {
          const meta = _getMeta(_ano, qi);
          const real = _realizados(_ano, qi);
          const isAtual = qi === _trimestreAtual() && new Date().getFullYear() === _ano;
          return `
            <div class="card" style="padding:20px;${isAtual?'border-left:4px solid var(--primary);':''}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <div>
                  <span style="font-size:14px;font-weight:700;color:var(--text);">${label}</span>
                  ${isAtual?'<span class="badge badge-blue" style="margin-left:8px;">Atual</span>':''}
                </div>
                <button class="btn btn-sm btn-primary" onclick="Metas.editMeta(${_ano},${qi})">✏ Editar metas</button>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
                ${[
                  ['💰 Faturamento', real.receita, meta.receita, true],
                  ['🏢 Novos Clientes', real.novosClientes, meta.novosClientes, false],
                  ['💼 Novos Leads', real.novosLeads, meta.novosLeads, false],
                  ['📄 Propostas', real.propostas, meta.propostas, false],
                  ['📋 Projetos', real.projetosConcluidos, meta.projetosConcluidos, false],
                  ['🏛 Licitações', real.licitacoesGanhas, meta.licitacoesGanhas, false],
                ].map(([lbl, r, m, curr]) => `
                  <div style="padding:12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${lbl}</div>
                    <div style="font-size:18px;font-weight:700;color:var(--text);">${curr ? Utils.formatCurrency(r) : r}</div>
                    ${_progress(r, m, curr)}
                  </div>`).join('')}
              </div>
              ${meta.observacoes ? `<div style="margin-top:12px;font-size:12px;color:var(--text-secondary);padding:10px;background:var(--surface-2);border-radius:6px;border-left:3px solid var(--primary);">📝 ${Utils.escHtml(meta.observacoes)}</div>` : ''}
            </div>`;
        }).join('')}
      </div>`;
  }

  /* ---- METAS DE SERVIÇOS ---- */
  function _renderServicos() {
    const cfg = DB.getConfig();
    const servicos = cfg.servicos || [];

    return `
      <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <p style="color:var(--text-muted);font-size:13px;">Defina metas de volume e faturamento por tipo de serviço para cada trimestre.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${TRIMESTRES.map((label, qi) => {
          const meta = _getMeta(_ano, qi);
          const servicosMetas = meta.servicosMetas || [];
          const isAtual = qi === _trimestreAtual() && new Date().getFullYear() === _ano;
          return `
            <div class="card" style="padding:20px;${isAtual?'border-left:4px solid var(--primary);':''}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <span style="font-size:14px;font-weight:700;">${label}${isAtual?' <span class="badge badge-blue">Atual</span>':''}</span>
                <button class="btn btn-sm btn-primary" onclick="Metas.editServicos(${_ano},${qi})">✏ Editar serviços</button>
              </div>
              ${servicosMetas.length === 0 ? `<div class="empty-state" style="padding:20px;"><div class="empty-icon">🔧</div><div class="empty-title">Sem metas de serviços</div><div class="empty-sub">Clique em "Editar serviços" para definir</div></div>` : `
              <div style="overflow-x:auto;">
                <table class="data-table">
                  <thead><tr><th>Serviço</th><th>Qtd. Meta</th><th>Valor Meta</th></tr></thead>
                  <tbody>
                    ${servicosMetas.map(s => `
                      <tr>
                        <td><span class="font-bold">${Utils.escHtml(s.servico)}</span></td>
                        <td>${s.quantidade} unid.</td>
                        <td class="font-bold">${Utils.formatCurrency(s.valor)}</td>
                      </tr>`).join('')}
                    <tr style="border-top:2px solid var(--border);font-weight:700;">
                      <td>TOTAL</td>
                      <td>${servicosMetas.reduce((s,m)=>s+(m.quantidade||0),0)} unid.</td>
                      <td>${Utils.formatCurrency(servicosMetas.reduce((s,m)=>s+(m.valor||0),0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>`}
            </div>`;
        }).join('')}
      </div>`;
  }

  /* ---- VISÃO ANUAL ---- */
  function _renderAnual() {
    const totaisMeta = { receita:0, novosClientes:0, novosLeads:0, propostas:0, projetosConcluidos:0, licitacoesGanhas:0 };
    const totaisReal = { receita:0, novosClientes:0, novosLeads:0, propostas:0, projetosConcluidos:0, licitacoesGanhas:0 };
    for (let qi = 0; qi < 4; qi++) {
      const m = _getMeta(_ano, qi);
      const r = _realizados(_ano, qi);
      Object.keys(totaisMeta).forEach(k => { totaisMeta[k] += (m[k]||0); totaisReal[k] += (r[k]||0); });
    }

    return `
      <div class="card" style="padding:20px;margin-bottom:20px;">
        <div class="detail-label mb-3">🏆 Resultado Anual ${_ano}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
          ${[
            ['💰 Faturamento Total', totaisReal.receita, totaisMeta.receita, true],
            ['🏢 Novos Clientes', totaisReal.novosClientes, totaisMeta.novosClientes, false],
            ['💼 Novos Leads', totaisReal.novosLeads, totaisMeta.novosLeads, false],
            ['📄 Propostas', totaisReal.propostas, totaisMeta.propostas, false],
            ['📋 Projetos Concluídos', totaisReal.projetosConcluidos, totaisMeta.projetosConcluidos, false],
            ['🏛 Licitações Ganhas', totaisReal.licitacoesGanhas, totaisMeta.licitacoesGanhas, false],
          ].map(([lbl, r, m, curr]) => `
            <div style="padding:14px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border);">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">${lbl}</div>
              <div style="font-size:22px;font-weight:800;color:var(--text);">${curr ? Utils.formatCurrency(r) : r}</div>
              ${_progress(r, m, curr)}
            </div>`).join('')}
        </div>
      </div>

      <div class="detail-label mb-3">Distribuição por Trimestre — Faturamento</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        ${TRIMESTRES.map((label, qi) => {
          const m = _getMeta(_ano, qi);
          const r = _realizados(_ano, qi);
          const pct = totaisMeta.receita > 0 ? Math.round((m.receita / totaisMeta.receita) * 100) : 0;
          const pctReal = totaisReal.receita > 0 ? Math.round((r.receita / totaisReal.receita) * 100) : 0;
          return `
            <div class="card" style="padding:14px;text-align:center;">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);">Q${qi+1}</div>
              <div style="font-size:14px;font-weight:700;margin:4px 0;">${Utils.formatCurrency(r.receita)}</div>
              <div style="font-size:11px;color:var(--text-muted);">meta: ${Utils.formatCurrency(m.receita)}</div>
              <div style="margin-top:6px;height:4px;background:var(--border);border-radius:4px;overflow:hidden;">
                <div style="width:${m.receita>0?Math.min(Math.round((r.receita/m.receita)*100),100):0}%;height:100%;background:var(--primary);"></div>
              </div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${pct}% da meta anual</div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  /* ====================================================
     MODAIS DE EDIÇÃO
     ==================================================== */
  function editMeta(ano, qi) {
    const meta = _getMeta(ano, qi);
    Modal.open({
      title: `🎯 Metas — ${TRIMESTRES[qi]} / ${ano}`,
      size: 'modal-lg',
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group">
            <label class="form-label">💰 Faturamento (R$)</label>
            <input class="form-control" type="number" id="mReceita" value="${meta.receita}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">🏢 Novos Clientes</label>
            <input class="form-control" type="number" id="mClientes" value="${meta.novosClientes}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">💼 Novos Leads</label>
            <input class="form-control" type="number" id="mLeads" value="${meta.novosLeads}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">📄 Propostas Enviadas</label>
            <input class="form-control" type="number" id="mPropostas" value="${meta.propostas}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">📈 Taxa de Conversão (%)</label>
            <input class="form-control" type="number" id="mConversao" value="${meta.taxaConversao}" placeholder="30">
          </div>
          <div class="form-group">
            <label class="form-label">📋 Projetos Concluídos</label>
            <input class="form-control" type="number" id="mProjetos" value="${meta.projetosConcluidos}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">🏛 Licitações Ganhas</label>
            <input class="form-control" type="number" id="mLicitacoes" value="${meta.licitacoesGanhas}" placeholder="0">
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">📝 Estratégia / Observações</label>
          <textarea class="form-control" id="mObs" rows="3" placeholder="Foco principal, estratégias, pontos de atenção...">${meta.observacoes || ''}</textarea>
        </div>
      `,
      onSave: () => saveMeta(ano, qi, meta.id),
    });
  }

  function saveMeta(ano, qi, existingId) {
    const data = {
      ano, trimestre: qi,
      receita:            parseFloat(document.getElementById('mReceita')?.value) || 0,
      novosClientes:      parseInt(document.getElementById('mClientes')?.value) || 0,
      novosLeads:         parseInt(document.getElementById('mLeads')?.value) || 0,
      propostas:          parseInt(document.getElementById('mPropostas')?.value) || 0,
      taxaConversao:      parseInt(document.getElementById('mConversao')?.value) || 0,
      projetosConcluidos: parseInt(document.getElementById('mProjetos')?.value) || 0,
      licitacoesGanhas:   parseInt(document.getElementById('mLicitacoes')?.value) || 0,
      observacoes:        document.getElementById('mObs')?.value || '',
      servicosMetas:      existingId ? (_getMeta(ano, qi).servicosMetas || []) : [],
    };

    if (existingId) DB.update('metas', existingId, data);
    else DB.create('metas', data);

    Modal.close();
    Toast.success('Metas salvas!');
    _renderTab();
  }

  function editServicos(ano, qi) {
    const meta = _getMeta(ano, qi);
    const cfg = DB.getConfig();
    const servicos = cfg.servicos || [];
    const atual = meta.servicosMetas || [];

    Modal.open({
      title: `🔧 Metas de Serviços — ${TRIMESTRES[qi]} / ${ano}`,
      size: 'modal-lg',
      body: `
        <p style="color:var(--text-muted);font-size:12px;margin-bottom:14px;">Defina a quantidade e o valor meta para cada tipo de serviço no trimestre.</p>
        <table class="data-table">
          <thead><tr><th>Serviço</th><th>Qtd. (unid.)</th><th>Valor Meta (R$)</th></tr></thead>
          <tbody>
            ${servicos.map(s => {
              const ex = atual.find(m => m.servico === s) || {};
              return `<tr>
                <td style="font-weight:600;">${Utils.escHtml(s)}</td>
                <td><input class="form-control form-control-sm" type="number" id="sq_${s.replace(/\W/g,'_')}" value="${ex.quantidade||0}" min="0" style="width:80px;"></td>
                <td><input class="form-control form-control-sm" type="number" id="sv_${s.replace(/\W/g,'_')}" value="${ex.valor||0}" min="0" style="width:120px;"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `,
      onSave: () => saveServicos(ano, qi, meta.id, servicos),
    });
  }

  function saveServicos(ano, qi, existingId, servicos) {
    const servicosMetas = servicos
      .map(s => ({
        servico: s,
        quantidade: parseInt(document.getElementById('sq_' + s.replace(/\W/g,'_'))?.value) || 0,
        valor: parseFloat(document.getElementById('sv_' + s.replace(/\W/g,'_'))?.value) || 0,
      }))
      .filter(m => m.quantidade > 0 || m.valor > 0);

    const existingMeta = _getMeta(ano, qi);
    const data = { ...existingMeta, servicosMetas };

    if (existingId) DB.update('metas', existingId, data);
    else DB.create('metas', { ...data, ano, trimestre: qi });

    Modal.close();
    Toast.success('Metas de serviços salvas!');
    _renderTab();
  }

  function setTab(tab) { _tab = tab; _renderTab(); }
  function setAno(ano) { _ano = ano; render(); }
  function addNew() { editMeta(_ano, _trimestreAtual()); }

  return { render, setTab, setAno, addNew, editMeta, saveMeta, editServicos, saveServicos };
})();
