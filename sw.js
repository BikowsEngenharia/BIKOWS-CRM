/* ==========================================
   Service Worker — Bikows CRM
   Gerencia notificações push em background
   ========================================== */
const CACHE_NAME = 'bikows-crm-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

/* ---- Notificações push do servidor (futuro) ---- */
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Bikows CRM', {
      body: data.body || '',
      icon: '/BIKOWS-CRM/img/logo-bikows.png',
      badge: '/BIKOWS-CRM/img/logo-bikows.png',
      tag: data.tag || 'crm',
      data: { url: data.url || '/BIKOWS-CRM/' },
      requireInteraction: data.requireInteraction || false,
    })
  );
});

/* ---- Clique na notificação → abre o app ---- */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/BIKOWS-CRM/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find(c => c.url.includes('BIKOWS-CRM'));
      if (existing) { existing.focus(); existing.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});
