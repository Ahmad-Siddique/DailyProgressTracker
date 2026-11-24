/* Dayboard shell cache — static assets only. Never cache API or Supabase. */

const CACHE = "dayboard-shell-v2";
const SHELL = ["/today", "/board", "/goals", "/money", "/review", "/settings", "/login"];

function isNeverCache(url) {
  const u = new URL(url);
  if (u.pathname.startsWith("/api/")) return true;
  if (u.hostname.includes("supabase")) return true;
  if (u.pathname.includes("/export")) return true;
  if (u.pathname.endsWith(".csv") || u.pathname.endsWith("backup.json")) return true;
  return false;
}

function isLocalDevUrl(url) {
  const u = new URL(url);
  const h = u.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = request.url;
  if (isNeverCache(url)) return;

  const u = new URL(url);

  // Never intercept Next.js bundles on local dev — avoids stale chunks after HMR.
  if (isLocalDevUrl(url)) return;

  if (u.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            void caches.open(CACHE).then((cache) => cache.put(request, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit ?? Response.error()),
        ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => res)
        .catch(() =>
          caches.match(request).then((hit) => hit ?? caches.match("/today")),
        ),
    );
    return;
  }

  if (u.pathname === "/manifest.webmanifest" || u.pathname.endsWith(".woff2")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            void caches.open(CACHE).then((cache) => cache.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(request)),
    );
  }
});