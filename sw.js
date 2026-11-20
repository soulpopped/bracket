/* Offline copy: network first, saved copy when there's no connection. */
const CACHE = 'bracket-v7';
const CORE = ['./', 'index.html', 'app.js?v=7', 'styles.css?v=7', 'data/bracket.json', 'data/songs.json', 'manifest.json', 'icon.svg', 'icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => fetch(u, { cache: 'no-cache' }).then((r) => r.ok && c.put(u, stamp(r))).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k.startsWith('bracket-')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function stamp(r) {
  const h = new Headers(r.headers);
  h.set('x-cached-at', String(Date.now()));
  return new Response(r.clone().body, { status: r.status, statusText: r.statusText, headers: h });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const fonts = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (!same && !fonts) return; // Spotify images and links go straight to the network
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const key = same ? (url.pathname === '/' ? './' : url.pathname.replace(/^\//, '') + url.search) : req.url;
    try {
      const r = await fetch(req);
      if (r.ok && r.type !== 'opaqueredirect') c.put(key, same ? stamp(r.clone()) : r.clone());
      return r;
    } catch (err) {
      const hit = (await c.match(key)) || (same && req.mode === 'navigate' ? await c.match('./') : null);
      if (!hit) throw err;
      if (!same) return hit;
      const h = new Headers(hit.headers);
      h.set('x-from-cache', hit.headers.get('x-cached-at') || '1');
      return new Response(hit.body, { status: hit.status, headers: h });
    }
  })());
});
