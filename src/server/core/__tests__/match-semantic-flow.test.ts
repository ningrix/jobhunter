import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { embeddings } from "@/db/schema";
import { resetDb, callRoute, createTestUser, expectOk } from "@/testing/helpers";
import { POST as createResume } from "@/app/api/v1/resumes/route";
import { POST as createJob } from "@/app/api/v1/jobs/route";
import { PATCH as patchProfile } from "@/app/api/v1/users/me/profile/route";
import { POST as computeMatchRoute } from "@/app/api/v1/matches/route";
import { executeTask } from "@/server/ai/runner";
import { getMatch } from "@/server/core/match-service";

/** V4.1：语义匹配流 —— semanticMatchEnabled → match_semantic 任务 → 混合总分/明细/解读回写 */
describe("semantic match flow", () => {
  let token: string;
  let userId: string;

  const resumeContent = {
    basics: { name: "宁睿", city: "上海" },
    summary: "5 年 Java 后端，交易链路性能治理",
    skills: ["Java", "MySQL", "Kafka", "Redis"],
    experience: [
      {
        company: "A科技",
        title: "后端工程师",
        start: "2020-01",
        end: "至今",
        highlights: ["订单查询 P95 从 1.2s 降至 180ms"],
      },
    ],
    education: [{ school: "某某大学", major: "计算机", degree: "本科", start: "2016", end: "2020" }],
    projects: [],
  };

  const jobBody = {
    companyName: "B科技",
    title: "资深 Java 工程师",
    city: "上海",
    salaryMin: 25,
    salaryMax: 40,
    description: "负责交易链路核心服务，Kafka 高并发消息管道，MySQL 调优",
    structured: {
      title: "资深 Java 工程师",
      city: "上海",
      salaryMin: 25,
      salaryMax: 40,
      experienceYearsMin: 5,
      education: "本科",
      skills: [
        { name: "Java", weight: 5 },
        { name: "MySQL", weight: 4 },
        { name: "Kafka", weight: 3 },
      ],
      responsibilities: [],
      requirements: [],
    },
  };

  beforeEach(async () => {
    await resetDb();
    const u = await createTestUser();
    token = u.token;
    userId = u.user.id;
  });

  async function setup() {
    const res = await callRoute(createResume, {
      method: "POST",
      url: "/api/v1/resumes",
      token,
      body: { title: "主简历", content: resumeContent },
    });
    const { resume } = expectOk(res.json) as { resume: { id: string } };
    const jobRes = await callRoute(createJob, {
      method: "POST",
      url: "/api/v1/jobs",
      token,
      body: jobBody,
    });
    const { job } = expectOk(jobRes.json) as { job: { id: string } };
    return { resumeId: resume.id, jobId: job.id };
  }

  it("semanticMatchEnabled=false：纯规则行为不变（向后兼容锚点）", async () => {
    const { resumeId, jobId } = await setup();
    const res = await callRoute(computeMatchRoute, {
      method: "POST",
      url: "/api/v1/matches",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    const { match, taskId } = expectOk(res.json) as { match: { id: string; totalScore: number; hybridScores: unknown }; taskId: string | null };
    expect(taskId).toBeNull();
    expect(match.hybridScores).toBeNull();
    expect(match.totalScore).toBeGreaterThan(0);
  });

  it("semanticMatchEnabled=true：任务回写混合总分、明细与 AI 解读，规则五维分不被污染", async () => {
    const { resumeId, jobId } = await setup();
    await callRoute(patchProfile, {
      method: "PATCH",
      url: "/api/v1/users/me/profile",
      token,
      body: { semanticMatchEnabled: true },
    });
    const res = await callRoute(computeMatchRoute, {
      method: "POST",
      url: "/api/v1/matches",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    const { match, taskId } = expectOk(res.json) as { match: { id: string; totalScore: number }; taskId: string };
    expect(taskId).toBeTruthy();

    const done = await executeTask(taskId);
    expect(done.status).toBe("succeeded");

    const m = await getMatch(userId, match.id);
    expect(m.hybridScores).toBeTruthy();
    expect(m.hybridScores!.semantic.evidence.length).toBeGreaterThan(0);
    expect(m.hybridScores!.rule).toBeGreaterThan(0);
    expect(m.hybridScores!.judge.reasons.length).toBeGreaterThan(0);
    expect(m.totalScore).toBe(m.hybridScores!.totalScore);
    // 规则五维分保持规则口径（不被混合总分覆盖）
    expect(m.dimensionScores.skills).toBeGreaterThan(0);
    expect(m.aiExplanation).toBeTruthy();
    expect(m.summary).toBeTruthy();
  });

  it("关闭语义层后重算：旧混合明细清空，不留与 totalScore 不一致的假混合分", async () => {
    const { resumeId, jobId } = await setup();
    await callRoute(patchProfile, {
      method: "PATCH",
      url: "/api/v1/users/me/profile",
      token,
      body: { semanticMatchEnabled: true },
    });
    const first = await callRoute(computeMatchRoute, {
      method: "POST",
      url: "/api/v1/matches",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    const { match, taskId } = expectOk(first.json) as {
      match: { id: string };
      taskId: string;
    };
    await executeTask(taskId);
    expect((await getMatch(userId, match.id)).hybridScores).toBeTruthy();

    // 用户关闭语义层 → 同一「职位 × 简历」重算：上一轮混合明细必须作废
    await callRoute(patchProfile, {
      method: "PATCH",
      url: "/api/v1/users/me/profile",
      token,
      body: { semanticMatchEnabled: false },
    });
    const second = await callRoute(computeMatchRoute, {
      method: "POST",
      url: "/api/v1/matches",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    const again = expectOk(second.json) as { match: { id: string }; taskId: string | null };
    expect(again.taskId).toBeNull();

    const ruleOnly = await getMatch(userId, match.id);
    expect(ruleOnly.hybridScores).toBeNull();
    expect(ruleOnly.totalScore).toBeGreaterThan(0);
  });

  it("向量缓存：同一简历/职位二次计算不新增 embeddings 行", async () => {
    const { resumeId, jobId } = await setup();
    await callRoute(patchProfile, {
      method: "PATCH",
      url: "/api/v1/users/me/profile",
      token,
      body: { semanticMatchEnabled: true },
    });

    async function embedCount(): Promise<number> {
      const rows = await getDb()
        .select({ id: embeddings.id })
        .from(embeddings)
        .where(and(eq(embeddings.ownerType, "resume"), eq(embeddings.ownerId, resumeId)));
      const jobRows = await getDb()
        .select({ id: embeddings.id })
        .from(embeddings)
        .where(and(eq(embeddings.ownerType, "job"), eq(embeddings.ownerId, jobId)));
      return rows.length + jobRows.length;
    }

    const r1 = await callRoute(computeMatchRoute, {
      method: "POST",
      url: "/api/v1/matches",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    const t1 = (expectOk(r1.json) as { taskId: string }).taskId;
    await executeTask(t1);
    const first = await embedCount();
    expect(first).toBeGreaterThan(0);

    const r2 = await callRoute(computeMatchRoute, {
      method: "POST",
      url: "/api/v1/matches",
      token,
      body: { jobId, resumeId, useAI: false },
    });
    const t2 = (expectOk(r2.json) as { taskId: string }).taskId;
    await executeTask(t2);
    expect(await embedCount()).toBe(first);
  });
});
