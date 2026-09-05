import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agentEvents, applications, aiUsageLogs, reminders } from "@/db/schema";
import { startApplyRun, confirmRun, getApplyFlowState, resumeAfterCaptcha, handoverRun, MAX_CAPTCHA_RESUMES } from "../apply-flow";
import { PROMPTS } from "@/server/ai/prompts";
import { MockBrowserDriver, type MockSiteScenario } from "../drivers/mock-driver";
import { createTestUser, resetDb } from "@/testing/helpers";
import { createResume } from "@/server/core/resume-service";
import { createJob } from "@/server/core/job-service";
import { upsertPolicy } from "@/server/core/policy-service";
import { ErrorCode } from "@/shared/errors";

beforeEach(resetDb);

const CONTENT = {
  basics: { name: "张三", city: "深圳" },
  summary: "3 年 Java 后端",
  skills: ["Java", "Spring Boot", "MySQL"],
  experience: [
    { company: "A 公司", title: "Java 工程师", start: "2022-01", end: "至今", highlights: ["核心系统重构"] },
  ],
  education: [{ school: "某大学", major: "软件", degree: "本科", start: "2018", end: "2022" }],
  projects: [],
};

const SCENARIO: MockSiteScenario = {
  jobUrl: "mock://boss/job/x1",
  job: { title: "Java 后端工程师", companyName: "未来科技", description: "Java 后端 JD 全文", city: "深圳" },
  formFields: [{ name: "greeting", label: "打招呼语", type: "textarea", required: true }],
};

async function seed(opts: { policy?: Parameters<typeof upsertPolicy>[1] } = {}) {
  const { user } = await createTestUser();
  const { resume } = await createResume(user.id, { title: "主简历", content: CONTENT });
  const { job } = await createJob(user.id, {
    companyName: "未来科技",
    title: "Java 后端工程师",
    city: "深圳",
    salaryMin: 20,
    salaryMax: 35,
    description: "Java 后端 JD 全文",
    source: "boss",
    sourceUrl: "mock://boss/job/x1",
  });
  if (opts.policy) await upsertPolicy(user.id, opts.policy);
  return { user, resume, job };
}

describe("ApplyFlow（Level 1 半自动投递）", () => {
  it("完整链路：open→extract→policy→generate→fill→等待确认→确认后提交并创建投递", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });

    expect(state.status).toBe("awaiting_confirmation");
    expect(getApplyFlowState(state.sessionId, user.id)?.status).toBe("awaiting_confirmation");

    // 确认前：无投递记录
    let apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(0);

    const done = await confirmRun(state.sessionId, user.id, true);
    expect(done.status).toBe("submitted");
    expect(done.applicationId).toBeTruthy();

    apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(1);
    expect(apps[0].stage).toBe("applied");
    expect(apps[0].appliedAt).toBeTruthy();

    // 审计事件完整：open→extract→policy→generate→fill→wait(用户)→submit
    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, state.sessionId));
    const actions = events.map((e) => e.action);
    expect(actions).toEqual([
      "open_page",
      "extract_jd",
      "policy_check",
      "generate_content",
      "fill_form",
      "wait_user_confirm",
      "wait_user_confirm",
      "submit",
    ]);
    const submitEvent = events.find((e) => e.action === "submit")!;
    expect(submitEvent.userConfirmed).toBe(true);
    expect(submitEvent.result).toBe("success");
  });

  it("用户拒绝提交 → 不创建投递、不留 submit 成功事件", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    const done = await confirmRun(state.sessionId, user.id, false);
    expect(done.status).toBe("rejected_by_user");
    const apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(0);
  });

  it("平台要求登录 → 立即 blocked，提示用户自行登录，绝不绕过", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, loginRequired: true });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");
    expect(state.blockedReason).toContain("登录");
    expect(state.blockedReason).toContain("不会尝试绕过");
    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    // 停在第一步（open_page blocked），且阻断联动创建了站内提醒
    expect(events.map((e) => e.action)).toEqual(["open_page", "blocked_reminder_created"]);
    expect(events[0].result).toBe("blocked");
  });

  it("平台弹出安全验证 → blocked，不填表不提交", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");
    expect(state.blockedReason).toContain("安全验证");
    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    expect(events.map((e) => e.action)).not.toContain("fill_form");
    expect(events.map((e) => e.action)).not.toContain("submit");
    const apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(0);
  });

  it("策略拒绝（黑名单）→ blocked 于 policy_check，不创建投递", async () => {
    const { user, resume, job } = await seed({
      policy: { companyBlacklist: ["未来科技"] },
    });
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");
    expect(state.blockedReason).toContain("黑名单");
    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    expect(events.map((e) => e.action)).toEqual(["open_page", "extract_jd", "policy_check"]);
    const apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(0);
  });

  it("未知会话确认 → 7103；错误状态下确认 → 7102", async () => {
    const { user } = await createTestUser();
    await expect(confirmRun("no-such-session", user.id, true)).rejects.toMatchObject({
      code: ErrorCode.AGENT_SESSION_NOT_FOUND,
    });

    const { user: u2, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(u2.id, { jobId: job.id, resumeId: resume.id }, { driver });
    await confirmRun(state.sessionId, u2.id, true);
    // 已提交后再次确认
    await expect(confirmRun(state.sessionId, u2.id, true)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });
  });

  it("职位不存在 → 4001", async () => {
    const { user } = await createTestUser();
    await expect(
      startApplyRun(user.id, { jobId: "missing" }),
    ).rejects.toMatchObject({ code: ErrorCode.JOB_NOT_FOUND });
  });

  it("无简历 → 3001", async () => {
    const { user } = await createTestUser();
    const { job } = await createJob(user.id, {
      companyName: "未来科技",
      title: "Java 后端工程师",
      city: "深圳",
      description: "JD",
    });
    await expect(startApplyRun(user.id, { jobId: job.id })).rejects.toMatchObject({
      code: ErrorCode.RESUME_NOT_FOUND,
    });
  });
});

