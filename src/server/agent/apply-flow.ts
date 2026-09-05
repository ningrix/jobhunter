import { and, eq, isNull, like } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobs, reminders, resumes } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type { ResumeContent } from "@/shared/types";
import { evaluateJobPolicy } from "@/server/core/policy-service";
import { createApplication } from "@/server/core/application-service";
import { getLatestVersion } from "@/server/core/resume-service";
import { finishReminder } from "@/server/core/reminder-service";
import { logAgentEvent, newSessionId } from "./events";
import { MockBrowserDriver, type MockSiteScenario } from "./drivers/mock-driver";
import { runAI } from "@/server/ai/gateway";
import type { BrowserDriver } from "./types";

/** 招聘平台打招呼输入框的通用上限（如 BOSS直聘），超出视为不合规输出 */
export const GREETING_MAX_LENGTH = 60;

export type GreetingSource = "template" | "ai" | "template_fallback";

export type ApplyFlowStatus =
  | "running"
  | "awaiting_confirmation"
  | "submitted"
  | "blocked"
  | "rejected_by_user"
  | "handed_over_to_user";

export interface ApplyFlowState {
  sessionId: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  status: ApplyFlowStatus;
  applicationId?: string;
  blockedReason?: string;
}

/** 安全验证人工恢复的会话级上限：不自动重试，人工完成后允许有限次复检 */
export const MAX_CAPTCHA_RESUMES = 2;

/**
 * 会话级记录（内存）；每一步动作都已通过 agent_events 持久化审计。
 * driver/greeting 等运行字段仅存于服务端，经 getApplyFlowState 过滤后不出服务。
 */
interface SessionRecord {
  state: ApplyFlowState;
  driver: BrowserDriver;
  source: string;
  autoConfirm: boolean;
  greeting?: string;
  greetingSource?: GreetingSource;
  captchaResumes: number;
}

/**
 * 会话表挂到 globalThis：Next dev 按路由独立打包共享模块，
 * 模块级 Map 会随路由 bundle 各持一份副本（且 HMR 会重置），
 * globalThis 单例保证同进程内 /runs 与 /confirm 看到同一份会话。
 */
const globalSessions = globalThis as unknown as { __jobhunterAgentSessions?: Map<string, SessionRecord> };
const sessions: Map<string, SessionRecord> = (globalSessions.__jobhunterAgentSessions ??= new Map());

const MAX_STEP_EVENTS = 12;

function scenarioFor(job: {
  id: string;
  title: string;
  companyName: string;
  description: string;
  city: string | null;
  source: string;
  sourceUrl: string | null;
}): MockSiteScenario {
  const jobUrl = job.sourceUrl ?? `mock://${job.source || "mock"}/job/${job.id}`;
  return {
    jobUrl,
    // 冒烟钩子：mock 驱动下以 mock-captcha:// 前缀的 URL 模拟「申请即弹验证码」的演示/测试职位
    captchaOnApply: jobUrl.startsWith("mock-captcha://"),
    job: {
      title: job.title,
      companyName: job.companyName,
      description: job.description,
      city: job.city ?? undefined,
    },
    formFields: [
      { name: "greeting", label: "打招呼语", type: "textarea", required: true },
    ],
  };
}

