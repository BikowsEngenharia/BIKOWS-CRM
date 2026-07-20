/* ==========================================
   PLANO DE NEGÓCIOS — execução do plano estratégico
   Ações do Plano 90 Dias, OKRs e saúde de caixa.
   Fonte: Plano de Negócios Bikows 2026–2029 v2.0
   ========================================== */
const Plano = (() => {

  let _tab = 'acoes'; // acoes | okrs | caixa

  const FASES = {
    1: { label: 'Fase 1 · Dias 1–30',  sub: 'Estabilizar a base',   cor: '#1D4F8C' },
    2: { label: 'Fase 2 · Dias 31–60', sub: 'Construir canais',     cor: '#2E6FBF' },
    3: { label: 'Fase 3 · Dias 61–90', sub: 'Acelerar e medir',     cor: '#8B2222' },
  };

  const STATUS = {
    pendente:   { label: 'Pendente',    badge: 'badge-gray'   },
    andamento:  { label: 'Em andamento',badge: 'badge-blue'   },
    concluida:  { label: 'Concluída',   badge: 'badge-green'  },
  };

  /* ---- Parâmetros financeiros do plano ---- */
  const CAIXA = {
    reserva:        25000, // reserva de operação intocável
    gatilhoAlerta:  15000, // saldo mínimo → prospecção intensiva
    midiaProtegida:  2500, // piso mensal de verba de mídia
    breakEven:      13912, // faturamento mínimo/mês (Simples ~11%)
    custoFixo:      12383, // custos fixos mensais
    comprometimento:  0.6, // máx. da receita prevista antes de receber
  };

  /* ====================================================
     RENDER
     ==================================================== */
  function render() {
    const acoes = DB.getAll('plano_acoes');
    const total = acoes.length;
    const feitas = acoes.filter(a => a.status === 'concluida').length;
    const pct = total ? Math.round((feitas / total) * 100) : 0;

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Plano de Negócios</h2>
        <div class="sec-actions">
          ${total === 0
            ? `<button class="btn btn-primary btn-sm" onclick="Plano.carregarPlano90()">📥 Carregar Plano 90 Dias</button>`
            : `<button class="btn btn-secondary btn-sm" onclick="Plano.novaAcao()">+ Nova Ação</button>`}
        </div>
      </div>

      ${total > 0 ? `
      <div class="card mb-4" style="background:linear-gradient(135deg,#0B1B33 0%,#1D4F8C 100%);border:none">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
          <div>
            <div style="color:#8FA0B5;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Plano 90 Dias · jul–set/2026</div>
            <div style="color:#fff;font-size:26px;font-weight:800;line-height:1.1;margin-top:4px">${feitas} de ${total} ações concluídas</div>
            <div style="color:#8FA0B5;font-size:12.5px;margin-top:4px">Execução do Plano de Negócios 2026–2029 v2.0</div>
          </div>
          <div style="text-align:right">
            <div style="color:#fff;font-size:32px;font-weight:800">${pct}%</div>
            <div style="width:160px;height:8px;background:rgba(255,255,255,.2);border-radius:99px;overflow:hidden;margin-top:6px">
              <div style="width:${pct}%;height:100%;background:${pct>=70?'#10b981':pct>=40?'#f59e0b':'#C42B2B'};border-radius:99px;transition:width .5s"></div>
            </div>
          </div>
        </div>
      </div>` : ''}

      <div class="tabs mb-4">
        ${[['acoes','✅ Plano 90 Dias'],['okrs','🎯 OKRs 2º Sem/2026'],['caixa','💰 Saúde de Caixa']]
          .map(([id,lb]) => `<button class="tab-btn ${_tab===id?'active':''}" onclick="Plano.setTab('${id}')">${lb}</button>`).join('')}
      </div>
      <div id="planoContent"></div>`;

    _renderTab();
  }

  function setTab(t) { _tab = t; render(); }

  function _renderTab() {
    const el = document.getElementById('planoContent');
    if (!el) return;
    if (_tab === 'acoes') el.innerHTML = _renderAcoes();
    if (_tab === 'okrs')  el.innerHTML = _renderOKRs();
    if (_tab === 'caixa') el.innerHTML = _renderCaixa();
  }

  /* ====================================================
     ABA: AÇÕES DO PLANO 90 DIAS
     ==================================================== */
  function _renderAcoes() {
    const acoes = DB.getAll('plano_acoes');

    if (acoes.length === 0) {
      return `<div class="card"><div class="card-body">
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">Plano 90 Dias ainda não carregado</div>
          <div class="empty-sub">Carregue as 21 ações das 3 fases do seu Plano de Negócios 2026–2029 e acompanhe a execução aqui.</div>
          <button class="btn btn-primary mt-4" onclick="Plano.carregarPlano90()">📥 Carregar Plano 90 Dias</button>
        </div>
      </div></div>`;
    }

    return Object.entries(FASES).map(([fase, cfg]) => {
      const daFase = acoes.filter(a => String(a.fase) === fase)
                          .sort((a,b) => (a.ordem||0) - (b.ordem||0));
      if (!daFase.length) return '';
      const feitas = daFase.filter(a => a.status === 'concluida').length;

      return `
        <div class="card mb-4">
          <div class="card-header" style="border-left:4px solid ${cfg.cor}">
            <div>
              <div class="card-title">${cfg.label}</div>
              <div class="text-xs text-muted">${cfg.sub}</div>
            </div>
            <span class="badge ${feitas===daFase.length?'badge-green':'badge-gray'}">${feitas}/${daFase.length}</span>
          </div>
          <div class="card-body" style="padding:0">
            ${daFase.map(a => {
              const st = STATUS[a.status] || STATUS.pendente;
              const done = a.status === 'concluida';
              return `
                <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">
                  <input type="checkbox" ${done?'checked':''} onchange="Plano.toggleAcao('${a.id}')"
                    style="width:18px;height:18px;margin-top:2px;cursor:pointer;accent-color:var(--primary);flex-shrink:0">
                  <div style="flex:1;min-width:0">
                    <div class="text-sm font-semibold" style="${done?'text-decoration:line-through;opacity:.6':''}">${Utils.escHtml(a.acao||'')}</div>
                    ${a.resultado ? `<div class="text-xs text-muted" style="margin-top:2px">🎯 ${Utils.escHtml(a.resultado)}</div>` : ''}
                    <div style="display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap">
                      <span class="badge ${st.badge}" style="font-size:10px">${st.label}</span>
                      ${a.apoio ? `<span class="text-xs text-muted">⚙ ${Utils.escHtml(a.apoio)}</span>` : ''}
                      ${a.prazo ? `<span class="text-xs ${Utils.isOverdue(a.prazo)&&!done?'text-danger':'text-muted'}">📅 ${Utils.formatDate(a.prazo)}</span>` : ''}
                    </div>
                  </div>
                  <div class="tbl-actions" style="flex-shrink:0">
                    <button class="btn btn-xs btn-secondary" onclick="Plano.editarAcao('${a.id}')" title="Editar">✏</button>
                    <button class="btn btn-xs btn-secondary" onclick="Plano.viraAtividade('${a.id}')" title="Criar atividade no CRM">📌</button>
                    <button class="btn btn-xs btn-danger" onclick="Plano.excluirAcao('${a.id}')">🗑</button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  /* ====================================================
     ABA: OKRs
     ==================================================== */
  function _renderOKRs() {
    const OKRS = [
      { o: 'O1 — Estabilizar e duplicar o faturamento recorrente', cor: '#1D4F8C',
        krs: ['Faturamento médio de R$ 35k até dez/2026',
              '5 contratos de recorrência assinados até set/2026',
              'Dependência de Google Ads de 95% → 70%'] },
      { o: 'O2 — Presença digital que gera leads sem custo variável', cor: '#2E6FBF',
        krs: ['40 artigos técnicos publicados até dez/2026',
              'Top 5 no Google em 5 palavras-chave',
              '3 leads orgânicos por mês até out/2026'] },
      { o: 'O3 — Expandir geografia e diversificar receita', cor: '#8B2222',
        krs: ['1 contrato fechado em RS ou MS até set/2026',
              'Ticket médio de R$ 25.000 por contrato',
              '3 ou mais fontes de receita ativas'] },
    ];

    const RITUAIS = [
      ['Revisão semanal',    'Segunda, 30–45 min',    'Semana anterior, pipeline, caixa, top 5 prioridades'],
      ['Fechamento mensal',  '1ª semana do mês',      'DRE, leads por canal, OKRs, margens'],
      ['Revisão trimestral', 'Fim de trimestre',      'OKRs do trimestre, ajuste de metas'],
      ['Revisão do plano',   'Semestral',             'Este plano vs. realidade'],
    ];

    return `
      <div class="grid-3 mb-4">
        ${OKRS.map(o => `
          <div class="card">
            <div class="card-header" style="border-left:4px solid ${o.cor}">
              <div class="card-title" style="font-size:12.5px;line-height:1.4">${Utils.escHtml(o.o)}</div>
            </div>
            <div class="card-body">
              ${o.krs.map(kr => `
                <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px">
                  <span style="color:${o.cor};font-weight:700;flex-shrink:0">→</span>
                  <span class="text-sm">${Utils.escHtml(kr)}</span>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">🔄 Rituais de gestão</div></div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Ritual</th><th>Quando</th><th>Pauta</th></tr></thead>
            <tbody>
              ${RITUAIS.map(([r,q,p]) => `<tr>
                <td class="font-semibold text-sm">${r}</td>
                <td class="text-sm text-muted">${q}</td>
                <td class="text-sm">${p}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ====================================================
     ABA: SAÚDE DE CAIXA
     ==================================================== */
  function _renderCaixa() {
    // Saldo estimado: receitas recebidas − despesas pagas (todo o histórico)
    const lanc = DB.getAll('lancamentos');
    const entrou = lanc.filter(l => l.tipo === 'receita' && l.status === 'recebido').reduce((s,l) => s + (l.valor||0), 0);
    const saiu   = lanc.filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((s,l) => s + (l.valor||0), 0);
    const saldo  = entrou - saiu;

    // Faturamento do mês corrente vs break-even
    const mes = Utils.todayStr().substring(0, 7);
    const fatMes = lanc.filter(l => l.tipo === 'receita' && l.status === 'recebido' && (l.data||'').startsWith(mes))
                       .reduce((s,l) => s + (l.valor||0), 0);
    const pctBE = Math.round((fatMes / CAIXA.breakEven) * 100);

    const alerta = saldo < CAIXA.gatilhoAlerta;
    const temReserva = saldo >= CAIXA.reserva;

    return `
      ${alerta ? `
      <div class="card mb-4" style="border-left:4px solid var(--danger);background:var(--danger-light)">
        <div class="card-body">
          <div class="font-bold" style="color:var(--danger);margin-bottom:4px">🚨 Gatilho de alerta acionado</div>
          <div class="text-sm">O saldo está abaixo de ${Utils.formatCurrency(CAIXA.gatilhoAlerta)}, o piso definido no plano de contingência.
          Ação prevista: <strong>prospecção intensiva</strong> e revisão dos compromissos do mês.</div>
        </div>
      </div>` : ''}

      <div class="fin-kpi" style="grid-template-columns:repeat(2,1fr)">
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Saldo estimado</div>
          <div class="fin-kpi-val ${saldo>=CAIXA.gatilhoAlerta?'text-success':'text-danger'}">${Utils.formatCurrency(saldo)}</div>
          <div class="fk-sub">Receitas recebidas − despesas pagas</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Faturamento do mês</div>
          <div class="fin-kpi-val ${pctBE>=100?'text-success':'text-warning'}">${Utils.formatCurrency(fatMes)}</div>
          <div class="fk-sub">${pctBE}% do break-even (${Utils.formatCurrency(CAIXA.breakEven)})</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Reserva de operação</div>
          <div class="fin-kpi-val ${temReserva?'text-success':'text-warning'}">${Utils.formatCurrency(CAIXA.reserva)}</div>
          <div class="fk-sub">${temReserva ? '✓ Saldo cobre a reserva' : 'Meta a constituir — conta separada'}</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Custos fixos mensais</div>
          <div class="fin-kpi-val">${Utils.formatCurrency(CAIXA.custoFixo)}</div>
          <div class="fk-sub">Cadastrados em Financeiro → Despesas Fixas</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">🛡 Plano de contingência financeira</div></div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Regra</th><th>Parâmetro</th><th>O que significa</th></tr></thead>
            <tbody>
              <tr><td class="font-semibold text-sm">Reserva de operação</td>
                  <td class="font-bold">${Utils.formatCurrency(CAIXA.reserva)}</td>
                  <td class="text-sm">Intocável, mantida em conta separada</td></tr>
              <tr><td class="font-semibold text-sm">Gatilho de alerta</td>
                  <td class="font-bold text-danger">${Utils.formatCurrency(CAIXA.gatilhoAlerta)}</td>
                  <td class="text-sm">Saldo mínimo — abaixo disso, prospecção intensiva</td></tr>
              <tr><td class="font-semibold text-sm">Verba de mídia protegida</td>
                  <td class="font-bold">${Utils.formatCurrency(CAIXA.midiaProtegida)}</td>
                  <td class="text-sm">Piso mensal intocável — evita interromper campanhas</td></tr>
              <tr><td class="font-semibold text-sm">Limite de comprometimento</td>
                  <td class="font-bold">${Math.round(CAIXA.comprometimento*100)}%</td>
                  <td class="text-sm">Máximo da receita prevista que pode ser comprometido antes de receber</td></tr>
              <tr><td class="font-semibold text-sm">Break-even</td>
                  <td class="font-bold">${Utils.formatCurrency(CAIXA.breakEven)}</td>
                  <td class="text-sm">Faturamento mínimo/mês (custos fixos + Simples ~11%)</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ====================================================
     CARGA INICIAL — 21 ações do Plano 90 Dias
     ==================================================== */
  function carregarPlano90() {
    if (DB.getAll('plano_acoes').length > 0) {
      Toast.warning('O plano já foi carregado.');
      return;
    }

    // Prazos: fase 1 = +30d, fase 2 = +60d, fase 3 = +90d a partir de hoje
    const prazoDe = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return Utils.localDateStr(d); };

    const ACOES = [
      // ---- Fase 1: dias 1–30 — Estabilizar a base ----
      [1, 'Auditar campanhas Google Ads com a agência', 'bikows-trafego-pago', 'Diagnóstico e correções em execução'],
      [1, 'Mapear base de clientes e vencimentos NR-13/NR-12', 'bikows-recorrencia', 'Planilha com 20+ oportunidades de contrato anual'],
      [1, 'Criar reserva de mídia dedicada (R$ 2.500/mês)', 'bikows-management', 'Fim das interrupções de campanha'],
      [1, 'Implantar CRM completo + 1ª revisão semanal', 'bikows-management', 'Pipeline 100% visível'],
      [1, 'Enviar proposta de recorrência aos 10 melhores clientes', 'bikows-recorrencia + legal', 'Primeiros contratos anuais'],
      [1, 'Publicar 5 artigos + reativar LinkedIn', 'bikows-content-marketing', 'Presença digital ativa'],
      [1, 'Consolidar manual da marca (brand book)', 'bikows-brand', 'Identidade única em todo material'],
      // ---- Fase 2: dias 31–60 — Construir canais ----
      [2, 'Publicar mais 8 artigos (total 13)', 'bikows-content-marketing', 'Indexação orgânica iniciada'],
      [2, 'LinkedIn 3x/semana + 50 conexões/semana', 'bikows-content-marketing', '200+ conexões qualificadas'],
      [2, 'Landing pages dedicadas NR-12, NR-13 e laudos', 'bikows-trafego-pago', 'Conversão medida por serviço'],
      [2, 'Prospecção ativa: 5 empresas/semana', 'bikows-prospecting', '10+ leads outbound no funil'],
      [2, 'Testar campanhas RS e MS (R$ 30/dia cada)', 'bikows-trafego-pago', 'Demanda validada em novos estados'],
      [2, 'Modelo de proposta padronizado + follow-up', 'creative-proposals + management', 'Ciclo de vendas mais curto'],
      [2, 'Lançar programa de indicação estruturado', 'bikows-recorrencia', 'Primeiras indicações registradas'],
      // ---- Fase 3: dias 61–90 — Acelerar e medir ----
      [3, 'Completar 20 artigos publicados', 'bikows-content-marketing', 'Primeiras posições em cauda longa'],
      [3, 'Dobrar verba nas campanhas que performam', 'bikows-trafego-pago', 'CPL qualificado em queda'],
      [3, 'Fechar 5 contratos de recorrência', 'bikows-recorrencia', 'R$ 3–8k/mês previsíveis'],
      [3, '1º fechamento mensal completo (DRE + canais + OKRs)', 'bikows-management', 'Gestão baseada em dados'],
      [3, 'Avaliar assistente part-time (gatilho R$ 35k+/mês)', 'bikows-management', 'Decisão por dados, não intuição'],
      [3, 'Revisão dos 90 dias e plano do próximo trimestre', 'bikows-management', 'Q4/2026 planejado com dados reais'],
    ];

    ACOES.forEach(([fase, acao, apoio, resultado], i) => {
      DB.create('plano_acoes', {
        fase, acao, apoio, resultado,
        status: 'pendente',
        ordem: i,
        prazo: prazoDe(fase * 30),
      });
    });

    Toast.success(`📋 ${ACOES.length} ações do Plano 90 Dias carregadas!`);
    render();
  }

  /* ====================================================
     CRUD
     ==================================================== */
  function toggleAcao(id) {
    const a = DB.get('plano_acoes', id); if (!a) return;
    const novo = a.status === 'concluida' ? 'pendente' : 'concluida';
    DB.update('plano_acoes', id, { status: novo, dataConclusao: novo === 'concluida' ? Utils.todayStr() : null });
    if (novo === 'concluida') Toast.success('✅ Ação concluída!');
    render();
  }

  function novaAcao()      { _openForm(null); }
  function editarAcao(id)  { _openForm(id); }

  function _openForm(id) {
    const a = id ? DB.get('plano_acoes', id) : null;
    Modal.open({
      title: id ? 'Editar Ação' : '+ Nova Ação do Plano',
      body: `
        <div class="form-group"><label class="form-label">Ação *</label>
          <input class="form-control" id="paAcao" value="${Utils.escHtml(a?.acao||'')}" placeholder="O que precisa ser feito"></div>
        <div class="form-group"><label class="form-label">Resultado esperado</label>
          <input class="form-control" id="paResultado" value="${Utils.escHtml(a?.resultado||'')}" placeholder="Como saber que deu certo"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Fase</label>
            <select class="form-control" id="paFase">
              ${Object.entries(FASES).map(([f,c]) => `<option value="${f}" ${String(a?.fase)===f?'selected':''}>${c.label}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-control" id="paStatus">
              ${Object.entries(STATUS).map(([s,c]) => `<option value="${s}" ${(a?.status||'pendente')===s?'selected':''}>${c.label}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Prazo</label>
            <input class="form-control" id="paPrazo" type="date" value="${a?.prazo||''}"></div>
        </div>
        <div class="form-group"><label class="form-label">Apoio / responsável</label>
          <input class="form-control" id="paApoio" value="${Utils.escHtml(a?.apoio||'')}" placeholder="Ex: bikows-management"></div>`,
      saveCb: () => {
        const acao = document.getElementById('paAcao').value.trim();
        if (!acao) { Toast.error('Descreva a ação'); return; }
        const dados = {
          acao,
          resultado: document.getElementById('paResultado').value,
          fase:      Number(document.getElementById('paFase').value),
          status:    document.getElementById('paStatus').value,
          prazo:     document.getElementById('paPrazo').value,
          apoio:     document.getElementById('paApoio').value,
        };
        if (id) { DB.update('plano_acoes', id, dados); Toast.success('Ação atualizada'); }
        else    { DB.create('plano_acoes', { ...dados, ordem: DB.getAll('plano_acoes').length }); Toast.success('Ação criada'); }
        Modal.close(); render();
      },
    });
  }

  function excluirAcao(id) {
    const a = DB.get('plano_acoes', id);
    Utils.confirmDelete(a?.acao || 'esta ação', () => {
      DB.remove('plano_acoes', id);
      Toast.success('Ação removida');
      render();
    });
  }

  /* Transforma a ação do plano numa atividade com prazo no CRM */
  function viraAtividade(id) {
    const a = DB.get('plano_acoes', id); if (!a) return;
    DB.create('atividades', {
      titulo: '📋 ' + a.acao,
      descricao: (a.resultado ? 'Resultado esperado: ' + a.resultado : '') + (a.apoio ? '\nApoio: ' + a.apoio : ''),
      tipo: 'tarefa',
      prioridade: 'alta',
      status: 'pendente',
      data: a.prazo || Utils.todayStr(),
      hora: '09:00',
      responsavel: DB.getConfig()?.usuario?.nome || '',
    });
    Toast.success('📌 Atividade criada — veja em Atividades');
    if (typeof App !== 'undefined') App.updateNotifBadge();
  }

  function addNew() { novaAcao(); }

  return { render, setTab, carregarPlano90, toggleAcao, novaAcao, editarAcao, excluirAcao, viraAtividade, addNew };
})();
