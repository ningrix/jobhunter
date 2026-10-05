import { describe, expect, it, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getOrCreateLocalUser, isLocalSingleUserMode, LOCAL_USER_EMAIL } from "@/lib/auth";
import { resetDb } from "@/testing/helpers";

beforeEach(resetDb);

describe("isLocalSingleUserMode", () => {
  it("仅 development 且未显式 AUTH_MODE=login 时开启；生产/测试始终关闭", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.AUTH_MODE;
    expect(isLocalSingleUserMode()).toBe(true);

    process.env.AUTH_MODE = "login";
    expect(isLocalSingleUserMode()).toBe(false);
    delete process.env.AUTH_MODE;

    vi.stubEnv("NODE_ENV", "production");
    expect(isLocalSingleUserMode()).toBe(false);

    vi.stubEnv("NODE_ENV", "test");
    expect(isLocalSingleUserMode()).toBe(false);

    vi.unstubAllEnvs();
  });
});

describe("getOrCreateLocalUser", () => {
  it("幂等：多次调用返回同一用户，库中仅一行", async () => {
    const a = await getOrCreateLocalUser();
    const b = await getOrCreateLocalUser();
    expect(a.id).toBe(b.id);
    expect(a.email).toBe(LOCAL_USER_EMAIL);
    expect(a.name).toBe("本地用户");

    const rows = await getDb().select().from(users).where(eq(users.email, LOCAL_USER_EMAIL));
    expect(rows).toHaveLength(1);
  });
});
