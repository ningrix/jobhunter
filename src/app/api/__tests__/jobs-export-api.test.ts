import { describe, expect, it, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest, type NextResponse } from "next/server";
import { GET as exportRoute } from "@/app/api/v1/jobs/export/route";
import { createJob } from "@/server/core/job-service";
import { callRoute, createTestUser, expectOk } from "@/testing/helpers";

beforeEach(async () => {
  const { resetDb } = await import("@/testing/helpers");
  await resetDb();
});

/** 二进制响应版调用：不解析 JSON，返回原始 NextResponse（NextRequest 才有 cookies） */
async function callRaw(
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>,
  opts: { token?: string; query?: string } = {},
): Promise<NextResponse> {
  const req = new NextRequest(`http://test.local/api/v1/jobs/export${opts.query ?? ""}`, {
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  });
  return handler(req, { params: Promise.resolve({}) });
}

describe("GET /api/v1/jobs/export", () => {
  it("未登录 401", async () => {
    const res = await callRaw(exportRoute);
    expect(res.status).toBe(401);
  });

  it("登录后导出 xlsx：行数与职位一致、内容可读回", async () => {
    const { token, user } = await createTestUser();
    await createJob(user.id, {
      companyName: "字节跳动",
      title: "资深前端工程师",
      city: "北京",
      salaryMin: 25,
      salaryMax: 45,
      description: "测试 JD 1",
    } as never);
    await createJob(user.id, {
      companyName: "小红书",
      title: "后端工程师",
      city: "上海",
      description: "测试 JD 2",
    } as never);

    const res = await callRaw(exportRoute, { token });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.getWorksheet("职位")!;
    expect(ws.actualRowCount).toBe(3); // 表头 + 2 行职位
    // 同毫秒创建时排序不稳定，按内容集合断言
    const companies = [ws.getRow(2).getCell(1).value, ws.getRow(3).getCell(1).value];
    expect(companies).toContain("字节跳动");
    expect(companies).toContain("小红书");
    const byteRow = [2, 3].find((r) => ws.getRow(r).getCell(1).value === "字节跳动")!;
    expect(ws.getRow(byteRow).getCell(3).value).toBe("北京");
    expect(ws.getRow(byteRow).getCell(4).value).toBe("25-45");
  });

  it("keyword 筛选与列表接口同源", async () => {
    const { token, user } = await createTestUser();
    await createJob(user.id, {
      companyName: "字节跳动",
      title: "前端工程师",
      description: "JD A",
    } as never);
    await createJob(user.id, {
      companyName: "小红书",
      title: "后端工程师",
      description: "JD B",
    } as never);

    const res = await callRaw(exportRoute, { token, query: "?keyword=%E5%AD%97%E8%8A%82" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.getWorksheet("职位")!;
    expect(ws.actualRowCount).toBe(2); // 表头 + 1 行（仅字节）
  });
});
