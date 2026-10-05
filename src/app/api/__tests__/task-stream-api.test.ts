import { describe, expect, it, beforeEach } from "vitest";
import { GET as taskEventsRoute } from "@/app/api/v1/ai-tasks/[id]/events/route";
import { GET as taskRoute } from "@/app/api/v1/ai-tasks/[id]/route";
import { enqueueTask, executeTask } from "@/server/ai/runner";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import { emptyResumeContent } from "@/shared/types";

beforeEach(resetDb);

const CONTENT = {
  ...emptyResumeContent(),
  basics: { name: "李四", city: "北京", title: "后端工程师" },
  summary: "4 年后端经验",
  skills: ["Java", "Spring Boot", "MySQL"],
  experience: [
    {
      company: "B 科技",
      title: "后端工程师",
      start: "2022-01",
      end: "至今",
      highlights: ["订单接口 P99 延迟下降 40%"],
    },
  ],
};

/** 从 SSE Response 中读取事件直到终态（带超时保护） */
async function readEventsUntilTerminal(res: Response, timeoutMs = 8000) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, unknown>[] = [];
  const deadline = Date.now() + timeoutMs;
  let buf = "";
  let terminated = false;
  while (!terminated) {
    if (Date.now() > deadline) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`SSE 读取超时，已收到 ${events.length} 个事件`);
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const evt = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        events.push(evt);
        if (evt.type === "done" || evt.type === "error") terminated = true;
      }
    }
  }
  return events;
}

describe("GET /api/v1/ai-tasks/[id]/events（V4.0 SSE 任务事件流）", () => {
  it("订阅 → 执行 → 实时收到 status/progress/done；终态落库 100/完成", async () => {
    const { user, token } = await createTestUser();
    // 直接入队不执行（路由会 runTaskAsync 导致 mock 毫秒完赛），保证「先订阅后执行」确定性
    const task = await enqueueTask(user.id, "optimize_resume", {
      content: CONTENT,
      jobTitle: "资深后端工程师",
    });

    // 先订阅，再执行：验证实时推送路径
    const streamRes = await callRoute(taskEventsRoute, { token, params: { id: task.id }, raw: true });
    expect(streamRes.status).toBe(200);
    expect(streamRes.res.headers.get("content-type")).toContain("text/event-stream");

    const readPromise = readEventsUntilTerminal(streamRes.res);
    await executeTask(task.id);
    const events = await readPromise;

    // 快照在订阅生效后读取：执行者可能已抢占（running），但绝不可能丢终态
    const first = events[0] as { type: string; taskId: string; status: string };
    expect(first).toMatchObject({ type: "status", taskId: task.id });
    expect(["queued", "running"]).toContain(first.status);
    const progress = events.filter((e) => e.type === "progress");
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress[0]).toMatchObject({ taskId: task.id });
    expect(typeof progress[0].phase).toBe("string");
    expect(events[events.length - 1]).toMatchObject({ type: "done", taskId: task.id });

    // 终态落库：progress=100、phase=完成（轮询兜底口径一致）
    const taskRes = await callRoute(taskRoute, { token, params: { id: task.id } });
    const t = expectOk(taskRes.json) as { status: string; progress: number | null; phase: string | null };
    expect(t.status).toBe("succeeded");
    expect(t.progress).toBe(100);
    expect(t.phase).toBe("完成");
  });

  it("晚订阅任务已成功：快照直接回放终态并关闭", async () => {
    const { user, token } = await createTestUser();
    const task = await enqueueTask(user.id, "optimize_resume", { content: CONTENT, jobTitle: "后端" });
    await executeTask(task.id);

    const streamRes = await callRoute(taskEventsRoute, { token, params: { id: task.id }, raw: true });
    const events = await readEventsUntilTerminal(streamRes.res);
    expect(events[0]).toMatchObject({ type: "status", status: "succeeded", progress: 100 });
    expect(events[1]).toMatchObject({ type: "done" });
    expect(events.length).toBe(2);
  });

  it("越权读取他人任务事件流 → 404", async () => {
    const { user, token: tokenA } = await createTestUser();
    const { token: tokenB } = await createTestUser();
    const task = await enqueueTask(user.id, "optimize_resume", { content: CONTENT, jobTitle: "后端" });

    const res = await callRoute(taskEventsRoute, { token: tokenB, params: { id: task.id }, raw: true });
    expect(res.status).toBe(404);
  });

  it("V4.0.1 并发竞态：两个订阅同时在线，各自恰好收到一次 done", async () => {
    const { user, token } = await createTestUser();
    const task = await enqueueTask(user.id, "optimize_resume", { content: CONTENT, jobTitle: "后端" });

    // 双订阅在执行前建立（模拟多窗口/快照与订阅间隙存在执行的真实并发）
    const s1 = await callRoute(taskEventsRoute, { token, params: { id: task.id }, raw: true });
    const s2 = await callRoute(taskEventsRoute, { token, params: { id: task.id }, raw: true });
    const p1 = readEventsUntilTerminal(s1.res);
    const p2 = readEventsUntilTerminal(s2.res);
    await executeTask(task.id);
    const [e1, e2] = await Promise.all([p1, p2]);

    for (const events of [e1, e2]) {
      const dones = events.filter((e) => e.type === "done");
      expect(dones.length).toBe(1);
      const errors = events.filter((e) => e.type === "error");
      expect(errors.length).toBe(0);
      // 快照必须先行：首个事件永远是 status
      expect(events[0].type).toBe("status");
    }
  });

  it("V4.0.1 abort：客户端断开后流及时关闭（订阅与心跳释放）", async () => {
    const { user, token } = await createTestUser();
    const task = await enqueueTask(user.id, "optimize_resume", { content: CONTENT, jobTitle: "后端" });

    const ac = new AbortController();
    const streamRes = await callRoute(taskEventsRoute, {
      token,
      params: { id: task.id },
      raw: true,
      signal: ac.signal,
    });
    expect(streamRes.status).toBe(200);

    const reader = streamRes.res.body!.getReader();
    const first = await reader.read(); // 快照 status 已可读
    expect(first.done).toBe(false);

    ac.abort(); // 客户端断开 → 服务端 abort 清理路径关流
    const deadline = Date.now() + 3000;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      if (Date.now() > deadline) throw new Error("abort 后流未关闭");
    }
    // 流已关闭：任务仍可正常执行完成（订阅释放不影响业务）
    const done = await executeTask(task.id);
    expect(done.status).toBe("succeeded");
  });
});
