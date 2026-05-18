/* ==========================================
   Trafego.js — Módulo de Tráfego Pago Google Ads
   ========================================== */
const Trafego = (() => {

  /* ---- Constantes ---- */
  const PIPELINE_LABEL = {
    lead_identificado:   'Lead Novo',
    primeiro_contato:    '1º Contato',
    qualificacao:        'Qualificado',
    proposta_elaboracao: 'Em Proposta',
    proposta_enviada:    'Proposta Enviada',
    negociacao:          'Negociação',
    fechado_ganho:       'Ganho',
    fechado_perdido:     'Perdido',
  };

  const PIPELINE_COR = {
    lead_identificado:   '#64748b',
    primeiro_contato:    '#3b82f6',
    qualificacao:        '#8b5cf6',
    proposta_elaboracao: '#f59e0b',
    proposta_enviada:    '#f97316',
    negociacao:          '#eab308',
    fechado_ganho:       '#10b981',
    fechado_perdido:     '#ef4444',
  };

  const PIPELINE_BADGE = {
    lead_identificado:   'badge-gray',
    primeiro_contato:    'badge-blue',
    qualificacao:        'badge-purple',
    proposta_elaboracao: 'badge-yellow',
    proposta_enviada:    'badge-orange',
    negociacao:          'badge-yellow',
    fechado_ganho:       'badge-green',
    fechado_perdido:     'badge-red',
  };

  const STAGES_FUNIL = [
    'lead_identificado',
    'qualificacao',
    'proposta_elaboracao',
    'negociacao',
    'fechado_ganho',
  ];

  /* ---- Estado ---- */
  let _tab = 'dashboard';
  let _periodoFiltro = new Date().toISOString().slice(0, 7);
  let _periodo = 'mes'; // padrão global: 'mes' | 'trimestre' | 'semestre' | 'ano' | 'tudo'

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
  let _filtroStatusContatos = '';
  let _filtroQualificado = '';
  let _filtroMesContatos = new Date().toISOString().slice(0, 7);

  /* ====================================================
     HELPERS DE DADOS
     ==================================================== */

  function _isQualificado(l) {
    return l.qualificadoTrafico === true ||
      ['qualificacao', 'proposta_elaboracao', 'proposta_enviada', 'negociacao', 'fechado_ganho'].includes(l.status);
  }

  function _leadsTrafico(periodo) {
    let leads = DB.getAll('leads').filter(l => l.origemLead === 'Tráfego Pago');
    if (periodo) {
      leads = leads.filter(l => {
        const d = l.dataEntrada || (l.createdAt || '').split('T')[0];
        return d && d.startsWith(periodo);
      });
    }
    return leads;
  }

  function _investidoPeriodo(periodo) {
    return DB.getAll('trafego_campanhas').filter(c => {
      if (!periodo) return true;
      const mesInicio = (c.dataInicio || '').slice(0, 7);
      const mesFim    = (c.dataFim || '').slice(0, 7) || '9999-12';
      return mesInicio <= periodo && mesFim >= periodo;
    }).reduce((s, c) => {
      return s + (parseFloat(c.investidoReal) || parseFloat(c.orcamentoMensal) || 0);
    }, 0);
  }

  function _mesesRecentes(n) {
    const meses = [];
    const agora = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      meses.push(d.toISOString().slice(0, 7));
    }
    return meses;
  }

  function _formatMesLabel(yyyymm) {
    const [y, m] = yyyymm.split('-');
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${nomes[parseInt(m, 10) - 1]}/${y}`;
  }

  function _optsSelectPeriodo(atual) {
    const meses = _mesesRecentes(6);
    const agora = new Date();
    const mesAtual = agora.toISOString().slice(0, 7);
    const mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString().slice(0, 7);

    let opts = `<option value="${mesAtual}"${atual === mesAtual ? ' selected' : ''}>Este Mês (${_formatMesLabel(mesAtual)})</option>`;
    opts += `<option value="${mesAnterior}"${atual === mesAnterior ? ' selected' : ''}>Mês anterior (${_formatMesLabel(mesAnterior)})</option>`;

    const vistos = new Set([mesAtual, mesAnterior]);
    meses.forEach(m => {
      if (!vistos.has(m)) {
        opts += `<option value="${m}"${atual === m ? ' selected' : ''}>${_formatMesLabel(m)}</option>`;
        vistos.add(m);
      }
    });
    return opts;
  }

  /* ====================================================
     RENDER PRINCIPAL
     ==================================================== */

  function render() {
    const el = document.getElementById('pageContent');
    if (!el) return;
    el.innerHTML = `
      <div class="sec-header" style="margin-bottom:0">
        <div>
          <h2 class="sec-title">Tráfego Pago · Google Ads</h2>
          <p style="font-size:12px;color:var(--text-muted);margin-top:2px">Acompanhamento completo de campanhas, leads e ROI</p>
        </div>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Trafego._setPeriodoGlobal('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${{mes:'Mês',trimestre:'Trimestre',semestre:'Semestre',ano:'Ano',tudo:'Tudo'}[p]}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="tabs" style="margin:16px 0 0 0">
        ${[
          { id: 'dashboard',  label: '📊 Dashboard' },
          { id: 'campanhas',  label: '🎯 Campanhas' },
          { id: 'contatos',   label: '👥 Contatos' },
          { id: 'analise',    label: '📈 Análise' },
          { id: 'metas',      label: '🏆 Metas' },
        ].map(t => `<button class="tab-btn${_tab === t.id ? ' active' : ''}" onclick="Trafego._setTab('${t.id}')">${t.label}</button>`).join('')}
      </div>

      <div id="trafegoContent" style="margin-top:16px"></div>
    `;
    _renderTab();
  }

  let _setTabPending = false;
  function _setTab(tab) {
    if (_setTabPending || _tab === tab) return;
    _setTabPending = true;
    _tab = tab;
    requestAnimationFrame(() => {
      try { render(); } finally { _setTabPending = false; }
    });
  }

  function _renderTab() {
    if      (_tab === 'dashboard') _renderDashboard();
    else if (_tab === 'campanhas') _renderCampanhas();
    else if (_tab === 'contatos')  _renderContatos();
    else if (_tab === 'analise')   _renderAnalise();
    else if (_tab === 'metas')     _renderMetas();
  }

  /* ====================================================
     TAB 1: DASHBOARD
     ==================================================== */

  function _renderDashboard() {
    const el = document.getElementById('trafegoContent');
    if (!el) return;

    const leads    = _leadsTrafico(_periodoFiltro);
    const investido = _investidoPeriodo(_periodoFiltro);
    const qualifs  = leads.filter(_isQualificado);
    const propostas = leads.filter(l => ['proposta_elaboracao','proposta_enviada','negociacao','fechado_ganho'].includes(l.status));
    const negoc    = leads.filter(l => l.status === 'negociacao');
    const ganhos   = leads.filter(l => l.status === 'fechado_ganho');
    const perdidos = leads.filter(l => l.status === 'fechado_perdido');

    const cpl      = leads.length > 0 ? investido / leads.length : 0;
    const receita  = ganhos.reduce((s, l) => s + (parseFloat(l.valorFechado) || parseFloat(l.valorEstimado) || 0), 0);
    const roi      = investido > 0 ? ((receita - investido) / investido) * 100 : 0;
    const taxaQual = leads.length > 0 ? (qualifs.length / leads.length) * 100 : 0;
    const taxaProp = leads.length > 0 ? (propostas.length / leads.length) * 100 : 0;

    const meta = DB.getAll('trafego_metas').find(m => m.mes === _periodoFiltro);
    const metaCPL   = meta?.metaCPL   || 0;
    const metaLeads = meta?.metaLeads || 0;
    const roiColor = roi > 0 ? 'var(--success)' : 'var(--danger)';

    // Funil
    const funilHtml = _renderFunil(leads);

    // Grafico CPL 6 meses
    const cplChartHtml = _renderCplChart();

    // Servicos
    const servicosHtml = _renderServicos(leads);

    el.innerHTML = `
      <!-- Seletor de período -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <label style="font-size:13px;font-weight:600;color:var(--text-muted)">Período:</label>
        <select class="form-input" style="width:220px" onchange="Trafego._setPeriodoDash(this.value)">
          ${_optsSelectPeriodo(_periodoFiltro)}
        </select>
        ${investido > 0 || leads.length > 0
          ? `<span style="font-size:12px;color:var(--text-muted)">${leads.length} leads · ${Utils.formatCurrency(investido)} investido</span>`
          : ''}
      </div>

      <!-- KPI Row 1 -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">
        <div class="kpi-card" style="--kpi-color:#3b82f6">
          <div class="kpi-value">${Utils.formatCurrency(investido)}</div>
          <div class="kpi-label">💰 Total Investido</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Google Ads · período selecionado</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#8b5cf6">
          <div class="kpi-value">${leads.length}</div>
          <div class="kpi-label">👥 Leads Gerados</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${metaLeads > 0 ? `Meta: ${metaLeads} leads` : 'sem meta definida'}</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f59e0b">
          <div class="kpi-value">${leads.length > 0 ? Utils.formatCurrency(cpl) : '—'}</div>
          <div class="kpi-label">🎯 CPL (Custo/Lead)</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${metaCPL > 0 ? `Meta: ${Utils.formatCurrency(metaCPL)}` : 'sem meta'}</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#10b981">
          <div class="kpi-value">${taxaQual.toFixed(0)}%</div>
          <div class="kpi-label">✅ Taxa Qualificação</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${qualifs.length} de ${leads.length} qualificados</div>
        </div>
      </div>

      <!-- KPI Row 2 -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="kpi-card" style="--kpi-color:#f97316">
          <div class="kpi-value">${propostas.length}</div>
          <div class="kpi-label">📄 Propostas Geradas</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${leads.length > 0 ? taxaProp.toFixed(0) + '% dos leads' : '—'}</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#eab308">
          <div class="kpi-value">${negoc.length}</div>
          <div class="kpi-label">🤝 Em Negociação</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${negoc.length > 0 ? Utils.formatCurrency(negoc.reduce((s,l)=>s+(parseFloat(l.valorEstimado)||0),0)) + ' estimado' : '—'}</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#059669">
          <div class="kpi-value">${Utils.formatCurrency(receita)}</div>
          <div class="kpi-label">🏆 Receita Gerada</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${ganhos.length} contrato${ganhos.length !== 1 ? 's' : ''} fechado${ganhos.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="kpi-card" style="--kpi-color:${roi >= 0 ? '#10b981' : '#ef4444'}">
          <div class="kpi-value" style="color:${roiColor}">${investido > 0 ? roi.toFixed(0) + '%' : '—'}</div>
          <div class="kpi-label">📈 ROI</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${investido > 0 ? (roi >= 0 ? 'Retorno positivo' : 'Retorno negativo') : 'sem investimento'}</div>
        </div>
      </div>

      <!-- Grid: Funil + CPL -->
      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><span>Funil Google Ads</span></div>
          <div class="card-body">${funilHtml}</div>
        </div>
        <div class="card">
          <div class="card-header"><span>CPL últimos 6 meses</span></div>
          <div class="card-body">${cplChartHtml}</div>
        </div>
      </div>

      <!-- Serviços mais solicitados -->
      <div class="card mb-4">
        <div class="card-header"><span>Serviços mais solicitados (tráfego pago)</span></div>
        <div class="card-body">${servicosHtml}</div>
      </div>
    `;
  }

  function _renderFunil(leads) {
    if (leads.length === 0) {
      return `<div style="text-align:center;padding:32px 0;color:var(--text-muted);font-size:13px">Nenhum lead no período</div>`;
    }

    const total = leads.length;
    const estagios = STAGES_FUNIL.map(key => {
      let count;
      if (key === 'lead_identificado') {
        count = leads.length; // todos entram
      } else if (key === 'qualificacao') {
        count = leads.filter(l => ['qualificacao','proposta_elaboracao','proposta_enviada','negociacao','fechado_ganho'].includes(l.status)).length;
      } else if (key === 'proposta_elaboracao') {
        count = leads.filter(l => ['proposta_elaboracao','proposta_enviada','negociacao','fechado_ganho'].includes(l.status)).length;
      } else if (key === 'negociacao') {
        count = leads.filter(l => ['negociacao','fechado_ganho'].includes(l.status)).length;
      } else if (key === 'fechado_ganho') {
        count = leads.filter(l => l.status === 'fechado_ganho').length;
      }
      const pct = total > 0 ? Math.max((count / total) * 100, count > 0 ? 4 : 0) : 0;
      return { key, label: PIPELINE_LABEL[key], count, pct };
    });

    const cores = ['#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#10b981'];

    return `
      <div style="display:flex;gap:6px;align-items:flex-end;height:120px;padding:0 4px">
        ${estagios.map((e, i) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
            <div style="font-size:12px;font-weight:700;color:var(--text)">${e.count}</div>
            <div style="width:100%;height:${e.pct}%;background:${cores[i]};border-radius:4px 4px 0 0;min-height:${e.count > 0 ? 4 : 0}px;transition:height .4s ease"></div>
            <div style="font-size:9px;color:var(--text-muted);text-align:center;line-height:1.2;max-width:56px">${Utils.escHtml(e.label)}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;padding:0 4px">
        ${estagios.map((e, i) => `
          <div style="flex:1;text-align:center;font-size:10px;color:${cores[i]};font-weight:600">
            ${total > 0 && estagios[0].count > 0 ? ((e.count / estagios[0].count) * 100).toFixed(0) + '%' : '—'}
          </div>
        `).join('')}
      </div>
    `;
  }

  function _renderCplChart() {
    const meses = _mesesRecentes(6);
    const dados = meses.map(m => {
      const leads = _leadsTrafico(m);
      const inv   = _investidoPeriodo(m);
      const cpl   = leads.length > 0 ? inv / leads.length : 0;
      return { mes: m, label: _formatMesLabel(m), cpl, leads: leads.length, inv };
    });

    const maxCpl = Math.max(...dados.map(d => d.cpl), 1);

    if (dados.every(d => d.cpl === 0)) {
      return `<div style="text-align:center;padding:32px 0;color:var(--text-muted);font-size:13px">Sem dados de CPL nos últimos 6 meses</div>`;
    }

    return `
      <div style="display:flex;gap:6px;align-items:flex-end;height:120px;padding:0 4px">
        ${dados.map(d => {
          const h = maxCpl > 0 ? Math.max((d.cpl / maxCpl) * 100, d.cpl > 0 ? 4 : 0) : 0;
          return `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="CPL: ${Utils.formatCurrency(d.cpl)} · ${d.leads} leads · ${Utils.formatCurrency(d.inv)} investido">
              <div style="font-size:10px;font-weight:700;color:var(--text)">${d.cpl > 0 ? 'R$' + Math.round(d.cpl) : '—'}</div>
              <div style="width:100%;height:${h}%;background:#3b82f6;border-radius:4px 4px 0 0;min-height:${d.cpl > 0 ? 4 : 0}px"></div>
              <div style="font-size:9px;color:var(--text-muted);text-align:center">${Utils.escHtml(d.label)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function _renderServicos(leads) {
    const servicoCount = {};
    leads.forEach(l => (l.servicoInteresse || []).forEach(s => {
      servicoCount[s] = (servicoCount[s] || 0) + 1;
    }));

    const sorted = Object.entries(servicoCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sorted.length === 0) {
      return `<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:13px">Nenhum serviço registrado nos leads deste período</div>`;
    }

    const maxVal = sorted[0][1];
    return `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${sorted.map(([srv, cnt]) => {
          const pct = maxVal > 0 ? (cnt / maxVal) * 100 : 0;
          return `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:140px;font-size:12px;color:var(--text);text-overflow:ellipsis;overflow:hidden;white-space:nowrap" title="${Utils.escHtml(srv)}">${Utils.escHtml(srv)}</div>
              <div style="flex:1;height:18px;background:var(--border);border-radius:4px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:#3b82f6;border-radius:4px;transition:width .4s ease"></div>
              </div>
              <div style="width:28px;text-align:right;font-size:12px;font-weight:700;color:var(--text)">${cnt}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function _setPeriodoDash(v) {
    _periodoFiltro = v;
    _renderDashboard();
  }

  /* ====================================================
     TAB 2: CAMPANHAS
     ==================================================== */

  function _renderCampanhas() {
    const el = document.getElementById('trafegoContent');
    if (!el) return;

    const campanhas = DB.getAll('trafego_campanhas').sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));

    const STATUS_CAMP = {
      ativa:      { label: 'Ativa',      badge: 'badge-green'  },
      pausada:    { label: 'Pausada',    badge: 'badge-yellow' },
      encerrada:  { label: 'Encerrada', badge: 'badge-gray'   },
    };

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:13px;color:var(--text-muted)">${campanhas.length} campanha${campanhas.length !== 1 ? 's' : ''} cadastrada${campanhas.length !== 1 ? 's' : ''}</div>
        <button class="btn btn-primary btn-sm" onclick="Trafego.openFormCampanha()">+ Nova Campanha</button>
      </div>

      ${campanhas.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🎯</div>
          <div class="empty-title">Nenhuma campanha cadastrada</div>
          <div class="empty-sub">Clique em "+ Nova Campanha" para começar a rastrear seus investimentos em Google Ads.</div>
        </div>
      ` : `
        <div class="card">
          <table class="tbl">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Status</th>
                <th>Período</th>
                <th>Orçamento/Mês</th>
                <th>Investido Real</th>
                <th>Leads (auto)</th>
                <th>CPL (auto)</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${campanhas.map(c => {
                const leads = _leadsNaCampanha(c);
                const inv   = parseFloat(c.investidoReal) || parseFloat(c.orcamentoMensal) || 0;
                const cpl   = leads.length > 0 && inv > 0 ? inv / leads.length : 0;
                const stConf = STATUS_CAMP[c.status] || STATUS_CAMP.encerrada;
                return `
                  <tr>
                    <td><strong>${Utils.escHtml(c.nome || '—')}</strong>${c.observacoes ? `<br><small style="color:var(--text-muted)">${Utils.escHtml(Utils.truncate(c.observacoes, 40))}</small>` : ''}</td>
                    <td><span class="${stConf.badge}">${stConf.label}</span></td>
                    <td style="font-size:12px">
                      ${c.dataInicio ? Utils.formatDate(c.dataInicio) : '—'}
                      ${c.dataFim ? ' → ' + Utils.formatDate(c.dataFim) : ' → em andamento'}
                    </td>
                    <td>${c.orcamentoMensal ? Utils.formatCurrency(c.orcamentoMensal) : '—'}</td>
                    <td>${c.investidoReal ? Utils.formatCurrency(c.investidoReal) : '<span style="color:var(--text-muted)">estimado</span>'}</td>
                    <td style="text-align:center;font-weight:700">${leads.length}</td>
                    <td>${cpl > 0 ? Utils.formatCurrency(cpl) : '—'}</td>
                    <td class="tbl-actions">
                      <button class="btn-icon" title="Editar" onclick="Trafego.openFormCampanha('${c.id}')">✏</button>
                      <button class="btn-icon text-danger" title="Excluir" onclick="Trafego.deleteCampanha('${c.id}')">🗑</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
  }

  function _leadsNaCampanha(c) {
    const inicio = (c.dataInicio || '');
    const fim    = (c.dataFim || '9999-12-31');
    return DB.getAll('leads').filter(l => {
      if (l.origemLead !== 'Tráfego Pago') return false;
      const d = l.dataEntrada || (l.createdAt || '').split('T')[0];
      return d >= inicio && d <= fim;
    });
  }

  function openFormCampanha(id) {
    const c = id ? DB.get('trafego_campanhas', id) : null;

    const body = `
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Nome da Campanha *</label>
          <input class="form-input" id="cNome" value="${Utils.escHtml(c?.nome || '')}" placeholder="Ex: Laudo NR-12 — Busca Google">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-input" id="cStatus">
            <option value="ativa"${(!c || c.status === 'ativa') ? ' selected' : ''}>Ativa</option>
            <option value="pausada"${c?.status === 'pausada' ? ' selected' : ''}>Pausada</option>
            <option value="encerrada"${c?.status === 'encerrada' ? ' selected' : ''}>Encerrada</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Data Início *</label>
          <input class="form-input" type="date" id="cDataInicio" value="${c?.dataInicio || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Data Fim <span style="color:var(--text-muted)">(em andamento se vazio)</span></label>
          <input class="form-input" type="date" id="cDataFim" value="${c?.dataFim || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Orçamento Mensal (R$)</label>
          <input class="form-input" type="number" min="0" step="0.01" id="cOrcamento" value="${c?.orcamentoMensal || ''}" placeholder="0,00">
        </div>
        <div class="form-group">
          <label class="form-label">Investido Real no Período (R$)</label>
          <input class="form-input" type="number" min="0" step="0.01" id="cInvestidoReal" value="${c?.investidoReal || ''}" placeholder="0,00">
        </div>
        <div class="form-group">
          <label class="form-label">Meta de Leads</label>
          <input class="form-input" type="number" min="0" id="cMetaLeads" value="${c?.metaLeads || ''}" placeholder="Ex: 30">
        </div>
        <div class="form-group">
          <label class="form-label">Meta CPL (R$)</label>
          <input class="form-input" type="number" min="0" step="0.01" id="cMetaCPL" value="${c?.metaCPL || ''}" placeholder="Ex: 150,00">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Observações</label>
          <textarea class="form-input" id="cObs" rows="2" placeholder="Palavras-chave, segmentação, notas...">${Utils.escHtml(c?.observacoes || '')}</textarea>
        </div>
      </div>
    `;

    Modal.open({
      title: id ? 'Editar Campanha' : 'Nova Campanha Google Ads',
      body,
      saveLabel: id ? 'Salvar Alterações' : 'Criar Campanha',
      saveCb: () => Trafego.saveCampanha(id || ''),
    });
  }

  function saveCampanha(id) {
    const nome      = document.getElementById('cNome')?.value?.trim();
    const status    = document.getElementById('cStatus')?.value;
    const dataInicio = document.getElementById('cDataInicio')?.value;
    const dataFim   = document.getElementById('cDataFim')?.value;
    const orcamentoMensal = parseFloat(document.getElementById('cOrcamento')?.value) || 0;
    const investidoReal   = parseFloat(document.getElementById('cInvestidoReal')?.value) || 0;
    const metaLeads = parseInt(document.getElementById('cMetaLeads')?.value) || 0;
    const metaCPL   = parseFloat(document.getElementById('cMetaCPL')?.value) || 0;
    const observacoes = document.getElementById('cObs')?.value?.trim();

    if (!nome) { Toast.error('Informe o nome da campanha.'); return; }
    if (!dataInicio) { Toast.error('Informe a data de início.'); return; }

    const dados = { nome, status, dataInicio, dataFim, orcamentoMensal, investidoReal, metaLeads, metaCPL, observacoes };

    if (id) {
      DB.update('trafego_campanhas', id, dados);
      Toast.success('Campanha atualizada!');
    } else {
      DB.create('trafego_campanhas', dados);
      Toast.success('Campanha criada!');
    }

    Modal.close();
    _renderCampanhas();
  }

  function deleteCampanha(id) {
    if (!confirm('Excluir esta campanha? Esta ação não pode ser desfeita.')) return;
    DB.remove('trafego_campanhas', id);
    Toast.success('Campanha excluída.');
    _renderCampanhas();
  }

  /* ====================================================
     TAB 3: CONTATOS
     ==================================================== */

  function _renderContatos() {
    const el = document.getElementById('trafegoContent');
    if (!el) return;

    let leads = _leadsTrafico(_filtroMesContatos.length === 7 ? _filtroMesContatos : null);
    if (!_filtroMesContatos) leads = DB.getAll('leads').filter(l => l.origemLead === 'Tráfego Pago');

    // Aplicar filtros
    let filtrados = leads;
    if (_filtroStatusContatos) filtrados = filtrados.filter(l => l.status === _filtroStatusContatos);
    if (_filtroQualificado === 'sim') filtrados = filtrados.filter(_isQualificado);
    else if (_filtroQualificado === 'nao') filtrados = filtrados.filter(l => !_isQualificado(l));

    // Ordenar por data desc
    filtrados = filtrados.sort((a, b) => {
      const da = a.dataEntrada || (a.createdAt || '').split('T')[0];
      const db = b.dataEntrada || (b.createdAt || '').split('T')[0];
      return db.localeCompare(da);
    });

    // Contadores
    const total     = leads.length;
    const qualifs   = leads.filter(_isQualificado).length;
    const emProp    = leads.filter(l => ['proposta_elaboracao','proposta_enviada'].includes(l.status)).length;
    const ganhos    = leads.filter(l => l.status === 'fechado_ganho').length;
    const perdidos  = leads.filter(l => l.status === 'fechado_perdido').length;

    const optsStatus = [
      { v: '', l: 'Todos os status' },
      { v: 'lead_identificado',   l: 'Lead Novo' },
      { v: 'primeiro_contato',    l: '1º Contato' },
      { v: 'qualificacao',        l: 'Qualificado' },
      { v: 'proposta_elaboracao', l: 'Em Proposta' },
      { v: 'proposta_enviada',    l: 'Proposta Enviada' },
      { v: 'negociacao',          l: 'Negociação' },
      { v: 'fechado_ganho',       l: 'Ganho' },
      { v: 'fechado_perdido',     l: 'Perdido' },
    ];

    el.innerHTML = `
      <!-- Contadores -->
      <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-value">${total}</div><div class="kpi-label">Total</div></div>
        <div class="kpi-card" style="--kpi-color:#10b981"><div class="kpi-value">${qualifs}</div><div class="kpi-label">Qualificados</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b"><div class="kpi-value">${emProp}</div><div class="kpi-label">Em Proposta</div></div>
        <div class="kpi-card" style="--kpi-color:#059669"><div class="kpi-value">${ganhos}</div><div class="kpi-label">Ganhos</div></div>
        <div class="kpi-card" style="--kpi-color:#ef4444"><div class="kpi-value">${perdidos}</div><div class="kpi-label">Perdidos</div></div>
      </div>

      <!-- Filtros -->
      <div class="filters" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <input type="month" class="form-input" style="width:160px" value="${_filtroMesContatos}" onchange="Trafego._setFiltroMesContatos(this.value)" title="Filtrar por mês de entrada">
        <select class="form-input" style="width:190px" onchange="Trafego._setFiltroStatus(this.value)">
          ${optsStatus.map(o => `<option value="${o.v}"${_filtroStatusContatos === o.v ? ' selected' : ''}>${Utils.escHtml(o.l)}</option>`).join('')}
        </select>
        <select class="form-input" style="width:160px" onchange="Trafego._setFiltroQualificado(this.value)">
          <option value=""${_filtroQualificado === '' ? ' selected' : ''}>Qualificação: Todos</option>
          <option value="sim"${_filtroQualificado === 'sim' ? ' selected' : ''}>Qualificados</option>
          <option value="nao"${_filtroQualificado === 'nao' ? ' selected' : ''}>Não qualificados</option>
        </select>
        <div style="flex:1"></div>
        <span style="font-size:12px;color:var(--text-muted);align-self:center">${filtrados.length} resultado${filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      ${filtrados.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">Nenhum lead de tráfego pago encontrado</div>
          <div class="empty-sub">Os leads com origem "Tráfego Pago" cadastrados no pipeline aparecem aqui automaticamente.</div>
        </div>
      ` : `
        <div class="card">
          <table class="tbl">
            <thead>
              <tr>
                <th>Data</th>
                <th>Nome / Empresa</th>
                <th>Serviço</th>
                <th>Status Pipeline</th>
                <th>Qualificado</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${filtrados.map(l => _renderLinhaContato(l)).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
  }

  function _renderLinhaContato(l) {
    const data    = l.dataEntrada || (l.createdAt || '').split('T')[0];
    const nome    = Utils.escHtml(l.nomeContato || l.empresa || l.titulo || '—');
    const servicos = (l.servicoInteresse || []).map(s => Utils.escHtml(s)).join(', ') || '—';
    const stLabel = PIPELINE_LABEL[l.status] || l.status || '—';
    const stBadge = PIPELINE_BADGE[l.status] || 'badge-gray';
    const qual    = _isQualificado(l);

    return `
      <tr>
        <td style="white-space:nowrap">${Utils.formatDate(data)}</td>
        <td><strong>${nome}</strong>${l.empresa && l.nomeContato ? `<br><small style="color:var(--text-muted)">${Utils.escHtml(l.empresa)}</small>` : ''}</td>
        <td style="font-size:12px;color:var(--text-muted)">${servicos}</td>
        <td><span class="${stBadge}">${Utils.escHtml(stLabel)}</span></td>
        <td>
          <button class="btn btn-sm ${qual ? 'btn-success' : 'btn-ghost'}" style="min-width:80px;font-size:12px" onclick="Trafego.toggleQualificado('${l.id}','${qual}')">
            ${qual ? '✅ Sim' : '○ Não'}
          </button>
        </td>
        <td class="tbl-actions">
          <button class="btn-icon" title="Ver no Pipeline" onclick="Trafego._verNoPipeline('${l.id}')">🔗</button>
        </td>
      </tr>
    `;
  }

  function toggleQualificado(id, atualStr) {
    const atual = atualStr === 'true';
    DB.update('leads', id, { qualificadoTrafico: !atual });
    Toast.success(atual ? 'Lead marcado como não qualificado.' : 'Lead qualificado!');
    _renderContatos();
  }

  function _verNoPipeline(id) {
    if (typeof App !== 'undefined' && App.navigate) {
      App.navigate('pipeline');
      setTimeout(() => {
        if (typeof Pipeline !== 'undefined' && Pipeline.viewLead) Pipeline.viewLead(id);
      }, 300);
    }
  }

  function _setFiltroStatus(v)         { _filtroStatusContatos = v; _renderContatos(); }
  function _setFiltroQualificado(v)    { _filtroQualificado = v; _renderContatos(); }
  function _setFiltroMesContatos(v)    { _filtroMesContatos = v; _renderContatos(); }

  /* ====================================================
     TAB 4: ANÁLISE
     ==================================================== */

  function _renderAnalise() {
    const el = document.getElementById('trafegoContent');
    if (!el) return;

    const periodo  = _periodoFiltro;
    const leads    = _leadsTrafico(periodo);
    const investido = _investidoPeriodo(periodo);
    const ganhos   = leads.filter(l => l.status === 'fechado_ganho');
    const receita  = ganhos.reduce((s, l) => s + (parseFloat(l.valorFechado) || parseFloat(l.valorEstimado) || 0), 0);
    const cpl      = leads.length > 0 && investido > 0 ? investido / leads.length : 0;
    const roi      = investido > 0 ? ((receita - investido) / investido) * 100 : 0;
    const taxaConv = leads.length > 0 ? (ganhos.length / leads.length) * 100 : 0;

    const meta     = DB.getAll('trafego_metas').find(m => m.mes === periodo);
    const metaCPL  = parseFloat(meta?.metaCPL) || 0;
    const metaLeads = parseInt(meta?.metaLeads) || 0;
    const metaConv  = parseFloat(meta?.metaTaxaConversao) || 0;
    const metaReceita = parseFloat(meta?.metaReceita) || 0;

    // Recomendação automática
    const rec = _recomendacao(leads.length, cpl, metaCPL, roi, ganhos);

    // Projeção
    const projecaoHtml = _renderProjecao(leads, ganhos, periodo);

    el.innerHTML = `
      <!-- Seletor período análise -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <label style="font-size:13px;font-weight:600;color:var(--text-muted)">Período analisado:</label>
        <select class="form-input" style="width:220px" onchange="Trafego._setPeriodoDash(this.value)">
          ${_optsSelectPeriodo(periodo)}
        </select>
      </div>

      <div class="grid-2 mb-4">
        <!-- Card: Orçamento faz sentido? -->
        <div class="card">
          <div class="card-header"><span>💡 Orçamento faz sentido?</span></div>
          <div class="card-body">
            <div style="text-align:center;padding:8px 0 16px">
              <div style="font-size:48px;margin-bottom:8px">${rec.icon}</div>
              <div style="font-size:15px;font-weight:700;color:${rec.color};margin-bottom:8px">${Utils.escHtml(rec.titulo)}</div>
              <div style="font-size:13px;color:var(--text-muted);line-height:1.6">${Utils.escHtml(rec.texto)}</div>
            </div>
            <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <div style="text-align:center">
                <div style="font-size:11px;color:var(--text-muted)">Investido</div>
                <div style="font-size:14px;font-weight:700">${Utils.formatCurrency(investido)}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:11px;color:var(--text-muted)">Receita</div>
                <div style="font-size:14px;font-weight:700;color:var(--success)">${Utils.formatCurrency(receita)}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:11px;color:var(--text-muted)">ROI</div>
                <div style="font-size:14px;font-weight:700;color:${roi >= 0 ? 'var(--success)' : 'var(--danger)'}">${investido > 0 ? roi.toFixed(0) + '%' : '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card: Meta vs Realizado -->
        <div class="card">
          <div class="card-header"><span>🎯 Meta vs Realizado — ${Utils.escHtml(_formatMesLabel(periodo))}</span></div>
          <div class="card-body">
            ${meta ? `
              <table class="tbl">
                <thead>
                  <tr><th>Métrica</th><th>Meta</th><th>Realizado</th><th>%</th></tr>
                </thead>
                <tbody>
                  ${_linhaMetaReal('Leads', metaLeads, leads.length, false)}
                  ${_linhaMetaReal('CPL', metaCPL, cpl, true, true)}
                  ${_linhaMetaReal('Conversão', metaConv, taxaConv, false, false, '%')}
                  ${_linhaMetaReal('Receita', metaReceita, receita, true)}
                </tbody>
              </table>
            ` : `
              <div style="text-align:center;padding:32px 0;color:var(--text-muted)">
                <div style="font-size:32px;margin-bottom:8px">📋</div>
                <div style="font-size:13px">Nenhuma meta definida para ${Utils.escHtml(_formatMesLabel(periodo))}</div>
                <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="Trafego._setTab('metas')">Definir Meta</button>
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Projeção do Mês -->
      ${projecaoHtml}
    `;
  }

  function _recomendacao(nLeads, cpl, metaCPL, roi, ganhos) {
    if (nLeads === 0) {
      return { icon: '⚠️', color: '#f97316', titulo: 'Sem leads gerados', texto: 'Nenhum lead gerado neste período — revise a segmentação, palavras-chave e os criativos da campanha.' };
    }
    if (metaCPL > 0 && cpl > metaCPL * 1.5) {
      return { icon: '🔴', color: '#ef4444', titulo: 'CPL acima da meta', texto: `CPL atual (${Utils.formatCurrency(cpl)}) está muito acima da meta (${Utils.formatCurrency(metaCPL)}). Considere pausar a campanha e otimizar segmentação e lance.` };
    }
    if (metaCPL > 0 && cpl > metaCPL) {
      return { icon: '🟡', color: '#f59e0b', titulo: 'CPL ligeiramente acima', texto: `CPL atual (${Utils.formatCurrency(cpl)}) supera a meta (${Utils.formatCurrency(metaCPL)}) por menos de 50%. Monitore e ajuste o lance gradualmente.` };
    }
    if (roi > 300) {
      return { icon: '🚀', color: '#10b981', titulo: 'ROI Excelente!', texto: `ROI de ${roi.toFixed(0)}% é excepcional! Considere aumentar o orçamento para escalar os resultados.` };
    }
    if (roi > 100) {
      return { icon: '✅', color: '#059669', titulo: 'Campanha saudável', texto: `ROI de ${roi.toFixed(0)}% indica campanha positiva. Continue otimizando para aumentar a taxa de conversão.` };
    }
    if (roi >= 0) {
      return { icon: '🟢', color: '#10b981', titulo: 'ROI positivo', texto: `Campanha gerando retorno positivo (${roi.toFixed(0)}%). Avalie o ciclo de vendas para acelerar conversões.` };
    }
    return { icon: '📊', color: '#64748b', titulo: 'ROI em desenvolvimento', texto: ganhos.length === 0 ? 'Ainda sem conversões fechadas. Acompanhe os leads em negociação — o ciclo pode ser longo.' : `ROI ainda negativo. Avalie o ciclo de vendas e o ticket médio versus o custo de aquisição.` };
  }

  function _linhaMetaReal(label, meta, real, currency = false, inverso = false, sufixo = '') {
    const pct = meta > 0 ? (real / meta) * 100 : null;
    const bom = inverso ? (real <= meta) : (pct !== null && pct >= 90);
    const cor = pct === null ? 'var(--text-muted)' : bom ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)';
    const fmtMeta = currency ? Utils.formatCurrency(meta) : (meta + sufixo);
    const fmtReal = currency ? Utils.formatCurrency(real) : (real.toFixed(sufixo === '%' ? 1 : 0) + sufixo);
    const fmtPct  = pct !== null ? pct.toFixed(0) + '%' : '—';
    return `<tr>
      <td>${Utils.escHtml(label)}</td>
      <td>${meta > 0 ? fmtMeta : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td><strong>${fmtReal}</strong></td>
      <td style="color:${cor};font-weight:700">${fmtPct}</td>
    </tr>`;
  }

  function _renderProjecao(leads, ganhos, periodo) {
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);
    if (periodo !== mesAtual) return '';

    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diaHoje   = hoje.getDate();
    const diasRestantes = diasNoMes - diaHoje;

    if (diaHoje < 3) return '';

    const taxaDiariaLeads = leads.length / diaHoje;
    const projecaoLeads   = Math.round(leads.length + taxaDiariaLeads * diasRestantes);

    const taxaConv = leads.length > 0 ? ganhos.length / leads.length : 0;
    const ticketMedio = ganhos.length > 0
      ? ganhos.reduce((s, l) => s + (parseFloat(l.valorFechado) || parseFloat(l.valorEstimado) || 0), 0) / ganhos.length
      : 0;
    const projecaoGanhos  = Math.round(projecaoLeads * taxaConv);
    const projecaoReceita = projecaoGanhos * ticketMedio;

    return `
      <div class="card">
        <div class="card-header"><span>📅 Projeção do Mês — com base em ${diaHoje} dias de dados</span></div>
        <div class="card-body">
          <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
            <div class="kpi-card">
              <div class="kpi-value">${projecaoLeads}</div>
              <div class="kpi-label">Leads projetados</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${leads.length} até hoje</div>
            </div>
            <div class="kpi-card" style="--kpi-color:#8b5cf6">
              <div class="kpi-value">${(taxaConv * 100).toFixed(1)}%</div>
              <div class="kpi-label">Taxa conversão atual</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${ganhos.length} ganhos</div>
            </div>
            <div class="kpi-card" style="--kpi-color:#f59e0b">
              <div class="kpi-value">${projecaoGanhos}</div>
              <div class="kpi-label">Contratos projetados</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px">com ${diasRestantes}d restantes</div>
            </div>
            <div class="kpi-card" style="--kpi-color:#10b981">
              <div class="kpi-value">${ticketMedio > 0 ? Utils.formatCurrency(projecaoReceita) : '—'}</div>
              <div class="kpi-label">Receita projetada</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${ticketMedio > 0 ? 'ticket médio ' + Utils.formatCurrency(ticketMedio) : 'sem fechamentos'}</div>
            </div>
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin-top:12px;text-align:center">
            ⚠ Projeção baseada na taxa diária atual — resultado real pode variar conforme ciclo de vendas.
          </p>
        </div>
      </div>
    `;
  }

  /* ====================================================
     TAB 5: METAS
     ==================================================== */

  function _renderMetas() {
    const el = document.getElementById('trafegoContent');
    if (!el) return;

    const mesAtual  = new Date().toISOString().slice(0, 7);
    const todasMetas = DB.getAll('trafego_metas').sort((a, b) => b.mes.localeCompare(a.mes));
    const metaAtual  = todasMetas.find(m => m.mes === mesAtual);

    el.innerHTML = `
      <div class="grid-2 mb-4" style="align-items:start">
        <!-- Formulário de meta -->
        <div class="card">
          <div class="card-header"><span>📝 Definir / Editar Meta</span></div>
          <div class="card-body">
            <div class="form-grid" style="grid-template-columns:1fr;gap:12px">
              <div class="form-group">
                <label class="form-label">Mês de referência *</label>
                <input class="form-input" type="month" id="mMes" value="${mesAtual}" onchange="Trafego._carregarMeta(this.value)">
              </div>
              <div class="form-group">
                <label class="form-label">Meta de Leads</label>
                <input class="form-input" type="number" min="0" id="mLeads" value="${metaAtual?.metaLeads || ''}" placeholder="Ex: 40">
              </div>
              <div class="form-group">
                <label class="form-label">Meta CPL (R$)</label>
                <input class="form-input" type="number" min="0" step="0.01" id="mCPL" value="${metaAtual?.metaCPL || ''}" placeholder="Ex: 150,00">
              </div>
              <div class="form-group">
                <label class="form-label">Meta Taxa de Conversão (%)</label>
                <input class="form-input" type="number" min="0" max="100" step="0.1" id="mConv" value="${metaAtual?.metaTaxaConversao || ''}" placeholder="Ex: 10">
              </div>
              <div class="form-group">
                <label class="form-label">Meta de Receita (R$)</label>
                <input class="form-input" type="number" min="0" step="0.01" id="mReceita" value="${metaAtual?.metaReceita || ''}" placeholder="Ex: 30000">
              </div>
              <div class="form-group">
                <label class="form-label">Orçamento Planejado (R$)</label>
                <input class="form-input" type="number" min="0" step="0.01" id="mOrcamento" value="${metaAtual?.orcamentoPlanejado || ''}" placeholder="Ex: 3000">
              </div>
              <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea class="form-input" id="mObs" rows="2" placeholder="Estratégia, foco do mês...">${Utils.escHtml(metaAtual?.observacoes || '')}</textarea>
              </div>
              <button class="btn btn-primary" onclick="Trafego.saveMeta()">💾 Salvar Meta</button>
            </div>
          </div>
        </div>

        <!-- Metas recentes -->
        <div class="card">
          <div class="card-header"><span>📋 Histórico de Metas</span></div>
          <div class="card-body" style="padding:0">
            ${todasMetas.length === 0 ? `
              <div style="text-align:center;padding:32px 16px;color:var(--text-muted)">
                <div style="font-size:32px;margin-bottom:8px">🎯</div>
                <div style="font-size:13px">Nenhuma meta definida ainda</div>
              </div>
            ` : `
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Meta Leads</th>
                    <th>Meta CPL</th>
                    <th>Meta Receita</th>
                    <th>Real Leads</th>
                    <th>Real Receita</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${todasMetas.map(m => {
                    const leadsReal   = _leadsTrafico(m.mes);
                    const ganhosReal  = leadsReal.filter(l => l.status === 'fechado_ganho');
                    const receitaReal = ganhosReal.reduce((s, l) => s + (parseFloat(l.valorFechado) || parseFloat(l.valorEstimado) || 0), 0);
                    const pctLeads    = m.metaLeads > 0 ? (leadsReal.length / m.metaLeads) * 100 : null;
                    const pctReceita  = m.metaReceita > 0 ? (receitaReal / m.metaReceita) * 100 : null;
                    const atingida    = (pctLeads !== null && pctLeads >= 90) || (pctReceita !== null && pctReceita >= 90);
                    const badge       = atingida ? 'badge-green' : 'badge-gray';
                    const badgeLabel  = atingida ? '✅ Atingida' : '— Em aberto';
                    return `
                      <tr style="cursor:pointer" onclick="Trafego._carregarMetaForm('${m.mes}')">
                        <td style="font-weight:600">${Utils.escHtml(_formatMesLabel(m.mes))}</td>
                        <td>${m.metaLeads || '—'}</td>
                        <td>${m.metaCPL ? Utils.formatCurrency(m.metaCPL) : '—'}</td>
                        <td>${m.metaReceita ? Utils.formatCurrency(m.metaReceita) : '—'}</td>
                        <td style="font-weight:700;color:${pctLeads >= 90 ? 'var(--success)' : 'var(--text)'}">${leadsReal.length}</td>
                        <td style="font-weight:700;color:${pctReceita >= 90 ? 'var(--success)' : 'var(--text)'}">${Utils.formatCurrency(receitaReal)}</td>
                        <td><span class="${badge}">${badgeLabel}</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function saveMeta() {
    const mes      = document.getElementById('mMes')?.value;
    const metaLeads        = parseInt(document.getElementById('mLeads')?.value) || 0;
    const metaCPL          = parseFloat(document.getElementById('mCPL')?.value) || 0;
    const metaTaxaConversao = parseFloat(document.getElementById('mConv')?.value) || 0;
    const metaReceita       = parseFloat(document.getElementById('mReceita')?.value) || 0;
    const orcamentoPlanejado = parseFloat(document.getElementById('mOrcamento')?.value) || 0;
    const observacoes       = document.getElementById('mObs')?.value?.trim();

    if (!mes) { Toast.error('Selecione o mês de referência.'); return; }

    const existente = DB.getAll('trafego_metas').find(m => m.mes === mes);
    const dados = { mes, metaLeads, metaCPL, metaTaxaConversao, metaReceita, orcamentoPlanejado, observacoes };

    if (existente) {
      DB.update('trafego_metas', existente.id, dados);
      Toast.success('Meta atualizada!');
    } else {
      DB.create('trafego_metas', dados);
      Toast.success('Meta criada!');
    }

    _renderMetas();
  }

  function _carregarMeta(mes) {
    const meta = DB.getAll('trafego_metas').find(m => m.mes === mes);
    const set  = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('mLeads',    meta?.metaLeads || '');
    set('mCPL',      meta?.metaCPL || '');
    set('mConv',     meta?.metaTaxaConversao || '');
    set('mReceita',  meta?.metaReceita || '');
    set('mOrcamento', meta?.orcamentoPlanejado || '');
    set('mObs',      meta?.observacoes || '');
  }

  function _carregarMetaForm(mes) {
    const mInput = document.getElementById('mMes');
    if (mInput) {
      mInput.value = mes;
      _carregarMeta(mes);
      mInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ====================================================
     API PÚBLICA
     ==================================================== */

  return {
    render,
    _setTab,
    openFormCampanha,
    saveCampanha,
    deleteCampanha,
    toggleQualificado,
    saveMeta,
    setPeriodo:              (p) => { _periodo = p; render(); },
    _setPeriodoGlobal:       (p) => { _periodo = p; render(); },
    _setPeriodoDash:         _setPeriodoDash,
    _setFiltroStatus:        _setFiltroStatus,
    _setFiltroQualificado:   _setFiltroQualificado,
    _setFiltroMesContatos:   _setFiltroMesContatos,
    _verNoPipeline:          _verNoPipeline,
    _carregarMeta:           _carregarMeta,
    _carregarMetaForm:       _carregarMetaForm,
  };

})();
