/* ==========================================
   CUSTO/HORA E PRECIFICAÇÃO

   Para que serve
   --------------
   Responder duas perguntas que hoje são respondidas por sensação:
     1. Quanto me custa uma hora desta pessoa?
     2. Por quanto eu tenho de vender essa hora para sobrar o que preciso?

   Como o cálculo anda
   -------------------
     custo mensal da pessoa   = remuneração + encargos do regime + benefícios
     horas produtivas no mês  = jornada × ocupação técnica
     custo/hora direto        = custo mensal ÷ horas produtivas
     custo indireto por hora  = (estrutura da empresa) ÷ horas produtivas totais
     custo/hora cheio         = direto + indireto
     preço/hora               = cheio × complexidade ÷ (1 − margem − imposto)

   O divisor (1 − margem − imposto) existe porque margem e imposto incidem
   sobre o PREÇO, não sobre o custo. Multiplicar o custo pela margem é o erro
   clássico de orçamento: quem quer 30% e multiplica por 1,30 fica com 23%.

   Onde ficam os números
   ---------------------
   Tudo que é decisão da empresa (margem desejada, ocupação, encargo de cada
   regime) fica em `config.precificacao`, no banco, porque este repositório é
   público. Os padrões aqui são parâmetros técnicos neutros, para o sistema
   funcionar antes de alguém configurar, e a tela diz quando está usando padrão.
   ========================================== */
