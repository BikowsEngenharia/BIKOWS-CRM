/* ==========================================
   DB.js — Camada de dados (Supabase + cache em memória)
   Reads: síncronos via _cache
   Writes: cache-first + async para Supabase
   ========================================== */
const DB = (() => {

  const ENTITIES = [
    'clientes','contatos','leads','projetos','atividades',
    'propostas','recebiveis','funcionarios','lancamentos',
    'contaspagar','folha','licitacoes','metas','contratos',
    'marketing_posts','marketing_campanhas','marketing_ideias','marketing_kpis',
    'trafego_campanhas','trafego_metas',
  ];

  // Cache em memória — populado por loadAll()
  const _cache = {};
  ENTITIES.forEach(e => (_cache[e] = []));
  _cache.config = null;

  /* ---- Helpers ---- */
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  /* ====================================================
     LEITURAS SÍNCRONAS (via cache)
     ==================================================== */
  function getAll(entity)      { return _cache[entity] || []; }
  function get(entity, id)     { return getAll(entity).find(r => r.id === id) || null; }
  function getConfig()         { return _cache.config || defaultConfig(); }

  /* ====================================================
     ESCRITA NO SUPABASE (async, silenciosa)
     ==================================================== */
  /* ---- Backup local (resiliência offline / multi-device) ---- */
  function _saveLocalBackup(table) {
    try {
      const data = _cache[table];
      if (data && data.length > 0) {
        localStorage.setItem('crm_cache_' + table, JSON.stringify(data));
      }
    } catch (e) { /* silencioso — quota excedida etc */ }
  }

  function _loadLocalBackup(table) {
    try {
      const raw = localStorage.getItem('crm_cache_' + table);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch (e) { return null; }
  }

  async function _sbUpsert(table, record) {
    try {
      const { error } = await _supabase.from(table).upsert({ id: record.id, data: record });
      if (error) console.warn('[DB] upsert:', table, error.message);
      else _saveLocalBackup(table); // atualiza backup após escrita bem-sucedida
    } catch (e) {
      console.warn('[DB] upsert exception:', e);
    }
  }

  async function _sbDelete(table, id) {
    try {
      const { error } = await _supabase.from(table).delete().eq('id', id);
      if (error) console.warn('[DB] delete:', table, error.message);
    } catch (e) {
      console.warn('[DB] delete exception:', e);
    }
  }

  /* ====================================================
     AUDITORIA
     ==================================================== */
  const AUDIT_ENTITIES = ['leads','clientes','projetos','propostas','contratos','licitacoes','atividades'];

  function _auditLog(operacao, entity, record) {
    if (!AUDIT_ENTITIES.includes(entity)) return;
    try {
      const AUDIT_KEY = 'crm_auditoria';
      const MAX_LOGS = 500;
      const logs = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');

      const nome = record?.titulo || record?.nome || record?.numero || record?.orgao || record?.id?.substring(0,8) || '—';

      logs.unshift({
        ts: new Date().toISOString(),
        op: operacao,
        entidade: entity,
        registroId: record?.id || '—',
        resumo: nome,
      });

      if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
      localStorage.setItem(AUDIT_KEY, JSON.stringify(logs));
    } catch (e) { /* silencioso */ }
  }

  function getAuditLog() {
    try {
      return JSON.parse(localStorage.getItem('crm_auditoria') || '[]');
    } catch(e) { return []; }
  }

  function clearAuditLog() {
    localStorage.removeItem('crm_auditoria');
  }

  /* ====================================================
     CRUD (cache-first)
     ==================================================== */
  function create(entity, data) {
    const record = {
      ...data,
      id: data.id || genId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _cache[entity].push(record);
    _auditLog('create', entity, record);
    _sbUpsert(entity, record);
    return record;
  }

  function update(entity, id, data) {
    const idx = _cache[entity].findIndex(r => r.id === id);
    if (idx === -1) return null;
    _cache[entity][idx] = {
      ..._cache[entity][idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    _auditLog('update', entity, _cache[entity][idx]);
    _sbUpsert(entity, _cache[entity][idx]);
    return _cache[entity][idx];
  }

  function remove(entity, id) {
    const toDelete = _cache[entity].find(r => r.id === id);
    _auditLog('delete', entity, toDelete);
    _cache[entity] = _cache[entity].filter(r => r.id !== id);
    _saveLocalBackup(entity);
    _sbDelete(entity, id);
  }

  function saveConfig(data) {
    _cache.config = { ...(_cache.config || defaultConfig()), ...data };
    _supabase.from('config')
      .upsert({ id: 'singleton', data: _cache.config })
      .then(({ error }) => { if (error) console.warn('[DB] saveConfig:', error.message); });
  }

  /* ====================================================
     LOAD ALL — busca Supabase → popula cache
     ==================================================== */
  async function loadAll() {
    const fetches = ENTITIES.map(async (entity) => {
      try {
        const { data: rows, error } = await _supabase
          .from(entity)
          .select('data')
          .order('created_at', { ascending: true });

        if (error) {
          console.warn('[DB] load error:', entity, error.message);
          // Fallback: usa backup local se disponível
          const backup = _loadLocalBackup(entity);
          if (backup) {
            _cache[entity] = backup;
            console.info('[DB] usando backup local para:', entity, '(' + backup.length + ' registros)');
          }
          return;
        }

        const fromSupabase = (rows || []).map(r => r.data).filter(Boolean);
        if (fromSupabase.length > 0) {
          _cache[entity] = fromSupabase;
          _saveLocalBackup(entity); // mantém backup sincronizado
        } else {
          // Supabase retornou vazio — pode ser nova instalação OU problema de conexão
          // Só usa fallback se o cache local tiver dados e for uma tabela core
          const backup = _loadLocalBackup(entity);
          if (backup) {
            _cache[entity] = backup;
            console.info('[DB] Supabase vazio, restaurando local:', entity);
          }
        }
      } catch (e) {
        console.warn('[DB] load exception:', entity, e);
        const backup = _loadLocalBackup(entity);
        if (backup) _cache[entity] = backup;
      }
    });

    const configFetch = async () => {
      const { data: row, error } = await _supabase
        .from('config')
        .select('data')
        .eq('id', 'singleton')
        .maybeSingle();
      if (!error && row) _cache.config = row.data;
    };

    await Promise.all([...fetches, configFetch()]);
  }

  /* ====================================================
     REALTIME — sincroniza entre dispositivos
     ==================================================== */
  function subscribeRealtime() {
    ENTITIES.forEach(entity => {
      _supabase
        .channel('crm_' + entity)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: entity },
          (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              const record = newRow?.data;
              if (!record) return;
              const idx = _cache[entity].findIndex(r => r.id === record.id);
              if (idx === -1) _cache[entity].push(record);
              else            _cache[entity][idx] = record;
            } else if (eventType === 'DELETE') {
              const oldId = oldRow?.id;
              if (oldId) _cache[entity] = _cache[entity].filter(r => r.id !== oldId);
            }
            // Re-renderiza a página atual se for afetada
            if (typeof App !== 'undefined') App.refreshIfNeeded(entity);
          }
        )
        .subscribe();
    });

    // Config
    _supabase
      .channel('crm_config')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'config' },
        (payload) => {
          if (payload.new?.data) _cache.config = payload.new.data;
        }
      )
      .subscribe();
  }

  /* ====================================================
     DADOS DE EXEMPLO — semeados somente se BD estiver vazio
     ==================================================== */
  async function initSampleData() {
    // Aguarda o cache estar populado
    if (_cache.clientes.length > 0) return;

    /* ---- Clientes ---- */
    const c1 = create('clientes', { nome: 'Frigorífico Bela Vista', cnpj: '12.345.678/0001-90', segmento: 'Alimentos', porte: 'Grande', cidade: 'Londrina', estado: 'PR', email: 'contato@belavista.com.br', telefone: '(43) 3333-1234', ativo: true });
    const c2 = create('clientes', { nome: 'Metalúrgica Irmãos Costa', cnpj: '98.765.432/0001-10', segmento: 'Metal-Mecânica', porte: 'Médio', cidade: 'Maringá', estado: 'PR', email: 'igor@metalcosta.com.br', telefone: '(44) 3322-5678', ativo: true });
    const c3 = create('clientes', { nome: 'Cooperativa AgroSul', cnpj: '11.222.333/0001-44', segmento: 'Agro', porte: 'Grande', cidade: 'Cascavel', estado: 'PR', email: 'eng@agrosul.coop.br', telefone: '(45) 3311-9012', ativo: true });
    const c4 = create('clientes', { nome: 'Distribuidora EnergiaMax', cnpj: '55.666.777/0001-22', segmento: 'Energia', porte: 'Médio', cidade: 'São Paulo', estado: 'SP', email: 'projetos@energiamax.com.br', telefone: '(11) 4422-3344', ativo: true });
    const c5 = create('clientes', { nome: 'Construtora Horizonte', cnpj: '33.444.555/0001-66', segmento: 'Construção', porte: 'Pequeno', cidade: 'Curitiba', estado: 'PR', email: 'obras@horizonte.com.br', telefone: '(41) 3255-6677', ativo: true });

    /* ---- Contatos ---- */
    create('contatos', { clienteId: c1.id, nome: 'Roberto Alves', cargo: 'Gerente de Segurança', email: 'roberto@belavista.com.br', telefone: '(43) 99811-2233', principal: true });
    create('contatos', { clienteId: c2.id, nome: 'Igor Costa', cargo: 'Diretor Industrial', email: 'igor@metalcosta.com.br', telefone: '(44) 99722-3344', principal: true });
    create('contatos', { clienteId: c3.id, nome: 'Fernanda Souza', cargo: 'Eng. de Segurança', email: 'fernanda@agrosul.coop.br', telefone: '(45) 98833-5566', principal: true });

    const hoje = new Date();
    const d = (offset) => { const dt = new Date(hoje); dt.setDate(dt.getDate() + offset); return dt.toISOString().split('T')[0]; };
    const m = (monthOffset, day = 10) => { const dt = new Date(hoje); dt.setMonth(dt.getMonth() + monthOffset); dt.setDate(day); return dt.toISOString().split('T')[0]; };

    /* ---- Leads ---- */
    create('leads', { clienteId: c1.id, titulo: 'Adequação NR-12 Linha de Abate', segmento: 'Alimentos', valorEstimado: 85000, status: 'qualificacao', origemLead: 'Indicação', decisor: 'Roberto Alves', servicoInteresse: ['NR-12', 'Laudo Técnico'], proximaAcao: 'Visita técnica para levantamento de campo', dataProximaAcao: d(2), responsavel: 'Marcos', observacoes: 'Cliente tem prazo de 60 dias para regularizar. Alta prioridade.' });
    create('leads', { clienteId: c2.id, titulo: 'NR-12 Prensas e Guilhotinas', segmento: 'Metal-Mecânica', valorEstimado: 42000, status: 'proposta_enviada', origemLead: 'Prospecção', decisor: 'Igor Costa', servicoInteresse: ['NR-12'], proximaAcao: 'Follow-up da proposta', dataProximaAcao: d(-1), responsavel: 'Ana', observacoes: '' });
    create('leads', { clienteId: c3.id, titulo: 'Trabalho em Altura — Silos', segmento: 'Agro', valorEstimado: 120000, status: 'negociacao', origemLead: 'Site', decisor: 'Fernanda Souza', servicoInteresse: ['NR-35', 'Linha de Vida'], proximaAcao: 'Reunião final para definição de escopo', dataProximaAcao: d(3), responsavel: 'Marcos', observacoes: 'Negociando ajuste de 10%.' });
    create('leads', { clienteId: c4.id, titulo: 'Projeto Elétrico Subestação', segmento: 'Energia', valorEstimado: 65000, status: 'primeiro_contato', origemLead: 'LinkedIn', decisor: 'Patrícia Moura', servicoInteresse: ['NR-10'], proximaAcao: 'Ligar para agendar visita', dataProximaAcao: d(1), responsavel: 'Carlos', observacoes: '' });
    create('leads', { clienteId: c5.id, titulo: 'AVCB Galpão Industrial', segmento: 'Construção', valorEstimado: 18000, status: 'lead_identificado', origemLead: 'Indicação', decisor: 'Paulo Horizonte', servicoInteresse: ['AVCB'], proximaAcao: 'Primeiro contato por WhatsApp', dataProximaAcao: d(0), responsavel: 'Julia', observacoes: '' });
    create('leads', { clienteId: c1.id, titulo: 'Treinamento NR-35 Equipe', segmento: 'Alimentos', valorEstimado: 12000, status: 'fechado_ganho', valorFechado: 11500, origemLead: 'Retorno', decisor: 'Roberto Alves', servicoInteresse: ['NR-35', 'Treinamento'], proximaAcao: '', dataProximaAcao: '', responsavel: 'Marcos', observacoes: 'Contrato assinado.' });
    create('leads', { clienteId: c2.id, titulo: 'Consultoria SST Anual', segmento: 'Metal-Mecânica', valorEstimado: 36000, status: 'fechado_perdido', motivoPerda: 'Preço', origemLead: 'Prospecção', decisor: 'Igor Costa', servicoInteresse: ['Consultoria'], proximaAcao: '', dataProximaAcao: '', responsavel: 'Ana', observacoes: '' });

    /* ---- Projetos ---- */
    create('projetos', { clienteId: c1.id, titulo: 'Adequação NR-35 Área Frigorificada', codigo: 'BIK-2026-PRJ-001', responsavel: 'Marcos', dataInicio: d(-30), prazo: d(30), status: 'em_andamento', valor: 48000, nfEmitida: true, pagamentoRecebido: false, etapas: [{ nome: 'Levantamento de campo', inicio: d(-30), fim: d(-20), pct: 100, status: 'concluida' }, { nome: 'Elaboração do projeto', inicio: d(-19), fim: d(-5), pct: 100, status: 'concluida' }, { nome: 'Implantação física', inicio: d(-4), fim: d(20), pct: 45, status: 'em_andamento' }, { nome: 'ART e relatório final', inicio: d(21), fim: d(30), pct: 0, status: 'pendente' }], observacoes: '' });
    create('projetos', { clienteId: c3.id, titulo: 'Linha de Vida — Silos Armazenagem', codigo: 'BIK-2026-PRJ-002', responsavel: 'Carlos', dataInicio: d(-15), prazo: d(45), status: 'em_andamento', valor: 95000, nfEmitida: false, pagamentoRecebido: false, etapas: [{ nome: 'Projeto técnico', inicio: d(-15), fim: d(-5), pct: 100, status: 'concluida' }, { nome: 'Fornecimento de materiais', inicio: d(-4), fim: d(10), pct: 60, status: 'em_andamento' }, { nome: 'Instalação', inicio: d(11), fim: d(35), pct: 0, status: 'pendente' }, { nome: 'Ensaio de carga + laudo', inicio: d(36), fim: d(45), pct: 0, status: 'pendente' }], observacoes: '' });

    /* ---- Atividades ---- */
    create('atividades', { tipo: 'reuniao', titulo: 'Reunião técnica — Bela Vista', descricao: 'Levantar escopo NR-12 na linha de abate', data: d(2), hora: '09:00', clienteId: c1.id, responsavel: 'Marcos', status: 'pendente', prioridade: 'alta' });
    create('atividades', { tipo: 'followup', titulo: 'Follow-up proposta — Metal Costa', descricao: 'Ligar para Igor sobre proposta BIK-2026-CTR-002', data: d(0), hora: '14:00', clienteId: c2.id, responsavel: 'Ana', status: 'pendente', prioridade: 'alta' });
    create('atividades', { tipo: 'email', titulo: 'Enviar proposta revisada — AgroSul', descricao: 'Enviar versão com desconto de 8%', data: d(1), hora: '10:00', clienteId: c3.id, responsavel: 'Marcos', status: 'pendente', prioridade: 'media' });
    create('atividades', { tipo: 'ligacao', titulo: 'Primeiro contato — EnergiaMax', descricao: 'Ligar para Patrícia para agendar visita', data: d(1), hora: '15:30', clienteId: c4.id, responsavel: 'Carlos', status: 'pendente', prioridade: 'media' });

    /* ---- Propostas ---- */
    create('propostas', { numero: 'BIK-2026-CTR-001', clienteId: c3.id, titulo: 'Linha de Vida e NR-35 — Silos AgroSul', descricao: 'Fornecimento, instalação e certificação de sistema de linha de vida', valor: 115000, validade: d(30), status: 'negociacao', responsavel: 'Marcos', observacoes: '' });
    create('propostas', { numero: 'BIK-2026-CTR-002', clienteId: c2.id, titulo: 'Adequação NR-12 Prensas — Metal Costa', descricao: 'Projeto e implantação de proteções em conformidade NR-12', valor: 42000, validade: d(15), status: 'enviada', responsavel: 'Ana', observacoes: '' });
    create('propostas', { numero: 'BIK-2026-CTR-003', clienteId: c1.id, titulo: 'Treinamento NR-35 — Bela Vista', descricao: 'Treinamento de trabalho em altura para 40 colaboradores', valor: 11500, validade: d(-10), status: 'aprovada', responsavel: 'Marcos', observacoes: '' });

    /* ---- Recebíveis ---- */
    create('recebiveis', { clienteId: c1.id, descricao: 'Projeto NR-35 — BIK-2026-PRJ-001', valorTotal: 48000, parcelas: [{ id: genId(), vencimento: d(-20), valor: 16000, status: 'recebido', dataPagamento: d(-18), nfNumero: '1234' }, { id: genId(), vencimento: d(10), valor: 16000, status: 'a_vencer', dataPagamento: null, nfNumero: '' }, { id: genId(), vencimento: d(30), valor: 16000, status: 'a_vencer', dataPagamento: null, nfNumero: '' }] });
    create('recebiveis', { clienteId: c3.id, descricao: 'Linha de Vida Silos — BIK-2026-PRJ-002', valorTotal: 95000, parcelas: [{ id: genId(), vencimento: d(-5), valor: 28500, status: 'a_vencer', dataPagamento: null, nfNumero: '' }, { id: genId(), vencimento: d(35), valor: 33250, status: 'a_vencer', dataPagamento: null, nfNumero: '' }, { id: genId(), vencimento: d(45), valor: 33250, status: 'a_vencer', dataPagamento: null, nfNumero: '' }] });

    /* ---- Funcionários ---- */
    const f1 = create('funcionarios', { nome: 'Marcos da Silva Israel', cpf: '123.456.789-00', rg: '12.345.678-9', cargo: 'Engenheiro Mecânico', departamento: 'Engenharia', dataAdmissao: '2020-01-15', salarioBase: 9500, vt: 300, vr: 600, planoSaude: 450, dependentes: 1, crea: 'CREA PR-206397/D', banco: 'Itaú', agencia: '1234', conta: '56789-0', tipo_conta: 'corrente', ativo: true, observacoes: 'Sócio-administrador' });
    const f2 = create('funcionarios', { nome: 'Ana Paula Ferreira', cpf: '987.654.321-00', rg: '98.765.432-1', cargo: 'Engenheira de Segurança', departamento: 'Engenharia', dataAdmissao: '2021-03-01', salarioBase: 7200, vt: 240, vr: 480, planoSaude: 380, dependentes: 0, crea: 'CREA PR-189234/D', banco: 'Bradesco', agencia: '5678', conta: '12345-6', tipo_conta: 'corrente', ativo: true, observacoes: '' });
    const f3 = create('funcionarios', { nome: 'Carlos Eduardo Moura', cpf: '456.789.123-00', rg: '45.678.912-3', cargo: 'Técnico de Segurança', departamento: 'Operações', dataAdmissao: '2022-06-01', salarioBase: 4800, vt: 200, vr: 400, planoSaude: 320, dependentes: 2, crea: '', banco: 'Caixa', agencia: '2345', conta: '67890-1', tipo_conta: 'poupanca', ativo: true, observacoes: '' });
    const f4 = create('funcionarios', { nome: 'Julia Rodrigues Santos', cpf: '321.654.987-00', rg: '32.165.498-7', cargo: 'Assistente Comercial', departamento: 'Comercial', dataAdmissao: '2023-02-15', salarioBase: 3200, vt: 180, vr: 320, planoSaude: 280, dependentes: 0, crea: '', banco: 'Nubank', agencia: '0001', conta: '111111-1', tipo_conta: 'corrente', ativo: true, observacoes: '' });
    const f5 = create('funcionarios', { nome: 'Roberto Fernandes', cpf: '654.321.098-00', rg: '65.432.109-8', cargo: 'Soldador', departamento: 'Produção', dataAdmissao: '2021-09-10', salarioBase: 3800, vt: 200, vr: 360, planoSaude: 0, dependentes: 3, crea: '', banco: 'Itaú', agencia: '3456', conta: '23456-7', tipo_conta: 'corrente', ativo: true, observacoes: '' });

    /* ---- Lançamentos Financeiros ---- */
    create('lancamentos', { tipo: 'receita', categoria: 'Serviços de Engenharia', descricao: 'NR-35 Bela Vista — parcela 1/3', valor: 16000, data: d(-20), status: 'recebido', clienteId: c1.id, observacoes: '' });
    create('lancamentos', { tipo: 'receita', categoria: 'Treinamentos', descricao: 'Treinamento NR-35 — Bela Vista', valor: 11500, data: m(-2, 15), status: 'recebido', clienteId: c1.id, observacoes: '' });
    create('lancamentos', { tipo: 'receita', categoria: 'Serviços de Engenharia', descricao: 'Consultoria SST — EnergiaMax', valor: 22000, data: m(-2, 22), status: 'recebido', clienteId: c4.id, observacoes: '' });
    create('lancamentos', { tipo: 'receita', categoria: 'Serviços de Engenharia', descricao: 'Laudo NR-12 — Metal Costa', valor: 18500, data: m(-1, 8), status: 'recebido', clienteId: c2.id, observacoes: '' });
    create('lancamentos', { tipo: 'receita', categoria: 'Consultorias', descricao: 'Consultoria mensal — Construtora Horizonte', valor: 6500, data: m(-1, 20), status: 'recebido', clienteId: c5.id, observacoes: '' });
    create('lancamentos', { tipo: 'receita', categoria: 'Serviços de Engenharia', descricao: 'NR-35 Bela Vista — parcela 2/3', valor: 16000, data: d(10), status: 'a_receber', clienteId: c1.id, observacoes: '' });
    create('lancamentos', { tipo: 'receita', categoria: 'Serviços de Engenharia', descricao: 'Linha de Vida AgroSul — parcela 1/3', valor: 28500, data: d(-5), status: 'a_receber', clienteId: c3.id, observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Folha de Pagamento', descricao: 'Folha ' + m(-2, 5).substring(0, 7), valor: 29000, data: m(-2, 5), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Encargos/FGTS', descricao: 'FGTS + INSS patronal ' + m(-2, 7).substring(0, 7), valor: 7800, data: m(-2, 7), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Aluguel/Estrutura', descricao: 'Aluguel sede + galpão', valor: 8500, data: m(-2, 10), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Materiais', descricao: 'Materiais projeto NR-35 Bela Vista', valor: 12400, data: m(-2, 14), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Combustível', descricao: 'Abastecimento frota — mês anterior', valor: 3200, data: m(-1, 3), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Folha de Pagamento', descricao: 'Folha ' + m(-1, 5).substring(0, 7), valor: 29000, data: m(-1, 5), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Encargos/FGTS', descricao: 'FGTS + INSS patronal ' + m(-1, 7).substring(0, 7), valor: 7800, data: m(-1, 7), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Aluguel/Estrutura', descricao: 'Aluguel sede + galpão', valor: 8500, data: m(-1, 10), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'TI/Softwares', descricao: 'Licenças AutoCAD + pacote MS365', valor: 1850, data: m(-1, 12), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Contabilidade', descricao: 'Honorários contabilidade', valor: 2200, data: m(-1, 15), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Materiais', descricao: 'Materiais projeto Silos AgroSul', valor: 18600, data: d(-8), status: 'pago', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Folha de Pagamento', descricao: 'Folha ' + d(0).substring(0, 7), valor: 29000, data: d(5), status: 'a_pagar', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Encargos/FGTS', descricao: 'FGTS + INSS patronal ' + d(0).substring(0, 7), valor: 7800, data: d(7), status: 'a_pagar', observacoes: '' });
    create('lancamentos', { tipo: 'despesa', categoria: 'Aluguel/Estrutura', descricao: 'Aluguel sede + galpão', valor: 8500, data: d(10), status: 'a_pagar', observacoes: '' });

    /* ---- Contas a Pagar ---- */
    create('contaspagar', { fornecedor: 'Ferragens Industrial Ltda', categoria: 'Materiais', descricao: 'Chapa de aço — NF 4521', valor: 8750, vencimento: d(8), status: 'pendente', recorrente: false, observacoes: '' });
    create('contaspagar', { fornecedor: 'Escritório de Contabilidade Silva', categoria: 'Contabilidade', descricao: 'Honorários maio/2026', valor: 2200, vencimento: d(15), status: 'pendente', recorrente: true, observacoes: '' });
    create('contaspagar', { fornecedor: 'Locadora de Equipamentos RK', categoria: 'Materiais', descricao: 'Locação andaime — projeto Silos', valor: 3400, vencimento: d(20), status: 'pendente', recorrente: false, observacoes: '' });
    create('contaspagar', { fornecedor: 'Imobiliária Centro', categoria: 'Aluguel/Estrutura', descricao: 'Aluguel sede maio/2026', valor: 8500, vencimento: d(10), status: 'pendente', recorrente: true, observacoes: '' });
    create('contaspagar', { fornecedor: 'Posto Combustível Central', categoria: 'Combustível', descricao: 'Abastecimento frota abril', valor: 3200, vencimento: d(-3), status: 'pago', dataPagamento: d(-3), recorrente: false, observacoes: '' });
    create('contaspagar', { fornecedor: 'Autodesk Brasil', categoria: 'TI/Softwares', descricao: 'Licença AutoCAD 2026', valor: 1200, vencimento: d(25), status: 'pendente', recorrente: true, observacoes: '' });
    create('contaspagar', { fornecedor: 'Subcontratado — Elétrica Ramos', categoria: 'Subcontratados', descricao: 'Serviços elétricos — projeto NR-10', valor: 6500, vencimento: d(30), status: 'pendente', recorrente: false, observacoes: '' });

    /* ---- Folha de Pagamento ---- */
    const mesAnterior = m(-1, 1).substring(0, 7);
    [f1, f2, f3, f4, f5].forEach(func => {
      const sal  = func.salarioBase;
      const inss = Math.round(calcINSSSample(sal) * 100) / 100;
      const irrf = Math.round(calcIRRFSample(sal - inss - func.dependentes * 189.59) * 100) / 100;
      const fgts = Math.round(sal * 0.08 * 100) / 100;
      const planoSaude     = func.planoSaude || 0;
      const bruto          = sal + (func.vt || 0) + (func.vr || 0);
      const totalDescontos = inss + irrf + planoSaude;
      const liquido        = Math.round((bruto - totalDescontos) * 100) / 100;
      create('folha', {
        funcionarioId: func.id, mes: mesAnterior, nome: func.nome, cargo: func.cargo,
        salarioBase: sal, vt: func.vt || 0, vr: func.vr || 0, planoSaude,
        outrosAdicionais: 0, dependentes: func.dependentes || 0,
        bruto, inss, irrf, fgts, totalDescontos, liquido,
        pago: true, dataPagamento: m(-1, 5), observacoes: '',
      });
    });

    /* ---- Licitações ---- */
    create('licitacoes', {
      numero: 'PE 012/2026 — UASG 854321',
      objeto: 'Contratação de empresa especializada para adequação de máquinas e equipamentos às normas regulamentadoras NR-12 e NR-35 nas instalações da Secretaria de Infraestrutura.',
      orgao: 'Prefeitura Municipal de Londrina', uasg: '854321',
      modalidade: 'Pregão Eletrônico', portal: 'Comprasnet (PNCP)',
      status: 'proposta_preparando', responsavel: 'Marcos',
      dataPublicacao: d(-10), dataAbertura: d(7), dataResultado: d(14),
      prazoExecucao: 120, valorEstimado: 185000, valorProposta: null, valorAdjudicado: null,
      servicos: ['NR-12', 'NR-35'], linkEdital: '', linkPortal: '',
      observacoes: 'Edital exige ART e atestado de capacidade técnica de serviços similares.',
      checklist: { juridica_0: true, juridica_1: true, fiscal_0: true, fiscal_1: true, fiscal_4: true },
      notas: '15/04 — Edital retirado e em análise.\n22/04 — Enviado pedido de esclarecimento sobre item 8.3.',
    });
    create('licitacoes', {
      numero: 'Concorrência 003/2026',
      objeto: 'Contratação de serviços de engenharia para elaboração de projeto e instalação de sistema de proteção contra quedas (NR-35 / NR-33) em unidades de armazenagem.',
      orgao: 'CONAB — Companhia Nacional de Abastecimento', uasg: '135098',
      modalidade: 'Concorrência', portal: 'Comprasnet (PNCP)',
      status: 'sessao_realizada', responsavel: 'Marcos',
      dataPublicacao: d(-45), dataAbertura: d(-5), dataResultado: d(10),
      prazoExecucao: 180, valorEstimado: 420000, valorProposta: 389500, valorAdjudicado: null,
      colocacao: '2º lugar (provisório)', servicos: ['NR-35', 'NR-33', 'Linha de Vida'],
      linkEdital: '', linkPortal: '',
      observacoes: 'Sessão realizada. Nossa proposta: R$ 389.500. 1º lugar: R$ 371.000.',
      checklist: { juridica_0: true, juridica_1: true, juridica_2: true, fiscal_0: true, fiscal_1: true, tecnica_0: true, tecnica_1: true, proposta_0: true },
      notas: 'Sessão realizada. Ficamos em 2º lugar por margem de 4,8%.',
    });
    create('licitacoes', {
      numero: 'PE 074/2025 — UASG 246810',
      objeto: 'Contratação de empresa para realização de treinamentos em NR-10, NR-12 e NR-35 para servidores e colaboradores terceirizados.',
      orgao: 'COPEL — Companhia Paranaense de Energia', uasg: '246810',
      modalidade: 'Pregão Eletrônico', portal: 'BLL',
      status: 'ganhou', responsavel: 'Ana',
      dataPublicacao: d(-90), dataAbertura: d(-60), dataResultado: d(-55),
      prazoExecucao: 12, valorEstimado: 68000, valorProposta: 59800, valorAdjudicado: 59800,
      colocacao: '1º lugar', servicos: ['NR-10', 'NR-12', 'NR-35', 'Treinamento'],
      linkEdital: '', linkPortal: '',
      observacoes: 'Contrato assinado. Execução prevista em 12 parcelas mensais de R$ 4.983.',
      checklist: {}, notas: 'GANHAMOS! Contrato assinado em ' + d(-50) + '.',
    });
  }

  /* ====================================================
     CONFIG PADRÃO
     ==================================================== */
  function defaultConfig() {
    return {
      empresa: 'Bikows Soluções em Engenharia',
      cnpj: '', cidade: '', estado: '',
      responsaveis: ['Marcos', 'Ana', 'Carlos', 'Julia'],
      segmentos: ['Alimentos', 'Metal-Mecânica', 'Agro', 'Energia', 'Construção', 'Papel e Celulose', 'Químico', 'Outro'],
      servicos: ['NR-12', 'NR-35', 'NR-33', 'NR-10', 'NR-13', 'Linha de Vida', 'Estrutura Metálica', 'Laudo Técnico', 'AVCB', 'Projeto Elétrico', 'Treinamento', 'Consultoria', 'Outro'],
      usuario: { nome: 'Marcos', cargo: 'Eng. Responsável' },
    };
  }

  /* ====================================================
     CÁLCULOS DE FOLHA (tabelas 2024/2025)
     ==================================================== */
  function calcINSSSample(sal) {
    const faixas = [
      { ate: 1412.00, aliq: 0.075 },
      { ate: 2666.68, aliq: 0.09  },
      { ate: 4000.03, aliq: 0.12  },
      { ate: 7786.02, aliq: 0.14  },
    ];
    let total = 0, anterior = 0;
    for (const f of faixas) {
      if (sal <= anterior) break;
      const base = Math.min(sal, f.ate) - anterior;
      total += base * f.aliq;
      anterior = f.ate;
      if (sal <= f.ate) break;
    }
    return Math.min(total, 908.86);
  }

  function calcIRRFSample(base) {
    const faixas = [
      { ate: 2824.00,   aliq: 0,     ded: 0       },
      { ate: 3751.05,   aliq: 0.075, ded: 211.80  },
      { ate: 4664.68,   aliq: 0.15,  ded: 492.60  },
      { ate: 5877.26,   aliq: 0.225, ded: 843.75  },
      { ate: Infinity,  aliq: 0.275, ded: 1137.77 },
    ];
    if (base <= 0) return 0;
    for (const f of faixas) {
      if (base <= f.ate) return Math.max(0, base * f.aliq - f.ded);
    }
    return 0;
  }

  return {
    getAll, get, create, update, remove,
    getConfig, saveConfig,
    loadAll, subscribeRealtime, initSampleData,
    getAuditLog, clearAuditLog,
  };
})();
