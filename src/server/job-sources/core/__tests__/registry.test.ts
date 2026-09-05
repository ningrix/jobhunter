import { describe, expect, it, beforeEach } from "vitest";
import {
  getJobSource,
  hasJobSource,
  healthCheckAll,
  listJobSources,
  registerJobSource,
} from "../registry";
import type { JobSource, JobSourceMeta } from "../types";
import { resetDb } from "@/testing/helpers";

beforeEach(() => {
  // registry 是进程内单例，测试注册/清理均在独立 id 空间进行
});

function fakeSource(id: string, overrides: Partial<JobSource> = {}): JobSource {
  const meta: JobSourceMeta = {
    id: id as JobSourceMeta["id"],
    name: `测试来源 ${id}`,
    status: "available",
    capabilities: { search: false, assistedImport: true, autoApply: "none", requiresLogin: false },
  };
  return {
    id,
    meta: () => meta,
    capabilities: () => meta.capabilities,
    healthCheck: async () => ({ ok: true, detail: "ok" }),
    ...overrides,
  };
}

describe("job source registry", () => {
  it("注册后可查询、列出；未注册返回 undefined", async () => {
    registerJobSource(fakeSource("test-a"));
    expect(hasJobSource("test-a")).toBe(true);
    expect(getJobSource("test-a")?.id).toBe("test-a");
    expect(getJobSource("nope")).toBeUndefined();
    expect(listJobSources().map((s) => s.id)).toContain("test-a");
  });

  it("重复注册同一 id 以最新为准", () => {
    registerJobSource(fakeSource("test-b", { healthCheck: async () => ({ ok: true, detail: "v1" }) }));
    registerJobSource(fakeSource("test-b", { healthCheck: async () => ({ ok: true, detail: "v2" }) }));
    const src = getJobSource("test-b")!;
    void src;
    return healthCheckAll().then((all) => {
      const entry = all.find((h) => h.id === "test-b");
      expect(entry?.detail).toBe("v2");
    });
  });

  it("healthCheckAll 聚合各来源健康状态与失败隔离", async () => {
    registerJobSource(fakeSource("test-ok"));
    registerJobSource(
      fakeSource("test-down", {
        healthCheck: async () => {
          throw new Error("网络不可达");
        },
      }),
    );
    const all = await healthCheckAll();
    const ok = all.find((h) => h.id === "test-ok");
    const down = all.find((h) => h.id === "test-down");
    expect(ok).toMatchObject({ ok: true, detail: "ok" });
    // 单来源失败不抛出，降级为 ok:false
    expect(down).toMatchObject({ ok: false });
    expect(String(down?.detail)).toContain("网络不可达");
  });

  it("meta 携带能力模型", () => {
    const s = fakeSource("test-c", {
      meta: () => ({
        id: "test-c" as JobSourceMeta["id"],
        name: "C",
        status: "available",
        capabilities: { search: true, assistedImport: true, autoApply: "assisted", requiresLogin: false },
      }),
    });
    registerJobSource(s);
    const meta = listJobSources().find((m) => m.id === "test-c")!;
    expect(meta.capabilities.search).toBe(true);
    expect(meta.capabilities.autoApply).toBe("assisted");
  });
});