async function greetingFor(
  userId: string,
  resumeId: string | undefined,
  job: { title: string; companyName: string; structured: unknown },
  useAI: boolean,
): Promise<{ greeting: string; greetingSource: GreetingSource; greetingError?: string }> {
  let resumeRow: typeof resumes.$inferSelect | null = null;
  if (resumeId) {
    const [r] = await getDb()
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId), isNull(resumes.deletedAt)))
      .limit(1);
    resumeRow = r ?? null;
  } else {
    const [r] = await getDb()
      .select()
      .from(resumes)
      .where(and(eq(resumes.userId, userId), isNull(resumes.deletedAt)))
      .limit(1);
    resumeRow = r ?? null;
  }
  if (!resumeRow) throw new AppError(ErrorCode.RESUME_NOT_FOUND, "请先创建简历");
  const { version } = await getLatestVersion(userId, resumeRow.id);
  const content = version.content as ResumeContent;
  const skills = content.skills.slice(0, 3).join("、");
  const years = content.experience.length;
  const greeting =
    `您好！我对贵司「${job.title}」岗位很感兴趣。` +
    (years > 0 ? `我有 ${years} 段相关经历` : "我对该领域有浓厚兴趣") +
    (skills ? `，熟悉 ${skills}` : "") +
    `，期待与您进一步沟通。`;
  if (!useAI) {
    return { greeting, greetingSource: "template" };
  }

  // AI 生成：任何失败（限额/网络/非法 JSON/输出不合规）都降级模板兜底，Agent 流永不因 AI 失败而中断
  try {
    const { result } = await runAI<{ greeting: string }>(
      "generate_greeting",
      {
        resumeFacts: {
          skills: content.skills.slice(0, 3),
          experienceCount: years,
          summary: content.summary ?? content.basics.summary ?? "",
        },
        job: { title: job.title, companyName: job.companyName, structured: job.structured ?? null },
        reference: greeting,
      },
      { userId },
    );
    const text = (result?.greeting ?? "").trim();
    if (!text) throw new AppError(ErrorCode.AI_PROVIDER_ERROR, "AI 返回了空的打招呼语");
    if (text.length > GREETING_MAX_LENGTH) {
      throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `AI 打招呼语超长（${text.length} > ${GREETING_MAX_LENGTH}）`);
    }
    return { greeting: text, greetingSource: "ai" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { greeting, greetingSource: "template_fallback", greetingError: message };
  }
}

/**
 * Level 1 半自动投递流程：
 * open → extract JD → Policy Check → 生成投递语 → 填表 → 等待用户确认 →（确认后）提交。
 * 遇到登录墙 / 验证码 / 策略拒绝：立即停止（blocked），绝不重试、绝不绕过。
 */
