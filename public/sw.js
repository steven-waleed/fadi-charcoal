const CACHE_NAME = 'sales-gps-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// 1. تثبيت الـ Service Worker وحفظ الملفات في الكاش
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 تم تخزين واجهة التطبيق للعمل بدون إنترنت (Offline Cache)');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. تنشيط وتنظيف النسخ القديمة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. اعتراض الطلبات وتوفير الكاش عند انقطاع الإنترنت
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // إذا كان طلب API، نحاول الاتصال بالشبكة أولاً، وإن فشل نتصرف
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // إذا انقطع النت أثناء طلب API
        return new Response(JSON.stringify({ 
          success: false, 
          offline: true, 
          message: 'أنت في وضع عدم الاتصال (Offline). تم حفظ عملك محلياً.' 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // لباقي ملفات واجهة التطبيق: Network First مع كاش احتياطي
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
