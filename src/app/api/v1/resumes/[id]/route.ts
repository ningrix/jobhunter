import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { updateResumeSchema } from "@/shared/schemas";
import {
  getResumeDetail,
  softDeleteResume,
  updateResume,
} from "@/server/core/resume-service";

type Params = { params: Promise<{ id: string }> };

export const GET = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  return ok(await getResumeDetail(user!.id, id));
});

export const PATCH = defineRoute(
  { auth: true, body: updateResumeSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    return ok(await updateResume(user!.id, id, body));
  },
);

export const DELETE = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  await softDeleteResume(user!.id, id);
  return ok({ success: true });
});