describe("ApplyFlow·AI 打招呼语（V3 Phase 2 B1）", () => {
  beforeEach(resetDb);

  async function generateContentEvent(sessionId: string, userId: string) {
    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, sessionId));
    return events.find((e) => e.action === "generate_content")!;
  }

  it("useAI=true：AI 生成来源标记为 ai，≤60 字，与模板语可区分", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(
      user.id,
      { jobId: job.id, resumeId: resume.id, useAI: true },
      { driver },
    );
    expect(state.status).toBe("awaiting_confirmation");

    const event = await generateContentEvent(state.sessionId, user.id);
    expect(event.detail?.greetingSource).toBe("ai");
    expect(Number(event.detail?.greetingLength)).toBeLessThanOrEqual(60);
    // Mock AI 语以「看到贵司」开头，模板语以「我对贵司」开头，可区分
    const waitEvents = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, state.sessionId));
    const waitEvent = waitEvents.find((e) => e.action === "wait_user_confirm")!;
    const text = String(waitEvent.detail?.greeting);
    expect(text).toContain("看到贵司");
    expect(text).not.toContain("我对贵司");
    // 不编造：不含简历/职位之外的公司名（本套件中不存在「不存在公司」）
    expect(text).not.toContain("不存在公司");
  });

  it("useAI=true 且 AI 失败：降级模板兜底，流程不中断", async () => {
    vi.stubEnv("AI_PROVIDER", "openai"); // 未配置端点 → chat 必然抛错
    try {
      const { user, resume, job } = await seed();
      const driver = new MockBrowserDriver(SCENARIO);
      const state = await startApplyRun(
        user.id,
        { jobId: job.id, resumeId: resume.id, useAI: true },
        { driver },
      );
      expect(state.status).toBe("awaiting_confirmation");

      const event = await generateContentEvent(state.sessionId, user.id);
      expect(event.detail?.greetingSource).toBe("template_fallback");
      expect(typeof event.detail?.greetingError).toBe("string");
      expect(String(event.detail?.greetingError)).not.toBe("");
      // 模板兜底语仍写入表单并等待确认
      const events = await getDb()
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.sessionId, state.sessionId));
      expect(events.map((e) => e.action)).toContain("fill_form");
      const waitEvent = events.find((e) => e.action === "wait_user_confirm")!;
      expect(String(waitEvent.detail?.greeting)).toContain("我对贵司");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("useAI 缺省：行为与 V2 一致，来源标记为 template", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    const event = await generateContentEvent(state.sessionId, user.id);
    expect(event.detail?.greetingSource).toBe("template");
    expect(event.detail?.greetingError).toBeUndefined();
    expect(state.status).toBe("awaiting_confirmation");
  });
});

