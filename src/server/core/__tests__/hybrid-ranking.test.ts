import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  hybridTotal,
  ndcg,
  normalizeHybridWeights,
  semanticScore,
  spearman,
} from "../hybrid-ranking";

describe("cosineSimilarity", () => {
  it("同向 = 1，正交 = 0，成比例 = 1，零向量 = 0，维度不一致 = 0", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 1])).toBe(0);
  });
});

describe("semanticScore", () => {
  it("每个职位 chunk 取最佳命中对，分数为均值并按相似度降序输出证据", () => {
    const jobChunks = [
      { chunk: "JD-Java", vector: [1, 0, 0] },
      { chunk: "JD-K8s", vector: [0, 1, 0] },
    ];
    const resumeChunks = [
      { chunk: "简历-Java 经历", vector: [0.9, 0.1, 0] },
      { chunk: "简历-前端经历", vector: [0, 0, 1] },
    ];
    const { score, evidence } = semanticScore(jobChunks, resumeChunks);
    expect(evidence).toHaveLength(2);
    expect(evidence[0].jobChunk).toBe("JD-Java");
    expect(evidence[0].resumeChunk).toBe("简历-Java 经历");
    expect(evidence[0].similarity).toBeGreaterThan(0.9);
    // JD-K8s 与简历最近的是 Java 经历（仅 0.1 的 y 分量重合），相似度接近 0
    expect(evidence[1].similarity).toBeLessThan(0.2);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(60);
  });

  it("任一侧为空：0 分且无证据", () => {
    expect(semanticScore([], [{ chunk: "a", vector: [1] }])).toEqual({ score: 0, evidence: [] });
    expect(semanticScore([{ chunk: "a", vector: [1] }], [])).toEqual({ score: 0, evidence: [] });
  });
});

describe("normalizeHybridWeights / hybridTotal", () => {
  it("缺省回落默认 0.4/0.3/0.3，非法维度回落默认，全 0 整体回落默认", () => {
    expect(normalizeHybridWeights(null)).toEqual({ semantic: 0.4, rule: 0.3, judge: 0.3 });
    expect(normalizeHybridWeights({ semantic: -1, rule: Number.NaN, judge: 0.3 })).toEqual({
      semantic: 0.4,
      rule: 0.3,
      judge: 0.3,
    });
    expect(normalizeHybridWeights({ semantic: 0, rule: 0, judge: 0 })).toEqual({
      semantic: 0.4,
      rule: 0.3,
      judge: 0.3,
    });
    const norm = normalizeHybridWeights({ semantic: 1, rule: 1, judge: 1 });
    expect(norm.semantic).toBeCloseTo(1 / 3);
    expect(norm.rule).toBeCloseTo(1 / 3);
    expect(norm.judge).toBeCloseTo(1 / 3);
  });

  it("纯规则等价：semantic/judge 全 0 权重时总分 = 规则分（向后兼容锚点）", () => {
    const { totalScore } = hybridTotal({
      semantic: 99,
      rule: 73.5,
      judge: 99,
      weights: { semantic: 0, rule: 1, judge: 0 },
    });
    expect(totalScore).toBe(73.5);
  });

  it("默认权重的混合总分", () => {
    const { totalScore, weights } = hybridTotal({ semantic: 80, rule: 70, judge: 60 });
    // 0.4*80 + 0.3*70 + 0.3*60 = 71
    expect(weights).toEqual({ semantic: 0.4, rule: 0.3, judge: 0.3 });
    expect(totalScore).toBe(71);
  });
});

describe("ndcg", () => {
  it("理想排序 = 1，逆序 < 1，全零 ideal = 1", () => {
    expect(ndcg([3, 2, 1, 0], [3, 2, 1, 0])).toBeCloseTo(1);
    const inverted = ndcg([3, 2, 1, 0], [0, 1, 2, 3]);
    expect(inverted).toBeGreaterThan(0.55);
    expect(inverted).toBeLessThan(0.7);
    expect(ndcg([0, 0], [0, 0])).toBe(1);
  });
});

describe("spearman", () => {
  it("单调递增 = 1，逆序 = -1，并列取平均秩，双常数 = 1", () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    expect(spearman([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 1, 2], [5, 7, 9])).toBeGreaterThan(0.8);
    expect(spearman([5, 5, 5], [1, 2, 3])).toBe(0);
    expect(spearman([5, 5, 5], [5, 5, 5])).toBe(1);
  });
});
