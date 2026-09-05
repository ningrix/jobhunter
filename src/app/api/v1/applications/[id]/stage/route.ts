import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { stageTransitionSchema } from "@/shared/schemas";
import { transitionStage } from "@/server/core/application-service";

export const POST = defineRoute(
  { auth: true, body: stageTransitionSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    return ok(await transitionStage(user!.id, id, body.toStage, body.note));
  },
);
