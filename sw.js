/* Salon Copy — keeps the app on the phone so it opens instantly, even with no internet.
   Firestore data is not touched here: Firebase keeps its own offline copy and queue. */
const V = 'salon-copy-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-48.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('salon-copy') && k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); } return res; };

/* The page: newest from the internet, but never wait more than 3 s; then the kept copy. */
async function page(req) {
  const cached = () => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'));
  const net = fetch(req).then(res => put(new Request(req.url.split('?')[0]), res));
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), 3000))]);
  } catch (e) {
    const c = await cached();
    if (c) { net.catch(() => {}); return c; }
    return net;
  }
}
/* Fixed files (Firebase scripts are versioned, fonts never change): kept copy first. */
async function keep(req) {
  const c = await caches.match(req);
  return c || fetch(req).then(res => put(req, res));
}
/* Our own small files: kept copy now, fresh copy for next time. */
async function fresh(req) {
  const c = await caches.match(req);
  const net = fetch(req).then(res => put(req, res)).catch(() => c);
  return c || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // the clock check (HEAD) and all writes go straight out
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) return e.respondWith(page(req));
  if (url.origin === location.origin) return e.respondWith(fresh(req));
  if ((url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) ||
      url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(keep(req));
  // everything else (Firestore, Google sign-in) is left to the network and Firebase
});
