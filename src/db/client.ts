import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

let _db: ReturnType<typeof createDb> | null = null;

function createDb(dbPath: string) {
  // dbPath 仅来自服务端启动配置（DB_PATH env / 测试显式传入），
  // 不存在任何用户输入入口；此处有意允许项目外绝对路径（CI/tmp 测试目录）。
  const abs = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const sqlite = new Database(abs);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  // 幂等迁移：启动/测试时自动应用 ./drizzle 下的迁移
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

export type Db = ReturnType<typeof createDb>;

/** 惰性单例：避免在 Next build 阶段打开数据库 */
export function getDb(): Db {
  if (_db) return _db;
  _db = createDb(process.env.DB_PATH ?? "./data/jobhunter.db");
  return _db;
}

/** 测试专用：强制重建连接（切换 DB_PATH 后调用） */
export function resetDbClient(): void {
  _db = null;
}

export { schema };
