import { describe, expect, it, beforeEach } from "vitest";
import { AppError, ErrorCode } from "@/shared/errors";
import {
  loginUser,
  registerUser,
  toPublicUser,
} from "@/server/core/auth-service";
import { issueTokensFor, revokeRefreshToken, rotateRefreshToken } from "@/lib/auth";
import { getProfile, updateProfile } from "@/server/core/user-service";
import { resetDb } from "@/testing/helpers";

beforeEach(resetDb);

describe("auth-service", () => {
  it("注册：创建用户与默认画像，重复邮箱报 2001", async () => {
    const user = await registerUser({ email: "a@test.cn", password: "password123", name: "张三" });
    expect(user.email).toBe("a@test.cn");
    expect(user.passwordHash).not.toContain("password123");
    const profile = await getProfile(user.id);
    expect(profile.userId).toBe(user.id);
    expect(profile.skills).toEqual([]);

    await expect(
      registerUser({ email: "a@test.cn", password: "password123", name: "李四" }),
    ).rejects.toMatchObject({ code: ErrorCode.EMAIL_EXISTS });
  });

  it("登录：正确密码成功，错误密码报 2002 且状态码 401", async () => {
    await registerUser({ email: "b@test.cn", password: "password123", name: "李四" });
    const user = await loginUser({ email: "b@test.cn", password: "password123" });
    expect(user.name).toBe("李四");

    const err = (await loginUser({ email: "b@test.cn", password: "wrong-pass" }).catch(
      (e) => e,
    )) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(err.httpStatus).toBe(401);
  });

  it("刷新令牌：可轮换一次，旧令牌立即失效", async () => {
    const user = await registerUser({ email: "c@test.cn", password: "password123", name: "王五" });
    const tokens = await issueTokensFor(user);

    const rotated = await rotateRefreshToken(tokens.refreshToken);
    expect(rotated).not.toBeNull();
    expect(rotated!.userId).toBe(user.id);

    // 旧令牌已被吊销
    const again = await rotateRefreshToken(tokens.refreshToken);
    expect(again).toBeNull();

    // 新令牌可用
    const rotated2 = await rotateRefreshToken(rotated!.token);
    expect(rotated2).not.toBeNull();

    // 主动吊销后不可用
    await revokeRefreshToken(rotated2!.token);
    expect(await rotateRefreshToken(rotated2!.token)).toBeNull();
  });

  it("toPublicUser 不泄露密码哈希", async () => {
    const user = await registerUser({ email: "d@test.cn", password: "password123", name: "赵六" });
    const pub = toPublicUser(user) as unknown as Record<string, unknown>;
    expect(pub.passwordHash).toBeUndefined();
    expect(pub.email).toBe("d@test.cn");
  });
});

describe("user-service profile", () => {
  it("默认画像存在，PATCH 局部更新保留其余字段", async () => {
    const user = await registerUser({ email: "e@test.cn", password: "password123", name: "孙七" });

    const updated = await updateProfile(user.id, {
      expectedPosition: "前端工程师",
      expectedCity: "上海",
      salaryMin: 15,
      salaryMax: 25,
      skills: ["React", "TypeScript"],
    });
    expect(updated.expectedPosition).toBe("前端工程师");
    expect(updated.skills).toEqual(["React", "TypeScript"]);

    const patched = await updateProfile(user.id, { expectedCity: "北京" });
    expect(patched.expectedPosition).toBe("前端工程师"); // 未传字段保留
    expect(patched.expectedCity).toBe("北京");
  });
});
