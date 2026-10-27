/**
 * afterPack：把组装好的服务端目录完整覆盖到 resources/app。
 * electron-builder 的 extraResources 会把 node_modules / .next 部分过滤掉，这里兜底整包复制。
 */
const path = require("node:path");
const fs = require("node:fs");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const src = path.join(__dirname, "..", "build", "app");
  const dst = path.join(context.appOutDir, "resources", "app");
  if (!fs.existsSync(path.join(src, "server.js"))) {
    throw new Error(`服务端产物缺失，请先跑 prepare-build：${src}`);
  }

  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });

  // 自检：原生模块与静态资源必须就位，否则打出的包无法启动
  const must = [
    "server.js",
    "launcher.cjs",
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ".next/static",
    "drizzle/meta/_journal.json",
  ];
  for (const rel of must) {
    if (!fs.existsSync(path.join(dst, rel))) {
      throw new Error(`resources/app 缺少 ${rel}`);
    }
  }
  console.log(`[after-pack] ✓ resources/app 已完整覆盖（${dst}）`);
};
