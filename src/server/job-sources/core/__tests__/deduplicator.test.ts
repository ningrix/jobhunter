import { describe, expect, it, beforeEach } from "vitest";
import { checkDuplicate } from "../deduplicator";
import { computeFingerprint, normalizeToUnified } from "../normalizer";
import { createJob } from "@/server/core/job-service";
import { createTestUser, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

const JD_A = `高级前端工程师
城市：上海
薪资：15-25K
要求：3年以上前端经验，精通 React、TypeScript`;

const JD_B = `<div>
  高级前端工程师
  <br>城市：上海
  薪资：15K~25K
  要求：3年以上前端经验，精通 React、TypeScript
</div>`;

const JD_OTHER = `资深后端工程师
城市：上海
薪资：25-40K
要求：精通 Java、Spring Boot`;

function unified(overrides: Partial<Parameters<typeof normalizeToUnified>[0]> = {}) {
  return normalizeToUnified({
    source: "boss",
    url: "https://www.zhipin.com/job_detail/a1.html",
    text: JD_A,
    rawData: { companyName: "字节跳动" },
    ...overrides,
  });
}

async function seedJob(opts: {
  userId: string;
  source: string;
  sourceJobId?: string;
  companyName?: string;
  title?: string;
  description?: string;
}) {
  const { job } = await createJob(opts.userId, {
    companyName: opts.companyName ?? "字节跳动",
    title: opts.title ?? "高级前端工程师",
    city: "上海",
    description: opts.description ?? JD_A,
    source: opts.source,
    sourceJobId: opts.sourceJobId,
    fingerprint: computeFingerprint({
      companyName: opts.companyName ?? "字节跳动",
      title: opts.title ?? "高级前端工程师",
      city: "上海",
      description: opts.description ?? JD_A,
    }),
  });
  return job;
}

describe("checkDuplicate 三级去重", () => {
  it("无任何匹配 → NEW", async () => {
    const { user } = await createTestUser();
    const r = await checkDuplicate(user.id, unified());
    expect(r.kind).toBe("NEW");
    expect(r.existingJobId).toBeUndefined();
  });

  it("source + sourceJobId 命中 → EXACT_DUPLICATE（即使描述不同）", async () => {
    const { user } = await createTestUser();
    const existing = await seedJob({ userId: user.id, source: "boss", sourceJobId: "a1", description: JD_OTHER });
    const r = await checkDuplicate(user.id, unified());
    expect(r.kind).toBe("EXACT_DUPLICATE");
    expect(r.existingJobId).toBe(existing.id);
  });

  it("内容指纹命中 → EXACT_DUPLICATE（不同平台、相同内容）", async () => {
    const { user } = await createTestUser();
    const existing = await seedJob({ userId: user.id, source: "paste" });
    // 另一平台、不同 URL、不同 sourceJobId，但内容为同一职位的另一呈现
    const r = await checkDuplicate(
      user.id,
      unified({
        source: "51job",
        url: "https://www.51job.com/job/999.html",
        text: JD_B,
      }),
    );
    expect(r.kind).toBe("EXACT_DUPLICATE");
    expect(r.existingJobId).toBe(existing.id);
  });

  it("公司+职位+城市一致但内容不同 → POSSIBLE_DUPLICATE", async () => {
    const { user } = await createTestUser();
    const existing = await seedJob({ userId: user.id, source: "paste", description: JD_OTHER, title: "高级前端工程师" });
    // 同公司同职位同城，但 JD 描述大改（改写后指纹不同）
    const r = await checkDuplicate(
      user.id,
      unified({
        text: `${JD_A}\n额外福利：下午茶、年度旅游、股票期权（改写版本内容）`,
      }),
    );
    expect(r.kind).toBe("POSSIBLE_DUPLICATE");
    expect(r.existingJobId).toBe(existing.id);
  });

  it("不同公司同职位 → NEW（不高置信不合并）", async () => {
    const { user } = await createTestUser();
    await seedJob({ userId: user.id, source: "paste" });
    const r = await checkDuplicate(user.id, unified({ rawData: { companyName: "拼多多" } }));
    expect(r.kind).toBe("NEW");
  });

  it("去重范围限定在用户内：他人职位不影响", async () => {
    const { user: u1 } = await createTestUser("u1@t.cn");
    const { user: u2 } = await createTestUser("u2@t.cn");
    await seedJob({ userId: u1.id, source: "paste" });
    const r = await checkDuplicate(u2.id, unified());
    expect(r.kind).toBe("NEW");
  });
});
