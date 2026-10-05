import { AppError, ErrorCode } from "@/shared/errors";
import { issueTokensFor, setAuthCookies } from "@/lib/auth";
import { defineRoute } from "@/lib/api";
import { clearRateLimit, clientIp, hitRateLimit, peekRateLimit } from "@/lib/rate-limit";
import { ok } from "@/shared/response";
import { loginSchema } from "@/shared/schemas";
import { loginUser, toPublicUser } from "@/server/core/auth-service";

// 暴力破解防护：同一 IP+邮箱 15 分钟内最多 5 次失败尝试
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const POST = defineRoute({ body: loginSchema }, async ({ req, body }) => {
  const rlKey = `login:${clientIp(req)}:${body.email.toLowerCase()}`;
  const gate = peekRateLimit(rlKey, { limit: LOGIN_MAX_FAILS, windowMs: LOGIN_WINDOW_MS });
  if (!gate.ok) {
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      `登录尝试过于频繁，请约 ${Math.ceil(gate.retryAfterSec / 60)} 分钟后再试`,
    );
  }
  try {
    const user = await loginUser(body);
    clearRateLimit(rlKey); // 成功即清零，正常用户的偶发失败不累积
    const tokens = await issueTokensFor(user);
    const res = ok({ user: toPublicUser(user) });
    setAuthCookies(res, tokens);
    return res;
  } catch (e) {
    hitRateLimit(rlKey, { limit: LOGIN_MAX_FAILS, windowMs: LOGIN_WINDOW_MS });
    throw e;
  }
});
