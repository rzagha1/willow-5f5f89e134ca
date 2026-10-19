'use strict';
importScripts('./sync-config.js');
const CACHE_VERSION = '1.2.0';
const CACHE_PREFIX = `eshels-baby-${self.registration.scope}-`;
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const FILES = ['./', './index.html', './styles.css', './app.js', './event-data.js', './sync-config.js', './sync.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES.map(path => new Request(path, {cache:'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if(SYNC_URL && event.request.url === SYNC_URL+'/sync')return; // Private sync always uses the network, never the app cache.
  event.respondWith((async () => {
    const url = new URL(event.request.url);
    const root = new URL('./', self.registration.scope);
    const cache = await caches.open(CACHE_NAME);
    if (event.request.method !== 'GET' || url.origin !== root.origin) return Response.error();
    url.search = '';
    const cached = await cache.match(url.href);
    if (cached) return cached;
    return new Response('This file is not part of the offline app.', {status:404, headers:{'Content-Type':'text/plain'}});
  })());
});
