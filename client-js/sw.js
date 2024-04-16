const cacheStorageKey = "cache-v1";

const cacheList = ["/insertJS-head", "/insertJS-body"];

/** 自定义响应。通过客户端service worker拦截一些不需要的请求，减少连接消耗 */
const customResponseMap = new Map([
  /** 点击搜索结果时，直接跳转对应url */
  [
    "url",
    (url, request) => {
      const redirectURL = url.searchParams.get("url");
      if (redirectURL) {
        return Response.redirect(redirectURL);
      }
      return fetch(request);
    },
  ],
  ["gen_204", () => new Response(null, { status: 204 })],
  ["client_204", () => new Response(null, { status: 204 })],
  ["async/vpkg", () => new Response(null, { status: 404 })],
]);

// 在sw.js文件内部编写Service Worker的核心逻辑
self.addEventListener("install", (event) => {
  // 安装事件处理程序，在这里可以预缓存资源
  event.waitUntil(
    caches.open(cacheStorageKey).then((cache) => {
      return cache.addAll(cacheList);
    })
  );
});
self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      const url = new URL(event.request.url);
      const customResponse =
        customResponseMap.get(url.pathname.slice(1)) || undefined;
      if (customResponse) {
        return customResponse(url, event.request);
      }
      try {
        const result = await fetch(event.request);
        return result;
      } catch (e) {
        return new Response("请求失败", { status: 500 });
      }
    })()
  );
});
