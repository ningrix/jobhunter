/**
 * V4.0 任务事件总线：AI 任务进度向 SSE 的推送通道。
 *
 * 设计与 Task Runtime 的其他部分解耦：
 * - 进程内 EventEmitter 实现（默认，零基础设施依赖）；
 * - 迁移到 Redis Pub/Sub 或 BullMQ Events 时只需替换本文件实现，SSE 路由与 runner 不变。
 * - 必须挂 globalThis 单例：Next dev 按路由独立实例化共享模块，挂在模块作用域会跨路由收不到事件。
 */

export type TaskEvent =
  | { type: "status"; taskId: string; status: "queued" | "running"; progress: number | null; phase: string | null }
  | { type: "progress"; taskId: string; progress: number; phase: string }
  | { type: "done"; taskId: string }
  | { type: "error"; taskId: string; message: string };

type TaskEventListener = (event: TaskEvent) => void;

export class TaskEventBus {
  private listeners = new Map<string, Set<TaskEventListener>>();

  subscribe(taskId: string, listener: TaskEventListener): () => void {
    let set = this.listeners.get(taskId);
    if (!set) {
      set = new Set();
      this.listeners.set(taskId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(taskId);
    };
  }

  emit(taskId: string, event: TaskEvent): void {
    const set = this.listeners.get(taskId);
    if (!set) return;
    // 拷贝后遍历：监听器内取消订阅不影响本次派发
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch {
        // 单个订阅者异常不阻断其余订阅者（SSE 写入失败等）
      }
    }
  }

  listenerCount(taskId: string): number {
    return this.listeners.get(taskId)?.size ?? 0;
  }

  reset(): void {
    this.listeners.clear();
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __jhTaskEventBus: TaskEventBus | undefined;
}

export function getTaskBus(): TaskEventBus {
  if (!globalThis.__jhTaskEventBus) globalThis.__jhTaskEventBus = new TaskEventBus();
  return globalThis.__jhTaskEventBus;
}
