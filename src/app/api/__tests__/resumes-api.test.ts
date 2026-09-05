import { describe, expect, it, beforeEach } from "vitest";
import { POST as createResumeRoute, GET as listResumesRoute } from "@/app/api/v1/resumes/route";
import {
  GET as detailRoute,
  PATCH as patchRoute,
  DELETE as deleteRoute,
} from "@/app/api/v1/resumes/[id]/route";
import { POST as versionRoute } from "@/app/api/v1/resumes/[id]/versions/route";
import { POST as uploadRoute } from "@/app/api/v1/resumes/upload/route";
import { POST as optimizeRoute } from "@/app/api/v1/resumes/[id]/optimize/route";
import { GET as analysisRoute } from "@/app/api/v1/resumes/[id]/analysis/route";
import { GET as taskRoute } from "@/app/api/v1/ai-tasks/[id]/route";
import { executeTask } from "@/server/ai/runner";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import { emptyResumeContent } from "@/shared/types";

beforeEach(resetDb);

const CONTENT = {
  basics: { name: "张三", city: "上海", title: "前端工程师" },
  summary: "5 年前端经验",
  skills: ["React", "TypeScript", "Node.js", "Vue", "Webpack"],
  experience: [
    {
      company: "A科技",
      title: "高级前端",
      start: "2021-06",
      end: "至今",
      highlights: ["首屏加载提升 40%"],
    },
  ],
  education: [{ school: "某某大学", major: "计算机科学", degree: "本科", start: "2015", end: "2019" }],
  projects: [],
};

const RESUME_TEXT = `张三
求职意向：前端工程师
手机：13812345678
邮箱：zhangsan@example.com
5 年前端开发经验，熟悉 React、TypeScript、Node.js
负责核心页面开发与性能优化`;

async function createSampleResume(token: string) {
  const res = await callRoute(createResumeRoute, {
    method: "POST",
    token,
    body: { title: "主简历", content: CONTENT },
  });
  return (expectOk(res.json) as { resume: { id: string } }).resume.id;
}

