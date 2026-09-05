import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { updateApplicationSchema } from "@/shared/schemas";
import {
  deleteApplication,
  getApplicationDetail,
  updateApplication,
} from "@/server/core/application-service";

type Params = { params: Promise<{ id: string }> };

export const GET = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  return ok(await getApplicationDetail(user!.id, id));
});

export const PATCH = defineRoute(
  { auth: true, body: updateApplicationSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    return ok(await updateApplication(user!.id, id, body));
  },
);

export const DELETE = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  await deleteApplication(user!.id, id);
  return ok({ success: true });
});
