import { describe, expect, it, beforeEach } from "vitest";
import { GET as companySourcesRoute } from "@/app/api/v1/company-sources/route";
import { COMPANY_CATEGORIES, COMPANY_SOURCES, listCompanySources } from "@/server/core/company-sources";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

const EXPECTED_CATEGORIES = [
  "互联网",
  "人工智能",
  "智能硬件",
  "新能源与出行",
  "游戏与内容",
  "小而美",
  "银行",
  "招聘平台",
];

describe("company-sources 数据完整性", () => {
  it("id 唯一、url 全为 https 官方域名、分类合法", () => {
    const ids = COMPANY_SOURCES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMPANY_SOURCES) {
      expect(c.url.startsWith("https://")).toBe(true);
      expect(EXPECTED_CATEGORIES).toContain(c.category);
      expect(COMPANY_CATEGORIES).toContain(c.category);
      if (c.campusUrl) expect(c.campusUrl.startsWith("https://")).toBe(true);
    }
  });

  it("清单覆盖大厂/AI/银行/小而美/招聘平台且过半已验证", () => {
    const names = COMPANY_SOURCES.map((c) => c.name);
    for (const expected of [
      "腾讯",
      "字节跳动",
      "华为",
      "小米",
      "深度求索",
      "工商银行",
      "鹰角网络",
      "BOSS直聘",
    ]) {
      expect(names).toContain(expected);
    }
    const verified = COMPANY_SOURCES.filter((c) => c.verified).length;
    expect(verified).toBeGreaterThan(COMPANY_SOURCES.length / 2);
    // 待验证条目必须在 note 里向用户声明
    for (const c of COMPANY_SOURCES) {
      if (!c.verified) expect(c.note ?? "").toContain("待验证");
    }
  });

  it("分类覆盖：8 个分类非空、核心分类有规模、每个分类至少 1 家已验证", () => {
    expect(COMPANY_CATEGORIES).toEqual(EXPECTED_CATEGORIES);
    const countBy = (category: string) => COMPANY_SOURCES.filter((c) => c.category === category).length;
    for (const category of EXPECTED_CATEGORIES) {
      expect(countBy(category)).toBeGreaterThan(0);
      const verifiedInCategory = COMPANY_SOURCES.filter((c) => c.category === category && c.verified).length;
      expect(verifiedInCategory).toBeGreaterThan(0);
    }
    expect(countBy("互联网")).toBeGreaterThanOrEqual(40);
    expect(countBy("人工智能")).toBeGreaterThanOrEqual(10);
    expect(countBy("银行")).toBeGreaterThanOrEqual(20);
    expect(countBy("招聘平台")).toBeGreaterThanOrEqual(10);
  });

  it("listCompanySources 按分类与关键词过滤", () => {
    const hw = listCompanySources({ category: "智能硬件" });
    expect(hw.length).toBeGreaterThan(0);
    expect(hw.every((c) => c.category === "智能硬件")).toBe(true);
    const kw = listCompanySources({ keyword: "校招" });
    expect(kw.length).toBeGreaterThan(0);
    expect(listCompanySources({ keyword: "不存在的公司xyz" })).toEqual([]);
  });
});

describe("GET /api/v1/company-sources", () => {
  it("未登录 401；登录返回全量清单与统计", async () => {
    const anon = await callRoute(companySourcesRoute, {});
    expect(anon.status).toBe(401);

    const { token } = await createTestUser();
    const res = await callRoute(companySourcesRoute, { token });
    const data = expectOk(res.json) as {
      total: number;
      verifiedCount: number;
      categories: string[];
      items: { id: string; url: string }[];
    };
    expect(data.total).toBe(COMPANY_SOURCES.length);
    expect(data.verifiedCount).toBeGreaterThan(0);
    expect(data.categories.length).toBe(8);
    expect(data.items.length).toBe(data.total);
  });
});
