/* ==========================================
   UTILS.js — Funções utilitárias
   ========================================== */
const Utils = (() => {

  function formatCurrency(val) {
    if (val == null || val === '') return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const dt = new Date(iso);
    return dt.toLocaleString('pt-BR');
  }

  function formatCNPJ(v) {
    if (!v) return '';
    const n = v.replace(/\D/g, '').slice(0, 14);
    return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function formatPhone(v) {
    if (!v) return '';
    const n = v.replace(/\D/g, '').slice(0, 11);
    if (n.length === 11) return n.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    if (n.length === 10) return n.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    return v;
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}min atrás`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h atrás`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d atrás`;
    return formatDate(iso);
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const dt = new Date(dateStr + 'T00:00:00');
    return Math.round((dt - today) / 86400000);
  }

  function isOverdue(dateStr) {
    if (!dateStr) return false;
    return daysUntil(dateStr) < 0;
  }

  function isToday(dateStr) {
    if (!dateStr) return false;
    return daysUntil(dateStr) === 0;
  }

  // Converte valor digitado em formato brasileiro para número.
  // Aceita: "1.500,50" → 1500.5 · "1500,50" → 1500.5 · "1.500" → 1500 · "1500.50" → 1500.5
  // (inputs type=number rejeitavam ou interpretavam errado valores com vírgula/ponto de milhar)
  function parseMoney(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    let s = String(v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    const temVirgula = s.includes(','), temPonto = s.includes('.');
    if (temVirgula && temPonto)      s = s.replace(/\./g, '').replace(',', '.'); // 1.500,50
    else if (temVirgula)             s = s.replace(',', '.');                     // 1500,50
    else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.500 (milhar)
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }

  // Valor numérico → string para exibir em campo de edição ("1500.5" → "1500,50")
  function moneyToInput(v) {
    if (v == null || v === '') return '';
    return Number(v).toFixed(2).replace('.', ',');
  }

  // Data local YYYY-MM-DD (evita bug de timezone: toISOString() usa UTC e
  // no Brasil, após as 21h, retornaria a data de amanhã)
  function localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayStr() {
    return localDateStr(new Date());
  }

  function truncate(str, n = 50) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // Escape para strings JS dentro de atributos onclick="Fn('...')".
  // escHtml NÃO protege esse contexto: o browser decodifica entidades HTML
  // antes de interpretar o JS, então &#39; volta a ser aspas e quebra a string.
  // Aqui escapamos com backslash (sobrevive à decodificação) + entidades HTML.
  function escJs(str) {
    if (!str) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, '\\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const LEAD_STATUS = {
    lead_identificado:  { label: '🔵 Lead Identificado',     badge: 'badge-gray',   color: '#64748b' },
    primeiro_contato:  { label: '📞 Primeiro Contato',      badge: 'badge-blue',   color: '#3b82f6' },
    qualificacao:       { label: '🔍 Qualificação',          badge: 'badge-purple', color: '#8b5cf6' },
    proposta_elaboracao:{ label: '📋 Proposta em Elaboração',badge: 'badge-yellow', color: '#f59e0b' },
    proposta_enviada:   { label: '📤 Proposta Enviada',      badge: 'badge-orange', color: '#f97316' },
    negociacao:         { label: '🤝 Negociação',            badge: 'badge-yellow', color: '#eab308' },
    fechado_ganho:      { label: '✅ Fechado / Ganho',       badge: 'badge-green',  color: '#10b981' },
    executado:          { label: '🏁 Executado',             badge: 'badge-teal',   color: '#0891b2' },
    fechado_perdido:    { label: '❌ Fechado / Perdido',     badge: 'badge-red',    color: '#ef4444' },
  };

  const PROJ_STATUS = {
    planejado:    { label: 'Planejado',     badge: 'badge-gray'   },
    em_andamento: { label: 'Em Andamento',  badge: 'badge-blue'   },
    em_revisao:   { label: 'Em Revisão',    badge: 'badge-yellow' },
    concluido:    { label: 'Concluído',     badge: 'badge-green'  },
    atrasado:     { label: 'Atrasado',      badge: 'badge-red'    },
    cancelado:    { label: 'Cancelado',     badge: 'badge-gray'   },
  };

  const PROP_STATUS = {
    elaboracao: { label: 'Em Elaboração', badge: 'badge-gray'   },
    enviada:    { label: 'Enviada',       badge: 'badge-blue'   },
    negociacao: { label: 'Em Negociação', badge: 'badge-yellow' },
    aprovada:   { label: 'Aprovada',      badge: 'badge-green'  },
    recusada:   { label: 'Recusada',      badge: 'badge-red'    },
  };

  const ATIV_TIPO = {
    ligacao:  { label: 'Ligação',    icon: '📞', bg: '#dbeafe' },
    email:    { label: 'E-mail',     icon: '📧', bg: '#f0fdf4' },
    reuniao:  { label: 'Reunião',    icon: '🤝', bg: '#ede9fe' },
    followup: { label: 'Follow-up',  icon: '🔄', bg: '#fef9c3' },
    tarefa:   { label: 'Tarefa',     icon: '✅', bg: '#f1f5f9' },
    visita:   { label: 'Visita',     icon: '🏭', bg: '#ffedd5' },
    nota:     { label: 'Nota',       icon: '📝', bg: '#fef3c7' },
  };

  const ATIV_STATUS = {
    pendente:  { label: 'Pendente',  badge: 'badge-yellow' },
    concluida: { label: 'Concluída', badge: 'badge-green'  },
    cancelada: { label: 'Cancelada', badge: 'badge-gray'   },
  };

  function badge(text, cls) {
    return `<span class="badge ${cls}">${escHtml(text)}</span>`;
  }

  function leadBadge(status) {
    const s = LEAD_STATUS[status] || { label: status, badge: 'badge-gray' };
    return badge(s.label, s.badge);
  }

  function projBadge(status) {
    const s = PROJ_STATUS[status] || { label: status, badge: 'badge-gray' };
    return badge(s.label, s.badge);
  }

  function propBadge(status) {
    const s = PROP_STATUS[status] || { label: status, badge: 'badge-gray' };
    return badge(s.label, s.badge);
  }

  function activBadge(status) {
    const s = ATIV_STATUS[status] || { label: status, badge: 'badge-gray' };
    return badge(s.label, s.badge);
  }

  function dateAlert(dateStr, status) {
    if (status === 'concluida' || status === 'cancelada') return '';
    const days = daysUntil(dateStr);
    if (days == null) return '';
    if (days < 0) return `<span class="badge badge-red">⚠ ${Math.abs(days)}d atrasado</span>`;
    if (days === 0) return `<span class="badge badge-yellow">Hoje</span>`;
    if (days <= 3) return `<span class="badge badge-orange">Em ${days}d</span>`;
    return '';
  }

  function sum(arr, key) {
    return arr.reduce((acc, x) => acc + (Number(x[key]) || 0), 0);
  }

  function groupBy(arr, key) {
    return arr.reduce((acc, x) => {
      const k = x[key] || 'Outro';
      if (!acc[k]) acc[k] = [];
      acc[k].push(x);
      return acc;
    }, {});
  }

  function currentMonth() {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  function monthLabel(offset = 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  }

  function confirmDelete(name, cb) {
    Confirm.show(`Excluir "${name}"?`, `Você poderá desfazer por alguns segundos.`, () => {
      cb();
      // Oferecer desfazer da última exclusão feita pelo callback
      setTimeout(() => {
        Toast.undo(`"${truncate(name, 30)}" excluído`, () => {
          const r = DB.undoRemove();
          if (r) {
            Toast.success('Registro restaurado!');
            if (typeof App !== 'undefined') {
              App.refreshIfNeeded(r.entity);
              App.updateNotifBadge();
            }
          }
        });
      }, 100);
    });
  }

  function getClientName(clienteId) {
    const c = DB.get('clientes', clienteId);
    return c ? c.nome : '—';
  }

  function validateCNPJ(cnpj) {
    const n = cnpj.replace(/\D/g, '');
    if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
    const calc = (l) => {
      let s = 0, p = l + 2;
      for (let i = 0; i < l; i++) { s += parseInt(n[i]) * p--; if (p < 2) p = 9; }
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === parseInt(n[12]) && calc(13) === parseInt(n[13]);
  }

  function autoFormatCNPJ(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 14);
    v = v.replace(/^(\d{2})(\d)/, '$1.$2');
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
    v = v.replace(/(\d{4})(\d)/, '$1-$2');
    input.value = v;
  }

  function autoFormatPhone(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length === 11) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    else if (v.length === 10) v = v.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    input.value = v;
  }

  function openWhatsApp(phone, message = '') {
    const num = (phone || '').replace(/\D/g, '');
    if (!num) { Toast.error('Telefone não cadastrado'); return; }
    const base = num.startsWith('55') ? num : '55' + num;
    const url = `https://wa.me/${base}${message ? '?text=' + encodeURIComponent(message) : ''}`;
    window.open(url, '_blank');
  }

  function waBtn(phone, cls = '') {
    if (!phone) return '';
    return `<button class="btn btn-xs btn-success ${cls}" style="background:#25D366;border-color:#25D366" onclick="Utils.openWhatsApp('${escJs(phone)}')" title="Abrir WhatsApp">💬</button>`;
  }

  return {
    formatCurrency, formatDate, formatDateTime, formatCNPJ, formatPhone,
    timeAgo, daysUntil, isOverdue, isToday, todayStr, localDateStr, truncate, escHtml, escJs,
    parseMoney, moneyToInput,
    LEAD_STATUS, PROJ_STATUS, PROP_STATUS, ATIV_TIPO, ATIV_STATUS,
    badge, leadBadge, projBadge, propBadge, activBadge, dateAlert,
    sum, groupBy, currentMonth, monthLabel, confirmDelete, getClientName,
    validateCNPJ, autoFormatCNPJ, autoFormatPhone, openWhatsApp, waBtn,
  };
})();

