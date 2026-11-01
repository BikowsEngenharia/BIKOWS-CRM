/* ==========================================
   ANEXOS.js — foto, PDF e documento presos ao registro

   Faltava o básico de um CRM de engenharia: a foto da máquina que motivou
   a apreciação de risco, o PDF do edital, a ART assinada. Isso vivia no
   WhatsApp e no Drive, solto do cliente e do projeto.

   Como funciona:
   • o arquivo vai para o bucket privado 'anexos' do Supabase Storage;
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

  /* Rótulo legível para quem lê a lista: "Lead", "Visita técnica"… */
  const ROTULO = {
    leads: 'Lead', clientes: 'Cliente', projetos: 'Projeto', propostas: 'Proposta',
    contratos: 'Contrato', visitas: 'Visita', equipamentos: 'Equipamento',
    licitacoes: 'Licitação', atividades: 'Atividade', documentos: 'Documento',
  };

  const ICONE = [
    { re: /^image\//,                    icone: '🖼' },
    { re: /pdf/,                         icone: '📕' },
    { re: /word|document/,               icone: '📘' },
    { re: /sheet|excel|csv/,             icone: '📗' },
    { re: /zip|rar|compressed/,          icone: '🗜' },
    { re: /^video\//,                    icone: '🎬' },
    { re: /^audio\//,                    icone: '🎵' },
  ];

  function _icone(tipo) {
    return (ICONE.find(i => i.re.test(tipo || '')) || { icone: '📎' }).icone;
  }

  function _tamanho(bytes) {
    const b = Number(bytes) || 0;
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

  /* ---------- leitura ---------- */
  function listar(entidade, registroId) {
    return DB.getAll('anexos')
      .filter(a => a.entidade === entidade && a.registroId === registroId && !a.removido)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function contar(entidade, registroId) {
    return listar(entidade, registroId).length;
  }

  /* Botão compacto para colar na ficha de qualquer registro. */
  function botao(entidade, registroId, titulo) {
    const n = contar(entidade, registroId);
    return `<button class="btn btn-sm btn-secondary" title="Fotos, PDFs e documentos deste registro"
      onclick="Anexos.abrir('${entidade}','${Utils.escJs(registroId)}','${Utils.escJs(titulo || '')}')">
      📎 Anexos${n ? ` <span class="badge badge-blue" style="margin-left:2px">${n}</span>` : ''}
    </button>`;
  }

  /* ---------- janela ---------- */
  function abrir(entidade, registroId, titulo) {
    Modal.open({
      title: '📎 Anexos' + (titulo ? ' — ' + Utils.truncate(titulo, 45) : ''),
      size: 'modal-lg',
      // sem saveCb: o Modal esconde o rodapé, porque aqui cada ação já
      // acontece na hora (enviar, ver, baixar). Não há "salvar" a fazer.
      body: `<div id="anxCorpo">${_corpo(entidade, registroId)}</div>`,
    });
    setTimeout(() => _ligarEventos(entidade, registroId), 30);
  }

  function _corpo(entidade, registroId) {
    const itens = listar(entidade, registroId);
    return `
      <div style="border:2px dashed var(--border);border-radius:var(--radius);padding:16px;text-align:center;margin-bottom:14px"
        id="anxZona">
        <div style="font-size:26px;margin-bottom:4px">📎</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">
          Arraste aqui, ou escolha abaixo. Até ${LIMITE_MB} MB por arquivo.
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <label class="btn btn-sm btn-primary" style="cursor:pointer">
            📁 Escolher arquivo
            <input type="file" id="anxArquivo" multiple style="display:none">
          </label>
          <label class="btn btn-sm btn-secondary" style="cursor:pointer">
            📷 Tirar foto
            <input type="file" id="anxCamera" accept="image/*" capture="environment" style="display:none">
          </label>
        </div>
        <div id="anxProgresso" style="margin-top:10px;font-size:12px;color:var(--text-muted)"></div>
      </div>
      <div id="anxLista">${_lista(itens, entidade, registroId)}</div>`;
  }

  function _lista(itens, entidade, registroId) {
    if (!itens.length) {
      return `<div style="text-align:center;padding:18px;color:var(--text-muted);font-size:13px">
        Nenhum anexo ainda. A foto da máquina, o edital em PDF ou a ART assinada ficam aqui,
        junto do registro, em vez de soltos no WhatsApp.
      </div>`;
    }
    return itens.map(a => `
      <div class="anx-item" data-id="${a.id}">
        <div class="anx-icone">${_icone(a.tipo)}</div>
        <div class="anx-txt">
          <div class="anx-nome">${Utils.escHtml(a.nome || 'arquivo')}</div>
          <div class="anx-sub">${_tamanho(a.tamanho)} · ${Utils.formatDate((a.createdAt || '').slice(0, 10))}${a.enviadoPor ? ' · ' + Utils.escHtml(a.enviadoPor) : ''}</div>
        </div>
        <div class="anx-acts">
          <button class="btn btn-xs btn-secondary" onclick="Anexos.ver('${a.id}')" title="Abrir em nova aba">Ver</button>
          <button class="btn btn-xs btn-secondary" onclick="Anexos.baixar('${a.id}')" title="Baixar o arquivo">⬇</button>
          <button class="btn btn-xs btn-danger" onclick="Anexos.remover('${a.id}','${entidade}','${Utils.escJs(registroId)}')" title="Desvincular deste registro">✕</button>
        </div>
      </div>`).join('');
  }

  function _redesenhar(entidade, registroId) {
    const el = document.getElementById('anxLista');
    if (el) el.innerHTML = _lista(listar(entidade, registroId), entidade, registroId);
    if (typeof App !== 'undefined') App.refreshIfNeeded('anexos');
  }

  function _ligarEventos(entidade, registroId) {
    const zona = document.getElementById('anxZona');
    ['anxArquivo', 'anxCamera'].forEach(id => {
      const inp = document.getElementById(id);
      if (inp) inp.addEventListener('change', e => _enviarVarios([...e.target.files], entidade, registroId));
    });
    if (!zona) return;
    ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
      e.preventDefault(); zona.style.borderColor = 'var(--primary)'; zona.style.background = 'var(--primary-light)';
    }));
    ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
      e.preventDefault(); zona.style.borderColor = ''; zona.style.background = '';
    }));
    zona.addEventListener('drop', e => {
      const fs = [...(e.dataTransfer?.files || [])];
      if (fs.length) _enviarVarios(fs, entidade, registroId);
    });
  }

  /* ---------- envio ---------- */
  async function _enviarVarios(arquivos, entidade, registroId) {
    const prog = document.getElementById('anxProgresso');
    let ok = 0, falhas = 0;
    for (let i = 0; i < arquivos.length; i++) {
      if (prog) prog.textContent = `Enviando ${i + 1} de ${arquivos.length}…`;
      const r = await enviar(arquivos[i], entidade, registroId);
      r ? ok++ : falhas++;
    }
    if (prog) prog.textContent = '';
    _redesenhar(entidade, registroId);
    if (ok) Toast.success(ok === 1 ? 'Anexo enviado.' : ok + ' anexos enviados.');
    if (falhas) Toast.error(falhas + ' arquivo(s) não foram enviados.');
  }

  async function enviar(arquivo, entidade, registroId) {
    if (!arquivo) return false;
    if (arquivo.size > LIMITE_MB * 1048576) {
      Toast.error(`"${Utils.truncate(arquivo.name, 30)}" tem ${_tamanho(arquivo.size)} e o limite é ${LIMITE_MB} MB.`);
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
        tipo: arquivo.type || '',
        tamanho: arquivo.size,
        enviadoPor: (typeof Auth !== 'undefined' && Auth.getCurrentEmail?.()) || DB.getConfig()?.usuario?.nome || '',
        removido: false,
      });
      return true;
    } catch (e) {
      console.warn('[Anexos] exceção no upload:', e);
      Toast.error('Falha ao enviar o arquivo.');
      return false;
    }
  }

  /* ---------- abrir / baixar ---------- */
  async function _linkAssinado(id, paraBaixar) {
    const a = DB.get('anexos', id);
    if (!a) { Toast.error('Anexo não encontrado.'); return null; }
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
    const url = await _linkAssinado(id, false);
    if (url) window.open(url, '_blank', 'noopener');
  }

  /* O link assinado com download vem com Content-Disposition de anexo, então
     o navegador baixa e a aba nova se fecha sozinha. Vai em target _blank de
     propósito: se por algum motivo o cabeçalho não vier, o arquivo abre numa
     aba separada em vez de levar o CRM embora e fazer o usuário perder o que
     estava preenchendo. */
  async function baixar(id) {
    const url = await _linkAssinado(id, true);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = DB.get('anexos', id)?.nome || 'arquivo';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- remover (desvincula, não apaga) ---------- */
  function remover(id, entidade, registroId) {
    const a = DB.get('anexos', id);
    if (!a) return;
    Confirm.show(
      'Remover anexo',
      `"${Utils.truncate(a.nome || 'arquivo', 40)}" sai da lista deste registro. O arquivo continua guardado e a remoção pode ser desfeita.`,
      () => {
        DB.update('anexos', id, { removido: true, removidoEm: Utils.todayStr() });
        Toast.success('Anexo removido da lista.');
        _redesenhar(entidade, registroId);
      }
    );
  }

  return { abrir, botao, listar, contar, enviar, ver, baixar, remover, ROTULO };
})();