export async function startApplyRun(
  userId: string,
  input: { jobId: string; resumeId?: string; useAI?: boolean },
  opts: { driver?: BrowserDriver; autoConfirm?: boolean } = {},
): Promise<ApplyFlowState> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, input.jobId), eq(jobs.userId, userId), isNull(jobs.deletedAt)))
    .limit(1);
  if (!job) throw new AppError(ErrorCode.JOB_NOT_FOUND, "职位不存在");

  const sessionId = newSessionId();
  let driver: BrowserDriver;
  if (opts.driver) {
    driver = opts.driver;
  } else {
    const kind = process.env.AGENT_DRIVER ?? "mock";
    if (kind !== "mock") {
      throw new AppError(
        ErrorCode.AGENT_DRIVER_UNAVAILABLE,
        "真实浏览器驱动尚未启用：请在 Job Hunter 内使用辅助导入，或等待后续版本",
      );
    }
    driver = new MockBrowserDriver(scenarioFor(job));
  }

  const state: ApplyFlowState = {
    sessionId,
    userId,
    jobId: job.id,
    jobTitle: job.title,
    status: "running",
  };
  const rec: SessionRecord = {
    state,
    driver,
    source: job.source,
    autoConfirm: opts.autoConfirm === true,
    captchaResumes: 0,
  };
  sessions.set(sessionId, rec);

  const jobUrl = job.sourceUrl ?? `mock://${job.source || "mock"}/job/${job.id}`;

  // 1. 打开职位页
  const page = await driver.open(jobUrl);
  if (page.kind === "login_wall") {
    state.status = "blocked";
    state.blockedReason = "平台要求登录：请在你自己的浏览器登录该平台后，改用「辅助导入」或稍后重试。Agent 已停止，不会尝试绕过登录";
    await logAgentEvent(userId, {
      sessionId, jobId: job.id, source: job.source,
      action: "open_page", result: "blocked", error: state.blockedReason, detail: { url: page.url, kind: page.kind },
    });
    await notifyBlocked(rec, "login", state.blockedReason);
    return state;
  }
  if (page.kind === "captcha") {
    return blockOnCaptcha(rec, "open_page");
  }
  if (page.kind !== "job_detail") {
    state.status = "blocked";
    state.blockedReason = `页面不可用（${page.kind}）：职位可能已下线`;
    await logAgentEvent(userId, {
      sessionId, jobId: job.id, source: job.source,
      action: "open_page", result: "failed", error: state.blockedReason, detail: { url: page.url, kind: page.kind },
    });
    return state;
  }
  await logAgentEvent(userId, {
    sessionId, jobId: job.id, source: job.source,
    action: "open_page", result: "success", detail: { url: page.url, kind: page.kind },
  });

  // 2. 提取 JD（与库内职位比对，仅记录，不覆盖用户数据）
  const extracted = await driver.extractJob();
  await logAgentEvent(userId, {
    sessionId, jobId: job.id, action: "extract_jd", source: job.source,
    result: "success",
    detail: {
      title: extracted.title ?? job.title,
      matchesLocal: extracted.title ? extracted.title.includes(job.title.slice(0, 4)) : null,
    },
  });

  // 3. 策略检查
  const policy = await evaluateJobPolicy(userId, job.id, {
    mode: opts.autoConfirm ? "auto" : "manual",
  });
  await logAgentEvent(userId, {
    sessionId, jobId: job.id, action: "policy_check", result: policy.decision === "REJECT" ? "blocked" : "success",
    detail: { decision: policy.decision, reasons: policy.reasons },
  });
  if (policy.decision === "REJECT") {
    state.status = "blocked";
    state.blockedReason = `投递策略拒绝：${policy.reasons.join("；")}`;
    return state;
  }

  // 4. 生成投递语（默认纯模板拼接用户简历信息；useAI 时走 AI 网关，失败自动降级模板。均不编造经历）
  const { greeting, greetingSource, greetingError } = await greetingFor(
    userId,
    input.resumeId,
    { title: job.title, companyName: job.companyName, structured: job.structured },
    input.useAI === true,
  );
  rec.greeting = greeting;
  rec.greetingSource = greetingSource;
  await logAgentEvent(userId, {
    sessionId, jobId: job.id, action: "generate_content", result: "success",
    detail: {
      greetingLength: greeting.length,
      greetingSource,
      ...(greetingError ? { greetingError } : {}),
    },
  });

  // 5. 点击申请（可能触发验证码）
  const afterApply = await driver.clickApply();
  if (afterApply.kind === "captcha") {
    return blockOnCaptcha(rec, "click_apply");
  }

  return fillWaitAndMaybeSubmit(rec);
}

/** Agent 阻断（登录墙/安全验证）→ 站内提醒联动。
 * 查重维度：userId + jobId + 提醒类型（需登录/安全验证）+ 未完成，同一组合只建一条。 */
async function notifyBlocked(
  rec: SessionRecord,
  kind: "login" | "captcha",
  reason: string,
): Promise<void> {
  try {
    const label = kind === "login" ? "需登录" : "安全验证";
    const title = `Agent 阻断待处理：${rec.state.jobTitle}（${label}）`;
    const [existing] = await getDb()
      .select({ id: reminders.id })
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, rec.state.userId),
          eq(reminders.status, "pending"),
          like(reminders.title, `%（${label}）`),
          like(reminders.content, `%jobId=${rec.state.jobId} %`),
        ),
      )
      .limit(1);
    if (existing) return;
    const [reminder] = await getDb()
      .insert(reminders)
      .values({
        userId: rec.state.userId,
        title,
        content: `${reason}\nsessionId=${rec.state.sessionId} jobId=${rec.state.jobId}`,
        remindAt: new Date(),
      })
      .returning({ id: reminders.id });
    await logAgentEvent(rec.state.userId, {
      sessionId: rec.state.sessionId, jobId: rec.state.jobId,
      action: "blocked_reminder_created", result: "success",
      detail: { reminderId: reminder.id, kind },
    });
  } catch {
    // 提醒联动失败不影响 Agent 主流程（阻断本身已由 agent_events 审计）
  }
}

