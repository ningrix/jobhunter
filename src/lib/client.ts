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

/** 轮询异步 AI 任务直至终态 */
export async function waitForTask(taskId: string, timeoutMs = 30000): Promise<TaskView> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const task = await api<TaskView>(`/ai-tasks/${taskId}`);
    if (task.status === "succeeded") return task;
    if (task.status === "failed") throw new Error(task.error || "AI 任务失败");
    if (Date.now() > deadline) throw new Error("AI 任务超时，请稍后在任务列表查看");
    await new Promise((r) => setTimeout(r, 700));
  }
}
