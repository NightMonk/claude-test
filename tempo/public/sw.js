// Service worker: installable offline shell + Web Push reminders.
// API calls always go to the network (your private data is never cached).
const CACHE = 'tempo-shell-v23';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/vendor/chrono.min.js',
  '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/feed') || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() =>
      // Offline fallback: for a page navigation with nothing cached, serve the
      // app shell so Tempo still opens; otherwise fail as usual.
      cached || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)
    ))
  );
});

// --- Web Push: reminders that fire even when the app is closed ---
self.addEventListener('push', (e) => {
  let data = { title: '⏱ Tempo', body: 'Reminder' };
  try { data = e.data.json(); } catch { if (e.data) data.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(data.title || '⏱ Tempo', {
    body: data.body || '',
    tag: data.tag,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: data.url || '/' },
    requireInteraction: true, // ADHD-friendly: don't vanish before it's seen
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow(url);
  }));
});