describe("ApplyFlow·验证码人工复检（V3 Phase 2 B2）", () => {
  beforeEach(resetDb);

  it("验证码阻断 → 用户完成验证复检 → 从断点继续 → 确认后提交", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");
    expect(state.blockedReason).toContain("安全验证");

    const resumed = await resumeAfterCaptcha(state.sessionId, user.id);
    expect(resumed.status).toBe("awaiting_confirmation");

    const done = await confirmRun(state.sessionId, user.id, true);
    expect(done.status).toBe("submitted");
    expect(done.applicationId).toBeTruthy();

    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, state.sessionId));
    const resolve = events.find((e) => e.action === "captcha_manual_resolved")!;
    expect(resolve.result).toBe("success");
    expect(resolve.source).toBe("user");
    expect(resolve.userConfirmed).toBe(true);
    // 复检后不再重复 open/extract/policy，直接续填表
    expect(events.map((e) => e.action).filter((a) => a === "open_page")).toHaveLength(1);
    expect(events.map((e) => e.action)).toContain("fill_form");
  });

  it("验证未真正通过（sticky）→ 复检保持 blocked 并提示剩余次数；超过上限拒绝复检", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true, captchaSticky: true });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");

    for (let i = 1; i <= MAX_CAPTCHA_RESUMES; i++) {
      const r = await resumeAfterCaptcha(state.sessionId, user.id);
      expect(r.status).toBe("blocked");
      expect(r.blockedReason).toContain(`剩余 ${MAX_CAPTCHA_RESUMES - i} 次`);
    }
    await expect(resumeAfterCaptcha(state.sessionId, user.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });
    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, state.sessionId));
    const resolves = events.filter((e) => e.action === "captcha_manual_resolved");
    expect(resolves.filter((e) => e.result === "blocked")).toHaveLength(MAX_CAPTCHA_RESUMES + 1); // 2 次"仍在验证中" + 1 次上限拒绝
  });

  it("登录墙阻断的会话不可复检 → 7102；等待确认状态下复检 → 7102；未知会话 → 7103", async () => {
    const { user, resume, job } = await seed();
    const loginDriver = new MockBrowserDriver({ ...SCENARIO, loginRequired: true });
    const blocked = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver: loginDriver });
    await expect(resumeAfterCaptcha(blocked.sessionId, user.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });

    const driver = new MockBrowserDriver(SCENARIO);
    const awaiting = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    await expect(resumeAfterCaptcha(awaiting.sessionId, user.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });

    const { user: stranger } = await createTestUser();
    await expect(resumeAfterCaptcha(awaiting.sessionId, stranger.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_SESSION_NOT_FOUND,
    });
  });
});

describe("ApplyFlow·用户接管（V3 Phase 2 B3）", () => {
  beforeEach(resetDb);

  it("handover → Agent 退出（handed_over_to_user），不创建投递记录，事件留痕", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });

    const done = await confirmRun(state.sessionId, user.id, false, "handover");
    expect(done.status).toBe("handed_over_to_user");
    expect(done.blockedReason).toContain("用户接管");
    expect(done.blockedReason).toContain("手动投递");

    const apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(0);

    const events = await getDb()
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, state.sessionId));
    const handover = events.find((e) => e.action === "user_handover")!;
    expect(handover).toBeTruthy();
    expect(handover.source).toBe("user");
    expect(handover.userConfirmed).toBe(true);
    expect(handover.detail?.handoverReason).toBeTruthy();
    expect(events.map((e) => e.action)).not.toContain("submit");
  });

  it("接管后不允许再次确认 → 7102", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    await confirmRun(state.sessionId, user.id, false, "handover");
    await expect(confirmRun(state.sessionId, user.id, true)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });
  });
});

