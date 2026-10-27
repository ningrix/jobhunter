/**
 * 把组装好的服务端目录完整覆盖到 win-unpacked/resources/app（配合 electron-builder --prepackaged 使用）。
 * 用法：node desktop/scripts/sync-app.cjs [--src build/app] [--unpacked release/win-unpacked]
 */
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const DESKTOP = path.resolve(HERE, "..");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const src = path.resolve(arg("src", path.join(DESKTOP, "build", "app")));
const unpacked = path.resolve(arg("unpacked", path.join(DESKTOP, "release", "win-unpacked")));
const dst = path.join(unpacked, "resources", "app");

if (!fs.existsSync(path.join(src, "server.js"))) throw new Error(`build/app 不完整：${src}`);
if (!fs.existsSync(unpacked)) throw new Error(`win-unpacked 不存在：${unpacked}`);

fs.cpSync(src, dst, { recursive: true });

const must = [
  "server.js",
  "launcher.cjs",
  "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  ".next/static",
  "drizzle/meta/_journal.json",
];
for (const rel of must) {
  if (!fs.existsSync(path.join(dst, rel))) throw new Error(`覆盖后仍缺少 ${rel}`);
}

let n = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else n += 1;
  }
};
walk(dst);
console.log(`APP_SYNC_OK files=${n} dst=${dst}`);
