import { z } from "zod";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { startApplyRun } from "@/server/agent/apply-flow";

const bodySchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().optional(),
  /** 可选 AI 打招呼语（默认关闭）；AI 失败自动降级模板，流程不中断 */
  useAI: z.boolean().optional(),
});

/**
 * 启动 Level 1 半自动投递：Agent 执行 打开→读取→策略→生成→填表 后暂停，
 * 等待用户经 /agent/runs/:sessionId/confirm 确认后才会真正提交。
 */
export const POST = defineRoute({ auth: true, body: bodySchema }, async ({ user, body }) => {
  const state = await startApplyRun(user!.id, body);
  const { blockedReason, status, sessionId, jobTitle, applicationId } = state;
  return ok({ status, sessionId, jobTitle, applicationId, blockedReason }, status === "submitted" ? 201 : 200);
});
