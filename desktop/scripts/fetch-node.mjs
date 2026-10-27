/**
 * 下载官方 Node 运行时（只取 node.exe + LICENSE），保证「构建用 Node」==「随包 Node」。
 * 用法：node desktop/scripts/fetch-node.mjs [--version 22.22.2] [--out desktop/build/runtime]
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const VERSION = arg("version", "22.22.2");
const OUT = path.resolve(arg("out", path.join(DESKTOP, "build", "runtime")));
const CACHE = path.join(DESKTOP, "build", ".cache");

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("重定向过多"));
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(new URL(res.headers.location, url).toString(), dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`下载失败 HTTP ${res.statusCode}: ${url}`));
        }
        const total = Number(res.headers["content-length"] || 0);
        let got = 0;
        let lastPct = -10;
        const file = fs.createWriteStream(dest);
        res.on("data", (c) => {
          got += c.length;
          if (!total) return;
          const pct = Math.floor((got / total) * 100);
          if (pct - lastPct >= 10) {
            lastPct = pct;
            console.log(`[fetch-node] ${pct}%`);
          }
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          process.stdout.write("\n");
          resolve(dest);
        });
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const nodeExe = path.join(OUT, "node.exe");
const modulesOk = () => {
  if (!fs.existsSync(nodeExe)) return false;
  try {
    return execFileSync(nodeExe, ["-p", "process.versions.modules"], { encoding: "utf8" }).trim() === "127";
  } catch {
    return false;
  }
};

if (modulesOk()) {
  console.log(`[fetch-node] ✓ 已存在可用 node.exe（ABI 127）：${nodeExe}`);
  process.exit(0);
}

const zipName = `node-v${VERSION}-win-x64.zip`;
const zipPath = path.join(CACHE, zipName);

if (!fs.existsSync(zipPath)) {
  const url = `https://nodejs.org/dist/v${VERSION}/${zipName}`;
  console.log(`[fetch-node] 下载 ${url}`);
  await download(url, zipPath);
}
console.log(`[fetch-node] 解包 ${zipName}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jh-node-"));
execFileSync("tar", ["-xf", zipPath, "-C", tmp], { stdio: "inherit" });

const srcDir = fs.readdirSync(tmp).find((d) => d.startsWith("node-v"));
if (!srcDir) throw new Error("解包后找不到 node 目录");
for (const f of ["node.exe", "LICENSE"]) {
  const from = path.join(tmp, srcDir, f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(OUT, f));
}
fs.rmSync(tmp, { recursive: true, force: true });

if (!modulesOk()) throw new Error("node.exe 校验失败（ABI 不是 127，与构建环境不一致）");
console.log(`[fetch-node] ✓ ${nodeExe}（ABI 127）`);
