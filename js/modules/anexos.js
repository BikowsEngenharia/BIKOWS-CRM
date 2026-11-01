/* ==========================================
   ANEXOS.js — arquivos do registro, com tipo e validade

   Lugar único para arquivo no CRM. Absorve o que o módulo Documentos fazia
   (classificar por tipo e registrar link do Drive) e acrescenta o que
   faltava nos dois: o arquivo de verdade guardado no Storage e a data de
   validade, que é o que transforma ART e certificado em alerta antes de
   vencer em vez de descoberta depois.

   Como funciona:
   • o arquivo vai para o bucket privado 'anexos' do Supabase Storage;
   • um anexo também pode ser só um link (Drive, Dropbox, PNCP), para o que
     é grande demais ou já mora em outro lugar;
   • os metadados viram um registro na entidade 'anexos', que sincroniza
     como qualquer outra tabela do CRM (cache, backup local, realtime);
   • para ver ou baixar, gera-se um link assinado e temporário — o bucket
     é privado, nada fica exposto por URL pública.

   Sobre remover: "remover" aqui desvincula, não apaga. O registro fica com
   removido=true e some da lista; o arquivo continua no Storage, que nem
   concede permissão de exclusão ao navegador. Qualquer remoção é
   reversível por quem tiver acesso ao banco.
   ========================================== */
