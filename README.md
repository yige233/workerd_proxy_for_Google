# reverse proxy for Google, based on self-hosted workerd

一种基于 workerd 的自建谷歌镜像的方案。改造自[workers_proxy_for_Google](https://github.com/RaySibay/workers_proxy_for_Google)。

原项目是部署到 cloudflare workers 上的，而本项目是部署到本地的 workerd 上的，所以要针对本地环境进行调整。

## 优势

- 自建相对于 cloudflare workers、vercel、heroku 等，最大的优势就是完全可控。
  - 谷歌屏蔽了 cf 的 cdn，镜像站会跳验证码。这个是最烦的，基本上会导致镜像站没法正常使用。
  - FaaS 提供方会主动去 ban 这些反代服务，甚至封号。
  - 调用量限制。虽然说他们一般都给的很大方，用不完。
- 配置也比较简单，反代服务的逻辑全在`google.js`里，对外就是一个普通 http 服务，要套 cdn、叠代理服务器什么的，也不用特别注意什么东西。

希望上面说的不要太打脸（

## 部署

- 去[workerd 的 Release 页面](https://github.com/cloudflare/workerd/releases)下载符合自己服务器环境的二进制文件。
- 下载这个仓库。
- 修改`main.capnp`，主要是要修改服务要监听的地址和端口。下面的示例基本就是照搬了 workerd 的 helloworld
  - 如果需要裸奔的话，把 `localhost` 换成`*`或者要裸奔的外部 IP 地址

```capnp
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "google-mirror", worker = .mainWorker),
  ],

  sockets = [
    # 这里填写服务要监听的地址和端口
    ( name = "http",
      address = "localhost:8080",
      http = (),
      service = "google-mirror"
    ),
  ]
);

const mainWorker :Workerd.Worker = (
  serviceWorkerScript = embed "google.js",
  compatibilityDate = "2024-03-25",
);
```

- 修改 `google.js`：
  - 把`search.example.com`换成自己最终在外部环境访问时的域名（或者 ip+端口）。
  - 有个`inscertScript`，可以用它在网页中插入 js 代码。
  - 懂点 js 的话，完全可以把它大改特改。

```javascript
/** 最终外部访问的域名 */
const outerDomain = "search.example.com";

/** 反代目标网站 */
const upstreamDomain = "www.google.com.hk";

/** 访问区域黑名单。如果不额外套cf的cdn，大概率是没有用的。 */
const blockedRegion = ["TK"];

/** 可以在Google主页插入一段js代码 */
const inscertScript = ``;
```

- 修改完之后，执行：`./workerd serve main.capnp`。然后就可以打开之前填写的地址和端口，进行一个访问了

## 其他

可以用指令:`./workerd compile main.capnp > workerd-google-proxy`，把代码打包成一个可执行文件，然后就可以通过直接运行`./workerd-google-proxy`来启动服务了。

直接跑 workerd，调试代码比较不方便。有一个基于 wokerd 的项目：[vorker](https://github.com/VaalaCat/vorker)，它有一个 webui，调试代码会比更加方便，有时间可以去试试这个
