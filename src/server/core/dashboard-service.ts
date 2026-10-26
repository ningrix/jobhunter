import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobs } from "@/db/schema";
import { listResumes } from "./resume-service";

/** 仪表盘概览：投递看板/提醒/职位发现已下线，仅保留简历与职位两类核心计数 */
export interface DashboardOverview {
  resumeCount: number;
  jobCount: number;
}

export async function dashboardOverview(userId: string): Promise<DashboardOverview> {
  const db = getDb();
  const [jobCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(jobs)
    .where(eq(jobs.userId, userId));
  const resumeList = await listResumes(userId);
  return { resumeCount: resumeList.length, jobCount: Number(jobCount.n) };
}
