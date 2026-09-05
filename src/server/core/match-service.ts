import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobMatches, jobs } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type { ResumeContent } from "@/shared/types";
import { getJob } from "./job-service";
import { getLatestVersion } from "./resume-service";
import { getProfile } from "./user-service";
import { scoreMatch, type MatchRuleResult } from "./match-scorer";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";

export type MatchRow = typeof jobMatches.$inferSelect;

export async function computeMatch(
  userId: string,
  input: { jobId: string; resumeId: string; useAI: boolean },
): Promise<{ match: MatchRow; taskId: string | null }> {
  const { job } = await getJob(userId, input.jobId);
  const { version } = await getLatestVersion(userId, input.resumeId);
  const content = version.content as ResumeContent;
  const profile = await getProfile(userId);

  const rule = scoreMatch({
    resume: content,
    profile: {
      expectedCity: profile.expectedCity,
      salaryMin: profile.salaryMin,
      salaryMax: profile.salaryMax,
    },
    job: {
      city: job.city,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      structured: job.structured,
    },
    // 用户自调权重向量（null = 系统默认权重）
    weights: profile.matchWeights ?? undefined,
  });

  const db = getDb();
  const [existing] = await db
    .select({ id: jobMatches.id })
    .from(jobMatches)
    .where(
      and(
        eq(jobMatches.userId, userId),
        eq(jobMatches.jobId, input.jobId),
        eq(jobMatches.resumeId, input.resumeId),
      ),
    )
    .limit(1);

  let match: MatchRow;
  if (existing) {
    [match] = await db
      .update(jobMatches)
      .set({
        totalScore: rule.totalScore,
        dimensionScores: rule.dimensionScores,
        gaps: rule.gaps,
        reasons: rule.reasons,
        summary: null, // 重新计算后旧 AI 解读作废
      })
      .where(eq(jobMatches.id, existing.id))
      .returning();
  } else {
    [match] = await db
      .insert(jobMatches)
      .values({
        userId,
        jobId: input.jobId,
        resumeId: input.resumeId,
        totalScore: rule.totalScore,
        dimensionScores: rule.dimensionScores,
        gaps: rule.gaps,
        reasons: rule.reasons,
      })
      .returning();
  }

  let taskId: string | null = null;
  if (input.useAI) {
    const task = await enqueueTask(userId, "match_analysis", {
      matchId: match.id,
      resume: content,
      job: {
        title: job.title,
        companyName: job.companyName,
        structured: job.structured,
      },
      rule: {
        totalScore: rule.totalScore,
        dimensionScores: rule.dimensionScores,
        gaps: rule.gaps,
      },
    });
    runTaskAsync(task.id);
    taskId = task.id;
  }
  return { match, taskId };
}

export async function listMatches(
  userId: string,
  jobId?: string,
): Promise<(MatchRow & { jobTitle: string; companyName: string; city: string | null; salaryMin: number | null; salaryMax: number | null; source: string; sourceUrl: string | null })[]> {
  const db = getDb();
  const conditions = [eq(jobMatches.userId, userId)];
  if (jobId) conditions.push(eq(jobMatches.jobId, jobId));
  const rows = await db
    .select({
      match: jobMatches,
      jobTitle: jobs.title,
      companyName: jobs.companyName,
      city: jobs.city,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      source: jobs.source,
      sourceUrl: jobs.sourceUrl,
    })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobMatches.jobId, jobs.id))
    .where(and(...conditions))
    .orderBy(desc(jobMatches.totalScore));
  return rows.map((r) => ({
    ...r.match,
    jobTitle: r.jobTitle,
    companyName: r.companyName,
    city: r.city,
    salaryMin: r.salaryMin,
    salaryMax: r.salaryMax,
    source: r.source,
    sourceUrl: r.sourceUrl,
  }));
}

export async function getMatch(userId: string, matchId: string): Promise<MatchRow> {
  const [row] = await getDb()
    .select()
    .from(jobMatches)
    .where(and(eq(jobMatches.id, matchId), eq(jobMatches.userId, userId)))
    .limit(1);
  if (!row) throw new AppError(ErrorCode.MATCH_NOT_FOUND, "匹配记录不存在");
  return row;
}

export type { MatchRuleResult };
