/* ==========================================
   Marketing.js — Módulo de Marketing & Conteúdo
   ========================================== */
const Marketing = (() => {

  /* ---- Constantes ---- */
  const CANAIS = ['LinkedIn','Instagram','YouTube','Google Meu Negócio','Site/Blog'];
  const CANAL_ICONS = { 'LinkedIn':'💼','Instagram':'📸','YouTube':'▶️','Google Meu Negócio':'📍','Site/Blog':'🌐' };
  const CANAL_COLORS = { 'LinkedIn':'#0077B5','Instagram':'#E1306C','YouTube':'#FF0000','Google Meu Negócio':'#4285F4','Site/Blog':'#059669' };
  const FORMATOS = ['Post Imagem','Carrossel','Vídeo Curto (Reels/Shorts)','Vídeo Longo','Artigo/Blog','Story','Notícia (GMN)','Outro'];
  const PILARES = ['Segurança do Trabalho','Engenharia e Projetos','Cases e Resultados','Equipe e Cultura','Dicas Técnicas','Licitações','Outro'];
  const STATUS_POST = ['ideia','rascunho','agendado','publicado','pausado'];
  const STATUS_CORES = { ideia:'#94a3b8', rascunho:'#d97706', agendado:'#2563eb', publicado:'#059669', pausado:'#dc2626' };
  const PRIORIDADES = ['alta','media','baixa'];
  const PRIOR_ICONS = { alta:'🔴', media:'🟡', baixa:'🟢' };

  /* ---- Estado ---- */
  let _tab = 'calendario';
  let _filtroCanal = '';
  let _filtroStatus = '';
  let _filtroMes = new Date().toISOString().slice(0,7);
  let _filtroIdeiaCanal = '';
  let _filtroIdeiaPilar = '';
  let _filtroIdeiaPrior = '';
  let _kpiMes = new Date().toISOString().slice(0,7);

  /* ====================================================
     RENDER PRINCIPAL
     ==================================================== */
  function render() {
    const el = document.getElementById('pageContent');
    if (!el) return;
    el.innerHTML = `
      <div class="sec-header" style="margin-bottom:0">
        <div>
          <h2 class="sec-title">Marketing & Conteúdo</h2>
          <p style="font-size:12px;color:var(--text-muted);margin-top:2px">Calendário editorial, campanhas, KPIs e estratégia de conteúdo</p>
        </div>
      </div>

      <div class="tabs" style="margin:16px 0 0 0">
        ${[
          {id:'calendario', label:'📅 Calendário'},
          {id:'campanhas',  label:'🚀 Campanhas'},
          {id:'ideias',     label:'💡 Banco de Ideias'},
          {id:'kpis',       label:'📊 KPIs'},
          {id:'estrategia', label:'🎯 Estratégia'},
        ].map(t => `<button class="tab-btn${_tab===t.id?' active':''}" onclick="Marketing._setTab('${t.id}')">${t.label}</button>`).join('')}
      </div>

      <div id="mktContent" style="margin-top:16px"></div>
    `;
    _renderTab();
  }

  function _setTab(tab) {
    _tab = tab;
    render();
  }

  function _renderTab() {
    if (_tab === 'calendario')  _renderCalendario();
    else if (_tab === 'campanhas')   _renderCampanhas();
    else if (_tab === 'ideias')      _renderIdeias();
    else if (_tab === 'kpis')        _renderKpis();
    else if (_tab === 'estrategia')  _renderEstrategia();
  }

  /* ====================================================
     TAB: CALENDÁRIO
     ==================================================== */
  function _renderCalendario() {
    const el = document.getElementById('mktContent');
    if (!el) return;

    const posts = DB.getAll('marketing_posts');

    // Filtro por mês
    const postsMes = posts.filter(p => {
      const d = (p.data || '').slice(0,7);
      return d === _filtroMes;
    });

    // Aplicar filtros adicionais
    let filtrados = postsMes;
    if (_filtroCanal) filtrados = filtrados.filter(p => p.canal === _filtroCanal);
    if (_filtroStatus) filtrados = filtrados.filter(p => p.status === _filtroStatus);

    // Ordenar por data
    filtrados = filtrados.sort((a,b) => (a.data||'').localeCompare(b.data||''));

    // KPIs
    const total = postsMes.length;
    const publicados = postsMes.filter(p => p.status === 'publicado').length;
    const agendados = postsMes.filter(p => p.status === 'agendado').length;
    const afazer = postsMes.filter(p => ['ideia','rascunho'].includes(p.status)).length;

    el.innerHTML = `
      <!-- KPI Row -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-value">${total}</div><div class="kpi-label">Total no mês</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:var(--success)">${publicados}</div><div class="kpi-label">Publicados</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:#2563eb">${agendados}</div><div class="kpi-label">Agendados</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:var(--warning)">${afazer}</div><div class="kpi-label">A fazer</div></div>
      </div>

      <!-- Filtros + Ações -->
      <div class="filters" style="margin-bottom:14px;flex-wrap:wrap;gap:8px;align-items:center">
        <input type="month" class="form-input" style="width:160px" value="${_filtroMes}"
          onchange="Marketing._setFiltroMes(this.value)">
        <select class="form-input" style="width:160px" onchange="Marketing._setFiltroCanal(this.value)">
          <option value="">Todos os canais</option>
          ${CANAIS.map(c => `<option value="${c}"${_filtroCanal===c?' selected':''}>${CANAL_ICONS[c]} ${c}</option>`).join('')}
        </select>
        <select class="form-input" style="width:150px" onchange="Marketing._setFiltroStatus(this.value)">
          <option value="">Todos os status</option>
          ${STATUS_POST.map(s => `<option value="${s}"${_filtroStatus===s?' selected':''}>${s}</option>`).join('')}
        </select>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" onclick="Marketing._downloadTemplate()">⬇ Template CSV</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">
          📥 Importar CSV
          <input type="file" accept=".csv" style="display:none" onchange="Marketing._importCSV(event)">
        </label>
        <button class="btn btn-primary btn-sm" onclick="Marketing.openPostForm()">+ Novo Post</button>
      </div>

      <!-- Lista de posts -->
      ${filtrados.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <div class="empty-title">Nenhum conteúdo planejado para este mês</div>
          <div class="empty-sub">Clique em "+ Novo Post" para começar a preencher o calendário.</div>
        </div>
      ` : filtrados.map(p => _renderPostCard(p)).join('')}
    `;
  }

  function _renderPostCard(p) {
    const cor = CANAL_COLORS[p.canal] || '#64748b';
    const icon = CANAL_ICONS[p.canal] || '📢';
    const statusCor = STATUS_CORES[p.status] || '#94a3b8';
    const dataFmt = p.data ? Utils.formatDate(p.data) : '—';
    return `
      <div class="mkt-post-card">
        <div class="mkt-post-date">${dataFmt}</div>
        <span class="canal-badge" style="background:${cor}">${icon} ${Utils.escHtml(p.canal||'—')}</span>
        <div class="mkt-post-title">${Utils.escHtml(Utils.truncate(p.titulo||'Sem título',60))}</div>
        <div class="mkt-post-meta">
          ${p.formato ? `<span class="pilar-badge">${Utils.escHtml(p.formato)}</span>` : ''}
          ${p.pilar ? `<span class="pilar-badge" style="background:#f0fdf4;color:#059669">${Utils.escHtml(p.pilar)}</span>` : ''}
          <span class="status-post-badge" style="background:${statusCor}">${p.status||'—'}</span>
        </div>
        <div class="tbl-actions">
          <button class="btn-icon" title="Editar" onclick="Marketing.openPostForm('${p.id}')">✏</button>
          <button class="btn-icon" title="Duplicar" onclick="Marketing.duplicatePost('${p.id}')">📋</button>
          <button class="btn-icon text-danger" title="Excluir" onclick="Marketing.deletePost('${p.id}')">🗑</button>
        </div>
      </div>
    `;
  }

  function _setFiltroMes(v) { _filtroMes = v; _renderCalendario(); }
  function _setFiltroCanal(v) { _filtroCanal = v; _renderCalendario(); }
  function _setFiltroStatus(v) { _filtroStatus = v; _renderCalendario(); }

  /* ---- Form de Post ---- */
  function openPostForm(id) {
    const post = id ? DB.get('marketing_posts', id) : null;
    const HORARIOS = { 'LinkedIn':'08:00','Instagram':'19:00','YouTube':'12:00','Google Meu Negócio':'09:00','Site/Blog':'10:00' };

    const body = `
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Título *</label>
          <input class="form-input" id="postTitulo" value="${Utils.escHtml(post?.titulo||'')}" placeholder="Ex: Como a NR-12 protege sua empresa">
        </div>
        <div class="form-group">
          <label class="form-label">Canal</label>
          <select class="form-input" id="postCanal" onchange="Marketing._updateHorario()">
            ${CANAIS.map(c => `<option value="${c}"${(post?.canal||'LinkedIn')===c?' selected':''}>${CANAL_ICONS[c]} ${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Formato</label>
          <select class="form-input" id="postFormato">
            ${FORMATOS.map(f => `<option value="${f}"${post?.formato===f?' selected':''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Pilar de Conteúdo</label>
          <select class="form-input" id="postPilar">
            ${PILARES.map(p2 => `<option value="${p2}"${post?.pilar===p2?' selected':''}>${p2}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-input" id="postStatus">
            ${STATUS_POST.map(s => `<option value="${s}"${(post?.status||'rascunho')===s?' selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Data de publicação</label>
          <input class="form-input" type="date" id="postData" value="${post?.data||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Horário sugerido</label>
          <input class="form-input" type="time" id="postHorario" value="${post?.horario||(HORARIOS[post?.canal]||'08:00')}">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Descrição / Legenda</label>
          <textarea class="form-input" id="postDescricao" rows="4" placeholder="Texto do post...">${Utils.escHtml(post?.descricao||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Hashtags</label>
          <input class="form-input" id="postHashtags" value="${Utils.escHtml(post?.hashtags||'')}" placeholder="#NR12 #SegurancaDoTrabalho">
        </div>
        <div class="form-group">
          <label class="form-label">CTA — Call to Action</label>
          <input class="form-input" id="postCta" value="${Utils.escHtml(post?.cta||'')}" placeholder="Ex: Acesse o link na bio">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Link</label>
          <input class="form-input" type="url" id="postLink" value="${Utils.escHtml(post?.link||'')}" placeholder="https://...">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Observações</label>
          <textarea class="form-input" id="postObs" rows="2" placeholder="Notas internas...">${Utils.escHtml(post?.observacoes||'')}</textarea>
        </div>
      </div>
    `;

    Modal.open({
      title: id ? 'Editar Post' : 'Novo Post',
      body,
      size: 'modal-lg',
      onSave: () => {
        const titulo = document.getElementById('postTitulo')?.value.trim();
        if (!titulo) { Toast.error('Informe o título do post'); return; }
        const data = {
          titulo,
          canal:      document.getElementById('postCanal')?.value,
          formato:    document.getElementById('postFormato')?.value,
          pilar:      document.getElementById('postPilar')?.value,
          status:     document.getElementById('postStatus')?.value,
          data:       document.getElementById('postData')?.value,
          horario:    document.getElementById('postHorario')?.value,
          descricao:  document.getElementById('postDescricao')?.value,
          hashtags:   document.getElementById('postHashtags')?.value,
          cta:        document.getElementById('postCta')?.value,
          link:       document.getElementById('postLink')?.value,
          observacoes:document.getElementById('postObs')?.value,
        };
        if (id) {
          DB.update('marketing_posts', id, data);
          Toast.success('Post atualizado!');
        } else {
          DB.create('marketing_posts', data);
          Toast.success('Post criado!');
        }
        Modal.close();
        if (_tab === 'calendario') _renderCalendario();
      }
    });
  }

  function _updateHorario() {
    const HORARIOS = { 'LinkedIn':'08:00','Instagram':'19:00','YouTube':'12:00','Google Meu Negócio':'09:00','Site/Blog':'10:00' };
    const canal = document.getElementById('postCanal')?.value;
    const horEl = document.getElementById('postHorario');
    if (horEl && canal && HORARIOS[canal]) horEl.value = HORARIOS[canal];
  }

  function duplicatePost(id) {
    const post = DB.get('marketing_posts', id);
    if (!post) return;
    const novaData = post.data ? (() => {
      const d = new Date(post.data + 'T12:00:00');
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    })() : '';
    DB.create('marketing_posts', { ...post, id: undefined, titulo: post.titulo + ' (cópia)', status: 'rascunho', data: novaData });
    Toast.success('Post duplicado!');
    _renderCalendario();
  }

  function deletePost(id) {
    const post = DB.get('marketing_posts', id);
    Confirm.show({
      title: 'Excluir post',
      msg: `Excluir "${post?.titulo || 'este post'}"? Esta ação não pode ser desfeita.`,
      onConfirm: () => {
        DB.remove('marketing_posts', id);
        Toast.success('Post excluído.');
        _renderCalendario();
      }
    });
  }

  function _importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { Toast.error('CSV vazio ou sem dados.'); return; }
      let count = 0;
      // Pular header
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';');
        if (cols.length < 3) continue;
        const [data, canal, titulo, descricao, formato, pilar, status, hashtags, cta] = cols.map(c => c.trim());
        if (!titulo) continue;
        DB.create('marketing_posts', {
          data: data||'',
          canal: CANAIS.includes(canal) ? canal : 'LinkedIn',
          titulo,
          descricao: descricao||'',
          formato: FORMATOS.includes(formato) ? formato : 'Post Imagem',
          pilar: PILARES.includes(pilar) ? pilar : 'Outro',
          status: STATUS_POST.includes(status) ? status : 'rascunho',
          hashtags: hashtags||'',
          cta: cta||'',
        });
        count++;
      }
      Toast.success(`${count} post(s) importado(s) com sucesso!`);
      _renderCalendario();
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
  }

  function _downloadTemplate() {
    const header = 'data;canal;titulo;descricao;formato;pilar;status;hashtags;cta';
    const ex1 = `${new Date().toISOString().split('T')[0]};LinkedIn;Como a NR-12 protege sua empresa;Texto do post aqui...;Post Imagem;Segurança do Trabalho;rascunho;#NR12 #Segurança;Fale com a Bikows`;
    const ex2 = `${new Date().toISOString().split('T')[0]};Instagram;Case: Projeto de linha de vida;Descrevemos o projeto...;Carrossel;Cases e Resultados;ideia;#Engenharia #Cases;Ver portfólio no link`;
    const csv = [header, ex1, ex2].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'template_posts_marketing.csv'; a.click();
    URL.revokeObjectURL(url);
    Toast.info('Template CSV baixado!');
  }

  /* ====================================================
     TAB: CAMPANHAS
     ==================================================== */
  function _renderCampanhas() {
    const el = document.getElementById('mktContent');
    if (!el) return;

    const campanhas = DB.getAll('marketing_campanhas');

    const total = campanhas.length;
    const ativas = campanhas.filter(c => c.status === 'ativa').length;
    const concluidas = campanhas.filter(c => c.status === 'concluída').length;
    const budget = campanhas.reduce((acc, c) => acc + (parseFloat(c.orcamento)||0), 0);

    el.innerHTML = `
      <!-- KPIs -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-value">${total}</div><div class="kpi-label">Total campanhas</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:var(--success)">${ativas}</div><div class="kpi-label">Ativas</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:#64748b">${concluidas}</div><div class="kpi-label">Concluídas</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:var(--primary)">${Utils.formatCurrency(budget)}</div><div class="kpi-label">Budget total</div></div>
      </div>

      <!-- Ações -->
      <div class="filters" style="margin-bottom:14px">
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" onclick="Marketing.openCampanhaForm()">+ Nova Campanha</button>
      </div>

      <!-- Cards -->
      ${campanhas.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🚀</div>
          <div class="empty-title">Nenhuma campanha cadastrada</div>
          <div class="empty-sub">Crie sua primeira campanha de marketing.</div>
        </div>
      ` : `<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
        ${campanhas.map(c => _renderCampanhaCard(c)).join('')}
      </div>`}
    `;
  }

  function _renderCampanhaCard(c) {
    const STATUS_CAMP_CORES = { planejada:'#94a3b8', ativa:'#059669', pausada:'#d97706', 'concluída':'#2563eb', cancelada:'#dc2626' };
    const cor = STATUS_CAMP_CORES[c.status] || '#94a3b8';
    const orcamento = parseFloat(c.orcamento)||0;
    const gasto = parseFloat(c.gasto)||0;
    const pct = orcamento > 0 ? Math.min(100, Math.round(gasto/orcamento*100)) : 0;
    const canais = (c.canais||[]).map(cn => `<span class="canal-badge" style="background:${CANAL_COLORS[cn]||'#64748b'};font-size:10px">${CANAL_ICONS[cn]||''} ${cn}</span>`).join(' ');

    return `
      <div class="campanha-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text)">${Utils.escHtml(c.nome||'—')}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${Utils.escHtml(Utils.truncate(c.objetivo||'',50))}</div>
          </div>
          <span class="status-post-badge" style="background:${cor}">${c.status||'—'}</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
          📅 ${c.dataInicio ? Utils.formatDate(c.dataInicio) : '—'} → ${c.dataFim ? Utils.formatDate(c.dataFim) : '—'}
        </div>
        <div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px">${canais}</div>
        ${orcamento > 0 ? `
          <div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
              <span style="color:var(--text-muted)">Budget: ${Utils.formatCurrency(orcamento)}</span>
              <span style="color:var(--text-muted)">Gasto: ${Utils.formatCurrency(gasto)} (${pct}%)</span>
            </div>
            <div style="height:4px;background:var(--border);border-radius:2px">
              <div style="height:100%;width:${pct}%;background:${pct>80?'#dc2626':'#2563eb'};border-radius:2px"></div>
            </div>
          </div>
        ` : ''}
        ${c.leads ? `<div style="font-size:12px;color:var(--success);margin-bottom:8px">🎯 ${c.leads} leads gerados</div>` : ''}
        <div class="tbl-actions" style="justify-content:flex-end">
          <button class="btn-icon" onclick="Marketing.viewCampanha('${c.id}')">👁</button>
          <button class="btn-icon" onclick="Marketing.openCampanhaForm('${c.id}')">✏</button>
          <button class="btn-icon text-danger" onclick="Marketing.deleteCampanha('${c.id}')">🗑</button>
        </div>
      </div>
    `;
  }

  function openCampanhaForm(id) {
    const c = id ? DB.get('marketing_campanhas', id) : null;
    const STATUS_CAMP = ['planejada','ativa','pausada','concluída','cancelada'];

    const body = `
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Nome da Campanha *</label>
          <input class="form-input" id="campNome" value="${Utils.escHtml(c?.nome||'')}" placeholder="Ex: Campanha NR-12 Maio 2026">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Objetivo</label>
          <input class="form-input" id="campObj" value="${Utils.escHtml(c?.objetivo||'')}" placeholder="Ex: Gerar 20 leads qualificados">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Canais</label>
          <div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px;background:var(--bg);border-radius:8px">
            ${CANAIS.map(cn => `
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                <input type="checkbox" id="campCanal_${cn.replace(/\s/g,'_')}" ${(c?.canais||[]).includes(cn)?'checked':''}>
                ${CANAL_ICONS[cn]} ${cn}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Data Início</label>
          <input class="form-input" type="date" id="campInicio" value="${c?.dataInicio||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Data Fim</label>
          <input class="form-input" type="date" id="campFim" value="${c?.dataFim||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-input" id="campStatus">
            ${STATUS_CAMP.map(s => `<option value="${s}"${(c?.status||'planejada')===s?' selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Orçamento (R$)</label>
          <input class="form-input" type="number" id="campOrc" value="${c?.orcamento||''}" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">Gasto Real (R$)</label>
          <input class="form-input" type="number" id="campGasto" value="${c?.gasto||''}" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">Leads gerados</label>
          <input class="form-input" type="number" id="campLeads" value="${c?.leads||''}" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">Alcance estimado</label>
          <input class="form-input" type="number" id="campAlcance" value="${c?.alcance||''}" placeholder="0">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Descrição</label>
          <textarea class="form-input" id="campDesc" rows="3">${Utils.escHtml(c?.descricao||'')}</textarea>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Observações</label>
          <textarea class="form-input" id="campObs" rows="2">${Utils.escHtml(c?.observacoes||'')}</textarea>
        </div>
      </div>
    `;

    Modal.open({
      title: id ? 'Editar Campanha' : 'Nova Campanha',
      body,
      size: 'modal-lg',
      onSave: () => {
        const nome = document.getElementById('campNome')?.value.trim();
        if (!nome) { Toast.error('Informe o nome da campanha'); return; }
        const canaisSel = CANAIS.filter(cn => document.getElementById('campCanal_'+cn.replace(/\s/g,'_'))?.checked);
        const data = {
          nome,
          objetivo:    document.getElementById('campObj')?.value,
          canais:      canaisSel,
          dataInicio:  document.getElementById('campInicio')?.value,
          dataFim:     document.getElementById('campFim')?.value,
          status:      document.getElementById('campStatus')?.value,
          orcamento:   parseFloat(document.getElementById('campOrc')?.value)||0,
          gasto:       parseFloat(document.getElementById('campGasto')?.value)||0,
          leads:       parseInt(document.getElementById('campLeads')?.value)||0,
          alcance:     parseInt(document.getElementById('campAlcance')?.value)||0,
          descricao:   document.getElementById('campDesc')?.value,
          observacoes: document.getElementById('campObs')?.value,
        };
        if (id) { DB.update('marketing_campanhas', id, data); Toast.success('Campanha atualizada!'); }
        else    { DB.create('marketing_campanhas', data); Toast.success('Campanha criada!'); }
        Modal.close();
        _renderCampanhas();
      }
    });
  }

  function viewCampanha(id) {
    const c = DB.get('marketing_campanhas', id);
    if (!c) return;
    const canais = (c.canais||[]).map(cn => `<span class="canal-badge" style="background:${CANAL_COLORS[cn]||'#64748b'}">${CANAL_ICONS[cn]||''} ${cn}</span>`).join(' ');
    Modal.open({
      title: c.nome || 'Campanha',
      size: 'modal-lg',
      body: `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="estrategia-section">
            <div class="estrategia-section-title">Objetivo</div>
            <div class="estrategia-section-content">${Utils.escHtml(c.objetivo||'—')}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div><span class="form-label">Período</span><div class="font-bold">${c.dataInicio?Utils.formatDate(c.dataInicio):'—'} → ${c.dataFim?Utils.formatDate(c.dataFim):'—'}</div></div>
            <div><span class="form-label">Status</span><div>${c.status||'—'}</div></div>
            <div><span class="form-label">Orçamento</span><div class="font-bold">${Utils.formatCurrency(c.orcamento||0)}</div></div>
            <div><span class="form-label">Gasto Real</span><div class="font-bold" style="color:${(c.gasto||0)>(c.orcamento||0)?'var(--danger)':'var(--success)'}">${Utils.formatCurrency(c.gasto||0)}</div></div>
            <div><span class="form-label">Leads Gerados</span><div class="font-bold">${c.leads||0}</div></div>
            <div><span class="form-label">Alcance Estimado</span><div class="font-bold">${(c.alcance||0).toLocaleString('pt-BR')}</div></div>
          </div>
          <div><span class="form-label">Canais</span><div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${canais||'—'}</div></div>
          ${c.descricao ? `<div class="estrategia-section"><div class="estrategia-section-title">Descrição</div><div class="estrategia-section-content">${Utils.escHtml(c.descricao)}</div></div>` : ''}
          ${c.observacoes ? `<div class="estrategia-section"><div class="estrategia-section-title">Observações</div><div class="estrategia-section-content">${Utils.escHtml(c.observacoes)}</div></div>` : ''}
        </div>
      `
    });
  }

  function deleteCampanha(id) {
    const c = DB.get('marketing_campanhas', id);
    Confirm.show({
      title: 'Excluir campanha',
      msg: `Excluir "${c?.nome || 'esta campanha'}"?`,
      onConfirm: () => { DB.remove('marketing_campanhas', id); Toast.success('Campanha excluída.'); _renderCampanhas(); }
    });
  }

  /* ====================================================
     TAB: BANCO DE IDEIAS
     ==================================================== */
  function _renderIdeias() {
    const el = document.getElementById('mktContent');
    if (!el) return;

    let ideias = DB.getAll('marketing_ideias');

    if (_filtroIdeiaCanal) ideias = ideias.filter(i => i.canal === _filtroIdeiaCanal);
    if (_filtroIdeiaPilar) ideias = ideias.filter(i => i.pilar === _filtroIdeiaPilar);
    if (_filtroIdeiaPrior) ideias = ideias.filter(i => i.prioridade === _filtroIdeiaPrior);

    // Ordenar: alta → media → baixa
    const priorOrd = { alta:0, media:1, baixa:2 };
    ideias = ideias.sort((a,b) => (priorOrd[a.prioridade]??3) - (priorOrd[b.prioridade]??3));

    el.innerHTML = `
      <!-- Filtros -->
      <div class="filters" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <select class="form-input" style="width:160px" onchange="Marketing._setFiltroIdeiaCanal(this.value)">
          <option value="">Todos os canais</option>
          ${CANAIS.map(c => `<option value="${c}"${_filtroIdeiaCanal===c?' selected':''}>${CANAL_ICONS[c]} ${c}</option>`).join('')}
        </select>
        <select class="form-input" style="width:180px" onchange="Marketing._setFiltroIdeiaPilar(this.value)">
          <option value="">Todos os pilares</option>
          ${PILARES.map(p => `<option value="${p}"${_filtroIdeiaPilar===p?' selected':''}>${p}</option>`).join('')}
        </select>
        <select class="form-input" style="width:140px" onchange="Marketing._setFiltroIdeiaPrior(this.value)">
          <option value="">Toda prioridade</option>
          ${PRIORIDADES.map(p => `<option value="${p}"${_filtroIdeiaPrior===p?' selected':''}>${PRIOR_ICONS[p]} ${p}</option>`).join('')}
        </select>
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" onclick="Marketing.openIdeiaForm()">+ Nova Ideia</button>
      </div>

      ${ideias.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">💡</div>
          <div class="empty-title">Banco de ideias vazio</div>
          <div class="empty-sub">Registre suas ideias de conteúdo para não perder nada.</div>
        </div>
      ` : ideias.map(i => _renderIdeiaCard(i)).join('')}
    `;
  }

  function _renderIdeiaCard(i) {
    const cor = CANAL_COLORS[i.canal] || '#64748b';
    const icon = CANAL_ICONS[i.canal] || '📢';
    const priorIcon = PRIOR_ICONS[i.prioridade] || '⚪';
    const borderCor = i.prioridade === 'alta' ? '#dc2626' : i.prioridade === 'media' ? '#d97706' : '#059669';
    return `
      <div class="ideia-card" style="border-left-color:${borderCor}">
        <div style="font-size:16px">${priorIcon}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${Utils.escHtml(Utils.truncate(i.titulo||'—',60))}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${Utils.escHtml(i.pilar||'')}</div>
        </div>
        <div class="mkt-post-meta">
          <span class="canal-badge" style="background:${cor}">${icon} ${Utils.escHtml(i.canal||'—')}</span>
          ${i.formato ? `<span class="pilar-badge">${Utils.escHtml(i.formato)}</span>` : ''}
        </div>
        <div class="tbl-actions">
          <button class="btn-icon" title="Editar" onclick="Marketing.openIdeiaForm('${i.id}')">✏</button>
          <button class="btn-icon" title="Usar como post" onclick="Marketing.usarIdeia('${i.id}')">➡</button>
          <button class="btn-icon text-danger" title="Excluir" onclick="Marketing.deleteIdeia('${i.id}')">🗑</button>
        </div>
      </div>
    `;
  }

  function _setFiltroIdeiaCanal(v) { _filtroIdeiaCanal = v; _renderIdeias(); }
  function _setFiltroIdeiaPilar(v) { _filtroIdeiaPilar = v; _renderIdeias(); }
  function _setFiltroIdeiaPrior(v) { _filtroIdeiaPrior = v; _renderIdeias(); }

  function openIdeiaForm(id) {
    const ideia = id ? DB.get('marketing_ideias', id) : null;
    const body = `
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Título *</label>
          <input class="form-input" id="ideiaTitle" value="${Utils.escHtml(ideia?.titulo||'')}" placeholder="Ex: Vídeo sobre proteção de máquinas">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Descrição</label>
          <textarea class="form-input" id="ideiaDesc" rows="3" placeholder="Detalhe a ideia...">${Utils.escHtml(ideia?.descricao||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Canal</label>
          <select class="form-input" id="ideiaCanal">
            ${CANAIS.map(c => `<option value="${c}"${(ideia?.canal||'LinkedIn')===c?' selected':''}>${CANAL_ICONS[c]} ${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Formato</label>
          <select class="form-input" id="ideiaFormato">
            ${FORMATOS.map(f => `<option value="${f}"${ideia?.formato===f?' selected':''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Pilar de Conteúdo</label>
          <select class="form-input" id="ideiaPilar">
            ${PILARES.map(p => `<option value="${p}"${ideia?.pilar===p?' selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridade</label>
          <select class="form-input" id="ideiaPrior">
            ${PRIORIDADES.map(p => `<option value="${p}"${(ideia?.prioridade||'media')===p?' selected':''}>${PRIOR_ICONS[p]} ${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tags</label>
          <input class="form-input" id="ideiaTags" value="${Utils.escHtml(ideia?.tags||'')}" placeholder="tag1, tag2">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Observações</label>
          <textarea class="form-input" id="ideiaObs" rows="2">${Utils.escHtml(ideia?.observacoes||'')}</textarea>
        </div>
      </div>
    `;

    Modal.open({
      title: id ? 'Editar Ideia' : 'Nova Ideia',
      body,
      size: 'modal-lg',
      onSave: () => {
        const titulo = document.getElementById('ideiaTitle')?.value.trim();
        if (!titulo) { Toast.error('Informe o título'); return; }
        const data = {
          titulo,
          descricao:   document.getElementById('ideiaDesc')?.value,
          canal:       document.getElementById('ideiaCanal')?.value,
          formato:     document.getElementById('ideiaFormato')?.value,
          pilar:       document.getElementById('ideiaPilar')?.value,
          prioridade:  document.getElementById('ideiaPrior')?.value,
          tags:        document.getElementById('ideiaTags')?.value,
          observacoes: document.getElementById('ideiaObs')?.value,
        };
        if (id) { DB.update('marketing_ideias', id, data); Toast.success('Ideia atualizada!'); }
        else    { DB.create('marketing_ideias', data); Toast.success('Ideia registrada!'); }
        Modal.close();
        _renderIdeias();
      }
    });
  }

  function usarIdeia(id) {
    const ideia = DB.get('marketing_ideias', id);
    if (!ideia) return;
    Confirm.show({
      title: 'Converter em post',
      msg: `Converter "${ideia.titulo}" em rascunho de post e remover do banco de ideias?`,
      onConfirm: () => {
        DB.create('marketing_posts', {
          titulo:    ideia.titulo,
          descricao: ideia.descricao||'',
          canal:     ideia.canal,
          formato:   ideia.formato,
          pilar:     ideia.pilar,
          status:    'rascunho',
          hashtags:  '',
          cta:       '',
          link:      '',
          observacoes: ideia.observacoes||'',
        });
        DB.remove('marketing_ideias', id);
        Toast.success('Ideia convertida em post!');
        _tab = 'calendario';
        render();
      }
    });
  }

  function deleteIdeia(id) {
    const i = DB.get('marketing_ideias', id);
    Confirm.show({
      title: 'Excluir ideia',
      msg: `Excluir "${i?.titulo || 'esta ideia'}"?`,
      onConfirm: () => { DB.remove('marketing_ideias', id); Toast.success('Ideia excluída.'); _renderIdeias(); }
    });
  }

  /* ====================================================
     TAB: KPIs
     ==================================================== */
  const KPI_METRICAS = {
    'LinkedIn':              ['Seguidores','Posts publicados','Alcance médio','Engajamento médio (%)'],
    'Instagram':             ['Seguidores','Posts + Stories','Alcance','Engajamento (%)'],
    'YouTube':               ['Inscritos','Vídeos publicados','Visualizações totais'],
    'Google Meu Negócio':    ['Visualizações','Cliques no site','Ligações recebidas','Avaliação (estrelas)'],
    'Site/Blog':             ['Sessões','Usuários únicos','Pageviews','Leads gerados'],
  };

  function _renderKpis() {
    const el = document.getElementById('mktContent');
    if (!el) return;

    const kpis = DB.getAll('marketing_kpis');
    const mesKpi = kpis.find(k => k.mes === _kpiMes && k.tipo !== 'estrategia') || {};

    const [ano, mesN] = _kpiMes.split('-').map(Number);
    const mesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const mesNome = mesNomes[(mesN||1)-1] + ' ' + ano;

    // Calcular leads totais do mês
    const leadsTotal = CANAIS.reduce((acc, canal) => {
      const cData = mesKpi[canal] || {};
      if (canal === 'Site/Blog' && cData['Leads gerados']) return acc + parseInt(cData['Leads gerados']||0);
      return acc;
    }, 0);

    el.innerHTML = `
      <!-- Seletor de mês -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <button class="btn btn-ghost btn-sm" onclick="Marketing._kpiMesAnterior()">← Mês anterior</button>
        <span style="font-size:15px;font-weight:700;color:var(--text)">${mesNome}</span>
        <button class="btn btn-ghost btn-sm" onclick="Marketing._kpiMesPosterior()">Próximo mês →</button>
        <div style="flex:1"></div>
        ${leadsTotal > 0 ? `<div class="kpi-card" style="padding:8px 16px"><span style="font-size:13px;color:var(--text-muted)">Leads totais: </span><strong style="color:var(--success)">${leadsTotal}</strong></div>` : ''}
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
        ${CANAIS.map(canal => _renderKpiCanalCard(canal, mesKpi[canal]||{}, _kpiMes)).join('')}
      </div>
    `;
  }

  function _renderKpiCanalCard(canal, dados, mes) {
    const icon = CANAL_ICONS[canal] || '📊';
    const cor  = CANAL_COLORS[canal] || '#64748b';
    const metricas = KPI_METRICAS[canal] || [];

    return `
      <div class="kpi-canal-card">
        <div class="kpi-canal-header">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:22px">${icon}</span>
            <span style="font-size:13px;font-weight:700;color:${cor}">${canal}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="Marketing.editKpi('${mes}','${canal}')">✏ Editar</button>
        </div>
        ${metricas.map(m => `
          <div class="kpi-canal-metric">
            <span class="kpi-canal-metric-label">${m}</span>
            <span class="kpi-canal-metric-value">${dados[m] !== undefined ? Number(dados[m]).toLocaleString('pt-BR') : <span style="color:var(--text-muted);font-size:13px">—</span>}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function _kpiMesAnterior() {
    const [ano, mes] = _kpiMes.split('-').map(Number);
    const d = new Date(ano, mes-2, 1);
    _kpiMes = d.toISOString().slice(0,7);
    _renderKpis();
  }

  function _kpiMesPosterior() {
    const [ano, mes] = _kpiMes.split('-').map(Number);
    const d = new Date(ano, mes, 1);
    _kpiMes = d.toISOString().slice(0,7);
    _renderKpis();
  }

  function editKpi(mes, canal) {
    const kpis = DB.getAll('marketing_kpis');
    const existente = kpis.find(k => k.mes === mes && k.tipo !== 'estrategia');
    const dados = existente ? (existente[canal]||{}) : {};
    const metricas = KPI_METRICAS[canal] || [];

    const body = `
      <div style="margin-bottom:8px;font-size:13px;color:var(--text-muted)">Canal: <strong style="color:${CANAL_COLORS[canal]}">${CANAL_ICONS[canal]} ${canal}</strong> — Mês: <strong>${mes}</strong></div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px">
        ${metricas.map(m => `
          <div class="form-group">
            <label class="form-label">${m}</label>
            <input class="form-input" type="number" id="kpi_${m.replace(/[^a-zA-Z0-9]/g,'_')}" value="${dados[m]||''}" placeholder="0">
          </div>
        `).join('')}
      </div>
    `;

    Modal.open({
      title: `KPIs — ${canal}`,
      body,
      onSave: () => {
        const novosDados = {};
        metricas.forEach(m => {
          const v = document.getElementById('kpi_'+m.replace(/[^a-zA-Z0-9]/g,'_'))?.value;
          novosDados[m] = v ? parseFloat(v) : undefined;
        });

        if (existente) {
          DB.update('marketing_kpis', existente.id, { ...existente, [canal]: novosDados });
        } else {
          DB.create('marketing_kpis', { mes, tipo: 'mensal', [canal]: novosDados });
        }
        Toast.success('KPIs salvos!');
        Modal.close();
        _renderKpis();
      }
    });
  }

  /* ====================================================
     TAB: ESTRATÉGIA
     ==================================================== */
  const FREQ_OPCOES = ['diária','3-4x semana','semanal','quinzenal','mensal'];

  function _renderEstrategia() {
    const el = document.getElementById('mktContent');
    if (!el) return;

    const kpis = DB.getAll('marketing_kpis');
    const est = kpis.find(k => k.tipo === 'estrategia') || {};

    const freq = est.frequencia || {};
    const pilaresTxt = est.pilares || {};

    el.innerHTML = `
      <div style="max-width:860px;margin:0 auto">

        <!-- Persona -->
        <div class="estrategia-section">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="estrategia-section-title">👤 Persona Principal</div>
            <button class="btn btn-ghost btn-sm" onclick="Marketing._editEstrategia('persona')">✏ Editar</button>
          </div>
          <div class="estrategia-section-content" style="margin-top:8px">${Utils.escHtml(est.persona || 'Clique em Editar para definir a persona principal da Bikows.')}</div>
        </div>

        <!-- Proposta de Valor -->
        <div class="estrategia-section">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="estrategia-section-title">💎 Proposta de Valor</div>
            <button class="btn btn-ghost btn-sm" onclick="Marketing._editEstrategia('proposta')">✏ Editar</button>
          </div>
          <div class="estrategia-section-content" style="margin-top:8px">${Utils.escHtml(est.proposta || 'Descreva o que torna a Bikows única no mercado.')}</div>
        </div>

        <!-- Tom de Voz -->
        <div class="estrategia-section">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="estrategia-section-title">🗣 Tom de Voz</div>
            <button class="btn btn-ghost btn-sm" onclick="Marketing._editEstrategia('tom')">✏ Editar</button>
          </div>
          <div class="estrategia-section-content" style="margin-top:8px">${Utils.escHtml(est.tom || 'Defina como a Bikows se comunica: técnico mas acessível, confiante...')}</div>
        </div>

        <!-- Objetivos -->
        <div class="estrategia-section">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="estrategia-section-title">🎯 Objetivos de Marketing</div>
            <button class="btn btn-ghost btn-sm" onclick="Marketing._editEstrategia('objetivos')">✏ Editar</button>
          </div>
          <div class="estrategia-section-content" style="margin-top:8px">${Utils.escHtml(est.objetivos || 'Liste os principais objetivos de marketing da empresa.')}</div>
        </div>

        <!-- Concorrência -->
        <div class="estrategia-section">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="estrategia-section-title">⚔ Concorrência</div>
            <button class="btn btn-ghost btn-sm" onclick="Marketing._editEstrategia('concorrencia')">✏ Editar</button>
          </div>
          <div class="estrategia-section-content" style="margin-top:8px">${Utils.escHtml(est.concorrencia || 'Liste principais concorrentes e diferenciais competitivos.')}</div>
        </div>

        <!-- Pilares de Conteúdo -->
        <div class="estrategia-section">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="estrategia-section-title">🏛 Pilares de Conteúdo</div>
            <button class="btn btn-ghost btn-sm" onclick="Marketing._editEstrategia('pilares')">✏ Editar</button>
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
            ${PILARES.map(p => `
              <div style="padding:10px;background:var(--bg);border-radius:8px">
                <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:4px">${p}</div>
                <div style="font-size:12px;color:var(--text-secondary)">${Utils.escHtml(pilaresTxt[p] || 'Sem descrição ainda.')}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Frequência por Canal -->
        <div class="estrategia-section">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="estrategia-section-title">📆 Frequência por Canal</div>
            <button class="btn btn-ghost btn-sm" onclick="Marketing._editEstrategia('frequencia')">✏ Editar</button>
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${CANAIS.map(canal => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg);border-radius:8px">
                <span style="font-size:13px">${CANAL_ICONS[canal]} <strong>${canal}</strong></span>
                <span class="pilar-badge">${freq[canal] || 'não definida'}</span>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    `;
  }

  function _editEstrategia(campo) {
    const kpis = DB.getAll('marketing_kpis');
    const est = kpis.find(k => k.tipo === 'estrategia') || {};

    let body = '';
    let title = '';

    if (campo === 'persona') {
      title = 'Persona Principal';
      body = `<div class="form-group"><label class="form-label">Descrição da persona ideal</label><textarea class="form-input" id="estCampo" rows="6" placeholder="Quem é o cliente ideal da Bikows? Cargo, setor, dores, objetivos...">${Utils.escHtml(est.persona||'')}</textarea></div>`;
    } else if (campo === 'proposta') {
      title = 'Proposta de Valor';
      body = `<div class="form-group"><label class="form-label">O que torna a Bikows única</label><textarea class="form-input" id="estCampo" rows="6">${Utils.escHtml(est.proposta||'')}</textarea></div>`;
    } else if (campo === 'tom') {
      title = 'Tom de Voz';
      body = `<div class="form-group"><label class="form-label">Como a Bikows se comunica</label><textarea class="form-input" id="estCampo" rows="6">${Utils.escHtml(est.tom||'')}</textarea></div>`;
    } else if (campo === 'objetivos') {
      title = 'Objetivos de Marketing';
      body = `<div class="form-group"><label class="form-label">Principais objetivos</label><textarea class="form-input" id="estCampo" rows="6">${Utils.escHtml(est.objetivos||'')}</textarea></div>`;
    } else if (campo === 'concorrencia') {
      title = 'Concorrência';
      body = `<div class="form-group"><label class="form-label">Concorrentes e diferenciais</label><textarea class="form-input" id="estCampo" rows="6">${Utils.escHtml(est.concorrencia||'')}</textarea></div>`;
    } else if (campo === 'pilares') {
      title = 'Pilares de Conteúdo';
      body = `<div class="form-grid" style="grid-template-columns:1fr;gap:12px">
        ${PILARES.map(p => `
          <div class="form-group">
            <label class="form-label">${p}</label>
            <textarea class="form-input" id="pilar_${p.replace(/[^a-zA-Z0-9]/g,'_')}" rows="2" placeholder="Por que publicamos conteúdo sobre ${p}?">${Utils.escHtml((est.pilares||{})[p]||'')}</textarea>
          </div>
        `).join('')}
      </div>`;
    } else if (campo === 'frequencia') {
      title = 'Frequência por Canal';
      body = `<div class="form-grid" style="grid-template-columns:1fr;gap:10px">
        ${CANAIS.map(canal => `
          <div class="form-group">
            <label class="form-label">${CANAL_ICONS[canal]} ${canal}</label>
            <select class="form-input" id="freq_${canal.replace(/[^a-zA-Z0-9]/g,'_')}">
              <option value="">Não definida</option>
              ${FREQ_OPCOES.map(f => `<option value="${f}"${(est.frequencia||{})[canal]===f?' selected':''}>${f}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>`;
    }

    Modal.open({
      title,
      body,
      size: campo === 'pilares' || campo === 'frequencia' ? 'modal-lg' : '',
      onSave: () => {
        let updates = {};
        if (['persona','proposta','tom','objetivos','concorrencia'].includes(campo)) {
          updates[campo] = document.getElementById('estCampo')?.value;
        } else if (campo === 'pilares') {
          const pilObj = {};
          PILARES.forEach(p => {
            pilObj[p] = document.getElementById('pilar_'+p.replace(/[^a-zA-Z0-9]/g,'_'))?.value || '';
          });
          updates.pilares = pilObj;
        } else if (campo === 'frequencia') {
          const freqObj = {};
          CANAIS.forEach(canal => {
            freqObj[canal] = document.getElementById('freq_'+canal.replace(/[^a-zA-Z0-9]/g,'_'))?.value || '';
          });
          updates.frequencia = freqObj;
        }

        if (est.id) {
          DB.update('marketing_kpis', est.id, { ...est, ...updates });
        } else {
          DB.create('marketing_kpis', { tipo: 'estrategia', ...updates });
        }
        Toast.success('Estratégia atualizada!');
        Modal.close();
        _renderEstrategia();
      }
    });
  }

  /* ====================================================
     addNew — dispatcher por tab
     ==================================================== */
  function addNew() {
    if (_tab === 'calendario') openPostForm();
    else if (_tab === 'campanhas') openCampanhaForm();
    else if (_tab === 'ideias') openIdeiaForm();
    else openPostForm();
  }

  /* ---- Expõe funções para o HTML ---- */
  return {
    render, addNew,
    _setTab,
    _setFiltroMes, _setFiltroCanal, _setFiltroStatus,
    _setFiltroIdeiaCanal, _setFiltroIdeiaPilar, _setFiltroIdeiaPrior,
    _kpiMesAnterior, _kpiMesPosterior,
    _updateHorario,
    _downloadTemplate, _importCSV,
    _editEstrategia,
    openPostForm, duplicatePost, deletePost,
    openCampanhaForm, viewCampanha, deleteCampanha,
    openIdeiaForm, usarIdeia, deleteIdeia,
    editKpi,
  };
})();
