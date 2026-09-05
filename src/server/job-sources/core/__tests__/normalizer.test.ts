import { describe, expect, it } from "vitest";
import {
  canonicalCity,
  computeFingerprint,
  extractSourceJobId,
  normalizeJobContentForFingerprint,
  normalizeCompanyName,
  normalizeToUnified,
} from "../normalizer";

const BOSS_JD = `高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
岗位职责：
- 负责核心业务前端开发与性能优化`;

describe("extractSourceJobId", () => {
  it("BOSS job_detail URL 提取 ID", () => {
    expect(extractSourceJobId("https://www.zhipin.com/job_detail/abc123def.html?lid=7", "boss")).toBe(
      "abc123def",
    );
  });
  it("通用 jobId 查询参数", () => {
    expect(extractSourceJobId("https://example.com/job?jobId=xyz9", "company-career")).toBe("xyz9");
  });
  it("无法提取时返回 undefined", () => {
    expect(extractSourceJobId(undefined, "boss")).toBeUndefined();
    expect(extractSourceJobId("https://www.zhipin.com/", "boss")).toBeUndefined();
  });
});

describe("指纹规范化（deterministic normalization）", () => {
  it("去 HTML 标签 / URL / 日期 / 压空白 / 小写", () => {
    const out = normalizeJobContentForFingerprint(
      "<p>负责 <b>React</b> 开发</p>官网 https://example.com/a?id=1 发布于 2026-08-01",
    );
    expect(out).not.toContain("<");
    expect(out).not.toContain("http");
    expect(out).not.toContain("2026");
    expect(out).not.toContain(" ");
    expect(out).toContain("react");
  });

  it("薪资格式统一：15-25K / 15K~25K / 15k-25k 等价", () => {
    const a = normalizeJobContentForFingerprint("薪资 15-25K");
    const b = normalizeJobContentForFingerprint("薪资 15K~25K");
    const c = normalizeJobContentForFingerprint("薪资 15k-25k");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toContain("15-25k");
  });

  it("月薪「万」单位折算为 K：1-2万 → 10-20k", () => {
    expect(normalizeJobContentForFingerprint("月薪 1-2万")).toBe(
      normalizeJobContentForFingerprint("月薪 10-20k"),
    );
  });
});

describe("computeFingerprint 跨平台去重", () => {
  const PLATFORM_A = `高级前端工程师
城市：上海
薪资：15-25K
要求：3年以上前端经验，精通 React、TypeScript`;

  // 同一职位在其他平台的呈现：带 HTML、不同薪资格式、多余空白、公司带后缀（文案措辞一致）
  const PLATFORM_B = `<div>
  高级前端工程师
  <br>城市：上海
  薪资：15K~25K
  要求：3年以上前端经验，精通 React、TypeScript
</div>`;

  it("同一职位不同平台 → 相同 fingerprint", () => {
    const fa = computeFingerprint({ companyName: "字节跳动", title: "高级前端工程师", city: "上海", description: PLATFORM_A });
    const fb = computeFingerprint({ companyName: "字节跳动有限公司", title: "高级前端工程师", city: "上海", description: PLATFORM_B });
    expect(fb).toBe(fa);
  });

  it("同一职位不同空白/HTML → 相同 fingerprint", () => {
    const f1 = computeFingerprint({ companyName: "米哈游", title: "Web前端工程师", city: "上海", description: "熟悉 React 与 Node.js" });
    const f2 = computeFingerprint({ companyName: "米哈游", title: "Web 前端工程师", city: "上海", description: "<p>熟悉 React 与 Node.js</p> " });
    expect(f2).toBe(f1);
  });

  it("不同职位 → 不同 fingerprint", () => {
    const f1 = computeFingerprint({ companyName: "字节跳动", title: "高级前端工程师", city: "上海", description: PLATFORM_A });
    const f2 = computeFingerprint({ companyName: "字节跳动", title: "高级 Java 工程师", city: "上海", description: PLATFORM_A });
    const f3 = computeFingerprint({ companyName: "拼多多", title: "高级前端工程师", city: "上海", description: PLATFORM_A });
    expect(f2).not.toBe(f1);
    expect(f3).not.toBe(f1);
  });

  it("确定性：同输入两次结果一致", () => {
    const args = { companyName: "小红书", title: "前端工程师", city: "上海", description: "熟悉 Vue" };
    expect(computeFingerprint(args)).toBe(computeFingerprint(args));
  });
});

describe("company 与 city 归一", () => {
  it("公司去法律后缀", () => {
    expect(normalizeCompanyName("字节跳动有限公司")).toBe(normalizeCompanyName("字节跳动"));
    expect(normalizeCompanyName("腾讯科技(深圳)有限公司")).toBe(normalizeCompanyName("腾讯科技(深圳)"));
  });
  it("城市归一到规范名", () => {
    expect(canonicalCity("上海市浦东新区")).toBe("上海");
    expect(canonicalCity("北京")).toBe("北京");
    expect(canonicalCity("火星")).toBe("");
    expect(canonicalCity(undefined)).toBe("");
  });
});

describe("normalizeToUnified", () => {
  it("规则解析 JD → UnifiedJob，字段完整", () => {
    const u = normalizeToUnified({
      source: "boss",
      url: "https://www.zhipin.com/job_detail/abc123.html",
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });
    expect(u.source).toBe("boss");
    expect(u.sourceJobId).toBe("abc123");
    expect(u.sourceUrl).toContain("zhipin.com");
    expect(u.companyName).toBe("未来科技");
    expect(u.title).toContain("前端");
    expect(u.city).toBe("上海");
    expect(u.salaryMin).toBe(15);
    expect(u.salaryMax).toBe(25);
    expect(u.experienceYearsMin).toBe(3);
    expect(u.education).toBe("本科");
    expect(u.skills.map((s) => s.name)).toContain("React");
    expect(u.description).toBe(BOSS_JD);
  });

  it("显式 sourceJobId 优先于 URL 提取", () => {
    const u = normalizeToUnified({
      source: "boss",
      url: "https://www.zhipin.com/job_detail/abc123.html",
      text: BOSS_JD,
      sourceJobId: "explicit-id",
    });
    expect(u.sourceJobId).toBe("explicit-id");
  });
});
