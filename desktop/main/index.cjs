/**
 * JobHunter 桌面版主进程。
 * 生命周期：单实例 → 配置/密钥 → 首次向导 → 起本地服务（内置 node.exe）→ 健康探活 → 打开 /dashboard
 * 退出：关闭窗口即退出；退出前先停子进程，避免孤儿 node.exe 占库。
 */
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");

const cfgMod = require("./config.cjs");
const srv = require("./server.cjs");
const ui = require("./ui.cjs");

const HOME = cfgMod.homeDir();
const LOG_DIR = path.join(HOME, "logs");
const BACKUP_DIR = path.join(HOME, "backups");

// GPU 进程在远程桌面/无独显环境会反复崩溃（0xC0000005）导致应用直接退出；
// 本应用不需要 WebGL，默认软件渲染 + 进程内 GPU，JH_GPU=1 可保留硬件加速。
if (process.env.JH_GPU !== "1") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}
// 网络服务沙箱子进程在部分环境（远程桌面/安全软件注入）会起不来，表现为 loadURL ERR_FAILED
app.commandLine.appendSwitch("disable-features", "NetworkServiceSandbox");
delete process.env.NODE_OPTIONS;

// 必须在 ready 之前重定向（Electron 默认 userData 在 Roaming）
app.setPath("userData", path.join(HOME, "chromium"));
app.setPath("sessionData", path.join(HOME, "chromium"));
app.commandLine.appendSwitch("no-proxy-server");

let cfg = null;
let child = null;
let mainWindow = null;
let splash = null;
let tray = null;
let serverUrl = null;
let quitting = false;
let transitioning = false; // 向导关闭 → 主窗口出现之间的空窗期

const isPackaged = app.isPackaged;
const APP_DIR = process.env.JH_APP_DIR || (isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..", "build", "app"));
const NODE_EXE = process.env.JH_NODE_EXE || (isPackaged ? path.join(process.resourcesPath, "runtime", "node.exe") : "node");
const ICON = isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(__dirname, "..", "assets", "icon.png");
const PRELOAD = path.join(__dirname, "..", "preload.cjs");
const WIZARD = path.join(__dirname, "..", "wizard", "index.html");

// ———— 日志（按天分文件，单文件 10MB 上限） ————
function logLine(kind, text) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const file = path.join(LOG_DIR, `server-${stamp}.log`);
    const line = `[${d.toISOString()}] [${kind}] ${String(text).trimEnd()}\n`;
    if (fs.existsSync(file) && fs.statSync(file).size > 10 * 1024 * 1024) {
      fs.renameSync(file, file.replace(/\.log$/, `-${Date.now()}.log`));
    }
    fs.appendFileSync(file, line);
  } catch {
    /* 日志失败不能影响启动 */
  }
}

