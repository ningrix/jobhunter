import path from "node:path";
import { z } from "zod";

/**
 * DB_PATH 配置边界（服务端受信任配置的集中校验点）。
 * 模块加载时验证一次并导出不可变常量：client.ts 等消费方不再接触 env 与可变路径。
 * 校验链：zod 非空/拒绝穿越片段（..）→ 绝对路径 → 强制位于 <项目根>/data 内。
 * Docker 部署挂载卷同理（/app/data）。
 */
const DbPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine((p) => !p.split(/[\\/]/).includes(".."), "不允许包含目录穿越片段（..）");

const parsed = DbPathSchema.safeParse(process.env.DB_PATH ?? "./data/jobhunter.db");
if (!parsed.success) {
  throw new Error(`非法 DB_PATH: ${parsed.error.issues[0]?.message ?? "校验失败"}`);
}

const abs = path.isAbsolute(parsed.data) ? parsed.data : path.resolve(parsed.data);
const dataRoot = path.join(process.cwd(), "data");
if (!abs.startsWith(dataRoot + path.sep)) {
  throw new Error(
    `非法 DB_PATH: 数据库文件必须位于 ${path.join("data", "…")} 内（当前解析为 ${abs}）`,
  );
}

/** 已通过边界校验的数据库文件绝对路径（模块级常量，加载期验证一次） */
export const dbFile: string = abs;
