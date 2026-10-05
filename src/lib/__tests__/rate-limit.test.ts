import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearRateLimit,
  hitRateLimit,
  peekRateLimit,
} from "@/lib/rate-limit";

const OPTS = { limit: 3, windowMs: 60_000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rate-limit 滑动窗口限流器", () => {
  it("窗口内放行至 limit 次，超过后拒绝并给出重试秒数", () => {
    expect(hitRateLimit("k1", OPTS).ok).toBe(true);
    expect(hitRateLimit("k1", OPTS).ok).toBe(true);
    expect(hitRateLimit("k1", OPTS).ok).toBe(true);
    const blocked = hitRateLimit("k1", OPTS);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("窗口滑过后重新放行", () => {
    hitRateLimit("k2", OPTS);
    hitRateLimit("k2", OPTS);
    hitRateLimit("k2", OPTS);
    expect(hitRateLimit("k2", OPTS).ok).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(hitRateLimit("k2", OPTS).ok).toBe(true);
  });

  it("peek 只检查不消耗额度", () => {
    hitRateLimit("k3", OPTS);
    hitRateLimit("k3", OPTS);
    expect(peekRateLimit("k3", OPTS).ok).toBe(true);
    expect(peekRateLimit("k3", OPTS).ok).toBe(true);
    expect(hitRateLimit("k3", OPTS).ok).toBe(true);
    expect(peekRateLimit("k3", OPTS).ok).toBe(false);
  });

  it("clear 清零单个 key，不同 key 互不影响", () => {
    hitRateLimit("a", OPTS);
    hitRateLimit("b", OPTS);
    clearRateLimit("a");
    expect(hitRateLimit("a", OPTS).ok).toBe(true);
    expect(peekRateLimit("b", OPTS).ok).toBe(true);
  });
});
