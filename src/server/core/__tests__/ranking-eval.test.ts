import { describe, expect, it } from "vitest";
import type { JobStructured, ResumeContent } from "@/shared/types";
import { MockProvider, mockMatchJudge } from "@/server/ai/providers/mock";
import { chunkJobForEmbedding, chunkResumeContent } from "@/server/ai/embedding-service";
import { hybridTotal, ndcg, semanticScore, spearman, type ChunkWithVector } from "../hybrid-ranking";
import { scoreMatch } from "../match-scorer";

/**
 * docs/20 V4.1「可评估」：种子简历 × 种子 JD 的期望排序 gold set，
 * 排序一致性指标（NDCG / Spearman）进 vitest——匹配质量第一次变成可回归的数字。
 *
 * 全链路确定性：规则分（scoreMatch 纯函数）+ 语义（MockProvider 确定性哈希向量）
 * + Judge（mockMatchJudge 确定性），无 DB、无网络，排序结果可精确回归。
 */

const R1_JAVA: ResumeContent = {
  basics: { name: "张三", city: "上海", title: "Java 后端工程师" },
  summary: "5 年 Java 后端，交易链路与高并发消息治理",
  skills: ["Java", "MySQL", "Kafka", "Redis", "Spring Boot"],
  experience: [
    {
      company: "A科技",
      title: "Java 后端工程师",
      start: "2020-03",
      end: "至今",
      highlights: ["订单交易链路 P95 从 1.2s 降至 180ms", "Kafka 消息管道日均 200 万条"],
    },
  ],
  education: [{ school: "华东理工", major: "计算机", degree: "本科", start: "2015", end: "2019" }],
  projects: [],
};

const R2_FRONTEND: ResumeContent = {
  basics: { name: "李四", city: "北京", title: "前端工程师" },
  summary: "3 年 React 前端，中后台与可视化",
  skills: ["React", "TypeScript", "Vue", "CSS"],
  experience: [
    {
      company: "B科技",
      title: "前端工程师",
      start: "2022-06",
      end: "至今",
      highlights: ["React 中后台组件库建设", "首屏加载时间下降 45%"],
    },
  ],
  education: [{ school: "北邮", major: "软件工程", degree: "本科", start: "2018", end: "2022" }],
  projects: [],
};

const R3_DATA_ANALYST: ResumeContent = {
  basics: { name: "王五", city: "杭州", title: "数据分析师" },
  summary: "应届生，Python 数据分析与 SQL",
  skills: ["Python", "Pandas", "SQL"],
  experience: [],
  education: [{ school: "浙大", major: "统计学", degree: "本科", start: "2022", end: "2026" }],
  projects: [
    {
      name: "电商用户行为分析",
      role: "独立完成",
      description: "用 Python 与 Pandas 分析千万级用户行为数据，输出增长建议",
      highlights: ["复购率提升 12%"],
    },
  ],
};

const R4_BIGDATA: ResumeContent = {
  basics: { name: "赵六", city: "上海", title: "大数据开发工程师" },
  summary: "4 年 Spark/Flink 大数据开发，硕士",
  skills: ["Spark", "Flink", "Hive", "Scala", "Java"],
  experience: [
    {
      company: "C科技",
      title: "大数据开发工程师",
      start: "2021-07",
      end: "至今",
      highlights: ["日批处理 10TB 数据", "Flink 实时风控延迟 < 1s"],
    },
  ],
  education: [{ school: "复旦", major: "计算机技术", degree: "硕士", start: "2018", end: "2021" }],
  projects: [],
};

const RESUMES: { resume: ResumeContent; profile: { expectedCity?: string; salaryMin?: number; salaryMax?: number } }[] = [
  { resume: R1_JAVA, profile: { expectedCity: "上海", salaryMin: 25, salaryMax: 40 } },
  { resume: R2_FRONTEND, profile: { expectedCity: "北京", salaryMin: 20, salaryMax: 35 } },
  { resume: R3_DATA_ANALYST, profile: { expectedCity: "杭州", salaryMin: 12, salaryMax: 20 } },
  { resume: R4_BIGDATA, profile: { expectedCity: "上海", salaryMin: 30, salaryMax: 50 } },
];

function jd(
  companyName: string,
  title: string,
  city: string,
  min: number,
  max: number,
  years: number,
  education: string,
  skills: [string, number][],
  description: string,
): { companyName: string; title: string; city: string; salaryMin: number; salaryMax: number; structured: JobStructured; description: string } {
  return {
    companyName,
    title,
    city,
    salaryMin: min,
    salaryMax: max,
    description,
    structured: {
      title,
      city,
      salaryMin: min,
      salaryMax: max,
      experienceYearsMin: years,
      education,
      skills: skills.map(([name, weight]) => ({ name, weight })),
      responsibilities: [],
      requirements: [],
    },
  };
}

