import { RECOMMENDED_THRESHOLD, STRONG_THRESHOLD, type RecommendBucket } from "@/shared/types";
import { AppError, ErrorCode } from "@/shared/errors";
import type { JobRow } from "./job-service";
import { listJobs } from "./job-service";
import { listApplications } from "./application-service";
import { primaryResumeOf } from "./resume-service";
import { computeMatch, listMatches } from "./match-service";

export interface RecommendationItem {
  id: string;
  jobId: string;
  resumeId: string;
  totalScore: number;
  dimensionScores: Record<string, number>;
  gaps: { dimension: string; detail: string }[];
  summary: string | null;
  jobTitle: string;
  companyName: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  source: string;
  sourceUrl: string | null;
  applicationId: string | null;
  stage: string | null;
}

/**
 * Level 0 推荐流：对全部活跃职位批量跑规则评分（无 AI 成本）。
 * 评分核心是可解释、可测试的规则评分器，AI 只做可选解读（Stage C）。
 */
export async function refreshRecommendations(
  userId: string,
  resumeId?: string,
): Promise<{ resumeId: string; updated: number }> {
  let targetResumeId = resumeId;
  if (!targetResumeId) {
    const primary = await primaryResumeOf(userId);
    if (!primary) throw new AppError(ErrorCode.RESUME_NOT_FOUND, "请先创建简历再获取推荐");
    targetResumeId = primary.id;
  }

  const activeJobs: JobRow[] = await listJobs(userId, { status: "active" });
  let updated = 0;
  for (const job of activeJobs) {
    await computeMatch(userId, { jobId: job.id, resumeId: targetResumeId, useAI: false });
    updated += 1;
  }
  return { resumeId: targetResumeId, updated };
}

/** 推荐分桶：strong(≥85) / recommended(70-85) / confirm(<70) / applied / all */
export async function listRecommendations(
  userId: string,
  bucket: RecommendBucket = "all",
  resumeId?: string,
): Promise<RecommendationItem[]> {
  const matches = await listMatches(userId);
  const apps = await listApplications(userId);
  const appByJob = new Map(apps.map((a) => [a.jobId, a]));

  let rows: RecommendationItem[] = matches.map((m) => {
    const app = appByJob.get(m.jobId);
    return {
      id: m.id,
      jobId: m.jobId,
      resumeId: m.resumeId,
      totalScore: m.totalScore,
      dimensionScores: m.dimensionScores as unknown as Record<string, number>,
      gaps: m.gaps,
      summary: m.summary,
      jobTitle: m.jobTitle,
      companyName: m.companyName,
      city: m.city,
      salaryMin: m.salaryMin,
      salaryMax: m.salaryMax,
      source: m.source,
      sourceUrl: m.sourceUrl,
      applicationId: app?.id ?? null,
      stage: app?.stage ?? null,
    };
  });

  if (resumeId) rows = rows.filter((r) => r.resumeId === resumeId);

  switch (bucket) {
    case "applied":
      rows = rows.filter((r) => r.applicationId != null);
      break;
    case "strong":
      rows = rows.filter((r) => r.applicationId == null && r.totalScore >= STRONG_THRESHOLD);
      break;
    case "recommended":
      rows = rows.filter(
        (r) =>
          r.applicationId == null &&
          r.totalScore >= RECOMMENDED_THRESHOLD &&
          r.totalScore < STRONG_THRESHOLD,
      );
      break;
    case "confirm":
      rows = rows.filter((r) => r.applicationId == null && r.totalScore < RECOMMENDED_THRESHOLD);
      break;
    case "all":
    default:
      break;
  }
  return rows;
}
