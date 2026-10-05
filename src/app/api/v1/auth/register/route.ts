import { AppError, ErrorCode } from "@/shared/errors";
import { issueTokensFor, setAuthCookies } from "@/lib/auth";
import { defineRoute } from "@/lib/api";
import { clientIp, hitRateLimit, peekRateLimit } from "@/lib/rate-limit";
import { ok } from "@/shared/response";
import { registerSchema } from "@/shared/schemas";
import { registerUser, toPublicUser } from "@/server/core/auth-service";

// 注册防滥用（含邮箱枚举探测）：同一 IP 每小时最多 10 次尝试（成败均计数）
const REGISTER_MAX = 10;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export const POST = defineRoute({ body: registerSchema }, async ({ req, body }) => {
  const rlKey = `register:${clientIp(req)}`;
  const gate = peekRateLimit(rlKey, { limit: REGISTER_MAX, windowMs: REGISTER_WINDOW_MS });
  if (!gate.ok) {
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      `注册尝试过于频繁，请约 ${Math.ceil(gate.retryAfterSec / 60)} 分钟后再试`,
    );
  }
  hitRateLimit(rlKey, { limit: REGISTER_MAX, windowMs: REGISTER_WINDOW_MS });
  const user = await registerUser(body);
  const tokens = await issueTokensFor(user);
  const res = ok({ user: toPublicUser(user) }, 201);
  setAuthCookies(res, tokens);
  return res;
});
