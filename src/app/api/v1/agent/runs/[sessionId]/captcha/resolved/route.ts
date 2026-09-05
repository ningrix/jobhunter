import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { resumeAfterCaptcha } from "@/server/agent/apply-flow";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * 用户声称已在平台完成安全验证（滑块/验证码），请求 Agent 复检并从断点继续。
 * 仅 blocked（安全验证）会话可调用；复检仍失败则保持 blocked，次数受会话级上限约束。
 */
export const POST = defineRoute({ auth: true }, async ({ user, params }) => {
  const { sessionId } = params as unknown as { sessionId: string };
  const state = await resumeAfterCaptcha(sessionId, user!.id);
  return ok({
    status: state.status,
    applicationId: state.applicationId,
    blockedReason: state.blockedReason,
  });
});
