/* ==========================================
   PROPOSTA_DOC.js
   Ponte entre o CRM e o documento modelo (proposta_documento.html).
   Monta o payload a partir dos dados já gravados na proposta, no cliente
   e nas configurações, grava em localStorage e abre o documento pronto.
   Nenhum dado é apagado: apenas leitura do CRM + escrita no localStorage.
   ========================================== */
const PropostaDoc = (() => {

  const CHAVE   = 'crm_proposta_doc';
  const ARQUIVO = 'proposta_documento.html';

  /* Dados que saem impressos quando nada foi configurado. O documento tem a
     mesma lista como rede de segurança (ele também abre sozinho). */
  const PADROES = {
    empresa: {
      razao: 'BIKOWS EMPREENDIMENTOS LTDA',
      cnpj: '47.121.646/0001-90',
      endereco: 'Rua João Paulo II, 39/49/588, Centro',
      cidade: 'Ribeirão do Pinhal', uf: 'PR', cep: '86.490-000',
      email: 'contato@bikows.com.br', telefone: '(43) 98426-2950',
      site: 'www.bikows.com.br', crea: 'CREA 83340',
      tagline: 'Soluções em Engenharia Industrial NR-12 e NR-13',
    },
    engenheiro: {
      nome: 'MARCOS DA SILVA ISRAEL',
      titulo1: 'ENGENHEIRO MECÂNICO',
      titulo2: 'ENG. SEGURANÇA DO TRABALHO',
      titulo3: 'ENG. AUTOMAÇÃO INDUSTRIAL',
      crea: 'CREA PR-206397/D',
    },
  };

  /* Remove chaves vazias para não sobrescrever os padrões do documento */
  function _limpo(obj) {
    const out = {};
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'string' && !v.trim()) return;
      if (Array.isArray(v) && !v.length) return;
      out[k] = v;
    });
    return out;
  }

  const _cfg    = () => DB.getConfig() || {};
  const _cfgDoc = () => _cfg().documento || {};

  /* ---------- blocos fixos vindos das configurações ---------- */
  function _empresa() {
    const cfg = _cfg();
    const d = _cfgDoc().empresa || {};
    const P = PADROES.empresa;
    return _limpo({
      razao:    d.razao    || P.razao  || cfg.empresa,
      cnpj:     d.cnpj     || P.cnpj   || cfg.cnpj,
      cidade:   d.cidade   || P.cidade || cfg.cidade,
      uf:       d.uf       || P.uf     || cfg.estado,
      endereco: d.endereco || P.endereco,
      cep:      d.cep      || P.cep,
      email:    d.email    || P.email,
      telefone: d.telefone || P.telefone,
      site:     d.site     || P.site,
      crea:     d.crea     || P.crea,
      tagline:  d.tagline  || P.tagline,
    });
  }

  function _engenheiro() {
    const d = _cfgDoc().engenheiro || {};
    const P = PADROES.engenheiro;
    return _limpo({
      nome: d.nome || P.nome, titulo1: d.titulo1 || P.titulo1, titulo2: d.titulo2 || P.titulo2,
      titulo3: d.titulo3 || P.titulo3, crea: d.crea || P.crea,
    });
  }

  /* ---------- dados do cliente ---------- */
  function _cliente(p) {
    const c = p.clienteId ? DB.get('clientes', p.clienteId) : null;
    const contatos = (DB.getAll('contatos') || []).filter(x => x.clienteId === p.clienteId);
    const principal = contatos.find(x => x.principal) || contatos[0];
    const lead = p.leadId ? DB.get('leads', p.leadId) : null;
    const nomeContato = (principal && [principal.nome, principal.cargo].filter(Boolean).join(' · '))
      || lead?.contato || lead?.decisor || c?.engResponsavel || '';
    return _limpo({
      nome:     c?.nome || p.clienteNome || '',
      cnpj:     c?.cnpj || p.clienteCnpj || '',
      contato:  nomeContato,
      cidade:   c?.cidade || '',
      uf:       c?.estado || '',
      email:    principal?.email || c?.email || '',
      telefone: principal?.telefone || c?.telefone || '',
      logoUrl:  c?.avatar || '',
    });
  }

  /* ---------- valor por extenso ---------- */
  const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
    'setecentos', 'oitocentos', 'novecentos'];

  function _ate999(n) {
    if (n === 100) return 'cem';
    const partes = [];
    const c = Math.floor(n / 100), r = n % 100;
    if (c) partes.push(CEM[c]);
    if (r < 20 && r > 0) partes.push(UNI[r]);
    else if (r >= 20) {
      const d = Math.floor(r / 10), u = r % 10;
      partes.push(DEZ[d] + (u ? ' e ' + UNI[u] : ''));
    }
    return partes.join(' e ');
  }

  function valorPorExtenso(v) {
    const total = Math.round((Number(v) || 0) * 100);
    const reais = Math.floor(total / 100), centavos = total % 100;
    const grupos = [];
    let resto = reais, escala = 0;
    const ESCALAS = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
    while (resto > 0) {
      const g = resto % 1000;
      if (g) {
        const nome = ESCALAS[escala];
        const txt = escala === 1 && g === 1 ? 'mil' : _ate999(g) + (nome[0] ? ' ' + (g === 1 ? nome[0] : nome[1]) : '');
        grupos.unshift(txt);
      }
      resto = Math.floor(resto / 1000);
      escala++;
    }
    let txt;
    const ultimo = reais % 1000;
    if (!grupos.length) txt = 'zero';
    else if (grupos.length === 1) txt = grupos[0];
    else {
      const sep = (ultimo === 0 || ultimo < 100 || ultimo % 100 === 0) ? ' e ' : ', ';
      txt = grupos.slice(0, -1).join(', ') + sep + grupos[grupos.length - 1];
    }
    let out = txt + (reais === 1 ? ' real' : ' reais');
    if (centavos) out += ' e ' + _ate999(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  /* ---------- payload a partir de uma proposta do CRM ---------- */
  function montar(propostaOuId, opts = {}) {
    const p = typeof propostaOuId === 'string' ? DB.get('propostas', propostaOuId) : propostaOuId;
    if (!p) return null;
    const cfgDoc = _cfgDoc();

    const data = p.dataEmissao || p.data
      || (p.createdAt ? Utils.localDateStr(new Date(p.createdAt)) : '')
      || Utils.todayStr();
    let validadeDias = parseInt(cfgDoc.validadeDias, 10) || 15;
    if (p.validade && data) {
      const d1 = Utils.parseDate(data), d2 = Utils.parseDate(p.validade);
      const dif = Math.round((d2 - d1) / 86400000);
      if (dif > 0 && dif < 400) validadeDias = dif;
    }

    const itens = (p.itens || []).map(i => ({
      desc: i.desc || i.nome || '',
      detalhe: i.detalhe || '',
      qtd: Number(i.qtd) || 1,
      unidade: i.unidade || '',
      valorUnit: Number(i.valorUnit) || 0,
      total: Number(i.total) || (Number(i.qtd) || 1) * (Number(i.valorUnit) || 0),
    })).filter(i => i.desc);

    const subtotal = itens.length ? itens.reduce((s, i) => s + i.total, 0) : (Number(p.valor) || 0);
    const descontoPerc = Number(p.descontoPerc) || 0;
    const descontoValor = Math.round(subtotal * descontoPerc) / 100;

    const escopo = (p.escopoGerado || []).map(s => ({ titulo: s.titulo, itens: s.itens || [] }));
    const crono  = (p.cronogramaGerado || []).map(e => ({ ...e }));

    const modelo = opts.modelo || cfgDoc.modelo
      || (escopo.length || crono.length ? 'completa' : 'enxuta');

    return {
      modelo,
      numero: p.numero || '',
      data,
      revisao: p.revisao || '00',
      validadeDias,
      validadeData: p.validade || '',
      titulo: p.titulo || 'Proposta técnico-comercial',
      servicoSolicitado: p.servicoSolicitado || p.titulo || '',
      objetivo: p.objetivo || p.descricao || '',
      introTexto: p.introTexto || '',
      cliente: _cliente(p),
      empresa: _empresa(),
      engenheiro: _engenheiro(),
      itens,
      subtotal,
      descontoPerc,
      descontoValor,
      valor: Number(p.valor) || (subtotal - descontoValor),
      valorPorExtenso: valorPorExtenso(Number(p.valor) || (subtotal - descontoValor)),
      escopoSections: escopo,
      cronograma: crono,
      cronogramaObs: p.cronogramaObs || '',
      prazoEntrega: p.prazoEntrega || '',
      formaPagamento: p.formaPagamento || '',
      observacoes: p.observacoes || '',
      incluiNoValor: p.incluiNoValor || cfgDoc.incluiPadrao || [],
      naoIncluso: p.naoIncluso || cfgDoc.naoIncluso || [],
      diferenciais: cfgDoc.diferenciais || null,
      numeros: cfgDoc.numeros || null,
      sobre: cfgDoc.sobre || '',
      clientesRef: cfgDoc.clientesRef || [],
      capa: { fotoUrl: p.capaFoto || cfgDoc.capaFoto || '' },
      blocos: Object.assign({ apresentacao: true, diferenciais: true, aceite: true, escopo: true, cronograma: true },
        cfgDoc.blocos || {}),
      propostaId: p.id || null,
    };
  }

  /* ---------- gravar + abrir ---------- */
  function _gravar(payload) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('[PropostaDoc] Falha ao gravar payload', e);
      if (typeof Toast !== 'undefined') Toast.error('Não foi possível preparar o documento (armazenamento cheio).');
      return false;
    }
  }

  function abrir(propostaOuId, opts = {}) {
    const payload = montar(propostaOuId, opts);
    if (!payload) { Toast.error('Proposta não encontrada'); return; }
    if (!payload.cliente.nome) { Toast.error('A proposta não tem cliente vinculado'); return; }
    if (!_gravar(payload)) return;
    const win = window.open(ARQUIVO, '_blank');
    if (!win) Toast.error('Pop-up bloqueado. Permita pop-ups para abrir o documento.');
    return payload;
  }

  /* Abre a partir do formulário do gerador (formato antigo), sem passar pelo CRM */
  function abrirDados(data, opts = {}) {
    const d = Object.assign({}, data, {
      modelo: opts.modelo || _cfgDoc().modelo || 'completa',
      empresa: Object.assign({}, _empresa(), data.empresa || {}),
      titulo: data.titulo || data.servicoSolicitado || '',
      validadeDias: parseInt(data.validadeDias || data.validade, 10) || 15,
      valorPorExtenso: data.valorPorExtenso || valorPorExtenso(data.valor),
      capa: data.capa || { fotoUrl: (data.coverPhotos || [])[0] || _cfgDoc().capaFoto || '' },
      diferenciais: data.diferenciais || _cfgDoc().diferenciais || null,
      numeros: _cfgDoc().numeros || null,
      sobre: _cfgDoc().sobre || '',
      clientesRef: (data.clientesRef && data.clientesRef.length) ? data.clientesRef : (_cfgDoc().clientesRef || []),
    });
    if (!_gravar(d)) return;
    const win = window.open(ARQUIVO, '_blank');
    if (!win) Toast.error('Pop-up bloqueado. Permita pop-ups para abrir o documento.');
    return d;
  }

  /* Modelo em branco, com dados de demonstração (para escolher o layout) */
  function abrirModelo(modelo) {
    const win = window.open(ARQUIVO + '?demo=1' + (modelo ? '#' + modelo : ''), '_blank');
    if (!win) Toast.error('Pop-up bloqueado. Permita pop-ups para ver o modelo.');
  }

  /* Baixa o documento como arquivo único, com os dados embutidos (serve para
     anexar em e-mail ou abrir sem internet). */
  async function baixar(propostaOuId, opts = {}) {
    const payload = montar(propostaOuId, opts);
    if (!payload) { Toast.error('Proposta não encontrada'); return; }
    try {
      const res = await fetch(ARQUIVO);
      if (!res.ok) throw new Error('não foi possível carregar o modelo');
      let html = await res.text();
      const seguro = JSON.stringify(JSON.stringify(payload))
        .split('<' + '/').join('<\\/')
        .split('<' + '!--').join('<\\u0021--');
      const inject = '<scr' + 'ipt>try{localStorage.setItem("' + CHAVE + '", '
        + seguro + ');}catch(e){}</scr' + 'ipt>';
      html = html.replace('</head>', inject + '\n</head>');
      const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
      const nome = `Proposta_${slug(payload.numero)}_${slug(payload.cliente.nome)}.html`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      a.download = nome;
      a.click();
      URL.revokeObjectURL(a.href);
      Toast.success('Arquivo baixado: ' + nome);
    } catch (err) {
      Toast.error('Erro ao baixar o documento: ' + err.message);
    }
  }

  return { montar, abrir, abrirDados, abrirModelo, baixar, valorPorExtenso, CHAVE, PADROES };
})();
