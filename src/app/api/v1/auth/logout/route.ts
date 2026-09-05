import { REFRESH_COOKIE, clearAuthCookies, revokeRefreshToken } from "@/lib/auth";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";

export const POST = defineRoute({}, async ({ req }) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (raw) await revokeRefreshToken(raw);
  const res = ok({ success: true });
  clearAuthCookies(res);
  return res;
});
