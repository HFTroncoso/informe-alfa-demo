/* Service worker de la demo: precarga todos los archivos para que la app abra sin señal.
   Para publicar una versión nueva, cambiar VERSION. */
const VERSION = 'alfa-demo-v0.2.1';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/estilos.css',
  './js/almacen.js',
  './js/reglas.js',
  './js/pdf.js',
  './js/app.js',
  './lib/pdf-lib.min.js',
  './datos/config.json',
  './datos/reglas.json',
  './datos/plantilla_alfa.json',
  './img/firma_ejercicio.png',
  './img/timbre_ejercicio.png',
  './img/icono-180.png',
  './img/icono-192.png',
  './img/icono-512.png',
  './img/icono-512-maskable.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(req, { ignoreSearch: true }).then(enCache => {
      if (enCache) return enCache;
      return fetch(req).then(resp => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(VERSION).then(cache => cache.put(req, copia));
        }
        return resp;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Sin conexión y el archivo no está guardado.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    })
  );
});
