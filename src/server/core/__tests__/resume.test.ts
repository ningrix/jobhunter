import { describe, expect, it, beforeEach } from "vitest";
import {
  createResume,
  createVersion,
  getResumeDetail,
  getLatestVersion,
  listResumes,
  markParseDone,
  saveAnalysis,
  softDeleteResume,
  updateResume,
} from "@/server/core/resume-service";
import { ErrorCode, AppError } from "@/shared/errors";
import { emptyResumeContent } from "@/shared/types";
import { createTestUser, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

describe("resume-service", () => {
  it("创建简历默认 v1，创建版本自增，列表按更新时间排序", async () => {
    const { user } = await createTestUser();
    const { resume } = await createResume(user.id, { title: "主简历" });
    expect(resume.isPrimary).toBe(false);

    const v2 = await createVersion(user.id, resume.id, {
      content: emptyResumeContent(),
      note: "针对前端岗位定制",
      source: "ai",
    });
    expect(v2.versionNo).toBe(2);
    expect(v2.source).toBe("ai");

    const detail = await getResumeDetail(user.id, resume.id);
    expect(detail.versions).toHaveLength(2);
    expect(detail.versions[0].versionNo).toBe(2); // 倒序
  });

  it("主简历唯一：设置新的会取消旧的", async () => {
    const { user } = await createTestUser();
    const a = await createResume(user.id, { title: "A" });
    const b = await createResume(user.id, { title: "B" });

    await updateResume(user.id, a.resume.id, { isPrimary: true });
    await updateResume(user.id, b.resume.id, { isPrimary: true });

    const list = await listResumes(user.id);
    const primary = list.filter((r) => r.isPrimary);
    expect(primary).toHaveLength(1);
    expect(primary[0].id).toBe(b.resume.id);
  });

  it("软删除后列表不可见且不可访问", async () => {
    const { user } = await createTestUser();
    const { resume } = await createResume(user.id, { title: "待删" });
    await softDeleteResume(user.id, resume.id);

    expect(await listResumes(user.id)).toHaveLength(0);
    await expect(getResumeDetail(user.id, resume.id)).rejects.toMatchObject({
      code: ErrorCode.RESUME_NOT_FOUND,
    });
  });

  it("越权访问他人简历报 3001", async () => {
    const { user: u1 } = await createTestUser();
    const { user: u2 } = await createTestUser();
    const { resume } = await createResume(u1.id, { title: "u1 的简历" });
    const err = (await getResumeDetail(u2.id, resume.id).catch((e) => e)) as AppError;
    expect(err.code).toBe(ErrorCode.RESUME_NOT_FOUND);
  });

  it("解析回写与 AI 分析落库", async () => {
    const { user } = await createTestUser();
    const { resume } = await createResume(user.id, { title: "上传简历" });
    const { version } = await getLatestVersion(user.id, resume.id);

    await markParseDone(resume.id, version.id, {
      basics: { name: "张三", email: "z@test.cn" },
      summary: "",
      skills: ["React"],
      experience: [],
      education: [],
      projects: [],
    });
    const detail = await getResumeDetail(user.id, resume.id);
    expect(detail.versions[0].content.basics.name).toBe("张三");

    await saveAnalysis(resume.id, detail.versions[0].id, "task-1", {
      score: 88.6,
      issues: ["缺少量化"],
      suggestions: [{ section: "experience", before: "a", after: "b", reason: "c" }],
    });
    const detail2 = await getResumeDetail(user.id, resume.id);
    void detail2;
    const { latestAnalysis } = await import("@/server/core/resume-service");
    const analysis = await latestAnalysis(resume.id);
    expect(analysis.score).toBe(89); // 四舍五入
    expect(analysis.issues).toEqual(["缺少量化"]);
  });
});
