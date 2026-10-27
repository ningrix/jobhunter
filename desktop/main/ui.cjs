/**
 * 窗口 / 菜单 / 托盘 / 对话框。
 * 原则：主窗口只承载本地服务页面，外链一律交给系统浏览器；不允许页面申请敏感权限。
 */
const path = require("node:path");
const { BrowserWindow, Menu, Tray, shell, dialog, nativeImage, session, app } = require("electron");

function hardenSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  // Excel 导出：给一个保存对话框，避免静默落到默认下载目录
  ses.on("will-download", (_e, item) => {
    item.setSaveDialogOptions({
      title: "保存文件",
      defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
    });
  });
}

function createWindow({ url = "about:blank", preload, width = 1280, height = 860, show = false }) {
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 680,
    show,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // 内部页面 = 本地服务同源 / 本地文件；其余 http(s) 交给系统浏览器
  let origin = null;
  try {
    if (/^https?:/i.test(url)) origin = new URL(url).origin;
  } catch {
    origin = null;
  }
  const isInternal = (target) => (origin ? target.startsWith(origin) : /^(file|about|data):/i.test(target));

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!isInternal(target) && /^https?:/i.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, target) => {
    if (isInternal(target)) return;
    e.preventDefault();
    if (/^https?:/i.test(target)) shell.openExternal(target);
  });

  return win;
}

function buildMenu({ actions }) {
  const template = [
    {
      label: "文件",
      submenu: [
        { label: "打开数据目录", click: actions.openDataDir },
        { label: "打开日志目录", click: actions.openLogsDir },
        { type: "separator" },
        { label: "立即备份…", click: actions.backup },
        { label: "从备份恢复…", click: actions.restore },
        { type: "separator" },
        { label: "退出", role: "quit" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "刷新", role: "reload" },
        { label: "强制刷新", role: "forceReload" },
        { type: "separator" },
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { label: "重置缩放", role: "resetZoom" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        { label: "关于 JobHunter", click: actions.about },
        { label: "打开日志目录", click: actions.openLogsDir },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray({ iconPath, actions }) {
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return null;
  image = image.resize({ width: 16, height: 16 });
  const tray = new Tray(image);
  tray.setToolTip("JobHunter");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示主界面", click: actions.show },
      { type: "separator" },
      { label: "打开数据目录", click: actions.openDataDir },
      { label: "立即备份…", click: actions.backup },
      { type: "separator" },
      { label: "退出", click: actions.quit },
    ]),
  );
  tray.on("double-click", actions.show);
  return tray;
}

function showError(title, message, { logsDir } = {}) {
  const buttons = logsDir ? ["打开日志目录", "退出"] : ["退出"];
  const choice = dialog.showMessageBoxSync({
    type: "error",
    title,
    message,
    detail: logsDir ? `日志目录：${logsDir}` : undefined,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });
  if (logsDir && choice === 0) shell.openPath(logsDir);
}

module.exports = { hardenSession, createWindow, buildMenu, createTray, showError };
