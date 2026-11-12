/* ==========================================
   FECHAMENTO MENSAL

   O problema
   ----------
   O resultado de agosto muda sozinho. Basta alguém editar um lançamento
   antigo, receber uma parcela com data retroativa ou lançar um custo num
   serviço já entregue. Quem olhou o número em setembro e tomou uma decisão
   com ele não tem como saber que o número virou outro.

   O que o fechamento faz
   ----------------------
   1. Congela: guarda os números do mês no instante do fechamento.
   2. Tranca: lançamento com data dentro de mês fechado é recusado, com a
      explicação de como reabrir. Trancar não apaga nada — só impede que o
      passado mude sem que alguém assuma a mudança.
   3. Compara: se o DRE de hoje discordar do que foi fechado, a tela mostra
      exatamente qual linha mudou e de quanto. É esse confronto que
      transforma o congelamento em controle, e não em burocracia.
   4. Registra a reabertura: quem reabriu, quando e por quê.

   O mês fechado continua inteiramente visível e navegável. Fechar restringe
   a ESCRITA no passado, nunca a leitura.
   ========================================== */
const Fechamento = (() => {

  function _todos() {
    return DB.getAll('fechamentos');
  }

  function doMes(mes) {
    return _todos().find(f => f.mes === mes) || null;
  }

  function estaFechado(mes) {
    const f = doMes(mes);
    return !!(f && f.status === 'fechado');
  }

  /* ====================================================
     TRAVA
     ==================================================== */

  /* Dada uma data de lançamento, diz se ela cai em mês fechado. Aceita tanto
     'YYYY-MM-DD' quanto 'YYYY-MM': o fluxo de caixa trabalha com os dois. */
  function bloqueioDe(dataStr) {
    if (!dataStr) return { bloqueado: false };
    const mes = String(dataStr).substring(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return { bloqueado: false };
    const f = doMes(mes);
    if (!f || f.status !== 'fechado') return { bloqueado: false, mes };
    return {
      bloqueado: true, mes, fechamento: f,
      motivo: `${_label(mes)} está fechado desde ${Utils.formatDate(f.fechadoEm)}.`,
    };
  }

  /* Porta única por onde todo lançamento de dinheiro passa antes de gravar.
     Devolve true quando pode seguir. Quando não pode, já explica na tela —
     quem chama só precisa parar. */
  function permite(dataStr, oQue) {
    const b = bloqueioDe(dataStr);
    if (!b.bloqueado) return true;
    Toast.error(
      `${oQue || 'Este lançamento'} tem data em ${_label(b.mes)}, que já foi fechado. ` +
      `Use uma data no mês aberto, ou reabra ${_label(b.mes)} em Financeiro → Fechamento.`,
      8000
    );
    return false;
  }

  function _label(mes) {
    if (!mes) return '';
    const [ano, mo] = mes.split('-');
    const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${nomes[parseInt(mo, 10) - 1] || mo}/${ano}`;
  }

  /* ====================================================
     FOTOGRAFIA DO MÊS
     ==================================================== */

  /* Os números do mês como estão agora. É isto que o fechamento congela e,
     depois, é isto que se compara com o congelado. Sai tudo do núcleo, para
     o fechamento nunca discordar do DRE por usar outra conta. */
  function snapshot(mes) {
    const c = FinNucleo.consolidado({ de: mes + '-01', ate: mes + '-31', regime: 'caixa' });
    const carteira = FinNucleo.somarParcelas(
      DB.getAll('recebiveis').filter(r => Utils.recebivelAtivo(r)));
    const aPagar = DB.getAll('contaspagar')
      .filter(x => x.status === 'pendente')
      .reduce((s, x) => s + (Number(x.valor) || 0), 0);
    return {
      receitaServicos: c.receitaServicos,
      receitaOutras: c.receitaOutras,
      receitaBruta: c.receitaBruta,
      impostos: c.impostos,
      receitaLiquida: c.receitaLiquida,
      custoServicos: c.custoServicos,
      comissoesServicos: c.comissoesServicos,
      margemContribuicao: c.margemContribuicao,
      pessoal: c.pessoal.total,
      fixas: c.fixas.total,
      despGerais: c.despGerais,
      estrutura: c.estrutura,
      resultado: c.resultado,
      aReceber: carteira.aReceber,
      vencido: carteira.vencido,
      aPagar,
      /* Marca se o custo de pessoal veio da folha gerada ou da estimativa do
         cadastro. Sem isso, um resultado estimado parece um resultado medido. */
      pessoalEstimado: c.pessoal.estimado,
    };
  }

  /* Rótulo de cada número, na ordem em que o DRE os mostra. O terceiro campo
     diz se subir é má notícia: despesa que cresce não é ganho, e pintar o
     aumento de verde daria a impressão contrária. */
  const LINHAS = [
    ['receitaServicos',   'Receita de serviços',    false],
    ['receitaOutras',     'Outras receitas',        false],
    ['receitaBruta',      'Receita bruta',          false],
    ['impostos',          'Impostos',               true],
    ['receitaLiquida',    'Receita líquida',        false],
    ['custoServicos',     'Custo dos serviços',     true],
    ['comissoesServicos', 'Comissões e parcerias',  true],
    ['margemContribuicao','Margem de contribuição', false],
    ['pessoal',           'Pessoal',                true],
    ['fixas',             'Despesas fixas',         true],
    ['despGerais',        'Outras despesas',        true],
    ['estrutura',         'Estrutura',              true],
    ['resultado',         'Resultado',              false],
    ['aReceber',          'A receber (carteira)',   false],
    ['vencido',           'Vencido (carteira)',     true],
    ['aPagar',            'A pagar (carteira)',     true],
  ];

  /* Cor da diferença, respeitando o sentido de cada linha. */
  function _corDif(chave, diferenca) {
    if (!diferenca) return 'var(--text-muted)';
    const linha = LINHAS.find(l => l[0] === chave);
    const ruimSeSobe = linha ? linha[2] : false;
    const bom = ruimSeSobe ? diferenca < 0 : diferenca > 0;
    return bom ? 'var(--ok-txt)' : 'var(--ruim-txt)';
  }

  /* O confronto: o que foi fechado contra o que o sistema diz hoje.
     Diferença de centavo é arredondamento, não mudança — por isso o corte. */
  function divergencia(mes) {
    const f = doMes(mes);
    if (!f || !f.numeros) return null;
    const hoje = snapshot(mes);
    const mudou = [];
    LINHAS.forEach(([chave, rotulo]) => {
      const antes = Number(f.numeros[chave]) || 0;
      const agora = Number(hoje[chave]) || 0;
      if (Math.abs(agora - antes) < 0.01) return;
      mudou.push({ chave, rotulo, antes, agora, diferenca: agora - antes });
    });
    return { mudou, hoje, fechado: f.numeros };
  }

  /* ====================================================
     PENDÊNCIAS ANTES DE FECHAR
     ==================================================== */

  /* Não impedem o fechamento: avisam. Fechar um mês com conta vencida sem
     baixa é uma decisão legítima, desde que consciente. */
  function pendenciasDe(mes) {
    const p = [];
    const fimMes = mes + '-31';

    const parcelasVencidas = [];
    DB.getAll('recebiveis').filter(r => Utils.recebivelAtivo(r)).forEach(r => {
      (r.parcelas || []).forEach(pc => {
        if (!Utils.parcelaAberta(pc)) return;
        if (!pc.vencimento || pc.vencimento > fimMes) return;
        parcelasVencidas.push({ texto: r.descricao || 'Recebível', valor: Number(pc.valor) || 0 });
      });
    });
    if (parcelasVencidas.length) {
      p.push({
        tipo: 'receber',
        texto: `${parcelasVencidas.length} parcela(s) venceram até o fim do mês e continuam em aberto`,
        valor: parcelasVencidas.reduce((s, x) => s + x.valor, 0),
        acao: 'Se já recebeu, registre antes de fechar: depois o mês tranca.',
      });
    }

    const contasVencidas = DB.getAll('contaspagar')
      .filter(c => c.status === 'pendente' && c.vencimento && c.vencimento <= fimMes);
    if (contasVencidas.length) {
      p.push({
        tipo: 'pagar',
        texto: `${contasVencidas.length} conta(s) a pagar venceram até o fim do mês sem baixa`,
        valor: contasVencidas.reduce((s, c) => s + (Number(c.valor) || 0), 0),
        acao: 'Se já pagou, dê baixa antes de fechar.',
      });
    }

    const folha = DB.getAll('folha').filter(f => (f.mes || f.competencia || '') === mes);
    if (!folha.length && DB.getAll('funcionarios').some(f => f.ativo !== false)) {
      p.push({
        tipo: 'folha',
        texto: 'A folha deste mês não foi gerada',
        valor: null,
        acao: 'Sem a folha, o custo de pessoal do mês entra como estimativa do cadastro, não como valor real.',
      });
    }

    const emAberto = DB.getAll('lancamentos').filter(l =>
      (l.data || '').startsWith(mes) && ['a_receber', 'a_pagar'].includes(l.status));
    if (emAberto.length) {
      p.push({
        tipo: 'lancamento',
        texto: `${emAberto.length} lançamento(s) do mês continuam como "a receber" ou "a pagar"`,
        valor: emAberto.reduce((s, l) => s + (Number(l.valor) || 0), 0),
        acao: 'Eles não entram no resultado em regime de caixa. Confirme o que já foi liquidado.',
      });
    }

    const altas = (typeof FinNucleo !== 'undefined' ? FinNucleo.consistencia() : [])
      .filter(a => a.gravidade === 'alta');
    altas.forEach(a => p.push({
      tipo: 'consistencia', texto: a.titulo, valor: null, acao: a.acao,
    }));

    return p;
  }

  /* ====================================================
     AÇÕES
     ==================================================== */

  function _quemSou() {
    const cfg = DB.getConfig() || {};
    return (cfg.usuario && cfg.usuario.nome) || 'Usuário';
  }

  function fechar(mes) {
    if (!/^\d{4}-\d{2}$/.test(mes || '')) { Toast.error('Mês inválido.'); return; }
    if (estaFechado(mes)) { Toast.warning(`${_label(mes)} já está fechado.`); return; }

    const mesAtual = Utils.todayStr().substring(0, 7);
    if (mes > mesAtual) { Toast.error('Não dá para fechar um mês que ainda não aconteceu.'); return; }

    const pend = pendenciasDe(mes);
    const numeros = snapshot(mes);

    Modal.open({
      title: '🔒 Fechar ' + _label(mes),
      size: 'modal-lg',
      saveLabel: 'Fechar o mês',
      body: `
        <p class="text-sm mb-3">
          Fechar congela os números abaixo e passa a recusar lançamento com data em ${Utils.escHtml(_label(mes))}.
          O mês continua inteiro para consulta: a trava é só de escrita.
          Se precisar mexer depois, dá para reabrir — e a reabertura fica registrada.
        </p>

        ${pend.length ? `
        <div class="ficha-aviso">
          <div><strong>${pend.length} ponto(s) antes de fechar.</strong> Nenhum impede o fechamento, mas depois dele o mês tranca.</div>
        </div>
        <div class="fech-pend mb-3">
          ${pend.map(x => `<div class="fech-pend-item">
            <div>
              <div class="text-sm font-semibold">${Utils.escHtml(x.texto)}${x.valor != null ? ` · ${Utils.formatCurrency(x.valor)}` : ''}</div>
              <div class="text-xs text-muted">${Utils.escHtml(x.acao)}</div>
            </div>
          </div>`).join('')}
        </div>` : `<div class="ficha-aviso" style="background:var(--surface-2);border-color:var(--border);color:var(--text)">
          Nada pendente neste mês. Pode fechar.
        </div>`}

        <div class="card mb-3">
          <div class="card-header"><div class="card-title">O que será congelado</div></div>
          <div class="card-body" style="padding:0">
            <table class="tbl"><tbody>
              ${LINHAS.map(([k, rot]) => `<tr>
                <td class="text-sm ${k === 'resultado' ? 'font-bold' : ''}">${rot}</td>
                <td class="text-right ${k === 'resultado' ? 'font-bold' : 'font-semibold'}">${Utils.formatCurrency(numeros[k])}</td>
              </tr>`).join('')}
            </tbody></table>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Observações do fechamento</label>
          <textarea class="form-control" id="fechObs" rows="2"
            placeholder="Ex.: folha paga em 05/12, comissão do parceiro ainda em negociação"></textarea>
        </div>`,
      saveCb: () => {
        DB.create('fechamentos', {
          mes,
          status: 'fechado',
          fechadoEm: Utils.todayStr(),
          fechadoPor: _quemSou(),
          observacoes: document.getElementById('fechObs').value.trim(),
          numeros,
          pendenciasNoFechamento: pend.map(x => x.texto),
          reaberturas: [],
        });
        Modal.close();
        Toast.success(`${_label(mes)} fechado. Lançamentos com data nesse mês passam a ser recusados.`);
        if (typeof Financeiro !== 'undefined') Financeiro.render();
      },
    });
  }

  /* Reabrir não apaga o fechamento: muda o status e guarda quem, quando e por
     quê. Fechar de novo depois compara com a fotografia original, então dá
     para ver exatamente o que a reabertura mudou. */
  function reabrir(mes) {
    const f = doMes(mes);
    if (!f) { Toast.error('Este mês não está fechado.'); return; }

    Modal.open({
      title: '🔓 Reabrir ' + _label(mes),
      size: 'modal-md',
      saveLabel: 'Reabrir o mês',
      body: `
        <p class="text-sm mb-3">
          Reabrir volta a permitir lançamento com data em ${Utils.escHtml(_label(mes))}.
          Os números congelados continuam guardados: quando você fechar de novo,
          a tela mostra o que mudou entre uma coisa e outra.
        </p>
        <div class="form-group">
          <label class="form-label">Por que está reabrindo? *</label>
          <textarea class="form-control" id="reabMotivo" rows="3"
            placeholder="Ex.: nota fiscal do fornecedor chegou com data de competência do mês"></textarea>
          <div class="text-xs text-muted mt-1">Fica registrado junto com a data e o seu nome.</div>
        </div>
        ${(f.reaberturas || []).length ? `
        <div class="text-sm font-bold mb-1">Reaberturas anteriores</div>
        <div class="fech-pend">
          ${f.reaberturas.map(r => `<div class="fech-pend-item">
            <div><div class="text-sm">${Utils.escHtml(r.motivo)}</div>
            <div class="text-xs text-muted">${Utils.formatDate(r.em)} · ${Utils.escHtml(r.por)}</div></div>
          </div>`).join('')}
        </div>` : ''}`,
      saveCb: () => {
        const motivo = document.getElementById('reabMotivo').value.trim();
        if (!motivo) { Toast.error('Diga o motivo da reabertura. É o que permite entender a mudança depois.'); return; }
        DB.update('fechamentos', f.id, {
          status: 'reaberto',
          reaberturas: [...(f.reaberturas || []), {
            em: Utils.todayStr(), por: _quemSou(), motivo,
          }],
        });
        Modal.close();
        Toast.success(`${_label(mes)} reaberto. Lembre de fechar de novo quando terminar.`);
        if (typeof Financeiro !== 'undefined') Financeiro.render();
      },
    });
  }

  /* Refaz a fotografia de um mês reaberto, sem perder o histórico: a original
     vira `numerosAnteriores` para a comparação continuar possível. */
  function refechar(mes) {
    const f = doMes(mes);
    if (!f) { fechar(mes); return; }
    const div = divergencia(mes);
    const novos = snapshot(mes);
    const mudou = div ? div.mudou : [];

    Modal.open({
      title: '🔒 Fechar de novo ' + _label(mes),
      size: 'modal-lg',
      saveLabel: 'Confirmar',
      body: `
        ${mudou.length ? `
        <p class="text-sm mb-3">Desde o fechamento anterior, ${mudou.length} linha(s) mudaram:</p>
        <table class="tbl mb-3">
          <thead><tr><th>Linha</th><th class="text-right">Estava</th><th class="text-right">Está</th><th class="text-right">Diferença</th></tr></thead>
          <tbody>${mudou.map(m => `<tr>
            <td class="text-sm">${m.rotulo}</td>
            <td class="text-right text-muted">${Utils.formatCurrency(m.antes)}</td>
            <td class="text-right font-semibold">${Utils.formatCurrency(m.agora)}</td>
            <td class="text-right font-bold" style="color:${_corDif(m.chave, m.diferenca)}">
              ${m.diferenca > 0 ? '+' : ''}${Utils.formatCurrency(m.diferenca)}</td>
          </tr>`).join('')}</tbody>
        </table>`
        : '<p class="text-sm mb-3">Nada mudou desde o fechamento anterior. Os números são os mesmos.</p>'}
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="refechObs" rows="2">${Utils.escHtml(f.observacoes || '')}</textarea>
        </div>`,
      saveCb: () => {
        DB.update('fechamentos', f.id, {
          status: 'fechado',
          fechadoEm: Utils.todayStr(),
          fechadoPor: _quemSou(),
          observacoes: document.getElementById('refechObs').value.trim(),
          numerosAnteriores: f.numerosAnteriores || f.numeros,
          numeros: novos,
        });
        Modal.close();
        Toast.success(`${_label(mes)} fechado de novo.`);
        if (typeof Financeiro !== 'undefined') Financeiro.render();
      },
    });
  }

  /* ====================================================
     TELA
     ==================================================== */

  function _ultimosMeses(n) {
    const r = [], d = new Date();
    for (let i = 0; i < n; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      r.push(Utils.localDateStr(dt).substring(0, 7));
    }
    return r;
  }

  function build() {
    if (typeof FinNucleo === 'undefined') {
      return '<div class="card"><div class="card-body text-muted">Núcleo financeiro não carregado.</div></div>';
    }
    const meses = _ultimosMeses(12);
    const mesAtual = Utils.todayStr().substring(0, 7);
    const fechados = _todos().filter(f => f.status === 'fechado');
    const comDivergencia = fechados
      .map(f => ({ f, d: divergencia(f.mes) }))
      .filter(x => x.d && x.d.mudou.length);

    return `
      <div class="ficha-aviso" ${comDivergencia.length ? '' : 'style="background:var(--surface-2);border-color:var(--border);color:var(--text)"'}>
        ${comDivergencia.length
          ? `<div><strong>${comDivergencia.length} mês(es) fechado(s) não batem mais com o que o sistema calcula hoje.</strong>
             Alguma coisa foi mudada depois do fechamento. Abra o mês para ver qual linha mudou.</div>`
          : `<div>Fechar um mês congela os números e passa a recusar lançamento com data nele.
             O mês continua visível para consulta — a trava é só de escrita, e dá para reabrir registrando o motivo.</div>`}
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Meses</div>
          <span class="text-sm text-muted">${fechados.length} de ${meses.length} fechados</span>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr>
              <th>Mês</th><th>Situação</th><th class="text-right">Receita</th><th class="text-right">Resultado</th>
              <th>Confere com hoje?</th><th>Fechado por</th><th>Ações</th>
            </tr></thead>
            <tbody>${meses.map(m => _linhaMes(m, mesAtual)).join('')}</tbody>
          </table>
        </div>
      </div>

      ${fechados.some(f => (f.reaberturas || []).length) ? `
      <div class="card mt-4">
        <div class="card-header"><div class="card-title">Reaberturas registradas</div></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Mês</th><th>Quando</th><th>Quem</th><th>Motivo</th></tr></thead>
          <tbody>${_todos().flatMap(f => (f.reaberturas || []).map(r => `<tr>
            <td class="font-semibold text-sm">${Utils.escHtml(_label(f.mes))}</td>
            <td class="text-sm">${Utils.formatDate(r.em)}</td>
            <td class="text-sm">${Utils.escHtml(r.por || '—')}</td>
            <td class="text-sm text-muted">${Utils.escHtml(r.motivo || '')}</td>
          </tr>`)).join('')}</tbody>
        </table></div>
      </div>` : ''}`;
  }

  function _linhaMes(mes, mesAtual) {
    const f = doMes(mes);
    const fechado = f && f.status === 'fechado';
    const n = fechado ? f.numeros : snapshot(mes);
    const div = fechado ? divergencia(mes) : null;
    const bate = !div || div.mudou.length === 0;
    const futuro = mes > mesAtual;

    /* Mês sem movimento nenhum: nada de receita, custo ou lançamento. Mostrar
       o resultado da estrutura estimada aqui faria parecer que o mês existiu e
       deu prejuízo, quando o sistema simplesmente não tem registro dele. */
    const semMovimento = !fechado && n.receitaBruta === 0 && n.custoServicos === 0
      && n.despGerais === 0 && mes < mesAtual;

    const situacao = futuro
      ? '<span class="badge badge-gray">Ainda não aconteceu</span>'
      : fechado
        ? '<span class="badge badge-green">🔒 Fechado</span>'
        : f
          ? '<span class="badge badge-yellow">🔓 Reaberto</span>'
          : (mes === mesAtual
              ? '<span class="badge badge-blue">Em andamento</span>'
              : semMovimento
                ? '<span class="badge badge-gray">Sem movimento</span>'
                : '<span class="badge badge-gray">Aberto</span>');

    const confere = !fechado ? '<span class="text-muted">—</span>'
      : bate
        ? '<span class="text-sm" style="color:var(--ok-txt)">sim</span>'
        : `<button class="btn btn-xs btn-danger" onclick="Fechamento.verDivergencia('${mes}')">${div.mudou.length} linha(s) mudaram</button>`;

    const acoes = (futuro || semMovimento) ? ''
      : fechado
        ? `<button class="btn btn-xs btn-secondary" onclick="Fechamento.verFechamento('${mes}')">Ver</button>
           <button class="btn btn-xs btn-ghost" onclick="Fechamento.reabrir('${mes}')">Reabrir</button>`
        : f
          ? `<button class="btn btn-xs btn-primary" onclick="Fechamento.refechar('${mes}')">Fechar de novo</button>`
          : `<button class="btn btn-xs btn-primary" onclick="Fechamento.fechar('${mes}')">Fechar</button>`;

    return `<tr ${futuro ? 'style="opacity:.5"' : ''}>
      <td class="font-semibold text-sm">${Utils.escHtml(_label(mes))}</td>
      <td>${situacao}</td>
      <td class="text-right ${semMovimento ? 'text-muted' : ''}">${semMovimento ? '—' : Utils.formatCurrency(n.receitaBruta)}</td>
      <td class="text-right font-bold" style="color:${semMovimento ? 'var(--text-muted)' : (n.resultado >= 0 ? 'var(--ok-txt)' : 'var(--ruim-txt)')}">
        ${semMovimento ? '—' : Utils.formatCurrency(n.resultado)}
        ${(!semMovimento && n.pessoalEstimado) ? '<div class="text-xs text-muted" style="font-weight:500" title="A folha deste mês não foi gerada, então o custo de pessoal é a estimativa do cadastro.">pessoal estimado</div>' : ''}
      </td>
      <td>${confere}</td>
      <td class="text-xs text-muted">${fechado ? Utils.escHtml(f.fechadoPor || '—') + '<div>' + Utils.formatDate(f.fechadoEm) + '</div>' : '—'}</td>
      <td><div class="tbl-actions">${acoes}</div></td>
    </tr>`;
  }

  function verFechamento(mes) {
    const f = doMes(mes);
    if (!f) return;
    const div = divergencia(mes);
    Modal.open({
      title: '🔒 ' + _label(mes),
      size: 'modal-lg',
      saveLabel: null,
      cancelLabel: 'Fechar',
      body: `
        <div class="detail-grid mb-3">
          <div class="detail-field"><div class="detail-label">Fechado em</div><div class="detail-value">${Utils.formatDate(f.fechadoEm)}</div></div>
          <div class="detail-field"><div class="detail-label">Por</div><div class="detail-value">${Utils.escHtml(f.fechadoPor || '—')}</div></div>
          <div class="detail-field"><div class="detail-label">Reaberturas</div><div class="detail-value">${(f.reaberturas || []).length}</div></div>
        </div>
        ${f.observacoes ? `<div class="ficha-obs mb-3">${Utils.escHtml(f.observacoes)}</div>` : ''}
        <table class="tbl">
          <thead><tr><th>Linha</th><th class="text-right">Congelado</th><th class="text-right">Hoje</th></tr></thead>
          <tbody>${LINHAS.map(([k, rot]) => {
            const antes = Number(f.numeros[k]) || 0;
            const agora = div ? (Number(div.hoje[k]) || 0) : antes;
            const mudou = Math.abs(agora - antes) >= 0.01;
            return `<tr>
              <td class="text-sm ${k === 'resultado' ? 'font-bold' : ''}">${rot}</td>
              <td class="text-right ${k === 'resultado' ? 'font-bold' : ''}">${Utils.formatCurrency(antes)}</td>
              <td class="text-right ${mudou ? 'font-bold' : 'text-muted'}" ${mudou ? `style="color:var(--ruim-txt)"` : ''}>${Utils.formatCurrency(agora)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ${(f.pendenciasNoFechamento || []).length ? `
        <div class="mt-3">
          <div class="text-sm font-bold mb-1">Pendências que existiam no fechamento</div>
          ${f.pendenciasNoFechamento.map(x => `<div class="text-xs text-muted">· ${Utils.escHtml(x)}</div>`).join('')}
        </div>` : ''}`,
    });
  }

  function verDivergencia(mes) {
    const div = divergencia(mes);
    if (!div || !div.mudou.length) { Toast.success('Este mês continua batendo.'); return; }
    Modal.open({
      title: '⚠ O que mudou depois do fechamento — ' + _label(mes),
      size: 'modal-lg',
      saveLabel: null,
      cancelLabel: 'Fechar',
      body: `
        <p class="text-sm mb-3">
          Estes números foram congelados no fechamento e hoje o sistema calcula outros.
          Significa que algum registro com data em ${Utils.escHtml(_label(mes))} foi criado, editado ou cancelado
          enquanto o mês estava reaberto — ou antes de o fechamento existir.
        </p>
        <table class="tbl">
          <thead><tr><th>Linha</th><th class="text-right">Fechado como</th><th class="text-right">Hoje</th><th class="text-right">Diferença</th></tr></thead>
          <tbody>${div.mudou.map(m => `<tr>
            <td class="text-sm font-semibold">${m.rotulo}</td>
            <td class="text-right text-muted">${Utils.formatCurrency(m.antes)}</td>
            <td class="text-right font-semibold">${Utils.formatCurrency(m.agora)}</td>
            <td class="text-right font-bold" style="color:${_corDif(m.chave, m.diferenca)}">
              ${m.diferenca > 0 ? '+' : ''}${Utils.formatCurrency(m.diferenca)}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-sm btn-primary" onclick="Modal.close();Fechamento.refechar('${mes}')">Aceitar os novos números e fechar de novo</button>
        </div>`,
    });
  }

  return {
    doMes, estaFechado, bloqueioDe, permite, snapshot, divergencia, pendenciasDe,
    fechar, reabrir, refechar, build, verFechamento, verDivergencia,
    LINHAS, _label,
  };
})();
