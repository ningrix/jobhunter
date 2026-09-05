import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agentEvents, applicationEvents, applications, jobs, jobMatches } from "@/db/schema";
import { APPLICATION_STAGES, BOARD_STAGES, type ApplicationStage } from "@/shared/types";
import { listReminders, upcomingReminders } from "./reminder-service";
import { listResumes } from "./resume-service";

const FUNNEL_LABELS: Record<string, string> = {
  applied: "已投递",
  written_test: "笔试",
  interview: "面试",
  offer: "Offer",
  rejected: "已挂",
};

export interface DashboardOverview {
  resumeCount: number;
  jobCount: number;
  applicationTotal: number;
  stageCounts: Record<ApplicationStage, number>;
  /** 漏斗：曾到达各阶段的投递数（基于事件去重） */
  funnel: { stage: ApplicationStage; label: string; count: number }[];
  /** 近 8 周每周新增投递数 */
  weekly: { weekStart: string; count: number }[];
  dueReminderCount: number;
  upcomingReminderCount: number;
  /** V2 Agent 漏斗：发现 → 符合条件 → 推荐 → 用户确认 → 投递 → 面试 → Offer */
  agentFunnel: {
    discovered: number;
    policyPassed: number;
    recommended: number;
    userConfirmed: number;
    applied: number;
    interviewing: number;
    offers: number;
  };
}

export async function dashboardOverview(userId: string): Promise<DashboardOverview> {
  const db = getDb();

  const stageRows = await db
    .select({ stage: applications.stage, n: sql<number>`count(*)` })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.stage);
  const stageCounts = Object.fromEntries(
    APPLICATION_STAGES.map((s) => [s, Number(stageRows.find((r) => r.stage === s)?.n ?? 0)]),
  ) as Record<ApplicationStage, number>;

  const funnelRows = await db
    .select({
      toStage: applicationEvents.toStage,
      n: sql<number>`count(distinct ${applicationEvents.applicationId})`,
    })
    .from(applicationEvents)
    .innerJoin(applications, eq(applicationEvents.applicationId, applications.id))
    .where(eq(applications.userId, userId))
    .groupBy(applicationEvents.toStage);
  const funnelMap = new Map(funnelRows.map((r) => [r.toStage, Number(r.n)]));
  const funnel = BOARD_STAGES.filter((s) => s !== "wishlist").map((s) => ({
    stage: s,
    label: FUNNEL_LABELS[s] ?? s,
    count: funnelMap.get(s) ?? 0,
  }));

  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  const appliedRows = await db
    .select({ appliedAt: applications.appliedAt })
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.appliedAt, eightWeeksAgo)));
  const weekly: { weekStart: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - i * 7); // 每周一为起点
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = appliedRows.filter(
      (r) => r.appliedAt && r.appliedAt >= start && r.appliedAt < end,
    ).length;
    weekly.push({ weekStart: start.toISOString().slice(0, 10), count });
  }

  const [jobCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(jobs)
    .where(eq(jobs.userId, userId));
  const [appTotal] = await db
    .select({ n: sql<number>`count(*)` })
    .from(applications)
    .where(eq(applications.userId, userId));
  // —— V2 Agent 漏斗 ——
  const distinctJobs = sql<number>`count(distinct ${agentEvents.jobId})`;
  const [discoveredRow] = await db
    .select({ n: distinctJobs })
    .from(agentEvents)
    .where(
      and(
        eq(agentEvents.userId, userId),
        inArray(agentEvents.action, ["import", "open_page"]),
      ),
    );
  const [passedRow] = await db
    .select({ n: distinctJobs })
    .from(agentEvents)
    .where(
      and(eq(agentEvents.userId, userId), eq(agentEvents.action, "policy_check"), eq(agentEvents.result, "success")),
    );
  const [recRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(jobMatches)
    .where(and(eq(jobMatches.userId, userId), gte(jobMatches.totalScore, 70)));
  const [confirmedRow] = await db
    .select({ n: distinctJobs })
    .from(agentEvents)
    .where(and(eq(agentEvents.userId, userId), eq(agentEvents.userConfirmed, true)));
  const [appliedRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.appliedAt, new Date(0))));

  const [resumeList, upcoming, dueList] = await Promise.all([
    listResumes(userId),
    upcomingReminders(userId),
    listReminders(userId, { due: "1" }),
  ]);

  return {
    resumeCount: resumeList.length,
    jobCount: Number(jobCount.n),
    applicationTotal: Number(appTotal.n),
    stageCounts,
    funnel,
    weekly,
    dueReminderCount: dueList.length,
    upcomingReminderCount: upcoming.length,
    agentFunnel: {
      discovered: Number(discoveredRow.n),
      policyPassed: Number(passedRow.n),
      recommended: Number(recRow.n),
      userConfirmed: Number(confirmedRow.n),
      applied: Number(appliedRow.n),
      interviewing: funnelMap.get("interview") ?? 0,
      offers: stageCounts.offer ?? 0,
    },
  };
}
