// HASACA — PUSH-ONLY service worker.
// Intentionally does NO page/asset caching (a previous caching version served stale HTML). Its only
// job is Web Push: show notifications and handle clicks. Install prompt / offline PWA remain disabled.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Clear any caches left over from an older caching service worker so no stale content survives.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// No 'fetch' handler on purpose → the browser always goes to the network (never stale).

// ==========================================
// WEB PUSH NOTIFICATION HANDLERS
// ==========================================

self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'My Restaurant';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/badge.png',
      image: data.image || undefined,
      tag: data.tag || 'hasaca-notification',
      renotify: true,
      requireInteraction: data.priority === 'critical' || data.priority === 'high',
      data: {
        id: data.id,
        url: data.url || '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('[Service Worker] Error displaying push notification:', err);
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('My Restaurant', {
        body: text,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge.png',
        data: { url: '/' }
      })
    );
  }
});

self.addEventListener('notificationclick', event => {
  const notif = event.notification;
  notif.close();

  const targetUrl = new URL(notif.data.url, self.location.origin).href;

  event.waitUntil(
    fetch('/api/notifications/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notif.data.id })
    }).catch(err => console.error('[SW] Failed to track notification click:', err))
    .then(() => {
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        for (const client of clientList) {
          if (client.url === targetUrl || 'navigate' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      });
    })
  );
});
