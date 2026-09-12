const STATIC_CACHE = "igreja-conectada-static-v4";
const STATIC_ASSETS = [
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const cacheableStatic =
    url.pathname.startsWith("/_next/static/") ||
    STATIC_ASSETS.includes(url.pathname);

  if (!cacheableStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }

        return response;
      });
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Igreja Conectada";
  const targetModule = payload.module || "overview";
  const importantModules = ["pastoral", "registrations", "registrationRequests"];
  const isImportant = importantModules.includes(targetModule);
  const options = {
    body: payload.body || "Voce tem um novo aviso da igreja.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: payload.url || "/",
      module: targetModule,
    },
    tag: targetModule ? `igreja-conectada-${targetModule}` : "igreja-conectada",
    renotify: true,
    requireInteraction: isImportant,
    vibrate: isImportant ? [300, 120, 300, 120, 300] : [160, 80, 160],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