/** 阻断解除（人工复检通过）后，关闭该会话对应的安全验证类待处理提醒 */
async function closeBlockedReminder(rec: SessionRecord): Promise<void> {
  try {
    const rows = await getDb()
      .select({ id: reminders.id })
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, rec.state.userId),
          eq(reminders.status, "pending"),
          like(reminders.title, "%（安全验证）"),
          like(reminders.content, `%sessionId=${rec.state.sessionId} %`),
        ),
      );
    for (const r of rows) {
      await finishReminder(rec.state.userId, r.id, "done");
    }
  } catch {
    // 同上：联动失败不影响主流程
  }
}

/** 安全验证阻断：Agent 暂停（绝不绕过），用户在平台人工完成后经 resumeAfterCaptcha 复检 */
async function blockOnCaptcha(rec: SessionRecord, stage: string): Promise<ApplyFlowState> {
  const { state } = rec;
  state.status = "blocked";
  state.blockedReason =
    `平台触发安全验证（如滑块/验证码）：Agent 已暂停，不会尝试绕过。` +
    `请在你自己的浏览器完成验证后，点击「我已完成验证」让 Agent 复检（最多 ${MAX_CAPTCHA_RESUMES} 次）`;
  await logAgentEvent(state.userId, {
    sessionId: state.sessionId, jobId: state.jobId, source: rec.source,
    action: "captcha_blocked", result: "blocked", error: state.blockedReason, detail: { stage },
  });
  await notifyBlocked(rec, "captcha", state.blockedReason);
  return state;
}

/** 填表 → 等待用户确认（Level 1）；autoConfirm 时直接提交 */
async function fillWaitAndMaybeSubmit(rec: SessionRecord): Promise<ApplyFlowState> {
  const { state, driver } = rec;
  const greeting = rec.greeting;
  if (greeting === undefined || rec.greetingSource === undefined) {
    throw new AppError(ErrorCode.AGENT_BLOCKED, "会话缺少投递内容，无法继续");
  }

  const form = await driver.readForm();
  const values: Record<string, string> = {};
  for (const f of form) {
    if (f.name === "greeting") values.greeting = greeting;
  }
  const { filled, missing } = await driver.fillForm(values);
  await logAgentEvent(state.userId, {
    sessionId: state.sessionId, jobId: state.jobId, action: "fill_form", result: "success",
    detail: { filled, missing, formFields: form.map((f) => f.name) },
  });

  // 先同步进入 awaiting：autoConfirm 直提路径也要满足 confirmRun 的状态前置
  state.status = "awaiting_confirmation";
  if (!rec.autoConfirm) {
    state.applicationId = undefined;
    await logAgentEvent(state.userId, {
      sessionId: state.sessionId, jobId: state.jobId, action: "wait_user_confirm", result: "waiting_user",
      detail: { greeting, greetingSource: rec.greetingSource },
    });
    return state;
  }

  // autoConfirm（Level 2 预留路径，产品未开放）：跳过等待直接确认提交
  return confirmRun(state.sessionId, state.userId, true);
}

/**
 * 用户声称已在平台完成安全验证后的 Agent 复检：
 * 驱动重新检查页面——仍在验证页则保持 blocked；已通过则从断点继续填表与确认。
 * 不自动重试、不代替用户验证；会话级恢复次数受 MAX_CAPTCHA_RESUMES 限制。
 */