describe("ApplyFlow·阻断提醒联动（V3 Phase 2 B4）", () => {
  beforeEach(resetDb);

  async function pendingReminders(userId: string) {
    return getDb()
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.status, "pending")));
  }

  it("验证码阻断 → 自动创建待处理提醒（含 sessionId）；复检通过后自动关闭", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");

    let rows = await pendingReminders(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain(job.title);
    expect(rows[0].title).toContain("安全验证");
    expect(rows[0].content).toContain(state.sessionId);

    const resumed = await resumeAfterCaptcha(state.sessionId, user.id);
    expect(resumed.status).toBe("awaiting_confirmation");

    rows = await pendingReminders(user.id);
    expect(rows).toHaveLength(0);
    const all = await getDb().select().from(reminders).where(eq(reminders.userId, user.id));
    expect(all[0].status).toBe("done");
    expect(all[0].doneAt).toBeTruthy();
  });

  it("同一会话反复被验证码阻断（未通过）→ 提醒不重复创建", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true, captchaSticky: true });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");
    await resumeAfterCaptcha(state.sessionId, user.id); // 仍在验证中，再次 blocked
    await resumeAfterCaptcha(state.sessionId, user.id);

    const rows = await pendingReminders(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain("安全验证");
  });

  it("登录墙阻断 → 创建「需登录」提醒", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, loginRequired: true });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");
    const rows = await pendingReminders(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain("需登录");
  });

  it("CAPTCHA 与 LOGIN_WALL 是不同类型：各自的提醒可同时存在", async () => {
    const { user, resume, job } = await seed();
    const captchaDriver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true });
    const captchaState = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver: captchaDriver });
    expect(captchaState.status).toBe("blocked");

    const { job: job2 } = await createJob(user.id, {
      companyName: "另一家",
      title: "平台运营专员",
      city: "深圳",
      description: "JD",
      source: "boss",
      sourceUrl: "mock://boss/job/x2",
    });
    const loginDriver = new MockBrowserDriver({ ...SCENARIO, jobUrl: "mock://boss/job/x2", loginRequired: true });
    const loginState = await startApplyRun(user.id, { jobId: job2.id, resumeId: resume.id }, { driver: loginDriver });
    expect(loginState.status).toBe("blocked");

    const rows = await pendingReminders(user.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title).filter((t) => t.includes("安全验证"))).toHaveLength(1);
    expect(rows.map((r) => r.title).filter((t) => t.includes("需登录"))).toHaveLength(1);
    expect(rows.map((r) => r.content).filter((c) => c?.includes(job.id))).toHaveLength(1);
    expect(rows.map((r) => r.content).filter((c) => c?.includes(job2.id))).toHaveLength(1);
  });
});

