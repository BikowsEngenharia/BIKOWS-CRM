/* ==========================================
   Metas & KPIs — Dashboard de Resultados
   ========================================== */
const Metas = (() => {
  let _ano  = new Date().getFullYear();
  let _tab  = 'painel'; // painel | trimestres | servicos | anual
  let _qDash = Math.floor(new Date().getMonth() / 3); // trimestre exibido no painel

  const TRIMESTRES = ['Q1 (Jan–Mar)', 'Q2 (Abr–Jun)', 'Q3 (Jul–Set)', 'Q4 (Out–Dez)'];
  const TRIMESTRE_MESES = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]];
  const Q_LABELS = ['Q1','Q2','Q3','Q4'];

  /* ---- Helpers de data ---- */
  function _trimestreAtual() { return Math.floor(new Date().getMonth() / 3); }

  function _getMeta(ano, trimestre) {
    return DB.getAll('metas').find(m => m.ano === ano && m.trimestre === trimestre) || _metaVazia(ano, trimestre);
  }

  function _metaVazia(ano, trimestre) {
    return { ano, trimestre, receita:0, novosClientes:0, novosLeads:0,
      propostas:0, taxaConversao:30, projetosConcluidos:0, licitacoesGanhas:0,
      servicosMetas:[], metasCustom:[], observacoes:'' };
  }

  /* ====================================================
     DEFINIÇÃO DE METAS POR PERÍODO (com diluição)
     Você define no nível que quiser — anual, semestral,
     trimestral ou mensal — e o sistema distribui pelos
     trimestres, que são a unidade de acompanhamento.
     ==================================================== */

  // Indicadores que podem receber meta. 'acumula' = soma ao longo do ano
  // (receita, leads…); indicadores de taxa não somam, são média.
  const INDICADORES = [
    { key:'receita',            label:'Faturamento',        icon:'💰', tipo:'moeda',   acumula:true  },
    { key:'novosLeads',         label:'Novos Leads',        icon:'💼', tipo:'numero',  acumula:true  },
    { key:'propostas',          label:'Propostas Enviadas', icon:'📄', tipo:'numero',  acumula:true  },
    { key:'novosClientes',      label:'Novos Clientes',     icon:'🏢', tipo:'numero',  acumula:true  },
    { key:'projetosConcluidos', label:'Projetos Concluídos',icon:'📋', tipo:'numero',  acumula:true  },
    { key:'licitacoesGanhas',   label:'Licitações Ganhas',  icon:'🏛', tipo:'numero',  acumula:true  },
    { key:'taxaConversao',      label:'Taxa de Conversão',  icon:'📈', tipo:'percent', acumula:false },
  ];

  const PERIODOS = {
    anual:      { label:'Anual',      trimestres:[0,1,2,3], sub:'O valor é distribuído nos 4 trimestres' },
    semestre1:  { label:'1º Semestre',trimestres:[0,1],     sub:'Distribuído em Q1 e Q2' },
    semestre2:  { label:'2º Semestre',trimestres:[2,3],     sub:'Distribuído em Q3 e Q4' },
    q0:         { label:'Q1 (Jan–Mar)', trimestres:[0],     sub:'Meta direta do trimestre' },
    q1:         { label:'Q2 (Abr–Jun)', trimestres:[1],     sub:'Meta direta do trimestre' },
    q2:         { label:'Q3 (Jul–Set)', trimestres:[2],     sub:'Meta direta do trimestre' },
    q3:         { label:'Q4 (Out–Dez)', trimestres:[3],     sub:'Meta direta do trimestre' },
    mensal:     { label:'Mensal (×12)', trimestres:[0,1,2,3], sub:'O valor mensal é multiplicado por 3 em cada trimestre' },
  };

  // Estado da tela de definição
  let _defPeriodo = 'anual';
  let _defModo    = 'linear'; // linear | crescente | manual
  let _defValores = {};       // { indicadorKey: valorTotalDoPeriodo }
  let _defAjustes = {};       // { indicadorKey: [v0,v1,v2,v3] } quando modo manual
  let _defCustom  = [];       // [{nome, valor, unidade}]

  /* Distribui um total entre N períodos conforme o modo escolhido.
     - linear:    partes iguais
     - crescente: progressão que reflete crescimento ao longo do ano
     Sempre fecha exatamente no total (a última parcela absorve o resto). */
  function _distribuir(total, nPeriodos, modo, inteiro) {
    if (!total || nPeriodos < 1) return new Array(Math.max(nPeriodos,0)).fill(0);
    if (nPeriodos === 1) return [inteiro ? Math.round(total) : total];

    let pesos;
    if (modo === 'crescente') {
      // Crescimento suave: cada período pesa ~15% mais que o anterior
      pesos = []; let p = 1;
      for (let i = 0; i < nPeriodos; i++) { pesos.push(p); p *= 1.15; }
    } else {
      pesos = new Array(nPeriodos).fill(1);
    }
    const somaPesos = pesos.reduce((s, p) => s + p, 0);

    const out = []; let acumulado = 0;
    for (let i = 0; i < nPeriodos - 1; i++) {
      let v = total * (pesos[i] / somaPesos);
      v = inteiro ? Math.round(v) : Math.round(v * 100) / 100;
      out.push(v); acumulado += v;
    }
    const ultimo = inteiro ? Math.round(total - acumulado) : Math.round((total - acumulado) * 100) / 100;
    out.push(ultimo);
    return out;
  }

  /* Calcula como cada indicador ficará distribuído nos trimestres do período */
  function _calcularDistribuicao() {
    const cfg = PERIODOS[_defPeriodo];
    const qs  = cfg.trimestres;
    const out = {}; // { key: { q0:v, q1:v, ... } }

    INDICADORES.forEach(ind => {
      const total = Number(_defValores[ind.key]) || 0;
      if (!total) return;

      let valores;
      if (_defModo === 'manual' && _defAjustes[ind.key]) {
        valores = _defAjustes[ind.key];
      } else if (_defPeriodo === 'mensal') {
        // Valor mensal → cada trimestre recebe 3 meses
        const porTrim = ind.acumula ? total * 3 : total;
        valores = qs.map(() => ind.tipo === 'moeda' ? porTrim : Math.round(porTrim));
      } else if (!ind.acumula) {
        // Taxas não se dividem — o mesmo alvo vale para cada trimestre
        valores = qs.map(() => total);
      } else {
        valores = _distribuir(total, qs.length, _defModo, ind.tipo !== 'moeda');
      }
      out[ind.key] = {};
      qs.forEach((q, i) => { out[ind.key][q] = valores[i] || 0; });
    });
    return out;
  }

  /* ---- Cálculo de realizados ---- */
  function _realizados(ano, trimestre) {
    const meses = TRIMESTRE_MESES[trimestre];
    const inicio = Utils.localDateStr(new Date(ano, meses[0], 1));
    const fim    = Utils.localDateStr(new Date(ano, meses[2]+1, 0));
    const inP    = d => d && d >= inicio && d <= fim;

    const receita = DB.getAll('lancamentos')
      .filter(l => l.tipo==='receita' && l.status==='recebido' && inP(l.data))
      .reduce((s,l) => s+(l.valor||0), 0);
    const novosClientes   = DB.getAll('clientes').filter(c => inP((c.createdAt||'').split('T')[0])).length;
    const novosLeads      = DB.getAll('leads').filter(l => inP((l.createdAt||'').split('T')[0])).length;
    const propostas       = DB.getAll('propostas').filter(p => ['enviada','negociacao','aprovada'].includes(p.status) && inP((p.createdAt||'').split('T')[0])).length;
    const leadsTotal      = DB.getAll('leads').filter(l => inP((l.createdAt||'').split('T')[0])).length;
    const leadsGanhos     = DB.getAll('leads').filter(l => l.status==='fechado_ganho' && inP((l.createdAt||'').split('T')[0])).length;
    const taxaConversao   = leadsTotal > 0 ? Math.round((leadsGanhos/leadsTotal)*100) : 0;
    const projetosConcluidos = DB.getAll('projetos').filter(p => p.status==='concluido' && inP(p.prazo)).length;
    const licitacoesGanhas   = DB.getAll('licitacoes').filter(l => l.status==='ganhou' && inP(l.dataResultado)).length;
    return { receita, novosClientes, novosLeads, propostas, taxaConversao, projetosConcluidos, licitacoesGanhas };
  }

  /* ---- SVG ring de progresso ---- */
  function _ring(pct, color, size=56) {
    const r = (size/2) - 5;
    const circ = 2 * Math.PI * r;
    const dash = Math.min(pct, 100) / 100 * circ;
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
          stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
          style="transition:stroke-dasharray .6s ease"/>
      </svg>`;
  }

  /* ---- Cor por percentual ---- */
  function _color(pct) {
    if (pct >= 100) return 'var(--success,#16a34a)';
    if (pct >= 70)  return 'var(--warning,#d97706)';
    return 'var(--danger,#dc2626)';
  }
  function _badge(pct) {
    if (pct >= 100) return `<span style="font-size:10px;font-weight:700;color:var(--success);background:#f0fdf4;padding:2px 7px;border-radius:99px;">✓ Meta atingida</span>`;
    if (pct >= 70)  return `<span style="font-size:10px;font-weight:700;color:var(--warning,#d97706);background:#fefce8;padding:2px 7px;border-radius:99px;">⬆ Em progresso</span>`;
    return `<span style="font-size:10px;font-weight:700;color:var(--danger);background:#fef2f2;padding:2px 7px;border-radius:99px;">↓ Abaixo da meta</span>`;
  }

  /* ====================================================
     RENDER PRINCIPAL
     ==================================================== */
  function render() {
    const tabs = [
      { id:'painel',     label:'📊 Dashboard' },
      { id:'definir',    label:'⚙️ Definir Metas' },
      { id:'trimestres', label:'🎯 Por Trimestre' },
      { id:'servicos',   label:'🔧 Por Serviço' },
      { id:'anual',      label:'📅 Visão Anual' },
    ];
    document.getElementById('pageContent').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
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
      <div class="tabs mb-4">
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
    if (_tab === 'definir')    el.innerHTML = _renderDefinir();
    if (_tab === 'trimestres') el.innerHTML = _renderTrimestres();
    if (_tab === 'servicos')   el.innerHTML = _renderServicos();
    if (_tab === 'anual')      el.innerHTML = _renderAnual();
  }

  /* ====================================================
     ABA: DEFINIR METAS (períodos flexíveis + diluição)
     ==================================================== */
  function _renderDefinir() {
    const cfg  = PERIODOS[_defPeriodo];
    const dist = _calcularDistribuicao();
    const temValor = Object.keys(dist).length > 0 || _defCustom.some(c => c.valor);

    const fmt = (ind, v) =>
      ind.tipo === 'moeda'   ? Utils.formatCurrency(v)
    : ind.tipo === 'percent' ? v + '%'
    : Math.round(v);

    return `
      <div class="callout-info" style="background:var(--primary-light);border-left:4px solid var(--primary);border-radius:var(--radius);padding:12px 16px;margin-bottom:18px">
        <div class="text-sm"><strong>Defina no nível que fizer sentido</strong> — anual, semestral, trimestral ou mensal.
        O sistema distribui automaticamente pelos trimestres, que é como o acompanhamento é feito.</div>
      </div>

      <!-- 1. PERÍODO -->
      <div class="card mb-4">
        <div class="card-header"><div class="card-title">1️⃣ Período da meta — ${_ano}</div></div>
        <div class="card-body">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${Object.entries(PERIODOS).map(([k, p]) => `
              <button onclick="Metas.setDefPeriodo('${k}')"
                style="padding:7px 14px;border-radius:20px;font-size:12.5px;font-weight:600;cursor:pointer;transition:var(--t);
                       border:2px solid ${_defPeriodo===k?'var(--primary)':'var(--border)'};
                       background:${_defPeriodo===k?'var(--primary)':'var(--surface)'};
                       color:${_defPeriodo===k?'#fff':'var(--text)'}">${p.label}</button>`).join('')}
          </div>
          <div class="text-xs text-muted mt-2">${cfg.sub}</div>
        </div>
      </div>

      <!-- 2. MODO DE DISTRIBUIÇÃO -->
      ${cfg.trimestres.length > 1 && _defPeriodo !== 'mensal' ? `
      <div class="card mb-4">
        <div class="card-header"><div class="card-title">2️⃣ Como distribuir entre os trimestres</div></div>
        <div class="card-body">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm ${_defModo==='linear'?'btn-primary':'btn-secondary'}" onclick="Metas.setDefModo('linear')">
              ➗ Igual — mesmo valor por trimestre
            </button>
            <button class="btn btn-sm ${_defModo==='crescente'?'btn-primary':'btn-secondary'}" onclick="Metas.setDefModo('crescente')">
              📈 Crescente — sobe ao longo do ano
            </button>
          </div>
          <div class="text-xs text-muted mt-2">
            ${_defModo === 'crescente'
              ? 'Cada trimestre recebe ~15% a mais que o anterior — reflete a curva de crescimento do plano.'
              : 'O total é dividido em partes iguais entre os trimestres do período.'}
          </div>
        </div>
      </div>` : ''}

      <!-- 3. VALORES -->
      <div class="card mb-4">
        <div class="card-header">
          <div class="card-title">${cfg.trimestres.length > 1 && _defPeriodo !== 'mensal' ? '3️⃣' : '2️⃣'} Metas do período</div>
          <span class="text-xs text-muted">${_defPeriodo === 'mensal' ? 'Informe o valor de UM mês' : 'Informe o total do período'}</span>
        </div>
        <div class="card-body">
          <div class="grid-2" style="gap:12px">
            ${INDICADORES.map(ind => `
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label">${ind.icon} ${ind.label}
                  ${!ind.acumula ? '<span class="text-xs text-muted">(alvo, não soma)</span>' : ''}</label>
                <input class="form-control" type="text" inputmode="decimal"
                  value="${_defValores[ind.key] != null ? (ind.tipo === 'moeda' ? Utils.moneyToInput(_defValores[ind.key]) : _defValores[ind.key]) : ''}"
                  placeholder="${ind.tipo === 'moeda' ? '0,00' : ind.tipo === 'percent' ? '%' : '0'}"
                  oninput="Metas.setDefValor('${ind.key}', this.value)">
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- 4. METAS PERSONALIZADAS -->
      <div class="card mb-4">
        <div class="card-header">
          <div class="card-title">🎯 Metas personalizadas</div>
          <button class="btn btn-sm btn-secondary" onclick="Metas.addCustom()">+ Adicionar</button>
        </div>
        <div class="card-body">
          <div class="text-xs text-muted mb-3">Qualquer indicador do seu planejamento: artigos publicados, contratos de recorrência, conexões no LinkedIn, prospecções por semana…</div>
          ${_defCustom.length === 0
            ? '<div class="text-sm text-muted">Nenhuma meta personalizada. Clique em "+ Adicionar".</div>'
            : _defCustom.map((c, i) => `
              <div class="parcela-row">
                <input class="form-control" style="flex:2" placeholder="Nome do indicador" value="${Utils.escHtml(c.nome || '')}"
                  oninput="Metas.setCustom(${i},'nome',this.value)">
                <input class="form-control" style="flex:1" type="text" inputmode="decimal" placeholder="Meta" value="${c.valor || ''}"
                  oninput="Metas.setCustom(${i},'valor',this.value)">
                <input class="form-control" style="flex:1" placeholder="Unidade" value="${Utils.escHtml(c.unidade || '')}"
                  oninput="Metas.setCustom(${i},'unidade',this.value)">
                <button class="btn btn-xs btn-danger" onclick="Metas.removeCustom(${i})">✕</button>
              </div>`).join('')}
        </div>
      </div>

      <!-- 5. PREVIEW -->
      ${temValor ? `
      <div class="card mb-4" style="border:2px solid var(--primary)">
        <div class="card-header" style="background:var(--primary-light)">
          <div class="card-title">👁 Como vai ficar distribuído</div>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Indicador</th>${cfg.trimestres.map(q => `<th>${Q_LABELS[q]}</th>`).join('')}<th>Total ano</th></tr></thead>
            <tbody>
              ${INDICADORES.filter(ind => dist[ind.key]).map(ind => {
                const linha = cfg.trimestres.map(q => dist[ind.key][q] || 0);
                const total = ind.acumula ? linha.reduce((s,v) => s+v, 0) : (linha[0] || 0);
                return `<tr>
                  <td class="font-semibold text-sm">${ind.icon} ${ind.label}</td>
                  ${linha.map(v => `<td class="text-sm">${fmt(ind, v)}</td>`).join('')}
                  <td class="font-bold text-primary">${fmt(ind, total)}${!ind.acumula ? ' <span class="text-xs text-muted">(alvo)</span>' : ''}</td>
                </tr>`;
              }).join('')}
              ${_defCustom.filter(c => c.nome && c.valor).map(c => {
                const vals = _distribuir(Utils.parseMoney(c.valor), cfg.trimestres.length, _defModo, true);
                return `<tr>
                  <td class="font-semibold text-sm">🎯 ${Utils.escHtml(c.nome)}</td>
                  ${vals.map(v => `<td class="text-sm">${v} ${Utils.escHtml(c.unidade||'')}</td>`).join('')}
                  <td class="font-bold text-primary">${Utils.parseMoney(c.valor)} ${Utils.escHtml(c.unidade||'')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-body" style="border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-primary" onclick="Metas.salvarDefinicao()">✅ Aplicar metas em ${_ano}</button>
          <span class="text-xs text-muted">Sobrescreve apenas os indicadores preenchidos, nos trimestres do período escolhido.</span>
        </div>
      </div>` : `
      <div class="card"><div class="card-body">
        <div class="empty-state" style="padding:24px">
          <div class="empty-icon">🎯</div>
          <div class="empty-title">Preencha ao menos uma meta acima</div>
          <div class="empty-sub">A prévia da distribuição aparece aqui automaticamente.</div>
        </div>
      </div></div>`}
    `;
  }

  /* ---- Controles da aba Definir ---- */
  function setDefPeriodo(p) { _defPeriodo = p; _defAjustes = {}; _renderTab(); }
  function setDefModo(m)    { _defModo = m; _renderTab(); }

  function setDefValor(key, val) {
    const ind = INDICADORES.find(i => i.key === key);
    _defValores[key] = ind?.tipo === 'moeda' ? Utils.parseMoney(val) : (parseFloat(String(val).replace(',', '.')) || 0);
    _renderPreviewOnly();
  }

  function addCustom()   { _defCustom.push({ nome:'', valor:'', unidade:'' }); _renderTab(); }
  function removeCustom(i) { _defCustom.splice(i, 1); _renderTab(); }
  function setCustom(i, campo, val) {
    if (!_defCustom[i]) return;
    _defCustom[i][campo] = val;
    if (campo !== 'nome') _renderPreviewOnly();
  }

  // Re-renderiza só quando necessário, preservando o foco do campo em edição
  let _previewTimer = null;
  function _renderPreviewOnly() {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      const ativo = document.activeElement;
      const id = ativo?.getAttribute?.('oninput') || '';
      const pos = ativo?.selectionStart;
      _renderTab();
      if (id) {
        const novo = [...document.querySelectorAll('#metasContent input')].find(el => el.getAttribute('oninput') === id);
        if (novo) { novo.focus(); if (pos != null) novo.setSelectionRange(pos, pos); }
      }
    }, 400);
  }

  function salvarDefinicao() {
    const cfg  = PERIODOS[_defPeriodo];
    const dist = _calcularDistribuicao();
    const customValidos = _defCustom.filter(c => c.nome && c.valor);

    if (Object.keys(dist).length === 0 && customValidos.length === 0) {
      Toast.error('Preencha ao menos uma meta antes de aplicar.');
      return;
    }

    cfg.trimestres.forEach((q, idx) => {
      const existente = DB.getAll('metas').find(m => m.ano === _ano && m.trimestre === q);
      const base = existente || _metaVazia(_ano, q);
      const novo = { ...base };

      // Indicadores padrão — sobrescreve só o que foi preenchido
      Object.keys(dist).forEach(key => { novo[key] = dist[key][q]; });

      // Metas personalizadas — distribuídas do mesmo modo
      if (customValidos.length) {
        const custom = [...(base.metasCustom || [])];
        customValidos.forEach(c => {
          const vals = _distribuir(Utils.parseMoney(c.valor), cfg.trimestres.length, _defModo, true);
          const i = custom.findIndex(x => x.nome === c.nome);
          const item = { nome: c.nome, valor: vals[idx] || 0, unidade: c.unidade || '' };
          if (i >= 0) custom[i] = item; else custom.push(item);
        });
        novo.metasCustom = custom;
      }

      if (existente) DB.update('metas', existente.id, novo);
      else DB.create('metas', novo);
    });

    Toast.success(`✅ Metas aplicadas em ${cfg.label} de ${_ano}`);
    _tab = 'painel';
    render();
  }

  /* ====================================================
     PAINEL — Dashboard principal
     ==================================================== */
  function _renderPainel() {
    const qi    = _qDash;
    const meta  = _getMeta(_ano, qi);
    const real  = _realizados(_ano, qi);
    const isHoje = new Date().getFullYear() === _ano;
    const qAtual = _trimestreAtual();

    // Totais anuais
    const totMeta = { receita:0, novosClientes:0, novosLeads:0, propostas:0, projetosConcluidos:0, licitacoesGanhas:0 };
    const totReal = { receita:0, novosClientes:0, novosLeads:0, propostas:0, projetosConcluidos:0, licitacoesGanhas:0 };
    for (let q=0; q<4; q++) {
      const m = _getMeta(_ano,q), r = _realizados(_ano,q);
      Object.keys(totMeta).forEach(k => { totMeta[k]+=(m[k]||0); totReal[k]+=(r[k]||0); });
    }

    const pctReceita = meta.receita > 0 ? Math.min(Math.round((real.receita/meta.receita)*100),999) : (real.receita>0?100:0);

    // KPIs do trimestre atual
    const kpis = [
      { icon:'💰', label:'Faturamento', real:real.receita,           meta:meta.receita,           currency:true },
      { icon:'🏢', label:'Novos Clientes', real:real.novosClientes,  meta:meta.novosClientes,     currency:false },
      { icon:'💼', label:'Novos Leads',    real:real.novosLeads,     meta:meta.novosLeads,        currency:false },
      { icon:'📄', label:'Propostas',      real:real.propostas,      meta:meta.propostas,         currency:false },
      { icon:'📈', label:'Conversão',      real:real.taxaConversao,  meta:meta.taxaConversao||30, currency:false, suffix:'%' },
      { icon:'📋', label:'Projetos',       real:real.projetosConcluidos, meta:meta.projetosConcluidos, currency:false },
      { icon:'🏛', label:'Licitações',     real:real.licitacoesGanhas,   meta:meta.licitacoesGanhas,   currency:false },
    ];

    // Dados para o mini gráfico de barras Q1-Q4
    const qData = TRIMESTRES.map((lbl,q) => {
      const m = _getMeta(_ano,q), r = _realizados(_ano,q);
      return { q, lbl, meta:m.receita, real:r.real, realVal:r.receita, metaVal:m.receita };
    });
    const maxBar = Math.max(...qData.map(d => Math.max(d.realVal, d.metaVal)), 1);

    return `
      <!-- SELETOR DE TRIMESTRE -->
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
        ${Q_LABELS.map((lbl,q) => {
          const isSelected = q === qi;
          const isAtual    = q === qAtual && isHoje;
          return `<button
            onclick="Metas.setQDash(${q})"
            style="padding:6px 16px;border-radius:20px;border:2px solid ${isSelected?'var(--primary,#2563eb)':'var(--border)'};
                   background:${isSelected?'var(--primary,#2563eb)':'var(--surface)'};
                   color:${isSelected?'#fff':'var(--text)'};font-size:13px;font-weight:700;cursor:pointer;
                   transition:all .15s;position:relative;">
            ${lbl}${isAtual?'<span style="position:absolute;top:-4px;right:-4px;width:8px;height:8px;background:#22c55e;border-radius:50%;border:2px solid var(--surface)"></span>':''}
          </button>`;
        }).join('')}
        <span style="font-size:12px;color:var(--text-muted);align-self:center;margin-left:4px;">● = trimestre atual</span>
      </div>

      <!-- BANNER TRIMESTRE SELECIONADO -->
      <div style="background:linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%);border-radius:14px;padding:20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div style="min-width:0">
          <div style="color:#7a9bbf;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${isHoje && qi===qAtual?'Trimestre Atual':'Ano '+_ano} · ${TRIMESTRES[qi]}</div>
          <div style="color:#fff;font-size:clamp(20px,6vw,28px);font-weight:800;line-height:1.2;">${Utils.formatCurrency(real.receita)}</div>
          <div style="color:#7a9bbf;font-size:13px;margin-top:4px;">de ${Utils.formatCurrency(meta.receita)} · <span style="color:${pctReceita>=100?'#4ade80':pctReceita>=70?'#fbbf24':'#f87171'};font-weight:700;">${pctReceita}% da meta</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="position:relative;width:64px;height:64px;flex-shrink:0;">
            ${_ring(pctReceita, pctReceita>=100?'#4ade80':pctReceita>=70?'#fbbf24':'#f87171', 64)}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
              <span style="color:#fff;font-size:12px;font-weight:800;">${Math.min(pctReceita,999)}%</span>
            </div>
          </div>
          <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.2);white-space:nowrap" onclick="Metas.editMeta(${_ano},${qi})">✏ Editar</button>
        </div>
      </div>

      <!-- KPI CARDS -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:20px;">
        ${kpis.map(k => {
          const pct = k.meta > 0 ? Math.min(Math.round((k.real/k.meta)*100),999) : (k.real>0?100:0);
          const col = _color(pct);
          const val = k.currency ? Utils.formatCurrency(k.real) : (k.real + (k.suffix||''));
          const metaStr = k.currency ? Utils.formatCurrency(k.meta) : (k.meta + (k.suffix||''));
          return `
            <div style="background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:16px;position:relative;overflow:hidden;">
              <div style="position:absolute;top:12px;right:12px;opacity:.15;font-size:28px;line-height:1;">${k.icon}</div>
              <div style="font-size:12px;color:var(--text-muted);font-weight:600;margin-bottom:8px;">${k.icon} ${k.label}</div>
              <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:10px;">${val}</div>
              <div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:6px;">
                <div style="width:${Math.min(pct,100)}%;height:100%;background:${col};border-radius:99px;transition:width .5s ease;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:11px;color:var(--text-muted);">meta: ${metaStr}</span>
                <span style="font-size:11px;font-weight:700;color:${col};">${pct}%</span>
              </div>
            </div>`;
        }).join('')}
      </div>

      <!-- GRÁFICO DE BARRAS Q1-Q4 -->
      <div style="background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">📊 Faturamento por Trimestre</div>
          <div style="display:flex;gap:12px;font-size:11px;color:var(--text-muted);">
            <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:var(--primary,#2563eb);border-radius:2px;display:inline-block;"></span>Realizado</span>
            <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:var(--border);border-radius:2px;display:inline-block;"></span>Meta</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:end;height:120px;">
          ${qData.map(d => {
            const hMeta = maxBar > 0 ? Math.round((d.metaVal/maxBar)*100) : 0;
            const hReal = maxBar > 0 ? Math.round((d.realVal/maxBar)*100) : 0;
            const isAtual = d.q === qi && isHoje;
            const pctQ = d.metaVal > 0 ? Math.min(Math.round((d.realVal/d.metaVal)*100),999) : (d.realVal>0?100:0);
            return `
              <div style="display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;">
                <div style="font-size:10px;font-weight:700;color:${_color(pctQ)};">${pctQ}%</div>
                <div style="flex:1;width:100%;display:flex;align-items:flex-end;gap:3px;position:relative;">
                  <div style="flex:1;background:var(--border);border-radius:4px 4px 0 0;height:${hMeta}%;min-height:2px;"></div>
                  <div style="flex:1;background:${isAtual?'var(--primary,#2563eb)':'#93c5fd'};border-radius:4px 4px 0 0;height:${hReal}%;min-height:2px;transition:height .5s ease;"></div>
                </div>
                <div style="font-size:11px;font-weight:${isAtual?'800':'600'};color:${isAtual?'var(--primary)':'var(--text-muted)'};">${Q_LABELS[d.q]}${isAtual?' ●':''}</div>
                <div style="font-size:10px;color:var(--text-muted);text-align:center;">${Utils.formatCurrency(d.realVal)}</div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- RESUMO ANUAL -->
      <div style="background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px;">🏆 Totais Anuais ${_ano}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">
          ${[
            ['💰','Faturamento', totReal.receita, totMeta.receita, true],
            ['🏢','Clientes',    totReal.novosClientes, totMeta.novosClientes, false],
            ['💼','Leads',       totReal.novosLeads, totMeta.novosLeads, false],
            ['📄','Propostas',   totReal.propostas, totMeta.propostas, false],
            ['📋','Projetos',    totReal.projetosConcluidos, totMeta.projetosConcluidos, false],
            ['🏛','Licitações',  totReal.licitacoesGanhas, totMeta.licitacoesGanhas, false],
          ].map(([ic,lb,r,m,curr]) => {
            const p = m>0 ? Math.min(Math.round((r/m)*100),999) : (r>0?100:0);
            const c = _color(p);
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2,#f8fafc);border-radius:8px;border:1px solid var(--border);">
                <div style="position:relative;flex-shrink:0;">
                  ${_ring(p,c,44)}
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                    <span style="font-size:9px;font-weight:800;color:${c};">${p}%</span>
                  </div>
                </div>
                <div style="min-width:0;">
                  <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">${ic} ${lb}</div>
                  <div style="font-size:14px;font-weight:800;color:var(--text);white-space:nowrap;">${curr?Utils.formatCurrency(r):r}</div>
                  <div style="font-size:10px;color:var(--text-muted);">/ ${curr?Utils.formatCurrency(m):m}</div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      ${(meta.metasCustom||[]).length > 0 ? `
      <div style="margin-top:16px;background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px;">🎯 Metas Personalizadas — ${TRIMESTRES[qi]}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
          ${meta.metasCustom.map((c, i) => {
            const auto = _realizadoCustomAuto(c.nome, _ano, qi);
            const realizado = auto != null ? auto : (c.realizado || 0);
            const alvo = Number(c.valor) || 0;
            const p = alvo > 0 ? Math.min(Math.round((realizado / alvo) * 100), 999) : 0;
            const cor = _color(p);
            return `
              <div style="padding:10px 12px;background:var(--surface-2,#f8fafc);border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${Utils.escHtml(c.nome)}</div>
                <div style="display:flex;align-items:baseline;gap:4px;">
                  ${auto != null
                    ? `<span style="font-size:16px;font-weight:800;color:${cor};">${realizado}</span>`
                    : `<input type="number" value="${realizado}" onchange="Metas.setRealizadoCustom(${_ano},${qi},${i},this.value)"
                         style="width:52px;font-size:16px;font-weight:800;color:${cor};border:1px solid var(--border);border-radius:4px;padding:1px 4px;background:var(--surface)">`}
                  <span style="font-size:12px;color:var(--text-muted);">/ ${alvo} ${Utils.escHtml(c.unidade||'')}</span>
                </div>
                <div style="height:3px;background:var(--border);border-radius:99px;overflow:hidden;margin-top:6px;">
                  <div style="width:${Math.min(p,100)}%;height:100%;background:${cor};border-radius:99px;"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
        <div class="text-xs text-muted mt-2">${_realizadoCustomAuto(meta.metasCustom[0]?.nome, _ano, qi) != null ? '' : 'Números sem contagem automática no CRM — clique no valor para atualizar manualmente.'}</div>
      </div>` : ''}

      ${meta.observacoes ? `
        <div style="margin-top:16px;padding:14px 16px;background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;border-left:4px solid var(--primary);">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">📝 ESTRATÉGIA / OBSERVAÇÕES</div>
          <p style="font-size:13px;color:var(--text-secondary);white-space:pre-wrap;margin:0;">${Utils.escHtml(meta.observacoes)}</p>
        </div>` : ''}
    `;
  }

  /* Algumas metas personalizadas podem ser contadas automaticamente a
     partir de outros módulos do CRM. Retorna null se não houver como
     rastrear automaticamente (usuário preenche manualmente). */
  function _realizadoCustomAuto(nome, ano, trimestre) {
    if (!nome) return null;
    const n = nome.toLowerCase();
    const meses = TRIMESTRE_MESES[trimestre];
    const inicio = Utils.localDateStr(new Date(ano, meses[0], 1));
    const fim    = Utils.localDateStr(new Date(ano, meses[2]+1, 0));
    const inP = d => d && d >= inicio && d <= fim;

    if (n.includes('artigo') || n.includes('conteúdo') || n.includes('conteudo')) {
      return DB.getAll('marketing_posts').filter(p =>
        p.status === 'publicado' && (p.canal === 'Site/Blog') && inP(p.data)
      ).length;
    }
    if (n.includes('post') && (n.includes('linkedin') || n.includes('rede'))) {
      return DB.getAll('marketing_posts').filter(p =>
        p.status === 'publicado' && p.canal !== 'Site/Blog' && inP(p.data)
      ).length;
    }
    return null;
  }

  function setRealizadoCustom(ano, trimestre, idx, valor) {
    const meta = DB.getAll('metas').find(m => m.ano === ano && m.trimestre === trimestre);
    if (!meta || !meta.metasCustom || !meta.metasCustom[idx]) return;
    const custom = [...meta.metasCustom];
    custom[idx] = { ...custom[idx], realizado: Number(valor) || 0 };
    DB.update('metas', meta.id, { metasCustom: custom });
    _renderTab();
  }

  /* ====================================================
     POR TRIMESTRE
     ==================================================== */
  function _renderTrimestres() {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
        ${TRIMESTRES.map((label,qi) => {
          const meta = _getMeta(_ano,qi);
          const real = _realizados(_ano,qi);
          const isAtual = qi===_trimestreAtual() && new Date().getFullYear()===_ano;
          const pctR = meta.receita>0 ? Math.min(Math.round((real.receita/meta.receita)*100),999) : (real.receita>0?100:0);
          const col  = _color(pctR);

          const itens = [
            ['🏢','Clientes',    real.novosClientes, meta.novosClientes, false],
            ['💼','Leads',       real.novosLeads,    meta.novosLeads,    false],
            ['📄','Propostas',   real.propostas,     meta.propostas,     false],
            ['📋','Projetos',    real.projetosConcluidos, meta.projetosConcluidos, false],
            ['🏛','Licitações',  real.licitacoesGanhas,   meta.licitacoesGanhas,   false],
          ];

          return `
            <div style="background:var(--surface,#fff);border:1px solid ${isAtual?'var(--primary)':'var(--border)'};border-radius:14px;overflow:hidden;${isAtual?'box-shadow:0 0 0 2px rgba(37,99,235,.15);':''}">
              <!-- Header do card -->
              <div onclick="Metas.setTab('painel');Metas.setQDash(${qi})" style="cursor:pointer;background:${isAtual?'linear-gradient(135deg,#0a1628,#1e3a5f)':'var(--surface-2,#f8fafc)'};padding:16px;border-bottom:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                  <div>
                    <div style="font-size:12px;font-weight:700;${isAtual?'color:#7a9bbf':'color:var(--text-muted)'};text-transform:uppercase;letter-spacing:.5px;">${label}${isAtual?' · Atual':''}</div>
                    <div style="font-size:22px;font-weight:800;${isAtual?'color:#fff':'color:var(--text)'};margin-top:4px;">${Utils.formatCurrency(real.receita)}</div>
                    <div style="font-size:12px;${isAtual?'color:#7a9bbf':'color:var(--text-muted)'};margin-top:2px;">meta: ${Utils.formatCurrency(meta.receita)}</div>
                  </div>
                  <div style="position:relative;width:54px;height:54px;flex-shrink:0;">
                    ${_ring(pctR, isAtual?(pctR>=100?'#4ade80':pctR>=70?'#fbbf24':'#f87171'):col, 54)}
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                      <span style="font-size:11px;font-weight:800;color:${isAtual?'#fff':col};">${pctR}%</span>
                    </div>
                  </div>
                </div>
                <!-- Barra faturamento -->
                <div style="height:4px;background:${isAtual?'rgba(255,255,255,.2)':'var(--border)'};border-radius:99px;overflow:hidden;margin-top:10px;">
                  <div style="width:${Math.min(pctR,100)}%;height:100%;background:${isAtual?(pctR>=100?'#4ade80':pctR>=70?'#fbbf24':'#f87171'):col};border-radius:99px;transition:width .5s ease;"></div>
                </div>
              </div>
              <!-- Métricas -->
              <div style="padding:14px;display:flex;flex-direction:column;gap:8px;">
                ${itens.map(([ic,lb,r,m,curr]) => {
                  const p = m>0 ? Math.min(Math.round((r/m)*100),999) : (r>0?100:0);
                  const c2 = _color(p);
                  return `
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-size:13px;width:20px;text-align:center;">${ic}</span>
                      <div style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                          <span style="font-size:12px;color:var(--text-secondary);">${lb}</span>
                          <span style="font-size:12px;font-weight:700;color:${c2};">${r}/${m||'—'}</span>
                        </div>
                        <div style="height:3px;background:var(--border);border-radius:99px;overflow:hidden;">
                          <div style="width:${Math.min(p,100)}%;height:100%;background:${c2};border-radius:99px;"></div>
                        </div>
                      </div>
                    </div>`;
                }).join('')}
              </div>
              ${(meta.metasCustom||[]).length > 0 ? `
              <div style="padding:0 14px 10px;">
                <span class="badge badge-blue" style="font-size:10px">🎯 ${meta.metasCustom.length} meta(s) personalizada(s)</span>
              </div>` : ''}
              <div style="padding:0 14px 14px;">
                <button class="btn btn-sm btn-primary" style="width:100%;" onclick="Metas.editMeta(${_ano},${qi})">✏ Editar metas Q${qi+1}</button>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  /* ====================================================
     POR SERVIÇO
     ==================================================== */
  function _renderServicos() {
    const cfg = DB.getConfig();
    const servicos = cfg.servicos || [];

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
        ${TRIMESTRES.map((label,qi) => {
          const meta = _getMeta(_ano,qi);
          const servicosMetas = meta.servicosMetas || [];
          const isAtual = qi===_trimestreAtual() && new Date().getFullYear()===_ano;
          const totalMeta = servicosMetas.reduce((s,m)=>s+(m.valor||0),0);
          const totalQtd  = servicosMetas.reduce((s,m)=>s+(m.quantidade||0),0);

          return `
            <div style="background:var(--surface,#fff);border:1px solid ${isAtual?'var(--primary)':'var(--border)'};border-radius:14px;overflow:hidden;">
              <div style="background:${isAtual?'linear-gradient(135deg,#0a1628,#1e3a5f)':'var(--surface-2,#f8fafc)'};padding:14px 16px;border-bottom:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div style="font-size:11px;font-weight:700;${isAtual?'color:#7a9bbf':'color:var(--text-muted)'};text-transform:uppercase;">${label}${isAtual?' · Atual':''}</div>
                    <div style="font-size:18px;font-weight:800;${isAtual?'color:#fff':'color:var(--text)'};">${Utils.formatCurrency(totalMeta)}</div>
                    <div style="font-size:11px;${isAtual?'color:#7a9bbf':'color:var(--text-muted)'};">${totalQtd} serviços planejados</div>
                  </div>
                  <button class="btn btn-xs" style="${isAtual?'background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.2);':'border:1px solid var(--border);'}" onclick="Metas.editServicos(${_ano},${qi})">✏ Editar</button>
                </div>
              </div>
              <div style="padding:14px;">
                ${servicosMetas.length === 0
                  ? `<div style="text-align:center;padding:20px 0;color:var(--text-muted);font-size:13px;">🔧 Nenhuma meta de serviço definida</div>`
                  : servicosMetas.map(s => `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                        <div style="font-size:13px;font-weight:600;color:var(--text);">${Utils.escHtml(s.servico)}</div>
                        <div style="text-align:right;">
                          <div style="font-size:13px;font-weight:700;color:var(--primary);">${Utils.formatCurrency(s.valor)}</div>
                          <div style="font-size:11px;color:var(--text-muted);">${s.quantidade} unid.</div>
                        </div>
                      </div>`).join('')
                }
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  /* ====================================================
     VISÃO ANUAL
     ==================================================== */
  function _renderAnual() {
    const totMeta = { receita:0, novosClientes:0, novosLeads:0, propostas:0, projetosConcluidos:0, licitacoesGanhas:0 };
    const totReal = { receita:0, novosClientes:0, novosLeads:0, propostas:0, projetosConcluidos:0, licitacoesGanhas:0 };
    for (let q=0; q<4; q++) {
      const m=_getMeta(_ano,q), r=_realizados(_ano,q);
      Object.keys(totMeta).forEach(k => { totMeta[k]+=(m[k]||0); totReal[k]+=(r[k]||0); });
    }
    const pctAnual = totMeta.receita>0 ? Math.min(Math.round((totReal.receita/totMeta.receita)*100),999) : (totReal.receita>0?100:0);

    // Barras mensais por trimestre (faturamento)
    const qRows = TRIMESTRES.map((lbl,qi) => {
      const m=_getMeta(_ano,qi), r=_realizados(_ano,qi);
      const p = m.receita>0 ? Math.min(Math.round((r.receita/m.receita)*100),999) : (r.receita>0?100:0);
      const c = _color(p);
      const isAtual = qi===_trimestreAtual() && new Date().getFullYear()===_ano;
      return `
        <div class="metas-row-trim" style="align-items:center;gap:6px 12px;padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;font-weight:700;color:${isAtual?'var(--primary)':'var(--text)'};">${Q_LABELS[qi]}${isAtual?' ●':''}</div>
          <div class="metas-row-trim-bar">
            <div style="height:10px;background:var(--border);border-radius:99px;overflow:hidden;">
              <div style="width:${Math.min(p,100)}%;height:100%;background:${c};border-radius:99px;transition:width .5s ease;"></div>
            </div>
          </div>
          <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;">${Utils.formatCurrency(r.receita)} <span style="color:var(--text-muted);font-weight:400;">/ ${Utils.formatCurrency(m.receita)}</span></div>
          <div style="text-align:right;font-size:13px;font-weight:700;color:${c};">${p}%</div>
        </div>`;
    }).join('');

    return `
      <!-- Mega card anual -->
      <div style="background:linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%);border-radius:14px;padding:24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div style="min-width:0">
          <div style="color:#7a9bbf;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Resultado Anual ${_ano}</div>
          <div style="color:#fff;font-size:clamp(22px,7vw,32px);font-weight:800;line-height:1.2;">${Utils.formatCurrency(totReal.receita)}</div>
          <div style="color:#7a9bbf;font-size:13px;margin-top:6px;">de ${Utils.formatCurrency(totMeta.receita)} · <span style="color:${pctAnual>=100?'#4ade80':pctAnual>=70?'#fbbf24':'#f87171'};font-weight:700;">${pctAnual}% da meta anual</span></div>
          <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;">
            <span style="color:#a5c8f0;font-size:12px;">👥 ${totReal.novosClientes} clientes</span>
            <span style="color:#a5c8f0;font-size:12px;">💼 ${totReal.novosLeads} leads</span>
            <span style="color:#a5c8f0;font-size:12px;">📄 ${totReal.propostas} propostas</span>
            <span style="color:#a5c8f0;font-size:12px;">📋 ${totReal.projetosConcluidos} projetos</span>
          </div>
        </div>
        <div style="position:relative;width:90px;height:90px;flex-shrink:0;">
          ${_ring(pctAnual, pctAnual>=100?'#4ade80':pctAnual>=70?'#fbbf24':'#f87171', 90)}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <span style="color:#fff;font-size:16px;font-weight:900;">${pctAnual}%</span>
            <span style="color:#7a9bbf;font-size:9px;">anual</span>
          </div>
        </div>
      </div>

      <!-- Faturamento por trimestre (barra) -->
      <div style="background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px;">📊 Faturamento por Trimestre</div>
        ${qRows}
      </div>

      <!-- KPIs anuais com rings -->
      <div style="background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px;">🎯 KPIs Anuais</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
          ${[
            ['🏢','Novos Clientes', totReal.novosClientes, totMeta.novosClientes, false],
            ['💼','Novos Leads',    totReal.novosLeads,    totMeta.novosLeads,    false],
            ['📄','Propostas',      totReal.propostas,     totMeta.propostas,     false],
            ['📋','Projetos',       totReal.projetosConcluidos, totMeta.projetosConcluidos, false],
            ['🏛','Licitações',     totReal.licitacoesGanhas,   totMeta.licitacoesGanhas,   false],
          ].map(([ic,lb,r,m,curr]) => {
            const p = m>0 ? Math.min(Math.round((r/m)*100),999) : (r>0?100:0);
            const c = _color(p);
            return `
              <div style="background:var(--surface-2,#f8fafc);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;">
                <div style="position:relative;width:56px;height:56px;margin:0 auto 10px;">
                  ${_ring(p,c,56)}
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                    <span style="font-size:10px;font-weight:800;color:${c};">${p}%</span>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${ic} ${lb}</div>
                <div style="font-size:18px;font-weight:800;color:var(--text);">${r}</div>
                <div style="font-size:11px;color:var(--text-muted);">/ ${m}</div>
                ${_badge(p)}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  /* ====================================================
     MODAIS DE EDIÇÃO
     ==================================================== */
  function editMeta(ano, qi) {
    const meta = _getMeta(ano, qi);
    const custom = meta.metasCustom || [];
    Modal.open({
      title: `🎯 Metas — ${TRIMESTRES[qi]} / ${ano}`,
      size: 'modal-lg',
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group"><label class="form-label">💰 Faturamento (R$)</label><input class="form-control" type="number" id="mReceita" value="${meta.receita}" placeholder="0"></div>
          <div class="form-group"><label class="form-label">🏢 Novos Clientes</label><input class="form-control" type="number" id="mClientes" value="${meta.novosClientes}" placeholder="0"></div>
          <div class="form-group"><label class="form-label">💼 Novos Leads</label><input class="form-control" type="number" id="mLeads" value="${meta.novosLeads}" placeholder="0"></div>
          <div class="form-group"><label class="form-label">📄 Propostas Enviadas</label><input class="form-control" type="number" id="mPropostas" value="${meta.propostas}" placeholder="0"></div>
          <div class="form-group"><label class="form-label">📈 Taxa de Conversão (%)</label><input class="form-control" type="number" id="mConversao" value="${meta.taxaConversao}" placeholder="30"></div>
          <div class="form-group"><label class="form-label">📋 Projetos Concluídos</label><input class="form-control" type="number" id="mProjetos" value="${meta.projetosConcluidos}" placeholder="0"></div>
          <div class="form-group"><label class="form-label">🏛 Licitações Ganhas</label><input class="form-control" type="number" id="mLicitacoes" value="${meta.licitacoesGanhas}" placeholder="0"></div>
        </div>

        <div class="flex items-center justify-between mt-3 mb-2">
          <label class="form-label" style="margin:0">🎯 Metas Personalizadas</label>
          <button type="button" class="btn btn-xs btn-secondary" onclick="Metas._addCustomEdit()">+ Adicionar</button>
        </div>
        <div id="mCustomList">
          ${custom.map((c,i) => _customEditRow(c,i)).join('')}
        </div>

        <div class="form-group mt-3">
          <label class="form-label">📝 Estratégia / Observações</label>
          <textarea class="form-control" id="mObs" rows="3" placeholder="Foco principal, estratégias, pontos de atenção...">${meta.observacoes||''}</textarea>
        </div>`,
      saveCb: () => saveMeta(ano, qi, meta.id),
    });
  }

  function _customEditRow(c, i) {
    return `<div class="parcela-row mc-edit-row" data-i="${i}">
      <input class="form-control mc-nome" style="flex:2" placeholder="Nome" value="${Utils.escHtml(c.nome||'')}">
      <input class="form-control mc-valor" style="flex:1" type="text" inputmode="decimal" placeholder="Meta" value="${c.valor||''}">
      <input class="form-control mc-unidade" style="flex:1" placeholder="Unidade" value="${Utils.escHtml(c.unidade||'')}">
      <input type="hidden" class="mc-realizado" value="${c.realizado||0}">
      <button type="button" class="btn btn-xs btn-danger" onclick="this.closest('.mc-edit-row').remove()">✕</button>
    </div>`;
  }
  function _addCustomEdit() {
    const list = document.getElementById('mCustomList'); if (!list) return;
    const div = document.createElement('div');
    div.innerHTML = _customEditRow({}, list.querySelectorAll('.mc-edit-row').length);
    list.appendChild(div.firstElementChild);
  }

  function saveMeta(ano, qi, existingId) {
    const metasCustom = [...document.querySelectorAll('.mc-edit-row')].map(row => ({
      nome: row.querySelector('.mc-nome').value.trim(),
      valor: Utils.parseMoney(row.querySelector('.mc-valor').value) || Number(row.querySelector('.mc-valor').value) || 0,
      unidade: row.querySelector('.mc-unidade').value.trim(),
      realizado: Number(row.querySelector('.mc-realizado').value) || 0,
    })).filter(c => c.nome);

    const data = {
      ano, trimestre: qi,
      receita:            parseFloat(document.getElementById('mReceita')?.value)||0,
      novosClientes:      parseInt(document.getElementById('mClientes')?.value)||0,
      novosLeads:         parseInt(document.getElementById('mLeads')?.value)||0,
      propostas:          parseInt(document.getElementById('mPropostas')?.value)||0,
      taxaConversao:      parseInt(document.getElementById('mConversao')?.value)||0,
      projetosConcluidos: parseInt(document.getElementById('mProjetos')?.value)||0,
      licitacoesGanhas:   parseInt(document.getElementById('mLicitacoes')?.value)||0,
      observacoes:        document.getElementById('mObs')?.value||'',
      servicosMetas:      existingId ? (_getMeta(ano,qi).servicosMetas||[]) : [],
      metasCustom,
    };
    if (existingId) DB.update('metas', existingId, data);
    else DB.create('metas', data);
    Modal.close();
    Toast.success('Metas salvas!');
    _tab = 'painel'; _qDash = qi; _ano = ano;
    render();
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
              const ex = atual.find(m => m.servico===s)||{};
              return `<tr>
                <td style="font-weight:600;">${Utils.escHtml(s)}</td>
                <td><input class="form-control form-control-sm" type="number" id="sq_${s.replace(/\W/g,'_')}" value="${ex.quantidade||0}" min="0" style="width:80px;"></td>
                <td><input class="form-control form-control-sm" type="number" id="sv_${s.replace(/\W/g,'_')}" value="${ex.valor||0}" min="0" style="width:120px;"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`,
      saveCb: () => saveServicos(ano, qi, meta.id, servicos),
    });
  }

  function saveServicos(ano, qi, existingId, servicos) {
    const servicosMetas = servicos
      .map(s => ({ servico:s, quantidade:parseInt(document.getElementById('sq_'+s.replace(/\W/g,'_'))?.value)||0, valor:parseFloat(document.getElementById('sv_'+s.replace(/\W/g,'_'))?.value)||0 }))
      .filter(m => m.quantidade>0||m.valor>0);
    const existingMeta = _getMeta(ano,qi);
    const data = { ...existingMeta, servicosMetas };
    if (existingId) DB.update('metas', existingId, data);
    else DB.create('metas', { ...data, ano, trimestre:qi });
    Modal.close();
    Toast.success('Metas de serviços salvas!');
    _renderTab();
  }

  function setTab(tab)   { _tab = tab; _renderTab(); }
  function setAno(ano)   { _ano = ano; render(); }
  function setQDash(q)   { _qDash = q; if (_tab === 'painel') _renderTab(); }
  function addNew()      { editMeta(_ano, _trimestreAtual()); }

  return { render, setTab, setAno, setQDash, addNew, editMeta, saveMeta, editServicos, saveServicos,
           setDefPeriodo, setDefModo, setDefValor, addCustom, removeCustom, setCustom, salvarDefinicao,
           setRealizadoCustom, _addCustomEdit };
})();
