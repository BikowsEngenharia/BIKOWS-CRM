/* ==========================================
   PROPOSTA_GENERATOR.js
   Gerador de Proposta Comercial no estilo Bikows
   ========================================== */
const PropostaGenerator = (() => {

  // ---- Dados padrão do engenheiro ----
  const ENG_DEFAULT = {
    nome: 'MARCOS DA SILVA ISRAEL',
    titulo1: 'ENGENHEIRO MECÂNICO',
    titulo2: 'ENG. SEGURANÇA DO TRABALHO',
    titulo3: 'ENG. AUTOMAÇÃO INDUSTRIAL',
    crea: 'CREA PR-206397/D',
  };

  // ---- Itens padrão incluídos no valor ----
  const INCLUI_DEFAULT = [
    'Despesas com deslocamento e outros',
    'Matéria prima',
    'Garantia de 12 meses',
    'Emissão de Laudo Técnico de conformidade',
    'Emissão da ART perante ao CREA-PR',
    'Nota fiscal — Alíq. Serviços de Engenharia',
  ];

  // ---- Escopo padrão: seções e subitens ----
  const ESCOPO_DEFAULT = [
    {
      titulo: '1) LEVANTAMENTO E CONFERÊNCIA',
      itens: [
        'Conferência dimensional dos pontos críticos no local para compatibilidade entre projeto e fabricação.',
        'Registro técnico das medidas e ajustes necessários para fabricação.',
      ],
    },
    {
      titulo: '2) FABRICAÇÃO DAS ESTRUTURAS',
      itens: [
        'Fabricação completa conforme projeto aprovado.',
        'Execução de corte, furação, montagem, soldagem e acabamento.',
      ],
    },
    {
      titulo: '3) CONTROLE DE QUALIDADE',
      itens: [
        'Conferência dimensional dos subconjuntos.',
        'Revisão de soldas e pontos críticos.',
      ],
    },
    {
      titulo: '4) PREPARAÇÃO DE SUPERFÍCIE E PINTURA',
      itens: [
        'Preparação de superfície conforme processo definido.',
        'Aplicação de primer + demãos de acabamento conforme NBR 7195.',
      ],
    },
    {
      titulo: '5) MONTAGEM E INSTALAÇÃO',
      itens: [
        'Posicionamento, montagem e fixação conforme projeto.',
        'Alinhamento, prumo e nivelamento durante a instalação.',
      ],
    },
    {
      titulo: '6) VERIFICAÇÃO FINAL E ENTREGA TÉCNICA',
      itens: [
        'Inspeção final do conjunto instalado.',
        'Registro fotográfico e liberação técnica para uso.',
      ],
    },
  ];

  const CRONOGRAMA_DEFAULT = [
    { num: '1', nome: 'Levantamento técnico em campo', descricao: 'Validar interfaces críticas e liberar fabricação.', prazo: '3 dias' },
    { num: '2', nome: 'Fabricação e pintura industrial', descricao: 'Corte, furação, soldagem, acabamento e pintura dos conjuntos.', prazo: '30 dias' },
    { num: '3', nome: 'Logística e mobilização', descricao: 'Embalagem, transporte e preparo de campo.', prazo: '3 dias' },
    { num: '4', nome: 'Montagem e instalação em campo', descricao: 'Içamento, instalação, verificação final e liberação técnica.', prazo: '15 dias' },
  ];

  // ---- Abrir formulário completo ----
  function open(propostaId = null) {
    const proposta = propostaId ? DB.get('propostas', propostaId) : null;
    const cliente  = proposta ? DB.get('clientes', proposta.clienteId) : null;
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);

    const today = new Date().toISOString().split('T')[0];
    const nextNum = proposta?.numero ||
      'BIK-' + new Date().getFullYear() + '-CTR-' + String(DB.getAll('propostas').length + 1).padStart(3,'0');

    const clientOpts = clientes.map(c =>
      `<option value="${c.id}" ${proposta?.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`
    ).join('');

    Modal.open({
      title: '📄 Gerar Proposta Comercial',
      size: 'modal-lg',
      body: buildForm(nextNum, today, proposta, cliente, clientOpts),
      saveCb: () => generate(propostaId),
      saveLabel: '🖨 Gerar Proposta PDF',
    });

    // Preencher escopo e cronograma padrão se for nova proposta
    if (!propostaId) {
      setTimeout(() => {
        populateEscopoDefault();
        populateCronogramaDefault();
      }, 100);
    } else if (proposta?.escopoGerado) {
      setTimeout(() => {
        restoreEscopo(proposta.escopoGerado);
        restoreCronograma(proposta.cronogramaGerado);
      }, 100);
    } else {
      setTimeout(() => {
        populateEscopoDefault();
        populateCronogramaDefault();
      }, 100);
    }
  }

  function buildForm(nextNum, today, proposta, cliente, clientOpts) {
    return `
    <!-- TAB NAVIGATION -->
    <div class="tabs" style="margin-bottom:16px">
      <button class="tab-btn active" onclick="pgTab(this,'pgBasico')">1. Dados Gerais</button>
      <button class="tab-btn" onclick="pgTab(this,'pgCliente')">2. Cliente</button>
      <button class="tab-btn" onclick="pgTab(this,'pgEscopo')">3. Escopo</button>
      <button class="tab-btn" onclick="pgTab(this,'pgCronograma')">4. Cronograma</button>
      <button class="tab-btn" onclick="pgTab(this,'pgValor')">5. Valor</button>
      <button class="tab-btn" onclick="pgTab(this,'pgOpcoes')">6. Opções</button>
    </div>

    <!-- TAB 1: DADOS GERAIS -->
    <div id="pgBasico">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nº da Proposta *</label>
          <input class="form-control" id="gpNum" value="${Utils.escHtml(nextNum)}">
        </div>
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input class="form-control" id="gpData" type="date" value="${proposta?.validade ? '' : today}">
        </div>
        <div class="form-group">
          <label class="form-label">Validade (dias)</label>
          <input class="form-control" id="gpValidade" value="15" type="number">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Serviço Solicitado *</label>
        <input class="form-control" id="gpServico" value="${Utils.escHtml(proposta?.titulo||'')}" placeholder="Ex: Fabricação e montagem de escadas de acesso e guarda-corpos">
      </div>

      <div class="form-group">
        <label class="form-label">Texto de Introdução</label>
        <textarea class="form-control" id="gpIntro" rows="2" placeholder="Ex: Apresentamos a proposta técnica comercial referente à execução de serviços...">${Utils.escHtml(proposta?.descricao||'')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Objetivo <span class="text-xs text-muted">(use linha em branco para separar parágrafos)</span></label>
        <textarea class="form-control" id="gpObjetivo" rows="7" placeholder="Descreva o objetivo técnico da proposta..."></textarea>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
        <div class="form-label mb-2">Dados do Engenheiro Responsável</div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Nome</label>
            <input class="form-control" id="gpEngNome" value="${Utils.escHtml(ENG_DEFAULT.nome)}">
          </div>
          <div class="form-group">
            <label class="form-label">CREA</label>
            <input class="form-control" id="gpEngCrea" value="${Utils.escHtml(ENG_DEFAULT.crea)}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Título 1</label><input class="form-control" id="gpEngT1" value="${Utils.escHtml(ENG_DEFAULT.titulo1)}"></div>
          <div class="form-group"><label class="form-label">Título 2</label><input class="form-control" id="gpEngT2" value="${Utils.escHtml(ENG_DEFAULT.titulo2)}"></div>
          <div class="form-group"><label class="form-label">Título 3</label><input class="form-control" id="gpEngT3" value="${Utils.escHtml(ENG_DEFAULT.titulo3)}"></div>
        </div>
      </div>
    </div>

    <!-- TAB 2: CLIENTE -->
    <div id="pgCliente" class="hidden">
      <div class="form-group">
        <label class="form-label">Selecionar cliente do CRM</label>
        <select class="form-control" id="gpClienteSel" onchange="PropostaGenerator.preencherCliente(this.value)">
          <option value="">— Preencher manualmente —</option>
          ${clientOpts}
        </select>
        <div class="text-xs text-muted mt-1">Selecione para preencher os campos automaticamente, ou preencha manualmente.</div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label">Razão Social *</label>
          <input class="form-control" id="gpCliNome" value="${Utils.escHtml(cliente?.nome||'')}" placeholder="Nome da empresa cliente">
        </div>
        <div class="form-group">
          <label class="form-label">CNPJ</label>
          <input class="form-control" id="gpCliCnpj" value="${Utils.escHtml(cliente?.cnpj||'')}" placeholder="XX.XXX.XXX/XXXX-XX">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label">Departamento / Contato</label>
          <input class="form-control" id="gpCliDept" placeholder="Ex: GABRIELY MACHADO — SGI">
        </div>
        <div class="form-group">
          <label class="form-label">Unidade Dest.</label>
          <input class="form-control" id="gpCliUnidade" placeholder="Unidade destino">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Endereço</label>
        <input class="form-control" id="gpCliEnd" value="${Utils.escHtml(cliente?.endereco||'')}" placeholder="Rua, nº, bairro">
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label">Cidade</label>
          <input class="form-control" id="gpCliCidade" value="${Utils.escHtml(cliente?.cidade||'')}" placeholder="Cidade">
        </div>
        <div class="form-group">
          <label class="form-label">CEP</label>
          <input class="form-control" id="gpCliCep" placeholder="00.000-000">
        </div>
        <div class="form-group" style="max-width:80px">
          <label class="form-label">UF</label>
          <input class="form-control" id="gpCliUf" value="${Utils.escHtml(cliente?.estado||'')}" placeholder="PR">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input class="form-control" id="gpCliEmail" value="${Utils.escHtml(cliente?.email||'')}" placeholder="contato@empresa.com.br">
        </div>
        <div class="form-group">
          <label class="form-label">URL do Logo do Cliente (opcional)</label>
          <input class="form-control" id="gpCliLogo" placeholder="https://...logo.png">
        </div>
      </div>
    </div>

    <!-- TAB 3: ESCOPO TÉCNICO -->
    <div id="pgEscopo" class="hidden">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-bold">Seções do Escopo Técnico</span>
        <button class="btn btn-sm btn-secondary" type="button" onclick="PropostaGenerator.addEscopoSection()">+ Seção</button>
      </div>
      <div id="escopoContainer" style="display:flex;flex-direction:column;gap:12px"></div>
    </div>

    <!-- TAB 4: CRONOGRAMA -->
    <div id="pgCronograma" class="hidden">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-bold">Etapas do Cronograma</span>
        <button class="btn btn-sm btn-secondary" type="button" onclick="PropostaGenerator.addCronogramaRow()">+ Etapa</button>
      </div>
      <div id="cronogramaContainer" style="display:flex;flex-direction:column;gap:8px"></div>

      <div style="margin-top:16px">
        <label class="form-label">Fluxo Resumido (etapas separadas por |)</label>
        <input class="form-control" id="gpFluxoRes" value="1 - Planejamento|2 - Pré-montagem|3 - Execução in loco|4 - Entrega Final">
      </div>
      <div style="margin-top:10px">
        <label class="form-label">Observação do Cronograma</label>
        <input class="form-control" id="gpCronObs" value="*OBS: Cronograma elaborado para disponibilidade de execução em final de semana se necessário (sábado e/ou domingo).">
      </div>
    </div>

    <!-- TAB 5: VALOR -->
    <div id="pgValor" class="hidden">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor Total (R$) *</label>
          <input class="form-control" id="gpValor" type="number" value="${proposta?.valor||''}" placeholder="0" oninput="PropostaGenerator.atualizarExtenso()">
        </div>
        <div class="form-group" style="flex:2">
          <label class="form-label">Valor por Extenso</label>
          <input class="form-control" id="gpValorExt" placeholder="Ex: setenta e cinco mil reais">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Prazo de Entrega</label>
          <input class="form-control" id="gpPrazo" value="50 dias" placeholder="Ex: 50 dias">
        </div>
        <div class="form-group" style="flex:2">
          <label class="form-label">Forma de Pagamento</label>
          <textarea class="form-control" id="gpPagamento" rows="2">40% de entrada.
Restante faturado em 30 / 60 DDL.</textarea>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
        <div class="flex items-center justify-between mb-2">
          <div class="form-label">O que está incluído no valor:</div>
          <button class="btn btn-xs btn-secondary" onclick="PropostaGenerator.addIncluiItem()">+ Item</button>
        </div>
        <div id="incluiContainer">
          ${INCLUI_DEFAULT.map((it,i) => renderIncluiRow(it, i)).join('')}
        </div>
      </div>
    </div>

    <!-- TAB 6: OPÇÕES -->
    <div id="pgOpcoes" class="hidden">
      <div style="display:flex;flex-direction:column;gap:14px">
        <label style="display:flex;gap:10px;align-items:center;cursor:pointer">
          <input type="checkbox" id="gpInclDif" checked>
          <span><strong>Incluir página "Nossos Diferenciais"</strong><br><span class="text-xs text-muted">Seção com diferenciais da Bikows</span></span>
        </label>
        <label style="display:flex;gap:10px;align-items:center;cursor:pointer">
          <input type="checkbox" id="gpInclClientes" checked>
          <span><strong>Incluir página "Alguns dos Nossos Clientes"</strong><br><span class="text-xs text-muted">Mostra a grade de logos de clientes</span></span>
        </label>
      </div>

      <div style="margin-top:16px">
        <label class="form-label">Fotos da Capa (URLs, uma por linha, até 6 fotos)</label>
        <textarea class="form-control" id="gpFotos" rows="6" placeholder="Cole aqui as URLs das fotos para a capa (opcional).&#10;https://...&#10;https://..."></textarea>
        <div class="text-xs text-muted mt-1">Se não informar, serão exibidos ícones industriais nos espaços das fotos.</div>
      </div>

      <div style="margin-top:12px">
        <label class="form-label">Clientes de Referência (um por linha, para a página de clientes)</label>
        <textarea class="form-control" id="gpClientesRef" rows="6">Continental
Elecnor
AUMOVIO
Eneva
FCM — Fábrica de Mancais
MESSER Cutting Systems
emae
EBSERH
Icilegel
Jussara
Prosmaq
enerlab</textarea>
      </div>
    </div>
    `;
  }

  function renderIncluiRow(text, idx) {
    return `<div class="form-row incl-row" data-idx="${idx}" style="margin-bottom:6px;align-items:center">
      <input class="form-control incl-input" value="${Utils.escHtml(text)}" placeholder="Item incluído no valor">
      <button class="btn btn-xs btn-danger" type="button" onclick="this.closest('.incl-row').remove()" style="flex-shrink:0">✕</button>
    </div>`;
  }

  function renderEscopoSection(sec, idx) {
    const itensHtml = (sec.itens||[]).map((it,i) => renderEscopoItem(it, idx, i)).join('');
    return `<div class="escopo-sec" data-sec="${idx}" style="background:var(--bg);border-radius:var(--radius);padding:12px;border:1px solid var(--border)">
      <div class="form-row" style="margin-bottom:8px;align-items:center">
        <input class="form-control esc-titulo" value="${Utils.escHtml(sec.titulo||'')}" placeholder="Título da seção (ex: 1) LEVANTAMENTO DE CAMPO)" style="font-weight:700">
        <button class="btn btn-xs btn-danger" type="button" onclick="this.closest('.escopo-sec').remove()">✕ Seção</button>
      </div>
      <div class="esc-itens" style="display:flex;flex-direction:column;gap:6px">
        ${itensHtml}
      </div>
      <button class="btn btn-xs btn-secondary" type="button" style="margin-top:8px" onclick="PropostaGenerator.addEscopoItem(this)">+ Item</button>
    </div>`;
  }

  function renderEscopoItem(text, secIdx, itemIdx) {
    return `<div class="form-row esc-item" style="align-items:center">
      <span style="color:var(--primary);font-weight:700;margin-right:4px">•</span>
      <input class="form-control esc-item-input" value="${Utils.escHtml(text||'')}" placeholder="Item do escopo">
      <button class="btn btn-xs btn-danger" type="button" onclick="this.closest('.esc-item').remove()">✕</button>
    </div>`;
  }

  function renderCronogramaRow(etapa, idx) {
    return `<div class="form-row cron-row" data-idx="${idx}" style="align-items:flex-end">
      <div class="form-group" style="max-width:40px;margin:0">
        <label class="form-label">#</label>
        <input class="form-control cron-num" value="${Utils.escHtml(etapa.num||String(idx+1))}" style="text-align:center">
      </div>
      <div class="form-group" style="flex:1.2;margin:0">
        <label class="form-label">Nome da Etapa</label>
        <input class="form-control cron-nome" value="${Utils.escHtml(etapa.nome||'')}">
      </div>
      <div class="form-group" style="flex:2;margin:0">
        <label class="form-label">Descrição</label>
        <input class="form-control cron-desc" value="${Utils.escHtml(etapa.descricao||'')}">
      </div>
      <div class="form-group" style="max-width:80px;margin:0">
        <label class="form-label">Prazo</label>
        <input class="form-control cron-prazo" value="${Utils.escHtml(etapa.prazo||'')}">
      </div>
      <button class="btn btn-xs btn-danger" type="button" style="margin-bottom:1px" onclick="this.closest('.cron-row').remove()">✕</button>
    </div>`;
  }

  // ---- Tab switcher ----
  window.pgTab = function(btn, tabId) {
    btn.closest('.tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['pgBasico','pgCliente','pgEscopo','pgCronograma','pgValor','pgOpcoes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== tabId);
    });
  };

  // ---- Preenchimento automático do cliente ----
  function preencherCliente(clienteId) {
    if (!clienteId) return;
    const c = DB.get('clientes', clienteId);
    if (!c) return;
    document.getElementById('gpCliNome').value   = c.nome || '';
    document.getElementById('gpCliCnpj').value   = c.cnpj || '';
    document.getElementById('gpCliEmail').value  = c.email || '';
    document.getElementById('gpCliEnd').value    = c.endereco || '';
    document.getElementById('gpCliCidade').value = c.cidade || '';
    document.getElementById('gpCliUf').value     = c.estado || '';
    const contato = DB.getAll('contatos').find(ct => ct.clienteId === clienteId && ct.principal);
    if (contato) {
      document.getElementById('gpCliDept').value = contato.nome + (contato.cargo ? ' — ' + contato.cargo : '');
    }
  }

  // ---- Populate defaults ----
  function populateEscopoDefault() {
    const container = document.getElementById('escopoContainer');
    if (!container) return;
    container.innerHTML = ESCOPO_DEFAULT.map((s,i) => renderEscopoSection(s,i)).join('');
  }

  function populateCronogramaDefault() {
    const container = document.getElementById('cronogramaContainer');
    if (!container) return;
    container.innerHTML = CRONOGRAMA_DEFAULT.map((e,i) => renderCronogramaRow(e,i)).join('');
  }

  function restoreEscopo(sections) {
    const container = document.getElementById('escopoContainer');
    if (!container) return;
    container.innerHTML = (sections||[]).map((s,i) => renderEscopoSection(s,i)).join('');
  }

  function restoreCronograma(rows) {
    const container = document.getElementById('cronogramaContainer');
    if (!container) return;
    container.innerHTML = (rows||[]).map((e,i) => renderCronogramaRow(e,i)).join('');
  }

  // ---- Dynamic add functions ----
  function addEscopoSection() {
    const container = document.getElementById('escopoContainer');
    if (!container) return;
    const idx = container.querySelectorAll('.escopo-sec').length;
    const div = document.createElement('div');
    div.innerHTML = renderEscopoSection({ titulo: `${idx+1}) NOVA SEÇÃO`, itens: [''] }, idx);
    container.appendChild(div.firstElementChild);
  }

  function addEscopoItem(btn) {
    const sec = btn.closest('.escopo-sec');
    const itens = sec.querySelector('.esc-itens');
    const secIdx = sec.dataset.sec;
    const itemDiv = document.createElement('div');
    itemDiv.innerHTML = renderEscopoItem('', secIdx, itens.children.length);
    itens.appendChild(itemDiv.firstElementChild);
  }

  function addCronogramaRow() {
    const container = document.getElementById('cronogramaContainer');
    if (!container) return;
    const idx = container.querySelectorAll('.cron-row').length;
    const div = document.createElement('div');
    div.innerHTML = renderCronogramaRow({ num: String(idx+1), nome:'', descricao:'', prazo:'' }, idx);
    container.appendChild(div.firstElementChild);
  }

  function addIncluiItem() {
    const container = document.getElementById('incluiContainer');
    if (!container) return;
    const idx = container.querySelectorAll('.incl-row').length;
    const div = document.createElement('div');
    div.innerHTML = renderIncluiRow('', idx);
    container.appendChild(div.firstElementChild);
  }

  // ---- Valor por extenso ----
  function atualizarExtenso() {
    const val = Number(document.getElementById('gpValor')?.value) || 0;
    if (val > 0) {
      document.getElementById('gpValorExt').value = valorPorExtenso(val);
    }
  }

  // ---- Coletar dados do formulário ----
  function collectData() {
    const escopoSections = [...document.querySelectorAll('.escopo-sec')].map(sec => ({
      titulo: sec.querySelector('.esc-titulo')?.value || '',
      itens: [...sec.querySelectorAll('.esc-item-input')].map(i => i.value).filter(Boolean),
    })).filter(s => s.titulo);

    const cronograma = [...document.querySelectorAll('.cron-row')].map(row => ({
      num: row.querySelector('.cron-num')?.value || '',
      nome: row.querySelector('.cron-nome')?.value || '',
      descricao: row.querySelector('.cron-desc')?.value || '',
      prazo: row.querySelector('.cron-prazo')?.value || '',
    })).filter(e => e.nome);

    const incluiNoValor = [...document.querySelectorAll('.incl-input')].map(i => i.value).filter(Boolean);

    const fluxoRes = (document.getElementById('gpFluxoRes')?.value || '').split('|').map(f=>f.trim()).filter(Boolean);
    const coverPhotos = (document.getElementById('gpFotos')?.value || '').split('\n').map(s=>s.trim()).filter(Boolean);
    const clientesRef = (document.getElementById('gpClientesRef')?.value || '').split('\n').map(s=>s.trim()).filter(Boolean);

    return {
      numero: document.getElementById('gpNum')?.value || '',
      data:   document.getElementById('gpData')?.value || '',
      validade: document.getElementById('gpValidade')?.value || '15',
      servicoSolicitado: document.getElementById('gpServico')?.value || '',
      introTexto: document.getElementById('gpIntro')?.value || '',
      objetivo: document.getElementById('gpObjetivo')?.value || '',
      cliente: {
        nome:       document.getElementById('gpCliNome')?.value || '',
        cnpj:       document.getElementById('gpCliCnpj')?.value || '',
        departamento: document.getElementById('gpCliDept')?.value || '',
        unidadeDest:  document.getElementById('gpCliUnidade')?.value || '',
        endereco:   document.getElementById('gpCliEnd')?.value || '',
        cidade:     document.getElementById('gpCliCidade')?.value || '',
        cep:        document.getElementById('gpCliCep')?.value || '',
        uf:         document.getElementById('gpCliUf')?.value || '',
        email:      document.getElementById('gpCliEmail')?.value || '',
        logoUrl:    document.getElementById('gpCliLogo')?.value || '',
      },
      escopoSections,
      cronograma,
      cronogramaObs: document.getElementById('gpCronObs')?.value || '',
      fluxoResumo: fluxoRes,
      valor: Number(document.getElementById('gpValor')?.value) || 0,
      valorPorExtenso: document.getElementById('gpValorExt')?.value || '',
      prazoEntrega: document.getElementById('gpPrazo')?.value || '',
      formaPagamento: document.getElementById('gpPagamento')?.value || '',
      incluiNoValor,
      engenheiro: {
        nome:   document.getElementById('gpEngNome')?.value || ENG_DEFAULT.nome,
        titulo1: document.getElementById('gpEngT1')?.value || ENG_DEFAULT.titulo1,
        titulo2: document.getElementById('gpEngT2')?.value || ENG_DEFAULT.titulo2,
        titulo3: document.getElementById('gpEngT3')?.value || ENG_DEFAULT.titulo3,
        crea:   document.getElementById('gpEngCrea')?.value || ENG_DEFAULT.crea,
      },
      incluirDiferenciais: document.getElementById('gpInclDif')?.checked !== false,
      incluirClientesPage: document.getElementById('gpInclClientes')?.checked !== false,
      coverPhotos,
      clientesRef,
    };
  }

  // ---- Validar e gerar ----
  function generate(propostaId) {
    const data = collectData();
    if (!data.numero) { Toast.error('Informe o número da proposta'); return; }
    if (!data.cliente?.nome) { Toast.error('Informe o nome do cliente (aba Cliente)'); return; }
    if (!data.valor) { Toast.error('Informe o valor da proposta (aba Valor)'); return; }
    if (!data.valorPorExtenso) data.valorPorExtenso = valorPorExtenso(data.valor);

    // Salvar no localStorage para o viewer ler
    localStorage.setItem('crm_proposta_gerada', JSON.stringify(data));

    // Salvar referência na proposta do CRM se vier de uma proposta existente
    if (propostaId) {
      DB.update('propostas', propostaId, {
        escopoGerado: data.escopoSections,
        cronogramaGerado: data.cronograma,
      });
    }

    Modal.close();
    Toast.success('Proposta gerada! Abrindo visualizador...');
    setTimeout(() => window.open('proposta_viewer.html', '_blank'), 400);
  }

  // ---- Valor por extenso ----
  function valorPorExtenso(n) {
    if (!n || n === 0) return 'zero reais';
    const inteiro = Math.floor(n);
    const centavos = Math.round((n - inteiro) * 100);
    let resultado = numExtenso(inteiro);
    resultado += inteiro === 1 ? ' real' : ' reais';
    if (centavos > 0) {
      resultado += ' e ' + numExtenso(centavos);
      resultado += centavos === 1 ? ' centavo' : ' centavos';
    }
    return resultado;
  }

  function numExtenso(n) {
    const u = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove',
               'dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
    const d = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
    const c = ['','cem','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];

    if (n === 0) return 'zero';
    if (n < 0) return 'menos ' + numExtenso(-n);
    if (n < 20) return u[n];
    if (n < 100) {
      const dz = Math.floor(n/10), un = n % 10;
      return n === 100 ? 'cem' : d[dz] + (un ? ' e ' + u[un] : '');
    }
    if (n < 1000) {
      const cent = Math.floor(n/100), resto = n % 100;
      return (n === 100 ? 'cem' : c[cent]) + (resto ? ' e ' + numExtenso(resto) : '');
    }
    if (n < 1000000) {
      const mil = Math.floor(n/1000), resto = n % 1000;
      const s = mil === 1 ? 'mil' : numExtenso(mil) + ' mil';
      return s + (resto ? ' e ' + numExtenso(resto) : '');
    }
    if (n < 1000000000) {
      const mi = Math.floor(n/1000000), resto = n % 1000000;
      const s = mi === 1 ? 'um milhão' : numExtenso(mi) + ' milhões';
      return s + (resto ? ' e ' + numExtenso(resto) : '');
    }
    return String(n);
  }

  return {
    open, generate, preencherCliente,
    addEscopoSection, addEscopoItem, addCronogramaRow, addIncluiItem,
    atualizarExtenso,
  };
})();
