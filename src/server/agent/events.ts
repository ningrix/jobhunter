import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agentEvents } from "@/db/schema";
import type { AgentAction, AgentEventResult } from "@/shared/types";

export interface AgentEventRow {
  id: string;
  userId: string;
  sessionId: string;
  jobId: string | null;
  applicationId: string | null;
  action: string;
  source: string | null;
  result: string;
  detail: Record<string, unknown> | null;
  error: string | null;
  userConfirmed: boolean;
  createdAt: Date;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

/** 记录一次 Agent/导入动作（审计闭环的最小单元） */
export async function logAgentEvent(
  userId: string,
  input: {
    sessionId: string;
    jobId?: string;
    applicationId?: string;
    action: AgentAction;
    source?: string;
    result: AgentEventResult;
    detail?: Record<string, unknown>;
    error?: string;
    userConfirmed?: boolean;
  },
): Promise<void> {
  await getDb().insert(agentEvents).values({
    userId,
    sessionId: input.sessionId,
    jobId: input.jobId,
    applicationId: input.applicationId,
    action: input.action,
    source: input.source,
    result: input.result,
    detail: input.detail,
    error: input.error,
    userConfirmed: input.userConfirmed ?? false,
  });
}

export async function listAgentEvents(
  userId: string,
  filter: { sessionId?: string; jobId?: string; limit?: number } = {},
): Promise<AgentEventRow[]> {
  const db = getDb();
  const conditions = [eq(agentEvents.userId, userId)];
  if (filter.sessionId) conditions.push(eq(agentEvents.sessionId, filter.sessionId));
  if (filter.jobId) conditions.push(eq(agentEvents.jobId, filter.jobId));
  const rows = await db
    .select()
    .from(agentEvents)
    .where(and(...conditions))
    .orderBy(asc(agentEvents.createdAt))
    .limit(filter.limit ?? 100);
  return rows as AgentEventRow[];
}
