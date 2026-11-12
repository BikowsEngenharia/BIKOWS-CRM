/* ==========================================
   FINANCEIRO — NÚCLEO (fonte única de verdade do dinheiro)

   Por que este arquivo existe
   ---------------------------
   O mesmo dinheiro aparece em mais de um lugar no banco. Um custo lançado
   dentro de um serviço pode virar uma conta a pagar, e essa conta, ao ser
   quitada, vira um lançamento de despesa. São três registros para um único
   gasto. O mesmo vale para receita: a parcela do recebível vira lançamento
   quando é recebida.

   Somar tudo conta o mesmo dinheiro duas ou três vezes. Então aqui vale uma
   regra única, e todo o resto do sistema passa por estas funções:

     RECEITA DO SERVIÇO ...... projeto.valor (contratada)
     RECEBIDO ................ parcelas dos recebíveis com status recebido
     CUSTO DO SERVIÇO ........ projeto.financeiro.custos + horas
     COMISSÃO DO SERVIÇO ..... projeto.financeiro.parceiros
     DESPESA DA EMPRESA ...... lançamentos SEM vínculo com serviço
     PESSOAL ................. folha + func_lancamentos

   Um lançamento ou conta a pagar que só repete um dinheiro cujo dono é o
   serviço (ou o recebível) é chamado aqui de ESPELHO. O espelho serve para
   dizer QUANDO e A QUEM se pagou. Ele nunca entra na soma: o valor entra
   pela origem.

   Nada neste arquivo guarda meta, margem desejada ou valor de cliente. Toda
   comparação sai da média da própria carteira, calculada na hora, porque o
   repositório é público.
   ========================================== */
