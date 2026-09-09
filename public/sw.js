// Bump the cache generation when the service-worker policy changes. This also
// removes the first production cache, which could keep an old Expo route
// bundle active after a deploy until the user manually cleared site data.
const CACHE_VERSION = "v2";
const STATIC_CACHE = `easeverse-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `easeverse-runtime-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./offline.html",
  "./pwa-192.png",
  "./pwa-512.png",
  "./pwa-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  return url.includes("/api/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || isApiRequest(request.url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const appShell = await caches.match("./index.html");
          if (appShell) return appShell;
          return caches.match("./offline.html");
        })
    );
    return;
  }

  const cacheableDestinations = ["style", "script", "worker", "font", "image"];
  if (!cacheableDestinations.includes(request.destination)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => cachedResponse);

      // Route and application code must be network-first so a new Netlify
      // deploy becomes active on the next load. Immutable visual assets stay
      // cache-first and still work offline.
      const codeDestination = ["style", "script", "worker"].includes(request.destination);
      return codeDestination ? networkFetch : cachedResponse || networkFetch;
    })
  );
});

// Push handlers — show a notification when EaseVerse pushes from the server
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "EaseVerse", body: event.data.text() };
  }
  const title = payload.title || "EaseVerse";
  const options = {
    body: payload.body || "",
    tag: payload.tag,
    badge: payload.badge || "/pwa-192.png",
    icon: payload.icon || "/pwa-192.png",
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.endsWith(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
