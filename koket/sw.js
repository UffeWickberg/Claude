// Gör att skärmen startar även om wifi:t tillfälligt är borta.
// Sidans egna filer: nätet först (alltid kontrollerat mot servern), sparad kopia som reserv. Data (väder, kalender) cachas inte här.
const CACHE = 'koket-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'ical.min.js', 'manifest.webmanifest', 'icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
