import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { jobFavorites, jobMatches } from "@/db/schema";
import { defineRoute } from "@/lib/api";
import { listJobs } from "@/server/core/job-service";

/** 职位导出 Excel：当前用户全部职位（支持与列表一致的 keyword/favorite 筛选） */
export const GET = defineRoute(
  { auth: true, query: z.object({ keyword: z.string().optional(), favorite: z.enum(["0", "1"]).optional() }) },
  async ({ user, query }) => {
    const rows = await listJobs(user!.id, {
      status: "all",
      keyword: query.keyword,
      favorite: query.favorite,
    });

    const db = getDb();
    const favRows = await db
      .select({ jobId: jobFavorites.jobId })
      .from(jobFavorites)
      .where(eq(jobFavorites.userId, user!.id));
    const favSet = new Set(favRows.map((f) => f.jobId));
    const matchRows = await db
      .select({ jobId: jobMatches.jobId, score: jobMatches.totalScore })
      .from(jobMatches)
      .where(eq(jobMatches.userId, user!.id));
    const bestScore = new Map<string, number>();
    for (const m of matchRows) {
      const cur = bestScore.get(m.jobId);
      if (cur === undefined || m.score > cur) bestScore.set(m.jobId, Math.round(m.score));
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("职位");
    ws.columns = [
      { header: "公司", key: "company", width: 24 },
      { header: "职位", key: "title", width: 32 },
      { header: "城市", key: "city", width: 12 },
      { header: "薪资(K/月)", key: "salary", width: 14 },
      { header: "最高匹配分", key: "score", width: 12 },
      { header: "收藏", key: "fav", width: 8 },
      { header: "来源", key: "source", width: 12 },
      { header: "职位链接", key: "url", width: 42 },
      { header: "创建时间", key: "createdAt", width: 20 },
    ];
    for (const j of rows) {
      ws.addRow({
        company: j.companyName,
        title: j.title,
        city: j.city ?? "",
        salary: j.salaryMin != null || j.salaryMax != null ? `${j.salaryMin ?? "?"}-${j.salaryMax ?? "?"}` : "",
        score: bestScore.get(j.id) ?? "",
        fav: favSet.has(j.id) ? "是" : "",
        source: j.source ?? "",
        url: j.sourceUrl ?? "",
        createdAt: j.createdAt.toLocaleString("zh-CN"),
      });
    }
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEFEF" } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

    const buf = await wb.xlsx.writeBuffer();
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`职位导出-${stamp}.xlsx`)}`,
        "cache-control": "private, no-store",
      },
    });
  },
);
