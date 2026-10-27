/**
 * 服务端启动器（随应用分发在 resources/app/launcher.cjs）。
 * 职责：父进程（Electron）断开即自杀，避免孤儿 node.exe 占住数据库；
 * 随后加载 Next standalone 的 server.js（它自己会 chdir 到 __dirname）。
 */
process.on("disconnect", () => process.exit(0));
process.on("uncaughtException", (e) => {
  console.error("[launcher] uncaught:", e);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error("[launcher] unhandled:", e);
});

require("./server.js");
