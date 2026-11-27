/* Jarbas · service worker: abre o app mesmo sem internet e atualiza sozinho */
const VERSAO = "jarbas-v8";
const ARQUIVOS = ["./", "index.html", "styles.css?v=8", "manifest.webmanifest",
  "js/util.js?v=8", "js/gemini.js?v=8", "js/voz.js?v=8", "js/agenda.js?v=8", "js/financas.js?v=8", "js/cerebro.js?v=8", "js/app.js?v=8",
  "icons/icon-192.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // a IA (Google) sempre vai pela internet
  // rede primeiro (pega atualizações), cache se estiver sem internet
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: false }).then((r) => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => cs.length ? cs[0].focus() : self.clients.openWindow("./"))); });
