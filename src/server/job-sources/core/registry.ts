import type {
  JobSource,
  JobSourceMeta,
  SourceHealth,
} from "./types";

const sources = new Map<string, JobSource>();

/** 注册/更新来源（同 id 以最新注册为准，便于测试与热替换） */
export function registerJobSource(source: JobSource): void {
  sources.set(source.id, source);
}

export function getJobSource(id: string): JobSource | undefined {
  return sources.get(id);
}

export function hasJobSource(id: string): boolean {
  return sources.has(id);
}

export function listJobSources(): JobSourceMeta[] {
  return [...sources.values()].map((s) => s.meta());
}

/** 聚合健康检查：单来源失败降级为 ok:false，不影响其他来源 */
export async function healthCheckAll(): Promise<{ id: string; ok: boolean; detail: string }[]> {
  return Promise.all(
    [...sources.values()].map(async (s): Promise<{ id: string; ok: boolean; detail: string }> => {
      try {
        const health: SourceHealth = await s.healthCheck();
        return { id: s.id, ok: health.ok, detail: health.detail };
      } catch (e) {
        return { id: s.id, ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}