describe("ApplyFlow·状态机与授权边界（V3 Phase 2 硬验收）", () => {
  beforeEach(resetDb);

  it("第二次验证码：两次人工恢复内可完成（captchaRounds=2）", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true, captchaRounds: 2 });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");

    const r1 = await resumeAfterCaptcha(state.sessionId, user.id);
    expect(r1.status).toBe("blocked"); // 复检通过但再次点击申请 → 第二轮验证码
    const r2 = await resumeAfterCaptcha(state.sessionId, user.id);
    expect(r2.status).toBe("awaiting_confirmation"); // 第二次恢复后继续

    const done = await confirmRun(state.sessionId, user.id, true);
    expect(done.status).toBe("submitted");

    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    expect(events.filter((e) => e.action === "captcha_blocked")).toHaveLength(2);
    expect(events.filter((e) => e.action === "captcha_manual_resolved" && e.result === "success")).toHaveLength(2);
  });

  it("第三次验证码：超过 MAX_CAPTCHA_RESUMES → 永久 blocked（captchaRounds=3）", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true, captchaRounds: 3 });
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(state.status).toBe("blocked");

    const r1 = await resumeAfterCaptcha(state.sessionId, user.id);
    expect(r1.status).toBe("blocked");
    const r2 = await resumeAfterCaptcha(state.sessionId, user.id);
    expect(r2.status).toBe("blocked");
    // 第三次恢复请求：达到上限，拒绝且会话保持 blocked 终态
    await expect(resumeAfterCaptcha(state.sessionId, user.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });
    expect(getApplyFlowState(state.sessionId, user.id)?.status).toBe("blocked");

    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    expect(events.filter((e) => e.action === "captcha_blocked")).toHaveLength(3);
    const apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(0);
  });

  it("submitted / handed_over 状态调用 resolved API → 7102", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true });
    const blocked = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    const resumed = await resumeAfterCaptcha(blocked.sessionId, user.id);
    const done = await confirmRun(resumed.sessionId, user.id, true);
    expect(done.status).toBe("submitted");
    await expect(resumeAfterCaptcha(done.sessionId, user.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });

    const state2 = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    const handed = await handoverRun(state2.sessionId, user.id);
    await expect(resumeAfterCaptcha(handed.sessionId, user.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_BLOCKED,
    });
  });

  it("handover 扩展：captcha-blocked 可接管；重复/非允许状态拒绝；handover 后 resume 失败", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true });
    const blocked = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(blocked.status).toBe("blocked");

    // captcha-blocked 状态可接管（携带自定义 reason）
    const handed = await handoverRun(blocked.sessionId, user.id, "验证码太麻烦，我自己处理");
    expect(handed.status).toBe("handed_over_to_user");
    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, blocked.sessionId));
    const ev = events.find((e) => e.action === "user_handover")!;
    expect(ev.source).toBe("user");
    expect(ev.detail?.handoverReason).toBe("验证码太麻烦，我自己处理");
    // 提醒保持待办（用户自己要去平台处理）
    const pending = await getDb()
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, user.id), eq(reminders.status, "pending")));
    expect(pending).toHaveLength(1);

    // 重复接管 → 7102
    await expect(handoverRun(blocked.sessionId, user.id)).rejects.toMatchObject({ code: ErrorCode.AGENT_BLOCKED });
    // 接管后 resume → 7102
    await expect(resumeAfterCaptcha(blocked.sessionId, user.id)).rejects.toMatchObject({ code: ErrorCode.AGENT_BLOCKED });
    // 接管后 confirm → 7102
    await expect(confirmRun(blocked.sessionId, user.id, true)).rejects.toMatchObject({ code: ErrorCode.AGENT_BLOCKED });

    // submitted 状态接管 → 7102
    const state2 = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    const awaiting = await state2; // awaiting_confirmation
    const submitted = await confirmRun(awaiting.sessionId, user.id, true);
    await expect(handoverRun(submitted.sessionId, user.id)).rejects.toMatchObject({ code: ErrorCode.AGENT_BLOCKED });

    // rejected 状态接管 → 7102
    const state3 = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });
    const rejected = await confirmRun(state3.sessionId, user.id, false);
    expect(rejected.status).toBe("rejected_by_user");
    await expect(handoverRun(rejected.sessionId, user.id)).rejects.toMatchObject({ code: ErrorCode.AGENT_BLOCKED });
  });

  it("授权边界：用户 A 的会话/职位，用户 B 无法 confirm/resolved/handover/读取/启动", async () => {
    const { user: userA, resume, job } = await seed();
    const driver = new MockBrowserDriver({ ...SCENARIO, captchaOnApply: true });
    const blocked = await startApplyRun(userA.id, { jobId: job.id, resumeId: resume.id }, { driver });
    expect(blocked.status).toBe("blocked");

    const { user: userB } = await createTestUser();

    // B 无法读取 A 的会话
    expect(getApplyFlowState(blocked.sessionId, userB.id)).toBeNull();
    // B 无法复检/确认/接管 A 的会话
    await expect(resumeAfterCaptcha(blocked.sessionId, userB.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_SESSION_NOT_FOUND,
    });
    // A 先复检到 awaiting，B 尝试 confirm
    const awaiting = await resumeAfterCaptcha(blocked.sessionId, userA.id);
    expect(awaiting.status).toBe("awaiting_confirmation");
    await expect(confirmRun(awaiting.sessionId, userB.id, true)).rejects.toMatchObject({
      code: ErrorCode.AGENT_SESSION_NOT_FOUND,
    });
    await expect(handoverRun(awaiting.sessionId, userB.id)).rejects.toMatchObject({
      code: ErrorCode.AGENT_SESSION_NOT_FOUND,
    });
    // B 用 A 的职位启动 Agent → 职位不存在
    await expect(startApplyRun(userB.id, { jobId: job.id })).rejects.toMatchObject({
      code: ErrorCode.JOB_NOT_FOUND,
    });
    // B 用 A 的简历 ID 启动（B 无简历）→ 3001
    const { job: jobB } = await createJob(userB.id, {
      companyName: "B 公司",
      title: "B 岗位",
      city: "深圳",
      description: "JD",
    });
    await expect(startApplyRun(userB.id, { jobId: jobB.id, resumeId: resume.id })).rejects.toMatchObject({
      code: ErrorCode.RESUME_NOT_FOUND,
    });
  });

  it("并发确认：多个 confirm 同时到达 → 仅一次提交成功，只创建一条投递记录", async () => {
    const { user, resume, job } = await seed();
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(user.id, { jobId: job.id, resumeId: resume.id }, { driver });

    const results = await Promise.allSettled([
      confirmRun(state.sessionId, user.id, true),
      confirmRun(state.sessionId, user.id, true),
      confirmRun(state.sessionId, user.id, true),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const apps = await getDb().select().from(applications).where(eq(applications.userId, user.id));
    expect(apps).toHaveLength(1);

    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    expect(events.filter((e) => e.action === "submit" && e.result === "success")).toHaveLength(1);
  });
});

