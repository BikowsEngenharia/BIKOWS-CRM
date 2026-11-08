/* ==========================================
   PLANO DE NEGÓCIOS — execução do plano estratégico
   Resumo, ações do Plano 90 Dias, OKRs e saúde de caixa.
   Fonte: Plano de Negócios Bikows 2026–2029 v3.0 (agosto/2026)
   ========================================== */
const Plano = (() => {

  let _tab = 'resumo'; // resumo | acoes | okrs | caixa

  const FASES = {
    1: { label: 'Fase 1 · Dias 1–30',  sub: 'Estancar o risco',    per: 'ago–set/26', cor: '#C42B2B' },
    2: { label: 'Fase 2 · Dias 31–60', sub: 'Construir os canais', per: 'out/26',     cor: '#1D4F8C' },
    3: { label: 'Fase 3 · Dias 61–90', sub: 'Acelerar e medir',    per: 'nov/26',     cor: '#1E7A34' },
  };

  const STATUS = {
    pendente:   { label: 'Pendente',    badge: 'badge-gray'   },
    andamento:  { label: 'Em andamento',badge: 'badge-blue'   },
    concluida:  { label: 'Concluída',   badge: 'badge-green'  },
  };

  const CRITICIDADE = {
    'Crítico': 'badge-red',
    'Alto':    'badge-yellow',
    'Médio':   'badge-gray',
  };

  /* ---- Conteúdo do plano ----
     Nada de número, meta, margem ou negociação mora neste arquivo: ele é
     servido publicamente pelo GitHub Pages. Tudo vem da configuração, que
     fica no banco e só é lida por usuário autorizado. Sem a configuração,
     a tela desenha vazia em vez de expor um valor de reserva no código. */
  const PLANO_VAZIO = {
    caixa: {}, gatilhos: [], metas: [], patamares: [], regras: [],
    okrs: [], acoes: [], margemTexto: '', notaBreakEvenV2: '',
  };
  function _plano() {
    const p = (typeof DB !== 'undefined' && DB.getConfig && DB.getConfig().plano) || {};
    return { ...PLANO_VAZIO, ...p };
  }
  function _caixa() { return _plano().caixa || {}; }
  /* Sem configuracao, mostra travessao em vez de R$ NaN. */
  function _moeda(v) { return v == null ? '—' : Utils.formatCurrency(v); }
  /* Valor da tabela: pode ser uma chave de caixa, um texto literal marcado
     ou o limite de comprometimento em porcentagem. */
  function _valorTabela(v) {
    const c = _caixa();
    if (typeof v !== 'string') return '—';
    if (v.startsWith('__TEXTO:')) return Utils.escHtml(v.slice(8, -2));
    if (v === '__PCT_COMPROMETIMENTO__') {
      return c.comprometimento != null ? Math.round(c.comprometimento * 100) + '%' : '—';
    }
    return c[v] != null ? Utils.formatCurrency(c[v]) : '—';
  }
  function _semConfig(oQue) {
    return `<tr><td colspan="3" class="text-sm text-muted" style="text-align:center;padding:14px">
      ${oQue} não configurado. Cadastre em Configurações para esta tela se preencher.</td></tr>`;
  }


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
            <div style="color:#8FA0B5;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Plano 90 Dias · ago–nov/2026</div>
            <div style="color:#fff;font-size:26px;font-weight:800;line-height:1.1;margin-top:4px">${feitas} de ${total} ações concluídas</div>
            <div style="color:#8FA0B5;font-size:12.5px;margin-top:4px">Execução do Plano de Negócios 2026–2029 v3.0</div>
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
        ${[['resumo','📌 Resumo do Plano'],['acoes','✅ Plano 90 Dias'],['okrs','🎯 OKRs set–dez/2026'],['caixa','💰 Saúde de Caixa']]
          .map(([id,lb]) => `<button class="tab-btn ${_tab===id?'active':''}" onclick="Plano.setTab('${id}')">${lb}</button>`).join('')}
      </div>
      <div id="planoContent"></div>`;

    _renderTab();
  }

  function setTab(t) { _tab = t; render(); }

  function _renderTab() {
    const el = document.getElementById('planoContent');
    if (!el) return;
    if (_tab === 'resumo') el.innerHTML = _renderResumo();
    if (_tab === 'acoes')  el.innerHTML = _renderAcoes();
    if (_tab === 'okrs')   el.innerHTML = _renderOKRs();
    if (_tab === 'caixa')  el.innerHTML = _renderCaixa();
  }

  /* ====================================================
     ABA: RESUMO DO PLANO — os números que governam decisão
     ==================================================== */
  function _renderResumo() {
    const lanc   = DB.getAll('lancamentos');
    const entrou = lanc.filter(l => l.tipo==='receita' && l.status==='recebido').reduce((s,l)=>s+(l.valor||0),0);
    const saiu   = lanc.filter(l => l.tipo==='despesa' && l.status==='pago').reduce((s,l)=>s+(l.valor||0),0);
    const saldo  = entrou - saiu;

    const mes    = Utils.todayStr().substring(0,7);
    const fatMes = lanc.filter(l => l.tipo==='receita' && l.status==='recebido' && (l.data||'').startsWith(mes))
                       .reduce((s,l)=>s+(l.valor||0),0);

    const acoes    = DB.getAll('plano_acoes');
    const criticas = acoes.filter(a => a.criticidade==='Crítico' && a.status!=='concluida');
    const atrasadas= acoes.filter(a => a.status!=='concluida' && a.prazo && Utils.isOverdue(a.prazo));

    const dividas  = DB.getAll('dividas');
    const totalDiv = dividas.reduce((s,d)=>s+(d.valor_restante||0),0);

    const fixas    = DB.getAll('despesas_fixas').filter(d => d.ativo!==false);
    const totalFix = fixas.reduce((s,d)=>s+(d.valor||0),0);

    const recorrentes = DB.getAll('contratos').filter(c => (c.tipo||'').toLowerCase().includes('recorr')).length;

    // farol de caixa
    const farol = saldo >= _caixa().reserva
      ? { cor:'#1E7A34', bg:'#EAF4EC', lb:'VERDE',    txt:'Reserva intacta. Operação normal, pode investir no plano.' }
      : saldo >= _caixa().gatilhoAlerta
      ? { cor:'#B26A00', bg:'#FFF4E5', lb:'AMARELO',  txt:'Atenção. Suspender gasto não contratado e priorizar cobrança.' }
      : { cor:'#C42B2B', bg:'#FBEDED', lb:'VERMELHO', txt:'Prospecção intensiva vira prioridade única da semana, para todo mundo.' };

    const pctBE = _caixa().breakEven ? Math.round((fatMes / _caixa().breakEven) * 100) : 0;

    return `
      <div class="card mb-4" style="border-left:5px solid ${farol.cor};background:${farol.bg}">
        <div class="card-body" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.6px;color:${farol.cor}">BARRA DE CAIXA · ${farol.lb}</div>
            <div style="font-size:28px;font-weight:800;color:${farol.cor};line-height:1.1;margin-top:2px">${Utils.formatCurrency(saldo)}</div>
          </div>
          <div style="flex:1;min-width:240px;font-size:13px;color:#3D4653">
            ${farol.txt}<br>
            <span class="text-xs text-muted">Reserva intocável: ${Utils.formatCurrency(_caixa().reserva)} · gatilho de alerta: ${Utils.formatCurrency(_caixa().gatilhoAlerta)}</span>
          </div>
        </div>
      </div>

      <div class="fin-kpi mb-4">
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Break-even pleno</div>
          <div class="fin-kpi-val">${Utils.formatCurrency(_caixa().breakEven)}</div>
          <div class="fk-sub">por mês, no mix atual de serviços</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Faturamento do mês</div>
          <div class="fin-kpi-val ${pctBE>=100?'text-success':'text-warning'}">${Utils.formatCurrency(fatMes)}</div>
          <div class="fk-sub">${pctBE}% do break-even pleno</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Custo fixo mensal</div>
          <div class="fin-kpi-val">${Utils.formatCurrency(totalFix)}</div>
          <div class="fk-sub">${fixas.length} itens · plano prevê ${Utils.formatCurrency(_caixa().custoFixo)}</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Dívidas provisionadas</div>
          <div class="fin-kpi-val text-danger">${Utils.formatCurrency(totalDiv)}</div>
          <div class="fk-sub">${dividas.length} dívidas mapeadas</div>
        </div>
      </div>

      ${criticas.length ? `
      <div class="card mb-4">
        <div class="card-header" style="border-left:4px solid #C42B2B">
          <div><div class="card-title">🚨 Ações críticas em aberto</div>
          <div class="text-xs text-muted">Sustentam o caixa e liberam os canais novos. Não podem escorregar de fase.</div></div>
          <span class="badge badge-red">${criticas.length}</span>
        </div>
        <div class="card-body" style="padding:0">
          ${criticas.map(a => `
            <div style="display:flex;gap:12px;align-items:flex-start;padding:11px 16px;border-bottom:1px solid var(--border)">
              <span style="color:#C42B2B;font-weight:700;flex-shrink:0">▪</span>
              <div style="flex:1;min-width:0">
                <div class="text-sm font-semibold">${Utils.escHtml(a.acao||'')}</div>
                <div class="text-xs text-muted" style="margin-top:3px">
                  ${a.apoio?`⚙ ${Utils.escHtml(a.apoio)}`:''}
                  ${a.prazo?` · <span class="${Utils.isOverdue(a.prazo)?'text-danger font-bold':''}">📅 ${Utils.formatDate(a.prazo)}</span>`:''}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${atrasadas.length ? `
      <div class="card mb-4" style="border-left:4px solid var(--danger);background:var(--danger-light)">
        <div class="card-body">
          <div class="font-bold" style="color:var(--danger);margin-bottom:4px">⏰ ${atrasadas.length} ação(ões) com prazo vencido</div>
          <div class="text-sm">${atrasadas.map(a=>Utils.escHtml(a.acao)).join(' · ')}</div>
        </div>
      </div>` : ''}

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-header"><div class="card-title">🎯 Os 4 gatilhos automáticos</div></div>
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Se acontecer isto</th><th>Faça isto, sem discussão</th></tr></thead>
              <tbody>
                ${_plano().gatilhos.length ? _plano().gatilhos.map(([se, faca]) => {
                  const cond = se === '__SALDO_ABAIXO__'
                    ? 'Saldo abaixo de ' + (_caixa().gatilhoAlerta != null ? Utils.formatCurrency(_caixa().gatilhoAlerta) : '—')
                    : Utils.escHtml(se);
                  return `<tr><td class="text-sm font-semibold">${cond}</td>
                    <td class="text-sm">${Utils.escHtml(faca)}</td></tr>`;
                }).join('') : `<tr><td colspan="2" class="text-sm text-muted" style="text-align:center;padding:14px">Gatilhos não configurados.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">📊 Onde a empresa precisa chegar</div></div>
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Horizonte</th><th>Meta</th><th>Marco</th></tr></thead>
              <tbody>
                ${_plano().metas.map(([horizonte, meta, marco]) => `
                  <tr><td class="text-sm font-semibold">${Utils.escHtml(horizonte)}</td>
                      <td class="font-bold">${Utils.escHtml(meta)}</td>
                      <td class="text-sm">${Utils.escHtml(marco)}</td></tr>`).join('')}
                <tr><td class="text-sm font-semibold">Recorrência hoje</td><td class="font-bold ${recorrentes>0?'text-success':'text-danger'}">${recorrentes}</td>
                    <td class="text-sm">Meta: 3 contratos até dez/26. Maior ponto cego da empresa.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">📚 A descoberta que muda a estratégia</div></div>
        <div class="card-body">
          <div class="text-sm" style="line-height:1.6">
            ${_plano().margemTexto || '<span class="text-muted">Texto não configurado.</span>'}
          </div>
          <div class="text-xs text-muted" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
            Documento completo: Plano de Negócios v3.0 (Word), Manual de Execução Setorial, apresentação e dashboard navegável,
            em <code style="font-size:11px">01 - Plano de Negocios</code>.
          </div>
        </div>
      </div>`;
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
          <div class="empty-sub">Carregue as 20 ações das 3 fases do Plano de Negócios 2026–2029 v3.0 e acompanhe a execução aqui.</div>
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
              <div class="card-title">${cfg.label} · ${cfg.sub}</div>
              <div class="text-xs text-muted">${cfg.per}</div>
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
                      ${a.criticidade && !done ? `<span class="badge ${CRITICIDADE[a.criticidade]||'badge-gray'}" style="font-size:10px">${Utils.escHtml(a.criticidade)}</span>` : ''}
                      ${a.area ? `<span class="text-xs text-muted">${Utils.escHtml(a.area)}</span>` : ''}
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
    const OKRS = _plano().okrs;

    const RITUAIS = [
      ['Reunião semanal da equipe',    'Segunda, início do dia',      '30 min', 'Resultado da semana, pipeline e ações vencidas, metas de cada posição'],
      ['Fechamento financeiro',        'Sexta, fim do dia',           '20 min', 'Recebimentos, contas a vencer, saldo vs. reserva, alerta de gatilho'],
      ['Revisão mensal',               'Primeira segunda do mês',     '90 min', 'DRE, progresso dos OKRs, custo por lead por canal, decisões do mês'],
      ['Revisão trimestral',           'Último dia útil do trimestre','3 h',    'OKRs, preços, decisões estruturais e revisão dos documentos do plano'],
    ];

    return `
      <div class="grid-2 mb-4">
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
            <thead><tr><th>Ritual</th><th>Quando</th><th>Duração</th><th>Pauta</th></tr></thead>
            <tbody>
              ${RITUAIS.map(([r,q,d,p]) => `<tr>
                <td class="font-semibold text-sm">${r}</td>
                <td class="text-sm text-muted">${q}</td>
                <td class="text-sm text-muted">${d}</td>
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
    const pctBE = _caixa().breakEven ? Math.round((fatMes / _caixa().breakEven) * 100) : 0;

    const alerta = saldo < _caixa().gatilhoAlerta;
    const temReserva = saldo >= _caixa().reserva;

    return `
      ${alerta ? `
      <div class="card mb-4" style="border-left:4px solid var(--danger);background:var(--danger-light)">
        <div class="card-body">
          <div class="font-bold" style="color:var(--danger);margin-bottom:4px">🚨 Gatilho de alerta acionado</div>
          <div class="text-sm">O saldo está abaixo de ${Utils.formatCurrency(_caixa().gatilhoAlerta)}, o piso definido no plano de contingência.
          Ação prevista: <strong>prospecção intensiva</strong> e revisão dos compromissos do mês.</div>
        </div>
      </div>` : ''}

      <div class="fin-kpi" style="grid-template-columns:repeat(2,1fr)">
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Saldo estimado</div>
          <div class="fin-kpi-val ${saldo>=_caixa().gatilhoAlerta?'text-success':'text-danger'}">${Utils.formatCurrency(saldo)}</div>
          <div class="fk-sub">Receitas recebidas − despesas pagas</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Faturamento do mês</div>
          <div class="fin-kpi-val ${pctBE>=100?'text-success':'text-warning'}">${Utils.formatCurrency(fatMes)}</div>
          <div class="fk-sub">${pctBE}% do break-even (${Utils.formatCurrency(_caixa().breakEven)})</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Reserva de operação</div>
          <div class="fin-kpi-val ${temReserva?'text-success':'text-warning'}">${Utils.formatCurrency(_caixa().reserva)}</div>
          <div class="fk-sub">${temReserva ? '✓ Saldo cobre a reserva' : 'Meta a constituir — conta separada'}</div>
        </div>
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Custos fixos mensais</div>
          <div class="fin-kpi-val">${Utils.formatCurrency(_caixa().custoFixo)}</div>
          <div class="fk-sub">Cadastrados em Financeiro → Despesas Fixas</div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><div>
          <div class="card-title">⚖️ Os três patamares de equilíbrio</div>
          <div class="text-xs text-muted">${Utils.escHtml(_plano().notaBreakEvenV2 || '')}</div>
        </div></div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Patamar</th><th>Faturamento necessário</th><th>Significado</th></tr></thead>
            <tbody>
              ${_plano().patamares.length ? _plano().patamares.map(([rotulo, chave, cls, desc]) => {
                const estilo = cls.startsWith('#') ? ` style="color:${cls}"` : '';
                const classe = cls.startsWith('#') ? '' : ' ' + cls;
                return `<tr><td class="font-semibold text-sm">${Utils.escHtml(rotulo)}</td>
                  <td class="font-bold${classe}"${estilo}>${_valorTabela(chave)}</td>
                  <td class="text-sm">${Utils.escHtml(desc)}</td></tr>`;
              }).join('') : _semConfig('Patamares de equilíbrio')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">🛡 Plano de contingência financeira</div></div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Regra</th><th>Parâmetro</th><th>O que significa</th></tr></thead>
            <tbody>
              ${_plano().regras.length ? _plano().regras.map(([rotulo, chave, cls, desc]) => `
                <tr><td class="font-semibold text-sm">${Utils.escHtml(rotulo)}</td>
                    <td class="font-bold${cls ? ' ' + cls : ''}">${_valorTabela(chave)}</td>
                    <td class="text-sm">${Utils.escHtml(desc)}</td></tr>`).join('') : _semConfig('Regras de contingência')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ====================================================
     CARGA INICIAL — 20 ações do Plano 90 Dias v3.0
     ==================================================== */
  function carregarPlano90() {
    if (DB.getAll('plano_acoes').length > 0) {
      Toast.warning('O plano já foi carregado.');
      return;
    }

    // Prazos: fase 1 = +30d, fase 2 = +60d, fase 3 = +90d a partir de hoje
    const prazoDe = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return Utils.localDateStr(d); };

    // [fase, área, ação, responsável, criticidade, resultado esperado]
    const ACOES = _plano().acoes;

    ACOES.forEach(([fase, area, acao, apoio, criticidade, resultado], i) => {
      DB.create('plano_acoes', {
        fase, area, acao, apoio, criticidade, resultado,
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
