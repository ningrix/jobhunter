import type { UnifiedJob } from "@/shared/types";

/** 来源健康状态 */
export type JobSourceStatus = "available" | "connected" | "degraded" | "unavailable";

/** 自动投递能力等级：none（不支持）/ assisted（半自动，用户确认）/ conditional（满足策略才自动） */
export type AutoApplyLevel = "none" | "assisted" | "conditional";

export interface JobSourceCapabilities {
  /** 能否自动搜索职位列表（多数平台无合法公开 API，为 false） */
  search: boolean;
  /** 支持用户辅助导入（用户自行浏览/复制 URL+JD，平台负责解析归一） */
  assistedImport: boolean;
  autoApply: AutoApplyLevel;
  /** 平台是否需要用户登录（用户在自己的浏览器登录，凭证永不进入本系统） */
  requiresLogin: boolean;
  notes?: string;
}

export interface JobSourceMeta {
  id: string;
  name: string;
  status: JobSourceStatus;
  capabilities: JobSourceCapabilities;
}

/** 用户辅助导入的原始输入 */
export interface RawJobInput {
  url?: string;
  text?: string;
  sourceJobId?: string;
  rawData?: Record<string, unknown>;
}

export interface SourceHealth {
  ok: boolean;
  detail: string;
}

export interface JobDetailRef {
  sourceJobId: string;
  url?: string;
}

export interface SourceSearchQuery {
  keyword?: string;
  city?: string;
  page?: number;
}

export interface SourceSearchResult {
  jobs: UnifiedJob[];
  hasMore: boolean;
}

/**
 * 统一职位来源接口。任何平台接入都实现此接口；
 * 无法稳定合法自动化的能力必须省略而不是抛错。
 */
export interface JobSource {
  id: string;
  meta(): JobSourceMeta;
  capabilities(): JobSourceCapabilities;
  healthCheck(): Promise<SourceHealth>;
  search?(query: SourceSearchQuery): Promise<SourceSearchResult>;
  getJobDetail?(ref: JobDetailRef): Promise<UnifiedJob>;
  importAssisted?(input: RawJobInput): Promise<UnifiedJob>;
}
