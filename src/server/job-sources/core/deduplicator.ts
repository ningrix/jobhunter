import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobs } from "@/db/schema";
import type { DedupeKind, UnifiedJob } from "@/shared/types";
import { computeFingerprint, possibleDuplicateKey } from "./normalizer";

export interface DedupeResult {
  kind: DedupeKind;
  existingJobId?: string;
}

/**
 * 三级去重（用户范围内）：
 * 1. source + sourceJobId 精确命中 → EXACT_DUPLICATE
 * 2. 内容指纹命中（跨平台、相同内容不同呈现）→ EXACT_DUPLICATE
 * 3. 公司+职位+城市一致但内容不同 → POSSIBLE_DUPLICATE（仅提示，不合并）
 */
export async function checkDuplicate(userId: string, unified: UnifiedJob): Promise<DedupeResult> {
  const db = getDb();

  // 1. 来源主键精确匹配
  if (unified.sourceJobId) {
    const [hit] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, userId),
          eq(jobs.source, unified.source),
          eq(jobs.sourceJobId, unified.sourceJobId),
          isNull(jobs.deletedAt),
        ),
      )
      .limit(1);
    if (hit) return { kind: "EXACT_DUPLICATE", existingJobId: hit.id };
  }

  // 2. 内容指纹（同一职位在不同平台的不同呈现归一后一致）
  const fingerprint = computeFingerprint({
    companyName: unified.companyName,
    title: unified.title,
    city: unified.city,
    description: unified.description,
  });
  const [fpHit] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.fingerprint, fingerprint), isNull(jobs.deletedAt)))
    .limit(1);
  if (fpHit) return { kind: "EXACT_DUPLICATE", existingJobId: fpHit.id };

  // 3. 疑似重复：公司+职位+城市 归一后一致（低置信，仅提示不合并）
  const target = possibleDuplicateKey(unified);
  if (target !== "||") {
    const candidates = await db
      .select({ id: jobs.id, companyName: jobs.companyName, title: jobs.title, city: jobs.city })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), isNull(jobs.deletedAt)));
    const suspect = candidates.find(
      (c) =>
        possibleDuplicateKey({
          companyName: c.companyName,
          title: c.title,
          city: c.city ?? undefined,
        }) === target,
    );
    if (suspect) return { kind: "POSSIBLE_DUPLICATE", existingJobId: suspect.id };
  }

  return { kind: "NEW" };
}

/** 导入流程使用：为 UnifiedJob 计算落库指纹 */
export function fingerprintOf(unified: UnifiedJob): string {
  return computeFingerprint({
    companyName: unified.companyName,
    title: unified.title,
    city: unified.city,
    description: unified.description,
  });
}
