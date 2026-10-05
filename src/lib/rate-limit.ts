import type { NextRequest } from "next/server";

/**
 * 进程内滑动窗口限流：仅用于登录/注册等低频敏感端点的暴力破解防护。
 * 单实例部署语义（SQLite + 单 Node 进程）下够用；多实例需换集中式存储。
 */

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export interface RateLimitOptions {
  /** 窗口内允许的次数 */
  limit: number;
  /** 窗口长度（毫秒） */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** 被限流时：距窗口最早一次记录过期的秒数（至少 1） */
  retryAfterSec: number;
}

/** 记录一次并判断是否超限 */
export function hitRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: retryAfter(hits[0], opts.windowMs, now) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_KEYS) pruneExpired(now, opts.windowMs);
  return { ok: true, retryAfterSec: 0 };
}

/** 只看不记：检查是否已被限流（不消耗额度） */
export function peekRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    return { ok: false, retryAfterSec: retryAfter(hits[0], opts.windowMs, now) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** 成功后清零（如登录成功），避免正常用户被历史失败累积误伤 */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** 测试专用：清空全部计数 */
export function resetRateLimits(): void {
  buckets.clear();
}

function retryAfter(oldest: number, windowMs: number, now: number): number {
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, hits] of buckets) {
    if (!hits.length || now - hits[hits.length - 1] >= windowMs) buckets.delete(key);
  }
}

/** 反代场景取真实客户端 IP：x-forwarded-for 首段 → x-real-ip → unknown */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
