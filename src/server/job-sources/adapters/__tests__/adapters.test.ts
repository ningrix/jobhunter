import { describe, expect, it } from "vitest";
import { bossJobSource } from "../boss";
import { mockJobSource } from "../mock";
import { AppError, ErrorCode } from "@/shared/errors";

const BOSS_JD = `高级前端工程师
工作城市：上海
薪资：15-25K，14薪
任职要求：
1、3年以上前端开发经验，本科及以上学历
2、精通 React、TypeScript，熟悉 Node.js
岗位职责：
- 负责核心业务前端开发与性能优化`;

describe("boss adapter（第一期：仅辅助导入）", () => {
  it("能力受限：不搜索、不自动投递、需要用户自己登录", () => {
    const caps = bossJobSource.capabilities();
    expect(caps.search).toBe(false);
    expect(caps.assistedImport).toBe(true);
    expect(caps.autoApply).toBe("none");
    expect(caps.requiresLogin).toBe(true);
    expect(bossJobSource.search).toBeUndefined(); // 接口层面不存在，而不是抛错
  });

  it("辅助导入：URL 提取 sourceJobId + JD 解析归一", async () => {
    const u = await bossJobSource.importAssisted!({
      url: "https://www.zhipin.com/job_detail/1a2b3c.html?lid=1",
      text: BOSS_JD,
      rawData: { companyName: "未来科技" },
    });
    expect(u.source).toBe("boss");
    expect(u.sourceJobId).toBe("1a2b3c");
    expect(u.sourceUrl).toContain("zhipin.com");
    expect(u.companyName).toBe("未来科技");
    expect(u.city).toBe("上海");
    expect(u.skills.map((s) => s.name)).toContain("React");
  });

  it("JD 缺失或过短 → 明确报错提示补充（优雅降级，不猜内容）", async () => {
    const err = (await bossJobSource
      .importAssisted!({ url: "https://www.zhipin.com/job_detail/1a2b3c.html" })
      .catch((e) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.IMPORT_INVALID);
    expect(err.message).toContain("粘贴完整 JD");
    expect((err.details as { url?: string }).url).toContain("zhipin.com");

    await expect(
      bossJobSource.importAssisted!({ url: "https://x.com/job_detail/1a2b3c.html", text: "太短" }),
    ).rejects.toMatchObject({ code: ErrorCode.IMPORT_INVALID });
  });

  it("健康检查：辅助导入可用", async () => {
    const h = await bossJobSource.healthCheck();
    expect(h.ok).toBe(true);
  });
});

describe("mock adapter（测试/演示源）", () => {
  it("search 支持关键字与城市过滤", async () => {
    const all = await mockJobSource.search!({});
    expect(all.jobs).toHaveLength(2);
    const fe = await mockJobSource.search!({ keyword: "前端" });
    expect(fe.jobs).toHaveLength(1);
    expect(fe.jobs[0].sourceJobId).toBe("m-001");
    const bj = await mockJobSource.search!({ city: "北京" });
    expect(bj.jobs).toHaveLength(1);
    expect(bj.jobs[0].companyName).toBe("样例数据");
  });

  it("getJobDetail 存在与 404", async () => {
    const job = await mockJobSource.getJobDetail!({ sourceJobId: "m-001" });
    expect(job.title).toContain("前端");
    await expect(mockJobSource.getJobDetail!({ sourceJobId: "nope" })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it("importAssisted 归一化", async () => {
    const u = await mockJobSource.importAssisted!({ text: BOSS_JD, rawData: { companyName: "X" } });
    expect(u.source).toBe("mock");
    expect(u.salaryMax).toBe(25);
  });
});
