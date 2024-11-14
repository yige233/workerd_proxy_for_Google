import { compose, modifyURL, modifyRequestURL, buildResponse } from "/lib.js";

const cacheStorageKey = "cache-v1";
const currentHost = self.location.host;

/** 该列表用于通过匹配请求Host，修改请求的host。通过endsWith()匹配，因此更精确的匹配应该在更靠前的位置。 */
const replaceMapOfHost = {
  "www.google.com.hk": currentHost,
  "www.google.com": currentHost,
  "gstatic.com": "gstatic.cn",
  "ajax.googleapis.com": "ajax.lug.ustc.edu.cn",
  "fonts.googleapis.com": "fonts.googleapis.cn",
  "themes.googleusercontent.com": "google-themes.lug.ustc.edu.cn",
  "www.gravatar.com": "dn-qiniu-avatar.qbox.me",
  "www.google.co.jp": currentHost,
  "www.google.com.hk": currentHost,
  "www.google.com.sg": currentHost,
  "books.google.co.jp": currentHost,
  "books.google.com.hk": currentHost,
  "maps.google.com.hk": currentHost,
  "maps.google.co.jp": currentHost,
  "maps.google.com": currentHost,
  "books.google.com": currentHost,
};

/** 该列表用于通过匹配请求Host，返回自定义响应。通过endsWith()匹配，因此更精确的匹配应该在更靠前的位置。 */
const responseMapOfHost = {
  "play.google.com": () => buildResponse(204),
  "apis.google.com": () => buildResponse(204),
  "id.google.com.hk": () => buildResponse(204),
  "ogads-pa.googleapis.com": () => buildResponse(204),
  "www.googleadservices.com": () => buildResponse(204),
};

/** 该列表用于通过匹配请求pathname，返回自定义响应。要求完整匹配。 */
const responseMapOfPath = {
  /** 点击搜索结果时，直接跳转对应url，而不是请求服务端进行跳转 */
  "/url": (url) => {
    const redirectURL = url.searchParams.get("url");
    if (redirectURL) {
      return Response.redirect(redirectURL);
    }
    return Response.redirect(url.href);
  },
  "/log": () => buildResponse(204),
  "/gen_204": () => buildResponse(204),
  "/_/LensWebStandaloneUi/gen204/": () => buildResponse(204),
  "/client_204": () => buildResponse(204),
  "/cdn-cgi/rum": () => buildResponse(204),
  "/async/vpkg": () => buildResponse(404),
};

/** 跨域请求的域名白名单。程序允许客户端通过url参数或者特殊请求头提供该请求的真实url。正则表达式会测试提供的url的host */
const proxyAllowedWhiteList = [/^encrypted-v{0,1}tbn[0-9]+.gstatic.com+$/, /^i.ytimg.com+$/, /^www.youtube.com+$/, /^lens.google.com+$/];

/** 预缓存资源列表 */
const cacheList = [
  "/insert-head.js",
  "/insert-body.js",
  "/error-template.html",
  "/images/errors/robot.png",
  "/images/branding/googlelogo/1x/googlelogo_color_150x54dp.png",
  "/images/branding/googlelogo/2x/googlelogo_color_150x54dp.png",
  "/favicon.ico",
];

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
 * @returns {Promise<Request>}
 */
async function buildProxiedRequest(request) {
  const url = new URL(request.url);
  if (proxyAllowedWhiteList.some((regex) => regex.test(url.host))) {
    return await modifyRequestURL(request, `//${currentHost}/proxy?url=${encodeURIComponent(url.href)}`);
  }
  return request;
}
/**
 * 通过匹配请求Host来修改请求（返回新请求）目前的功能只有替换Host。
 * @param {Request} request 原始请求
 * @returns {Promise<Request>}
 */
async function modifyRequestByHost(request) {
  const url = new URL(request.url);
  if (url.host == currentHost) return request;
  const [searchValue, replaceTo] = Object.entries(replaceMapOfHost).find(([key]) => url.host.endsWith(key)) || [];
  if (replaceTo) {
    const modified = modifyURL(request.url, { host: url.host.replace(searchValue, replaceTo) });
    return await modifyRequestURL(request, modified.href);
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
 * 填充模板。
 * @param {Object} values 要填充的值
 * @returns
 */
function fillTemplate(values) {
  const replcaeFns = Object.entries(values).map(
    ([key, val]) =>
      (str) =>
        str.replace(new RegExp("\\${" + key + "}", "g"), val)
  );
  return compose(...replcaeFns);
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
    const body = JSON.stringify({ title: "发出请求时出现了错误", url: request.url, stack: e.stack });
    return buildResponse(500, { "content-type": "application/json;charset=UTF-8" }, body);
  }
}
/**
 * 构建错误页面。
 * @param {Request} request 原始请求
 * @param {Response} response 原始响应
 * @returns {Promise<Response>}
 */
async function buildHTMLPage(request, response) {
  const { status, statusText, type, ok } = response;
  // 以下情况，不构建html错误页面：请求模式不是navigate；响应状态ok；是透明请求
  if (request.mode !== "navigate" || ok || ["opaque", "opaqueredirect"].includes(type)) return response;
  const cache = await openCache();
  const pageTemplate = await cache.match("/error-template.html");
  const errorBody = await response.json().catch(() => ({}));
  const replace = fillTemplate({
    status,
    title: "无法连接到镜像站点" + (errorBody.title ? `：${errorBody.title}` : ""),
    host: errorBody.url ?? request.url,
    error: `${status} ${statusText || ""}`,
    errorMessage: `<a href='https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status/${status}'>关于此错误代码</a><pre>${errorBody.stack ?? ""}</pre>`,
  });
  const result = buildResponse(status || 500, { "content-type": "text/html;charset=UTF-8" }, replace(await pageTemplate.text()));
  return result;
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
      const proxiedRequest = await buildProxiedRequest(request);
      // 尝试通过Host修改请求
      const reqModifiedByHost = await modifyRequestByHost(proxiedRequest);
      // 尝试通过pathname修改请求
      const reqModifiedByPath = modifyRequestByPath(reqModifiedByHost);
      // 发出请求，获得原始响应
      const rawResponse = await doFetch(reqModifiedByPath);
      // 尝试将响应修改为错误页面
      const resOfErrorPage = await buildHTMLPage(request, rawResponse);
      // 最终响应
      const finalResponse = modifyResponse(resOfErrorPage);
      return finalResponse;
    })()
  );
});
