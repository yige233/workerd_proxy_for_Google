const currentHost = window.location.host;

console.log("这是一个谷歌翻译镜像站");

function proxiedURL(original) {
  if (!original) {
    return "";
  }
  return `${window.location.origin}/proxy?url=${encodeURIComponent(original)}`;
}

Object.defineProperty(HTMLIFrameElement.prototype, "src", {
  get: function () {
    return this._src || this.getAttribute("src");
  },
  set: function (value) {
    this._src = value;
    this.setAttribute("src", proxiedURL(value));
  },
});
Object.defineProperty(HTMLFormElement.prototype, "action", {
  get: function () {
    return this._action || this.getAttribute("action");
  },
  set: function (value) {
    this._action = value;
    this.setAttribute("action", proxiedURL(value));
  },
});

(async () => {
  if ("serviceWorker" in navigator) {
    const registerSW = () => navigator.serviceWorker.register(`//${currentHost}/sw.js`, { type: "module" });
    try {
      // 先执行常规的注册
      const registration = await registerSW();
      // 如果注册完了，但是不能获取到controller，说明页面并没有被sw控制，注销掉原来的sw，重新注册
      // 移动端可能会出现已注册的sw启动不了的情况，就需要重新注册来使其启动
      if (!navigator.serviceWorker.controller) {
        await registration.unregister();
        registerSW();
      }
      console.log("Service Worker注册成功(了吗？)");
    } catch {
      console.log("Service Worker注册失败");
    }
  }
})();
