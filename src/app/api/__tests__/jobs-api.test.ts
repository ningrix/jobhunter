import { describe, expect, it, beforeEach } from "vitest";
import { POST as createJobRoute, GET as listJobsRoute } from "@/app/api/v1/jobs/route";
import {
  GET as detailRoute,
  PATCH as patchRoute,
  DELETE as deleteRoute,
} from "@/app/api/v1/jobs/[id]/route";
import { POST as parseRoute } from "@/app/api/v1/jobs/parse/route";
import { POST as favoriteRoute } from "@/app/api/v1/jobs/[id]/favorite/route";
import { GET as taskRoute } from "@/app/api/v1/ai-tasks/[id]/route";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import type { JobStructured } from "@/shared/types";

beforeEach(resetDb);

const SAMPLE_JD = `招聘：高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
3、了解 Docker 者优先
岗位职责：
- 负责核心业务前端开发与性能优化`;

const STRUCTURED: JobStructured = {
  title: "高级前端工程师",
  city: "上海",
  salaryMin: 15,
  salaryMax: 25,
  experienceYearsMin: 3,
  education: "本科",
  skills: [{ name: "React", weight: 5 }, { name: "TypeScript", weight: 4 }],
  responsibilities: ["核心业务开发"],
  requirements: ["3 年以上经验"],
};

async function createJob(token: string, title = "高级前端工程师", withStructured = true, description = SAMPLE_JD) {
  const res = await callRoute(createJobRoute, {
    method: "POST",
    token,
    body: {
      companyName: "未来科技",
      title,
      description,
      ...(withStructured ? { structured: STRUCTURED } : {}),
    },
  });
  expect(res.status).toBe(201);
  return expectOk(res.json) as { job: { id: string }; taskId: string | null };
}

describe("job API", () => {
  it("创建职位（带结构化）→ 详情可查，公司自动建档", async () => {
    const { token } = await createTestUser();
    const { job, taskId } = await createJob(token);
    expect(taskId).toBeNull(); // 已带结构化，无需解析

    const detail = await callRoute(detailRoute, { token, params: { id: job.id } });
    const d = expectOk(detail.json) as {
      job: { structured: JobStructured; companyName: string; title: string };
      favorited: boolean;
    };
    expect(d.job.structured.salaryMax).toBe(25);
    expect(d.job.structured.skills[0].name).toBe("React");
    expect(d.favorited).toBe(false);
  });

  it("创建职位（仅粘贴 JD）→ 自动解析任务 → 结构化写回", async () => {
    const { token } = await createTestUser();
    const { job, taskId } = await createJob(token, "后端开发工程师", false);
    expect(taskId).toBeTruthy();

    // 解析任务已成功执行
    const taskRes = await callRoute(taskRoute, { token, params: { id: taskId! } });
    const task = expectOk(taskRes.json) as { status: string };
    expect(task.status).toBe("succeeded");

    // 职位结构化已写回
    const detail = await callRoute(detailRoute, { token, params: { id: job.id } });
    const d = expectOk(detail.json) as { job: { structured: Record<string, unknown> | null } };
    expect(d.job.structured?.city).toBe("上海");
    expect(d.job.structured?.salaryMin).toBe(15);
    expect(d.job.structured?.experienceYearsMin).toBe(3);
  });

  it("粘贴 JD 解析端点：返回 taskId，任务输出即结构化结果", async () => {
    const { token } = await createTestUser();
    const res = await callRoute(parseRoute, { method: "POST", token, body: { text: SAMPLE_JD } });
    expect(res.status).toBe(202);
    const { taskId } = expectOk(res.json) as { taskId: string };

    const taskRes = await callRoute(taskRoute, { token, params: { id: taskId } });
    const task = expectOk(taskRes.json) as { status: string; output?: { structured?: Record<string, unknown> } };
    expect(task.status).toBe("succeeded");
    expect(task.output?.structured?.title).toContain("前端");
  });

  it("列表筛选：关键字 / 收藏 / 归档排除", async () => {
    const { token } = await createTestUser();
    const a = await createJob(token, "前端工程师");
    await createJob(token, "数据分析师", true, "招聘：数据分析师\n要求：熟悉 SQL、Python 与数据分析");

    // 关键字
    const kw = await callRoute(listJobsRoute, { token, url: "/?keyword=%E5%89%8D%E7%AB%AF" });
    expect(expectOk(kw.json)).toHaveLength(1);

    // 收藏过滤
    await callRoute(favoriteRoute, { method: "POST", token, params: { id: a.job.id } });
    const fav = await callRoute(listJobsRoute, { token, url: "/?favorite=1" });
    expect(expectOk(fav.json)).toHaveLength(1);

    // 归档后默认列表不可见
    await callRoute(patchRoute, {
      method: "PATCH",
      token,
      params: { id: a.job.id },
      body: { status: "archived" },
    });
    const active = await callRoute(listJobsRoute, { token });
    expect(expectOk(active.json)).toHaveLength(1);
    const all = await callRoute(listJobsRoute, { token, url: "/?status=all" });
    expect(expectOk(all.json)).toHaveLength(2);
  });

  it("收藏切换与软删除", async () => {
    const { token } = await createTestUser();
    const { job } = await createJob(token);

    const fav1 = await callRoute(favoriteRoute, { method: "POST", token, params: { id: job.id } });
    expect((expectOk(fav1.json) as { favorited: boolean }).favorited).toBe(true);
    const fav2 = await callRoute(favoriteRoute, { method: "POST", token, params: { id: job.id } });
    expect((expectOk(fav2.json) as { favorited: boolean }).favorited).toBe(false);

    await callRoute(deleteRoute, { method: "DELETE", token, params: { id: job.id } });
    const detail = await callRoute(detailRoute, { token, params: { id: job.id } });
    expect(detail.status).toBe(404);
    expect(detail.json.code).toBe(4001);
  });

  it("未登录返回 401，越权返回 404", async () => {
    const noAuth = await callRoute(listJobsRoute);
    expect(noAuth.status).toBe(401);

    const { token: t1 } = await createTestUser("j1@test.cn");
    const { token: t2 } = await createTestUser("j2@test.cn");
    const { job } = await createJob(t1);
    const forbidden = await callRoute(detailRoute, { token: t2, params: { id: job.id } });
    expect(forbidden.status).toBe(404);
  });
});
