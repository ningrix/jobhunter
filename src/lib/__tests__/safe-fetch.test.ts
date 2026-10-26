import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetchText } from "@/lib/safe-fetch";

/** Stage C：safeFetch SSRF 防护 */
describe("lib/safe-fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("拒绝非 http/https 协议", async () => {
    await expect(safeFetchText("file:///etc/passwd")).rejects.toMatchObject({ code: 1001 });
    await expect(safeFetchText("ftp://example.com/x")).rejects.toMatchObject({ code: 1001 });
  });

  it("拒绝 localhost 与内网/保留 IP 字面量", async () => {
    await expect(safeFetchText("http://localhost:3000/x")).rejects.toMatchObject({ code: 1003 });
    await expect(safeFetchText("http://127.0.0.1/x")).rejects.toMatchObject({ code: 1003 });
    await expect(safeFetchText("http://10.1.2.3/x")).rejects.toMatchObject({ code: 1003 });
    await expect(safeFetchText("http://192.168.1.1/x")).rejects.toMatchObject({ code: 1003 });
    await expect(safeFetchText("http://172.16.0.9/x")).rejects.toMatchObject({ code: 1003 });
    await expect(safeFetchText("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({
      code: 1003,
    });
  });

  it("域名解析到内网 IP 时拦截", async () => {
    await expect(
      safeFetchText("https://evil.example.com/x", {
        resolve: async () => [{ address: "10.0.0.5" }],
      }),
    ).rejects.toMatchObject({ code: 1003 });
  });

  it("域名解析失败报 7002", async () => {
    await expect(
      safeFetchText("https://nonexistent.example.com/x", {
        resolve: async () => [],
      }),
    ).rejects.toMatchObject({ code: 7002 });
  });

  it("公网域名 + stub fetch 成功取回文本", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("hello radar", { status: 200 })));
    const r = await safeFetchText("https://public.example.com/list", {
      resolve: async () => [{ address: "93.184.216.34" }],
    });
    expect(r.body).toBe("hello radar");
    expect(r.status).toBe(200);
  });

  it("响应超过 512KB 中止（7002）", async () => {
    const big = "x".repeat(600 * 1024);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(big, { status: 200 })));
    await expect(
      safeFetchText("https://public.example.com/big", {
        resolve: async () => [{ address: "93.184.216.34" }],
      }),
    ).rejects.toMatchObject({ code: 7002 });
  });

  it("重定向逐跳复检：302 到内网地址被拦截", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
      ),
    );
    await expect(
      safeFetchText("https://public.example.com/r", {
        resolve: async () => [{ address: "93.184.216.34" }],
      }),
    ).rejects.toMatchObject({ code: 1003 });
  });
});

describe("lib/safe-fetch · trustedSource（内置源放行 Clash fake-ip 段）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("默认拒绝 fake-ip 段：IPv6（fdfe:dcba:9876::/48 命中 fd 私有前缀）与 IPv4（198.18.0.0/15 之外的途径不可依赖，双栈下 IPv6 先触发）", async () => {
    await expect(
      safeFetchText("https://public.example.com/x", {
        resolve: async () => [{ address: "fdfe:dcba:9876::1e" }],
      }),
    ).rejects.toMatchObject({ code: 1003 });
  });

  it("trustedSource 放行 IPv4 fake-ip 段", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("hello", { status: 200 })));
    const r = await safeFetchText("https://public.example.com/x", {
      resolve: async () => [{ address: "198.18.0.37" }],
      trustedSource: true,
    });
    expect(r.body).toBe("hello");
  });

  it("trustedSource 放行 IPv6 fake-ip 段（fdfe:dcba:9876::/48）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("v6", { status: 200 })));
    const r = await safeFetchText("https://public.example.com/x", {
      resolve: async () => [{ address: "fdfe:dcba:9876::1e" }],
      trustedSource: true,
    });
    expect(r.body).toBe("v6");
  });

  it("trustedSource 仍拦截环回地址（127.0.0.1）", async () => {
    await expect(
      safeFetchText("https://public.example.com/x", {
        resolve: async () => [{ address: "127.0.0.1" }],
        trustedSource: true,
      }),
    ).rejects.toMatchObject({ code: 1003 });
  });

  it("trustedSource 仍拦截真实内网段（10.x）", async () => {
    await expect(
      safeFetchText("https://public.example.com/x", {
        resolve: async () => [{ address: "10.0.0.5" }],
        trustedSource: true,
      }),
    ).rejects.toMatchObject({ code: 1003 });
  });
});
