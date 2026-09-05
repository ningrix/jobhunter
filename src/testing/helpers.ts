import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { registerUser } from "@/server/core/auth-service";
import { issueTokensFor } from "@/lib/auth";

/** 清空所有业务表（外键顺序），测试间隔离 */
export async function resetDb(): Promise<void> {
  const db = getDb();
  const tables = [
    schema.aiUsageLogs,
    schema.aiSettings,
    schema.aiTasks,
    schema.notifications,
    schema.reminders,
    schema.applicationEvents,
    schema.applications,
    schema.jobMatches,
    schema.embeddings,
    schema.jobFavorites,
    schema.jobs,
    schema.resumeAnalyses,
    schema.resumeFiles,
    schema.resumeVersions,
    schema.resumes,
    schema.files,
    schema.companies,
    schema.refreshTokens,
    schema.userProfiles,
    schema.users,
  ];
  for (const t of tables) await db.delete(t);
}

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

export interface CallRouteOptions {
  method?: string;
  url?: string;
  body?: unknown;
  token?: string;
  params?: Record<string, string>;
  cookie?: string;
}

/** 直接调用 route handler（免起 Next 服务），返回 status + json + 原始响应 */
export async function callRoute(
  handler: RouteHandler,
  opts: CallRouteOptions = {},
): Promise<{ status: number; json: Record<string, unknown>; res: NextResponse }> {
  const headers: Record<string, string> = {};
  const isForm = opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers["content-type"] = "application/json";
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.cookie) headers["cookie"] = opts.cookie;

  const req = new NextRequest(
    `http://test.local${opts.url ?? "/"}`,
    {
      method: opts.method ?? "GET",
      headers,
      ...(opts.body !== undefined
        ? { body: isForm ? (opts.body as BodyInit) : JSON.stringify(opts.body) }
        : {}),
      ...(isForm ? {} : { duplex: "half" }),
    } as unknown as ConstructorParameters<typeof NextRequest>[1],
  );

  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json, res };
}

export function cookieValue(res: NextResponse, name: string): string | undefined {
  const list =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const [pair] = c.split(";");
    const [k, ...rest] = pair.split("=");
    if (k.trim() === name) return rest.join("=");
  }
  return undefined;
}

export async function createTestUser(email?: string, name = "测试用户") {
  const user = await registerUser({
    email: email ?? `user-${crypto.randomUUID().slice(0, 8)}@test.cn`,
    password: process.env.TEST_USER_PASSWORD ?? "password123",
    name,
  });
  const tokens = await issueTokensFor(user);
  return { user, token: tokens.accessToken, refreshToken: tokens.refreshToken };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectOk(json: Record<string, unknown>): any {
  if (json.code !== 0) throw new Error(`期望成功响应，实际: ${JSON.stringify(json)}`);
  return json.data;
}
