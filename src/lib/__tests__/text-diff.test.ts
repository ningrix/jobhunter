import { describe, expect, it } from "vitest";
import { diffChars, isPureInsertion } from "../text-diff";

describe("diffChars", () => {
  it("相同文本 → 单一 same 段", () => {
    expect(diffChars("负责订单系统", "负责订单系统")).toEqual([{ type: "same", text: "负责订单系统" }]);
  });

  it("中文替换 → del + ins 相邻段", () => {
    const segs = diffChars("接口延迟下降 40%", "接口 P99 延迟下降 40%");
    const types = segs.map((s) => s.type);
    expect(types).toContain("ins");
    expect(segs.find((s) => s.type === "ins")?.text).toContain("P99");
    // 原有内容不被标记为删除
    expect(segs.find((s) => s.type === "del")).toBeUndefined();
  });

  it("删除内容 → del 段", () => {
    const segs = diffChars("负责订单系统开发", "负责系统开发");
    const del = segs.filter((s) => s.type === "del").map((s) => s.text).join("");
    expect(del).toBe("订单");
  });

  it("混合增删改合并相邻同类段", () => {
    const segs = diffChars("使用 Spring 开发", "使用 Spring Boot 快速开发");
    const ins = segs.filter((s) => s.type === "ins").map((s) => s.text).join("");
    expect(ins).toContain("Boot");
    expect(ins).toContain("快速");
  });

  it("空串边界", () => {
    expect(diffChars("", "")).toEqual([]);
    expect(diffChars("", "abc")).toEqual([{ type: "ins", text: "abc" }]);
    expect(diffChars("abc", "")).toEqual([{ type: "del", text: "abc" }]);
  });

  it("emoji 等代理对不被拆开", () => {
    const segs = diffChars("达成目标🎯", "达成目标🎯✅");
    expect(segs.find((s) => s.type === "ins")?.text).toBe("✅");
  });

  it("重排场景仍产出合法段序列", () => {
    const segs = diffChars("abc", "acb");
    for (const s of segs) expect(s.text.length).toBeGreaterThan(0);
  });
});

describe("isPureInsertion", () => {
  it("after 包含 before → true", () => {
    expect(isPureInsertion("延迟下降", "接口 P99 延迟下降 40%")).toBe(true);
  });
  it("有改写 → false", () => {
    expect(isPureInsertion("延迟下降 50%", "延迟下降 40%")).toBe(false);
  });
  it("before 为空 → true", () => {
    expect(isPureInsertion("", "新增内容")).toBe(true);
  });
});
