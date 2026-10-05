import type { HybridWeights, SemanticChunkEvidence } from "@/shared/types";

/**
 * V4.1 混合排序纯函数集：Match Score = w1·语义相似 + w2·规则分 + w3·LLM Judge。
 * 全部确定性、无 IO——单测与 NDCG 评测集直接调用；降级路径（语义关闭）必须与纯规则语义逐位一致。
 */

export const DEFAULT_HYBRID_WEIGHTS: HybridWeights = { semantic: 0.4, rule: 0.3, judge: 0.3 };

/** 余弦相似度；维度不一致或零向量返回 0（保证确定性，不抛错中断排序） */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface ChunkWithVector {
  chunk: string;
  vector: number[];
}

/**
 * 语义分：每个职位 chunk 取与简历 chunks 的最大相似度，算术平均后折算 0-100。
 * 同时产出可解释证据（最佳命中对，按相似度降序），供溯源 UI 与 LLM Judge 引用。
 */
export function semanticScore(
  jobChunks: ChunkWithVector[],
  resumeChunks: ChunkWithVector[],
): { score: number; evidence: SemanticChunkEvidence[] } {
  if (!jobChunks.length || !resumeChunks.length) {
    return { score: 0, evidence: [] };
  }
  const evidence: SemanticChunkEvidence[] = [];
  let sum = 0;
  for (const jc of jobChunks) {
    let best: SemanticChunkEvidence | null = null;
    for (const rc of resumeChunks) {
      const similarity = Math.max(0, Math.min(1, cosineSimilarity(jc.vector, rc.vector)));
      if (!best || similarity > best.similarity) {
        best = { jobChunk: jc.chunk, resumeChunk: rc.chunk, similarity };
      }
    }
    if (best) {
      evidence.push(best);
      sum += best.similarity;
    }
  }
  evidence.sort((a, b) => b.similarity - a.similarity);
  return { score: Math.round((sum / jobChunks.length) * 1000) / 10, evidence };
}

/** 混合权重归一化：缺省/非法维度回落默认；全 0 整体回落默认（保证输出确定性） */
export function normalizeHybridWeights(custom?: HybridWeights | null): HybridWeights {
  const merged: HybridWeights = { ...DEFAULT_HYBRID_WEIGHTS };
  if (custom) {
    for (const dim of ["semantic", "rule", "judge"] as const) {
      const v = custom[dim];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) merged[dim] = v;
    }
  }
  const sum = merged.semantic + merged.rule + merged.judge;
  if (sum <= 0) return { ...DEFAULT_HYBRID_WEIGHTS };
  return {
    semantic: merged.semantic / sum,
    rule: merged.rule / sum,
    judge: merged.judge / sum,
  };
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

/**
 * 混合总分：w1·语义 + w2·规则 + w3·Judge（权重归一化）。
 * 语义关闭（semantic=0 且权重回落）时，结果由规则分与 Judge 构成；
 * 纯规则等价路径 = rule 全权重——现有测试的向后兼容锚点。
 */
export function hybridTotal(input: {
  semantic: number;
  rule: number;
  judge: number;
  weights?: HybridWeights | null;
}): { totalScore: number; weights: HybridWeights } {
  const weights = normalizeHybridWeights(input.weights);
  const total =
    clamp100(input.semantic) * weights.semantic +
    clamp100(input.rule) * weights.rule +
    clamp100(input.judge) * weights.judge;
  return { totalScore: Math.round(total * 10) / 10, weights };
}

// ———— 排序质量指标（docs/20 可评估：NDCG / Spearman 进 vitest） ————

/** NDCG@k：graded relevance；ideal 为理想排序（降序），ranked 为被评排序的对齐 grades */
export function ndcg(ideal: number[], ranked: number[]): number {
  const dcg = ranked.reduce((s, rel, i) => s + (rel > 0 ? rel / Math.log2(i + 2) : 0), 0);
  const idcg = [...ideal]
    .sort((a, b) => b - a)
    .reduce((s, rel, i) => s + (rel > 0 ? rel / Math.log2(i + 2) : 0), 0);
  if (idcg <= 0) return 1;
  return dcg / idcg;
}

function averageRanks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Spearman 等级相关（并列取平均秩）；双常数序列视为完全一致，单侧零方差返回 0 */
export function spearman(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const rx = averageRanks(x);
  const ry = averageRanks(y);
  const n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx <= 0 && dy <= 0) return 1;
  if (dx <= 0 || dy <= 0) return 0;
  return num / Math.sqrt(dx * dy);
}
