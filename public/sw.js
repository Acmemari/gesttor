/**
 * Service Worker para cache de recursos estáticos
 * Versão do cache - atualizar quando necessário invalidar cache
 */
const CACHE_VERSION = 'v5';
const CACHE_NAME = `gesttor-cache-${CACHE_VERSION}`;

// Recursos estáticos para cache
const STATIC_ASSETS = ['/'];

// Rotas dinâmicas/API que NUNCA devem ser cacheadas
function isDynamicOrApiRoute(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/rest/v1/') ||
    pathname.startsWith('/auth/v1/') ||
    pathname.startsWith('/realtime/') ||
    pathname.includes('/rpc/') ||
    /\/supabase\/.*\/(rest|auth|realtime)/.test(pathname)
  );
}

// Extensões de assets estáticos (hash no nome ou tipo conhecido)
function isLikelyStaticAsset(pathname) {
  return (
    /\.(js|css|woff2?|ttf|eot|ico|png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(pathname) ||
    /\/assets\/.+-\w+\.(js|css)/.test(pathname)
  );
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Interceptar apenas GET
  if (request.method !== 'GET') return;

  // Ignorar requisições para origens externas (exceto fontes)
  if (url.origin !== self.location.origin && !url.href.includes('fonts.googleapis.com')) {
    return;
  }

  // Nunca cachear rotas dinâmicas/API
  if (isDynamicOrApiRoute(url.pathname)) {
    return;
  }

  // HTML / Navegação: Network First -> Fallback Cache
  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname === '/index.html' ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/'))),
    );
    return;
  }

  // Assets estáticos: Stale-while-revalidate
  // Retorna cache imediatamente se houver, em paralelo revalida e atualiza
  if (isLikelyStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchAndCache = fetch(request).then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        });
        if (cached) {
          fetchAndCache.catch(() => {}); // revalidate em background
          return cached;
        }
        return fetchAndCache.catch(() =>
          new Response('', { status: 503, statusText: 'Service Unavailable' }),
        );
      }),
    );
    return;
  }

  // Outros recursos: Network First
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then(
        cached => cached || new Response('', { status: 503, statusText: 'Service Unavailable' }),
      ),
    ),
  );
});

// Mensagens do cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
