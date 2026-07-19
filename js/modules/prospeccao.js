/* ==========================================
   PROSPECCAO — Prospecção de Leads via Google Places API
   ========================================== */
const Prospeccao = (() => {

  let _resultados = [];
  let _buscando = false;

  // Config padrão de busca
  let _config = {
    keywords: ['NR-12', 'segurança industrial', 'indústria', 'agroindústria', 'metal mecânica', 'frigorífico', 'beneficiamento', 'automação industrial', 'manutenção industrial', 'caldeiraria'],
    estados: ['PR', 'SC', 'SP', 'MG', 'RS', 'GO', 'MT', 'MS'],
    estadoSelecionado: 'PR',
    keywordSelecionada: 'indústria',
    cidade: '',
    raio: 50000,
  };

  // Mapeamento de categorias Google → segmentos Bikows
  const _CATEGORIA_MAP = {
    'food': 'Agroindústria',
    'food_store': 'Agroindústria',
    'meal_delivery': 'Agroindústria',
    'meal_takeaway': 'Agroindústria',
    'bakery': 'Agroindústria',
    'slaughterhouse': 'Frigorífico',
    'manufacturing': 'Metal mecânica',
    'factory': 'Metal mecânica',
    'industrial': 'Indústria',
    'storage': 'Logística',
    'warehouse': 'Logística',
    'moving_company': 'Logística',
    'car_repair': 'Metal mecânica',
    'electrician': 'Eletromecânica',
    'plumber': 'Hidráulica',
    'general_contractor': 'Construção',
    'construction': 'Construção',
    'roofing_contractor': 'Construção',
    'lodging': 'Serviços',
    'hospital': 'Saúde',
    'pharmacy': 'Saúde',
    'school': 'Educação',
    'university': 'Educação',
  };

  function _mapSegmento(tipos) {
    if (!tipos || !Array.isArray(tipos)) return 'Indústria';
    // Lista de segmentos do usuário (config), em lowercase para fuzzy match
    const segmentosUsuario = (() => {
      try {
        return (DB.getConfig()?.segmentos || []).map(s => ({ raw: s, lower: s.toLowerCase() }));
      } catch { return []; }
    })();

    for (const t of tipos) {
      const key = t.toLowerCase();
      // 1) Primeiro tenta match no _CATEGORIA_MAP padrão
      for (const [cat, seg] of Object.entries(_CATEGORIA_MAP)) {
        if (key.includes(cat)) {
          // Se o segmento mapeado bate com algum customizado do usuário, prioriza o do usuário
          const match = segmentosUsuario.find(s => s.lower === seg.toLowerCase());
          return match ? match.raw : seg;
        }
      }
      // 2) Tenta match direto com segmentos customizados do usuário
      for (const s of segmentosUsuario) {
        if (key.includes(s.lower) || s.lower.includes(key)) return s.raw;
      }
    }
    return 'Indústria';
  }

  function _categoriaBR(tipos) {
    if (!tipos || !Array.isArray(tipos)) return 'Empresa';
    const excluir = ['point_of_interest', 'establishment', 'premise', 'locality', 'political', 'geocode', 'route', 'street_address', 'country', 'administrative_area_level_1', 'administrative_area_level_2'];
    const limpo = tipos.filter(t => !excluir.includes(t));
    if (!limpo.length) return 'Empresa';
    // Traduz o primeiro tipo relevante
    const traducoes = {
      manufacturing: 'Indústria / Manufatura',
      food_processing: 'Indústria Alimentícia',
      storage: 'Armazenagem / Logística',
      warehouse: 'Depósito / Logística',
      car_repair: 'Oficina / Metalúrgica',
      electrician: 'Eletromecânica',
      general_contractor: 'Construção Civil',
      roofing_contractor: 'Construção',
      plumber: 'Hidráulica / Saneamento',
      moving_company: 'Logística / Transporte',
      bakery: 'Panificadora / Agroindústria',
      hospital: 'Hospital / Saúde',
      pharmacy: 'Farmácia / Saúde',
      school: 'Escola / Educação',
      university: 'Universidade',
      supermarket: 'Supermercado',
      grocery_or_supermarket: 'Mercado / Distribuição',
      hardware_store: 'Ferragem / Materiais',
      home_goods_store: 'Materiais Industriais',
      lodging: 'Hospedagem',
    };
    for (const t of limpo) {
      if (traducoes[t]) return traducoes[t];
    }
    return limpo[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function render() {
    const raios = [
      { v: 5000,  l: '5 km' },
      { v: 10000, l: '10 km' },
      { v: 25000, l: '25 km' },
      { v: 50000, l: '50 km' },
      { v: 100000, l: '100 km' },
      { v: 200000, l: '200 km' },
    ];

    const kwOpts = _config.keywords.map(k =>
      `<option value="${Utils.escHtml(k)}" ${_config.keywordSelecionada === k ? 'selected' : ''}>${Utils.escHtml(k)}</option>`
    ).join('');

    const estOpts = _config.estados.map(e =>
      `<option value="${e}" ${_config.estadoSelecionado === e ? 'selected' : ''}>${e}</option>`
    ).join('');

    const raioOpts = raios.map(r =>
      `<option value="${r.v}" ${_config.raio === r.v ? 'selected' : ''}>${r.l}</option>`
    ).join('');

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">🔍 Prospecção de Leads</h2>
        <div class="sec-actions">
          <button class="btn btn-ghost btn-sm" onclick="Prospeccao._showAjuda()">❓ Ajuda</button>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header" style="border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:0">
          <span style="font-size:13px;font-weight:600;color:var(--text)">🌐 Busca via Google Meu Negócio</span>
          <span style="font-size:12px;color:var(--text-muted);margin-left:8px">Encontre empresas na sua região e adicione ao CRM em 1 clique</span>
        </div>
        <div style="padding:20px">
          <div class="form-row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
            <div class="form-group" style="flex:2;min-width:180px">
              <label class="form-label">Palavra-chave / Segmento</label>
              <div style="display:flex;gap:6px">
                <select class="form-control" id="pKeyword" onchange="Prospeccao._onKeywordChange(this.value)">
                  ${kwOpts}
                </select>
                <input class="form-control" id="pKeywordCustom" placeholder="ou digite aqui..."
                  style="flex:1" value="${Utils.escHtml(_config.keywordSelecionada)}"
                  oninput="Prospeccao._onKeywordCustom(this.value)"
                  onkeydown="if(event.key==='Enter') Prospeccao.buscar()">
              </div>
            </div>
            <div class="form-group" style="min-width:100px">
              <label class="form-label">Estado</label>
              <select class="form-control" id="pEstado">
                ${estOpts}
              </select>
            </div>
            <div class="form-group" style="flex:1;min-width:140px">
              <label class="form-label">Cidade (opcional)</label>
              <input class="form-control" id="pCidade" placeholder="Ex: Londrina" value="${Utils.escHtml(_config.cidade)}"
                onkeydown="if(event.key==='Enter') Prospeccao.buscar()">
            </div>
            <div class="form-group" style="min-width:110px">
              <label class="form-label">Raio</label>
              <select class="form-control" id="pRaio">
                ${raioOpts}
              </select>
            </div>
            <div class="form-group" style="flex-shrink:0;align-self:flex-end">
              <button class="btn btn-primary" onclick="Prospeccao.buscar()" id="btnBuscar"
                style="white-space:nowrap;padding:10px 20px">
                🔍 Buscar Empresas
              </button>
            </div>
          </div>

          <div id="pStatus" style="display:none;padding:12px 16px;background:var(--surface-2,#f8fafc);border-radius:8px;border:1px solid var(--border);margin-top:8px;font-size:13px;color:var(--text-muted)"></div>
        </div>
      </div>

      <div id="pResultados"></div>
    `;

    // Mostrar resultados anteriores se houver
    if (_resultados.length > 0) {
      _renderResultados(_resultados);
    }
  }

  function _onKeywordChange(val) {
    _config.keywordSelecionada = val;
    const customInput = document.getElementById('pKeywordCustom');
    if (customInput) customInput.value = val;
  }

  function _onKeywordCustom(val) {
    _config.keywordSelecionada = val;
  }

  async function buscar() {
    if (_buscando) return;

    const keyword = (document.getElementById('pKeywordCustom')?.value || document.getElementById('pKeyword')?.value || '').trim();
    const estado = document.getElementById('pEstado')?.value || 'PR';
    const cidade = document.getElementById('pCidade')?.value?.trim() || '';
    const raio = Number(document.getElementById('pRaio')?.value) || 50000;

    if (!keyword) {
      Toast.error('Informe uma palavra-chave para buscar');
      return;
    }

    // Salvar config
    _config.keywordSelecionada = keyword;
    _config.estadoSelecionado = estado;
    _config.cidade = cidade;
    _config.raio = raio;

    _buscando = true;
    const btnBuscar = document.getElementById('btnBuscar');
    if (btnBuscar) {
      btnBuscar.disabled = true;
      btnBuscar.textContent = '⏳ Buscando...';
    }

    const statusEl = document.getElementById('pStatus');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px">
        <span style="display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></span>
        🔍 Buscando empresas para "<strong>${Utils.escHtml(keyword)}</strong>" em ${cidade ? cidade + ' - ' : ''}${estado}...
      </span>`;
    }

    const resultadosEl = document.getElementById('pResultados');
    if (resultadosEl) resultadosEl.innerHTML = '';

    try {
      const resp = await fetch(
        'https://mxvwccyopzfewhvscrzj.supabase.co/functions/v1/crm-prospeccao',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON}`,
          },
          body: JSON.stringify({ keyword, estado, cidade, raio }),
        }
      );

      const data = await resp.json();

      if (!resp.ok || data?.error) {
        _handleError(data);
        return;
      }

      _resultados = Array.isArray(data) ? data : (data.resultados || []);

      if (statusEl) {
        statusEl.innerHTML = `✅ ${_resultados.length} empresa${_resultados.length !== 1 ? 's' : ''} encontrada${_resultados.length !== 1 ? 's' : ''} para "<strong>${Utils.escHtml(keyword)}</strong>" em ${cidade ? cidade + ' - ' : ''}${estado}`;
      }

      _renderResultados(_resultados);

    } catch (err) {
      console.error('[Prospeccao] Erro na busca:', err);
      if (statusEl) {
        statusEl.innerHTML = `❌ Erro ao conectar com o servidor. Verifique sua conexão.`;
        statusEl.style.color = 'var(--danger,#dc2626)';
      }
      _renderErroConexao();
    } finally {
      _buscando = false;
      if (btnBuscar) {
        btnBuscar.disabled = false;
        btnBuscar.textContent = '🔍 Buscar Empresas';
      }
    }
  }

  function _handleError(data) {
    const statusEl = document.getElementById('pStatus');
    const resultadosEl = document.getElementById('pResultados');

    if (data?.error === 'API_KEY_NOT_CONFIGURED') {
      if (statusEl) {
        statusEl.innerHTML = `⚙️ Configuração necessária — API Key não configurada`;
        statusEl.style.color = 'var(--warning,#f59e0b)';
      }
      if (resultadosEl) {
        resultadosEl.innerHTML = `
          <div class="card" style="border-left:4px solid var(--warning,#f59e0b)">
            <div style="padding:24px">
              <div style="display:flex;align-items:flex-start;gap:16px">
                <div style="font-size:32px;flex-shrink:0">⚙️</div>
                <div>
                  <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px">Configuração necessária</div>
                  <div style="font-size:14px;color:var(--text-muted);margin-bottom:16px">
                    Para usar a prospecção, você precisa configurar a <strong>Google Places API Key</strong>:
                  </div>
                  <ol style="font-size:13px;color:var(--text);line-height:2;padding-left:20px">
                    <li><strong>Google Cloud Console</strong> → Biblioteca de APIs → <em>Places API</em> → <strong>Ativar</strong></li>
                    <li>Credenciais → Criar Chave de API → Restringir ao domínio <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px">bikowsengenharia.github.io</code></li>
                    <li><strong>Supabase Dashboard</strong> → Edge Functions → Secrets → Adicionar <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px">GOOGLE_PLACES_API_KEY</code></li>
                  </ol>
                  <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
                    <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank" class="btn btn-primary btn-sm">
                      🌐 Abrir Google Cloud Console
                    </a>
                    <a href="https://supabase.com/dashboard/project/mxvwccyopzfewhvscrzj/functions" target="_blank" class="btn btn-secondary btn-sm">
                      ⚡ Abrir Supabase Edge Functions
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>`;
      }
    } else {
      const msg = data?.message || 'Erro desconhecido ao buscar empresas';
      if (statusEl) {
        statusEl.innerHTML = `❌ ${Utils.escHtml(msg)}`;
        statusEl.style.color = 'var(--danger,#dc2626)';
      }
      if (resultadosEl) {
        resultadosEl.innerHTML = `
          <div class="card">
            <div style="padding:24px;text-align:center">
              <div style="font-size:32px;margin-bottom:8px">❌</div>
              <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">Erro ao buscar empresas</div>
              <div style="font-size:13px;color:var(--text-muted)">${Utils.escHtml(msg)}</div>
            </div>
          </div>`;
      }
    }
  }

  function _renderErroConexao() {
    const resultadosEl = document.getElementById('pResultados');
    if (!resultadosEl) return;
    resultadosEl.innerHTML = `
      <div class="card">
        <div style="padding:24px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">🔌</div>
          <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">Sem conexão com o servidor</div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Verifique sua conexão com a internet e tente novamente.</div>
          <button class="btn btn-primary btn-sm" onclick="Prospeccao.buscar()">🔄 Tentar novamente</button>
        </div>
      </div>`;
  }

  /* Dedupe: verifica se a empresa encontrada já existe como cliente ou lead
     (comparação por nome normalizado, ignorando acentos e sufixos LTDA/ME…) */
  function _normNome(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(ltda|s\/?a|me|epp|eireli|cia|comercio|industria|do brasil)\b/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function _jaExiste(r) {
    const n = _normNome(r.nome);
    if (!n || n.length < 4) return {};
    const cli = DB.getAll('clientes').find(c => {
      const cn = _normNome(c.nome);
      return cn && cn.length >= 4 && (cn === n || cn.includes(n) || n.includes(cn));
    });
    if (cli) return { tipo: 'cliente', nome: cli.nome };
    const lead = DB.getAll('leads').find(l => {
      const t = _normNome(l.titulo || '');
      return t && t.length >= 4 && (t.includes(n) || n.includes(t));
    });
    if (lead) return { tipo: 'lead', nome: lead.titulo };
    return {};
  }

  function _renderResultados(lista) {
    const el = document.getElementById('pResultados');
    if (!el) return;

    if (!lista || lista.length === 0) {
      el.innerHTML = `
        <div class="card">
          <div style="padding:40px;text-align:center">
            <div style="font-size:40px;margin-bottom:12px">🔍</div>
            <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px">Nenhuma empresa encontrada</div>
            <div style="font-size:13px;color:var(--text-muted)">Tente palavras-chave diferentes ou amplie o raio de busca.</div>
          </div>
        </div>`;
      return;
    }

    const jaNoCrm = lista.filter(r => _jaExiste(r).tipo).length;
    el.innerHTML = `
      <div class="sec-header" style="margin-bottom:16px">
        <h3 style="font-size:14px;font-weight:600;color:var(--text)">
          📋 Resultados — ${lista.length} empresa${lista.length !== 1 ? 's' : ''} encontrada${lista.length !== 1 ? 's' : ''}
          ${jaNoCrm > 0 ? `<span style="font-size:12px;font-weight:600;color:var(--text-muted)"> · ${lista.length - jaNoCrm} nova(s) · ${jaNoCrm} já no CRM</span>` : ''}
        </h3>
        <span style="font-size:12px;color:var(--text-muted)">Clique em "+ Adicionar" para incluir no CRM</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">
        ${lista.map((r, i) => _cardResultado(r, i)).join('')}
      </div>`;
  }

  function _cardResultado(r, idx) {
    const statusColor = r.status === 'OPERATIONAL' ? '#10b981' : r.status === 'CLOSED_TEMPORARILY' ? '#f59e0b' : '#94a3b8';
    const statusLabel = r.status === 'OPERATIONAL' ? 'Ativo' : r.status === 'CLOSED_TEMPORARILY' ? 'Temp. Fechado' : r.status === 'CLOSED_PERMANENTLY' ? 'Fechado' : '';
    const dup = _jaExiste(r);
    const dupBadge = dup.tipo === 'cliente'
      ? `<span style="font-size:10px;font-weight:700;color:#10b981;background:#10b98118;padding:2px 8px;border-radius:99px" title="${Utils.escHtml(dup.nome)}">✔ Já é cliente</span>`
      : dup.tipo === 'lead'
        ? `<span style="font-size:10px;font-weight:700;color:#f59e0b;background:#f59e0b18;padding:2px 8px;border-radius:99px" title="${Utils.escHtml(dup.nome)}">💼 Já em prospecção</span>`
        : '';

    const stars = r.rating ? _renderStars(r.rating) : '';
    const ratingText = r.rating ? `<span style="font-size:12px;font-weight:700;color:var(--text)">${r.rating.toFixed(1)}</span> ${stars} <span style="font-size:11px;color:var(--text-muted)">(${r.totalAvaliacoes || 0})</span>` : '';

    return `
      <div class="card" style="border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:box-shadow .15s"
        onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
        <div style="padding:16px">
          <!-- Header do card -->
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
            <div style="width:40px;height:40px;background:var(--primary-light,#eff6ff);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🏭</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:700;color:var(--text);line-height:1.3;margin-bottom:2px">${Utils.escHtml(r.nome || 'Empresa sem nome')}</div>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                ${statusLabel ? `<span style="font-size:10px;font-weight:700;color:${statusColor};background:${statusColor}18;padding:2px 8px;border-radius:99px">${statusLabel}</span>` : ''}
                ${dupBadge}
              </div>
            </div>
          </div>

          <!-- Dados da empresa -->
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
            ${r.endereco ? `
              <div style="display:flex;gap:6px;align-items:flex-start">
                <span style="flex-shrink:0;margin-top:1px">📍</span>
                <span style="font-size:12px;color:var(--text-muted)">${Utils.escHtml(r.endereco)}</span>
              </div>` : ''}
            ${r.telefone ? `
              <div style="display:flex;gap:6px;align-items:center">
                <span style="flex-shrink:0">📞</span>
                <a href="tel:${Utils.escHtml(r.telefone)}" style="font-size:12px;color:var(--primary);text-decoration:none">${Utils.escHtml(r.telefone)}</a>
              </div>` : ''}
            ${r.website ? `
              <div style="display:flex;gap:6px;align-items:center">
                <span style="flex-shrink:0">🌐</span>
                <a href="${Utils.escHtml(r.website)}" target="_blank" style="font-size:12px;color:var(--primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px">${Utils.escHtml(r.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>
              </div>` : ''}
            ${ratingText ? `
              <div style="display:flex;gap:6px;align-items:center">
                <span style="flex-shrink:0">⭐</span>
                <span>${ratingText}</span>
              </div>` : ''}
            ${r.categoria || r.categoriasBR?.length ? `
              <div style="display:flex;gap:6px;align-items:center">
                <span style="flex-shrink:0">🏷️</span>
                <span style="font-size:12px;color:var(--text-muted)">${Utils.escHtml(r.categoriasBR?.[0] || r.categoria || '')}</span>
              </div>` : ''}
          </div>

          <!-- Botões de ação -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px">
            <button class="btn btn-primary btn-sm" style="flex:1" ${dup.tipo === 'lead' ? 'disabled title="Já existe lead para esta empresa"' : ''} onclick="Prospeccao.adicionarLead(${idx})">
              💼 + Lead
            </button>
            <button class="btn btn-secondary btn-sm" style="flex:1" ${dup.tipo === 'cliente' ? 'disabled title="Já cadastrada como cliente"' : ''} onclick="Prospeccao.adicionarCliente(${idx})">
              🏢 + Cliente
            </button>
            ${r.website ? `
              <a href="${Utils.escHtml(r.website)}" target="_blank" class="btn btn-ghost btn-sm" title="Abrir site">
                🔗
              </a>` : ''}
          </div>
        </div>
      </div>`;
  }

  function _renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return (
      '<span style="color:#f59e0b;font-size:12px">' +
      '★'.repeat(full) +
      (half ? '½' : '') +
      '<span style="color:var(--border)">' + '★'.repeat(empty) + '</span>' +
      '</span>'
    );
  }

  function adicionarLead(idx) {
    const r = _resultados[idx];
    if (!r) return;

    const segmento = _mapSegmento(r.tipos || [r.categoria]);
    const obs = [
      r.endereco ? `Endereço: ${r.endereco}` : '',
      r.telefone ? `Telefone: ${r.telefone}` : '',
      r.website  ? `Site: ${r.website}` : '',
      r.rating   ? `Google: ⭐ ${r.rating} (${r.totalAvaliacoes || 0} avaliações)` : '',
      r.categoriasBR?.length ? `Categoria: ${r.categoriasBR.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // Abrir formulário de lead
    Pipeline.openForm(null, 'lead_identificado');

    // Preencher campos após o modal abrir
    setTimeout(() => {
      const fTitulo = document.getElementById('fTitulo');
      const fSegmento = document.getElementById('fSegmento');
      const fOrigem = document.getElementById('fOrigem');
      const fDecisor = document.getElementById('fDecisor');
      const fObs = document.getElementById('fObs');
      const fProximaAcao = document.getElementById('fProximaAcao');

      if (fTitulo) fTitulo.value = `Prospecção — ${r.nome}`;
      if (fSegmento) {
        // Tentar selecionar o segmento mais próximo
        const opts = Array.from(fSegmento.options).map(o => o.value.toLowerCase());
        const best = opts.find(o => o.includes(segmento.toLowerCase()) || segmento.toLowerCase().includes(o));
        if (best) fSegmento.value = Array.from(fSegmento.options).find(o => o.value.toLowerCase() === best)?.value || fSegmento.value;
      }
      if (fOrigem) fOrigem.value = 'Prospecção Ativa';
      if (fDecisor) fDecisor.value = '';
      if (fObs) fObs.value = obs;
      if (fProximaAcao) fProximaAcao.value = 'Primeiro contato — ligar ou enviar email';

      // Trigger onchange da origem para atualizar badge visual
      if (fOrigem) fOrigem.dispatchEvent(new Event('change'));

      Toast.show(`📋 Formulário preenchido para ${r.nome}`);
    }, 300);
  }

  function adicionarCliente(idx) {
    const r = _resultados[idx];
    if (!r) return;

    const segmento = _mapSegmento(r.tipos || [r.categoria]);

    // Extrair cidade e estado do endereço, se possível
    let cidade = '';
    let estado = '';
    if (r.endereco) {
      // Tentar extrair "Cidade - UF" do final do endereço
      const match = r.endereco.match(/,\s*([^,]+)\s*-\s*([A-Z]{2})\s*,?\s*Brasil\s*$/i)
        || r.endereco.match(/,\s*([^,]+)\s*-\s*([A-Z]{2})\s*$/i);
      if (match) {
        cidade = match[1].trim();
        estado = match[2].trim();
      }
    }

    // Abrir formulário de cliente
    Clientes.openForm(null);

    // Preencher campos após o modal abrir
    setTimeout(() => {
      const fNome = document.getElementById('fNome');
      const fSegmento = document.getElementById('fSegmento');
      const fTelefone = document.getElementById('fTelefone');
      const fSite = document.getElementById('fSite');
      const fCidade = document.getElementById('fCidade');
      const fEstado = document.getElementById('fEstado');
      const fObs = document.getElementById('fObs');

      if (fNome) fNome.value = r.nome || '';
      if (fTelefone) fTelefone.value = r.telefone || '';
      if (fSite) fSite.value = r.website || '';
      if (fCidade && cidade) fCidade.value = cidade;
      if (fEstado && estado) fEstado.value = estado;
      if (fObs) {
        const obs = [
          'Importado via Prospecção Google',
          r.rating ? `⭐ ${r.rating} (${r.totalAvaliacoes || 0} avaliações no Google)` : '',
          r.categoriasBR?.length ? `Categoria: ${r.categoriasBR.join(', ')}` : '',
        ].filter(Boolean).join('\n');
        fObs.value = obs;
      }
      if (fSegmento) {
        const opts = Array.from(fSegmento.options).map(o => o.value.toLowerCase());
        const best = opts.find(o => o.includes(segmento.toLowerCase()) || segmento.toLowerCase().includes(o));
        if (best) fSegmento.value = Array.from(fSegmento.options).find(o => o.value.toLowerCase() === best)?.value || fSegmento.value;
      }

      Toast.show(`📋 Formulário preenchido para ${r.nome}`);
    }, 300);
  }

  function _showAjuda() {
    Modal.open({
      title: '❓ Como usar a Prospecção',
      body: `
        <div style="font-size:14px;line-height:1.8;color:var(--text)">
          <div style="font-weight:700;font-size:15px;margin-bottom:12px">🔍 Como funciona</div>
          <p>Este módulo usa a <strong>Google Places API</strong> para encontrar empresas reais cadastradas no Google Meu Negócio na sua região.</p>

          <div style="font-weight:700;margin:16px 0 8px">📋 Passo a passo</div>
          <ol style="padding-left:20px;display:flex;flex-direction:column;gap:8px">
            <li><strong>Palavra-chave</strong>: Use termos como "indústria", "agroindústria", "metal mecânica", "frigorífico", "NR-12"</li>
            <li><strong>Estado + Cidade</strong>: Filtra empresas na região desejada</li>
            <li><strong>Raio</strong>: Distância em km ao redor do centro da cidade</li>
            <li>Clique em <strong>"🔍 Buscar Empresas"</strong></li>
            <li>Nos resultados, clique em <strong>"💼 + Lead"</strong> ou <strong>"🏢 + Cliente"</strong> para adicionar ao CRM</li>
          </ol>

          <div style="font-weight:700;margin:16px 0 8px">⚙️ Requisitos</div>
          <p>Para funcionar, a <strong>Google Places API Key</strong> precisa estar configurada como secret na Edge Function do Supabase.</p>
          <p style="margin-top:8px">Se aparecer aviso de "Configuração necessária", acesse o Supabase Dashboard → Edge Functions → crm-prospeccao → Secrets e adicione a chave <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px">GOOGLE_PLACES_API_KEY</code>.</p>
        </div>
      `,
      saveCb: null,
    });
  }

  return { render, buscar, adicionarLead, adicionarCliente, _onKeywordChange, _onKeywordCustom, _showAjuda };
})();
