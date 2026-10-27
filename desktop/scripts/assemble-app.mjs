/**
 * 组装 resources/app：把 .next/standalone + static + drizzle + 启动器拼成可分发的服务端目录。
 * 用法：node desktop/scripts/assemble-app.mjs --root <构建目录> [--out desktop/build]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const ROOT = path.resolve(arg("root", path.resolve(DESKTOP, "..")));
const OUT = path.resolve(arg("out", path.join(DESKTOP, "build")));
const APP = path.join(OUT, "app");

const fail = (msg) => {
  console.error(`[assemble] ✗ ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`[assemble] ✓ ${msg}`);

// 1) standalone 主体
const standalone = path.join(ROOT, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  fail(`找不到 ${standalone}/server.js —— 请先用 output:"standalone" 跑 next build`);
}
fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });
fs.cpSync(standalone, APP, { recursive: true });
ok("standalone 已复制");

// 2) 静态资源与迁移
const staticDir = path.join(ROOT, ".next", "static");
if (!fs.existsSync(staticDir)) fail("缺少 .next/static");
fs.mkdirSync(path.join(APP, ".next"), { recursive: true });
fs.cpSync(staticDir, path.join(APP, ".next", "static"), { recursive: true });
ok("static 已复制");

const publicDir = path.join(ROOT, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(APP, "public"), { recursive: true });
  ok("public 已复制");
}

const drizzleDir = path.join(ROOT, "drizzle");
if (!fs.existsSync(path.join(drizzleDir, "meta", "_journal.json"))) fail("缺少 drizzle/meta/_journal.json");
fs.cpSync(drizzleDir, path.join(APP, "drizzle"), { recursive: true });
ok("drizzle 已复制");

// 3) 启动器与备份工具
fs.copyFileSync(path.join(DESKTOP, "tools", "launcher.cjs"), path.join(APP, "launcher.cjs"));
fs.mkdirSync(path.join(APP, "tools"), { recursive: true });
fs.copyFileSync(path.join(DESKTOP, "tools", "db-backup.cjs"), path.join(APP, "tools", "db-backup.cjs"));
ok("launcher / db-backup 已就位");

// 4) 关键依赖断言：nft 追踪可能漏（尤其动态 import 与原生 .node）
const MUST = [
  "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  "node_modules/pdf-parse/lib/pdf-parse.js",
  "node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js",
  "node_modules/mammoth/lib/index.js",
  "node_modules/exceljs/excel.js",
  "node_modules/next/dist/server/next-server.js",
];
for (const rel of MUST) {
  const target = path.join(APP, rel);
  if (fs.existsSync(target)) continue;
  const pkg = rel.split("/")[1];
  const srcPkg = path.join(ROOT, "node_modules", pkg);
  if (!fs.existsSync(srcPkg)) fail(`关键依赖缺失且无法补齐：${rel}`);
  fs.cpSync(srcPkg, path.join(APP, "node_modules", pkg), { recursive: true });
  if (!fs.existsSync(target)) fail(`补齐后仍缺失：${rel}`);
  console.warn(`[assemble] ! 已从构建目录补齐整包：${pkg}`);
}
ok("关键依赖齐全（better-sqlite3 / pdf-parse / mammoth / exceljs / next）");

// 5) 迁移条数断言：drizzle 目录缺条目会导致首启只建半张表
const journal = JSON.parse(fs.readFileSync(path.join(APP, "drizzle", "meta", "_journal.json"), "utf8"));
const sqlCount = fs.readdirSync(path.join(APP, "drizzle")).filter((f) => f.endsWith(".sql")).length;
if (journal.entries.length !== sqlCount || sqlCount === 0) {
  fail(`迁移条数不一致：journal=${journal.entries.length} sql=${sqlCount}`);
}
ok(`迁移完整：${sqlCount} 条`);

// 6) 体积提示
let bytes = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else bytes += fs.statSync(p).size;
  }
};
walk(APP);
console.log(`[assemble] 完成：${APP}（${(bytes / 1024 / 1024).toFixed(1)} MB）`);