/* ==========================================
   MODAL — Sistema de modal dinâmico
   ========================================== */
const Modal = (() => {
  let _saveCb = null;

  function open({ title, body, saveCb, saveLabel = 'Salvar', size = '' }) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = body;
    const box = document.getElementById('modalBox');
    box.className = 'modal-box' + (size ? ' ' + size : '');
    const btn = document.getElementById('btnModalSave');
    btn.textContent = saveLabel;
    _saveCb = saveCb || null;
    if (!saveCb) { document.getElementById('modalFoot').style.display = 'none'; }
    else { document.getElementById('modalFoot').style.display = ''; }
    // Trava anti duplo-clique: desabilita por 800ms para evitar registros duplicados
    btn.onclick = () => {
      if (!_saveCb || btn.disabled) return;
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 800);
      _saveCb();
    };
    document.getElementById('modalBackdrop').classList.add('open');
    const first = document.querySelector('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) setTimeout(() => first.focus(), 100);
  }

  function close() {
    document.getElementById('modalBackdrop').classList.remove('open');
    _saveCb = null;
  }

  function backdropClick(e) {
    if (e.target === document.getElementById('modalBackdrop')) close();
  }

  return { open, close, backdropClick };
})();

/* ==========================================
   CONFIRM — Diálogo de confirmação
   ========================================== */
