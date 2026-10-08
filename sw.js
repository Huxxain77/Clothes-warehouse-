// Service Worker — خياط الشباب الذهبي
// فتح فوري من الكاش + تحديث بالخلفية + لا يلمس طلبات Firestore إطلاقاً

const CACHE = 'khayyat-shabab-v6';
const PRECACHE = ['./'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

const put = (key, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const c = res.clone();
    caches.open(CACHE).then(x => x.put(key, c));
  }
  return res;
};

const cacheFirst = req =>
  caches.match(req).then(r => r || fetch(req).then(res => put(req, res)));

const staleRevalidate = req =>
  caches.match(req).then(r => {
    const f = fetch(req).then(res => put(req, res)).catch(() => r);
    return r || f;
  });

// صفحة التطبيق: ترجع من الكاش فوراً، وبالخلفية تتحدث من النت
// (إشعار التحديث صار من الصفحة نفسها عبر مقارنة APP_VERSION)
async function appPage(e) {
  const key = './', cache = await caches.open(CACHE), cached = await cache.match(key);
  const net = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then(res => { if (res && res.ok) cache.put(key, res.clone()); return res; })
    .catch(() => cached);
  if (cached) { e.waitUntil(net); return cached; }
  return net;
}

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;

  // لا نلمس Firestore إطلاقاً، ولا فحص النسخة
  if (u.hostname === 'firestore.googleapis.com' || u.searchParams.has('__vcheck')) return;

  // صفحة التطبيق
  if (r.mode === 'navigate' && u.origin === location.origin) {
    return e.respondWith(appPage(e));
  }

  // مكتبات CDN / خطوط Google: cache-first
  if (['cdnjs.cloudflare.com', 'fonts.gstatic.com'].includes(u.hostname)) {
    return e.respondWith(cacheFirst(r));
  }

  // CSS الخطوط وباقي ملفات نفس الموقع: stale-while-revalidate
  if (u.hostname === 'fonts.googleapis.com' || u.origin === location.origin) {
    return e.respondWith(staleRevalidate(r));
  }
});
