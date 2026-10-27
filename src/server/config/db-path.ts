import path from "node:path";
import { z } from "zod";
import { DATA_ROOT } from "./data-root";

/**
 * DB_PATH 配置边界（服务端受信任配置的集中校验点）。
 * 模块加载时验证一次并导出不可变常量：client.ts 等消费方不再接触 env 与可变路径。
 * 校验链：zod 非空/拒绝穿越片段（..）→ 绝对路径 → 强制位于数据根目录（DATA_ROOT）内。
 * Docker 部署挂载卷同理（/app/data）；桌面端数据根由 APP_DATA_DIR 指定。
 */
const DbPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine((p) => !p.split(/[\\/]/).includes(".."), "不允许包含目录穿越片段（..）");

const parsed = DbPathSchema.safeParse(process.env.DB_PATH ?? path.join(DATA_ROOT, "jobhunter.db"));
if (!parsed.success) {
  throw new Error(`非法 DB_PATH: ${parsed.error.issues[0]?.message ?? "校验失败"}`);
}

// 相对路径按「数据根目录的父目录」解析：默认 <cwd>/data 时等同于按 cwd 解析；
// 桌面端（APP_DATA_DIR=<AppHome>/data）时 ./data/x.db 仍落在 <AppHome>/data 内。
const abs = path.isAbsolute(parsed.data)
  ? parsed.data
  : path.resolve(path.dirname(DATA_ROOT), parsed.data);
if (!abs.startsWith(DATA_ROOT + path.sep)) {
  throw new Error(
    `非法 DB_PATH: 数据库文件必须位于 ${path.join("data", "…")} 内（当前解析为 ${abs}）`,
  );
}

/** 已通过边界校验的数据库文件绝对路径（模块级常量，加载期验证一次） */
export const dbFile: string = abs;
