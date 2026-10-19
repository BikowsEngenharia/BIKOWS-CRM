/* ==========================================
   ORÇAMENTO RÁPIDO — catálogo de serviços + montagem de proposta
   Problema que resolve: hoje cada proposta começa do zero (as 11 da base
   têm itens vazio e nenhum escopo salvo) e o gerador de PDF só tinha um
   escopo padrão de fabricação, que não serve para laudo nem inspeção.
   Aqui o orçamento vira: escolher cliente → clicar nos serviços → conferir
   o valor → gerar. Escopo, cronograma, prazo, pagamento e validade vêm
   prontos do catálogo.
   ========================================== */
const Orcamento = (() => {

  const UNIDADES = ['verba', 'máquina', 'equipamento', 'laudo', 'relatório', 'ponto', 'hora', 'dia', 'm²', 'mês'];

  /* Modelos Bikows — escopo e cronograma reais por tipo de serviço.
     Servem de ponto de partida do catálogo; o preço fica a cargo do usuário
     (o formulário mostra o histórico já cobrado para cada tipo). */
  const MODELOS = {
    'Adequação NR-12': {
      categoria: 'NR-12', unidade: 'máquina', prazoDias: 43,
      formaPagamento: '50% na assinatura + 50% na entrega do laudo',
      inclui: ['Mão de obra técnica especializada', 'Deslocamento e estadia da equipe', 'ART perante ao CREA', 'Documentação técnica completa'],
      escopo: [
        { titulo: 'Análise de Risco', itens: ['Levantamento das máquinas e equipamentos', 'Identificação de perigos e riscos', 'Avaliação de riscos conforme ABNT NBR ISO 12100', 'Documentação fotográfica'] },
        { titulo: 'Projeto de Adequação', itens: ['Projeto das proteções e dispositivos de segurança', 'Especificação dos componentes de segurança', 'Memorial descritivo e cálculos', 'Documentação técnica conforme NR-12'] },
        { titulo: 'Execução', itens: ['Fabricação e instalação dos sistemas de segurança', 'Configuração dos dispositivos eletroeletrônicos', 'Testes funcionais e de segurança'] },
        { titulo: 'Documentação Final', itens: ['Laudo técnico de conformidade NR-12', 'ART perante ao CREA', 'Programa de manutenção preventiva', 'Treinamento operacional'] },
      ],
      cronograma: [
        { num: '1', nome: 'Diagnóstico e Análise de Risco', descricao: 'Levantamento in loco e análise de risco', prazo: '5 dias' },
        { num: '2', nome: 'Projeto Técnico', descricao: 'Elaboração do projeto de adequação', prazo: '10 dias' },
        { num: '3', nome: 'Fabricação', descricao: 'Fabricação das proteções e dispositivos', prazo: '20 dias' },
        { num: '4', nome: 'Instalação', descricao: 'Instalação e configuração in loco', prazo: '5 dias' },
        { num: '5', nome: 'Laudo Final e ART', descricao: 'Emissão de laudo e ART CREA', prazo: '3 dias' },
      ],
    },
    'Inspeção NR-13': {
      categoria: 'NR-13', unidade: 'equipamento', prazoDias: 7,
      formaPagamento: '100% na entrega do relatório',
      inclui: ['Inspeção in loco', 'Relatório de inspeção periódica', 'Prontuário atualizado', 'ART perante ao CREA'],
      escopo: [
        { titulo: 'Inspeção de Segurança', itens: ['Inspeção visual externa e interna', 'Verificação de acessórios de segurança', 'Avaliação das condições operacionais', 'Análise de documentação histórica'] },
        { titulo: 'Testes e Ensaios', itens: ['Teste hidrostático conforme norma', 'Ensaios não destrutivos quando aplicável', 'Verificação dos instrumentos de controle'] },
        { titulo: 'Documentação', itens: ['Relatório de inspeção periódica', 'Prontuário do equipamento atualizado', 'ART de inspeção perante ao CREA', 'Laudo técnico com conclusões e recomendações'] },
      ],
      cronograma: [
        { num: '1', nome: 'Inspeção Visual', descricao: 'Inspeção externa e interna dos equipamentos', prazo: '1 dia' },
        { num: '2', nome: 'Testes e Ensaios', descricao: 'Teste hidrostático e ensaios', prazo: '1 dia' },
        { num: '3', nome: 'Relatório Técnico', descricao: 'Elaboração do relatório de inspeção', prazo: '3 dias' },
        { num: '4', nome: 'Emissão de ART', descricao: 'ART de inspeção perante ao CREA', prazo: '2 dias' },
      ],
    },
    'Laudo Técnico': {
      categoria: 'Laudo Técnico', unidade: 'laudo', prazoDias: 14,
      formaPagamento: '100% na entrega do laudo',
      inclui: ['Vistoria in loco', 'Laudo técnico assinado', 'ART perante ao CREA', 'Documentação fotográfica'],
      escopo: [
        { titulo: 'Vistoria Técnica', itens: ['Vistoria in loco do objeto de análise', 'Levantamento fotográfico e documental', 'Coleta de dados técnicos', 'Entrevista com responsáveis técnicos'] },
        { titulo: 'Análise Técnica', itens: ['Análise conforme normas técnicas aplicáveis', 'Avaliação de conformidade', 'Identificação de não conformidades', 'Levantamento de recomendações técnicas'] },
        { titulo: 'Elaboração do Laudo', itens: ['Redação do laudo técnico', 'Elaboração de pareceres e conclusões', 'Documentação fotográfica anexa', 'Revisão técnica final'] },
        { titulo: 'Emissão e Entrega', itens: ['Emissão do laudo técnico assinado', 'ART de responsabilidade técnica', 'Entrega física e digital', 'Suporte para esclarecimentos'] },
      ],
      cronograma: [
        { num: '1', nome: 'Vistoria Técnica', descricao: 'Vistoria in loco e levantamento de dados', prazo: '2 dias' },
        { num: '2', nome: 'Análise Técnica', descricao: 'Análise normativa e de conformidade', prazo: '5 dias' },
        { num: '3', nome: 'Elaboração do Laudo', descricao: 'Redação do laudo e pareceres técnicos', prazo: '5 dias' },
        { num: '4', nome: 'Emissão e ART', descricao: 'Emissão final e ART perante ao CREA', prazo: '2 dias' },
      ],
    },
    'Apreciação de Risco': {
      categoria: 'NR-12', unidade: 'máquina', prazoDias: 20,
      formaPagamento: '50% na assinatura + 50% na entrega',
      inclui: ['Levantamento in loco', 'Apreciação de risco por máquina', 'Plano de ação priorizado', 'ART perante ao CREA'],
      escopo: [
        { titulo: 'Levantamento em Campo', itens: ['Inventário das máquinas e equipamentos', 'Registro fotográfico de cada máquina', 'Identificação de perigos por zona e fase de vida', 'Entrevista com operadores e manutenção'] },
        { titulo: 'Apreciação de Risco', itens: ['Estimativa de risco conforme ABNT NBR ISO 12100', 'Definição da categoria de segurança (ISO 13849-1)', 'Identificação das não conformidades com a NR-12', 'Hierarquização dos riscos'] },
        { titulo: 'Plano de Ação', itens: ['Medidas de proteção recomendadas por máquina', 'Priorização por criticidade', 'Estimativa de prazo e investimento', 'Matriz de acompanhamento'] },
        { titulo: 'Documentação', itens: ['Relatório de apreciação de risco', 'Fichas individuais por máquina', 'ART de responsabilidade técnica', 'Apresentação dos resultados'] },
      ],
      cronograma: [
        { num: '1', nome: 'Levantamento em Campo', descricao: 'Vistoria e inventário das máquinas', prazo: '5 dias' },
        { num: '2', nome: 'Apreciação de Risco', descricao: 'Análise e estimativa de risco por máquina', prazo: '10 dias' },
        { num: '3', nome: 'Plano de Ação', descricao: 'Medidas de proteção e priorização', prazo: '3 dias' },
        { num: '4', nome: 'Entrega e ART', descricao: 'Relatório final, apresentação e ART', prazo: '2 dias' },
      ],
    },
    'Projeto Mecânico': {
      categoria: 'Projeto Estrutural', unidade: 'verba', prazoDias: 28,
      formaPagamento: '40% na assinatura + 60% na entrega dos desenhos',
      inclui: ['Modelagem 3D', 'Desenhos técnicos para fabricação', 'Memorial de cálculo', 'ART perante ao CREA'],
      escopo: [
        { titulo: 'Levantamento e Concepção', itens: ['Levantamento técnico in loco', 'Definição de requisitos e premissas de projeto', 'Estudo de concepção e alternativas', 'Análise de viabilidade técnica'] },
        { titulo: 'Projeto e Detalhamento', itens: ['Modelagem 3D e desenhos técnicos', 'Memorial de cálculo estrutural/mecânico', 'Especificação de materiais e componentes', 'Detalhamento para fabricação'] },
        { titulo: 'Revisão e Aprovação', itens: ['Revisão técnica interna', 'Ajustes conforme retorno do cliente', 'Emissão de desenhos finais', 'Aprovação para execução'] },
        { titulo: 'Documentação Final', itens: ['ART de responsabilidade técnica', 'Pasta técnica completa', 'Lista de materiais (BOM)', 'Suporte técnico durante execução'] },
      ],
      cronograma: [
        { num: '1', nome: 'Levantamento e Concepção', descricao: 'Levantamento técnico e estudo de concepção', prazo: '5 dias' },
        { num: '2', nome: 'Modelagem e Detalhamento', descricao: 'Modelagem 3D, cálculos e desenhos técnicos', prazo: '15 dias' },
        { num: '3', nome: 'Revisão e Ajustes', descricao: 'Revisão técnica e ajustes com o cliente', prazo: '5 dias' },
        { num: '4', nome: 'Emissão Final e ART', descricao: 'Desenhos finais e ART de responsabilidade técnica', prazo: '3 dias' },
      ],
    },
    'Automação Industrial': {
      categoria: 'Automação Industrial', unidade: 'verba', prazoDias: 55,
      formaPagamento: '30% na assinatura + 40% na fabricação + 30% no comissionamento',
      inclui: ['Projeto elétrico e de instrumentação', 'Programação de CLP e IHM', 'Painéis elétricos', 'Comissionamento e treinamento'],
      escopo: [
        { titulo: 'Levantamento e Diagnóstico', itens: ['Levantamento do processo produtivo atual', 'Identificação dos pontos de automação', 'Análise de viabilidade técnica', 'Especificação de instrumentos e atuadores'] },
        { titulo: 'Projeto de Automação', itens: ['Projeto elétrico e de instrumentação', 'Programação de CLP e IHM', 'Especificação de painéis elétricos', 'Memorial descritivo do sistema'] },
        { titulo: 'Implementação', itens: ['Fabricação e montagem de painéis', 'Instalação de instrumentos e atuadores', 'Programação e parametrização', 'Integração com sistemas existentes'] },
        { titulo: 'Comissionamento e Entrega', itens: ['Testes funcionais e comissionamento', 'Treinamento operacional', 'Documentação técnica final', 'ART de responsabilidade técnica'] },
      ],
      cronograma: [
        { num: '1', nome: 'Diagnóstico e Levantamento', descricao: 'Levantamento do processo e requisitos', prazo: '5 dias' },
        { num: '2', nome: 'Projeto de Automação', descricao: 'Projeto elétrico, instrumentação e programação', prazo: '15 dias' },
        { num: '3', nome: 'Fabricação de Painéis', descricao: 'Fabricação e montagem dos painéis elétricos', prazo: '20 dias' },
        { num: '4', nome: 'Instalação e Integração', descricao: 'Instalação in loco e integração com o processo', prazo: '10 dias' },
        { num: '5', nome: 'Comissionamento e Entrega', descricao: 'Testes finais, treinamento e documentação', prazo: '5 dias' },
      ],
    },
    'Desenvolvimento de Máquina': {
      categoria: 'Desenvolvimento de Máquinas (P&D)', unidade: 'verba', prazoDias: 60,
      formaPagamento: '30% na assinatura + 40% na fabricação + 30% na entrega',
      inclui: ['Projeto mecânico e elétrico', 'Fabricação completa', 'Comissionamento e treinamento', 'Garantia de 12 meses'],
      escopo: [
        { titulo: 'Concepção e Engenharia', itens: ['Levantamento de requisitos operacionais', 'Concepção do equipamento', 'Projeto mecânico e elétrico', 'Simulação e validação de conceito'] },
        { titulo: 'Fabricação', itens: ['Fabricação de estrutura e componentes', 'Usinagem de peças especiais', 'Montagem mecânica', 'Instalação elétrica e de automação'] },
        { titulo: 'Testes e Ajustes', itens: ['Testes funcionais em bancada', 'Ajustes de parametrização', 'Testes de segurança conforme NR-12', 'Validação de performance'] },
        { titulo: 'Entrega e Suporte', itens: ['Instalação e comissionamento in loco', 'Treinamento operacional', 'Manual de operação e manutenção', 'ART e garantia de 12 meses'] },
      ],
      cronograma: [
        { num: '1', nome: 'Concepção e Projeto', descricao: 'Levantamento de requisitos e projeto do equipamento', prazo: '15 dias' },
        { num: '2', nome: 'Fabricação', descricao: 'Fabricação de estrutura, usinagem e montagem', prazo: '30 dias' },
        { num: '3', nome: 'Testes e Ajustes', descricao: 'Testes funcionais e de segurança em bancada', prazo: '10 dias' },
        { num: '4', nome: 'Instalação e Comissionamento', descricao: 'Instalação in loco, treinamento e entrega', prazo: '5 dias' },
      ],
    },
  };

  /* ---- Estado do orçamento em montagem ---- */
  let _tab = 'novo';              // 'novo' | 'catalogo' | 'documento'
  let _itens = [];                // [{servicoId, nome, unidade, qtd, valorUnit, escopo, cronograma, inclui, prazoDias, formaPagamento}]
  let _clienteId = '';
  let _leadId = '';
  let _titulo = '';
  let _descontoPerc = 0;
  let _observacoes = '';
  let _buscaCatalogo = '';

  /* ---- Cálculos ---- */
  const _subtotal = () => _itens.reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.valorUnit) || 0), 0);
  const _desconto = () => Math.round(_subtotal() * (Number(_descontoPerc) || 0)) / 100;
  const _total = () => Math.round((_subtotal() - _desconto()) * 100) / 100;
  const _prazoTotal = () => _itens.reduce((max, i) => Math.max(max, Number(i.prazoDias) || 0), 0);

  /* Histórico de preço já cobrado por tipo de serviço, lido das propostas
     reais — serve de referência ao definir o preço no catálogo. */
  function _historico(categoria, nomeServico) {
    // "Adequação NR-12" → ["adequacao", "nr12"]; palavras curtas e genéricas saem
    const GENERICAS = ['para', 'com', 'dos', 'das', 'por', 'servico', 'servicos', 'tecnico', 'tecnica', 'projeto'];
    const semAcento = s => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const palavras = [...new Set(
      semAcento([categoria, nomeServico].filter(Boolean).join(' '))
        .split(/[^a-z0-9]+/)
        .map(p => p.replace(/^nr0*/, 'nr'))
        .filter(p => p.length >= 3 && !GENERICAS.includes(p))
    )];
    if (!palavras.length) return null;
    const valores = DB.getAll('propostas')
      .filter(p => {
        const alvo = semAcento((p.titulo || '') + ' ' + (p.descricao || '') + ' ' + (p.tipoServico || ''))
          .replace(/nr\s*-?\s*0*(\d+)/g, 'nr$1');
        return palavras.some(w => alvo.includes(w));
      })
      .map(p => Number(p.valor) || 0).filter(v => v > 0).sort((a, b) => a - b);
    if (!valores.length) return null;
    return {
      n: valores.length,
      min: valores[0],
      max: valores[valores.length - 1],
      mediana: valores[Math.floor(valores.length / 2)],
    };
  }

  /* ====================================================
     RENDER
     ==================================================== */
  function render() {
    const servicos = DB.getAll('catalogo_servicos').filter(s => s.ativo !== false);
    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Orçamento Rápido</h2>
        <div class="sec-actions">
          <button class="btn ${_tab === 'novo' ? 'btn-primary' : 'btn-secondary'}" onclick="Orcamento.setTab('novo')">⚡ Novo Orçamento</button>
          <button class="btn ${_tab === 'catalogo' ? 'btn-primary' : 'btn-secondary'}" onclick="Orcamento.setTab('catalogo')">📚 Catálogo (${servicos.length})</button>
          <button class="btn ${_tab === 'documento' ? 'btn-primary' : 'btn-secondary'}" onclick="Orcamento.setTab('documento')" title="Textos fixos, capa e modelo do documento da proposta">📐 Modelo do documento</button>
        </div>
      </div>
      <div id="orcConteudo">${_tab === 'catalogo' ? _renderCatalogo() : _tab === 'documento' ? _renderDocumento() : _renderNovo(servicos)}</div>
    `;
  }

  function setTab(t) { _tab = t; render(); }

  /* ---- Aba: montar orçamento ---- */
  function _renderNovo(servicos) {
    if (!servicos.length) {
      return `<div class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-title">O catálogo está vazio</div>
        <div class="empty-sub">O orçamento rápido monta a proposta a partir dos serviços do catálogo — com escopo, cronograma, prazo e forma de pagamento já prontos. Comece pelos modelos Bikows (NR-12, NR-13, laudo, apreciação de risco, projeto, automação) e ajuste os preços.</div>
        <button class="btn btn-primary mt-4" onclick="Orcamento.popularModelos()">✨ Criar os ${Object.keys(_todosModelos()).length} modelos Bikows</button>
      </div>`;
    }

    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const leadsAtivos = DB.getAll('leads').filter(l => !['fechado_ganho', 'executado', 'fechado_perdido'].includes(l.status));
    const termo = _buscaCatalogo.trim().toLowerCase();
    const visiveis = termo
      ? servicos.filter(s => ((s.nome || '') + ' ' + (s.categoria || '')).toLowerCase().includes(termo))
      : servicos;

    return `
      <div class="grid-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:start">

        <!-- ESQUERDA: catálogo clicável -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">1. Clique nos serviços</div>
            <input class="form-control" style="max-width:190px" placeholder="Filtrar serviço..." value="${Utils.escHtml(_buscaCatalogo)}" oninput="Orcamento.setBusca(this.value)">
          </div>
          <div class="card-body" style="display:grid;gap:8px;max-height:60vh;overflow-y:auto">
            ${visiveis.length === 0 ? '<div class="text-sm text-muted">Nenhum serviço com esse filtro.</div>' : visiveis.map(s => `
              <button class="btn btn-secondary" style="justify-content:space-between;text-align:left;padding:10px 12px;height:auto"
                      onclick="Orcamento.adicionar('${s.id}')" title="Adicionar ao orçamento">
                <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
                  <span class="font-bold" style="font-size:12.5px">${Utils.escHtml(s.nome || '')}</span>
                  <span class="text-xs text-muted">${Utils.escHtml(s.categoria || '')} · por ${Utils.escHtml(s.unidade || 'verba')}${s.prazoDias ? ' · ' + s.prazoDias + ' dias' : ''}</span>
                </span>
                <span class="font-bold text-primary" style="flex-shrink:0;white-space:nowrap">${s.precoBase ? Utils.formatCurrency(s.precoBase) : 'a definir'}</span>
              </button>`).join('')}
          </div>
        </div>

        <!-- DIREITA: orçamento -->
        <div class="card">
          <div class="card-header"><div class="card-title">2. Confira e gere</div>
            ${_itens.length ? `<button class="btn btn-xs btn-ghost" onclick="Orcamento.limpar()">Limpar</button>` : ''}
          </div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group" style="flex:2">
                <label class="form-label">Cliente *</label>
                <select class="form-control" onchange="Orcamento.setCliente(this.value)">
                  <option value="">— Selecionar —</option>
                  ${clientes.map(c => `<option value="${c.id}" ${_clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex:2">
                <label class="form-label">Vincular a um lead</label>
                <select class="form-control" onchange="Orcamento.setLead(this.value)">
                  <option value="">— Nenhum —</option>
                  ${leadsAtivos.map(l => `<option value="${l.id}" ${_leadId === l.id ? 'selected' : ''}>${Utils.escHtml(Utils.truncate(l.titulo || '', 42))}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Título da proposta</label>
              <input class="form-control" id="orcTitulo" value="${Utils.escHtml(_titulo)}" placeholder="${Utils.escHtml(_tituloSugerido())}" oninput="Orcamento.setTitulo(this.value)">
            </div>

            ${_itens.length === 0 ? `
              <div class="text-sm text-muted" style="padding:16px 0;text-align:center;border:1px dashed var(--border);border-radius:var(--radius)">
                Nenhum serviço adicionado. Clique nos serviços à esquerda.
              </div>` : `
              <div class="table-wrap">
                <table class="tbl">
                  <thead><tr><th>Serviço</th><th style="width:70px">Qtd</th><th style="width:120px">Unitário</th><th style="width:110px">Total</th><th style="width:40px"></th></tr></thead>
                  <tbody>
                    ${_itens.map((i, idx) => `<tr>
                      <td><div class="font-bold" style="font-size:12.5px">${Utils.escHtml(i.nome)}</div><div class="text-xs text-muted">por ${Utils.escHtml(i.unidade)}</div></td>
                      <td><input class="form-control" style="padding:5px 8px" type="number" min="1" step="1" value="${i.qtd}" onchange="Orcamento.setQtd(${idx}, this.value)"></td>
                      <td><input class="form-control" style="padding:5px 8px" type="text" inputmode="decimal" value="${Utils.moneyToInput(i.valorUnit)}" onchange="Orcamento.setValor(${idx}, this.value)"></td>
                      <td class="font-bold">${Utils.formatCurrency((Number(i.qtd) || 0) * (Number(i.valorUnit) || 0))}</td>
                      <td><button class="btn btn-xs btn-ghost" onclick="Orcamento.remover(${idx})" title="Remover">✕</button></td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>

              <div class="form-row mt-3">
                <div class="form-group">
                  <label class="form-label">Desconto (%)</label>
                  <input class="form-control" type="number" min="0" max="100" step="0.5" value="${_descontoPerc}" onchange="Orcamento.setDesconto(this.value)">
                </div>
                <div class="form-group" style="flex:2;justify-content:flex-end">
                  <div class="dre-row dre-total" style="margin:0">
                    <div class="dre-label">TOTAL</div>
                    <div class="dre-value">${Utils.formatCurrency(_total())}</div>
                  </div>
                  ${_descontoPerc > 0 ? `<div class="text-xs text-muted" style="text-align:right">Subtotal ${Utils.formatCurrency(_subtotal())} · desconto ${Utils.formatCurrency(_desconto())}</div>` : ''}
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Observações (opcional)</label>
                <textarea class="form-control" rows="2" placeholder="Condições específicas desta proposta..." oninput="Orcamento.setObs(this.value)">${Utils.escHtml(_observacoes)}</textarea>
              </div>

              <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:14px">
                <div class="text-xs text-muted">A proposta já sai com <strong>${_itens.reduce((s, i) => s + (i.escopo || []).length, 0)} seções de escopo</strong>, <strong>${_itens.reduce((s, i) => s + (i.cronograma || []).length, 0)} etapas de cronograma</strong>, prazo de <strong>${_prazoTotal()} dias</strong> e forma de pagamento preenchidos a partir do catálogo.</div>
              </div>

              <div class="flex gap-2" style="flex-wrap:wrap">
                <button class="btn btn-primary" onclick="Orcamento.gerar('documento')">📄 Gerar e abrir o documento</button>
                <button class="btn btn-secondary" onclick="Orcamento.gerar('formulario')" title="Abre o formulário completo para ajustar objetivo, escopo e cronograma antes de imprimir">✏️ Gerar e ajustar antes</button>
                <button class="btn btn-secondary" onclick="Orcamento.gerar(false)">💾 Só salvar a proposta</button>
              </div>`}
          </div>
        </div>
      </div>`;
  }

  function _tituloSugerido() {
    if (!_itens.length) return 'Ex.: Adequação NR-12 de linha de prensas';
    if (_itens.length === 1) return _itens[0].nome;
    const extras = _itens.length - 1;
    return `${_itens[0].nome} e mais ${extras} serviço${extras > 1 ? 's' : ''}`;
  }

  /* ---- Aba: catálogo ---- */
  function _renderCatalogo() {
    const servicos = DB.getAll('catalogo_servicos');
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Catálogo de serviços</div>
          <div class="flex gap-2" style="flex-wrap:wrap">
            ${servicos.length === 0 ? `<button class="btn btn-sm btn-secondary" onclick="Orcamento.popularModelos()">✨ Criar os ${Object.keys(_todosModelos()).length} modelos Bikows</button>` : ''}
            <button class="btn btn-sm btn-primary" onclick="Orcamento.openFormServico()">+ Novo Serviço</button>
          </div>
        </div>
        <div class="table-wrap">
          ${servicos.length === 0 ? `<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-title">Nenhum serviço no catálogo</div><div class="empty-sub">Cada serviço guarda preço, prazo, forma de pagamento, escopo e cronograma. É o que faz o orçamento sair pronto em vez de ser digitado do zero.</div><button class="btn btn-primary mt-4" onclick="Orcamento.popularModelos()">✨ Criar os ${Object.keys(_todosModelos()).length} modelos Bikows</button></div>` : `
          <table class="tbl">
            <thead><tr><th>Serviço</th><th>Categoria</th><th>Unidade</th><th>Preço base</th><th>Prazo</th><th>Escopo</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${servicos.map(s => `<tr${s.ativo === false ? ' style="opacity:.55"' : ''}>
                <td><div class="font-bold">${Utils.escHtml(s.nome || '')}</div><div class="text-xs text-muted">${Utils.escHtml(Utils.truncate(s.formaPagamento || '', 46))}</div></td>
                <td class="text-sm">${s.categoria ? `<span class="badge badge-blue">${Utils.escHtml(s.categoria)}</span>` : '—'}</td>
                <td class="text-sm">por ${Utils.escHtml(s.unidade || 'verba')}</td>
                <td class="text-sm font-bold">${s.precoBase ? Utils.formatCurrency(s.precoBase) : '<span class="text-muted">a definir</span>'}</td>
                <td class="text-sm">${s.prazoDias ? s.prazoDias + ' dias' : '—'}</td>
                <td class="text-sm">${(s.escopo || []).length} seção(ões) · ${(s.cronograma || []).length} etapa(s)</td>
                <td>${s.ativo === false ? Utils.badge('Inativo', 'badge-gray') : Utils.badge('Ativo', 'badge-green')}</td>
                <td><div class="tbl-actions">
                  <button class="btn btn-xs btn-secondary" onclick="Orcamento.openFormServico('${s.id}')" title="Editar">✏</button>
                  <button class="btn btn-xs btn-secondary" onclick="Orcamento.duplicarServico('${s.id}')" title="Duplicar">⧉</button>
                  <button class="btn btn-xs btn-danger" onclick="Orcamento.deleteServico('${s.id}')" title="Excluir">🗑</button>
                </div></td>
              </tr>`).join('')}
            </tbody>
          </table>`}
        </div>
      </div>`;
  }

  /* ====================================================
     AÇÕES DO ORÇAMENTO
     ==================================================== */
  function setBusca(v) {
    _buscaCatalogo = v;
    const el = document.getElementById('orcConteudo');
    if (el) {
      el.innerHTML = _renderNovo(DB.getAll('catalogo_servicos').filter(s => s.ativo !== false));
      const inp = el.querySelector('input[oninput*="setBusca"]');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }
  function setCliente(v) { _clienteId = v; _refresh(); }
  function setLead(v) {
    _leadId = v;
    const lead = v ? DB.get('leads', v) : null;
    if (lead) {
      if (lead.clienteId) _clienteId = lead.clienteId;
      if (!_titulo) _titulo = lead.titulo || '';
    }
    _refresh();
  }
  function setTitulo(v) { _titulo = v; }   // sem re-render: não tira o foco do campo
  function setObs(v) { _observacoes = v; }
  function setDesconto(v) { _descontoPerc = Math.min(100, Math.max(0, Number(v) || 0)); _refresh(); }
  function setQtd(idx, v) { if (_itens[idx]) { _itens[idx].qtd = Math.max(1, parseInt(v, 10) || 1); _refresh(); } }
  function setValor(idx, v) { if (_itens[idx]) { _itens[idx].valorUnit = Utils.parseMoney(v); _refresh(); } }
  function remover(idx) { _itens.splice(idx, 1); _refresh(); }
  function limpar() {
    _itens = []; _descontoPerc = 0; _observacoes = ''; _titulo = '';
    _refresh();
  }

  function _refresh() {
    const el = document.getElementById('orcConteudo');
    if (el) el.innerHTML = _renderNovo(DB.getAll('catalogo_servicos').filter(s => s.ativo !== false));
  }

  function adicionar(servicoId) {
    const s = DB.get('catalogo_servicos', servicoId);
    if (!s) return;
    const existente = _itens.find(i => i.servicoId === servicoId);
    if (existente) { existente.qtd = (Number(existente.qtd) || 1) + 1; }
    else {
      _itens.push({
        servicoId: s.id, nome: s.nome, unidade: s.unidade || 'verba',
        qtd: 1, valorUnit: Number(s.precoBase) || 0,
        escopo: s.escopo || [], cronograma: s.cronograma || [], inclui: s.inclui || [],
        prazoDias: Number(s.prazoDias) || 0, formaPagamento: s.formaPagamento || '',
      });
      if (!_titulo) _titulo = '';
    }
    _refresh();
    Toast.success(`${s.nome} adicionado`);
  }

  /* ---- Gerar a proposta ---- */
  function gerar(abrirPdf) {
    if (!_itens.length) { Toast.error('Adicione ao menos um serviço'); return; }
    if (!_clienteId) { Toast.error('Selecione o cliente'); return; }
    const semPreco = _itens.filter(i => !(Number(i.valorUnit) > 0));
    if (semPreco.length) { Toast.error(`Informe o valor de: ${semPreco.map(i => i.nome).join(', ')}`); return; }

    const titulo = (document.getElementById('orcTitulo')?.value || '').trim() || _tituloSugerido();
    const numero = Utils.proximoNumero(Utils.SERIE_PROPOSTA(), Utils.FONTES_CTR, 3);
    const hoje = Utils.todayStr();
    const validadeDias = 15;
    const dVal = Utils.parseDate(hoje); dVal.setDate(dVal.getDate() + validadeDias);

    // Escopo e cronograma consolidados de todos os serviços escolhidos
    const escopo = [];
    const cronograma = [];
    const inclui = [];
    _itens.forEach(i => {
      (i.escopo || []).forEach(sec => escopo.push({ titulo: sec.titulo, itens: [...(sec.itens || [])] }));
      (i.cronograma || []).forEach(e => cronograma.push({ ...e }));
      (i.inclui || []).forEach(t => { if (!inclui.includes(t)) inclui.push(t); });
    });
    // Renumera as etapas do cronograma em sequência
    cronograma.forEach((e, idx) => { e.num = String(idx + 1); });

    const itensProposta = _itens.map(i => ({
      desc: `${i.nome}${(Number(i.qtd) || 1) > 1 ? ` (${i.qtd} ${i.unidade}${(Number(i.qtd) || 1) > 1 ? 's' : ''})` : ''}`,
      qtd: Number(i.qtd) || 1,
      unidade: i.unidade,
      valorUnit: Number(i.valorUnit) || 0,
      total: (Number(i.qtd) || 0) * (Number(i.valorUnit) || 0),
    }));

    const proposta = DB.create('propostas', {
      numero, titulo,
      clienteId: _clienteId,
      leadId: _leadId || null,
      valor: _total(),
      status: 'elaboracao',
      validade: Utils.localDateStr(dVal),
      prazoEntrega: _prazoTotal() ? `${_prazoTotal()} dias` : '',
      formaPagamento: _itens[0]?.formaPagamento || '',
      observacoes: _observacoes,
      responsavel: DB.getConfig().usuario?.nome || '',
      itens: itensProposta,
      escopoGerado: escopo,
      cronogramaGerado: cronograma,
      incluiNoValor: inclui,
      descontoPerc: _descontoPerc,
      origemOrcamento: true,
      versoes: [],
    });

    // Vincula ao lead e move a etapa, se houver
    if (_leadId) {
      const lead = DB.get('leads', _leadId);
      if (lead) {
        DB.update('leads', _leadId, {
          propostaId: proposta.id, propostaNum: numero,
          valorEstimado: Number(lead.valorEstimado) || _total(),
          status: ['lead_identificado', 'primeiro_contato', 'qualificacao'].includes(lead.status) ? 'proposta_elaboracao' : lead.status,
          dataMudancaStatus: hoje,
        });
      }
    }

    Toast.success(`Proposta ${numero} criada — ${Utils.formatCurrency(_total())}`);
    limpar();
    if (typeof App !== 'undefined') App.updateNotifBadge();

    if (abrirPdf === 'formulario' && typeof PropostaGenerator !== 'undefined') {
      setTimeout(() => PropostaGenerator.open(proposta.id), 300);
    } else if (abrirPdf && typeof PropostaDoc !== 'undefined') {
      setTimeout(() => PropostaDoc.abrir(proposta.id), 300);
    } else if (typeof App !== 'undefined') {
      App.navigate('propostas');
    }
  }

  /* ====================================================
     CATÁLOGO — CRUD
     ==================================================== */
  /* Converte os templates antigos de Propostas (TEMPLATES_SERVICOS) em itens
     de catálogo. Eles não têm cronograma; o escopo vem da lista de itens e as
     inclusões, do texto de observações. Os que já existem como modelo
     completo (NR-12 e Laudo Técnico) são ignorados. */
  function _modelosLegados() {
    const legados = (typeof Propostas !== 'undefined' && Propostas.TEMPLATES_SERVICOS) || {};
    const jaCobertos = ['nr-12', 'laudo técnico', 'laudo tecnico'];
    const out = {};
    Object.entries(legados).forEach(([key, t]) => {
      if (jaCobertos.includes(String(key).toLowerCase())) return;
      const inclui = String(t.observacoes || '')
        .replace(/^\s*Inclui:\s*/i, '')
        .split(/[.;]\s+|\n/).map(s => s.trim()).filter(s => s.length > 3);
      out[key] = {
        categoria: key,
        unidade: 'verba',
        prazoDias: parseInt(String(t.prazo || '').replace(/\D/g, ''), 10) || 0,
        formaPagamento: t.formaPagamento || '',
        inclui,
        escopo: [{ titulo: t.titulo || key, itens: (t.itens || []).map(i => i.desc).filter(Boolean) }],
        cronograma: [],
      };
    });
    return out;
  }

  function _todosModelos() { return { ...MODELOS, ..._modelosLegados() }; }

  function popularModelos() {
    const existentes = DB.getAll('catalogo_servicos').map(s => (s.nome || '').toLowerCase());
    const novos = Object.entries(_todosModelos()).filter(([nome]) => !existentes.includes(nome.toLowerCase()));
    if (!novos.length) { Toast.success('Os modelos Bikows já estão no catálogo.'); return; }
    Confirm.show(
      'Criar modelos Bikows',
      `${novos.length} serviço(s) serão criados com escopo e cronograma prontos: ${novos.map(([n]) => n).join(', ')}. O preço fica em branco para você definir — o formulário mostra quanto você já cobrou em propostas parecidas.`,
      () => {
        novos.forEach(([nome, m]) => DB.create('catalogo_servicos', {
          nome, categoria: m.categoria, unidade: m.unidade,
          precoBase: 0, prazoDias: m.prazoDias, formaPagamento: m.formaPagamento,
          escopo: m.escopo, cronograma: m.cronograma, inclui: m.inclui,
          ativo: true, origem: 'modelo_bikows',
        }));
        Toast.success(`${novos.length} serviço(s) criado(s). Defina os preços no catálogo.`);
        _tab = 'catalogo';
        render();
      }
    );
  }

  function openFormServico(id = null) {
    const s = id ? DB.get('catalogo_servicos', id) : null;
    const cfg = DB.getConfig();
    const categorias = cfg.servicos || [];
    const hist = s ? _historico(s.categoria, s.nome) : null;

    Modal.open({
      title: id ? `Editar: ${s?.nome || ''}` : 'Novo serviço do catálogo',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Nome do serviço *</label>
            <input class="form-control" id="csNome" value="${Utils.escHtml(s?.nome || '')}" placeholder="Ex.: Laudo NR-12 por máquina">
          </div>
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select class="form-control" id="csCategoria">
              <option value="">—</option>
              ${categorias.map(c => `<option value="${Utils.escHtml(c)}" ${s?.categoria === c ? 'selected' : ''}>${Utils.escHtml(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cobrado por</label>
            <select class="form-control" id="csUnidade">
              ${UNIDADES.map(u => `<option value="${u}" ${(s?.unidade || 'verba') === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Preço base (R$)</label>
            <input class="form-control" id="csPreco" type="text" inputmode="decimal" value="${s?.precoBase ? Utils.moneyToInput(s.precoBase) : ''}" placeholder="0,00">
            ${hist ? `<div class="form-hint">Já cobrado em ${hist.n} proposta(s): mín ${Utils.formatCurrency(hist.min)} · mediana <strong>${Utils.formatCurrency(hist.mediana)}</strong> · máx ${Utils.formatCurrency(hist.max)}</div>` : '<div class="form-hint">Sem histórico comparável nas propostas.</div>'}
          </div>
          <div class="form-group">
            <label class="form-label">Prazo (dias)</label>
            <input class="form-control" id="csPrazo" type="number" min="0" value="${s?.prazoDias || ''}" placeholder="0">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Forma de pagamento padrão</label>
          <input class="form-control" id="csPagamento" value="${Utils.escHtml(s?.formaPagamento || '')}" placeholder="Ex.: 50% na assinatura + 50% na entrega">
        </div>
        <div class="form-group">
          <label class="form-label">Incluso no valor (um por linha)</label>
          <textarea class="form-control" id="csInclui" rows="3" placeholder="Mão de obra técnica&#10;Deslocamento&#10;ART perante ao CREA">${Utils.escHtml((s?.inclui || []).join('\n'))}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Escopo — seções e itens</label>
          <div class="form-hint" style="margin-bottom:6px">Uma seção por bloco. Primeira linha = título da seção; linhas seguintes começando com "-" = itens. Separe seções com uma linha em branco.</div>
          <textarea class="form-control" id="csEscopo" rows="8" style="font-family:var(--font-mono);font-size:12px" placeholder="Vistoria Técnica&#10;- Vistoria in loco&#10;- Levantamento fotográfico&#10;&#10;Análise Técnica&#10;- Análise normativa">${Utils.escHtml(_escopoParaTexto(s?.escopo))}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Cronograma — uma etapa por linha</label>
          <div class="form-hint" style="margin-bottom:6px">Formato: <code>Nome da etapa | descrição | prazo</code></div>
          <textarea class="form-control" id="csCrono" rows="5" style="font-family:var(--font-mono);font-size:12px" placeholder="Vistoria Técnica | Vistoria in loco e levantamento | 2 dias&#10;Análise | Análise normativa | 5 dias">${Utils.escHtml(_cronoParaTexto(s?.cronograma))}</textarea>
        </div>
        <div class="form-group">
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
            <input type="checkbox" id="csAtivo" ${s?.ativo !== false ? 'checked' : ''}>
            <span class="form-label" style="margin:0">Ativo (aparece no orçamento rápido)</span>
          </label>
        </div>
      `,
      saveCb: () => salvarServico(id),
    });
  }

  /* ---- Texto ⇄ estrutura ---- */
  function _escopoParaTexto(escopo) {
    return (escopo || []).map(s => [s.titulo, ...(s.itens || []).map(i => '- ' + i)].join('\n')).join('\n\n');
  }
  function _textoParaEscopo(txt) {
    return String(txt || '').split(/\n\s*\n/).map(bloco => {
      const linhas = bloco.split('\n').map(l => l.trim()).filter(Boolean);
      if (!linhas.length) return null;
      return { titulo: linhas[0].replace(/^-\s*/, ''), itens: linhas.slice(1).map(l => l.replace(/^-\s*/, '')).filter(Boolean) };
    }).filter(Boolean);
  }
  function _cronoParaTexto(crono) {
    return (crono || []).map(e => [e.nome, e.descricao, e.prazo].filter(v => v != null).join(' | ')).join('\n');
  }
  function _textoParaCrono(txt) {
    return String(txt || '').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
      const p = l.split('|').map(x => x.trim());
      return { num: String(i + 1), nome: p[0] || '', descricao: p[1] || '', prazo: p[2] || '' };
    }).filter(e => e.nome);
  }

  function salvarServico(id) {
    const nome = document.getElementById('csNome').value.trim();
    if (!nome) { Toast.error('Informe o nome do serviço'); return; }
    const dup = DB.getAll('catalogo_servicos').find(s => s.id !== id && (s.nome || '').trim().toLowerCase() === nome.toLowerCase());
    if (dup) { Toast.error(`Já existe um serviço chamado "${nome}" no catálogo.`); return; }

    const data = {
      nome,
      categoria: document.getElementById('csCategoria').value,
      unidade: document.getElementById('csUnidade').value,
      precoBase: Utils.parseMoney(document.getElementById('csPreco').value) || 0,
      prazoDias: Number(document.getElementById('csPrazo').value) || 0,
      formaPagamento: document.getElementById('csPagamento').value.trim(),
      inclui: document.getElementById('csInclui').value.split('\n').map(s => s.trim()).filter(Boolean),
      escopo: _textoParaEscopo(document.getElementById('csEscopo').value),
      cronograma: _textoParaCrono(document.getElementById('csCrono').value),
      ativo: document.getElementById('csAtivo').checked,
    };
    if (id) { DB.update('catalogo_servicos', id, data); Toast.success('Serviço atualizado'); }
    else { DB.create('catalogo_servicos', data); Toast.success('Serviço criado'); }
    Modal.close();
    render();
  }

  function duplicarServico(id) {
    const s = DB.get('catalogo_servicos', id);
    if (!s) return;
    const copia = { ...s };
    delete copia.id; delete copia.createdAt; delete copia.updatedAt;
    let nome = `${s.nome} (cópia)`;
    let n = 2;
    const nomes = DB.getAll('catalogo_servicos').map(x => (x.nome || '').toLowerCase());
    while (nomes.includes(nome.toLowerCase())) { nome = `${s.nome} (cópia ${n++})`; }
    DB.create('catalogo_servicos', { ...copia, nome });
    Toast.success(`"${nome}" criado`);
    render();
  }

  function deleteServico(id) {
    const s = DB.get('catalogo_servicos', id);
    Utils.confirmDelete(s?.nome || 'este serviço', () => {
      DB.remove('catalogo_servicos', id);
      render();
    });
  }

  /* ====================================================
     ABA: MODELO DO DOCUMENTO
     Textos e blocos fixos que valem para toda proposta gerada.
     Ficam em config.documento; a proposta só carrega o que é dela.
     ==================================================== */
  function _renderDocumento() {
    const d = (DB.getConfig() || {}).documento || {};
    const padrao = (typeof PropostaDoc !== 'undefined' && PropostaDoc.PADROES) || { empresa: {}, engenheiro: {} };
    const emp = Object.assign({}, padrao.empresa, d.empresa || {});
    const eng = Object.assign({}, padrao.engenheiro, d.engenheiro || {});
    const bl = Object.assign({ apresentacao: true, diferenciais: true, aceite: true }, d.blocos || {});
    const linhas = a => (a || []).join('\n');
    const nums = (d.numeros || []).map(x => `${x.n} | ${x.l}`).join('\n');
    const difs = (d.diferenciais || []).map(x => `${x.titulo} | ${x.texto}`).join('\n');

    return `
      <div class="grid-2" style="align-items:start">

        <div class="card">
          <div class="card-header"><div class="card-title">📄 Documento gerado</div></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Modelo padrão</label>
                <select class="form-control" id="docModelo">
                  <option value="completa" ${(d.modelo || 'completa') === 'completa' ? 'selected' : ''}>Completa (capa + institucional + escopo)</option>
                  <option value="tecnica" ${d.modelo === 'tecnica' ? 'selected' : ''}>Técnica (capa + escopo, sem institucional)</option>
                  <option value="enxuta" ${d.modelo === 'enxuta' ? 'selected' : ''}>Enxuta (orçamento de 1 página)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Validade padrão (dias)</label>
                <input class="form-control" id="docValidade" type="number" min="1" max="180" value="${Number(d.validadeDias) || 15}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Foto de capa (endereço da imagem)</label>
              <input class="form-control" id="docCapa" value="${Utils.escHtml(d.capaFoto || '')}" placeholder="https://... (deixe em branco para capa gráfica)">
              <div class="form-hint">Foto própria de campo funciona melhor que banco de imagem. Sem foto, a capa usa o fundo marinho com malha isométrica.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Blocos opcionais</label>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="docBlApres" ${bl.apresentacao !== false ? 'checked' : ''}> Página institucional (quem executa, números, clientes)</label>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="docBlDif" ${bl.diferenciais !== false ? 'checked' : ''}> Página de diferenciais técnicos</label>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="docBlAceite" ${bl.aceite !== false ? 'checked' : ''}> Campo de aceite assinado pelo cliente</label>
            </div>
            <div class="flex gap-2" style="flex-wrap:wrap">
              <button class="btn btn-primary" onclick="Orcamento.salvarDocumento()">💾 Salvar modelo</button>
              <button class="btn btn-secondary" onclick="Orcamento.verModelo()">👁 Pré-visualizar modelo</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">🏢 Dados que aparecem no documento</div></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group" style="flex:2">
                <label class="form-label">Razão social</label>
                <input class="form-control" id="docRazao" value="${Utils.escHtml(emp.razao || '')}" placeholder="BIKOWS EMPREENDIMENTOS LTDA">
              </div>
              <div class="form-group">
                <label class="form-label">CNPJ</label>
                <input class="form-control" id="docCnpj" value="${Utils.escHtml(emp.cnpj || '')}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Endereço</label>
              <input class="form-control" id="docEndereco" value="${Utils.escHtml(emp.endereco || '')}">
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Cidade</label><input class="form-control" id="docCidade" value="${Utils.escHtml(emp.cidade || '')}"></div>
              <div class="form-group" style="max-width:80px"><label class="form-label">UF</label><input class="form-control" id="docUf" value="${Utils.escHtml(emp.uf || '')}"></div>
              <div class="form-group"><label class="form-label">CEP</label><input class="form-control" id="docCep" value="${Utils.escHtml(emp.cep || '')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Telefone</label><input class="form-control" id="docTel" value="${Utils.escHtml(emp.telefone || '')}"></div>
              <div class="form-group"><label class="form-label">E-mail</label><input class="form-control" id="docEmail" value="${Utils.escHtml(emp.email || '')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Site</label><input class="form-control" id="docSite" value="${Utils.escHtml(emp.site || '')}"></div>
              <div class="form-group"><label class="form-label">Registro CREA da empresa</label><input class="form-control" id="docCrea" value="${Utils.escHtml(emp.crea || '')}"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Frase de assinatura</label>
              <input class="form-control" id="docTagline" value="${Utils.escHtml(emp.tagline || '')}" placeholder="Soluções em Engenharia Industrial NR-12 e NR-13">
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">✍️ Responsável técnico</div></div>
          <div class="card-body">
            <div class="form-group"><label class="form-label">Nome</label><input class="form-control" id="docEngNome" value="${Utils.escHtml(eng.nome || '')}" placeholder="MARCOS DA SILVA ISRAEL"></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Título 1</label><input class="form-control" id="docEngT1" value="${Utils.escHtml(eng.titulo1 || '')}" placeholder="ENGENHEIRO MECÂNICO"></div>
              <div class="form-group"><label class="form-label">Título 2</label><input class="form-control" id="docEngT2" value="${Utils.escHtml(eng.titulo2 || '')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Título 3</label><input class="form-control" id="docEngT3" value="${Utils.escHtml(eng.titulo3 || '')}"></div>
              <div class="form-group"><label class="form-label">CREA</label><input class="form-control" id="docEngCrea" value="${Utils.escHtml(eng.crea || '')}" placeholder="CREA PR-206397/D"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Números da empresa (um por linha: valor | rótulo)</label>
              <textarea class="form-control" id="docNumeros" rows="4" placeholder="+1.000 | Máquinas adequadas à NR-12">${Utils.escHtml(nums)}</textarea>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">📝 Textos fixos da proposta</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Quem executa (página institucional)</label>
              <textarea class="form-control" id="docSobre" rows="4" placeholder="Deixe em branco para usar o texto padrão.">${Utils.escHtml(d.sobre || '')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Empresas atendidas (uma por linha)</label>
              <textarea class="form-control" id="docClientes" rows="3">${Utils.escHtml(linhas(d.clientesRef))}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Diferenciais (um por linha: título | texto)</label>
              <textarea class="form-control" id="docDif" rows="5" placeholder="Responsabilidade técnica formal | Todo serviço sai com ART registrada...">${Utils.escHtml(difs)}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">O valor contempla (um por linha)</label>
                <textarea class="form-control" id="docInclui" rows="4">${Utils.escHtml(linhas(d.incluiPadrao))}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Não contempla (um por linha)</label>
                <textarea class="form-control" id="docNaoInclui" rows="4">${Utils.escHtml(linhas(d.naoIncluso))}</textarea>
              </div>
            </div>
            <div class="form-hint">Estes textos entram em toda proposta gerada. O que é específico de um orçamento continua na aba "Novo Orçamento".</div>
          </div>
        </div>
      </div>`;
  }

  function salvarDocumento() {
    const val = id => (document.getElementById(id)?.value || '').trim();
    const lista = id => val(id).split('\n').map(s => s.trim()).filter(Boolean);
    const pares = (id, k1, k2) => lista(id).map(l => {
      const i = l.indexOf('|');
      return i < 0 ? { [k1]: l.trim(), [k2]: '' } : { [k1]: l.slice(0, i).trim(), [k2]: l.slice(i + 1).trim() };
    }).filter(x => x[k1]);

    const documento = {
      modelo: val('docModelo') || 'completa',
      validadeDias: parseInt(val('docValidade'), 10) || 15,
      capaFoto: val('docCapa'),
      blocos: {
        apresentacao: !!document.getElementById('docBlApres')?.checked,
        diferenciais: !!document.getElementById('docBlDif')?.checked,
        aceite: !!document.getElementById('docBlAceite')?.checked,
      },
      empresa: {
        razao: val('docRazao'), cnpj: val('docCnpj'), endereco: val('docEndereco'),
        cidade: val('docCidade'), uf: val('docUf'), cep: val('docCep'),
        telefone: val('docTel'), email: val('docEmail'), site: val('docSite'),
        crea: val('docCrea'), tagline: val('docTagline'),
      },
      engenheiro: {
        nome: val('docEngNome'), titulo1: val('docEngT1'), titulo2: val('docEngT2'),
        titulo3: val('docEngT3'), crea: val('docEngCrea'),
      },
      numeros: pares('docNumeros', 'n', 'l'),
      sobre: val('docSobre'),
      clientesRef: lista('docClientes'),
      diferenciais: pares('docDif', 'titulo', 'texto'),
      incluiPadrao: lista('docInclui'),
      naoIncluso: lista('docNaoInclui'),
    };
    DB.saveConfig({ documento });
    Toast.success('Modelo do documento salvo. Vale para as próximas propostas.');
  }

  function verModelo() {
    if (typeof PropostaDoc === 'undefined') { Toast.error('Documento indisponível'); return; }
    PropostaDoc.abrirModelo(document.getElementById('docModelo')?.value || '');
  }

  function addNew() {
    if (_tab === 'catalogo') openFormServico();
    else { _tab = 'catalogo'; render(); openFormServico(); }
  }

  return {
    render, setTab, addNew,
    adicionar, remover, limpar, gerar,
    setCliente, setLead, setTitulo, setObs, setDesconto, setQtd, setValor, setBusca,
    popularModelos, openFormServico, salvarServico, duplicarServico, deleteServico,
    salvarDocumento, verModelo,
    MODELOS,
  };
})();
