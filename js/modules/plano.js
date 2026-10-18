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

  /* ---- Parâmetros financeiros do plano v3.0 ----
     O v2 afirmava break-even de R$ 13.912, número que dividia o custo fixo
     pelo imposto e ignorava o custo direto de executar o serviço. Os valores
     abaixo já consideram a retenção líquida real por tipo de serviço. */
  const CAIXA = {
    reserva:          25000, // reserva de operação intocável
    gatilhoAlerta:    15000, // saldo mínimo → prospecção intensiva
    midiaProtegida:    3800, // mídia R$ 3.000 + agência R$ 800
    custoFixo:        25683, // custo fixo mensal a partir de set/26
    beSobrevivencia:  44000, // sem retiradas dos sócios — uso emergencial
    breakEven:        68000, // pleno, no mix atual (retenção ~49%)
    beAlvo:           52000, // pleno, no mix-alvo 2027 (retenção ~60%)
    comprometimento:    0.6, // máx. da receita prevista antes de receber
    gapSetembro:      70000, // material da Continental a bancar
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
    const farol = saldo >= CAIXA.reserva
      ? { cor:'#1E7A34', bg:'#EAF4EC', lb:'VERDE',    txt:'Reserva intacta. Operação normal, pode investir no plano.' }
      : saldo >= CAIXA.gatilhoAlerta
      ? { cor:'#B26A00', bg:'#FFF4E5', lb:'AMARELO',  txt:'Atenção. Suspender gasto não contratado e priorizar cobrança.' }
      : { cor:'#C42B2B', bg:'#FBEDED', lb:'VERMELHO', txt:'Prospecção intensiva vira prioridade única da semana, para todo mundo.' };

    const pctBE = Math.round((fatMes / CAIXA.breakEven) * 100);

    return `
      <div class="card mb-4" style="border-left:5px solid ${farol.cor};background:${farol.bg}">
        <div class="card-body" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.6px;color:${farol.cor}">BARRA DE CAIXA · ${farol.lb}</div>
            <div style="font-size:28px;font-weight:800;color:${farol.cor};line-height:1.1;margin-top:2px">${Utils.formatCurrency(saldo)}</div>
          </div>
          <div style="flex:1;min-width:240px;font-size:13px;color:#3D4653">
            ${farol.txt}<br>
            <span class="text-xs text-muted">Reserva intocável: ${Utils.formatCurrency(CAIXA.reserva)} · gatilho de alerta: ${Utils.formatCurrency(CAIXA.gatilhoAlerta)}</span>
          </div>
        </div>
      </div>

      <div class="fin-kpi mb-4">
        <div class="fin-kpi-cell">
          <div class="fin-kpi-label">Break-even pleno</div>
          <div class="fin-kpi-val">${Utils.formatCurrency(CAIXA.breakEven)}</div>
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
          <div class="fk-sub">${fixas.length} itens · plano prevê ${Utils.formatCurrency(CAIXA.custoFixo)}</div>
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
                <tr><td class="text-sm font-semibold">Até 25/ago sem R$ 40.000 contratados para setembro</td>
                    <td class="text-sm">Acionar o empréstimo com credor. Checar antes se é o mesmo credor do cheque em aberto.</td></tr>
                <tr><td class="text-sm font-semibold">Saldo abaixo de ${Utils.formatCurrency(CAIXA.gatilhoAlerta)}</td>
                    <td class="text-sm">Prospecção intensiva vira prioridade única. Suspender investimento não contratado.</td></tr>
                <tr><td class="text-sm font-semibold">Custo por lead acima de R$ 350 por 2 semanas</td>
                    <td class="text-sm">Pausar a campanha e revisar palavras-chave e página de destino com a agência.</td></tr>
                <tr><td class="text-sm font-semibold">Proposta parada há mais de 7 dias</td>
                    <td class="text-sm">Ligação direta ao decisor. Em 15 dias sem retorno, perdido com motivo registrado.</td></tr>
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
                <tr><td class="text-sm font-semibold">Curto · 90 dias</td><td class="font-bold">R$ 70k/mês</td>
                    <td class="text-sm">Gap coberto, habilitado a licitar, 42 artigos publicados</td></tr>
                <tr><td class="text-sm font-semibold">Médio · 12 meses</td><td class="font-bold">R$ 1,05 M</td>
                    <td class="text-sm">1º contrato público, 6 contratos de recorrência, fiscal quitado</td></tr>
                <tr><td class="text-sm font-semibold">Longo · 3 anos</td><td class="font-bold">R$ 3,0 M</td>
                    <td class="text-sm">2º responsável técnico e recorrência acima de 20% da receita</td></tr>
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
            Faturamento e resultado não são a mesma coisa. O contrato de <strong>R$ 167 mil</strong> com a Continental deixa
            cerca de <strong>R$ 40 mil</strong> na Bikows depois do material e da divisão com o parceiro. Um serviço de
            R$ 60 mil executado diretamente rende mais que isso.
            <br><br>
            Por isso a meta de 2027 não é apenas crescer faturamento, é <strong>mudar o mix</strong>: aumentar a participação
            de serviço executado pela própria Bikows de cerca de 40% para 70% do total. Faturar mais em parceria não resolve o caixa.
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
    const OKRS = [
      { o: 'O1 — Sair da zona de risco de caixa e atingir o break-even pleno', cor: '#C42B2B',
        krs: ['Fechar o gap de caixa de setembro (R$ 50 a 70 mil) sem comprometer a reserva',
              'Faturamento de dez/26 igual ou acima de R$ 70.000, com média móvel de 3 meses acima de R$ 60.000',
              'Parcelamento fiscal aderido até 30/set/26, liberando as certidões negativas'] },
      { o: 'O2 — Deixar de ser uma empresa de um operador só', cor: '#1D4F8C',
        krs: ['Rotina semanal fixa cumprida em pelo menos 80% das semanas do trimestre',
              'Sócia-Gestora assumindo 100% do CRM, do follow-up e dos recebíveis até out/26',
              'Caldeireiro-Comercial gerando pelo menos 4 propostas por mês por outbound até nov/26'] },
      { o: 'O3 — Reduzir a dependência do tráfego pago', cor: '#2E6FBF',
        krs: ['Participação do tráfego pago na originação caindo de 95% para 60% até dez/26',
              '42 artigos em rascunho publicados até out/26 e 3 leads orgânicos por mês até dez/26',
              'Canal de licitações habilitado até out/26 e primeira proposta submetida até nov/26'] },
      { o: 'O4 — Criar a primeira receita previsível da história da empresa', cor: '#1E7A34',
        krs: ['3 contratos de Manutenção de Conformidade assinados até dez/26',
              'Base de clientes NR-13 mapeada com data de vencimento de inspeção até set/26',
              '3 SKUs de produto fabricado definidos, precificados e com primeira venda até nov/26'] },
    ];

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

      <div class="card mb-4">
        <div class="card-header"><div>
          <div class="card-title">⚖️ Os três patamares de equilíbrio</div>
          <div class="text-xs text-muted">O plano v2 afirmava R$ 13.912, número que ignorava o custo direto de executar o serviço</div>
        </div></div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Patamar</th><th>Faturamento necessário</th><th>Significado</th></tr></thead>
            <tbody>
              <tr><td class="font-semibold text-sm">Sobrevivência</td>
                  <td class="font-bold" style="color:#B26A00">${Utils.formatCurrency(CAIXA.beSobrevivencia)}</td>
                  <td class="text-sm">Sem retiradas dos sócios. Cobre estrutura, equipe, mídia e dívida. Uso apenas emergencial.</td></tr>
              <tr><td class="font-semibold text-sm">Pleno, no mix atual</td>
                  <td class="font-bold text-danger">${Utils.formatCurrency(CAIXA.breakEven)}</td>
                  <td class="text-sm">Cobre tudo, inclusive as retiradas. É o número real de hoje (retenção líquida ~49%).</td></tr>
              <tr><td class="font-semibold text-sm">Pleno, no mix-alvo 2027</td>
                  <td class="font-bold text-success">${Utils.formatCurrency(CAIXA.beAlvo)}</td>
                  <td class="text-sm">Mesmo custo fixo, com menos dependência de parceria e material repassado (retenção ~60%).</td></tr>
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
              <tr><td class="font-semibold text-sm">Reserva de operação</td>
                  <td class="font-bold">${Utils.formatCurrency(CAIXA.reserva)}</td>
                  <td class="text-sm">Intocável, mantida em conta separada</td></tr>
              <tr><td class="font-semibold text-sm">Gatilho de alerta</td>
                  <td class="font-bold text-danger">${Utils.formatCurrency(CAIXA.gatilhoAlerta)}</td>
                  <td class="text-sm">Saldo mínimo — abaixo disso, prospecção intensiva</td></tr>
              <tr><td class="font-semibold text-sm">Verba de mídia protegida</td>
                  <td class="font-bold">${Utils.formatCurrency(CAIXA.midiaProtegida)}</td>
                  <td class="text-sm">Mídia R$ 3.000 + agência R$ 800. Intocável enquanto o custo por lead estiver na meta</td></tr>
              <tr><td class="font-semibold text-sm">Limite de comprometimento</td>
                  <td class="font-bold">${Math.round(CAIXA.comprometimento*100)}%</td>
                  <td class="text-sm">Máximo da receita prevista que pode ser comprometido antes de receber</td></tr>
              <tr><td class="font-semibold text-sm">Sinal em contratos grandes</td>
                  <td class="font-bold">30% a 40%</td>
                  <td class="text-sm">Obrigatório acima de R$ 30.000. Contratos sem entrada foram a origem do aperto atual</td></tr>
              <tr><td class="font-semibold text-sm">Gap de setembro (Continental)</td>
                  <td class="font-bold text-danger">${Utils.formatCurrency(CAIXA.gapSetembro)}</td>
                  <td class="text-sm">Material a bancar até o início de setembro, com retorno só em out/nov</td></tr>
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
    const ACOES = [
      // ---- Fase 1: dias 1–30 (ago–set/26) — Estancar o risco ----
      [1, 'Financeiro', 'Fechar o gap de caixa da Continental (venda extra e, se necessário, credor)', 'Marcos', 'Crítico', 'Material de setembro coberto sem tocar na reserva de R$ 25.000'],
      [1, 'Financeiro', 'Aderir ao parcelamento fiscal (entrada de R$ 6.000)', 'Marcos', 'Crítico', 'Certidões negativas liberadas e canal de licitações destravado'],
      [1, 'Financeiro', 'Negociar prazo estendido do cheque com o credor', 'Marcos', 'Alto', 'Vencimento alinhado ao recebimento da Continental, sem juros novos'],
      [1, 'Marketing',  'Subir as 3 campanhas e aportar a verba de 2 meses', 'Sócia-Gestora', 'Crítico', 'NR-12 PR, NR-12 SP e NR-13 PR/SP rodando com 60 dias garantidos'],
      [1, 'Equipe',     'Implantar a rotina semanal fixa e a reunião de segunda', 'Marcos', 'Alto', 'Agenda previsível e reunião de 30 min recorrente no calendário'],
      [1, 'Equipe',     'Escrever e acordar as metas semanais do Caldeireiro-Comercial', 'Marcos', 'Alto', '40 contatos, 8 conversas e 3 reuniões por semana acordados por escrito'],
      [1, 'Comercial',  'Reativar o pipeline e fechar o serviço de R$ 54.000 em negociação', 'Marcos', 'Crítico', 'Contrato assinado, de preferência parcelado para gerar renda fixa'],
      [1, 'Comercial',  'Mapear a base NR-13 com vencimentos de inspeção', 'Sócia-Gestora', 'Alto', 'Planilha com todos os clientes e a data da próxima inspeção obrigatória'],
      // ---- Fase 2: dias 31–60 (out/26) — Construir os canais ----
      [2, 'Marca',      'Aplicar a identidade v1.0 em proposta, laudo, e-mail e redes', 'Sócia-Gestora', 'Alto', 'Todo material que o cliente vê com a marca oficial aplicada'],
      [2, 'Conteúdo',   'Publicar os 42 artigos em rascunho', 'Sócia-Gestora', 'Alto', 'Estoque editorial zerado, no ritmo de 4 publicações por semana'],
      [2, 'Licitação',  'Emitir todas as certidões e cadastrar nos portais', 'Marcos', 'Crítico', 'Habilitação completa: SICAF, BLL, BNC e portais municipais'],
      [2, 'Automação',  'Subir os fluxos n8n de captura de lead e régua de follow-up', 'Marcos', 'Médio', 'Lead respondido em até 5 min e alerta de proposta parada em 3 dias'],
      [2, 'Produto',    'Definir e precificar 3 SKUs de proteção NR-12', 'Caldeireiro-Comercial', 'Médio', 'Catálogo inicial precificado com margem acima de 35% já com frete'],
      [2, 'Comercial',  'Apresentar a primeira proposta de Contrato de Manutenção de Conformidade', 'Marcos', 'Alto', '10 clientes com vencimento mais próximo abordados'],
      // ---- Fase 3: dias 61–90 (nov/26) — Acelerar e medir ----
      [3, 'Licitação',  'Submeter a primeira proposta em processo licitatório', 'Marcos e Arquiteto', 'Alto', 'Primeira disputa pública da história da empresa'],
      [3, 'Marketing',  'Avaliar o CPL das 3 campanhas e decidir a quarta (NR-12 SC)', 'Sócia-Gestora', 'Médio', 'Decisão de expansão baseada em custo por lead abaixo de R$ 250'],
      [3, 'Produto',    'Realizar a primeira venda online de produto fabricado', 'Caldeireiro-Comercial', 'Médio', 'Primeira receita vinda de produto, e não de serviço'],
      [3, 'Recorrência','Fechar os 2 primeiros contratos de recorrência', 'Marcos', 'Alto', 'Primeira receita previsível contratada da história da empresa'],
      [3, 'Gestão',     'Revisão trimestral e decisão sobre renovar o contrato do Caldeireiro-Comercial', 'Marcos', 'Crítico', 'Decisão por número: 40 reuniões, 12 propostas, R$ 30.000 fechados e 20 peças'],
      [3, 'Financeiro', 'Preparar a posição para o acordo judicial de dezembro', 'Marcos', 'Alto', 'Provisão de cerca de R$ 40.000 e estratégia definida antes do julgamento'],
    ];

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
