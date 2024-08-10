import { modifyRequestURL, modifyURL, buildResponse } from "/lib.js";

const cacheStorageKey = "cache-v1";
const currentHost = self.location.host;

/** 该列表用于通过匹配请求Host，修改请求的host。通过endsWith()匹配，因此更精确的匹配应该在更靠前的位置。 */
const replaceMapOfHost = {
  "translate.google.com": currentHost,
  "gstatic.com": "gstatic.cn",
  "ajax.googleapis.com": "ajax.lug.ustc.edu.cn",
  "fonts.googleapis.com": "fonts.googleapis.cn",
  "themes.googleusercontent.com": "google-themes.lug.ustc.edu.cn",
  "www.gravatar.com": "dn-qiniu-avatar.qbox.me",
};

/** 该列表用于通过匹配请求Host，返回自定义响应。通过endsWith()匹配，因此更精确的匹配应该在更靠前的位置。 */
const responseMapOfHost = {
  "apis.google.com": () => buildResponse(204),
  "feedback-pa.clients6.google.com": () => buildResponse(204),
  "ogads-pa.googleapis.com": () => buildResponse(204),
  "play.google.com": () => buildResponse(204),
  "ogs.google.com": () => buildResponse(204),
  "www.googleadservices.com": () => buildResponse(204),
  "www.googletagmanager.com": () => buildResponse(204),
  "www.google-analytics.com": () => buildResponse(204),
};

/** 该列表用于通过匹配请求pathname，返回自定义响应。要求完整匹配。 */
const responseMapOfPath = {
  "/cdn-cgi/rum": () => buildResponse(204),
  "/_/TranslateWebserverUi/gen204/": () => buildResponse(204),
};

/** 跨域请求的域名白名单。程序允许客户端通过url参数或者特殊请求头提供该请求的真实url。正则表达式会测试提供的url的host */
const proxyAllowedWhiteList = [/^encrypted-v{0,1}tbn[0-9]+.gstatic.com+$/, /^ssl.gstatic.com+$/];

/** 预缓存资源列表 */
const cacheList = ["/insert-head.js", "/insert-body.js", "/favicon.ico"];

/** 获取缓存 */
function openCache() {
  return caches.open(cacheStorageKey);
}
/**
 * 通过查找Cache来返回缓存的响应
 * @param {Request} request 原始请求
 * @returns {Promise<Response>}
 */
async function matchResponseByCache(request) {
  const cache = await openCache();
  const cachedResponse = await cache.match(request.url);
  //有缓存直接使用缓存
  if (cachedResponse) return cachedResponse;
  return false;
}
/**
 * 通过匹配Host来返回自定义响应。可以用于屏蔽请求。
 * @param {Request} request 原始请求
 * @returns {Response}
 */
function matchResponseByHost(request) {
  const url = new URL(request.url);
  const [, fn] = Object.entries(responseMapOfHost).find(([key]) => url.host.endsWith(key)) || [];
  if (fn) return fn(url);
  return false;
}
/**
 * 通过匹配请求Path来返回自定义响应，也是可以（但不限于）用来屏蔽请求
 * @param {Request} request 原始请求
 * @returns {Response}
 */
function matchResponseByPath(request) {
  const url = new URL(request.url);
  const [, fn] = Object.entries(responseMapOfPath).find(([key]) => url.pathname == key) || [];
  if (fn) return fn(url);
  return false;
}
/**
 * 构建代理请求
 * @param {Request} request 原始请求
 * @returns {Request}
 */
function buildProxiedRequest(request) {
  const url = new URL(request.url);
  if (proxyAllowedWhiteList.some((regex) => regex.test(url.host))) {
    return modifyRequestURL(request, `//${currentHost}/proxy?url=${encodeURIComponent(url.href)}`);
  }
  return request;
}
/**
 * 通过匹配请求Host来修改请求（返回新请求）目前的功能只有替换Host。
 * @param {Request} request 原始请求
 * @returns {Request}
 */
function modifyRequestByHost(request) {
  const url = new URL(request.url);
  if (url.host == currentHost) return request;
  const [searchValue, replaceTo] = Object.entries(replaceMapOfHost).find(([key]) => url.host.endsWith(key)) || [];
  if (replaceTo) {
    const modified = modifyURL(request.url, { host: url.host.replace(searchValue, replaceTo) });
    return modifyRequestURL(request, modified.href);
  }
  console.log("Not matched host:", url.host);
  return request;
}
/**
 * 通过匹配请求Path来修改请求（返回新请求）（暂时没啥用途所以先空着）
 * @param {Request} request 原始请求
 * @returns {Request}
 */
function modifyRequestByPath(request) {
  return request;
}
/**
 * 修改响应。可以根据特定的条件（host、pathname等），修改原始响应。比如向js代码中插入、修改自定义js代码。（暂时先空着）
 * @param {Response} response 原始响应
 * @returns {Response}
 */
function modifyResponse(response) {
  return response;
}
/**
 * 发出请求。
 * @param {Request} request 原始请求。
 * @returns {Promise<Response>}
 */
async function doFetch(request) {
  try {
    return await fetch(request);
  } catch (e) {
    const body = JSON.stringify({ title: "发出请求时出现了错误", host: request.url, error: `${e.name}: ${e.message}`, errorMessage: `<pre>${e.stack}</pre>` });
    return buildResponse(500, { "content-type": "application/json;charset=UTF-8" }, body);
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
  openCache().then((cache) => cache.addAll(cacheList));
});
self.addEventListener("activate", () => {
  clients.claim();
});
self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      const request = event.request;
      // 先查找缓存中有无匹配的缓存
      const matchedCache = await matchResponseByCache(request);
      if (matchedCache) return matchedCache;
      // 再通过Host查找匹配的自定义响应
      const matchedHost = matchResponseByHost(request);
      if (matchedHost) return matchedHost;
      // 再通过pathname查找匹配的自定义响应
      const matchedPath = matchResponseByPath(request);
      if (matchedPath) return matchedPath;
      // 尝试通过Host修改请求
      const proxiedRequest = buildProxiedRequest(request);
      // 尝试通过Host修改请求
      const reqModifiedByHost = modifyRequestByHost(proxiedRequest);
      // 尝试通过pathname修改请求
      const reqModifiedByPath = modifyRequestByPath(reqModifiedByHost);
      // 发出请求，获得原始响应
      const rawResponse = await doFetch(reqModifiedByPath);
      // 最终响应
      const finalResponse = modifyResponse(rawResponse);
      return finalResponse;
    })()
  );
});