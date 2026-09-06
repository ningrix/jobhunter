import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiTasks, jobMatches, jobs, resumeAnalyses, resumeFiles, resumeVersions } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { markParseFailed } from "@/server/core/resume-service";
import type {
  JobStructured,
  MatchExplanation,
  ResumeAnalysisResult,
  ResumeContent,
  ResumeTailorResult,
  TaskStatus,
  TaskType,
} from "@/shared/types";
import { runAI } from "./gateway";

export interface AiTaskRow {
  id: string;
  userId: string | null;
  type: string;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 创建异步 AI 任务（入队，进程内异步执行；生产可替换为 BullMQ Worker） */
export async function enqueueTask(
  userId: string | null,
  type: TaskType,
  input: Record<string, unknown>,
): Promise<AiTaskRow> {
  const db = getDb();
  const [row] = await db.insert(aiTasks).values({ userId, type, input, status: "queued" }).returning();
  return row as AiTaskRow;
}

/** 入队并异步执行（dev 模式）；测试中应直接 await executeTask */
export function runTaskAsync(taskId: string): void {
  void executeTask(taskId).catch((e) => console.error("[ai] task crashed:", taskId, e));
}

/** 执行任务到终态（幂等：已成功直接返回） */
export async function executeTask(taskId: string): Promise<AiTaskRow> {
  const db = getDb();
  const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId)).limit(1);
  if (!task) throw new AppError(ErrorCode.TASK_NOT_FOUND, "AI 任务不存在");
  if (task.status === "succeeded") return task as AiTaskRow;

  await db.update(aiTasks).set({ status: "running" }).where(eq(aiTasks.id, taskId));
  const started = Date.now();
  try {
    const handler = taskHandlers[task.type as TaskType];
    if (!handler) throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `未知任务类型: ${task.type}`);
    const output = await handler((task.input ?? {}) as Record<string, unknown>, task as AiTaskRow);
    const [updated] = await db
      .update(aiTasks)
      .set({ status: "succeeded", output, durationMs: Date.now() - started })
      .where(eq(aiTasks.id, taskId))
      .returning();
    return updated as AiTaskRow;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const [updated] = await db
      .update(aiTasks)
      .set({ status: "failed", error: message.slice(0, 1000), durationMs: Date.now() - started })
      .where(eq(aiTasks.id, taskId))
      .returning();
    return updated as AiTaskRow;
  }
}

export async function getTask(
  userId: string | null,
  taskId: string,
  opts: { requireOwner?: boolean } = {},
): Promise<AiTaskRow> {
  const db = getDb();
  const conditions = [eq(aiTasks.id, taskId)];
  if (opts.requireOwner && userId) conditions.push(eq(aiTasks.userId, userId));
  const [task] = await db.select().from(aiTasks).where(and(...conditions)).limit(1);
  if (!task) throw new AppError(ErrorCode.TASK_NOT_FOUND, "AI 任务不存在");
  return task as AiTaskRow;
}

export function taskStatus(s: string): TaskStatus {
  return s as TaskStatus;
}

// ———— 各任务类型的处理器：调网关并做业务持久化 ————

type TaskHandler = (
  input: Record<string, unknown>,
  task: AiTaskRow,
) => Promise<Record<string, unknown>>;

export const taskHandlers: Record<TaskType, TaskHandler> = {
  parse_resume: async (input, task) => {
    // Prompt 约定：模型直接返回 ResumeContent 本体
    const resumeId = input.resumeId as string | undefined;
    const versionId = input.versionId as string | undefined;
    try {
      const { result, meta } = await runAI<ResumeContent>("parse_resume", input, {
        userId: task.userId,
        taskId: task.id,
      });
      // 上传解析流程：将结构化结果写回版本并标记解析完成
      if (resumeId && versionId) {
        await getDb()
          .update(resumeVersions)
          .set({ content: result, source: "upload" })
          .where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.resumeId, resumeId)));
        await getDb()
          .update(resumeFiles)
          .set({ parseStatus: "done", parseError: null })
          .where(eq(resumeFiles.resumeId, resumeId));
      }
      return { content: result, provider: meta.provider, model: meta.model };
    } catch (e) {
      // Stage B：解析失败落到 resume_files 状态机，前端可见原因（文件与简历保留）
      if (resumeId && versionId) {
        await markParseFailed(
          resumeId,
          versionId,
          e instanceof Error ? e.message : String(e),
        ).catch(() => undefined);
      }
      throw e;
    }
  },

  parse_jd: async (input, task) => {
    const { result, meta } = await runAI<JobStructured>("parse_jd", input, {
      userId: task.userId,
      taskId: task.id,
    });
    // 创建职位时的自动解析：结构化结果写回职位
    const jobId = input.jobId as string | undefined;
    if (jobId) {
      await getDb().update(jobs).set({ structured: result }).where(eq(jobs.id, jobId));
    }
    return { structured: result, provider: meta.provider, model: meta.model };
  },

  // V3.3 职位雷达：safeFetch 公开页 → AI 抽取 → 去重入库（只入库不投递）
  radar_search: async (input, task) => {
    if (!task.userId) throw new AppError(ErrorCode.VALIDATION, "雷达任务缺少用户上下文");
    const { runRadarSearch } = await import("@/server/radar/radar-service");
    const summary = await runRadarSearch(task.userId, task);
    return { summary };
  },

  optimize_resume: async (input, task) => {
    const { result, meta } = await runAI<ResumeAnalysisResult>("optimize_resume", input, {
      userId: task.userId,
      taskId: task.id,
    });
    // 持久化分析结果（建议需用户确认后才生成新版本，AI 不直接改简历）
    const resumeId = input.resumeId as string | undefined;
    const versionId = input.versionId as string | undefined;
    if (resumeId && versionId) {
      await getDb().insert(resumeAnalyses).values({
        resumeId,
        versionId,
        taskId: task.id,
        score: Math.max(0, Math.min(100, Math.round((result as ResumeAnalysisResult).score ?? 0))),
        issues: (result as ResumeAnalysisResult).issues ?? [],
        suggestions: (result as ResumeAnalysisResult).suggestions ?? [],
      });
    }
    return { analysis: result, provider: meta.provider, model: meta.model };
  },

  tailor_resume: async (input, task) => {
    // JD → 简历定制分析：只输出覆盖/差距/建议，不直接改写用户简历数据
    const { result, meta } = await runAI<ResumeTailorResult>(
      "tailor_resume",
      { resume: input.content, job: input.job },
      {
        userId: task.userId,
        taskId: task.id,
      },
    );
    return { tailor: result, provider: meta.provider, model: meta.model };
  },

  match_analysis: async (input, task) => {
    const { result, meta } = await runAI<MatchExplanation>("match_analysis", input, {
      userId: task.userId,
      taskId: task.id,
    });
    // AI 解读回写匹配记录（summary + ai_explanation；规则评分与差距保持不变）
    const matchId = input.matchId as string | undefined;
    if (matchId) {
      await getDb()
        .update(jobMatches)
        .set({ summary: result.summary, aiExplanation: result })
        .where(eq(jobMatches.id, matchId));
    }
    return { analysis: result, provider: meta.provider, model: meta.model };
  },
};
