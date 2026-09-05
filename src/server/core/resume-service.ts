import { and, desc, eq, isNull, max, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  files,
  resumeAnalyses,
  resumeFiles,
  resumeVersions,
  resumes,
} from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type { ResumeAnalysisResult, ResumeContent, ResumeStyle } from "@/shared/types";
import { emptyResumeContent } from "@/shared/types";

export type ResumeRow = typeof resumes.$inferSelect;
export type ResumeVersionRow = typeof resumeVersions.$inferSelect;

async function ownedResume(userId: string, resumeId: string): Promise<ResumeRow> {
  const [row] = await getDb()
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);
  if (!row || row.deletedAt) throw new AppError(ErrorCode.RESUME_NOT_FOUND, "简历不存在");
  return row;
}

export async function createResume(
  userId: string,
  input: { title: string; content?: ResumeContent },
): Promise<{ resume: ResumeRow; version: ResumeVersionRow }> {
  const db = getDb();
  const [resume] = await db.insert(resumes).values({ userId, title: input.title }).returning();
  const [version] = await db
    .insert(resumeVersions)
    .values({
      resumeId: resume.id,
      versionNo: 1,
      content: input.content ?? emptyResumeContent(),
      source: "manual",
      note: "创建",
    })
    .returning();
  return { resume, version };
}

export async function listResumes(userId: string): Promise<ResumeRow[]> {
  return getDb()
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, userId), isNull(resumes.deletedAt)))
    .orderBy(desc(resumes.updatedAt));
}

export async function getResumeDetail(
  userId: string,
  resumeId: string,
): Promise<{ resume: ResumeRow; versions: ResumeVersionRow[] }> {
  const resume = await ownedResume(userId, resumeId);
  const versions = await getDb()
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, resumeId))
    .orderBy(desc(resumeVersions.versionNo));
  return { resume, versions };
}

export async function updateResume(
  userId: string,
  resumeId: string,
  patch: { title?: string; isPrimary?: boolean; style?: ResumeStyle },
): Promise<ResumeRow> {
  await ownedResume(userId, resumeId);
  const db = getDb();
  if (patch.isPrimary === true) {
    // 主简历唯一：先取消其他主简历
    await db
      .update(resumes)
      .set({ isPrimary: false })
      .where(and(eq(resumes.userId, userId), ne(resumes.id, resumeId)));
  }
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.isPrimary !== undefined) updates.isPrimary = patch.isPrimary;
  if (patch.style !== undefined) updates.style = patch.style;
  if (Object.keys(updates).length === 0) return ownedResume(userId, resumeId);
  const [row] = await db
    .update(resumes)
    .set(updates)
    .where(eq(resumes.id, resumeId))
    .returning();
  return row;
}

export async function softDeleteResume(userId: string, resumeId: string): Promise<void> {
  await ownedResume(userId, resumeId);
  await getDb()
    .update(resumes)
    .set({ deletedAt: new Date(), isPrimary: false })
    .where(eq(resumes.id, resumeId));
}

export async function createVersion(
  userId: string,
  resumeId: string,
  input: { content: ResumeContent; note?: string; source?: "manual" | "ai" },
): Promise<ResumeVersionRow> {
  await ownedResume(userId, resumeId);
  const db = getDb();
  const [{ m }] = await db
    .select({ m: max(resumeVersions.versionNo) })
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, resumeId));
  const [version] = await db
    .insert(resumeVersions)
    .values({
      resumeId,
      versionNo: (m ?? 0) + 1,
      content: input.content,
      source: input.source ?? "manual",
      note: input.note,
    })
    .returning();
  return version;
}

export async function getLatestVersion(
  userId: string,
  resumeId: string,
): Promise<{ resume: ResumeRow; version: ResumeVersionRow }> {
  const resume = await ownedResume(userId, resumeId);
  const [version] = await getDb()
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, resumeId))
    .orderBy(desc(resumeVersions.versionNo))
    .limit(1);
  if (!version) throw new AppError(ErrorCode.RESUME_VERSION_NOT_FOUND, "简历版本不存在");
  return { resume, version };
}

export async function getVersion(
  userId: string,
  resumeId: string,
  versionId: string,
): Promise<ResumeVersionRow> {
  await ownedResume(userId, resumeId);
  const [version] = await getDb()
    .select()
    .from(resumeVersions)
    .where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.resumeId, resumeId)))
    .limit(1);
  if (!version) throw new AppError(ErrorCode.RESUME_VERSION_NOT_FOUND, "简历版本不存在");
  return version;
}

/** 上传落库：文件记录 + 简历 + 待解析标记 + 空白 v1 版本 */
export async function saveUploadRecord(
  userId: string,
  fileMeta: { name: string; mime: string; size: number; path: string },
): Promise<{ resume: ResumeRow; resumeFileId: string; version: ResumeVersionRow }> {
  const db = getDb();
  const [file] = await db
    .insert(files)
    .values({ userId, name: fileMeta.name, mime: fileMeta.mime, size: fileMeta.size, path: fileMeta.path })
    .returning();
  const title = fileMeta.name.replace(/\.[^.]+$/, "").slice(0, 80) || "未命名简历";
  const [resume] = await db.insert(resumes).values({ userId, title }).returning();
  const [rf] = await db
    .insert(resumeFiles)
    .values({ resumeId: resume.id, fileId: file.id, parseStatus: "pending" })
    .returning();
  const [version] = await db
    .insert(resumeVersions)
    .values({
      resumeId: resume.id,
      versionNo: 1,
      content: emptyResumeContent(),
      source: "upload",
      note: `上传文件 ${fileMeta.name}，AI 解析中`,
    })
    .returning();
  return { resume, resumeFileId: rf.id, version };
}

export async function markParseDone(
  resumeId: string,
  versionId: string,
  content: ResumeContent,
): Promise<void> {
  const db = getDb();
  await db
    .update(resumeVersions)
    .set({ content, source: "upload", note: "上传解析完成" })
    .where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.resumeId, resumeId)));
  await db
    .update(resumeFiles)
    .set({ parseStatus: "done" })
    .where(eq(resumeFiles.resumeId, resumeId));
}

export async function saveAnalysis(
  resumeId: string,
  versionId: string,
  taskId: string,
  analysis: ResumeAnalysisResult,
): Promise<void> {
  await getDb().insert(resumeAnalyses).values({
    resumeId,
    versionId,
    taskId,
    score: Math.max(0, Math.min(100, Math.round(analysis.score ?? 0))),
    issues: analysis.issues ?? [],
    suggestions: analysis.suggestions ?? [],
  });
}

export async function latestAnalysis(resumeId: string, versionId?: string) {
  const db = getDb();
  const conditions = [eq(resumeAnalyses.resumeId, resumeId)];
  if (versionId) conditions.push(eq(resumeAnalyses.versionId, versionId));
  const [row] = await db
    .select()
    .from(resumeAnalyses)
    .where(and(...conditions))
    .orderBy(desc(resumeAnalyses.createdAt))
    .limit(1);
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "暂无 AI 分析结果，请先发起优化");
  return row;
}

export async function primaryResumeOf(userId: string): Promise<ResumeRow | null> {
  const [row] = await getDb()
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.isPrimary, true), isNull(resumes.deletedAt)))
    .limit(1);
  if (row) return row;
  // 无主简历时回退到最近更新的简历
  const fallback = await listResumes(userId);
  return fallback[0] ?? null;
}
