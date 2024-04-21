const cacheStorageKey = "cache-v1";

const cacheList = [
  "/insertJS-head",
  "/insertJS-body",
  "/images/errors/robot.png",
  "/images/branding/googlelogo/1x/googlelogo_color_150x54dp.png",
  "/images/branding/googlelogo/2x/googlelogo_color_150x54dp.png",
  "/error-page-template",
  "/favicon.ico",
];

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

function fillTemplate(template, replacements) {
  for (const key in replacements) {
    if (replacements.hasOwnProperty(key)) {
      const regex = new RegExp("\\${" + key + "}", "g");
      template = template.replace(regex, replacements[key]);
    }
  }
  return template;
}

// 在sw.js文件内部编写Service Worker的核心逻辑
self.addEventListener("install", (event) => {
  // 安装事件处理程序，在这里可以预缓存资源
  const preCahce = async () => {
    const cache = await caches.open(cacheStorageKey);
    await cache.addAll(cacheList);
  };
  event.waitUntil(preCahce());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const mode = event.request.mode;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheStorageKey);
      const cachedResponse = await cache.match(event.request.url);
      const customResponse = customResponseMap.get(url.pathname.slice(1)) || undefined;
      if (customResponse) {
        //如果url符合自定义响应的规则，返回对应的自定义响应
        return customResponse(url, event.request);
      }
      if (cachedResponse) {
        //有缓存直接使用缓存
        return cachedResponse;
      }
      try {
        //尝试从网络请求内容
        const result = await fetch(event.request);
        if (!result.ok) {
          const { status, statusText } = result;
          throw {
            message: `${status} ${statusText || ""}`,
            body: `<a href='https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status/${status}'>关于此错误代码</a>`,
            status,
          };
        }
        return result;
      } catch (e) {
        //错误处理
        if (mode !== "navigate") {
          return new Response(null, { status: e.status || 500 });
        }
        //如果请求模式是导航（当前请求会导致文档重新加载），构建错误页面
        const errorPage = await cache.match("/error-page-template");
        const html = await errorPage.text();
        const body = fillTemplate(html, {
          title: "无法连接到镜像站点",
          host: url.host,
          error: e.message,
          errorMessage: e.body || e,
        });
        return new Response(body, {
          status: e.status || 500,
        });
      }
    })()
  );
});
