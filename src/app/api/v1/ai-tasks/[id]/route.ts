import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { getTask } from "@/server/ai/runner";

export const GET = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  return ok(await getTask(user!.id, id, { requireOwner: true }));
});
