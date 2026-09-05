import { issueTokensFor, setAuthCookies } from "@/lib/auth";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { loginSchema } from "@/shared/schemas";
import { loginUser, toPublicUser } from "@/server/core/auth-service";

export const POST = defineRoute({ body: loginSchema }, async ({ body }) => {
  const user = await loginUser(body);
  const tokens = await issueTokensFor(user);
  const res = ok({ user: toPublicUser(user) });
  setAuthCookies(res, tokens);
  return res;
});
