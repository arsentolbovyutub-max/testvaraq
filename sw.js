/* Offline cache: app shell + CDN libraries. Network first for the shell so updates arrive. */
const CACHE = 'testvaraq-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'icon.svg', 'manifest.webmanifest',
  'js/util.js', 'js/db.js', 'js/scoring.js', 'js/sheet.js', 'js/omr.js', 'js/pdf.js', 'js/views.js', 'js/scan.js', 'js/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isCdn = url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net';
  if (url.origin !== location.origin && !isCdn) return;
  if (isCdn) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
    return;
  }
  e.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});
