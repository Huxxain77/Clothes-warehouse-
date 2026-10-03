// Service Worker — خياط الشباب الذهبي
// هدفه: فتح فوري من الكاش (يمنع الشاشة السوداء بالآيفون)، مع تحديث بالخلفية دايماً

const CACHE_VERSION = "khayyat-shabab-v2";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;700;900&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
];

// طلبات ما نلمسها أبداً (قاعدة بيانات / تسجيل دخول / أي API حي)
const BYPASS_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {}) // لا نكسر التثبيت لو مصدر واحد فشل
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isVersionedCDN(url) {
  // روابط فيها رقم نسخة ثابت (cdnjs بالذات) — cache-first آمن لأنها ما تتغير
  return /cdnjs\.cloudflare\.com\/ajax\/libs\/[^/]+\/[\d.]+\//.test(url);
}

function isFontResource(url) {
  return (
    url.indexOf("fonts.googleapis.com") !== -1 ||
    url.indexOf("fonts.gstatic.com") !== -1
  );
}

// يرسل رسالة لصفحة معينة (resultingClientId) بعد ما تصير جاهزة، مع إعادة محاولة
async function notifyClientWhenReady(clientId, message, attempts) {
  attempts = attempts || 0;
  if (attempts > 30) return; // تقريباً 9 ثواني (30 × 300ms)
  const client = await self.clients.get(clientId);
  if (client) {
    client.postMessage(message);
    return;
  }
  await new Promise((r) => setTimeout(r, 300));
  return notifyClientWhenReady(clientId, message, attempts + 1);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // لا نلمس أي طلب لقاعدة البيانات / المصادقة
  if (BYPASS_HOSTS.indexOf(url.hostname) !== -1) return;

  const isNavigate =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") !== -1;

  // === صفحة التطبيق نفسها: ترجع من الكاش فوراً، وتتحدث بالخلفية ===
  if (isNavigate) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match("./index.html");

        // يجيب النسخة الجديدة من النت بالخلفية (ما ننتظرها للرد)
        const updatePromise = (async () => {
          try {
            const fresh = await fetch(req.url, {
              cache: "no-cache",
              credentials: "same-origin"
            });
            if (fresh && fresh.ok) {
              let changed = true;
              if (cached) {
                try {
                  const oldText = await cached.clone().text();
                  const newText = await fresh.clone().text();
                  changed = oldText !== newText;
                } catch (e) {
                  changed = true;
                }
              }
              await cache.put("./index.html", fresh.clone());
              if (changed && event.resultingClientId) {
                notifyClientWhenReady(event.resultingClientId, { type: "app-updated" });
              }
            }
            return fresh;
          } catch (e) {
            return null;
          }
        })();

        if (cached) {
          event.waitUntil(updatePromise);
          return cached;
        }
        // ما في كاش بعد (أول فتحة) — لازم ننتظر النت
        const fresh = await updatePromise;
        return fresh || new Response("تعذّر الاتصال بالإنترنت ولا توجد نسخة محفوظة.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })()
    );
    return;
  }

  // === مكتبات CDN مع رقم نسخة ثابت بالرابط: cache-first ===
  if (isVersionedCDN(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
          }
          return res;
        });
      })
    );
    return;
  }

  // === الخطوط وباقي ملفات نفس الموقع: stale-while-revalidate ===
  if (isFontResource(req.url) || url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // أي طلب آخر غير مصنّف: دعه يمر عادي (شبكة)
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
