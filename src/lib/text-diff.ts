/**
 * 字符级文本 diff（V3.4 溯源对比用）。
 * LCS 动态规划，输入为简历片段级短文本（<300 字符），O(n·m) 足够。
 * 按码点切分（Array.from），中英混排与 emoji 均安全。
 */

export type DiffSegmentType = "same" | "del" | "ins";

export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

export function diffChars(before: string, after: string): DiffSegment[] {
  const a = Array.from(before);
  const b = Array.from(after);
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ type: "ins", text: b.join("") }];
  if (b.length === 0) return [{ type: "del", text: a.join("") }];

  // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度
  const dp: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  const push = (type: DiffSegmentType, text: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += text;
    else segments.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i++;
    } else {
      push("ins", b[j]);
      j++;
    }
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("ins", b[j++]);
  return segments;
}

/** after 相对 before 纯新增（无删除）时，before 无需展示删除标记 */
export function isPureInsertion(before: string, after: string): boolean {
  return before.length === 0 || after.includes(before);
}
