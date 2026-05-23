/* ==========================================
   PIPELINE â€” Kanban CRM com drag & drop
   ========================================== */
const Pipeline = (() => {

  const STAGES = [
    { key: 'lead_identificado',   label: 'ðŸ”µ Lead Identificado',      color: '#64748b', prob: 5  },
    { key: 'primeiro_contato',    label: 'ðŸ“ž Primeiro Contato',       color: '#3b82f6', prob: 10 },
    { key: 'qualificacao',        label: 'ðŸ” QualificaÃ§Ã£o',           color: '#8b5cf6', prob: 25 },
    { key: 'proposta_elaboracao', label: 'ðŸ“‹ Proposta em ElaboraÃ§Ã£o', color: '#f59e0b', prob: 40 },
    { key: 'proposta_enviada',    label: 'ðŸ“¤ Proposta Enviada',       color: '#f97316', prob: 55 },
    { key: 'negociacao',          label: 'ðŸ¤ NegociaÃ§Ã£o',             color: '#eab308', prob: 75 },
    { key: 'fechado_ganho',       label: 'âœ… Fechado / Ganho',        color: '#10b981', prob: 100 },
    { key: 'fechado_perdido',     label: 'âŒ Fechado / Perdido',      color: '#ef4444', prob: 0  },
  ];

  // Dias sem atualizaÃ§Ã£o para considerar lead frio
  const DIAS_FRIO = 7;

  /* ---- SLA por etapa (dias) ---- */
  const _SLA = {
    lead_identificado:   { amarelo: 7,  vermelho: 14 },
    primeiro_contato:    { amarelo: 3,  vermelho: 7  },
    qualificacao:        { amarelo: 7,  vermelho: 15 },
    proposta_elaboracao: { amarelo: 5,  vermelho: 10 },
    proposta_enviada:    { amarelo: 3,  vermelho: 7  },
    negociacao:          { amarelo: 7,  vermelho: 15 },
  };

  /* Dias que o lead estÃ¡ na etapa atual */
  function _diasNaEtapa(lead) {
    const ref = lead.dataMudancaStatus || lead.createdAt;
    if (!ref) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const d = new Date(ref); d.setHours(0,0,0,0);
    return Math.round((hoje - d) / 86400000);
  }

  /* SLA badge e border color para o card */
  function _slaBadge(lead) {
    const sla = _SLA[lead.status];
    if (!sla) return { badge: '', borderColor: '' };
    const dias = _diasNaEtapa(lead);
    if (dias === null) return { badge: '', borderColor: '' };
    if (dias >= sla.vermelho) {
      return {
        badge: `<span style="font-size:10px;background:#ef444420;color:#ef4444;padding:1px 5px;border-radius:99px;font-weight:700">ðŸ”´ ${dias}d</span>`,
        borderColor: '#ef4444',
      };
    }
    if (dias >= sla.amarelo) {
      return {
        badge: `<span style="font-size:10px;background:#f59e0b20;color:#f59e0b;padding:1px 5px;border-radius:99px;font-weight:700">ðŸ• ${dias}d</span>`,
        borderColor: '#f59e0b',
      };
    }
    return { badge: `<span style="font-size:10px;color:var(--text-muted)">${dias}d</span>`, borderColor: '' };
  }

  /* ---- Score de Lead (0â€“100) ---- */
  function calcLeadScore(lead) {
    let score = 0;
    const detalhes = [];

    // Porte (por valor estimado como proxy)
    const val = lead.valorEstimado || 0;
    if (val > 100000) { score += 25; detalhes.push('Porte Grande +25'); }
    else if (val > 30000) { score += 15; detalhes.push('Porte MÃ©dio +15'); }
    else { score += 5; detalhes.push('Porte Pequeno +5'); }

    // Segmento premium
    const segs = ['Metal-MecÃ¢nica','Alimentos','Agro','Energia','PetroquÃ­mica'];
    if (segs.includes(lead.segmento)) { score += 20; detalhes.push('Segmento Premium +20'); }

    // Valor estimado
    if (val > 50000) { score += 20; detalhes.push('Valor >50k +20'); }
    else if (val >= 20000) { score += 15; detalhes.push('Valor 20-50k +15'); }
    else if (val >= 10000) { score += 10; detalhes.push('Valor 10-20k +10'); }
    else { score += 5; detalhes.push('Valor <10k +5'); }

    // Origem
    if (lead.origemLead === 'IndicaÃ§Ã£o') { score += 15; detalhes.push('Origem IndicaÃ§Ã£o +15'); }
    else if (['LinkedIn','Evento / Feira'].includes(lead.origemLead)) { score += 10; detalhes.push(`Origem ${lead.origemLead} +10`); }
    else if (lead.origemLead) { score += 5; detalhes.push(`Origem ${lead.origemLead} +5`); }

    // Etapa
    if (['negociacao','fechado_ganho'].includes(lead.status)) { score += 15; detalhes.push('Etapa avanÃ§ada +15'); }
    else if (lead.status === 'proposta_enviada') { score += 10; detalhes.push('Proposta enviada +10'); }
    else if (lead.status === 'qualificacao') { score += 5; detalhes.push('QualificaÃ§Ã£o +5'); }

    // Tempo no funil
    const diasFunil = _diasSemAtualizacao(lead);
    if (diasFunil !== null && diasFunil < 14) { score += 5; detalhes.push('Recente (<14d) +5'); }
    else if (diasFunil !== null && diasFunil > 60) { score -= 10; detalhes.push('Esfriando (>60d) -10'); }

    score = Math.max(0, Math.min(100, score));
    return { score, detalhes };
  }

  function _scoreBadge(lead) {
    const { score } = calcLeadScore(lead);
    if (score >= 70) return `<span style="font-size:11px;font-weight:700;color:#10b981" title="Score: ${score}/100">ðŸ”¥${score}</span>`;
    if (score >= 40) return `<span style="font-size:11px;font-weight:700;color:#f59e0b" title="Score: ${score}/100">âš¡${score}</span>`;
    return `<span style="font-size:11px;font-weight:700;color:#94a3b8" title="Score: ${score}/100">ðŸ§Š${score}</span>`;
  }

  /* ---- Templates de e-mail por etapa ---- */
  const _EMAIL_TEMPLATES = {
    lead_identificado: (lead, clienteNome) =>
      `OlÃ¡ ${lead.decisor || clienteNome || '[Nome]'},\n\nSomos a Bikows Engenharia, especializados em seguranÃ§a do trabalho e engenharia industrial (NR-12, NR-35, NR-33, Laudos, ARTs).\n\nTemos soluÃ§Ãµes completas que podem atender Ã s necessidades de ${clienteNome || 'sua empresa'}. Podemos agendar uma conversa?\n\nAtenciosamente,\n${lead.responsavel || 'Bikows Engenharia'}`,
    primeiro_contato: (lead, clienteNome) =>
      `OlÃ¡ ${lead.decisor || clienteNome || '[Nome]'},\n\nConforme nossa conversa, gostaria de agendar uma visita tÃ©cnica para levantarmos as necessidades de ${clienteNome || 'sua empresa'} e elaborarmos uma proposta personalizada.\n\nQual seria a melhor data para vocÃª?\n\nAtenciosamente,\n${lead.responsavel || 'Bikows Engenharia'}`,
    qualificacao: (lead, clienteNome) =>
      `OlÃ¡ ${lead.decisor || clienteNome || '[Nome]'},\n\nPara elaborarmos a proposta mais adequada para ${clienteNome || 'vocÃªs'}, preciso de algumas informaÃ§Ãµes:\n\n1. Quantas mÃ¡quinas/equipamentos precisam de adequaÃ§Ã£o?\n2. Qual o prazo ideal para o serviÃ§o?\n3. HÃ¡ algum laudo ou ART existente para referÃªncia?\n\nAguardo seu retorno!\n\nAtenciosamente,\n${lead.responsavel || 'Bikows Engenharia'}`,
    proposta_elaboracao: (lead, clienteNome) =>
      `OlÃ¡ ${lead.decisor || clienteNome || '[Nome]'},\n\nEstamos elaborando a proposta para ${clienteNome || 'vocÃªs'} referente a: ${lead.titulo}.\n\nAssim que estiver pronta, encaminharei para sua anÃ¡lise. Fique Ã  vontade para sanar qualquer dÃºvida!\n\nAtenciosamente,\n${lead.responsavel || 'Bikows Engenharia'}`,
    proposta_enviada: (lead, clienteNome) =>
      `OlÃ¡ ${lead.decisor || clienteNome || '[Nome]'},\n\nEnviei nossa proposta para ${lead.titulo}. Gostaria de saber se recebeu e se ficou alguma dÃºvida sobre os serviÃ§os ou valores.\n\nEstou Ã  disposiÃ§Ã£o para uma call de alinhamento quando quiser!\n\nAtenciosamente,\n${lead.responsavel || 'Bikows Engenharia'}`,
    negociacao: (lead, clienteNome) =>
      `OlÃ¡ ${lead.decisor || clienteNome || '[Nome]'},\n\nEstou verificando se podemos avanÃ§ar com a proposta para ${lead.titulo}. HÃ¡ algum ponto que precise de ajuste?\n\nNossa equipe estÃ¡ pronta para iniciar assim que tivermos o go-ahead!\n\nAtenciosamente,\n${lead.responsavel || 'Bikows Engenharia'}`,
    followup: (lead, clienteNome) =>
      `OlÃ¡ ${lead.decisor || clienteNome || '[Nome]'},\n\nPassando para retomar o contato sobre nossa proposta para ${clienteNome || 'vocÃªs'}. Houve alguma mudanÃ§a no cenÃ¡rio ou posso ajudar com alguma informaÃ§Ã£o adicional?\n\nAtenciosamente,\n${lead.responsavel || 'Bikows Engenharia'}`,
  };

  /* ---- Mapa de canais de origem ---- */
  const _ORIGENS_MAP = {
    'TrÃ¡fego Pago':      { icon: 'ðŸŽ¯', color: '#ef4444', bg: '#fef2f2' },
    'IndicaÃ§Ã£o':         { icon: 'ðŸ¤', color: '#10b981', bg: '#f0fdf4' },
    'RecorrÃªncia':       { icon: 'ðŸ”', color: '#8b5cf6', bg: '#f5f3ff' },
    'ProspecÃ§Ã£o Ativa':  { icon: 'ðŸ“ž', color: '#3b82f6', bg: '#eff6ff' },
    'Site / SEO':        { icon: 'ðŸŒ', color: '#06b6d4', bg: '#ecfeff' },
    'LinkedIn':          { icon: 'ðŸ’¼', color: '#0a66c2', bg: '#eff6ff' },
    'Evento / Feira':    { icon: 'ðŸ“…', color: '#f59e0b', bg: '#fffbeb' },
    'Parceria':          { icon: 'ðŸ”—', color: '#6366f1', bg: '#eef2ff' },
    'LicitaÃ§Ã£o PÃºblica': { icon: 'ðŸ›', color: '#0f766e', bg: '#f0fdfa' },
    'Outro':             { icon: 'â“', color: '#94a3b8', bg: '#f8fafc' },
  };

  const _MODALIDADES_LIC = [
    'PregÃ£o EletrÃ´nico',
    'Dispensa EletrÃ´nica',
    'ConcorrÃªncia EletrÃ´nica',
    'PregÃ£o Presencial',
    'Inexigibilidade',
    'Outro',
  ];

  /* Retorna dados da licitaÃ§Ã£o ou null */
  function _getLic(lead) { return lead?.licitacao && lead.licitacao.edital ? lead.licitacao : null; }

  /* Badge compacto de prazo do edital para o card */
  function _editalPrazoBadge(dataEntrega) {
    if (!dataEntrega) return '';
    const dias = Utils.daysUntil(dataEntrega);
    if (dias == null) return '';
    const cor  = dias < 0 ? '#ef4444' : dias <= 3 ? '#f97316' : dias <= 7 ? '#f59e0b' : '#0f766e';
    const txt  = dias < 0 ? `Prazo vencido ${Math.abs(dias)}d` : dias === 0 ? 'âš  Vence HOJE' : `${dias}d p/ entrega`;
    return `<div style="font-size:10px;font-weight:700;color:${cor};margin:2px 0">â± ${txt}</div>`;
  }

  /* Toggle da seÃ§Ã£o de licitaÃ§Ã£o no formulÃ¡rio */
  function _toggleLicitacaoSection(val) {
    const sec = document.getElementById('licitacaoSection');
    if (!sec) return;
    sec.style.display = val === 'LicitaÃ§Ã£o PÃºblica' ? 'block' : 'none';
  }

  /* Toggle da seÃ§Ã£o de campanha Google Ads no formulÃ¡rio */
  function _toggleCampanhaSection(val) {
    const sec = document.getElementById('campanhaTrafegoSection');
    if (!sec) return;
    sec.style.display = val === 'TrÃ¡fego Pago' ? 'block' : 'none';
  }

  function _origemIcon(o) { return _ORIGENS_MAP[o]?.icon || ''; }
  function _origemBadge(o) {
    if (!o || !_ORIGENS_MAP[o]) return '';
    const m = _ORIGENS_MAP[o];
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${m.color};background:${m.bg};padding:2px 8px;border-radius:99px;border:1px solid ${m.color}33">${m.icon} ${o}</span>`;
  }
  function _previewOrigem(sel) {
    const el = document.getElementById('fOrigemPreview');
    if (el) el.innerHTML = _origemBadge(sel.value);
    _toggleLicitacaoSection(sel.value);
    _toggleCampanhaSection(sel.value);
  }

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
    const inicioStr = inicio.toISOString().split('T')[0];
    return lista.filter(item => (item[campo] || item.createdAt || '') >= inicioStr);
  }

  function setPeriodo(p) {
    _periodo = p;
    render();
  }

  let _filter = {
    search: '', status: '', segmento: '',
    responsavel: '', origemLead: '',
    valorMin: '', valorMax: '',
    dataEntradaDe: '', dataEntradaAte: '',
  };

  function setFilter(key, value) {
    _filter[key] = value;
    render();
  }

  function clearFilters() {
    _filter = {
      search: '', status: '', segmento: '',
      responsavel: '', origemLead: '',
      valorMin: '', valorMax: '',
      dataEntradaDe: '', dataEntradaAte: '',
    };
    render();
  }

  let dragId = null;

  /* ---- DetecÃ§Ã£o de lead frio ---- */
  function _diasSemAtualizacao(lead) {
    const ref = lead.updatedAt || lead.createdAt;
    if (!ref) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const d = new Date(ref); d.setHours(0,0,0,0);
    return Math.round((hoje - d) / 86400000);
  }

  function _isLeadFrio(lead) {
    if (['fechado_ganho','fechado_perdido'].includes(lead.status)) return false;
    const diasSemAtualizar = _diasSemAtualizacao(lead);
    if (diasSemAtualizar !== null && diasSemAtualizar >= DIAS_FRIO) return true;
    // TambÃ©m considera frio se dataProximaAcao passou hÃ¡ mais de 3 dias sem update
    if (lead.dataProximaAcao) {
      const diasAcao = Utils.daysUntil(lead.dataProximaAcao);
      if (diasAcao !== null && diasAcao < -3) return true;
    }
    return false;
  }

  /* ---- Receita ponderada (valor Ã— probabilidade por etapa) ---- */
  function _receitaPonderada(leads) {
    return leads
      .filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status))
      .reduce((sum, l) => {
        const stage = STAGES.find(s => s.key === l.status);
        const prob = (stage?.prob || 0) / 100;
        return sum + (l.valorEstimado || 0) * prob;
      }, 0);
  }

  /* ---- CriaÃ§Ã£o automÃ¡tica de atividade de follow-up ---- */
  function criarFollowupAutomatico(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    // Verificar se jÃ¡ existe atividade pendente de follow-up para este lead
    const jaExiste = DB.getAll('atividades').some(a =>
      a.leadId === leadId &&
      a.status === 'pendente' &&
      a.tipo === 'call' &&
      a.titulo?.includes('Follow-up automÃ¡tico')
    );
    if (jaExiste) return;
    // Criar atividade de follow-up para amanhÃ£
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const amanhaStr = amanha.toISOString().split('T')[0];
    DB.create('atividades', {
      titulo: `ðŸ§Š Follow-up automÃ¡tico â€” ${lead.titulo}`,
      tipo: 'ligacao',
      prioridade: 'alta',
      status: 'pendente',
      data: amanhaStr,
      hora: '09:00',
      responsavel: lead.responsavel || '',
      clienteId: lead.clienteId || '',
      leadId: leadId,
      descricao: `Lead frio: sem atualizaÃ§Ã£o hÃ¡ ${DIAS_FRIO}+ dias. Retomar contato.`,
    });
    Toast.warning(`ðŸ§Š Lead frio detectado! Atividade de follow-up criada para "${lead.titulo}".`, 5000);
  }

  /* ---- Verificar leads frios e criar atividades ---- */
  function _checkLeadsFrios() {
    const leads = DB.getAll('leads').filter(l => _isLeadFrio(l));
    leads.forEach(l => criarFollowupAutomatico(l.id));
  }

  function render() {
    const leads = DB.getAll('leads');
    const config = DB.getConfig();

    const leadsFiltrados = _filtrarPorPeriodo(leads, 'dataEntrada');
    const ativos = leadsFiltrados.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
    const ganhos = leadsFiltrados.filter(l => l.status === 'fechado_ganho');
    const totalPipeline = Utils.sum(ativos, 'valorEstimado');
    const receitaPond = _receitaPonderada(leadsFiltrados);
    const taxa = leadsFiltrados.length ? ((ganhos.length / leadsFiltrados.length)*100).toFixed(0) : 0;
    const frios = ativos.filter(l => _isLeadFrio(l)).length;
    const periodoLabels = { mes: 'Este MÃªs', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Este Ano', tudo: 'Tudo' };

    document.getElementById('pageContent').innerHTML = `
      <div class="sec-header">
        <h2 class="sec-title">Pipeline CRM</h2>
        <div class="sec-actions">
          <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:var(--radius);padding:3px;border:1px solid var(--border)">
            ${['mes','trimestre','semestre','ano','tudo'].map(p => `<button onclick="Pipeline.setPeriodo('${p}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:var(--t);${_periodo===p?'background:var(--primary);color:#fff;':'background:transparent;color:var(--text-muted);'}">${periodoLabels[p]}</button>`).join('')}
          </div>
          <button class="btn btn-secondary" onclick="Pipeline.filtrarLicitacoes()" title="Ver somente licitaÃ§Ãµes">ðŸ› LicitaÃ§Ãµes</button>
          <button class="btn btn-secondary" onclick="Pipeline.listaLeadsFrios()" title="Ver leads frios">ðŸ§Š ${frios} Frios</button>
          <button class="btn btn-secondary" onclick="Pipeline.reativarLeadsPerdidos()" title="Reativar leads perdidos">â™»ï¸ Reativar</button>
          <button class="btn btn-secondary" onclick="Pipeline.relatorioOrigem()">ðŸ“¡ Por Canal</button>
          <button class="btn btn-secondary" onclick="Pipeline.downloadCSVTemplate()" title="Baixar modelo CSV de leads">ðŸ“‹ Modelo CSV</button>
          <label class="btn btn-secondary" title="Importar leads via CSV">
            ðŸ“¥ CSV
            <input type="file" accept=".csv" style="display:none" onchange="Pipeline.importCSV(event)">
          </label>
          <button class="btn btn-primary" onclick="Pipeline.openForm()">+ Novo Lead</button>
        </div>
      </div>

      <!-- FILTROS AVANÃ‡ADOS -->
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <select class="filter-select" onchange="Pipeline.setFilter('responsavel',this.value)">
          <option value="">Todos os responsÃ¡veis</option>
          ${[...new Set(DB.getAll('leads').map(l => l.responsavel).filter(Boolean))].map(r => `<option value="${r}" ${_filter.responsavel===r?'selected':''}>${Utils.escHtml(r)}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="Pipeline.setFilter('origemLead',this.value)">
          <option value="">Todas as origens</option>
          ${Object.keys(_ORIGENS_MAP).map(o => `<option value="${o}" ${_filter.origemLead===o?'selected':''}>${_origemIcon(o)} ${o}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="Pipeline.setFilter('segmento',this.value)">
          <option value="">Todos os segmentos</option>
          ${config.segmentos.map(s => `<option value="${s}" ${_filter.segmento===s?'selected':''}>${Utils.escHtml(s)}</option>`).join('')}
        </select>
        <input class="form-control" style="max-width:130px" type="number" placeholder="Valor mÃ­n. (R$)"
          value="${_filter.valorMin}" onchange="Pipeline.setFilter('valorMin',this.value)" title="Filtrar por valor mÃ­nimo">
        <input class="form-control" style="max-width:130px" type="number" placeholder="Valor mÃ¡x. (R$)"
          value="${_filter.valorMax}" onchange="Pipeline.setFilter('valorMax',this.value)" title="Filtrar por valor mÃ¡ximo">
        <input class="form-control" style="max-width:145px" type="date" title="Data de entrada â€” de"
          value="${_filter.dataEntradaDe}" onchange="Pipeline.setFilter('dataEntradaDe',this.value)">
        <input class="form-control" style="max-width:145px" type="date" title="Data de entrada â€” atÃ©"
          value="${_filter.dataEntradaAte}" onchange="Pipeline.setFilter('dataEntradaAte',this.value)">
      </div>

      <!-- CHIPS DE FILTROS ATIVOS -->
      ${(() => {
        const chips = [];
        if (_filter.responsavel) chips.push(`<span class="badge badge-blue" style="cursor:pointer" onclick="Pipeline.setFilter('responsavel','')">ðŸ‘¤ ${Utils.escHtml(_filter.responsavel)} Ã—</span>`);
        if (_filter.origemLead) chips.push(`<span class="badge badge-blue" style="cursor:pointer" onclick="Pipeline.setFilter('origemLead','')">ðŸ“¡ ${Utils.escHtml(_filter.origemLead)} Ã—</span>`);
        if (_filter.segmento) chips.push(`<span class="badge badge-blue" style="cursor:pointer" onclick="Pipeline.setFilter('segmento','')">ðŸ­ ${Utils.escHtml(_filter.segmento)} Ã—</span>`);
        if (_filter.valorMin) chips.push(`<span class="badge badge-blue" style="cursor:pointer" onclick="Pipeline.setFilter('valorMin','')">â‰¥ ${Utils.formatCurrency(Number(_filter.valorMin))} Ã—</span>`);
        if (_filter.valorMax) chips.push(`<span class="badge badge-blue" style="cursor:pointer" onclick="Pipeline.setFilter('valorMax','')">â‰¤ ${Utils.formatCurrency(Number(_filter.valorMax))} Ã—</span>`);
        if (_filter.dataEntradaDe) chips.push(`<span class="badge badge-blue" style="cursor:pointer" onclick="Pipeline.setFilter('dataEntradaDe','')">ðŸ“… De ${Utils.formatDate(_filter.dataEntradaDe)} Ã—</span>`);
        if (_filter.dataEntradaAte) chips.push(`<span class="badge badge-blue" style="cursor:pointer" onclick="Pipeline.setFilter('dataEntradaAte','')">ðŸ“… AtÃ© ${Utils.formatDate(_filter.dataEntradaAte)} Ã—</span>`);
        if (!chips.length) return '';
        const totalFiltrado = (() => {
          let ls = DB.getAll('leads');
          if (_filter.responsavel) ls = ls.filter(l => l.responsavel === _filter.responsavel);
          if (_filter.origemLead) ls = ls.filter(l => l.origemLead === _filter.origemLead);
          if (_filter.segmento) ls = ls.filter(l => l.segmento === _filter.segmento);
          if (_filter.valorMin) ls = ls.filter(l => (l.valorEstimado||0) >= Number(_filter.valorMin));
          if (_filter.valorMax) ls = ls.filter(l => (l.valorEstimado||0) <= Number(_filter.valorMax));
          if (_filter.dataEntradaDe) ls = ls.filter(l => (l.dataEntrada||l.createdAt||'').slice(0,10) >= _filter.dataEntradaDe);
          if (_filter.dataEntradaAte) ls = ls.filter(l => (l.dataEntrada||l.createdAt||'').slice(0,10) <= _filter.dataEntradaAte);
          return ls.length;
        })();
        return `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px">
          <span class="text-xs text-muted">Filtros ativos:</span>
          ${chips.join('')}
          <button class="btn btn-xs btn-danger" onclick="Pipeline.clearFilters()">Limpar todos</button>
          <span class="text-xs text-muted" style="margin-left:auto">Exibindo <strong>${totalFiltrado}</strong> leads</span>
        </div>`;
      })()}

      <div class="pipeline-summary mb-4">
        <div class="pipeline-stage" style="cursor:pointer" title="Clique para ver leads ativos" onclick="Pipeline.drillDown('pipeline_total')">
          <div class="ps-label">Total em Pipeline <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div>
          <div class="ps-value">${Utils.formatCurrency(totalPipeline)}</div>
          <div class="ps-count">${ativos.length} oportunidades abertas</div>
        </div>
        <div class="pipeline-stage" title="Receita esperada = valor Ã— probabilidade por etapa; clique para ver propostas abertas" style="cursor:pointer" onclick="Pipeline.drillDown('propostas_abertas')">
          <div class="ps-label">Receita Esperada ðŸŽ¯</div>
          <div class="ps-value" style="color:var(--success)">${Utils.formatCurrency(receitaPond)}</div>
          <div class="ps-count">previsÃ£o realista ponderada</div>
        </div>
        <div class="pipeline-stage" style="cursor:pointer" title="Clique para ver receita fechada" onclick="Pipeline.drillDown('receita_fechada')">
          <div class="ps-label">Fechado / Ganho <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div>
          <div class="ps-value">${Utils.formatCurrency(Utils.sum(ganhos,'valorFechado'))}</div>
          <div class="ps-count">${ganhos.length} negÃ³cios</div>
        </div>
        <div class="pipeline-stage" style="cursor:pointer" title="Clique para ver leads frios" onclick="Pipeline.drillDown('leads_frios')">
          <div class="ps-label">Taxa de ConversÃ£o <span style="font-size:10px;opacity:.7">(${periodoLabels[_periodo]})</span></div>
          <div class="ps-value">${taxa}%</div>
          <div class="ps-count">${leadsFiltrados.filter(l=>l.status==='fechado_perdido').length} perdidos ${frios > 0 ? `Â· <span style="color:#f59e0b">ðŸ§Š ${frios} frios</span>` : ''}</div>
        </div>
      </div>

      ${_renderProbabilidadeLegend()}

      <div class="kanban-wrap">
        <div class="kanban-board" id="kanbanBoard">
          ${STAGES.map(s => renderColumn(s, leads)).join('')}
        </div>
      </div>
    `;
    // Note: kanban board shows all leads regardless of period (period only affects KPI summary)

    initDragDrop();
    // Verificar leads frios ao abrir o pipeline
    setTimeout(() => _checkLeadsFrios(), 300);
  }

  function _renderProbabilidadeLegend() {
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <span class="text-xs text-muted">Probabilidade por etapa:</span>
      ${STAGES.filter(s => !['fechado_ganho','fechado_perdido'].includes(s.key)).map(s =>
        `<span style="font-size:11px;background:${s.color}22;color:${s.color};padding:2px 8px;border-radius:99px;border:1px solid ${s.color}44">${s.label.split(' ')[1]||s.label.split(' ')[0]} ${s.prob}%</span>`
      ).join('')}
    </div>`;
  }

  function renderColumn(stage, allLeads) {
    let leads = allLeads.filter(l => l.status === stage.key);
    if (_filter.responsavel) leads = leads.filter(l => l.responsavel === _filter.responsavel);
    if (_filter.origemLead) leads = leads.filter(l => l.origemLead === _filter.origemLead);
    if (_filter.segmento) leads = leads.filter(l => l.segmento === _filter.segmento);
    if (_filter.valorMin) leads = leads.filter(l => (l.valorEstimado||0) >= Number(_filter.valorMin));
    if (_filter.valorMax) leads = leads.filter(l => (l.valorEstimado||0) <= Number(_filter.valorMax));
    if (_filter.dataEntradaDe) leads = leads.filter(l => (l.dataEntrada||l.createdAt||'').slice(0,10) >= _filter.dataEntradaDe);
    if (_filter.dataEntradaAte) leads = leads.filter(l => (l.dataEntrada||l.createdAt||'').slice(0,10) <= _filter.dataEntradaAte);
    const total = Utils.sum(leads, 'valorEstimado');
    const ponderado = leads.reduce((s,l) => s + (l.valorEstimado||0) * (stage.prob/100), 0);

    return `<div class="kanban-col" data-stage="${stage.key}">
      <div class="kanban-col-header">
        <div class="kanban-col-title" style="color:${stage.color}">${stage.label}</div>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="text-xs text-muted">${stage.prob}%</span>
          <div class="kanban-col-count">${leads.length}</div>
        </div>
      </div>
      ${total > 0 ? `<div class="text-xs text-muted mb-1 text-center">${Utils.formatCurrency(total)}</div>` : ''}
      ${ponderado > 0 && stage.prob < 100 && stage.prob > 0 ? `<div class="text-xs mb-2 text-center" style="color:var(--success)">â†³ ${Utils.formatCurrency(ponderado)} esperado</div>` : ''}
      <div class="kanban-cards" id="col-${stage.key}"
        ondragover="Pipeline.dragOver(event)"
        ondrop="Pipeline.drop(event,'${stage.key}')"
        ondragleave="Pipeline.dragLeave(event)">
        ${leads.map(l => renderCard(l, stage.color)).join('')}
      </div>
      <button class="kanban-add" onclick="Pipeline.openForm(null,'${stage.key}')">+ Adicionar lead</button>
    </div>`;
  }

  function renderCard(lead, color) {
    const client = DB.get('clientes', lead.clienteId);
    const empresa = client ? client.nome : 'â€”';
    const alert = Utils.dateAlert(lead.dataProximaAcao, '');
    const dias = Utils.daysUntil(lead.dataProximaAcao);
    const dateClass = dias != null && dias < 0 ? 'text-danger' : 'text-muted';
    const frio = _isLeadFrio(lead);
    const diasSemAtualizar = _diasSemAtualizacao(lead);
    const proposta = _getPropostaLead(lead.id);
    const lic = _getLic(lead);
    const licBadge = lic ? `
      <div style="background:#f0fdfa;border:1px solid #0f766e33;border-radius:6px;padding:4px 7px;margin:3px 0;font-size:10px;line-height:1.4">
        <div style="font-weight:700;color:#0f766e">ðŸ› ${Utils.escHtml(lic.edital||'')}</div>
        <div style="color:#0f766e88">${Utils.escHtml(lic.orgao||'')}${lic.modalidade ? ' Â· '+lic.modalidade : ''}</div>
        ${_editalPrazoBadge(lic.dataEntrega)}
      </div>` : '';

    const propBadge = proposta
      ? `<div style="margin:3px 0;display:flex;align-items:center;gap:4px">
           <span style="font-size:10px;background:${Utils.PROP_STATUS[proposta.status]?.badge==='badge-green'?'#dcfce7':'#eff6ff'};color:${proposta.status==='aprovada'?'#16a34a':'#1d4ed8'};padding:1px 6px;border-radius:99px;font-weight:600">
             ðŸ“„ ${Utils.escHtml(proposta.numero||'Proposta')} Â· ${Utils.PROP_STATUS[proposta.status]?.label||proposta.status}
           </span>
         </div>`
      : (['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status)
          ? `<div style="font-size:10px;color:var(--text-muted);margin:3px 0">ðŸ“„ Sem proposta vinculada</div>`
          : '');

    const sla = _slaBadge(lead);
    const scoreEl = _scoreBadge(lead);
    const valColor = (lead.valorEstimado||0) >= 20000 ? '#10b981' : (lead.valorEstimado||0) >= 5000 ? '#3b82f6' : '#94a3b8';
    const borderStyle = sla.borderColor ? `border-left:3px solid ${sla.borderColor}` : '';
    return `<div class="kanban-card ${frio ? 'lead-frio' : ''}" draggable="true" data-id="${lead.id}"
      style="--card-color:${color};${borderStyle}"
      ondragstart="Pipeline.dragStart(event,'${lead.id}')"
      ondragend="Pipeline.dragEnd(event)">
      <div class="kc-name" style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px">
        <span>${frio ? `<span title="Lead frio: ${diasSemAtualizar}d sem atualizaÃ§Ã£o" style="cursor:help">ðŸ§Š</span> ` : ''}${Utils.escHtml(lead.titulo)}</span>
        ${scoreEl}
      </div>
      <div class="kc-empresa" style="display:flex;align-items:center;justify-content:space-between;gap:4px">
        <span>ðŸ¢ ${Utils.escHtml(empresa)}</span>
        ${lead.origemLead ? _origemBadge(lead.origemLead) : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:2px 0">
        <span style="font-size:12px;font-weight:700;color:${valColor}">${Utils.formatCurrency(lead.valorEstimado)}</span>
        ${sla.badge}
      </div>
      <!-- kc-valor removed â€” value shown above -->
      ${licBadge}
      ${propBadge}
      ${frio ? `<div style="font-size:10px;color:#f59e0b;margin-bottom:4px">âš  ${diasSemAtualizar}d sem atualizaÃ§Ã£o</div>` : ''}
      <div class="kc-footer">
        <span class="text-xs ${dateClass}">
          ${lead.dataProximaAcao ? 'ðŸ“… ' + Utils.formatDate(lead.dataProximaAcao) : ''}
          ${alert}
        </span>
        <span class="text-xs text-muted">${lead.responsavel || ''}</span>
      </div>
      <div class="kc-actions">
        <button class="btn btn-xs btn-secondary" onclick="Pipeline.viewLead('${lead.id}')">Ver</button>
        ${proposta
          ? `<button class="btn btn-xs btn-secondary" onclick="Modal.close();Propostas.view('${proposta.id}')" title="Ver proposta">ðŸ“„</button>`
          : (['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status)
              ? `<button class="btn btn-xs btn-secondary" onclick="Pipeline.criarPropostaLead('${lead.id}')" title="Criar proposta">ðŸ“„+</button>`
              : '')}
        ${lead.status === 'fechado_ganho' ? `<button class="btn btn-xs btn-primary" onclick="Pipeline.abrirContratoLead('${lead.id}')" title="Fechar contrato">ðŸ¤</button>` : ''}
        ${lead.contato ? `<button class="btn btn-xs btn-success" style="background:#25D366;border-color:#25D366" onclick="Utils.openWhatsApp('${Utils.escHtml(lead.contato)}')" title="WhatsApp">ðŸ’¬</button>` : ''}
        ${frio ? `<button class="btn btn-xs btn-warning" onclick="Pipeline.criarFollowupAutomatico('${lead.id}')" title="Criar follow-up">ðŸ””</button>` : ''}
        <button class="btn btn-xs btn-secondary" onclick="Pipeline.openForm('${lead.id}')">âœ</button>
        <button class="btn btn-xs btn-danger" onclick="Pipeline.deleteLead('${lead.id}')">ðŸ—‘</button>
      </div>
    </div>`;
  }

  function listaLeadsFrios() {
    const frios = DB.getAll('leads').filter(l => _isLeadFrio(l));
    if (!frios.length) { Toast.success('Nenhum lead frio no momento! ðŸŽ‰'); return; }

    Modal.open({
      title: `ðŸ§Š Leads Frios â€” ${frios.length} leads`,
      size: 'modal-lg',
      body: `
        <div style="margin-bottom:12px;padding:10px;background:#fef3c7;border-radius:var(--radius);border-left:3px solid #f59e0b">
          <div class="text-sm">Leads sem atualizaÃ§Ã£o hÃ¡ <strong>${DIAS_FRIO}+ dias</strong>. Reative o contato para nÃ£o perder o negÃ³cio.</div>
        </div>
        <table class="tbl">
          <thead><tr><th>Lead</th><th>Cliente</th><th>Valor</th><th>Etapa</th><th>Sem atualizar</th><th>AÃ§Ãµes</th></tr></thead>
          <tbody>
            ${frios.map(l => {
              const stage = STAGES.find(s => s.key === l.status);
              const dias = _diasSemAtualizacao(l);
              return `<tr>
                <td class="font-bold text-sm">${Utils.escHtml(l.titulo)}</td>
                <td class="text-sm">${Utils.escHtml(Utils.getClientName(l.clienteId))}</td>
                <td class="text-sm font-bold">${Utils.formatCurrency(l.valorEstimado)}</td>
                <td><span style="font-size:11px;color:${stage?.color}">${stage?.label||l.status}</span></td>
                <td><span class="badge badge-yellow">${dias}d</span></td>
                <td>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-xs btn-primary" onclick="Modal.close();Pipeline.openForm('${l.id}')">Atualizar</button>
                    <button class="btn btn-xs btn-warning" onclick="Pipeline.criarFollowupAutomatico('${l.id}');this.disabled=true;this.textContent='âœ“ Criado'">ðŸ”” Follow-up</button>
                    ${l.contato ? `<button class="btn btn-xs btn-success" style="background:#25D366;border-color:#25D366" onclick="Utils.openWhatsApp('${Utils.escHtml(l.contato)}')">ðŸ’¬</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `,
      saveLabel: null,
    });
  }

  function initDragDrop() {
    // Handled via inline handlers
  }

  function dragStart(e, id) {
    dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('dragging'), 0);
  }

  function dragEnd(e) {
    e.target.classList.remove('dragging');
    dragId = null;
  }

  function dragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  function dragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function drop(e, newStatus) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!dragId) return;
    const leadId = dragId;
    DB.update('leads', leadId, { status: newStatus });
    Toast.success('Lead movido para ' + Utils.LEAD_STATUS[newStatus]?.label);
    render();
    App.updateNotifBadge();

    // Hook: ao mover para Fechado/Ganho â†’ inicia fluxo de contrataÃ§Ã£o
    if (newStatus === 'fechado_ganho') {
      setTimeout(() => _promptContratacao(leadId), 350);
    }
    // Hook: ao entrar em Proposta em ElaboraÃ§Ã£o â†’ sugere criar proposta
    if (newStatus === 'proposta_elaboracao') {
      setTimeout(() => _sugerirCriarProposta(leadId), 350);
    }
  }

  function viewLead(id) {
    const lead = DB.get('leads', id);
    if (!lead) return;
    const client = DB.get('clientes', lead.clienteId);
    const stage = STAGES.find(s => s.key === lead.status);
    const servicos = (lead.servicoInteresse || []).join(', ');
    const dias = Utils.daysUntil(lead.dataProximaAcao);
    const diasLabel = dias == null ? 'â€”' : dias < 0 ? `âš  Atrasado ${Math.abs(dias)}d` : dias === 0 ? 'Hoje' : `Em ${dias} dias`;
    const frio = _isLeadFrio(lead);
    const prob = stage?.prob || 0;
    const receitaEsperada = (lead.valorEstimado || 0) * (prob / 100);

    Modal.open({
      title: lead.titulo,
      size: 'modal-lg',
      body: `
        ${frio ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:var(--radius);padding:10px;margin-bottom:16px">
          ðŸ§Š <strong>Lead frio!</strong> Sem atualizaÃ§Ã£o hÃ¡ ${_diasSemAtualizacao(lead)} dias. Reative o contato.
        </div>` : ''}
        <div class="detail-grid mb-4">
          <div class="detail-field"><div class="detail-label">Cliente</div><div class="detail-value">${Utils.escHtml(client?.nome || 'â€”')}</div></div>
          <div class="detail-field"><div class="detail-label">Status</div><div class="detail-value">${Utils.leadBadge(lead.status)}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Estimado</div><div class="detail-value font-bold text-primary">${Utils.formatCurrency(lead.valorEstimado)}</div></div>
          <div class="detail-field"><div class="detail-label">Valor Fechado</div><div class="detail-value">${Utils.formatCurrency(lead.valorFechado)}</div></div>
          <div class="detail-field"><div class="detail-label">Probabilidade</div><div class="detail-value"><span style="color:${stage?.color};font-weight:700">${prob}%</span> â†’ <strong>${Utils.formatCurrency(receitaEsperada)}</strong> esperado</div></div>
          <div class="detail-field"><div class="detail-label">Origem</div><div class="detail-value">${_origemBadge(lead.origemLead) || Utils.escHtml(lead.origemLead || 'â€”')}</div></div>
          <div class="detail-field"><div class="detail-label">ResponsÃ¡vel</div><div class="detail-value">${Utils.escHtml(lead.responsavel || 'â€”')}</div></div>
          <div class="detail-field"><div class="detail-label">Decisor</div><div class="detail-value">${Utils.escHtml(lead.decisor || 'â€”')}</div></div>
          <div class="detail-field"><div class="detail-label">Segmento</div><div class="detail-value">${Utils.escHtml(lead.segmento || 'â€”')}</div></div>
          <div class="detail-field"><div class="detail-label">ServiÃ§os</div><div class="detail-value">${Utils.escHtml(servicos || 'â€”')}</div></div>
          <div class="detail-field"><div class="detail-label">Proposta NÂº</div><div class="detail-value">${Utils.escHtml(lead.propostaNum || 'â€”')}</div></div>
        </div>
        <!-- LICITAÃ‡ÃƒO -->
        ${(() => {
          const lic = _getLic(lead);
          if (!lic) return '';
          const diasEntrega = Utils.daysUntil(lic.dataEntrega);
          const prazoColor = diasEntrega == null ? '#94a3b8' : diasEntrega < 0 ? '#ef4444' : diasEntrega <= 3 ? '#f97316' : diasEntrega <= 7 ? '#f59e0b' : '#0f766e';
          const prazoLabel = diasEntrega == null ? 'â€”' : diasEntrega < 0 ? `âš  Prazo vencido hÃ¡ ${Math.abs(diasEntrega)} dias` : diasEntrega === 0 ? 'âš  Vence HOJE' : `${diasEntrega} dias restantes`;
          const desconto = lic.valorOrgao && lic.lance ? Math.round((1 - lic.lance / lic.valorOrgao) * 100) : null;
          const resultColors = { 'Ganhou': '#10b981', 'Perdeu': '#ef4444', 'Cancelado': '#94a3b8', 'Suspenso': '#f59e0b', 'Em disputa': '#3b82f6' };
          return `<div style="background:#f0fdfa;border:1px solid #0f766e33;border-radius:var(--radius);padding:14px;margin-bottom:14px">
            <div style="font-weight:700;color:#0f766e;margin-bottom:10px;font-size:14px">ðŸ› Dados da LicitaÃ§Ã£o</div>
            <div class="detail-grid">
              <div class="detail-field"><div class="detail-label">Edital / Processo</div><div class="detail-value font-bold">${Utils.escHtml(lic.edital||'â€”')}</div></div>
              <div class="detail-field"><div class="detail-label">Ã“rgÃ£o Licitante</div><div class="detail-value">${Utils.escHtml(lic.orgao||'â€”')}</div></div>
              <div class="detail-field"><div class="detail-label">Modalidade</div><div class="detail-value">${Utils.escHtml(lic.modalidade||'â€”')}</div></div>
              ${lic.uasg ? `<div class="detail-field"><div class="detail-label">UASG</div><div class="detail-value">${Utils.escHtml(lic.uasg)}</div></div>` : ''}
              ${lic.dataEntrega ? `<div class="detail-field"><div class="detail-label">Prazo para Proposta</div><div class="detail-value" style="color:${prazoColor};font-weight:700">${Utils.formatDate(lic.dataEntrega)}<br><span class="text-xs">${prazoLabel}</span></div></div>` : ''}
              ${lic.valorOrgao ? `<div class="detail-field"><div class="detail-label">Valor Estimado Ã“rgÃ£o</div><div class="detail-value">${Utils.formatCurrency(lic.valorOrgao)}</div></div>` : ''}
              ${lic.lance ? `<div class="detail-field"><div class="detail-label">Nosso Lance</div><div class="detail-value font-bold text-primary">${Utils.formatCurrency(lic.lance)}${desconto !== null ? `<span class="text-xs text-muted ml-1">(${desconto}% abaixo do teto)</span>` : ''}</div></div>` : ''}
              ${lic.resultado ? `<div class="detail-field"><div class="detail-label">Resultado</div><div class="detail-value font-bold" style="color:${resultColors[lic.resultado]||'#64748b'}">${lic.resultado}</div></div>` : ''}
            </div>
            ${lic.link ? `<div class="mt-2"><a href="${Utils.escHtml(lic.link)}" target="_blank" class="btn btn-xs btn-secondary">ðŸ”— Abrir Edital</a></div>` : ''}
          </div>`;
        })()}
        <div class="detail-field mb-3" style="background:var(--warning-bg);padding:12px;border-radius:var(--radius);border-left:3px solid var(--warning)">
          <div class="detail-label">PrÃ³xima AÃ§Ã£o</div>
          <div class="detail-value">${Utils.escHtml(lead.proximaAcao || 'â€”')}</div>
          <div class="text-xs text-muted mt-1">${Utils.formatDate(lead.dataProximaAcao)} Â· ${diasLabel}</div>
        </div>
        ${lead.observacoes ? `<div class="detail-field"><div class="detail-label">ObservaÃ§Ãµes</div><div class="detail-value" style="white-space:pre-wrap">${Utils.escHtml(lead.observacoes)}</div></div>` : ''}
        ${lead.motivoPerda ? `<div class="detail-field mt-2"><div class="detail-label">Motivo de Perda</div><div class="detail-value text-danger">${Utils.escHtml(lead.motivoPerda)}</div></div>` : ''}
        <!-- PROPOSTA VINCULADA -->
        ${(() => {
          const prop = _getPropostaLead(lead.id);
          if (prop) {
            return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin:12px 0;border-left:3px solid var(--primary)">
              <div class="text-xs text-muted mb-1">ðŸ“„ Proposta Vinculada</div>
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-bold text-sm">${Utils.escHtml(prop.numero||'â€”')} Â· ${Utils.escHtml(prop.titulo)}</div>
                  <div class="text-xs text-muted">${Utils.formatCurrency(prop.valor)} Â· ${Utils.PROP_STATUS[prop.status]?.label||prop.status}</div>
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-xs btn-secondary" onclick="Modal.close();Propostas.view('${prop.id}')">ðŸ“„ Ver</button>
                  <button class="btn btn-xs btn-secondary" onclick="Modal.close();Propostas.openForm('${prop.id}')">âœ Editar</button>
                  ${prop.status !== 'aprovada' ? `<button class="btn btn-xs btn-primary" onclick="Modal.close();Propostas.changeStatus('${prop.id}','aprovada')">ðŸ¤ Fechar</button>` : ''}
                </div>
              </div>
            </div>`;
          } else if (['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status)) {
            return `<div style="background:#fef9c3;border-radius:var(--radius);padding:10px 14px;margin:12px 0;font-size:13px;color:#854d0e">
              ðŸ“„ Nenhuma proposta vinculada a este lead.
              <button class="btn btn-xs btn-secondary" style="margin-left:8px" onclick="Modal.close();Pipeline.criarPropostaLead('${lead.id}')">+ Criar Proposta</button>
            </div>`;
          }
          return '';
        })()}

        <!-- SCORE DETALHADO -->
        ${(() => {
          const { score, detalhes } = calcLeadScore(lead);
          const scoreCor = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#94a3b8';
          const scoreIcon = score >= 70 ? 'ðŸ”¥' : score >= 40 ? 'âš¡' : 'ðŸ§Š';
          return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-top:12px;border-left:3px solid ${scoreCor}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div class="font-bold text-sm">${scoreIcon} Score do Lead</div>
              <div style="font-size:22px;font-weight:800;color:${scoreCor}">${score}<span style="font-size:13px">/100</span></div>
            </div>
            <div style="height:6px;background:var(--border);border-radius:99px;margin-bottom:8px">
              <div style="width:${score}%;height:100%;background:${scoreCor};border-radius:99px"></div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${detalhes.map(d => `<span style="font-size:10px;background:var(--surface-2);padding:2px 6px;border-radius:99px;color:var(--text-muted)">${d}</span>`).join('')}</div>
          </div>`;
        })()}

        <!-- MODELOS DE E-MAIL -->
        ${(() => {
          const clienteNome = Utils.getClientName(lead.clienteId) || '';
          const tmplFn = _EMAIL_TEMPLATES[lead.status] || _EMAIL_TEMPLATES.followup;
          const texto = tmplFn(lead, clienteNome);
          const textEsc = Utils.escHtml(texto);
          const wppText = encodeURIComponent(texto);
          const telefone = lead.contato || '';
          return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-top:12px">
            <div class="font-bold text-sm mb-2">ðŸ“§ Modelo de E-mail / Mensagem</div>
            <div id="emailTemplate_${lead.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:12px;white-space:pre-wrap;max-height:140px;overflow-y:auto;color:var(--text)">${textEsc}</div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn btn-xs btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById('emailTemplate_${lead.id}').textContent).then(()=>Toast.success('Copiado!'))">ðŸ“‹ Copiar</button>
              ${telefone ? `<button class="btn btn-xs btn-success" style="background:#25D366;border-color:#25D366;color:#fff" onclick="window.open('https://wa.me/55${encodeURIComponent(telefone.replace(/\D/g,''))}?text=${wppText}','_blank')">ðŸ“± WhatsApp</button>` : ''}
              <button class="btn btn-xs btn-secondary" onclick="Pipeline.showEmailTemplates('${lead.id}')">ðŸ“¨ Ver todos modelos</button>
            </div>
          </div>`;
        })()}

        <!-- HISTÃ“RICO DO REGISTRO -->
        ${(() => {
          const logs = (DB.getAuditLog ? DB.getAuditLog() : []).filter(l => l.recordId === lead.id);
          if (!logs.length) return `<div style="margin-top:12px"><div class="font-bold text-sm mb-1">ðŸ“œ HistÃ³rico</div><div class="text-xs text-muted">Nenhuma alteraÃ§Ã£o registrada ainda.</div></div>`;
          return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-top:12px">
            <div class="font-bold text-sm mb-2">ðŸ“œ HistÃ³rico de AlteraÃ§Ãµes</div>
            <div style="max-height:120px;overflow-y:auto">
              ${logs.slice(-10).reverse().map(l => `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:8px">
                <span style="color:var(--text-muted);white-space:nowrap">${Utils.formatDate(l.ts?.split('T')[0]||'')}</span>
                <span>${Utils.escHtml(l.action||'')}: ${Utils.escHtml(l.field||'')} ${l.from !== undefined ? `<em>${Utils.escHtml(String(l.from||''))}</em> â†’ <strong>${Utils.escHtml(String(l.to||''))}</strong>` : ''}</span>
              </div>`).join('')}
            </div>
          </div>`;
        })()}

        <div class="mt-4 flex gap-2" style="flex-wrap:wrap">
          ${lead.status === 'fechado_ganho' ? `<button class="btn btn-success btn-sm" onclick="Modal.close();Pipeline.abrirContratoLead('${id}')">ðŸ¤ Fechar Contrato</button>` : ''}
          ${['proposta_elaboracao','proposta_enviada','negociacao'].includes(lead.status) && !_getPropostaLead(lead.id) ? `<button class="btn btn-secondary btn-sm" onclick="Modal.close();Pipeline.criarPropostaLead('${id}')">ðŸ“„ Criar Proposta</button>` : ''}
          ${frio ? `<button class="btn btn-warning btn-sm" onclick="Pipeline.criarFollowupAutomatico('${lead.id}');Modal.close()">ðŸ”” Criar Follow-up</button>` : ''}
          ${lead.contato ? `<button class="btn btn-sm" style="background:#25D366;border-color:#25D366;color:#fff" onclick="Utils.openWhatsApp('${Utils.escHtml(lead.contato)}','OlÃ¡ ${Utils.escHtml(lead.decisor||'')}! Sou da Bikows Engenharia. Gostaria de falar sobre ${Utils.escHtml(lead.titulo)}.')">ðŸ’¬ WhatsApp</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="Modal.close();Pipeline.openForm('${id}')">âœ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Modal.close()">Fechar</button>
        </div>
      `,
    });
  }

  /* Mostrar todos os modelos de e-mail para o lead */
  function showEmailTemplates(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const clienteNome = Utils.getClientName(lead.clienteId) || '';
    const etapas = [
      { key: 'lead_identificado', label: 'Lead Identificado' },
      { key: 'primeiro_contato', label: 'Primeiro Contato' },
      { key: 'qualificacao', label: 'QualificaÃ§Ã£o' },
      { key: 'proposta_elaboracao', label: 'Proposta em ElaboraÃ§Ã£o' },
      { key: 'proposta_enviada', label: 'Proposta Enviada' },
      { key: 'negociacao', label: 'NegociaÃ§Ã£o' },
      { key: 'followup', label: 'Follow-up GenÃ©rico' },
    ];
    let activeKey = lead.status;
    if (!_EMAIL_TEMPLATES[activeKey]) activeKey = 'followup';

    Modal.open({
      title: 'ðŸ“§ Modelos de E-mail / Mensagem',
      size: 'modal-lg',
      body: `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          ${etapas.map(e => `<button class="btn btn-xs ${e.key===activeKey?'btn-primary':'btn-secondary'}" onclick="Pipeline._selectEmailTemplate('${leadId}','${e.key}','${Utils.escHtml(clienteNome)}')" id="etmpl_btn_${e.key}">${e.label}</button>`).join('')}
        </div>
        <div id="etmpl_text" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px;font-size:13px;white-space:pre-wrap;min-height:150px;color:var(--text)">${Utils.escHtml((_EMAIL_TEMPLATES[activeKey]||_EMAIL_TEMPLATES.followup)(lead, clienteNome))}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById('etmpl_text').textContent).then(()=>Toast.success('Copiado!'))">ðŸ“‹ Copiar</button>
          ${lead.contato ? `<button class="btn btn-success" style="background:#25D366;border-color:#25D366;color:#fff" onclick="window.open('https://wa.me/55'+document.getElementById('etmpl_text').textContent.replace(/\\D/g,'').slice(-11)+'?text='+encodeURIComponent(document.getElementById('etmpl_text').textContent),'_blank')">ðŸ“± WhatsApp</button>` : ''}
        </div>
      `,
      saveLabel: null,
    });
  }

  function _selectEmailTemplate(leadId, key, clienteNome) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const fn = _EMAIL_TEMPLATES[key] || _EMAIL_TEMPLATES.followup;
    const texto = fn(lead, clienteNome);
    const el = document.getElementById('etmpl_text');
    if (el) el.textContent = texto;
    document.querySelectorAll('[id^="etmpl_btn_"]').forEach(b => b.classList.replace('btn-primary','btn-secondary'));
    const btn = document.getElementById(`etmpl_btn_${key}`);
    if (btn) { btn.classList.replace('btn-secondary','btn-primary'); }
  }

  /* ====================================================
     INTEGRAÃ‡ÃƒO PROPOSTA â†” PIPELINE
     ==================================================== */

  // Encontra proposta vinculada ao lead (por leadId na proposta ou propostaId no lead)
  function _getPropostaLead(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return null;
    return DB.getAll('propostas').find(p =>
      p.leadId === leadId || (lead.propostaId && p.id === lead.propostaId)
    ) || null;
  }

  // Cria proposta a partir do lead e vincula os dois
  // silencioso=true â†’ nÃ£o abre o formulÃ¡rio (usado na auto-criaÃ§Ã£o ao entrar na coluna)
  function criarPropostaLead(leadId, silencioso = false) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const nextNum = Propostas.nextNumeroProposta(); // gerador centralizado com piso histÃ³rico
    const proposta = DB.create('propostas', {
      numero: nextNum,
      titulo: lead.titulo,
      clienteId: lead.clienteId,
      responsavel: lead.responsavel,
      valor: lead.valorEstimado || 0,
      status: 'elaboracao',
      leadId,
      itens: [],
      versoes: [],
    });
    // Vincula no lead
    DB.update('leads', leadId, { propostaId: proposta.id, propostaNum: proposta.numero });
    render();
    if (!silencioso) {
      Toast.success(`Proposta ${proposta.numero} criada e vinculada ao lead!`);
      setTimeout(() => Propostas.openForm(proposta.id), 300);
    }
    return proposta;
  }

  // Abre o fluxo completo de fechamento de contrato para um lead
  function abrirContratoLead(leadId) {
    const proposta = _getPropostaLead(leadId);
    if (proposta) {
      // JÃ¡ tem proposta â†’ usa o fluxo de fechamento dela
      Propostas.abrirFluxoContratacao(proposta.id);
    } else {
      // Sem proposta â†’ cria uma rascunho e jÃ¡ abre o fechamento
      const lead = DB.get('leads', leadId);
      if (!lead) return;
      Modal.open({
        title: 'ðŸ¤ Fechar Contrato',
        size: 'modal-sm',
        body: `
          <p class="text-sm mb-3">Este lead nÃ£o tem proposta vinculada.</p>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn btn-primary" onclick="Modal.close();Pipeline.criarPropostaLead('${leadId}')">
              ðŸ“„ Criar proposta primeiro e depois fechar
            </button>
            <button class="btn btn-secondary" onclick="Modal.close();Pipeline._fecharSemProposta('${leadId}')">
              âš¡ Fechar contrato diretamente (sem proposta)
            </button>
          </div>
        `,
        saveLabel: null,
        cancelLabel: 'Cancelar',
      });
    }
  }

  // Fecha contrato direto (sem proposta prÃ©via) â€” cria uma rascunho internamente
  function _fecharSemProposta(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const nextNum = 'BIK-' + new Date().getFullYear() + '-CTR-' + String(DB.getAll('propostas').length + 1).padStart(3,'0');
    const proposta = DB.create('propostas', {
      numero: nextNum,
      titulo: lead.titulo,
      clienteId: lead.clienteId,
      responsavel: lead.responsavel,
      valor: lead.valorFechado || lead.valorEstimado || 0,
      status: 'elaboracao',
      leadId,
      itens: [],
      versoes: [],
    });
    DB.update('leads', leadId, { propostaId: proposta.id, propostaNum: proposta.numero });
    Propostas.abrirFluxoContratacao(proposta.id);
  }

  // Prompt ao arrastar lead para "Fechado/Ganho"
  function _promptContratacao(leadId) {
    const lead = DB.get('leads', leadId);
    const proposta = _getPropostaLead(leadId);
    const propInfo = proposta
      ? `Proposta vinculada: <strong>${Utils.escHtml(proposta.numero)} Â· ${Utils.formatCurrency(proposta.valor)}</strong>`
      : 'Nenhuma proposta vinculada ainda.';

    Modal.open({
      title: 'ðŸŽ‰ NegÃ³cio Ganho! Iniciar ContrataÃ§Ã£o?',
      size: 'modal-sm',
      body: `
        <div style="text-align:center;padding:10px 0 16px">
          <div style="font-size:40px;margin-bottom:8px">ðŸŽ‰</div>
          <div class="font-bold" style="font-size:16px">${Utils.escHtml(lead?.titulo||'')}</div>
          <div class="text-sm text-muted mt-1">${propInfo}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary" onclick="Modal.close();Pipeline.abrirContratoLead('${leadId}')">
            ðŸ¤ Abrir fluxo de contrataÃ§Ã£o
          </button>
          <button class="btn btn-secondary" onclick="Modal.close()">
            Fazer depois
          </button>
        </div>
      `,
      saveLabel: null,
      cancelLabel: null,
    });
  }

  // Ao entrar em "Proposta em ElaboraÃ§Ã£o": cria stub automaticamente e notifica com o nÃºmero
  function _sugerirCriarProposta(leadId) {
    const propostaExistente = _getPropostaLead(leadId);
    if (propostaExistente) {
      // JÃ¡ tem proposta â€” apenas informa
      Toast.show(
        `ðŸ“„ Proposta <strong>${Utils.escHtml(propostaExistente.numero||'')}</strong> jÃ¡ vinculada a este lead.`,
        4000
      );
      return;
    }
    const lead = DB.get('leads', leadId);
    // Cria stub silenciosamente (nÃ£o abre form ainda)
    const proposta = criarPropostaLead(leadId, true);
    if (!proposta) return;
    // Toast com o nÃºmero reservado + link para abrir e preencher
    Toast.success(
      `ðŸ“‹ NÃºmero <strong>${Utils.escHtml(proposta.numero)}</strong> reservado para ` +
      `"<strong>${Utils.escHtml(lead?.titulo||'')}</strong>". ` +
      `<a href="#" onclick="Propostas.openForm('${proposta.id}');return false;" style="color:#fff;text-decoration:underline;font-weight:600">` +
      `Preencher proposta â†’</a>`,
      9000
    );
  }

  function criarProjeto(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const cfg = DB.getConfig();
    const seq = String(DB.getAll('projetos').length + 1).padStart(3, '0');
    const codigo = `BIK-${new Date().getFullYear()}-PRJ-${seq}`;
    const respOpts = cfg.responsaveis.map(r => `<option value="${r}" ${lead.responsavel===r?'selected':''}>${r}</option>`).join('');
    Modal.open({
      title: 'ðŸ“‹ Criar Projeto a partir do Lead',
      size: 'modal-lg',
      body: `
        <div style="background:var(--primary-light);padding:12px;border-radius:var(--radius);margin-bottom:16px;border-left:3px solid var(--primary)">
          <div class="text-xs text-muted">Lead de origem</div>
          <div class="font-bold">${Utils.escHtml(lead.titulo)}</div>
          <div class="text-sm text-muted">${Utils.escHtml(Utils.getClientName(lead.clienteId))} Â· ${Utils.formatCurrency(lead.valorFechado||lead.valorEstimado)}</div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">TÃ­tulo do Projeto *</label>
            <input class="form-control" id="cpTitulo" value="${Utils.escHtml(lead.titulo)}">
          </div>
          <div class="form-group">
            <label class="form-label">CÃ³digo</label>
            <input class="form-control" id="cpCodigo" value="${codigo}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor (R$) *</label>
            <input class="form-control" id="cpValor" type="number" value="${lead.valorFechado||lead.valorEstimado||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de InÃ­cio</label>
            <input class="form-control" id="cpInicio" type="date" value="${Utils.todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">Prazo</label>
            <input class="form-control" id="cpPrazo" type="date">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">ResponsÃ¡vel</label>
          <select class="form-control" id="cpResp"><option value="">â€”</option>${respOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">ObservaÃ§Ãµes</label>
          <textarea class="form-control" id="cpObs" rows="2">${Utils.escHtml(lead.observacoes||'')}</textarea>
        </div>`,
      saveCb: () => {
        const titulo = document.getElementById('cpTitulo').value.trim();
        const valor = Number(document.getElementById('cpValor').value);
        if (!titulo) { Toast.error('TÃ­tulo obrigatÃ³rio'); return; }
        DB.create('projetos', {
          titulo, valor,
          codigo: document.getElementById('cpCodigo').value,
          clienteId: lead.clienteId,
          responsavel: document.getElementById('cpResp').value,
          dataInicio: document.getElementById('cpInicio').value,
          prazo: document.getElementById('cpPrazo').value,
          status: 'planejado',
          nfEmitida: false, pagamentoRecebido: false,
          etapas: [],
          observacoes: document.getElementById('cpObs').value,
          leadOrigemId: leadId,
        });
        Toast.success('Projeto criado com sucesso!');
        Modal.close();
        App.navigate('projetos');
      },
    });
  }

  function criarRecebivel(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    const valor = lead.valorFechado || lead.valorEstimado || 0;
    const hoje = Utils.todayStr();
    DB.create('recebiveis', {
      clienteId: lead.clienteId,
      descricao: lead.titulo,
      valorTotal: valor,
      parcelas: [{ id: Date.now().toString(36), vencimento: hoje, valor, status: 'a_vencer', dataPagamento: null, nfNumero: '' }],
    });
    Toast.success('RecebÃ­vel criado! Acesse Financeiro â†’ Contas a Receber para ajustar as parcelas.');
  }

  function openForm(id = null, defaultStatus = 'lead_identificado') {
    const cfg = DB.getConfig();
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    const lead = id ? DB.get('leads', id) : null;
    const st = lead ? lead.status : defaultStatus;

    const clientOptions = clientes.map(c => `<option value="${c.id}" ${lead?.clienteId === c.id ? 'selected' : ''}>${Utils.escHtml(c.nome)}</option>`).join('');
    const stageOptions = STAGES.map(s => `<option value="${s.key}" ${st === s.key ? 'selected' : ''}>${s.label} (${s.prob}%)</option>`).join('');
    const respOptions = cfg.responsaveis.map(r => `<option value="${r}" ${lead?.responsavel === r ? 'selected' : ''}>${r}</option>`).join('');
    const servicosOptions = cfg.servicos.map(s => {
      const sel = (lead?.servicoInteresse || []).includes(s) ? 'selected' : '';
      return `<option value="${s}" ${sel}>${s}</option>`;
    }).join('');
    const origens = [
      '','TrÃ¡fego Pago','IndicaÃ§Ã£o','RecorrÃªncia',
      'ProspecÃ§Ã£o Ativa','Site / SEO','LinkedIn','Evento / Feira',
      'Parceria','Outro'
    ];
    const motivos = ['PreÃ§o','ConcorrÃªncia','Sem orÃ§amento','Sem urgÃªncia','Sem resposta','Outro'];

    Modal.open({
      title: id ? 'Editar Lead' : 'Novo Lead',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">TÃ­tulo / Oportunidade *</label>
            <input class="form-control" id="fTitulo" value="${Utils.escHtml(lead?.titulo||'')}" placeholder="Ex: AdequaÃ§Ã£o NR-12 Linha de ProduÃ§Ã£o">
          </div>
          <div class="form-group">
            <label class="form-label">Status / Etapa</label>
            <select class="form-control" id="fStatus">${stageOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Cliente</label>
            <select class="form-control" id="fCliente"><option value="">Selecionar cliente</option>${clientOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Segmento</label>
            <select class="form-control" id="fSegmento">
              ${cfg.segmentos.map(s => `<option value="${s}" ${lead?.segmento === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Valor Estimado (R$)</label>
            <input class="form-control" id="fValor" type="number" value="${lead?.valorEstimado||''}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Valor Fechado (R$)</label>
            <input class="form-control" id="fValorFechado" type="number" value="${lead?.valorFechado||''}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">ResponsÃ¡vel</label>
            <select class="form-control" id="fResponsavel"><option value="">â€”</option>${respOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Origem do Lead ðŸ“¡</label>
            <select class="form-control" id="fOrigem" onchange="Pipeline._previewOrigem(this)">
              ${origens.map(o => `<option value="${o}" ${lead?.origemLead===o?'selected':''}>${_origemIcon(o)} ${o||'â€” Selecionar â€”'}</option>`).join('')}
            </select>
            <div id="fOrigemPreview" style="margin-top:4px;min-height:20px">${_origemBadge(lead?.origemLead||'')}</div>
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Decisor</label>
            <input class="form-control" id="fDecisor" value="${Utils.escHtml(lead?.decisor||'')}" placeholder="Nome e cargo do decisor">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">PrÃ³xima AÃ§Ã£o *</label>
            <input class="form-control" id="fProximaAcao" value="${Utils.escHtml(lead?.proximaAcao||'')}" placeholder="O que fazer?">
          </div>
          <div class="form-group">
            <label class="form-label">Data da PrÃ³xima AÃ§Ã£o *</label>
            <input class="form-control" id="fDataAcao" type="date" value="${lead?.dataProximaAcao||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Telefone / WhatsApp do Contato ðŸ’¬</label>
          <input class="form-control" id="fContato" value="${Utils.escHtml(lead?.contato||'')}" placeholder="(XX) XXXXX-XXXX" oninput="Utils.autoFormatPhone(this)">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Proposta Vinculada</label>
            ${(() => {
              const props = DB.getAll('propostas').filter(p => !p.clienteId || p.clienteId === (lead?.clienteId||''));
              const opts = props.map(p => `<option value="${p.id}" ${(lead?.propostaId===p.id)?'selected':''}>${Utils.escHtml(p.numero||'â€”')} Â· ${Utils.escHtml(p.titulo)} (${Utils.PROP_STATUS[p.status]?.label||p.status})</option>`).join('');
              return `<select class="form-control" id="fPropostaId">
                <option value="">â€” Nenhuma / Criar depois</option>
                ${opts}
              </select>
              <input type="hidden" id="fPropostaNum" value="${Utils.escHtml(lead?.propostaNum||'')}">`;
            })()}
          </div>
          <div class="form-group">
            <label class="form-label">Motivo de Perda</label>
            <select class="form-control" id="fMotivo">
              <option value="">â€”</option>
              ${motivos.map(m => `<option value="${m}" ${lead?.motivoPerda===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">ServiÃ§os de Interesse</label>
          <select class="form-control" id="fServicos" multiple style="height:80px">${servicosOptions}</select>
          <div class="text-xs text-muted mt-1">Segure Ctrl para selecionar mÃºltiplos</div>
        </div>
        <div class="form-group">
          <label class="form-label">ComissÃ£o do ResponsÃ¡vel (%)</label>
          <input class="form-control" id="fComissaoPerc" type="number" min="0" max="100" step="0.5" value="${lead?.comissaoPerc||5}" placeholder="5">
          <div class="text-xs text-muted mt-1">PadrÃ£o: 5%. Usado no relatÃ³rio de comissÃµes.</div>
        </div>
        <div class="form-group">
          <label class="form-label">ObservaÃ§Ãµes</label>
          <textarea class="form-control" id="fObs" rows="3">${Utils.escHtml(lead?.observacoes||'')}</textarea>
        </div>

        <!-- SEÃ‡ÃƒO CAMPANHA GOOGLE ADS (exibida sÃ³ quando origem = TrÃ¡fego Pago) -->
        <div id="campanhaTrafegoSection" style="display:${lead?.origemLead==='TrÃ¡fego Pago'?'block':'none'};background:var(--teal-light);border:1px solid #99f6e4;border-radius:var(--radius);padding:14px;margin-top:8px">
          <div class="form-label" style="color:#0d9488;margin-bottom:8px">ðŸŽ¯ GOOGLE ADS â€” Campanha</div>
          <div class="form-group">
            <label class="form-label">Campanha vinculada</label>
            <select class="form-control" id="fCampanhaId">
              <option value="">â€” Selecionar campanha â€”</option>
              ${DB.getAll('trafego_campanhas').filter(c => c.status !== 'encerrada').map(c =>
                `<option value="${c.id}" ${lead?.campanhaId===c.id?'selected':''}>${Utils.escHtml(c.nome)} Â· ${c.plataforma || 'Google Ads'}</option>`
              ).join('')}
            </select>
            <span class="form-hint">Vincule este lead a uma campanha para acompanhar o ROI</span>
          </div>
        </div>

        <!-- SEÃ‡ÃƒO LICITAÃ‡ÃƒO (exibida sÃ³ quando origem = LicitaÃ§Ã£o PÃºblica) -->
        <div id="licitacaoSection" style="display:${lead?.origemLead==='LicitaÃ§Ã£o PÃºblica'?'block':'none'}">
          <div style="background:#f0fdfa;border:1px solid #0f766e44;border-radius:var(--radius);padding:14px;margin-top:4px">
            <div style="font-weight:700;font-size:14px;color:#0f766e;margin-bottom:12px">ðŸ› Dados da LicitaÃ§Ã£o</div>
            <div class="form-row">
              <div class="form-group" style="flex:2">
                <label class="form-label">NÂº do Edital / Processo *</label>
                <input class="form-control" id="fLicEdital" value="${Utils.escHtml(lead?.licitacao?.edital||'')}" placeholder="Ex: PregÃ£o EletrÃ´nico 003/2026">
              </div>
              <div class="form-group">
                <label class="form-label">Modalidade</label>
                <select class="form-control" id="fLicModalidade">
                  <option value="">â€”</option>
                  ${_MODALIDADES_LIC.map(m => `<option value="${m}" ${lead?.licitacao?.modalidade===m?'selected':''}>${m}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex:2">
                <label class="form-label">Ã“rgÃ£o Licitante</label>
                <input class="form-control" id="fLicOrgao" value="${Utils.escHtml(lead?.licitacao?.orgao||'')}" placeholder="Ex: Prefeitura de RibeirÃ£o do Pinhal / MinistÃ©rio da SaÃºde">
              </div>
              <div class="form-group">
                <label class="form-label">UASG (ComprasNet)</label>
                <input class="form-control" id="fLicUasg" value="${Utils.escHtml(lead?.licitacao?.uasg||'')}" placeholder="Ex: 153046">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data Limite para Proposta â±</label>
                <input class="form-control" id="fLicDataEntrega" type="date" value="${lead?.licitacao?.dataEntrega||''}">
                <div class="text-xs text-muted mt-1">Gera alerta automÃ¡tico no card</div>
              </div>
              <div class="form-group">
                <label class="form-label">Valor Estimado pelo Ã“rgÃ£o (R$)</label>
                <input class="form-control" id="fLicValorOrgao" type="number" step="0.01" value="${lead?.licitacao?.valorOrgao||''}" placeholder="Teto declarado no edital">
              </div>
              <div class="form-group">
                <label class="form-label">Nosso Lance / Proposta (R$)</label>
                <input class="form-control" id="fLicLance" type="number" step="0.01" value="${lead?.licitacao?.lance||''}" placeholder="Valor que ofertamos">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex:3">
                <label class="form-label">Link do Edital</label>
                <input class="form-control" id="fLicLink" value="${Utils.escHtml(lead?.licitacao?.link||'')}" placeholder="https://comprasnet.gov.br/...">
              </div>
              <div class="form-group">
                <label class="form-label">Resultado</label>
                <select class="form-control" id="fLicResultado">
                  ${['','Em disputa','Ganhou','Perdeu','Cancelado','Suspenso'].map(r =>
                    `<option value="${r}" ${lead?.licitacao?.resultado===r?'selected':''}>${r||'â€” Aguardando â€”'}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>
      `,
      saveCb: () => saveLead(id),
    });
  }

  function saveLead(id) {
    const titulo = document.getElementById('fTitulo').value.trim();
    if (!titulo) { Toast.error('TÃ­tulo obrigatÃ³rio'); return; }
    const existingLead = id ? DB.get('leads', id) : null;

    const servicos = [...document.getElementById('fServicos').selectedOptions].map(o => o.value);
    const campanhaId = document.getElementById('fCampanhaId')?.value || null;
    const data = {
      titulo,
      status: document.getElementById('fStatus').value,
      clienteId: document.getElementById('fCliente').value,
      segmento: document.getElementById('fSegmento').value,
      valorEstimado: Number(document.getElementById('fValor').value) || 0,
      valorFechado: Number(document.getElementById('fValorFechado').value) || 0,
      responsavel: document.getElementById('fResponsavel').value,
      origemLead: document.getElementById('fOrigem').value,
      campanhaId: campanhaId,
      licitacao: document.getElementById('fOrigem').value === 'LicitaÃ§Ã£o PÃºblica' ? {
        edital:      document.getElementById('fLicEdital')?.value.trim() || '',
        modalidade:  document.getElementById('fLicModalidade')?.value || '',
        orgao:       document.getElementById('fLicOrgao')?.value.trim() || '',
        uasg:        document.getElementById('fLicUasg')?.value.trim() || '',
        dataEntrega: document.getElementById('fLicDataEntrega')?.value || '',
        valorOrgao:  Number(document.getElementById('fLicValorOrgao')?.value) || 0,
        lance:       Number(document.getElementById('fLicLance')?.value) || 0,
        link:        document.getElementById('fLicLink')?.value.trim() || '',
        resultado:   document.getElementById('fLicResultado')?.value || '',
      } : (existingLead?.licitacao || null),
      decisor: document.getElementById('fDecisor').value,
      proximaAcao: document.getElementById('fProximaAcao').value,
      dataProximaAcao: document.getElementById('fDataAcao').value,
      propostaNum: document.getElementById('fPropostaNum').value,
      propostaId: document.getElementById('fPropostaId')?.value || existingLead?.propostaId || null,
      motivoPerda: document.getElementById('fMotivo').value,
      contato: document.getElementById('fContato').value,
      servicoInteresse: servicos,
      comissaoPerc: Number(document.getElementById('fComissaoPerc')?.value) || 5,
      observacoes: document.getElementById('fObs').value,
    };

    if (id) {
      DB.update('leads', id, data);
      Toast.success('Lead atualizado');
    } else {
      DB.create('leads', data);
      Toast.success('Lead criado');
      // Notificar equipe via Telegram
      _notificarEvento('lead_novo', {
        titulo: data.titulo || data.cliente || '',
        valor: data.valorEstimado || 0,
        servico: data.servico || data.segmento || '',
        responsavel: data.responsavel || '',
      });
    }
    Modal.close();
    render();
    App.updateNotifBadge();
  }

  async function _notificarEvento(evento, dados) {
    try {
      await fetch('https://mxvwccyopzfewhvscrzj.supabase.co/functions/v1/crm-notificacoes-eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dndjY3lvcHpmZXdodnNjcnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDI2OTYsImV4cCI6MjA5NDM3ODY5Nn0.zDPXwxt5UjY2NN1HMc1cVtPlKvAcOOlhh032Ls7MSMg' },
        body: JSON.stringify({ evento, dados }),
      });
    } catch {}
  }

  function deleteLead(id) {
    const lead = DB.get('leads', id);
    Utils.confirmDelete(lead?.titulo || 'este lead', () => {
      DB.remove('leads', id);
      Toast.success('Lead removido');
      render();
      App.updateNotifBadge();
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
        const headers = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
        const idx = (col) => headers.indexOf(col);

        let created = 0, skipped = 0;
        lines.slice(1).forEach(line => {
          const cols = line.split(';').map(c => c.trim().replace(/^["']|["']$/g, ''));
          const titulo = cols[idx('titulo')] || '';
          if (!titulo) { skipped++; return; }

          // Buscar ou criar cliente
          const clienteNome = cols[idx('clientenome')] || cols[idx('cliente')] || cols[idx('clientenome')] || '';
          let clienteId = null;
          if (clienteNome) {
            const existente = DB.getAll('clientes').find(c => c.nome?.toLowerCase() === clienteNome.toLowerCase());
            if (existente) {
              clienteId = existente.id;
            } else {
              const segmento = cols[idx('segmento')] || '';
              clienteId = DB.create('clientes', { nome: clienteNome, segmento, ativo: true });
            }
          }

          const statusRaw = cols[idx('status')] || 'lead_identificado';
          const statusVal = STAGES.find(s => s.key === statusRaw) ? statusRaw : 'lead_identificado';

          DB.create('leads', {
            titulo,
            clienteId,
            clienteNome: clienteNome,
            segmento: cols[idx('segmento')] || '',
            valorEstimado: Number(cols[idx('valorestimado')]) || 0,
            status: statusVal,
            responsavel: cols[idx('responsavel')] || '',
            origemLead: cols[idx('origemlead')] || '',
            decisor: cols[idx('decisor')] || '',
            observacoes: cols[idx('observacoes')] || '',
            dataEntrada: Utils.todayStr(),
          });
          created++;
        });

        Toast.success(`${created} lead(s) importado(s)!${skipped ? ` (${skipped} linha(s) ignorada(s))` : ''}`);
        render();
        App.updateNotifBadge();
      } catch (err) {
        Toast.error('Erro ao processar CSV: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function downloadCSVTemplate() {
    const header = 'titulo;clienteNome;segmento;valorEstimado;status;responsavel;origemLead;decisor;observacoes';
    const example = 'AdequaÃ§Ã£o NR-12 â€” FrigorÃ­fico Exemplo;FrigorÃ­fico Exemplo Ltda;Alimentos;85000;lead_identificado;JoÃ£o Silva;IndicaÃ§Ã£o;Maria Costa (Diretora);Lead quente â€” visita tÃ©cnica agendada';
    const blob = new Blob([header + '\n' + example], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-leads.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    Toast.success('Modelo CSV baixado!');
  }

  function addNew() { openForm(); }

  /* ---- Drill-down dos KPI cards ---- */
  function drillDown(tipo) {
    const hoje = new Date().toISOString().split('T')[0];
    let title = '', items = [], cols = [], rowFn = () => [];

    const allLeads = DB.getAll('leads');
    const leadsAtivos = allLeads.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));

    if (tipo === 'pipeline_total') {
      title = 'Total em Pipeline';
      items = leadsAtivos;
      cols = ['Lead', 'Etapa', 'Valor', 'ResponsÃ¡vel'];
      rowFn = l => {
        const stage = STAGES.find(s => s.key === l.status);
        return [
          Utils.escHtml(l.titulo),
          `<span style="font-size:11px;color:${stage?.color||'#64748b'}">${stage?.label||l.status}</span>`,
          Utils.formatCurrency(l.valorEstimado),
          Utils.escHtml(l.responsavel || 'â€”'),
        ];
      };
    } else if (tipo === 'receita_fechada') {
      title = 'Receita Fechada / Ganho';
      items = allLeads.filter(l => l.status === 'fechado_ganho');
      cols = ['Lead', 'Valor Fechado', 'Data', 'ResponsÃ¡vel'];
      rowFn = l => [
        Utils.escHtml(l.titulo),
        `<strong>${Utils.formatCurrency(l.valorFechado)}</strong>`,
        Utils.formatDate(l.updatedAt ? l.updatedAt.split('T')[0] : l.createdAt?.split('T')[0]),
        Utils.escHtml(l.responsavel || 'â€”'),
      ];
    } else if (tipo === 'leads_frios') {
      title = 'Leads Frios';
      items = leadsAtivos.filter(l => _isLeadFrio(l));
      cols = ['Lead', 'Etapa', 'Dias sem AtualizaÃ§Ã£o', 'ResponsÃ¡vel'];
      rowFn = l => {
        const stage = STAGES.find(s => s.key === l.status);
        const dias = _diasSemAtualizacao(l);
        return [
          Utils.escHtml(l.titulo),
          `<span style="font-size:11px;color:${stage?.color||'#64748b'}">${stage?.label||l.status}</span>`,
          `<span style="color:#f59e0b;font-weight:700">${dias != null ? dias + 'd' : 'â€”'}</span>`,
          Utils.escHtml(l.responsavel || 'â€”'),
        ];
      };
    } else if (tipo === 'propostas_abertas') {
      title = 'Propostas em Aberto';
      items = leadsAtivos.filter(l => ['proposta_elaboracao','proposta_enviada'].includes(l.status));
      cols = ['Lead', 'Etapa', 'Valor', 'ResponsÃ¡vel'];
      rowFn = l => {
        const stage = STAGES.find(s => s.key === l.status);
        return [
          Utils.escHtml(l.titulo),
          `<span style="font-size:11px;color:${stage?.color||'#64748b'}">${stage?.label||l.status}</span>`,
          Utils.formatCurrency(l.valorEstimado),
          Utils.escHtml(l.responsavel || 'â€”'),
        ];
      };
    } else if (tipo === 'em_negociacao') {
      title = 'Em NegociaÃ§Ã£o';
      items = leadsAtivos.filter(l => l.status === 'negociacao');
      cols = ['Lead', 'Valor', 'PrÃ³xima AÃ§Ã£o', 'ResponsÃ¡vel'];
      rowFn = l => [
        Utils.escHtml(l.titulo),
        `<strong>${Utils.formatCurrency(l.valorEstimado)}</strong>`,
        Utils.escHtml(l.proximaAcao || 'â€”'),
        Utils.escHtml(l.responsavel || 'â€”'),
      ];
    }

    Modal.open({
      title: `${title} â€” ${items.length} registro(s)`,
      body: `<div style="max-height:55vh;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--surface-2,#f8fafc);position:sticky;top:0">
            ${cols.map(c=>`<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border)">${c}</th>`).join('')}
          </tr></thead>
          <tbody>${items.length ? items.map(item=>{
            const cells = rowFn(item);
            return `<tr style="border-bottom:1px solid var(--border);cursor:pointer"
              onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
              ${cells.map(v=>`<td style="padding:8px 12px">${v}</td>`).join('')}</tr>`;
          }).join('') : `<tr><td colspan="${cols.length}" style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`}
          </tbody>
        </table></div>`,
      saveCb: null,
    });
    setTimeout(()=>{ const f=document.getElementById('modalFoot'); if(f) f.style.display='none'; },0);
  }

  /* ---- RelatÃ³rio de leads por canal de origem ---- */
  function relatorioOrigem() {
    const leads = DB.getAll('leads');
    const canais = Object.keys(_ORIGENS_MAP);
    // Inclui "Sem origem" para leads sem campo preenchido
    const semOrigem = leads.filter(l => !l.origemLead || !_ORIGENS_MAP[l.origemLead]);

    const rows = canais.map(canal => {
      const grupo = leads.filter(l => l.origemLead === canal);
      const ativos  = grupo.filter(l => !['fechado_ganho','fechado_perdido'].includes(l.status));
      const ganhos  = grupo.filter(l => l.status === 'fechado_ganho');
      const perdidos = grupo.filter(l => l.status === 'fechado_perdido');
      const valorPipeline = Utils.sum(ativos, 'valorEstimado');
      const valorFechado  = Utils.sum(ganhos, 'valorFechado');
      const taxa = grupo.length ? Math.round((ganhos.length / grupo.length) * 100) : 0;
      const m = _ORIGENS_MAP[canal];
      return { canal, m, total: grupo.length, ativos: ativos.length, ganhos: ganhos.length, perdidos: perdidos.length, valorPipeline, valorFechado, taxa };
    }).filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);

    const totalGeral = leads.length;
    const canalMaisLeads = rows[0]?.canal || 'â€”';

    Modal.open({
      title: 'ðŸ“¡ Leads por Canal de Origem',
      size: 'modal-lg',
      saveLabel: null,
      body: `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
            <div class="text-xs text-muted">Total de leads</div>
            <div class="font-bold" style="font-size:22px">${totalGeral}</div>
          </div>
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
            <div class="text-xs text-muted">Canais ativos</div>
            <div class="font-bold" style="font-size:22px">${rows.length}</div>
          </div>
          <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
            <div class="text-xs text-muted">Canal com mais leads</div>
            <div class="font-bold" style="font-size:16px">${_origemBadge(canalMaisLeads)}</div>
          </div>
        </div>

        <!-- Barras visuais por canal -->
        <div style="margin-bottom:20px">
          ${rows.map(r => {
            const pct = totalGeral > 0 ? Math.round((r.total / totalGeral) * 100) : 0;
            return `
            <div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span>${_origemBadge(r.canal)}</span>
                <span class="text-xs text-muted">${r.total} leads Â· ${pct}% do total</span>
              </div>
              <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${r.m.color};border-radius:99px"></div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <!-- Tabela detalhada -->
        <table class="tbl">
          <thead>
            <tr>
              <th>Canal</th>
              <th style="text-align:center">Total</th>
              <th style="text-align:center">Ativos</th>
              <th style="text-align:center">Ganhos</th>
              <th style="text-align:center">Taxa</th>
              <th style="text-align:right">Pipeline</th>
              <th style="text-align:right">Fechado</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${_origemBadge(r.canal)}</td>
              <td style="text-align:center;font-weight:700">${r.total}</td>
              <td style="text-align:center" class="text-muted">${r.ativos}</td>
              <td style="text-align:center;color:#10b981;font-weight:700">${r.ganhos}</td>
              <td style="text-align:center">
                <span style="font-weight:700;color:${r.taxa>=40?'#10b981':r.taxa>=20?'#f59e0b':'#ef4444'}">${r.taxa}%</span>
              </td>
              <td style="text-align:right" class="font-bold text-primary">${Utils.formatCurrency(r.valorPipeline)}</td>
              <td style="text-align:right;color:#10b981;font-weight:700">${Utils.formatCurrency(r.valorFechado)}</td>
            </tr>`).join('')}
            ${semOrigem.length ? `<tr style="opacity:.6">
              <td><span style="font-size:11px;color:var(--text-muted)">â“ Sem origem</span></td>
              <td style="text-align:center">${semOrigem.length}</td>
              <td colspan="5" class="text-xs text-muted">Preencha o campo Origem nos leads</td>
            </tr>` : ''}
          </tbody>
        </table>
        ${semOrigem.length ? `<div class="text-xs text-muted mt-3">âš  ${semOrigem.length} lead(s) sem canal de origem preenchido. Edite-os para melhorar a anÃ¡lise.</div>` : ''}
      `,
    });
  }

  /* ---- Atalho para filtrar somente licitaÃ§Ãµes ---- */
  function filtrarLicitacoes() {
    const total = DB.getAll('leads').filter(l => l.origemLead === 'LicitaÃ§Ã£o PÃºblica').length;
    if (total === 0) { Toast.show('Nenhum lead com origem "LicitaÃ§Ã£o PÃºblica" cadastrado ainda.'); return; }
    _filter.origemLead = 'LicitaÃ§Ã£o PÃºblica';
    render();
  }

  /* ================================================
     MELHORIA 8: REATIVAÃ‡ÃƒO DE LEADS PERDIDOS
     ================================================ */
  function reativarLeadsPerdidos() {
    const limiteData = new Date();
    limiteData.setDate(limiteData.getDate() - 90);
    const limitStr = limiteData.toISOString().split('T')[0];

    const perdidos = DB.getAll('leads').filter(l => {
      if (l.status !== 'fechado_perdido') return false;
      const ref = l.updatedAt || l.createdAt || '';
      return ref.slice(0,10) <= limitStr;
    }).sort((a,b) => (a.updatedAt||a.createdAt||'').localeCompare(b.updatedAt||b.createdAt||''));

    if (!perdidos.length) {
      Toast.show('Nenhum lead perdido hÃ¡ mais de 90 dias encontrado.');
      return;
    }

    Modal.open({
      title: `â™»ï¸ Reativar Leads Perdidos â€” ${perdidos.length} leads`,
      size: 'modal-lg',
      body: `
        <div style="margin-bottom:12px;padding:10px;background:#ecfdf5;border-radius:var(--radius);border-left:3px solid #10b981">
          <div class="text-sm">Leads marcados como perdidos hÃ¡ <strong>mais de 90 dias</strong>. Reative para colocar de volta no pipeline.</div>
        </div>
        <table class="tbl">
          <thead><tr><th>Empresa/Lead</th><th>Motivo Perda</th><th>Valor</th><th>Dias desde perda</th><th>Resp.</th><th>AÃ§Ãµes</th></tr></thead>
          <tbody>
            ${perdidos.map(l => {
              const ref = l.updatedAt || l.createdAt || '';
              const diasPerda = ref ? Math.round((Date.now() - new Date(ref)) / 86400000) : 'â€”';
              return `<tr id="row_reativar_${l.id}">
                <td>
                  <div class="font-bold text-sm">${Utils.escHtml(l.titulo)}</div>
                  <div class="text-xs text-muted">${Utils.escHtml(Utils.getClientName(l.clienteId))}</div>
                </td>
                <td class="text-xs">${Utils.escHtml(l.motivoPerda || 'â€”')}</td>
                <td class="text-sm font-bold">${Utils.formatCurrency(l.valorEstimado)}</td>
                <td><span class="badge badge-yellow">${diasPerda}d</span></td>
                <td class="text-xs">${Utils.escHtml(l.responsavel || 'â€”')}</td>
                <td>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-xs btn-primary" onclick="Pipeline._reativarLead('${l.id}')">ðŸ“ž Reativar</button>
                    <button class="btn btn-xs btn-danger" onclick="Pipeline._arquivarLead('${l.id}')">ðŸ—‘ Arquivar</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `,
      saveLabel: null,
    });
  }

  function _reativarLead(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    DB.update('leads', leadId, {
      status: 'lead_identificado',
      motivoPerda: null,
      dataProximaAcao: Utils.todayStr(),
      proximaAcao: 'Reativar contato',
    });
    Toast.success(`Lead "${lead.titulo}" reativado e voltou ao funil!`);
    // Remove a linha da tabela
    const row = document.getElementById(`row_reativar_${leadId}`);
    if (row) row.remove();
    render();
  }

  function _arquivarLead(leadId) {
    const lead = DB.get('leads', leadId);
    if (!lead) return;
    DB.update('leads', leadId, { status: 'fechado_perdido', arquivado: true });
    Toast.show(`Lead "${lead.titulo}" arquivado definitivamente.`);
    const row = document.getElementById(`row_reativar_${leadId}`);
    if (row) row.remove();
  }

  return {
    render, openForm, saveLead, deleteLead, viewLead, addNew,
    dragStart, dragEnd, dragOver, dragLeave, drop,
    criarProjeto, criarRecebivel, criarFollowupAutomatico, listaLeadsFrios,
    criarPropostaLead, abrirContratoLead, _fecharSemProposta,
    relatorioOrigem, filtrarLicitacoes,
    setFilter, clearFilters, setPeriodo,
    drillDown,
    _previewOrigem, _toggleLicitacaoSection, _toggleCampanhaSection,
    importCSV, downloadCSVTemplate,
    reativarLeadsPerdidos, _reativarLead, _arquivarLead,
    showEmailTemplates, _selectEmailTemplate,
    calcLeadScore,
  };
})();
