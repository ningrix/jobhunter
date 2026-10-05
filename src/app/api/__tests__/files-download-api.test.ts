import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { POST as uploadRoute } from "@/app/api/v1/resumes/upload/route";
import { GET as fileRoute } from "@/app/api/v1/files/[id]/route";
import { getDb } from "@/db/client";
import { files, resumeFiles } from "@/db/schema";
import { safeMimeFor, saveUpload } from "@/server/core/file-parser";
import { saveUploadRecord } from "@/server/core/resume-service";
import { callRoute, createTestUser, expectOk, resetDb } from "@/testing/helpers";
import type { NextRequest, NextResponse } from "next/server";

beforeEach(resetDb);

/** 二进制响应版 callRoute：不解析 JSON，只返回原始 NextResponse */
async function callRaw(
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>,
  opts: { token: string; id: string },
): Promise<NextResponse> {
  const req = new Request(`http://test.local/api/v1/files/${opts.id}`, {
    headers: { authorization: `Bearer ${opts.token}` },
  }) as NextRequest;
  return handler(req, { params: Promise.resolve({ id: opts.id }) });
}

describe("safeMimeFor：服务端按扩展名推导 MIME", () => {
  it("白名单扩展名映射为安全类型，未知扩展名回落 octet-stream", () => {
    expect(safeMimeFor("简历.txt")).toContain("text/plain");
    expect(safeMimeFor("resume.MD")).toContain("text/markdown");
    expect(safeMimeFor("a.pdf")).toBe("application/pdf");
    expect(safeMimeFor("b.docx")).toContain("wordprocessingml");
    expect(safeMimeFor("evil.html")).toBe("application/octet-stream");
    expect(safeMimeFor("noext")).toBe("application/octet-stream");
  });
});

describe("文件上传与下载 MIME 加固（P1-1）", () => {
  async function fileIdOfResume(resumeId: string): Promise<string> {
    const [row] = await getDb()
      .select({ fileId: resumeFiles.fileId })
      .from(resumeFiles)
      .where(eq(resumeFiles.resumeId, resumeId))
      .limit(1);
    return row!.fileId;
  }

  async function fileIdByPath(relPath: string): Promise<string> {
    const [row] = await getDb()
      .select({ id: files.id })
      .from(files)
      .where(eq(files.path, relPath))
      .limit(1);
    return row!.id;
  }

  it("上传时客户端自报的 mime 被忽略，落库为服务端推导值", async () => {
    const { token } = await createTestUser("mime@test.cn");
    const form = new FormData();
    form.append("file", new File(["hello"], "evil.txt", { type: "text/html" }));
    const up = await callRoute(uploadRoute, { method: "POST", token, body: form });
    expect(up.status).toBe(202);
    const { resumeId } = expectOk(up.json) as { resumeId: string };

    const [row] = await getDb()
      .select({ mime: files.mime })
      .from(files)
      .innerJoin(resumeFiles, eq(resumeFiles.fileId, files.id))
      .where(eq(resumeFiles.resumeId, resumeId))
      .limit(1);
    expect(row!.mime).toContain("text/plain");
    expect(row!.mime).not.toContain("html");
  });

  it("下载响应：content-type 服务端推导 + nosniff + 非 pdf/docx 强制附件", async () => {
    const { user, token } = await createTestUser("dl@test.cn");
    const relPath = await saveUpload("x.txt", Buffer.from("hello resume"));
    await saveUploadRecord(user.id, {
      name: "x.txt",
      mime: "text/html", // 模拟历史脏数据
      size: 11,
      path: relPath,
    });

    const res = await callRaw(fileRoute, {
      token,
      id: await fileIdByPath(relPath),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition.startsWith("attachment")).toBe(true);
  });

  it("pdf 内联预览，docx 附件下载；他人文件返回 404（越权防护回归）", async () => {
    const { user, token } = await createTestUser("pdf@test.cn");
    const relPath = await saveUpload("a.pdf", Buffer.from("%PDF-1.4 fake"));
    const { resumeFileId } = await saveUploadRecord(user.id, {
      name: "a.pdf",
      mime: "text/html",
      size: 14,
      path: relPath,
    });

    const pdfRes = await callRaw(fileRoute, { token, id: await fileIdByPath(relPath) });
    expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
    expect((pdfRes.headers.get("content-disposition") ?? "").startsWith("inline")).toBe(true);

    const docxPath = await saveUpload("b.docx", Buffer.from("PK\x03\x04 docx"));
    await saveUploadRecord(user.id, {
      name: "b.docx",
      mime: "text/html",
      size: 10,
      path: docxPath,
    });
    const docxRes = await callRaw(fileRoute, { token, id: await fileIdByPath(docxPath) });
    expect(docxRes.headers.get("content-type")).toContain("wordprocessingml");
    expect((docxRes.headers.get("content-disposition") ?? "").startsWith("inline")).toBe(true);

    const other = await createTestUser("other@test.cn");
    const steal = await callRaw(fileRoute, { token: other.token, id: await fileIdByPath(relPath) });
    expect(steal.status).toBe(404);
  });
});
