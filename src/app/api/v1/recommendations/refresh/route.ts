import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { refreshRecommendationsSchema } from "@/shared/schemas";
import { refreshRecommendations } from "@/server/core/recommendation-service";

/** Level 0：对全部活跃职位批量重算规则匹配（无 AI 成本） */
export const POST = defineRoute(
  { auth: true, body: refreshRecommendationsSchema },
  async ({ user, body }) => {
    return ok(await refreshRecommendations(user!.id, body.resumeId));
  },
);
