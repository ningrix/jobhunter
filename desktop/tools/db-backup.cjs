/**
 * 一致性备份（随应用分发在 resources/app/tools/db-backup.cjs）。
 * 用 better-sqlite3 的在线备份 API：WAL 模式下服务运行中也能拿到一致快照。
 * 用法：node.exe db-backup.cjs <目标 db 路径>   （源库取环境变量 DB_PATH）
 */
const Database = require("better-sqlite3");

const dest = process.argv[2];
if (!dest) {
  console.error("用法: node db-backup.cjs <目标 db 路径>");
  process.exit(2);
}

const src = process.env.DB_PATH;
if (!src) {
  console.error("缺少 DB_PATH 环境变量");
  process.exit(2);
}

try {
  const db = new Database(src, { readonly: true, fileMustExist: true });
  db.backup(dest)
    .then(() => {
      db.close();
      console.log(`backup ok: ${dest}`);
    })
    .catch((e) => {
      console.error(`backup failed: ${e.message}`);
      process.exit(1);
    });
} catch (e) {
  console.error(`open failed: ${e.message}`);
  process.exit(1);
}
