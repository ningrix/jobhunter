import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiTasks, jobMatches, jobs, resumeAnalyses, resumeFiles, resumeVersions } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { markParseFailed } from "@/server/core/resume-service";
import type {
  HybridScores,
  HybridWeights,
  JobStructured,
  MatchExplanation,
  MatchJudgeResult,
  ResumeAnalysisResult,
  ResumeContent,
  ResumeTailorResult,
  TaskStatus,
  TaskType,
} from "@/shared/types";
import { runAI } from "./gateway";
import { getTaskBus, type TaskEvent } from "./task-bus";

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
  /** V4.0：0-100 进度与当前阶段文案（SSE 推流 + 轮询兜底共用） */
  progress: number | null;
  phase: string | null;
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

/** 任务执行上下文：handler 用 report 推进阶段进度（持久化 + 实时推送） */
export interface TaskProgressContext {
  report: (progress: number, phase: string) => Promise<void>;
}

/** 上报进度：落库（轮询兜底可见）+ 总线推送（SSE 实时可见） */
async function reportProgress(taskId: string, progress: number, phase: string): Promise<void> {
  const clamped = Math.max(0, Math.min(99, Math.round(progress)));
  await getDb().update(aiTasks).set({ progress: clamped, phase }).where(eq(aiTasks.id, taskId));
  getTaskBus().emit(taskId, { type: "progress", taskId, progress: clamped, phase });
}

function emitEvent(event: TaskEvent): void {
  getTaskBus().emit(event.taskId, event);
}

/** 执行任务到终态（幂等 + 原子抢占）。
 * V4.0.1：queued/failed → running 用单条条件 UPDATE 抢占，并发调用时最多一个执行者
 * 真正运行 handler（SQLite 单写者保证语句级原子；跨进程由 SQLite 文件锁串行化），
 * 未抢占成功者等待抢占者到终态后返回同一结果——不重复 AI 调用、不改变 API 语义。
 */
