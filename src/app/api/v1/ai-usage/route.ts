import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiUsageLogs } from "@/db/schema";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";

export interface UsageTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export interface UsageSceneRow extends UsageTotals {
  scene: string;
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function totalsFor(userId: string, since?: Date): Promise<UsageTotals> {
  const conds = since
    ? [eq(aiUsageLogs.userId, userId), gte(aiUsageLogs.createdAt, since)]
    : [eq(aiUsageLogs.userId, userId)];
  const [row] = await getDb()
    .select({
      calls: sql<number>`cast(count(*) as int)`,
      promptTokens: sql<number>`cast(coalesce(sum(${aiUsageLogs.promptTokens}), 0) as int)`,
      completionTokens: sql<number>`cast(coalesce(sum(${aiUsageLogs.completionTokens}), 0) as int)`,
      cost: sql<number>`cast(coalesce(sum(${aiUsageLogs.cost}), 0) as real)`,
    })
    .from(aiUsageLogs)
    .where(and(...conds));
  return row ?? { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
}

/** V4.0 AI 用量与成本汇总（仅本人）：定价口径见 server/ai/pricing.ts */
export const GET = defineRoute({ auth: true }, async ({ user }) => {
  const userId = user!.id;
  const start = todayStart();
  const [today, total, bySceneRows] = await Promise.all([
    totalsFor(userId, start),
    totalsFor(userId),
    getDb()
      .select({
        scene: aiUsageLogs.scene,
        calls: sql<number>`cast(count(*) as int)`,
        promptTokens: sql<number>`cast(coalesce(sum(${aiUsageLogs.promptTokens}), 0) as int)`,
        completionTokens: sql<number>`cast(coalesce(sum(${aiUsageLogs.completionTokens}), 0) as int)`,
        cost: sql<number>`cast(coalesce(sum(${aiUsageLogs.cost}), 0) as real)`,
      })
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.userId, userId))
      .groupBy(aiUsageLogs.scene),
  ]);
  return ok({ today, total, byScene: bySceneRows });
});
