import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companies, jobFavorites, jobs } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type { JobStructured } from "@/shared/types";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";

export type JobRow = typeof jobs.$inferSelect;

async function ownedJob(userId: string, jobId: string): Promise<JobRow> {
  const [row] = await getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  if (!row || row.deletedAt) throw new AppError(ErrorCode.JOB_NOT_FOUND, "职位不存在");
  return row;
}

async function upsertCompany(name: string): Promise<string | null> {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.name, trimmed))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(companies).values({ name: trimmed }).returning();
  return created.id;
}

export interface CreateJobInput {
  companyName: string;
  title: string;
  city?: string;
  district?: string;
  salaryMin?: number;
  salaryMax?: number;
  description: string;
  sourceUrl?: string;
  structured?: JobStructured;
  // —— V2 来源适配扩展（全部可选，旧调用行为不变） ——
  source?: string;
  sourceJobId?: string;
  employmentType?: string;
  jobType?: string;
  tags?: string[];
  postedAt?: Date;
  rawData?: Record<string, unknown>;
  fingerprint?: string;
}

export async function createJob(
  userId: string,
  input: CreateJobInput,
): Promise<{ job: JobRow; taskId: string | null }> {
  const db = getDb();
  const companyId = await upsertCompany(input.companyName);
  const [job] = await db
    .insert(jobs)
    .values({
      userId,
      companyId,
      companyName: input.companyName.trim(),
      title: input.title.trim(),
      city: input.city,
      district: input.district,
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
      description: input.description,
      structured: input.structured ?? null,
      source: input.source ?? (input.structured ? "paste" : "manual"),
      sourceJobId: input.sourceJobId,
      sourceUrl: input.sourceUrl,
      employmentType: input.employmentType,
      jobType: input.jobType,
      tags: input.tags ?? [],
      postedAt: input.postedAt,
      rawData: input.rawData,
      fingerprint: input.fingerprint,
    })
    .returning();

  let taskId: string | null = null;
  if (!input.structured) {
    const task = await enqueueTask(userId, "parse_jd", { jobId: job.id, text: input.description });
    runTaskAsync(task.id);
    taskId = task.id;
  }
  return { job, taskId };
}

export interface ListJobsFilter {
  keyword?: string;
  favorite?: "1" | "0";
  status: "active" | "archived" | "all";
  source?: string;
}

export async function listJobs(userId: string, filter: ListJobsFilter): Promise<JobRow[]> {
  const db = getDb();
  const conditions = [eq(jobs.userId, userId), isNull(jobs.deletedAt)];
  if (filter.status !== "all") conditions.push(eq(jobs.status, filter.status));
  if (filter.source) conditions.push(eq(jobs.source, filter.source));
  if (filter.keyword) {
    const kw = `%${filter.keyword.trim()}%`;
    const kwCond = or(
      like(jobs.title, kw),
      like(jobs.companyName, kw),
      like(jobs.description, kw),
    );
    if (kwCond) conditions.push(kwCond);
  }
  if (filter.favorite === "1") {
    const favs = await db
      .select({ jobId: jobFavorites.jobId })
      .from(jobFavorites)
      .where(eq(jobFavorites.userId, userId));
    const ids = favs.map((f) => f.jobId);
    if (ids.length === 0) return [];
    conditions.push(inArray(jobs.id, ids));
  }
  return db
    .select()
    .from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt));
}

export async function getJob(
  userId: string,
  jobId: string,
): Promise<{ job: JobRow; favorited: boolean }> {
  const job = await ownedJob(userId, jobId);
  const [fav] = await getDb()
    .select({ id: jobFavorites.id })
    .from(jobFavorites)
    .where(and(eq(jobFavorites.userId, userId), eq(jobFavorites.jobId, jobId)))
    .limit(1);
  return { job, favorited: !!fav };
}

export async function updateJob(
  userId: string,
  jobId: string,
  patch: { title?: string; city?: string; salaryMin?: number; salaryMax?: number; status?: string },
): Promise<JobRow> {
  await ownedJob(userId, jobId);
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) return ownedJob(userId, jobId);
  const [row] = await getDb().update(jobs).set(updates).where(eq(jobs.id, jobId)).returning();
  return row;
}

export async function softDeleteJob(userId: string, jobId: string): Promise<void> {
  await ownedJob(userId, jobId);
  await getDb()
    .update(jobs)
    .set({ deletedAt: new Date(), status: "archived" })
    .where(eq(jobs.id, jobId));
}

export async function toggleFavorite(userId: string, jobId: string): Promise<boolean> {
  await ownedJob(userId, jobId);
  const db = getDb();
  const [fav] = await db
    .select({ id: jobFavorites.id })
    .from(jobFavorites)
    .where(and(eq(jobFavorites.userId, userId), eq(jobFavorites.jobId, jobId)))
    .limit(1);
  if (fav) {
    await db.delete(jobFavorites).where(eq(jobFavorites.id, fav.id));
    return false;
  }
  await db.insert(jobFavorites).values({ userId, jobId });
  return true;
}
