/* Service worker - Kalender Jawa
   Ubah CACHE_VERSION setiap kali daftar PRECACHE berubah. */
const CACHE_VERSION = 'kalender-jawa-v1';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

// Library CDN yang dibutuhkan untuk export PDF (agar tetap bisa dipakai offline)
const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Roboto:wght@400;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // App shell wajib berhasil
    await cache.addAll(APP_SHELL);
    // CDN: best effort, gagal satu tidak menggagalkan instalasi
    await Promise.all(CDN_LIBS.map(async url => {
      try {
        const res = await fetch(new Request(url, { mode: 'no-cors' }));
        await cache.put(url, res);
      } catch (e) { /* offline saat install: akan di-cache saat dipakai */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  // Halaman utama: network-first supaya update dari GitHub langsung terbaca,
  // fallback ke cache saat offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put('index.html', fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match('index.html', { ignoreSearch: true })) ||
               (await cache.match('./', { ignoreSearch: true })) ||
               Response.error();
      }
    })());
    return;
  }

  // Aset lain (ikon, CDN, font): stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
