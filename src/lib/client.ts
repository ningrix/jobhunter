"use client";

/** 前端统一 API 客户端：携带 cookie，解析统一响应信封；401 时自动刷新令牌并重试一次 */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
  _retried = false,
): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers: isForm ? undefined : opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: isForm ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code === 1002 && !_retried && path !== "/auth/refresh" && path !== "/auth/login") {
    // access 令牌过期：用 refresh cookie 静默续期后重试
    const refreshed = await fetch("/api/v1/auth/refresh", { method: "POST" });
    const refreshedJson = (await refreshed.json()) as { code: number };
    if (refreshedJson.code === 0) return api<T>(path, opts, true);
  }
  if (json.code !== 0) throw new Error(json.message || `请求失败（${json.code}）`);
  return json.data as T;
}

export interface TaskView {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  output: Record<string, unknown> | null;
  error: string | null;
}

export interface TaskProgress {
  progress: number;
  phase: string;
}

/** 轮询异步 AI 任务直至终态 */
export async function waitForTask(taskId: string, timeoutMs = 30000): Promise<TaskView> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const task = await api<TaskView>(`/ai-tasks/${taskId}`);
    if (task.status === "succeeded") return task;
    if (task.status === "failed") throw new Error(task.error || "任务失败");
    if (Date.now() > deadline) throw new Error("任务超时，请稍后在任务列表查看");
    await new Promise((r) => setTimeout(r, 700));
  }
}

/**
 * V4.0 订阅任务事件流（SSE）直至终态，实时回调进度；流不可用时自动回落轮询。
 * 认证走 cookie（same-origin fetch 自带），与 api() 一致。
 */
export async function streamTask(
  taskId: string,
  onProgress?: (p: TaskProgress) => void,
  timeoutMs = 60000,
): Promise<TaskView> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const res = await fetch(`/api/v1/ai-tasks/${taskId}/events`);
    if (!res.ok || !res.body) return waitForTask(taskId, timeoutMs);
    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error("任务超时，请稍后在任务列表查看");
      }
      const { done, value } = await reader.read();
      if (done) break; // 流提前结束（服务重启等）→ 回落轮询
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          const evt = JSON.parse(raw) as {
            type: string;
            progress?: number;
            phase?: string;
            message?: string;
          };
          if (evt.type === "progress" && typeof evt.progress === "number") {
            onProgress?.({ progress: evt.progress, phase: evt.phase ?? "" });
          } else if (evt.type === "done") {
            await reader.cancel().catch(() => undefined);
            return api<TaskView>(`/ai-tasks/${taskId}`);
          } else if (evt.type === "error") {
            throw new Error(evt.message || "任务失败");
          }
        }
      }
    }
    return waitForTask(taskId, timeoutMs);
  } catch (e) {
    // 主动抛出的业务错误（超时/任务失败）原样上抛；流本身不可用则回落轮询
    if (e instanceof Error && (e.message.includes("超时") || e.message.includes("任务失败"))) throw e;
    return waitForTask(taskId, timeoutMs);
  } finally {
    await reader?.cancel().catch(() => undefined);
  }
}
