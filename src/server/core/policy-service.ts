import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { applicationPolicies, applications, jobMatches, jobs } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type { DeliveryPolicyRules } from "@/shared/types";
import { logAgentEvent, newSessionId } from "@/server/agent/events";
import { evaluatePolicy } from "./policy-engine";

export type PolicyRow = typeof applicationPolicies.$inferSelect;

export async function getPolicy(userId: string): Promise<PolicyRow | null> {
  const [row] = await getDb()
    .select()
    .from(applicationPolicies)
    .where(eq(applicationPolicies.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertPolicy(
  userId: string,
  rules: DeliveryPolicyRules,
  name?: string,
): Promise<PolicyRow> {
  const db = getDb();
  const [existing] = await db
    .select({ id: applicationPolicies.id })
    .from(applicationPolicies)
    .where(eq(applicationPolicies.userId, userId))
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(applicationPolicies)
      .set({ rules, ...(name !== undefined ? { name } : {}) })
      .where(eq(applicationPolicies.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(applicationPolicies)
    .values({ userId, rules, ...(name ? { name } : {}) })
    .returning();
  return row;
}

export interface JobPolicyEvaluation {
  decision: "ALLOW" | "REQUIRE_USER_CONFIRMATION" | "REJECT";
  reasons: string[];
  hasPolicy: boolean;
}

/**
 * 对某个职位执行策略检查（进入投递前必须调用）。
 * 每次检查写入 agent_events（action=policy_check），失败被阻断可见。
 */
export async function evaluateJobPolicy(
  userId: string,
  jobId: string,
  opts: { mode: "manual" | "auto"; matchScore?: number | null } = { mode: "manual" },
): Promise<JobPolicyEvaluation> {
  const policy = await getPolicy(userId);
  if (!policy || !policy.isActive) {
    return { decision: "ALLOW", reasons: [], hasPolicy: false };
  }

  const db = getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId), isNull(jobs.deletedAt)))
    .limit(1);
  if (!job) throw new AppError(ErrorCode.JOB_NOT_FOUND, "职位不存在");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [applied] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.appliedAt, todayStart)));

  const [best] = await db
    .select({ score: jobMatches.totalScore })
    .from(jobMatches)
    .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, jobId)))
    .orderBy(desc(jobMatches.totalScore))
    .limit(1);

  const evaluation = evaluatePolicy(policy.rules, {
    mode: opts.mode,
    matchScore: opts.matchScore ?? (best ? best.score : null),
    appliedToday: Number(applied.n),
    job: {
      companyName: job.companyName,
      title: job.title,
      city: job.city,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      employmentType: job.employmentType,
      jobType: job.jobType,
      tags: job.tags,
      structured: job.structured
        ? {
            education: job.structured.education,
            experienceYearsMin: job.structured.experienceYearsMin,
          }
        : null,
    },
  });

  await logAgentEvent(userId, {
    sessionId: newSessionId(),
    jobId,
    action: "policy_check",
    result: evaluation.decision === "REJECT" ? "blocked" : "success",
    detail: {
      mode: opts.mode,
      decision: evaluation.decision,
      reasons: evaluation.reasons,
      matchScore: best?.score ?? null,
    },
  });

  return { ...evaluation, hasPolicy: true };
}
