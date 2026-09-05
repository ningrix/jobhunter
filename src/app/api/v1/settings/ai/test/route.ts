import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { aiSettingsTestSchema } from "@/shared/schemas";
import { testAiConnection } from "@/server/ai/settings";

/** 连接测试：保存前用表单值即可测，成功/失败都不回显完整 key */
export const POST = defineRoute({ auth: true, body: aiSettingsTestSchema }, async ({ user, body }) => {
  return ok(await testAiConnection(user!.id, body));
});
