/* Service worker: casca do app sempre da rede quando houver conexão (assim o código novo vale na hora);
   cache só como reserva para funcionar offline. */
const VERSAO = 'fpb-v1.17'; // mantenha igual a APP_VERSAO em app.js ao publicar mudanças no app
const CASCA = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icons/icone.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'ATIVAR') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const chave = url.pathname.includes('/api/') ? url.pathname : e.request;
  // rede primeiro (sem cache HTTP); se falhar (offline), usa a última cópia
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((r) => { if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(chave, copia)); } return r; })
      .catch(() => caches.match(chave, { ignoreSearch: true }))
  );
});
