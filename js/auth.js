/* ==========================================
   auth.js — Autenticação via Supabase Auth
   ========================================== */
const Auth = (() => {

  /* ---- Inicialização ---- */
  function init() {
    // Listener de estado de auth — dispara imediatamente com sessão atual
    _supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        _bootApp();
      } else {
        _hideLoading();
        _showLogin();
      }
    });
  }

  /* ---- Login ---- */
  async function login() {
    const emailEl = document.getElementById('loginEmail');
    const passEl  = document.getElementById('loginPassword');
    const btnEl   = document.getElementById('loginBtn');
    const errEl   = document.getElementById('loginError');

    const email    = (emailEl?.value || '').trim();
    const password = passEl?.value || '';

    if (!email || !password) {
      _setError('Preencha e-mail e senha.');
      return;
    }

    btnEl.disabled    = true;
    btnEl.textContent = 'Entrando…';
    errEl.style.display = 'none';

    const { error } = await _supabase.auth.signInWithPassword({ email, password });

    if (error) {
      _setError(error.message || 'E-mail ou senha incorretos.');
      console.error('[Auth] Erro login:', error);
      btnEl.disabled    = false;
      btnEl.textContent = 'Entrar';
    }
    // Em caso de sucesso, onAuthStateChange dispara automaticamente
  }

  /* ---- Logout ---- */
  async function logout() {
    await _supabase.auth.signOut();
    // onAuthStateChange vai exibir a tela de login
  }

  /* ---- Resetar senha ---- */
  async function resetPassword() {
    const email = (document.getElementById('loginEmail')?.value || '').trim();
    if (!email) { _setError('Digite seu e-mail para redefinir a senha.'); return; }

    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) {
      _setError('Erro ao enviar e-mail de redefinição.');
    } else {
      _setError('E-mail de redefinição enviado! Verifique sua caixa de entrada.', 'success');
    }
  }

  /* ---- Obter usuário atual ---- */
  function getUser() {
    return _supabase.auth.getUser ? _supabase.auth.getUser() : null;
  }

  /* ---- Boot da aplicação após login ---- */
  async function _bootApp() {
    _hideLogin();
    _showLoading('Carregando dados…');

    try {
      await DB.loadAll();
      await DB.initSampleData();
      DB.subscribeRealtime();
    } catch (e) {
      console.error('[Auth] Erro ao carregar dados:', e);
    }

    _hideLoading();

    if (typeof App !== 'undefined') App.init();
  }

  /* ---- UI helpers ---- */
  function _showLogin() {
    const overlay = document.getElementById('loginOverlay');
    const app     = document.getElementById('appLayout');
    if (overlay) overlay.style.display = 'flex';
    if (app)     app.style.display     = 'none';
  }

  function _hideLogin() {
    const overlay = document.getElementById('loginOverlay');
    const app     = document.getElementById('appLayout');
    if (overlay) overlay.style.display = 'none';
    if (app)     app.style.display     = '';
  }

  function _showLoading(msg = 'Carregando…') {
    const overlay = document.getElementById('loadingOverlay');
    const text    = document.getElementById('loadingText');
    if (overlay) overlay.style.display = 'flex';
    if (text)    text.textContent      = msg;
  }

  function _hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function _setError(msg, type = 'error') {
    const el = document.getElementById('loginError');
    if (!el) return;
    el.textContent   = msg;
    el.style.display = 'block';
    el.style.color   = type === 'success' ? 'var(--success)' : 'var(--danger)';
  }

  /* ---- Enter no formulário ---- */
  function handleKeydown(e) {
    if (e.key === 'Enter') login();
  }

  return { init, login, logout, resetPassword, getUser, handleKeydown };
})();
