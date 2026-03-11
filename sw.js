const CACHE_NAME = 'capital-energy-v78';

// ── Complete app shell — everything needed to run 100% offline ──────────────
const STATIC_ASSETS = [
  // App shell
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './logo.png',
  './installs.js',

  // Icons — all sizes
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',

  // PDFs — resources tab
  './resources/setters-resource-guide.pdf',
  './resources/the-millionaire-booklet-grant-cardone.pdf',
  './resources/the-closers-survival-guide-grant-cardone.pdf',
  './resources/sell-or-be-sold-grant-cardone.pdf',
  './resources/rich-dad-poor-dad-kiyosaki.pdf',
  './resources/nepq-big-black-book-of-questions.pdf',
  './resources/if-youre-not-first-youre-last-grant-cardone.pdf',
  './resources/how-to-make-millions-on-the-phone.pdf',
  './resources/solar-closing-strategy-guide.pdf',
  './resources/adder-sheet-az-nv.pdf',
  './resources/adder-sheet-ca.pdf',
  './resources/adder-sheet-tx.pdf',
  './resources/clean-deal-checklist.pdf',

  // Leaflet map library
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',

  // PDF.js
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',

  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Outfit:wght@600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap',

  // YouTube thumbnails — cached so Resources tab works offline (v73 — all 17 live videos)
  'https://img.youtube.com/vi/wCIORZ6BPvw/mqdefault.jpg',
  'https://img.youtube.com/vi/L0WMXW70Nms/mqdefault.jpg',
  'https://img.youtube.com/vi/EdB_O_NVzNQ/mqdefault.jpg',
  'https://img.youtube.com/vi/mDWUpuumAuo/mqdefault.jpg',
  'https://img.youtube.com/vi/XRs6rxeL2mI/mqdefault.jpg',
  'https://img.youtube.com/vi/KCu1EyMxHcE/mqdefault.jpg',
  'https://img.youtube.com/vi/hzgmC3s4P0U/mqdefault.jpg',
  'https://img.youtube.com/vi/ZMpQFU6faLM/mqdefault.jpg',
  'https://img.youtube.com/vi/xKxrkht7CpY/mqdefault.jpg',
  'https://img.youtube.com/vi/Bh_-c_Jk5f0/mqdefault.jpg',
  'https://img.youtube.com/vi/B_ovr43LIgE/mqdefault.jpg',
  'https://img.youtube.com/vi/MjhDkNmtjy0/mqdefault.jpg',
  'https://img.youtube.com/vi/11wZC77ETjE/mqdefault.jpg',
  'https://img.youtube.com/vi/AHeXvY-P8Pk/mqdefault.jpg',
  'https://img.youtube.com/vi/IoYeGV6xRfw/mqdefault.jpg',
  'https://img.youtube.com/vi/Lg-1YiR9aL0/mqdefault.jpg',
  'https://img.youtube.com/vi/BSjjXbv0aeA/mqdefault.jpg',
];

// ─── Install — pre-cache everything ─────────────────────────────────────────
// Uses Promise.allSettled so a single failed request (e.g. offline during
// first install) doesn't abort the whole SW — app still installs with whatever
// it could grab, and missing items are fetched + cached on next network visit.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => console.warn('[SW] Could not cache:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ─── Activate — delete all old caches ────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch — serve from cache, update in background ─────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── 1. Nominatim geocoding: network-first, cache hit for offline reuse ──
  if (url.hostname === 'nominatim.openstreetmap.org') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request)
          .then(cached => cached || new Response(
            JSON.stringify({ error: 'offline' }),
            { headers: { 'Content-Type': 'application/json' } }
          ))
        )
    );
    return;
  }

  // ── 2. Map tiles (CARTO + ArcGIS satellite): cache-first, fetch & cache new ──
  if (
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('arcgisonline.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
      })
    );
    return;
  }

  // ── 3. Google Fonts: cache-first (they never change) ──
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // ── 4. HTML (app shell): network-first so deploys land immediately,
  //        fall back to cached shell if offline ──
  if (
    url.origin === self.location.origin &&
    (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html'))
  ) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ── 5. Everything else (JS, CSS, images, PDFs, icons):
  //        cache-first — serve instantly, fetch + cache anything new ──
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        // Don't cache opaque responses (cross-origin without CORS) or errors
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── v71: Message-based notification relay ─────────────────────────────────
self.addEventListener('message', function(event) {
  if (!event.data || event.data.type !== 'CHECK_REMINDERS') return;
  var reminders = event.data.reminders || [];
  var now = Date.now();
  var fired = [];
  var pending = reminders.filter(function(r) { return r.fireAt <= now && !r.fired; });
  var p = Promise.resolve();
  pending.forEach(function(r) {
    p = p.then(function() {
      return self.registration.showNotification(r.title, {
        body: r.body, icon: './icons/icon-192.png',
        badge: './icons/icon-192.png', tag: r.tag,
      }).then(function() { fired.push(r.tag); }).catch(function() {});
    });
  });
  event.waitUntil(p.then(function() {
    return self.clients.matchAll({ includeUncontrolled: true }).then(function(clients) {
      clients.forEach(function(c) { c.postMessage({ type: 'REMINDERS_FIRED', fired: fired }); });
    });
  }));
});

// ── v71: Notification click → focus/open app ──────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
