import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { userProfiles, users } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { hashPassword, verifyPassword } from "@/lib/auth";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
}

type UserRow = typeof users.$inferSelect;

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<UserRow> {
  const db = getDb();
  const email = input.email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw new AppError(ErrorCode.EMAIL_EXISTS, "该邮箱已被注册");

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(input.password), name: input.name.trim() })
    .returning();
  await db.insert(userProfiles).values({ userId: user.id }).onConflictDoNothing();
  return user;
}

export async function loginUser(input: { email: string; password: string }): Promise<UserRow> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase().trim()))
    .limit(1);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, "邮箱或密码错误");
  }
  if (user.status !== "active") throw new AppError(ErrorCode.USER_DISABLED, "账号已被禁用");
  return user;
}

export async function getUserById(id: string): Promise<UserRow> {
  const [user] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new AppError(ErrorCode.NOT_FOUND, "用户不存在");
  return user;
}
