import net from "node:net";
import { lookup } from "node:dns/promises";
import { AppError, ErrorCode } from "@/shared/errors";

/**
 * Stage C：服务端抓取公开网页的安全封装（SSRF 防护）。
 * 仅 http/https；域名逐字面量与 DNS 解析双层校验，拒绝环回/私有/保留地址；
 * 重定向逐跳复检（≤3 跳）、15s 超时、响应 ≤512KB。
 */

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 512 * 1024;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface SafeFetchOptions {
  /** 测试注入用：默认 node:dns/promises lookup */
  resolve?: (host: string) => Promise<{ address: string }[]>;
}

function ipForbidden(ip: string): boolean {
  // IPv4-mapped IPv6 归一
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return ipForbidden(mapped[1]);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const low = ip.toLowerCase();
  return (
    low === "::" ||
    low === "::1" ||
    low.startsWith("fc") ||
    low.startsWith("fd") ||
    low.startsWith("fe8") ||
    low.startsWith("fe9") ||
    low.startsWith("fea") ||
    low.startsWith("feb") ||
    low.startsWith("ff")
  );
}

const BLOCKED_HOST_SUFFIX = [".localhost", ".local", ".internal", ".home.arpa"];

async function assertPublicUrl(urlStr: string, opts?: SafeFetchOptions): Promise<URL> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new AppError(ErrorCode.VALIDATION, `非法 URL：${urlStr.slice(0, 120)}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new AppError(ErrorCode.VALIDATION, "仅允许 http/https 协议");
  }
  const host = u.hostname.trim().toLowerCase();
  if (host === "localhost" || BLOCKED_HOST_SUFFIX.some((s) => host.endsWith(s))) {
    throw new AppError(ErrorCode.FORBIDDEN, "禁止访问内网/保留地址");
  }
  if (net.isIP(host)) {
    if (ipForbidden(host)) {
      throw new AppError(ErrorCode.FORBIDDEN, "禁止访问内网/保留 IP");
    }
    return u;
  }
  const resolve = opts?.resolve ?? ((h: string) => lookup(h, { all: true }));
  let addrs: { address: string }[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, `域名解析失败：${host}`);
  }
  if (!addrs?.length) {
    throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, `域名解析失败：${host}`);
  }
  if (addrs.some((a) => ipForbidden(a.address))) {
    throw new AppError(ErrorCode.FORBIDDEN, "目标域名解析到内网/保留地址，已拦截");
  }
  return u;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

/** 抓取公开页面文本：SSRF 全套防护 + 大小/超时上限。失败抛 AppError（任务优雅失败用） */
export async function safeFetchText(rawUrl: string, opts?: SafeFetchOptions): Promise<SafeFetchResult> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertPublicUrl(current, opts);
    let res: Response;
    try {
      res = await fetch(u, {
        redirect: "manual",
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "accept-language": "zh-CN,zh;q=0.9",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new AppError(
        ErrorCode.SOURCE_UNAVAILABLE,
        `抓取失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, `重定向缺少 Location（${res.status}）`);
      current = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) {
      throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, `目标站点返回 ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, "响应无内容");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, "响应超过 512KB 上限，已中止");
      }
      chunks.push(value);
    }
    return {
      url: u.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body: Buffer.concat(chunks).toString("utf8"),
    };
  }
  throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, "重定向次数超过上限");
}
