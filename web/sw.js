/* Service worker: casca do app em cache (funciona offline), notícias sempre da rede quando possível. */
const VERSAO = 'fpb-v1';
const CASCA = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icons/icone.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) {
    // rede primeiro; se falhar (offline), usa a última cópia
    e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(url.pathname, copia)); return r; }).catch(() => caches.match(url.pathname)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => {
    const rede = fetch(e.request).then((r) => { if (r.ok) caches.open(VERSAO).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => hit);
    return hit || rede;
  }));
});
