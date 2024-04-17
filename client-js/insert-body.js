class Notify {
  alert(title, ...body) {
    return alert([title, ...body].join("\n"));
  }
  notify(title, ...body) {
    const noti = new Notification(title, { body: body.join("\n") });
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
if (document.title == "Google") {
  function firstClick() {
    const notify = new Notify("这是一个谷歌镜像站", "https://github.com/yige233/workerd_proxy_for_Google");
    if (notify.addEventListener) {
      notify.addEventListener("click", () => window.open("https://github.com/yige233/workerd_proxy_for_Google"));
    }
    document.removeEventListener("click", firstClick);
  }
  document.addEventListener("click", firstClick);
}