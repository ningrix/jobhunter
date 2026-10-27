/**
 * 桌面端配置与路径：%LOCALAPPDATA%\JobHunter
 * - config.json 保存密钥与窗口状态（原子写，损坏自愈）
 * - data/ 数据库与上传；logs/ 日志；backups/ 备份；chromium/ 浏览器缓存
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SCHEMA_VERSION = 1;

function homeDir() {
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || ".", "AppData", "Local");
  return path.join(base, "JobHunter");
}

function ensureDirs(home) {
  for (const sub of ["", "data", "logs", "backups", "chromium"]) {
    fs.mkdirSync(path.join(home, sub), { recursive: true });
  }
}

/** 写探针：目录存在不代表可写（Program Files / 只读盘 / 组策略） */
function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function readConfig(home) {
  const file = path.join(home, "config.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // 损坏自愈：留档后重建，避免应用永远起不来
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      /* 留档失败也要继续启动 */
    }
    return null;
  }
}

function writeConfig(home, cfg) {
  const file = path.join(home, "config.json");
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** 幂等：缺什么补什么；密钥只在首次生成，之后永不覆盖（覆盖会导致已存 AI Key 解不开） */
function ensureConfig(home) {
  ensureDirs(home);
  const cfg = readConfig(home) || {};
  let changed = false;

  if (!cfg.schemaVersion) {
    cfg.schemaVersion = SCHEMA_VERSION;
    changed = true;
  }
  if (!cfg.jwtSecret) {
    cfg.jwtSecret = crypto.randomBytes(32).toString("hex");
    changed = true;
  }
  if (!cfg.aiKeyMasterSecret) {
    cfg.aiKeyMasterSecret = crypto.randomBytes(32).toString("hex");
    changed = true;
  }
  if (!cfg.dataDir) {
    cfg.dataDir = path.join(home, "data");
    changed = true;
  }
  if (cfg.firstRunCompleted === undefined) {
    cfg.firstRunCompleted = false;
    changed = true;
  }
  if (!cfg.window) {
    cfg.window = { width: 1280, height: 860 };
    changed = true;
  }
  if (changed) writeConfig(home, cfg);
  return cfg;
}

function saveConfig(home, cfg) {
  writeConfig(home, cfg);
}

module.exports = { homeDir, ensureDirs, isWritable, readConfig, writeConfig, ensureConfig, saveConfig };
