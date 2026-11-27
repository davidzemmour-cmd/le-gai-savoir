// Le Gai Savoir - service worker
// Strategie "reseau d'abord" : on prend toujours la derniere version en ligne,
// la copie locale ne sert que si le reseau est coupe.
// Les appels a Supabase ne sont jamais mis en cache.

const CACHE = "gai-savoir-v16";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const requete = ev.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    // cache: "no-cache" oblige le navigateur a verifier aupres du serveur
    // qu'il n'existe pas de version plus recente (sinon GitHub Pages laisse
    // le navigateur reutiliser une ancienne copie pendant 10 minutes).
    fetch(requete.url, { cache: "no-cache" })
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE).then((c) => c.put(requete, copie));
        return reponse;
      })
      .catch(() => caches.match(requete))
  );
});
