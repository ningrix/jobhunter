import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { toPublicUser, getUserById } from "@/server/core/auth-service";
import { getProfile } from "@/server/core/user-service";

export const GET = defineRoute({ auth: true }, async ({ user }) => {
  const u = await getUserById(user!.id);
  const profile = await getProfile(user!.id);
  return ok({ user: toPublicUser(u), profile });
});
