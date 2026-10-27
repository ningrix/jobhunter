/**
 * 打包前全链路冒烟：用随包 node.exe 起真实服务，对关键链路逐项断言。
 * 用法：node desktop/scripts/verify-app.mjs [--app build/app] [--node build/runtime/node.exe]
 * 任一断言失败 → 退出码 1（不允许进入 electron-builder）。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const APP = path.resolve(arg("app", path.join(DESKTOP, "build", "app")));
const NODE = path.resolve(arg("node", path.join(DESKTOP, "build", "runtime", "node.exe")));
const FIX = path.resolve(arg("fixtures", path.join(DESKTOP, "fixtures")));

const failures = [];
const check = (cond, label, detail = "") => {
  if (cond) {
    console.log(`[verify] ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`[verify] ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

if (!fs.existsSync(path.join(APP, "launcher.cjs"))) throw new Error(`应用目录不完整：${APP}`);
if (!fs.existsSync(NODE)) throw new Error(`缺少 node.exe：${NODE}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jh-verify-"));
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });
const port = await new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});

const env = {
  ...process.env,
  NODE_ENV: "production",
  AUTH_MODE: "local",
  APP_DATA_DIR: dataDir,
  DB_PATH: path.join(dataDir, "jobhunter.db"),
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
  JWT_SECRET: crypto.randomBytes(32).toString("hex"),
  AI_KEY_MASTER_SECRET: crypto.randomBytes(32).toString("hex"),
  AI_PROVIDER: "mock",
  STORAGE_DRIVER: "local",
  NEXT_TELEMETRY_DISABLED: "1",
};
delete env.NODE_OPTIONS;

const base = `http://127.0.0.1:${port}`;
let child = null;

function start() {
  child = spawn(NODE, [path.join(APP, "launcher.cjs")], {
    cwd: APP,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout.on("data", (d) => process.env.JH_VERBOSE && process.stdout.write(`  | ${d}`));
  child.stderr.on("data", (d) => process.env.JH_VERBOSE && process.stderr.write(`  ! ${d}`));
}

async function stop() {
  if (!child) return;
  const c = child;
  child = null;
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        c.kill("SIGKILL");
      } catch {}
      resolve();
    }, 3000);
    c.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
    try {
      c.disconnect?.();
      c.kill();
    } catch {
      clearTimeout(t);
      resolve();
    }
  });
}

async function waitHealth(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = "无响应";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
      const json = await res.json();
      if (json?.data?.db === "ok") return json.data;
      last = JSON.stringify(json);
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`健康检查超时：${last}`);
}

async function upload(filePath) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), path.basename(filePath));
  const res = await fetch(`${base}/api/v1/resumes/upload`, { method: "POST", body: fd });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

try {
  start();
  await waitHealth();
  check(true, "服务启动并连上数据库（/health db=ok）");

  const dbFile = path.join(dataDir, "jobhunter.db");
  check(fs.existsSync(dbFile), "数据库落在 APP_DATA_DIR 内", dbFile);

  const count = execFileSync(
    NODE,
    [
      "-e",
      "const D=require('better-sqlite3');const db=new D(process.env.DB_PATH,{readonly:true});console.log(db.prepare('select count(*) c from __drizzle_migrations').get().c)",
    ],
    { cwd: APP, env, encoding: "utf8" },
  ).trim();
  check(Number(count) === 10, `迁移条数 = 10（实际 ${count}）`);

  const dash = await fetch(`${base}/dashboard`, { redirect: "manual" });
  check(dash.status === 200, "GET /dashboard 直接 200（免登录，无 302）", `status=${dash.status}`);

  const txt = path.join(tmp, "sample.txt");
  fs.writeFileSync(txt, "张伟 Java 后端 5 年经验：MySQL、Kafka、Redis，负责交易链路优化。");
  const upTxt = await upload(txt);
  check(upTxt.status === 202 || upTxt.status === 200, "上传 txt 成功", `status=${upTxt.status}`);

  for (const name of ["sample.pdf", "sample.docx"]) {
    const p = path.join(FIX, name);
    if (!fs.existsSync(p)) {
      console.log(`[verify] - 跳过 ${name}（fixtures 里没有；执行 make-fixtures.mjs 可生成）`);
      continue;
    }
    const r = await upload(p);
    check(r.status === 202 || r.status === 200, `上传 ${name} 成功（解析链路可用）`, `status=${r.status}`);
  }

  const exp = await fetch(`${base}/api/v1/jobs/export`);
  const ctype = exp.headers.get("content-type") || "";
  check(exp.status === 200 && ctype.includes("spreadsheet"), "Excel 导出可用", `status=${exp.status} type=${ctype}`);

  const before = await (await fetch(`${base}/api/v1/resumes`)).json();
  check(Array.isArray(before.data) && before.data.length > 0, "简历列表可读");

  await stop();
  const portFree = await new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
  check(portFree, "退出后端口已释放（无孤儿进程）");

  start();
  await waitHealth();
  const after = await (await fetch(`${base}/api/v1/resumes`)).json();
  check(after.data?.length === before.data?.length && after.data.length > 0, "重启后数据仍在（持久化正确）");
} catch (e) {
  failures.push(`运行异常：${e.message}`);
  console.error(e);
} finally {
  await stop();
}

console.log("");
if (failures.length) {
  console.error(`[verify] 失败 ${failures.length} 项：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("[verify] 全部通过，可以打包。");