// Chromium 子进程（GPU / NetworkService 等）崩溃会表现为页面加载 ERR_FAILED，记录真实原因便于定位
app.on("child-process-gone", (_e, details) => {
  logLine("main", `child-process-gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
});

// ———— 服务 ————
const SERVER_ATTEMPTS = 3;
// 启动期「文件被占用/权限瞬时拒绝」类错误：首次解压（portable）与安全软件扫描会造成偶发 EBUSY，
// 重开一个子进程即可恢复；数据库损坏、node.exe 缺失等确定性错误不重试。
const TRANSIENT_START_ERROR = /EBUSY|EPERM|EACCES|EMFILE|ENFILE|EADDRINUSE/;

async function startServer() {
  const dataDir = cfg.dataDir;
  if (!cfgMod.isWritable(dataDir)) throw new Error(`数据目录不可写：${dataDir}`);

  let lastError = null;
  let lastTail = "";
  for (let attempt = 1; attempt <= SERVER_ATTEMPTS; attempt += 1) {
    const port = await srv.findFreePort();
    const env = srv.buildEnv({ cfg, dataDir, port });
    serverUrl = `http://127.0.0.1:${port}`;
    logLine("main", `starting server on ${serverUrl} (attempt ${attempt}/${SERVER_ATTEMPTS}) app=${APP_DIR} node=${NODE_EXE}`);

    let tail = "";
    let expectedExit = false;
    const c = srv.launch({
      nodeExe: NODE_EXE,
      appDir: APP_DIR,
      env,
      onLog: (kind, text) => {
        tail = `${tail}${text}`.slice(-4000);
        logLine(kind, text);
      },
    });
    child = c;
    c.once("exit", (code, signal) => {
      if (!quitting && !expectedExit) logLine("main", `server exited unexpectedly: code=${code} signal=${signal}`);
    });

    try {
      await srv.waitHealth(port, { child: c });
      logLine("main", "server healthy");
      return;
    } catch (e) {
      lastError = e;
      lastTail = tail.trim();
      expectedExit = true;
      logLine("main", `server start failed (attempt ${attempt}/${SERVER_ATTEMPTS}): ${e?.message || e}`);
      await stopServer();
      if (attempt < SERVER_ATTEMPTS && TRANSIENT_START_ERROR.test(`${e?.message || e}\n${lastTail}`)) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      break;
    }
  }

  const detail = lastTail ? `\n\n服务日志（尾部）：\n${lastTail.slice(-1200)}` : "";
  throw new Error(`服务启动失败：${lastError?.message || lastError}${detail}`);
}

async function stopServer() {
  if (!child) return;
  const c = child;
  child = null;
  await srv.stop(c);
}

// ———— 备份 / 恢复 ————
async function backup() {
  if (!child) return;
  try {
    const picked = await dialog.showOpenDialog({
      title: "选择备份保存位置",
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled) return;
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const dest = path.join(picked.filePaths[0], `JobHunter-backup-${stamp}`);
    fs.mkdirSync(dest, { recursive: true });

    const dbDest = path.join(dest, "jobhunter.db");
    const r = spawnSync(NODE_EXE, [path.join(APP_DIR, "tools", "db-backup.cjs"), dbDest], {
      env: { ...process.env, DB_PATH: path.join(cfg.dataDir, "jobhunter.db") },
      windowsHide: true,
    });
    if (r.status !== 0) throw new Error(r.stderr?.toString() || "数据库备份失败");

    const uploads = path.join(cfg.dataDir, "uploads");
    if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dest, "uploads"), { recursive: true });

    await dialog.showMessageBox({ type: "info", title: "备份完成", message: "备份已保存", detail: dest, buttons: ["好"] });
  } catch (e) {
    dialog.showErrorBox("备份失败", String(e?.message || e));
  }
}

