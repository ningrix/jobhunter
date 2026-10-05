import { NextResponse } from "next/server";
import { getTask, type AiTaskRow } from "@/server/ai/runner";
import { getTaskBus, type TaskEvent } from "@/server/ai/task-bus";
import { defineRoute } from "@/lib/api";

/**
 * V4.0 任务事件流（SSE）：task runtime 的实时推送通道。
 * 协议：`data: {type:"status"|"progress"|"done"|"error", ...}\n\n`，15s 心跳注释行；
 * 前端 fetch 流式读取（与 cookie 鉴权天然兼容），失败回落轮询。
 *
 * V4.0.1 竞态修复：**先订阅、后取快照**。旧实现（快照→订阅）在两步之间完成的任务，
 * 快照非终态而 done 事件又无人接收，客户端会永远等不到终态。现在订阅先行，
 * 订阅与快照之间发生的状态变化要么体现在快照里（发生在订阅前）、要么经订阅送达
 * （发生在订阅后），缓冲区再保证客户端看到的顺序是快照先于事件——终态不丢、顺序不乱。
 */
export const GET = defineRoute({ auth: true }, async ({ user, req, params }) => {
  const task: AiTaskRow = await getTask(user!.id, params.id, { requireOwner: true });
  const bus = getTaskBus();
  const encoder = new TextEncoder();
  const taskId = task.id;

  // 客户端断开清理（abort / cancel 共用入口）：由 start 内部赋值为 finish
  let notifyClientGone: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let unsubscribe: () => void = () => {};

      const send = (event: TaskEvent | Record<string, unknown>): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // 流已断裂（客户端断开）由 abort/cancel 清理路径收尾
        }
      };
      const finish = (): void => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // 已关闭则忽略
        }
      };
      notifyClientGone = finish;

      // 1) 订阅先行。快照产生前的事件先入缓冲区，保证送达顺序：快照 → 事件。
      let buffering = true;
      const buffer: TaskEvent[] = [];
      unsubscribe = bus.subscribe(taskId, (event) => {
        if (buffering) {
          buffer.push(event);
          return;
        }
        send(event);
        if (event.type === "done" || event.type === "error") finish();
      });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          finish();
        }
      }, 15000);

      // 2) 快照（订阅生效后读取）：任务在取快照前已完成 → 快照即终态；
      //    在取快照后完成 → done/error 已进入缓冲区。两种情况终态都可达。
      try {
        const fresh = await getTask(user!.id, taskId, { requireOwner: true });
        send({
          type: "status",
          taskId,
          status: fresh.status,
          progress: fresh.status === "succeeded" ? 100 : fresh.progress,
          phase: fresh.phase,
        });
        if (fresh.status === "succeeded") {
          send({ type: "done", taskId });
          finish();
          return;
        }
        if (fresh.status === "failed") {
          send({ type: "error", taskId, message: fresh.error ?? "任务失败" });
          finish();
          return;
        }
      } catch {
        // 快照阶段任务被删除等异常：关流，前端回落轮询拿 404
        finish();
        return;
      }

      // 3) 回放订阅初期缓冲的事件
      buffering = false;
      for (const event of buffer.splice(0)) {
        send(event);
        if (event.type === "done" || event.type === "error") {
          finish();
          return;
        }
      }

      req.signal?.addEventListener("abort", finish, { once: true });
    },
    cancel() {
      // 客户端主动断开（reader.cancel / 浏览器关闭）时释放订阅与心跳
      notifyClientGone();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
