/* ==========================================
   FICHA DO FUNCIONÁRIO — tela inteira, uma pessoa por vez

   Mesma ideia da ficha do cliente: em vez de uma janelinha com dados de
   cadastro, uma tela que reúne tudo sobre a pessoa — quanto custa, quanto
   vale a hora dela, o que foi lançado (vale, bônus, EPI, curso), onde ela
   trabalhou e quanto de receita passou pelas mãos dela.

   FONTE ÚNICA DE VERDADE (vale para todo este arquivo)
   - Custo mensal e custo/hora ..... CustoHora
   - Vales, bônus e custos ......... entidade func_lancamentos
   - Folha paga .................... entidade folha
   - Horas por serviço ............. entidade timesheet
   Nada é somado duas vezes: a folha é o pagamento do mês, o lançamento é o
   que aconteceu fora dela. Um vale não é custo novo — é adiantamento do
   salário que já está contado — então ele aparece no caixa e no líquido a
   pagar, nunca no custo.
   ========================================== */
const FuncionarioFicha = (() => {

  let _id = null;
  let _aba = 'custo';
  let _complexidade = 'simples';

  const ABAS = [
    ['custo',       '💰 Custo e preço'],
    ['lancamentos', '🧾 Lançamentos'],
    ['alocacao',    '🔧 Alocação'],
    ['folha',       '📄 Folha'],
    ['cadastro',    '📋 Cadastro'],
  ];

  const VAZIO = '—';

  function _func(id) { return id ? DB.get('funcionarios', id) : null; }

  /* ====================================================
     NÚMEROS
     ==================================================== */

  function _lancs(id) {
    return (typeof FinNucleo !== 'undefined') ? FinNucleo.lancamentosFunc(id) : [];
  }

  /* Vale em aberto: adiantamento que a empresa entregou e ainda não descontou
     em folha. É dinheiro que a pessoa já recebeu e a empresa ainda vai acertar.
     A conta de quem está aberto é do núcleo, para a ficha, a folha e o
     holerite nunca discordarem sobre o que já foi acertado. */
  function _valesAbertos(id) {
    if (typeof FinNucleo !== 'undefined' && FinNucleo.descontosEmAberto) {
      return FinNucleo.descontosEmAberto(id);
    }
    return _lancs(id).filter(l => l.tipo === 'vale'
      && l.status !== 'descontado' && l.status !== 'acertado' && l.status !== 'cancelado');
  }

  function _mesAtual() { return Utils.todayStr().substring(0, 7); }

  function _mesLabel(m) {
    if (!m) return VAZIO;
    const d = new Date(m + '-02');
    return isNaN(d) ? m : d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  }

  /* Opções de competência: três meses para trás e três para a frente. */
  function _opcoesCompetencia(sel) {
    const base = _mesAtual().split('-').map(Number);
    const out = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base[0], (base[1] - 1) + i, 1);
      const m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      out.push(m);
    }
    if (sel && !out.includes(sel)) out.unshift(sel);
    return out;
  }

  function _apontamentos(id) {
    return DB.getAll('timesheet').filter(t => t.funcionarioId === id);
  }

  function metricas(id) {
    const f = _func(id);
    if (!f) return null;
    const cm = (typeof CustoHora !== 'undefined') ? CustoHora.custoMensal(f) : { total: 0, itens: [] };
    const horas = (typeof CustoHora !== 'undefined') ? CustoHora.horasProdutivas(f) : 0;
    const chDireto = (typeof CustoHora !== 'undefined') ? CustoHora.custoHoraDireto(f) : 0;
    const chCheio = (typeof CustoHora !== 'undefined') ? CustoHora.custoHoraCheio(f) : 0;
    const preco = (typeof CustoHora !== 'undefined') ? CustoHora.precoHora(f, { complexidade: _complexidade }) : { valor: null };

    const lancs = _lancs(id);
    const hoje = new Date();
    const de12 = Utils.localDateStr(new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1));
    const lancs12 = lancs.filter(l => (l.data || '') >= de12);
    let custo12 = 0, vales12 = 0;
    lancs12.forEach(l => {
      const def = (typeof FinNucleo !== 'undefined') ? FinNucleo.TIPOS_FUNC[l.tipo] : null;
      if (!def) return;
      if (def.sinalCusto > 0) custo12 += Number(l.valor) || 0;
      if (l.tipo === 'vale') vales12 += Number(l.valor) || 0;
    });

    const vAbertos = _valesAbertos(id);
    const valeAberto = vAbertos.reduce((s, l) => s + (Number(l.valor) || 0), 0);

    /* Alocação: horas apontadas e os serviços em que a pessoa aparece. */
    const ap = _apontamentos(id);
    const horasApontadas = ap.reduce((s, t) => s + (Number(t.horas) || 0), 0);
    const idsServ = [...new Set(ap.map(t => t.projetoId).filter(Boolean))];
    const servicos = idsServ.map(pid => DB.get('projetos', pid)).filter(Boolean);
    const receitaServicos = servicos.reduce((s, p) => s + (Number(p.valor) || 0), 0);

    /* Utilização: do que foi pago como hora produtiva, quanto virou
       apontamento. Só faz sentido se houver timesheet. */
    const mesesCasa = f.dataAdmissao ? Math.max(1, _mesesEntre(f.dataAdmissao, Utils.todayStr())) : null;
    const horasEsperadas = mesesCasa ? horas * Math.min(mesesCasa, 12) : null;
    const utilizacao = (horasEsperadas && horasApontadas > 0)
      ? Math.round((horasApontadas / horasEsperadas) * 100) : null;

    const folhas = DB.getAll('folha').filter(x => x.funcionarioId === id);
    const pagoTotal = folhas.reduce((s, x) => s + (Number(x.liquido) || 0), 0);

    return {
      f, custoMensal: cm, horas, chDireto, chCheio, preco,
      lancs, lancs12, custo12, vales12, valeAberto, nValesAbertos: vAbertos.length,
      apontamentos: ap, horasApontadas, servicos, receitaServicos, utilizacao,
      folhas, pagoTotal, mesesCasa,
      custoAnual: cm.total * 12,
    };
  }

  function _mesesEntre(a, b) {
    const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
    if (isNaN(da) || isNaN(db)) return 0;
    return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
  }

  /* O que falta para esta pessoa poder entrar num orçamento com preço.
     Não é avaliação da pessoa: é checagem de cadastro. */
  function prontidao(id) {
    const m = metricas(id);
    if (!m) return null;
    const f = m.f;
    const faltas = [], ok = [];
    if (Number(f.salarioBase) > 0) ok.push('Valor de referência informado');
    else faltas.push('Sem valor de referência: não há como calcular custo/hora');

    if (m.horas > 0) ok.push(`${m.horas} h produtivas por mês`);
    else faltas.push('Jornada ou ocupação zerada');

    if (m.preco && m.preco.valor != null) ok.push('Preço/hora calculável');
    else faltas.push('Margem desejada não definida na configuração');

    if (m.apontamentos.length) ok.push(`${m.apontamentos.length} apontamento(s) de hora`);
    else faltas.push('Nenhuma hora apontada: o custo real dos serviços dela não aparece');

    const pronto = faltas.length === 0;
    return {
      pronto, faltas, ok,
      label: pronto ? 'Pronta para orçar' : (Number(f.salarioBase) > 0 ? 'Parcialmente pronta' : 'Sem base de custo'),
      cor: pronto ? '#1E7A34' : (Number(f.salarioBase) > 0 ? '#1D4F8C' : '#C42B2B'),
      corEscura: pronto ? '#4ADE80' : (Number(f.salarioBase) > 0 ? '#8FBCF0' : '#F87171'),
    };
  }

  /* ====================================================
     NAVEGAÇÃO
     ==================================================== */

  function abrir(id, aba) {
    if (!_func(id)) { Toast.error('Funcionário não encontrado.'); return; }
    _id = id;
    _aba = aba || 'custo';
    _render();
    window.scrollTo(0, 0);
  }

  function setAba(aba) { _aba = aba; _render(); }

  function setComplexidade(c) { _complexidade = c; _render(); }

  function voltar() {
    _id = null;
    if (typeof Folha !== 'undefined') Folha.render();
  }

  /* Solta a pessoa sem desenhar nada: a navegação pelo menu chama isto para a
     ficha não voltar por cima da tela nova depois de um save. */
  function fechar() { _id = null; }

  function recarregarSeAberta() {
    if (!_id) return false;
    if (!_func(_id)) { _id = null; return false; }
    _render();
    return true;
  }

  function abertaEm() { return _id; }

  /* ====================================================
     DESENHO
     ==================================================== */

  function _render() {
    const f = _func(_id);
    if (!f) { voltar(); return; }
    const m = metricas(_id);
    const pr = prontidao(_id);
    const alvo = document.getElementById('pageContent');
    if (!alvo) return;
    alvo.innerHTML =
      _cabecalho(f, m) +
      _faixaProntidao(pr) +
      _faixaNumeros(m) +
      _barraAbas(m) +
      '<div id="ffAba">' + _conteudoAba(f, m) + '</div>';
  }

  function _cabecalho(f, m) {
    const ini = Utils.escHtml((f.nome || '?').charAt(0).toUpperCase());
    const inativo = f.ativo === false;
    const tempo = m.mesesCasa == null ? VAZIO
      : (m.mesesCasa >= 12 ? `${Math.floor(m.mesesCasa / 12)} ano(s)` : `${m.mesesCasa} mês(es)`);
    return `
      <div class="ficha-topo">
        <div class="ficha-ident" style="display:flex;gap:14px;align-items:center">
          <div class="func-avatar" style="width:52px;height:52px;font-size:22px;background:var(--primary);flex-shrink:0">
            ${f.avatar ? `<img src="${Utils.escHtml(f.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : ini}
          </div>
          <div>
            <div class="ficha-nome">${Utils.escHtml(f.nome || 'Sem nome')}
              ${inativo ? '<span class="badge badge-gray" style="margin-left:8px;vertical-align:middle">Desligado</span>' : ''}
            </div>
            <div class="ficha-cod">
              ${Utils.escHtml(f.cargo || VAZIO)}
              ${f.departamento ? ' · ' + Utils.escHtml(f.departamento) : ''}
              · ${Utils.escHtml(f.regimeContratacao || 'CLT')}
              · ${f.dataAdmissao ? 'desde ' + Utils.formatDate(f.dataAdmissao) + ' (' + tempo + ')' : 'admissão não informada'}
            </div>
          </div>
        </div>
        <div class="ficha-acoes">
          <button class="btn btn-sm btn-primary" onclick="FuncionarioFicha.novoVale()" title="Adiantamento que será descontado no pagamento">💵 Lançar vale</button>
          <button class="btn btn-sm btn-secondary" onclick="FuncionarioFicha.novoLancamento()">+ Lançamento</button>
          <button class="btn btn-sm btn-secondary" onclick="FuncionarioFicha.editar()">✏ Editar cadastro</button>
          <button class="btn btn-sm btn-ghost" onclick="FuncionarioFicha.voltar()">← Equipe</button>
        </div>
      </div>`;
  }

  function _faixaProntidao(pr) {
    if (!pr) return '';
    const linha = (itens, cls, marca) => itens.length
      ? itens.map(t => `<div class="vrd-item ${cls}">${marca} ${Utils.escHtml(t)}</div>`).join('')
      : `<div class="vrd-item vrd-nota">nada a registrar</div>`;
    return `
      <div class="ficha-veredito" style="--vcl:${pr.cor};--vcd:${pr.corEscura};--vcbgl:${pr.cor}14;--vcbgd:${pr.corEscura}1f">
        <div class="vrd-selo">
          <div class="vrd-label">${Utils.escHtml(pr.label)}</div>
          <div class="vrd-sub">base de precificação</div>
        </div>
        <div class="vrd-sinais">
          <div class="vrd-col">
            <div class="vrd-col-tit">Em ordem</div>
            ${linha(pr.ok, 'vrd-bom', '▲')}
          </div>
          <div class="vrd-col">
            <div class="vrd-col-tit">Falta</div>
            ${linha(pr.faltas, 'vrd-ruim', '▼')}
          </div>
        </div>
      </div>`;
  }

  function _num(label, valor, sub, cor) {
    return `<div class="kpi" ${cor ? `style="--kc:${cor}"` : ''}>
      <div class="kpi-rot">${label}</div>
      <div class="kpi-val">${valor}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>`;
  }

  function _faixaNumeros(m) {
    const p = m.preco || {};
    const precoTxt = p.valor != null ? Utils.formatCurrency(p.valor) : VAZIO;
    const comp = (typeof CustoHora !== 'undefined') ? CustoHora.COMPLEXIDADES : [];
    return `
      <div class="funil-kpis ff-nums">
        ${_num('Custo mensal', m.custoMensal.total ? Utils.formatCurrency(m.custoMensal.total) : VAZIO,
                m.custoMensal.total ? Utils.formatCurrency(m.custoAnual) + ' / ano' : 'sem valor de referência')}
        ${_num('Horas produtivas', m.horas ? m.horas.toLocaleString('pt-BR') + ' h' : VAZIO, 'por mês')}
        ${_num('Custo/hora direto', m.chDireto ? Utils.formatCurrency(m.chDireto) : VAZIO, 'só a pessoa')}
        ${_num('Custo/hora cheio', m.chCheio ? Utils.formatCurrency(m.chCheio) : VAZIO, 'com estrutura')}
        ${_num('Preço/hora', precoTxt,
                p.valor != null ? `margem ${Math.round((p.margem || 0) * 100)}% · ${Utils.escHtml(p.margemFonte || '')}` : 'margem não definida',
                p.valor != null ? 'var(--ok-txt)' : '')}
        ${_num('Vale em aberto', m.valeAberto ? Utils.formatCurrency(m.valeAberto) : VAZIO,
                m.nValesAbertos ? m.nValesAbertos + ' lançamento(s)' : 'nada a descontar',
                m.valeAberto ? 'var(--ruim-txt)' : '')}
        ${_num('Custo lançado 12m', m.custo12 ? Utils.formatCurrency(m.custo12) : VAZIO, 'EPI, curso, bônus…')}
        ${_num('Horas apontadas', m.horasApontadas ? m.horasApontadas.toLocaleString('pt-BR') + ' h' : VAZIO,
                m.utilizacao != null ? m.utilizacao + '% das horas pagas' : 'sem apontamento')}
      </div>
      <div class="ff-compl">
        <span class="text-xs text-muted">Complexidade do trabalho para o preço/hora:</span>
        ${comp.map(c => `<button class="btn btn-xs ${_complexidade === c.id ? 'btn-primary' : 'btn-ghost'}"
          title="${Utils.escHtml(c.descricao)} · fator ${c.fator.toFixed(2)}"
          onclick="FuncionarioFicha.setComplexidade('${c.id}')">${Utils.escHtml(c.label)}</button>`).join('')}
      </div>`;
  }

  function _barraAbas(m) {
    const cont = {
      lancamentos: m.lancs.length,
      alocacao: m.servicos.length,
      folha: m.folhas.length,
    };
    return `<div class="ficha-abas">
      ${ABAS.map(([id, lb]) => `<button class="ficha-aba ${_aba === id ? 'ativa' : ''}" onclick="FuncionarioFicha.setAba('${id}')">
        ${lb}${cont[id] ? `<span class="ficha-aba-n">${cont[id]}</span>` : ''}
      </button>`).join('')}
    </div>`;
  }

  function _conteudoAba(f, m) {
    switch (_aba) {
      case 'custo':       return _abaCusto(f, m);
      case 'lancamentos': return _abaLancamentos(f, m);
      case 'alocacao':    return _abaAlocacao(f, m);
      case 'folha':       return _abaFolha(f, m);
      case 'cadastro':    return _abaCadastro(f, m);
      default:            return '';
    }
  }

  /* ---- ABA: custo e preço ---- */
  function _abaCusto(f, m) {
    const p = m.preco || {};
    const par = (typeof CustoHora !== 'undefined') ? CustoHora.params() : {};
    const indireto = (typeof CustoHora !== 'undefined') ? CustoHora.custoIndiretoHora() : 0;
    const estr = (typeof CustoHora !== 'undefined') ? CustoHora.estruturaMensal() : { total: 0 };
    const horasEq = (typeof CustoHora !== 'undefined') ? CustoHora.horasProdutivasEquipe() : 0;

    const itens = (m.custoMensal.itens || []).map(i =>
      `<tr><td>${Utils.escHtml(i.label)}</td><td class="text-right font-semibold">${Utils.formatCurrency(i.valor)}</td></tr>`).join('');

    const aviso = !par.configurado ? `
      <div class="ficha-aviso">
        A jornada (${par.jornada} h), a ocupação (${Math.round((par.ocupacao || 0) * 100)}%) e os encargos por regime
        estão nos valores padrão do sistema. Ajuste em Configurações → Precificação com os números do seu contador,
        porque é daí que sai todo preço de hora.
      </div>` : '';

    const semMargem = p.valor == null ? `
      <div class="ficha-aviso">${Utils.escHtml(p.motivo || 'Preço/hora indisponível.')}</div>` : '';

    return `
      ${aviso}${semMargem}
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><div class="card-title">A conta do custo mensal</div></div>
          <div class="card-body" style="padding:0">
            <table class="tbl"><tbody>
              ${itens || '<tr><td colspan="2" class="text-muted text-sm">Nenhum valor de referência informado.</td></tr>'}
              <tr style="border-top:2px solid var(--border)">
                <td class="font-bold">Custo mensal da pessoa</td>
                <td class="text-right font-bold">${Utils.formatCurrency(m.custoMensal.total)}</td>
              </tr>
              <tr><td class="text-sm text-muted">÷ ${m.horas} h produtivas no mês</td>
                  <td class="text-right font-bold" style="color:var(--info-txt)">${Utils.formatCurrency(m.chDireto)} / h</td></tr>
            </tbody></table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Da hora de custo ao preço de venda</div></div>
          <div class="card-body" style="padding:0">
            <table class="tbl"><tbody>
              <tr><td>Custo/hora direto</td><td class="text-right font-semibold">${Utils.formatCurrency(m.chDireto)}</td></tr>
              <tr><td>+ Estrutura rateada
                  <div class="text-xs text-muted">${Utils.formatCurrency(estr.total)} de estrutura ÷ ${horasEq.toLocaleString('pt-BR')} h da equipe</div></td>
                  <td class="text-right font-semibold">${Utils.formatCurrency(indireto)}</td></tr>
              <tr style="border-top:1px solid var(--border)">
                  <td class="font-bold">= Custo/hora cheio</td>
                  <td class="text-right font-bold">${Utils.formatCurrency(m.chCheio)}</td></tr>
              <tr><td>× Complexidade ${Utils.escHtml(p.complexidade ? p.complexidade.label : '')} (${p.fatorComplexidade ? p.fatorComplexidade.toFixed(2) : '1,00'})</td>
                  <td class="text-right font-semibold">${p.custoComComplexidade != null ? Utils.formatCurrency(p.custoComComplexidade) : VAZIO}</td></tr>
              <tr><td>÷ (1 − margem ${p.margem != null ? Math.round(p.margem * 100) + '%' : '?'} − imposto ${p.aliquota != null ? (p.aliquota * 100).toFixed(1) + '%' : '?'})
                  <div class="text-xs text-muted">margem e imposto incidem sobre o preço, não sobre o custo</div></td>
                  <td class="text-right text-sm text-muted">${p.divisor != null ? p.divisor.toFixed(4) : VAZIO}</td></tr>
              <tr style="border-top:2px solid var(--border)">
                  <td class="font-bold">= Preço/hora sugerido</td>
                  <td class="text-right font-bold" style="font-size:16px;color:var(--ok-txt)">${p.valor != null ? Utils.formatCurrency(p.valor) : VAZIO}</td></tr>
              ${p.lucroPorHora != null ? `<tr><td class="text-sm text-muted">Sobra por hora depois de custo e imposto</td>
                  <td class="text-right font-semibold">${Utils.formatCurrency(p.lucroPorHora)}</td></tr>` : ''}
            </tbody></table>
          </div>
        </div>
      </div>
      <div class="card mt-4">
        <div class="card-header"><div class="card-title">Preço/hora por complexidade</div></div>
        <div class="card-body" style="padding:0">
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Complexidade</th><th>Quando usar</th><th>Fator</th><th>Preço/hora</th><th>Dia (8h)</th></tr></thead>
            <tbody>${((typeof CustoHora !== 'undefined') ? CustoHora.COMPLEXIDADES : []).map(c => {
              const pr = CustoHora.precoHora(f, { complexidade: c.id });
              return `<tr>
                <td class="font-semibold">${Utils.escHtml(c.label)}</td>
                <td class="text-xs text-muted">${Utils.escHtml(c.descricao)}</td>
                <td class="text-sm">${c.fator.toFixed(2)}</td>
                <td class="font-bold">${pr.valor != null ? Utils.formatCurrency(pr.valor) : VAZIO}</td>
                <td class="text-sm">${pr.valor != null ? Utils.formatCurrency(pr.valor * 8) : VAZIO}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>
      </div>`;
  }

  /* ---- ABA: lançamentos ---- */
  function _abaLancamentos(f, m) {
    const tipos = (typeof FinNucleo !== 'undefined') ? FinNucleo.TIPOS_FUNC : {};
    if (!m.lancs.length) {
      return `<div class="card"><div class="card-body">
        <div class="empty-state">
          <div class="empty-icon">🧾</div>
          <div class="empty-title">Nenhum lançamento</div>
          <div class="empty-sub">É aqui que entram vale, adiantamento, bônus, comissão, reembolso e custo com a pessoa
            (EPI, curso, exame, ferramenta). O que é custo soma no custo/hora dela; vale e desconto mexem no líquido a pagar.</div>
          <button class="btn btn-primary btn-sm mt-2" onclick="FuncionarioFicha.novoVale()">💵 Lançar vale</button>
          <button class="btn btn-secondary btn-sm mt-2" onclick="FuncionarioFicha.novoLancamento()">+ Outro lançamento</button>
        </div>
      </div></div>`;
    }
    const porTipo = {};
    m.lancs.forEach(l => {
      porTipo[l.tipo] = (porTipo[l.tipo] || 0) + (Number(l.valor) || 0);
    });
    return `
      <div class="funil-kpis">
        ${Object.entries(porTipo).map(([t, v]) => {
          const def = tipos[t] || { label: t, icone: '•' };
          return _num(`${def.icone} ${Utils.escHtml(def.label)}`, Utils.formatCurrency(v), '');
        }).join('')}
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Lançamentos da pessoa</div>
          <div class="flex gap-2">
            <button class="btn btn-xs btn-primary" onclick="FuncionarioFicha.novoVale()">💵 Vale</button>
            <button class="btn btn-xs btn-secondary" onclick="FuncionarioFicha.novoLancamento()">+ Lançamento</button>
          </div>
        </div>
        ${_avisoAcerto(m)}
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th title="Em qual folha este lançamento é acertado">Acerta na folha</th><th>Serviço</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>${m.lancs.map(l => {
            const def = tipos[l.tipo] || { label: l.tipo, icone: '•', sinalCusto: 0, descontaLiq: false };
            const proj = l.projetoId ? DB.get('projetos', l.projetoId) : null;
            const comp = (typeof FinNucleo !== 'undefined') ? FinNucleo.competenciaDe(l) : (l.data || '').substring(0, 7);
            const foraDaFolha = l.naFolha === false;
            const acertado = l.status === 'descontado' || l.status === 'acertado';
            const atrasado = !acertado && !foraDaFolha && def.descontaLiq && comp < _mesAtual();
            const sit = l.status === 'cancelado' ? '<span class="badge badge-gray">Cancelado</span>'
              : acertado ? `<span class="badge badge-green" title="Acertado na folha de ${Utils.escHtml(l.folhaMes || comp)}">${def.descontaLiq ? 'Descontado' : 'Pago'} em ${Utils.escHtml(_mesLabel(l.folhaMes || comp))}</span>`
              : foraDaFolha ? '<span class="badge badge-gray" title="Marcado para ser acertado por fora da folha">Fora da folha</span>'
              : def.descontaLiq ? `<span class="badge ${atrasado ? 'badge-red' : 'badge-yellow'}">${atrasado ? 'Atrasado' : 'A descontar'}</span>`
              : def.pagaNaFolha ? '<span class="badge badge-blue">A pagar na folha</span>'
              : '<span class="badge badge-blue">Registrado</span>';
            return `<tr ${l.status === 'cancelado' ? 'style="opacity:.55"' : ''}>
              <td class="text-sm">${Utils.formatDate(l.data)}</td>
              <td class="text-sm">${def.icone} ${Utils.escHtml(def.label)}</td>
              <td class="font-semibold text-sm">${Utils.escHtml(Utils.truncate(l.descricao || VAZIO, 34))}</td>
              <td class="text-xs ${atrasado ? 'text-danger' : 'text-muted'}">${(foraDaFolha || (!def.descontaLiq && !def.pagaNaFolha)) ? VAZIO : Utils.escHtml(_mesLabel(l.folhaMes || comp))}</td>
              <td class="text-xs">${proj ? Utils.escHtml(Utils.truncate(proj.titulo, 22)) : VAZIO}</td>
              <td class="font-bold ${def.sinalCusto > 0 ? 'text-danger' : ''}">${Utils.formatCurrency(l.valor)}</td>
              <td>${sit}</td>
              <td><div class="tbl-actions">
                <button class="btn btn-xs btn-secondary" onclick="FuncionarioFicha.editarLancamento('${l.id}')" title="Editar">✏</button>
                ${def.descontaLiq && !acertado && l.status !== 'cancelado'
                  ? `<button class="btn btn-xs btn-success" onclick="FuncionarioFicha.marcarDescontado('${l.id}')" title="Já foi acertado por fora da folha — marcar como quitado">✓</button>` : ''}
                ${l.status !== 'cancelado'
                  ? `<button class="btn btn-xs btn-danger" onclick="FuncionarioFicha.cancelarLancamento('${l.id}')" title="Cancelar (mantém no histórico)">✕</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
  }

  /* O que ainda vai bater no próximo pagamento desta pessoa, dito antes da
     tabela: é a pergunta que se faz ao abrir a ficha. */
  function _avisoAcerto(m) {
    if (typeof FinNucleo === 'undefined' || !FinNucleo.efeitoNaFolha) return '';
    const mes = FinNucleo.proximaCompetenciaAberta(m.f.id);
    const ef = FinNucleo.efeitoNaFolha(m.f.id, mes);
    if (!ef.itens.length) return '';
    const calc = (typeof Folha !== 'undefined' && Folha.calcFolhaFuncionario)
      ? Folha.calcFolhaFuncionario(m.f, mes) : null;
    const partes = [];
    if (ef.totalProventos) partes.push(`<strong style="color:var(--ok-txt)">+${Utils.formatCurrency(ef.totalProventos)}</strong> de extras`);
    if (ef.totalDescontos) partes.push(`<strong style="color:var(--ruim-txt)">−${Utils.formatCurrency(ef.totalDescontos)}</strong> de vale/desconto`);
    return `<div class="ficha-aviso"><div>
      Na folha de <strong>${Utils.escHtml(_mesLabel(mes))}</strong>: ${partes.join(' e ')}.
      ${calc ? `O líquido dela sai <strong>${Utils.formatCurrency(calc.liquido)}</strong>.` : ''}
      ${ef.nAtrasados ? ` ${ef.nAtrasados} desconto(s) ficaram de meses anteriores e são cobrados aqui.` : ''}
    </div></div>`;
  }

  /* ---- ABA: alocação ---- */
  function _abaAlocacao(f, m) {
    if (!m.apontamentos.length) {
      return `<div class="card"><div class="card-body">
        <div class="empty-state">
          <div class="empty-icon">🔧</div>
          <div class="empty-title">Nenhuma hora apontada</div>
          <div class="empty-sub">Sem apontamento de hora, o custo de mão de obra dos serviços fica em branco e a margem
            de cada serviço sai maior do que é de verdade. O apontamento é feito dentro do serviço, na aba Horas.</div>
        </div>
      </div></div>`;
    }
    const porServico = {};
    m.apontamentos.forEach(t => {
      const k = t.projetoId || 'sem';
      if (!porServico[k]) porServico[k] = { horas: 0, n: 0 };
      porServico[k].horas += Number(t.horas) || 0;
      porServico[k].n++;
    });
    const linhas = Object.entries(porServico).map(([pid, d]) => {
      const p = pid === 'sem' ? null : DB.get('projetos', pid);
      const custo = d.horas * m.chCheio;
      return { p, pid, ...d, custo };
    }).sort((a, b) => b.horas - a.horas);

    return `
      <div class="funil-kpis">
        ${_num('Horas apontadas', m.horasApontadas.toLocaleString('pt-BR') + ' h', `${m.apontamentos.length} apontamento(s)`)}
        ${_num('Serviços', String(m.servicos.length), 'em que atuou')}
        ${_num('Custo das horas', Utils.formatCurrency(m.horasApontadas * m.chCheio), `a ${Utils.formatCurrency(m.chCheio)}/h`)}
        ${_num('Receita dos serviços', Utils.formatCurrency(m.receitaServicos), 'valor contratado total')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Horas por serviço</div></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Serviço</th><th>Cliente</th><th>Horas</th><th>Custo das horas</th><th>Valor do serviço</th><th></th></tr></thead>
          <tbody>${linhas.map(l => {
            const cli = l.p && l.p.clienteId ? DB.get('clientes', l.p.clienteId) : null;
            return `<tr>
              <td class="font-semibold text-sm">${l.p ? Utils.escHtml(Utils.truncate(l.p.titulo, 36)) : '<span class="text-muted">Sem serviço vinculado</span>'}</td>
              <td class="text-xs text-muted">${cli ? Utils.escHtml(Utils.truncate(cli.empresa || cli.nome || '', 22)) : VAZIO}</td>
              <td class="font-semibold">${l.horas.toLocaleString('pt-BR')} h</td>
              <td>${Utils.formatCurrency(l.custo)}</td>
              <td>${l.p ? Utils.formatCurrency(l.p.valor) : VAZIO}</td>
              <td>${l.p ? `<button class="btn btn-xs btn-secondary" onclick="Projetos.view('${l.pid}')">Abrir</button>` : ''}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
  }

  /* ---- ABA: folha ---- */
  function _abaFolha(f, m) {
    if (!m.folhas.length) {
      return `<div class="card"><div class="card-body">
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <div class="empty-title">Nenhuma folha gerada</div>
          <div class="empty-sub">A folha é gerada por mês, para toda a equipe de uma vez, na tela de RH.</div>
        </div>
      </div></div>`;
    }
    const ord = [...m.folhas].sort((a, b) => (b.mes || '').localeCompare(a.mes || ''));
    return `
      <div class="funil-kpis">
        ${_num('Folhas registradas', String(m.folhas.length), '')}
        ${_num('Total líquido pago', Utils.formatCurrency(m.pagoTotal), '')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Histórico de folha</div></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Mês</th><th>Bruto</th><th>Descontos</th><th title="Vale, desconto, bônus e comissão lançados na ficha">Da ficha</th><th>Líquido</th><th>FGTS</th><th>Status</th><th></th></tr></thead>
          <tbody>${ord.map(r => `<tr>
            <td class="font-semibold text-sm">${Utils.escHtml(_mesLabel(r.mes))}</td>
            <td>${Utils.formatCurrency(r.bruto)}</td>
            <td class="text-danger">${Utils.formatCurrency((Number(r.inss) || 0) + (Number(r.irrf) || 0) + (Number(r.planoSaude) || 0))}</td>
            <td class="text-sm" title="${Utils.escHtml((r.itensLanc || []).map(i => (i.desconta ? '- ' : '+ ') + i.descricao + ' ' + Utils.formatCurrency(i.valor)).join(' | '))}">
              ${(Number(r.proventosLanc) || 0) ? `<span style="color:var(--ok-txt)">+${Utils.formatCurrency(r.proventosLanc)}</span>` : ''}
              ${(Number(r.descontosLanc) || 0) ? `<span style="color:var(--ruim-txt)">−${Utils.formatCurrency(r.descontosLanc)}</span>` : ''}
              ${(!(Number(r.proventosLanc) || 0) && !(Number(r.descontosLanc) || 0)) ? `<span class="text-muted">${VAZIO}</span>` : ''}
            </td>
            <td class="font-bold">${Utils.formatCurrency(r.liquido)}</td>
            <td class="text-sm">${Utils.formatCurrency(r.fgts)}</td>
            <td><span class="badge ${r.status === 'pago' ? 'badge-green' : 'badge-yellow'}">${Utils.escHtml(r.status || 'pendente')}</span></td>
            <td><button class="btn btn-xs btn-secondary" onclick="Folha.verHolerite('${f.id}','${Utils.escHtml(r.mes || '')}')">Holerite</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  }

  /* ---- ABA: cadastro ---- */
  function _abaCadastro(f, m) {
    const campo = (lb, v) => `<div class="detail-field"><div class="detail-label">${lb}</div><div class="detail-value">${v || VAZIO}</div></div>`;
    /* A folha do próximo mês que ainda dá para mexer, não a do cadastro: o
       número que interessa é o que a pessoa vai receber, já com o vale. */
    const mesRef = (typeof FinNucleo !== 'undefined' && FinNucleo.proximaCompetenciaAberta)
      ? FinNucleo.proximaCompetenciaAberta(f.id) : _mesAtual();
    const calc = (typeof Folha !== 'undefined' && Folha.calcFolhaFuncionario)
      ? Folha.calcFolhaFuncionario(f, mesRef) : null;
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Dados cadastrais</div>
          <button class="btn btn-xs btn-secondary" onclick="FuncionarioFicha.editar()">✏ Editar</button></div>
        <div class="card-body">
          <div class="detail-grid">
            ${campo('CPF', Utils.escHtml(f.cpf || ''))}
            ${campo('RG', Utils.escHtml(f.rg || ''))}
            ${campo('CREA / CAU', Utils.escHtml(f.crea || ''))}
            ${campo('Regime', Utils.escHtml(f.regimeContratacao || 'CLT'))}
            ${campo('Admissão', f.dataAdmissao ? Utils.formatDate(f.dataAdmissao) : '')}
            ${campo('Dependentes (IRRF)', String(f.dependentes || 0))}
            ${campo('Valor de referência', Utils.formatCurrency(f.salarioBase))}
            ${campo('Vale transporte', Utils.formatCurrency(f.vt || 0))}
            ${campo('Vale refeição', Utils.formatCurrency(f.vr || 0))}
            ${campo('Plano de saúde (desconto)', Utils.formatCurrency(f.planoSaude || 0))}
            ${campo('Outros adicionais', Utils.formatCurrency(f.outrosAdicionais || 0))}
            ${campo('Banco / Ag / Conta', Utils.escHtml([f.banco, f.agencia, f.conta].filter(Boolean).join(' / ')))}
          </div>
          ${calc ? `
          <div class="mt-4">
            <div class="text-sm font-bold mb-2">Folha de ${Utils.escHtml(_mesLabel(mesRef))}</div>
            <div class="detail-grid">
              ${campo('Bruto', Utils.formatCurrency(calc.bruto))}
              ${campo('INSS', Utils.formatCurrency(calc.inss))}
              ${campo('IRRF', Utils.formatCurrency(calc.irrf))}
              ${campo('FGTS (encargo)', Utils.formatCurrency(calc.fgts))}
              ${campo('Extras da ficha', calc.proventosLanc
                  ? `<span class="font-bold" style="color:var(--ok-txt)">+${Utils.formatCurrency(calc.proventosLanc)}</span>`
                  : '<span class="text-muted">nada lançado</span>')}
              ${campo('Vale e desconto da ficha', calc.descontosLanc
                  ? `<span class="font-bold" style="color:var(--ruim-txt)">−${Utils.formatCurrency(calc.descontosLanc)}</span>`
                  : '<span class="text-muted">nada lançado</span>')}
              ${campo('Líquido a pagar', `<span class="font-bold text-success">${Utils.formatCurrency(calc.liquido)}</span>`)}
            </div>
            <div class="text-xs text-muted mt-2">Cálculo do cadastro mais o que está lançado na ficha.
              Vale e desconto saem daqui automaticamente quando a folha deste mês for gerada.</div>
          </div>` : ''}
          ${f.observacoes ? `<div class="ficha-obs mt-4">${Utils.escHtml(f.observacoes)}</div>` : ''}
        </div>
      </div>
      <div class="card mt-4">
        <div class="card-header"><div class="card-title">Parâmetros de hora desta pessoa</div></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-3">Se esta pessoa tem jornada ou aproveitamento diferente do padrão da empresa,
            informe aqui. Em branco, usa o padrão da configuração.</p>
          <div class="detail-grid">
            ${campo('Jornada mensal', f.jornadaMensal ? f.jornadaMensal + ' h' : `padrão (${(typeof CustoHora !== 'undefined' ? CustoHora.params().jornada : 0)} h)`)}
            ${campo('Ocupação técnica', f.ocupacaoPct ? f.ocupacaoPct + '%' : `padrão (${(typeof CustoHora !== 'undefined' ? Math.round(CustoHora.params().ocupacao * 100) : 0)}%)`)}
            ${campo('Horas produtivas resultantes', m.horas + ' h')}
          </div>
          <button class="btn btn-sm btn-secondary mt-3" onclick="FuncionarioFicha.editarParametros()">Ajustar jornada e ocupação</button>
        </div>
      </div>`;
  }

  /* ====================================================
     AÇÕES
     ==================================================== */

  function editar() {
    if (typeof Folha !== 'undefined') Folha.openFormFunc(_id);
  }

  function editarParametros() {
    const f = _func(_id);
    if (!f) return;
    const par = (typeof CustoHora !== 'undefined') ? CustoHora.params() : { jornada: 176, ocupacao: 0.7 };
    Modal.open({
      title: 'Jornada e ocupação — ' + Utils.escHtml(f.nome || ''),
      size: 'modal-sm',
      body: `
        <div class="form-group">
          <label class="form-label">Jornada mensal (horas)</label>
          <input class="form-control" id="ffpJornada" type="number" step="1" value="${f.jornadaMensal || ''}" placeholder="padrão: ${par.jornada}">
          <div class="text-xs text-muted mt-1">Horas pagas no mês. Em branco usa o padrão da empresa.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Ocupação técnica (%)</label>
          <input class="form-control" id="ffpOcupacao" type="number" step="1" min="1" max="100" value="${f.ocupacaoPct || ''}" placeholder="padrão: ${Math.round(par.ocupacao * 100)}">
          <div class="text-xs text-muted mt-1">Fatia da jornada que vira hora de serviço. O resto é proposta,
            deslocamento e administrativo: horas pagas que não se faturam.</div>
        </div>`,
      saveCb: () => {
        const j = Number(document.getElementById('ffpJornada').value) || null;
        const o = Number(document.getElementById('ffpOcupacao').value) || null;
        if (o != null && (o <= 0 || o > 100)) { Toast.error('A ocupação tem de ficar entre 1% e 100%.'); return; }
        DB.update('funcionarios', _id, { jornadaMensal: j, ocupacaoPct: o });
        Modal.close();
        Toast.success('Parâmetros atualizados');
        _render();
      },
    });
  }

  function novoLancamento() { _formLancamento(null); }
  function novoVale() { _formLancamento(null, 'vale'); }
  function editarLancamento(id) { _formLancamento(id); }

  function _formLancamento(id, tipoInicial) {
    const f = _func(_id);
    if (!f) return;
    const l = id ? DB.get('func_lancamentos', id) : null;
    const tipoSel = l?.tipo || tipoInicial || 'vale';
    /* Competência padrão: a primeira folha que ainda dá para mexer. Se a folha
       do mês corrente já foi paga, o acerto é na próxima, e o formulário diz
       isso antes de a pessoa salvar e estranhar depois. */
    const compPadrao = (typeof FinNucleo !== 'undefined' && FinNucleo.proximaCompetenciaAberta)
      ? FinNucleo.proximaCompetenciaAberta(_id) : _mesAtual();
    const compSel = l?.competencia || (l ? (l.data || '').substring(0, 7) : compPadrao);
    const folhaDaComp = DB.getAll('folha').find(r => r.mes === compSel && r.funcionarioId === _id);
    const tipos = (typeof FinNucleo !== 'undefined') ? FinNucleo.TIPOS_FUNC : {};
    const cats = (typeof FinNucleo !== 'undefined') ? FinNucleo.CATEGORIAS_CUSTO_FUNC : [];
    const projs = DB.getAll('projetos')
      .filter(p => p.status !== 'cancelado')
      .sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));

    Modal.open({
      title: (id ? 'Editar lançamento — ' : 'Novo lançamento — ') + Utils.escHtml(f.nome || ''),
      size: 'modal-md',
      body: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo *</label>
            <select class="form-control" id="flTipo" onchange="FuncionarioFicha._explicarTipo(this.value)">
              ${Object.entries(tipos).map(([k, d]) =>
                `<option value="${k}" ${tipoSel === k ? 'selected' : ''}>${d.icone} ${Utils.escHtml(d.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Valor (R$) *</label>
            <input class="form-control" id="flValor" type="text" inputmode="decimal" value="${Utils.moneyToInput(l?.valor)}">
          </div>
          <div class="form-group">
            <label class="form-label">Data</label>
            <input class="form-control" id="flData" type="date" value="${l?.data || Utils.todayStr()}">
          </div>
        </div>
        <div id="flExplica" class="text-xs text-muted mb-2"></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Acerta na folha de *</label>
            <select class="form-control" id="flComp">
              ${_opcoesCompetencia(compSel).map(m =>
                `<option value="${m}" ${m === compSel ? 'selected' : ''}>${Utils.escHtml(_mesLabel(m))}</option>`).join('')}
            </select>
            <div class="form-hint">${folhaDaComp
              ? (folhaDaComp.pago
                  ? 'A folha deste mês já foi paga. Escolha a próxima para o acerto valer.'
                  : 'A folha deste mês já foi gerada e será atualizada ao salvar.')
              : 'A folha deste mês ainda não foi gerada: ao gerar, isto entra automaticamente.'}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Forma de acerto</label>
            <label class="flex items-center gap-2 text-sm" style="padding-top:8px">
              <input type="checkbox" id="flNaFolha" ${l && l.naFolha === false ? '' : 'checked'}>
              <span>Acertar junto com a folha</span>
            </label>
            <div class="form-hint">Desmarque se o acerto já foi feito por fora (dinheiro devolvido, pagamento avulso).
              O lançamento continua no histórico, só não mexe no pagamento.</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição *</label>
          <input class="form-control" id="flDesc" value="${Utils.escHtml(l?.descricao || '')}" placeholder="Ex: Vale de novembro, Botina de segurança, Curso NR-10">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select class="form-control" id="flCat">
              <option value="">—</option>
              ${cats.map(c => `<option ${l?.categoria === c ? 'selected' : ''}>${Utils.escHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Serviço (opcional)</label>
            <select class="form-control" id="flProj">
              <option value="">Não vinculado</option>
              ${projs.map(p => `<option value="${p.id}" ${l?.projetoId === p.id ? 'selected' : ''}>${Utils.escHtml(Utils.truncate(p.titulo, 40))}</option>`).join('')}
            </select>
            <div class="text-xs text-muted mt-1">Vinculando ao serviço, o gasto também entra no custo daquele serviço.</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="flObs" rows="2">${Utils.escHtml(l?.observacoes || '')}</textarea>
        </div>`,
      saveCb: () => _salvarLancamento(id),
    });
    setTimeout(() => _explicarTipo(tipoSel), 30);
  }

  function _explicarTipo(tipo) {
    const el = document.getElementById('flExplica');
    if (!el) return;
    const d = (typeof FinNucleo !== 'undefined') ? FinNucleo.TIPOS_FUNC[tipo] : null;
    if (!d) { el.textContent = ''; return; }
    const partes = [];
    partes.push(d.sinalCusto > 0
      ? 'Soma ao custo da pessoa e ao custo da empresa.'
      : 'Não é custo novo: o custo é a remuneração, que já está contada.');
    if (d.descontaLiq) partes.push('Desconta do líquido da folha escolhida abaixo, automaticamente.');
    else if (d.pagaNaFolha) partes.push('É pago à pessoa junto com a folha da competência escolhida abaixo.');
    else partes.push('Não entra no pagamento da pessoa: quem recebe é o fornecedor.');
    el.textContent = partes.join(' ');
  }

  function _salvarLancamento(id) {
    const tipo = document.getElementById('flTipo').value;
    const valor = Utils.parseMoney(document.getElementById('flValor').value);
    const desc = document.getElementById('flDesc').value.trim();
    if (!desc) { Toast.error('Descrição obrigatória.'); return; }
    if (!valor || valor <= 0) { Toast.error('Informe um valor maior que zero.'); return; }

    const dataLanc = document.getElementById('flData').value;
    if (typeof Fechamento !== 'undefined' && !Fechamento.permite(dataLanc, 'Este lançamento')) return;

    const competencia = document.getElementById('flComp').value || dataLanc.substring(0, 7);
    const naFolha = !!document.getElementById('flNaFolha').checked;

    const dados = {
      funcionarioId: _id, tipo, valor, data: dataLanc,
      competencia, naFolha,
      descricao: desc,
      categoria: document.getElementById('flCat').value,
      projetoId: document.getElementById('flProj').value,
      observacoes: document.getElementById('flObs').value.trim(),
    };
    const anterior = id ? DB.get('func_lancamentos', id) : null;
    if (id) DB.update('func_lancamentos', id, dados);
    else DB.create('func_lancamentos', { ...dados, status: 'aberto' });

    /* ISTO é o que o usuário pediu: lançou na ficha, o pagamento do mês já sai
       acertado, sem ninguém refazer a folha na mão. Mês já pago não se mexe —
       o dinheiro saiu — e o lançamento é cobrado na folha seguinte. */
    const nota = _acertarNaFolha(competencia, naFolha)
      + (anterior && anterior.competencia && anterior.competencia !== competencia
          ? _acertarNaFolha(anterior.competencia, true) : '');

    Toast.success((id ? 'Lançamento atualizado.' : 'Lançamento registrado.') + nota);
    Modal.close();
    _aba = 'lancamentos';
    _render();
  }

  /* Refaz a folha daquela competência quando ela existe e ainda é mexível.
     Devolve o texto que o aviso mostra, ou o motivo de não ter mexido. */
  function _acertarNaFolha(competencia, naFolha) {
    if (!competencia) return '';
    const rec = DB.getAll('folha').find(r => r.mes === competencia && r.funcionarioId === _id);
    if (!rec) return ' A folha de ' + _mesLabel(competencia) + ' ainda não foi gerada: isto entra quando ela for.';
    if (rec.pago) return ' A folha de ' + _mesLabel(competencia) + ' já foi paga, então ela não muda. O acerto cai na próxima.';
    if (!naFolha) return '';
    if (typeof Folha === 'undefined' || !Folha.recalcularFuncionario) return '';
    const calc = Folha.recalcularFuncionario(competencia, _id, true);
    return calc
      ? ' Folha de ' + _mesLabel(competencia) + ' atualizada: líquido ' + Utils.formatCurrency(calc.liquido) + '.'
      : '';
  }

  /* Quitar por fora: o acerto aconteceu sem passar pela folha (a pessoa
     devolveu em dinheiro, foi descontado de outra coisa). Fica registrado com
     a data, e o lançamento sai da fila do próximo pagamento. */
  function marcarDescontado(id) {
    const l = DB.get('func_lancamentos', id);
    if (!l) return;
    const comp = (typeof FinNucleo !== 'undefined') ? FinNucleo.competenciaDe(l) : '';
    DB.update('func_lancamentos', id, {
      status: 'descontado', dataDesconto: Utils.todayStr(),
      folhaMes: l.folhaMes || comp,
    });
    const nota = _acertarNaFolha(comp, true);
    Toast.success('Marcado como acertado.' + nota);
    _render();
  }

  /* Cancelar, não apagar: o histórico de dinheiro com uma pessoa é registro
     trabalhista. Fica na ficha riscado, com a conta já fora dos totais. */
  function cancelarLancamento(id) {
    const l = DB.get('func_lancamentos', id);
    if (!l) return;
    /* O dialogo de confirmacao escreve a mensagem com textContent, entao ela
       precisa ser texto puro: tag nenhuma aparece formatada ali. */
    const folhaRec = l.folhaId ? DB.get('folha', l.folhaId) : null;
    const extra = !folhaRec ? ''
      : folhaRec.pago
        ? ` Atenção: a folha de ${_mesLabel(folhaRec.mes)} já foi paga com este acerto. Cancelar aqui não devolve o dinheiro; o ajuste precisa ser feito na folha seguinte.`
        : ` A folha de ${_mesLabel(folhaRec.mes)} será refeita sem ele.`;
    Confirm.show(
      'Cancelar lançamento',
      `Cancelar "${l.descricao || 'lançamento'}" de ${Utils.formatCurrency(l.valor)}? `
      + 'Ele sai dos totais mas continua no histórico, riscado. Nada é apagado.' + extra,
      () => {
        DB.update('func_lancamentos', id, { status: 'cancelado' });
        const nota = (folhaRec && !folhaRec.pago) ? _acertarNaFolha(folhaRec.mes, true) : '';
        Toast.success('Lançamento cancelado.' + nota);
        _render();
      }
    );
  }

  return {
    abrir, setAba, setComplexidade, voltar, fechar, recarregarSeAberta, abertaEm,
    editar, editarParametros,
    novoLancamento, novoVale, editarLancamento, marcarDescontado, cancelarLancamento,
    metricas, prontidao,
    _explicarTipo,
  };
})();
