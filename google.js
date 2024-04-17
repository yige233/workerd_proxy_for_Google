//将代码改造为针对自托管workerd。因为一般会套反向代理

/** 最终外部访问的域名 */
const outerDomain = "search.example.com";

//都自建谷歌镜像了，服务器的ip肯定没有被谷歌屏蔽，不需要特意用ipv6，因此也不需要应对图片搜索
/** 反代目标网站 */
const upstreamDomain = "www.google.com.hk";

/** 访问区域黑名单。如果不额外套cf的cdn，大概率是没有用的。 */
const blockedRegion = ["TK"];

/** 浏览器打开无痕模式访问Google，调好设置后把cookie复制过来。可以让镜像站始终使用自定义好的设置（比如深色模式） */
const cookies = ``;

/** 字符串替换的Map */
const strReplaceMap = {
  [upstreamDomain]: outerDomain,
  "www.google.com/": `${outerDomain}/`,
  "gstatic.com": "gstatic.cn",
  "ajax.googleapis.com": "ajax.lug.ustc.edu.cn",
  "fonts.googleapis.com": "fonts.googleapis.cn",
  "themes.googleusercontent.com": "google-themes.lug.ustc.edu.cn",
  "www.gravatar.com/avatar": "dn-qiniu-avatar.qbox.me/avatar",
  "www.google.co.jp": outerDomain,
  "www.google.com.hk": outerDomain,
  "www.google.com.sg": outerDomain,
  "books.google.co.jp": outerDomain,
  "books.google.com.hk": outerDomain,
  "maps.google.com.hk": outerDomain,
  "maps.google.co.jp": outerDomain,
  "maps.google.com": outerDomain,
  "books.google.com": outerDomain,
  /** 插入自定义代码以及注册service worker的代码 */
  "<head>": `<head><script src="https://${outerDomain}/insertJS-head"></script>
  <script>
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((registration) => {
          console.log("Service Worker注册成功:", registration.scope);
        })
        .catch((error) => {
          console.error("Service Worker注册失败:", error);
        });
    });
  }
  </script>`,
  /** 插入自定义代码，但加载顺序最靠后 */
  "</body>": `<script src="https://${outerDomain}/insertJS-body"></script></body>`,
};

/** 对特定url的自定义响应 */
const customResponseMap = new Map([
  /** service worker代码 */
  ["sw.js", (env) => fetchFile(env, "sw.js")],
  /** 站点无法连接时，使用的错误页面模板 */
  ["error-page-template", (env) => fetchFile(env, "error-template.html")],
  ["insertJS-head", (env) => fetchFile(env, "insert-head.js")],
  ["insertJS-body", (env) => fetchFile(env, "insert-body.js")],
]);

/** 从本地获取js */
async function fetchFile(context, filename) {
  const TYPES = {
    js: "text/javascript;charset=utf-8",
    html: "text/html;charset=utf-8",
  };
  const fileType = TYPES[filename.split(".").pop().toLowerCase()];
  const parseMethod = fileType.startsWith("text") ? "text" : "blob";
  const response = await context.fetch(`http://dummy/${filename}`);
  return new Response(await response[parseMethod](), {
    status: 200,
    headers: {
      "content-type": fileType,
    },
  });
}

/**
 * 替换上游响应体中的目标字符
 * @param {*} respsonseText 响应体
 * @returns
 */
function modifyResponseText(respsonseText, strReplaceMap) {
  for (const key in strReplaceMap) {
    const value = strReplaceMap[key];
    respsonseText = respsonseText.replace(new RegExp(key, "g"), value);
  }
  return respsonseText;
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

//这里采用了es module的写法。相较于注册fetch事件监听器的方法，最大的一个点就是console.log有输出了（）
export default {
  //主要处理函数。删除了判断https的部分，交给反向代理来处理。也删除了判断是否是图片搜索的部分。
  async fetch(request, env) {
    /** URL对象 */
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url);
    } catch (e) {
      return new Response(`Invalid URL: ${request.url}`, { status: 400 });
    }
    //如果符合自定义响应规则，就使用自定义响应
    const customResponse =
      customResponseMap.get(parsedUrl.pathname.slice(1)) || undefined;
    if (customResponse) {
      return customResponse(env.files, parsedUrl);
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
      headersRemoveFromRes = [
        "content-security-policy",
        "content-security-policy-report-only",
        "clear-site-data",
      ];

    if (blockedRegion.includes(region.toUpperCase())) {
      return new Response(
        "Access denied: WorkersProxy is not available in your region yet.",
        {
          status: 403,
        }
      );
    }
    /**
     * 这里进行了workerd适应性改造，要修改url的host、protocol、port三项。
     * 因为反向代理是以http协议、内网host和非443端口访问服务的。
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
        //为html内容进行字符替换
        const originBody = await response.text();
        requestBody = modifyResponseText(originBody, strReplaceMap);
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
  },
};
