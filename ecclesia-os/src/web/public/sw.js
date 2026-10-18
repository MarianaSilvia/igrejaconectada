const CACHE = "ecclesia-shell-v1";
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/icon.svg", "/manifest.webmanifest"])),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  ),
);
// Never cache HTML, API responses, documents, credentials or personal information.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    u.origin === self.location.origin &&
    ["/icon.svg", "/manifest.webmanifest"].includes(u.pathname)
  )
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