export async function resumeAfterCaptcha(sessionId: string, userId: string): Promise<ApplyFlowState> {
  const rec = sessions.get(sessionId);
  if (!rec || rec.state.userId !== userId) {
    throw new AppError(ErrorCode.AGENT_SESSION_NOT_FOUND, "Agent 会话不存在或已过期");
  }
  const { state, driver } = rec;
  if (state.status !== "blocked") {
    throw new AppError(ErrorCode.AGENT_BLOCKED, `当前状态（${state.status}）不允许人工恢复`);
  }
  if (!state.blockedReason?.includes("安全验证")) {
    throw new AppError(ErrorCode.AGENT_BLOCKED, "该会话不是因安全验证阻断，无法人工恢复");
  }
  if (rec.captchaResumes >= MAX_CAPTCHA_RESUMES) {
    await logAgentEvent(state.userId, {
      sessionId, jobId: state.jobId, source: rec.source,
      action: "captcha_manual_resolved", result: "blocked",
      error: "已达人工恢复次数上限", detail: { stage: "captcha_resume", captchaResumes: rec.captchaResumes },
    });
    throw new AppError(ErrorCode.AGENT_BLOCKED, `该会话已达到人工恢复次数上限（${MAX_CAPTCHA_RESUMES} 次），请改用「辅助导入」`);
  }
  if (!driver.resolveCaptcha) {
    throw new AppError(ErrorCode.AGENT_BLOCKED, "当前驱动不支持安全验证复检");
  }
  rec.captchaResumes += 1;
  // 同步占位为 running：并发重复复检会被状态校验拒绝
  state.status = "running";
  let page: Awaited<ReturnType<NonNullable<BrowserDriver["resolveCaptcha"]>>>;
  try {
    page = await driver.resolveCaptcha();
  } catch (e) {
    state.status = "blocked";
    throw e;
  }
  if (page.kind === "captcha") {
    state.status = "blocked";
    state.blockedReason = `人工复检：平台仍处于安全验证页面，请完成验证后再试（剩余 ${MAX_CAPTCHA_RESUMES - rec.captchaResumes} 次）`;
    await logAgentEvent(state.userId, {
      sessionId, jobId: state.jobId, source: rec.source,
      action: "captcha_manual_resolved", result: "blocked",
      error: "仍在验证中", detail: { stage: "captcha_resume", captchaResumes: rec.captchaResumes },
    });
    return state;
  }

  await logAgentEvent(state.userId, {
    sessionId, jobId: state.jobId, source: "user",
    action: "captcha_manual_resolved", result: "success", userConfirmed: true,
    detail: { stage: "captcha_resume", nextKind: page.kind, captchaResumes: rec.captchaResumes },
  });
  await closeBlockedReminder(rec);
  state.blockedReason = undefined;

  if (page.kind === "apply_form") {
    return fillWaitAndMaybeSubmit(rec);
  }
  if (page.kind === "job_detail") {
    const after = await driver.clickApply();
    if (after.kind === "captcha") {
      return blockOnCaptcha(rec, "click_apply");
    }
    return fillWaitAndMaybeSubmit(rec);
  }

  state.status = "blocked";
  state.blockedReason = `人工复检后页面状态异常（${page.kind}）：职位可能已下线`;
  await logAgentEvent(state.userId, {
    sessionId, jobId: state.jobId, source: rec.source,
    action: "captcha_manual_resolved", result: "failed",
    error: state.blockedReason, detail: { stage: "captcha_resume", nextKind: page.kind },
  });
  return state;
}

/** 用户对提交的裁决：approve 确认提交 / reject 拒绝 / handover 用户接管（Agent 退出） */
export type ConfirmAction = "approve" | "reject" | "handover";

/** 用户接管：Agent 关闭页面退出，状态进入 handed_over_to_user 终态。
 * 允许来源状态：等待确认，或安全验证阻断（用户决定自己处理）。其余状态一律拒绝。 */
