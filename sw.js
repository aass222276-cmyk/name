// Service Worker (sw.js)

const SW_VERSION = 'manganame-v3.0.0'; // 変更を反映させたい時にここを変更
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
    // JSZipはCDNからなのでキャッシュ対象外 (オンライン前提)
];

// 1. インストール
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache:', CACHE_NAME);
                return cache.addAll(urlsToCache);
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
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュがあればそれを返す
                if (response) {
                    return response;
                }
                // キャッシュがなければネットワークにリクエスト
                return fetch(event.request);
            })
    );
});