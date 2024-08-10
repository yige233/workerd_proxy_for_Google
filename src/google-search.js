import { compose, copyHeader, modifyURL, fetchLocal, makeWebRequest, buildResponse } from "library";

/** 最终外部访问的域名。在将替换url的工作交给客户端sw后，这个甚至不需要了 */
const outerDomain = "search.example.com";

/** 反代目标网站 */
const upstreamDomain = "www.google.com.hk";

/** 浏览器打开无痕模式访问Google，调好设置后把cookie复制过来。可以让镜像站始终使用自定义好的设置（比如深色模式） */
const cookies = ``;

/** 访问区域黑名单。如果不额外套cf的cdn，大概率是没有用的。 */
const blockedRegion = ["TK"];

/** 跨域请求的域名白名单。程序允许客户端通过url参数或者特殊请求头提供该请求的真实url。正则表达式会测试提供的url的host */
const proxyAllowedWhiteList = [/^encrypted-v{0,1}tbn[0-9]+.gstatic.com+$/, /^.*.google.com.hk+$/, /^i.ytimg.com+$/, /^www.youtube.com+$/, /^lens.google.com+$/];

/** 为响应体进行字符串替换的Map */
const strReplaceMap = {
  /** 插入自定义代码以及注册service worker的代码 */
  "<head>": `<head><script src="//${outerDomain}/insert-head.js"></script>`,
  /** 插入自定义代码，但加载顺序最靠后 */
  "</body>": `<script src="//${outerDomain}/insert-body.js"></script></body>`,
  /** 针对谷歌图片搜索，屏蔽这个发不出去的请求 */
  [`<iframe src="/gen204" style="display:none;" alt=""></iframe>`]: "",
};
/** 替换上游响应体中的特定字符 */
function modifyResponseText(respsonseText) {
  const replcaeFns = Object.entries(strReplaceMap).map(
    ([key, val]) =>
      (str) =>
        str.replace(new RegExp(key, "g"), val)
  );
  return compose(...replcaeFns)(respsonseText);
}
/**
 * 通过匹配请求url pathname，来返回自定义响应。
 * @param {URL} url 请求的URL对象
 * @returns {Response}
 */
function findCustomResponseByPath(url) {
  const pathname = url.pathname;
  /** 需要匹配的完整的pathname，和其对应的自定义响应 */
  const customResponse = {
    "/maps/preview/sw": () => buildResponse(204),
  };
  if (pathname in customResponse) {
    return customResponse[pathname]();
  }
  return false;
}
/**
 * 构建web请求。也在这里修改请求URL和请求头。
 * @param {Request} request 原始请求
 * @param {string} realURL 真实URL。若提供了该参数，构建的请求将直接使用该参数作为url。
 * @returns {Request}
 */
function buildWebRequest(request, realURL) {
  const resultURL = realURL ? new URL(realURL) : modifyURL(request.url, { protocol: "https:", port: 443, host: upstreamDomain });
  const newReqHeaders = copyHeader(request.headers, { host: upstreamDomain, cookie: resultURL.host == upstreamDomain && cookies, referer: resultURL.href, "accept-encoding": "gzip, deflate" }, []);
  return new Request(resultURL.href, { method: request.method, headers: newReqHeaders, body: request.body });
}

/**
 * 判断原始请求是否源于禁止访问的区域。
 * @param {Request} request 原始请求
 * @returns {Boolean}
 */
function isFromBlockedRegion(request) {
  /** 若是通过cloudflare的cdn，获取请求区域ID */
  const region = request.headers.get("cf-ipcountry");
  return blockedRegion.includes(region);
}
/**
 * 判断是否需要修改原始响应的响应体。
 * @param {Headers} headers 原始响应头
 * @returns {Boolean}
 */
function isModifyResBodyRequired(headers) {
  const contentType = headers?.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("text/html") && contentType.includes("utf-8");
}

