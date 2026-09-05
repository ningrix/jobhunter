import { z } from "zod";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { listAgentEvents } from "@/server/agent/events";

const querySchema = z.object({
  sessionId: z.string().optional(),
  jobId: z.string().optional(),
});

/** Agent 行为审计查询（供 Application Agent 页面与 Dashboard 漏斗使用） */
export const GET = defineRoute({ auth: true, query: querySchema }, async ({ user, query }) => {
  const { sessionId, jobId } = query as unknown as { sessionId?: string; jobId?: string };
  return ok(await listAgentEvents(user!.id, { sessionId, jobId }));
});