describe("ApplyFlow·B1 失败矩阵与防幻觉（V3 Phase 2 硬验收）", () => {
  beforeEach(resetDb);

  function startAIServer(respond: () => string): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(respond());
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        resolve({
          url: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
      });
    });
  }

  it("prompt 硬约束声明：≤60 字、禁编造、只输出 JSON", () => {
    const prompt = PROMPTS.generate_greeting({
      resumeFacts: { skills: ["Java"], experienceCount: 2 },
      job: { title: "Java 工程师", companyName: "CompanyA", structured: null },
      reference: "参考语",
    });
    expect(prompt).toContain("60 个字符");
    expect(prompt).toContain("严禁编造");
    expect(prompt).toContain("只输出 JSON");
    expect(prompt).toContain("参考语");
    expect(prompt).toContain("CompanyA");
  });

  it("防幻觉：AI 语只含输入事实——经历段数取 work experience 而非 projects，且不出现输入外的公司/数字", async () => {
    const { user } = await createTestUser();
    const { resume } = await createResume(user.id, {
      title: "幻觉测试",
      content: {
        basics: { name: "李四", city: "深圳" },
        summary: "",
        skills: ["Java"],
        experience: [
          { company: "CompanyA", title: "Java 工程师", start: "2022-01", end: "至今", highlights: [] },
        ],
        projects: [
          { name: "项目一", role: "开发", description: "a" },
          { name: "项目二", role: "开发", description: "b" },
          { name: "项目三", role: "开发", description: "c" },
        ],
        education: [],
      },
    });
    const { job } = await createJob(user.id, {
      companyName: "CompanyA",
      title: "Java 工程师",
      city: "深圳",
      description: "JD",
      source: "boss",
      sourceUrl: "mock://boss/job/x1",
    });

    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(
      user.id,
      { jobId: job.id, resumeId: resume.id, useAI: true },
      { driver },
    );
    expect(state.status).toBe("awaiting_confirmation");

    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    const wait = events.find((e) => e.action === "wait_user_confirm")!;
    expect(wait.detail?.greetingSource).toBe("ai");
    const greeting = String(wait.detail?.greeting);
    // 事实边界：work experience=1（projects 不计入），打招呼语只能出现「1 段」
    expect(greeting).toContain("1 段");
    expect(greeting).not.toContain("3 段");
    expect(greeting).not.toContain("4 段");
    // 不出现输入之外的公司名
    expect(greeting).not.toContain("CompanyB");
    expect(greeting).not.toContain("未来科技");
    // 数字只能来自输入事实（1）
    const digits = greeting.match(/\d+/g) ?? [];
    for (const d of digits) expect(Number(d)).toBe(1);
    expect(greeting.length).toBeLessThanOrEqual(60);
  });

  it("空简历（无技能/无经历）→ mock AI 语走热情分支且 ≤60 字", async () => {
    const { user } = await createTestUser();
    const { resume } = await createResume(user.id, {
      title: "空简历",
      content: {
        basics: { name: "王五", city: "" },
        summary: "",
        skills: [],
        experience: [],
        projects: [],
        education: [],
      },
    });
    const { job } = await createJob(user.id, {
      companyName: "CompanyA",
      title: "管培生",
      city: "深圳",
      description: "JD",
      source: "boss",
      sourceUrl: "mock://boss/job/x1",
    });
    const driver = new MockBrowserDriver(SCENARIO);
    const state = await startApplyRun(
      user.id,
      { jobId: job.id, resumeId: resume.id, useAI: true },
      { driver },
    );
    expect(state.status).toBe("awaiting_confirmation");
    const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
    const wait = events.find((e) => e.action === "wait_user_confirm")!;
    expect(wait.detail?.greetingSource).toBe("ai");
    const greeting = String(wait.detail?.greeting);
    expect(greeting.length).toBeLessThanOrEqual(60);
    expect(greeting).not.toContain("段");
  });

  it("AI 限额（AI_LIMIT_EXCEEDED）→ template_fallback，流程不中断", async () => {
    vi.stubEnv("AI_DAILY_LIMIT", "1");
    try {
      const { user, resume, job } = await seed();
      // 预置 1 条当日用量 → 达到限额
      await getDb().insert(aiUsageLogs).values({
        userId: user.id,
        scene: "generate_greeting",
        provider: "mock",
        model: "mock-1",
      });
      const driver = new MockBrowserDriver(SCENARIO);
      const state = await startApplyRun(
        user.id,
        { jobId: job.id, resumeId: resume.id, useAI: true },
        { driver },
      );
      expect(state.status).toBe("awaiting_confirmation");
      const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
      const gen = events.find((e) => e.action === "generate_content")!;
      expect(gen.detail?.greetingSource).toBe("template_fallback");
      expect(String(gen.detail?.greetingError)).toContain("上限");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("AI 返回非法 JSON → template_fallback，流程不中断", async () => {
    const ai = await startAIServer(() => "not-json{{{");
    try {
      vi.stubEnv("AI_PROVIDER", "openai");
      vi.stubEnv("AI_OPENAI_BASE_URL", ai.url);
      vi.stubEnv("AI_OPENAI_API_KEY", "test-key");
      const { user, resume, job } = await seed();
      const driver = new MockBrowserDriver(SCENARIO);
      const state = await startApplyRun(
        user.id,
        { jobId: job.id, resumeId: resume.id, useAI: true },
        { driver },
      );
      expect(state.status).toBe("awaiting_confirmation");
      const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
      const gen = events.find((e) => e.action === "generate_content")!;
      expect(gen.detail?.greetingSource).toBe("template_fallback");
      expect(String(gen.detail?.greetingError)).toContain("AI");
    } finally {
      vi.unstubAllEnvs();
      await ai.close();
    }
  });

  it("AI 返回空响应 → template_fallback，流程不中断", async () => {
    const ai = await startAIServer(() => "");
    try {
      vi.stubEnv("AI_PROVIDER", "openai");
      vi.stubEnv("AI_OPENAI_BASE_URL", ai.url);
      vi.stubEnv("AI_OPENAI_API_KEY", "test-key");
      const { user, resume, job } = await seed();
      const driver = new MockBrowserDriver(SCENARIO);
      const state = await startApplyRun(
        user.id,
        { jobId: job.id, resumeId: resume.id, useAI: true },
        { driver },
      );
      expect(state.status).toBe("awaiting_confirmation");
      const events = await getDb().select().from(agentEvents).where(eq(agentEvents.sessionId, state.sessionId));
      const gen = events.find((e) => e.action === "generate_content")!;
      expect(gen.detail?.greetingSource).toBe("template_fallback");
    } finally {
      vi.unstubAllEnvs();
      await ai.close();
    }
  });
});
