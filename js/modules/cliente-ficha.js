/* ==========================================
   CLIENTE-FICHA.js — A ficha do cliente

   A tela de Clientes era um cadastro: nome, CNPJ, endereco e uma lista.
   Para saber quanto um cliente rendeu, se ele paga, se vale a pena manter
   e o que ainda da para vender era preciso abrir cinco telas e somar na mao.

   Esta ficha reune isso em um lugar: o cadastro, todos os servicos ja
   prestados com valor e margem de cada um, o que foi recebido e o que esta
   vencido, o parque que gera renovacao, o que o cliente ainda nao comprou
   do catalogo e um veredito com as razoes a vista.

   FONTE UNICA DE VERDADE DO DINHEIRO (vale para todo este arquivo)
   - Receita contratada do servico ....... projeto.valor
   - Custo, comissao e margem ............ ProjetoFinanceiro.calcDRE(projeto)
   - Recebido, a receber e vencido ....... parcelas dos recebiveis do servico

   Recebimento aparece em dois lugares no banco: na entidade `recebiveis` e
   espelhado dentro de `projeto.financeiro.recebimentos`, que guarda o
   `recebiveisId` de onde veio. Somar os dois conta o mesmo dinheiro duas
   vezes, por isso aqui o recebido sai SEMPRE de `recebiveis`.
   ========================================== */
