import { AppError, ErrorCode } from "@/shared/errors";
import type { UnifiedJob } from "@/shared/types";
import type { JobDetailRef, JobSource, SourceSearchQuery, SourceSearchResult } from "../core/types";
import { normalizeToUnified } from "../core/normalizer";

const MOCK_JD_FRONTEND = `高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
岗位职责：
- 负责核心业务前端开发与性能优化`;

const MOCK_JD_BACKEND = `资深后端工程师（Java）
工作城市：北京
薪资：20-35K
任职要求：
1、4年以上 Java 开发经验，本科及以上学历
2、精通 Spring Boot、MySQL、Redis`;

const FIXTURES: UnifiedJob[] = [
  normalizeToUnified({
    source: "mock",
    url: "mock://jobs/m-001",
    text: MOCK_JD_FRONTEND,
    sourceJobId: "m-001",
    rawData: { companyName: "示例科技" },
  }),
  normalizeToUnified({
    source: "mock",
    url: "mock://jobs/m-002",
    text: MOCK_JD_BACKEND,
    sourceJobId: "m-002",
    rawData: { companyName: "样例数据" },
  }),
];

/**
 * 内置模拟来源：用于 CI 集成测试与产品演示。
 * 真实平台适配器（如 boss）不提供 search 时，测试用本来源验证发现→导入→匹配链路。
 */
export const mockJobSource: JobSource = {
  id: "mock",
  meta: () => ({
    id: "mock",
    name: "模拟招聘源",
    status: "connected",
    capabilities: {
      search: true,
      assistedImport: true,
      autoApply: "assisted",
      requiresLogin: false,
      notes: "内置测试与演示数据，非真实平台",
    },
  }),
  capabilities: () => mockJobSource.meta().capabilities,
  healthCheck: async () => ({ ok: true, detail: "内置模拟来源可用" }),
  async search(query: SourceSearchQuery): Promise<SourceSearchResult> {
    const kw = query.keyword?.trim().toLowerCase();
    const jobs = FIXTURES.filter((j) => {
      const cityOk = !query.city || (j.city ?? "").includes(query.city);
      const kwOk =
        !kw ||
        j.title.toLowerCase().includes(kw) ||
        j.companyName.toLowerCase().includes(kw) ||
        j.description.toLowerCase().includes(kw);
      return cityOk && kwOk;
    });
    return { jobs, hasMore: false };
  },
  async getJobDetail(ref: JobDetailRef): Promise<UnifiedJob> {
    const job = FIXTURES.find((j) => j.sourceJobId === ref.sourceJobId);
    if (!job) throw new AppError(ErrorCode.NOT_FOUND, `模拟职位不存在: ${ref.sourceJobId}`);
    return job;
  },
  async importAssisted(input) {
    if (!input.text || input.text.trim().length < 10) {
      throw new AppError(ErrorCode.IMPORT_INVALID, "请粘贴 JD 文本后再导入");
    }
    return normalizeToUnified({
      source: "mock",
      url: input.url,
      text: input.text,
      sourceJobId: input.sourceJobId,
      rawData: input.rawData,
    });
  },
};
