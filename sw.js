/* PAT One - service worker. Chỉ cache tài nguyên tĩnh (app shell, thư viện CDN, font).
   Tuyệt đối không đụng tới dữ liệu nghiệp vụ (localStorage/IndexedDB) và các API động. */
const APP_PREFIX = 'pat-one-cache-';
const CACHE_NAME = APP_PREFIX + 'v1'; // nâng v1 -> v2 khi phát hành bản mới

// Bắt buộc: file cùng thư mục
const LOCAL_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

// Thư viện/font CDN mà phần mềm đang gọi (lỗi mạng ở đây không làm hỏng việc cài đặt)
const CDN_SHELL = [
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Playfair+Display:wght@500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

const SHELL_HREFS = new Set(
  LOCAL_SHELL.concat(CDN_SHELL).map((p) => new URL(p, self.location).href)
);
// Tệp font tĩnh do Google Fonts CSS trỏ tới
const FONT_HOST = 'fonts.gstatic.com';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(LOCAL_SHELL);
      await Promise.all(
        CDN_SHELL.map((u) =>
          fetch(new Request(u, { mode: 'no-cors' }))
            .then((res) => cache.put(u, res))
            .catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith(APP_PREFIX) && n !== CACHE_NAME) // chỉ cache của app này
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isShell = SHELL_HREFS.has(url.href.split('#')[0]);
  const isFont = url.hostname === FONT_HOST;
  const isNav = req.mode === 'navigate';
  // Mọi request khác (API, đăng nhập Google, đồng hồ giờ chuẩn...) để trình duyệt tự xử lý.
  if (!isShell && !isFont && !isNav) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req, { ignoreSearch: isNav, ignoreVary: true }).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (isFont && res && (res.ok || res.type === 'opaque')) {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => {
            if (isNav) return cache.match('./index.html');
            return Response.error();
          });
      })
    )
  );
});
