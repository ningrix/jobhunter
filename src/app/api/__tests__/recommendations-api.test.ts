import { describe, expect, it, beforeEach } from "vitest";
import { GET as listRecRoute } from "@/app/api/v1/recommendations/route";
import { POST as refreshRoute } from "@/app/api/v1/recommendations/refresh/route";
import { POST as createResumeRoute } from "@/app/api/v1/resumes/route";
import { PATCH as patchResumeByIdRoute } from "@/app/api/v1/resumes/[id]/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { POST as createAppRoute } from "@/app/api/v1/applications/route";
import { POST as stageRoute } from "@/app/api/v1/applications/[id]/stage/route";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import type { ResumeContent, JobStructured } from "@/shared/types";

beforeEach(resetDb);

const STRONG_CONTENT: ResumeContent = {
  basics: { name: "张三", city: "深圳" },
  summary: "4 年 Java 后端",
  skills: ["Java", "Spring Boot", "MySQL", "Redis", "Kafka"],
  experience: [
    { company: "A 公司", title: "Java 工程师", start: "2021-01", end: "至今", highlights: ["日订单百万"] },
  ],
  education: [{ school: "某大学", major: "软件工程", degree: "本科", start: "2017", end: "2021" }],
  projects: [],
};

const GOOD_JOB: JobStructured = {
  title: "Java 后端工程师",
  city: "深圳",
  salaryMin: 20,
  salaryMax: 35,
  experienceYearsMin: 3,
  education: "本科",
  skills: [
    { name: "Java", weight: 5 },
    { name: "Spring Boot", weight: 4 },
    { name: "MySQL", weight: 3 },
  ],
  responsibilities: [],
  requirements: [],
};

async function seed(token: string) {
  const resumeRes = await callRoute(createResumeRoute, {
    method: "POST",
    token,
    body: { title: "主简历", content: STRONG_CONTENT },
  });
  const resumeId = (expectOk(resumeRes.json) as { resume: { id: string } }).resume.id;
  await callRoute(patchResumeByIdRoute, {
    method: "PATCH",
    token,
    params: { id: resumeId },
    body: { isPrimary: true },
  });

  async function makeJob(companyName: string, structured: JobStructured, city: string) {
    const res = await callRoute(createJobRoute, {
      method: "POST",
      token,
      body: {
        companyName,
        title: structured.title ?? "工程师",
        city,
        salaryMin: structured.salaryMin,
        salaryMax: structured.salaryMax,
        description: `${structured.title} JD`,
        structured,
      },
    });
    return (expectOk(res.json) as { job: { id: string } }).job.id;
  }

  const strongJob = await makeJob("甲公司", GOOD_JOB, "深圳");
  // 技能仅命中 Java（命中率 50%）→ 技能 50 分，总分约 76 → recommended 桶
  const midJob = await makeJob(
    "乙公司",
    {
      ...GOOD_JOB,
      skills: [
        { name: "Java", weight: 5 },
        { name: "Docker", weight: 5 },
      ],
    },
    "深圳",
  );
  // 技能全不命中 + 异地 + 高学历 + 高经验门槛 → 总分约 30 → confirm 桶
  const badJob = await makeJob(
    "丙公司",
    {
      ...GOOD_JOB,
      city: "北京",
      title: "异地资深岗位",
      salaryMin: 5,
      salaryMax: 8,
      experienceYearsMin: 10,
      education: "硕士",
      skills: [{ name: "Rust", weight: 5 }],
    },
    "北京",
  );
  return { resumeId, strongJob, midJob, badJob };
}

describe("recommendations API（Level 0 推荐流）", () => {
  it("refresh 批量计算全部活跃职位匹配；分桶正确", async () => {
    const { token } = await createTestUser();
    const { resumeId, strongJob, midJob, badJob } = await seed(token);

    const refreshed = await callRoute(refreshRoute, { method: "POST", token, body: {} });
    const { updated } = expectOk(refreshed.json) as { updated: number; resumeId: string };
    expect(updated).toBe(3);

    const all = await callRoute(listRecRoute, { token, url: "/?bucket=all" });
    const allRows = expectOk(all.json) as { jobId: string; totalScore: number; jobTitle: string; city: string | null }[];
    expect(allRows).toHaveLength(3);
    // 分数倒序
    expect(allRows[0].totalScore).toBeGreaterThanOrEqual(allRows[1].totalScore);
    expect(allRows[0].jobId).toBe(strongJob); // 匹配最好的排最前

    const strong = await callRoute(listRecRoute, { token, url: "/?bucket=strong" });
    const strongRows = expectOk(strong.json) as { jobId: string; totalScore: number }[];
    expect(strongRows.map((r) => r.jobId)).toEqual([strongJob]);
    expect(strongRows[0].totalScore).toBeGreaterThanOrEqual(85);

    const recommended = await callRoute(listRecRoute, { token, url: "/?bucket=recommended" });
    const recommendedRows = expectOk(recommended.json) as { jobId: string; totalScore: number }[];
    expect(recommendedRows.map((r) => r.jobId)).toEqual([midJob]);
    expect(recommendedRows[0].totalScore).toBeGreaterThanOrEqual(70);
    expect(recommendedRows[0].totalScore).toBeLessThan(85);

    const confirm = await callRoute(listRecRoute, { token, url: "/?bucket=confirm" });
    const confirmRows = expectOk(confirm.json) as { jobId: string; totalScore: number }[];
    expect(confirmRows.map((r) => r.jobId)).toEqual([badJob]);
    expect(confirmRows[0].totalScore).toBeLessThan(70);
  });

  it("投递后进入 applied 桶并从推荐桶消失", async () => {
    const { token } = await createTestUser();
    const { resumeId, strongJob } = await seed(token);
    await callRoute(refreshRoute, { method: "POST", token, body: { resumeId } });

    const app = (expectOk(
      (await callRoute(createAppRoute, { method: "POST", token, body: { jobId: strongJob, resumeId } })).json,
    ) as { id: string }).id;
    await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: app },
      body: { toStage: "applied" },
    });

    const applied = await callRoute(listRecRoute, { token, url: "/?bucket=applied" });
    const appliedRows = expectOk(applied.json) as { jobId: string; stage: string }[];
    expect(appliedRows).toHaveLength(1);
    expect(appliedRows[0].jobId).toBe(strongJob);
    expect(appliedRows[0].stage).toBe("applied");

    const strong = await callRoute(listRecRoute, { token, url: "/?bucket=strong" });
    expect(expectOk(strong.json)).toHaveLength(0); // 已投递的不在推荐桶
  });

  it("无简历时 refresh → 404/3001；未授权 401", async () => {
    const { token } = await createTestUser();
    const noResume = await callRoute(refreshRoute, { method: "POST", token, body: {} });
    expect(noResume.status).toBe(404);
    expect(noResume.json.code).toBe(3001);

    const noAuth = await callRoute(listRecRoute);
    expect(noAuth.status).toBe(401);
  });
});
