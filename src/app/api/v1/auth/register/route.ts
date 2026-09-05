import { issueTokensFor, setAuthCookies } from "@/lib/auth";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { registerSchema } from "@/shared/schemas";
import { registerUser, toPublicUser } from "@/server/core/auth-service";

export const POST = defineRoute({ body: registerSchema }, async ({ body }) => {
  const user = await registerUser(body);
  const tokens = await issueTokensFor(user);
  const res = ok({ user: toPublicUser(user) }, 201);
  setAuthCookies(res, tokens);
  return res;
});
