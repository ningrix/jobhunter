import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { files } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { defineRoute } from "@/lib/api";
import { readUpload, safeMimeFor } from "@/server/core/file-parser";

/** Stage B：下载/打开已上传的原始简历文件（仅 owner，路径限定 data/uploads） */
export const GET = defineRoute({ auth: true }, async ({ user, params }) => {
  const [file] = await getDb()
    .select()
    .from(files)
    .where(eq(files.id, params.id))
    .limit(1);
  if (!file || file.userId !== user!.id) {
    throw new AppError(ErrorCode.NOT_FOUND, "文件不存在");
  }
  const buf = await readUpload(file.path);
  // MIME 按扩展名由服务端推导（历史脏数据里的客户端自报 mime 不可信），
  // 仅 pdf/docx 内联，其余强制附件；nosniff 防浏览器嗅探成 HTML（存储型 XSS）
  const contentType = safeMimeFor(file.name || file.path);
  const inline = contentType === "application/pdf" || contentType.includes("wordprocessingml");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});
