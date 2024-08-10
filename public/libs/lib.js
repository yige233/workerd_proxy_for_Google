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

export function modifyURL(url, modifiers) {
  const urlObj = new URL(url);
  Object.entries(modifiers).map((pair) => (urlObj[pair[0]] = pair[1]));
  return urlObj;
}

export function buildResponse(status, headers, body) {
  return new Response(status >= 204 && status < 300 ? null : body, { status, headers });
}

/**
 * 修改原始请求的url。
 * @param {Request} request 原始请求
 * @param {string} url 新的请求url
 * @returns
 */
export async function modifyRequestURL(request, url) {
  try {
    // 在客户端sw修改原始请求并不容易，因为Request对象设计上是不可变的。所以这里采用构造新请求，并将原始请求的其他属性复制过去的方式。
    const body = await request.clone().blob();
    const init = {
      duplex: "half",
      credentials: request.credentials,
      headers: request.headers,
      method: request.method,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      mode: request.mode,
      keepalive: false,
      body: body.size ? body : undefined,
    };
    return new Request(url, init);
  } catch (e) {
    // 然而即使是这样也可能会出错
    console.error("构造新请求失败: ", e);
  }
  return request;
}
