import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { getMatch } from "@/server/core/match-service";

export const GET = defineRoute({ auth: true }, async ({ user, params }) => {
  const { id } = params as unknown as { id: string };
  return ok(await getMatch(user!.id, id));
});
