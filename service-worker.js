// Service worker de Kontaly — guarda una copia local de la app
// para que abra rápido y funcione aunque no haya internet.
// Los datos NO se guardan aquí (eso vive en localStorage / futuro backend),
// solo el "cascarón" de la app (HTML, íconos).

const CACHE_NAME = 'kontaly-v8';
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './browser-storage.js',
  './supabase-storage.js'
];

self.addEventListener('install', (evento) => {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_CACHE))
  );
});

// Permite que la app fuerce la actualización al instante (botón "Actualizar")
self.addEventListener('message', (evento) => {
  if (evento.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: red primero, si falla usa la copia guardada (offline).
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(evento.request).then((r) => r || caches.match('./index.html')))
  );
});
