/**
 * 服务端托管：选端口 → spawn 内置 node.exe 跑 standalone → 健康探活 → 停止。
 * 注意：绝不坐实端口（本机 3000 常被 dev server 占用）；只监听 127.0.0.1。
 */
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

function findFreePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function buildEnv({ cfg, dataDir, port }) {
  const env = { ...process.env };
  // 不把开发机的调试参数与 Electron 标记带进子进程
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  Object.assign(env, {
    NODE_ENV: "production",
    AUTH_MODE: "local",
    APP_DATA_DIR: dataDir,
    DB_PATH: path.join(dataDir, "jobhunter.db"),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    JWT_SECRET: cfg.jwtSecret,
    AI_KEY_MASTER_SECRET: cfg.aiKeyMasterSecret,
    STORAGE_DRIVER: "local",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  if (!env.AI_PROVIDER) env.AI_PROVIDER = "mock";
  return env;
}

function launch({ nodeExe, appDir, env, onLog }) {
  const child = spawn(nodeExe, [path.join(appDir, "launcher.cjs")], {
    cwd: appDir,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  // spawn 自身失败（node.exe 缺失/无权限）只会发 error 事件，必须接住，否则变成未捕获异常；
  // 停止时 disconnect 一个已退出的子进程也会触发 error，不能当成启动失败
  child.on("error", (e) => {
    if (/disconnected/i.test(e?.message || "")) return;
    child.spawnError = e;
    onLog?.("err", `spawn failed: ${e.message}`);
  });
  child.stdout?.on("data", (d) => onLog?.("out", d.toString()));
  child.stderr?.on("data", (d) => onLog?.("err", d.toString()));
  return child;
}

/**
 * 健康判定必须看 data.db === "ok"：health 在数据库坏掉时仍返回 200。
 * 子进程提前退出时立刻失败（而不是空等 120s 超时）——启动器被杀/文件被占用时会走到这里。
 */
async function waitHealth(port, { timeoutMs = 120000, intervalMs = 500, child = null } = {}) {
  const url = `http://127.0.0.1:${port}/api/v1/health`;
  const deadline = Date.now() + timeoutMs;
  let last = "无响应";
  while (Date.now() < deadline) {
    if (child?.spawnError) throw new Error(`服务进程无法启动：${child.spawnError.message}`);
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`服务进程提前退出（code=${child.exitCode} signal=${child.signalCode}）`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      const json = await res.json();
      if (json?.data?.db === "ok") return json.data;
      last = `degraded: ${JSON.stringify(json?.data ?? json)}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`服务启动超时（${last}）`);
}

/** 停止子进程：先断开 IPC 让 launcher 自杀，再兜底强杀 */
function stop(child, { timeoutMs = 3000 } = {}) {
  if (!child || child.killed) return Promise.resolve();
  // 已经退出（exit 事件早已发过）时不要再等 exit，否则每次重试白等 3 秒
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* 已退出 */
      }
      resolve();
    }, timeoutMs);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.disconnect?.();
      child.kill();
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

module.exports = { findFreePort, buildEnv, launch, waitHealth, stop };