const ClienteFicha = (() => {

  let _id  = null;        // cliente aberto nesta tela; null quando nenhum
  let _aba = 'servicos';

  const ABAS = [
    { id: 'servicos',       label: 'Serviços',       icon: '🏗' },
    { id: 'financeiro',     label: 'Financeiro',     icon: '💰' },
    { id: 'recorrencia',    label: 'Recorrência',    icon: '🔁' },
    { id: 'oportunidades',  label: 'Oportunidades',  icon: '💡' },
    { id: 'relacionamento', label: 'Relacionamento', icon: '🤝' },
    { id: 'arquivos',       label: 'Arquivos',       icon: '📎' },
  ];

  /* Origem sem custo de midia: trazer esse cliente nao consumiu anuncio.
     Nao e custo zero de verdade, porque o tempo custa, mas e honesto
     separar de quem veio de campanha paga. */
  const ORIGENS_SEM_MIDIA = ['Recorrência', 'Indicação', 'Parceria'];

  const ICONE_ORIGEM = {
    'Tráfego Pago': '🎯', 'Indicação': '🤝', 'Recorrência': '🔁',
    'Prospecção Ativa': '📞', 'Site / SEO': '🌐', 'LinkedIn': '💼',
    'Evento / Feira': '📅', 'Parceria': '🔗', 'Licitação Pública': '🏛',
    'Produto / Loja': '🏭', 'Outro': '❓',
  };

  const VAZIO = '—';

  /* ====================================================
     LEITURA
     ==================================================== */

  function _cliente(id) { return DB.get('clientes', id); }

  function _servicosDe(clienteId) {
    return DB.getAll('projetos').filter(p => p.clienteId === clienteId);
  }

  /* Um recebivel pode ter vindo de um projeto sem o clienteId preenchido,
     por isso a busca tambem passa pelos servicos do cliente. */
  function _recebiveisDe(clienteId) {
    const idsProj = new Set(_servicosDe(clienteId).map(p => p.id));
    return DB.getAll('recebiveis')
      .filter(r => Utils.recebivelAtivo(r))
      .filter(r => r.clienteId === clienteId || (r.projetoId && idsProj.has(r.projetoId)));
  }

  function _somarParcelas(recebiveis) {
    const hoje = Utils.todayStr();
    let recebido = 0, aReceber = 0, vencido = 0, nVencidas = 0, semVencimento = 0;
    recebiveis.forEach(r => (r.parcelas || []).forEach(pc => {
      const v = Number(pc.valor) || 0;
      if (pc.status === 'recebido') { recebido += v; return; }
      if (!Utils.parcelaAberta(pc)) return;            // parcela cancelada
      aReceber += v;
      if (!pc.vencimento) { semVencimento++; return; }
      if (pc.vencimento < hoje) { vencido += v; nVencidas++; }
    }));
    return { recebido, aReceber, vencido, nVencidas, semVencimento };
  }

  /* O lead que trouxe o cliente: o mais antigo dos que apontam para ele. */
  function _leadDeOrigem(clienteId) {
    return DB.getAll('leads')
      .filter(l => l.clienteId === clienteId)
      .sort((a, b) => (a.dataEntrada || a.createdAt || '')
        .localeCompare(b.dataEntrada || b.createdAt || ''))[0] || null;
  }

  function _ehGanho(lead) {
    return ['fechado_ganho', 'executado'].includes(lead && lead.status);
  }

  function origemDe(clienteId) {
    const c = _cliente(clienteId);
    if (c && c.canalAquisicao) return c.canalAquisicao;
    const l = _leadDeOrigem(clienteId);
    return (l && l.origemLead) || '';
  }

  /* ====================================================
     METRICAS
     ==================================================== */

  function metricas(clienteId) {
    const servicos = _servicosDe(clienteId).filter(p => p.status !== 'cancelado');
    const temPF    = typeof ProjetoFinanceiro !== 'undefined';

    const linhas = servicos.map(p => ({
      p,
      dre: temPF ? ProjetoFinanceiro.calcDRE(p) : {
        receita: Number(p.valor) || 0, custoHoras: 0, custosDirectos: 0,
        custoTotal: 0, lucroBruto: Number(p.valor) || 0, totalComissoes: 0,
        lucroLiquido: Number(p.valor) || 0, margemPct: 0,
      },
      receb: _somarParcelas(DB.getAll('recebiveis')
        .filter(r => Utils.recebivelAtivo(r) && r.projetoId === p.id)),
    }));

    const contratado = linhas.reduce((s, x) => s + x.dre.receita, 0);
    const custo      = linhas.reduce((s, x) => s + x.dre.custoTotal, 0);
    const comissoes  = linhas.reduce((s, x) => s + x.dre.totalComissoes, 0);
    const lucro      = linhas.reduce((s, x) => s + x.dre.lucroLiquido, 0);

    /* Margem so significa algo quando existe custo lancado. Com custo zero
       em todos os servicos a margem sai 100%, o que e falso, nao otimo. */
    const comCusto = linhas.filter(x => x.dre.custoTotal > 0).length;

    const margemPct = contratado > 0 ? Math.round((lucro / contratado) * 100) : null;
    const ticket    = servicos.length ? contratado / servicos.length : 0;

    const pag = _somarParcelas(_recebiveisDe(clienteId));

    const datas    = servicos.map(p => p.dataInicio).filter(Boolean).sort();
    const primeiro = datas[0] || null;
    const ultimo   = datas[datas.length - 1] || null;
    const diasDesdeUltimo = ultimo
      ? Math.round((Date.now() - new Date(ultimo + 'T12:00:00').getTime()) / 86400000)
      : null;

    return {
      servicos, linhas, contratado, custo, comissoes, lucro, margemPct, ticket,
      comCusto, temCusto: comCusto > 0,
      recebido: pag.recebido, aReceber: pag.aReceber, vencido: pag.vencido,
      nVencidas: pag.nVencidas, semVencimento: pag.semVencimento,
      primeiro, ultimo, diasDesdeUltimo,
      equipamentos: DB.getAll('equipamentos')
        .filter(e => e.clienteId === clienteId && e.status !== 'inativo'),
      contratos: DB.getAll('contratos').filter(ct => ct.clienteId === clienteId),
      concluidos:  servicos.filter(p => p.status === 'concluido').length,
      emAndamento: servicos.filter(p => p.status === 'em_andamento').length,
    };
  }

  /* Medias da carteira. O cliente e comparado com os outros clientes, nao
     com uma meta escrita no codigo: o repositorio e publico e meta de
     margem e informacao de negocio. */
  function _receitaMediaCarteira() {
    const valores = DB.getAll('clientes')
      .map(c => Utils.sum(_servicosDe(c.id).filter(p => p.status !== 'cancelado'), 'valor'))
      .filter(v => v > 0);
    if (!valores.length) return 0;
    return valores.reduce((s, v) => s + v, 0) / valores.length;
  }

  /* Cor da margem comparada com a media da carteira, nunca com um numero
     escrito aqui: meta de margem e informacao de negocio e este repositorio
     e publico. Sem base de comparacao, a margem fica neutra. */
  function corDaMargem(pct) {
    const media = _margemMediaCarteira();
    if (media === null || pct === null || pct === undefined) return 'var(--text)';
    if (pct >= media) return 'var(--ok-txt)';
    if (pct >= media * 0.6) return '#d97706';
    return 'var(--ruim-txt)';
  }

  function _margemMediaCarteira() {
    if (typeof ProjetoFinanceiro === 'undefined') return null;
    let receita = 0, lucro = 0, achouCusto = false;
    DB.getAll('projetos').filter(p => p.status !== 'cancelado').forEach(p => {
      const d = ProjetoFinanceiro.calcDRE(p);
      if (d.custoTotal > 0) achouCusto = true;
      receita += d.receita; lucro += d.lucroLiquido;
    });
    if (!achouCusto || receita <= 0) return null;
    return Math.round((lucro / receita) * 100);
  }

  /* ====================================================
     CUSTO DE AQUISICAO

     Em ordem de confianca. Quando nenhuma das fontes serve, devolve valor
     nulo e o motivo, em vez de mostrar R$ 0, que pareceria um cliente de
     graca quando na verdade o dado nao existe.
     ==================================================== */

  function cac(clienteId) {
    const c      = _cliente(clienteId);
    const lead   = _leadDeOrigem(clienteId);
    const origem = origemDe(clienteId);

    // 1. Valor informado a mao na ficha: ganha de qualquer estimativa.
    const informado = Number(c && c.custoAquisicao) || 0;
    if (informado > 0) {
      return { valor: informado, origem, confianca: 'alta',
        base: 'informado na ficha do cliente' };
    }

    // 2. Investimento da campanha que trouxe o lead, dividido pelos
    //    clientes que aquela campanha fechou.
    if (lead && lead.campanhaId) {
      const camp = DB.get('trafego_campanhas', lead.campanhaId);
      const investido = Number(camp && camp.investidoReal) || 0;
      if (investido > 0) {
        const clientesDaCampanha = new Set(DB.getAll('leads')
          .filter(l => l.campanhaId === lead.campanhaId && _ehGanho(l) && l.clienteId)
          .map(l => l.clienteId));
        const n = clientesDaCampanha.size || 1;
        return { valor: investido / n, origem, confianca: 'média',
          base: 'campanha ' + (camp.nome || 'sem nome') + ': '
                + Utils.formatCurrency(investido) + ' dividido por ' + n + ' cliente(s)' };
      }
      return { valor: null, origem, confianca: 'nenhuma',
        motivo: 'a campanha que trouxe este lead está sem investimento informado' };
    }

    // 3. Origem que nao consome midia.
    if (ORIGENS_SEM_MIDIA.includes(origem)) {
      return { valor: 0, origem, confianca: 'alta', semMidia: true,
        base: 'origem ' + origem + ', sem custo de mídia' };
    }

    // 4. Sem lead ligado ao cliente nao da para saber de onde ele veio.
    if (!lead) {
      return { valor: null, origem, confianca: 'nenhuma',
        motivo: 'nenhum negócio do funil está vinculado a este cliente, '
              + 'então não há como saber por onde ele chegou' };
    }

    return { valor: null, origem, confianca: 'nenhuma',
      motivo: origem
        ? 'origem ' + origem + ' sem campanha e sem investimento informado'
        : 'o negócio de origem está sem canal preenchido' };
  }

  /* ====================================================
     VALE A PENA MANTER

     Um veredito com os sinais a vista. Cada sinal diz o que foi olhado,
     para a conclusao nao ser uma caixa preta.
     ==================================================== */

  function veredito(clienteId) {
    const m      = metricas(clienteId);
    const k      = cac(clienteId);
    const sinais = [];
    let pontos   = 0;

    function sinal(bom, texto, peso) {
      sinais.push({ bom, texto });
      pontos += (peso || 0);
    }

    if (!m.servicos.length) {
      return { label: 'Sem histórico', cor: '#64748b', pontos: 0,
        sinais: [{ bom: null, texto: 'Nenhum serviço prestado ainda, não há o que avaliar' }] };
    }

    // Volume, comparado com a carteira
    const media = _receitaMediaCarteira();
    if (media > 0) {
      const x = m.contratado / media;
      if (x >= 1.5) sinal(true, 'Fatura ' + x.toFixed(1) + 'x a média da carteira', 2);
      else if (x < 0.5) sinal(false, 'Fatura menos da metade da média da carteira', -1);
      else sinal(null, 'Fatura perto da média da carteira', 0);
    }

    // Repeticao
    if (m.servicos.length >= 3) sinal(true, m.servicos.length + ' serviços contratados, cliente recorrente', 2);
    else if (m.servicos.length === 2) sinal(true, 'Voltou a contratar uma segunda vez', 1);
    else sinal(null, 'Só um serviço até agora, a relação ainda não se repetiu', 0);

    // Parque: e daqui que sai a renovacao automatica
    if (m.equipamentos.length) {
      sinal(true, m.equipamentos.length + ' equipamento(s) no parque, a renovação entra no funil sozinha', 2);
    } else {
      sinal(false, 'Sem equipamento cadastrado, nenhuma renovação automática nasce daqui', -1);
    }

    if (m.contratos.length) sinal(true, m.contratos.length + ' contrato(s) registrado(s)', 1);

    // Margem
    if (m.temCusto && m.margemPct !== null) {
      const mm = _margemMediaCarteira();
      if (mm === null) sinal(null, 'Margem de ' + m.margemPct + '%, sem base de comparação na carteira', 0);
      else if (m.margemPct >= mm) sinal(true, 'Margem de ' + m.margemPct + '%, acima da média da carteira (' + mm + '%)', 2);
      else sinal(false, 'Margem de ' + m.margemPct + '%, abaixo da média da carteira (' + mm + '%)', -2);
      if (m.comCusto < m.servicos.length) {
        sinal(null, 'Custo lançado em ' + m.comCusto + ' de ' + m.servicos.length
          + ' serviços, a margem ainda é parcial', 0);
      }
    } else {
      sinal(null, 'Margem não pode ser avaliada: nenhum custo foi lançado nos serviços', 0);
    }

    // Pagamento
    if (m.vencido > 0) {
      sinal(false, Utils.formatCurrency(m.vencido) + ' vencido em ' + m.nVencidas + ' parcela(s)', -3);
    } else if (m.recebido > 0 && m.aReceber === 0) {
      sinal(true, 'Pagou tudo o que foi faturado', 1);
    } else if (m.aReceber > 0) {
      sinal(null, Utils.formatCurrency(m.aReceber) + ' a receber, nada vencido', 0);
    }
    if (m.semVencimento > 0) {
      sinal(null, m.semVencimento + ' parcela(s) sem data de vencimento, nunca vão aparecer como atrasadas', 0);
    }

    // Recencia
    if (m.diasDesdeUltimo !== null) {
      if (m.diasDesdeUltimo > 365) {
        sinal(false, 'Último serviço há ' + Math.round(m.diasDesdeUltimo / 30) + ' meses', -2);
      } else if (m.diasDesdeUltimo <= 180) {
        sinal(true, 'Serviço nos últimos 6 meses', 1);
      } else {
        sinal(null, 'Último serviço há ' + Math.round(m.diasDesdeUltimo / 30) + ' meses', 0);
      }
    }

    // Retorno sobre o custo de aquisicao
    if (k.valor > 0 && m.lucro > 0) {
      const r = m.lucro / k.valor;
      if (r >= 3) sinal(true, 'Retorno de ' + r.toFixed(1) + 'x sobre o custo de aquisição', 2);
      else if (r < 1) sinal(false, 'Custou mais para trazer do que deu de resultado', -2);
      else sinal(null, 'Retorno de ' + r.toFixed(1) + 'x sobre o custo de aquisição', 0);
    }

    let label, cor, corEscura;
    if (pontos >= 5)      { label = 'Manter e expandir'; cor = '#1E7A34'; corEscura = '#4ADE80'; }
    else if (pontos >= 2) { label = 'Manter';            cor = '#1D4F8C'; corEscura = '#8FBCF0'; }
    else if (pontos >= 0) { label = 'Desenvolver';       cor = '#b45309'; corEscura = '#FBBF24'; }
    else                  { label = 'Revisar';           cor = '#C42B2B'; corEscura = '#F87171'; }

    return { label, cor, corEscura, pontos, sinais };
  }

  /* As duas cores do veredito viajam juntas: os tons escuros da marca somem
     no fundo marinho do tema escuro.

     Quem escolhe entre elas e o CSS, nao este codigo. Por isso aqui saem so
     --vcl e --vcd; o --vc que a folha de estilo usa e montado la. Definir
     --vc direto aqui nao funcionaria: variavel escrita no atributo style
     vence qualquer regra, e o tema escuro nunca conseguiria trocar. */
  function _varsVeredito(v) {
    const esc = v.corEscura || v.cor;
    return '--vcl:' + v.cor + ';--vcd:' + esc
      + ';--vcbgl:' + v.cor + '14;--vcbgd:' + esc + '24';
  }

  /* ====================================================
     O QUE AINDA DA PARA OFERECER

     Cruza o catalogo com o que o cliente ja contratou. O que ele ja tem e
     deduzido do texto dos servicos, contratos, propostas e do interesse
     registrado no funil, por isso a tela diz que a leitura e inferida.
     ==================================================== */

  function oportunidades(clienteId) {
    const catalogo = DB.getAll('catalogo_servicos');
    const m = metricas(clienteId);

    const textos = [];
    m.servicos.forEach(p => textos.push(p.titulo || ''));
    m.contratos.forEach(ct => textos.push((ct.tipoServico || '') + ' ' + (ct.objeto || '')));
    DB.getAll('leads').filter(l => l.clienteId === clienteId)
      .forEach(l => textos.push((l.servicoInteresse || '') + ' ' + (l.titulo || '')));
    DB.getAll('propostas').filter(pr => pr.clienteId === clienteId)
      .forEach(pr => textos.push((pr.titulo || '') + ' ' + (pr.objeto || '')));
    const blob = textos.join(' | ').toLowerCase();

    const normasDoParque = [...new Set(m.equipamentos
      .map(e => String(e.norma || '').toLowerCase()).filter(Boolean))];

    const jaTem = [], faltam = [];
    catalogo.forEach(s => {
      const nome = String(s.nome || '').toLowerCase();
      const cat  = String(s.categoria || '').toLowerCase();
      const temNoTexto = (nome && blob.includes(nome)) || (cat && blob.includes(cat));
      if (temNoTexto) { jaTem.push(s); return; }
      const pedidoPeloParque = !!cat && normasDoParque.some(n => cat.includes(n) || n.includes(cat));
      faltam.push({ servico: s, motivo: pedidoPeloParque ? 'parque' : 'novo' });
    });

    faltam.sort((a, b) => (a.motivo === 'parque' ? 0 : 1) - (b.motivo === 'parque' ? 0 : 1));
    return { jaTem, faltam, catalogo, normasDoParque };
  }

  /* ====================================================
     ABRIR, FECHAR, TROCAR DE ABA
     ==================================================== */

  function abrir(clienteId, aba) {
    if (!_cliente(clienteId)) { Toast.error('Cliente não encontrado.'); return; }
    _id  = clienteId;
    _aba = aba || 'servicos';
    _render();
    window.scrollTo(0, 0);
  }

  function setAba(aba) {
    _aba = aba;
    _render();
  }

  function voltar() {
    _id = null;
    if (typeof Clientes !== 'undefined') Clientes.render();
  }

  /* Solta o cliente sem desenhar nada. Chamada pela navegacao: a ficha ocupa
     a area de conteudo, e se ela continuasse "aberta" depois de o usuario
     trocar de tela pelo menu, um save em outro modulo a redesenharia por
     cima da tela nova. */
  function fechar() { _id = null; }

  /* Usada pelos outros modulos depois de salvar. Eles terminavam em
     render(), que desenha a propria lista e tirava o usuario da ficha
     quando ele criava um servico ou um equipamento aqui de dentro. */
  function recarregarSeAberta() {
    if (!_id) return false;
    if (!_cliente(_id)) { _id = null; return false; }
    _render();
    return true;
  }

  /* ====================================================
     DESENHO DA TELA
     ==================================================== */

  function _render() {
    const c = _cliente(_id);
    if (!c) { voltar(); return; }
    const m = metricas(_id);
    const v = veredito(_id);
    const k = cac(_id);
    const alvo = document.getElementById('pageContent');
    if (!alvo) return;

    alvo.innerHTML =
      _cabecalho(c, m) +
      _blocoObs(c) +
      _faixaVeredito(v, k, m) +
      _faixaNumeros(m, k) +
      _barraAbas(m) +
      '<div id="fichaAba">' + _conteudoAba(c, m) + '</div>';
  }

  /* Observacao do cadastro. Ficava escondida no fim da janela antiga; e
     justamente onde mora o combinado com o cliente. */
  function _blocoObs(c) {
    if (!c.observacoes || !String(c.observacoes).trim()) return '';
    return '<div class="ficha-obs"><span class="ficha-obs-rot">Observações</span>'
      + '<div>' + Utils.escHtml(c.observacoes) + '</div></div>';
  }

  /* Log de alteracoes do registro, herdado da janela antiga. */
  function _blocoAuditoria() {
    const logs = DB.getAuditLog
      ? DB.getAuditLog().filter(l => l.recordId === _id).slice(0, 30) : [];
    if (!logs.length) return '';
    const icone = { create: '➕', update: '✏', delete: '🗑' };
    const rotulo = { create: 'Registro criado', update: 'Registro atualizado', delete: 'Registro removido' };
    return '<div class="card mt-4"><div class="card-header"><div class="font-bold">Alterações no cadastro</div>'
      + '<div class="text-sm text-muted">' + logs.length + '</div></div>'
      + '<div class="p-3" style="max-height:260px;overflow:auto">'
      + logs.map(l => {
        const hora = l.timestamp
          ? Utils.formatDate(String(l.timestamp).split('T')[0]) + ' '
            + String(String(l.timestamp).split('T')[1] || '').substring(0, 5)
          : VAZIO;
        return '<div class="tl-item"><span class="tl-data">' + hora + '</span>'
          + '<span class="tl-txt">' + (icone[l.action] || '📌') + ' '
          + Utils.escHtml(rotulo[l.action] || l.action || '') + '</span>'
          + '<span class="text-xs text-muted">' + Utils.escHtml(l.user || 'Sistema') + '</span></div>';
      }).join('')
      + '</div></div>';
  }

  function _avatar(c, px) {
    const tam = px || 46;
    if (c.avatar) {
      return '<img src="' + Utils.escHtml(c.avatar) + '" alt="" style="width:' + tam + 'px;height:' + tam
        + 'px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--primary)">';
    }
    const letra = Utils.escHtml(String(c.nome || '?').charAt(0).toUpperCase());
    return '<div style="width:' + tam + 'px;height:' + tam + 'px;border-radius:50%;background:var(--primary);'
      + 'color:#fff;font-size:' + Math.round(tam / 2.3) + 'px;font-weight:800;display:flex;align-items:center;'
      + 'justify-content:center;flex-shrink:0">' + letra + '</div>';
  }

  function _cabecalho(c, m) {
    const origem = origemDe(_id);
    const icone  = ICONE_ORIGEM[origem] || '';
    const linha2 = [
      c.segmento ? Utils.escHtml(c.segmento) : '',
      c.porte ? Utils.escHtml(c.porte) : '',
      [c.cidade, c.estado].filter(Boolean).map(Utils.escHtml).join('/'),
      c.cnpj ? 'CNPJ ' + Utils.escHtml(c.cnpj) : '',
      origem ? icone + ' ' + Utils.escHtml(origem) : '',
    ].filter(Boolean).join(' · ');

    const contato = [
      c.telefone ? '📞 ' + Utils.escHtml(c.telefone) : '',
      c.email ? '✉ ' + Utils.escHtml(c.email) : '',
      c.engResponsavel ? '👷 ' + Utils.escHtml(c.engResponsavel) : '',
    ].filter(Boolean).join(' · ');

    return '<div class="ficha-topo">'
      + '<button class="btn btn-ghost btn-sm" onclick="ClienteFicha.voltar()" style="flex-shrink:0">← Clientes</button>'
      + '<div class="ficha-ident">'
        + _avatar(c)
        + '<div style="min-width:0;flex:1">'
          + '<div class="ficha-nome">' + Utils.escHtml(c.nome || VAZIO)
            + (c.codigoCliente ? '<span class="ficha-cod">' + Utils.escHtml(c.codigoCliente) + '</span>' : '')
            + (c.ativo === false ? '<span class="badge badge-gray">Inativo</span>' : '')
          + '</div>'
          + '<div class="text-sm text-muted">' + (linha2 || VAZIO) + '</div>'
          + (contato ? '<div class="text-xs text-muted" style="margin-top:2px">' + contato + '</div>'
                     : '<div class="text-xs" style="margin-top:2px;color:#C42B2B">Sem telefone e sem e-mail cadastrados</div>')
        + '</div>'
      + '</div>'
      + '<div class="sec-actions ficha-acoes">'
        + '<button class="btn btn-primary btn-sm" onclick="ClienteFicha.novoServico()">+ Novo serviço</button>'
        + '<button class="btn btn-secondary btn-sm" onclick="ClienteFicha.editar()">✏ Editar cadastro</button>'
        + '<button class="btn btn-secondary btn-sm" onclick="ClienteFicha.definirAquisicao()">🎯 Aquisição</button>'
        + (typeof Clientes !== 'undefined' && Clientes.gerarLinkPortal
            ? '<button class="btn btn-secondary btn-sm" onclick="Clientes.gerarLinkPortal(\'' + Utils.escJs(_id) + '\')">🔗 Portal</button>' : '')
      + '</div>'
      + '</div>';
  }

  function _faixaVeredito(v, k, m) {
    const bons  = v.sinais.filter(s => s.bom === true);
    const ruins = v.sinais.filter(s => s.bom === false);
    const notas = v.sinais.filter(s => s.bom === null);

    function bloco(titulo, lista, classe, marca) {
      if (!lista.length) return '';
      return '<div class="vrd-col"><div class="vrd-col-tit ' + classe + '">' + titulo + '</div>'
        + lista.map(s => '<div class="vrd-item">' + marca + ' ' + Utils.escHtml(s.texto) + '</div>').join('')
        + '</div>';
    }

    return '<div class="ficha-veredito" style="' + _varsVeredito(v) + '">'
      + '<div class="vrd-selo">'
        + '<div class="vrd-label">' + Utils.escHtml(v.label) + '</div>'
        + '<div class="vrd-sub">vale a pena manter?</div>'
      + '</div>'
      + '<div class="vrd-sinais">'
        + bloco('A favor', bons, 'vrd-bom', '▲')
        + bloco('Contra', ruins, 'vrd-ruim', '▼')
        + bloco('A observar', notas, 'vrd-nota', '•')
      + '</div>'
      + '</div>';
  }

  function _faixaNumeros(m, k) {
    function cx(rot, val, sub, cor, dica, click) {
      return '<' + (click ? 'button' : 'div') + ' class="kpi"'
        + (cor ? ' style="--kc:' + cor + '"' : '')
        + (dica ? ' title="' + Utils.escHtml(dica) + '"' : '')
        + (click ? ' onclick="' + click + '"' : '')
        + '><div class="kpi-rot">' + rot + '</div>'
        + '<div class="kpi-val">' + val + '</div>'
        + '<div class="kpi-sub">' + (sub || '&nbsp;') + '</div>'
        + '</' + (click ? 'button' : 'div') + '>';
    }

    const margem = m.margemPct === null ? VAZIO
      : (m.temCusto ? m.margemPct + '%' : 'sem custo');
    const margemSub = m.temCusto
      ? Utils.formatCurrency(m.lucro) + ' de resultado'
      : 'nenhum custo lançado';
    const margemDica = m.temCusto
      ? 'Custo lançado em ' + m.comCusto + ' de ' + m.servicos.length + ' serviços.'
      : 'Sem custo lançado a margem sairia 100%, o que seria falso. Lance custo e horas no financeiro de cada serviço.';

    const cacVal = k.valor === null ? VAZIO
      : (k.semMidia ? 'sem mídia' : Utils.formatCurrency(k.valor));
    const cacSub = k.valor === null ? 'não dá para calcular' : (k.origem || 'origem não informada');
    const cacDica = k.valor === null ? k.motivo : k.base;

    let retorno = VAZIO, retornoSub = 'precisa de custo e de CAC';
    if (k.valor > 0 && m.lucro !== 0) {
      retorno = (m.lucro / k.valor).toFixed(1) + 'x';
      retornoSub = 'resultado sobre aquisição';
    } else if (k.semMidia) {
      retorno = 'n/a';
      retornoSub = 'cliente sem custo de mídia';
    }

    return '<div class="funil-kpis">'
      + cx('Receita contratada', Utils.formatCurrency(m.contratado),
           m.servicos.length + ' serviço(s)', 'var(--primary)')
      + cx('Margem', margem, margemSub, m.temCusto ? '#1E7A34' : '#94a3b8', margemDica)
      + cx('Ticket médio', Utils.formatCurrency(m.ticket),
           'por serviço', '#0891b2')
      + cx('Recebido', Utils.formatCurrency(m.recebido),
           m.contratado > 0 ? Math.round(m.recebido / m.contratado * 100) + '% do contratado' : '', '#1E7A34')
      + cx('A receber', Utils.formatCurrency(m.aReceber),
           m.semVencimento ? m.semVencimento + ' sem vencimento' : 'em aberto', '#d97706')
      + cx('Vencido', Utils.formatCurrency(m.vencido),
           m.nVencidas ? m.nVencidas + ' parcela(s)' : 'nada atrasado',
           m.vencido > 0 ? '#C42B2B' : '#94a3b8',
           'Parcelas em aberto com vencimento anterior a hoje.',
           m.vencido > 0 ? 'ClienteFicha.setAba(\'financeiro\')' : '')
      + cx('Custo de aquisição', cacVal, cacSub, '#8b5cf6', cacDica,
           'ClienteFicha.definirAquisicao()')
      + cx('Retorno', retorno, retornoSub, '#6366f1',
           'Resultado acumulado dividido pelo custo de aquisição.')
      + cx('Último serviço', m.ultimo ? Utils.formatDate(m.ultimo) : 'nunca',
           m.diasDesdeUltimo === null ? '' : 'há ' + m.diasDesdeUltimo + ' dias',
           m.diasDesdeUltimo !== null && m.diasDesdeUltimo > 365 ? '#C42B2B' : '#64748b')
      + '</div>';
  }

  function _barraAbas(m) {
    const contagem = {
      servicos: m.servicos.length,
      recorrencia: m.equipamentos.length,
      oportunidades: oportunidades(_id).faltam.length,
      relacionamento: DB.getAll('contatos').filter(ct => ct.clienteId === _id).length
        + DB.getAll('leads').filter(l => l.clienteId === _id).length,
      arquivos: typeof Anexos !== 'undefined' ? Anexos.contar('clientes', _id) : 0,
    };
    return '<div class="ficha-abas">'
      + ABAS.map(a => {
        const n = contagem[a.id];
        return '<button class="ficha-aba' + (_aba === a.id ? ' ativa' : '') + '"'
          + ' onclick="ClienteFicha.setAba(\'' + a.id + '\')">'
          + a.icon + ' ' + a.label
          + (n ? '<span class="ficha-aba-n">' + n + '</span>' : '')
          + '</button>';
      }).join('')
      + '</div>';
  }

  function _conteudoAba(c, m) {
    if (_aba === 'financeiro')     return _abaFinanceiro(c, m);
    if (_aba === 'recorrencia')    return _abaRecorrencia(c, m);
    if (_aba === 'oportunidades')  return _abaOportunidades(c, m);
    if (_aba === 'relacionamento') return _abaRelacionamento(c, m);
    if (_aba === 'arquivos')       return _abaArquivos(c);
    return _abaServicos(c, m);
  }

  /* ---------- ABA: SERVICOS ---------- */

  function _abaServicos(c, m) {
    if (!m.servicos.length) {
      return '<div class="card"><div class="empty-state">'
        + '<div class="empty-icon">🏗</div>'
        + '<div class="empty-title">Nenhum serviço lançado para este cliente</div>'
        + '<div class="empty-sub">Cada serviço prestado vira um lançamento com valor, custo, '
        + 'pagamentos e margem próprios. É a partir deles que a ficha calcula tudo.</div>'
        + '<button class="btn btn-primary mt-4" onclick="ClienteFicha.novoServico()">+ Lançar primeiro serviço</button>'
        + '</div></div>';
    }

    const linhas = [...m.linhas].sort((a, b) =>
      String(b.p.dataInicio || '').localeCompare(String(a.p.dataInicio || '')));

    const corpo = linhas.map(x => {
      const p = x.p, d = x.dre, r = x.receb;
      const temCusto = d.custoTotal > 0;
      const margemTxt = temCusto
        ? '<span class="font-bold" style="color:' + corDaMargem(d.margemPct) + '" title="Comparada com a margem media da carteira">'
          + d.margemPct + '%</span><div class="text-xs text-muted">' + Utils.formatCurrency(d.lucroLiquido) + '</div>'
        : '<span class="text-xs text-muted" title="Sem custo nem horas lançados neste serviço">sem custo</span>';

      const pagoPct = d.receita > 0 ? Math.round(r.recebido / d.receita * 100) : 0;
      const pagamento = '<div class="font-bold text-sm">' + Utils.formatCurrency(r.recebido) + '</div>'
        + '<div class="barrinha"><span style="width:' + Math.min(100, pagoPct) + '%;background:'
        + (r.vencido > 0 ? '#C42B2B' : '#1E7A34') + '"></span></div>'
        + '<div class="text-xs ' + (r.vencido > 0 ? '' : 'text-muted') + '" '
        + (r.vencido > 0 ? 'style="color:#C42B2B;font-weight:600"' : '') + '>'
        + (r.vencido > 0 ? Utils.formatCurrency(r.vencido) + ' vencido'
           : r.aReceber > 0 ? Utils.formatCurrency(r.aReceber) + ' a receber' : 'quitado')
        + '</div>';

      return '<tr>'
        + '<td class="text-xs font-bold text-muted" style="white-space:nowrap">'
          + Utils.escHtml(p.ordemServico || p.codigo || VAZIO) + '</td>'
        + '<td><div class="font-bold text-sm" style="min-width:180px">' + Utils.escHtml(p.titulo || VAZIO) + '</div>'
          + '<div class="text-xs text-muted">' + (p.responsavel ? Utils.escHtml(p.responsavel) + ' · ' : '')
          + Utils.formatDate(p.dataInicio) + '</div></td>'
        + '<td class="font-bold text-primary" style="white-space:nowrap">' + Utils.formatCurrency(d.receita) + '</td>'
        + '<td style="white-space:nowrap">' + (temCusto ? Utils.formatCurrency(d.custoTotal) : VAZIO) + '</td>'
        + '<td style="white-space:nowrap">' + margemTxt + '</td>'
        + '<td style="min-width:110px">' + pagamento + '</td>'
        + '<td>' + (p.art && p.art.numero
            ? '<span class="badge badge-green text-xs">ART</span>'
            : (p.status === 'em_andamento' ? '<span class="badge badge-red text-xs">sem ART</span>' : VAZIO)) + '</td>'
        + '<td class="text-xs">' + (p.npsCliente ? '⭐'.repeat(p.npsCliente) : VAZIO) + '</td>'
        + '<td>' + Utils.projBadge(p.status) + '</td>'
        + '<td><div class="tbl-actions">'
          + '<button class="btn btn-xs btn-secondary" onclick="Projetos.view(\'' + Utils.escJs(p.id) + '\')">Abrir</button>'
          + '<button class="btn btn-xs btn-secondary" title="Financeiro e pagamentos deste serviço" '
          + 'onclick="Projetos.view(\'' + Utils.escJs(p.id) + '\',\'financeiro\')">💰</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');

    const aviso = !m.temCusto
      ? '<div class="ficha-aviso">⚠ Nenhum serviço tem custo ou horas lançados. '
        + 'Sem isso a margem do cliente não existe: a conta mostraria 100% de lucro em tudo. '
        + 'O custo entra no financeiro de cada serviço, no botão 💰 da linha.</div>'
      : (m.comCusto < m.servicos.length
        ? '<div class="ficha-aviso">⚠ ' + m.comCusto + ' de ' + m.servicos.length
          + ' serviços têm custo lançado. A margem acima é parcial.</div>'
        : '');

    return aviso
      + '<div class="card">'
      + '<div class="card-header"><div class="font-bold">Serviços prestados</div>'
      + '<div class="text-sm text-muted">' + m.concluidos + ' concluído(s) · '
      + m.emAndamento + ' em andamento</div></div>'
      + '<div class="table-wrap"><table class="tbl"><thead><tr>'
      + '<th>OS</th><th>Serviço</th><th>Valor</th><th>Custo</th><th>Margem</th>'
      + '<th>Recebido</th><th>ART</th><th>NPS</th><th>Status</th><th>Ações</th>'
      + '</tr></thead><tbody>' + corpo + '</tbody></table></div></div>';
  }

  /* ---------- ABA: FINANCEIRO ---------- */

  function _abaFinanceiro(c, m) {
    const recs = _recebiveisDe(_id);
    const hoje = Utils.todayStr();

    const parcelas = [];
    recs.forEach(r => (r.parcelas || []).forEach((pc, i) => {
      if (!Utils.parcelaAberta(pc) && pc.status !== 'recebido') return;
      const proj = r.projetoId ? DB.get('projetos', r.projetoId) : null;
      parcelas.push({
        rec: r, pc: pc, n: i + 1, total: (r.parcelas || []).length,
        servico: proj ? (proj.titulo || '') : (r.descricao || ''),
        vencido: pc.status !== 'recebido' && pc.vencimento && pc.vencimento < hoje,
      });
    }));
    parcelas.sort((a, b) => String(a.pc.vencimento || '9999').localeCompare(String(b.pc.vencimento || '9999')));

    const resumo = '<div class="stats-row mb-4">'
      + '<div class="stat-box"><div class="stat-val" style="font-size:15px">' + Utils.formatCurrency(m.contratado) + '</div><div class="stat-lbl">Contratado</div></div>'
      + '<div class="stat-box" style="--stat-color:#1E7A34"><div class="stat-val" style="font-size:15px">' + Utils.formatCurrency(m.recebido) + '</div><div class="stat-lbl">Recebido</div></div>'
      + '<div class="stat-box" style="--stat-color:#d97706"><div class="stat-val" style="font-size:15px">' + Utils.formatCurrency(m.aReceber) + '</div><div class="stat-lbl">A receber</div></div>'
      + '<div class="stat-box" style="--stat-color:' + (m.vencido > 0 ? '#C42B2B' : 'var(--border-strong)') + '"><div class="stat-val" style="font-size:15px">' + Utils.formatCurrency(m.vencido) + '</div><div class="stat-lbl">Vencido</div></div>'
      + '<div class="stat-box" style="--stat-color:#8b5cf6"><div class="stat-val" style="font-size:15px">' + (m.temCusto ? Utils.formatCurrency(m.custo) : VAZIO) + '</div><div class="stat-lbl">Custo lançado</div></div>'
      + '<div class="stat-box" style="--stat-color:#6366f1"><div class="stat-val" style="font-size:15px">' + Utils.formatCurrency(m.comissoes) + '</div><div class="stat-lbl">Comissões</div></div>'
      + '</div>';

    if (!parcelas.length) {
      return resumo + '<div class="card"><div class="text-sm text-muted p-3">'
        + 'Nenhuma parcela registrada para este cliente. O recebível nasce junto com o serviço '
        + 'quando ele tem valor, ou pode ser lançado no financeiro do serviço.</div></div>';
    }

    const corpo = parcelas.map(x => {
      const pc = x.pc;
      const recebida = pc.status === 'recebido';
      const st = recebida
        ? '<span class="badge badge-green">Recebido</span>'
        : x.vencido ? '<span class="badge badge-red">Vencido</span>'
        : !pc.vencimento ? '<span class="badge badge-gray" title="Parcela sem data de vencimento nunca aparece como atrasada">Sem data</span>'
        : '<span class="badge badge-yellow">Em aberto</span>';
      return '<tr>'
        + '<td class="text-sm" style="white-space:nowrap">' + (pc.vencimento ? Utils.formatDate(pc.vencimento) : VAZIO) + '</td>'
        + '<td><div class="text-sm" style="min-width:160px">' + Utils.escHtml(x.servico || VAZIO) + '</div>'
          + '<div class="text-xs text-muted">' + Utils.escHtml(pc.descricao || ('Parcela ' + x.n + '/' + x.total)) + '</div></td>'
        + '<td class="font-bold" style="white-space:nowrap">' + Utils.formatCurrency(pc.valor) + '</td>'
        + '<td class="text-xs text-muted">' + Utils.escHtml(pc.formaPagamento || VAZIO) + '</td>'
        + '<td class="text-xs text-muted">' + (pc.dataRecebimento ? Utils.formatDate(pc.dataRecebimento) : VAZIO) + '</td>'
        + '<td>' + st + '</td>'
        + '<td>' + (x.rec.projetoId
            ? '<button class="btn btn-xs btn-secondary" onclick="Projetos.view(\'' + Utils.escJs(x.rec.projetoId) + '\',\'financeiro\')">Abrir serviço</button>'
            : '') + '</td>'
        + '</tr>';
    }).join('');

    return resumo
      + '<div class="card"><div class="card-header"><div class="font-bold">Parcelas</div>'
      + '<div class="text-sm text-muted">' + parcelas.length + ' lançamento(s)</div></div>'
      + '<div class="table-wrap"><table class="tbl"><thead><tr>'
      + '<th>Vencimento</th><th>Serviço</th><th>Valor</th><th>Forma</th><th>Recebido em</th><th>Status</th><th></th>'
      + '</tr></thead><tbody>' + corpo + '</tbody></table></div></div>';
  }

  /* ---------- ABA: RECORRENCIA ---------- */

  function _abaRecorrencia(c, m) {
    const temEq = typeof Equipamentos !== 'undefined';
    const eqs = m.equipamentos;

    const blocoEq = !eqs.length
      ? '<div class="card"><div class="empty-state">'
        + '<div class="empty-icon">⚙️</div>'
        + '<div class="empty-title">Sem parque cadastrado</div>'
        + '<div class="empty-sub">A renovação automática parte do equipamento: sessenta dias antes '
        + 'da próxima inspeção a oportunidade entra no funil sozinha. Sem equipamento cadastrado '
        + 'esse cliente nunca vai gerar recorrência.</div>'
        + (temEq ? '<button class="btn btn-primary mt-4" onclick="Equipamentos.openForm(null,\'' + Utils.escJs(_id) + '\')">+ Cadastrar equipamento</button>' : '')
        + '</div></div>'
      : '<div class="card"><div class="card-header"><div class="font-bold">Parque de equipamentos</div>'
        + (temEq ? '<button class="btn btn-xs btn-primary" onclick="Equipamentos.openForm(null,\'' + Utils.escJs(_id) + '\')">+ Equipamento</button>' : '')
        + '</div><div class="table-wrap"><table class="tbl"><thead><tr>'
        + '<th>TAG</th><th>Tipo</th><th>Norma</th><th>Última inspeção</th><th>Próxima</th><th>Situação</th><th>Ações</th>'
        + '</tr></thead><tbody>'
        + eqs.map(e => {
          const sit = temEq ? Equipamentos.situacao(e) : 'sem_data';
          const info = temEq && Equipamentos.SIT[sit] ? Equipamentos.SIT[sit] : { label: sit, badge: 'badge-gray' };
          const prox = temEq ? Equipamentos.proximaInspecao(e) : e.proximaInspecao;
          const tipo = temEq && Equipamentos.TIPOS[e.tipo] ? Equipamentos.TIPOS[e.tipo] : null;
          return '<tr>'
            + '<td class="font-bold text-sm">' + Utils.escHtml(e.tag || VAZIO) + '</td>'
            + '<td class="text-sm">' + (tipo ? tipo.icon + ' ' + Utils.escHtml(tipo.label) : Utils.escHtml(e.tipo || VAZIO)) + '</td>'
            + '<td class="text-xs text-muted">' + Utils.escHtml(e.norma || VAZIO) + '</td>'
            + '<td class="text-xs text-muted">' + (e.ultimaInspecao ? Utils.formatDate(e.ultimaInspecao) : VAZIO) + '</td>'
            + '<td class="text-sm">' + (prox ? Utils.formatDate(prox) : VAZIO) + '</td>'
            + '<td><span class="badge ' + info.badge + '">' + Utils.escHtml(info.label) + '</span></td>'
            + '<td><div class="tbl-actions">'
              + (temEq ? '<button class="btn btn-xs btn-secondary" onclick="Equipamentos.openForm(\'' + Utils.escJs(e.id) + '\')">✏</button>' : '')
              + (temEq ? '<button class="btn btn-xs btn-secondary" title="Gerar oportunidade de renovação no funil" onclick="Equipamentos.gerarOportunidade(\'' + Utils.escJs(e.id) + '\')">🎯</button>' : '')
            + '</div></td>'
            + '</tr>';
        }).join('')
        + '</tbody></table></div></div>';

    const cts = m.contratos;
    const blocoCt = '<div class="card mt-4"><div class="card-header"><div class="font-bold">Contratos</div>'
      + '<div class="text-sm text-muted">' + cts.length + '</div></div>'
      + (!cts.length
        ? '<div class="text-sm text-muted p-3">Nenhum contrato registrado. Serviço avulso não gera '
          + 'receita previsível: é o contrato que transforma este cliente em recorrência.</div>'
        : '<div class="table-wrap"><table class="tbl"><thead><tr>'
          + '<th>Número</th><th>Objeto</th><th>Valor</th><th>Início</th><th>Fim</th><th>Renovação</th><th>Status</th>'
          + '</tr></thead><tbody>'
          + cts.map(ct => '<tr>'
            + '<td class="text-xs font-bold text-muted">' + Utils.escHtml(ct.numero || VAZIO) + '</td>'
            + '<td class="text-sm" style="min-width:180px">' + Utils.escHtml(ct.objeto || ct.descricao || VAZIO) + '</td>'
            + '<td class="font-bold text-sm">' + Utils.formatCurrency(ct.valor) + '</td>'
            + '<td class="text-xs text-muted">' + (ct.dataInicio ? Utils.formatDate(ct.dataInicio) : VAZIO) + '</td>'
            + '<td class="text-xs text-muted">' + (ct.dataFim ? Utils.formatDate(ct.dataFim) : VAZIO) + '</td>'
            + '<td class="text-xs">' + (ct.renovacaoAutomatica ? '🔁 automática' : 'manual') + '</td>'
            + '<td class="text-xs">' + Utils.escHtml(ct.status || VAZIO) + '</td>'
            + '</tr>').join('')
          + '</tbody></table></div>')
      + '</div>';

    return blocoEq + blocoCt;
  }

  /* ---------- ABA: OPORTUNIDADES ---------- */

  function _abaOportunidades(c, m) {
    const o = oportunidades(_id);

    if (!o.catalogo.length) {
      return '<div class="card"><div class="text-sm text-muted p-3">'
        + 'O catálogo de serviços está vazio. Sem ele não há com o que comparar o que este cliente '
        + 'já comprou.</div></div>';
    }

    const cartao = (item) => {
      const s = item.servico;
      const doParque = item.motivo === 'parque';
      return '<div class="op-card' + (doParque ? ' op-prio' : '') + '">'
        + '<div class="op-nome">' + Utils.escHtml(s.nome || VAZIO) + '</div>'
        + '<div class="op-cat">' + Utils.escHtml(s.categoria || '') + (s.unidade ? ' · por ' + Utils.escHtml(s.unidade) : '') + '</div>'
        + (doParque
            ? '<div class="op-motivo">O parque deste cliente tem equipamento sob esta norma</div>'
            : '<div class="op-motivo op-motivo-fraco">Nunca foi oferecido a este cliente</div>')
        + '<div class="op-acao">'
          + '<button class="btn btn-xs btn-primary" onclick="ClienteFicha.oferecer(\'' + Utils.escJs(s.id) + '\')">Criar oportunidade</button>'
        + '</div>'
        + '</div>';
    };

    const prioritarios = o.faltam.filter(i => i.motivo === 'parque');
    const outros       = o.faltam.filter(i => i.motivo !== 'parque');

    const jaTemHtml = o.jaTem.length
      ? '<div class="card mt-4"><div class="card-header"><div class="font-bold">Já contratou</div>'
        + '<div class="text-sm text-muted">' + o.jaTem.length + ' de ' + o.catalogo.length + ' do catálogo</div></div>'
        + '<div class="p-3" style="display:flex;gap:6px;flex-wrap:wrap">'
        + o.jaTem.map(s => '<span class="badge badge-green">' + Utils.escHtml(s.nome) + '</span>').join('')
        + '</div>'
        + '<div class="text-xs text-muted" style="padding:0 14px 12px">'
        + 'Esta leitura é inferida do texto dos serviços, contratos, propostas e do interesse '
        + 'registrado no funil. Um serviço cujo título não cita o nome do catálogo não aparece aqui.'
        + '</div></div>'
      : '';

    return (prioritarios.length
        ? '<div class="card"><div class="card-header"><div class="font-bold">O parque pede</div>'
          + '<div class="text-sm text-muted">' + prioritarios.length + ' serviço(s)</div></div>'
          + '<div class="op-grid">' + prioritarios.map(cartao).join('') + '</div></div>'
        : '')
      + (outros.length
        ? '<div class="card' + (prioritarios.length ? ' mt-4' : '') + '">'
          + '<div class="card-header"><div class="font-bold">Nunca ofereceu</div>'
          + '<div class="text-sm text-muted">' + outros.length + ' serviço(s)</div></div>'
          + '<div class="op-grid">' + outros.map(cartao).join('') + '</div></div>'
        : '')
      + (!o.faltam.length
        ? '<div class="card"><div class="text-sm p-3">Este cliente já contratou tudo o que existe no catálogo.</div></div>'
        : '')
      + jaTemHtml;
  }

  /* ---------- ABA: RELACIONAMENTO ---------- */

  function _abaRelacionamento(c, m) {
    const contatos   = DB.getAll('contatos').filter(ct => ct.clienteId === _id);
    const leads      = DB.getAll('leads').filter(l => l.clienteId === _id)
      .sort((a, b) => String(b.dataEntrada || b.createdAt || '').localeCompare(String(a.dataEntrada || a.createdAt || '')));
    const propostas  = DB.getAll('propostas').filter(pr => pr.clienteId === _id);
    const atividades = DB.getAll('atividades').filter(a => a.clienteId === _id)
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 20);
    const visitas    = DB.getAll('visitas').filter(vi => vi.clienteId === _id);

    const temContatos = typeof Contatos !== 'undefined';

    const blocoContatos = '<div class="card"><div class="card-header"><div class="font-bold">Pessoas</div>'
      + (temContatos ? '<button class="btn btn-xs btn-primary" onclick="Contatos.openForm(null,\'' + Utils.escJs(_id) + '\')">+ Contato</button>' : '')
      + '</div>'
      + (!contatos.length
        ? '<div class="text-sm text-muted p-3">Nenhuma pessoa cadastrada. Negócio se faz com pessoa, '
          + 'não com CNPJ: sem um nome aqui o follow-up morre quando o contato troca de emprego.</div>'
        : '<div class="table-wrap"><table class="tbl"><thead><tr>'
          + '<th>Nome</th><th>Cargo</th><th>Telefone</th><th>E-mail</th><th>Decisor</th><th></th>'
          + '</tr></thead><tbody>'
          + contatos.map(ct => '<tr>'
            + '<td class="font-bold text-sm">' + Utils.escHtml(ct.nome || VAZIO) + '</td>'
            + '<td class="text-sm text-muted">' + Utils.escHtml(ct.cargo || VAZIO) + '</td>'
            + '<td class="text-sm">' + Utils.escHtml(ct.telefone || VAZIO) + '</td>'
            + '<td class="text-sm">' + Utils.escHtml(ct.email || VAZIO) + '</td>'
            + '<td>' + (ct.decisor ? '<span class="badge badge-blue">decisor</span>' : '') + '</td>'
            + '<td>' + (temContatos ? '<button class="btn btn-xs btn-secondary" onclick="Contatos.openForm(\'' + Utils.escJs(ct.id) + '\')">✏</button>' : '') + '</td>'
            + '</tr>').join('')
          + '</tbody></table></div>')
      + '</div>';

    const blocoFunil = '<div class="card mt-4"><div class="card-header"><div class="font-bold">Negócios no funil</div>'
      + '<div class="text-sm text-muted">' + leads.length + '</div></div>'
      + (!leads.length
        ? '<div class="text-sm text-muted p-3">Nenhum negócio deste cliente no funil. '
          + 'Sem isso não há como saber por qual canal ele chegou, e o custo de aquisição fica sem base.</div>'
        : '<div class="table-wrap"><table class="tbl"><thead><tr>'
          + '<th>Negócio</th><th>Origem</th><th>Valor</th><th>Entrada</th><th>Status</th><th></th>'
          + '</tr></thead><tbody>'
          + leads.map(l => '<tr>'
            + '<td><div class="text-sm font-bold" style="min-width:170px">' + Utils.escHtml(l.titulo || VAZIO) + '</div>'
              + '<div class="text-xs text-muted">' + Utils.escHtml(l.servicoInteresse || '') + '</div></td>'
            + '<td class="text-xs">' + (ICONE_ORIGEM[l.origemLead] || '') + ' ' + Utils.escHtml(l.origemLead || VAZIO) + '</td>'
            + '<td class="font-bold text-sm">' + Utils.formatCurrency(l.valorFechado || l.valorEstimado) + '</td>'
            + '<td class="text-xs text-muted">' + (l.dataEntrada ? Utils.formatDate(l.dataEntrada) : VAZIO) + '</td>'
            + '<td>' + Utils.leadBadge(l.status) + '</td>'
            + '<td>' + (typeof Pipeline !== 'undefined' && Pipeline.viewLead
                ? '<button class="btn btn-xs btn-secondary" onclick="Pipeline.viewLead(\'' + Utils.escJs(l.id) + '\')">Abrir</button>' : '') + '</td>'
            + '</tr>').join('')
          + '</tbody></table></div>')
      + '</div>';

    const blocoProp = '<div class="card mt-4"><div class="card-header"><div class="font-bold">Propostas</div>'
      + '<div class="text-sm text-muted">' + propostas.length + '</div></div>'
      + (!propostas.length
        ? '<div class="text-sm text-muted p-3">Nenhuma proposta registrada para este cliente.</div>'
        : '<div class="table-wrap"><table class="tbl"><thead><tr>'
          + '<th>Número</th><th>Objeto</th><th>Valor</th><th>Status</th><th></th>'
          + '</tr></thead><tbody>'
          + propostas.map(pr => '<tr>'
            + '<td class="text-xs font-bold text-muted">' + Utils.escHtml(pr.numero || VAZIO) + '</td>'
            + '<td class="text-sm" style="min-width:170px">' + Utils.escHtml(pr.titulo || pr.objeto || VAZIO) + '</td>'
            + '<td class="font-bold text-sm">' + Utils.formatCurrency(pr.valor) + '</td>'
            + '<td>' + Utils.propBadge(pr.status) + '</td>'
            + '<td>' + (typeof Propostas !== 'undefined' && Propostas.view
                ? '<button class="btn btn-xs btn-secondary" onclick="Propostas.view(\'' + Utils.escJs(pr.id) + '\')">Abrir</button>' : '') + '</td>'
            + '</tr>').join('')
          + '</tbody></table></div>')
      + '</div>';

    const blocoAtiv = '<div class="card mt-4"><div class="card-header"><div class="font-bold">Interações recentes</div>'
      + '<div class="text-sm text-muted">' + visitas.length + ' visita(s) registrada(s)</div></div>'
      + (!atividades.length
        ? '<div class="text-sm text-muted p-3">Nenhuma interação registrada.</div>'
        : '<div class="p-3">' + atividades.map(a =>
            '<div class="tl-item"><span class="tl-data">' + (a.data ? Utils.formatDate(a.data) : VAZIO) + '</span>'
            + '<span class="tl-txt">' + Utils.escHtml(a.titulo || a.descricao || VAZIO) + '</span>'
            + (a.status ? Utils.activBadge(a.status) : '') + '</div>').join('')
          + '</div>')
      + '</div>';

    return blocoContatos + blocoFunil + blocoProp + blocoAtiv + _blocoAuditoria();
  }

  /* ---------- ABA: ARQUIVOS ---------- */

  function _abaArquivos(c) {
    if (typeof Anexos === 'undefined') {
      return '<div class="card"><div class="text-sm text-muted p-3">Módulo de anexos não carregado.</div></div>';
    }
    setTimeout(() => {
      try { Anexos.renderLista('fichaArquivos', { entidade: 'clientes', registroId: _id }); } catch (e) { /* lista opcional */ }
    }, 0);
    return '<div class="card"><div class="card-header"><div class="font-bold">Arquivos do cliente</div>'
      + Anexos.botao('clientes', _id, c.nome) + '</div>'
      + '<div id="fichaArquivos" class="p-3"></div></div>';
  }

  /* ====================================================
     ACOES
     ==================================================== */

  function novoServico() {
    if (typeof Projetos === 'undefined') { Toast.error('Módulo de serviços não carregado.'); return; }
    Projetos.openForm(null, { clienteId: _id });
  }

  function editar() {
    if (typeof Clientes === 'undefined') return;
    Clientes.openForm(_id);
  }

  /* Canal e custo de aquisicao. O canal e deduzido do negocio de origem no
     funil; aqui da para corrigir e informar quanto custou trazer o cliente,
     que e o que faz o CAC sair do palpite. */
  function definirAquisicao() {
    const c = _cliente(_id);
    if (!c) return;
    const k = cac(_id);
    const lead = _leadDeOrigem(_id);
    const origens = Object.keys(ICONE_ORIGEM);

    Modal.open({
      title: '🎯 Aquisição de ' + (c.nome || 'cliente'),
      size: 'modal-lg',
      saveLabel: 'Salvar',
      body: '<div class="text-sm text-muted" style="margin-bottom:14px">'
          + (lead
              ? 'O canal vem do negócio <strong>' + Utils.escHtml(lead.titulo || 'sem título')
                + '</strong>, o mais antigo do funil ligado a este cliente'
                + (lead.origemLead ? ', com origem <strong>' + Utils.escHtml(lead.origemLead) + '</strong>.' : ', que está sem origem preenchida.')
              : 'Nenhum negócio do funil está ligado a este cliente, por isso não há de onde deduzir o canal.')
          + '</div>'
        + '<div class="form-group"><label class="form-label">Canal de aquisição</label>'
        + '<select class="form-control" id="faqCanal">'
        + '<option value="">Deduzir do funil' + (lead && lead.origemLead ? ' (' + Utils.escHtml(lead.origemLead) + ')' : ' (sem origem)') + '</option>'
        + origens.map(o => '<option value="' + Utils.escHtml(o) + '"' + (c.canalAquisicao === o ? ' selected' : '') + '>'
            + ICONE_ORIGEM[o] + ' ' + Utils.escHtml(o) + '</option>').join('')
        + '</select>'
        + '<div class="text-xs text-muted" style="margin-top:4px">Escolher aqui sobrescreve o que vem do funil.</div></div>'
        + '<div class="form-group"><label class="form-label">Custo de aquisição (R$)</label>'
        + '<input class="form-control" id="faqCusto" inputmode="decimal" placeholder="0,00" value="'
        + (Number(c.custoAquisicao) > 0 ? Utils.moneyToInput(c.custoAquisicao) : '') + '">'
        + '<div class="text-xs text-muted" style="margin-top:4px">Quanto custou trazer este cliente: '
        + 'mídia, comissão de indicação, viagem de prospecção. Deixar em branco faz o sistema estimar '
        + 'pela campanha de origem.</div></div>'
        + '<div class="ficha-aviso" style="margin:0">'
        + (k.valor === null
            ? '⚠ Hoje o custo de aquisição não pode ser calculado: ' + Utils.escHtml(k.motivo || '') + '.'
            : 'Hoje o sistema usa ' + (k.semMidia ? 'custo de mídia zero' : Utils.formatCurrency(k.valor))
              + ', base: ' + Utils.escHtml(k.base || '') + '.')
        + '</div>',
      saveCb: () => {
        const canal = document.getElementById('faqCanal').value;
        const custo = Utils.parseMoney(document.getElementById('faqCusto').value);
        DB.update('clientes', _id, { canalAquisicao: canal, custoAquisicao: custo });
        Modal.close();
        Toast.success('Aquisição atualizada.');
        _render();
      },
    });
  }

  /* Cria um negocio no funil para o servico do catalogo que o cliente ainda
     nao contratou. Nao cria proposta nem valor: so abre a oportunidade onde
     ela e trabalhada. */
  function oferecer(servicoId) {
    const s = DB.get('catalogo_servicos', servicoId);
    const c = _cliente(_id);
    if (!s || !c) { Toast.error('Serviço do catálogo não encontrado.'); return; }

    const jaExiste = DB.getAll('leads').some(l => l.clienteId === _id
      && !['fechado_perdido', 'executado'].includes(l.status)
      && String(l.servicoInteresse || '') === String(s.nome || ''));
    if (jaExiste) {
      Toast.warning('Já existe um negócio aberto deste serviço para este cliente.');
      setAba('relacionamento');
      return;
    }

    const lead = DB.create('leads', {
      titulo: (s.nome || 'Serviço') + ' · ' + (c.nome || ''),
      empresa: c.nome || '',
      clienteId: _id,
      segmento: c.segmento || '',
      servicoInteresse: s.nome || '',
      origemLead: 'Recorrência',
      status: 'novo',
      valorEstimado: Number(s.precoBase) || 0,
      dataEntrada: Utils.todayStr(),
      responsavel: c.engResponsavel || '',
      contato: '',
      observacoes: 'Oportunidade aberta a partir da ficha do cliente'
        + (Number(s.precoBase) > 0 ? '' : '. O serviço está sem preço no catálogo, o valor entrou como zero.'),
    });

    Toast.success('Oportunidade criada no funil: ' + (s.nome || ''));
    if (lead && Number(s.precoBase) <= 0) {
      Toast.warning('Este serviço está sem preço no catálogo, por isso o valor ficou em zero.');
    }
    _render();
  }

  return {
    // navegacao
    abrir, voltar, fechar, setAba, recarregarSeAberta,
    // acoes
    novoServico, editar, definirAquisicao, oferecer,
    // calculos reaproveitaveis por outras telas
    metricas, cac, veredito, oportunidades, origemDe, corDaMargem,
  };
})();
