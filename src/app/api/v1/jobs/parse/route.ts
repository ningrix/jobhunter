import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { parseJdSchema } from "@/shared/schemas";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";

/** 粘贴 JD 先解析再保存：任务结果经 /ai-tasks/:id 轮询获取 */
export const POST = defineRoute({ auth: true, body: parseJdSchema }, async ({ user, body }) => {
  const task = await enqueueTask(user!.id, "parse_jd", { text: body.text });
  runTaskAsync(task.id);
  return ok({ taskId: task.id }, 202);
});
