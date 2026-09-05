import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { applicationEvents, applications, jobs, resumes } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import {
  BOARD_STAGES,
  STAGE_LABELS,
  STAGE_TRANSITIONS,
  type ApplicationStage,
} from "@/shared/types";
import { evaluateJobPolicy } from "./policy-service";

export type ApplicationRow = typeof applications.$inferSelect;
export type EventRow = typeof applicationEvents.$inferSelect;

async function ownedApplication(userId: string, applicationId: string): Promise<ApplicationRow> {
  const [row] = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);
  if (!row) throw new AppError(ErrorCode.APPLICATION_NOT_FOUND, "投递记录不存在");
  return row;
}

export async function createApplication(
  userId: string,
  input: {
    jobId: string;
    resumeId?: string;
    stage?: ApplicationStage;
    notes?: string;
  },
): Promise<ApplicationRow> {
  const db = getDb();
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, input.jobId), eq(jobs.userId, userId)))
    .limit(1);
  if (!job) throw new AppError(ErrorCode.JOB_NOT_FOUND, "职位不存在");

  if (input.resumeId) {
    const [resume] = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, input.resumeId), eq(resumes.userId, userId)))
      .limit(1);
    if (!resume) throw new AppError(ErrorCode.RESUME_NOT_FOUND, "简历不存在");
  }

  const [dup] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.jobId, input.jobId)))
    .limit(1);
  if (dup) throw new AppError(ErrorCode.APPLICATION_EXISTS, "该职位已有投递记录");

  const stage = input.stage ?? "wishlist";

  // 进入投递流程前强制策略检查（手动投递 = 用户已确认，仅拦截硬性 REJECT）
  if (stage === "applied") {
    const evaluation = await evaluateJobPolicy(userId, input.jobId, { mode: "manual" });
    if (evaluation.decision === "REJECT") {
      throw new AppError(ErrorCode.POLICY_REJECTED, `投递策略拒绝：${evaluation.reasons.join("；")}`, {
        reasons: evaluation.reasons,
      });
    }
  }

  const [row] = await db
    .insert(applications)
    .values({
      userId,
      jobId: input.jobId,
      resumeId: input.resumeId,
      stage,
      notes: input.notes,
      appliedAt: stage === "applied" ? new Date() : null,
    })
    .returning();

  await db.insert(applicationEvents).values({
    applicationId: row.id,
    type: "created",
    toStage: stage,
    note: input.notes,
  });
  return row;
}

export async function transitionStage(
  userId: string,
  applicationId: string,
  toStage: ApplicationStage,
  note?: string,
): Promise<ApplicationRow> {
  const app = await ownedApplication(userId, applicationId);
  const allowed = STAGE_TRANSITIONS[app.stage as ApplicationStage] ?? [];
  if (!allowed.includes(toStage)) {
    throw new AppError(
      ErrorCode.INVALID_STAGE_TRANSITION,
      `不允许从「${STAGE_LABELS[app.stage as ApplicationStage]}」流转到「${STAGE_LABELS[toStage]}」`,
      { from: app.stage, to: toStage, allowed },
    );
  }
  // 流转到「已投递」= 真正提交投递：执行策略检查（手动投递只拦截硬性 REJECT）
  if (toStage === "applied" && app.stage !== "applied") {
    const evaluation = await evaluateJobPolicy(userId, app.jobId, { mode: "manual" });
    if (evaluation.decision === "REJECT") {
      throw new AppError(ErrorCode.POLICY_REJECTED, `投递策略拒绝：${evaluation.reasons.join("；")}`, {
        reasons: evaluation.reasons,
      });
    }
  }
  const [row] = await getDb()
    .update(applications)
    .set({
      stage: toStage,
      ...(toStage === "applied" && !app.appliedAt ? { appliedAt: new Date() } : {}),
    })
    .where(eq(applications.id, applicationId))
    .returning();

  await getDb().insert(applicationEvents).values({
    applicationId,
    type: "stage_change",
    fromStage: app.stage,
    toStage,
    note,
  });
  return row;
}

export async function getApplicationDetail(
  userId: string,
  applicationId: string,
): Promise<{
  application: ApplicationRow;
  job: JobInfo;
  events: EventRow[];
}> {
  const app = await ownedApplication(userId, applicationId);
  const [jobInfo] = await getDb()
    .select({
      id: jobs.id,
      title: jobs.title,
      companyName: jobs.companyName,
      city: jobs.city,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
    })
    .from(jobs)
    .where(eq(jobs.id, app.jobId))
    .limit(1);
  const events = await getDb()
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, applicationId))
    .orderBy(asc(applicationEvents.occurredAt));
  return {
    application: app,
    job: jobInfo as JobInfo,
    events,
  };
}

export interface JobInfo {
  id: string;
  title: string;
  companyName: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

export async function listApplications(
  userId: string,
  stage?: ApplicationStage,
): Promise<(ApplicationRow & { job: JobInfo })[]> {
  const db = getDb();
  const conditions = [eq(applications.userId, userId)];
  if (stage) conditions.push(eq(applications.stage, stage));
  const rows = await db
    .select({
      application: applications,
      id: jobs.id,
      title: jobs.title,
      companyName: jobs.companyName,
      city: jobs.city,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(and(...conditions))
    .orderBy(desc(applications.updatedAt));
  return rows.map((r) => ({
    ...r.application,
    job: {
      id: r.id,
      title: r.title,
      companyName: r.companyName,
      city: r.city,
      salaryMin: r.salaryMin,
      salaryMax: r.salaryMax,
    },
  }));
}

/** 看板聚合：按阶段分组的轻量卡片数据 */
export async function getBoard(userId: string): Promise<
  { stage: ApplicationStage; label: string; items: BoardItem[] }[]
> {
  const all = await listApplications(userId);
  const items = await Promise.all(
    all.map(async (a) => {
      let resumeTitle: string | null = null;
      if (a.resumeId) {
        const [r] = await getDb()
          .select({ title: resumes.title })
          .from(resumes)
          .where(eq(resumes.id, a.resumeId))
          .limit(1);
        resumeTitle = r?.title ?? null;
      }
      return { ...a, resumeTitle };
    }),
  );
  return BOARD_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    items: items.filter((i) => i.stage === stage),
  }));
}

export interface BoardItem {
  id: string;
  stage: string;
  job: JobInfo;
  resumeTitle: string | null;
  notes: string | null;
  nextActionAt: Date | null;
  appliedAt: Date | null;
  updatedAt: Date;
}

export async function updateApplication(
  userId: string,
  applicationId: string,
  patch: { notes?: string; nextActionAt?: Date | null; resumeId?: string | null },
): Promise<ApplicationRow> {
  await ownedApplication(userId, applicationId);
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) return ownedApplication(userId, applicationId);
  const [row] = await getDb()
    .update(applications)
    .set(updates)
    .where(eq(applications.id, applicationId))
    .returning();
  return row;
}

export async function deleteApplication(userId: string, applicationId: string): Promise<void> {
  await ownedApplication(userId, applicationId);
  await getDb().delete(applications).where(eq(applications.id, applicationId));
}

export async function addNote(
  userId: string,
  applicationId: string,
  note: string,
): Promise<EventRow> {
  await ownedApplication(userId, applicationId);
  const [event] = await getDb()
    .insert(applicationEvents)
    .values({ applicationId, type: "note", note })
    .returning();
  return event;
}