describe("resume API", () => {
  it("CRUD 与版本管理全流程", async () => {
    const { token } = await createTestUser();

    // 创建
    const created = await callRoute(createResumeRoute, {
      method: "POST",
      token,
      body: { title: "我的简历" },
    });
    expect(created.status).toBe(201);
    const resumeId = (expectOk(created.json) as { resume: { id: string } }).resume.id;

    // 列表
    const list = await callRoute(listResumesRoute, { token });
    expect(expectOk(list.json)).toHaveLength(1);

    // 详情
    const detail = await callRoute(detailRoute, { token, params: { id: resumeId } });
    const d = expectOk(detail.json) as { versions: { versionNo: number }[] };
    expect(d.versions).toHaveLength(1);
    expect(d.versions[0].versionNo).toBe(1);

    // 新版本
    const v2 = await callRoute(versionRoute, {
      method: "POST",
      token,
      params: { id: resumeId },
      body: { content: CONTENT, note: "定制版", source: "manual" },
    });
    expect(v2.status).toBe(201);
    const v2Data = expectOk(v2.json) as { versionNo: number };
    expect(v2Data.versionNo).toBe(2);

    // PATCH 设为主简历
    const patched = await callRoute(patchRoute, {
      method: "PATCH",
      token,
      params: { id: resumeId },
      body: { isPrimary: true },
    });
    expect((expectOk(patched.json) as { isPrimary: boolean }).isPrimary).toBe(true);

    // 删除
    await callRoute(deleteRoute, { method: "DELETE", token, params: { id: resumeId } });
    const empty = await callRoute(listResumesRoute, { token });
    expect(expectOk(empty.json)).toHaveLength(0);
  });

  it("未登录返回 401；越权返回 404", async () => {
    const noAuth = await callRoute(listResumesRoute);
    expect(noAuth.status).toBe(401);

    const { token: t1 } = await createTestUser("u1@test.cn");
    const { token: t2 } = await createTestUser("u2@test.cn");
    const resumeId = await createSampleResume(t1);
    const forbidden = await callRoute(detailRoute, { token: t2, params: { id: resumeId } });
    expect(forbidden.status).toBe(404); // 不暴露资源存在性
    expect(forbidden.json.code).toBe(3001);
  });

  it("上传 txt 简历 → 异步解析 → 内容结构化落库", async () => {
    const { token } = await createTestUser();
    const fd = new FormData();
    fd.append(
      "file",
      new File([Buffer.from(RESUME_TEXT, "utf8")], "张三-前端简历.txt", { type: "text/plain" }),
    );

    const uploaded = await callRoute(uploadRoute, { method: "POST", token, body: fd });
    expect(uploaded.status).toBe(202);
    const { resumeId, taskId } = expectOk(uploaded.json) as {
      resumeId: string;
      taskId: string;
    };

    // 任务已成功（进程内异步执行）
    const taskRes = await callRoute(taskRoute, { token, params: { id: taskId } });
    const task = expectOk(taskRes.json) as { status: string; output?: Record<string, unknown> };
    expect(task.status).toBe("succeeded");

    // 版本内容已结构化
    const detail = await callRoute(detailRoute, { token, params: { id: resumeId } });
    const d = expectOk(detail.json) as {
      versions: { content: { basics: { name: string; email: string }; skills: string[] }; source: string }[];
      resume: { parsePlaceholder?: unknown };
    };
    expect(d.versions[0].content.basics.name).toBe("张三");
    expect(d.versions[0].content.basics.email).toBe("zhangsan@example.com");
    expect(d.versions[0].content.skills).toContain("React");
    expect(d.versions[0].source).toBe("upload");
  });

  it("不支持的文件类型返回 400/1001", async () => {
    const { token } = await createTestUser();
    const fd = new FormData();
    fd.append("file", new File([Buffer.from("binary")], "photo.exe", { type: "application/octet-stream" }));
    const res = await callRoute(uploadRoute, { method: "POST", token, body: fd });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe(1001);
  });

  it("AI 优化：发起任务 → 分析落库 → 查询分析", async () => {
    const { token } = await createTestUser();
    const resumeId = await createSampleResume(token);

    const opt = await callRoute(optimizeRoute, {
      method: "POST",
      token,
      params: { id: resumeId },
      body: { jobTitle: "资深前端工程师" },
    });
    expect(opt.status).toBe(202);
    const { taskId } = expectOk(opt.json) as { taskId: string };

    await executeTask(taskId);
    const analysisRes = await callRoute(analysisRoute, { token, params: { id: resumeId } });
    const analysis = expectOk(analysisRes.json) as {
      score: number;
      issues: string[];
      suggestions: unknown[];
      versionId: string;
    };
    expect(analysis.score).toBeGreaterThanOrEqual(60);
    expect(analysis.score).toBeLessThanOrEqual(100);
    expect(analysis.versionId).toBeTruthy();

    // 任务状态轮询
    const taskRes = await callRoute(taskRoute, { token, params: { id: taskId } });
    expect((expectOk(taskRes.json) as { status: string }).status).toBe("succeeded");
  });

  it("无分析结果时查询返回 404", async () => {
    const { token } = await createTestUser();
    const resumeId = await createSampleResume(token);
    const res = await callRoute(analysisRoute, { token, params: { id: resumeId } });
    expect(res.status).toBe(404);
    expect(res.json.code).toBe(1004);
  });

  it("空内容简历可正常创建（默认空结构）", async () => {
    const { token } = await createTestUser();
    const created = await callRoute(createResumeRoute, {
      method: "POST",
      token,
      body: { title: "空白简历" },
    });
    const { version } = expectOk(created.json) as { version: { content: Record<string, unknown> } };
    expect(version.content).toEqual(emptyResumeContent());
  });
});
