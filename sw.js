// Service Worker — خياط الشباب الذهبي
// يخزن الصفحة بالكاش لفتح أسرع، ودايم يحاول يجيب آخر نسخة من النت أول

const CACHE_NAME = "khayyat-shabab-v1";
const APP_SHELL = ["./", "./index.html"];

// عند التثبيت: خزّن نسخة أولية من الصفحة
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// عند التفعيل: احذف أي نسخ كاش قديمة من إصدارات سابقة
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// استراتيجية الجلب:
// - لصفحة التطبيق نفسها (HTML): Network First — يحاول يجيب آخر تحديث من النت،
//   ولو فشل (ما في نت) يرجع للنسخة المخزنة بالكاش
// - لأي شي ثاني (خطوط، مكتبة Excel لو تحملت): Cache First — أسرع، وما يحتاج يطلبها كل مرة
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // فقط نطلبات GET
  if (req.method !== "GET") return;

  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // ملفات ثانية (خطوط، مكتبات خارجية...) — كاش أول، ولو مو موجود يجيبها من النت ويخزنها
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // خزّن فقط الردود الناجحة
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
