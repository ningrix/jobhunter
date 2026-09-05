import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, callRoute, createTestUser, expectOk } from "@/testing/helpers";
import { POST as createResume } from "@/app/api/v1/resumes/route";
import { POST as createJob } from "@/app/api/v1/jobs/route";
import { POST as refreshRecs } from "@/app/api/v1/recommendations/refresh/route";
import { GET as listRecs } from "@/app/api/v1/recommendations/route";
import { GET as getProfile, PATCH as patchProfile } from "@/app/api/v1/users/me/profile/route";

/** Stage B-2：权重向量全链路 —— profile.matchWeights → computeMatch → 推荐分 */
describe("match weights flow", () => {
  let token: string;

  const resumeContent = {
    basics: { name: "宁睿", city: "上海" },
    summary: "",
    skills: ["React", "TypeScript", "Node.js"],
    experience: [{ company: "A科技", title: "前端", start: "2020-01", end: "至今", highlights: [] }],
    education: [{ school: "某某大学", major: "计算机", degree: "本科", start: "2016", end: "2020" }],
    projects: [],
  };

  const jobBody = {
    companyName: "B科技",
    title: "前端工程师",
    city: "北京",
    salaryMin: 15,
    salaryMax: 25,
    description: "负责前端开发",
    structured: {
      title: "前端工程师",
      city: "北京",
      salaryMin: 15,
      salaryMax: 25,
      experienceYearsMin: 3,
      education: "本科",
      skills: [
        { name: "React", weight: 5 },
        { name: "TypeScript", weight: 4 },
        { name: "Node.js", weight: 3 },
      ],
      responsibilities: [],
      requirements: [],
    },
  };

  beforeEach(async () => {
    await resetDb();
    const u = await createTestUser();
    token = u.token;
  });

  async function setupJobAndResume() {
    const res = await callRoute(createResume, {
      method: "POST",
      url: "/api/v1/resumes",
      token,
      body: { title: "主简历", content: resumeContent },
    });
    const resume = expectOk(res.json);
    const jobRes = await callRoute(createJob, {
      method: "POST",
      url: "/api/v1/jobs",
      token,
      body: jobBody,
    });
    const job = expectOk(jobRes.json);
    const jobId = job.id ?? job.job?.id;
    expect(jobId).toBeTruthy();
    return { resumeId: resume.id as string, jobId: jobId as string };
  }

  async function refreshAndGetScore(resumeId: string): Promise<number> {
    await callRoute(refreshRecs, {
      method: "POST",
      url: "/api/v1/recommendations/refresh",
      token,
      body: { resumeId },
    });
    const list = await callRoute(listRecs, {
      method: "GET",
      url: "/api/v1/recommendations?bucket=all",
      token,
    });
    const items = expectOk(list.json) as { totalScore: number }[];
    expect(items.length).toBe(1);
    return items[0].totalScore;
  }

  it("默认权重 → 城市拉满 → 清除权重，分数随之变化", async () => {
    const { resumeId } = await setupJobAndResume();

    // 默认权重：skills100*0.4 + exp100*0.25 + edu100*0.15 + city30*0.1 + salary60*0.1（未设期望薪资→中性分） = 89
    const def = await refreshAndGetScore(resumeId);
    expect(def).toBe(89);

    // 城市权重拉满（城市不一致=30）：总分被向量拉到 30
    const patchRes = await callRoute(patchProfile, {
      method: "PATCH",
      url: "/api/v1/users/me/profile",
      token,
      body: { matchWeights: { skills: 0, experience: 0, education: 0, city: 10, salary: 0 } },
    });
    expect(expectOk(patchRes.json).matchWeights).toEqual({
      skills: 0,
      experience: 0,
      education: 0,
      city: 10,
      salary: 0,
    });
    const cityMax = await refreshAndGetScore(resumeId);
    expect(cityMax).toBe(30);

    // 清除权重（null）回落系统默认
    await callRoute(patchProfile, {
      method: "PATCH",
      url: "/api/v1/users/me/profile",
      token,
      body: { matchWeights: null },
    });
    const restored = await refreshAndGetScore(resumeId);
    expect(restored).toBe(89);
  });

  it("GET profile 返回 matchWeights 字段（未设置为 null）", async () => {
    const res = await callRoute(getProfile, {
      method: "GET",
      url: "/api/v1/users/me/profile",
      token,
    });
    const data = expectOk(res.json) as Record<string, unknown>;
    expect("matchWeights" in data).toBe(true);
    expect(data.matchWeights).toBeNull();
  });
});
