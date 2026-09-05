import { describe, expect, it, beforeEach } from "vitest";
import { POST as registerRoute } from "@/app/api/v1/auth/register/route";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as refreshRoute } from "@/app/api/v1/auth/refresh/route";
import { POST as logoutRoute } from "@/app/api/v1/auth/logout/route";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { GET as getProfileRoute, PATCH as patchProfileRoute } from "@/app/api/v1/users/me/profile/route";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { callRoute, cookieValue, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

describe("auth API", () => {
  it("注册返回 201 并种下双 cookie；me 接口可读会话", async () => {
    const reg = await callRoute(registerRoute, {
      method: "POST",
      body: { email: "api@test.cn", password: "password123", name: "接口用户" },
    });
    expect(reg.status).toBe(201);
    const data = expectOk(reg.json) as { user: { email: string } };
    expect(data.user.email).toBe("api@test.cn");
    expect(cookieValue(reg.res, ACCESS_COOKIE)).toBeTruthy();
    expect(cookieValue(reg.res, REFRESH_COOKIE)).toBeTruthy();

    const token = cookieValue(reg.res, ACCESS_COOKIE)!;
    const me = await callRoute(meRoute, { token });
    expect(me.status).toBe(200);
    const meData = expectOk(me.json) as { user: { email: string }; profile: { skills: string[] } };
    expect(meData.user.email).toBe("api@test.cn");
    expect(meData.profile.skills).toEqual([]);
  });

  it("未登录访问 me 返回 401 / 1002", async () => {
    const res = await callRoute(meRoute);
    expect(res.status).toBe(401);
    expect(res.json.code).toBe(1002);
  });

  it("登录失败返回 401 / 2002；参数非法返回 400 / 1001", async () => {
    await createTestUser("api2@test.cn");
    const bad = await callRoute(loginRoute, {
      method: "POST",
      body: { email: "api2@test.cn", password: "wrong-password" },
    });
    expect(bad.status).toBe(401);
    expect(bad.json.code).toBe(2002);

    const invalid = await callRoute(registerRoute, {
      method: "POST",
      body: { email: "not-an-email", password: "short", name: "" },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.json.code).toBe(1001);
  });

  it("刷新轮换 cookie，登出后旧刷新令牌失效", async () => {
    const { refreshToken } = await createTestUser("api3@test.cn");

    const refreshed = await callRoute(refreshRoute, {
      method: "POST",
      cookie: `${REFRESH_COOKIE}=${refreshToken}`,
    });
    expect(refreshed.status).toBe(200);
    const newRefresh = cookieValue(refreshed.res, REFRESH_COOKIE)!;
    expect(newRefresh).not.toBe(refreshToken);

    await callRoute(logoutRoute, {
      method: "POST",
      cookie: `${REFRESH_COOKIE}=${newRefresh}`,
    });
    const reused = await callRoute(refreshRoute, {
      method: "POST",
      cookie: `${REFRESH_COOKIE}=${newRefresh}`,
    });
    expect(reused.status).toBe(401);
  });

  it("profile PATCH 校验与鉴权", async () => {
    const { token } = await createTestUser("api4@test.cn");

    const patched = await callRoute(patchProfileRoute, {
      method: "PATCH",
      token,
      body: { expectedCity: "杭州", experienceYears: 3, salaryMin: 20 },
    });
    expect(patched.status).toBe(200);
    const data = expectOk(patched.json) as { expectedCity: string };
    expect(data.expectedCity).toBe("杭州");

    const got = await callRoute(getProfileRoute, { token });
    const profile = expectOk(got.json) as { experienceYears: number };
    expect(profile.experienceYears).toBe(3);

    const noAuth = await callRoute(patchProfileRoute, {
      method: "PATCH",
      body: { expectedCity: "北京" },
    });
    expect(noAuth.status).toBe(401);
  });
});
