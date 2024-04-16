using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "google-mirror", worker = .mainWorker),
    (name = "client-js", disk = "./client-js"),
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
  modules = [
    (name = "worker", esModule = embed "google.js"),
  ],
  bindings = [
    (name = "files", service = "client-js"),
  ],
  compatibilityDate = "2024-03-25",
);