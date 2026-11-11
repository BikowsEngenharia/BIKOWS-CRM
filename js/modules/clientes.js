/* ==========================================
   CLIENTES — Gestão de empresas
   ========================================== */
const Clientes = (() => {

  let _periodo = 'mes'; // 'mes' | 'trimestre' | 'semestre' | 'ano' | 'tudo'

  function _filtrarPorPeriodo(lista, campo) {
    if (_periodo === 'tudo') return lista;
    const hoje = new Date();
    let inicio;
    if (_periodo === 'mes') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    } else if (_periodo === 'trimestre') {
      const q = Math.floor(hoje.getMonth() / 3);
      inicio = new Date(hoje.getFullYear(), q * 3, 1);
    } else if (_periodo === 'semestre') {
      const s = hoje.getMonth() < 6 ? 0 : 6;
      inicio = new Date(hoje.getFullYear(), s, 1);
    } else if (_periodo === 'ano') {
      inicio = new Date(hoje.getFullYear(), 0, 1);
    }
    const inicioStr = Utils.localDateStr(inicio);
    return lista.filter(item => (item[campo] || item.createdAt || '') >= inicioStr);
  }

  function setPeriodo(p) {
    _periodo = p;
    render();
  }

  let _filter = { search: '', segmento: '', porte: '', ativo: '' };

  function render() {
    const config = DB.getConfig();
    const clientes = DB.getAll('clientes');
    const leads = DB.getAll('leads');
    const projetos = DB.getAll('projetos');
    const periodoLabels = { mes: 'Este Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };
    const novosPeriodo = _filtrarPorPeriodo(clientes, 'createdAt').length;

    let list = clientes;
    if (_filter.search) {
      const s = _filter.search.toLowerCase();
      list = list.filter(c => c.nome?.toLowerCase().includes(s) || c.cnpj?.includes(s) || c.cidade?.toLowerCase().includes(s));
    }
    if (_filter.segmento) list = list.filter(c => c.segmento === _filter.segmento);
    if (_filter.porte) list = list.filter(c => c.porte === _filter.porte);
    if (_filter.ativo !== '') list = list.filter(c => String(c.ativo !== false) === _filter.ativo);

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Clientes</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Clientes.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <label class="btn btn-secondary" style="cursor:pointer" title="Importar CSV com colunas: nome, cnpj, segmento, porte, cidade, estado, email, telefone">
            📥 Importar CSV
            <input type="file" accept=".csv,.txt" style="display:none" onchange="Clientes.importCSV(event)">
          </label>
          <button class="btn btn-secondary" onclick="Clientes.downloadCSVTemplate()">📋 Modelo CSV</button>
          <button class="btn btn-primary" onclick="Clientes.openForm()">+ Novo Cliente</button>
        </div>
      </div>

      ${(() => {
        /* Os cinco de antes eram Total, Ativos, Novos, Segmentos e Estados.
           Total e Ativos davam o mesmo numero, e Segmentos e Estados sao
           curiosidade, nao decisao. Esta tela existe para a recorrencia e
           para o portal: os indicadores agora olham para isso. */
        const equipAtivos = DB.getAll('equipamentos').filter(e => e.status !== 'inativo');
        const comParque = new Set(equipAtivos.map(e => e.clienteId).filter(Boolean));
        const ativos = clientes.filter(c => c.ativo !== false);
        const semContato = ativos.filter(c => !String(c.telefone || '').trim() && !String(c.email || '').trim());
        const vencendo = (typeof Equipamentos !== 'undefined' && Equipamentos.getVencendo)
          ? Equipamentos.getVencendo(90) : [];
        const clientesVencendo = new Set(vencendo.map(e => e.clienteId).filter(Boolean));
        const cobertos = ativos.filter(c => comParque.has(c.id)).length;

        return `<div class="stats-row mb-4">
          <div class="stat-box"><div class="stat-val">${ativos.length}</div><div class="stat-lbl">Clientes ativos</div></div>

          <div class="stat-box" style="--stat-color:${cobertos < ativos.length ? '#d97706' : '#1E7A34'}"
            title="A renovacao automatica parte do equipamento cadastrado. Cliente sem parque nunca gera recorrencia.">
            <div class="stat-val">${cobertos}<span style="font-size:13px;color:var(--text-muted)">/${ativos.length}</span></div>
            <div class="stat-lbl">Com parque</div>
          </div>

          <div class="stat-box" style="--stat-color:${clientesVencendo.size ? '#C42B2B' : 'var(--border-strong)'}"
            title="Clientes com inspecao vencendo nos proximos 90 dias. E daqui que sai a renovacao.">
            <div class="stat-val">${clientesVencendo.size}</div>
            <div class="stat-lbl">Inspecao em 90 dias</div>
          </div>

          <div class="stat-box" style="--stat-color:${semContato.length ? '#C42B2B' : 'var(--border-strong)'}${semContato.length ? ';cursor:pointer' : ''}"
            ${semContato.length ? 'onclick="Clientes.listarSemContato()"' : ''}
            title="Sem telefone e sem e-mail: nao da para fazer follow-up nem liberar o portal.">
            <div class="stat-val">${semContato.length}</div>
            <div class="stat-lbl">Sem contato</div>
          </div>

          <div class="stat-box" style="--stat-color:var(--primary)">
            <div class="stat-val">${novosPeriodo}</div><div class="stat-lbl">Novos no periodo</div>
          </div>
        </div>`;
      })()}

      ${(() => {
        /* Concentração da carteira. Faturar muito com um cliente só não é
           força, é risco: se ele sai, a receita sai com ele. Este número
           não existia em nenhuma tela. */
        if (typeof ClienteFicha === 'undefined') return '';
        const porCliente = clientes
          .map(c => ({ c, receita: ClienteFicha.metricas(c.id).contratado }))
          .filter(x => x.receita > 0)
          .sort((a, b) => b.receita - a.receita);
        if (!porCliente.length) return '';
        const total = porCliente.reduce((s, x) => s + x.receita, 0);
        const maior = porCliente[0];
        const fatia = Math.round(maior.receita / total * 100);
        let acum = 0, quantosMetade = 0;
        for (const x of porCliente) { acum += x.receita; quantosMetade++; if (acum >= total / 2) break; }
        const alto = fatia >= 40;
        return `<div class="clientes-carteira" style="--cc:${alto ? '#C42B2B' : '#1D4F8C'}">
          <span>📊 Carteira de <strong>${Utils.formatCurrency(total)}</strong> em ${porCliente.length} cliente(s) com receita.</span>
          <span>${alto ? '⚠ ' : ''}O maior responde por <strong>${fatia}%</strong> do faturamento${alto ? ', concentração alta' : ''}.</span>
          <span>${quantosMetade} cliente(s) concentram metade da receita.</span>
          <button class="btn btn-xs btn-secondary" onclick="Clientes.view('${maior.c.id}')">Abrir ${Utils.escHtml(Utils.truncate(maior.c.nome || '', 22))}</button>
        </div>`;
      })()}

      <div class="card">
        <div class="card-header">
          <div class="filters">
            <input class="form-control" style="max-width:220px" placeholder="Buscar empresa..." id="clientSearch"
              value="${Utils.escHtml(_filter.search)}" oninput="Clientes.setFilter('search',this.value)">
            <select class="filter-select" onchange="Clientes.setFilter('segmento',this.value)">
              <option value="">Todos os segmentos</option>
              ${config.segmentos.map(s => `<option value="${Utils.escHtml(s)}" ${_filter.segmento===s?'selected':''}>${Utils.escHtml(s)}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Clientes.setFilter('porte',this.value)">
              <option value="">Todos os portes</option>
              ${['Pequeno','Médio','Grande'].map(p => `<option value="${p}" ${_filter.porte===p?'selected':''}>${p}</option>`).join('')}
            </select>
            <select class="filter-select" onchange="Clientes.setFilter('ativo',this.value)">
              <option value="">Todos</option>
              <option value="true" ${_filter.ativo==='true'?'selected':''}>Ativos</option>
              <option value="false" ${_filter.ativo==='false'?'selected':''}>Inativos</option>
            </select>
          </div>
          <span class="text-sm text-muted">${list.length} resultado(s)</span>
        </div>
        <div class="table-wrap">
          ${list.length === 0 ? emptyState() : `
          <table class="tbl">
            <thead><tr>
              <th>Empresa</th><th>Segmento</th><th>Cidade/UF</th>
              <th>Serviços</th><th>Receita</th><th>Margem</th><th>Vencido</th>
              <th>Último serviço</th><th>Situação</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
            ${(() => {
              /* CNPJ e porte saíram da tabela: estão na ficha e ocupavam
                 espaço que a leitura econômica do cliente precisava. */
              const temFicha = typeof ClienteFicha !== 'undefined';
              return list.map(c => {
                const m = temFicha ? ClienteFicha.metricas(c.id) : null;
                const v = temFicha ? ClienteFicha.veredito(c.id) : null;
                const cProj = projetos.filter(p => p.clienteId === c.id && p.status !== 'cancelado');
                const receita = m ? m.contratado : Utils.sum(cProj, 'valor');
                const nServ = m ? m.servicos.length : cProj.length;
                const npsStars = c.nps ? '⭐'.repeat(c.nps) : '';
                const avatarHtml = c.avatar
                  ? `<img src="${Utils.escHtml(c.avatar)}" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;border:1px solid var(--border)">`
                  : `<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--primary);color:#fff;font-size:12px;font-weight:800;vertical-align:middle;margin-right:6px;flex-shrink:0">${Utils.escHtml((c.nome||'?')[0].toUpperCase())}</span>`;
                /* Cliente sem serviço nenhum não tem margem "sem custo": não
                   tem margem. Dizer "sem custo" sugeria um custo esquecido. */
                const margemCel = (!m || !m.servicos.length) ? '—'
                  : !m.temCusto
                    ? `<span class="text-xs text-muted" title="Nenhum custo lançado nos serviços deste cliente">sem custo</span>`
                    : `<span class="font-bold text-sm" style="color:${ClienteFicha.corDaMargem(m.margemPct)}" title="Comparada com a margem média da carteira">${m.margemPct}%</span>`;
                return `<tr>
                  <td><div class="font-bold" style="display:flex;align-items:center;min-width:190px">${avatarHtml}<span>${Utils.escHtml(c.nome||'—')}</span></div>
                      <div class="text-xs text-muted">${Utils.escHtml(c.codigoCliente||'')} ${npsStars}</div></td>
                  <td>${c.segmento ? `<span class="badge badge-blue">${Utils.escHtml(c.segmento)}</span>` : '—'}</td>
                  <td class="text-sm">${Utils.escHtml([c.cidade, c.estado].filter(Boolean).join('/'))||'—'}</td>
                  <td><span class="badge ${nServ ? 'badge-blue' : 'badge-gray'}">${nServ}</span></td>
                  <td class="text-sm font-bold ${receita>0?'text-primary':''}">${receita>0?Utils.formatCurrency(receita):'—'}</td>
                  <td>${margemCel}</td>
                  <td class="text-sm">${m && m.vencido>0 ? `<span class="font-bold" style="color:#C42B2B">${Utils.formatCurrency(m.vencido)}</span>` : '—'}</td>
                  <td class="text-xs text-muted">${m && m.ultimo ? Utils.formatDate(m.ultimo) : 'nunca'}</td>
                  <td>${v ? `<span class="badge badge-veredito" title="${Utils.escHtml(v.sinais.map(s=>s.texto).join(' | '))}" style="--vcl:${v.cor};--vcd:${v.corEscura||v.cor}">${Utils.escHtml(v.label)}</span>` : '—'}</td>
                  <td>${c.ativo !== false ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
                  <td>
                    <div class="tbl-actions">
                      <button class="btn btn-xs btn-primary" onclick="Clientes.view('${c.id}')">Abrir ficha</button>
                      <button class="btn btn-xs btn-secondary" onclick="Clientes.openForm('${c.id}')">✏</button>
                      <button class="btn btn-xs btn-secondary" id="btnPortal_${c.id}" onclick="Clientes.gerarLinkPortal('${c.id}')" title="Gerar link do portal do cliente">🔗 Portal</button>
                      <button class="btn btn-xs btn-danger" onclick="Clientes.deleteCliente('${c.id}')">🗑</button>
                    </div>
                  </td>
                </tr>`;
              }).join('');
            })()}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  }

  function emptyState() {
    return `<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">Nenhum cliente encontrado</div><div class="empty-sub">Cadastre seu primeiro cliente para começar</div><button class="btn btn-primary mt-4" onclick="Clientes.openForm()">+ Cadastrar Cliente</button></div>`;
  }

  function setFilter(key, val) {
    _filter[key] = val;
    render();
  }

  /* A janela de 10 abas que existia aqui virou a ficha do cliente, uma tela
     inteira em cliente-ficha.js. Esta funcao continua existindo porque a
     busca global e outros modulos chamam Clientes.view(id). */
  function view(id) {
    if (typeof ClienteFicha !== 'undefined') { ClienteFicha.abrir(id); return; }
    Toast.error('A ficha do cliente nao esta disponivel: recarregue a pagina.');
  }

  function _previewAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { Toast.error('Arquivo muito grande (máx 5MB)'); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        const scale = Math.min(MAX / img.width, MAX / img.height);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        const preview = document.getElementById('avatarPreview');
        if (preview) preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover">`;
        // Store in hidden input
        let hidden = document.getElementById('fAvatarData');
        if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = 'fAvatarData'; document.getElementById('avatarPreview').parentNode.appendChild(hidden); }
        hidden.value = base64;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Próximo código livre: maior sufixo numérico existente + 1. Usar
  // "quantidade + 1" gerava colisão (ex.: CLI-0010 já em uso) sempre que
  // algum cliente era excluído ou tinha código digitado à mão.
  function _nextCodigoCliente() {
    const maior = DB.getAll('clientes').reduce((max, c) => {
      const m = String(c.codigoCliente || '').match(/(\d+)\s*$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    return 'CLI-' + String(maior + 1).padStart(4, '0');
  }

  /* Cliente sem telefone e sem e-mail nao recebe follow-up nem acesso ao
     portal. Listar e mais util do que so contar. */
  function listarSemContato() {
    const semContato = DB.getAll('clientes')
      .filter(c => c.ativo !== false && !String(c.telefone || '').trim() && !String(c.email || '').trim());
    if (!semContato.length) { Toast.success('Todo cliente ativo tem telefone ou e-mail.'); return; }
    Modal.open({
      title: `📇 ${semContato.length} cliente(s) sem telefone nem e-mail`,
      size: 'modal-lg', saveLabel: null,
      body: `
        <p class="text-sm text-muted" style="margin-bottom:12px">
          Sem telefone e sem e-mail não dá para fazer follow-up, cobrar nem liberar o
          acesso ao portal. Vale completar antes de qualquer ação comercial.
        </p>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Empresa</th><th>Segmento</th><th>Cidade</th><th>Ação</th></tr></thead>
            <tbody>
              ${semContato.map(c => `<tr>
                <td><div style="min-width:180px;font-weight:600;font-size:13px">${Utils.escHtml(c.nome || c.razaoSocial || '—')}</div></td>
                <td class="text-sm">${Utils.escHtml(c.segmento || '—')}</td>
                <td class="text-sm">${Utils.escHtml([c.cidade, c.estado].filter(Boolean).join('/') || '—')}</td>
                <td><button class="btn btn-xs btn-primary" onclick="Modal.close();Clientes.openForm('${c.id}')">Completar</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`,
    });
  }

  function openForm(id = null) {
    const config = DB.getConfig();
    const c = id ? DB.get('clientes', id) : null;
    const estados = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
    const codSuggest = c?.codigoCliente || _nextCodigoCliente();

    Modal.open({
      title: id ? 'Editar Cliente' : 'Novo Cliente',
      size: 'modal-lg',
      body: `
        <!-- AVATAR UPLOAD -->
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
          <div id="avatarPreview" style="width:64px;height:64px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            ${c?.avatar ? `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover">` : `<span style="color:#fff;font-size:24px;font-weight:800">${Utils.escHtml((c?.nome||'?')[0].toUpperCase())}</span>`}
          </div>
          <div>
            <label class="btn btn-xs btn-secondary" style="cursor:pointer">
              📷 Foto/Logo
              <input type="file" id="fAvatar" accept="image/*" style="display:none" onchange="Clientes._previewAvatar(event)">
            </label>
            ${c?.avatar ? `<button type="button" class="btn btn-xs btn-danger ml-2" onclick="document.getElementById('avatarPreview').innerHTML='<span style=\\'color:#fff;font-size:24px;font-weight:800\\'>${Utils.escHtml((c?.nome||'?')[0].toUpperCase())}</span>';document.getElementById('fAvatarData').value='__remove__'">Remover</button>` : ''}
          </div>
          <input type="hidden" id="fAvatarData" value="">
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:3">
            <label class="form-label">Razão Social / Nome *</label>
            <input class="form-control" id="fNome" value="${Utils.escHtml(c?.nome||'')}" placeholder="Nome da empresa">
          </div>
          <div class="form-group">
            <label class="form-label">Código Interno</label>
            <input class="form-control" id="fCodigoCliente" value="${Utils.escHtml(codSuggest)}" placeholder="CLI-0001">
            <div class="text-xs text-muted mt-1">Código único do cliente no sistema</div>
          </div>
          <div class="form-group">
            <label class="form-label">CNPJ / CPF</label>
            <div style="display:flex;gap:8px;align-items:flex-end;">
              <div style="flex:1">
                <input class="form-control" id="fCnpj" value="${Utils.escHtml(c?.cnpj||'')}" placeholder="XX.XXX.XXX/XXXX-XX" maxlength="18" oninput="Utils.autoFormatCNPJ(this)">
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="btnBuscarCnpj" onclick="Clientes.buscarCNPJ()" style="white-space:nowrap;flex-shrink:0">🔍 Buscar CNPJ</button>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Segmento</label>
            <select class="form-control" id="fSegmento">
              ${config.segmentos.map(s => `<option value="${Utils.escHtml(s)}" ${c?.segmento===s?'selected':''}>${Utils.escHtml(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Porte</label>
            <select class="form-control" id="fPorte">
              ${['Pequeno','Médio','Grande'].map(p => `<option value="${p}" ${c?.porte===p?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="fAtivo">
              <option value="true" ${c?.ativo!==false?'selected':''}>Ativo</option>
              <option value="false" ${c?.ativo===false?'selected':''}>Inativo</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cidade</label>
            <input class="form-control" id="fCidade" value="${Utils.escHtml(c?.cidade||'')}" placeholder="Cidade">
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select class="form-control" id="fEstado">
              <option value="">UF</option>
              ${estados.map(e => `<option value="${e}" ${c?.estado===e?'selected':''}>${e}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <input class="form-control" id="fEmail" type="email" value="${Utils.escHtml(c?.email||'')}" placeholder="email@empresa.com.br">
          </div>
          <div class="form-group">
            <label class="form-label">Telefone</label>
            <input class="form-control" id="fTelefone" value="${Utils.escHtml(c?.telefone||'')}" placeholder="(XX) XXXXX-XXXX">
          </div>
          <div class="form-group">
            <label class="form-label">Site</label>
            <input class="form-control" id="fSite" value="${Utils.escHtml(c?.site||'')}" placeholder="www.empresa.com.br">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Engenheiro de Conta / Responsável</label>
            <input class="form-control" id="fEngResponsavel" value="${Utils.escHtml(c?.engResponsavel||'')}" placeholder="Responsável pelo relacionamento">
          </div>
          <div class="form-group">
            <label class="form-label">NPS / Satisfação Geral</label>
            <select class="form-control" id="fNps">
              <option value="">Não avaliado</option>
              ${[5,4,3,2,1].map(n => `<option value="${n}" ${c?.nps==n?'selected':''}>${'⭐'.repeat(n)} — ${['','Muito insatisfeito','Insatisfeito','Neutro','Satisfeito','Muito satisfeito'][n]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="fObs" rows="3">${Utils.escHtml(c?.observacoes||'')}</textarea>
        </div>
      `,
      saveCb: () => saveCliente(id),
    });
  }

  function saveCliente(id) {
    const nome = document.getElementById('fNome').value.trim();
    if (!nome) { Toast.error('Nome obrigatório'); return; }
    const cnpj = document.getElementById('fCnpj').value.trim();
    const codigoCliente = document.getElementById('fCodigoCliente').value.trim();

    // Verifica duplicidade do código
    if (codigoCliente) {
      const duplicado = DB.getAll('clientes').find(c => c.codigoCliente === codigoCliente && c.id !== id);
      if (duplicado) { Toast.error(`Código ${codigoCliente} já está em uso por "${duplicado.nome}"`); return; }
    }

    const avatarRaw = document.getElementById('fAvatarData')?.value || '';
    const existingCliente = id ? DB.get('clientes', id) : null;
    let avatar = existingCliente?.avatar || null;
    if (avatarRaw === '__remove__') avatar = null;
    else if (avatarRaw && avatarRaw.startsWith('data:')) avatar = avatarRaw;

    const data = {
      nome,
      codigoCliente,
      cnpj,
      segmento: document.getElementById('fSegmento').value,
      porte: document.getElementById('fPorte').value,
      ativo: document.getElementById('fAtivo').value === 'true',
      cidade: document.getElementById('fCidade').value,
      estado: document.getElementById('fEstado').value,
      email: document.getElementById('fEmail').value,
      telefone: document.getElementById('fTelefone').value,
      site: document.getElementById('fSite').value,
      engResponsavel: document.getElementById('fEngResponsavel').value,
      nps: Number(document.getElementById('fNps').value) || null,
      observacoes: document.getElementById('fObs').value,
      avatar,
    };
    if (id) { DB.update('clientes', id, data); Toast.success('Cliente atualizado'); }
    else { DB.create('clientes', data); Toast.success('Cliente cadastrado'); }
    Modal.close();
    render();
  }

  function deleteCliente(id) {
    const c = DB.get('clientes', id);
    Utils.confirmDelete(c?.nome || 'este cliente', () => {
      DB.remove('clientes', id);
      Toast.success('Cliente removido');
      render();
    });
  }

  function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { Toast.error('CSV vazio ou sem dados'); return; }
        const headers = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"]/g,''));
        const idx = (col) => headers.indexOf(col);

        const rows = lines.slice(1);
        let created = 0, skipped = 0;
        rows.forEach(line => {
          const cols = line.split(';').map(c => c.trim().replace(/^["']|["']$/g,''));
          const nome = cols[idx('nome')] || '';
          if (!nome) { skipped++; return; }
          const npsRaw = cols[idx('nps')] || cols[idx('nps / satisfação geral')] || '';
          DB.create('clientes', {
            nome,
            cnpj:           cols[idx('cnpj')] || '',
            segmento:       cols[idx('segmento')] || '',
            porte:          cols[idx('porte')] || 'Médio',
            cidade:         cols[idx('cidade')] || '',
            estado:         cols[idx('estado')] || '',
            email:          cols[idx('email')] || '',
            telefone:       cols[idx('telefone')] || '',
            site:           cols[idx('site')] || '',
            observacoes:    cols[idx('observacoes')] || '',
            codigoCliente:  cols[idx('codigo cliente')] || cols[idx('codigocliente')] || '',
            engResponsavel: cols[idx('eng responsavel')] || cols[idx('engresponsavel')] || cols[idx('eng_responsavel')] || '',
            nps:            npsRaw ? (Number(npsRaw) || null) : null,
            ativo: true,
          });
          created++;
        });
        Toast.success(`${created} cliente(s) importado(s)!${skipped ? ` (${skipped} linha(s) ignorada(s))` : ''}`);
        render();
      } catch(err) {
        Toast.error('Erro ao processar CSV: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function downloadCSVTemplate() {
    const header = 'nome;cnpj;segmento;porte;cidade;estado;email;telefone;site;observacoes;codigo cliente;eng responsavel;nps';
    const example = 'Empresa Exemplo Ltda;12.345.678/0001-90;Alimentos;Médio;Londrina;PR;contato@empresa.com;(43) 99999-1234;www.empresa.com;Observação opcional;CLI-0001;João da Silva;5';
    const blob = new Blob([header + '\n' + example], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-clientes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    Toast.success('Modelo CSV baixado! Edite e reimporte.');
  }

  function addNew() { openForm(); }

  async function buscarCNPJ() {
    const input = document.getElementById('fCnpj');
    const btn   = document.getElementById('btnBuscarCnpj');
    if (!input || !btn) return;

    const raw  = input.value.replace(/\D/g, '');
    if (raw.length !== 14) { Toast.error('CNPJ deve ter 14 dígitos'); return; }

    const original = btn.textContent;
    btn.textContent = 'Buscando...';
    btn.disabled = true;

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'CNPJ não encontrado' : `Erro ${res.status} na consulta`);
      const d = await res.json();

      // Nome / Razão Social
      const fNome = document.getElementById('fNome');
      if (fNome && d.razao_social) fNome.value = d.razao_social;

      // Nome Fantasia
      const fNomeFantasia = document.getElementById('fNomeFantasia');
      if (fNomeFantasia && d.nome_fantasia) fNomeFantasia.value = d.nome_fantasia;

      // Segmento — tenta mapear CNAE para os segmentos disponíveis
      const fSegmento = document.getElementById('fSegmento');
      if (fSegmento && d.cnae_fiscal_descricao) {
        const cnae = d.cnae_fiscal_descricao.toLowerCase();
        const opts = [...fSegmento.options].map(o => ({ val: o.value, lbl: o.value.toLowerCase() }));
        const mapa = [
          { kws: ['aliment','bebid','agric','pecuár'], seg: 'Alimentos' },
          { kws: ['metal','ferrament','caldeiraria','estrutura metál','soldagem','usinag'], seg: 'Metalurgia' },
          { kws: ['automação','automação industrial','eletr','instrumentação'], seg: 'Automação' },
          { kws: ['construção','obra','engenharia civil','arquitet'], seg: 'Construção Civil' },
          { kws: ['quím','petroqu','petrol','gás'], seg: 'Química' },
          { kws: ['papel','celulos'], seg: 'Papel e Celulose' },
          { kws: ['plástic','borracha'], seg: 'Plásticos e Borracha' },
          { kws: ['têxtil','confecção','vestuário'], seg: 'Têxtil' },
          { kws: ['logístic','transport','armazenagem'], seg: 'Logística' },
          { kws: ['saúde','hospital','farmac','médic'], seg: 'Saúde' },
          { kws: ['tecnologia','software','inform'], seg: 'Tecnologia' },
          { kws: ['serviços','assessoria','consultoria'], seg: 'Serviços' },
        ];
        let found = '';
        for (const { kws, seg } of mapa) {
          if (kws.some(k => cnae.includes(k))) { found = seg; break; }
        }
        if (found) {
          const opt = opts.find(o => o.lbl === found.toLowerCase());
          if (opt) fSegmento.value = opt.val;
        }
      }

      // Endereço
      const fEndereco = document.getElementById('fEndereco');
      if (fEndereco) {
        const partes = [
          d.logradouro,
          d.numero ? d.numero : null,
          d.bairro ? '- ' + d.bairro : null,
          (d.municipio && d.uf) ? d.municipio + '/' + d.uf : (d.municipio || null),
          d.cep ? 'CEP ' + d.cep : null,
        ].filter(Boolean);
        if (partes.length) fEndereco.value = partes.join(', ');
      }

      // Cidade e Estado (campos separados)
      const fCidade = document.getElementById('fCidade');
      if (fCidade && d.municipio) fCidade.value = d.municipio;
      const fEstado = document.getElementById('fEstado');
      if (fEstado && d.uf) fEstado.value = d.uf;

      // Telefone
      const fTelefone = document.getElementById('fTelefone');
      if (fTelefone && d.ddd_telefone_1) {
        const t = d.ddd_telefone_1.replace(/\D/g,'');
        if (t.length === 10) fTelefone.value = `(${t.slice(0,2)}) ${t.slice(2,6)}-${t.slice(6)}`;
        else if (t.length === 11) fTelefone.value = `(${t.slice(0,2)}) ${t.slice(2,7)}-${t.slice(7)}`;
        else fTelefone.value = d.ddd_telefone_1;
      }

      // E-mail
      const fEmail = document.getElementById('fEmail');
      if (fEmail && d.email) fEmail.value = d.email;

      Toast.success(`Dados preenchidos: ${d.razao_social}`);
    } catch (err) {
      Toast.error('Erro ao buscar CNPJ: ' + (err.message || 'Tente novamente'));
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  /* ── Portal do Cliente ─────────────────────────────────────────────────── */

  async function gerarLinkPortal(clienteId) {
    const c = DB.get('clientes', clienteId);
    if (!c) return;

    const btn = document.getElementById(`btnPortal_${clienteId}`);
    if (btn) { btn.textContent = '⏳ Gerando...'; btn.disabled = true; }

    try {
      // Criar token via Supabase
      const { data, error } = await _supabase
        .from('crm_portal_tokens')
        .insert({
          cliente_id: clienteId,
          nome_cliente: c.nome,
          email_cliente: c.email || '',
          ativo: true,
          expira_em: new Date(Date.now() + 365 * 86400000).toISOString(), // 1 ano
        })
        .select('token')
        .single();

      if (error || !data?.token) throw new Error(error?.message || 'Erro ao gerar token');

      const link = `https://portal.bikows.com.br/?token=${data.token}`;

      Modal.open({
        title: '🔗 Link do Portal — ' + c.nome,
        body: `
          <div style="background:var(--success-light);border:1px solid var(--success-border);padding:16px;border-radius:var(--radius);margin-bottom:16px">
            <div class="font-bold text-sm" style="color:var(--success);margin-bottom:8px">✅ Link gerado com sucesso!</div>
            <div class="text-xs text-muted mb-2">Envie este link para ${Utils.escHtml(c.nome)}. Válido por 1 ano.</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" value="${Utils.escHtml(link)}" id="portalLink" readonly
                style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;background:white">
              <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${Utils.escHtml(link)}').then(()=>Toast.success('Link copiado!'))">📋 Copiar</button>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value font-bold">${Utils.escHtml(c.nome)}</div></div>
            <div class="detail-field"><div class="detail-label">Expira em</div><div class="detail-value">1 ano</div></div>
          </div>
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);margin-top:12px">
            <div class="text-xs font-bold text-muted mb-1">📧 Sugestão de mensagem WhatsApp/e-mail:</div>
            <div style="font-size:12px;line-height:1.6;color:var(--text)">
              "Olá ${Utils.escHtml(c.nome)}! Criamos seu portal exclusivo Bikows onde você pode acompanhar projetos e aprovar propostas em tempo real. Acesse: ${Utils.escHtml(link)}"
            </div>
          </div>
        `,
      });
    } catch (err) {
      Toast.error('Erro ao gerar link: ' + err.message);
    } finally {
      if (btn) { btn.textContent = '🔗 Gerar Portal'; btn.disabled = false; }
    }
  }

  async function verTokensPortal(clienteId) {
    const c = DB.get('clientes', clienteId);
    const { data: tokens } = await _supabase
      .from('crm_portal_tokens')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('criado_em', { ascending: false });

    if (!tokens?.length) { Toast.show('Nenhum link gerado ainda para este cliente.'); return; }

    Modal.open({
      title: `🔗 Links do Portal — ${c?.nome || ''}`,
      body: `
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Token</th><th>Criado em</th><th>Último acesso</th><th>Expira</th><th>Ativo</th><th>Ações</th></tr></thead>
            <tbody>
              ${tokens.map(t => `<tr>
                <td style="font-family:monospace;font-size:11px">${t.token.substring(0,20)}...</td>
                <td class="text-xs">${Utils.formatDate(t.criado_em?.split('T')[0])}</td>
                <td class="text-xs">${t.ultimo_acesso ? Utils.formatDate(t.ultimo_acesso.split('T')[0]) : '—'}</td>
                <td class="text-xs">${t.expira_em ? Utils.formatDate(t.expira_em.split('T')[0]) : '∞'}</td>
                <td>${t.ativo ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
                <td>
                  <button class="btn btn-xs btn-secondary" onclick="navigator.clipboard.writeText('https://portal.bikows.com.br/?token=${t.token}').then(()=>Toast.success('Copiado!'))">📋</button>
                  ${t.ativo ? `<button class="btn btn-xs btn-danger" onclick="Clientes.revogarToken('${t.id}')">Revogar</button>` : ''}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `,
    });
  }

  async function revogarToken(tokenId) {
    await _supabase.from('crm_portal_tokens').update({ ativo: false }).eq('id', tokenId);
    Toast.success('Token revogado');
    Modal.close();
  }

  function getUltimaInteracao(clienteId) {
    var atividades = DB.getAll('atividades').filter(function(a) { return a.clienteId === clienteId && a.data; });
    if (!atividades.length) return null;
    return atividades.sort(function(a, b) { return (b.data || '').localeCompare(a.data || ''); })[0].data;
  }

  return { listarSemContato, render, openForm, saveCliente, deleteCliente, view, setFilter, addNew, importCSV, downloadCSVTemplate, buscarCNPJ, setPeriodo, gerarLinkPortal, verTokensPortal, revogarToken, _previewAvatar, getUltimaInteracao };
})();

// Tab switcher helper
function switchTab(btn, tabId) {
  btn.closest('.tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const parent = btn.closest('.modal-body') || document.getElementById('pageContent');
  parent.querySelectorAll('[id^="tab"]').forEach(t => t.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');
}