/**
 * 修改响应头。
 * @param {Headers} header 原始响应头
 * @returns {Headers}
 */
function modifyResponseHeader(header) {
  const headerstoAdd = { "cache-control": "public, max-age=14400", "access-control-allow-origin": "*", "access-control-allow-credentials": "true" };
  /** 要移除的响应头。如果不移除“set-cookie”，说不定可以支持cookie相关的功能 */
  const headerstoRemove = ["content-security-policy", "content-security-policy-report-only", "clear-site-data", "set-cookie"];
  return copyHeader(header, headerstoAdd, headerstoRemove);
}

/**
 * 从原始请求中查找真实url。通过检测的条件为：请求路径为/proxy且查询字符串中有url参数；请求头中有x-real-url
 * @param {Request} request 原始请求
 * @returns {String} URL字符串
 */
function findRealURL(request) {
  const urlObj = new URL(request.url);
  const resultInQueryString = urlObj.searchParams.get("url");
  const resultInHeader = request.headers.get("x-real-url");
  return urlObj.pathname == "/proxy" && resultInQueryString ? resultInQueryString : resultInHeader ? resultInHeader : undefined;
}
/**
 * 判断提供的真实url是否位于白名单内。
 * @param {String} urlString 真实url字符串
 * @returns {Boolean}
 */
function isRealURLinWhiteList(urlString) {
  try {
    const url = new URL(urlString);
    return proxyAllowedWhiteList.some((regex) => regex.test(url.host));
  } catch {
    return false;
  }
}

// 这里采用了es module的写法。相较于注册fetch事件监听器的方法，最大的一个点就是console.log有输出了（）
export default {
  async fetch(request, env) {
    /** 访问本地文件 */
    const findLocalFileByPath = (pathname) => fetchLocal(env.files, "google-search", pathname.slice(1));
    /** 这个访问本地文件的参数绑定了命名空间“libs”，因此它从 public/libs/ 下寻找文件 */
    const findLibFileByPath = (pathname) => fetchLocal(env.files, "libs", pathname.slice(1));
    // 先判断请求是否源于禁止访问的区域
    if (isFromBlockedRegion(request)) {
      return buildResponse(403, {}, "Access denied: WorkersProxy is not available in your region yet.");
    }
    const requestURL = new URL(request.url);
    // 尝试查找自定义响应
    const customResponse = findCustomResponseByPath(requestURL);
    if (customResponse instanceof Response) {
      return customResponse;
    }
    // 尝试访问本地文件
    const localFileResponse = await findLocalFileByPath(requestURL.pathname);
    if (localFileResponse instanceof Response) {
      return localFileResponse;
    }
    // 尝试访问libs下的文件
    const libFileResponse = await findLibFileByPath(requestURL.pathname);
    if (libFileResponse instanceof Response) {
      return libFileResponse;
    }
    // 尝试获取真实url
    const realURL = findRealURL(request);
    const realURLinWhiteList = isRealURLinWhiteList(realURL);
    if (realURL && !realURLinWhiteList) {
      return buildResponse(403, {}, "Access denied: The server refused to handle the request.");
    }
    // 构建新的请求
    const newRequest = buildWebRequest(request, realURL && realURLinWhiteList ? realURL : undefined);
    // 发送请求
    const rawResponse = await makeWebRequest(newRequest);
    if (!rawResponse instanceof Response) {
      return buildResponse(500, {}, "Error: " + rawResponse.message || "interal error.");
    }
    // 判断是否需要修改响应体
    const finalResponseBody = isModifyResBodyRequired(rawResponse.headers) ? modifyResponseText(await rawResponse.text()) : rawResponse.body;
    // 修改响应头
    const finalResponseHeader = modifyResponseHeader(rawResponse.headers);
    // 构建并返回最终响应
    return buildResponse(rawResponse.status, finalResponseHeader, finalResponseBody);
  },
};
