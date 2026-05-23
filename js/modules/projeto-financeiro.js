/* ==========================================
   PROJETO-FINANCEIRO.js
   Controle financeiro individual por projeto
   DRE Â· Recebimentos Â· Custos Â· Parceiros
   ========================================== */
const ProjetoFinanceiro = (() => {

  /* ====================================================
     HELPERS INTERNOS
     ==================================================== */
  function _fin(p) {
    return p.financeiro || { recebimentos: [], custos: [], parceiros: [] };
  }

  function _save(projetoId, financeiro) {
    DB.update('projetos', projetoId, { financeiro });
  }

  function _get(projetoId) {
    return DB.get('projetos', projetoId);
  }

  /* ====================================================
     CÃLCULO DRE
     ==================================================== */
  function calcDRE(p) {
    const fin = _fin(p);
    const receita = p.valor || 0;

    // Custos de horas (do campo bÃ¡sico do projeto)
    const custoHoras = (p.horasTrabalhadas || 0) * (p.valorHora || 0);

    // Custos diretos lanÃ§ados no financeiro do projeto
    const custosLancados = (fin.custos || []).reduce((s, c) => s + (c.valor || 0), 0);

    // Custos diretos do campo bÃ¡sico (compatibilidade)
    const custosBasico = p.custosDirectos || 0;

    // Total custos (evita duplicidade: se hÃ¡ custos lanÃ§ados, usa eles; senÃ£o usa o campo bÃ¡sico)
    const custosDirectos = custosLancados > 0 ? custosLancados : custosBasico;

    const custoTotal = custoHoras + custosDirectos;
    const lucroBruto = receita - custoTotal;

    // Parceiros / comissÃµes (calculadas sobre lucro bruto)
    let totalComissoes = 0;
    (fin.parceiros || []).forEach(par => {
      if (par.tipo === 'comissao') {
        totalComissoes += lucroBruto > 0 ? lucroBruto * (par.percentual || 0) / 100 : 0;
      } else {
        totalComissoes += par.valorFixo || 0;
      }
    });

    const lucroLiquido = lucroBruto - totalComissoes;
    const margemPct = receita > 0 ? Math.round((lucroLiquido / receita) * 100) : 0;

    // Recebimentos
    const totalRecebido = (fin.recebimentos || [])
      .filter(r => r.status === 'recebido')
      .reduce((s, r) => s + (r.valor || 0), 0);
    const totalAReceber = (fin.recebimentos || [])
      .filter(r => r.status !== 'recebido')
      .reduce((s, r) => s + (r.valor || 0), 0);

    return {
      receita, custoHoras, custosDirectos, custoTotal,
      lucroBruto, totalComissoes, lucroLiquido, margemPct,
      totalRecebido, totalAReceber,
    };
  }

  /* ====================================================
     MODAL PRINCIPAL
     ==================================================== */
  function open(projetoId) {
    const p = _get(projetoId);
    if (!p) return;

    Modal.open({
      title: `ðŸ’° Financeiro â€” ${Utils.escHtml(p.titulo)}`,
      size: 'modal-xl',
      body: _buildBody(p),
      saveLabel: null,
      cancelLabel: 'Fechar',
    });
  }

  function _buildBody(p) {
    const dre = calcDRE(p);
    const fin = _fin(p);
    const margemColor = dre.margemPct >= 40 ? '#10b981' : dre.margemPct >= 20 ? '#f59e0b' : '#ef4444';

    return `
      <!-- Tabs -->
      <div class="tabs-bar" style="margin-bottom:20px;border-bottom:2px solid var(--border);display:flex;gap:0">
        <button class="pf-tab active" onclick="ProjetoFinanceiro._switchTab('dre','${p.id}')" id="pftab-dre"
          style="padding:8px 18px;border:none;background:none;font-weight:600;color:var(--primary);border-bottom:2px solid var(--primary);cursor:pointer;margin-bottom:-2px">
          ðŸ“Š DRE
        </button>
        <button class="pf-tab" onclick="ProjetoFinanceiro._switchTab('rec','${p.id}')" id="pftab-rec"
          style="padding:8px 18px;border:none;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:-2px">
          ðŸ’µ Recebimentos
        </button>
        <button class="pf-tab" onclick="ProjetoFinanceiro._switchTab('custos','${p.id}')" id="pftab-custos"
          style="padding:8px 18px;border:none;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:-2px">
          ðŸ“¦ Custos
        </button>
        <button class="pf-tab" onclick="ProjetoFinanceiro._switchTab('parceiros','${p.id}')" id="pftab-parceiros"
          style="padding:8px 18px;border:none;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:-2px">
          ðŸ¤ Parceiros
        </button>
      </div>

      <!-- DRE -->
      <div id="pfpanel-dre">${_renderDRE(p, dre, margemColor)}</div>

      <!-- Recebimentos -->
      <div id="pfpanel-rec" style="display:none">${_renderRecebimentos(p, fin, dre)}</div>

      <!-- Custos -->
      <div id="pfpanel-custos" style="display:none">${_renderCustos(p, fin)}</div>

      <!-- Parceiros -->
      <div id="pfpanel-parceiros" style="display:none">${_renderParceiros(p, fin, dre)}</div>
    `;
  }

  function _switchTab(tab, projetoId) {
    ['dre','rec','custos','parceiros'].forEach(t => {
      const panel = document.getElementById('pfpanel-' + t);
      const btn   = document.getElementById('pftab-' + t);
      if (!panel || !btn) return;
      const active = t === tab;
      panel.style.display = active ? '' : 'none';
      btn.style.color        = active ? 'var(--primary)' : 'var(--text-muted)';
      btn.style.fontWeight   = active ? '600' : '400';
      btn.style.borderBottom = active ? '2px solid var(--primary)' : '2px solid transparent';
    });
  }

  /* ====================================================
     PAINEL DRE
     ==================================================== */
  function _renderDRE(p, dre, margemColor) {
    const rows = [
      { label: '(+) Receita do Contrato',   val: dre.receita,         bold: true,  color: 'var(--primary)' },
      { label: '(-) Custo de Horas',         val: -dre.custoHoras,     small: true, color: '#ef4444' },
      { label: '(-) Custos Diretos',         val: -dre.custosDirectos, small: true, color: '#ef4444' },
      { label: '(=) Lucro Bruto',            val: dre.lucroBruto,      bold: true,  sep: true },
      { label: '(-) ComissÃµes / Parceiros',  val: -dre.totalComissoes, small: true, color: '#f59e0b' },
      { label: '(=) Lucro LÃ­quido',          val: dre.lucroLiquido,    bold: true,  sep: true, color: margemColor },
    ];

    const kpis = [
      { label: 'Receita',       val: Utils.formatCurrency(dre.receita),      color: 'var(--primary)' },
      { label: 'Custos Totais', val: Utils.formatCurrency(dre.custoTotal),   color: '#ef4444' },
      { label: 'Lucro LÃ­quido', val: Utils.formatCurrency(dre.lucroLiquido), color: margemColor },
      { label: 'Margem',        val: dre.margemPct + '%',                     color: margemColor },
      { label: 'Recebido',      val: Utils.formatCurrency(dre.totalRecebido), color: '#10b981' },
      { label: 'A Receber',     val: Utils.formatCurrency(dre.totalAReceber), color: '#f59e0b' },
    ];

    return `
      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${kpis.map(k => `
          <div style="background:var(--bg);border-radius:var(--radius);padding:14px;text-align:center;border-left:3px solid ${k.color}">
            <div class="text-xs text-muted mb-1">${k.label}</div>
            <div class="font-bold" style="color:${k.color};font-size:17px">${k.val}</div>
          </div>`).join('')}
      </div>

      <!-- Demonstrativo -->
      <div style="background:var(--bg);border-radius:var(--radius);padding:16px">
        <div class="font-bold text-sm mb-3">ðŸ“„ Demonstrativo de Resultado</div>
        ${rows.map(r => `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:7px 0;${r.sep ? 'border-top:1px solid var(--border);margin-top:4px' : ''}">
            <span style="font-size:${r.small ? '13px' : '14px'};color:var(--text-muted);padding-left:${r.small ? '16px' : '0'}">${r.label}</span>
            <span style="font-weight:${r.bold ? '700' : '500'};color:${r.color || 'var(--text)'};font-size:${r.bold ? '15px' : '13px'}">
              ${Utils.formatCurrency(Math.abs(r.val))}${r.val < 0 ? ' â†“' : ''}
            </span>
          </div>`).join('')}
      </div>

      <!-- Barra de margem -->
      <div style="margin-top:16px">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-muted">Margem LÃ­quida</span>
          <span class="font-bold" style="color:${margemColor}">${dre.margemPct}%</span>
        </div>
        <div style="background:var(--border);height:10px;border-radius:99px;overflow:hidden">
          <div style="width:${Math.max(0,Math.min(100,dre.margemPct))}%;height:100%;background:${margemColor};border-radius:99px;transition:width .4s"></div>
        </div>
        <div class="text-xs text-muted mt-1">
          ${dre.margemPct >= 40 ? 'âœ… Excelente margem' : dre.margemPct >= 20 ? 'âš  Margem aceitÃ¡vel â€” revise custos' : 'ðŸ”´ Margem baixa â€” atenÃ§Ã£o aos custos'}
        </div>
      </div>

      ${dre.custoTotal === 0 && (dre.fin?.custos||[]).length === 0 ? `
        <div style="margin-top:12px;padding:10px;background:#fef9c3;border-radius:var(--radius);font-size:13px;color:#854d0e">
          â„¹ Para ver a margem real, registre horas trabalhadas no projeto ou lance custos na aba "Custos".
        </div>` : ''}
    `;
  }

  /* ====================================================
     PAINEL RECEBIMENTOS
     ==================================================== */
  function _renderRecebimentos(p, fin, dre) {
    const recs = fin.recebimentos || [];
    const totalConfig = recs.reduce((s, r) => s + (r.valor || 0), 0);
    const diff = p.valor - totalConfig;

    return `
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="font-bold">Parcelas / MediÃ§Ãµes</div>
          <div class="text-xs text-muted">Valor do contrato: ${Utils.formatCurrency(p.valor)} |
            Configurado: ${Utils.formatCurrency(totalConfig)} |
            <span style="color:${Math.abs(diff)<0.01?'#10b981':'#ef4444'};font-weight:600">
              ${Math.abs(diff) < 0.01 ? 'âœ… Balanceado' : `Falta: ${Utils.formatCurrency(diff)}`}
            </span>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="ProjetoFinanceiro.openAddRecebimento('${p.id}')">+ Parcela</button>
      </div>

      ${recs.length === 0 ? `
        <div class="empty-state" style="padding:30px">
          <div class="empty-icon">ðŸ’µ</div>
          <div>Nenhuma parcela configurada.</div>
          <div class="text-xs text-muted mt-1">Configure o cronograma de recebimentos do projeto.</div>
        </div>` : `
        <table class="tbl">
          <thead>
            <tr><th>#</th><th>DescriÃ§Ã£o</th><th>Valor</th><th>Vencimento</th><th>Pagamento</th><th>Status</th><th>Financeiro</th><th>AÃ§Ãµes</th></tr>
          </thead>
          <tbody>
            ${recs.map((r, i) => {
              const dias = Utils.daysUntil(r.vencimento);
              const atrasado = r.status !== 'recebido' && dias !== null && dias < 0;
              return `<tr>
                <td class="text-xs text-muted font-bold">${i + 1}</td>
                <td class="font-bold text-sm">${Utils.escHtml(r.descricao || `Parcela ${i+1}`)}</td>
                <td class="font-bold">${Utils.formatCurrency(r.valor)}</td>
                <td class="text-sm ${atrasado ? 'text-danger' : ''}">
                  ${Utils.formatDate(r.vencimento)}
                  ${atrasado ? `<div class="text-xs">âš  ${Math.abs(dias)}d atraso</div>` : ''}
                </td>
                <td class="text-xs text-muted">${Utils.escHtml(r.formaPagamento || 'â€”')}</td>
                <td>${r.status === 'recebido'
                  ? `<span class="badge badge-green">âœ… Recebido</span><div class="text-xs text-muted">${Utils.formatDate(r.dataRecebimento)}</div>`
                  : `<span class="badge badge-yellow">â³ Pendente</span>`}</td>
                <td>${r.lancadoFinanceiro
                  ? `<span class="badge badge-green text-xs">âœ… LanÃ§ado</span>`
                  : `<span class="badge badge-gray text-xs">NÃ£o lanÃ§ado</span>`}</td>
                <td>
                  <div class="tbl-actions">
                    ${r.status !== 'recebido' ? `
                      <button class="btn btn-xs btn-primary" onclick="ProjetoFinanceiro.marcarRecebido('${p.id}','${r.id}')">âœ… Receber</button>
                    ` : ''}
                    ${!r.lancadoFinanceiro ? `
                      <button class="btn btn-xs btn-secondary" onclick="ProjetoFinanceiro.lancarFinanceiro('${p.id}','${r.id}')">ðŸ“¤ LanÃ§ar</button>
                    ` : ''}
                    <button class="btn btn-xs btn-danger" onclick="ProjetoFinanceiro.removeRecebimento('${p.id}','${r.id}')">ðŸ—‘</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>

        <div style="margin-top:12px;padding:10px;background:var(--bg);border-radius:var(--radius);font-size:13px">
          ðŸ’¡ <strong>LanÃ§ar no Financeiro:</strong> gera um recebÃ­vel no controle geral da empresa com a data de vencimento configurada.
          <strong>Receber:</strong> marca como pago e registra o recebimento no caixa.
        </div>
      `}
    `;
  }

  /* ====================================================
     PAINEL CUSTOS
     ==================================================== */
  function _renderCustos(p, fin) {
    const custos = fin.custos || [];
    const total = custos.reduce((s, c) => s + (c.valor || 0), 0);

    return `
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="font-bold">Custos do Projeto</div>
          <div class="text-xs text-muted">Total lanÃ§ado: <strong>${Utils.formatCurrency(total)}</strong></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="ProjetoFinanceiro.openAddCusto('${p.id}')">+ Custo</button>
      </div>

      ${custos.length === 0 ? `
        <div class="empty-state" style="padding:30px">
          <div class="empty-icon">ðŸ“¦</div>
          <div>Nenhum custo lanÃ§ado neste projeto.</div>
          <div class="text-xs text-muted mt-1">Lance deslocamentos, materiais, subcontrataÃ§Ãµes e outros custos diretos.</div>
        </div>` : `
        <table class="tbl">
          <thead>
            <tr><th>DescriÃ§Ã£o</th><th>Categoria</th><th>Fornecedor</th><th>Data</th><th>Valor</th><th>Financeiro</th><th>AÃ§Ãµes</th></tr>
          </thead>
          <tbody>
            ${custos.map(c => `<tr>
              <td class="font-bold text-sm">${Utils.escHtml(c.descricao)}</td>
              <td class="text-xs text-muted">${Utils.escHtml(c.categoria || 'â€”')}</td>
              <td class="text-sm">${Utils.escHtml(c.fornecedor || 'â€”')}</td>
              <td class="text-sm text-muted">${Utils.formatDate(c.data)}</td>
              <td class="font-bold text-danger">${Utils.formatCurrency(c.valor)}</td>
              <td>${c.lancadoFinanceiro
                ? `<span class="badge badge-green text-xs">âœ… LanÃ§ado</span>`
                : `<span class="badge badge-gray text-xs">NÃ£o lanÃ§ado</span>`}</td>
              <td>
                <div class="tbl-actions">
                  ${!c.lancadoFinanceiro ? `
                    <button class="btn btn-xs btn-secondary" onclick="ProjetoFinanceiro.lancarCustoFinanceiro('${p.id}','${c.id}')">ðŸ“¤ LanÃ§ar</button>
                  ` : ''}
                  <button class="btn btn-xs btn-danger" onclick="ProjetoFinanceiro.removeCusto('${p.id}','${c.id}')">ðŸ—‘</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>

        <div class="flex justify-between mt-3 font-bold" style="padding:10px;background:var(--bg);border-radius:var(--radius)">
          <span>Total de Custos</span>
          <span style="color:#ef4444">${Utils.formatCurrency(total)}</span>
        </div>

        <div style="margin-top:8px;font-size:13px;color:var(--text-muted)">
          ðŸ’¡ <strong>LanÃ§ar no Financeiro:</strong> registra como conta a pagar no controle geral da empresa,
          garantindo que o caixa reflita esses gastos.
        </div>
      `}
    `;
  }

  /* ====================================================
     PAINEL PARCEIROS
     ==================================================== */
  function _renderParceiros(p, fin, dre) {
    const parceiros = fin.parceiros || [];

    return `
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="font-bold">Parceiros / ComissÃµes</div>
          <div class="text-xs text-muted">ComissÃµes calculadas sobre o lucro bruto do projeto</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="ProjetoFinanceiro.openAddParceiro('${p.id}')">+ Parceiro</button>
      </div>

      <!-- Aviso de base de cÃ¡lculo -->
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:var(--radius);padding:10px 14px;margin-bottom:14px;font-size:13px">
        ðŸ“ <strong>Base de cÃ¡lculo:</strong> Lucro Bruto = ${Utils.formatCurrency(dre.lucroBruto)}
        (Receita ${Utils.formatCurrency(dre.receita)} âˆ’ Custos ${Utils.formatCurrency(dre.custoTotal)})
      </div>

      ${parceiros.length === 0 ? `
        <div class="empty-state" style="padding:30px">
          <div class="empty-icon">ðŸ¤</div>
          <div>Nenhum parceiro cadastrado.</div>
          <div class="text-xs text-muted mt-1">Adicione parceiros com comissÃ£o % sobre lucro bruto ou valor fixo.</div>
        </div>` : `
        <table class="tbl">
          <thead>
            <tr><th>Nome / Empresa</th><th>Tipo</th><th>Base / Valor</th><th>Valor a Pagar</th><th>Vencimento</th><th>Status</th><th>Financeiro</th><th>AÃ§Ãµes</th></tr>
          </thead>
          <tbody>
            ${parceiros.map(par => {
              const valorPagar = par.tipo === 'comissao'
                ? (dre.lucroBruto > 0 ? dre.lucroBruto * (par.percentual || 0) / 100 : 0)
                : (par.valorFixo || 0);
              return `<tr>
                <td class="font-bold text-sm">${Utils.escHtml(par.nome)}</td>
                <td>${par.tipo === 'comissao'
                  ? `<span class="badge badge-purple">% ComissÃ£o</span>`
                  : `<span class="badge badge-blue">Fixo</span>`}</td>
                <td class="text-sm">${par.tipo === 'comissao'
                  ? `${par.percentual}% sobre lucro bruto`
                  : Utils.formatCurrency(par.valorFixo)}</td>
                <td class="font-bold" style="color:#f59e0b">${Utils.formatCurrency(valorPagar)}</td>
                <td class="text-sm text-muted">${Utils.formatDate(par.vencimento) || 'â€”'}</td>
                <td>${par.status === 'pago'
                  ? `<span class="badge badge-green">âœ… Pago</span>`
                  : `<span class="badge badge-yellow">â³ Pendente</span>`}</td>
                <td>${par.lancadoFinanceiro
                  ? `<span class="badge badge-green text-xs">âœ… LanÃ§ado</span>`
                  : `<span class="badge badge-gray text-xs">NÃ£o lanÃ§ado</span>`}</td>
                <td>
                  <div class="tbl-actions">
                    ${par.status !== 'pago' ? `
                      <button class="btn btn-xs btn-primary" onclick="ProjetoFinanceiro.marcarParceiroPago('${p.id}','${par.id}')">âœ… Pagar</button>
                    ` : ''}
                    ${!par.lancadoFinanceiro ? `
                      <button class="btn btn-xs btn-secondary" onclick="ProjetoFinanceiro.lancarParceiroFinanceiro('${p.id}','${par.id}')">ðŸ“¤ LanÃ§ar</button>
                    ` : ''}
                    <button class="btn btn-xs btn-danger" onclick="ProjetoFinanceiro.removeParceiro('${p.id}','${par.id}')">ðŸ—‘</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>

        <div class="flex justify-between mt-3 font-bold" style="padding:10px;background:var(--bg);border-radius:var(--radius)">
          <span>Total de ComissÃµes / Pagamentos</span>
          <span style="color:#f59e0b">${Utils.formatCurrency(dre.totalComissoes)}</span>
        </div>
      `}
    `;
  }

  /* ====================================================
     AÃ‡Ã•ES â€” RECEBIMENTOS
     ==================================================== */
  function openAddRecebimento(projetoId) {
    const p = _get(projetoId);
    if (!p) return;
    const fin = _fin(p);
    const recs = fin.recebimentos || [];
    const idx = recs.length + 1;

    Modal.open({
      title: '+ Nova Parcela / MediÃ§Ã£o',
      size: 'modal-sm',
      body: `
        <div class="form-group">
          <label class="form-label">DescriÃ§Ã£o</label>
          <input class="form-control" id="pfRecDescricao" value="Parcela ${idx}" placeholder="Ex: Parcela 1, MediÃ§Ã£o Final...">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor (R$) *</label>
            <input class="form-control" id="pfRecValor" type="number" step="0.01" placeholder="0,00">
          </div>
          <div class="form-group">
            <label class="form-label">Vencimento *</label>
            <input class="form-control" id="pfRecVencimento" type="date" value="${Utils.todayStr()}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Forma de Pagamento</label>
          <select class="form-control" id="pfRecForma">
            <option value="">â€”</option>
            <option value="PIX">PIX</option>
            <option value="TransferÃªncia">TransferÃªncia BancÃ¡ria</option>
            <option value="Boleto">Boleto</option>
            <option value="Cheque">Cheque</option>
            <option value="Dinheiro">Dinheiro</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="pfRecLancar" checked>
          <span class="text-sm">LanÃ§ar automaticamente no financeiro geral (Contas a Receber)</span>
        </label>
      `,
      saveCb: () => _saveRecebimento(projetoId),
    });
  }

  function _saveRecebimento(projetoId) {
    const valor = Number(document.getElementById('pfRecValor').value);
    const vencimento = document.getElementById('pfRecVencimento').value;
    if (!valor || !vencimento) { Toast.error('Valor e vencimento obrigatÃ³rios'); return; }

    const p = _get(projetoId);
    const fin = _fin(p);
    const novoId = Date.now().toString(36) + Math.random().toString(36).substr(2,4);
    const lancar = document.getElementById('pfRecLancar').checked;

    const rec = {
      id: novoId,
      descricao: document.getElementById('pfRecDescricao').value.trim() || `Parcela ${(fin.recebimentos||[]).length + 1}`,
      valor,
      vencimento,
      formaPagamento: document.getElementById('pfRecForma').value,
      status: 'pendente',
      lancadoFinanceiro: false,
      recebiveisId: null, // serÃ¡ preenchido ao lanÃ§ar
    };

    fin.recebimentos = [...(fin.recebimentos || []), rec];

    if (lancar) _lancarRecebimentoGeral(p, rec); // seta rec.recebiveisId + rec.lancadoFinanceiro

    _save(projetoId, fin); // salva uma vez apÃ³s o lanÃ§amento

    Modal.close();
    Toast.success('Parcela adicionada!');
    setTimeout(() => open(projetoId), 200);
  }

  function marcarRecebido(projetoId, recId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    const rec = (fin.recebimentos || []).find(r => r.id === recId);
    if (!rec) return;

    // Mini modal para confirmar data de recebimento
    Modal.open({
      title: 'âœ… Confirmar Recebimento',
      size: 'modal-sm',
      body: `
        <p class="text-sm mb-3">Confirme a data de recebimento de <strong>${Utils.formatCurrency(rec.valor)}</strong> â€” ${Utils.escHtml(rec.descricao)}.</p>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de Recebimento</label>
            <input class="form-control" id="pfDataReceb" type="date" value="${Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Forma de Pagamento</label>
            <select class="form-control" id="pfFormaReceb">
              <option value="PIX" ${rec.formaPagamento==='PIX'?'selected':''}>PIX</option>
              <option value="TransferÃªncia" ${rec.formaPagamento==='TransferÃªncia'?'selected':''}>TransferÃªncia</option>
              <option value="Boleto" ${rec.formaPagamento==='Boleto'?'selected':''}>Boleto</option>
              <option value="Cheque" ${rec.formaPagamento==='Cheque'?'selected':''}>Cheque</option>
              <option value="Dinheiro" ${rec.formaPagamento==='Dinheiro'?'selected':''}>Dinheiro</option>
            </select>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="pfLancarCaixa" checked>
          <span class="text-sm">Registrar no caixa geral (LanÃ§amentos)</span>
        </label>
      `,
      saveCb: () => {
        const dataRecebimento = document.getElementById('pfDataReceb').value;
        const forma = document.getElementById('pfFormaReceb').value;
        const lancarCaixa = document.getElementById('pfLancarCaixa').checked;

        rec.status = 'recebido';
        rec.dataRecebimento = dataRecebimento;
        rec.formaPagamento = forma;

        // Fecha o registro no financeiro geral (Contas a Receber) se existir
        if (rec.recebiveisId) {
          DB.update('recebiveis', rec.recebiveisId, {
            status: 'recebido',
            dataRecebimento,
            formaPagamento: forma,
          });
        }

        // Registra entrada no caixa geral
        if (lancarCaixa) {
          DB.create('lancamentos', {
            descricao: `${p.titulo} â€” ${rec.descricao}`,
            valor: rec.valor,
            tipo: 'receita',
            data: dataRecebimento,
            categoria: 'ServiÃ§os de Engenharia',
            formaPagamento: forma,
            projetoId,
            origem: 'projeto_financeiro',
          });
          rec.lancadoFinanceiro = true;
        }

        _save(projetoId, fin);
        Modal.close();
        Toast.success('Recebimento registrado!');
        setTimeout(() => open(projetoId), 200);
      },
    });
  }

  function lancarFinanceiro(projetoId, recId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    const rec = (fin.recebimentos || []).find(r => r.id === recId);
    if (!rec) return;

    // LanÃ§a em recebiveis (contas a receber) e guarda o ID para fechar depois
    const recebivel = DB.create('recebiveis', {
      descricao: `${p.titulo} â€” ${rec.descricao}`,
      clienteId: p.clienteId,
      valor: rec.valor,
      vencimento: rec.vencimento,
      status: 'pendente',
      formaPagamento: rec.formaPagamento,
      projetoId,
      origem: 'projeto_financeiro',
    });
    rec.recebiveisId = recebivel.id; // link para fechar ao receber
    rec.lancadoFinanceiro = true;
    _save(projetoId, fin);
    Toast.success('Parcela lanÃ§ada no financeiro geral!');
    _refresh(projetoId);
  }

  function removeRecebimento(projetoId, recId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    fin.recebimentos = (fin.recebimentos || []).filter(r => r.id !== recId);
    _save(projetoId, fin);
    Toast.success('Parcela removida');
    _refresh(projetoId);
  }

  /* ====================================================
     AÃ‡Ã•ES â€” CUSTOS
     ==================================================== */
  function openAddCusto(projetoId) {
    Modal.open({
      title: '+ Novo Custo',
      size: 'modal-sm',
      body: `
        <div class="form-group">
          <label class="form-label">DescriÃ§Ã£o *</label>
          <input class="form-control" id="pfCustoDesc" placeholder="Ex: Deslocamento, Material, SubcontrataÃ§Ã£o...">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor (R$) *</label>
            <input class="form-control" id="pfCustoValor" type="number" step="0.01">
          </div>
          <div class="form-group">
            <label class="form-label">Data</label>
            <input class="form-control" id="pfCustoData" type="date" value="${Utils.todayStr()}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select class="form-control" id="pfCustoCat">
              <option value="">â€”</option>
              <option value="Deslocamento">Deslocamento / CombustÃ­vel</option>
              <option value="Hospedagem">Hospedagem / AlimentaÃ§Ã£o</option>
              <option value="Materiais">Materiais / Equipamentos</option>
              <option value="SubcontrataÃ§Ã£o">SubcontrataÃ§Ã£o</option>
              <option value="EPI">EPIs / SeguranÃ§a</option>
              <option value="Outros">Outros</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fornecedor / Nome</label>
            <input class="form-control" id="pfCustoForn" placeholder="Opcional">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="pfCustoLancar" checked>
          <span class="text-sm">LanÃ§ar como despesa no financeiro geral (Contas a Pagar)</span>
        </label>
      `,
      saveCb: () => _saveCusto(projetoId),
    });
  }

  function _saveCusto(projetoId) {
    const desc = document.getElementById('pfCustoDesc').value.trim();
    const valor = Number(document.getElementById('pfCustoValor').value);
    if (!desc || !valor) { Toast.error('DescriÃ§Ã£o e valor obrigatÃ³rios'); return; }

    const p = _get(projetoId);
    const fin = _fin(p);
    const novoId = Date.now().toString(36) + Math.random().toString(36).substr(2,4);
    const lancar = document.getElementById('pfCustoLancar').checked;

    const custo = {
      id: novoId,
      descricao: desc,
      valor,
      data: document.getElementById('pfCustoData').value,
      categoria: document.getElementById('pfCustoCat').value,
      fornecedor: document.getElementById('pfCustoForn').value.trim(),
      lancadoFinanceiro: false,
    };

    fin.custos = [...(fin.custos || []), custo];
    _save(projetoId, fin);

    if (lancar) {
      DB.create('contaspagar', {
        fornecedor: custo.fornecedor || custo.descricao,
        descricao: `${p.titulo} â€” ${custo.descricao}`,
        valor: custo.valor,
        vencimento: custo.data,
        status: 'pendente',
        categoria: custo.categoria || 'Custos de Projeto',
        projetoId,
        origem: 'projeto_financeiro',
      });
      custo.lancadoFinanceiro = true;
      _save(projetoId, fin);
    }

    Modal.close();
    Toast.success('Custo lanÃ§ado!');
    setTimeout(() => open(projetoId), 200);
  }

  function lancarCustoFinanceiro(projetoId, custoId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    const custo = (fin.custos || []).find(c => c.id === custoId);
    if (!custo) return;

    DB.create('contaspagar', {
      fornecedor: custo.fornecedor || custo.descricao,
      descricao: `${p.titulo} â€” ${custo.descricao}`,
      valor: custo.valor,
      vencimento: custo.data,
      status: 'pendente',
      categoria: custo.categoria || 'Custos de Projeto',
      projetoId,
      origem: 'projeto_financeiro',
    });
    custo.lancadoFinanceiro = true;
    _save(projetoId, fin);
    Toast.success('Custo lanÃ§ado no financeiro geral!');
    _refresh(projetoId);
  }

  function removeCusto(projetoId, custoId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    fin.custos = (fin.custos || []).filter(c => c.id !== custoId);
    _save(projetoId, fin);
    Toast.success('Custo removido');
    _refresh(projetoId);
  }

  /* ====================================================
     AÃ‡Ã•ES â€” PARCEIROS
     ==================================================== */
  function openAddParceiro(projetoId) {
    const p = _get(projetoId);
    const dre = calcDRE(p);

    Modal.open({
      title: '+ Novo Parceiro / ComissÃ£o',
      size: 'modal-sm',
      body: `
        <div class="form-group">
          <label class="form-label">Nome / Empresa *</label>
          <input class="form-control" id="pfParNome" placeholder="Ex: Eng. JoÃ£o Silva, Empresa XYZ">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de RemuneraÃ§Ã£o *</label>
          <select class="form-control" id="pfParTipo" onchange="ProjetoFinanceiro._toggleTipoParceiro()">
            <option value="comissao">% ComissÃ£o sobre Lucro Bruto</option>
            <option value="fixo">Valor Fixo</option>
          </select>
        </div>

        <div id="pfParComissaoGrp">
          <div class="form-group">
            <label class="form-label">Percentual de ComissÃ£o (%)</label>
            <input class="form-control" id="pfParPercentual" type="number" step="0.1" min="0" max="100" placeholder="Ex: 10">
          </div>
          <div style="background:#f0fdf4;border-radius:var(--radius);padding:8px 12px;font-size:13px;margin-bottom:12px">
            ðŸ’¡ Lucro Bruto atual: <strong>${Utils.formatCurrency(dre.lucroBruto)}</strong>
            â€” valor serÃ¡ recalculado ao fechar o projeto.
          </div>
        </div>

        <div id="pfParFixoGrp" style="display:none">
          <div class="form-group">
            <label class="form-label">Valor Fixo (R$)</label>
            <input class="form-control" id="pfParValorFixo" type="number" step="0.01" placeholder="0,00">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de Pagamento</label>
            <input class="form-control" id="pfParVencimento" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">ObservaÃ§Ãµes</label>
            <input class="form-control" id="pfParObs" placeholder="Acordo, contrato, etc.">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="pfParLancar">
          <span class="text-sm">LanÃ§ar como conta a pagar no financeiro geral</span>
        </label>
      `,
      saveCb: () => _saveParceiro(projetoId),
    });
  }

  function _toggleTipoParceiro() {
    const tipo = document.getElementById('pfParTipo').value;
    document.getElementById('pfParComissaoGrp').style.display = tipo === 'comissao' ? '' : 'none';
    document.getElementById('pfParFixoGrp').style.display = tipo === 'fixo' ? '' : 'none';
  }

  function _saveParceiro(projetoId) {
    const nome = document.getElementById('pfParNome').value.trim();
    const tipo = document.getElementById('pfParTipo').value;
    if (!nome) { Toast.error('Nome obrigatÃ³rio'); return; }

    const p = _get(projetoId);
    const fin = _fin(p);
    const dre = calcDRE(p);
    const novoId = Date.now().toString(36) + Math.random().toString(36).substr(2,4);
    const lancar = document.getElementById('pfParLancar').checked;

    const percentual = Number(document.getElementById('pfParPercentual').value) || 0;
    const valorFixo  = Number(document.getElementById('pfParValorFixo').value) || 0;
    const vencimento = document.getElementById('pfParVencimento').value;

    const valorPagar = tipo === 'comissao'
      ? (dre.lucroBruto > 0 ? dre.lucroBruto * percentual / 100 : 0)
      : valorFixo;

    const parceiro = {
      id: novoId,
      nome,
      tipo,
      percentual: tipo === 'comissao' ? percentual : null,
      valorFixo: tipo === 'fixo' ? valorFixo : null,
      vencimento,
      observacoes: document.getElementById('pfParObs').value.trim(),
      status: 'pendente',
      lancadoFinanceiro: false,
    };

    fin.parceiros = [...(fin.parceiros || []), parceiro];
    _save(projetoId, fin);

    if (lancar && valorPagar > 0 && vencimento) {
      DB.create('contaspagar', {
        fornecedor: nome,
        descricao: `ComissÃ£o/Parceria â€” ${p.titulo}`,
        valor: valorPagar,
        vencimento,
        status: 'pendente',
        categoria: 'ComissÃµes / Parcerias',
        projetoId,
        origem: 'projeto_financeiro',
      });
      parceiro.lancadoFinanceiro = true;
      _save(projetoId, fin);
    }

    Modal.close();
    Toast.success('Parceiro adicionado!');
    setTimeout(() => open(projetoId), 200);
  }

  function marcarParceiroPago(projetoId, parceiroId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    const par = (fin.parceiros || []).find(x => x.id === parceiroId);
    if (!par) return;
    const dre = calcDRE(p);
    const valorPagar = par.tipo === 'comissao'
      ? (dre.lucroBruto > 0 ? dre.lucroBruto * (par.percentual || 0) / 100 : 0)
      : (par.valorFixo || 0);

    Modal.open({
      title: 'âœ… Registrar Pagamento ao Parceiro',
      size: 'modal-sm',
      body: `
        <p class="text-sm mb-3">Confirmar pagamento de <strong>${Utils.formatCurrency(valorPagar)}</strong> para <strong>${Utils.escHtml(par.nome)}</strong>.</p>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data do Pagamento</label>
            <input class="form-control" id="pfParDataPgto" type="date" value="${Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Forma de Pagamento</label>
            <select class="form-control" id="pfParFormaPgto">
              <option value="PIX">PIX</option>
              <option value="TransferÃªncia">TransferÃªncia</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="pfParLancarPgto" checked>
          <span class="text-sm">Registrar saÃ­da no caixa geral (LanÃ§amentos)</span>
        </label>
      `,
      saveCb: () => {
        const data = document.getElementById('pfParDataPgto').value;
        const forma = document.getElementById('pfParFormaPgto').value;
        const lancar = document.getElementById('pfParLancarPgto').checked;

        par.status = 'pago';
        par.dataPagamento = data;

        if (lancar) {
          DB.create('lancamentos', {
            descricao: `ComissÃ£o ${par.nome} â€” ${p.titulo}`,
            valor: valorPagar,
            tipo: 'despesa',
            data,
            categoria: 'ComissÃµes / Parcerias',
            formaPagamento: forma,
            projetoId,
            origem: 'projeto_financeiro',
          });
          par.lancadoFinanceiro = true;
        }

        _save(projetoId, fin);
        Modal.close();
        Toast.success('Pagamento ao parceiro registrado!');
        setTimeout(() => open(projetoId), 200);
      },
    });
  }

  function lancarParceiroFinanceiro(projetoId, parceiroId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    const par = (fin.parceiros || []).find(x => x.id === parceiroId);
    if (!par) return;
    const dre = calcDRE(p);
    const valorPagar = par.tipo === 'comissao'
      ? (dre.lucroBruto > 0 ? dre.lucroBruto * (par.percentual || 0) / 100 : 0)
      : (par.valorFixo || 0);

    if (!valorPagar) { Toast.error('Valor zerado â€” registre os custos do projeto primeiro.'); return; }
    if (!par.vencimento) { Toast.error('Defina a data de pagamento do parceiro antes de lanÃ§ar.'); return; }

    DB.create('contaspagar', {
      fornecedor: par.nome,
      descricao: `ComissÃ£o/Parceria â€” ${p.titulo}`,
      valor: valorPagar,
      vencimento: par.vencimento,
      status: 'pendente',
      categoria: 'ComissÃµes / Parcerias',
      projetoId,
      origem: 'projeto_financeiro',
    });
    par.lancadoFinanceiro = true;
    _save(projetoId, fin);
    Toast.success('ComissÃ£o lanÃ§ada no financeiro geral!');
    _refresh(projetoId);
  }

  function removeParceiro(projetoId, parceiroId) {
    const p = _get(projetoId);
    const fin = _fin(p);
    fin.parceiros = (fin.parceiros || []).filter(x => x.id !== parceiroId);
    _save(projetoId, fin);
    Toast.success('Parceiro removido');
    _refresh(projetoId);
  }

  /* ====================================================
     LANÃ‡AMENTO INICIAL NO FINANCEIRO GERAL
     (chamado quando status â†’ em_andamento/contratado)
     ==================================================== */
  function sugerirConfiguracaoPagamentos(projetoId) {
    const p = _get(projetoId);
    if (!p || !p.valor) return;
    const fin = _fin(p);
    if ((fin.recebimentos || []).length > 0) return; // jÃ¡ configurado

    setTimeout(() => {
      Toast.show(
        `ðŸ’° Projeto "<strong>${Utils.escHtml(p.titulo)}</strong>" em andamento. ` +
        `<a href="#" onclick="ProjetoFinanceiro.open('${projetoId}');return false;" style="color:var(--primary);font-weight:600">` +
        `Configure o cronograma de recebimentos â†’</a>`,
        8000
      );
    }, 800);
  }

  /* ====================================================
     UTILITÃRIOS
     ==================================================== */
  function _lancarRecebimentoGeral(p, rec) {
    // Cria em Contas a Receber e guarda o ID para fechar ao confirmar recebimento
    const recebivel = DB.create('recebiveis', {
      descricao: `${p.titulo} â€” ${rec.descricao}`,
      clienteId: p.clienteId,
      valor: rec.valor,
      vencimento: rec.vencimento,
      status: 'pendente',
      formaPagamento: rec.formaPagamento,
      projetoId: p.id,
      origem: 'projeto_financeiro',
    });
    rec.recebiveisId = recebivel.id; // link para fechar ao confirmar recebimento
    rec.lancadoFinanceiro = true;
  }

  function _refresh(projetoId) {
    // Re-renderiza o corpo do modal sem fechar
    const p = _get(projetoId);
    if (!p) return;
    const body = document.querySelector('.modal-body');
    if (body) {
      body.innerHTML = _buildBody(p);
    }
  }

  /* ====================================================
     API PÃšBLICA
     ==================================================== */
  return {
    open,
    calcDRE,
    // Recebimentos
    openAddRecebimento,
    marcarRecebido,
    lancarFinanceiro,
    removeRecebimento,
    // Custos
    openAddCusto,
    lancarCustoFinanceiro,
    removeCusto,
    // Parceiros
    openAddParceiro,
    marcarParceiroPago,
    lancarParceiroFinanceiro,
    removeParceiro,
    // Hooks
    sugerirConfiguracaoPagamentos,
    // Internos expostos para inline events
    _switchTab,
    _toggleTipoParceiro,
  };
})();
