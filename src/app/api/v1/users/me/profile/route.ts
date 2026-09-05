import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { profileSchema } from "@/shared/schemas";
import { getProfile, updateProfile } from "@/server/core/user-service";

export const GET = defineRoute({ auth: true }, async ({ user }) => {
  return ok(await getProfile(user!.id));
});

export const PATCH = defineRoute({ auth: true, body: profileSchema }, async ({ user, body }) => {
  return ok(await updateProfile(user!.id, body));
});