const Confirm = (() => {
  let _cb = null;

  function show(title, msg, cb) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    _cb = cb;
    document.getElementById('btnConfirm').onclick = () => { if (_cb) _cb(); close(); };
    document.getElementById('confirmBackdrop').classList.add('open');
  }

  function close() {
    document.getElementById('confirmBackdrop').classList.remove('open');
    _cb = null;
  }

  return { show, close };
})();

/* ==========================================
   TOAST — Notificações
   ========================================== */
const Toast = (() => {
  function show(msg, type = 'default', duration = 3000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]||icons.default}</span><span class="toast-msg">${Utils.escHtml(msg)}</span><button class="toast-x" onclick="this.parentElement.remove()">✕</button>`;
    document.getElementById('toastStack').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
  }
  const success = (m) => show(m, 'success');
  const error = (m) => show(m, 'error');
  const warning = (m) => show(m, 'warning');

  // Toast com botão "Desfazer" — usado após exclusões
  let _undoCb = null;
  function undo(msg, cb, duration = 6000) {
    _undoCb = cb;
    const el = document.createElement('div');
    el.className = 'toast toast-default';
    el.innerHTML = `<span class="toast-icon">↩️</span><span class="toast-msg">${Utils.escHtml(msg)}</span>` +
      `<button class="btn btn-xs btn-primary" style="margin-left:8px;flex-shrink:0" onclick="Toast._runUndo(this)">Desfazer</button>` +
      `<button class="toast-x" onclick="this.parentElement.remove()">✕</button>`;
    document.getElementById('toastStack').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
  }
  function _runUndo(btn) {
    if (_undoCb) { try { _undoCb(); } finally { _undoCb = null; } }
    btn.closest('.toast')?.remove();
  }

  return { show, success, error, warning, undo, _runUndo };
})();
