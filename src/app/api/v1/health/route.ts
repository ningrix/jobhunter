import { sql } from "drizzle-orm";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { getDb } from "@/db/client";

/**
 * P1-3 部署探活端点（公开、无敏感信息）：
 * 返回进程与数据库连通性，供 Docker healthcheck / 反代 / 监控使用。
 */
export const GET = defineRoute({}, async () => {
  let db: "ok" | "error" = "ok";
  try {
    getDb().get(sql`SELECT 1 AS one`);
  } catch {
    db = "error";
  }
  return ok({
    status: db === "ok" ? "healthy" : "degraded",
    db,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
