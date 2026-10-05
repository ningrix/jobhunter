import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ACCESS_COOKIE, getOrCreateLocalUser, isLocalSingleUserMode, verifyAccessToken } from "./auth";

/** 服务端组件读取会话（页面级鉴权用）；dev 本地单用户模式下回落到本地用户 */
export async function getSessionUser(): Promise<{ id: string; email: string; name: string } | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (token) {
    try {
      const { sub } = await verifyAccessToken(token);
      const [user] = await getDb().select().from(users).where(eq(users.id, sub)).limit(1);
      if (user && user.status === "active") {
        return { id: user.id, email: user.email, name: user.name };
      }
    } catch {
      // 无效/过期令牌 → 落到本地单用户回落（dev）
    }
  }
  if (isLocalSingleUserMode()) return getOrCreateLocalUser();
  return null;
}
