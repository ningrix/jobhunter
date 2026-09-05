import { z } from "zod";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { confirmRun, getApplyFlowState } from "@/server/agent/apply-flow";

/**
 * approve（确认提交）/ reject（拒绝）/ handover（用户接管：Agent 退出，不再操作）。
 * 兼容 V2 的 { approve: boolean } 形式；显式 action 优先。
 */
const bodySchema = z
  .object({
    approve: z.boolean().optional(),
    action: z.enum(["approve", "reject", "handover"]).optional(),
    reason: z.string().max(200).optional(),
  })
  .refine((v) => typeof v.approve === "boolean" || v.action !== undefined, {
    message: "需要提供 approve 或 action",
  });

type Params = { params: Promise<{ sessionId: string }> };

export const POST = defineRoute({ auth: true, body: bodySchema }, async ({ user, params, body }) => {
  const { sessionId } = params as unknown as { sessionId: string };
  const state = await confirmRun(sessionId, user!.id, body.approve === true, body.action, body.reason);
  return ok({
    status: state.status,
    applicationId: state.applicationId,
    blockedReason: state.blockedReason,
  });
});

export const GET = defineRoute({ auth: true }, async ({ user, params }) => {
  const { sessionId } = params as unknown as { sessionId: string };
  return ok(getApplyFlowState(sessionId, user!.id));
});
