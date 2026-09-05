import { AppError, ErrorCode } from "@/shared/errors";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";
import {
  extractText,
  MAX_UPLOAD_SIZE,
  saveUpload,
} from "@/server/core/file-parser";
import { saveUploadRecord } from "@/server/core/resume-service";

export const POST = defineRoute({ auth: true }, async ({ req, user }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError(ErrorCode.VALIDATION, "请使用 multipart/form-data 上传");
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(ErrorCode.VALIDATION, "缺少 file 字段");
  if (file.size > MAX_UPLOAD_SIZE) throw new AppError(ErrorCode.VALIDATION, "文件大小不能超过 5MB");
  if (file.size === 0) throw new AppError(ErrorCode.VALIDATION, "文件为空");

  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = await extractText(file.name, file.type, buf);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      ErrorCode.FILE_PARSE_FAILED,
      `文件解析失败: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const relPath = await saveUpload(file.name, buf);
  const { resume, version } = await saveUploadRecord(user!.id, {
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    path: relPath,
  });

  const task = await enqueueTask(user!.id, "parse_resume", {
    text,
    resumeId: resume.id,
    versionId: version.id,
  });
  runTaskAsync(task.id);
  return ok({ resumeId: resume.id, taskId: task.id }, 202);
});
