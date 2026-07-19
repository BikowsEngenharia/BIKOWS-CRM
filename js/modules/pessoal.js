/* ==========================================
   PESSOAL — Meu Financeiro (controle pessoal)
   Entradas puxadas do lado empresa (salário da
   Folha + retiradas selecionadas) + despesas
   pessoais manuais.
   ========================================== */
const Pessoal = (() => {

  let _mes = Utils.todayStr().substring(0, 7);

  const CATS_DESP = ['Moradia','Alimentação','Transporte','Saúde','Educação','Lazer','Assinaturas','Cartão de Crédito','Investimentos','Outros'];
  const CATS_REC  = ['Salário','Retirada da Empresa','Rendimentos','Outros'];

  const MESES_LB = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function _mesLabel(m) { const [y, mo] = m.split('-'); return MESES_LB[parseInt(mo) - 1] + '/' + y; }
  function _addMes(m, n) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

  /* ---- RENDER ---- */
  function render() {
    const all = DB.getAll('pessoal_lancamentos');
    const doMes = all.filter(l => (l.data || '').startsWith(_mes));
    const rec = doMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0);
    const dsp = doMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0);
    const saldoMes = rec - dsp;
    const saldoTotal = all.reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : -l.valor), 0);
    const hoje = Utils.todayStr().substring(0, 7);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Meu Financeiro</h2>
        <div class="sec-actions">
          <div style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:3px 6px">
            <button class="btn btn-ghost btn-sm" onclick="Pessoal.mudarMes(-1)">←</button>
            <span class="font-bold" style="min-width:76px;text-align:center;font-size:13px">${_mesLabel(_mes)}</span>
            <button class="btn btn-ghost btn-sm" onclick="Pessoal.mudarMes(1)">→</button>
            ${_mes !== hoje ? `<button class="btn btn-xs btn-secondary" onclick="Pessoal.irHoje()">Hoje</button>` : ''}
          </div>
          <button class="btn btn-success btn-sm" onclick="Pessoal.novaReceita()">+ Entrada</button>
          <button class="btn btn-danger btn-sm" onclick="Pessoal.novaDespesa()">+ Despesa</button>
        </div>
      </div>

      <div class="fin-kpi" style="grid-template-columns:repeat(2,1fr)">
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Entradas do Mês</div><div class="fin-kpi-val text-success">${Utils.formatCurrency(rec)}</div><div class="fk-sub">${doMes.filter(l=>l.tipo==='receita').length} lançamento(s)</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Despesas do Mês</div><div class="fin-kpi-val text-danger">${Utils.formatCurrency(dsp)}</div><div class="fk-sub">${doMes.filter(l=>l.tipo==='despesa').length} lançamento(s)</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Sobra do Mês</div><div class="fin-kpi-val ${saldoMes>=0?'text-success':'text-danger'}">${Utils.formatCurrency(saldoMes)}</div><div class="fk-sub">${rec>0?((saldoMes/rec)*100).toFixed(0)+'% da renda':'—'}</div></div>
        <div class="fin-kpi-cell"><div class="fin-kpi-label">Saldo Acumulado</div><div class="fin-kpi-val ${saldoTotal>=0?'text-success':'text-danger'}">${Utils.formatCurrency(saldoTotal)}</div><div class="fk-sub">Todo o histórico</div></div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card"><div class="card-header"><div class="card-title">📊 Sobra Mensal — 6 meses</div></div><div class="card-body"><div id="chartPessoal6m" style="height:170px"></div></div></div>
        <div class="card"><div class="card-header"><div class="card-title">🍩 Despesas por Categoria — ${_mesLabel(_mes)}</div></div><div class="card-body"><div id="chartPessoalCat"></div></div></div>
      </div>

      ${_buildImportar()}

      <div class="card">
        <div class="card-header">
          <div class="card-title">📋 Lançamentos de ${_mesLabel(_mes)}</div>
          <span class="text-sm text-muted">${doMes.length} lançamento(s)</span>
        </div>
        <div class="table-wrap">
          ${doMes.length === 0 ? '<div class="empty-state"><div class="empty-icon">💼</div><div class="empty-title">Nenhum lançamento neste mês</div><div class="empty-sub">Puxe seu salário/retiradas acima ou adicione manualmente.</div></div>' : `
          <table class="tbl"><thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th>Ações</th></tr></thead>
          <tbody>${[...doMes].sort((a,b)=>(b.data||'').localeCompare(a.data||'')).map(l => {
            const iR = l.tipo === 'receita';
            const origemBadge = l.origem === 'folha' ? '<span class="badge badge-blue" style="font-size:9px">Folha</span>'
                              : l.origem === 'retirada' ? '<span class="badge badge-purple" style="font-size:9px">Empresa</span>' : '';
            return `<tr>
              <td><span class="badge ${iR?'badge-green':'badge-red'}">${iR?'⬆':'⬇'}</span></td>
              <td class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(l.descricao, 40))} ${origemBadge}</td>
              <td class="text-xs text-muted">${Utils.escHtml(l.categoria || '—')}</td>
              <td class="text-sm">${Utils.formatDate(l.data)}</td>
              <td class="font-bold ${iR?'text-success':'text-danger'}">${Utils.formatCurrency(l.valor)}</td>
              <td><div class="tbl-actions">
                ${l.origem === 'manual' || !l.origem ? `<button class="btn btn-xs btn-secondary" onclick="Pessoal.editar('${l.id}')">✏</button>` : ''}
                <button class="btn btn-xs btn-danger" onclick="Pessoal.excluir('${l.id}')">🗑</button>
              </div></td>
            </tr>`;
          }).join('')}</tbody></table>`}
        </div>
      </div>`;

    setTimeout(_renderCharts, 50);
  }

  /* ---- IMPORTAR DO CRM (salário + retiradas selecionadas) ---- */
  function _buildImportar() {
    const cfg = DB.getConfig();
    const funcionarios = DB.getAll('funcionarios').filter(f => f.ativo !== false);
    const meuFuncId = cfg.pessoalFuncId || '';
    const importados = new Set(DB.getAll('pessoal_lancamentos').map(l => l.origemId).filter(Boolean));

    // Salários da folha do funcionário vinculado (ainda não puxados)
    let folhaHtml = '<div class="text-xs text-muted">Selecione seu nome acima para ver os salários da Folha.</div>';
    if (meuFuncId) {
      const folhas = DB.getAll('folha')
        .filter(r => r.funcionarioId === meuFuncId && !importados.has('folha:' + r.id))
        .sort((a, b) => (b.mes || '').localeCompare(a.mes || ''))
        .slice(0, 6);
      folhaHtml = folhas.length === 0
        ? '<div class="text-xs text-muted">✓ Nenhum salário pendente de puxar.</div>'
        : folhas.map(r => `
          <div class="parcela-row">
            <div style="flex:1"><div class="text-sm font-semibold">Salário ${Utils.escHtml(r.mes || '—')}</div>
            <div class="text-xs text-muted">Líquido da Folha</div></div>
            <div class="font-bold text-success">${Utils.formatCurrency(r.liquido || 0)}</div>
            <button class="btn btn-xs btn-success" onclick="Pessoal.puxarFolha('${r.id}')">＋ Puxar</button>
          </div>`).join('');
    }

    // Lançamentos de despesa da empresa (candidatos a retirada) — últimos 90 dias, não puxados
    const corte = Utils.localDateStr(new Date(Date.now() - 90 * 86400000));
    const candidatos = DB.getAll('lancamentos')
      .filter(l => l.tipo === 'despesa' && (l.data || '') >= corte && !importados.has('retirada:' + l.id))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      .slice(0, 8);
    const retiradasHtml = candidatos.length === 0
      ? '<div class="text-xs text-muted">Nenhum lançamento de despesa da empresa nos últimos 90 dias.</div>'
      : candidatos.map(l => `
        <div class="parcela-row">
          <div style="flex:1"><div class="text-sm font-semibold">${Utils.escHtml(Utils.truncate(l.descricao, 34))}</div>
          <div class="text-xs text-muted">${Utils.escHtml(l.categoria || '—')} · ${Utils.formatDate(l.data)}</div></div>
          <div class="font-bold">${Utils.formatCurrency(l.valor)}</div>
          <button class="btn btn-xs btn-primary" onclick="Pessoal.puxarRetirada('${l.id}')" title="Marcar como retirada minha">＋ É minha retirada</button>
        </div>`).join('');

    return `
      <div class="card mb-4">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div class="card-title">📥 Puxar do CRM da Empresa</div>
          <select class="filter-select" onchange="Pessoal.setFuncionario(this.value)" title="Seu cadastro de funcionário">
            <option value="">— Vincular meu nome (funcionário) —</option>
            ${funcionarios.map(f => `<option value="${f.id}" ${meuFuncId === f.id ? 'selected' : ''}>${Utils.escHtml(f.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="card-body">
          <div class="grid-2" style="gap:16px">
            <div>
              <div class="form-label mb-2">💵 Salários da Folha</div>
              ${folhaHtml}
            </div>
            <div>
              <div class="form-label mb-2">🏢 Retiradas (lançamentos da empresa)</div>
              ${retiradasHtml}
            </div>
          </div>
        </div>
      </div>`;
  }

  function setFuncionario(id) {
    DB.saveConfig({ pessoalFuncId: id });
    render();
  }

  function puxarFolha(folhaId) {
    const r = DB.get('folha', folhaId); if (!r) return;
    const origemId = 'folha:' + folhaId;
    if (DB.getAll('pessoal_lancamentos').some(l => l.origemId === origemId)) { Toast.warning('Já puxado.'); return; }
    DB.create('pessoal_lancamentos', {
      tipo: 'receita', categoria: 'Salário',
      descricao: `Salário ${r.mes || ''}`.trim(),
      valor: r.liquido || 0,
      data: (r.mes ? r.mes + '-05' : Utils.todayStr()),
      origem: 'folha', origemId,
    });
    Toast.success('💵 Salário puxado para o seu financeiro');
    render();
  }

  function puxarRetirada(lancId) {
    const l = DB.get('lancamentos', lancId); if (!l) return;
    const origemId = 'retirada:' + lancId;
    if (DB.getAll('pessoal_lancamentos').some(p => p.origemId === origemId)) { Toast.warning('Já puxado.'); return; }
    DB.create('pessoal_lancamentos', {
      tipo: 'receita', categoria: 'Retirada da Empresa',
      descricao: l.descricao || 'Retirada',
      valor: l.valor,
      data: l.data || Utils.todayStr(),
      origem: 'retirada', origemId,
    });
    Toast.success('🏢 Retirada puxada para o seu financeiro');
    render();
  }

  /* ---- CRUD MANUAL ---- */
  function novaReceita() { _openForm(null, 'receita'); }
  function novaDespesa() { _openForm(null, 'despesa'); }
  function editar(id)    { _openForm(id); }

  function _openForm(id, tipoDefault = 'despesa') {
    const l = id ? DB.get('pessoal_lancamentos', id) : null;
    const tipo = l?.tipo || tipoDefault;
    const cats = tipo === 'receita' ? CATS_REC : CATS_DESP;
    Modal.open({
      title: id ? 'Editar Lançamento' : (tipo === 'receita' ? '+ Entrada Pessoal' : '+ Despesa Pessoal'),
      body: `
        <div class="form-group"><label class="form-label">Descrição *</label><input class="form-control" id="plDesc" value="${Utils.escHtml(l?.descricao || '')}" placeholder="Ex: Mercado, Escola, Investimento…"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Valor (R$) *</label><input class="form-control" id="plValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(l?.valor)}" placeholder="0,00"></div>
          <div class="form-group"><label class="form-label">Data</label><input class="form-control" id="plData" type="date" value="${l?.data || Utils.todayStr()}"></div>
          <div class="form-group"><label class="form-label">Categoria</label><select class="form-control" id="plCat">${cats.map(c => `<option value="${c}" ${l?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        </div>`,
      saveCb: () => {
        const desc = document.getElementById('plDesc').value.trim();
        if (!desc) { Toast.error('Descrição obrigatória'); return; }
        const valor = Utils.parseMoney(document.getElementById('plValor').value);
        if (!valor) { Toast.error('Valor inválido — use o formato 1500,00'); return; }
        const data = {
          tipo, descricao: desc, valor,
          data: document.getElementById('plData').value || Utils.todayStr(),
          categoria: document.getElementById('plCat').value,
          origem: l?.origem || 'manual', origemId: l?.origemId || '',
        };
        if (id) { DB.update('pessoal_lancamentos', id, data); Toast.success('Atualizado'); }
        else    { DB.create('pessoal_lancamentos', data); Toast.success('Lançamento criado'); }
        Modal.close(); render();
      },
    });
  }

  function excluir(id) {
    Utils.confirmDelete('este lançamento pessoal', () => {
      DB.remove('pessoal_lancamentos', id);
      Toast.success('Removido');
      render();
    });
  }

  /* ---- CHARTS ---- */
  function _renderCharts() {
    const all = DB.getAll('pessoal_lancamentos');
    // 6 meses terminando no mês selecionado
    const meses = []; for (let i = 5; i >= 0; i--) meses.push(_addMes(_mes, -i));
    Charts.bar({
      containerId: 'chartPessoal6m',
      data: meses.map(m => {
        const doM = all.filter(l => (l.data || '').startsWith(m));
        const v = doM.reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : -l.valor), 0);
        const [, mo] = m.split('-');
        return { label: MESES_LB[parseInt(mo) - 1], value: v, color: v >= 0 ? '#10b981' : '#C42B2B' };
      }),
      height: 170, showValues: false,
    });
    const cats = {};
    all.filter(l => l.tipo === 'despesa' && (l.data || '').startsWith(_mes)).forEach(l => { cats[l.categoria || 'Outros'] = (cats[l.categoria || 'Outros'] || 0) + l.valor; });
    const cd = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ label: k, value: v }));
    const el = document.getElementById('chartPessoalCat');
    if (cd.length > 0) Charts.donut({ containerId: 'chartPessoalCat', data: cd, size: 120, showLegend: true });
    else if (el) el.innerHTML = '<div class="empty-state" style="padding:16px"><div class="empty-icon">🍩</div><div class="empty-sub">Sem despesas no mês</div></div>';
  }

  /* ---- NAVEGAÇÃO ---- */
  function mudarMes(n) { _mes = _addMes(_mes, n); render(); }
  function irHoje()    { _mes = Utils.todayStr().substring(0, 7); render(); }
  function addNew()    { novaDespesa(); }

  return { render, mudarMes, irHoje, novaReceita, novaDespesa, editar, excluir, setFuncionario, puxarFolha, puxarRetirada, addNew };
})();
