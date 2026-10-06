import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RESUME_TEMPLATE_IDS, type ResumeContent, type ResumeStyle } from "@/shared/types";
import { RESUME_TEMPLATES, RESUME_TEMPLATE_LIST } from "../templates";
import { ResumePreview } from "../ResumePreview";

/**
 * V4.2 模板移植（elegant / timeline）契约：
 * spec 单源一致性 + 双栏布局不重复渲染区块 + 三种布局可无头渲染（打印导出同构）。
 */

const content: ResumeContent = {
  basics: { name: "宁睿", phone: "13800000000", email: "n@example.com", city: "上海", title: "后端工程师" },
  summary: "5 年后端经验",
  skills: ["Java", "MySQL", "Kafka"],
  experience: [
    { company: "A科技", title: "后端", start: "2020-01", end: "至今", highlights: ["P95 降 85%"] },
  ],
  education: [{ school: "某某大学", major: "计算机", degree: "本科", start: "2016", end: "2020" }],
  projects: [{ name: "JobHunter", description: "AI 求职操作系统", highlights: [] }],
};

const style = (template: ResumeStyle["template"]): ResumeStyle => ({
  template,
  font: "sans",
  accentColor: "#1e40af",
  spacing: "normal",
});

describe("模板 spec 单源契约", () => {
  it("RESUME_TEMPLATES 与 RESUME_TEMPLATE_IDS 一一对应（7 个模板）", () => {
    expect(RESUME_TEMPLATE_LIST).toHaveLength(RESUME_TEMPLATE_IDS.length);
    for (const id of RESUME_TEMPLATE_IDS) {
      expect(RESUME_TEMPLATES[id]).toBeTruthy();
      expect(RESUME_TEMPLATES[id].id).toBe(id);
    }
  });

  it("每个模板 sectionOrder 无重复区块", () => {
    for (const spec of RESUME_TEMPLATE_LIST) {
      expect(new Set(spec.sectionOrder).size).toBe(spec.sectionOrder.length);
    }
  });

  it("elegant：双栏布局，侧栏区块与主栏 sectionOrder 不相交", () => {
    const spec = RESUME_TEMPLATES.elegant;
    expect(spec.layout).toBe("sidebar");
    const side = spec.sidebarSections ?? [];
    expect(side.length).toBeGreaterThan(0);
    for (const s of side) {
      expect(spec.sectionOrder).not.toContain(s);
    }
  });

  it("timeline：单栏学术式，经历前置", () => {
    const spec = RESUME_TEMPLATES.timeline;
    expect(spec.layout).toBe("single");
    expect(spec.sectionOrder[0]).toBe("experience");
  });
});

describe("ResumePreview 无头渲染（预览与打印导出同构）", () => {
  it("单栏模板渲染包含姓名与区块标题", () => {
    for (const id of ["classic", "timeline"] as const) {
      const html = renderToStaticMarkup(createElement(ResumePreview, { content, style: style(id) }));
      expect(html).toContain("宁睿");
      expect(html).toContain("工作经历");
      expect(html).toContain("resume-print-root");
    }
  });

  it("elegant 双栏：侧栏含技能与教育，主栏含经历，区块不重复", () => {
    const html = renderToStaticMarkup(createElement(ResumePreview, { content, style: style("elegant") }));
    expect(html).toContain("专业技能");
    expect(html).toContain("教育背景");
    expect(html).toContain("工作经历");
    expect(html).toContain("个人优势");
    // 区块不重复：主栏 sectionOrder 不含侧栏区块
    expect(html.split("专业技能")).toHaveLength(2);
    expect(html.split("教育背景")).toHaveLength(2);
  });

  it("空内容模板不崩溃", () => {
    const empty: ResumeContent = {
      basics: {},
      summary: "",
      skills: [],
      experience: [],
      education: [],
      projects: [],
    };
    for (const id of RESUME_TEMPLATE_IDS) {
      expect(() => renderToStaticMarkup(createElement(ResumePreview, { content: empty, style: style(id) }))).not.toThrow();
    }
  });
});
