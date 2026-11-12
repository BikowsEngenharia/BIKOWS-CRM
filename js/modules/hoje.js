/* ==========================================
   HOJE.js — Tela de abertura: só o que precisa de ação agora

   Não cria entidade nova nem apaga nada. Lê o que já existe em
   atividades, leads, recebíveis, contas a pagar, licitações e
   equipamentos, e expõe a ação direta (concluir, adiar, registrar
   contato) sem abrir formulário. Os números vêm das mesmas regras
   do sino de pendências (js/notifications.js) para que as duas
   telas nunca discordem.
   ========================================== */
const Hoje = (() => {

  let _horizonte = 0;        // 0 = hoje e atrasado · 7 = próximos 7 dias
  let _expandido = {};       // bloco → true quando o usuário pediu "ver todos"
  const LIMITE = 6;          // itens visíveis por bloco antes do "ver todos"

  /* ---------- helpers ---------- */
  function _dias(dateStr) { return Utils.daysUntil(dateStr); }

  function _dentro(dateStr, minDias) {
    const d = _dias(dateStr);
    if (d === null) return false;
    return d <= _horizonte && d >= (minDias ?? -3650);
  }

  function _dataMais(n) {
    const d = new Date(); d.setDate(d.getDate() + (Number(n) || 0));
    return Utils.localDateStr(d);
  }

  function _prazoLabel(dateStr, sufVencido, sufFuturo) {
    const d = _dias(dateStr);
    if (d === null) return '';
    if (d < 0)  return `<span class="badge badge-red">${Math.abs(d)}d ${sufVencido || 'atrasado'}</span>`;
    if (d === 0) return `<span class="badge badge-yellow">Hoje</span>`;
    return `<span class="badge badge-gray">${sufFuturo || 'em'} ${d}d</span>`;
  }

  function _telefoneLead(lead) {
    if (lead.contato) return lead.contato;
    const c = DB.get('clientes', lead.clienteId);
    return c?.telefone || '';
  }

  /* ---------- coleta ---------- */
  function _atividades() {
    return DB.getAll('atividades')
      .filter(a => a.status === 'pendente' && a.data && _dentro(a.data, -365))
      .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.hora || '').localeCompare(b.hora || ''));
  }

  function _followups() {
    return DB.getAll('leads')
      .filter(l => !['fechado_ganho', 'executado', 'fechado_perdido'].includes(l.status))
      .filter(l => l.dataProximaAcao && _dentro(l.dataProximaAcao, -365))
      .sort((a, b) => (a.dataProximaAcao || '').localeCompare(b.dataProximaAcao || ''));
  }

  function _parcelas() {
    const out = [];
    DB.getAll('recebiveis').forEach(r => {
      (r.parcelas || []).forEach(p => {
        if (!Utils.parcelaAberta(p)) return;
        if (!_dentro(p.vencimento, -365)) return;
        out.push({ ...p, _recebivelId: r.id, _clienteId: r.clienteId });
      });
    });
    /* Serviço cujo recebimento foi registrado só por dentro não tem parcela em
       Contas a Receber, então sumia da cobrança. Entra aqui com o id do
       serviço, que é o lugar onde ele pode ser baixado. */
    if (typeof FinNucleo !== 'undefined') {
      FinNucleo.aCobrarSemRecebivel().forEach(pc => {
        if (!_dentro(pc.vencimento, -365)) return;
        out.push({
          valor: pc.valor, vencimento: pc.vencimento, descricao: pc.titulo,
          _clienteId: pc.clienteId, _projetoId: pc.projetoId,
        });
      });
    }
    return out.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
  }

  function _contas() {
    return DB.getAll('contaspagar')
      .filter(c => c.status === 'pendente' && c.vencimento && _dentro(c.vencimento, -365))
      .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
  }

  function _licitacoes() {
    const horizonte = Math.max(_horizonte, 3);   // licitação sempre avisa com 3 dias
    return DB.getAll('licitacoes')
      .filter(l => !Utils.licEncerrada(l.status) && l.dataAbertura)
      .filter(l => { const d = _dias(l.dataAbertura); return d !== null && d >= 0 && d <= horizonte; })
      .sort((a, b) => (a.dataAbertura || '').localeCompare(b.dataAbertura || ''));
  }

  function _inspecoes() {
    if (typeof Equipamentos === 'undefined' || !Equipamentos.getVencendo) return [];
    const horizonte = Math.max(_horizonte, 30);  // inspeção avisa com 30 dias
    return Equipamentos.getVencendo(horizonte);
  }

  /* Documento com validade estourando. Horizonte mínimo de 30 dias porque
     renovar ART ou certificado não se resolve no mesmo dia.

     Vale para qualquer anexo com data preenchida, não só para os tipos com
     prazo típico: se a pessoa se deu ao trabalho de informar a validade, é
     porque quer ser avisada. Filtrar por tipo faria uma foto datada avisar
     no sino e não avisar aqui. */
  function _documentos() {
    if (typeof Anexos === 'undefined' || !Anexos.vencendo) return [];
    return Anexos.vencendo(Math.max(_horizonte, 30));
  }

  /* Projeto em execução com prazo vencido ou vencendo. Antes só aparecia se
     a pessoa abrisse a aba Projetos; agora o atraso procura você. */
  function _projetos() {
    return DB.getAll('projetos')
      .filter(p => !['concluido', 'cancelado'].includes(p.status) && p.prazo)
      .filter(p => _dentro(p.prazo, -365))
      .sort((a, b) => (a.prazo || '').localeCompare(b.prazo || ''));
  }

  /* Ação do plano de negócios com prazo estourando. Eram 20 ações pendentes
     paradas desde agosto: estratégia que não aparece no dia a dia não é
     executada, vira documento. Só entram as críticas e as de prazo vencido,
     para não transformar a tela Hoje em lista de plano. */
  function _acoesPlano() {
    return DB.getAll('plano_acoes')
      .filter(a => a.status !== 'concluida' && a.status !== 'cancelada' && a.prazo)
      .filter(a => {
        const d = Utils.daysUntil(a.prazo);
        if (d === null) return false;
        const critica = String(a.criticidade || '').toLowerCase().startsWith('alta');
        return d < 0 || (critica && d <= _horizonte);
      })
      .sort((a, b) => (a.prazo || '').localeCompare(b.prazo || ''));
  }

  /* Despesa pessoal vencendo. Entra na mesma tela de propósito: o pedido foi
     "não ficar abrindo vários locais", e só o dono usa o sistema. Fica em
     bloco separado e rotulado, porque misturar caixa pessoal com o resultado
     da empresa é outro assunto — isso aqui é lembrete, não contabilidade. */
  function _pessoais() {
    return DB.getAll('pessoal_lancamentos')
      .filter(l => l.tipo === 'despesa' && l.status !== 'pago' && l.data && _dentro(l.data, -90))
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  }

  function _visitas() {
    return DB.getAll('visitas')
      .filter(v => v.data && _dentro(v.data, 0) && !['realizada', 'cancelada'].includes(v.status))
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  }

  /* ---------- render ---------- */
  function render() {
    const atividades = _atividades();
    const followups  = _followups();
    const parcelas   = _parcelas();
    const contas     = _contas();
    const licitacoes = _licitacoes();
    const inspecoes  = _inspecoes();
    const visitas    = _visitas();
    const documentos = _documentos();
    const projetos   = _projetos();
    const acoesPlano = _acoesPlano();
    const pessoais   = _pessoais();

    const atrasadas = atividades.filter(a => _dias(a.data) < 0).length;
    const deHoje    = atividades.filter(a => _dias(a.data) === 0).length;
    const aReceber  = Utils.sum(parcelas, 'valor');
    const aPagar    = Utils.sum(contas, 'valor');

    const total = atividades.length + followups.length + parcelas.length
      + contas.length + licitacoes.length + inspecoes.length + visitas.length
      + documentos.length + projetos.length + acoesPlano.length + pessoais.length;

    const agora = new Date();
    const hora = agora.getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const nome = (DB.getConfig()?.usuario?.nome || '').split(' ')[0];
    const dataLonga = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

    const blocos = [
      _bloco({
        id: 'atv', icone: '📋', cor: '#1D4F8C',
        titulo: _horizonte ? 'Atividades da semana' : 'Atividades de hoje e atrasadas',
        itens: atividades, linha: _linhaAtividade,
      }),
      _bloco({
        id: 'fup', icone: '💼', cor: '#8b5cf6',
        titulo: 'Follow-up de lead',
        itens: followups, linha: _linhaFollowup,
      }),
      _bloco({
        id: 'prj', icone: '🏗', cor: '#0891b2',
        titulo: 'Projetos com prazo estourando',
        itens: projetos, linha: _linhaProjeto,
      }),
      _bloco({
        id: 'vis', icone: '🏭', cor: '#f97316',
        titulo: 'Visitas técnicas',
        itens: visitas, linha: _linhaVisita,
      }),
      _bloco({
        id: 'lic', icone: '🏛', cor: '#0891b2',
        titulo: 'Licitações abrindo',
        itens: licitacoes, linha: _linhaLicitacao,
      }),
      _bloco({
        id: 'rec', icone: '💰', cor: '#10b981',
        titulo: 'Parcelas a receber',
        itens: parcelas, linha: _linhaParcela,
      }),
      _bloco({
        id: 'cp', icone: '💸', cor: '#C42B2B',
        titulo: 'Contas a pagar',
        itens: contas, linha: _linhaConta,
      }),
      _bloco({
        id: 'ins', icone: '⚙️', cor: '#8B2222',
        titulo: 'Inspeções vencendo',
        itens: inspecoes, linha: _linhaInspecao,
      }),
      _bloco({
        id: 'pess', icone: '💳', cor: '#64748b',
        titulo: 'Pessoal — contas do mês',
        itens: pessoais, linha: _linhaPessoal,
      }),
      _bloco({
        id: 'plano', icone: '📘', cor: '#6366f1',
        titulo: 'Ações do plano de negócios',
        itens: acoesPlano, linha: _linhaAcaoPlano,
      }),
      _bloco({
        id: 'doc', icone: '📜', cor: '#f59e0b',
        titulo: 'Documentos vencendo',
        itens: documentos, linha: _linhaDocumento,
      }),
    ].filter(Boolean).join('');

    document.getElementById('pageContent').innerHTML = `
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <div style="font-size:19px;font-weight:700;color:var(--text)">${saudacao}${nome ? ', ' + Utils.escHtml(nome) : ''}</div>
          <div style="font-size:13px;color:var(--text-muted);text-transform:capitalize">${dataLonga}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <div style="display:flex;border:1.5px solid var(--border);border-radius:var(--radius);overflow:hidden">
            <button onclick="Hoje.setHorizonte(0)" style="padding:7px 14px;border:none;font-size:12.5px;font-weight:600;cursor:pointer;${_horizonte === 0 ? 'background:var(--primary);color:#fff' : 'background:var(--surface);color:var(--text-muted)'}">Hoje</button>
            <button onclick="Hoje.setHorizonte(7)" style="padding:7px 14px;border:none;border-left:1px solid var(--border);font-size:12.5px;font-weight:600;cursor:pointer;${_horizonte === 7 ? 'background:var(--primary);color:#fff' : 'background:var(--surface);color:var(--text-muted)'}">7 dias</button>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="App.quickCapture()" title="Captura rápida (Q)">⚡ Anotar</button>
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom:18px">
        <div class="kpi-card" style="--kpi-color:#C42B2B;cursor:pointer" onclick="Hoje.irPara('atv')">
          <div class="kpi-label">Atrasado</div>
          <div class="kpi-value">${atrasadas}</div>
          <div class="kpi-sub">${atrasadas ? 'precisa de decisão hoje' : 'nada em atraso'}</div>
          <div class="kpi-icon">⏰</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#1D4F8C;cursor:pointer" onclick="Hoje.irPara('atv')">
          <div class="kpi-label">${_horizonte ? 'Na semana' : 'Para hoje'}</div>
          <div class="kpi-value">${_horizonte ? atividades.length - atrasadas : deHoje}</div>
          <div class="kpi-sub">${followups.length} follow-up(s) de lead</div>
          <div class="kpi-icon">📋</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#10b981;cursor:pointer" onclick="Hoje.irPara('rec')">
          <div class="kpi-label">A receber</div>
          <div class="kpi-value" style="font-size:19px">${Utils.formatCurrency(aReceber)}</div>
          <div class="kpi-sub">${parcelas.length} parcela(s)</div>
          <div class="kpi-icon">💰</div>
        </div>
        <div class="kpi-card" style="--kpi-color:#f59e0b;cursor:pointer" onclick="Hoje.irPara('cp')">
          <div class="kpi-label">A pagar</div>
          <div class="kpi-value" style="font-size:19px">${Utils.formatCurrency(aPagar)}</div>
          <div class="kpi-sub">${contas.length} conta(s)</div>
          <div class="kpi-icon">💸</div>
        </div>
      </div>

      ${total === 0 ? `
        <div class="card"><div class="card-body">
          <div class="empty-state">
            <div class="empty-icon">✅</div>
            <div class="empty-title">Nada pendente ${_horizonte ? 'nos próximos 7 dias' : 'para hoje'}</div>
            <div class="empty-sub">Sem atividade vencida, follow-up, parcela ou licitação exigindo ação. Use ⚡ Anotar para registrar algo novo.</div>
          </div>
        </div></div>` : blocos}
    `;
  }

  /* Bloco genérico: só aparece quando tem item. */
  function _bloco({ id, icone, titulo, cor, itens, linha }) {
    if (!itens.length) return '';
    const aberto = _expandido[id];
    const visiveis = aberto ? itens : itens.slice(0, LIMITE);
    const resto = itens.length - visiveis.length;
    return `
      <div class="card" id="bloco-${id}" style="margin-bottom:14px">
        <div class="card-header" style="border-left:3px solid ${cor}">
          <div class="card-title">${icone} ${titulo}
            <span class="badge badge-gray" style="margin-left:4px">${itens.length}</span>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          ${visiveis.map(linha).join('')}
          ${resto > 0 ? `<div style="padding:10px 16px;text-align:center;border-top:1px solid var(--border)">
            <button class="btn btn-xs btn-secondary" onclick="Hoje.expandir('${id}')">Ver os outros ${resto}</button>
          </div>` : ''}
        </div>
      </div>`;
  }

  /* Linha padrão: texto à esquerda, ações à direita, empilha no celular. */
  function _linha(titulo, sub, acoes) {
    return `
      <div class="hoje-row">
        <div class="hoje-row-txt">
          <div class="hoje-row-title">${titulo}</div>
          ${sub ? `<div class="hoje-row-sub">${sub}</div>` : ''}
        </div>
        <div class="hoje-row-acts">${acoes}</div>
      </div>`;
  }

  function _linhaAtividade(a) {
    const tipo = Utils.ATIV_TIPO[a.tipo] || { icon: '✅', label: a.tipo || '' };
    const cli = a.clienteId ? Utils.getClientName(a.clienteId) : '';
    const sub = [
      tipo.icon + ' ' + tipo.label,
      a.hora ? '🕑 ' + a.hora : '',
      cli && cli !== '—' ? '🏢 ' + Utils.escHtml(cli) : '',
      a.responsavel ? '👤 ' + Utils.escHtml(a.responsavel) : '',
    ].filter(Boolean).join(' · ');
    return _linha(
      `${a.prioridade === 'alta' ? '🔴 ' : ''}${Utils.escHtml(a.titulo || '(sem título)')} ${_prazoLabel(a.data, 'atrasada')}`,
      sub,
      `<button class="btn btn-xs btn-success" onclick="Hoje.concluir('${a.id}')" title="Marcar como concluída">✓ Feito</button>
       <button class="btn btn-xs btn-secondary" onclick="Hoje.adiar('${a.id}',0)" title="Jogar para hoje">Hoje</button>
       <button class="btn btn-xs btn-secondary" onclick="Hoje.adiar('${a.id}',1)" title="Jogar para amanhã">+1d</button>
       <button class="btn btn-xs btn-secondary" onclick="Hoje.adiar('${a.id}',7)" title="Jogar para a semana que vem">+7d</button>
       <button class="btn btn-xs btn-secondary" onclick="Hoje.abrirAtividade('${a.id}')" title="Abrir a atividade">✏</button>`
    );
  }

  function _linhaFollowup(l) {
    const cli = Utils.getClientName(l.clienteId);
    const etapa = Utils.LEAD_STATUS[l.status] || { label: l.status };
    const fone = _telefoneLead(l);
    const sub = [
      etapa.label,
      cli && cli !== '—' ? '🏢 ' + Utils.escHtml(cli) : '',
      l.valorEstimado ? '💵 ' + Utils.formatCurrency(l.valorEstimado) : '',
      l.proximaAcao ? '➜ ' + Utils.escHtml(l.proximaAcao) : '',
    ].filter(Boolean).join(' · ');
    return _linha(
      `${Utils.escHtml(l.titulo || '(sem título)')} ${_prazoLabel(l.dataProximaAcao, 'atrasado')}`,
      sub,
      `${fone ? `<button class="btn btn-xs btn-success" style="background:#25D366;border-color:#25D366" onclick="Utils.openWhatsApp('${Utils.escJs(fone)}')" title="WhatsApp">💬</button>
         <a class="btn btn-xs btn-secondary" href="tel:${Utils.escHtml(String(fone).replace(/\D/g, ''))}" title="Ligar">📞</a>` : ''}
       ${l.status === 'proposta_elaboracao' && typeof Propostas !== 'undefined'
         ? `<button class="btn btn-xs btn-secondary" onclick="Propostas.propostaRapida('${l.id}')" title="Gerar a proposta deste lead" style="background:#7c3aed;color:#fff;border-color:#7c3aed">⚡ Proposta</button>` : ''}
       <button class="btn btn-xs btn-primary" onclick="Hoje.registrarContato('${l.id}')" title="Registrar o que foi conversado e marcar o próximo passo">Registrar</button>
       <button class="btn btn-xs btn-secondary" onclick="Hoje.adiarLead('${l.id}',3)" title="Reagendar para 3 dias">+3d</button>
       <button class="btn btn-xs btn-secondary" onclick="Hoje.abrirLead('${l.id}')" title="Abrir o lead">Abrir</button>`
    );
  }

  function _linhaVisita(v) {
    const cli = Utils.getClientName(v.clienteId);
    const sub = [
      v.hora ? '🕑 ' + v.hora : '',
      cli && cli !== '—' ? '🏢 ' + Utils.escHtml(cli) : '',
      v.cidade ? '📍 ' + Utils.escHtml(v.cidade) : '',
      v.responsavel ? '👤 ' + Utils.escHtml(v.responsavel) : '',
    ].filter(Boolean).join(' · ');
    return _linha(
      `${Utils.escHtml(v.objetivo || v.titulo || 'Visita')} ${_prazoLabel(v.data, 'atrasada')}`,
      sub,
      `<button class="btn btn-xs btn-secondary" onclick="App.navigate('visitas')" title="Abrir visitas técnicas">Abrir</button>`
    );
  }

  function _linhaLicitacao(l) {
    const sub = [
      l.numero ? 'Nº ' + Utils.escHtml(l.numero) : '',
      l.orgao ? '🏛 ' + Utils.escHtml(Utils.truncate(l.orgao, 48)) : '',
      l.valorEstimado ? '💵 ' + Utils.formatCurrency(l.valorEstimado) : '',
    ].filter(Boolean).join(' · ');
    return _linha(
      `${Utils.escHtml(Utils.truncate(l.objeto || l.titulo || 'Licitação', 70))} ${_prazoLabel(l.dataAbertura, '', 'abre em')}`,
      sub,
      `<button class="btn btn-xs btn-secondary" onclick="Hoje.abrirLicitacao('${l.id}')" title="Abrir a licitação">Abrir</button>`
    );
  }

  function _linhaParcela(p) {
    const cli = Utils.getClientName(p._clienteId);
    return _linha(
      `${Utils.formatCurrency(p.valor)} ${_prazoLabel(p.vencimento, 'vencida', 'vence em')}`,
      [cli && cli !== '—' ? '🏢 ' + Utils.escHtml(cli) : '', p.descricao ? Utils.escHtml(p.descricao) : ''].filter(Boolean).join(' · '),
      p._projetoId
        ? `<button class="btn btn-xs btn-secondary" onclick="App.navigate('projetos');setTimeout(()=>Projetos.view('${p._projetoId}','financeiro'),150)" title="Abrir o financeiro do serviço">Abrir</button>`
        : `<button class="btn btn-xs btn-secondary" onclick="App.navigate('financeiro')" title="Abrir financeiro">Abrir</button>`
    );
  }

  function _linhaConta(c) {
    return _linha(
      `${Utils.escHtml(c.fornecedor || c.descricao || 'Conta')} ${_prazoLabel(c.vencimento, 'vencida', 'vence em')}`,
      [Utils.formatCurrency(c.valor), c.categoria ? Utils.escHtml(c.categoria) : ''].filter(Boolean).join(' · '),
      `<button class="btn btn-xs btn-secondary" onclick="App.navigate('financeiro')" title="Abrir financeiro">Abrir</button>`
    );
  }

  function _linhaInspecao(e) {
    const cli = Utils.getClientName(e.clienteId);
    return _linha(
      `${Utils.escHtml(e.tag || e.nome || 'Equipamento')} ${_prazoLabel(e.proximaInspecao, 'vencida', 'vence em')}`,
      [e.norma ? '📐 ' + Utils.escHtml(e.norma) : '', cli && cli !== '—' ? '🏢 ' + Utils.escHtml(cli) : ''].filter(Boolean).join(' · '),
      `<button class="btn btn-xs btn-secondary" onclick="App.navigate('equipamentos')" title="Abrir equipamentos">Abrir</button>`
    );
  }

  function _linhaProjeto(p) {
    const cli = Utils.getClientName(p.clienteId);
    const etapas = p.etapas || [];
    const pct = etapas.length ? Math.round(etapas.reduce((s, e) => s + (e.pct || 0), 0) / etapas.length) : null;
    const emAberto = DB.getAll('atividades').filter(a => a.projetoId === p.id && a.status === 'pendente').length;
    const sub = [
      p.ordemServico ? Utils.escHtml(p.ordemServico) : '',
      cli && cli !== '—' ? '🏢 ' + Utils.escHtml(cli) : '',
      pct !== null ? '📊 ' + pct + '% concluído' : '',
      emAberto ? '✅ ' + emAberto + ' atividade(s) em aberto' : '',
    ].filter(Boolean).join(' · ');
    return _linha(
      `${Utils.escHtml(p.titulo || 'Projeto')} ${_prazoLabel(p.prazo, 'atrasado', 'prazo em')}`,
      sub,
      `<button class="btn btn-xs btn-secondary" onclick="Projetos.view('${p.id}')" title="Abrir o projeto">Abrir</button>
       <button class="btn btn-xs btn-secondary" onclick="Projetos.view('${p.id}','tarefas')" title="Ver as atividades do projeto">Atividades</button>`
    );
  }

  function _linhaPessoal(l) {
    return _linha(
      `${Utils.escHtml(l.descricao || 'Despesa pessoal')} ${_prazoLabel(l.data, 'vencida', 'vence em')}`,
      [Utils.formatCurrency(l.valor), l.categoria ? Utils.escHtml(l.categoria) : '']
        .filter(Boolean).join(' · '),
      `<button class="btn btn-xs btn-secondary" onclick="App.navigate('pessoal')" title="Abrir Meu espaço">Abrir</button>`
    );
  }

  function _linhaAcaoPlano(a) {
    const critica = String(a.criticidade || '').toLowerCase().startsWith('alta');
    const sub = [
      a.area ? '📂 ' + Utils.escHtml(a.area) : '',
      a.fase ? Utils.escHtml(a.fase) : '',
      critica ? '<span style="color:var(--danger);font-weight:700">crítica</span>' : '',
      a.resultado ? '➜ ' + Utils.escHtml(Utils.truncate(a.resultado, 45)) : '',
    ].filter(Boolean).join(' · ');
    return _linha(
      `${Utils.escHtml(Utils.truncate(a.acao || 'Ação', 70))} ${_prazoLabel(a.prazo, 'atrasada')}`,
      sub,
      `<button class="btn btn-xs btn-secondary" onclick="App.navigate('plano')" title="Abrir o plano de negócios">Abrir plano</button>`
    );
  }

  function _linhaDocumento(a) {
    const t = Anexos.tipoDe(a.tipo);
    return _linha(
      `${Utils.escHtml(a.nome || 'arquivo')} ${_prazoLabel(a.validade, 'vencido', 'vence em')}`,
      [`<span style="color:${t.cor};font-weight:600">${Utils.escHtml(t.label)}</span>`,
       Utils.escHtml(Anexos.ondeEsta(a))].filter(Boolean).join(' · '),
      `<button class="btn btn-xs btn-secondary" onclick="Anexos.ver('${a.id}')" title="Abrir o arquivo">Ver</button>`
    );
  }

  /* ---------- ações ---------- */

  /* Redesenha a tela que está aberta, não necessariamente a Hoje: estas ações
     também são chamadas da vista Foco do funil. App.refreshIfNeeded redesenha
     a página corrente quando ela depende da entidade alterada (e 'hoje',
     'dashboard' e 'relatorios' dependem de todas). */
  function _atualizar(entidade) {
    if (typeof App === 'undefined') { render(); return; }
    App.updateNotifBadge();
    App.refreshIfNeeded(entidade);
  }

  function setHorizonte(d) { _horizonte = Number(d) || 0; _expandido = {}; render(); }
  function expandir(id) { _expandido[id] = true; render(); }

  function irPara(id) {
    const el = document.getElementById('bloco-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function concluir(id) {
    const a = DB.get('atividades', id);
    if (!a) return;
    DB.update('atividades', id, { status: 'concluida', concluidaEm: Utils.todayStr() });
    Toast.success('Concluída: ' + Utils.truncate(a.titulo || '', 40));
    _atualizar('atividades');
  }

  function adiar(id, dias) {
    const a = DB.get('atividades', id);
    if (!a) return;
    const nova = _dataMais(dias);
    DB.update('atividades', id, { data: nova });
    Toast.success('Reagendada para ' + Utils.formatDate(nova));
    _atualizar('atividades');
  }

  function adiarLead(id, dias) {
    const l = DB.get('leads', id);
    if (!l) return;
    const nova = _dataMais(dias);
    DB.update('leads', id, { dataProximaAcao: nova, proximaAcao: l.proximaAcao || 'Retomar contato' });
    Toast.success('Follow-up reagendado para ' + Utils.formatDate(nova));
    _atualizar('leads');
  }

  function abrirAtividade(id) {
    if (typeof Atividades === 'undefined') return;
    Atividades.openForm(id);
  }

  function abrirLead(id) {
    if (typeof Pipeline === 'undefined') return;
    Pipeline.viewLead(id);
  }

  function abrirLicitacao(id) {
    if (typeof Licitacoes === 'undefined' || !Licitacoes.view) { App.navigate('licitacoes'); return; }
    Licitacoes.view(id);
  }

  /* Registrar contato sem sair da tela: grava a nota no histórico e já
     define o próximo passo. Nada é sobrescrito — a nota é um registro
     novo em atividades. */
  function registrarContato(leadId) {
    const l = DB.get('leads', leadId);
    if (!l) return;
    Modal.open({
      title: '📞 Registrar contato',
      body: `
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
          ${Utils.escHtml(l.titulo || '')}${l.clienteId ? ' · ' + Utils.escHtml(Utils.getClientName(l.clienteId)) : ''}
        </div>
        <div class="form-group">
          <label class="form-label">O que foi conversado</label>
          <textarea class="form-control" id="hjNota" rows="3" placeholder="Ex: falei com o Rodrigo, pediu para reenviar a proposta com prazo de 30 dias" autofocus></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Próximo passo</label>
          <input class="form-control" id="hjProx" value="${Utils.escHtml(l.proximaAcao || '')}" placeholder="Ex: reenviar proposta revisada">
        </div>
        <div class="form-group">
          <label class="form-label">Voltar a falar em</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="hjPrazo">
            ${[1, 3, 7, 15, 30].map((d, i) => `
              <button type="button" class="btn btn-sm ${i === 1 ? 'btn-primary' : 'btn-secondary'}" data-dias="${d}"
                onclick="document.querySelectorAll('#hjPrazo button').forEach(b=>{b.className='btn btn-sm btn-secondary'});this.className='btn btn-sm btn-primary'">${d}d</button>`).join('')}
          </div>
        </div>`,
      saveLabel: 'Salvar contato',
      saveCb: () => _salvarContato(leadId),
    });
  }

  function _salvarContato(leadId) {
    const l = DB.get('leads', leadId);
    if (!l) { Modal.close(); return; }
    const nota = document.getElementById('hjNota')?.value?.trim() || '';
    const prox = document.getElementById('hjProx')?.value?.trim() || '';
    const dias = Number(document.querySelector('#hjPrazo .btn-primary')?.dataset?.dias) || 3;
    const hoje = Utils.todayStr();

    if (nota) {
      DB.create('atividades', {
        titulo: 'Contato: ' + Utils.truncate(l.titulo || '', 50),
        tipo: 'ligacao',
        status: 'concluida',
        prioridade: 'baixa',
        data: hoje,
        clienteId: l.clienteId || '',
        leadId: l.id,
        descricao: nota,
        responsavel: l.responsavel || '',
      });
    }
    DB.update('leads', leadId, {
      dataProximaAcao: _dataMais(dias),
      proximaAcao: prox || 'Retomar contato',
      ultimoContato: hoje,
    });
    Modal.close();
    Toast.success('Contato registrado. Próximo passo em ' + dias + ' dia(s).');
    _atualizar('leads');
  }

  function addNew() { App.quickCapture(); }

  return {
    render, addNew,
    setHorizonte, expandir, irPara,
    concluir, adiar, adiarLead,
    abrirAtividade, abrirLead, abrirLicitacao,
    registrarContato, _salvarContato,
  };
})();
