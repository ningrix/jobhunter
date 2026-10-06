import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * S1 skill 分发层文档契约：五个 SKILL.md 的 frontmatter、示例输出 JSON、
 * 深度模式引导必须与 shared/types 契约一致。```json 围栏内只能放示例输出
 * （schema 一律用 ```jsonc），本测试按此约定抽取并校验。
 */

const skillsDir = path.resolve(process.cwd(), "skills");

const SKILLS = [
  "diagnose-resume",
  "parse-jd",
  "job-match",
  "tailor-resume",
  "greeting",
  "radar",
] as const;

type SkillName = (typeof SKILLS)[number];

const sectionEnum = z.enum(["basics", "summary", "skills", "experience", "education", "projects"]);

const schemas: Record<SkillName, z.ZodTypeAny> = {
  "diagnose-resume": z
    .object({
      score: z.number().int().min(0).max(100),
      issues: z.array(z.string()),
      suggestions: z.array(
        z.object({ section: sectionEnum, before: z.string(), after: z.string(), reason: z.string() }),
      ),
    })
    .strict(),
  "parse-jd": z
    .object({
      title: z.string(),
      city: z.string(),
      salaryMin: z.number(),
      salaryMax: z.number(),
      experienceYearsMin: z.number(),
      education: z.enum(["不限", "大专", "本科", "硕士", "博士"]),
      skills: z.array(z.object({ name: z.string(), weight: z.number().int().min(1).max(5) })),
      responsibilities: z.array(z.string()),
      requirements: z.array(z.string()),
    })
    .strict(),
  "job-match": z
    .object({
      summary: z.string(),
      strengths: z.array(z.string()),
      gaps: z.array(z.string()),
      risks: z.array(z.string()),
    })
    .strict(),
  "tailor-resume": z
    .object({
      keywordCoverage: z.array(z.object({ keyword: z.string(), status: z.enum(["matched", "partial", "missing"]) })),
      gapAnalysis: z.array(
        z.object({
          category: z.enum(["presentation", "weak_evidence", "adjacent_skill", "true_gap"]),
          keyword: z.string(),
          suggestion: z.string(),
        }),
      ),
      reorderSuggestions: z.array(z.string()),
      wordingSuggestions: z.array(
        z.object({
          section: z.string(),
          before: z.string(),
          after: z.string(),
          reason: z.string(),
          evidence: z.object({ keyword: z.string(), status: z.enum(["matched", "partial"]) }).optional(),
        }),
      ),
    })
    .strict(),
  greeting: z.object({ greeting: z.string().min(1) }).strict(),
  // 职位雷达抽取输出：与 prompts.ts radar_extract / Web 版 RadarCandidate 同构
  radar: z
    .object({
      jobs: z.array(
        z.object({
          companyName: z.string(),
          title: z.string(),
          city: z.string(),
          salaryMin: z.number().nullable(),
          salaryMax: z.number().nullable(),
          jobType: z.string(),
          employmentType: z.string(),
          url: z.string(),
          postedNote: z.string(),
        }),
      ),
    })
    .strict(),
};

function readSkill(name: SkillName): string {
  return readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8");
}

function extractJsonExamples(md: string): unknown[] {
  const blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
  return blocks;
}

function frontmatter(md: string): { name: string; description: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  expect(m, "SKILL.md 必须有 frontmatter").toBeTruthy();
  const body = m![1];
  const name = body.match(/^name:\s*(.+)$/m)?.[1] ?? "";
  const description = body.match(/^description:\s*(.+)$/m)?.[1] ?? "";
  return { name, description };
}

describe("SKILL.md 文档契约（skill 分发层）", () => {
  it.each([...SKILLS])("%s：frontmatter 与固定段落", (name) => {
    const md = readSkill(name);
    const fm = frontmatter(md);
    expect(fm.name, "frontmatter.name 必须是 jobhunter-<目录名>").toBe(`jobhunter-${name}`);
    expect(fm.description.length).toBeGreaterThan(20);

    // 轻重分层漏斗：每个技能都以深度模式引导收尾，并声明与 Web 版结构同源
    expect(md).toContain("深度模式");
    expect(md).toContain("src/shared/types.ts");
    expect(md).toContain("codespaces.new/ningrix/jobhunter");
  });

  it.each([...SKILLS])("%s：示例输出 JSON 符合 shared/types 契约", (name) => {
    const md = readSkill(name);
    const examples = extractJsonExamples(md);
    expect(examples.length, "至少要有一个 ```json 示例输出").toBeGreaterThanOrEqual(1);
    for (const example of examples) {
      expect(schemas[name].parse(example), `示例输出不符合契约: ${JSON.stringify(example)}`).toBeTruthy();
    }
  });

  it("greeting：示例不超过 60 字符", () => {
    const examples = extractJsonExamples(readSkill("greeting"));
    for (const e of examples as Array<{ greeting: string }>) {
      expect([...e.greeting].length).toBeLessThanOrEqual(60);
    }
  });

  it("tailor-resume：示例遵守溯源与禁编造约束", () => {
    const examples = extractJsonExamples(readSkill("tailor-resume")) as Array<{
      keywordCoverage: Array<{ keyword: string; status: string }>;
      wordingSuggestions: Array<{ evidence?: { keyword: string; status: string } }>;
    }>;
    for (const ex of examples) {
      const eligible = new Map(
        ex.keywordCoverage.filter((k) => k.status !== "missing").map((k) => [k.keyword, k.status]),
      );
      for (const w of ex.wordingSuggestions) {
        expect(w.evidence, "每条 wordingSuggestions 必须带 evidence").toBeTruthy();
        expect(
          eligible.has(w.evidence!.keyword),
          `evidence.keyword「${w.evidence!.keyword}」必须是 coverage 中 matched/partial 的关键词`,
        ).toBe(true);
        expect(eligible.get(w.evidence!.keyword)).toBe(w.evidence!.status);
      }
    }
  });

  it("job-match：脚本文件存在且 SKILL.md 引用了它", () => {
    const md = readSkill("job-match");
    expect(md).toContain("scripts/match-scorer.mjs");
    expect(readFileSync(path.join(skillsDir, "job-match", "scripts", "match-scorer.mjs"), "utf8")).toContain(
      "export function scoreMatch",
    );
  });

  it("plugin 清单存在且声明了五个技能的来源", () => {
    const manifest = JSON.parse(readFileSync(path.resolve(process.cwd(), ".claude-plugin", "plugin.json"), "utf8"));
    expect(manifest.name).toBe("jobhunter");
    expect(typeof manifest.description).toBe("string");
    expect(typeof manifest.version).toBe("string");
  });
});