const JOBS = [
  jd("A科技", "资深 Java 后端工程师", "上海", 25, 40, 5, "本科", [["Java", 5], ["MySQL", 4], ["Kafka", 3], ["Redis", 2]], "负责交易链路核心服务，Kafka 高并发消息管道，MySQL 调优，Redis 缓存设计"),
  jd("B科技", "React 前端工程师", "北京", 20, 35, 3, "本科", [["React", 5], ["TypeScript", 4], ["CSS", 2]], "负责中后台前端架构，React 组件库建设与性能优化"),
  jd("C科技", "大数据开发工程师", "上海", 30, 50, 4, "硕士", [["Spark", 5], ["Flink", 4], ["Hive", 3], ["Scala", 3]], "负责日批量 10TB 数据管道与 Flink 实时计算"),
  jd("D科技", "数据分析专员（Python）", "杭州", 12, 20, 0, "不限", [["Python", 5], ["SQL", 4], ["Pandas", 3]], "用 Python 与 SQL 完成业务专题分析，输出增长建议"),
  jd("E科技", "全栈工程师", "上海", 20, 35, 3, "本科", [["React", 3], ["Node.js", 3], ["TypeScript", 3]], "前后端一体：React 前端与 Node.js 服务开发"),
  jd("F科技", "NLP 算法工程师", "北京", 35, 60, 3, "硕士", [["Python", 4], ["PyTorch", 5], ["大模型", 4]], "大模型时代 NLP 算法研发，Prompt 工程与 RAG 落地"),
];

/** 期望相关度（0-3）：构造依据 = 技能/方向/城市的真实匹配程度 */
const GOLD: Record<number, number[]> = {
  // R1 Java 后端：J1 强相关(3)，J5 部分(1)，大数据沾边(1)，其余 0
  0: [3, 0, 1, 0, 1, 0],
  // R2 前端：J2 强相关(3)，J5 全栈部分(2)，其余 0
  1: [0, 3, 0, 0, 2, 0],
  // R3 数据分析应届：J4 强相关(3)，J6 Python 沾边(1)，J3 沾边(1)，其余 0
  2: [0, 0, 1, 3, 0, 1],
  // R4 大数据：J3 强相关(3)，J1 Java/上海部分(2)，J6 沾边(0)，其余 0
  3: [2, 0, 3, 0, 0, 0],
};

async function embedAll(provider: MockProvider, chunks: string[]): Promise<ChunkWithVector[]> {
  const out: ChunkWithVector[] = [];
  for (const chunk of chunks) {
    out.push({ chunk, vector: (await provider.embed(chunk)).vector });
  }
  return out;
}

describe("V4.1 排序质量评测（NDCG / Spearman，gold set）", () => {
  it("规则排序与混合排序的 NDCG 均达阈值，混合不差于纯规则", async () => {
    const provider = new MockProvider();
    const embeddedResumes: ChunkWithVector[][] = [];
    const embeddedJobs: ChunkWithVector[][] = [];
    for (const j of JOBS) {
      embeddedJobs.push(await embedAll(provider, chunkJobForEmbedding(j)));
    }

    const ruleNdcgs: number[] = [];
    const hybridNdcgs: number[] = [];
    const spearmans: number[] = [];
    for (let r = 0; r < RESUMES.length; r++) {
      const { resume, profile } = RESUMES[r];
      const resumeChunks = await embedAll(provider, chunkResumeContent(resume));
      embeddedResumes.push(resumeChunks);

      const ruleScores: number[] = [];
      const hybridScores: number[] = [];
      for (let j = 0; j < JOBS.length; j++) {
        const job = JOBS[j];
        const rule = scoreMatch({
          resume,
          profile: profile ?? null,
          job: { city: job.city, salaryMin: job.salaryMin, salaryMax: job.salaryMax, structured: job.structured },
        });
        ruleScores.push(rule.totalScore);
        const sem = semanticScore(embeddedJobs[j], resumeChunks);
        const judge = mockMatchJudge({
          resume,
          job,
          rule: {
            totalScore: rule.totalScore,
            dimensionScores: rule.dimensionScores as unknown as Record<string, number>,
            gaps: rule.gaps,
          },
          semantic: { score: sem.score, evidence: sem.evidence },
        });
        hybridScores.push(
          hybridTotal({ semantic: sem.score, rule: rule.totalScore, judge: judge.score }).totalScore,
        );
      }
      const gold = GOLD[r];
      // NDCG 输入是「按分数排序后各位置的 gold 等级」，不是原始分数
      const byRank = (scores: number[]) =>
        scores
          .map((s, i) => ({ s, i }))
          .sort((a, b) => b.s - a.s)
          .map((x) => gold[x.i]);
      ruleNdcgs.push(ndcg(gold, byRank(ruleScores)));
      hybridNdcgs.push(ndcg(gold, byRank(hybridScores)));
      spearmans.push(spearman(gold, hybridScores));
    }

    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const meanRule = mean(ruleNdcgs);
    const meanHybrid = mean(hybridNdcgs);
    // 评测数值打印：回归失败时便于定位是哪份简历恶化
    console.log("rule NDCG:", ruleNdcgs.map((v) => v.toFixed(3)).join(" "), "mean=", meanRule.toFixed(3));
    console.log("hybrid NDCG:", hybridNdcgs.map((v) => v.toFixed(3)).join(" "), "mean=", meanHybrid.toFixed(3));
    console.log("hybrid Spearman:", spearmans.map((v) => v.toFixed(3)).join(" "));

    expect(meanRule).toBeGreaterThanOrEqual(0.9);
    // 混合排序不允许比纯规则更差（docs/20：降级兼容的排序版本）
    expect(meanHybrid).toBeGreaterThanOrEqual(meanRule);
    expect(mean(spearmans)).toBeGreaterThanOrEqual(0.7);  });
});
