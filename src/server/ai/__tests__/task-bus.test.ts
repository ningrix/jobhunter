import { describe, expect, it, beforeEach } from "vitest";
import { getTaskBus, TaskEventBus } from "../task-bus";

beforeEach(() => {
  // 每个用例独立总线，避免 globalThis 单例串扰
  globalThis.__jhTaskEventBus = new TaskEventBus();
});

describe("TaskEventBus", () => {
  it("订阅者按 taskId 隔离收事件", () => {
    const bus = getTaskBus();
    const got1: string[] = [];
    const got2: string[] = [];
    bus.subscribe("t1", (e) => got1.push(e.type));
    bus.subscribe("t2", (e) => got2.push(e.type));
    bus.emit("t1", { type: "progress", taskId: "t1", progress: 30, phase: "x" });
    expect(got1).toEqual(["progress"]);
    expect(got2).toEqual([]);
  });

  it("取消订阅后不再收事件；无订阅者 emit 不抛错", () => {
    const bus = getTaskBus();
    const got: string[] = [];
    const off = bus.subscribe("t", (e) => got.push(e.type));
    off();
    expect(() => bus.emit("t", { type: "done", taskId: "t" })).not.toThrow();
    expect(got).toEqual([]);
    expect(bus.listenerCount("t")).toBe(0);
  });

  it("单个监听器抛错不阻断其余监听器", () => {
    const bus = getTaskBus();
    const got: string[] = [];
    bus.subscribe("t", () => {
      throw new Error("boom");
    });
    bus.subscribe("t", (e) => got.push(e.type));
    expect(() => bus.emit("t", { type: "done", taskId: "t" })).not.toThrow();
    expect(got).toEqual(["done"]);
  });

  it("多个订阅者同一任务都收到（SSE 多窗口场景）", () => {
    const bus = getTaskBus();
    let n = 0;
    bus.subscribe("t", () => n++);
    bus.subscribe("t", () => n++);
    bus.emit("t", { type: "progress", taskId: "t", progress: 50, phase: "半程" });
    expect(n).toBe(2);
  });

  it("getTaskBus 返回 globalThis 单例（Next dev 跨路由共享的前提）", () => {
    expect(getTaskBus()).toBe(getTaskBus());
  });
});
