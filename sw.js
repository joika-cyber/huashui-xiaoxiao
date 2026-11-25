// 离线缓存：首次打开后即可断网游玩。更新游戏文件后把版本号 +1
const CACHE = "huashui-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/logic.js",
  "./js/levels.js",
  "./js/audio.js",
  "./js/render.js",
  "./js/game.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache: "reload" 绕过浏览器 HTTP 缓存，确保拿到最新文件
      return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

// 先用缓存秒开，同时在后台拉取新版本更新缓存
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache
        .match(e.request, { ignoreSearch: true })
        .then(function (cached) {
          const network = fetch(e.request)
            .then(function (res) {
              if (
                res &&
                res.ok &&
                new URL(e.request.url).origin === location.origin
              )
                cache.put(e.request, res.clone());
              return res;
            })
            .catch(function () {
              return cached;
            });
          return cached || network;
        });
    }),
  );
});
