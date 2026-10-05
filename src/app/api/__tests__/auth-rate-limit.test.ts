import { describe, expect, it, beforeEach } from "vitest";
import { POST as registerRoute } from "@/app/api/v1/auth/register/route";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { callRoute, createTestUser, resetDb } from "@/testing/helpers";
import { resetRateLimits } from "@/lib/rate-limit";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
});

describe("登录/注册限流（P2-1）", () => {
  it("同一 IP+邮箱 连续 5 次密码错误后触发 429/1006，正确密码也被拒", async () => {
    await createTestUser("bf@test.cn");
    for (let i = 0; i < 5; i++) {
      const bad = await callRoute(loginRoute, {
        method: "POST",
        body: { email: "bf@test.cn", password: `wrong-${i}` },
      });
      expect(bad.status).toBe(401);
    }
    const blocked = await callRoute(loginRoute, {
      method: "POST",
      body: { email: "bf@test.cn", password: "password123" },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.json.code).toBe(1006);
  });

  it("登录成功清零失败计数，不误伤正常用户", async () => {
    await createTestUser("ok@test.cn");
    const fail = await callRoute(loginRoute, {
      method: "POST",
      body: { email: "ok@test.cn", password: "wrong" },
    });
    expect(fail.status).toBe(401);
    const good = await callRoute(loginRoute, {
      method: "POST",
      body: { email: "ok@test.cn", password: "password123" },
    });
    expect(good.status).toBe(200);
    // 失败计数已被成功清零：可继续正常登录
    const again = await callRoute(loginRoute, {
      method: "POST",
      body: { email: "ok@test.cn", password: "password123" },
    });
    expect(again.status).toBe(200);
  });

  it("不同邮箱互不影响限流计数", async () => {
    await createTestUser("a@test.cn");
    await createTestUser("b@test.cn");
    for (let i = 0; i < 5; i++) {
      await callRoute(loginRoute, {
        method: "POST",
        body: { email: "a@test.cn", password: "wrong" },
      });
    }
    const aBlocked = await callRoute(loginRoute, {
      method: "POST",
      body: { email: "a@test.cn", password: "password123" },
    });
    expect(aBlocked.status).toBe(429);
    const bOk = await callRoute(loginRoute, {
      method: "POST",
      body: { email: "b@test.cn", password: "password123" },
    });
    expect(bOk.status).toBe(200);
  });

  it("同一 IP 注册满 10 次后返回 429/1006", async () => {
    for (let i = 0; i < 10; i++) {
      const reg = await callRoute(registerRoute, {
        method: "POST",
        body: { email: `reg-${i}@test.cn`, password: "password123", name: `用户${i}` },
      });
      expect(reg.status).toBe(201);
    }
    const blocked = await callRoute(registerRoute, {
      method: "POST",
      body: { email: "reg-over@test.cn", password: "password123", name: "超限" },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.json.code).toBe(1006);
  });
});
