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
      servicosMetas:[], observacoes:'' };
  }

  /* ---- Cálculo de realizados ---- */
  function _realizados(ano, trimestre) {
    const meses = TRIMESTRE_MESES[trimestre];
    const inicio = new Date(ano, meses[0], 1).toISOString().split('T')[0];
    const fim    = new Date(ano, meses[2]+1, 0).toISOString().split('T')[0];
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
      <div style="background:linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%);border-radius:14px;padding:22px 24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="color:#7a9bbf;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${isHoje && qi===qAtual?'Trimestre Atual':'Ano '+_ano} · ${TRIMESTRES[qi]}</div>
          <div style="color:#fff;font-size:28px;font-weight:800;line-height:1;">${Utils.formatCurrency(real.receita)}</div>
          <div style="color:#7a9bbf;font-size:13px;margin-top:4px;">de ${Utils.formatCurrency(meta.receita)} · <span style="color:${pctReceita>=100?'#4ade80':pctReceita>=70?'#fbbf24':'#f87171'};font-weight:700;">${pctReceita}% da meta</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="position:relative;width:80px;height:80px;flex-shrink:0;">
            ${_ring(pctReceita, pctReceita>=100?'#4ade80':pctReceita>=70?'#fbbf24':'#f87171', 80)}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
              <span style="color:#fff;font-size:14px;font-weight:800;">${Math.min(pctReceita,999)}%</span>
            </div>
          </div>
          <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.2);" onclick="Metas.editMeta(${_ano},${qi})">✏ Editar metas</button>
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

      ${meta.observacoes ? `
        <div style="margin-top:16px;padding:14px 16px;background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;border-left:4px solid var(--primary);">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">📝 ESTRATÉGIA / OBSERVAÇÕES</div>
          <p style="font-size:13px;color:var(--text-secondary);white-space:pre-wrap;margin:0;">${Utils.escHtml(meta.observacoes)}</p>
        </div>` : ''}
    `;
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
        <div style="display:grid;grid-template-columns:80px 1fr 130px 60px;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;font-weight:700;color:${isAtual?'var(--primary)':'var(--text)'};">${Q_LABELS[qi]}${isAtual?' ●':''}</div>
          <div>
            <div style="height:10px;background:var(--border);border-radius:99px;overflow:hidden;">
              <div style="width:${Math.min(p,100)}%;height:100%;background:${c};border-radius:99px;transition:width .5s ease;"></div>
            </div>
          </div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${Utils.formatCurrency(r.receita)} <span style="color:var(--text-muted);font-weight:400;">/ ${Utils.formatCurrency(m.receita)}</span></div>
          <div style="text-align:right;font-size:13px;font-weight:700;color:${c};">${p}%</div>
        </div>`;
    }).join('');

    return `
      <!-- Mega card anual -->
      <div style="background:linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%);border-radius:14px;padding:24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="color:#7a9bbf;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Resultado Anual ${_ano}</div>
          <div style="color:#fff;font-size:32px;font-weight:800;line-height:1;">${Utils.formatCurrency(totReal.receita)}</div>
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
        <div class="form-group mt-3">
          <label class="form-label">📝 Estratégia / Observações</label>
          <textarea class="form-control" id="mObs" rows="3" placeholder="Foco principal, estratégias, pontos de atenção...">${meta.observacoes||''}</textarea>
        </div>`,
      onSave: () => saveMeta(ano, qi, meta.id),
    });
  }

  function saveMeta(ano, qi, existingId) {
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
              const ex = atual.find(m => m.servico===s)||{};
              return `<tr>
                <td style="font-weight:600;">${Utils.escHtml(s)}</td>
                <td><input class="form-control form-control-sm" type="number" id="sq_${s.replace(/\W/g,'_')}" value="${ex.quantidade||0}" min="0" style="width:80px;"></td>
                <td><input class="form-control form-control-sm" type="number" id="sv_${s.replace(/\W/g,'_')}" value="${ex.valor||0}" min="0" style="width:120px;"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`,
      onSave: () => saveServicos(ano, qi, meta.id, servicos),
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

  return { render, setTab, setAno, setQDash, addNew, editMeta, saveMeta, editServicos, saveServicos };
})();
