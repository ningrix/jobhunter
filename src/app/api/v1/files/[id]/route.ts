import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { files } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { defineRoute } from "@/lib/api";
import { readUpload } from "@/server/core/file-parser";

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
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": file.mime || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, no-store",
    },
  });
});
