/**
 * 一键准备构建：隔离副本 → npm ci（Node 22）→ next build（standalone）→ 组装 resources/app。
 * 用法：node desktop/scripts/prepare-build.mjs [--src D:\text02] [--dest D:\jh-desktop-build]
 * 前置：用 Node 22.22.2 执行本脚本（ABI 127），且 dest 不在源码目录内。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const SRC = path.resolve(arg("src", path.resolve(DESKTOP, "..")));
const DEST = path.resolve(arg("dest", "D:\\jh-desktop-build"));

if (process.versions.modules !== "127") {
  console.error(`[prepare] ✗ 必须用 Node 22（ABI 127）执行，当前 ABI=${process.versions.modules}`);
  process.exit(1);
}
if (DEST.startsWith(SRC + path.sep)) {
  console.error("[prepare] ✗ 构建目录不能放在源码目录内（会污染 dev 环境）");
  process.exit(1);
}

console.log(`[prepare] 复制 ${SRC} → ${DEST}`);
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

// 用系统 tar 而不是 fs.cpSync：几万个文件时 cpSync 在部分环境会被策略层直接掐断
const archive = path.join(os.tmpdir(), `jh-src-${Date.now()}.tar`);
const pack = spawnSync(
  "tar",
  [
    "-C",
    SRC,
    ...["node_modules", ".next", "data", ".git", ".workbuddy", "desktop/build", "desktop/release", ".tmpbuild", ".tmpbuild2"].map(
      (e) => `--exclude=./${e}`,
    ),
    "-cf",
    archive,
    ".",
  ],
  { stdio: "inherit" },
);
if (pack.status !== 0) {
  console.error("[prepare] ✗ tar 打包失败");
  process.exit(1);
}
const unpack = spawnSync("tar", ["-C", DEST, "-xf", archive], { stdio: "inherit" });
fs.rmSync(archive, { force: true });
if (unpack.status !== 0) {
  console.error("[prepare] ✗ tar 解包失败");
  process.exit(1);
}
console.log("[prepare] ✓ 源码已复制");

const run = (cmd, args, opts = {}) => {
  console.log(`[prepare] $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: DEST, shell: process.platform === "win32", ...opts });
  if (r.status !== 0) {
    console.error(`[prepare] ✗ 命令失败：${cmd}`);
    process.exit(r.status ?? 1);
  }
};

run("npm", ["ci", "--no-audit", "--no-fund"]);
run(process.execPath, ["-e", "new (require('better-sqlite3'))(':memory:'); console.log('sqlite ok')"]);
run(process.execPath, [path.join(DEST, "node_modules", "next", "dist", "bin", "next"), "build"], {
  env: { ...process.env, AUTH_MODE: "local", NEXT_TELEMETRY_DISABLED: "1" },
});
run(process.execPath, [path.join(DESKTOP, "scripts", "assemble-app.mjs"), "--root", DEST, "--out", path.join(DESKTOP, "build")]);

console.log("[prepare] ✓ 完成：desktop/build/app 已就绪，接着跑 fetch-node + verify-app");