async function restore() {
  const picked = await dialog.showOpenDialog({
    title: "选择备份的数据库文件（jobhunter.db）",
    properties: ["openFile"],
    filters: [{ name: "SQLite 数据库", extensions: ["db"] }],
  });
  if (picked.canceled) return;

  const ok = dialog.showMessageBoxSync({
    type: "warning",
    title: "从备份恢复",
    message: "将用所选数据库覆盖当前数据，当前数据会先留档。继续？",
    buttons: ["继续", "取消"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (ok !== 0) return;

  try {
    await stopServer();
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const dbPath = path.join(cfg.dataDir, "jobhunter.db");
    if (fs.existsSync(dbPath)) fs.renameSync(dbPath, path.join(BACKUP_DIR, `pre-restore-${stamp}.db`));
    for (const suffix of ["-wal", "-shm"]) {
      const side = `${dbPath}${suffix}`;
      if (fs.existsSync(side)) fs.rmSync(side, { force: true });
    }
    fs.copyFileSync(picked.filePaths[0], dbPath);
    await startServer();
    await mainWindow?.loadURL(`${serverUrl}/dashboard`);
    await dialog.showMessageBox({ type: "info", title: "恢复完成", message: "已从备份恢复并重启服务", buttons: ["好"] });
  } catch (e) {
    dialog.showErrorBox("恢复失败", String(e?.message || e));
    app.quit();
  }
}

function actions() {
  return {
    openDataDir: () => void shell.openPath(cfg.dataDir),
    openLogsDir: () => void shell.openPath(LOG_DIR),
    backup: () => void backup(),
    restore: () => void restore(),
    show: () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    },
    about: () =>
      void dialog.showMessageBox({
        type: "info",
        title: "关于 JobHunter",
        message: `JobHunter ${app.getVersion()}`,
        detail: `数据目录：${cfg.dataDir}\n服务地址：${serverUrl ?? "启动中"}\nElectron：${process.versions.electron} / Node：${process.versions.node}`,
        buttons: ["好"],
      }),
    quit: () => app.quit(),
  };
}

// ———— 首次向导 ————
function openWizard() {
  const fileUrl = pathToFileURL(WIZARD).toString();
  const win = ui.createWindow({ url: fileUrl, preload: PRELOAD, width: 720, height: 560 });
  void win.loadURL(fileUrl);
  win.once("ready-to-show", () => win.show());

  ipcMain.handle("app:info", () => ({ version: app.getVersion(), dataDir: cfg.dataDir, logsDir: LOG_DIR }));
  ipcMain.handle("setup:finish", async () => {
    cfg.firstRunCompleted = true;
    cfgMod.saveConfig(HOME, cfg);
    transitioning = true;
    win.destroy();
    await bootMain();
    transitioning = false;
    return true;
  });
}

// ———— 主窗口 ————
function openSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 180,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: "#ffffff",
  });
  const html = `<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff;color:#334">
    <div style="text-align:center"><div style="font-size:15px">正在启动 JobHunter…</div>
    <div style="font-size:12px;color:#889;margin-top:8px">首次启动需要初始化数据库，请稍候</div></div></body>`;
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function bootMain() {
  try {
    openSplash();
    await startServer();

    const url = `${serverUrl}/dashboard`;
    mainWindow = ui.createWindow({
      url,
      preload: PRELOAD,
      width: cfg.window?.width ?? 1280,
      height: cfg.window?.height ?? 860,
    });
    // 必须在 loadURL 之前挂 ready-to-show，否则事件可能已经错过、窗口永远不显示
    mainWindow.once("ready-to-show", () => mainWindow?.show());

    const wc = mainWindow.webContents;
    wc.on("did-fail-load", (_e, code, desc, failedUrl, isMainFrame) => {
      logLine("main", `did-fail-load code=${code} desc=${desc} url=${failedUrl} main=${isMainFrame}`);
    });
    wc.on("render-process-gone", (_e, details) => {
      logLine("main", `render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
    });
    wc.on("did-finish-load", () => logLine("main", `did-finish-load ${wc.getURL()}`));

    try {
      await mainWindow.loadURL(url);
    } catch (e) {
      // 本地服务已通过健康检查，加载失败多为渲染/网络子进程的瞬时抖动：原地重试一次并留日志
      logLine("main", `loadURL failed: ${e?.message || e}，1.2s 后重试一次`);
      await new Promise((r) => setTimeout(r, 1200));
      await mainWindow.loadURL(url);
    }
    logLine("main", "dashboard loaded");
    mainWindow.on("close", () => {
      cfg.window = mainWindow?.getBounds() ?? cfg.window;
      cfgMod.saveConfig(HOME, cfg);
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    splash?.destroy();
    splash = null;
  } catch (e) {
    splash?.destroy();
    splash = null;
    logLine("main", `boot failed: ${e?.stack || e}`);
    ui.showError("JobHunter 启动失败", String(e?.message || e), { logsDir: LOG_DIR });
    app.quit();
  }
}

// ———— 启动 ————
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    cfg = cfgMod.ensureConfig(HOME);
    cfgMod.ensureDirs(HOME);
    ui.hardenSession();
    ui.buildMenu({ actions: actions() });
    tray = ui.createTray({ iconPath: ICON, actions: actions() });

    if (!cfg.firstRunCompleted) openWizard();
    else await bootMain();
  });

  app.on("before-quit", (e) => {
    if (quitting) return;
    quitting = true;
    e.preventDefault();
    void stopServer().finally(() => app.exit(0));
  });

  // 关闭窗口即退出（不留后台进程；本应用不支持开机自启，托盘仅用于最小化恢复）
  app.on("window-all-closed", () => {
    if (!transitioning && !quitting) app.quit();
  });
}