const CustoHora = (() => {

  /* Jornada mensal de referência: 220h é o padrão CLT com DSR; 176h é
     22 dias úteis × 8h, que é o que se usa para custo de hora trabalhada. */
  const JORNADA_PADRAO = 176;

  /* Ocupação técnica: a fração da jornada que vira hora vendável. O resto é
     proposta, deslocamento, administrativo e treinamento — horas pagas que
     ninguém fatura. 70% é a referência usual em serviços de engenharia e pode
     ser ajustada na configuração. */
  const OCUPACAO_PADRAO = 0.70;

  /* Encargo sobre a remuneração, por regime de contratação.
     CLT 1,3333 = FGTS 8% + provisão de 13º (1/12) + férias com 1/3 (1/12 ×
     1,333) e o FGTS que incide sobre essas provisões. Não inclui contribuição
     patronal, porque empresa no Simples Nacional (Anexo III) não recolhe CPP
     sobre a folha — se o seu enquadramento recolhe, ajuste na configuração.
     Pró-labore de sócio: o INSS é desconto do sócio, não custo da empresa.
     PJ, autônomo e parceria recebem por nota: o custo é o valor da nota. */
  const ENCARGO_PADRAO = {
    'CLT': 1.3333,
    'Sócio': 1.0,
    'PJ': 1.0,
    'Autônomo': 1.0,
    'Estágio': 1.0,
    'Parceria': 1.0,
  };

  /* Complexidade técnica do trabalho. Não é margem: é reconhecer que uma hora
     de apreciação de risco em linha de produção crítica não vale a mesma coisa
     que uma hora de laudo simples — exige mais responsabilidade técnica,
     revisão e exposição da ART. */
  const COMPLEXIDADES = [
    { id: 'simples',  label: 'Simples',  fator: 1.00, descricao: 'Equipamento isolado, norma direta, pouca interface' },
    { id: 'media',    label: 'Média',    fator: 1.15, descricao: 'Vários equipamentos ou integração entre sistemas' },
    { id: 'alta',     label: 'Alta',     fator: 1.35, descricao: 'Linha produtiva, parada programada, risco alto' },
    { id: 'critica',  label: 'Crítica',  fator: 1.60, descricao: 'Risco de vida, perícia, prazo judicial ou cliente público' },
  ];

  function params() {
    const cfg = DB.getConfig() || {};
    const p = cfg.precificacao || {};
    return {
      jornada:   Number(p.jornada) > 0 ? Number(p.jornada) : JORNADA_PADRAO,
      ocupacao:  Number(p.ocupacao) > 0 ? Number(p.ocupacao) / 100 : OCUPACAO_PADRAO,
      encargos:  { ...ENCARGO_PADRAO, ...(p.encargos || {}) },
      margemDesejada: (Number(p.margemDesejada) > 0) ? Number(p.margemDesejada) / 100 : null,
      aliquota:  (Number(cfg.aliquotaImpostos) || 0) / 100,
      /* `configurado` diz para a tela avisar quando ainda está no padrão. */
      configurado: !!(p.jornada || p.ocupacao || p.margemDesejada || p.encargos),
    };
  }

  /* Margem a usar quando ninguém configurou nada: a que a carteira entrega de
     verdade. Nunca um número escrito no código. */
  function margemReferencia() {
    const p = params();
    if (p.margemDesejada != null) return { valor: p.margemDesejada, fonte: 'configurada' };
    const m = (typeof FinNucleo !== 'undefined') ? FinNucleo.margemMediaCarteira() : null;
    if (m != null && m > 0) return { valor: m / 100, fonte: 'media da carteira' };
    return { valor: null, fonte: 'indefinida' };
  }

  /* ====================================================
     CUSTO DA PESSOA
     ==================================================== */

  /* Custo mensal cheio de um funcionário, com a conta aberta item por item
     para a ficha poder mostrar de onde saiu cada parcela. */
  function custoMensal(f) {
    if (!f) return { remuneracao: 0, encargos: 0, beneficios: 0, extras: 0, total: 0, itens: [], fatorEncargo: 1 };
    const p = params();
    const regime = f.regimeContratacao || 'CLT';
    const fator = Number(p.encargos[regime]) || 1;

    const remuneracao = Number(f.salarioBase) || 0;
    const adicionais = Number(f.outrosAdicionais) || 0;
    const base = remuneracao + adicionais;
    const encargos = base * (fator - 1);
    const vt = Number(f.vt) || 0;
    const vr = Number(f.vr) || 0;
    const beneficios = vt + vr;

    /* Custos recorrentes lançados na ficha (plano de saúde pago pela empresa,
       celular, curso parcelado) entram na média dos últimos 12 meses, para um
       gasto pontual não distorcer o custo/hora do mês. */
    let extras = 0;
    if (typeof FinNucleo !== 'undefined') {
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
      const de = Utils.localDateStr(inicio);
      const lancs = FinNucleo.lancamentosFunc(f.id, { de }).filter(l => {
        const def = FinNucleo.TIPOS_FUNC[l.tipo];
        return def && def.sinalCusto > 0;
      });
      if (lancs.length) extras = lancs.reduce((s, l) => s + (Number(l.valor) || 0), 0) / 12;
    }

    const itens = [
      { label: 'Remuneração base', valor: remuneracao },
      ...(adicionais ? [{ label: 'Outros adicionais', valor: adicionais }] : []),
      ...(encargos ? [{ label: `Encargos ${regime} (fator ${fator.toFixed(4)})`, valor: encargos }] : []),
      ...(vt ? [{ label: 'Vale transporte', valor: vt }] : []),
      ...(vr ? [{ label: 'Vale refeição', valor: vr }] : []),
      ...(extras ? [{ label: 'Custos lançados (média de 12 meses)', valor: extras }] : []),
    ];

    /* Dois totais, de propósito:

         total ............ inclui os custos lançados diluídos em 12 meses.
                            É o número certo para o CUSTO/HORA, porque uma
                            botina comprada em março faz parte do custo de
                            manter a pessoa no ano todo.
         totalSemExtras ... só remuneração, encargos e benefícios. É o número
                            certo para o CUSTO DO MÊS, onde o gasto real do
                            mês entra pelo seu valor cheio, na data dele.

       Usar `total` nas duas contas somaria a mesma botina duas vezes: um
       doze avos diluído e mais o valor inteiro no mês da compra. */
    return {
      remuneracao, adicionais, encargos, beneficios, extras,
      total: base + encargos + beneficios + extras,
      totalSemExtras: base + encargos + beneficios,
      fatorEncargo: fator, regime, itens,
    };
  }

  /* Horas produtivas por mês desta pessoa. Um parceiro ou autônomo que não tem
     jornada fixa usa a jornada de referência do mesmo jeito: o que se quer é
     uma base de rateio, não um controle de ponto. */
  function horasProdutivas(f) {
    const p = params();
    const jornadaPessoa = Number(f && f.jornadaMensal) > 0 ? Number(f.jornadaMensal) : p.jornada;
    const ocupacaoPessoa = Number(f && f.ocupacaoPct) > 0 ? Number(f.ocupacaoPct) / 100 : p.ocupacao;
    return Math.round(jornadaPessoa * ocupacaoPessoa * 10) / 10;
  }

  /* Custo/hora direto: só a pessoa, sem estrutura. */
  function custoHoraDireto(f) {
    const h = horasProdutivas(f);
    if (!h) return 0;
    return Math.round((custoMensal(f).total / h) * 100) / 100;
  }

  /* Versão por id, usada pelo núcleo ao valorizar o timesheet. */
  function custoHoraDe(funcionarioId) {
    const f = DB.get('funcionarios', funcionarioId);
    return f ? custoHoraCheio(f) : 0;
  }

  /* ====================================================
     ESTRUTURA — o custo indireto que cada hora tem de carregar
     ==================================================== */

  /* Horas produtivas de toda a equipe ativa no mês. É o denominador do rateio:
     se ninguém trabalha, não há hora para absorver a estrutura. */
  function horasProdutivasEquipe() {
    return DB.getAll('funcionarios')
      .filter(f => f.ativo !== false)
      .reduce((s, f) => s + horasProdutivas(f), 0);
  }

  /* Estrutura mensal: despesas fixas + despesas gerais do mês + pessoal que
     NÃO é produtivo. Hoje todo mundo conta como produtivo, então o pessoal
     já está no custo/hora direto e não entra aqui de novo — contar duas vezes
     dobraria o custo da hora. */
  function estruturaMensal(mes) {
    const m = mes || Utils.todayStr().substring(0, 7);
    if (typeof FinNucleo === 'undefined') return { fixas: 0, gerais: 0, total: 0, mes: m };
    const fixas = FinNucleo.despesasFixasMes(m).total;
    const gerais = FinNucleo.despesasGerais(m + '-01', m + '-31')
      .reduce((s, l) => s + (Number(l.valor) || 0), 0);
    return { fixas, gerais, total: fixas + gerais, mes: m };
  }

  function custoIndiretoHora(mes) {
    const h = horasProdutivasEquipe();
    if (!h) return 0;
    return Math.round((estruturaMensal(mes).total / h) * 100) / 100;
  }

  /* Custo/hora cheio: a pessoa mais a fatia de estrutura que a hora dela
     precisa pagar. É este número que entra num orçamento. */
  function custoHoraCheio(f, mes) {
    return Math.round((custoHoraDireto(f) + custoIndiretoHora(mes)) * 100) / 100;
  }

  /* ====================================================
     PREÇO
     ==================================================== */

  /* Preço/hora de venda. Devolve também a conta aberta, porque um orçamento
     que o usuário não entende ele não defende na frente do cliente. */
  function precoHora(f, opcoes) {
    const o = opcoes || {};
    const p = params();
    const cheio = custoHoraCheio(f, o.mes);
    const comp = COMPLEXIDADES.find(c => c.id === (o.complexidade || 'simples')) || COMPLEXIDADES[0];
    const ref = margemReferencia();
    const margem = o.margem != null ? Number(o.margem) / 100 : ref.valor;

    if (margem == null) {
      return {
        valor: null, custoCheio: cheio, fatorComplexidade: comp.fator,
        margem: null, margemFonte: ref.fonte, aliquota: p.aliquota,
        motivo: 'Defina a margem desejada na configuração, ou lance custo em pelo menos um serviço para o sistema usar a margem real da carteira.',
      };
    }
    const divisor = 1 - margem - p.aliquota;
    if (divisor <= 0) {
      return {
        valor: null, custoCheio: cheio, fatorComplexidade: comp.fator,
        margem, margemFonte: ref.fonte, aliquota: p.aliquota,
        motivo: `Margem de ${(margem * 100).toFixed(0)}% somada ao imposto de ${(p.aliquota * 100).toFixed(1)}% chega a 100% do preço. Reduza a margem desejada.`,
      };
    }
    const valor = Math.round((cheio * comp.fator / divisor) * 100) / 100;
    return {
      valor, custoCheio: cheio, custoComComplexidade: Math.round(cheio * comp.fator * 100) / 100,
      fatorComplexidade: comp.fator, complexidade: comp,
      margem, margemFonte: ref.fonte, aliquota: p.aliquota, divisor,
      lucroPorHora: Math.round((valor * margem) * 100) / 100,
      motivo: '',
    };
  }

  /* Preço/hora da equipe (média ponderada pelas horas produtivas), para quando
     o orçamento não sabe ainda quem vai executar. */
  function precoHoraEquipe(opcoes) {
    const ativos = DB.getAll('funcionarios').filter(f => f.ativo !== false && (Number(f.salarioBase) || 0) > 0);
    if (!ativos.length) {
      return { valor: null, custoCheio: 0, motivo: 'Nenhuma pessoa com custo cadastrado.' };
    }
    let somaHoras = 0, somaCusto = 0;
    ativos.forEach(f => {
      const h = horasProdutivas(f);
      somaHoras += h;
      somaCusto += custoMensal(f).total;
    });
    const medio = somaHoras > 0 ? somaCusto / somaHoras : 0;
    /* Reaproveita precoHora com um funcionário sintético que já tem o custo
       médio da equipe, para a conta ser exatamente a mesma. */
    const falso = { salarioBase: medio * params().jornada * params().ocupacao, regimeContratacao: 'PJ' };
    const r = precoHora(falso, opcoes);
    return { ...r, nPessoas: ativos.length, custoHoraMedio: Math.round(medio * 100) / 100 };
  }

  /* ====================================================
     ORÇAMENTO DE UM SERVIÇO
     ==================================================== */

  /* Monta o preço de um serviço a partir de horas por pessoa mais custos
     diretos previstos (deslocamento, material, subcontratação).

     equipe: [{ funcionarioId, horas }]
     diretos: [{ descricao, valor }]

     Custo direto previsto não leva margem de complexidade (comprar uma chapa
     não é mais difícil num projeto crítico), mas leva margem e imposto, senão
     a empresa repassa custo e trabalha de graça naquele pedaço. */
  function orcarServico(entrada) {
    const e = entrada || {};
    const p = params();
    const comp = COMPLEXIDADES.find(c => c.id === (e.complexidade || 'simples')) || COMPLEXIDADES[0];
    const ref = margemReferencia();
    const margem = e.margem != null ? Number(e.margem) / 100 : ref.valor;

    const linhas = [];
    let custoPessoas = 0, totalHoras = 0;
    (e.equipe || []).forEach(item => {
      const f = DB.get('funcionarios', item.funcionarioId);
      if (!f) return;
      const horas = Number(item.horas) || 0;
      if (!horas) return;
      const ch = custoHoraCheio(f, e.mes);
      const custo = ch * horas;
      custoPessoas += custo;
      totalHoras += horas;
      linhas.push({
        tipo: 'pessoa', nome: f.nome || 'Sem nome', cargo: f.cargo || '',
        horas, custoHora: ch, custo,
      });
    });

    let custoDiretos = 0;
    (e.diretos || []).forEach(d => {
      const v = Number(d.valor) || 0;
      if (!v) return;
      custoDiretos += v;
      linhas.push({ tipo: 'direto', nome: d.descricao || 'Custo direto', horas: 0, custoHora: 0, custo: v });
    });

    const custoTotal = custoPessoas + custoDiretos;
    const custoComComplexidade = custoPessoas * comp.fator + custoDiretos;

    if (margem == null) {
      return {
        linhas, totalHoras, custoPessoas, custoDiretos, custoTotal, custoComComplexidade,
        complexidade: comp, margem: null, margemFonte: ref.fonte, aliquota: p.aliquota,
        preco: null, precoHoraMedio: null, lucro: null, margemReal: null,
        motivo: 'Defina a margem desejada na configuração para o sistema sugerir o preço.',
      };
    }
    const divisor = 1 - margem - p.aliquota;
    if (divisor <= 0) {
      return {
        linhas, totalHoras, custoPessoas, custoDiretos, custoTotal, custoComComplexidade,
        complexidade: comp, margem, margemFonte: ref.fonte, aliquota: p.aliquota,
        preco: null, precoHoraMedio: null, lucro: null, margemReal: null,
        motivo: 'Margem mais imposto chegam a 100% do preço. Reduza a margem desejada.',
      };
    }
    const preco = Math.round((custoComComplexidade / divisor) * 100) / 100;
    const imposto = preco * p.aliquota;
    const lucro = preco - imposto - custoTotal;
    return {
      linhas, totalHoras, custoPessoas, custoDiretos, custoTotal, custoComComplexidade,
      complexidade: comp, margem, margemFonte: ref.fonte, aliquota: p.aliquota, divisor,
      preco, imposto,
      precoHoraMedio: totalHoras > 0 ? Math.round((preco / totalHoras) * 100) / 100 : null,
      lucro, margemReal: preco > 0 ? Math.round((lucro / preco) * 100) : null,
      motivo: '',
    };
  }

  /* Caminho inverso: o cliente só aceita pagar X. Que margem sobra?
     É a pergunta que aparece em toda negociação. */
  function avaliarPreco(precoProposto, custoTotal) {
    const p = params();
    const preco = Number(precoProposto) || 0;
    const custo = Number(custoTotal) || 0;
    if (preco <= 0) return { margemPct: null, lucro: null, motivo: 'Informe o preço.' };
    const imposto = preco * p.aliquota;
    const lucro = preco - imposto - custo;
    const ref = margemReferencia();
    return {
      preco, imposto, custo, lucro,
      margemPct: Math.round((lucro / preco) * 100),
      referenciaPct: ref.valor == null ? null : Math.round(ref.valor * 100),
      referenciaFonte: ref.fonte,
      motivo: '',
    };
  }

  /* ====================================================
     RESUMO PARA TELA
     ==================================================== */

  /* Tudo que a aba "Base de custo" precisa, numa chamada. */
  function baseDeCusto(mes) {
    const p = params();
    const ativos = DB.getAll('funcionarios').filter(f => f.ativo !== false);
    const pessoas = ativos.map(f => {
      const cm = custoMensal(f);
      return {
        funcionario: f, id: f.id, nome: f.nome || 'Sem nome', cargo: f.cargo || '',
        regime: f.regimeContratacao || 'CLT',
        custoMensal: cm.total, horas: horasProdutivas(f),
        custoHoraDireto: custoHoraDireto(f),
        custoHoraCheio: custoHoraCheio(f, mes),
        preco: precoHora(f, { mes }),
        semBase: !(Number(f.salarioBase) > 0),
      };
    }).sort((a, b) => b.custoHoraCheio - a.custoHoraCheio);

    const estrutura = estruturaMensal(mes);
    const horasEquipe = horasProdutivasEquipe();
    return {
      params: p, pessoas, estrutura, horasEquipe,
      custoIndiretoHora: custoIndiretoHora(mes),
      custoPessoalMensal: pessoas.reduce((s, x) => s + x.custoMensal, 0),
      margem: margemReferencia(),
      complexidades: COMPLEXIDADES,
    };
  }

  return {
    JORNADA_PADRAO, OCUPACAO_PADRAO, ENCARGO_PADRAO, COMPLEXIDADES,
    params, margemReferencia,
    custoMensal, horasProdutivas, custoHoraDireto, custoHoraCheio, custoHoraDe,
    horasProdutivasEquipe, estruturaMensal, custoIndiretoHora,
    precoHora, precoHoraEquipe, orcarServico, avaliarPreco, baseDeCusto,
  };
})();
