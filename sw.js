/* Hors-ligne : l'appli fonctionne sans réseau après une première visite.
   Change VERSION à chaque mise à jour des fichiers pour forcer le rafraîchissement. */
const VERSION = "learnjc-v7";
const FILES = ["./", "index.html", "questions.json", "calc.js", "fiches.js", "fiches.html", "manifest.webmanifest", "news.json",
  "icon-192.png", "icon-512.png", "icon-180.png", "fiches-memo-conseiller.pdf"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // Réseau d'abord (pour avoir les dernières questions), cache si hors-ligne
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
