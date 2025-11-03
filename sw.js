// Service Worker (sw.js)

const SW_VERSION = 'manganame-v16.4.0'; // [v15] このバージョン番号の更新が必須です
const CACHE_NAME = `manganame-cache-${SW_VERSION}`;

// キャッシュする主要アセット
const urlsToCache = [
    './', // index.html
    './index.html',
    './style.css',
    './app.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// 1. インストール
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache:', CACHE_NAME);
                // ネットワークエラーを無視して、キャッシュできるものだけキャッシュする
                return Promise.all(
                    urlsToCache.map(url => {
                        return cache.add(url).catch(err => {
                            console.warn(`Failed to cache ${url}:`, err);
                        });
                    })
                );
            })
            .then(() => {
                self.skipWaiting(); // インストール後すぐにアクティベート
            })
    );
});

// 2. アクティベート (古いキャッシュの削除)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // [v15] v14以前のキャッシュをすべて削除
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('manganame-cache-')) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim(); // すべてのクライアントを制御
        })
    );
});

// 3. フェッチ (キャッシュ優先、なければネットワーク)
self.addEventListener('fetch', (event) => {
    // CDNのリクエスト（JSZipなど）はキャッシュしない
    if (event.request.url.startsWith('http') && !event.request.url.startsWith(self.location.origin)) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュがあればそれを返す
                if (response) {
                    return response;
                }
                // キャッシュがなければネットワークにリクエスト
                return fetch(event.request).catch(() => {
                    // オフラインでキャッシュにもない場合（エラー）
                });
            })
    );
});