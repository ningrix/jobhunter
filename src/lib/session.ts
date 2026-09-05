import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ACCESS_COOKIE, verifyAccessToken } from "./auth";

/** 服务端组件读取会话（页面级鉴权用） */
export async function getSessionUser(): Promise<{ id: string; email: string; name: string } | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const { sub } = await verifyAccessToken(token);
    const [user] = await getDb().select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user || user.status !== "active") return null;
    return { id: user.id, email: user.email, name: user.name };
  } catch {
    return null;
  }
}
