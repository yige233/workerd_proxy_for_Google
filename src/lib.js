/** 组合函数 */
export function composeAsync(...fns) {
  return (value) => fns.reverse().reduce(async (result, fn) => fn(await result), value);
}

/** 组合函数 */
export function compose(...fns) {
  return (value) => fns.reverse().reduce((result, fn) => fn(result), value);
}

/** 柯里化函数 */
export function curry(fn, ...arg) {
  if (fn.length <= arg.length) {
    return fn(...arg);
  }
  return (...params) => curry(fn, ...arg, ...params);
}

/**
 * 从本地获取文件。
 * @param {Context} context fetch执行的上下文
 * @param {string} namespace 文件的命名空间。为了共享文件，所有capnp配置都应拥有一个共同的根目录，然后再通过命名空间来区别具体使用的子目录。
 * @param {string} filepath 文件的路径（不包含命名空间）
 * @returns
 */
export async function fetchLocal(context, namespace, filepath) {
  const TYPES = {
    json: "application/json;charset=utf-8",
    js: "text/javascript;charset=utf-8",
    html: "text/html;charset=utf-8",
    txt: "text/plain;charset=utf-8",
    ttf: "font/ttf",
    svg: "image/svg+xml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    png: "image/png",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
  };
  const fileExt = (filepath || "").match(/(?<=\.).+$/)?.[0] || undefined;
  if (!fileExt) return false;
  const mimeType = TYPES[fileExt.toLowerCase()] || "application/octet-stream";
  const response = await context.fetch(`http://dummy/${namespace}/${filepath}`);
  if (response.ok) {
    return new Response(await response.body, {
      status: 200,
      headers: { "content-type": mimeType },
    });
  }
  return false;
}
/**
 * 拷贝响应头。
 * @param {Headers} original 原始响应头
 * @param {Object} adds 需要添加的响应头
 * @param {Array} removes 需要删除的响应头
 */
export const copyHeader = curry((original, adds, removes) => {
  const copiedHeader = new Headers(original);
  removes.map((key) => copiedHeader.delete(key));
  Object.entries(adds).map((pair) => pair[1] && copiedHeader.set(pair[0], pair[1]));
  return copiedHeader;
});

/**
 * 修改url
 * @param {String} url 需要修改的url字符串
 * @param {Object} modifiers 要修改的参数和新的值
 * @returns
 */
export function modifyURL(url, modifiers) {
  const urlObj = new URL(url);
  Object.entries(modifiers).map((pair) => (urlObj[pair[0]] = pair[1]));
  return urlObj;
}
/**
 * 发出请求。
 * @param {Request} request Request对象
 * @returns {Response}
 */
export async function makeWebRequest(request) {
  try {
    return await fetch(request);
  } catch (e) {
    return e;
  }
}

/**
 * 构建Response对象
 * @param {Number} status  响应状态码
 * @param {Object} headers 响应头
 * @param {any} body 响应体
 * @returns {Response}
 */
export function buildResponse(status, headers, body) {
  return new Response(status >= 204 && status < 300 ? null : body, { status, headers });
}
