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
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(`//${currentHost}/sw.js`, { type: "module" })
    .then((registration) => {
      console.log("Service Worker注册成功:", registration.scope);
    })
    .catch((error) => {
      console.error("Service Worker注册失败:", error);
    });
}