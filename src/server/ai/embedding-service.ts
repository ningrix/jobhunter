import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { embeddings } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type { JobStructured, ResumeContent } from "@/shared/types";
import { embedText, getEmbedModel } from "./gateway";

/**
 * V4.1 语义层：简历/职位文本 → chunk → 向量化（embeddings 表，V4.0 前为死表）。
 * 缓存键 = (ownerType, ownerId, model)，chunk 文本即内容指纹——内容变更自动重嵌。
 * 全部向量调用走 gateway.embedText（计量入 ai_usage_logs，scene=embed）。
 */

const MAX_CHUNKS = 12;
const CHUNK_MAX_CHARS = 400;

/** 简历 chunk：优势 / 技能 / 每段经历 / 每个项目 / 教育——段落级，供语义证据引用 */
export function chunkResumeContent(content: ResumeContent): string[] {
  const chunks: string[] = [];
  const summary = content.summary || content.basics?.summary;
  if (summary) chunks.push(`个人优势：${summary}`);
  if (content.skills?.length) chunks.push(`技能：${content.skills.join("、")}`);
  for (const e of content.experience ?? []) {
    chunks.push(
      `${e.company} ${e.title}（${e.start}~${e.end}）：${(e.highlights ?? []).join("；")}`.slice(
        0,
        CHUNK_MAX_CHARS,
      ),
    );
  }
  for (const p of content.projects ?? []) {
    chunks.push(
      `项目 ${p.name}（${p.role ?? ""}）：${p.description}${(p.highlights ?? []).length ? "；" + (p.highlights ?? []).join("；") : ""}`.slice(
        0,
        CHUNK_MAX_CHARS,
      ),
    );
  }
  for (const ed of content.education ?? []) {
    chunks.push(`教育：${ed.school} ${ed.major} ${ed.degree}（${ed.start}~${ed.end}）`);
  }
  return chunks.map((c) => c.trim()).filter(Boolean).slice(0, MAX_CHUNKS);
}

/** 职位 chunk：标题/城市 / 技能要求 / JD 段落 / 职责 / 任职要求 */
export function chunkJobForEmbedding(job: {
  title: string;
  description?: string | null;
  structured?: JobStructured | null;
}): string[] {
  const chunks: string[] = [];
  const s = job.structured ?? null;
  chunks.push(`职位：${job.title}` + (s?.city ? `（${s.city}）` : ""));
  if (s?.skills?.length) chunks.push(`技能要求：${s.skills.map((k) => k.name).join("、")}`);
  const paras = (job.description ?? "")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 4);
  for (const p of paras) {
    if (chunks.length >= MAX_CHUNKS) break;
    chunks.push(p.slice(0, CHUNK_MAX_CHARS));
  }
  if (s?.responsibilities?.length) {
    chunks.push(`职责：${s.responsibilities.join("；")}`.slice(0, CHUNK_MAX_CHARS));
  }
  if (s?.requirements?.length) {
    chunks.push(`要求：${s.requirements.join("；")}`.slice(0, CHUNK_MAX_CHARS));
  }
  return chunks.map((c) => c.trim()).filter(Boolean).slice(0, MAX_CHUNKS);
}

export interface EmbeddedChunk {
  chunk: string;
  vector: number[];
}

/**
 * 确保该 owner 在当前 embed 模型下的向量已入库：命中的 chunk 直接复用缓存，
 * 缺失的现场嵌入，内容已变化的 chunk 清理陈旧行。返回该 owner 的全部 chunk 向量。
 */
export async function embedOwnerChunks(
  userId: string | null,
  ownerType: "resume" | "job",
  ownerId: string,
  chunks: string[],
): Promise<{ model: string; vectors: EmbeddedChunk[] }> {
  const model = await getEmbedModel(userId);
  if (!model) {
    throw new AppError(
      ErrorCode.AI_PROVIDER_ERROR,
      "当前 AI 模型不支持向量（embedding），无法使用语义匹配",
    );
  }
  const db = getDb();
  const existing = await db
    .select()
    .from(embeddings)
    .where(
      and(
        eq(embeddings.ownerType, ownerType),
        eq(embeddings.ownerId, ownerId),
        eq(embeddings.model, model),
      ),
    );
  const byChunk = new Map(existing.map((r) => [r.chunk, r.vector]));
  const vectors: EmbeddedChunk[] = [];
  const keep = new Set<string>();
  for (const chunk of chunks) {
    keep.add(chunk);
    const cached = byChunk.get(chunk);
    if (cached) {
      vectors.push({ chunk, vector: cached });
      continue;
    }
    const { vector } = await embedText(userId, chunk);
    await db
      .insert(embeddings)
      .values({ ownerType, ownerId, chunk, dim: vector.length, vector, model });
    vectors.push({ chunk, vector });
  }
  const stale = existing.filter((r) => !keep.has(r.chunk)).map((r) => r.id);
  if (stale.length) {
    await db.delete(embeddings).where(inArray(embeddings.id, stale));
  }
  return { model, vectors };
}
