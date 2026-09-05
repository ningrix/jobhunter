import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { refreshTokens, users } from "@/db/schema";
import { ErrorCode, AppError } from "@/shared/errors";

export const ACCESS_COOKIE = "jh_access";
export const REFRESH_COOKIE = "jh_refresh";
const ACCESS_TTL_SEC = 60 * 15; // 15 分钟
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

function secretKey(): Uint8Array {
  const s = process.env.JWT_SECRET ?? "dev-secret-change-me-0123456789abcdef";
  return new TextEncoder().encode(s);
}

// —— 密码 ——
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

// —— Access Token（JWT）——
export async function signAccessToken(user: { id: string; email: string }): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, secretKey());
  if (!payload.sub) throw new Error("token missing sub");
  return { sub: payload.sub };
}

// —— Refresh Token（随机令牌，仅存 sha256 哈希）——
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await getDb()
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
  return raw;
}

/** 轮换刷新令牌：旧令牌作废并返回新令牌；无效返回 null */
export async function rotateRefreshToken(raw: string): Promise<{ userId: string; token: string } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(raw)))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) return null;
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));
  const user = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user[0] || user[0].status !== "active") return null;
  const token = await issueRefreshToken(row.userId);
  return { userId: row.userId, token };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await getDb()
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, hashToken(raw)));
}

// —— 会话 ——
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const bearer = req.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ")
    ? bearer.slice(7)
    : req.cookies.get(ACCESS_COOKIE)?.value;
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

export async function issueTokensFor(user: { id: string; email: string }) {
  return {
    accessToken: await signAccessToken(user),
    refreshToken: await issueRefreshToken(user.id),
  };
}

export function setAuthCookies(res: NextResponse, tokens: { accessToken: string; refreshToken: string }) {
  const base = { httpOnly: true, sameSite: "lax" as const, path: "/" };
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_TTL_SEC });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: REFRESH_TTL_MS / 1000,
  });
}

export function clearAuthCookies(res: NextResponse) {
  const base = { httpOnly: true, sameSite: "lax" as const, path: "/" };
  res.cookies.set(ACCESS_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...base, maxAge: 0 });
}

export { AppError, ErrorCode };
