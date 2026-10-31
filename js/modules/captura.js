/* ==========================================
   CAPTURA.js — Captura em um campo

   Transforma uma linha digitada em registro pronto:
     "Ligar para Continental amanhã 9h"
       → atividade · tipo ligação · 31/10 · 09:00 · cliente Continental

   Interpreta data, hora, prioridade, tipo e cliente a partir do texto,
   mostra o que entendeu antes de salvar (nada é gravado às cegas) e
   aceita prefixo explícito para os outros tipos:
     lead:  Adequação NR-12 Frigorífico X 80000
     conta: Combustível campo 450 vence 05/11
     nota:  Cliente pediu revisão do prazo

   Casamento de texto: todas as buscas rodam sobre uma cópia SEM ACENTO
   alinhada caractere a caractere com o original. Isso é necessário porque
   \b do JavaScript só considera [A-Za-z0-9_] como letra — em "amanhã" o
   \b final nunca fecha, e o padrão não casava. Como a cópia tem o mesmo
   tamanho do original, o índice do match serve para recortar os dois.
   ========================================== */
const Captura = (() => {

  const SEM_ACENTO = t => String(t || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* Remove acentos mantendo 1 caractere para cada caractere do original,
     para que o índice de um match na cópia valha também no original. */
  function _alinhado(s) {
    let out = '';
    for (const ch of String(s || '')) {
      const n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += (n.length === ch.length) ? n : ch;
    }
    return out;
  }

  const DIAS_SEMANA = {
    domingo: 0, dom: 0,
    segunda: 1, seg: 1,
    terca: 2, ter: 2,
    quarta: 3, qua: 3,
    quinta: 4, qui: 4,
    sexta: 5, sex: 5,
    sabado: 6, sab: 6,
  };

  const TIPOS = [
    { tipo: 'ligacao',  re: /\b(ligar|ligacao|ligue|telefonar|telefone)\b/ },
    { tipo: 'email',    re: /\b(email|e-mail)\b/ },
    { tipo: 'reuniao',  re: /\b(reuniao|reunir|meet|call|apresentacao)\b/ },
    { tipo: 'visita',   re: /\b(visita|visitar|vistoria|vistoriar|inspecao|inspecionar)\b/ },
    { tipo: 'followup', re: /\b(follow|followup|follow-up|retomar|cobrar|retorno|acompanhar)\b/ },
  ];

  function _addDias(n) {
    const d = new Date(); d.setDate(d.getDate() + n); return d;
  }

  /* ---------- interpretação ---------- */
  function parse(texto) {
    const orig = String(texto || '').trim();
    const r = {
      kind: 'atividade', titulo: '', tipo: 'tarefa',
      data: Utils.todayStr(), hora: '', prioridade: 'media',
      clienteId: '', clienteNome: '', valor: 0,
      lidos: [],      // rótulos do que foi reconhecido, para o preview
      vazio: !orig,
    };
    if (!orig) return r;

    /* 1. prefixo explícito de tipo de registro */
    let base = orig;
    const pref = orig.match(/^\s*(lead|conta|nota|atividade|tarefa)\s*:\s*/i);
    if (pref) {
      const k = SEM_ACENTO(pref[1]);
      r.kind = k === 'lead' ? 'lead' : k === 'conta' ? 'conta' : k === 'nota' ? 'nota' : 'atividade';
      base = orig.slice(pref[0].length).trim();
      r.lidos.push({
        rotulo: 'registro',
        valor: { lead: 'Lead no pipeline', conta: 'Conta a pagar', nota: 'Nota no histórico', atividade: 'Atividade' }[r.kind],
      });
    }

    // resto = texto original restante · plano = mesmo texto sem acento, alinhado
    let resto = base;
    let plano = _alinhado(base);

    /* Recorta o trecho casado dos dois textos, trocando por um espaço (mesmo
       tamanho nos dois, então o alinhamento se mantém). */
    const consumir = (re) => {
      const m = plano.match(re);
      if (!m) return null;
      const i = m.index, len = m[0].length;
      resto = resto.slice(0, i) + ' ' + resto.slice(i + len);
      plano = plano.slice(0, i) + ' ' + plano.slice(i + len);
      return m;
    };

    /* 2. prioridade */
    if (consumir(/\burgente\b/i) || consumir(/!{1,3}\s*$/)) {
      r.prioridade = 'alta';
      r.lidos.push({ rotulo: 'prioridade', valor: '🔴 Alta' });
    } else if (consumir(/\bsem pressa\b/i)) {
      r.prioridade = 'baixa';
      r.lidos.push({ rotulo: 'prioridade', valor: '🟢 Baixa' });
    }

    /* 3. valor em R$ (ou número solto quando é lead/conta) */
    let mv = consumir(/\bR\$\s*([\d.,]+)/i);
    if (!mv && (r.kind === 'lead' || r.kind === 'conta')) {
      mv = consumir(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)\b(?!\s*[:h/])/);
    }
    if (mv) {
      r.valor = Utils.parseMoney(mv[1]) || 0;
      if (r.valor) r.lidos.push({ rotulo: 'valor', valor: Utils.formatCurrency(r.valor) });
    }

    /* 4. data — do mais específico para o mais genérico */
    let dataLida = null;
    let m = null;

    if (consumir(/\bdepois de amanha\b/i)) dataLida = _addDias(2);
    if (!dataLida && consumir(/\bamanha\b/i)) dataLida = _addDias(1);
    if (!dataLida && consumir(/\bhoje\b/i)) dataLida = new Date();

    if (!dataLida && (m = consumir(/\bem\s+(\d{1,3})\s*(?:dias?|d)\b/i))) dataLida = _addDias(parseInt(m[1], 10));
    if (!dataLida && (m = consumir(/\bem\s+(\d{1,2})\s*(?:semanas?|sem)\b/i))) dataLida = _addDias(parseInt(m[1], 10) * 7);
    if (!dataLida && consumir(/\b(?:semana que vem|proxima semana)\b/i)) dataLida = _addDias(7);
    if (!dataLida && consumir(/\b(?:mes que vem|proximo mes)\b/i)) {
      const d = new Date(); d.setMonth(d.getMonth() + 1); dataLida = d;
    }

    /* dd/mm ou dd/mm/aaaa */
    if (!dataLida && (m = consumir(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10) - 1;
      let ano = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
      if (ano < 100) ano += 2000;
      const d = new Date(ano, mes, dia);
      if (!isNaN(d) && d.getDate() === dia && d.getMonth() === mes) {
        // "15/01" digitado em dezembro quer dizer o ano que vem
        if (!m[3] && d < _addDias(-1)) d.setFullYear(ano + 1);
        dataLida = d;
      }
    }

    /* "dia 15" */
    if (!dataLida && (m = consumir(/\bdia\s+(\d{1,2})\b/i))) {
      const dia = parseInt(m[1], 10);
      const hoje = new Date();
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
      if (dia >= 1 && dia <= 31 && !isNaN(d)) {
        if (d < _addDias(-1)) d.setMonth(d.getMonth() + 1);
        dataLida = d;
      }
    }

    /* dia da semana — nomes longos primeiro ("segunda" antes de "seg") */
    if (!dataLida) {
      for (const nome of Object.keys(DIAS_SEMANA).sort((a, b) => b.length - a.length)) {
        const re = new RegExp('\\b(?:na\\s+|proxima\\s+)?' + nome + '(?:-feira)?\\b', 'i');
        if (!re.test(plano)) continue;
        consumir(re);
        const hojeDow = new Date().getDay();
        let diff = (DIAS_SEMANA[nome] - hojeDow + 7) % 7;
        if (diff === 0) diff = 7;   // "segunda" dito numa segunda = a próxima
        dataLida = _addDias(diff);
        break;
      }
    }

    if (dataLida) {
      r.data = Utils.localDateStr(dataLida);
      const dd = Utils.daysUntil(r.data);
      const rel = dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : dd > 1 ? 'em ' + dd + ' dias' : Math.abs(dd) + ' dias atrás';
      r.lidos.push({ rotulo: 'data', valor: Utils.formatDate(r.data) + ' (' + rel + ')' });
    }

    /* 5. hora */
    let mh = consumir(/\b(?:as\s+)?([01]?\d|2[0-3])\s*[h:]\s*([0-5]\d)\b/i);   // 9h30 · 14:30
    if (mh) r.hora = String(mh[1]).padStart(2, '0') + ':' + mh[2];
    if (!r.hora && (mh = consumir(/\b(?:as\s+)?([01]?\d|2[0-3])\s*h(?:s|rs)?\b/i))) {
      r.hora = String(mh[1]).padStart(2, '0') + ':00';
    }
    if (!r.hora && (mh = consumir(/\bas\s+([01]?\d|2[0-3])\b/i))) {
      r.hora = String(mh[1]).padStart(2, '0') + ':00';
    }
    if (!r.hora) {
      if (consumir(/\bmeio[- ]?dia\b/i)) r.hora = '12:00';
      else if (consumir(/\b(?:de|pela)\s+manha\b/i)) r.hora = '09:00';
      else if (consumir(/\b(?:a|de)\s+tarde\b/i)) r.hora = '14:00';
      else if (consumir(/\b(?:a|de)\s+noite\b/i)) r.hora = '19:00';
    }
    if (r.hora) r.lidos.push({ rotulo: 'hora', valor: r.hora });

    /* 6. tipo de atividade pelo verbo. Não é removido do título: "Ligar para
          a Continental" faz sentido como título do jeito que está. */
    const minusculo = plano.toLowerCase();
    for (const t of TIPOS) {
      if (t.re.test(minusculo)) { r.tipo = t.tipo; break; }
    }
    if (r.kind === 'atividade') {
      const lbl = Utils.ATIV_TIPO[r.tipo] || {};
      r.lidos.push({ rotulo: 'tipo', valor: ((lbl.icon || '') + ' ' + (lbl.label || r.tipo)).trim() });
    }

    /* 7. cliente: procura o nome cadastrado dentro do texto */
    const clientes = DB.getAll('clientes').filter(c => c.ativo !== false);
    let melhor = null;
    clientes.forEach(c => {
      const nome = SEM_ACENTO(c.nome || '');
      if (!nome) return;
      if (nome.length >= 4 && minusculo.includes(nome)) {
        if (!melhor || nome.length > melhor.len) melhor = { c, len: nome.length };
        return;
      }
      // primeira palavra significativa ("Continental Alimentos" → "continental")
      const prim = nome.split(/[\s.,/-]+/).find(p => p.length >= 5);
      if (prim && new RegExp('\\b' + prim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(minusculo)) {
        if (!melhor || prim.length > melhor.len) melhor = { c, len: prim.length };
      }
    });
    if (melhor) {
      r.clienteId = melhor.c.id;
      r.clienteNome = melhor.c.nome;
      r.lidos.push({ rotulo: 'cliente', valor: melhor.c.nome });
    }

    /* 8. título: o que sobrou, limpo */
    let titulo = resto
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
      .replace(/\s+(para|pra|no|na|em|de|do|da|com|a|o|as|os)$/i, '')
      .trim();
    if (!titulo) titulo = base.trim();
    r.titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    return r;
  }

  /* ---------- interface ---------- */
  function campoHtml() {
    return `
      <div style="background:var(--surface-2);border:1.5px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:16px">
        <label class="form-label" style="margin-bottom:6px;display:block">Escreva em uma linha</label>
        <div style="display:flex;gap:6px">
          <input class="form-control" id="capLinha" autocomplete="off"
            placeholder="Ex: Ligar para Continental amanhã 9h"
            oninput="Captura.previa()" onkeydown="if(event.key==='Enter'){event.preventDefault();Captura.criar()}">
          <button class="btn btn-primary" onclick="Captura.criar()" style="white-space:nowrap">Criar</button>
        </div>
        <div id="capPrevia" style="font-size:11.5px;color:var(--text-muted);margin-top:8px;line-height:1.7">
          ${_dica()}
        </div>
      </div>`;
  }

  function _dica() {
    return `Reconhece data, hora, cliente e tipo. Para outro registro, comece com
      <code style="font-size:11px">lead:</code>, <code style="font-size:11px">conta:</code> ou <code style="font-size:11px">nota:</code>.`;
  }

  function previa() {
    const el = document.getElementById('capPrevia');
    const campo = document.getElementById('capLinha');
    if (!el || !campo) return;
    const r = parse(campo.value);
    if (r.vazio) { el.innerHTML = _dica(); return; }
    const chips = r.lidos.map(x =>
      `<span class="badge badge-blue" style="font-weight:600">${Utils.escHtml(x.rotulo)}: ${Utils.escHtml(x.valor)}</span>`).join(' ');
    el.innerHTML = `
      <div style="color:var(--text);font-weight:600;font-size:12.5px;margin-bottom:5px">
        ➜ ${Utils.escHtml(r.titulo || '(sem título)')}
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${chips || '<span class="badge badge-gray">sem data reconhecida: usa hoje</span>'}</div>`;
  }

  /* Cria o registro. Só grava — nunca altera nem remove nada existente. */
  function criar() {
    const campo = document.getElementById('capLinha');
    const r = parse(campo?.value);
    if (r.vazio || !r.titulo) { Toast.error('Escreva o que precisa ser feito.'); return; }

    if (r.kind === 'lead') {
      DB.create('leads', {
        titulo: r.titulo,
        status: 'lead_identificado',
        dataEntrada: Utils.todayStr(),
        clienteId: r.clienteId,
        valorEstimado: r.valor,
        dataProximaAcao: r.data,
        proximaAcao: 'Primeiro contato',
        origemLead: 'Prospecção',
      });
      Toast.success('Lead criado: ' + Utils.truncate(r.titulo, 40));
    } else if (r.kind === 'conta') {
      if (!r.valor) { Toast.error('Informe o valor da conta (ex: conta: combustível 450 em 5 dias).'); return; }
      DB.create('contaspagar', {
        fornecedor: r.titulo, descricao: r.titulo, categoria: 'Outros',
        valor: r.valor, vencimento: r.data, status: 'pendente', recorrente: false,
      });
      Toast.success('Conta a pagar criada: ' + Utils.formatCurrency(r.valor));
    } else if (r.kind === 'nota') {
      DB.create('atividades', {
        titulo: r.titulo, tipo: 'nota', status: 'concluida', prioridade: 'baixa',
        data: Utils.todayStr(), clienteId: r.clienteId, descricao: '',
      });
      Toast.success('Nota registrada.');
    } else {
      DB.create('atividades', {
        titulo: r.titulo, tipo: r.tipo, status: 'pendente',
        prioridade: r.prioridade, data: r.data, hora: r.hora,
        clienteId: r.clienteId, responsavel: '',
      });
      Toast.success('Atividade criada para ' + Utils.formatDate(r.data) + (r.hora ? ' às ' + r.hora : ''));
    }

    if (campo) { campo.value = ''; previa(); campo.focus(); }
    if (typeof App !== 'undefined') {
      App.updateNotifBadge();
      App.refreshIfNeeded(r.kind === 'lead' ? 'leads' : r.kind === 'conta' ? 'contaspagar' : 'atividades');
    }
  }

  return { parse, campoHtml, previa, criar };
})();
