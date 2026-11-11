const CACHE = 'project-archive-icloud-v2-6';
const ASSETS = ['./', './index.html', './app.css', './app.js', './catalog.js', './store.js', './manifest.webmanifest', './icon.svg', './icon.png', './shortcuts/iCloud项目档案-安装.zip', './shortcuts/iCloud归档到项目-安装.zip', './shortcuts/iCloud管理项目档案.shortcut', './shortcuts/iCloud打开项目原件.shortcut'];
self.addEventListener('install', event => {
  const requests = ASSETS.map(path => new Request(path, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('project-archive-icloud-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return cache.match('./index.html');
      throw error;
    }
  }));
});
