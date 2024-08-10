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