const FinNucleo = (() => {

  /* ====================================================
     1. ESPELHOS — o que não deve ser somado duas vezes
     ==================================================== */

  /* Dado um lançamento, devolve de onde ele é espelho — ou null se ele é
     dinheiro próprio da empresa, que ninguém mais registra.

     Os vínculos existentes no banco, em ordem de confiança:
       recebivelId + parcelaId .. criado ao receber uma parcela
       origem=projeto_financeiro  criado pelo financeiro do serviço
       contaId .................. criado ao quitar uma conta a pagar; só é
                                  espelho de serviço se a conta também for
       custoId / parceiroId ..... vínculos diretos (código novo) */
  function espelhoLanc(l) {
    if (!l) return null;
    if (l.recebivelId || l.parcelaId) {
      return { fonte: 'recebivel', id: l.recebivelId || null, motivo: 'parcela de recebível' };
    }
    if (l.custoId)    return { fonte: 'custo_servico',    id: l.projetoId || null, motivo: 'custo de serviço' };
    if (l.parceiroId) return { fonte: 'comissao_servico', id: l.projetoId || null, motivo: 'comissão de serviço' };
    if (l.origem === 'projeto_financeiro') {
      return { fonte: 'servico', id: l.projetoId || null, motivo: 'financeiro do serviço' };
    }
    if (l.contaId) {
      const c = DB.get('contaspagar', l.contaId);
      if (c && c.origem === 'projeto_financeiro') {
        return { fonte: 'custo_servico', id: c.projetoId || null, motivo: 'custo de serviço (via conta a pagar)' };
      }
      /* Conta comum ou de despesa fixa: a conta é o compromisso, o lançamento
         é o dinheiro que saiu. O lançamento é o dado real, não espelho. */
      return null;
    }
    return null;
  }

  function ehEspelho(l) { return espelhoLanc(l) !== null; }

  /* Conta a pagar que nasceu dentro de um serviço: o compromisso é real (há um
     fornecedor esperando), mas o VALOR já está contado no custo do serviço. */
  function contaEhEspelho(c) {
    return !!(c && c.origem === 'projeto_financeiro');
  }

  /* ====================================================
     2. SERVIÇO — receita, custo e margem de um projeto
     ==================================================== */

  function _fin(p) {
    return (p && p.financeiro) ? p.financeiro : {};
  }

  /* Horas do serviço: o timesheet é a fonte preferida, porque sabe QUEM
     trabalhou e portanto quanto custou de verdade. Sem timesheet, cai no campo
     manual do projeto (horasTrabalhadas × valorHora). Nunca soma os dois. */
  function horasServico(p) {
    if (!p) return { horas: 0, custo: 0, fonte: 'nenhuma', porPessoa: [] };
    const apontamentos = DB.getAll('timesheet').filter(t => t.projetoId === p.id);
    if (apontamentos.length) {
      const porPessoa = [];
      let horas = 0, custo = 0;
      apontamentos.forEach(t => {
        const h = Number(t.horas) || 0;
        /* O custo/hora gravado no apontamento ganha de tudo: foi o que a
           pessoa declarou na hora. Sem ele, usa o custo/hora calculado do
           funcionario. Sem funcionario identificado, nao ha custo. */
        const ch = Number(t.custoHora) || Number(t.valorHora)
          || ((typeof CustoHora !== 'undefined' && t.funcionarioId) ? CustoHora.custoHoraDe(t.funcionarioId) : 0);
        horas += h;
        custo += h * ch;
        const nome = (t.funcionarioId ? DB.get('funcionarios', t.funcionarioId)?.nome : null)
          || t.funcionarioNome || t.responsavel || 'Não identificado';
        const ja = porPessoa.find(x => x.nome === nome);
        if (ja) { ja.horas += h; ja.custo += h * ch; }
        else porPessoa.push({ nome, horas: h, custo: h * ch, funcionarioId: t.funcionarioId || null });
      });
      return { horas, custo, fonte: 'timesheet', porPessoa };
    }
    const h = Number(p.horasTrabalhadas) || 0;
    const vh = Number(p.valorHora) || 0;
    return { horas: h, custo: h * vh, fonte: h ? 'manual' : 'nenhuma', porPessoa: [] };
  }

  /* Custo total do serviço, item por item, com a origem de cada um.
     `itens` é o detalhado que o geral abre quando o usuário quer saber de onde
     veio o total — é o "se precisar de mais informações devemos ter como
     acessar um detalhado". */
  function custoServico(p) {
    if (!p) return { diretos: 0, horas: 0, comissoes: 0, total: 0, itens: [], temCusto: false };
    const fin = _fin(p);
    const itens = [];

    let diretos = 0;
    (fin.custos || []).forEach(c => {
      const v = Number(c.valor) || 0;
      diretos += v;
      itens.push({
        id: c.id, grupo: 'direto', descricao: c.descricao || 'Custo',
        categoria: c.categoria || 'Outros', fornecedor: c.fornecedor || '',
        valor: v, data: c.data || '', espelhado: !!c.lancadoFinanceiro,
      });
    });

    /* Campo antigo "custos diretos" do formulário do projeto. Só vale quando
       não há custo lançado — senão o mesmo dinheiro entraria duas vezes. */
    if (diretos === 0 && (Number(p.custosDirectos) || 0) > 0) {
      const v = Number(p.custosDirectos) || 0;
      diretos += v;
      itens.push({
        id: null, grupo: 'direto', descricao: 'Custos diretos (campo do cadastro)',
        categoria: 'Outros', fornecedor: '', valor: v, data: p.dataInicio || '', espelhado: false,
      });
    }

    const hs = horasServico(p);
    if (hs.custo > 0) {
      itens.push({
        id: null, grupo: 'horas',
        descricao: `Horas técnicas (${hs.horas.toLocaleString('pt-BR')} h · ${hs.fonte === 'timesheet' ? 'apontadas' : 'estimadas'})`,
        categoria: 'Mão de obra', fornecedor: '', valor: hs.custo, data: '', espelhado: false,
      });
    }

    /* Comissão percentual incide sobre o lucro bruto — então precisa do custo
       antes dela. Comissão de valor fixo não depende de nada. */
    const custoAntesComissao = diretos + hs.custo;
    const lucroBruto = (Number(p.valor) || 0) - custoAntesComissao;
    let comissoes = 0;
    (fin.parceiros || []).forEach(par => {
      const v = par.tipo === 'comissao'
        ? (lucroBruto > 0 ? lucroBruto * (Number(par.percentual) || 0) / 100 : 0)
        : (Number(par.valorFixo) || 0);
      comissoes += v;
      itens.push({
        id: par.id, grupo: 'comissao',
        descricao: `${par.nome || 'Parceiro'}${par.tipo === 'comissao' ? ` (${par.percentual || 0}% do lucro bruto)` : ''}`,
        categoria: 'Comissão / Parceria', fornecedor: par.nome || '',
        valor: v, data: par.dataPagamento || '', espelhado: !!par.lancadoFinanceiro,
      });
    });

    return {
      diretos, horas: hs.custo, horasQtd: hs.horas, horasFonte: hs.fonte, horasPorPessoa: hs.porPessoa,
      comissoes, total: diretos + hs.custo + comissoes, itens,
      temCusto: (diretos + hs.custo + comissoes) > 0,
    };
  }

  /* Recebíveis de um serviço. Resolve por projetoId e também pelo clienteId
     quando o recebível não guardou o projeto (acontece em registros antigos). */
  function recebiveisServico(p) {
    if (!p) return [];
    return DB.getAll('recebiveis')
      .filter(r => Utils.recebivelAtivo(r))
      .filter(r => r.projetoId === p.id);
  }

  /* As parcelas de um serviço, venham de onde vierem.

     Por que isto não é simplesmente "ler a tabela de recebíveis":
     o recebimento pode ter sido registrado em dois lugares, e na base real
     cada serviço usou um. Uns têm recebível com parcelas; outros têm só o
     registro dentro de `projeto.financeiro.recebimentos`, sem recebível
     nenhum. Ler apenas a tabela perdia o dinheiro dos segundos; ler os dois
     e somar contaria em dobro os que existem nas duas pontas.

     A regra: o recebível manda. O registro de dentro do serviço só entra
     quando não existe recebível correspondente — ou seja, quando ele é a
     única memória daquele dinheiro. O vínculo é o campo `recebiveisId`. */
  function parcelasDoServico(p) {
    const lista = [];
    const idsRecebiveis = new Set();

    recebiveisServico(p).forEach(r => {
      idsRecebiveis.add(r.id);
      (r.parcelas || []).forEach(pc => lista.push({
        valor: pc.valor, status: pc.status, vencimento: pc.vencimento,
        dataPagamento: pc.dataPagamento, fonte: 'recebivel', recebivelId: r.id,
      }));
    });

    const fin = _fin(p);
    (fin.recebimentos || []).forEach(rec => {
      /* Já existe recebível para este recebimento: ele é espelho, sai fora. */
      if (rec.recebiveisId && idsRecebiveis.has(rec.recebiveisId)) return;
      /* Aponta para um recebível que não existe mais (apagado), ou nunca teve:
         aqui dentro é a única memória do dinheiro, então entra. */
      if (rec.recebiveisId && DB.get('recebiveis', rec.recebiveisId)) return;
      lista.push({
        valor: rec.valor, status: rec.status,
        vencimento: rec.vencimento,
        dataPagamento: rec.dataRecebimento || rec.dataPagamento || rec.vencimento,
        fonte: 'servico', recebimentoId: rec.id,
      });
    });
    return lista;
  }

  /* Soma um conjunto de parcelas já resolvido por `parcelasDoServico`. */
  function somarLista(parcelas) {
    let recebido = 0, aReceber = 0, vencido = 0, nVencidas = 0, semVenc = 0;
    (parcelas || []).forEach(pc => {
      const v = Number(pc.valor) || 0;
      if (pc.status === 'cancelado') return;
      if (pc.status === 'recebido') { recebido += v; return; }
      aReceber += v;
      if (!pc.vencimento) { semVenc += v; return; }
      if (Utils.isOverdue(pc.vencimento)) { vencido += v; nVencidas++; }
    });
    return { recebido, aReceber, vencido, nVencidas, semVenc };
  }

  function somarParcelas(recebiveis) {
    let recebido = 0, aReceber = 0, vencido = 0, nVencidas = 0, semVenc = 0;
    (recebiveis || []).forEach(r => {
      (r.parcelas || []).forEach(pc => {
        const v = Number(pc.valor) || 0;
        if (pc.status === 'cancelado') return;
        if (pc.status === 'recebido') { recebido += v; return; }
        aReceber += v;
        if (!pc.vencimento) { semVenc += v; return; }
        if (Utils.isOverdue(pc.vencimento)) { vencido += v; nVencidas++; }
      });
    });
    return { recebido, aReceber, vencido, nVencidas, semVenc };
  }

  /* Linha consolidada de UM serviço — é esta linha que vai para o geral.
     O geral recebe o total; o detalhe fica aqui dentro, em `custo.itens`. */
  function linhaServico(p) {
    const custo = custoServico(p);
    const receb = somarLista(parcelasDoServico(p));
    const contratada = Number(p.valor) || 0;
    const lucro = contratada - custo.total;
    return {
      projeto: p,
      id: p.id,
      titulo: p.titulo || 'Sem título',
      clienteId: p.clienteId || '',
      status: p.status || '',
      contratada,
      custoDireto: custo.diretos + custo.horas,
      comissoes: custo.comissoes,
      custoTotal: custo.total,
      lucro,
      margemPct: contratada > 0 ? Math.round((lucro / contratada) * 100) : null,
      temCusto: custo.temCusto,
      recebido: receb.recebido,
      aReceber: receb.aReceber,
      vencido: receb.vencido,
      nVencidas: receb.nVencidas,
      custo,
    };
  }

  /* Todos os serviços, exceto cancelados. Ordenado por receita. */
  function servicos(opcoes) {
    const o = opcoes || {};
    let lista = DB.getAll('projetos').filter(p => p.status !== 'cancelado');
    if (o.clienteId) lista = lista.filter(p => p.clienteId === o.clienteId);
    if (o.status)    lista = lista.filter(p => p.status === o.status);
    const linhas = lista.map(linhaServico);
    if (o.de || o.ate) {
      /* Filtro por período usa a data de início do serviço, não a do custo:
         um serviço é uma unidade de resultado, não um mês. */
      return linhas.filter(l => {
        const d = l.projeto.dataInicio || '';
        if (o.de && d && d < o.de) return false;
        if (o.ate && d && d > o.ate) return false;
        return true;
      }).sort((a, b) => b.contratada - a.contratada);
    }
    return linhas.sort((a, b) => b.contratada - a.contratada);
  }

  /* ====================================================
     CARTEIRA E RECEITA — o que as outras telas consomem

     Resumo, Relatórios, Metas e Hoje somavam dinheiro por conta própria, cada
     um com a sua regra. Era assim que o mesmo mês aparecia com números
     diferentes em telas diferentes. Agora todas chamam daqui.
     ==================================================== */

  /* Toda a carteira: recebido, a receber e vencido, sem contar nada duas
     vezes. Percorre os serviços (que já resolvem recebível × registro interno)
     e soma à parte os recebíveis que não pertencem a serviço nenhum. */
  function carteira() {
    const idsProj = new Set(DB.getAll('projetos').map(p => p.id));
    const parcelas = [];
    DB.getAll('projetos').forEach(p => {
      parcelasDoServico(p).forEach(pc => parcelas.push(pc));
    });
    DB.getAll('recebiveis').filter(r => Utils.recebivelAtivo(r)).forEach(r => {
      if (r.projetoId && idsProj.has(r.projetoId)) return;   // já veio pelo serviço
      (r.parcelas || []).forEach(pc => parcelas.push({
        valor: pc.valor, status: pc.status, vencimento: pc.vencimento,
        dataPagamento: pc.dataPagamento, fonte: 'recebivel', recebivelId: r.id,
      }));
    });
    return somarLista(parcelas);
  }

  /* Receita bruta efetivamente recebida num período, pela mesma conta do DRE
     em regime de caixa. É o número que o Resumo, os Relatórios e as Metas
     precisam mostrar para não divergirem do Financeiro. */
  function receitaPeriodo(de, ate) {
    const c = consolidado({ de, ate, regime: 'caixa' });
    return c.receitaBruta;
  }

  /* Parcelas em aberto de serviços cujo recebimento vive só dentro do serviço.
     A tela Hoje precisa delas para a cobrança não esquecer esse dinheiro, e
     elas carregam o id do serviço porque não têm recebível para abrir. */
  function aCobrarSemRecebivel() {
    const out = [];
    DB.getAll('projetos').filter(p => p.status !== 'cancelado').forEach(p => {
      parcelasDoServico(p).forEach(pc => {
        if (pc.fonte !== 'servico') return;
        if (pc.status === 'recebido' || pc.status === 'cancelado') return;
        out.push({ ...pc, projetoId: p.id, titulo: p.titulo || '', clienteId: p.clienteId || '' });
      });
    });
    return out.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
  }

  /* Margem média realizada da carteira — a régua com que tudo se compara.
     Só entram serviços que têm custo lançado; sem custo a margem seria 100%
     e a régua ficaria mentirosa. */
  function margemMediaCarteira() {
    const comCusto = servicos().filter(l => l.temCusto && l.contratada > 0);
    if (!comCusto.length) return null;
    const receita = comCusto.reduce((s, l) => s + l.contratada, 0);
    const lucro   = comCusto.reduce((s, l) => s + l.lucro, 0);
    return receita > 0 ? Math.round((lucro / receita) * 100) : null;
  }

  function corDaMargem(pct) {
    if (pct == null) return 'var(--text-muted)';
    const media = margemMediaCarteira();
    if (media == null) return 'var(--text)';
    if (pct >= media) return 'var(--ok-txt)';
    if (pct >= media * 0.6) return 'var(--info-txt)';
    return 'var(--ruim-txt)';
  }

  /* ====================================================
     FUNIL × DINHEIRO

     O funil dizia uma coisa e o financeiro outra, sobre o mesmo negócio.
     Treze leads ganhos, onze serviços, e nenhum vínculo entre eles: o
     caminho "criar projeto a partir do lead" gravava a origem no serviço e
     nunca de volta no lead, então a ligação existia num sentido só e
     nenhuma tela conseguia segui-la.

     Daqui para frente o vínculo vale nos dois sentidos, e a leitura aceita
     qualquer um dos lados para não exigir conserto manual do histórico.
     ==================================================== */

  /* O serviço que nasceu de um lead. Procura pelos dois lados e, em último
     caso, por proposta: lead → proposta → serviço. */
  function servicoDoLead(lead) {
    if (!lead) return null;
    if (lead.projetoId) {
      const p = DB.get('projetos', lead.projetoId);
      if (p) return p;
    }
    const porOrigem = DB.getAll('projetos').find(p => p.leadOrigemId === lead.id);
    if (porOrigem) return porOrigem;
    const prop = DB.getAll('propostas').find(x => x.leadId === lead.id && x.projetoId);
    if (prop) {
      const p = DB.get('projetos', prop.projetoId);
      if (p) return p;
    }
    return null;
  }

  function leadDoServico(projeto) {
    if (!projeto) return null;
    if (projeto.leadOrigemId) {
      const l = DB.get('leads', projeto.leadOrigemId);
      if (l) return l;
    }
    return DB.getAll('leads').find(l => l.projetoId === projeto.id) || null;
  }

  const GANHOS = ['fechado_ganho', 'executado'];

  /* O que o funil prometeu contra o que o dinheiro confirma.

     estimado   o que se achava que valia quando entrou
     fechado    o que o lead registra como fechado
     contratado o valor do serviço que executou
     recebido   o que realmente entrou em caixa

     Enquanto não houver serviço vinculado, contratado e recebido são null e
     a tela diz isso, em vez de mostrar zero como se nada tivesse entrado. */
  function conversaoDoLead(lead) {
    if (!lead) return null;
    const servico = servicoDoLead(lead);
    const estimado = Number(lead.valorEstimado) || 0;
    const fechado = Number(lead.valorFechado) || 0;
    const ganho = GANHOS.includes(lead.status);

    if (!servico) {
      return {
        lead, servico: null, ganho, estimado, fechado,
        contratado: null, recebido: null, margemPct: null,
        alerta: ganho ? 'sem_servico' : 'aberto',
        motivo: ganho
          ? 'Negócio ganho sem serviço vinculado: não dá para saber se o dinheiro entrou.'
          : '',
      };
    }

    const linha = linhaServico(servico);
    const contratado = linha.contratada;
    const recebido = linha.recebido;
    const difFechado = fechado > 0 ? contratado - fechado : null;

    let alerta = 'ok', motivo = '';
    if (!ganho) {
      alerta = 'aberto';
    } else if (difFechado != null && Math.abs(difFechado) >= 0.01) {
      alerta = 'divergente';
      motivo = difFechado < 0
        ? `O serviço foi contratado por ${Utils.formatCurrency(Math.abs(difFechado))} a menos do que o lead registrou como fechado.`
        : `O serviço foi contratado por ${Utils.formatCurrency(difFechado)} a mais do que o lead registrou como fechado.`;
    } else if (contratado > 0 && recebido === 0) {
      alerta = 'nao_recebido';
      motivo = 'Negócio ganho e serviço criado, mas nada entrou em caixa ainda.';
    }

    return {
      lead, servico, ganho, estimado, fechado, contratado, recebido,
      aReceber: linha.aReceber, vencido: linha.vencido,
      margemPct: linha.temCusto ? linha.margemPct : null,
      difFechado, alerta, motivo,
    };
  }

  /* O funil inteiro confrontado com o caixa. É o número que responde
     "o que eu disse que vendi bate com o que entrou?". */
  function funilRealizado() {
    const ganhos = DB.getAll('leads').filter(l => GANHOS.includes(l.status));
    const linhas = ganhos.map(conversaoDoLead);
    const comServico = linhas.filter(x => x.servico);
    const semServico = linhas.filter(x => !x.servico);
    return {
      nGanhos: ganhos.length,
      nComServico: comServico.length,
      nSemServico: semServico.length,
      fechadoDeclarado: linhas.reduce((s, x) => s + x.fechado, 0),
      contratadoReal: comServico.reduce((s, x) => s + (x.contratado || 0), 0),
      recebidoReal: comServico.reduce((s, x) => s + (x.recebido || 0), 0),
      semServicoValor: semServico.reduce((s, x) => s + (x.fechado || x.estimado || 0), 0),
      linhas: linhas.sort((a, b) => (b.fechado || b.estimado || 0) - (a.fechado || a.estimado || 0)),
    };
  }

  /* Serviços que ninguém ligou a um negócio. O caminho inverso do anterior:
     trabalho executado que não aparece em nenhuma conta de conversão. */
  function servicosSemLead() {
    return DB.getAll('projetos')
      .filter(p => p.status !== 'cancelado' && !leadDoServico(p));
  }

  /* ====================================================
     3. PESSOAL — folha, vales e custos por funcionário
     ==================================================== */

  function lancamentosFunc(funcionarioId, opcoes) {
    const o = opcoes || {};
    let l = DB.getAll('func_lancamentos');
    if (funcionarioId) l = l.filter(x => x.funcionarioId === funcionarioId);
    if (o.de)   l = l.filter(x => (x.data || '') >= o.de);
    if (o.ate)  l = l.filter(x => (x.data || '') <= o.ate);
    if (o.tipo) l = l.filter(x => x.tipo === o.tipo);
    return l.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }

  /* Tipos de lançamento de funcionário e como cada um mexe no dinheiro.

     sinalCusto:  +1 soma ao custo da empresa, 0 não mexe
     descontaLiq: desconta do líquido que a pessoa recebe
     pagaNaFolha: é dinheiro PARA a pessoa, pago junto com a folha

     Custo da empresa e dinheiro para a pessoa não são a mesma coisa. A botina
     custa 600 e é custo, mas quem recebe os 600 é a loja, não o funcionário:
     ela não entra no pagamento dele. O bônus custa e é dele. Sem esta
     separação, todo EPI comprado viraria provento no holerite.

     Um vale é adiantamento: a empresa entrega dinheiro agora e desconta na
     folha. Ele não é custo novo (o custo é o salário), mas é caixa que saiu,
     então entra no fluxo e desconta do líquido. Um EPI é custo de verdade e
     não desconta de ninguém. */
  const TIPOS_FUNC = {
    vale:         { label: 'Vale / Adiantamento',  sinalCusto: 0,  descontaLiq: true,  pagaNaFolha: false, icone: '💵' },
    bonus:        { label: 'Bônus / Prêmio',       sinalCusto: 1,  descontaLiq: false, pagaNaFolha: true,  icone: '🎯' },
    comissao:     { label: 'Comissão',             sinalCusto: 1,  descontaLiq: false, pagaNaFolha: true,  icone: '📈' },
    reembolso:    { label: 'Reembolso',            sinalCusto: 1,  descontaLiq: false, pagaNaFolha: true,  icone: '🧾' },
    custo:        { label: 'Custo (EPI, curso…)',  sinalCusto: 1,  descontaLiq: false, pagaNaFolha: false, icone: '🦺' },
    desconto:     { label: 'Desconto',             sinalCusto: 0,  descontaLiq: true,  pagaNaFolha: false, icone: '➖' },
    hora_extra:   { label: 'Hora extra',           sinalCusto: 1,  descontaLiq: false, pagaNaFolha: true,  icone: '⏱' },
  };

  /* A folha de QUAL mes acerta este lancamento.

     Um vale pedido no dia 28/11 e descontado na folha de novembro. Se a
     pessoa pediu depois que a folha de novembro ja foi paga, quem lanca
     escolhe dezembro, e o campo manda. Sem campo preenchido, vale o mes da
     data: e o comportamento de quem nunca escolheu nada. */
  function competenciaDe(l) {
    if (!l) return '';
    return String(l.competencia || l.data || '').substring(0, 7);
  }

  function _somaMes(m, n) {
    const partes = String(m || '').split('-').map(Number);
    const d = new Date(partes[0], (partes[1] - 1) + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* Em que folha um lancamento de hoje cai de fato. Se a folha do mes
     corrente ja foi paga, o acerto e na proxima: dizer isso na hora de
     lancar evita o vale que "some" por ter chegado tarde. */
  function proximaCompetenciaAberta(funcionarioId, apartirDe) {
    let mes = String(apartirDe || Utils.todayStr()).substring(0, 7);
    for (let i = 0; i < 12; i++) {
      const r = DB.getAll('folha').find(x => x.mes === mes
        && (!funcionarioId || x.funcionarioId === funcionarioId));
      if (!r || !r.pago) return mes;
      mes = _somaMes(mes, 1);
    }
    return mes;
  }

  /* Um lancamento mexe na folha quando o tipo mexe no liquido (vale,
     desconto) ou quando e um provento marcado para ser pago junto com ela
     (bonus, comissao, hora extra, reembolso). `naFolha: false` e o lancamento
     que ja foi acertado por fora e so esta registrado para o historico. */
  function entraNaFolha(l) {
    const def = TIPOS_FUNC[l && l.tipo];
    if (!def) return false;
    if (l.status === 'cancelado') return false;
    if (l.naFolha === false) return false;
    return !!(def.descontaLiq || def.pagaNaFolha);
  }

  const ACERTADO = ['descontado', 'acertado'];

  /* O QUE OS LANCAMENTOS DA PESSOA FAZEM COM A FOLHA DE UM MES.

     Esta e a funcao que faltava: era o elo entre "lancei um vale na ficha" e
     "o pagamento ja sai descontado". Folha, holerite, conta a pagar e a
     propria ficha leem daqui, para os quatro dizerem o mesmo numero.

     Um desconto de competencia ANTERIOR que continua em aberto entra aqui
     tambem: vale esquecido nao some, cobra na folha seguinte. Ja o que foi
     acertado so aparece na folha que o acertou, para o holerite antigo
     continuar contando a verdade do mes dele. */
  function efeitoNaFolha(funcionarioId, mes) {
    const proventos = [], descontos = [];
    if (funcionarioId && mes) {
      DB.getAll('func_lancamentos').forEach(l => {
        if (l.funcionarioId !== funcionarioId) return;
        if (!entraNaFolha(l)) return;
        const def = TIPOS_FUNC[l.tipo];
        const comp = competenciaDe(l);
        const acertado = ACERTADO.includes(l.status);
        if (acertado) { if ((l.folhaMes || '') !== mes) return; }
        else if (comp > mes) return;
        const item = {
          id: l.id, tipo: l.tipo, label: def.label, icone: def.icone,
          descricao: l.descricao || def.label, valor: Number(l.valor) || 0,
          competencia: comp, acertado, atrasado: !acertado && comp < mes,
          desconta: !!def.descontaLiq,
        };
        if (def.descontaLiq) descontos.push(item); else proventos.push(item);
      });
    }
    const soma = arr => Math.round(arr.reduce((t, x) => t + x.valor, 0) * 100) / 100;
    return {
      proventos, descontos, itens: proventos.concat(descontos),
      totalProventos: soma(proventos), totalDescontos: soma(descontos),
      nAtrasados: descontos.filter(x => x.atrasado).length,
    };
  }

  /* Descontos ainda nao acertados em folha nenhuma. E o que a pessoa deve a
     empresa neste instante. */
  function descontosEmAberto(funcionarioId) {
    return DB.getAll('func_lancamentos').filter(l =>
      (!funcionarioId || l.funcionarioId === funcionarioId)
      && entraNaFolha(l)
      && (TIPOS_FUNC[l.tipo] || {}).descontaLiq
      && !ACERTADO.includes(l.status));
  }

  const CATEGORIAS_CUSTO_FUNC = [
    'EPI / Uniforme', 'Treinamento / Curso', 'Exame médico', 'Ferramenta / Equipamento',
    'Deslocamento', 'Alimentação', 'Hospedagem', 'Telefonia / Internet', 'Outros',
  ];

  /* Custo de pessoal de um mês (YYYY-MM): folha gerada + lançamentos do mês.
     Quando a folha do mês ainda não foi gerada, usa a estimativa do cadastro,
     para o DRE não mostrar pessoal zerado num mês que obviamente teve pessoal. */
  /* Um custo só existe num mês se ele já existia naquele mês. Sem isto, uma
     despesa fixa cadastrada hoje aparece em janeiro, e um funcionário que
     entra em 2027 pesa no resultado de 2026 — o sistema inventaria história.
     Sem data de referência, assume que sempre existiu: é o comportamento
     antigo, e mudá-lo faria sumir dado de quem nunca preencheu a data. */
  function existiaEm(registro, mes) {
    if (!registro) return false;
    const ref = registro.dataAdmissao || registro.inicio || registro.createdAt || '';
    if (!ref) return true;
    return String(ref).substring(0, 7) <= mes;
  }

  function custoPessoalMes(mes) {
    const folha = DB.getAll('folha').filter(f => (f.mes || f.competencia || '') === mes);
    const porFunc = [];
    let totalFolha = 0, estimado = false;

    if (folha.length) {
      folha.forEach(f => {
        /* `bruto` do registro de folha JA soma salario + VT + VR + adicionais
           (e assim que calcFolhaFuncionario o monta). Somar VT e VR de novo
           inflava o custo de pessoal de todo mes com folha gerada. O custo da
           empresa e o bruto mais o encargo patronal, e nada alem disso: INSS e
           IRRF sao desconto da pessoa, ja dentro do bruto. */
        const custo = (Number(f.bruto) || 0) + (Number(f.fgts) || 0);
        totalFolha += custo;
        porFunc.push({
          funcionarioId: f.funcionarioId,
          nome: DB.get('funcionarios', f.funcionarioId)?.nome || 'Sem nome',
          folha: custo, lancamentos: 0, total: custo,
        });
      });
    } else {
      estimado = true;
      DB.getAll('funcionarios')
        .filter(f => f.ativo !== false && existiaEm(f, mes))
        .forEach(f => {
        /* `totalSemExtras` e nao `total`: os custos lancados na ficha entram
           logo abaixo pelo valor cheio do mes. Usar `total` traria tambem a
           versao diluida em 12 meses, contando o mesmo gasto duas vezes. */
        const custo = (typeof CustoHora !== 'undefined')
          ? CustoHora.custoMensal(f).totalSemExtras
          : (Number(f.salarioBase) || 0);
        totalFolha += custo;
        porFunc.push({
          funcionarioId: f.id, nome: f.nome || 'Sem nome',
          folha: custo, lancamentos: 0, total: custo,
        });
      });
    }

    let totalLanc = 0;
    lancamentosFunc(null, { de: mes + '-01', ate: mes + '-31' }).forEach(l => {
      const def = TIPOS_FUNC[l.tipo];
      if (!def || !def.sinalCusto) return;
      const v = (Number(l.valor) || 0) * def.sinalCusto;
      totalLanc += v;
      const linha = porFunc.find(x => x.funcionarioId === l.funcionarioId);
      if (linha) { linha.lancamentos += v; linha.total += v; }
      else {
        porFunc.push({
          funcionarioId: l.funcionarioId,
          nome: DB.get('funcionarios', l.funcionarioId)?.nome || 'Sem nome',
          folha: 0, lancamentos: v, total: v,
        });
      }
    });

    return {
      mes, folha: totalFolha, lancamentos: totalLanc,
      total: totalFolha + totalLanc, estimado,
      porFuncionario: porFunc.sort((a, b) => b.total - a.total),
    };
  }

  /* ====================================================
     4. DESPESA DA EMPRESA — o que não é de serviço nem de pessoal
     ==================================================== */

  /* Categorias que, se usadas num lançamento geral, significam pessoal.
     Sem isso o pessoal entraria duas vezes: pela folha e pelo lançamento. */
  const CATS_PESSOAL = ['Folha de Pagamento', 'Encargos/FGTS', 'Pró-labore', 'Pessoal'];

  function despesasGerais(de, ate) {
    return DB.getAll('lancamentos').filter(l => {
      if (l.tipo !== 'despesa') return false;
      if (l.status === 'cancelado') return false;
      if (ehEspelho(l)) return false;
      if (CATS_PESSOAL.includes(l.categoria)) return false;
      const d = l.data || '';
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      return true;
    });
  }

  /* Parcelas recebidas de recebíveis que não pertencem a serviço nenhum.
     Elas são receita de verdade e precisam entrar em algum lugar: sem isto o
     dinheiro existe em Contas a Receber e some do DRE. Entram como receita
     fora de serviço, que é o que elas são enquanto ninguém as vincular. */
  function recebidoSemServico(de, ate) {
    const ids = new Set(DB.getAll('projetos').map(p => p.id));
    let total = 0;
    const itens = [];
    DB.getAll('recebiveis').filter(r => Utils.recebivelAtivo(r)).forEach(r => {
      if (r.projetoId && ids.has(r.projetoId)) return;
      (r.parcelas || []).forEach(pc => {
        if (pc.status !== 'recebido') return;
        const d = pc.dataPagamento || pc.vencimento || '';
        if (de && d < de) return;
        if (ate && d > ate) return;
        const v = Number(pc.valor) || 0;
        total += v;
        itens.push({ recebivelId: r.id, descricao: r.descricao || '', valor: v, data: d });
      });
    });
    return { total, itens };
  }

  /* Receita que não passa por serviço nenhum. Hoje é raro, mas existe: venda
     avulsa, reembolso de cliente, receita financeira. */
  function receitasGerais(de, ate) {
    return DB.getAll('lancamentos').filter(l => {
      if (l.tipo !== 'receita') return false;
      if (l.status === 'cancelado') return false;
      if (ehEspelho(l)) return false;
      const d = l.data || '';
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      return true;
    });
  }

  function despesasFixasMes(mes) {
    const mult = { Mensal: 1, Bimestral: 1 / 2, Trimestral: 1 / 3, Semestral: 1 / 6, Anual: 1 / 12 };
    const contas = DB.getAll('contaspagar');
    let total = 0, n = 0, jaLancado = 0;
    DB.getAll('despesas_fixas')
      .filter(d => d.ativo !== false && existiaEm(d, mes))
      .forEach(d => {
      const v = (Number(d.valor) || 0) * (mult[d.periodicidade] || 1);
      /* Fixa mensal já transformada em conta deste mês: a conta (e o lançamento
         que nasce dela) é o dado real. A estimativa sai de cena. */
      if ((d.periodicidade || 'Mensal') === 'Mensal'
          && contas.some(c => c.despesaFixaId === d.id && (c.vencimento || '').startsWith(mes))) {
        jaLancado += v;
        return;
      }
      total += v; n++;
    });
    return { total, n, jaLancado };
  }

  /* ====================================================
     5. CONSOLIDADO — o DRE que fecha
     ==================================================== */

  /* regime 'caixa'        → o que entrou e saiu de fato no período
     regime 'competencia'  → o resultado dos serviços do período, pago ou não

     Os dois existem porque respondem perguntas diferentes: caixa responde
     "tenho dinheiro?", competência responde "o trabalho deu lucro?". */
  function consolidado(opcoes) {
    const o = opcoes || {};
    const de = o.de || '';
    const ate = o.ate || '';
    const regime = o.regime === 'competencia' ? 'competencia' : 'caixa';
    const mes = de ? de.substring(0, 7) : Utils.todayStr().substring(0, 7);

    const linhas = servicos();
    let recServicos = 0, custoServicos = 0, comissoesServicos = 0;
    const porServico = [];

    linhas.forEach(l => {
      if (regime === 'caixa') {
        /* Caixa: só as parcelas efetivamente recebidas no período. */
        let recebidoNoPeriodo = 0;
        parcelasDoServico(l.projeto).forEach(pc => {
          if (pc.status !== 'recebido') return;
          const d = pc.dataPagamento || pc.vencimento || '';
          if (de && d < de) return;
          if (ate && d > ate) return;
          recebidoNoPeriodo += Number(pc.valor) || 0;
        });
        /* E só os custos com data dentro do período. */
        let custoNoPeriodo = 0, comissaoNoPeriodo = 0;
        l.custo.itens.forEach(it => {
          const d = it.data || l.projeto.dataInicio || '';
          if (de && d && d < de) return;
          if (ate && d && d > ate) return;
          if (it.grupo === 'comissao') comissaoNoPeriodo += it.valor;
          else custoNoPeriodo += it.valor;
        });
        if (recebidoNoPeriodo || custoNoPeriodo || comissaoNoPeriodo) {
          recServicos += recebidoNoPeriodo;
          custoServicos += custoNoPeriodo;
          comissoesServicos += comissaoNoPeriodo;
          porServico.push({
            ...l, receitaPeriodo: recebidoNoPeriodo,
            custoPeriodo: custoNoPeriodo, comissaoPeriodo: comissaoNoPeriodo,
          });
        }
      } else {
        /* Competência: serviço cujo início cai no período entra inteiro. */
        const d = l.projeto.dataInicio || '';
        if (de && d && d < de) return;
        if (ate && d && d > ate) return;
        recServicos += l.contratada;
        custoServicos += l.custoDireto;
        comissoesServicos += l.comissoes;
        porServico.push({
          ...l, receitaPeriodo: l.contratada,
          custoPeriodo: l.custoDireto, comissaoPeriodo: l.comissoes,
        });
      }
    });

    const gerRec = receitasGerais(de, ate);
    const gerDesp = despesasGerais(de, ate);
    const semServico = recebidoSemServico(de, ate);
    const recOutras = gerRec.reduce((s, l) => s + (Number(l.valor) || 0), 0) + semServico.total;
    const despGerais = gerDesp.reduce((s, l) => s + (Number(l.valor) || 0), 0);

    const pessoal = custoPessoalMes(mes);
    const fixas = despesasFixasMes(mes);

    const receitaBruta = recServicos + recOutras;
    const aliq = (Number(DB.getConfig().aliquotaImpostos) || 0) / 100;
    const impostos = receitaBruta * aliq;
    const receitaLiquida = receitaBruta - impostos;
    const custoDiretoTotal = custoServicos + comissoesServicos;
    const margemContribuicao = receitaLiquida - custoDiretoTotal;
    const estrutura = pessoal.total + fixas.total + despGerais;
    const resultado = margemContribuicao - estrutura;

    /* Despesas por categoria, para o gráfico e o detalhado. O custo de serviço
       entra como UMA categoria, não como N itens — é o que o usuário pediu:
       o geral recebe o total, o detalhe fica no serviço. */
    const porCategoria = {};
    const add = (cat, v) => { if (v) porCategoria[cat] = (porCategoria[cat] || 0) + v; };
    add('Custo dos serviços', custoServicos);
    add('Comissões e parcerias', comissoesServicos);
    add('Pessoal', pessoal.total);
    add('Despesas fixas', fixas.total);
    gerDesp.forEach(l => add(l.categoria || 'Outros', Number(l.valor) || 0));

    return {
      de, ate, regime, mes,
      receitaServicos: recServicos, receitaOutras: recOutras, receitaBruta,
      impostos, aliquota: aliq * 100, receitaLiquida,
      custoServicos, comissoesServicos, custoDiretoTotal,
      margemContribuicao,
      margemContribuicaoPct: receitaBruta > 0 ? Math.round((margemContribuicao / receitaBruta) * 100) : null,
      pessoal, fixas, despGerais, estrutura,
      resultado,
      resultadoPct: receitaBruta > 0 ? Math.round((resultado / receitaBruta) * 100) : null,
      porServico: porServico.sort((a, b) => b.receitaPeriodo - a.receitaPeriodo),
      recebidoSemServico: semServico,
      porCategoria,
      lancamentosGerais: gerDesp,
      receitasAvulsas: gerRec,
    };
  }

  /* Ponto de equilíbrio: quanto precisa faturar no mês para o resultado dar
     zero, dada a estrutura atual e a margem de contribuição que a carteira
     realmente entrega. */
  function pontoEquilibrio(mes) {
    const m = mes || Utils.todayStr().substring(0, 7);
    const pessoal = custoPessoalMes(m);
    const fixas = despesasFixasMes(m);
    const gerais = despesasGerais(m + '-01', m + '-31').reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const estrutura = pessoal.total + fixas.total + gerais;

    const margemCarteira = margemMediaCarteira();
    const aliq = (Number(DB.getConfig().aliquotaImpostos) || 0) / 100;
    /* Margem de contribuição em % da receita: a margem dos serviços menos o
       imposto que incide sobre a receita. Sem serviço com custo lançado não há
       como saber — e aí o número não é inventado, é null. */
    const mcPct = margemCarteira == null ? null : (margemCarteira / 100) - aliq;
    return {
      mes: m, estrutura,
      pessoal: pessoal.total, fixas: fixas.total, gerais,
      mcPct: mcPct == null ? null : Math.round(mcPct * 1000) / 10,
      faturamentoNecessario: (mcPct == null || mcPct <= 0) ? null : estrutura / mcPct,
      motivo: margemCarteira == null
        ? 'Nenhum serviço tem custo lançado, então não há margem real para projetar.'
        : (mcPct != null && mcPct <= 0 ? 'A margem de contribuição da carteira não cobre os impostos.' : ''),
    };
  }

  /* ====================================================
     7. ORÇADO × REALIZADO
     ==================================================== */

  /* O orçamento previsto de um serviço fica em `projeto.orcamento`, gravado
     pela calculadora de preço. Formato:

       { definidoEm, complexidade, margem, aliquota,
         horasPrevistas, custoPessoasPrevisto, custoDiretosPrevisto,
         custoTotalPrevisto, precoSugerido,
         equipe: [{ funcionarioId, nome, horas, custoHora, custo }],
         diretos: [{ descricao, valor }] }

     O preço FECHADO não mora aqui: é `projeto.valor`. Separar os dois é o que
     permite ver quanto se deu de desconto na negociação. */
  function orcamentoDe(p) {
    const o = p && p.orcamento;
    if (!o || !(Number(o.custoTotalPrevisto) > 0 || Number(o.horasPrevistas) > 0)) return null;
    return o;
  }

  /* Avanço físico do serviço: média do percentual das etapas. É o que permite
     dizer "consumiu 80% do custo tendo entregue 40%", que é o alerta que
     chega a tempo de fazer alguma coisa. Sem etapas, não há avanço conhecido
     e a projeção não é inventada: fica null. */
  function avancoDe(p) {
    const etapas = (p && p.etapas) || [];
    if (!etapas.length) return null;
    const soma = etapas.reduce((s, e) => s + (Number(e.pct) || 0), 0);
    return Math.round(soma / etapas.length);
  }

  /* Compara o que foi previsto com o que aconteceu, linha a linha.

     Comissão quase nunca é orçada (o parceiro entra depois), então ela aparece
     como "não previsto" em vez de virar um estouro que não é culpa da
     estimativa. */
  function comparativo(p) {
    if (!p) return null;
    const orc = orcamentoDe(p);
    const custo = custoServico(p);
    const receita = Number(p.valor) || 0;
    const avanco = avancoDe(p);

    const realizado = {
      horas: custo.horasQtd || 0,
      custoPessoas: custo.horas || 0,
      custoDiretos: custo.diretos || 0,
      comissoes: custo.comissoes || 0,
      custoTotal: custo.total || 0,
      receita,
      lucro: receita - custo.total,
      margemPct: receita > 0 ? Math.round(((receita - custo.total) / receita) * 100) : null,
    };

    if (!orc) {
      return {
        temOrcamento: false, avanco, realizado,
        alerta: 'sem_orcamento',
        motivo: 'Este serviço não tem orçamento previsto, então não há com o que comparar o que foi gasto.',
      };
    }

    const previsto = {
      horas: Number(orc.horasPrevistas) || 0,
      custoPessoas: Number(orc.custoPessoasPrevisto) || 0,
      custoDiretos: Number(orc.custoDiretosPrevisto) || 0,
      custoTotal: Number(orc.custoTotalPrevisto) || 0,
      preco: Number(orc.precoSugerido) || 0,
      margemPct: null,
    };
    /* Margem prevista: com o preço que foi efetivamente fechado, não com o
       sugerido. É a margem que se esperava ter ao assinar. */
    const impostoPrev = receita * (Number(orc.aliquota) || 0);
    previsto.margemPct = receita > 0
      ? Math.round(((receita - impostoPrev - previsto.custoTotal) / receita) * 100)
      : null;

    const dif = (r, pv) => ({ valor: r - pv, pct: pv > 0 ? Math.round(((r - pv) / pv) * 100) : null });
    const desvio = {
      horas: dif(realizado.horas, previsto.horas),
      custoPessoas: dif(realizado.custoPessoas, previsto.custoPessoas),
      custoDiretos: dif(realizado.custoDiretos, previsto.custoDiretos),
      /* Comissão fora da comparação de custo: ela não estava no orçamento. */
      custoTotal: dif(realizado.custoPessoas + realizado.custoDiretos, previsto.custoTotal),
      desconto: previsto.preco > 0 ? Math.round(((receita - previsto.preco) / previsto.preco) * 100) : null,
    };

    const custoComparavel = realizado.custoPessoas + realizado.custoDiretos;
    const consumidoPct = previsto.custoTotal > 0
      ? Math.round((custoComparavel / previsto.custoTotal) * 100) : null;

    /* Projeção: se consumiu X% do custo tendo entregue Y% do trabalho, no
       ritmo atual o serviço termina custando custoAtual ÷ (Y/100). */
    let projecao = null;
    if (avanco != null && avanco > 0 && custoComparavel > 0 && avanco < 100) {
      const custoFinal = custoComparavel / (avanco / 100) + realizado.comissoes;
      projecao = {
        custoFinal,
        lucroFinal: receita - custoFinal,
        margemFinal: receita > 0 ? Math.round(((receita - custoFinal) / receita) * 100) : null,
        estouroPrevisto: custoFinal - (previsto.custoTotal + realizado.comissoes),
      };
    }

    /* Alerta. As faixas são tolerâncias técnicas de acompanhamento, não meta
       de negócio: 100% é estouro por definição, e consumir muito mais rápido
       do que se entrega é o sinal que chega cedo o bastante para agir. */
    let alerta = 'ok', motivo = '';
    /* Zero gasto não é "dentro do previsto": é não se saber nada ainda.
       Dizer que vai bem quando ninguém lançou custo seria dar uma garantia
       que o dado não sustenta. */
    if (consumidoPct == null || custoComparavel === 0) {
      alerta = 'sem_custo';
      motivo = previsto.custoTotal > 0
        ? `Nada foi lançado como custo ainda. O previsto é ${Utils.formatCurrency(previsto.custoTotal)}.`
        : 'O orçamento previsto está zerado, então não há com o que comparar.';
    } else if (consumidoPct > 100) {
      alerta = 'estouro';
      motivo = `O custo já passou do previsto em ${Utils.formatCurrency(custoComparavel - previsto.custoTotal)}.`;
    } else if (avanco != null && avanco > 0 && consumidoPct - avanco >= 15) {
      alerta = 'atencao';
      motivo = `Consumiu ${consumidoPct}% do orçamento tendo entregue ${avanco}% do trabalho.`;
    } else if (consumidoPct >= 85) {
      alerta = 'atencao';
      motivo = `Restam ${Utils.formatCurrency(previsto.custoTotal - custoComparavel)} de orçamento.`;
    }

    return {
      temOrcamento: true, orcamento: orc,
      previsto, realizado, desvio, consumidoPct, avanco, projecao,
      custoComparavel, alerta, motivo,
    };
  }

  function corDoAlerta(alerta) {
    return {
      estouro: 'var(--ruim-txt)',
      atencao: '#d97706',
      ok: 'var(--ok-txt)',
      sem_custo: 'var(--text-muted)',
      sem_orcamento: 'var(--text-muted)',
    }[alerta] || 'var(--text-muted)';
  }

  function rotuloDoAlerta(alerta) {
    return {
      estouro: 'Estourou',
      atencao: 'Atenção',
      ok: 'Dentro',
      sem_custo: 'Sem custo',
      sem_orcamento: 'Sem orçamento',
    }[alerta] || '—';
  }

  /* ====================================================
     8. CONSISTÊNCIA — o que não fecha
     ==================================================== */

  /* Cada achado tem: gravidade, título, o que significa na prática e o que
     fazer. Nada é corrigido sozinho: quem decide é o usuário. */
  function consistencia() {
    const achados = [];
    const push = (g, titulo, detalhe, acao, itens) =>
      achados.push({ gravidade: g, titulo, detalhe, acao, itens: itens || [] });

    /* 1. Lançamento de receita sem vínculo que pode ser o mesmo dinheiro de uma
          parcela já recebida. Se for, a receita está contada duas vezes. */
    const soltos = DB.getAll('lancamentos').filter(l =>
      l.tipo === 'receita' && l.status !== 'cancelado' && !ehEspelho(l));
    const suspeitos = [];
    soltos.forEach(l => {
      const v = Number(l.valor) || 0;
      const d = l.data || '';
      const par = [];
      DB.getAll('recebiveis').filter(r => Utils.recebivelAtivo(r)).forEach(r => {
        (r.parcelas || []).forEach(pc => {
          if (pc.status !== 'recebido') return;
          if (Math.abs((Number(pc.valor) || 0) - v) > 0.01) return;
          const dp = pc.dataPagamento || pc.vencimento || '';
          if (!d || !dp) return;
          if (Math.abs(Utils.diasEntre ? Utils.diasEntre(d, dp) : _dias(d, dp)) > 7) return;
          par.push({ recebivelId: r.id, descricao: r.descricao || '' });
        });
      });
      if (par.length) suspeitos.push({ lanc: l, pares: par });
    });
    if (suspeitos.length) {
      push('alta', `${suspeitos.length} lançamento(s) de receita podem estar em duplicidade`,
        'Existe um lançamento solto com o mesmo valor e data de uma parcela já recebida. Se os dois forem o mesmo dinheiro, a receita está contada duas vezes.',
        'Abra cada um: se for repetido, cancele o lançamento solto (não apague, cancele, para o histórico ficar).',
        suspeitos.map(s => ({
          id: s.lanc.id, texto: `${s.lanc.descricao || 'Sem descrição'} · ${Utils.formatCurrency(s.lanc.valor)} · ${Utils.formatDate(s.lanc.data)}`,
          sub: `parece a parcela de "${s.pares[0].descricao}"`, ir: 'lancamento',
        })));
    }

    /* 2. Receita solta sem par: é receita real, mas fora de qualquer serviço.
          Pode ser venda avulsa — ou um serviço que ninguém cadastrou. */
    const semPar = soltos.filter(l => !suspeitos.some(s => s.lanc.id === l.id));
    if (semPar.length) {
      push('media', `${semPar.length} receita(s) fora de qualquer serviço`,
        'Entraram como lançamento direto, sem recebível nem serviço. Elas contam no faturamento, mas não têm custo nem margem — então não aparecem em nenhuma análise de resultado por serviço.',
        'Se cada uma corresponde a um trabalho feito, vale cadastrar o serviço e vincular. Se é receita avulsa, está correto como está.',
        semPar.map(l => ({
          id: l.id, texto: `${l.descricao || 'Sem descrição'} · ${Utils.formatCurrency(l.valor)}`,
          sub: Utils.formatDate(l.data), ir: 'lancamento',
        })));
    }

    /* 3. Serviço concluído sem nenhum custo. A margem dele lê 100%, o que
          puxa a média da carteira para cima e engana toda comparação. */
    const semCusto = servicos().filter(l =>
      !l.temCusto && l.contratada > 0 && ['concluido', 'em_andamento'].includes(l.status));
    if (semCusto.length) {
      const soma = semCusto.reduce((s, l) => s + l.contratada, 0);
      push('alta', `${semCusto.length} serviço(s) sem custo lançado`,
        `São ${Utils.formatCurrency(soma)} de receita com margem aparente de 100%. Enquanto o custo não entrar, a margem da empresa está superestimada e não dá para comparar um cliente com outro.`,
        'Lance ao menos os custos grandes de cada um: subcontratação, deslocamento e horas da equipe.',
        semCusto.slice(0, 12).map(l => ({
          id: l.id, texto: l.titulo, sub: Utils.formatCurrency(l.contratada), ir: 'servico',
        })));
    }

    /* 4. Custo de serviço espelhado em conta a pagar que ficou pendente há
          tempo: o fornecedor não foi pago, ou a conta foi esquecida. */
    const contasEspelho = DB.getAll('contaspagar')
      .filter(c => contaEhEspelho(c) && c.status === 'pendente' && Utils.isOverdue(c.vencimento));
    if (contasEspelho.length) {
      push('media', `${contasEspelho.length} conta(s) de serviço vencida(s) sem baixa`,
        'São custos de serviço que geraram uma obrigação com fornecedor e passaram do vencimento sem registro de pagamento.',
        'Confira se foram pagas e dê baixa, ou renegocie a data.',
        contasEspelho.map(c => ({
          id: c.id, texto: `${c.fornecedor || c.descricao || 'Conta'} · ${Utils.formatCurrency(c.valor)}`,
          sub: 'vencida em ' + Utils.formatDate(c.vencimento), ir: 'pagar',
        })));
    }

    /* 4b. Recebimento que mora só dentro do serviço, sem recebível.
          O dinheiro é contado certo, mas ele não aparece em Contas a Receber,
          então some do acompanhamento de cobrança e dos lembretes. */
    const soNoServico = [];
    servicos().forEach(l => {
      const soltos = parcelasDoServico(l.projeto).filter(pc => pc.fonte === 'servico');
      if (!soltos.length) return;
      soNoServico.push({
        id: l.id, texto: l.titulo,
        sub: `${Utils.formatCurrency(soltos.reduce((s, x) => s + (Number(x.valor) || 0), 0))} registrados só dentro do serviço`,
        ir: 'servico',
      });
    });
    if (soNoServico.length) {
      push('media', `${soNoServico.length} serviço(s) com recebimento fora de Contas a Receber`,
        'O recebimento foi registrado dentro do serviço e nunca virou parcela em Contas a Receber. O valor entra no resultado, mas o serviço não aparece na cobrança nem nos alertas de vencimento.',
        'Abra o financeiro do serviço e use "Lançar no financeiro geral" no recebimento, para ele passar a existir também em Contas a Receber.',
        soNoServico);
    }

    /* 5. Recebível sem serviço: dinheiro a receber que não sabe de onde veio. */
    const recSemProj = DB.getAll('recebiveis')
      .filter(r => Utils.recebivelAtivo(r) && !r.projetoId);
    if (recSemProj.length) {
      push('baixa', `${recSemProj.length} recebível(is) sem serviço vinculado`,
        'O dinheiro aparece em contas a receber, mas não entra no resultado de nenhum serviço.',
        'Edite cada um e escolha o serviço de origem.',
        recSemProj.map(r => ({
          id: r.id, texto: r.descricao || 'Sem descrição',
          sub: Utils.formatCurrency(r.valor), ir: 'receber',
        })));
    }

    /* 6. Valor que parece ter perdido a casa decimal. Um dinheiro de obra que
          vira menos de R$ 100 ao lado de parcelas de milhares costuma ser erro
          de digitação, não desconto. */
    const estranhos = [];
    DB.getAll('recebiveis').filter(r => Utils.recebivelAtivo(r)).forEach(r => {
      const vals = (r.parcelas || []).filter(p => p.status !== 'cancelado').map(p => Number(p.valor) || 0);
      if (vals.length < 2) return;
      const maior = Math.max(...vals);
      vals.forEach((v, i) => {
        if (v > 0 && maior > 0 && v < maior / 100) {
          estranhos.push({
            id: r.id, texto: `${r.descricao || 'Recebível'} · parcela ${i + 1}`,
            sub: `${Utils.formatCurrency(v)} ao lado de ${Utils.formatCurrency(maior)}`, ir: 'receber',
          });
        }
      });
    });
    DB.getAll('lancamentos').filter(l => l.status !== 'cancelado').forEach(l => {
      const v = Number(l.valor) || 0;
      /* Valor com mais de 2 casas decimais não existe em dinheiro. */
      if (v > 0 && Math.abs(v * 100 - Math.round(v * 100)) > 0.001) {
        estranhos.push({
          id: l.id, texto: l.descricao || 'Lançamento',
          sub: `${v} tem mais de duas casas decimais`, ir: 'lancamento',
        });
      }
    });
    if (estranhos.length) {
      push('alta', `${estranhos.length} valor(es) com cara de erro de digitação`,
        'São valores muito fora da escala dos outros do mesmo registro, ou com mais de duas casas decimais. Dinheiro não tem três casas.',
        'Confira o valor original e corrija. Um zero a menos aqui derruba o faturamento do mês.',
        estranhos);
    }

    /* 7. Funcionário sem base de custo: sem isso não há custo/hora e nenhum
          orçamento consegue ser precificado por hora. */
    const semBase = DB.getAll('funcionarios').filter(f =>
      f.ativo !== false && !(Number(f.salarioBase) > 0));
    if (semBase.length) {
      push('media', `${semBase.length} pessoa(s) sem custo cadastrado`,
        'Sem salário ou valor de referência, essa pessoa não entra no custo/hora e os orçamentos que a envolvem saem sem base.',
        'Abra a ficha e informe o valor de referência, mesmo que seja por hora ou por serviço.',
        semBase.map(f => ({ id: f.id, texto: f.nome || 'Sem nome', sub: f.cargo || '', ir: 'funcionario' })));
    }

    /* 6b. Negócio ganho sem serviço vinculado. O funil declara receita que o
          financeiro não conhece, e ninguém consegue dizer se entrou. */
    const funil = funilRealizado();
    const ganhoSemServico = funil.linhas.filter(x => x.alerta === 'sem_servico');
    if (ganhoSemServico.length) {
      push('alta', `${ganhoSemServico.length} negócio(s) ganhos sem serviço vinculado`,
        `${Utils.formatCurrency(funil.semServicoValor)} declarados como fechados no funil sem nenhum serviço correspondente. O comercial conta uma história que o financeiro não confirma, e esse dinheiro não aparece em margem, custo nem caixa.`,
        'Abra o Pipeline na vista Conversão e use "Vincular serviço" em cada um. Se o serviço ainda não existe, crie a partir do próprio negócio.',
        ganhoSemServico.slice(0, 15).map(x => ({
          id: x.lead.id, texto: x.lead.titulo || 'Sem título',
          sub: Utils.formatCurrency(x.fechado || x.estimado), ir: 'lead',
        })));
    }

    /* 6c. Valor fechado no funil diferente do contratado no serviço. */
    const divergentes = funil.linhas.filter(x => x.alerta === 'divergente');
    if (divergentes.length) {
      push('media', `${divergentes.length} negócio(s) com valor diferente do serviço`,
        'O valor que o lead registra como fechado não bate com o valor contratado no serviço. Um dos dois está desatualizado, e as metas comerciais são medidas pelo do lead.',
        'Confira qual é o valor real e acerte o outro lado.',
        divergentes.map(x => ({
          id: x.lead.id, texto: x.lead.titulo || 'Sem título',
          sub: `funil ${Utils.formatCurrency(x.fechado)} · serviço ${Utils.formatCurrency(x.contratado)}`,
          ir: 'lead',
        })));
    }

    /* 6d. Negócio perdido com valor fechado preenchido: contradição que
          infla a receita declarada de quem soma por `valorFechado`. */
    const perdidoComValor = DB.getAll('leads')
      .filter(l => l.status === 'fechado_perdido' && (Number(l.valorFechado) || 0) > 0);
    if (perdidoComValor.length) {
      push('media', `${perdidoComValor.length} negócio(s) perdidos com valor fechado preenchido`,
        `${Utils.formatCurrency(perdidoComValor.reduce((s, l) => s + (Number(l.valorFechado) || 0), 0))} aparecem como fechados em negócios marcados como perdidos. Ou foram ganhos e o status ficou errado, ou o valor ficou de um fechamento que não aconteceu.`,
        'Abra cada um e decida: corrija o status, ou limpe o valor fechado.',
        perdidoComValor.map(l => ({
          id: l.id, texto: l.titulo || 'Sem título',
          sub: Utils.formatCurrency(l.valorFechado), ir: 'lead',
        })));
    }

    /* 7b. Serviço que já gastou mais do que foi orçado. É o achado que mais
          vale chegar cedo: depois do serviço entregue não há o que fazer. */
    const estourados = [];
    const correndoRisco = [];
    servicos().forEach(l => {
      const c = comparativo(l.projeto);
      if (!c || !c.temOrcamento) return;
      if (c.alerta === 'estouro') {
        estourados.push({
          id: l.id, texto: l.titulo,
          sub: `gastou ${Utils.formatCurrency(c.custoComparavel)} de ${Utils.formatCurrency(c.previsto.custoTotal)} previstos`,
          ir: 'servico',
        });
      } else if (c.alerta === 'atencao') {
        correndoRisco.push({ id: l.id, texto: l.titulo, sub: c.motivo, ir: 'servico' });
      }
    });
    if (estourados.length) {
      push('alta', `${estourados.length} serviço(s) gastaram mais do que o orçado`,
        'O custo real passou do previsto. Em serviço concluído isso é margem que já se perdeu; em serviço em andamento ainda dá para conter.',
        'Abra o orçado × realizado de cada um e veja onde estourou: horas ou custo direto. É assim que a próxima estimativa sai melhor.',
        estourados);
    }
    if (correndoRisco.length) {
      push('media', `${correndoRisco.length} serviço(s) caminhando para estourar`,
        'Estão consumindo o orçamento mais rápido do que entregam trabalho, ou já chegaram perto do limite previsto.',
        'Confira o avanço das etapas e o que ainda falta gastar antes de aceitar mais escopo.',
        correndoRisco);
    }

    /* 7c. Serviço em andamento sem orçamento previsto: não há como saber se
          está dando certo enquanto está acontecendo. */
    const semOrcamento = servicos().filter(l =>
      l.status === 'em_andamento' && l.contratada > 0 && !orcamentoDe(l.projeto));
    if (semOrcamento.length) {
      push('media', `${semOrcamento.length} serviço(s) em andamento sem orçamento previsto`,
        'Sem o custo previsto gravado, o sistema não consegue avisar quando o serviço começa a gastar demais: só dá para ver o estrago no fim.',
        'Abra o financeiro do serviço e use "Definir orçamento" para registrar horas e custos previstos.',
        semOrcamento.map(l => ({ id: l.id, texto: l.titulo, sub: Utils.formatCurrency(l.contratada), ir: 'servico' })));
    }

    /* 8. Serviço em andamento sem recebível: trabalho rodando e ninguém
          programou a cobrança. */
    const semCobranca = servicos().filter(l =>
      l.status === 'em_andamento' && l.contratada > 0 && recebiveisServico(l.projeto).length === 0);
    if (semCobranca.length) {
      push('alta', `${semCobranca.length} serviço(s) em andamento sem cobrança programada`,
        `${Utils.formatCurrency(semCobranca.reduce((s, l) => s + l.contratada, 0))} de trabalho em execução sem parcela nenhuma em contas a receber. O dinheiro não vai ser cobrado por esquecimento.`,
        'Abra o financeiro do serviço e configure as parcelas.',
        semCobranca.map(l => ({ id: l.id, texto: l.titulo, sub: Utils.formatCurrency(l.contratada), ir: 'servico' })));
    }

    const ordem = { alta: 0, media: 1, baixa: 2 };
    return achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
  }

  function _dias(a, b) {
    const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
    if (isNaN(da) || isNaN(db)) return 9999;
    return Math.round((da - db) / 86400000);
  }

  return {
    ehEspelho, espelhoLanc, contaEhEspelho,
    custoServico, horasServico, recebiveisServico, somarParcelas,
    linhaServico, servicos, margemMediaCarteira, corDaMargem,
    parcelasDoServico, somarLista,
    carteira, receitaPeriodo, aCobrarSemRecebivel,
    servicoDoLead, leadDoServico, conversaoDoLead, funilRealizado, servicosSemLead,
    lancamentosFunc, custoPessoalMes, TIPOS_FUNC, CATEGORIAS_CUSTO_FUNC,
    competenciaDe, proximaCompetenciaAberta, entraNaFolha, efeitoNaFolha,
    descontosEmAberto,
    orcamentoDe, avancoDe, comparativo, corDoAlerta, rotuloDoAlerta,
    existiaEm,
    despesasGerais, receitasGerais, despesasFixasMes, recebidoSemServico,
    consolidado, pontoEquilibrio, consistencia,
  };
})();
