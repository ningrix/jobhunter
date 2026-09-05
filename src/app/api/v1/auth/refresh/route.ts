import { eq } from "drizzle-orm";
import {
  REFRESH_COOKIE,
  rotateRefreshToken,
  setAuthCookies,
  signAccessToken,
} from "@/lib/auth";
import { defineRoute } from "@/lib/api";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { ok } from "@/shared/response";
import { toPublicUser } from "@/server/core/auth-service";

export const POST = defineRoute({}, async ({ req }) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) throw new AppError(ErrorCode.UNAUTHORIZED, "缺少刷新令牌");
  const rotated = await rotateRefreshToken(raw);
  if (!rotated) throw new AppError(ErrorCode.UNAUTHORIZED, "刷新令牌无效或已过期");

  const [user] = await getDb().select().from(users).where(eq(users.id, rotated.userId)).limit(1);
  if (!user) throw new AppError(ErrorCode.UNAUTHORIZED, "用户不存在");

  const accessToken = await signAccessToken(user);
  const res = ok({ user: toPublicUser(user) });
  setAuthCookies(res, { accessToken, refreshToken: rotated.token });
  return res;
});
