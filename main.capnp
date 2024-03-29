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