import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiTasks } from "@/db/schema";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";

/** V3.3 职位雷达：最近扫描任务（状态/结果/耗时） */
export const GET = defineRoute({ auth: true }, async ({ user }) => {
  const rows = await getDb()
    .select({
      id: aiTasks.id,
      status: aiTasks.status,
      output: aiTasks.output,
      error: aiTasks.error,
      provider: aiTasks.provider,
      model: aiTasks.model,
      durationMs: aiTasks.durationMs,
      createdAt: aiTasks.createdAt,
    })
    .from(aiTasks)
    .where(and(eq(aiTasks.userId, user!.id), eq(aiTasks.type, "radar_search")))
    .orderBy(desc(aiTasks.createdAt))
    .limit(20);
  return ok(rows);
});
