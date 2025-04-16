// キャッシュ名 (バージョンが変わったらここを変更すると古いキャッシュが削除されます)
const CACHE_NAME = 'unity-meal-planning-app-cache-v1';

// キャッシュするファイルのリスト
// Unityのビルドファイル名は正確に指定してください
const urlsToCache = [
  '.', // ルート (index.html相当)
  'index.html',
  'manifest.json',
  'images/icon-192x192.png', // パスを修正
  'images/icon-512x512.png', // パスを修正
  'Build/Unity-Meal-Planning-App.loader.js',
  'Build/Unity-Meal-Planning-App.framework.js',
  'Build/Unity-Meal-Planning-App.data',
  'Build/Unity-Meal-Planning-App.wasm',
  // 必要に応じて他のUnity関連ファイル(TemplateDataなど)やアセットを追加
  // 'TemplateData/style.css',
  // 'TemplateData/favicon.ico',
];

// Service Worker インストール時の処理
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        // ネットワークエラー時に install を失敗させないように個別にキャッシュする方が堅牢
        const stack = [];
        urlsToCache.forEach(url => stack.push(
            cache.add(url).catch(reason => { console.error(`[SW] Caching ${url} failed: ${reason}`); })
        ));
        return Promise.all(stack);
        // return cache.addAll(urlsToCache); // シンプルだが一つでも失敗すると全体が失敗する
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting on install');
        return self.skipWaiting(); // 新しい SW を即座にアクティブにする
      })
      .catch((error) => {
        console.error('[Service Worker] Cache open/addAll failed:', error);
      })
  );
});

// Service Worker アクティブ化時の処理 (古いキャッシュの削除など)
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim(); // 即座にページ制御を開始
      })
  );
});

// Fetch イベント (リクエストへの応答) - Cache First Strategy
self.addEventListener('fetch', (event) => {
  // GETリクエスト以外はネットワークにフォールバック
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache first strategy
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // キャッシュがあれば返す
        if (cachedResponse) {
          // console.log('[Service Worker] Returning response from cache:', event.request.url);
          return cachedResponse;
        }

        // キャッシュがなければネットワークから取得
        // console.log('[Service Worker] Fetching response from network:', event.request.url);
        return fetch(event.request).then((networkResponse) => {
            // 取得に成功したらキャッシュに保存
            if (networkResponse && networkResponse.status === 200) {
              // レスポンスを複製（レスポンスはストリームなので一度しか使えないため）
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  // console.log('[Service Worker] Caching new resource:', event.request.url);
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(error => {
            console.error('[Service Worker] Fetch failed:', error);
            // ここでオフラインページなどを返すことも可能
            // return caches.match('/offline.html');
            // または単にエラーを返す
            return new Response("Network error happened", {
                status: 408,
                headers: { "Content-Type": "text/plain" },
            });
          });
      })
  );
});