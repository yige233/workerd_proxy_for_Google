/** 最终外部访问的域名 */
const outerDomain = "search.example.com";

/** 反代目标网站 */
const upstreamDomain = "www.google.com.hk";

/** 访问区域黑名单。如果不额外套cf的cdn，大概率是没有用的。 */
const blockedRegion = ["TK"];

/** 资源重定向Map */
const replaceMap = {
  $upstream: "$custom_domain",
  "www.google.com/": `${outerDomain}/`,
  "gstatic.com": "gstatic.cn",
  "ajax.googleapis.com": "ajax.lug.ustc.edu.cn",
  "fonts.googleapis.com": "fonts.googleapis.cn",
  "themes.googleusercontent.com": "google-themes.lug.ustc.edu.cn",
  "www.gravatar.com/avatar": "dn-qiniu-avatar.qbox.me/avatar",
  "www.google.co.jp": "$custom_domain",
  "www.google.com.hk": "$custom_domain",
  "www.google.com.sg": "$custom_domain",
  "books.google.co.jp": "$custom_domain",
  "books.google.com.hk": "$custom_domain",
  "maps.google.com.hk": "$custom_domain",
  "maps.google.co.jp": "$custom_domain",
  "maps.google.com": "$custom_domain",
  "books.google.com": "$custom_domain",
};

/** 浏览器打开无痕模式访问Google，调好设置后把cookie复制过来。有了这个，镜像站就能显示为深色模式了（！！！） */
const cookies = ``;

/** 可以在Google主页插入一段js代码 */
const inscertScript = `
class Notify {
  alert(title, ...body) {
    return alert([title, ...body].join("\\n"));
  }
  notify(title, ...body) {
    const noti = new Notification(title, { body: body.join("\\n") });
    noti.addEventListener("click", () => noti.close());
    setTimeout(() => noti.close(), 1e4);
    return noti;
  }
  constructor(title, ...body) {
    if (!("Notification" in window)) {
      return this.alert(title, ...body);
    }
    if (Notification.permission === "granted") {
      return this.notify(title, ...body);
    }
    if (Notification.permission === "denied") {
      return this.alert(title, ...body);
    }
    if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          return this.notify(title, ...body);
        }
        console.warn("用户拒绝授予通知弹窗权限");
        return this.alert(title, ...body);
      });
    }
  }
}
if (document.title=="Google") {
  function firstClick() {
    new Notify("这是一个谷歌镜像站");
    document.removeEventListener("click", firstClick);
   }
  document.addEventListener("click", firstClick);
}
 `;

//替换html中的一些东西
function modifyResponseText(text, upstreamDomain, hostName) {
  for (let value in replaceMap) {
    let key = replaceMap[value];
    if (value == "$upstream") {
      value = upstreamDomain;
    }
    if (value == "$custom_domain") {
      value = hostName;
    }
    if (key == "$upstream") {
      key = upstreamDomain;
    }
    if (key == "$custom_domain") {
      key = hostName;
    }
    text = text.replace(new RegExp(value, "g"), key);
  }
  return text;
}
//主要处理函数。删除了判断https的部分，交给反向代理来处理。也删除了判断是否是图片搜索的部分。
async function fetchAndApply(request) {
  let parsedUrl;
  try {
    parsedUrl = new URL(request.url);
  } catch (e) {
    return new Response(`Invalid URL: ${request.url}`, { status: 400 });
  }
  /** 原始请求头 */
  const reqHeaders = request.headers,
    /** 若是通过cloudflare的cdn，获取请求区域ID */
    region = reqHeaders.get("cf-ipcountry") || "",
    /** 从原始请求头复制的新请求头对象 */
    newReqHeaders = new MyHeaders(reqHeaders),
    /** 需要添加的请求头 */
    headersAddToNewReq = {
      host: upstreamDomain,
      cookie: cookies,
      "accept-encoding": "gzip, deflate",
    },
    /** 需要添加的响应头 */
    headersAddToRes = {
      "cache-control": "public, max-age=14400",
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
    },
    /** 需要移除的响应头 */
    headersRemoveFromRes = ["content-security-policy", "content-security-policy-report-only", "clear-site-data"];

  if (blockedRegion.includes(region.toUpperCase())) {
    return new Response("Access denied: WorkersProxy is not available in your region yet.", {
      status: 403,
    });
  }
  /**
   * 这里进行了workerd适应性改造，要修改url的host、protocol、port三项。因为反向代理是以http协议、内网host和非443端口访问服务的。
   */
  parsedUrl.protocol = "https:";
  parsedUrl.port = 443;
  parsedUrl.host = upstreamDomain;
  newReqHeaders.setMultiple(headersAddToNewReq);
  newReqHeaders.set("referer", parsedUrl.href);
  try {
    let requestBody = null;
    const response = await fetch(parsedUrl.href, {
      method: request.method,
      headers: newReqHeaders,
    });
    const status = response.status,
      newResponseHeaders = new MyHeaders(response.headers),
      contentType = newResponseHeaders.get("content-type");

    newResponseHeaders.setMultiple(headersAddToRes);
    newResponseHeaders.deleteMultiple(...headersRemoveFromRes);

    if (contentType.includes("text/html") && contentType.includes("UTF-8")) {
      const originBody = await response.text();
      requestBody = modifyResponseText(originBody, upstreamDomain, outerDomain); //这里替换函数的第三个参数也要改成outerDomain
      requestBody = requestBody.replace("</body>", `</body><script>${inscertScript}</script>`);
    } else {
      requestBody = response.body;
    }
    return new Response(status >= 204 && status < 300 ? null : requestBody, {
      status,
      headers: newResponseHeaders,
    });
  } catch (e) {
    return new Response(`Worker 罢工了：${e.message || e.toString()}`, {
      status: 500,
    });
  }
}

class MyHeaders extends Headers {
  constructor(headers) {
    super(headers);
  }
  getFlattened() {
    const result = {};
    super.forEach((v, k) => (result[k] = v));
    return result;
  }
  deleteMultiple(...headerNames) {
    for (const headerName of headerNames) {
      if (typeof headerName !== "string" || !super.has(headerName)) continue;
      this.delete(headerName);
    }
  }
  setMultiple(headers = {}) {
    for (const key in headers) {
      const val = headers[key];
      if (typeof key !== "string" || typeof val !== "string") continue;
      this.set(key, val);
    }
  }
}

addEventListener("fetch", (event) => {
  event.respondWith(fetchAndApply(event.request));
});
