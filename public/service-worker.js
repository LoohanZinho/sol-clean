// Define o nome e a versão do cache
const CACHE_NAME = 'automacao-deposito-gas-v1';
// Lista de recursos essenciais para cache (App Shell)
const urlsToCache = [
  '/',
  '/manifest.json',
  // Adicione aqui os caminhos para seus principais arquivos CSS, JS e imagens
  // que são essenciais para a primeira renderização.
  // Next.js geralmente gera arquivos com hashes, então a melhor abordagem
  // é deixar o service worker cachear as novas requisições dinamicamente.
];

// Evento de Instalação: Cacheia os recursos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto');
        // O cache inicial pode ser mínimo, pois as rotas serão cacheadas sob demanda
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento Fetch: Intercepta as requisições e serve do cache se disponível
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Se a resposta estiver no cache, retorna ela
        if (response) {
          return response;
        }

        // Caso contrário, faz a requisição na rede
        return fetch(event.request).then(
          (response) => {
            // Verifica se recebemos uma resposta válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clona a resposta. Uma resposta é um stream e só pode ser consumida uma vez.
            // Precisamos de uma cópia para o navegador e outra para o cache.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // Adiciona a nova resposta ao cache para uso futuro
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// Evento Activate: Limpa caches antigos para manter o app atualizado
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // Se o nome do cache não está na lista de permissões, apaga ele
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
