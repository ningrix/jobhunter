import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { getBoard } from "@/server/core/application-service";

export const GET = defineRoute({ auth: true }, async ({ user }) => {
  return ok(await getBoard(user!.id));
});
