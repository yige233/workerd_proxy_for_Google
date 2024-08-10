# reverse proxy for Google, based on self-hosted workerd

一种基于 workerd 的自建谷歌搜索镜像的方案。改造自[workers_proxy_for_Google](https://github.com/RaySibay/workers_proxy_for_Google)。

原项目是部署到 cloudflare workers 上的，而本项目是部署到本地的 workerd 上的，所以要针对本地环境进行调整。

现在也可以部署谷歌翻译镜像了，是纯正的谷歌翻译网页。虽然说还没有解决不能翻译图片和文档的问题。

得益于[下文](#处理多个域名)提及的方法，实现了一部分谷歌图片搜索的功能。

## 优势

- 自建相对于 cloudflare workers、vercel、heroku 等，最大的优势就是完全可控。
  - 谷歌屏蔽了 cf 的 cdn，镜像站会跳验证码。这个是最烦的，基本上会导致镜像站没法正常使用。
  - FaaS 提供方会主动去 ban 这些反代服务，甚至封号。
  - 调用量限制。虽然说他们一般都给的很大方，用不完。
- 对外就是一个普通 http 服务，要套 cdn、叠代理服务器什么的，也不用特别注意什么东西。

希望上面说的不要太打脸（

## 部署

- 去[workerd 的 Release 页面](https://github.com/cloudflare/workerd/releases)下载符合自己服务器环境的二进制文件。
- 下载这个仓库。
- 修改`services/google-search.capnp`，主要是要修改服务要监听的地址和端口。
  - 如果需要裸奔的话，把 `localhost` 换成`*`或者要裸奔的外部 IP 地址

```capnp
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "google-search", worker = .mainWorker),
    # 这里填写静态文件目录，若是相对路径，则相对于 workerd 可执行文件的目录
    (name = "public", disk = "./public/"),
  ],

  sockets = [
    # 这里填写服务要监听的地址和端口
    ( name = "http",
      address = "localhost:8080",
      http = (),
      service = "google-search"
    ),
  ]
);

const mainWorker :Workerd.Worker = (
  modules = [
    # 这里填写 worker 模块路径，若是相对路径，则相对于 .capnp 配置文件的目录
    (name = "worker", esModule = embed "../src/google-search.js"),
    (name = "library", esModule = embed "../src/lib.js"),
  ],
  bindings = [
    (name = "files", service = "public"),
  ],
  compatibilityDate = "2024-03-25",
);

```

- 修改 `src/google-search.js`：
  - 把`search.example.com`换成自己最终在外部环境访问时的域名（或者 ip+端口）。
  - 可以通过修改`cookies`，让镜像站使用设置好的 cookie，可以让镜像站始终使用自定义好的设置（比如深色模式）。浏览器打开无痕模式访问 Google，调好设置后把 cookie 复制过来。
- 修改`public/google-search`下面的 js 脚本：
  - 通过修改`sw.js`、`insert-head.js`和`insert-body.js`，可以很方便地向镜像站内插入客户端脚本，达到自定义的目的。
  - 注意：**Service Worker 需要页面是由 https 承载的，或者 host 是 localhost 或者 127.0.0.1，否则不会生效。所以最好绑个域名申请下证书。IP 证书应该也可以**

```javascript
/** 最终外部访问的域名 */
const outerDomain = "search.example.com";

/** 反代目标网站 */
const upstreamDomain = "www.google.com.hk";

/** 访问区域黑名单。如果不额外套cf的cdn，大概率是没有用的。 */
const blockedRegion = ["TK"];

/** 浏览器打开无痕模式访问Google，调好设置后把cookie复制过来。可以让镜像站始终使用自定义好的设置（比如深色模式） */
const cookies = ``;
```

- 修改完之后，执行：`./workerd serve services/google-search.capnp`。然后就可以打开之前填写的地址和端口，进行一个访问了

## 其他

可以用指令:`./workerd compile services/google-search.capnp > workerd-google-proxy`，把代码打包成一个可执行文件，然后就可以通过直接运行`./workerd-google-proxy`来启动服务了。

有一个基于 wokerd 的项目：[vorker](https://github.com/VaalaCat/vorker)，它有一个 webui，调试代码会比更加方便，有时间可以去试试这个

如果 Windows 下运行出现 error：`TLS peer's certificate is not trusted; reason = unable to get local issuer certificate`，去[这里](https://curl.se/docs/caextract.html)下载一个 ca 证书，然后为 workerd.exe 设置环境变量：`set SSL_CERT_FILE=C:/path/to/cacert.pem`。

## 反代任意网站

这里采用了 Service Worker（下文简称 sw），来拦截并修改所有请求，并将符合条件的请求重定向到镜像站。
workerd 端代码只需要修改目标站点的 index.html ，为其添加 sw 的注册代码。对于其他任意请求，都只需要修改必要的响应头，不需要修改响应体。如果确实需要，这些工作也可以丢给 sw 去处理。

### 优点：

- 不需要关心请求是谁发出、如何发出的，相对于字符串替换 url，不存在替换不全导致的漏网之鱼。
- 也可以拦截或者伪造响应，请求根本不会被发送，可以减轻服务端负担。
- 调试比较方便。

### 缺点：

- 精细化的控制能力，导致编写合适的 sw 脚本，门槛比较高。
- 如果目标网站本身就有 sw，会导致冲突。
- 如果目标网站会检查网页是否注册了 sw，还需要针对对应的 js 脚本进行修改。
- 并不是所有请求都会被sw捕获到。
  - 动态生成的iframe；from表单等，可以通过修改其原型的方式，修改目标url。
  - 如果写死的，那么就只能用字符串替换了。
- 首次访问镜像站，到 sw 注册完毕之前，页面请求不受控制，所以首次访问的效果可能会不太好。

### 应对 sw 脚本冲突

首先，浏览器请求 sw 脚本的请求不会受现有的 sw 控制，所以需要在 workerd 端去针对 sw 脚本的 url 伪造响应，让其对应的注册代码失效。

如果源站本身的 sw 不是很重要（不影响网站正常功能），那么让其失效就可以了。但是如果源站功能依赖 sw，那么就需要更复杂的额外处理了。

- 可以去阅读其源码，然后手动地将其在我们的 sw 中实现出来。把主要的代码（传给`responseWith()`的参数）提取出来，然后由我们任意调用。
- 在 workerd 端修改 sw 脚本的响应体，动态地将我们的代码插入到源站 sw 的代码中。
- …………

### 处理多个域名

我们可以构造特殊的请求，在这种特殊请求中携带原始请求的 url，workerd 在处理这类特殊请求时，从中获取到原始请求的 url，然后用原始请求的 url 构建新请求。

同时需要有一个 host 白名单，保证我们只处理那些我们想要代理的请求。

在本项目中，程序这样获取原始请求的 url：

- 请求 pathname 为`/proxy`时，查找 name 为`url`的 query 参数。
- 从`x-real-url`请求头中获取。

通过 sw，可以很方便地构造这种特殊请求。
