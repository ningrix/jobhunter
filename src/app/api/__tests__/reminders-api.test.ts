import { describe, expect, it, beforeEach } from "vitest";
import { POST as createReminderRoute, GET as listRemindersRoute } from "@/app/api/v1/reminders/route";
import { PATCH as patchReminderRoute } from "@/app/api/v1/reminders/[id]/route";
import { POST as createAppRoute } from "@/app/api/v1/applications/route";
import { POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { upcomingReminders } from "@/server/core/reminder-service";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";

beforeEach(resetDb);

async function setupApplication(token: string) {
  const jobRes = await callRoute(createJobRoute, {
    method: "POST",
    token,
    body: { companyName: "未来科技", title: "前端", city: "上海", description: "JD" },
  });
  const jobId = (expectOk(jobRes.json) as { job: { id: string } }).job.id;
  const appRes = await callRoute(createAppRoute, { method: "POST", token, body: { jobId } });
  return (expectOk(appRes.json) as { id: string }).id;
}

describe("reminder API", () => {
  it("创建提醒 → 到期清单 → 完成/忽略", async () => {
    const { token, user } = await createTestUser();
    const applicationId = await setupApplication(token);

    const past = new Date(Date.now() - 60 * 60 * 1000); // 1 小时前（已到期）
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000); // 明天

    const r1 = await callRoute(createReminderRoute, {
      method: "POST",
      token,
      body: { title: "跟进 A 公司面评", remindAt: past, applicationId },
    });
    expect(r1.status).toBe(201);
    const reminder1 = expectOk(r1.json) as { id: string };

    await callRoute(createReminderRoute, {
      method: "POST",
      token,
      body: { title: "准备 B 公司笔试", remindAt: future, applicationId },
    });

    // 全部待办
    const all = await callRoute(listRemindersRoute, { token, url: "/?status=pending" });
    expect(expectOk(all.json)).toHaveLength(2);

    // 到期清单只含过期的
    const due = await callRoute(listRemindersRoute, { token, url: "/?due=1" });
    const dueList = expectOk(due.json) as { id: string }[];
    expect(dueList).toHaveLength(1);
    expect(dueList[0].id).toBe(reminder1.id);

    // 服务层：未来 7 天提醒
    const upcoming = await upcomingReminders(user.id);
    expect(upcoming).toHaveLength(1); // 仅未来的那条

    // 完成后不再出现在待办
    await callRoute(patchReminderRoute, {
      method: "PATCH",
      token,
      params: { id: reminder1.id },
      body: { status: "done" },
    });
    const pending = await callRoute(listRemindersRoute, { token, url: "/?status=pending" });
    expect(expectOk(pending.json)).toHaveLength(1);
  });

  it("提醒绑定他人投递返回 404", async () => {
    const { token: t1 } = await createTestUser("r1@test.cn");
    const { token: t2 } = await createTestUser("r2@test.cn");
    const applicationId = await setupApplication(t1);

    const res = await callRoute(createReminderRoute, {
      method: "POST",
      token: t2,
      body: { title: "偷看别人提醒", remindAt: new Date(), applicationId },
    });
    expect(res.status).toBe(404);
    expect(res.json.code).toBe(6001);
  });
});
