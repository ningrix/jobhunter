import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { AppError, ErrorCode } from "@/shared/errors";

/**
 * 对称加密工具：用于用户自带的 AI API Key 落库加密（AES-256-GCM）。
 * 主密钥优先取 AI_KEY_MASTER_SECRET；未配置时从 JWT_SECRET 以域分离标签派生（仅限本地开发，
 * 生产环境必须显式配置独立的 AI_KEY_MASTER_SECRET）。
 */
const KEY_INFO = "jobhunter-ai-key-master:v1";

function masterKey(): Buffer {
  const secret =
    process.env.AI_KEY_MASTER_SECRET ||
    process.env.JWT_SECRET ||
    "dev-secret-change-me-0123456789abcdef";
  return scryptSync(secret, KEY_INFO, 32);
}

/** 加密：返回 `iv.tag.ciphertext` 三段 base64（GCM 认证加密，防篡改） */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(".");
}

/** 解密：主密钥不匹配或密文被篡改时抛错（GCM 认证失败） */
export function decryptSecret(enc: string): string {
  const [ivB64, tagB64, dataB64] = enc.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new AppError(ErrorCode.INTERNAL, "密文格式非法");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(ErrorCode.INTERNAL, "密钥解密失败：主密钥不匹配或密文已损坏");
  }
}

/** 掩码展示：首3 + **** + 末4；过短全掩码。任何响应都不返回完整密钥 */
export function maskSecret(key: string): string {
  if (key.length < 10) return "****";
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

/** 从错误消息中移除密钥，防止上游响应体/异常信息带出用户凭据 */
export function sanitizeSecretMessage(message: string, secret?: string | null): string {
  if (!secret) return message;
  return message.split(secret).join("***");
}
