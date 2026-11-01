/* ==========================================
   Service Worker — Bikows CRM
   Notificações em background + funcionamento sem sinal

   Estratégia, por tipo de requisição:

   • Navegação (abrir o CRM)  → rede primeiro, cache como rede reserva.
     Garante que um deploy novo chega assim que houver sinal, e que o app
     abre mesmo sem conexão nenhuma (fábrica, subsolo, estrada).

   • Arquivo estático (js, css, img, fonte) → cache primeiro, revalidando
     em segundo plano. É seguro porque todo script do index.html carrega
     com ?v=AAAAMMDD: mudar a versão muda a URL, que é um endereço novo e
     portanto nunca está em cache.

   • Supabase, Google e qualquer API → só rede, nunca cache. Dado de
     cliente não fica guardado no disco pelo navegador por decisão do
     service worker; o backup offline do CRM é o localStorage do db.js,
     que é código da aplicação e o usuário controla.

   Sem lista de pré-cache de propósito: a lista envelhece e passa a apontar
   para arquivo que não existe mais (era um dos achados da auditoria). Aqui
   o cache se forma com o que a primeira visita realmente carregou.
   ========================================== */

const CACHE = 'bikows-crm-v2';

/* Hosts cujas respostas nunca entram em cache: carregam dado vivo ou sessão. */
const SO_REDE = [
  'supabase.co',
  'supabase.in',
  'accounts.google.com',
  'apis.google.com',
  'googleapis.com',
  'api.telegram.org',
];

/* Hosts externos cujos arquivos podem ser guardados (SDK com versão fixa). */
const CDN_PERMITIDO = [
  'cdn.jsdelivr.net',
];

const ehSoRede = (url) => SO_REDE.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
const ehCdnPermitido = (url) => CDN_PERMITIDO.includes(url.hostname);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Remove caches de versões anteriores para não servir código velho
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n.startsWith('bikows-crm-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* Permite que a página peça a ativação imediata de uma versão nova. */
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (ehSoRede(url)) return;                                   // deixa passar direto

  const mesmaOrigem = url.origin === self.location.origin;
  if (!mesmaOrigem && !ehCdnPermitido(url)) return;

  // Abrir o app: rede primeiro para pegar deploy novo, cache se estiver sem sinal
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) (await caches.open(CACHE)).put(req, resp.clone());
        return resp;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(req))
          || (await cache.match(new URL('index.html', self.registration.scope).href))
          || respostaSemSinal();
      }
    })());
    return;
  }

  // Arquivo estático: cache primeiro, atualizando em segundo plano
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req);

    const daRede = fetch(req).then(resp => {
      if (resp && resp.ok) cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);

    if (guardado) { e.waitUntil(daRede); return guardado; }
    const resp = await daRede;
    return resp || new Response('', { status: 504, statusText: 'sem conexao' });
  })());
});

function respostaSemSinal() {
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Bikows CRM</title>
     <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
       background:#0B1B33;color:#DCE6F2;font-family:system-ui,sans-serif;text-align:center;padding:24px">
       <div>
         <div style="font-size:40px;margin-bottom:12px">📡</div>
         <h1 style="font-size:18px;margin:0 0 8px">Sem conexão</h1>
         <p style="font-size:14px;opacity:.75;margin:0 0 18px;max-width:320px">
           O CRM ainda não foi aberto neste aparelho com internet, então não há
           cópia local para mostrar. Abra uma vez com sinal e ele passa a abrir offline.
         </p>
         <button onclick="location.reload()"
           style="padding:10px 22px;border:none;border-radius:8px;background:#1D4F8C;
           color:#fff;font-size:14px;font-weight:600;cursor:pointer">Tentar de novo</button>
       </div>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/* ---- Notificações push do servidor ---- */
const noEscopo = (caminho) => new URL(caminho, self.registration.scope).href;

self.addEventListener('push', (e) => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { body: e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Bikows CRM', {
      body: data.body || '',
      icon: noEscopo('img/logo-bikows.png'),
      badge: noEscopo('img/simbolo-bikows.png'),
      tag: data.tag || 'crm',
      data: { url: data.url || self.registration.scope },
      requireInteraction: data.requireInteraction || false,
    })
  );
});

/* ---- Clique na notificação → abre o app ---- */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find(c => c.url.startsWith(self.registration.scope));
      if (existing) { existing.focus(); return existing.navigate(url); }
      return self.clients.openWindow(url);
    })
  );
});