export async function executeTask(taskId: string): Promise<AiTaskRow> {
  const db = getDb();
  const load = async (): Promise<AiTaskRow | undefined> => {
    const [row] = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId)).limit(1);
    return row as AiTaskRow | undefined;
  };

  let task = await load();
  if (!task) throw new AppError(ErrorCode.TASK_NOT_FOUND, "AI 任务不存在");
  if (task.status === "succeeded") return task;

  // 原子抢占：仅 queued/failed 可转为 running（保留 failed 可重试的既有语义）
  const claimed = await db
    .update(aiTasks)
    .set({ status: "running" })
    .where(and(eq(aiTasks.id, taskId), inArray(aiTasks.status, ["queued", "failed"])))
    .returning({ id: aiTasks.id });

  if (claimed.length === 0) {
    // 未抢占到：任务已被其他执行者接管或已到终态 → 轮询等待终态（上限 ~20s）
    const deadline = Date.now() + 20_000;
    for (;;) {
      task = await load();
      if (!task) throw new AppError(ErrorCode.TASK_NOT_FOUND, "AI 任务不存在");
      if (task.status === "succeeded" || task.status === "failed") return task;
      if (Date.now() > deadline) return task;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  emitEvent({ type: "status", taskId, status: "running", progress: task.progress ?? 0, phase: task.phase ?? null });
  const started = Date.now();
  const ctx: TaskProgressContext = { report: (p, phase) => reportProgress(taskId, p, phase) };
  try {
    const handler = taskHandlers[task.type as TaskType];
    if (!handler) throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `未知任务类型: ${task.type}`);
    const output = await handler((task.input ?? {}) as Record<string, unknown>, task as AiTaskRow, ctx);
    const [updated] = await db
      .update(aiTasks)
      .set({ status: "succeeded", output, durationMs: Date.now() - started, progress: 100, phase: "完成" })
      .where(eq(aiTasks.id, taskId))
      .returning();
    emitEvent({ type: "done", taskId });
    return updated as AiTaskRow;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const [updated] = await db
      .update(aiTasks)
      .set({ status: "failed", error: message.slice(0, 1000), durationMs: Date.now() - started })
      .where(eq(aiTasks.id, taskId))
      .returning();
    emitEvent({ type: "error", taskId, message });
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
  ctx: TaskProgressContext,
) => Promise<Record<string, unknown>>;

export const taskHandlers: Record<TaskType, TaskHandler> = {
  parse_resume: async (input, task, ctx) => {
    // Prompt 约定：模型直接返回 ResumeContent 本体
    const resumeId = input.resumeId as string | undefined;
    const versionId = input.versionId as string | undefined;
    try {
      await ctx.report(15, "已提取简历文本");
      const { result, meta } = await runAI<ResumeContent>("parse_resume", input, {
        userId: task.userId,
        taskId: task.id,
      });
      await ctx.report(75, "结构化解析完成，写入简历库");
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

  parse_jd: async (input, task, ctx) => {
    await ctx.report(20, "正在解析职位描述");
    const { result, meta } = await runAI<JobStructured>("parse_jd", input, {
      userId: task.userId,
      taskId: task.id,
    });
    await ctx.report(80, "JD 结构化完成");
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

  optimize_resume: async (input, task, ctx) => {
    await ctx.report(25, "正在读取简历内容");
    const { result, meta } = await runAI<ResumeAnalysisResult>("optimize_resume", input, {
      userId: task.userId,
      taskId: task.id,
    });
    await ctx.report(80, "AI 诊断完成，生成建议报告");
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

  tailor_resume: async (input, task, ctx) => {
    // JD → 简历定制分析：只输出覆盖/差距/建议，不直接改写用户简历数据
    await ctx.report(20, "正在解析 JD 要求");
    const { result, meta } = await runAI<ResumeTailorResult>(
      "tailor_resume",
      { resume: input.content, job: input.job },
      {
        userId: task.userId,
        taskId: task.id,
      },
    );
    await ctx.report(85, "覆盖与缺口分析完成，整理措辞建议");
    return { tailor: result, provider: meta.provider, model: meta.model };
  },

  match_analysis: async (input, task, ctx) => {
    await ctx.report(30, "正在对照简历与职位要求");
    const { result, meta } = await runAI<MatchExplanation>("match_analysis", input, {
      userId: task.userId,
      taskId: task.id,
    });
    await ctx.report(85, "匹配解读完成");
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

  // V4.1 混合排序：embed 语义 + 规则分 + LLM Judge → 回写混合总分、明细与可解释证据
  match_semantic: async (input, task, ctx) => {
    if (!task.userId) throw new AppError(ErrorCode.VALIDATION, "语义匹配任务缺少用户上下文");
    const matchId = input.matchId as string;
    const resumeId = input.resumeId as string;
    const jobId = input.jobId as string;
    const resume = input.resume as ResumeContent;
    const job = input.job as { title: string; companyName: string; structured?: JobStructured | null };
    const rule = input.rule as {
      totalScore: number;
      dimensionScores: Record<string, number>;
      gaps: { dimension: string; detail: string }[];
    };

    await ctx.report(10, "生成简历与职位向量");
    const { chunkResumeContent, chunkJobForEmbedding, embedOwnerChunks } = await import(
      "@/server/ai/embedding-service"
    );
    const { semanticScore, hybridTotal } = await import("@/server/core/hybrid-ranking");
    const resumeVecs = await embedOwnerChunks(
      task.userId,
      "resume",
      resumeId,
      chunkResumeContent(resume),
    );
    const jobVecs = await embedOwnerChunks(task.userId, "job", jobId, chunkJobForEmbedding(job));

    await ctx.report(55, "计算语义相似度");
    const sem = semanticScore(jobVecs.vectors, resumeVecs.vectors);

    await ctx.report(70, "LLM Judge 综合评估");
    const { result: judge, meta } = await runAI<MatchJudgeResult>(
      "match_judge",
      {
        resume,
        job,
        rule,
        semantic: { score: sem.score, evidence: sem.evidence.slice(0, 3) },
      },
      { userId: task.userId, taskId: task.id },
    );

    await ctx.report(85, "回写混合总分");
    const { totalScore, weights } = hybridTotal({
      semantic: sem.score,
      rule: rule.totalScore,
      judge: judge.score,
      weights: (input.hybridWeights as HybridWeights | undefined) ?? null,
    });
    const hybridScores: HybridScores = {
      semantic: { score: sem.score, evidence: sem.evidence.slice(0, 5) },
      rule: rule.totalScore,
      judge: { score: judge.score, reasons: judge.reasons },
      weights,
      totalScore,
    };
    await getDb()
      .update(jobMatches)
      .set({
        totalScore,
        hybridScores,
        summary: judge.summary,
        aiExplanation: {
          summary: judge.summary,
          strengths: judge.strengths,
          gaps: judge.gaps,
          risks: judge.risks,
        },
      })
      .where(eq(jobMatches.id, matchId));
    return { totalScore, hybridScores, provider: meta.provider, model: meta.model };
  },
};
