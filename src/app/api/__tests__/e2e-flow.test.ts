/**
 * 端到端全流程：注册 → 画像 → 简历 → 职位解析 → 匹配 → 投递 → 提醒 → 仪表盘
 * 只通过 API 层调用，与前端行为一致。
 */
import { describe, expect, it, beforeEach } from "vitest";
import { POST as registerRoute } from "@/app/api/v1/auth/register/route";
import { PATCH as patchProfileRoute } from "@/app/api/v1/users/me/profile/route";
import { POST as createResumeRoute } from "@/app/api/v1/resumes/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { GET as jobDetailRoute } from "@/app/api/v1/jobs/[id]/route";
import { POST as matchRoute } from "@/app/api/v1/matches/route";
import { POST as createAppRoute } from "@/app/api/v1/applications/route";
import { POST as stageRoute } from "@/app/api/v1/applications/[id]/stage/route";
import { GET as boardRoute } from "@/app/api/v1/applications/board/route";
import { POST as createReminderRoute } from "@/app/api/v1/reminders/route";
import { GET as overviewRoute } from "@/app/api/v1/dashboard/overview/route";
import { GET as taskRoute } from "@/app/api/v1/ai-tasks/[id]/route";
import { executeTask } from "@/server/ai/runner";
import { callRoute, expectOk, resetDb } from "@/testing/helpers";
import type { ResumeContent } from "@/shared/types";

beforeEach(resetDb);

const CONTENT: ResumeContent = {
  basics: { name: "李晓阳", city: "上海", title: "前端工程师" },
  summary: "5 年前端经验",
  skills: ["React", "TypeScript", "Node.js", "性能优化", "Vite"],
  experience: [
    {
      company: "星辰科技",
      title: "高级前端",
      start: "2022-03",
      end: "至今",
      highlights: ["首屏从 3.2s 优化到 1.1s，转化率提升 8%"],
    },
  ],
  education: [{ school: "华东理工", major: "软件工程", degree: "本科", start: "2015", end: "2019" }],
  projects: [],
};

const JD = `招聘：资深前端工程师（电商）
工作城市：上海
薪资：25-40K
任职要求：
1、5年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript、性能优化，熟悉 Node.js`;

describe("E2E：求职核心闭环", () => {
  it("注册→简历→职位解析→匹配→投递→看板→仪表盘 全链路", async () => {
    // 1. 注册
    const reg = await callRoute(registerRoute, {
      method: "POST",
      body: { email: "e2e@test.cn", password: "password123", name: "李晓阳" },
    });
    expect(reg.status).toBe(201);
    const token = reg.res.headers.getSetCookie().find((c) => c.startsWith("jh_access="))!.split("=")[1].split(";")[0];

    // 2. 求职画像
    const profile = await callRoute(patchProfileRoute, {
      method: "PATCH",
      token,
      body: { expectedPosition: "前端工程师", expectedCity: "上海", salaryMin: 20, salaryMax: 35, experienceYears: 5 },
    });
    expect(profile.status).toBe(200);

    // 3. 简历工作台
    const resumeRes = await callRoute(createResumeRoute, {
      method: "POST",
      token,
      body: { title: "前端主简历", content: CONTENT },
    });
    const resumeId = (expectOk(resumeRes.json) as { resume: { id: string } }).resume.id;

    // 4. 职位中心：粘贴 JD 创建（触发自动解析）
    const jobRes = await callRoute(createJobRoute, {
      method: "POST",
      token,
      body: { companyName: "字节跳动", title: "资深前端工程师", description: JD },
    });
    expect(jobRes.status).toBe(201);
    const { job, taskId } = expectOk(jobRes.json) as { job: { id: string }; taskId: string };
    const parsed = await executeTask(taskId);
    expect(parsed.status).toBe("succeeded");

    const jobDetail = await callRoute(jobDetailRoute, { token, params: { id: job.id } });
    const structured = (expectOk(jobDetail.json) as { job: { structured: Record<string, unknown> } })
      .job.structured;
    expect(structured.city).toBe("上海");
    expect(structured.salaryMin).toBe(25);

    // 5. 智能匹配
    const matchRes = await callRoute(matchRoute, {
      method: "POST",
      token,
      body: { jobId: job.id, resumeId, useAI: false },
    });
    const match = expectOk(matchRes.json) as { match: { id: string; totalScore: number } };
    expect(match.match.totalScore).toBeGreaterThanOrEqual(70); // 高匹配度

    // 6. 投递流水线：wishlist → applied → written_test → interview
    const appRes = await callRoute(createAppRoute, {
      method: "POST",
      token,
      body: { jobId: job.id, resumeId, notes: "内推" },
    });
    const app = expectOk(appRes.json) as { id: string };
    for (const [to, note] of [
      ["applied", "内推投递"],
      ["written_test", "笔试通过"],
      ["interview", "约一面"],
    ] as const) {
      const moved = await callRoute(stageRoute, {
        method: "POST",
        token,
        params: { id: app.id },
        body: { toStage: to, note },
      });
      expect(moved.status).toBe(200);
    }

    // 7. 看板
    const board = await callRoute(boardRoute, { token });
    const stages = expectOk(board.json) as { stage: string; items: unknown[] }[];
    expect(stages.find((s) => s.stage === "interview")!.items).toHaveLength(1);

    // 8. 提醒
    const reminder = await callRoute(createReminderRoute, {
      method: "POST",
      token,
      body: { title: "准备一面", remindAt: new Date(Date.now() + 3600_000), applicationId: app.id },
    });
    expect(reminder.status).toBe(201);

    // 9. 仪表盘
    const overview = await callRoute(overviewRoute, { token });
    const d = expectOk(overview.json) as {
      resumeCount: number;
      jobCount: number;
      applicationTotal: number;
      stageCounts: Record<string, number>;
      funnel: { stage: string; count: number }[];
      upcomingReminderCount: number;
    };
    expect(d.resumeCount).toBe(1);
    expect(d.jobCount).toBe(1);
    expect(d.applicationTotal).toBe(1);
    expect(d.stageCounts.interview).toBe(1);
    const funnelInterview = d.funnel.find((f) => f.stage === "interview");
    expect(funnelInterview?.count).toBe(1);
    expect(d.upcomingReminderCount).toBe(1);

    // 10. AI 任务可追溯
    const taskRes = await callRoute(taskRoute, { token, params: { id: taskId } });
    expect((expectOk(taskRes.json) as { status: string }).status).toBe("succeeded");
  });
});