export async function handoverRun(
  sessionId: string,
  userId: string,
  reason?: string,
): Promise<ApplyFlowState> {
  const rec = sessions.get(sessionId);
  if (!rec || rec.state.userId !== userId) {
    throw new AppError(ErrorCode.AGENT_SESSION_NOT_FOUND, "Agent 会话不存在或已过期");
  }
  const { state } = rec;
  const fromCaptchaBlock = state.status === "blocked" && (state.blockedReason?.includes("安全验证") ?? false);
  if (state.status !== "awaiting_confirmation" && !fromCaptchaBlock) {
    throw new AppError(ErrorCode.AGENT_BLOCKED, `当前状态（${state.status}）不允许接管`);
  }
  // 同步终态化：并发/重复接管会被状态校验拒绝
  state.status = "handed_over_to_user";
  state.blockedReason = "用户接管：Agent 已退出该页面，不再执行任何操作。可自行完成投递，并用「手动投递」记录结果";
  await rec.driver.close();
  await logAgentEvent(state.userId, {
    sessionId, jobId: state.jobId, source: "user",
    action: "user_handover", result: "success", userConfirmed: true,
    detail: { action: "handover", handoverReason: reason ?? "用户选择自行完成投递" },
  });
  return state;
}

/** 用户确认/拒绝/接管。仅 awaiting_confirmation 状态可调用。 */
export async function confirmRun(
  sessionId: string,
  userId: string,
  approve: boolean,
  action?: ConfirmAction,
  reason?: string,
): Promise<ApplyFlowState> {
  const rec = sessions.get(sessionId);
  if (!rec || rec.state.userId !== userId) {
    throw new AppError(ErrorCode.AGENT_SESSION_NOT_FOUND, "Agent 会话不存在或已过期");
  }
  const { state } = rec;
  if (state.status !== "awaiting_confirmation") {
    throw new AppError(ErrorCode.AGENT_BLOCKED, `当前状态（${state.status}）不允许确认`);
  }
  const resolved: ConfirmAction = action ?? (approve ? "approve" : "reject");

  if (resolved === "handover") {
    return handoverRun(sessionId, userId, reason ?? "用户在确认阶段选择接管");
  }

  // 同步占位为 running：并发重复确认会被状态校验拒绝，防止双提交
  state.status = "running";

  try {
    await logAgentEvent(state.userId, {
      sessionId,
      jobId: state.jobId,
      action: "wait_user_confirm",
      result: resolved === "approve" ? "success" : "blocked",
      userConfirmed: true,
      detail: { approved: resolved === "approve" },
    });
  } catch (e) {
    // 审计写入失败：回滚到 awaiting，用户可重试（提交尚未发生）
    state.status = "awaiting_confirmation";
    throw e;
  }

  if (resolved === "reject") {
    state.status = "rejected_by_user";
    state.blockedReason = "用户拒绝提交，Agent 已停止";
    return state;
  }

  // 提交
  const submitResult = await rec.driver.submit();
  if (!submitResult.ok) {
    state.status = "blocked";
    state.blockedReason = submitResult.message;
    await logAgentEvent(state.userId, {
      sessionId, jobId: state.jobId, action: "submit",
      result: "failed", error: submitResult.message,
    });
    return state;
  }

  // 用户已确认：创建投递记录（进入 applied；策略已前置通过）
  try {
    const application = await createApplication(state.userId, {
      jobId: state.jobId,
      stage: "applied",
      notes: "Agent 半自动投递（用户确认后提交）",
    });
    state.status = "submitted";
    state.applicationId = application.id;
    await logAgentEvent(state.userId, {
      sessionId, jobId: state.jobId, applicationId: application.id, action: "submit",
      result: "success", userConfirmed: true, detail: { driver: rec.driver.name },
    });
  } catch (e) {
    state.status = "blocked";
    state.blockedReason = e instanceof Error ? e.message : "创建投递记录失败";
    await logAgentEvent(state.userId, {
      sessionId, jobId: state.jobId, action: "submit",
      result: "failed", error: state.blockedReason, userConfirmed: true,
    });
  }
  return state;
}

export function getApplyFlowState(sessionId: string, userId: string): ApplyFlowState | null {
  const rec = sessions.get(sessionId);
  if (!rec || rec.state.userId !== userId) return null;
  return { ...rec.state };
}

export const MAX_STEP_EVENTS_LIMIT = MAX_STEP_EVENTS;
