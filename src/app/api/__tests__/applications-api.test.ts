import { describe, expect, it, beforeEach } from "vitest";
import { POST as createAppRoute, GET as listAppRoute } from "@/app/api/v1/applications/route";
import {
  GET as appDetailRoute,
  PATCH as appPatchRoute,
  DELETE as appDeleteRoute,
} from "@/app/api/v1/applications/[id]/route";
import { POST as stageRoute } from "@/app/api/v1/applications/[id]/stage/route";
import { POST as noteRoute } from "@/app/api/v1/applications/[id]/events/route";
import { GET as boardRoute } from "@/app/api/v1/applications/board/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

async function setupJob(token: string, title = "前端工程师") {
  const res = await callRoute(createJobRoute, {
    method: "POST",
    token,
    body: {
      companyName: "未来科技",
      title,
      city: "上海",
      salaryMin: 15,
      salaryMax: 25,
      description: "JD",
    },
  });
  return (expectOk(res.json) as { job: { id: string } }).job.id;
}

describe("application API", () => {
  it("创建投递 → 阶段流转 → 事件时间线 → 看板聚合", async () => {
    const { token } = await createTestUser();
    const jobId = await setupJob(token);

    const created = await callRoute(createAppRoute, {
      method: "POST",
      token,
      body: { jobId },
    });
    expect(created.status).toBe(201);
    const app = expectOk(created.json) as { id: string; stage: string; appliedAt: null };
    expect(app.stage).toBe("wishlist");
    expect(app.appliedAt).toBeNull();

    // 非法流转：wishlist → offer 直接拒绝
    const illegal = await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: app.id },
      body: { toStage: "offer" },
    });
    expect(illegal.status).toBe(400);
    expect(illegal.json.code).toBe(6002);

    // 合法流转：wishlist → applied → interview
    const toApplied = await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: app.id },
      body: { toStage: "applied", note: "官网投递" },
    });
    const applied = expectOk(toApplied.json) as { stage: string; appliedAt: string };
    expect(applied.stage).toBe("applied");
    expect(applied.appliedAt).toBeTruthy();

    await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: app.id },
      body: { toStage: "interview" },
    });

    // 追加备注
    await callRoute(noteRoute, {
      method: "POST",
      token,
      params: { id: app.id },
      body: { note: "HR 约了周四下午 3 点" },
    });

    // 详情 + 时间线
    const detail = await callRoute(appDetailRoute, { token, params: { id: app.id } });
    const d = expectOk(detail.json) as {
      application: { stage: string };
      job: { title: string };
      events: { type: string; toStage: string | null; note: string | null }[];
    };
    expect(d.application.stage).toBe("interview");
    expect(d.job.title).toBe("前端工程师");
    const types = d.events.map((e) => e.type);
    expect(types).toEqual(["created", "stage_change", "stage_change", "note"]);
    expect(d.events[1].note).toBe("官网投递");

    // 看板聚合
    const board = await callRoute(boardRoute, { token });
    const stages = expectOk(board.json) as { stage: string; label: string; items: { id: string }[] }[];
    const interviewCol = stages.find((s) => s.stage === "interview");
    expect(interviewCol?.label).toBe("面试");
    expect(interviewCol?.items).toHaveLength(1);
    const wishlistCol = stages.find((s) => s.stage === "wishlist");
    expect(wishlistCol?.items).toHaveLength(0);
  });

  it("同一职位重复创建投递返回 409/6003", async () => {
    const { token } = await createTestUser();
    const jobId = await setupJob(token);
    await callRoute(createAppRoute, { method: "POST", token, body: { jobId } });
    const dup = await callRoute(createAppRoute, { method: "POST", token, body: { jobId } });
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe(6003);
  });

  it("列表 stage 过滤与 PATCH 备注", async () => {
    const { token } = await createTestUser();
    const job1 = await setupJob(token, "A 岗");
    const job2 = await setupJob(token, "B 岗");
    const a1 = (expectOk(
      (await callRoute(createAppRoute, { method: "POST", token, body: { jobId: job1 } })).json,
    ) as { id: string }).id;
    const a2 = (expectOk(
      (await callRoute(createAppRoute, { method: "POST", token, body: { jobId: job2 } })).json,
    ) as { id: string }).id;

    const all = await callRoute(listAppRoute, { token });
    expect(expectOk(all.json)).toHaveLength(2);

    await callRoute(stageRoute, {
      method: "POST",
      token,
      params: { id: a2 },
      body: { toStage: "applied" },
    });
    const applied = await callRoute(listAppRoute, { token, url: "/?stage=applied" });
    const list = expectOk(applied.json) as { id: string }[];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(a2);

    await callRoute(appPatchRoute, {
      method: "PATCH",
      token,
      params: { id: a1 },
      body: { notes: "内推，走快车道" },
    });
    const detail = await callRoute(appDetailRoute, { token, params: { id: a1 } });
    expect((expectOk(detail.json) as { application: { notes: string } }).application.notes).toBe(
      "内推，走快车道",
    );
  });

  it("删除投递后级联清除事件", async () => {
    const { token } = await createTestUser();
    const jobId = await setupJob(token);
    const app = (expectOk(
      (await callRoute(createAppRoute, { method: "POST", token, body: { jobId } })).json,
    ) as { id: string }).id;

    await callRoute(appDeleteRoute, { method: "DELETE", token, params: { id: app } });
    const detail = await callRoute(appDetailRoute, { token, params: { id: app } });
    expect(detail.status).toBe(404);
    expect(detail.json.code).toBe(6001);
  });

  it("未登录 401", async () => {
    const res = await callRoute(boardRoute);
    expect(res.status).toBe(401);
  });
});