const Anexos = (() => {

  const BUCKET = 'anexos';
  const LIMITE_MB = 25;
  const VALIDADE_LINK = 3600;   // segundos que o link assinado dura

  /* Tipos de arquivo. Mesma lista que o módulo Documentos usava, mantida
     aqui porque este passou a ser o lugar único de arquivo nas fichas. */
  const TIPOS = [
    { val: 'foto',        label: '📷 Foto',               cor: '#ec4899' },
    { val: 'laudo',       label: '📑 Laudo técnico',      cor: '#10b981' },
    { val: 'art',         label: '📜 ART',                cor: '#f59e0b' },
    { val: 'certificado', label: '🏅 Certificado',        cor: '#84cc16' },
    { val: 'contrato',    label: '📋 Contrato',           cor: '#3b82f6' },
    { val: 'proposta',    label: '📄 Proposta',           cor: '#8b5cf6' },
    { val: 'projeto',     label: '📐 Projeto / planta',   cor: '#0ea5e9' },
    { val: 'nf',          label: '🧾 Nota fiscal',        cor: '#ef4444' },
    { val: 'checklist',   label: '✅ Checklist',          cor: '#14b8a6' },
    { val: 'edital',      label: '🏛 Edital',             cor: '#0891b2' },
    { val: 'email',       label: '📧 E-mail / comunicado', cor: '#6366f1' },
    { val: 'outro',       label: '📎 Outro',              cor: '#94a3b8' },
  ];

  /* Tipos em que a validade é o que importa: são os que o sino vigia. */
  const TIPOS_COM_PRAZO = ['art', 'certificado', 'laudo', 'contrato'];

  function tipoDe(val) {
    return TIPOS.find(t => t.val === val) || TIPOS[TIPOS.length - 1];
  }

  /* Chuta o tipo pelo nome do arquivo, para o usuário não ter que
     classificar nada no caminho rápido (tirar foto e seguir). */
  function _adivinharTipo(nome, mime) {
    const n = String(nome || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const regras = [
      [/\bart\b|anotacao de responsabilidade/, 'art'],
      [/laudo|apreciacao|parecer/,             'laudo'],
      [/certificad|crea|capacitacao|nr-?\d+ *-? *treinamento/, 'certificado'],
      [/contrato|aditivo|distrato/,            'contrato'],
      [/proposta|orcamento/,                   'proposta'],
      [/edital|licitac|pregao|pncp/,           'edital'],
      [/nota fiscal|\bnf-?e?\b|danfe/,         'nf'],
      [/planta|projeto|desenho|\.dwg|\.dxf/,   'projeto'],
      [/checklist|check-?list|inspecao/,       'checklist'],
    ];
    for (const [re, tipo] of regras) if (re.test(n)) return tipo;
    if (/^image\//.test(mime || '')) return 'foto';
    return 'outro';
  }

  function _tamanho(bytes) {
    const b = Number(bytes) || 0;
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  /* Nome seguro para o Storage: sem acento, espaço nem caractere exótico,
     que o caminho do objeto vira parte de uma URL. */
  function _nomeSeguro(nome) {
    return String(nome || 'arquivo')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-{2,}/g, '-')
      .slice(-80);
  }

  function _badgeValidade(a) {
    if (!a.validade) return '';
    const d = Utils.daysUntil(a.validade);
    if (d === null) return '';
    if (d < 0)   return `<span class="badge badge-red">⚠ vencido há ${Math.abs(d)}d</span>`;
    if (d === 0) return `<span class="badge badge-red">⚠ vence hoje</span>`;
    if (d <= 30) return `<span class="badge badge-orange">vence em ${d}d</span>`;
    return `<span class="badge badge-gray">válido até ${Utils.formatDate(a.validade)}</span>`;
  }

  /* ---------- leitura ---------- */
  function listar(entidade, registroId) {
    return DB.getAll('anexos')
      .filter(a => a.entidade === entidade && a.registroId === registroId && !a.removido)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function contar(entidade, registroId) {
    return listar(entidade, registroId).length;
  }

  /* Anexos com validade vencida ou vencendo dentro de N dias. Alimenta o
     sino de pendências e a tela Hoje: é o motivo de existir o campo. */
  function vencendo(dias = 30) {
    return DB.getAll('anexos')
      .filter(a => !a.removido && a.validade)
      .filter(a => { const d = Utils.daysUntil(a.validade); return d !== null && d <= dias; })
      .sort((a, b) => (a.validade || '').localeCompare(b.validade || ''));
  }

  /* Descrição legível do que o anexo está preso ("Visita VT-014"). */
  function ondeEsta(a) {
    const nomes = {
      leads: 'Lead', clientes: 'Cliente', projetos: 'Projeto', propostas: 'Proposta',
      contratos: 'Contrato', visitas: 'Visita', equipamentos: 'Equipamento',
      licitacoes: 'Licitação', atividades: 'Atividade',
    };
    const reg = DB.get(a.entidade, a.registroId);
    const titulo = reg?.titulo || reg?.nome || reg?.numero || reg?.tag || reg?.objeto || '';
    return (nomes[a.entidade] || a.entidade) + (titulo ? ' · ' + Utils.truncate(titulo, 40) : '');
  }

  /* Botão compacto para colar na ficha de qualquer registro. */
  function botao(entidade, registroId, titulo) {
    const itens = listar(entidade, registroId);
    const alerta = itens.some(a => a.validade && Utils.daysUntil(a.validade) <= 30);
    return `<button class="btn btn-sm btn-secondary" title="Arquivos deste registro"
      onclick="Anexos.abrir('${entidade}','${Utils.escJs(registroId)}','${Utils.escJs(titulo || '')}')">
      📎 Arquivos${itens.length ? ` <span class="badge ${alerta ? 'badge-orange' : 'badge-blue'}" style="margin-left:2px">${itens.length}</span>` : ''}
    </button>`;
  }

  /* ---------- montagem (serve à janela e ao embute em abas) ---------- */
  function abrir(entidade, registroId, titulo) {
    Modal.open({
      // sem saveCb: o Modal esconde o rodapé, porque aqui cada ação já
      // acontece na hora (enviar, classificar, baixar). Não há "salvar".
      title: '📎 Arquivos' + (titulo ? ' — ' + Utils.truncate(titulo, 45) : ''),
      size: 'modal-lg',
      body: `<div id="anxRaiz"></div>`,
    });
    setTimeout(() => _montar('anxRaiz', entidade, registroId), 20);
  }

  /* Mesma lista, embutida direto numa aba de ficha (projetos, clientes). */
  function renderLista(containerId, { entidade, registroId }) {
    _montar(containerId, entidade, registroId);
  }

  function _montar(containerId, entidade, registroId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.dataset.entidade = entidade;
    el.dataset.registro = registroId;
    el.innerHTML = `
      <div class="anx-zona" data-zona>
        <div style="font-size:24px;margin-bottom:2px">📎</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">
          Arraste aqui, ou escolha abaixo. Até ${LIMITE_MB} MB por arquivo.
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <label class="btn btn-sm btn-primary" style="cursor:pointer">
            📁 Escolher arquivo<input type="file" multiple style="display:none" data-entrada>
          </label>
          <label class="btn btn-sm btn-secondary" style="cursor:pointer">
            📷 Tirar foto<input type="file" accept="image/*" capture="environment" style="display:none" data-entrada>
          </label>
          <button class="btn btn-sm btn-secondary" data-abrir-link>🔗 Anexar link</button>
        </div>
        <div data-progresso style="margin-top:10px;font-size:12px;color:var(--text-muted)"></div>
        <div data-form-link style="display:none;margin-top:12px;text-align:left;max-width:460px;margin-left:auto;margin-right:auto">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Endereço</label>
              <input class="form-control" data-link-url placeholder="https://drive.google.com/..."></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Nome</label>
              <input class="form-control" data-link-nome placeholder="Ex: Pasta do projeto no Drive"></div>
            <div class="form-group" style="max-width:150px"><label class="form-label">Tipo</label>
              <select class="form-control" data-link-tipo>${TIPOS.map(t => `<option value="${t.val}">${t.label}</option>`).join('')}</select></div>
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn btn-sm btn-ghost" data-cancelar-link>Cancelar</button>
            <button class="btn btn-sm btn-primary" data-salvar-link>Anexar</button>
          </div>
        </div>
      </div>
      <div data-lista></div>`;
    _desenharLista(el);
    _ligarEventos(el);
  }

  function _desenharLista(raiz) {
    const { entidade, registro } = raiz.dataset;
    const alvo = raiz.querySelector('[data-lista]');
    if (!alvo) return;
    const itens = listar(entidade, registro);
    alvo.innerHTML = itens.length
      ? itens.map(a => _item(a)).join('')
      : `<div style="text-align:center;padding:18px;color:var(--text-muted);font-size:13px">
           Nenhum arquivo ainda. A foto da máquina, o edital em PDF ou a ART assinada
           ficam aqui, junto do registro, em vez de soltos no WhatsApp.
         </div>`;
    // mantém o contador do botão da ficha em dia, se houver um na tela
    if (typeof App !== 'undefined') App.updateNotifBadge?.();
  }

  function _item(a) {
    const t = tipoDe(a.tipo);
    const temPrazo = TIPOS_COM_PRAZO.includes(a.tipo);
    return `
      <div class="anx-item" data-id="${a.id}">
        <div class="anx-linha">
          <div class="anx-icone" title="${Utils.escHtml(t.label)}">${t.label.split(' ')[0]}</div>
          <div class="anx-txt">
            <div class="anx-nome">${a.url ? '🔗 ' : ''}${Utils.escHtml(a.nome || 'arquivo')}</div>
            <div class="anx-sub">
              <span style="color:${t.cor};font-weight:600">${Utils.escHtml(t.label.replace(/^\S+\s/, ''))}</span>
              ${_tamanho(a.tamanho) ? ' · ' + _tamanho(a.tamanho) : ''}
              · ${Utils.formatDate((a.createdAt || '').slice(0, 10))}
              ${a.descricao ? ' · ' + Utils.escHtml(Utils.truncate(a.descricao, 40)) : ''}
            </div>
            ${_badgeValidade(a) ? `<div style="margin-top:4px">${_badgeValidade(a)}</div>` : ''}
          </div>
          <div class="anx-acts">
            <button class="btn btn-xs btn-secondary" onclick="Anexos.ver('${a.id}')" title="Abrir em nova aba">Ver</button>
            ${a.url ? '' : `<button class="btn btn-xs btn-secondary" onclick="Anexos.baixar('${a.id}')" title="Baixar o arquivo">⬇</button>`}
            <button class="btn btn-xs btn-secondary" onclick="Anexos.editar('${a.id}')" title="Classificar e definir validade">✎</button>
            <button class="btn btn-xs btn-danger" onclick="Anexos.remover('${a.id}')" title="Desvincular deste registro">✕</button>
          </div>
        </div>
        <div class="anx-editor" data-editor style="display:none">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Tipo</label>
              <select class="form-control" data-ed-tipo>
                ${TIPOS.map(x => `<option value="${x.val}" ${x.val === (a.tipo || 'outro') ? 'selected' : ''}>${x.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Válido até</label>
              <input class="form-control" type="date" data-ed-validade value="${Utils.escHtml(a.validade || '')}">
              <div class="text-xs text-muted" style="margin-top:3px">
                ${temPrazo
                  ? 'Vira alerta no sino e na tela Hoje antes de vencer.'
                  : 'Opcional &mdash; se preencher, também vira alerta.'}
              </div>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Observação</label>
            <input class="form-control" data-ed-descricao value="${Utils.escHtml(a.descricao || '')}" placeholder="Ex: revisão 2, substitui a anterior">
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn btn-sm btn-ghost" onclick="Anexos.editar('${a.id}')">Cancelar</button>
            <button class="btn btn-sm btn-primary" onclick="Anexos.salvarEdicao('${a.id}')">Salvar</button>
          </div>
        </div>
      </div>`;
  }

  /* Acha a raiz que contém determinado anexo, para redesenhar só ela.
     A lista pode estar na janela ou embutida numa aba de ficha. */
  function _raizDe(id) {
    const item = document.querySelector(`.anx-item[data-id="${id}"]`);
    return item ? item.closest('[data-entidade]') : null;
  }

  function _ligarEventos(raiz) {
    const { entidade, registro } = raiz.dataset;
    const zona = raiz.querySelector('[data-zona]');
    if (!zona) return;

    raiz.querySelectorAll('[data-entrada]').forEach(inp => {
      inp.addEventListener('change', e => {
        _enviarVarios([...e.target.files], entidade, registro, raiz);
        e.target.value = '';   // permite reenviar o mesmo arquivo
      });
    });

    const formLink = raiz.querySelector('[data-form-link]');
    raiz.querySelector('[data-abrir-link]')?.addEventListener('click', () => {
      formLink.style.display = formLink.style.display === 'none' ? '' : 'none';
      if (formLink.style.display === '') raiz.querySelector('[data-link-url]').focus();
    });
    raiz.querySelector('[data-cancelar-link]')?.addEventListener('click', () => { formLink.style.display = 'none'; });
    raiz.querySelector('[data-salvar-link]')?.addEventListener('click', () => {
      const url = raiz.querySelector('[data-link-url]').value.trim();
      const nome = raiz.querySelector('[data-link-nome]').value.trim();
      const tipo = raiz.querySelector('[data-link-tipo]').value;
      if (anexarLink(url, nome, tipo, entidade, registro)) {
        raiz.querySelector('[data-link-url]').value = '';
        raiz.querySelector('[data-link-nome]').value = '';
        formLink.style.display = 'none';
        _desenharLista(raiz);
      }
    });

    ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
      e.preventDefault(); zona.classList.add('arrastando');
    }));
    ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
      e.preventDefault(); zona.classList.remove('arrastando');
    }));
    zona.addEventListener('drop', e => {
      const fs = [...(e.dataTransfer?.files || [])];
      if (fs.length) _enviarVarios(fs, entidade, registro, raiz);
    });
  }

  /* ---------- envio ---------- */
  async function _enviarVarios(arquivos, entidade, registroId, raiz) {
    const prog = raiz?.querySelector('[data-progresso]');
    let ok = 0, falhas = 0;
    for (let i = 0; i < arquivos.length; i++) {
      if (prog) prog.textContent = `Enviando ${i + 1} de ${arquivos.length}…`;
      const r = await enviar(arquivos[i], entidade, registroId);
      r ? ok++ : falhas++;
    }
    if (prog) prog.textContent = '';
    if (raiz) _desenharLista(raiz);
    if (ok) Toast.success(ok === 1 ? 'Arquivo anexado.' : ok + ' arquivos anexados.');
    if (falhas) Toast.error(falhas + ' arquivo(s) não foram enviados.');
  }

  async function enviar(arquivo, entidade, registroId) {
    if (!arquivo) return false;
    if (arquivo.size > LIMITE_MB * 1048576) {
      Toast.error(`"${Utils.truncate(arquivo.name, 30)}" tem ${_tamanho(arquivo.size)} e o limite é ${LIMITE_MB} MB. Use 🔗 Anexar link para arquivo grande.`);
      return false;
    }
    const caminho = `${entidade}/${registroId}/${Date.now()}-${_nomeSeguro(arquivo.name)}`;
    try {
      const { error } = await _supabase.storage.from(BUCKET)
        .upload(caminho, arquivo, { cacheControl: '3600', upsert: false, contentType: arquivo.type || undefined });
      if (error) { console.warn('[Anexos] upload:', error.message); Toast.error('Falha ao enviar: ' + error.message); return false; }

      DB.create('anexos', {
        entidade, registroId,
        nome: arquivo.name,
        caminho,
        tipo: _adivinharTipo(arquivo.name, arquivo.type),
        mime: arquivo.type || '',
        tamanho: arquivo.size,
        validade: '',
        descricao: '',
        enviadoPor: _quem(),
        removido: false,
      });
      return true;
    } catch (e) {
      console.warn('[Anexos] exceção no upload:', e);
      Toast.error('Falha ao enviar o arquivo.');
      return false;
    }
  }

  /* Anexo que é só um endereço: o que já mora no Drive ou é grande demais
     para o limite do bucket. Era o que o módulo Documentos fazia. */
  function anexarLink(url, nome, tipo, entidade, registroId) {
    if (!url) { Toast.error('Informe o endereço do arquivo.'); return false; }
    if (!/^https?:\/\//i.test(url)) { Toast.error('O endereço precisa começar com http:// ou https://'); return false; }
    DB.create('anexos', {
      entidade, registroId,
      nome: nome || url.replace(/^https?:\/\//i, '').slice(0, 60),
      url,
      caminho: '',
      tipo: tipo || _adivinharTipo(nome, ''),
      mime: '',
      tamanho: 0,
      validade: '',
      descricao: '',
      enviadoPor: _quem(),
      removido: false,
    });
    Toast.success('Link anexado.');
    return true;
  }

  function _quem() {
    return (typeof Auth !== 'undefined' && Auth.getCurrentEmail?.())
      || DB.getConfig()?.usuario?.nome || '';
  }

  /* ---------- classificar ---------- */
  function editar(id) {
    const item = document.querySelector(`.anx-item[data-id="${id}"]`);
    const ed = item?.querySelector('[data-editor]');
    if (!ed) return;
    ed.style.display = ed.style.display === 'none' ? '' : 'none';
  }

  function salvarEdicao(id) {
    const item = document.querySelector(`.anx-item[data-id="${id}"]`);
    if (!item) return;
    const tipo = item.querySelector('[data-ed-tipo]')?.value || 'outro';
    const validade = item.querySelector('[data-ed-validade]')?.value || '';
    const descricao = item.querySelector('[data-ed-descricao]')?.value?.trim() || '';
    DB.update('anexos', id, { tipo, validade, descricao });
    Toast.success('Arquivo classificado.');
    const raiz = _raizDe(id);
    if (raiz) _desenharLista(raiz);
    if (typeof App !== 'undefined') { App.updateNotifBadge?.(); App.refreshIfNeeded('anexos'); }
  }

  /* ---------- abrir / baixar ---------- */
  async function _linkAssinado(a, paraBaixar) {
    try {
      const opts = paraBaixar ? { download: a.nome || true } : undefined;
      const { data, error } = await _supabase.storage.from(BUCKET)
        .createSignedUrl(a.caminho, VALIDADE_LINK, opts);
      if (error || !data?.signedUrl) {
        console.warn('[Anexos] link assinado:', error?.message);
        Toast.error('Não foi possível abrir o arquivo.');
        return null;
      }
      return data.signedUrl;
    } catch (e) {
      console.warn('[Anexos] exceção no link:', e);
      Toast.error('Não foi possível abrir o arquivo.');
      return null;
    }
  }

  async function ver(id) {
    const a = DB.get('anexos', id);
    if (!a) { Toast.error('Arquivo não encontrado.'); return; }
    const url = a.url || await _linkAssinado(a, false);
    if (url) window.open(url, '_blank', 'noopener');
  }

  /* O link assinado com download vem com Content-Disposition de anexo, então
     o navegador baixa e a aba nova se fecha sozinha. Vai em target _blank de
     propósito: se por algum motivo o cabeçalho não vier, o arquivo abre numa
     aba separada em vez de levar o CRM embora e fazer o usuário perder o que
     estava preenchendo. */
  async function baixar(id) {
    const a = DB.get('anexos', id);
    if (!a || a.url) { ver(id); return; }       // anexo por link não se baixa
    const url = await _linkAssinado(a, true);
    if (!url) return;
    const el = document.createElement('a');
    el.href = url;
    el.target = '_blank';
    el.rel = 'noopener';
    el.download = a.nome || 'arquivo';
    document.body.appendChild(el); el.click(); el.remove();
  }

  /* ---------- remover (desvincula, não apaga) ---------- */
  function remover(id) {
    const a = DB.get('anexos', id);
    if (!a) return;
    const raiz = _raizDe(id);
    Confirm.show(
      'Remover arquivo',
      `"${Utils.truncate(a.nome || 'arquivo', 40)}" sai da lista deste registro. O arquivo continua guardado e a remoção pode ser desfeita.`,
      () => {
        DB.update('anexos', id, { removido: true, removidoEm: Utils.todayStr() });
        Toast.success('Arquivo removido da lista.');
        if (raiz) _desenharLista(raiz);
        if (typeof App !== 'undefined') { App.updateNotifBadge?.(); App.refreshIfNeeded('anexos'); }
      }
    );
  }

  return {
    abrir, renderLista, botao, listar, contar, vencendo, ondeEsta,
    enviar, anexarLink, ver, baixar, editar, salvarEdicao, remover,
    TIPOS, tipoDe, TIPOS_COM_PRAZO,
  };
})();
