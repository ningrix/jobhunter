import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret, sanitizeSecretMessage } from "../crypto";

/** Stage A-1：用户 API Key 加密模块（AES-256-GCM + 主密钥派生） */
describe("lib/crypto secrets", () => {
  const ORIGINAL_MASTER = process.env.AI_KEY_MASTER_SECRET;
  const ORIGINAL_JWT = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.AI_KEY_MASTER_SECRET = "test-master-secret-0123456789";
  });

  afterEach(() => {
    if (ORIGINAL_MASTER === undefined) delete process.env.AI_KEY_MASTER_SECRET;
    else process.env.AI_KEY_MASTER_SECRET = ORIGINAL_MASTER;
    if (ORIGINAL_JWT === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT;
  });

  it("加密后解密还原原文", () => {
    const plain = "sk-zhipu-test-key-1234567890";
    const enc = encryptSecret(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("密文不含明文，且为 iv.tag.data 三段 base64", () => {
    const plain = "sk-very-secret-key-abcdef";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    const parts = enc.split(".");
    expect(parts).toHaveLength(3);
    for (const p of parts) expect(p).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("篡改密文后解密失败", () => {
    const enc = encryptSecret("sk-tamper-target-987654321");
    const parts = enc.split(".");
    const data = Buffer.from(parts[2], "base64");
    data[0] = data[0] ^ 0xff;
    parts[2] = data.toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("更换主密钥后旧密文不可解", () => {
    const enc = encryptSecret("sk-old-key-1122334455");
    process.env.AI_KEY_MASTER_SECRET = "another-master-secret-99887766";
    expect(() => decryptSecret(enc)).toThrow();
  });

  it("未配置 MASTER_SECRET 时从 JWT_SECRET 派生，密钥随 JWT_SECRET 变化", () => {
    delete process.env.AI_KEY_MASTER_SECRET;
    process.env.JWT_SECRET = "jwt-derived-secret-1111";
    const enc = encryptSecret("sk-fallback-key-aabbccdd");
    expect(decryptSecret(enc)).toBe("sk-fallback-key-aabbccdd");

    process.env.JWT_SECRET = "jwt-derived-secret-2222";
    expect(() => decryptSecret(enc)).toThrow();
  });

  it("maskSecret 保留首3末4，短密钥全掩码", () => {
    expect(maskSecret("sk-abc123456789")).toBe("sk-****6789");
    expect(maskSecret("short")).toBe("****");
  });

  it("sanitizeSecretMessage 移除消息中的密钥", () => {
    const msg = "Bearer sk-secret-9999 调用失败";
    expect(sanitizeSecretMessage(msg, "sk-secret-9999")).toBe("Bearer *** 调用失败");
    expect(sanitizeSecretMessage(msg, null)).toBe(msg);
  });
});
