/* ==========================================
   FOLHA — RH e Folha de Pagamento
   ========================================== */
const Folha = (() => {

  let _tab = 'funcionarios';
  let _mesFolha = new Date().toISOString().slice(0, 7); // YYYY-MM
  let _holeriteFuncId = null;
  let _holeirteRef = null;

  /* ── tabelas tributárias 2024/2025 ── */
  const INSS_FAIXAS = [
    { ate: 1412.00,  aliq: 0.075 },
    { ate: 2666.68,  aliq: 0.09  },
    { ate: 4000.03,  aliq: 0.12  },
    { ate: 7786.02,  aliq: 0.14  },
  ];
  const IRRF_FAIXAS = [
    { ate: 2259.20,  aliq: 0,      deducao: 0       },
    { ate: 2826.65,  aliq: 0.075,  deducao: 169.44  },
    { ate: 3751.05,  aliq: 0.15,   deducao: 381.44  },
    { ate: 4664.68,  aliq: 0.225,  deducao: 662.77  },
    { ate: Infinity, aliq: 0.275,  deducao: 896.00  },
  ];
  const DEDUCAO_DEP_IRRF = 189.59;
  const FGTS_ALIQ = 0.08;

  function calcINSS(salario) {
    let inss = 0;
    let base = salario;
    let anterior = 0;
    for (const f of INSS_FAIXAS) {
      if (base <= 0) break;
      const faixa = Math.min(salario, f.ate) - anterior;
      inss += Math.max(0, faixa) * f.aliq;
      anterior = f.ate;
      if (salario <= f.ate) break;
    }
    return Math.round(inss * 100) / 100;
  }

  function calcIRRF(salarioBruto, inss, dependentes = 0) {
    const baseCalculo = salarioBruto - inss - (dependentes * DEDUCAO_DEP_IRRF);
    if (baseCalculo <= 0) return 0;
    for (const f of IRRF_FAIXAS) {
      if (baseCalculo <= f.ate) {
        const irrf = baseCalculo * f.aliq - f.deducao;
        return Math.max(0, Math.round(irrf * 100) / 100);
      }
    }
    return 0;
  }

  function calcFGTS(salario) {
    return Math.round(salario * FGTS_ALIQ * 100) / 100;
  }

  // Descontos de folha (INSS, IRRF) e FGTS são exclusivos do vínculo CLT.
  // Sócio = retirada / distribuição de lucros: valor cheio, sem desconto.
  // PJ, Autônomo e Parceria recebem por NF/RPA — o líquido é o valor
  // contratado, sem retenção aqui. Estágio: bolsa isenta.
  function _ehCLT(func) {
    return (func.regimeContratacao || 'CLT') === 'CLT';
  }
  // Mantido com o nome antigo para não quebrar as chamadas existentes
  function _temFGTS(func) { return _ehCLT(func); }

  /* O calculo de uma folha.

     Com `mes`, ele puxa os lancamentos da ficha da pessoa daquela competencia
     (vale, desconto, bonus, comissao, hora extra, reembolso) e o liquido ja
     sai acertado. Sem `mes`, devolve a folha "de cadastro", que e a estimativa
     de quanto a pessoa custa num mes comum.

     `bruto` continua sendo so a remuneracao do cadastro, de proposito: o custo
     de pessoal do mes soma a folha MAIS os lancamentos de custo, e inchar o
     bruto aqui contaria o mesmo bonus duas vezes no resultado. O que o
     lancamento muda e o LIQUIDO, que e o que a pessoa recebe. */
  function calcFolhaFuncionario(func, mes) {
    const bruto = (func.salarioBase || 0)
      + (func.vt || 0)
      + (func.vr || 0)
      + (func.outrosAdicionais || 0);
    const clt = _ehCLT(func);
    const inss = clt ? calcINSS(func.salarioBase || 0) : 0;
    const irrf = clt ? calcIRRF(func.salarioBase || 0, inss, func.dependentes || 0) : 0;
    const fgts = clt ? calcFGTS(func.salarioBase || 0) : 0;
    const planoSaude = func.planoSaude || 0;
    const totalDescontos = inss + irrf + planoSaude;
    const ef = (mes && typeof FinNucleo !== 'undefined' && FinNucleo.efeitoNaFolha)
      ? FinNucleo.efeitoNaFolha(func.id, mes)
      : { itens: [], totalProventos: 0, totalDescontos: 0, nAtrasados: 0 };
    const liquido = Math.round(
      (bruto + ef.totalProventos - totalDescontos - ef.totalDescontos) * 100) / 100;
    return {
      bruto, inss, irrf, fgts, planoSaude, totalDescontos,
      proventosLanc: ef.totalProventos,
      descontosLanc: ef.totalDescontos,
      itensLanc: ef.itens,
      liquido,
    };
  }

  /* Rotulo curto do que os lancamentos fizeram com uma folha. */
  function _resumoLanc(r) {
    const mais = Number(r.proventosLanc) || 0;
    const menos = Number(r.descontosLanc) || 0;
    if (!mais && !menos) return '<span class="text-muted">—</span>';
    const detalhe = (r.itensLanc || []).map(i =>
      (i.desconta ? '- ' : '+ ') + i.descricao + ' ' + Utils.formatCurrency(i.valor)).join(' | ');
    const partes = [];
    if (mais) partes.push(`<span style="color:var(--success)">+${Utils.formatCurrency(mais)}</span>`);
    if (menos) partes.push(`<span style="color:var(--danger)">−${Utils.formatCurrency(menos)}</span>`);
    return `<span class="text-sm" title="${Utils.escHtml(detalhe)}">${partes.join(' ')}</span>`;
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function render() {
    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">RH / Folha de Pagamento</h2>
      </div>
      <div class="fin-tabs" id="folhaTabs">
        ${['funcionarios','custo','folha','holerite','historico'].map(t => `
          <button class="fin-tab ${_tab === t ? 'active' : ''}" onclick="Folha.setTab('${t}')">
            ${{ funcionarios:'👥 Funcionários', custo:'⏱ Base de custo', folha:'📋 Folha Mensal', holerite:'🧾 Holerite', historico:'📊 Histórico' }[t]}
          </button>
        `).join('')}
      </div>
      <div id="folhaTabContent"></div>
    `;
    renderTab();
  }

  function setTab(t) { _tab = t; render(); }

  function renderTab() {
    const el = document.getElementById('folhaTabContent');
    if (!el) return;
    const map = {
      funcionarios: buildFuncionarios,
      custo: buildBaseCusto,
      folha: buildFolhaMensal,
      holerite: buildHolerite,
      historico: buildHistorico,
    };
    el.innerHTML = (map[_tab] || buildFuncionarios)();
  }

  /* =========================================================
     TAB 1 — FUNCIONÁRIOS
  ========================================================= */
  function buildFuncionarios() {
    const funcs = DB.getAll('funcionarios').filter(f => f.ativo !== false);
    const demitidos = DB.getAll('funcionarios').filter(f => f.ativo === false);

    const totalBruto = funcs.reduce((s, f) => s + (f.salarioBase || 0), 0);
    const totalFGTS  = funcs.reduce((s, f) => s + (_temFGTS(f) ? calcFGTS(f.salarioBase || 0) : 0), 0);
    /* Custo real: remuneracao e salario bruto nao sao a mesma coisa que custo.
       Encargos, provisoes e vales entram, e e esse numero que o orcamento usa. */
    const totalCusto = (typeof CustoHora !== 'undefined')
      ? funcs.reduce((s, f) => s + CustoHora.custoMensal(f).total, 0) : totalBruto;
    const horasEq = (typeof CustoHora !== 'undefined') ? CustoHora.horasProdutivasEquipe() : 0;

    return `
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:20px">
        <div class="kpi-card" style="--kpi-color:#1a56db"><div class="kpi-label">Funcionários Ativos</div><div class="kpi-value">${funcs.length}</div><div class="kpi-icon">👥</div></div>
        <div class="kpi-card" style="--kpi-color:#059669"><div class="kpi-label">Folha Bruta Mensal</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalBruto)}</div><div class="kpi-icon">💰</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b"><div class="kpi-label">FGTS Mensal</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalFGTS)}</div><div class="kpi-icon">🏦</div></div>
        <div class="kpi-card" style="--kpi-color:#C42B2B;cursor:pointer" title="Remuneracao + encargos + beneficios. Clique para abrir a base de custo." onclick="Folha.setTab('custo')"><div class="kpi-label">Custo Real da Equipe</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalCusto)}</div><div class="kpi-sub">com encargos e benefícios</div><div class="kpi-icon">💰</div></div>
        <div class="kpi-card" style="--kpi-color:#1D4F8C;cursor:pointer" onclick="Folha.setTab('custo')"><div class="kpi-label">Horas Produtivas</div><div class="kpi-value" style="font-size:18px">${horasEq.toLocaleString('pt-BR')} h</div><div class="kpi-sub">base de rateio por mês</div><div class="kpi-icon">⏱</div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="font-bold">Equipe Ativa (${funcs.length})</span>
          <button class="btn btn-primary btn-sm" onclick="Folha.openFormFunc()">+ Novo Funcionário</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:16px">
          ${funcs.map(f => funcCard(f)).join('') || '<div class="text-muted p-4">Nenhum funcionário ativo.</div>'}
        </div>
      </div>

      ${demitidos.length > 0 ? `
      <div class="card mt-4">
        <div class="card-header"><span class="font-bold text-muted">Desligados (${demitidos.length})</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:16px;opacity:.6">
          ${demitidos.map(f => funcCard(f)).join('')}
        </div>
      </div>` : ''}
    `;
  }

  function _previewAvatarFunc(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { Toast.error('Arquivo muito grande (máx 5MB)'); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        const scale = Math.min(MAX / img.width, MAX / img.height);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        const preview = document.getElementById('avatarPreviewFunc');
        if (preview) preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover">`;
        let hidden = document.getElementById('ffAvatarData');
        if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = 'ffAvatarData'; preview.parentNode.appendChild(hidden); }
        hidden.value = base64;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function funcCard(f) {
    /* O liquido do mes escolhido, nao o do cadastro: se a pessoa pegou vale,
       o cartao dela ja mostra quanto ela recebe de verdade. */
    const calc = calcFolhaFuncionario(f, _mesFolha);
    const ch = (typeof CustoHora !== 'undefined' && (Number(f.salarioBase) || 0) > 0)
      ? CustoHora.custoHoraCheio(f) : null;
    const pr = (typeof CustoHora !== 'undefined' && ch != null) ? CustoHora.precoHora(f) : null;
    const pv = pr && pr.valor != null ? pr.valor : null;
    const ini = (f.nome || '?').charAt(0).toUpperCase();
    const cores = ['#2563eb','#059669','#d97706','#7c3aed','#db2777','#0891b2'];
    const cor = cores[(f.nome || '').charCodeAt(0) % cores.length];
    const avatarContent = f.avatar
      ? `<img src="${f.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-full)">`
      : ini;
    return `
      <div class="func-card">
        <div class="func-avatar" style="background:${f.avatar ? 'transparent' : cor};overflow:hidden">${avatarContent}</div>
        <div class="func-info">
          <div class="func-name">${Utils.escHtml(f.nome)}</div>
          <div class="func-role">${Utils.escHtml(f.cargo || '—')}</div>
          <div class="func-dept">${Utils.escHtml(f.departamento || '')}${f.departamento && f.regimeContratacao ? ' · ' : ''}${Utils.escHtml(f.regimeContratacao || '')}</div>
          <div class="func-salary">Salário Base: <strong>${Utils.formatCurrency(f.salarioBase)}</strong></div>
          <div class="func-salary" style="color:var(--success)">Líquido: <strong>${Utils.formatCurrency(calc.liquido)}</strong></div>
          ${(calc.descontosLanc || calc.proventosLanc) ? `<div class="func-salary text-xs" style="color:var(--text-muted)">${calc.proventosLanc ? '+' + Utils.formatCurrency(calc.proventosLanc) + ' em extras' : ''}${calc.proventosLanc && calc.descontosLanc ? ' · ' : ''}${calc.descontosLanc ? '−' + Utils.formatCurrency(calc.descontosLanc) + ' em vale/desconto' : ''}</div>` : ''}
          ${ch != null ? `<div class="func-salary" style="color:var(--info-txt)">Custo/hora: <strong>${Utils.formatCurrency(ch)}</strong>${pv != null ? ` · venda ${Utils.formatCurrency(pv)}` : ''}</div>` : ''}
        </div>
        <div class="func-actions">
          <button class="btn btn-xs btn-primary" onclick="Folha.verFunc('${f.id}')">Abrir ficha</button>
          <button class="btn btn-xs btn-secondary" onclick="Folha.imprimirHolerite('${f.id}','${_mesFolha}')" title="Imprimir Holerite">🖨 Holerite</button>
          <button class="btn btn-xs btn-secondary" onclick="Folha.openFormFunc('${f.id}')">✏</button>
          ${f.ativo !== false
            ? `<button class="btn btn-xs btn-warning" onclick="Folha.toggleAtivo('${f.id}', false)" title="Desligar — mantém histórico">Desligar</button>`
            : `<button class="btn btn-xs btn-success" onclick="Folha.toggleAtivo('${f.id}', true)" title="Reativar funcionário">Reativar</button>`
          }
          <button class="btn btn-xs btn-danger" onclick="Folha.deleteFunc('${f.id}')" title="Excluir permanentemente do sistema">🗑</button>
        </div>
      </div>
    `;
  }

  /* =========================================================
     TAB — BASE DE CUSTO
     O banco de informação para precificar: quanto custa a hora de cada
     pessoa e por quanto ela precisa ser vendida. É daqui que o orçamento
     tira o preço, em vez de sair de memória.
  ========================================================= */
  function buildBaseCusto() {
    if (typeof CustoHora === 'undefined') {
      return '<div class="card"><div class="card-body text-muted">Módulo de custo/hora não carregado.</div></div>';
    }
    const b = CustoHora.baseDeCusto();
    const p = b.params;

    const avisoPadrao = !p.configurado ? `
      <div class="ficha-aviso">
        Jornada de ${p.jornada} h, ocupação de ${Math.round(p.ocupacao * 100)}% e encargos por regime estão nos
        valores padrão do sistema. Confira com o seu contador e ajuste em Configurações → Precificação:
        todo preço de hora sai desses três parâmetros.
      </div>` : '';

    const avisoMargem = b.margem.valor == null ? `
      <div class="ficha-aviso">
        Nenhuma margem definida e nenhum serviço com custo lançado, então o sistema não tem como sugerir preço de
        venda. Defina a margem desejada em Configurações → Precificação, ou lance custo em pelo menos um serviço
        para o cálculo passar a usar a margem que a carteira entrega de verdade.
      </div>` : '';

    const semBase = b.pessoas.filter(x => x.semBase);

    return `
      ${avisoPadrao}${avisoMargem}
      <div class="funil-kpis">
        <div class="kpi"><div class="kpi-rot">Custo de pessoal</div><div class="kpi-val">${Utils.formatCurrency(b.custoPessoalMensal)}</div><div class="kpi-sub">por mês, com encargos e benefícios</div></div>
        <div class="kpi"><div class="kpi-rot">Estrutura</div><div class="kpi-val">${Utils.formatCurrency(b.estrutura.total)}</div><div class="kpi-sub">fixas + despesas do mês</div></div>
        <div class="kpi"><div class="kpi-rot">Horas produtivas</div><div class="kpi-val">${b.horasEquipe.toLocaleString('pt-BR')} h</div><div class="kpi-sub">da equipe, por mês</div></div>
        <div class="kpi"><div class="kpi-rot">Estrutura por hora</div><div class="kpi-val">${Utils.formatCurrency(b.custoIndiretoHora)}</div><div class="kpi-sub">que toda hora tem de pagar</div></div>
        <div class="kpi" style="--kc:var(--ok-txt)"><div class="kpi-rot">Margem em uso</div><div class="kpi-val">${b.margem.valor != null ? Math.round(b.margem.valor * 100) + '%' : '—'}</div><div class="kpi-sub">${Utils.escHtml(b.margem.fonte)}</div></div>
      </div>

      ${semBase.length ? `<div class="ficha-aviso">${semBase.length} pessoa(s) sem valor de referência: ${Utils.escHtml(semBase.map(x => x.nome).join(', '))}. Sem isso elas não entram em nenhum orçamento por hora.</div>` : ''}

      <div class="card">
        <div class="card-header">
          <div class="card-title">Custo e preço da hora, por pessoa</div>
          <span class="text-xs text-muted">clique no nome para abrir a ficha</span>
        </div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr>
            <th>Pessoa</th><th>Regime</th><th>Custo mensal</th><th>Horas/mês</th>
            <th>Custo/h direto</th><th>Custo/h cheio</th><th>Preço/h simples</th><th>Preço/h crítica</th>
          </tr></thead>
          <tbody>${b.pessoas.map(x => {
            const pc = CustoHora.precoHora(x.funcionario, { complexidade: 'critica' });
            return `<tr>
              <td><a href="javascript:void(0)" onclick="FuncionarioFicha.abrir('${x.id}')" class="font-semibold">${Utils.escHtml(x.nome)}</a>
                  <div class="text-xs text-muted">${Utils.escHtml(x.cargo || '—')}</div></td>
              <td class="text-xs">${Utils.escHtml(x.regime)}</td>
              <td>${x.semBase ? '<span class="text-xs text-muted">sem base</span>' : Utils.formatCurrency(x.custoMensal)}</td>
              <td class="text-sm">${x.horas} h</td>
              <td>${x.semBase ? '—' : Utils.formatCurrency(x.custoHoraDireto)}</td>
              <td class="font-semibold">${x.semBase ? '—' : Utils.formatCurrency(x.custoHoraCheio)}</td>
              <td class="font-bold" style="color:var(--ok-txt)">${x.preco.valor != null ? Utils.formatCurrency(x.preco.valor) : '—'}</td>
              <td class="font-bold">${pc.valor != null ? Utils.formatCurrency(pc.valor) : '—'}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="8" class="text-muted p-3">Nenhuma pessoa ativa cadastrada.</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="grid-2 mt-4">
        <div class="card">
          <div class="card-header"><div class="card-title">Como o preço é calculado</div></div>
          <div class="card-body">
            <div class="calc-passos">
              <div class="calc-passo"><span class="calc-n">1</span><div><strong>Custo da pessoa</strong><div class="text-xs text-muted">remuneração + encargos do regime + vales + custos lançados na ficha</div></div></div>
              <div class="calc-passo"><span class="calc-n">2</span><div><strong>÷ horas produtivas</strong><div class="text-xs text-muted">jornada × ocupação técnica. O resto da jornada é proposta, deslocamento e administrativo: hora paga que não se fatura</div></div></div>
              <div class="calc-passo"><span class="calc-n">3</span><div><strong>+ estrutura rateada</strong><div class="text-xs text-muted">${Utils.formatCurrency(b.estrutura.total)} ÷ ${b.horasEquipe.toLocaleString('pt-BR')} h = ${Utils.formatCurrency(b.custoIndiretoHora)} por hora</div></div></div>
              <div class="calc-passo"><span class="calc-n">4</span><div><strong>× complexidade</strong><div class="text-xs text-muted">de 1,00 a 1,60 conforme a responsabilidade técnica do trabalho</div></div></div>
              <div class="calc-passo"><span class="calc-n">5</span><div><strong>÷ (1 − margem − imposto)</strong><div class="text-xs text-muted">margem e imposto incidem sobre o preço. Quem quer 30% e multiplica o custo por 1,30 termina com 23%</div></div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Fatores de complexidade</div></div>
          <div class="card-body" style="padding:0">
            <table class="tbl"><thead><tr><th>Nível</th><th>Fator</th><th>Quando usar</th></tr></thead>
            <tbody>${b.complexidades.map(c => `<tr>
              <td class="font-semibold">${Utils.escHtml(c.label)}</td>
              <td>${c.fator.toFixed(2)}</td>
              <td class="text-xs text-muted">${Utils.escHtml(c.descricao)}</td>
            </tr>`).join('')}</tbody></table>
          </div>
        </div>
      </div>`;
  }

  /* =========================================================
     TAB 2 — FOLHA MENSAL
  ========================================================= */
  function buildFolhaMensal() {
    const funcs = DB.getAll('funcionarios').filter(f => f.ativo !== false);
    const folhaRecords = DB.getAll('folha').filter(r => r.mes === _mesFolha);
    const jaGerada = folhaRecords.length > 0;

    /* O que a ficha de cada pessoa tem lancado e ainda vai bater nesta folha.
       Mostrado ANTES de gerar, para ninguem gerar folha cheia sem lembrar do
       vale que entregou dia 20. */
    const pendentes = [];
    if (!jaGerada && typeof FinNucleo !== 'undefined' && FinNucleo.efeitoNaFolha) {
      funcs.forEach(f => {
        const ef = FinNucleo.efeitoNaFolha(f.id, _mesFolha);
        if (ef.itens.length) pendentes.push({ f, ef });
      });
    }

    const totalBruto   = folhaRecords.reduce((s, r) => s + (r.bruto || 0), 0);
    const totalINSS    = folhaRecords.reduce((s, r) => s + (r.inss || 0), 0);
    const totalIRRF    = folhaRecords.reduce((s, r) => s + (r.irrf || 0), 0);
    const totalFGTS    = folhaRecords.reduce((s, r) => s + (r.fgts || 0), 0);
    const totalLiquido = folhaRecords.reduce((s, r) => s + (r.liquido || 0), 0);
    const totalPago    = folhaRecords.filter(r => r.pago).length;

    const mesLabel = new Date(_mesFolha + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    return `
      <div class="card">
        <div class="card-header" style="align-items:center;gap:16px;flex-wrap:wrap">
          <div class="flex items-center gap-2">
            <label class="form-label mb-0">Competência:</label>
            <input type="month" class="form-control" style="width:180px" value="${_mesFolha}" onchange="Folha.setMes(this.value)">
          </div>
          <div class="flex gap-2 ml-auto">
            ${!jaGerada ? `<button class="btn btn-primary btn-sm" onclick="Folha.gerarFolha()">⚡ Gerar Folha de ${mesLabel}</button>` : ''}
            ${jaGerada ? `<button class="btn btn-success btn-sm" onclick="Folha.marcarTodosPagos('${_mesFolha}')">✅ Marcar Todos como Pagos</button>` : ''}
            ${jaGerada ? `<button class="btn btn-danger btn-sm" onclick="Folha.excluirFolha('${_mesFolha}')">🗑 Excluir Folha</button>` : ''}
          </div>
        </div>

        ${jaGerada ? `
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0;border-top:1px solid var(--border)">
          <div class="fin-kpi-cell"><div class="fin-kpi-label">Folha Bruta</div><div class="fin-kpi-val">${Utils.formatCurrency(totalBruto)}</div></div>
          <div class="fin-kpi-cell"><div class="fin-kpi-label">INSS Empregado</div><div class="fin-kpi-val text-danger">${Utils.formatCurrency(totalINSS)}</div></div>
          <div class="fin-kpi-cell"><div class="fin-kpi-label">IRRF</div><div class="fin-kpi-val text-danger">${Utils.formatCurrency(totalIRRF)}</div></div>
          <div class="fin-kpi-cell"><div class="fin-kpi-label">FGTS (encargo)</div><div class="fin-kpi-val text-warning">${Utils.formatCurrency(totalFGTS)}</div></div>
          <div class="fin-kpi-cell"><div class="fin-kpi-label">Líquido Total</div><div class="fin-kpi-val text-success">${Utils.formatCurrency(totalLiquido)}</div><div class="fin-kpi-sub">já com vales e extras da ficha</div></div>
        </div>

        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Funcionário</th><th>Cargo</th><th>Salário Base</th><th>Adicionais</th><th>Bruto</th><th>INSS</th><th>IRRF</th><th>FGTS</th><th title="Vale, desconto, bônus e comissão lançados na ficha da pessoa">Lançamentos</th><th>Líquido</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${folhaRecords.map(r => {
                const f = DB.get('funcionarios', r.funcionarioId) || {};
                return `<tr>
                  <td class="font-bold text-sm">${Utils.escHtml(r.nome || f.nome || '—')}</td>
                  <td class="text-xs text-muted">${Utils.escHtml(r.cargo || f.cargo || '—')}</td>
                  <td>${Utils.formatCurrency(r.salarioBase)}</td>
                  <td class="text-sm text-muted">${Utils.formatCurrency((r.vt||0)+(r.vr||0)+(r.outrosAdicionais||0))}</td>
                  <td class="font-bold">${Utils.formatCurrency(r.bruto)}</td>
                  <td class="text-danger text-sm">${Utils.formatCurrency(r.inss)}</td>
                  <td class="text-danger text-sm">${Utils.formatCurrency(r.irrf)}</td>
                  <td class="text-warning text-sm">${Utils.formatCurrency(r.fgts)}</td>
                  <td>${_resumoLanc(r)}</td>
                  <td class="font-bold text-success">${Utils.formatCurrency(r.liquido)}</td>
                  <td>${r.pago ? '<span class="badge badge-green">Pago</span>' : '<span class="badge badge-yellow">Pendente</span>'}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-secondary" onclick="Folha.verHolerite('${r.funcionarioId}','${_mesFolha}')">🧾 Holerite</button>
                      ${!r.pago ? `<button class="btn btn-xs btn-success" onclick="Folha.marcarPago('${r.id}')">✅ Pago</button>` : ''}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="p-3 text-xs text-muted" style="border-top:1px solid var(--border)">
          ${totalPago}/${folhaRecords.length} funcionários pagos · Custo total empresa: ${Utils.formatCurrency(totalBruto + totalFGTS)} (inclui FGTS patronal)
        </div>
        ` : `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">Folha não gerada para ${mesLabel}</div>
          <div class="empty-sub">Clique em "Gerar Folha" para calcular automaticamente com base nos dados dos funcionários.
            O que estiver lançado na ficha de cada pessoa entra junto, já descontado.</div>
          <button class="btn btn-primary mt-4" onclick="Folha.gerarFolha()">⚡ Gerar Folha de ${mesLabel}</button>
        </div>
        `}
      </div>

      ${pendentes.length ? `
      <div class="card mt-4">
        <div class="card-header">
          <div class="card-title">Já lançado na ficha e ainda não acertado</div>
          <span class="text-sm text-muted">entra automaticamente ao gerar a folha</span>
        </div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Pessoa</th><th>Lançamento</th><th>Competência</th><th class="text-right">Valor</th><th></th></tr></thead>
          <tbody>${pendentes.map(x => x.ef.itens.map(i => `<tr>
            <td class="font-semibold text-sm">${Utils.escHtml(x.f.nome || '—')}</td>
            <td class="text-sm">${i.icone} ${Utils.escHtml(Utils.truncate(i.descricao, 34))}</td>
            <td class="text-xs ${i.atrasado ? 'text-danger' : 'text-muted'}">${Utils.escHtml(i.competencia)}${i.atrasado ? ' · atrasado' : ''}</td>
            <td class="text-right font-bold" style="color:${i.desconta ? 'var(--danger)' : 'var(--success)'}">${i.desconta ? '−' : '+'}${Utils.formatCurrency(i.valor)}</td>
            <td><button class="btn btn-xs btn-ghost" onclick="Folha.verFunc('${x.f.id}')">Ver ficha</button></td>
          </tr>`).join('')).join('')}</tbody>
        </table></div>
      </div>` : ''}
    `;
  }

  /* =========================================================
     TAB 3 — HOLERITE
  ========================================================= */
  function buildHolerite() {
    const funcs = DB.getAll('funcionarios').filter(f => f.ativo !== false);
    const mesesDisp = [...new Set(DB.getAll('folha').map(r => r.mes))].sort().reverse();

    const funcId   = _holeriteFuncId || (funcs[0]?.id || null);
    const mesRef   = _holeirteRef    || (mesesDisp[0] || _mesFolha);
    const funcSel  = DB.get('funcionarios', funcId);
    const folhaRec = DB.getAll('folha').find(r => r.funcionarioId === funcId && r.mes === mesRef);
    const cfg      = DB.getConfig();

    const funcOpts = funcs.map(f => `<option value="${f.id}" ${funcId===f.id?'selected':''}>${Utils.escHtml(f.nome)} — ${Utils.escHtml(f.cargo||'')}</option>`).join('');
    const mesOpts  = mesesDisp.map(m => {
      const label = new Date(m + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return `<option value="${m}" ${mesRef===m?'selected':''}>${label}</option>`;
    }).join('');

    const mesLabel = mesRef ? new Date(mesRef + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—';

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header" style="gap:16px;flex-wrap:wrap">
          <div class="flex items-center gap-2">
            <label class="form-label mb-0">Funcionário:</label>
            <select class="form-control" style="width:280px;max-width:100%;flex:1 1 200px" onchange="Folha.setHoleirteFunc(this.value)">${funcOpts}</select>
          </div>
          <div class="flex items-center gap-2">
            <label class="form-label mb-0">Competência:</label>
            <select class="form-control" style="width:200px" onchange="Folha.setHoleitreRef(this.value)">${mesOpts || `<option value="${_mesFolha}">${mesLabel}</option>`}</select>
          </div>
          ${folhaRec ? `<button class="btn btn-secondary btn-sm ml-auto" onclick="window.print()">🖨 Imprimir</button>` : ''}
        </div>
      </div>

      ${folhaRec && funcSel ? renderHoleriteDoc(funcSel, folhaRec, cfg, mesLabel) : `
        <div class="empty-state">
          <div class="empty-icon">🧾</div>
          <div class="empty-title">Holerite não disponível</div>
          <div class="empty-sub">Selecione um funcionário e gere a folha do mês na aba "Folha Mensal".</div>
        </div>
      `}
    `;
  }

  /* Vale e desconto no holerite: a pessoa precisa ver por que recebeu menos.
     Um recibo que esconde o adiantamento vira discussao no mes seguinte. */
  function _linhasDescontoLanc(r) {
    return (r.itensLanc || []).filter(i => i.desconta).map(i =>
      `<div class="holerite-row"><span>${Utils.escHtml(i.descricao)}${i.competencia && i.competencia !== r.mes ? ' <span style="font-size:11px;color:#94a3b8">(ref. ' + Utils.escHtml(i.competencia) + ')</span>' : ''}</span><span class="holerite-debit">${Utils.formatCurrency(i.valor)}</span></div>`).join('');
  }

  function renderHoleriteDoc(f, r, cfg, mesLabel) {
    const ini = (f.nome || '?').charAt(0).toUpperCase();
    return `
      <div class="holerite-wrap">
        <div class="holerite-header">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--primary)">${Utils.escHtml(cfg.empresa || 'Empresa')}</div>
            <div style="font-size:13px;color:#64748b">CNPJ: ${Utils.escHtml(cfg.cnpj || '—')} · ${Utils.escHtml(cfg.cidade || '')}${cfg.estado ? '/' + cfg.estado : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:15px;font-weight:700">RECIBO DE PAGAMENTO</div>
            <div style="font-size:13px;color:#64748b">Competência: ${mesLabel}</div>
            ${r.pago ? '<div style="font-size:12px;color:#059669;font-weight:600;margin-top:4px">✓ PAGO</div>' : ''}
          </div>
        </div>

        <div class="holerite-section">
          <div class="holerite-section-title">Dados do Funcionário</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div><div class="holerite-label">Nome</div><div class="holerite-val">${Utils.escHtml(f.nome)}</div></div>
            <div><div class="holerite-label">Cargo</div><div class="holerite-val">${Utils.escHtml(f.cargo || '—')}</div></div>
            <div><div class="holerite-label">Departamento</div><div class="holerite-val">${Utils.escHtml(f.departamento || '—')}</div></div>
            <div><div class="holerite-label">CPF</div><div class="holerite-val">${Utils.escHtml(f.cpf || '—')}</div></div>
            <div><div class="holerite-label">Regime</div><div class="holerite-val">${Utils.escHtml(f.regimeContratacao || 'CLT')}</div></div>
            <div><div class="holerite-label">Banco / Agência / Conta</div><div class="holerite-val">${Utils.escHtml([f.banco, f.agencia, f.conta].filter(Boolean).join(' / ') || '—')}</div></div>
          </div>
        </div>

        <div class="holerite-section">
          <div class="holerite-section-title">Proventos</div>
          <div class="holerite-row"><span>Salário Base</span><span class="holerite-credit">${Utils.formatCurrency(r.salarioBase)}</span></div>
          ${r.vt ? `<div class="holerite-row"><span>Vale Transporte</span><span class="holerite-credit">${Utils.formatCurrency(r.vt)}</span></div>` : ''}
          ${r.vr ? `<div class="holerite-row"><span>Vale Refeição</span><span class="holerite-credit">${Utils.formatCurrency(r.vr)}</span></div>` : ''}
          ${r.outrosAdicionais ? `<div class="holerite-row"><span>Outros Adicionais</span><span class="holerite-credit">${Utils.formatCurrency(r.outrosAdicionais)}</span></div>` : ''}
          ${(r.itensLanc || []).filter(i => !i.desconta).map(i =>
            `<div class="holerite-row"><span>${Utils.escHtml(i.descricao)}</span><span class="holerite-credit">${Utils.formatCurrency(i.valor)}</span></div>`).join('')}
          <div class="holerite-total"><span>Total de Proventos</span><span>${Utils.formatCurrency(r.bruto + (Number(r.proventosLanc) || 0))}</span></div>
        </div>

        ${_ehCLT(f) ? `
        <div class="holerite-section">
          <div class="holerite-section-title">Descontos</div>
          <div class="holerite-row">
            <span>INSS (${_aliqINSSDisplay(r.salarioBase)})</span>
            <span class="holerite-debit">${Utils.formatCurrency(r.inss)}</span>
          </div>
          ${r.irrf > 0 ? `<div class="holerite-row"><span>IRRF</span><span class="holerite-debit">${Utils.formatCurrency(r.irrf)}</span></div>` : ''}
          ${r.planoSaude ? `<div class="holerite-row"><span>Plano de Saúde</span><span class="holerite-debit">${Utils.formatCurrency(r.planoSaude)}</span></div>` : ''}
          ${_linhasDescontoLanc(r)}
          <div class="holerite-total"><span>Total de Descontos</span><span style="color:var(--danger)">${Utils.formatCurrency(r.totalDescontos + (Number(r.descontosLanc) || 0))}</span></div>
        </div>` : ((r.planoSaude || (Number(r.descontosLanc) || 0)) ? `
        <div class="holerite-section">
          <div class="holerite-section-title">Descontos</div>
          ${r.planoSaude ? `<div class="holerite-row"><span>Plano de Saúde</span><span class="holerite-debit">${Utils.formatCurrency(r.planoSaude)}</span></div>` : ''}
          ${_linhasDescontoLanc(r)}
          <div class="holerite-total"><span>Total de Descontos</span><span style="color:var(--danger)">${Utils.formatCurrency(r.totalDescontos + (Number(r.descontosLanc) || 0))}</span></div>
        </div>` : `
        <div class="holerite-section">
          <div class="holerite-section-title">Descontos</div>
          <div class="text-sm text-muted">Sem descontos — ${Utils.escHtml(f.regimeContratacao || '')} não sofre retenção de INSS/IRRF nesta folha.</div>
        </div>`)}

        <div class="holerite-section" style="background:var(--primary);color:#fff;border-radius:var(--radius);padding:16px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:16px;font-weight:700">${_ehCLT(f) ? 'SALÁRIO LÍQUIDO A RECEBER' : 'VALOR LÍQUIDO DA RETIRADA'}</div>
          <div style="font-size:24px;font-weight:800">${Utils.formatCurrency(r.liquido)}</div>
        </div>

        ${_temFGTS(f) ? `
        <div class="holerite-section">
          <div class="holerite-section-title">Encargos Patronais (não descontados do funcionário)</div>
          <div class="holerite-row"><span>FGTS (8%)</span><span>${Utils.formatCurrency(r.fgts)}</span></div>
          <div class="holerite-row"><span>INSS Patronal (estimado 20%)</span><span>${Utils.formatCurrency(Math.round(r.salarioBase * 0.2 * 100) / 100)}</span></div>
          <div class="holerite-total"><span>Custo Total para Empresa</span><span>${Utils.formatCurrency(r.bruto + r.fgts + Math.round(r.salarioBase * 0.2 * 100) / 100)}</span></div>
          <div class="text-xs text-muted" style="margin-top:4px">Vale e adiantamento não entram aqui: são parte do salário, entregues antes.</div>
        </div>` : `
        <div class="holerite-section">
          <div class="holerite-section-title">Regime: ${Utils.escHtml(f.regimeContratacao || '—')}</div>
          <div class="text-xs text-muted">Sem FGTS nem INSS patronal — encargos exclusivos de vínculo CLT.</div>
        </div>`}

        <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:40px">
          <div style="border-top:1px solid #cbd5e1;padding-top:8px;text-align:center;font-size:12px;color:#64748b">
            Assinatura do Empregador<br>${Utils.escHtml(cfg.empresa || '')}
          </div>
          <div style="border-top:1px solid #cbd5e1;padding-top:8px;text-align:center;font-size:12px;color:#64748b">
            Assinatura do Empregado<br>${Utils.escHtml(f.nome)}
          </div>
        </div>

        <div style="margin-top:16px;text-align:center;font-size:11px;color:#94a3b8">
          Gerado em ${new Date().toLocaleDateString('pt-BR')} · ${Utils.escHtml(cfg.empresa || '')} — Sistema CRM
        </div>
      </div>
    `;
  }

  function _aliqINSSDisplay(sal) {
    if (sal <= 1412) return '7,5%';
    if (sal <= 2666.68) return '9%';
    if (sal <= 4000.03) return '12%';
    return 'Progressivo';
  }

  /* =========================================================
     TAB 4 — HISTÓRICO
  ========================================================= */
  function buildHistorico() {
    const folha = DB.getAll('folha').sort((a, b) => b.mes.localeCompare(a.mes));
    const porMes = {};
    folha.forEach(r => {
      if (!porMes[r.mes]) porMes[r.mes] = [];
      porMes[r.mes].push(r);
    });

    if (Object.keys(porMes).length === 0) {
      return `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Nenhuma folha gerada</div><div class="empty-sub">Gere folhas na aba "Folha Mensal" para ver o histórico.</div></div>`;
    }

    return `
      <div class="card">
        <div class="card-header"><span class="font-bold">Histórico de Folhas</span></div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Competência</th><th>Funcionários</th><th>Folha Bruta</th><th>Descontos</th><th>Líquido Total</th><th>FGTS</th><th>Pagos</th><th>Ações</th></tr></thead>
            <tbody>
              ${Object.entries(porMes).map(([mes, registros]) => {
                const bruto   = registros.reduce((s, r) => s + (r.bruto || 0), 0);
                const desc    = registros.reduce((s, r) => s + (r.totalDescontos || 0), 0);
                const liq     = registros.reduce((s, r) => s + (r.liquido || 0), 0);
                const fgts    = registros.reduce((s, r) => s + (r.fgts || 0), 0);
                const pagos   = registros.filter(r => r.pago).length;
                const mesLbl  = new Date(mes + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                return `<tr>
                  <td class="font-bold">${mesLbl}</td>
                  <td>${registros.length}</td>
                  <td class="font-bold">${Utils.formatCurrency(bruto)}</td>
                  <td class="text-danger">${Utils.formatCurrency(desc)}</td>
                  <td class="font-bold text-success">${Utils.formatCurrency(liq)}</td>
                  <td class="text-warning">${Utils.formatCurrency(fgts)}</td>
                  <td>${pagos === registros.length ? '<span class="badge badge-green">Todos pagos</span>' : `<span class="badge badge-yellow">${pagos}/${registros.length}</span>`}</td>
                  <td>
                    <button class="btn btn-xs btn-secondary" onclick="Folha.setMesEIrParaFolha('${mes}')">Ver Detalhes</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* =========================================================
     ACTIONS — FUNCIONÁRIOS
  ========================================================= */
  function openFormFunc(id = null) {
    const f = id ? DB.get('funcionarios', id) : null;
    Modal.open({
      title: id ? 'Editar Funcionário' : 'Novo Funcionário',
      size: 'modal-lg',
      body: `
        <!-- AVATAR UPLOAD -->
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
          <div id="avatarPreviewFunc" style="width:64px;height:64px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            ${f?.avatar ? `<img src="${f.avatar}" style="width:100%;height:100%;object-fit:cover">` : `<span style="color:#fff;font-size:24px;font-weight:800">${Utils.escHtml((f?.nome||'?')[0].toUpperCase())}</span>`}
          </div>
          <div>
            <label class="btn btn-xs btn-secondary" style="cursor:pointer">
              📷 Foto
              <input type="file" id="ffAvatar" accept="image/*" style="display:none" onchange="Folha._previewAvatarFunc(event)">
            </label>
            ${f?.avatar ? `<button type="button" class="btn btn-xs btn-danger ml-2" onclick="document.getElementById('avatarPreviewFunc').innerHTML='<span style=\\'color:#fff;font-size:24px;font-weight:800\\'>${Utils.escHtml((f?.nome||'?')[0].toUpperCase())}</span>';document.getElementById('ffAvatarData').value='__remove__'">Remover</button>` : ''}
          </div>
          <input type="hidden" id="ffAvatarData" value="">
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Nome Completo *</label>
            <input class="form-control" id="ffNome" value="${Utils.escHtml(f?.nome||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">CPF</label>
            <input class="form-control" id="ffCpf" value="${Utils.escHtml(f?.cpf||'')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cargo *</label>
            <input class="form-control" id="ffCargo" value="${Utils.escHtml(f?.cargo||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Departamento</label>
            <input class="form-control" id="ffDepto" value="${Utils.escHtml(f?.departamento||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Regime</label>
            <select class="form-control" id="ffRegime">
              ${['CLT','PJ','Estágio','Autônomo','Parceria','Sócio'].map(r => `<option ${(f?.regimeContratacao||'CLT')===r?'selected':''}>${r}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Salário Base (R$) *</label>
            <input class="form-control" id="ffSal" type="text" inputmode="decimal" value="${Utils.moneyToInput(f?.salarioBase)}">
          </div>
          <div class="form-group">
            <label class="form-label">Vale Transporte (R$)</label>
            <input class="form-control" id="ffVT" type="number" value="${f?.vt||0}">
          </div>
          <div class="form-group">
            <label class="form-label">Vale Refeição (R$)</label>
            <input class="form-control" id="ffVR" type="number" value="${f?.vr||0}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Plano de Saúde (desconto R$)</label>
            <input class="form-control" id="ffPS" type="number" value="${f?.planoSaude||0}">
          </div>
          <div class="form-group">
            <label class="form-label">Nº Dependentes (IRRF)</label>
            <input class="form-control" id="ffDep" type="number" value="${f?.dependentes||0}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Admissão</label>
            <input class="form-control" id="ffAdm" type="date" value="${f?.dataAdmissao||''}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Banco</label>
            <input class="form-control" id="ffBanco" value="${Utils.escHtml(f?.banco||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Agência</label>
            <input class="form-control" id="ffAg" value="${Utils.escHtml(f?.agencia||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Conta</label>
            <input class="form-control" id="ffConta" value="${Utils.escHtml(f?.conta||'')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Outros Adicionais (R$)</label>
          <input class="form-control" id="ffOutros" type="number" value="${f?.outrosAdicionais||0}" placeholder="Adicional noturno, insalubridade...">
        </div>
      `,
      saveCb: () => saveFunc(id),
    });
  }

  function saveFunc(id) {
    const nome = document.getElementById('ffNome').value.trim();
    const cargo = document.getElementById('ffCargo').value.trim();
    const sal = Utils.parseMoney(document.getElementById('ffSal').value);
    if (!nome) { Toast.error('Nome obrigatório'); return; }
    if (!cargo) { Toast.error('Cargo obrigatório'); return; }
    if (!sal) { Toast.error('Salário obrigatório'); return; }

    const avatarRaw = document.getElementById('ffAvatarData')?.value || '';
    const existingFunc = id ? DB.get('funcionarios', id) : null;
    let avatar = existingFunc?.avatar || null;
    if (avatarRaw === '__remove__') avatar = null;
    else if (avatarRaw && avatarRaw.startsWith('data:')) avatar = avatarRaw;

    const data = {
      nome, cargo,
      cpf: document.getElementById('ffCpf').value.trim(),
      departamento: document.getElementById('ffDepto').value.trim(),
      regimeContratacao: document.getElementById('ffRegime').value,
      salarioBase: sal,
      vt: Number(document.getElementById('ffVT').value) || 0,
      vr: Number(document.getElementById('ffVR').value) || 0,
      planoSaude: Number(document.getElementById('ffPS').value) || 0,
      dependentes: Number(document.getElementById('ffDep').value) || 0,
      dataAdmissao: document.getElementById('ffAdm').value,
      banco: document.getElementById('ffBanco').value.trim(),
      agencia: document.getElementById('ffAg').value.trim(),
      conta: document.getElementById('ffConta').value.trim(),
      outrosAdicionais: Number(document.getElementById('ffOutros').value) || 0,
      avatar,
      ativo: true,
    };
    if (id) { DB.update('funcionarios', id, data); Toast.success('Funcionário atualizado'); }
    else { DB.create('funcionarios', data); Toast.success('Funcionário cadastrado'); }
    Modal.close();
    render();
  }

  /* A janela de detalhes que existia aqui virou a ficha do funcionario, uma
     tela inteira em funcionario-ficha.js. Esta funcao continua existindo
     porque a busca global e os cartoes da equipe chamam Folha.verFunc(id). */
  function verFunc(id) {
    if (typeof FuncionarioFicha !== 'undefined') { FuncionarioFicha.abrir(id); return; }
    Toast.error('A ficha do funcionario nao esta disponivel: recarregue a pagina.');
  }

  function deleteFunc(id) {
    const f = DB.get('funcionarios', id);
    if (!f) return;
    Confirm.show(
      'Excluir Funcionário Permanentemente',
      `Deseja excluir <strong>${Utils.escHtml(f.nome)}</strong> permanentemente?<br><br>` +
      `<span style="color:var(--danger);font-size:12px">⚠ Isso também removerá todos os registros de folha deste funcionário. Esta ação não pode ser desfeita.</span>`,
      () => {
        // Excluir registros de folha associados
        DB.getAll('folha')
          .filter(r => r.funcionarioId === id)
          .forEach(r => DB.remove('folha', r.id));
        // Excluir o funcionário permanentemente
        DB.remove('funcionarios', id);
        Toast.success('Funcionário excluído permanentemente');
        render();
      }
    );
  }

  function toggleAtivo(id, ativo) {
    const f = DB.get('funcionarios', id);
    if (!f) return;
    Confirm.show(
      ativo ? 'Reativar Funcionário' : 'Desligar Funcionário',
      ativo
        ? `Deseja reativar <strong>${Utils.escHtml(f.nome)}</strong>? Ele voltará a aparecer na folha de pagamento.`
        : `Deseja desligar <strong>${Utils.escHtml(f.nome)}</strong>? Ele não aparecerá nas próximas folhas de pagamento, mas seus dados serão mantidos.`,
      () => {
        DB.update('funcionarios', id, { ativo });
        Toast.success(ativo ? 'Funcionário reativado' : 'Funcionário desligado');
        render();
      }
    );
  }

  /* =========================================================
     ACTIONS — FOLHA
  ========================================================= */
  function gerarFolha() {
    const funcs = DB.getAll('funcionarios').filter(f => f.ativo !== false);
    if (funcs.length === 0) { Toast.error('Nenhum funcionário ativo cadastrado'); return; }

    const jaExiste = DB.getAll('folha').some(r => r.mes === _mesFolha);
    if (jaExiste) { Toast.error('Folha já gerada para este mês'); return; }

    /* Gerar folha de mes fechado mudaria o custo de pessoal daquele mes, que
       ja foi congelado. */
    if (typeof Fechamento !== 'undefined' && !Fechamento.permite(_mesFolha + '-01', 'A folha deste mês')) return;

    const gerados = [];
    funcs.forEach(f => {
      const calc = calcFolhaFuncionario(f, _mesFolha);
      const rec = DB.create('folha', {
        mes: _mesFolha,
        funcionarioId: f.id,
        nome: f.nome,
        cargo: f.cargo,
        salarioBase: f.salarioBase,
        vt: f.vt || 0,
        vr: f.vr || 0,
        planoSaude: f.planoSaude || 0,
        outrosAdicionais: f.outrosAdicionais || 0,
        dependentes: f.dependentes || 0,
        ...calc,
        pago: false,
      });
      gerados.push({ f, rec, calc });
    });

    /* Os lancamentos que entraram nesta folha ficam marcados com o mes e o id
       da folha que os acertou. E isso que impede o mesmo vale de ser
       descontado de novo no mes seguinte, e e o que permite desfazer tudo se
       a folha for excluida. */
    let nAcertados = 0;
    gerados.forEach(g => { nAcertados += _acertarLancamentos(g.calc.itensLanc, g.rec); });

    /* A folha vira CONTA A PAGAR, uma por funcionário mais uma de FGTS.
       Antes virava lançamento com status 'a_pagar', e nenhum indicador lê esse
       status: o DRE soma despesa 'pago' e o "A Pagar" lê contas a pagar. A
       folha existia no banco e não aparecia em lugar nenhum do financeiro.
       Como conta a pagar, ela entra no "A Pagar", no sino, na tela Hoje, e ao
       ser paga gera o lançamento com a data real do pagamento. Uma por
       funcionário porque o pagamento é marcado por pessoa. */
    const vencFolha = _mesFolha + '-05';
    gerados.forEach(({ f, calc }) => {
      /* O compromisso e o liquido JA abatido do vale: e esse o valor que vai
         sair da conta no dia 5. Cobrar o liquido cheio aqui faria o caixa
         prever uma saida que nao vai acontecer. */
      const liquido = calc.liquido
        || ((f.salarioBase || 0) + (f.vt || 0) + (f.vr || 0));
      const jaTem = DB.getAll('contaspagar').some(c =>
        c.categoria === 'Folha de Pagamento' && c.folhaMes === _mesFolha && c.funcionarioId === f.id);
      if (jaTem) return;
      DB.create('contaspagar', {
        fornecedor: f.nome, descricao: `Salário ${f.nome} — ${_mesFolha}`,
        categoria: 'Folha de Pagamento',
        valor: Math.round(liquido * 100) / 100,
        vencimento: vencFolha, status: 'pendente', recorrente: false,
        folhaMes: _mesFolha, funcionarioId: f.id,
        observacoes: 'Gerada automaticamente pela folha de pagamento.'
          + (calc.descontosLanc ? ` Já descontado ${Utils.formatCurrency(calc.descontosLanc)} de vale/desconto lançado na ficha.` : ''),
      });
    });

    const encargos = funcs.reduce((s, f) => s + (_temFGTS(f) ? Math.round(f.salarioBase * 0.08 * 100) / 100 : 0), 0); // FGTS — só CLT
    const temFgts = DB.getAll('contaspagar').some(c =>
      c.categoria === 'Encargos/FGTS' && c.folhaMes === _mesFolha);
    if (encargos > 0 && !temFgts) {
      DB.create('contaspagar', {
        fornecedor: 'FGTS', descricao: `Encargos FGTS — ${_mesFolha}`,
        categoria: 'Encargos/FGTS',
        valor: Math.round(encargos * 100) / 100,
        vencimento: _mesFolha + '-07', status: 'pendente', recorrente: false,
        folhaMes: _mesFolha,
        observacoes: 'FGTS patronal 8% — apenas funcionários CLT.',
      });
    }
    const mesLbl = new Date(_mesFolha + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    Toast.success(`Folha de ${mesLbl} gerada para ${funcs.length} funcionários.`
      + (nAcertados ? ` ${nAcertados} lançamento(s) da ficha acertado(s) no pagamento.` : '')
      + ' Contas a pagar criadas no Financeiro.');
    render();
    if (typeof App !== 'undefined') App.updateNotifBadge();
  }

  /* Marca os lançamentos da ficha como acertados nesta folha. Devolve
     quantos foram. */
  function _acertarLancamentos(itens, rec) {
    let n = 0;
    (itens || []).forEach(i => {
      const l = DB.get('func_lancamentos', i.id);
      if (!l || l.status === 'cancelado') return;
      DB.update('func_lancamentos', i.id, {
        status: i.desconta ? 'descontado' : 'acertado',
        folhaMes: rec.mes, folhaId: rec.id,
        dataDesconto: Utils.todayStr(),
      });
      n++;
    });
    return n;
  }

  /* Desfaz o acerto. Os lançamentos voltam a ficar em aberto e entram na
     próxima folha que for gerada. Nada é apagado: vale pago é registro
     trabalhista e ele continua inteiro na ficha da pessoa. */
  function _devolverLancamentos(folhaId) {
    let n = 0;
    DB.getAll('func_lancamentos')
      .filter(l => l.folhaId === folhaId && l.status !== 'cancelado')
      .forEach(l => {
        DB.update('func_lancamentos', l.id, {
          status: 'aberto', folhaId: '', folhaMes: '', dataDesconto: '',
        });
        n++;
      });
    return n;
  }

  /* Refaz a folha de uma pessoa num mês que ainda não foi pago.

     É o que fecha o ciclo que o usuário pediu: lançou o vale na ficha, o
     pagamento daquele mês já sai descontado, sem ninguém precisar lembrar de
     refazer a folha na mão. Mês pago não se mexe — o dinheiro já saiu, e o
     lançamento novo é cobrado na folha seguinte. */
  function recalcularFuncionario(mes, funcId, silencioso) {
    const rec = DB.getAll('folha').find(r => r.mes === mes && r.funcionarioId === funcId);
    if (!rec) return null;
    if (rec.pago) {
      if (!silencioso) Toast.warning('A folha deste mês já foi paga. O lançamento entra na próxima.');
      return null;
    }
    if (typeof Fechamento !== 'undefined' && !Fechamento.permite(mes + '-01', 'A folha deste mês')) return null;
    const f = DB.get('funcionarios', funcId);
    if (!f) return null;
    const calc = calcFolhaFuncionario(f, mes);
    DB.update('folha', rec.id, { ...calc });
    /* O acerto tem de acompanhar o recalculo. Sem isto, o vale lancado depois
       da folha gerada aparecia descontado no pagamento e continuava marcado
       como "a descontar" na ficha — e seria cobrado DE NOVO no mes seguinte.
       Devolve primeiro e remarca so o que entrou agora, para quem saiu da
       conta (cancelado, competencia mudada) voltar a ficar em aberto. */
    _devolverLancamentos(rec.id);
    _acertarLancamentos(calc.itensLanc, rec);
    const conta = DB.getAll('contaspagar').find(c =>
      c.categoria === 'Folha de Pagamento' && c.folhaMes === mes
      && c.funcionarioId === funcId && c.status === 'pendente');
    if (conta) DB.update('contaspagar', conta.id, { valor: Math.round(calc.liquido * 100) / 100 });
    return calc;
  }

  /* Marcar o funcionário como pago também quita a conta a pagar dele, pelo
     mesmo caminho do Financeiro: pergunta a data real e gera o lançamento de
     despesa, que é o que entra no DRE. Antes isso só marcava um booleano na
     folha e o dinheiro nunca aparecia no resultado do mês. */
  function marcarPago(folhaId) {
    const r = DB.get('folha', folhaId);
    if (!r) return;
    const conta = DB.getAll('contaspagar').find(c =>
      c.categoria === 'Folha de Pagamento' && c.folhaMes === r.mes
      && c.funcionarioId === r.funcionarioId && c.status === 'pendente');

    const concluir = (quando) => {
      DB.update('folha', folhaId, { pago: true, dataPagamento: quando || Utils.todayStr() });
      Toast.success('Marcado como pago');
      render();
      if (typeof App !== 'undefined') App.updateNotifBadge();
    };

    if (conta && typeof Financeiro !== 'undefined' && Financeiro.pagarConta) {
      // deixa o Financeiro perguntar a data e gerar o lançamento
      Financeiro.pagarConta(conta.id);
      // a folha acompanha a conta: confere depois que o fluxo terminar
      const checar = setInterval(() => {
        const c2 = DB.get('contaspagar', conta.id);
        if (c2 && c2.status === 'pago') { clearInterval(checar); concluir(c2.dataPagamento); }
      }, 400);
      setTimeout(() => clearInterval(checar), 60000);
      return;
    }
    concluir();
  }

  function marcarTodosPagos(mes) {
    const registros = DB.getAll('folha').filter(r => r.mes === mes && !r.pago);
    registros.forEach(r => DB.update('folha', r.id, { pago: true, dataPagamento: Utils.todayStr() }));
    Toast.success(`${registros.length} funcionários marcados como pagos`);
    render();
  }

  function excluirFolha(mes) {
    const registros = DB.getAll('folha').filter(r => r.mes === mes);
    const pagos = registros.filter(r => r.pago).length;
    const lancs = DB.getAll('func_lancamentos')
      .filter(l => registros.some(r => r.id === l.folhaId) && l.status !== 'cancelado').length;
    const mesLbl = new Date(mes + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const aviso = 'Excluir a folha de ' + mesLbl + '? '
      + (lancs ? lancs + ' lançamento(s) da ficha dos funcionários voltam para "a descontar" e entram na próxima folha. ' : '')
      + 'As contas a pagar ainda pendentes desta folha são canceladas. '
      + (pagos ? pagos + ' funcionário(s) já constam como pagos: o pagamento feito não é desfeito. ' : '')
      + 'Os lançamentos da ficha não são apagados.';
    Confirm.show('Excluir Folha', aviso, () => {
      let devolvidos = 0;
      registros.forEach(r => { devolvidos += _devolverLancamentos(r.id); });
      /* Conta a pagar gerada por esta folha e compromisso que deixou de
         existir. Cancelar tira do "A Pagar" sem apagar o histórico. */
      DB.getAll('contaspagar')
        .filter(c => c.folhaMes === mes && c.status === 'pendente'
          && (c.categoria === 'Folha de Pagamento' || c.categoria === 'Encargos/FGTS'))
        .forEach(c => DB.update('contaspagar', c.id, {
          status: 'cancelado',
          observacoes: (c.observacoes || '') + ' Cancelada: a folha do mês foi excluída.',
        }));
      registros.forEach(r => DB.remove('folha', r.id));
      Toast.success('Folha excluída' + (devolvidos ? ` · ${devolvidos} lançamento(s) voltaram para a ficha` : ''));
      render();
      if (typeof App !== 'undefined') App.updateNotifBadge();
    });
  }

  /* =========================================================
     TAB SÓCIOS — Pró-labore e Dividendos
  ========================================================= */
  function calcProLabore(valor) {
    // Pró-labore segue tabela INSS e IRRF igual funcionário CLT
    const inss = calcINSS(valor);
    const irrf = calcIRRF(valor, inss, 0);
    return { bruto: valor, inss, irrf, liquido: valor - inss - irrf };
  }

  function buildSocios() {
    const socios = DB.getAll('socios');
    const ativos = socios.filter(s => s.ativo !== false);

    const totalProLabore  = ativos.reduce((s, x) => s + (x.prolabore || 0), 0);
    const totalDividendos = ativos.reduce((s, x) => s + (x.dividendos || 0), 0);
    const totalINSS       = ativos.reduce((s, x) => {
      const { inss } = calcProLabore(x.prolabore || 0);
      return s + inss;
    }, 0);

    return `
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="kpi-card" style="--kpi-color:#7c3aed"><div class="kpi-label">Sócios Cadastrados</div><div class="kpi-value">${ativos.length}</div><div class="kpi-icon">💼</div></div>
        <div class="kpi-card" style="--kpi-color:#1a56db"><div class="kpi-label">Total Pró-labore</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalProLabore)}</div><div class="kpi-icon">💼</div></div>
        <div class="kpi-card" style="--kpi-color:#059669"><div class="kpi-label">Total Dividendos</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalDividendos)}</div><div class="kpi-icon">💰</div></div>
        <div class="kpi-card" style="--kpi-color:#f59e0b"><div class="kpi-label">INSS s/ Pró-labore</div><div class="kpi-value" style="font-size:18px">${Utils.formatCurrency(totalINSS)}</div><div class="kpi-icon">🏦</div></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:16px;color:var(--text)">Sócios / Retiradas</h3>
        <button class="btn-primary" onclick="Folha.openFormSocio()">+ Adicionar Sócio</button>
      </div>

      ${ativos.length === 0 ? `
        <div class="empty-state" style="padding:60px 20px">
          <div style="font-size:48px;margin-bottom:12px">💼</div>
          <p style="color:var(--text-muted)">Nenhum sócio cadastrado. Clique em <strong>+ Adicionar Sócio</strong> para começar.</p>
        </div>` : `
        <div style="display:grid;gap:16px">
          ${ativos.map(s => {
            const pl = calcProLabore(s.prolabore || 0);
            const totalRetirada = (s.prolabore || 0) + (s.dividendos || 0);
            const totalLiquido  = pl.liquido + (s.dividendos || 0);
            const tipoBadge = s.tipo === 'prolabore'
              ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Pró-labore</span>'
              : s.tipo === 'dividendos'
              ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Dividendos</span>'
              : '<span style="background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Misto</span>';
            return `
            <div class="card" style="padding:20px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
                <div style="flex:1;min-width:220px">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <span style="font-size:22px">👤</span>
                    <div>
                      <div style="font-weight:700;font-size:15px;color:var(--text)">${Utils.escHtml(s.nome)}</div>
                      <div style="font-size:12px;color:var(--text-muted)">${Utils.escHtml(s.cargo || 'Sócio')} ${s.percentualSociedade ? '· ' + s.percentualSociedade + '% da sociedade' : ''}</div>
                    </div>
                  </div>
                  <div style="margin-top:6px">${tipoBadge}</div>
                </div>
                <div style="display:flex;gap:32px;flex-wrap:wrap">
                  ${s.prolabore ? `
                  <div style="text-align:center">
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">Pró-labore Bruto</div>
                    <div style="font-weight:700;color:#1a56db">${Utils.formatCurrency(s.prolabore)}</div>
                    <div style="font-size:10px;color:#dc2626;margin-top:2px">INSS: ${Utils.formatCurrency(pl.inss)} · IRRF: ${Utils.formatCurrency(pl.irrf)}</div>
                    <div style="font-size:11px;color:#059669;font-weight:600">Líquido: ${Utils.formatCurrency(pl.liquido)}</div>
                  </div>` : ''}
                  ${s.dividendos ? `
                  <div style="text-align:center">
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">Dividendos</div>
                    <div style="font-weight:700;color:#059669">${Utils.formatCurrency(s.dividendos)}</div>
                    <div style="font-size:10px;color:#059669;margin-top:2px">Isento de IR</div>
                  </div>` : ''}
                  <div style="text-align:center;border-left:2px solid var(--border);padding-left:16px">
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">Total Bruto</div>
                    <div style="font-weight:700;font-size:16px;color:var(--text)">${Utils.formatCurrency(totalRetirada)}</div>
                    <div style="font-size:11px;color:#059669;font-weight:600">Líq: ${Utils.formatCurrency(totalLiquido)}</div>
                  </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button class="btn-secondary btn-sm" onclick="Folha.openFormSocio('${s.id}')">✏️</button>
                  <button class="btn-secondary btn-sm" onclick="Folha.deleteSocio('${s.id}')" style="color:#dc2626">🗑️</button>
                </div>
              </div>
              ${s.observacoes ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted)">${Utils.escHtml(s.observacoes)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>`}
    `;
  }

  function openFormSocio(id) {
    const s = id ? DB.get('socios', id) : null;
    Modal.open({
      title: s ? 'Editar Sócio' : 'Adicionar Sócio / Retiradas',
      size: 'md',
      body: `
        <div style="display:grid;gap:14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Nome completo *</label>
              <input class="form-input" id="sNome" value="${Utils.escHtml(s?.nome || '')}" placeholder="Ex: Marcos Israel">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">CPF</label>
              <input class="form-input" id="sCpf" value="${Utils.escHtml(s?.cpf || '')}" placeholder="000.000.000-00">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Cargo / Função</label>
              <input class="form-input" id="sCargo" value="${Utils.escHtml(s?.cargo || 'Sócio-Administrador')}" placeholder="Ex: Sócio-Administrador">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">% na Sociedade</label>
              <input class="form-input" id="sPerc" type="number" min="0" max="100" step="0.01" value="${s?.percentualSociedade || ''}" placeholder="Ex: 100">
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Tipo de Retirada *</label>
            <select class="form-input" id="sTipo" onchange="Folha._toggleSocioTipo()">
              <option value="prolabore" ${(s?.tipo||'prolabore')==='prolabore'?'selected':''}>Pró-labore (INSS + IRRF)</option>
              <option value="dividendos" ${s?.tipo==='dividendos'?'selected':''}>Dividendos (isento IR)</option>
              <option value="misto" ${s?.tipo==='misto'?'selected':''}>Misto (Pró-labore + Dividendos)</option>
            </select>
          </div>
          <div id="sProLaboreRow" style="${s?.tipo === 'dividendos' ? 'display:none' : ''}">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Pró-labore Bruto (R$)</label>
            <input class="form-input" id="sProLabore" type="number" min="0" step="0.01" value="${s?.prolabore || ''}" placeholder="0,00" oninput="Folha._calcSocioPreview()">
            <div id="sProLaboreInfo" style="font-size:11px;color:var(--text-muted);margin-top:4px"></div>
          </div>
          <div id="sDividendosRow" style="${!s?.tipo || s?.tipo === 'prolabore' ? 'display:none' : ''}">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Dividendos Mensais (R$)</label>
            <input class="form-input" id="sDividendos" type="number" min="0" step="0.01" value="${s?.dividendos || ''}" placeholder="0,00">
            <div style="font-size:11px;color:#059669;margin-top:4px">✅ Isento de Imposto de Renda (Lei 9.249/1995)</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Banco</label>
              <input class="form-input" id="sBanco" value="${Utils.escHtml(s?.banco || '')}" placeholder="Ex: Nubank">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Agência</label>
              <input class="form-input" id="sAgencia" value="${Utils.escHtml(s?.agencia || '')}" placeholder="0000">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Conta</label>
              <input class="form-input" id="sConta" value="${Utils.escHtml(s?.conta || '')}" placeholder="00000-0">
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Observações</label>
            <textarea class="form-input" id="sObs" rows="2" placeholder="Notas adicionais...">${Utils.escHtml(s?.observacoes || '')}</textarea>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancelar', class: 'btn-secondary', onclick: 'Modal.close()' },
        { label: s ? 'Salvar' : 'Adicionar', class: 'btn-primary', onclick: `Folha.saveSocio('${id || ''}')` },
      ],
    });
    // calc preview on open if editing
    setTimeout(() => Folha._calcSocioPreview(), 100);
  }

  function _toggleSocioTipo() {
    const tipo = document.getElementById('sTipo')?.value;
    const plRow = document.getElementById('sProLaboreRow');
    const divRow = document.getElementById('sDividendosRow');
    if (plRow)  plRow.style.display  = (tipo === 'dividendos') ? 'none' : '';
    if (divRow) divRow.style.display = (tipo === 'prolabore')  ? 'none' : '';
    _calcSocioPreview();
  }

  function _calcSocioPreview() {
    const val = parseFloat(document.getElementById('sProLabore')?.value) || 0;
    const info = document.getElementById('sProLaboreInfo');
    if (!info) return;
    if (val <= 0) { info.textContent = ''; return; }
    const { inss, irrf, liquido } = calcProLabore(val);
    info.innerHTML = `INSS: <strong>${Utils.formatCurrency(inss)}</strong> · IRRF: <strong>${Utils.formatCurrency(irrf)}</strong> · <span style="color:#059669">Líquido: <strong>${Utils.formatCurrency(liquido)}</strong></span>`;
  }

  function saveSocio(id) {
    const nome = document.getElementById('sNome')?.value?.trim();
    if (!nome) { Toast.error('Informe o nome do sócio.'); return; }

    const tipo = document.getElementById('sTipo')?.value || 'prolabore';
    const prolabore  = parseFloat(document.getElementById('sProLabore')?.value)  || 0;
    const dividendos = parseFloat(document.getElementById('sDividendos')?.value) || 0;

    if (tipo !== 'dividendos' && prolabore <= 0 && tipo !== 'misto') {
      Toast.error('Informe o valor do pró-labore.'); return;
    }
    if (tipo === 'dividendos' && dividendos <= 0) {
      Toast.error('Informe o valor dos dividendos.'); return;
    }
    if (tipo === 'misto' && prolabore <= 0 && dividendos <= 0) {
      Toast.error('Informe pelo menos um valor (pró-labore ou dividendos).'); return;
    }

    const data = {
      nome,
      cpf:                document.getElementById('sCpf')?.value?.trim()    || '',
      cargo:              document.getElementById('sCargo')?.value?.trim()  || 'Sócio',
      percentualSociedade: parseFloat(document.getElementById('sPerc')?.value) || 0,
      tipo,
      prolabore:          tipo !== 'dividendos' ? prolabore  : 0,
      dividendos:         tipo !== 'prolabore'  ? dividendos : 0,
      banco:              document.getElementById('sBanco')?.value?.trim()   || '',
      agencia:            document.getElementById('sAgencia')?.value?.trim() || '',
      conta:              document.getElementById('sConta')?.value?.trim()   || '',
      observacoes:        document.getElementById('sObs')?.value?.trim()     || '',
      ativo: true,
    };

    if (id) {
      DB.update('socios', id, data);
      Toast.success('Sócio atualizado com sucesso!');
    } else {
      DB.create('socios', data);
      Toast.success('Sócio adicionado com sucesso!');
    }
    Modal.close();
    setTab('socios');
  }

  function deleteSocio(id) {
    const s = DB.get('socios', id);
    if (!s) return;
    if (!confirm(`Excluir o sócio "${s.nome}"? Esta ação não pode ser desfeita.`)) return;
    DB.remove('socios', id);
    Toast.success('Sócio removido.');
    setTab('socios');
  }

  function verHolerite(funcId, mes) {
    _holeriteFuncId = funcId;
    _holeirteRef = mes;
    setTab('holerite');
  }

  function setMes(v) { _mesFolha = v; render(); }
  function setMesEIrParaFolha(mes) { _mesFolha = mes; setTab('folha'); }
  function setHoleirteFunc(v) { _holeriteFuncId = v; render(); }
  function setHoleitreRef(v) { _holeirteRef = v; render(); }

  function imprimirHolerite(funcionarioId, mes) {
    var func = DB.get('funcionarios', funcionarioId);
    if (!func) { Toast.error('Funcionário não encontrado'); return; }
    var mesRef = mes || _mesFolha;
    var folhaMes = DB.getAll('folha').filter(function(f){ return f.funcionarioId === funcionarioId && f.mes === mesRef; })[0];
    var cfg = DB.getConfig();
    var w = window.open('', '_blank');
    if (!w) { Toast.error('Bloqueador de pop-up ativo'); return; }
    var sal = func.salarioBase || 0;
    // Sócio/PJ/Autônomo/Parceria/Estágio: sem INSS, IRRF ou FGTS
    var _clt = _ehCLT(func);
    var inss = folhaMes ? (folhaMes.inss || 0) : (_clt ? calcINSS(sal) : 0);
    var irrf = folhaMes ? (folhaMes.irrf || 0) : (_clt ? calcIRRF(sal, inss, func.dependentes || 0) : 0);
    var fgts = folhaMes ? (folhaMes.fgts || 0) : (_clt ? Math.round(sal * 0.08 * 100) / 100 : 0);
    var vt = func.vt || 0;
    var vr = func.vr || 0;
    var plano = func.planoSaude || 0;
    var bruto = sal + vt + vr;
    var totalDesc = inss + irrf + plano;
    var liquido = bruto - totalDesc;
    var mesLabel = mesRef ? (function(m){ var p=m.split('-');return['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][parseInt(p[1])-1]+'/'+p[0]; })(mesRef) : '—';
    var fmt = function(n){ return 'R$ '+(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2}); };
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Holerite '+func.nome+'</title><style>body{font-family:Arial,sans-serif;font-size:13px;margin:0;padding:24px;color:#1e293b}.header{background:#1e40af;color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between}.empresa{font-size:16px;font-weight:800}h3{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:4px;margin:16px 0 8px}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 10px;border-bottom:1px solid #e2e8f0}.label{color:#64748b}.value{text-align:right;font-weight:600}.total-row{background:#f1f5f9;font-weight:700}.liquido{background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:16px;border-radius:8px;text-align:center;margin-top:16px}.liquido .val{font-size:28px;font-weight:800}.footer{margin-top:24px;text-align:center;color:#94a3b8;font-size:11px}@media print{@page{margin:15mm}body{padding:0}}</style></head><body>');
    w.document.write('<div class="header"><div><div class="empresa">'+Utils.escHtml(cfg.empresa||'Bikows Engenharia')+'</div><div style="font-size:12px;opacity:.8">'+Utils.escHtml(cfg.cnpj||'')+'</div></div><div style="text-align:right"><div style="font-size:14px;font-weight:700">HOLERITE</div><div style="font-size:12px;opacity:.8">'+mesLabel+'</div></div></div>');
    w.document.write('<h3>Dados do Funcionário</h3><table><tr><td class="label">Nome</td><td class="value">'+Utils.escHtml(func.nome)+'</td><td class="label">Cargo</td><td class="value">'+Utils.escHtml(func.cargo||'—')+'</td></tr><tr><td class="label">Depto</td><td class="value">'+Utils.escHtml(func.departamento||'—')+'</td><td class="label">Admissão</td><td class="value">'+Utils.formatDate(func.dataAdmissao)+'</td></tr></table>');
    w.document.write('<h3>Vencimentos</h3><table><tr><td class="label">Salário Base</td><td class="value">'+fmt(sal)+'</td></tr>');
    if (vt > 0) w.document.write('<tr><td class="label">Vale Transporte</td><td class="value">'+fmt(vt)+'</td></tr>');
    if (vr > 0) w.document.write('<tr><td class="label">Vale Refeição</td><td class="value">'+fmt(vr)+'</td></tr>');
    w.document.write('<tr class="total-row"><td>TOTAL BRUTO</td><td class="value">'+fmt(bruto)+'</td></tr></table>');
    w.document.write('<h3>Descontos</h3><table><tr><td class="label">INSS</td><td class="value" style="color:#dc2626">- '+fmt(inss)+'</td></tr><tr><td class="label">IRRF</td><td class="value" style="color:#dc2626">- '+fmt(irrf)+'</td></tr>');
    if (plano > 0) w.document.write('<tr><td class="label">Plano de Saúde</td><td class="value" style="color:#dc2626">- '+fmt(plano)+'</td></tr>');
    w.document.write('<tr class="total-row"><td>TOTAL DESCONTOS</td><td class="value" style="color:#dc2626">- '+fmt(totalDesc)+'</td></tr></table>');
    w.document.write('<div class="liquido"><div>SALÁRIO LÍQUIDO</div><div class="val">'+fmt(liquido)+'</div></div>');
    w.document.write('<div class="footer">FGTS: '+fmt(fgts)+' · '+Utils.escHtml(cfg.empresa||'Bikows Engenharia')+' · Gerado pelo CRM Bikows em '+new Date().toLocaleString('pt-BR')+'</div>');
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(function(){ w.print(); }, 800);
  }

  function addNew() { openFormFunc(); }

  return {
    render, setTab, setMes, setMesEIrParaFolha, buildBaseCusto,
    openFormFunc, saveFunc, verFunc, deleteFunc, toggleAtivo,
    gerarFolha, marcarPago, marcarTodosPagos, excluirFolha,
    verHolerite, setHoleirteFunc, setHoleitreRef,
    addNew, _previewAvatarFunc,
    openFormSocio, saveSocio, deleteSocio,
    _toggleSocioTipo, _calcSocioPreview,
    imprimirHolerite,
    // expostos para o módulo Meu Financeiro calcular a retirada do sócio
    // sem duplicar as regras (fonte única de verdade)
    calcFolhaFuncionario, ehCLT: _ehCLT,
    recalcularFuncionario,
  };
})();
