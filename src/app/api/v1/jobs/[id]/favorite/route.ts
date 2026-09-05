import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { toggleFavorite } from "@/server/core/job-service";

export const POST = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  return ok({ favorited: await toggleFavorite(user!.id, id) });
});
