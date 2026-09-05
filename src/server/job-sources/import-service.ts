import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobs } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type { DedupeKind, UnifiedJob } from "@/shared/types";
import type { JobRow } from "@/server/core/job-service";
import { createJob } from "@/server/core/job-service";
import { logAgentEvent, newSessionId } from "@/server/agent/events";
import { checkDuplicate, fingerprintOf } from "./core/deduplicator";
import { getJobSource } from "./core/registry";
import { registerBuiltinJobSources } from "./builtin";

export interface ImportResult {
  job: JobRow;
  dedupe: DedupeKind;
  warnings: string[];
}

export interface ImportInput {
  source: string;
  url?: string;
  text?: string;
  sourceJobId?: string;
  rawData?: Record<string, unknown>;
}

/**
 * 来源导入编排：来源校验 → importAssisted 归一 → 三级去重 → createJob 落库 → Agent 审计。
 * EXACT_DUPLICATE 不重建职位，直接返回既有记录（幂等）。
 */
export async function importJobFromSource(userId: string, input: ImportInput): Promise<ImportResult> {
  registerBuiltinJobSources();

  const source = getJobSource(input.source);
  if (!source) throw new AppError(ErrorCode.SOURCE_NOT_FOUND, `职位来源不存在: ${input.source}`);
  if (!source.capabilities().assistedImport) {
    throw new AppError(ErrorCode.SOURCE_UNAVAILABLE, `来源「${source.meta().name}」暂不支持导入`);
  }
  if (!input.text && !input.url && !input.sourceJobId) {
    throw new AppError(ErrorCode.IMPORT_INVALID, "请提供职位 URL 或 JD 文本");
  }

  const unified = await source.importAssisted!({
    url: input.url,
    text: input.text,
    sourceJobId: input.sourceJobId,
    rawData: input.rawData,
  });
  const sessionId = newSessionId();
  const dup = await checkDuplicate(userId, unified);

  // 精确重复：返回既有职位，不重建
  if (dup.kind === "EXACT_DUPLICATE" && dup.existingJobId) {
    const [existing] = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.id, dup.existingJobId))
      .limit(1);
    await logAgentEvent(userId, {
      sessionId,
      jobId: existing?.id,
      action: "import",
      source: unified.source,
      result: "success",
      detail: { dedupe: "EXACT_DUPLICATE", sourceJobId: unified.sourceJobId ?? null },
    });
    return {
      job: existing,
      dedupe: "EXACT_DUPLICATE",
      warnings: ["已存在相同职位（来源职位 ID 或内容指纹一致），未重复创建"],
    };
  }

  const fingerprint = fingerprintOf(unified);
  const { job } = await createJob(userId, {
    companyName: unified.companyName,
    title: unified.title,
    city: unified.city,
    district: unified.district,
    salaryMin: unified.salaryMin,
    salaryMax: unified.salaryMax,
    description: unified.description,
    sourceUrl: unified.sourceUrl,
    structured: {
      title: unified.title,
      city: unified.city,
      salaryMin: unified.salaryMin,
      salaryMax: unified.salaryMax,
      experienceYearsMin: unified.experienceYearsMin,
      education: unified.education,
      skills: unified.skills,
      responsibilities: [],
      requirements: [],
    },
    source: unified.source,
    sourceJobId: unified.sourceJobId,
    employmentType: unified.employmentType,
    jobType: unified.jobType,
    tags: unified.tags,
    postedAt: unified.postedAt ? new Date(unified.postedAt) : undefined,
    rawData: {
      ...unified.rawData,
      ...(dup.kind === "POSSIBLE_DUPLICATE" && dup.existingJobId
        ? { possibleDuplicateOf: dup.existingJobId }
        : {}),
    },
    fingerprint,
  });

  const warnings =
    dup.kind === "POSSIBLE_DUPLICATE"
      ? ["疑似与已有职位重复（公司 + 职位 + 城市一致，但 JD 内容不同），已标记待人工确认"]
      : [];

  await logAgentEvent(userId, {
    sessionId,
    jobId: job.id,
    action: "import",
    source: unified.source,
    result: "success",
    detail: {
      dedupe: dup.kind,
      sourceJobId: unified.sourceJobId ?? null,
      possibleDuplicateOf:
        dup.kind === "POSSIBLE_DUPLICATE" ? (dup.existingJobId ?? null) : null,
    },
  });

  return { job, dedupe: dup.kind, warnings };
}
