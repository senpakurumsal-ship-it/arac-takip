// Senpa Araç Takip — Service Worker
// Strateji: aynı origin GET için network-first (çevrimiçiyse taze, çevrimdışıysa cache).
// API/dış kaynaklar (Apps Script, Drive, Gemini) hiç dokunulmadan ağdan geçer.
const CACHE = 'aractakip-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  // Sadece aynı origin GET; API ve dış kaynaklara karışma
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
  );
});
