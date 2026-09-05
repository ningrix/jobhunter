import { z } from "zod";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { handoverRun } from "@/server/agent/apply-flow";

const bodySchema = z.object({
  reason: z.string().max(200).optional(),
});

type Params = { params: Promise<{ sessionId: string }> };

/**
 * 用户接管（Handover）：Agent 关闭页面退出，进入 handed_over_to_user 终态。
 * 允许来源：等待确认 / 安全验证阻断。此后 Agent 不再执行任何操作，
 * 只能通过手动投递/投递看板继续。
 */
export const POST = defineRoute({ auth: true, body: bodySchema }, async ({ user, params, body }) => {
  const { sessionId } = params as unknown as { sessionId: string };
  const state = await handoverRun(sessionId, user!.id, body.reason);
  return ok({
    status: state.status,
    applicationId: state.applicationId,
    blockedReason: state.blockedReason,
  });
});
