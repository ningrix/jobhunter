import { AppError, ErrorCode } from "@/shared/errors";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";
import { getProvider } from "@/server/ai/gateway";

/** V3.3 职位雷达：发起扫描（依赖自备大模型，mock 直接拒绝） */
export const POST = defineRoute({ auth: true }, async ({ user }) => {
  const provider = await getProvider(user!.id);
  if (provider.name === "mock") {
    throw new AppError(
      ErrorCode.VALIDATION,
      "职位雷达需要真实大模型：请先在「设置 → 自备模型」粘贴 API Key 并启用",
    );
  }
  const task = await enqueueTask(user!.id, "radar_search", { startedAt: new Date().toISOString() });
  runTaskAsync(task.id);
  return ok({ taskId: task.id }, 202);
});
